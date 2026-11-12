-- Coin Slots without daily caps: the 24-hour wager limit is gone, and slot results no longer count
-- toward (or are limited by) the 600-coin daily earning limit, which now covers game rewards only.
-- Bets run from 10 to 10,000 coins; a bet still needs the coins in the balance, and the per-minute
-- spin rate limit stays.

-- Coins the account can still earn from game rewards in the rolling 24 hours.
create or replace function public._coin_room(p_user uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(0, 600 - coalesce(sum(amount), 0))::integer
    from public.coin_transactions
   where user_id = p_user and kind = 'reward' and created_at > now() - interval '24 hours';
$$;
revoke all on function public._coin_room(uuid) from public, anon, authenticated;

update public.slot_machines
   set bets = '{10,50,100,250,500,1000,2500,5000,10000}', updated_at = now()
 where id = 'amethyst';

-- The signed-in account's balance (the only thing that limits a bet now).
create or replace function public.slot_status()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  return jsonb_build_object('balance', public._wallet_balance(v_user));
end;
$$;
revoke all on function public.slot_status() from public, anon;
grant execute on function public.slot_status() to authenticated;

-- One spin, all or nothing: checks the bet and balance, draws three reel stops with the database's
-- cryptographically secure generator, pays from the paytable and records it. Repeating a spin id
-- returns the stored result instead of spinning again.
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
revoke all on function public.spin_slots(uuid, integer) from public, anon;
grant execute on function public.spin_slots(uuid, integer) to authenticated;

-- Nothing reads the old wager cap any more.
alter table public.slot_machines drop column daily_wager_limit;
