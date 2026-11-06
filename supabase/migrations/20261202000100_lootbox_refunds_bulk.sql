-- Lootboxes, part 2: duplicate refunds at the price actually paid, purchases of up to 1,000 cases,
-- and an administrator-only bulk "open all" for the administrator's own cases.

-- ---------------------------------------------------------------------------
-- Duplicate refund rates: the single source for refunds (loot_state exposes them to the app).
-- A duplicate refunds this percentage of the unit price paid for its case, rounded down.
-- ---------------------------------------------------------------------------
create table public.loot_refund_rates (
  rarity text primary key check (rarity in ('common', 'uncommon', 'epic', 'legendary', 'mythic', 'secret')),
  percent integer not null check (percent between 0 and 100)
);
alter table public.loot_refund_rates enable row level security;
revoke all on public.loot_refund_rates from public, anon, authenticated;
grant all on public.loot_refund_rates to service_role;
insert into public.loot_refund_rates (rarity, percent) values
  ('common', 5), ('uncommon', 10), ('epic', 20), ('legendary', 35), ('mythic', 50), ('secret', 75);

create function public._loot_refund(p_rarity text, p_unit_price integer)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select (greatest(p_unit_price, 0)::bigint * r.percent / 100)::integer
                     from public.loot_refund_rates r where r.rarity = p_rarity), 0);
$$;
revoke all on function public._loot_refund(text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Purchase lots: owned cases remember the unit price paid. user_loot_cases stays the total;
-- openings consume the oldest lots first.
-- ---------------------------------------------------------------------------
create table public.user_loot_case_lots (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  case_id text not null references public.loot_cases (id),
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null check (quantity >= 0),
  -- The purchase reference ('case:<request>'), or 'unrecorded' for cases without a purchase record.
  source text not null,
  created_at timestamptz not null default now()
);
create index user_loot_case_lots_open on public.user_loot_case_lots (user_id, case_id, created_at, id) where quantity > 0;
alter table public.user_loot_case_lots enable row level security;
create policy owner_read on public.user_loot_case_lots for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_loot_case_lots from public, anon, authenticated;
grant select on public.user_loot_case_lots to authenticated;
grant all on public.user_loot_case_lots to service_role;

-- Backfill: cases still owned are the newest purchases (earlier ones were opened first).
insert into public.user_loot_case_lots (user_id, case_id, unit_price, quantity, source, created_at)
select p.user_id, p.case_id, p.price, least(p.quantity, u.quantity - p.newer), p.reference, p.created_at
  from (
    select t.user_id, t.details ->> 'case' as case_id, (t.details ->> 'price')::integer as price,
           (t.details ->> 'quantity')::integer as quantity, t.reference, t.created_at,
           coalesce(sum((t.details ->> 'quantity')::integer) over (
             partition by t.user_id, t.details ->> 'case' order by t.created_at desc, t.id desc
             rows between unbounded preceding and 1 preceding), 0) as newer
      from public.coin_transactions t
     where t.kind = 'purchase' and t.reference like 'case:%'
  ) p
  join public.user_loot_cases u on u.user_id = p.user_id and u.case_id = p.case_id
 where u.quantity > p.newer;

insert into public.user_loot_case_lots (user_id, case_id, unit_price, quantity, source, created_at)
select u.user_id, u.case_id, 0, u.quantity - coalesce(l.total, 0), 'unrecorded', u.updated_at
  from public.user_loot_cases u
  left join (select user_id, case_id, sum(quantity) as total from public.user_loot_case_lots group by user_id, case_id) l
    on l.user_id = u.user_id and l.case_id = u.case_id
 where u.quantity > coalesce(l.total, 0);

-- Each rolled result keeps the unit price of its case; refund is credited when it's claimed.
alter table public.loot_opening_results
  add column unit_price integer not null default 0 check (unit_price >= 0),
  add column refund integer not null default 0 check (refund >= 0);

-- Existing results: the latest recorded purchase price for that case at or before the opening.
update public.loot_opening_results r
   set unit_price = coalesce((
     select (t.details ->> 'price')::integer from public.coin_transactions t
      where t.user_id = o.user_id and t.kind = 'purchase' and t.reference like 'case:%'
        and t.details ->> 'case' = o.case_id and t.created_at <= o.created_at
      order by t.created_at desc, t.id desc limit 1), 0)
  from public.loot_openings o
 where o.id = r.opening_id;

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('reward', 'purchase', 'code', 'slots', 'achievement', 'streak', 'refund'));

-- ---------------------------------------------------------------------------
-- Internal helpers (callers hold the per-account loot_openings advisory lock)
-- ---------------------------------------------------------------------------

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
      select jsonb_agg(jsonb_build_object('item', r.item_id, 'kind', c.kind, 'rarity', r.rarity, 'duplicate', r.duplicate,
               'refund', case when not r.duplicate then 0 when o.claimed_at is null then public._loot_refund(r.rarity, r.unit_price) else r.refund end)
               order by r.position)
        from public.loot_opening_results r join public.cosmetic_items c on c.id = r.item_id
       where r.opening_id = o.id), '[]'::jsonb))
    from public.loot_openings o where o.id = p_opening;
$$;
revoke all on function public._loot_opening(uuid) from public, anon, authenticated;

-- Consumes owned cases (oldest lots first) and rolls one batch of up to 10. Returns cases left.
create function public._loot_open(p_user uuid, p_opening uuid, p_case text, p_quantity integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_owned integer;
  v_total integer;
  v_left integer;
  v_need integer := p_quantity;
  v_take integer;
  v_prices integer[] := '{}';
  v_lot record;
  v_draw bigint;
  v_rarity text;
  v_count integer;
  v_item text;
begin
  select quantity into v_owned from public.user_loot_cases where user_id = p_user and case_id = p_case for update;
  if coalesce(v_owned, 0) < p_quantity then
    raise exception 'You don''t have that many cases.' using errcode = 'P0001', hint = 'not_enough_cases';
  end if;
  select coalesce(sum(weight), 0)::integer into v_total from public._loot_tiers(p_case);
  if v_total <= 0 then
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

  for v_pos in 0 .. p_quantity - 1 loop
    v_draw := public._loot_random(v_total);
    select t.rarity, t.items into v_rarity, v_count
      from (select t.rarity, t.items, sum(t.weight) over (order by array_position(array['common', 'uncommon', 'epic', 'legendary', 'mythic', 'secret'], t.rarity)) as upper
              from public._loot_tiers(p_case) t) t
     where v_draw < t.upper
     order by t.upper
     limit 1;
    select i.item_id into v_item
      from public.loot_case_items i join public.cosmetic_items c on c.id = i.item_id
     where i.case_id = p_case and c.rarity = v_rarity
     order by i.item_id
     offset public._loot_random(v_count) limit 1;
    insert into public.loot_opening_results (opening_id, position, item_id, rarity, duplicate, unit_price)
    values (p_opening, v_pos, v_item, v_rarity,
      exists (select 1 from public.user_cosmetics where user_id = p_user and item_id = v_item)
      or exists (select 1 from public.loot_opening_results r join public.loot_openings o on o.id = r.opening_id
                  where o.user_id = p_user and o.claimed_at is null and r.item_id = v_item),
      v_prices[v_pos + 1]);
  end loop;
  return v_left;
end;
$$;
revoke all on function public._loot_open(uuid, uuid, text, integer) from public, anon, authenticated;

-- Claims unclaimed openings once: grants new items and credits duplicate refunds in one transaction.
create function public._loot_claim(p_user uuid, p_openings uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_new integer := 0;
  v_dupes integer := 0;
  v_refund bigint := 0;
  v_balance integer;
begin
  with claimed as (
    update public.loot_openings set claimed_at = now()
     where user_id = p_user and claimed_at is null and id = any (p_openings)
    returning id
  )
  select coalesce(array_agg(id order by id), '{}') into v_ids from claimed;

  if cardinality(v_ids) > 0 then
    update public.loot_opening_results r set refund = public._loot_refund(r.rarity, r.unit_price)
     where r.opening_id = any (v_ids) and r.duplicate;
    select count(*) filter (where r.duplicate), coalesce(sum(r.refund), 0) into v_dupes, v_refund
      from public.loot_opening_results r where r.opening_id = any (v_ids);

    insert into public.user_cosmetics (user_id, item_id)
    select distinct p_user, r.item_id from public.loot_opening_results r where r.opening_id = any (v_ids)
    on conflict (user_id, item_id) do nothing;
    get diagnostics v_new = row_count;

    if v_refund > 0 then
      insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
      update public.coin_wallets
         set balance = balance + v_refund::integer, spent = greatest(spent - v_refund::integer, 0), updated_at = now()
       where user_id = p_user
      returning balance into v_balance;
      -- Each opening is claimed once, so the first id of a claim is a unique reference.
      insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
      values (p_user, v_refund::integer, v_balance, 'refund', 'case-refund:' || v_ids[1]::text,
        jsonb_build_object('openings', to_jsonb(v_ids), 'duplicates', v_dupes));
    end if;
  end if;

  return jsonb_build_object('claimed', cardinality(v_ids), 'newItems', v_new, 'duplicates', v_dupes,
    'refund', v_refund, 'balance', coalesce(v_balance, public._wallet_balance(p_user)));
end;
$$;
revoke all on function public._loot_claim(uuid, uuid[]) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------

create or replace function public.loot_state()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'balance', public._wallet_balance(v_user),
    'refundRates', (select jsonb_object_agg(rarity, percent) from public.loot_refund_rates),
    'cases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lc.id,
        'price', lc.price,
        'available', lc.available,
        'quantity', coalesce(u.quantity, 0),
        'tiers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'rarity', t.rarity,
            'weight', t.weight,
            'items', (
              select jsonb_agg(jsonb_build_object(
                'id', case when c.secret and uc.item_id is null then null else c.id end,
                'kind', c.kind,
                'owned', uc.item_id is not null) order by c.kind, c.price, c.id)
                from public.loot_case_items i
                join public.cosmetic_items c on c.id = i.item_id and c.rarity = t.rarity
                left join public.user_cosmetics uc on uc.user_id = v_user and uc.item_id = c.id
               where i.case_id = lc.id)))
            from public._loot_tiers(lc.id) t), '[]'::jsonb)) order by lc.position, lc.id)
        from public.loot_cases lc
        left join public.user_loot_cases u on u.user_id = v_user and u.case_id = lc.id
       where lc.available or coalesce(u.quantity, 0) > 0), '[]'::jsonb),
    'pending', coalesce((
      select jsonb_agg(public._loot_opening(o.id) order by o.created_at)
        from public.loot_openings o where o.user_id = v_user and o.claimed_at is null), '[]'::jsonb));
end;
$$;

-- Buys up to 1,000 cases at the price the buyer saw and records that price as a lot.
create or replace function public.buy_loot_cases(p_request uuid, p_case text, p_quantity integer, p_expected_price integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ref text := 'case:' || p_request::text;
  lc public.loot_cases;
  v_balance integer;
  v_total bigint;
  v_owned integer;
  v_existing public.coin_transactions;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_request is null or p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Choose a whole number of cases from 1 to 1,000.' using errcode = '22023';
  end if;

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;

  select * into v_existing from public.coin_transactions where user_id = v_user and reference = v_ref;
  if found then
    select quantity into v_owned from public.user_loot_cases where user_id = v_user and case_id = v_existing.details ->> 'case';
    return jsonb_build_object('status', 'repeat', 'case', v_existing.details ->> 'case', 'bought', (v_existing.details ->> 'quantity')::integer,
      'owned', coalesce(v_owned, 0), 'balance', v_balance);
  end if;

  select * into lc from public.loot_cases where id = p_case;
  if not found or not lc.available then
    raise exception 'That case isn''t available.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  if p_expected_price is distinct from lc.price then
    raise exception 'The price changed. Check the new price and try again.' using errcode = 'P0001', hint = 'price_changed';
  end if;
  v_total := lc.price::bigint * p_quantity;
  if v_balance < v_total then
    raise exception 'Not enough coins for that many cases.' using errcode = 'P0001', hint = 'insufficient_funds';
  end if;

  update public.coin_wallets
     set balance = balance - v_total::integer, spent = (least(spent::bigint + v_total, 2147483647))::integer, updated_at = now()
   where user_id = v_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (v_user, -v_total::integer, v_balance, 'purchase', v_ref, jsonb_build_object('case', lc.id, 'quantity', p_quantity, 'price', lc.price));
  insert into public.user_loot_case_lots (user_id, case_id, unit_price, quantity, source)
  values (v_user, lc.id, lc.price, p_quantity, v_ref);
  insert into public.user_loot_cases (user_id, case_id, quantity) values (v_user, lc.id, p_quantity)
  on conflict (user_id, case_id) do update set quantity = public.user_loot_cases.quantity + excluded.quantity, updated_at = now()
  returning quantity into v_owned;

  return jsonb_build_object('status', 'purchased', 'case', lc.id, 'bought', p_quantity, 'owned', v_owned, 'balance', v_balance);
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
    return public._loot_opening(p_opening) || jsonb_build_object('remaining', coalesce(v_left, 0));
  end if;

  v_left := public._loot_open(v_user, p_opening, p_case, p_quantity);
  return public._loot_opening(p_opening) || jsonb_build_object('remaining', v_left);
end;
$$;

create or replace function public.claim_loot_openings(p_openings uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_openings is null or cardinality(p_openings) > 50 then
    raise exception 'Choose up to 50 openings to claim.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('loot_openings:' || v_user::text, 0));
  return public._loot_claim(v_user, p_openings);
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrator bulk opening: each step opens and claims up to 200 of the caller's own cases.
-- Openings that were already pending are left for the normal reveal. Repeating a step id returns
-- the stored result, so a retried step never consumes cases or credits refunds again.
-- ---------------------------------------------------------------------------
create table public.loot_bulk_steps (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.loot_bulk_steps enable row level security;
revoke all on public.loot_bulk_steps from public, anon, authenticated;
grant all on public.loot_bulk_steps to service_role;

create function public._loot_openable(p_user uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(u.quantity), 0)::integer from public.user_loot_cases u
   where u.user_id = p_user and u.quantity > 0 and exists (select 1 from public._loot_tiers(u.case_id));
$$;
revoke all on function public._loot_openable(uuid) from public, anon, authenticated;

create function public.admin_open_all_loot_cases(p_step uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._require_admin();
  v_prior jsonb;
  v_budget integer := 200;
  v_case record;
  v_left integer;
  v_take integer;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_opened integer := 0;
  v_claim jsonb;
  v_result jsonb;
begin
  if p_step is null then
    raise exception 'A step id is required.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('loot_openings:' || v_user::text, 0));
  select result into v_prior from public.loot_bulk_steps where id = p_step and user_id = v_user;
  if found then
    return v_prior || jsonb_build_object('remaining', public._loot_openable(v_user));
  end if;

  for v_case in
    select u.case_id, u.quantity from public.user_loot_cases u join public.loot_cases lc on lc.id = u.case_id
     where u.user_id = v_user and u.quantity > 0 and exists (select 1 from public._loot_tiers(u.case_id))
     order by lc.position, lc.id
  loop
    v_left := v_case.quantity;
    while v_left > 0 and v_budget > 0 loop
      v_take := least(10, v_left, v_budget);
      v_id := gen_random_uuid();
      perform public._loot_open(v_user, v_id, v_case.case_id, v_take);
      v_ids := v_ids || v_id;
      v_opened := v_opened + v_take;
      v_left := v_left - v_take;
      v_budget := v_budget - v_take;
    end loop;
    exit when v_budget = 0;
  end loop;

  v_claim := public._loot_claim(v_user, v_ids);
  v_result := jsonb_build_object('opened', v_opened, 'newItems', v_claim -> 'newItems', 'duplicates', v_claim -> 'duplicates',
    'refund', v_claim -> 'refund', 'balance', v_claim -> 'balance');
  insert into public.loot_bulk_steps (id, user_id, result) values (p_step, v_user, v_result);
  return v_result || jsonb_build_object('remaining', public._loot_openable(v_user));
end;
$$;
revoke all on function public.admin_open_all_loot_cases(uuid) from public, anon;
grant execute on function public.admin_open_all_loot_cases(uuid) to authenticated;
