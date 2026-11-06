-- Luck Boosters: Coin-only charges that raise the odds of non-Common rarities in the next case openings.
--
-- Odds rule (the only place it is applied is _loot_open):
--   luck L = sum of the multipliers of every active booster tier that still has a charge for that case
--            (1 when none), capped at _loot_luck_cap();
--   Common keeps its base weight, every other rarity's weight is multiplied by L; chances are weights
--   over the total of rarities that have items, split equally between the items of a rarity.
-- One charge = one boosted case opening. Each case opened uses one charge of every active tier.

-- ---------------------------------------------------------------------------
-- Catalog (prices live here, never only in the UI)
-- ---------------------------------------------------------------------------
create table public.loot_boosters (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,31}$'),
  multiplier integer not null unique check (multiplier between 2 and 100),
  price integer not null check (price > 0),
  available boolean not null default true,
  position integer not null default 0
);
alter table public.loot_boosters enable row level security;
revoke all on public.loot_boosters from public, anon, authenticated;
grant all on public.loot_boosters to service_role;
insert into public.loot_boosters (id, multiplier, price, position) values
  ('luck-2x', 2, 10000, 0),
  ('luck-5x', 5, 50000, 1),
  ('luck-10x', 10, 200000, 2);

-- Highest total luck any opening can use (all three tiers at once = 17x).
create function public._loot_luck_cap()
returns integer
language sql immutable set search_path = '' as $$ select 17 $$;

-- quantity = owned charges not yet activated; active = boosted openings left for that tier.
create table public.user_loot_boosters (
  user_id uuid not null references public.users (id) on delete cascade,
  booster_id text not null references public.loot_boosters (id),
  quantity integer not null default 0 check (quantity >= 0),
  active integer not null default 0 check (active >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, booster_id)
);
alter table public.user_loot_boosters enable row level security;
create policy owner_read on public.user_loot_boosters for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_loot_boosters from public, anon, authenticated;
grant select on public.user_loot_boosters to authenticated;
grant all on public.user_loot_boosters to service_role;

-- One row per activation request, so a retried activation never moves charges twice.
create table public.loot_booster_activations (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  booster_id text not null references public.loot_boosters (id),
  charges integer not null check (charges > 0),
  created_at timestamptz not null default now()
);
alter table public.loot_booster_activations enable row level security;
revoke all on public.loot_booster_activations from public, anon, authenticated;
grant all on public.loot_booster_activations to service_role;

-- The luck each rolled case used (1 = unboosted).
alter table public.loot_opening_results add column luck integer not null default 1 check (luck >= 1);

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- A case's droppable rarities with base and luck-adjusted weights.
create function public._loot_weights(p_case text, p_luck integer)
returns table (rarity text, base integer, weight bigint, items integer)
language sql stable security definer set search_path = '' as $$
  select t.rarity, t.weight,
         case when t.rarity = 'common' then t.weight::bigint else t.weight::bigint * greatest(coalesce(p_luck, 1), 1) end,
         t.items
    from public._loot_tiers(p_case) t;
$$;
revoke all on function public._loot_weights(text, integer) from public, anon, authenticated;

create function public._loot_current_luck(p_user uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select least(greatest(coalesce(sum(b.multiplier), 0), 1), public._loot_luck_cap())::integer
    from public.user_loot_boosters u join public.loot_boosters b on b.id = u.booster_id
   where u.user_id = p_user and u.active > 0;
$$;
revoke all on function public._loot_current_luck(uuid) from public, anon, authenticated;

create function public._loot_boost(p_user uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'luck', public._loot_current_luck(p_user),
    'cap', public._loot_luck_cap(),
    'boosters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'multiplier', b.multiplier, 'price', b.price, 'available', b.available,
        'quantity', coalesce(u.quantity, 0), 'active', coalesce(u.active, 0)) order by b.position, b.multiplier)
        from public.loot_boosters b
        left join public.user_loot_boosters u on u.user_id = p_user and u.booster_id = b.id
       where b.available or coalesce(u.quantity, 0) > 0 or coalesce(u.active, 0) > 0), '[]'::jsonb));
$$;
revoke all on function public._loot_boost(uuid) from public, anon, authenticated;

create or replace function public._loot_opening(p_opening uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id,
    'case', o.case_id,
    'quantity', o.quantity,
    'createdAt', o.created_at,
    'claimed', o.claimed_at is not null,
    'results', coalesce((
      select jsonb_agg(jsonb_build_object('item', r.item_id, 'kind', c.kind, 'rarity', r.rarity, 'duplicate', r.duplicate, 'luck', r.luck,
               'refund', case when not r.duplicate then 0 when o.claimed_at is null then public._loot_refund(r.rarity, r.unit_price) else r.refund end)
               order by r.position)
        from public.loot_opening_results r join public.cosmetic_items c on c.id = r.item_id
       where r.opening_id = o.id), '[]'::jsonb))
    from public.loot_openings o where o.id = p_opening;
$$;

-- Consumes owned cases (oldest lots first) and booster charges, and rolls one batch of up to 10.
-- Callers hold the per-account loot_openings advisory lock. Returns cases left.
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

  for v_pos in 0 .. p_quantity - 1 loop
    -- A tier with c charges boosts cases 0 .. c-1 of this batch.
    select least(greatest(coalesce(sum(m), 0), 1), public._loot_luck_cap())::integer into v_luck
      from unnest(v_mults, v_charges) as x(m, c) where c > v_pos;
    select sum(w.weight) into v_total from public._loot_weights(p_case, v_luck) w;
    v_draw := public._loot_random(v_total);
    select t.rarity, t.items into v_rarity, v_count
      from (select w.rarity, w.items, sum(w.weight) over (order by array_position(array['common', 'uncommon', 'epic', 'legendary', 'mythic', 'secret'], w.rarity)) as upper
              from public._loot_weights(p_case, v_luck) w) t
     where v_draw < t.upper
     order by t.upper
     limit 1;
    select i.item_id into v_item
      from public.loot_case_items i join public.cosmetic_items c on c.id = i.item_id
     where i.case_id = p_case and c.rarity = v_rarity
     order by i.item_id
     offset public._loot_random(v_count) limit 1;
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
  return v_left;
end;
$$;

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------

create or replace function public.loot_state()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_luck integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  v_luck := public._loot_current_luck(v_user);
  return jsonb_build_object(
    'balance', public._wallet_balance(v_user),
    'refundRates', (select jsonb_object_agg(rarity, percent) from public.loot_refund_rates),
    'boost', public._loot_boost(v_user),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lc.id,
        'price', lc.price,
        'available', lc.available,
        'quantity', coalesce(u.quantity, 0),
        'tiers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'rarity', t.rarity,
            'weight', t.base,
            'boostedWeight', t.weight,
            'items', (
              select jsonb_agg(jsonb_build_object(
                'id', case when c.secret and uc.item_id is null then null else c.id end,
                'kind', c.kind,
                'owned', uc.item_id is not null) order by c.kind, c.price, c.id)
                from public.loot_case_items i
                join public.cosmetic_items c on c.id = i.item_id and c.rarity = t.rarity
                left join public.user_cosmetics uc on uc.user_id = v_user and uc.item_id = c.id
               where i.case_id = lc.id)))
            from public._loot_weights(lc.id, v_luck) t), '[]'::jsonb)) order by lc.position, lc.id)
        from public.loot_cases lc
        left join public.user_loot_cases u on u.user_id = v_user and u.case_id = lc.id
       where lc.available or coalesce(u.quantity, 0) > 0), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(public._loot_opening(o.id) order by o.created_at)
        from public.loot_openings o where o.user_id = v_user and o.claimed_at is null), '[]'::jsonb));
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

  v_left := public._loot_open(v_user, p_opening, p_case, p_quantity);
  return public._loot_opening(p_opening) || jsonb_build_object('remaining', v_left, 'boost', public._loot_boost(v_user));
end;
$$;

-- Buys booster charges at the price the buyer saw. Repeating a request id returns the original purchase.
create function public.buy_loot_boosters(p_request uuid, p_booster text, p_quantity integer, p_expected_price integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ref text := 'booster:' || p_request::text;
  lb public.loot_boosters;
  v_balance integer;
  v_total bigint;
  v_existing public.coin_transactions;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_request is null or p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'Choose a whole number of boosters from 1 to 100.' using errcode = '22023';
  end if;

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;

  select * into v_existing from public.coin_transactions where user_id = v_user and reference = v_ref;
  if found then
    return jsonb_build_object('status', 'repeat', 'booster', v_existing.details ->> 'booster',
      'bought', (v_existing.details ->> 'quantity')::integer, 'balance', v_balance, 'boost', public._loot_boost(v_user));
  end if;

  select * into lb from public.loot_boosters where id = p_booster;
  if not found or not lb.available then
    raise exception 'That booster isn''t available.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  if p_expected_price is distinct from lb.price then
    raise exception 'The price changed. Check the new price and try again.' using errcode = 'P0001', hint = 'price_changed';
  end if;
  v_total := lb.price::bigint * p_quantity;
  if v_balance < v_total then
    raise exception 'Not enough coins for that many boosters.' using errcode = 'P0001', hint = 'insufficient_funds';
  end if;

  update public.coin_wallets
     set balance = balance - v_total::integer, spent = (least(spent::bigint + v_total, 2147483647))::integer, updated_at = now()
   where user_id = v_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (v_user, -v_total::integer, v_balance, 'purchase', v_ref,
    jsonb_build_object('booster', lb.id, 'quantity', p_quantity, 'price', lb.price));
  insert into public.user_loot_boosters (user_id, booster_id, quantity) values (v_user, lb.id, p_quantity)
  on conflict (user_id, booster_id) do update
    set quantity = public.user_loot_boosters.quantity + excluded.quantity, updated_at = now();

  return jsonb_build_object('status', 'purchased', 'booster', lb.id, 'bought', p_quantity, 'balance', v_balance, 'boost', public._loot_boost(v_user));
end;
$$;
revoke all on function public.buy_loot_boosters(uuid, text, integer, integer) from public, anon;
grant execute on function public.buy_loot_boosters(uuid, text, integer, integer) to authenticated;

-- Moves owned charges of one tier into its active pool. Repeating a request id changes nothing.
create function public.activate_loot_booster(p_request uuid, p_booster text, p_charges integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row public.user_loot_boosters;
  v_mult integer;
  v_other integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_request is null or p_charges is null or p_charges < 1 or p_charges > 10000 then
    raise exception 'Choose a whole number of charges to activate.' using errcode = '22023';
  end if;

  -- Same lock as opening, so charges never change in the middle of a roll.
  perform pg_advisory_xact_lock(hashtextextended('loot_openings:' || v_user::text, 0));
  if exists (select 1 from public.loot_booster_activations where id = p_request and user_id = v_user) then
    return jsonb_build_object('status', 'repeat', 'boost', public._loot_boost(v_user));
  end if;

  select * into v_row from public.user_loot_boosters where user_id = v_user and booster_id = p_booster for update;
  if not found or v_row.quantity < p_charges then
    raise exception 'You don''t have that many charges of this booster.' using errcode = 'P0001', hint = 'not_enough_boosters';
  end if;
  select multiplier into v_mult from public.loot_boosters where id = p_booster;
  select coalesce(sum(b.multiplier), 0) into v_other
    from public.user_loot_boosters u join public.loot_boosters b on b.id = u.booster_id
   where u.user_id = v_user and u.active > 0 and u.booster_id <> p_booster;
  if v_other + v_mult > public._loot_luck_cap() then
    raise exception 'That would go over the luck limit.' using errcode = 'P0001', hint = 'luck_cap';
  end if;

  update public.user_loot_boosters
     set quantity = quantity - p_charges, active = active + p_charges, updated_at = now()
   where user_id = v_user and booster_id = p_booster;
  insert into public.loot_booster_activations (id, user_id, booster_id, charges) values (p_request, v_user, p_booster, p_charges);
  return jsonb_build_object('status', 'activated', 'boost', public._loot_boost(v_user));
end;
$$;
revoke all on function public.activate_loot_booster(uuid, text, integer) from public, anon;
grant execute on function public.activate_loot_booster(uuid, text, integer) to authenticated;
