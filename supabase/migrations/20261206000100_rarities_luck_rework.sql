-- Rarities above Secret (Prismatic, Exalted, Amethyst), a luck rule that favours the rarest tiers,
-- Luck Boosters sold as 10-case packs at a tenth of the old price, and Vault codes that can grant
-- cases and boosters with a much higher coin limit.
--
-- Odds rule (applied only by _loot_weights): at total luck L each rarity's weight is multiplied by
-- L ^ luck_power (Common's power is 0, so it never changes), rounded, at least 1. Chances are weights
-- over the total of rarities that have items, split equally between the items of a rarity.

-- ---------------------------------------------------------------------------
-- Rarity registry (order and luck power live here; the app only describes looks)
-- ---------------------------------------------------------------------------
create table public.rarities (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,23}$'),
  rank integer not null unique,
  luck_power numeric(4, 2) not null check (luck_power between 0 and 5)
);
alter table public.rarities enable row level security;
revoke all on public.rarities from public, anon, authenticated;
grant all on public.rarities to service_role;
insert into public.rarities (id, rank, luck_power) values
  ('common', 0, 0),
  ('uncommon', 1, 0.25),
  ('epic', 2, 0.5),
  ('legendary', 3, 0.75),
  ('mythic', 4, 1),
  ('secret', 5, 1.5),
  ('prismatic', 6, 1.75),
  ('exalted', 7, 2),
  ('amethyst', 8, 2.25);

do $$
declare
  v record;
begin
  for v in
    select conrelid::regclass as tbl, conname from pg_constraint
     where conrelid in ('public.cosmetic_items'::regclass, 'public.loot_case_rarities'::regclass, 'public.loot_refund_rates'::regclass)
       and contype = 'c' and pg_get_constraintdef(oid) like '%rarity%'
  loop
    execute format('alter table %s drop constraint %I', v.tbl, v.conname);
  end loop;
end;
$$;
alter table public.cosmetic_items add constraint cosmetic_items_rarity_fkey foreign key (rarity) references public.rarities (id);
alter table public.loot_case_rarities add constraint loot_case_rarities_rarity_fkey foreign key (rarity) references public.rarities (id);
alter table public.loot_refund_rates add constraint loot_refund_rates_rarity_fkey foreign key (rarity) references public.rarities (id);

insert into public.loot_refund_rates (rarity, percent) values ('prismatic', 85), ('exalted', 95), ('amethyst', 100);

-- Case-only rewards: never sold, visible in drop tables.
alter table public.cosmetic_items drop constraint cosmetic_items_source_check;
alter table public.cosmetic_items add constraint cosmetic_items_source_check check (source in ('shop', 'vault', 'achievement', 'case'));
insert into public.cosmetic_items (id, kind, price, available, secret, source, rarity) values
  ('banner-prismatic', 'profile_banner', 0, false, false, 'case', 'prismatic'),
  ('title-prism-walker', 'title', 0, false, false, 'case', 'prismatic'),
  ('banner-exalted', 'profile_banner', 0, false, false, 'case', 'exalted'),
  ('title-exalted', 'title', 0, false, false, 'case', 'exalted'),
  ('banner-amethyst', 'profile_banner', 0, false, false, 'case', 'amethyst'),
  ('title-amethyst-sovereign', 'title', 0, false, false, 'case', 'amethyst');
insert into public.loot_case_items (case_id, item_id) values
  ('release', 'banner-prismatic'), ('release', 'title-prism-walker'),
  ('release', 'banner-exalted'), ('release', 'title-exalted'),
  ('release', 'banner-amethyst'), ('release', 'title-amethyst-sovereign');

-- Weights out of 1,000,000: Amethyst is 1 in a million without luck.
delete from public.loot_case_rarities where case_id = 'release';
insert into public.loot_case_rarities (case_id, rarity, weight) values
  ('release', 'common', 449099),
  ('release', 'uncommon', 300000),
  ('release', 'epic', 170000),
  ('release', 'legendary', 60000),
  ('release', 'mythic', 15000),
  ('release', 'secret', 5000),
  ('release', 'prismatic', 800),
  ('release', 'exalted', 100),
  ('release', 'amethyst', 1);

-- ---------------------------------------------------------------------------
-- Odds
-- ---------------------------------------------------------------------------
create or replace function public._loot_tiers(p_case text)
returns table (rarity text, weight integer, items integer)
language sql stable security definer set search_path = '' as $$
  select r.rarity, r.weight, count(i.item_id)::integer
    from public.loot_case_rarities r
    join public.rarities rr on rr.id = r.rarity
    join public.loot_case_items i on i.case_id = r.case_id
    join public.cosmetic_items c on c.id = i.item_id and c.rarity = r.rarity
   where r.case_id = p_case
   group by r.rarity, r.weight, rr.rank
   order by rr.rank;
$$;

create or replace function public._loot_weights(p_case text, p_luck integer)
returns table (rarity text, base integer, weight bigint, items integer)
language sql stable security definer set search_path = '' as $$
  select t.rarity, t.weight,
         greatest(1, round(t.weight * power(greatest(coalesce(p_luck, 1), 1)::numeric, rr.luck_power)))::bigint,
         t.items
    from public._loot_tiers(p_case) t join public.rarities rr on rr.id = t.rarity
   order by rr.rank;
$$;

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
-- Boosters: one booster = 10 boosted case openings (charges), a tenth of the old price
-- ---------------------------------------------------------------------------
alter table public.loot_boosters add column charges integer not null default 10 check (charges between 1 and 1000);
update public.loot_boosters set price = case id when 'luck-2x' then 1000 when 'luck-5x' then 5000 when 'luck-10x' then 20000 else price end;

create or replace function public._loot_boost(p_user uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'luck', public._loot_current_luck(p_user),
    'cap', public._loot_luck_cap(),
    'boosters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'multiplier', b.multiplier, 'price', b.price, 'charges', b.charges, 'available', b.available,
        'quantity', coalesce(u.quantity, 0), 'active', coalesce(u.active, 0)) order by b.position, b.multiplier)
        from public.loot_boosters b
        left join public.user_loot_boosters u on u.user_id = p_user and u.booster_id = b.id
       where b.available or coalesce(u.quantity, 0) > 0 or coalesce(u.active, 0) > 0), '[]'::jsonb));
$$;

-- p_quantity counts boosters; each adds its tier's charges. Repeating a request id returns the original purchase.
create or replace function public.buy_loot_boosters(p_request uuid, p_booster text, p_quantity integer, p_expected_price integer)
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
    jsonb_build_object('booster', lb.id, 'quantity', p_quantity, 'price', lb.price, 'charges', p_quantity * lb.charges));
  insert into public.user_loot_boosters (user_id, booster_id, quantity) values (v_user, lb.id, p_quantity * lb.charges)
  on conflict (user_id, booster_id) do update
    set quantity = public.user_loot_boosters.quantity + excluded.quantity, updated_at = now();

  return jsonb_build_object('status', 'purchased', 'booster', lb.id, 'bought', p_quantity, 'balance', v_balance, 'boost', public._loot_boost(v_user));
end;
$$;

-- Tiers now carry their luck power so the app can show odds at any luck.
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
            'luckPower', rr.luck_power,
            'items', (
              select jsonb_agg(jsonb_build_object(
                'id', case when c.secret and uc.item_id is null then null else c.id end,
                'kind', c.kind,
                'owned', uc.item_id is not null) order by c.kind, c.price, c.id)
                from public.loot_case_items i
                join public.cosmetic_items c on c.id = i.item_id and c.rarity = t.rarity
                left join public.user_cosmetics uc on uc.user_id = v_user and uc.item_id = c.id
               where i.case_id = lc.id)) order by rr.rank)
            from public._loot_weights(lc.id, v_luck) t join public.rarities rr on rr.id = t.rarity), '[]'::jsonb)) order by lc.position, lc.id)
        from public.loot_cases lc
        left join public.user_loot_cases u on u.user_id = v_user and u.case_id = lc.id
       where lc.available or coalesce(u.quantity, 0) > 0), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(public._loot_opening(o.id) order by o.created_at)
        from public.loot_openings o where o.user_id = v_user and o.claimed_at is null), '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Vault codes: cases and boosters as rewards, coins up to 10,000,000
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.secret_codes'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%coins%'
  loop
    execute format('alter table public.secret_codes drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.secret_codes add constraint secret_codes_coins_check check (coins between 0 and 10000000);

-- kind 'case': quantity = cases; kind 'booster': quantity = boosters (each worth its tier's charges).
create table public.secret_code_loot (
  code_id uuid not null references public.secret_codes (id) on delete cascade,
  kind text not null check (kind in ('case', 'booster')),
  ref_id text not null,
  quantity integer not null check (quantity between 1 and 1000),
  primary key (code_id, kind, ref_id)
);
alter table public.secret_code_loot enable row level security;
revoke all on public.secret_code_loot from public, anon, authenticated;
grant all on public.secret_code_loot to service_role;

alter table public.secret_code_redemptions add column loot jsonb not null default '[]'::jsonb;

-- Validates and normalizes [{kind, id, quantity}] (sorted, no repeats).
create function public._secret_code_loot(p_loot jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_loot jsonb;
  v_bad text;
begin
  if p_loot is null or p_loot = 'null'::jsonb then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_loot) <> 'array' or jsonb_array_length(p_loot) > 20 then
    raise exception 'A code can grant at most 20 kinds of cases and boosters.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_loot) e
     where jsonb_typeof(e) <> 'object' or e ->> 'kind' is null or e ->> 'kind' not in ('case', 'booster')
        or jsonb_typeof(e -> 'id') <> 'string' or jsonb_typeof(e -> 'quantity') <> 'number'
        or (e ->> 'quantity')::numeric <> trunc((e ->> 'quantity')::numeric)
        or (e ->> 'quantity')::numeric not between 1 and case when e ->> 'kind' = 'case' then 1000 else 100 end
  ) then
    raise exception 'Give 1 to 1,000 of each case and 1 to 100 of each booster.' using errcode = '22023';
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
revoke all on function public._secret_code_loot(jsonb) from public, anon, authenticated;

create or replace function public._secret_code_json(p_code public.secret_codes)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_code.id,
    'label', p_code.label,
    'format', p_code.format,
    'coins', p_code.coins,
    'items', coalesce((select jsonb_agg(i.item_id order by i.item_id) from public.secret_code_items i where i.code_id = p_code.id), '[]'::jsonb),
    'achievements', coalesce((select jsonb_agg(a.achievement_id order by a.achievement_id) from public.secret_code_achievements a where a.code_id = p_code.id), '[]'::jsonb),
    'loot', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'id', l.ref_id, 'quantity', l.quantity) order by l.kind, l.ref_id)
                        from public.secret_code_loot l where l.code_id = p_code.id), '[]'::jsonb),
    'audience', p_code.audience,
    'allowlistCount', (select count(*) from public.secret_code_allowlist l where l.code_id = p_code.id),
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'maxRedemptions', p_code.max_redemptions,
    'perAccountLimit', p_code.per_account_limit,
    'redemptionCount', p_code.redemption_count,
    'disabledAt', p_code.disabled_at,
    'createdAt', p_code.created_at,
    'createdBy', p_code.created_by
  );
$$;

drop function public.admin_vault_publish(text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean, uuid);
drop function public.admin_vault_update(uuid, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean);
drop function public._create_secret_code(uuid, text, text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[]);

create function public._create_secret_code(
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
  if v_coins not between 0 and 10000000 then
    raise exception 'Coins must be a whole number from 0 to 10,000,000.' using errcode = '22023';
  end if;
  if v_coins = 0 and cardinality(v_items) = 0 and cardinality(v_achievements) = 0 and jsonb_array_length(v_loot) = 0 then
    raise exception 'A code needs coins, cosmetics, achievements, cases or boosters.' using errcode = '22023';
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
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiry date is in the past.' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'The code must expire after it starts.' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions not between 1 and 1000000 then
    raise exception 'The total limit must be between 1 and 1,000,000 redemptions.' using errcode = '22023';
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
revoke all on function public._create_secret_code(uuid, text, text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], jsonb)
  from public, anon, authenticated;

create function public.admin_vault_publish(
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
  p_confirm_repeat boolean,
  p_draft uuid default null,
  p_loot jsonb default '[]'::jsonb
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._require_admin();
  v_id uuid;
begin
  if coalesce(p_coins, 0) > 0 and coalesce(p_per_account_limit, 1) > 1 and not coalesce(p_confirm_repeat, false) then
    raise exception 'Confirm the maximum payout of this repeatable coin code before publishing.' using errcode = '22023', hint = 'confirm_repeat';
  end if;
  v_id := public._create_secret_code(
    v_actor, 'app', p_code_hash, p_loose_hash, p_format, p_label, p_coins, p_items, p_achievements,
    p_starts_at, p_expires_at, p_max_redemptions, p_per_account_limit, p_audience, p_allowlist, p_loot
  );
  if p_draft is not null then
    delete from public.secret_code_drafts where id = p_draft;
  end if;
  return v_id;
end;
$$;
revoke all on function public.admin_vault_publish(text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean, uuid, jsonb) from public, anon;
grant execute on function public.admin_vault_publish(text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean, uuid, jsonb) to authenticated;

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
  if v_coins not between 0 and 10000000 then
    raise exception 'Coins must be a whole number from 0 to 10,000,000.' using errcode = '22023';
  end if;
  if v_coins = 0 and cardinality(v_items) = 0 and cardinality(v_achievements) = 0 and jsonb_array_length(v_loot) = 0 then
    raise exception 'A code needs coins, cosmetics, achievements, cases or boosters.' using errcode = '22023';
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
revoke all on function public.admin_vault_update(uuid, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean, jsonb) from public, anon;
grant execute on function public.admin_vault_update(uuid, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean, jsonb) to authenticated;

create or replace function public.admin_vault_catalog()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'source', c.source, 'secret', c.secret, 'available', c.available,
        'price', c.price, 'game', c.game, 'category', c.category
      ) order by c.kind, c.id)
      from public.cosmetic_items c
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'coins', d.reward_coins, 'hidden', d.hidden,
        'items', coalesce((select jsonb_agg(ri.item_id order by ri.position, ri.item_id) from public.achievement_reward_items ri where ri.achievement_id = d.id), '[]'::jsonb)
      ) order by d.display_order)
      from public.achievement_definitions d
    ), '[]'::jsonb),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'price', c.price, 'available', c.available) order by c.position, c.id)
        from public.loot_cases c
    ), '[]'::jsonb),
    'boosters', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'multiplier', b.multiplier, 'price', b.price, 'charges', b.charges, 'available', b.available)
               order by b.position, b.multiplier)
        from public.loot_boosters b
    ), '[]'::jsonb)
  );
end;
$$;

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
        'coins', r.coins, 'items', to_jsonb(r.items), 'achievements', to_jsonb(r.achievements), 'achievementsNew', to_jsonb(r.achievements_new),
        'loot', r.loot
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

-- Same as 20261116000200_vault_repeat_reference.sql, plus cases and boosters (stored on the redemption).
create or replace function public.redeem_vault_code(p_loose_hash text, p_phrase_hash text default null, p_request uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code public.secret_codes;
  v_last public.secret_code_redemptions;
  v_match boolean;
  v_open boolean := false;
  v_used integer := 0;
  v_recent integer;
  v_daily integer;
  v_retry timestamptz;
  v_items text[];
  v_owned text[];
  v_achievements text[];
  v_new_achievements text[] := '{}';
  v_loot jsonb;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_loose_hash is null or p_loose_hash !~ '^[0-9a-f]{64}$' or p_phrase_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'That doesn''t look like a code.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('secret_codes:' || v_user::text, 0));

  if p_request is not null then
    select * into v_last from public.secret_code_redemptions where user_id = v_user and request_id = p_request;
    if found then
      return jsonb_build_object(
        'status', 'already', 'coins', v_last.coins, 'items', to_jsonb(v_last.items), 'achievements', to_jsonb(v_last.achievements),
        'loot', v_last.loot, 'redeemedAt', v_last.redeemed_at, 'balance', public._wallet_balance(v_user)
      );
    end if;
  end if;

  delete from public.secret_code_attempts where user_id = v_user and attempted_at < now() - interval '2 days';
  select count(*) filter (where attempted_at > now() - interval '15 minutes'), count(*)
    into v_recent, v_daily
    from public.secret_code_attempts
   where user_id = v_user and not succeeded and attempted_at > now() - interval '24 hours';
  if v_recent >= 5 or v_daily >= 20 then
    select max(t) into v_retry from (
      (select attempted_at + interval '15 minutes' as t from public.secret_code_attempts
        where v_recent >= 5 and user_id = v_user and not succeeded and attempted_at > now() - interval '15 minutes'
        order by attempted_at desc offset 4 limit 1)
      union all
      (select attempted_at + interval '24 hours' from public.secret_code_attempts
        where v_daily >= 20 and user_id = v_user and not succeeded and attempted_at > now() - interval '24 hours'
        order by attempted_at desc offset 19 limit 1)
    ) s;
    raise exception 'Too many tries. The vault will listen again in about % minute(s).',
      greatest(1, ceil(extract(epoch from (coalesce(v_retry, now() + interval '15 minutes') - now())) / 60))::integer
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  select * into v_code from public.secret_codes where loose_hash = decode(p_loose_hash, 'hex') for update;
  v_match := coalesce(found and (v_code.format = 'compact' or v_code.code_hash = decode(p_phrase_hash, 'hex')), false);
  if v_match and v_code.audience = 'allowlist' then
    v_match := exists (select 1 from public.secret_code_allowlist where code_id = v_code.id and user_id = v_user);
  end if;
  if v_match then
    select count(*) into v_used from public.secret_code_redemptions where code_id = v_code.id and user_id = v_user;
    if v_used >= v_code.per_account_limit then
      select * into v_last from public.secret_code_redemptions
       where code_id = v_code.id and user_id = v_user
       order by redeemed_at desc, id desc limit 1;
      return jsonb_build_object(
        'status', 'already', 'coins', v_last.coins, 'items', to_jsonb(v_last.items), 'achievements', to_jsonb(v_last.achievements),
        'loot', v_last.loot, 'redeemedAt', v_last.redeemed_at, 'balance', public._wallet_balance(v_user)
      );
    end if;
    v_open := v_code.disabled_at is null
      and (v_code.starts_at is null or v_code.starts_at <= now())
      and (v_code.expires_at is null or v_code.expires_at > now())
      and (v_code.max_redemptions is null or v_code.redemption_count < v_code.max_redemptions);
  end if;

  if not v_open then
    insert into public.secret_code_attempts (user_id, succeeded) values (v_user, false);
    return jsonb_build_object(
      'status', case when v_match then 'unavailable' else 'unknown' end,
      'triesLeft', greatest(0, least(4 - v_recent, 19 - v_daily))
    );
  end if;

  select coalesce(array_agg(item_id order by item_id), '{}') into v_items from public.secret_code_items where code_id = v_code.id;
  select coalesce(array_agg(achievement_id order by achievement_id), '{}') into v_achievements from public.secret_code_achievements where code_id = v_code.id;
  select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'id', l.ref_id, 'quantity', l.quantity) order by l.kind, l.ref_id), '[]'::jsonb)
    into v_loot from public.secret_code_loot l where l.code_id = v_code.id;
  select coalesce(array_agg(item_id), '{}') into v_owned from public.user_cosmetics where user_id = v_user and item_id = any (v_items);

  if cardinality(v_achievements) > 0 then
    insert into public.user_achievement_progress as current (user_id, achievement_id, progress)
    select v_user, d.id, d.target from public.achievement_definitions d where d.id = any (v_achievements)
    on conflict (user_id, achievement_id) do update
      set progress = greatest(current.progress, excluded.progress), updated_at = now()
      where current.progress < excluded.progress;
    with added as (
      insert into public.user_achievements (user_id, achievement_id, source)
      select v_user, a, 'code' from unnest(v_achievements) as a
      on conflict (user_id, achievement_id) do nothing
      returning achievement_id
    )
    select coalesce(array_agg(achievement_id order by achievement_id), '{}') into v_new_achievements from added;
    perform public._grant_achievement_rewards(v_user, 'event', true);
  end if;

  insert into public.user_cosmetics (user_id, item_id)
  select v_user, item from unnest(v_items) as item
  on conflict (user_id, item_id) do nothing;

  -- Gifted cases cost nothing, so their duplicate refunds are 0.
  insert into public.user_loot_cases (user_id, case_id, quantity)
  select v_user, l.ref_id, l.quantity from public.secret_code_loot l where l.code_id = v_code.id and l.kind = 'case'
  on conflict (user_id, case_id) do update set quantity = public.user_loot_cases.quantity + excluded.quantity, updated_at = now();
  insert into public.user_loot_case_lots (user_id, case_id, unit_price, quantity, source)
  select v_user, l.ref_id, 0, l.quantity, 'code:' || v_code.id::text from public.secret_code_loot l where l.code_id = v_code.id and l.kind = 'case';
  insert into public.user_loot_boosters (user_id, booster_id, quantity)
  select v_user, l.ref_id, l.quantity * b.charges
    from public.secret_code_loot l join public.loot_boosters b on b.id = l.ref_id
   where l.code_id = v_code.id and l.kind = 'booster'
  on conflict (user_id, booster_id) do update set quantity = public.user_loot_boosters.quantity + excluded.quantity, updated_at = now();

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;
  if v_code.coins > 0 then
    if v_balance::bigint + v_code.coins > 2147483647 then
      raise exception 'Your wallet can''t hold that many coins.' using errcode = 'P0001', hint = 'wallet_full';
    end if;
    update public.coin_wallets set balance = balance + v_code.coins, updated_at = now()
     where user_id = v_user
    returning balance into v_balance;
    insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
    values (
      v_user, v_code.coins, v_balance, 'code',
      'code:' || v_code.id::text || case when v_used > 0 then ':' || (v_used + 1)::text else '' end,
      jsonb_build_object('items', to_jsonb(v_items), 'achievements', to_jsonb(v_achievements))
    );
  end if;

  insert into public.secret_code_redemptions (code_id, user_id, coins, items, achievements, achievements_new, request_id, loot)
  values (v_code.id, v_user, v_code.coins, v_items, v_achievements, v_new_achievements, p_request, v_loot);
  update public.secret_codes set redemption_count = redemption_count + 1 where id = v_code.id;
  insert into public.secret_code_attempts (user_id, succeeded) values (v_user, true);

  return jsonb_build_object(
    'status', 'unlocked',
    'coins', v_code.coins,
    'items', to_jsonb(v_items),
    'newItems', to_jsonb(array(select item from unnest(v_items) as item where item <> all (v_owned) order by item)),
    'achievements', to_jsonb(v_achievements),
    'newAchievements', to_jsonb(v_new_achievements),
    'loot', v_loot,
    'balance', v_balance
  );
end;
$$;
