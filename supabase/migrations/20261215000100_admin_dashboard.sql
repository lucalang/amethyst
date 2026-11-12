-- Admin Dashboard (/admin-dashboard): owners manage admin access in the app, and every admin can queue a
-- one-time outcome for their OWN next Lootbox opening or Coin Slots spin.
--
-- * Roles stay in public.app_admins. Only an owner can grant, change or revoke access (admin_set_role);
--   nobody can change their own role, and the last owner can't be demoted or revoked. Changes are
--   serialized by one advisory lock so the last-owner rule holds under concurrent requests.
-- * Overrides belong to the admin who queued them. _loot_open and spin_slots only read an override for
--   the account doing the opening/spin, while that account is still an admin and before it expires
--   (24 hours). It replaces only the random draw: case cost and consumption, ownership, duplicates and
--   refunds, bets, the paytable and payouts all run exactly as before, and the stored result is what the
--   reveal shows. It is consumed in the same transaction that records the opening or spin, so a failed
--   request leaves it queued, and a retried request (same opening/spin id) replays the stored result.
-- * Lootbox overrides apply to standard openings (open_loot_cases, which reveals every result), not to
--   the admin bulk-open tools, and set only the first case of that batch.
-- * Drop rates, weights, the paytable and the odds shown to players are untouched.
-- * Every grant, role change, revoke and override creation, cancellation and use is written to
--   public.admin_audit, which is append-only (updates, deletes and truncation are refused).

-- ---------------------------------------------------------------------------
-- 1. Audit log
-- ---------------------------------------------------------------------------
-- actor/target are plain account ids (no foreign keys), so entries survive account deletion unchanged.
create table public.admin_audit (
  id bigint generated always as identity primary key,
  actor uuid,
  target uuid,
  action text not null check (action in (
    'admin_grant', 'admin_role_change', 'admin_revoke',
    'loot_override_create', 'loot_override_cancel', 'loot_override_use',
    'slot_override_create', 'slot_override_cancel', 'slot_override_use'
  )),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index admin_audit_created on public.admin_audit (created_at desc, id desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;
grant select, insert on public.admin_audit to service_role;

create function public._admin_audit_append_only()
returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The admin audit log is append-only.' using errcode = '42501';
end;
$$;
create trigger admin_audit_no_change before update or delete on public.admin_audit
  for each row execute function public._admin_audit_append_only();
create trigger admin_audit_no_truncate before truncate on public.admin_audit
  for each statement execute function public._admin_audit_append_only();

create function public._admin_log(p_actor uuid, p_target uuid, p_action text, p_details jsonb)
returns void
language sql security definer set search_path = '' as $$
  insert into public.admin_audit (actor, target, action, details) values (p_actor, p_target, p_action, coalesce(p_details, '{}'::jsonb));
$$;
revoke all on function public._admin_log(uuid, uuid, text, jsonb) from public, anon, authenticated;

create function public._admin_role(p_user uuid)
returns text
language sql stable security definer set search_path = '' as $$
  select role from public.app_admins where user_id = p_user;
$$;
revoke all on function public._admin_role(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Override tables (read and written only through the functions below)
-- ---------------------------------------------------------------------------
-- The id is chosen by the client per request, so a retried "queue" never creates a second override.
create table public.admin_loot_overrides (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  case_id text not null references public.loot_cases (id),
  item_id text not null references public.cosmetic_items (id),
  status text not null default 'queued' check (status in ('queued', 'consumed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  resolved_at timestamptz,
  opening_id uuid,
  check ((status = 'queued') = (resolved_at is null)),
  check ((status = 'consumed') = (opening_id is not null))
);
create unique index admin_loot_overrides_one_queued on public.admin_loot_overrides (user_id) where status = 'queued';
create index admin_loot_overrides_user on public.admin_loot_overrides (user_id, created_at desc);

create table public.admin_slot_overrides (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  machine text not null references public.slot_machines (id),
  stops integer[] not null check (cardinality(stops) = 3),
  -- The payline these stops showed when queued; the override only applies while they still do.
  symbols text[] not null check (cardinality(symbols) = 3),
  -- From the paytable when queued, for display only. The spin settles with the machine's own paytable.
  multiplier integer not null check (multiplier >= 0),
  status text not null default 'queued' check (status in ('queued', 'consumed', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  resolved_at timestamptz,
  spin_id uuid,
  check ((status = 'queued') = (resolved_at is null)),
  check ((status = 'consumed') = (spin_id is not null))
);
create unique index admin_slot_overrides_one_queued on public.admin_slot_overrides (user_id) where status = 'queued';
create index admin_slot_overrides_user on public.admin_slot_overrides (user_id, created_at desc);

alter table public.admin_loot_overrides enable row level security;
alter table public.admin_slot_overrides enable row level security;
revoke all on public.admin_loot_overrides, public.admin_slot_overrides from public, anon, authenticated;
grant all on public.admin_loot_overrides, public.admin_slot_overrides to service_role;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create function public._admin_expire_overrides(p_user uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.admin_loot_overrides set status = 'expired', resolved_at = now()
   where user_id = p_user and status = 'queued' and expires_at <= now();
  update public.admin_slot_overrides set status = 'expired', resolved_at = now()
   where user_id = p_user and status = 'queued' and expires_at <= now();
$$;
revoke all on function public._admin_expire_overrides(uuid) from public, anon, authenticated;

-- An item a case can actually drop: in its pool, with a rarity the case has a weight for.
create function public._loot_override_valid(p_case text, p_item text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.loot_case_items i
      join public.cosmetic_items c on c.id = i.item_id
      join public._loot_tiers(p_case) t on t.rarity = c.rarity
     where i.case_id = p_case and i.item_id = p_item
  );
$$;
revoke all on function public._loot_override_valid(text, text) from public, anon, authenticated;

-- The same rule spin_slots settles with: the best rule matching exactly `count` symbols.
create function public._slot_multiplier(p_paytable jsonb, p_symbols text[])
returns integer
language sql immutable set search_path = '' as $$
  select coalesce(max((r ->> 'pays')::integer), 0)
    from jsonb_array_elements(p_paytable) r
   where (select count(*) from unnest(p_symbols) s where s = r ->> 'symbol') = (r ->> 'count')::integer;
$$;
revoke all on function public._slot_multiplier(jsonb, text[]) from public, anon, authenticated;

create function public._admin_loot_override_json(r public.admin_loot_overrides)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'kind', 'loot', 'case', r.case_id, 'item', r.item_id,
    'rarity', (select c.rarity from public.cosmetic_items c where c.id = r.item_id),
    'status', case when r.status = 'queued' and r.expires_at <= now() then 'expired' else r.status end,
    'createdAt', r.created_at, 'expiresAt', r.expires_at, 'resolvedAt', r.resolved_at, 'openingId', r.opening_id
  );
$$;
revoke all on function public._admin_loot_override_json(public.admin_loot_overrides) from public, anon, authenticated;

create function public._admin_slot_override_json(r public.admin_slot_overrides)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', r.id, 'kind', 'slots', 'stops', to_jsonb(r.stops), 'symbols', to_jsonb(r.symbols), 'multiplier', r.multiplier,
    'status', case when r.status = 'queued' and r.expires_at <= now() then 'expired' else r.status end,
    'createdAt', r.created_at, 'expiresAt', r.expires_at, 'resolvedAt', r.resolved_at, 'spinId', r.spin_id,
    'bet', (select s.bet from public.slot_spins s where s.id = r.spin_id),
    'payout', (select s.payout from public.slot_spins s where s.id = r.spin_id)
  );
$$;
revoke all on function public._admin_slot_override_json(public.admin_slot_overrides) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Dashboard state
-- ---------------------------------------------------------------------------
create function public.admin_dashboard_state()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_admin();
begin
  perform public._admin_expire_overrides(v_user);
  return jsonb_build_object(
    'me', jsonb_build_object('id', v_user, 'role', public._admin_role(v_user), 'account', public._admin_account_json(v_user)),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.user_id, 'role', a.role, 'grantedAt', a.granted_at,
        'account', public._admin_account_json(a.user_id), 'grantedBy', public._admin_account_json(a.granted_by)
      ) order by (a.role = 'owner') desc, a.granted_at)
      from public.app_admins a
    ), '[]'::jsonb),
    -- Only cases that can be opened, and only items they can actually drop.
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lc.id, 'available', lc.available,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object('id', c.id, 'rarity', c.rarity, 'kind', c.kind) order by rr.rank desc, c.id)
            from public.loot_case_items i
            join public.cosmetic_items c on c.id = i.item_id
            join public.rarities rr on rr.id = c.rarity
           where i.case_id = lc.id and c.rarity in (select t.rarity from public._loot_tiers(lc.id) t)
        ), '[]'::jsonb)
      ) order by lc.position, lc.id)
      from public.loot_cases lc
      where exists (select 1 from public._loot_tiers(lc.id))
    ), '[]'::jsonb),
    'machine', (select jsonb_build_object('id', m.id, 'reels', m.reels, 'paytable', m.paytable) from public.slot_machines m where m.id = 'amethyst'),
    'loot', coalesce((
      select jsonb_agg(public._admin_loot_override_json(x.o) order by (x.o).created_at desc)
        from (select o from public.admin_loot_overrides o where o.user_id = v_user order by o.created_at desc limit 10) x
    ), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(public._admin_slot_override_json(x.o) order by (x.o).created_at desc)
        from (select o from public.admin_slot_overrides o where o.user_id = v_user order by o.created_at desc limit 10) x
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'action', e.action, 'details', e.details, 'createdAt', e.created_at,
        'actor', public._admin_account_json(e.actor), 'target', public._admin_account_json(e.target)
      ) order by e.created_at desc, e.id desc)
        from (select * from public.admin_audit order by created_at desc, id desc limit 60) e
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Admin access (owners only)
-- ---------------------------------------------------------------------------
-- p_role: 'owner' or 'admin' to grant or change, null to revoke. Setting the role an account already
-- has changes nothing and logs nothing, so retries are harmless.
create function public.admin_set_role(p_user uuid, p_role text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._require_admin();
  v_current text;
  v_owners integer;
  v_expired integer := 0;
  v_count integer;
begin
  if p_user is null or (p_role is not null and p_role not in ('owner', 'admin')) then
    raise exception 'Choose an account and a role.' using errcode = '22023';
  end if;

  -- One change at a time, so the last-owner rule can't race.
  perform pg_advisory_xact_lock(hashtextextended('app_admins', 0));
  if public._admin_role(v_actor) is distinct from 'owner' then
    raise exception 'Only an owner can change admin access.' using errcode = '42501';
  end if;
  if p_user = v_actor then
    raise exception 'You can''t change your own access. Ask another owner.' using errcode = 'P0001', hint = 'own_role';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'That account doesn''t exist yet. They need to sign in to Amethyst once.' using errcode = 'P0001', hint = 'account_not_found';
  end if;

  select role into v_current from public.app_admins where user_id = p_user for update;
  if v_current is not distinct from p_role then
    return jsonb_build_object('changed', false, 'role', p_role);
  end if;
  if v_current = 'owner' then
    select count(*) into v_owners from public.app_admins where role = 'owner';
    if v_owners <= 1 then
      raise exception 'Amethyst needs at least one owner.' using errcode = 'P0001', hint = 'last_owner';
    end if;
  end if;

  if p_role is null then
    delete from public.app_admins where user_id = p_user;
    -- Their unused overrides can never apply again.
    update public.admin_loot_overrides set status = 'expired', resolved_at = now() where user_id = p_user and status = 'queued';
    get diagnostics v_count = row_count;
    v_expired := v_count;
    update public.admin_slot_overrides set status = 'expired', resolved_at = now() where user_id = p_user and status = 'queued';
    get diagnostics v_count = row_count;
    v_expired := v_expired + v_count;
    perform public._admin_log(v_actor, p_user, 'admin_revoke', jsonb_build_object('from', v_current, 'overridesExpired', v_expired));
  elsif v_current is null then
    insert into public.app_admins (user_id, role, granted_by) values (p_user, p_role, v_actor);
    perform public._admin_log(v_actor, p_user, 'admin_grant', jsonb_build_object('role', p_role));
  else
    update public.app_admins set role = p_role, granted_by = v_actor where user_id = p_user;
    perform public._admin_log(v_actor, p_user, 'admin_role_change', jsonb_build_object('from', v_current, 'to', p_role));
  end if;
  return jsonb_build_object('changed', true, 'role', p_role);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Queuing and cancelling overrides (always the caller's own)
-- ---------------------------------------------------------------------------
create function public.admin_queue_loot_override(p_id uuid, p_case text, p_item text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_admin();
  v_row public.admin_loot_overrides;
begin
  if p_id is null or p_case is null or p_item is null then
    raise exception 'Choose a case and an item.' using errcode = '22023';
  end if;
  -- The same lock as opening cases, so queuing never races an opening.
  perform pg_advisory_xact_lock(hashtextextended('loot_openings:' || v_user::text, 0));

  select * into v_row from public.admin_loot_overrides where id = p_id;
  if found then
    if v_row.user_id <> v_user or v_row.case_id <> p_case or v_row.item_id <> p_item then
      raise exception 'That request was already used for a different override.' using errcode = '22023';
    end if;
    return public._admin_loot_override_json(v_row);
  end if;

  perform public._admin_expire_overrides(v_user);
  if exists (select 1 from public.admin_loot_overrides where user_id = v_user and status = 'queued') then
    raise exception 'You already have a Lootbox override queued. Cancel it first.' using errcode = 'P0001', hint = 'override_queued';
  end if;
  if not public._loot_override_valid(p_case, p_item) then
    raise exception 'That item isn''t in this case''s reward pool.' using errcode = 'P0001', hint = 'override_invalid';
  end if;

  insert into public.admin_loot_overrides (id, user_id, case_id, item_id) values (p_id, v_user, p_case, p_item)
  returning * into v_row;
  perform public._admin_log(v_user, v_user, 'loot_override_create', jsonb_build_object(
    'override', v_row.id, 'case', p_case, 'item', p_item,
    'rarity', (select rarity from public.cosmetic_items where id = p_item), 'expiresAt', v_row.expires_at
  ));
  return public._admin_loot_override_json(v_row);
end;
$$;

-- p_stops: one 0-based stop per reel; the payline symbols and multiplier come from the machine.
create function public.admin_queue_slot_override(p_id uuid, p_stops integer[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_admin();
  m public.slot_machines;
  v_row public.admin_slot_overrides;
  v_reel jsonb;
  v_symbols text[] := '{}';
begin
  if p_id is null or p_stops is null or cardinality(p_stops) <> 3 or array_position(p_stops, null) is not null then
    raise exception 'Pick a symbol for each reel.' using errcode = '22023';
  end if;
  select * into m from public.slot_machines where id = 'amethyst';
  if not found then
    raise exception 'The machine is closed right now.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('slot_overrides:' || v_user::text, 0));

  select * into v_row from public.admin_slot_overrides where id = p_id;
  if found then
    if v_row.user_id <> v_user or v_row.stops <> p_stops then
      raise exception 'That request was already used for a different override.' using errcode = '22023';
    end if;
    return public._admin_slot_override_json(v_row);
  end if;

  for v_i in 1 .. 3 loop
    v_reel := m.reels -> (v_i - 1);
    if p_stops[v_i] < 0 or p_stops[v_i] >= jsonb_array_length(v_reel) then
      raise exception 'That outcome isn''t on reel %.', v_i using errcode = 'P0001', hint = 'override_invalid';
    end if;
    v_symbols := v_symbols || (v_reel ->> p_stops[v_i]);
  end loop;

  perform public._admin_expire_overrides(v_user);
  if exists (select 1 from public.admin_slot_overrides where user_id = v_user and status = 'queued') then
    raise exception 'You already have a Coin Slots override queued. Cancel it first.' using errcode = 'P0001', hint = 'override_queued';
  end if;

  insert into public.admin_slot_overrides (id, user_id, machine, stops, symbols, multiplier)
  values (p_id, v_user, m.id, p_stops, v_symbols, public._slot_multiplier(m.paytable, v_symbols))
  returning * into v_row;
  perform public._admin_log(v_user, v_user, 'slot_override_create', jsonb_build_object(
    'override', v_row.id, 'machine', m.id, 'stops', to_jsonb(p_stops), 'symbols', to_jsonb(v_symbols),
    'multiplier', v_row.multiplier, 'expiresAt', v_row.expires_at
  ));
  return public._admin_slot_override_json(v_row);
end;
$$;

-- Cancelling twice answers with the cancelled override; a used or expired one can't be cancelled.
create function public.admin_cancel_override(p_kind text, p_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_admin();
  v_loot public.admin_loot_overrides;
  v_slot public.admin_slot_overrides;
  v_status text;
begin
  if p_id is null or p_kind is null or p_kind not in ('loot', 'slots') then
    raise exception 'Choose an override to cancel.' using errcode = '22023';
  end if;
  perform public._admin_expire_overrides(v_user);

  if p_kind = 'loot' then
    -- The row lock orders this against an opening using it at the same moment.
    update public.admin_loot_overrides set status = 'cancelled', resolved_at = now()
     where id = p_id and user_id = v_user and status = 'queued'
    returning * into v_loot;
    if found then
      perform public._admin_log(v_user, v_user, 'loot_override_cancel', jsonb_build_object('override', v_loot.id, 'case', v_loot.case_id, 'item', v_loot.item_id));
      return public._admin_loot_override_json(v_loot);
    end if;
    select * into v_loot from public.admin_loot_overrides where id = p_id and user_id = v_user;
    v_status := v_loot.status;
    if v_status = 'cancelled' then
      return public._admin_loot_override_json(v_loot);
    end if;
  else
    update public.admin_slot_overrides set status = 'cancelled', resolved_at = now()
     where id = p_id and user_id = v_user and status = 'queued'
    returning * into v_slot;
    if found then
      perform public._admin_log(v_user, v_user, 'slot_override_cancel', jsonb_build_object('override', v_slot.id, 'stops', to_jsonb(v_slot.stops), 'symbols', to_jsonb(v_slot.symbols)));
      return public._admin_slot_override_json(v_slot);
    end if;
    select * into v_slot from public.admin_slot_overrides where id = p_id and user_id = v_user;
    v_status := v_slot.status;
    if v_status = 'cancelled' then
      return public._admin_slot_override_json(v_slot);
    end if;
  end if;

  if v_status is null then
    raise exception 'That override couldn''t be found.' using errcode = 'P0001', hint = 'override_not_found';
  end if;
  raise exception 'This override was already %.', case v_status when 'consumed' then 'used' else v_status end
    using errcode = 'P0001', hint = 'override_used';
end;
$$;

revoke all on function public.admin_dashboard_state() from public, anon;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
revoke all on function public.admin_queue_loot_override(uuid, text, text) from public, anon;
revoke all on function public.admin_queue_slot_override(uuid, integer[]) from public, anon;
revoke all on function public.admin_cancel_override(text, uuid) from public, anon;
grant execute on function public.admin_dashboard_state() to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_queue_loot_override(uuid, text, text) to authenticated;
grant execute on function public.admin_queue_slot_override(uuid, integer[]) to authenticated;
grant execute on function public.admin_cancel_override(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Using overrides: _loot_open and spin_slots (unchanged apart from the marked parts)
-- ---------------------------------------------------------------------------
create or replace function public._loot_open(p_user uuid, p_opening uuid, p_case text, p_quantity integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_owned integer;
  v_left integer;
  v_need integer := p_quantity;
  v_take integer;
  v_prices integer[] := '{}';
  v_lot record;
  v_mults integer[];
  v_charges integer[];
  v_luck integer;
  v_total bigint;
  v_draw bigint;
  v_rarity text;
  v_count integer;
  v_item text;
  v_override public.admin_loot_overrides;
begin
  select quantity into v_owned from public.user_loot_cases where user_id = p_user and case_id = p_case for update;
  if coalesce(v_owned, 0) < p_quantity then
    raise exception 'You don''t have that many cases.' using errcode = 'P0001', hint = 'not_enough_cases';
  end if;
  if not exists (select 1 from public._loot_tiers(p_case)) then
    raise exception 'That case can''t be opened right now.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;

  for v_lot in
    select id, unit_price, quantity from public.user_loot_case_lots
     where user_id = p_user and case_id = p_case and quantity > 0
     order by created_at, id for update
  loop
    exit when v_need = 0;
    v_take := least(v_need, v_lot.quantity);
    update public.user_loot_case_lots set quantity = quantity - v_take where id = v_lot.id;
    v_prices := v_prices || array_fill(v_lot.unit_price, array[v_take]);
    v_need := v_need - v_take;
  end loop;
  if v_need > 0 then
    raise exception 'You don''t have that many cases.' using errcode = 'P0001', hint = 'not_enough_cases';
  end if;

  update public.user_loot_cases set quantity = quantity - p_quantity, updated_at = now()
   where user_id = p_user and case_id = p_case
  returning quantity into v_left;
  insert into public.loot_openings (id, user_id, case_id, quantity) values (p_opening, p_user, p_case, p_quantity);

  perform 1 from public.user_loot_boosters where user_id = p_user and active > 0 for update;
  select coalesce(array_agg(b.multiplier order by b.multiplier), '{}'), coalesce(array_agg(u.active order by b.multiplier), '{}')
    into v_mults, v_charges
    from public.user_loot_boosters u join public.loot_boosters b on b.id = u.booster_id
   where u.user_id = p_user and u.active > 0;

  -- [Admin Dashboard] The opener's own queued override for this case (standard openings only, see
  -- open_loot_cases), while they are still an admin. It sets the first case of this batch.
  if current_setting('amethyst.loot_override', true) = 'on' then
    select o.* into v_override from public.admin_loot_overrides o
     where o.user_id = p_user and o.case_id = p_case and o.status = 'queued' and o.expires_at > now()
       and exists (select 1 from public.app_admins a where a.user_id = p_user)
     for update;
    if v_override.id is not null and not public._loot_override_valid(p_case, v_override.item_id) then
      -- The case no longer drops that item: the override lapses and the draw stays random.
      update public.admin_loot_overrides set status = 'expired', resolved_at = now() where id = v_override.id;
      v_override := null;
    end if;
  end if;

  for v_pos in 0 .. p_quantity - 1 loop
    -- A tier with c charges boosts cases 0 .. c-1 of this batch.
    select least(greatest(coalesce(sum(m), 0), 1), public._loot_luck_cap())::integer into v_luck
      from unnest(v_mults, v_charges) as x(m, c) where c > v_pos;
    if v_pos = 0 and v_override.id is not null then
      v_item := v_override.item_id;
      select c.rarity into v_rarity from public.cosmetic_items c where c.id = v_item;
    else
      select sum(w.weight) into v_total from public._loot_weights(p_case, v_luck) w;
      v_draw := public._loot_random(v_total);
      select t.rarity, t.items into v_rarity, v_count
        from (select w.rarity, w.items, sum(w.weight) over (order by rr.rank) as upper
                from public._loot_weights(p_case, v_luck) w join public.rarities rr on rr.id = w.rarity) t
       where v_draw < t.upper
       order by t.upper
       limit 1;
      select i.item_id into v_item
        from public.loot_case_items i join public.cosmetic_items c on c.id = i.item_id
       where i.case_id = p_case and c.rarity = v_rarity
       order by i.item_id
       offset public._loot_random(v_count) limit 1;
    end if;
    insert into public.loot_opening_results (opening_id, position, item_id, rarity, duplicate, unit_price, luck)
    values (p_opening, v_pos, v_item, v_rarity,
      exists (select 1 from public.user_cosmetics where user_id = p_user and item_id = v_item)
      or exists (select 1 from public.loot_opening_results r join public.loot_openings o on o.id = r.opening_id
                  where o.user_id = p_user and o.claimed_at is null and r.item_id = v_item),
      v_prices[v_pos + 1], v_luck);
  end loop;

  if cardinality(v_mults) > 0 then
    update public.user_loot_boosters set active = greatest(active - p_quantity, 0), updated_at = now()
     where user_id = p_user and active > 0;
  end if;

  -- [Admin Dashboard] Consumed in this transaction, together with the stored result.
  if v_override.id is not null then
    update public.admin_loot_overrides set status = 'consumed', resolved_at = now(), opening_id = p_opening where id = v_override.id;
    perform public._admin_log(p_user, p_user, 'loot_override_use', (
      select jsonb_build_object('override', v_override.id, 'case', p_case, 'item', r.item_id, 'rarity', r.rarity,
                                'opening', p_opening, 'position', 0, 'duplicate', r.duplicate)
        from public.loot_opening_results r where r.opening_id = p_opening and r.position = 0
    ));
  end if;
  return v_left;
end;
$$;

create or replace function public.open_loot_cases(p_opening uuid, p_case text, p_quantity integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_left integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_opening is null or p_quantity is null or p_quantity < 1 or p_quantity > 10 then
    raise exception 'Open between 1 and 10 cases at a time.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('loot_openings:' || v_user::text, 0));
  if exists (select 1 from public.loot_openings where id = p_opening and user_id = v_user) then
    select quantity into v_left from public.user_loot_cases
     where user_id = v_user and case_id = (select case_id from public.loot_openings where id = p_opening);
    return public._loot_opening(p_opening) || jsonb_build_object('remaining', coalesce(v_left, 0), 'boost', public._loot_boost(v_user));
  end if;

  -- [Admin Dashboard] Standard openings (which reveal every result) may use the opener's own override.
  perform set_config('amethyst.loot_override', 'on', true);
  v_left := public._loot_open(v_user, p_opening, p_case, p_quantity);
  perform set_config('amethyst.loot_override', 'off', true);
  return public._loot_opening(p_opening) || jsonb_build_object('remaining', v_left, 'boost', public._loot_boost(v_user));
end;
$$;

create or replace function public.spin_slots(p_spin uuid, p_bet integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  m public.slot_machines;
  v_spin public.slot_spins;
  v_balance integer;
  v_recent integer;
  v_reel jsonb;
  v_len integer;
  v_draw bigint;
  v_stops integer[] := '{}';
  v_symbols text[] := '{}';
  v_rule jsonb;
  v_mult integer := 0;
  v_payout integer;
  v_net integer;
  v_replay boolean := false;
  v_override public.admin_slot_overrides;
  v_ok boolean;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_spin is null then
    raise exception 'Missing spin id.' using errcode = '22023';
  end if;
  select * into m from public.slot_machines where id = 'amethyst';
  if not found then
    raise exception 'The machine is closed right now.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;

  -- The wallet lock serializes this account's spins, purchases and rewards.
  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;

  select * into v_spin from public.slot_spins where id = p_spin;
  if found then
    if v_spin.user_id <> v_user then
      raise exception 'That spin couldn''t be found.' using errcode = 'P0001', hint = 'run_not_found';
    end if;
    v_replay := true;
  else
    if p_bet is null or not (p_bet = any (m.bets)) then
      raise exception 'Choose one of the listed bets.' using errcode = '22023';
    end if;
    select count(*) into v_recent
      from public.slot_spins
     where user_id = v_user and created_at > now() - interval '1 minute';
    if v_recent >= m.max_spins_per_minute then
      raise exception 'The reels need a short rest. Try again in a minute.' using errcode = 'P0001', hint = 'rate_limited';
    end if;
    if v_balance < p_bet then
      raise exception 'Not enough coins for that bet.' using errcode = 'P0001', hint = 'insufficient_funds';
    end if;

    -- [Admin Dashboard] The spinner's own queued override, while they are still an admin and the
    -- configured stops still show the configured symbols. It sets the stops; nothing else changes.
    select o.* into v_override from public.admin_slot_overrides o
     where o.user_id = v_user and o.machine = m.id and o.status = 'queued' and o.expires_at > now()
       and exists (select 1 from public.app_admins a where a.user_id = v_user)
     for update;
    if v_override.id is not null then
      v_ok := true;
      for v_i in 1 .. 3 loop
        v_reel := m.reels -> (v_i - 1);
        if v_override.stops[v_i] < 0 or v_override.stops[v_i] >= jsonb_array_length(v_reel)
           or (v_reel ->> v_override.stops[v_i]) is distinct from v_override.symbols[v_i] then
          v_ok := false;
        end if;
      end loop;
      if v_ok then
        v_stops := v_override.stops;
        v_symbols := v_override.symbols;
      else
        update public.admin_slot_overrides set status = 'expired', resolved_at = now() where id = v_override.id;
        v_override := null;
      end if;
    end if;

    if v_override.id is null then
      -- Independent, uniform stops: 32 random bits from gen_random_uuid() (the server's strong random
      -- source), with rejection sampling so no stop is favoured.
      for v_reel in select value from jsonb_array_elements(m.reels) loop
        v_len := jsonb_array_length(v_reel);
        loop
          v_draw := ('x' || encode(substring(uuid_send(gen_random_uuid()) from 1 for 4), 'hex'))::bit(32)::bigint;
          exit when v_draw < 4294967296 - (4294967296 % v_len);
        end loop;
        v_stops := v_stops || (v_draw % v_len)::integer;
        v_symbols := v_symbols || (v_reel ->> (v_draw % v_len)::integer);
      end loop;
    end if;

    for v_rule in select value from jsonb_array_elements(m.paytable) loop
      if (select count(*) from unnest(v_symbols) as s where s = v_rule ->> 'symbol') = (v_rule ->> 'count')::integer then
        v_mult := greatest(v_mult, (v_rule ->> 'pays')::integer);
      end if;
    end loop;
    v_payout := p_bet * v_mult;
    v_net := v_payout - p_bet;

    update public.coin_wallets set balance = balance + v_net, updated_at = now()
     where user_id = v_user
    returning balance into v_balance;
    if v_net <> 0 then
      insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
      values (v_user, v_net, v_balance, 'slots', 'slot:' || p_spin::text,
              jsonb_build_object('bet', p_bet, 'payout', v_payout, 'symbols', to_jsonb(v_symbols)));
    end if;
    insert into public.slot_spins (id, user_id, machine, bet, stops, symbols, multiplier, payout, balance_after)
    values (p_spin, v_user, m.id, p_bet, v_stops, v_symbols, v_mult, v_payout, v_balance)
    returning * into v_spin;

    -- [Admin Dashboard] Consumed in this transaction, together with the stored spin.
    if v_override.id is not null then
      update public.admin_slot_overrides set status = 'consumed', resolved_at = now(), spin_id = p_spin where id = v_override.id;
      perform public._admin_log(v_user, v_user, 'slot_override_use', jsonb_build_object(
        'override', v_override.id, 'spin', p_spin, 'bet', p_bet, 'stops', to_jsonb(v_stops), 'symbols', to_jsonb(v_symbols),
        'multiplier', v_mult, 'payout', v_payout
      ));
    end if;
  end if;

  return jsonb_build_object(
    'spinId', v_spin.id,
    'bet', v_spin.bet,
    'stops', to_jsonb(v_spin.stops),
    'symbols', to_jsonb(v_spin.symbols),
    'multiplier', v_spin.multiplier,
    'payout', v_spin.payout,
    'net', v_spin.payout - v_spin.bet,
    'balanceAfter', v_spin.balance_after,
    'createdAt', v_spin.created_at,
    'replay', v_replay,
    'balance', v_balance
  );
end;
$$;
