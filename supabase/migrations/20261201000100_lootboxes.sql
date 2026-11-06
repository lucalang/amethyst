-- Lootboxes: a rarity for every cosmetic, cases bought with coins, and persisted case openings.
-- The database owns prices, quantities, drop tables, randomness and grants; clients only present results.

-- ---------------------------------------------------------------------------
-- Rarities
-- ---------------------------------------------------------------------------
create function public._cosmetic_rarity(p_price integer, p_source text, p_secret boolean)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_secret then 'secret'
    when p_source = 'achievement' then 'mythic'
    when p_price <= 100 then 'common'
    when p_price <= 200 then 'uncommon'
    when p_price <= 349 then 'epic'
    when p_price <= 500 then 'legendary'
    else 'mythic'
  end;
$$;
revoke all on function public._cosmetic_rarity(integer, text, boolean) from public, anon, authenticated;

alter table public.cosmetic_items add column rarity text;
update public.cosmetic_items set rarity = public._cosmetic_rarity(price, source, secret);
alter table public.cosmetic_items
  alter column rarity set not null,
  add constraint cosmetic_items_rarity_check check (rarity in ('common', 'uncommon', 'epic', 'legendary', 'mythic', 'secret'));

-- New catalogue rows get the same rule unless they name a rarity.
create function public.cosmetic_items_default_rarity()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.rarity is null then
    new.rarity := public._cosmetic_rarity(new.price, new.source, new.secret);
  end if;
  return new;
end;
$$;
create trigger cosmetic_items_default_rarity before insert on public.cosmetic_items
  for each row execute function public.cosmetic_items_default_rarity();

-- ---------------------------------------------------------------------------
-- Cases and drop tables (read through loot_state(), never directly)
-- ---------------------------------------------------------------------------
create table public.loot_cases (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,31}$'),
  price integer not null check (price > 0),
  available boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- A rarity's chance is its weight over the weights of the case's rarities that have items.
create table public.loot_case_rarities (
  case_id text not null references public.loot_cases (id) on delete cascade,
  rarity text not null check (rarity in ('common', 'uncommon', 'epic', 'legendary', 'mythic', 'secret')),
  weight integer not null check (weight > 0),
  primary key (case_id, rarity)
);

-- Items within a rarity are equally likely.
create table public.loot_case_items (
  case_id text not null references public.loot_cases (id) on delete cascade,
  item_id text not null references public.cosmetic_items (id),
  primary key (case_id, item_id)
);

alter table public.loot_cases enable row level security;
alter table public.loot_case_rarities enable row level security;
alter table public.loot_case_items enable row level security;
revoke all on public.loot_cases, public.loot_case_rarities, public.loot_case_items from public, anon, authenticated;
grant all on public.loot_cases, public.loot_case_rarities, public.loot_case_items to service_role;

insert into public.loot_cases (id, price, position) values ('release', 150, 0);
insert into public.loot_case_rarities (case_id, rarity, weight) values
  ('release', 'common', 4500),
  ('release', 'uncommon', 3000),
  ('release', 'epic', 1700),
  ('release', 'legendary', 600),
  ('release', 'mythic', 150),
  ('release', 'secret', 50);

-- Release Case: every shop frame, decoration, banner and profile frame; the cheapest and priciest
-- item of each game cosmetic category; and three secret Vault rewards.
insert into public.loot_case_items (case_id, item_id)
select 'release', id from public.cosmetic_items where source = 'shop' and available and kind <> 'game'
union
select 'release', id from (
  select id,
         row_number() over (partition by game, category order by price, id) as low,
         row_number() over (partition by game, category order by price desc, id) as high
    from public.cosmetic_items where kind = 'game' and available
) g where low = 1 or high = 1
union
select 'release', id from public.cosmetic_items where id in ('vault-sigil', 'badge-lantern', 'title-night-archivist');

-- ---------------------------------------------------------------------------
-- Owned cases and openings
-- ---------------------------------------------------------------------------
create table public.user_loot_cases (
  user_id uuid not null references public.users (id) on delete cascade,
  case_id text not null references public.loot_cases (id),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, case_id)
);

-- One batch of up to 10 cases. Results are fixed when the batch is opened; claiming grants them.
create table public.loot_openings (
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  case_id text not null references public.loot_cases (id),
  quantity integer not null check (quantity between 1 and 10),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index loot_openings_pending on public.loot_openings (user_id, created_at) where claimed_at is null;

create table public.loot_opening_results (
  opening_id uuid not null references public.loot_openings (id) on delete cascade,
  position smallint not null check (position between 0 and 9),
  item_id text not null references public.cosmetic_items (id),
  rarity text not null,
  -- Already owned (or already won in an unclaimed opening) when rolled: cosmetics are owned once.
  duplicate boolean not null,
  primary key (opening_id, position)
);

alter table public.user_loot_cases enable row level security;
alter table public.loot_openings enable row level security;
alter table public.loot_opening_results enable row level security;
create policy owner_read on public.user_loot_cases for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_read on public.loot_openings for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_read on public.loot_opening_results for select to authenticated
  using (exists (select 1 from public.loot_openings o where o.id = opening_id and o.user_id = (select auth.uid())));
revoke all on public.user_loot_cases, public.loot_openings, public.loot_opening_results from public, anon, authenticated;
grant select on public.user_loot_cases, public.loot_openings, public.loot_opening_results to authenticated;
grant all on public.user_loot_cases, public.loot_openings, public.loot_opening_results to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

-- Uniform integer in [0, p_bound) from the server's strong random source (rejection sampled, no bias).
create function public._loot_random(p_bound bigint)
returns bigint
language plpgsql volatile set search_path = '' as $$
declare
  v_span constant bigint := 281474976710656; -- 2^48
  v_limit bigint := v_span - (v_span % p_bound);
  v_draw bigint;
begin
  loop
    v_draw := ('x' || encode(substring(uuid_send(gen_random_uuid()) from 1 for 6), 'hex'))::bit(48)::bigint;
    exit when v_draw < v_limit;
  end loop;
  return v_draw % p_bound;
end;
$$;
revoke all on function public._loot_random(bigint) from public, anon, authenticated;

-- The rarities of a case that can actually drop something, with their weights and item counts.
create function public._loot_tiers(p_case text)
returns table (rarity text, weight integer, items integer)
language sql stable security definer set search_path = '' as $$
  select r.rarity, r.weight, count(i.item_id)::integer
    from public.loot_case_rarities r
    join public.loot_case_items i on i.case_id = r.case_id
    join public.cosmetic_items c on c.id = i.item_id and c.rarity = r.rarity
   where r.case_id = p_case
   group by r.rarity, r.weight
   order by array_position(array['common', 'uncommon', 'epic', 'legendary', 'mythic', 'secret'], r.rarity);
$$;
revoke all on function public._loot_tiers(text) from public, anon, authenticated;

create function public._loot_opening(p_opening uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', o.id,
    'case', o.case_id,
    'quantity', o.quantity,
    'createdAt', o.created_at,
    'claimed', o.claimed_at is not null,
    'results', coalesce((
      select jsonb_agg(jsonb_build_object('item', r.item_id, 'kind', c.kind, 'rarity', r.rarity, 'duplicate', r.duplicate) order by r.position)
        from public.loot_opening_results r join public.cosmetic_items c on c.id = r.item_id
       where r.opening_id = o.id), '[]'::jsonb))
    from public.loot_openings o where o.id = p_opening;
$$;
revoke all on function public._loot_opening(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------

-- Balance, cases (price, owned quantity, drop table) and unclaimed openings. Secret items the
-- account doesn't own are listed without their id.
create function public.loot_state()
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
revoke all on function public.loot_state() from public, anon;
grant execute on function public.loot_state() to authenticated;

-- Buys cases at the price the buyer saw. Coins and cases change together; repeating a request id
-- returns the original purchase instead of charging again.
create function public.buy_loot_cases(p_request uuid, p_case text, p_quantity integer, p_expected_price integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ref text := 'case:' || p_request::text;
  lc public.loot_cases;
  v_balance integer;
  v_total integer;
  v_owned integer;
  v_existing public.coin_transactions;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_request is null or p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'Choose a whole number of cases from 1 to 100.' using errcode = '22023';
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
  v_total := lc.price * p_quantity;
  if v_balance < v_total then
    raise exception 'Not enough coins for that many cases.' using errcode = 'P0001', hint = 'insufficient_funds';
  end if;

  update public.coin_wallets
     set balance = balance - v_total, spent = spent + v_total, updated_at = now()
   where user_id = v_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (v_user, -v_total, v_balance, 'purchase', v_ref, jsonb_build_object('case', lc.id, 'quantity', p_quantity, 'price', lc.price));
  insert into public.user_loot_cases (user_id, case_id, quantity) values (v_user, lc.id, p_quantity)
  on conflict (user_id, case_id) do update set quantity = public.user_loot_cases.quantity + excluded.quantity, updated_at = now()
  returning quantity into v_owned;

  return jsonb_build_object('status', 'purchased', 'case', lc.id, 'bought', p_quantity, 'owned', v_owned, 'balance', v_balance);
end;
$$;
revoke all on function public.buy_loot_cases(uuid, text, integer, integer) from public, anon;
grant execute on function public.buy_loot_cases(uuid, text, integer, integer) to authenticated;

-- Opens up to 10 owned cases as one batch: consumes them and rolls every result in one transaction.
-- Repeating an opening id returns the stored batch; nothing is consumed or rolled twice.
create function public.open_loot_cases(p_opening uuid, p_case text, p_quantity integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_owned integer;
  v_total integer;
  v_draw bigint;
  v_rarity text;
  v_count integer;
  v_item text;
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

  select quantity into v_owned from public.user_loot_cases where user_id = v_user and case_id = p_case for update;
  if coalesce(v_owned, 0) < p_quantity then
    raise exception 'You don''t have that many cases.' using errcode = 'P0001', hint = 'not_enough_cases';
  end if;
  select coalesce(sum(weight), 0)::integer into v_total from public._loot_tiers(p_case);
  if v_total <= 0 then
    raise exception 'That case can''t be opened right now.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;

  update public.user_loot_cases set quantity = quantity - p_quantity, updated_at = now()
   where user_id = v_user and case_id = p_case
  returning quantity into v_left;
  insert into public.loot_openings (id, user_id, case_id, quantity) values (p_opening, v_user, p_case, p_quantity);

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
    insert into public.loot_opening_results (opening_id, position, item_id, rarity, duplicate)
    values (p_opening, v_pos, v_item, v_rarity,
      exists (select 1 from public.user_cosmetics where user_id = v_user and item_id = v_item)
      or exists (select 1 from public.loot_opening_results r join public.loot_openings o on o.id = r.opening_id
                  where o.user_id = v_user and o.claimed_at is null and r.item_id = v_item));
  end loop;

  return public._loot_opening(p_opening) || jsonb_build_object('remaining', v_left);
end;
$$;
revoke all on function public.open_loot_cases(uuid, text, integer) from public, anon;
grant execute on function public.open_loot_cases(uuid, text, integer) to authenticated;

-- Grants the rewards of unclaimed openings. Claimed openings are skipped, so repeats grant nothing.
create function public.claim_loot_openings(p_openings uuid[])
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_new integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_openings is null or cardinality(p_openings) > 50 then
    raise exception 'Choose up to 50 openings to claim.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('loot_openings:' || v_user::text, 0));
  with claimed as (
    update public.loot_openings set claimed_at = now()
     where user_id = v_user and claimed_at is null and id = any (p_openings)
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from claimed;

  if cardinality(v_ids) > 0 then
    insert into public.user_cosmetics (user_id, item_id)
    select distinct v_user, r.item_id from public.loot_opening_results r where r.opening_id = any (v_ids)
    on conflict (user_id, item_id) do nothing;
    get diagnostics v_new = row_count;
  end if;

  return jsonb_build_object('claimed', cardinality(v_ids), 'newItems', v_new);
end;
$$;
revoke all on function public.claim_loot_openings(uuid[]) from public, anon;
grant execute on function public.claim_loot_openings(uuid[]) to authenticated;
