-- Raises the Vault code limits: up to 1,000,000,000 coins, 100,000 of each case and booster (100 kinds),
-- 1,000 cosmetics, 500 achievements, 10,000 redemptions per account, 10,000 allowlisted accounts and
-- 1,000,000,000 total redemptions.

do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.secret_codes'::regclass and contype = 'c'
       and (pg_get_constraintdef(oid) like '%coins%' or pg_get_constraintdef(oid) like '%per_account_limit%')
  loop
    execute format('alter table public.secret_codes drop constraint %I', v_name);
  end loop;
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.secret_code_loot'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%quantity%'
  loop
    execute format('alter table public.secret_code_loot drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.secret_codes add constraint secret_codes_coins_check check (coins between 0 and 1000000000);
alter table public.secret_codes add constraint secret_codes_per_account_limit_check check (per_account_limit between 1 and 10000);
alter table public.secret_code_loot add constraint secret_code_loot_quantity_check check (quantity between 1 and 100000);

create or replace function public._secret_code_loot(p_loot jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_loot jsonb;
  v_bad text;
begin
  if p_loot is null or p_loot = 'null'::jsonb then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 100 then
    raise exception 'A code can grant at most 100 kinds of cases and boosters.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_loot) e
     where jsonb_typeof(e) <> 'object' or e ->> 'kind' is null or e ->> 'kind' not in ('case', 'booster')
        or jsonb_typeof(e -> 'id') <> 'string' or jsonb_typeof(e -> 'quantity') <> 'number'
        or (e ->> 'quantity')::numeric <> trunc((e ->> 'quantity')::numeric)
        or (e ->> 'quantity')::numeric not between 1 and 100000
  ) then
    raise exception 'Give 1 to 100,000 of each case and booster.' using errcode = '22023';
  end if;
  select string_agg(e ->> 'id', ', ') into v_bad
    from jsonb_array_elements(p_loot) e
   where (e ->> 'kind' = 'case' and not exists (select 1 from public.loot_cases c where c.id = e ->> 'id'))
      or (e ->> 'kind' = 'booster' and not exists (select 1 from public.loot_boosters b where b.id = e ->> 'id'));
  if v_bad is not null then
    raise exception 'Unknown cases or boosters: %', v_bad using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_loot)) <> (select count(distinct (e ->> 'kind', e ->> 'id')) from jsonb_array_elements(p_loot) e) then
    raise exception 'List each case and booster once.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', e ->> 'kind', 'id', e ->> 'id', 'quantity', (e ->> 'quantity')::integer)
           order by e ->> 'kind', e ->> 'id'), '[]'::jsonb)
    into v_loot from jsonb_array_elements(p_loot) e;
  return v_loot;
end;
$$;

create or replace function public._create_secret_code(
  p_actor uuid,
  p_via text,
  p_code_hash text,
  p_loose_hash text,
  p_format text,
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
  p_loot jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_code public.secret_codes;
  v_missing text;
  v_loose text := coalesce(p_loose_hash, p_code_hash);
  v_label text := btrim(coalesce(p_label, ''));
  v_coins integer := coalesce(p_coins, 0);
  v_items text[] := array(select distinct item from unnest(coalesce(p_items, '{}')) as item order by item);
  v_achievements text[] := array(select distinct a from unnest(coalesce(p_achievements, '{}')) as a order by a);
  v_allowlist uuid[] := array(select distinct u from unnest(coalesce(p_allowlist, '{}')) as u);
  v_audience text := coalesce(p_audience, 'everyone');
  v_per_account integer := coalesce(p_per_account_limit, 1);
  v_loot jsonb := public._secret_code_loot(p_loot);
begin
  if p_format is null or p_format not in ('compact', 'phrase') then
    raise exception 'p_format must be compact or phrase.' using errcode = '22023';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' or v_loose !~ '^[0-9a-f]{64}$' then
    raise exception 'Hashes must be lowercase hex SHA-256 of the normalized code.' using errcode = '22023';
  end if;
  if p_format = 'compact' and v_loose <> p_code_hash then
    raise exception 'Compact codes use one hash for both.' using errcode = '22023';
  end if;
  if char_length(v_label) not between 1 and 120 then
    raise exception 'Give the code a label of 1 to 120 characters.' using errcode = '22023';
  end if;
  if v_coins not between 0 and 1000000000 then
    raise exception 'Coins must be a whole number from 0 to 1,000,000,000.' using errcode = '22023';
  end if;
  if v_coins = 0 and cardinality(v_items) = 0 and cardinality(v_achievements) = 0 and jsonb_array_length(v_loot) = 0 then
    raise exception 'A code needs coins, cosmetics, achievements, cases or boosters.' using errcode = '22023';
  end if;
  if cardinality(v_items) > 1000 or cardinality(v_achievements) > 500 then
    raise exception 'A code can grant at most 1,000 cosmetics and 500 achievements.' using errcode = '22023';
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
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiry date is in the past.' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'The code must expire after it starts.' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions not between 1 and 1000000000 then
    raise exception 'The total limit must be between 1 and 1,000,000,000 redemptions.' using errcode = '22023';
  end if;
  if v_per_account not between 1 and 10000 then
    raise exception 'The per-account limit must be between 1 and 10,000.' using errcode = '22023';
  end if;
  if v_audience not in ('everyone', 'allowlist') then
    raise exception 'Choose who can redeem the code.' using errcode = '22023';
  end if;
  if v_audience = 'allowlist' and cardinality(v_allowlist) not between 1 and 10000 then
    raise exception 'An allowlist code needs 1 to 10,000 accounts.' using errcode = '22023';
  end if;
  if v_audience = 'everyone' and cardinality(v_allowlist) > 0 then
    raise exception 'Codes for everyone don''t take an allowlist.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_allowlist) as u where not exists (select 1 from public.users x where x.id = u)) then
    raise exception 'Some selected accounts no longer exist.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.secret_codes
     where loose_hash = decode(v_loose, 'hex') or code_hash = decode(p_code_hash, 'hex')
  ) then
    raise exception 'That code already exists, or one that differs only in case, spacing or punctuation. Codes can''t be reused, even after they expire or are disabled.'
      using errcode = '23505', hint = 'duplicate_code';
  end if;

  insert into public.secret_codes (
    code_hash, loose_hash, format, label, coins, starts_at, expires_at, max_redemptions, per_account_limit, audience, created_by
  )
  values (
    decode(p_code_hash, 'hex'), decode(v_loose, 'hex'), p_format, v_label, v_coins, p_starts_at, p_expires_at,
    p_max_redemptions, v_per_account, v_audience, p_actor
  )
  returning * into v_code;
  v_id := v_code.id;
  insert into public.secret_code_items (code_id, item_id) select v_id, item from unnest(v_items) as item;
  insert into public.secret_code_achievements (code_id, achievement_id) select v_id, a from unnest(v_achievements) as a;
  insert into public.secret_code_allowlist (code_id, user_id) select v_id, u from unnest(v_allowlist) as u;
  insert into public.secret_code_loot (code_id, kind, ref_id, quantity)
  select v_id, e ->> 'kind', e ->> 'id', (e ->> 'quantity')::integer from jsonb_array_elements(v_loot) e;

  insert into public.secret_code_audit (code_id, action, actor, via, details)
  values (v_id, 'publish', p_actor, coalesce(p_via, 'cli'), public._secret_code_json(v_code) || jsonb_build_object('allowlist', to_jsonb(v_allowlist)));
  return v_id;
end;
$$;

create or replace function public.admin_vault_update(
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
  p_confirm_repeat boolean,
  p_loot jsonb default '[]'::jsonb
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
  v_loot jsonb := public._secret_code_loot(p_loot);
begin
  -- The same row lock every redemption of this code takes, so an edit never interleaves with one.
  select * into v_old from public.secret_codes where id = p_id for update;
  if not found then
    raise exception 'That code no longer exists.' using errcode = '22023', hint = 'not_found';
  end if;

  if char_length(v_label) not between 1 and 120 then
    raise exception 'Give the code a label of 1 to 120 characters.' using errcode = '22023';
  end if;
  if v_coins not between 0 and 1000000000 then
    raise exception 'Coins must be a whole number from 0 to 1,000,000,000.' using errcode = '22023';
  end if;
  if v_coins = 0 and cardinality(v_items) = 0 and cardinality(v_achievements) = 0 and jsonb_array_length(v_loot) = 0 then
    raise exception 'A code needs coins, cosmetics, achievements, cases or boosters.' using errcode = '22023';
  end if;
  if cardinality(v_items) > 1000 or cardinality(v_achievements) > 500 then
    raise exception 'A code can grant at most 1,000 cosmetics and 500 achievements.' using errcode = '22023';
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
  if p_expires_at is not null and p_expires_at <= now() and p_expires_at is distinct from v_old.expires_at then
    raise exception 'The new expiry is in the past. Disable the code to end it right away.' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'The code must expire after it starts.' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions not between 1 and 1000000000 then
    raise exception 'The total limit must be between 1 and 1,000,000,000 redemptions.' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions < v_old.redemption_count then
    raise exception 'The total limit can''t be lower than the % redemptions so far.', v_old.redemption_count using errcode = '22023';
  end if;
  if v_per_account not between 1 and 10000 then
    raise exception 'The per-account limit must be between 1 and 10,000.' using errcode = '22023';
  end if;
  if v_audience not in ('everyone', 'allowlist') then
    raise exception 'Choose who can redeem the code.' using errcode = '22023';
  end if;
  if v_audience = 'allowlist' and cardinality(v_allowlist) not between 1 and 10000 then
    raise exception 'An allowlist code needs 1 to 10,000 accounts.' using errcode = '22023';
  end if;
  if v_audience = 'everyone' and cardinality(v_allowlist) > 0 then
    raise exception 'Codes for everyone don''t take an allowlist.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_allowlist) as u where not exists (select 1 from public.users x where x.id = u)) then
    raise exception 'Some selected accounts no longer exist.' using errcode = '22023';
  end if;
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
  delete from public.secret_code_loot where code_id = p_id;
  insert into public.secret_code_loot (code_id, kind, ref_id, quantity)
  select p_id, e ->> 'kind', e ->> 'id', (e ->> 'quantity')::integer from jsonb_array_elements(v_loot) e;

  v_after := public._secret_code_json(v_new) || jsonb_build_object('allowlist', to_jsonb(v_allowlist));
  select jsonb_object_agg(k, jsonb_build_object('from', v_before -> k, 'to', v_after -> k)) into v_changes
    from unnest(array['label', 'coins', 'items', 'achievements', 'loot', 'startsAt', 'expiresAt', 'maxRedemptions',
                      'perAccountLimit', 'audience', 'allowlist']) as k
   where v_before -> k is distinct from v_after -> k;
  if v_changes is not null then
    insert into public.secret_code_audit (code_id, action, actor, via, details)
    values (p_id, 'update', v_actor, 'app', jsonb_build_object('changes', v_changes));
  end if;
  return v_after - 'allowlist';
end;
$$;
