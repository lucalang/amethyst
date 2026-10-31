-- Vault admin, full management: published codes can be edited (label, schedule, limits, audience, rewards)
-- and re-enabled, and the dashboard reads totals, a 30-day redemption timeline and recent activity.
-- * Edits only change future redemptions; past redemptions keep exactly what they granted.
-- * Every change is audited with the values before and after. Hashes never leave the database.

-- ---------------------------------------------------------------------------
-- Audit: two new actions
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.secret_code_audit'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%action%'
  loop
    execute format('alter table public.secret_code_audit drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.secret_code_audit
  add constraint secret_code_audit_action_check check (action in ('publish', 'disable', 'enable', 'update'));
create index secret_code_audit_recent on public.secret_code_audit (created_at desc, id desc);
create index secret_code_redemptions_recent on public.secret_code_redemptions (redeemed_at desc);

-- ---------------------------------------------------------------------------
-- Edit a published code
-- ---------------------------------------------------------------------------
create function public.admin_vault_update(
  p_id uuid,
  p_label text,
  p_coins integer,
  p_items text[],
  p_achievements text[],
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_max_redemptions integer,
  p_per_account_limit integer,
  p_audience text,
  p_allowlist uuid[],
  p_confirm_repeat boolean
)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._require_admin();
  v_old public.secret_codes;
  v_new public.secret_codes;
  v_before jsonb;
  v_after jsonb;
  v_changes jsonb;
  v_missing text;
  v_label text := btrim(coalesce(p_label, ''));
  v_coins integer := coalesce(p_coins, 0);
  v_items text[] := array(select distinct item from unnest(coalesce(p_items, '{}')) as item order by item);
  v_achievements text[] := array(select distinct a from unnest(coalesce(p_achievements, '{}')) as a order by a);
  v_allowlist uuid[] := array(select distinct u from unnest(coalesce(p_allowlist, '{}')) as u order by u);
  v_audience text := coalesce(p_audience, 'everyone');
  v_per_account integer := coalesce(p_per_account_limit, 1);
begin
  -- The same row lock every redemption of this code takes, so an edit never interleaves with one.
  select * into v_old from public.secret_codes where id = p_id for update;
  if not found then
    raise exception 'That code no longer exists.' using errcode = '22023', hint = 'not_found';
  end if;

  if char_length(v_label) not between 1 and 120 then
    raise exception 'Give the code a label of 1 to 120 characters.' using errcode = '22023';
  end if;
  if v_coins not between 0 and 100000 then
    raise exception 'Coins must be a whole number from 0 to 100,000.' using errcode = '22023';
  end if;
  if v_coins = 0 and cardinality(v_items) = 0 and cardinality(v_achievements) = 0 then
    raise exception 'A code needs coins, cosmetics, achievements or a combination.' using errcode = '22023';
  end if;
  if cardinality(v_items) > 100 or cardinality(v_achievements) > 50 then
    raise exception 'A code can grant at most 100 cosmetics and 50 achievements.' using errcode = '22023';
  end if;
  select string_agg(item, ', ') into v_missing
    from unnest(v_items) as item
   where not exists (select 1 from public.cosmetic_items c where c.id = item);
  if v_missing is not null then
    raise exception 'Unknown cosmetic items: %', v_missing using errcode = '22023';
  end if;
  select string_agg(a, ', ') into v_missing
    from unnest(v_achievements) as a
   where not exists (select 1 from public.achievement_definitions d where d.id = a);
  if v_missing is not null then
    raise exception 'Unknown achievements: %', v_missing using errcode = '22023';
  end if;
  -- An expiry already in the past may stay as it is; a new one has to be in the future.
  if p_expires_at is not null and p_expires_at <= now() and p_expires_at is distinct from v_old.expires_at then
    raise exception 'The new expiry is in the past. Disable the code to end it right away.' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'The code must expire after it starts.' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions not between 1 and 1000000 then
    raise exception 'The total limit must be between 1 and 1,000,000 redemptions.' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions < v_old.redemption_count then
    raise exception 'The total limit can''t be lower than the % redemptions so far.', v_old.redemption_count using errcode = '22023';
  end if;
  if v_per_account not between 1 and 100 then
    raise exception 'The per-account limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if v_audience not in ('everyone', 'allowlist') then
    raise exception 'Choose who can redeem the code.' using errcode = '22023';
  end if;
  if v_audience = 'allowlist' and cardinality(v_allowlist) not between 1 and 500 then
    raise exception 'An allowlist code needs 1 to 500 accounts.' using errcode = '22023';
  end if;
  if v_audience = 'everyone' and cardinality(v_allowlist) > 0 then
    raise exception 'Codes for everyone don''t take an allowlist.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_allowlist) as u where not exists (select 1 from public.users x where x.id = u)) then
    raise exception 'Some selected accounts no longer exist.' using errcode = '22023';
  end if;
  -- A repeatable coin payout that grows has to be confirmed, like at publishing.
  if v_coins > 0 and v_per_account > 1 and (v_coins > v_old.coins or v_per_account > v_old.per_account_limit)
     and not coalesce(p_confirm_repeat, false) then
    raise exception 'Confirm the maximum payout of this repeatable coin code before saving.' using errcode = '22023', hint = 'confirm_repeat';
  end if;

  v_before := public._secret_code_json(v_old) || jsonb_build_object('allowlist', coalesce((
    select jsonb_agg(l.user_id order by l.user_id) from public.secret_code_allowlist l where l.code_id = p_id
  ), '[]'::jsonb));

  update public.secret_codes
     set label = v_label, coins = v_coins, starts_at = p_starts_at, expires_at = p_expires_at,
         max_redemptions = p_max_redemptions, per_account_limit = v_per_account, audience = v_audience
   where id = p_id
  returning * into v_new;
  delete from public.secret_code_items where code_id = p_id and item_id <> all (v_items);
  insert into public.secret_code_items (code_id, item_id) select p_id, item from unnest(v_items) as item on conflict do nothing;
  delete from public.secret_code_achievements where code_id = p_id and achievement_id <> all (v_achievements);
  insert into public.secret_code_achievements (code_id, achievement_id) select p_id, a from unnest(v_achievements) as a on conflict do nothing;
  delete from public.secret_code_allowlist where code_id = p_id and user_id <> all (v_allowlist);
  insert into public.secret_code_allowlist (code_id, user_id) select p_id, u from unnest(v_allowlist) as u on conflict do nothing;

  v_after := public._secret_code_json(v_new) || jsonb_build_object('allowlist', to_jsonb(v_allowlist));
  select jsonb_object_agg(k, jsonb_build_object('from', v_before -> k, 'to', v_after -> k)) into v_changes
    from unnest(array['label', 'coins', 'items', 'achievements', 'startsAt', 'expiresAt', 'maxRedemptions',
                      'perAccountLimit', 'audience', 'allowlist']) as k
   where v_before -> k is distinct from v_after -> k;
  if v_changes is not null then
    insert into public.secret_code_audit (code_id, action, actor, via, details)
    values (p_id, 'update', v_actor, 'app', jsonb_build_object('changes', v_changes));
  end if;
  return v_after - 'allowlist';
end;
$$;

create function public.admin_vault_enable(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._require_admin();
begin
  update public.secret_codes set disabled_at = null where id = p_id and disabled_at is not null;
  if not found then
    return false;
  end if;
  insert into public.secret_code_audit (code_id, action, actor, via) values (p_id, 'enable', v_actor, 'app');
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads: totals, 30 days of redemptions by local day, recent audit entries
-- ---------------------------------------------------------------------------
create function public.admin_vault_stats(p_tz text default 'UTC')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_today date;
begin
  perform public._require_admin();
  v_tz := coalesce((select name from pg_catalog.pg_timezone_names where name = p_tz limit 1), 'UTC');
  v_today := (now() at time zone v_tz)::date;
  return jsonb_build_object(
    'timeZone', v_tz,
    'totals', (
      select jsonb_build_object(
        'redemptions', count(*),
        'coins', coalesce(sum(r.coins), 0),
        'week', count(*) filter (where r.redeemed_at > now() - interval '7 days'),
        'accounts', count(distinct r.user_id)
      )
        from public.secret_code_redemptions r
    ),
    'timeline', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'redemptions', coalesce(c.n, 0), 'coins', coalesce(c.coins, 0)) order by d.day)
        from (select v_today - g as day from generate_series(0, 29) as g) d
        left join (
          select (r.redeemed_at at time zone v_tz)::date as day, count(*) as n, sum(r.coins) as coins
            from public.secret_code_redemptions r
           where r.redeemed_at >= ((v_today - 29)::timestamp at time zone v_tz)
           group by 1
        ) c on c.day = d.day
    ),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'action', x.action, 'via', x.via, 'at', x.created_at, 'codeId', x.code_id, 'label', x.label,
        'actor', case when x.actor is null then null else public._admin_account_json(x.actor) end,
        'changed', case when x.action = 'update' then (select jsonb_agg(k) from jsonb_object_keys(x.details -> 'changes') as k) end
      ) order by x.created_at desc, x.id desc)
        from (
          select a.*, c.label
            from public.secret_code_audit a
            join public.secret_codes c on c.id = a.code_id
           order by a.created_at desc, a.id desc
           limit 30
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

-- The code detail now carries what each edit changed.
create or replace function public.admin_vault_code(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code public.secret_codes;
begin
  perform public._require_admin();
  select * into v_code from public.secret_codes where id = p_id;
  if not found then
    return null;
  end if;
  return public._secret_code_json(v_code) || jsonb_build_object(
    'createdByName', (select display_name from public.users where id = v_code.created_by),
    'allowlist', coalesce((
      select jsonb_agg(public._admin_account_json(l.user_id))
        from public.secret_code_allowlist l where l.code_id = p_id
    ), '[]'::jsonb),
    'redemptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'account', public._admin_account_json(r.user_id), 'redeemedAt', r.redeemed_at,
        'coins', r.coins, 'items', to_jsonb(r.items), 'achievements', to_jsonb(r.achievements), 'achievementsNew', to_jsonb(r.achievements_new)
      ) order by r.redeemed_at desc, r.id desc)
        from (select * from public.secret_code_redemptions where code_id = p_id order by redeemed_at desc, id desc limit 500) r
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'action', a.action, 'via', a.via, 'at', a.created_at,
        'actor', case when a.actor is null then null else public._admin_account_json(a.actor) end,
        'changes', case when a.action = 'update' then a.details -> 'changes' end
      ) order by a.created_at desc, a.id desc)
        from public.secret_code_audit a where a.code_id = p_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_vault_update(uuid, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean) from public, anon;
revoke all on function public.admin_vault_enable(uuid) from public, anon;
revoke all on function public.admin_vault_stats(text) from public, anon;
grant execute on function public.admin_vault_update(uuid, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean) to authenticated;
grant execute on function public.admin_vault_enable(uuid) to authenticated;
grant execute on function public.admin_vault_stats(text) to authenticated;
