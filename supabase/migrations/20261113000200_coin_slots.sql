-- Coin Slots: a three-reel machine played with earned Arcade coins. Coins can't be bought or cashed
-- out, so slots stay a game: the house keeps a small edge, wagers are capped per day, and net slot
-- winnings share the existing 600-coin daily limit with game rewards. A bet is only accepted when
-- even its top prize fits in what's left of that limit, so slots can never push an account past it.

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check check (kind in ('reward', 'purchase', 'code', 'slots'));

-- ---------------------------------------------------------------------------
-- The machine (public to signed-in players: the app shows the exact odds from these rows)
-- ---------------------------------------------------------------------------
create table public.slot_machines (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,31}$'),
  -- One strip of symbols per reel. Every stop is equally likely; the payline shows one stop per reel.
  reels jsonb not null check (jsonb_typeof(reels) = 'array' and jsonb_array_length(reels) = 3),
  -- [{symbol, count, pays}]: pays × bet when exactly `count` symbols on the payline are `symbol`.
  -- When several rules match, the highest pays. Every rule pays at least 2× so a win is always a profit.
  paytable jsonb not null check (jsonb_typeof(paytable) = 'array' and jsonb_array_length(paytable) > 0),
  bets integer[] not null check (cardinality(bets) > 0 and 0 < all (bets)),
  daily_wager_limit integer not null check (daily_wager_limit > 0),
  max_spins_per_minute integer not null default 30 check (max_spins_per_minute > 0),
  updated_at timestamptz not null default now()
);

insert into public.slot_machines (id, reels, paytable, bets, daily_wager_limit) values (
  'amethyst',
  '[
    ["gem","berry","coin","moon","berry","star","coin","crown","berry","moon","coin","star","berry","moon","coin","crown","berry","star","moon","coin"],
    ["moon","coin","berry","star","gem","berry","coin","moon","crown","berry","coin","star","moon","berry","coin","crown","star","berry","moon","coin"],
    ["coin","star","berry","moon","coin","crown","berry","moon","star","coin","berry","gem","moon","berry","coin","star","crown","berry","moon","coin"]
  ]',
  '[
    {"symbol":"gem","count":3,"pays":100},
    {"symbol":"crown","count":3,"pays":40},
    {"symbol":"star","count":3,"pays":20},
    {"symbol":"moon","count":3,"pays":16},
    {"symbol":"coin","count":3,"pays":10},
    {"symbol":"berry","count":3,"pays":8},
    {"symbol":"berry","count":2,"pays":3}
  ]',
  '{1,2,3,5}',
  300
);

alter table public.slot_machines enable row level security;
create policy read_machines on public.slot_machines for select to authenticated using (true);
revoke all on public.slot_machines from public, anon, authenticated;
grant select on public.slot_machines to authenticated;
grant all on public.slot_machines to service_role;

-- ---------------------------------------------------------------------------
-- Spins
-- ---------------------------------------------------------------------------
create table public.slot_spins (
  -- Chosen by the client for each press of Spin; retries reuse it, so a spin is never charged twice.
  id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  machine text not null references public.slot_machines (id),
  bet integer not null check (bet > 0),
  stops integer[] not null,
  symbols text[] not null,
  multiplier integer not null check (multiplier >= 0),
  payout integer not null check (payout >= 0),
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now()
);
create index slot_spins_user_created on public.slot_spins (user_id, created_at desc);

alter table public.slot_spins enable row level security;
create policy owner_read on public.slot_spins for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.slot_spins from public, anon, authenticated;
grant select on public.slot_spins to authenticated;
grant all on public.slot_spins to service_role;

-- ---------------------------------------------------------------------------
-- One daily limit for game rewards and slot winnings
-- ---------------------------------------------------------------------------

-- Coins the account can still gain in the rolling 24 hours: 600 minus game rewards minus net slot
-- winnings (slot losses never add room).
create function public._coin_room(p_user uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0, 600
    - coalesce(sum(amount) filter (where kind = 'reward'), 0)
    - greatest(0, coalesce(sum(amount) filter (where kind = 'slots'), 0)))::integer
    from public.coin_transactions
   where user_id = p_user and kind in ('reward', 'slots') and created_at > now() - interval '24 hours';
$$;
revoke all on function public._coin_room(uuid) from public, anon, authenticated;

-- Unchanged except that the room now also counts net slot winnings.
create or replace function public._credit_coins(p_user uuid, p_amount integer, p_reference text, p_details jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
  v_existing public.coin_transactions;
  v_amount integer;
begin
  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;

  select * into v_existing from public.coin_transactions where user_id = p_user and reference = p_reference;
  if found then
    return jsonb_build_object('coins', v_existing.amount, 'balance', v_balance, 'capped', false);
  end if;

  v_amount := least(greatest(p_amount, 0), public._coin_room(p_user));
  if v_amount <= 0 then
    return jsonb_build_object('coins', 0, 'balance', v_balance, 'capped', p_amount > 0);
  end if;

  update public.coin_wallets
     set balance = balance + v_amount, earned = earned + v_amount, updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (p_user, v_amount, v_balance, 'reward', p_reference, coalesce(p_details, '{}'::jsonb));
  return jsonb_build_object('coins', v_amount, 'balance', v_balance, 'capped', v_amount < p_amount);
end;
$$;
revoke all on function public._credit_coins(uuid, integer, text, jsonb) from public, anon, authenticated;

-- The signed-in account's slot limits: balance, coins wagered and the coin-limit room left (rolling 24 hours).
create function public.slot_status()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_wagered integer;
  v_oldest timestamptz;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  select coalesce(sum(bet), 0)::integer, min(created_at) into v_wagered, v_oldest
    from public.slot_spins
   where user_id = v_user and created_at > now() - interval '24 hours';
  return jsonb_build_object(
    'balance', public._wallet_balance(v_user),
    'wagered', v_wagered,
    'room', public._coin_room(v_user),
    'wagerFreesAt', v_oldest + interval '24 hours'
  );
end;
$$;
revoke all on function public.slot_status() from public, anon;
grant execute on function public.slot_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Spinning
-- ---------------------------------------------------------------------------

-- One spin, all or nothing: checks the bet, draws three reel stops with the database's
-- cryptographically secure generator, pays from the paytable and records it. Repeating a spin id
-- returns the stored result instead of spinning again.
create function public.spin_slots(p_spin uuid, p_bet integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  m public.slot_machines;
  v_spin public.slot_spins;
  v_balance integer;
  v_wagered integer;
  v_recent integer;
  v_top integer;
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
    select count(*) filter (where created_at > now() - interval '1 minute'), coalesce(sum(bet), 0)
      into v_recent, v_wagered
      from public.slot_spins
     where user_id = v_user and created_at > now() - interval '24 hours';
    if v_recent >= m.max_spins_per_minute then
      raise exception 'The reels need a short rest. Try again in a minute.' using errcode = 'P0001', hint = 'rate_limited';
    end if;
    if v_wagered + p_bet > m.daily_wager_limit then
      raise exception 'That bet would go past the % coins you can wager in 24 hours.', m.daily_wager_limit
        using errcode = 'P0001', hint = 'slots_limit';
    end if;
    if v_balance < p_bet then
      raise exception 'Not enough coins for that bet.' using errcode = 'P0001', hint = 'insufficient_funds';
    end if;
    select max((rule ->> 'pays')::integer) into v_top from jsonb_array_elements(m.paytable) as rule;
    if p_bet * (v_top - 1) > public._coin_room(v_user) then
      raise exception 'The top prize for that bet wouldn''t fit in today''s coin limit.' using errcode = 'P0001', hint = 'slots_limit';
    end if;

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
  end if;

  select coalesce(sum(bet), 0)::integer into v_wagered
    from public.slot_spins
   where user_id = v_user and created_at > now() - interval '24 hours';
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
    'balance', v_balance,
    'wagered', v_wagered,
    'room', public._coin_room(v_user)
  );
end;
$$;
revoke all on function public.spin_slots(uuid, integer) from public, anon;
grant execute on function public.spin_slots(uuid, integer) to authenticated;
