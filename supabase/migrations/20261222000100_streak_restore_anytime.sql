-- Streak recovery no longer requires playing the game first: a streak that missed only yesterday can be
-- restored at any time today. Everything else is unchanged (one day back, once, at the shown price, paid in
-- Coins through the 'streak' ledger row). After a restore the streak is alive through yesterday, so playing
-- today still extends it as usual.

-- recover_ready now simply mirrors whether a recovery is offered (kept for older clients).
create or replace function public.arcade_streaks()
returns table (
  game text,
  current_streak integer,
  best_streak integer,
  played_today boolean,
  last_played date,
  recover_date date,
  recover_streak integer,
  recover_cost integer,
  recover_ready boolean
)
language sql stable security definer set search_path = '' as $$
  with today as (select public._arcade_utc_today() as d),
  days as (
    select p.game, p.play_date from public.arcade_play_days p where p.user_id = auth.uid()
  ),
  islands as (
    select game, play_date, play_date - (row_number() over (partition by game order by play_date))::integer as grp from days
  ),
  runs as (
    select game, min(play_date) as first_day, max(play_date) as last_day, count(*)::integer as len from islands group by game, grp
  ),
  summary as (
    select r.game,
           coalesce(max(r.len) filter (where r.last_day >= t.d - 1), 0) as current_streak,
           max(r.len) as best_streak,
           coalesce(bool_or(r.last_day = t.d), false) as played_today,
           max(r.last_day) as last_played,
           max(r.len) filter (where r.last_day = t.d - 2) as before_gap,
           coalesce(bool_or(r.last_day = t.d - 1), false) as played_yesterday,
           t.d
      from runs r cross join today t
     group by r.game, t.d
  )
  select s.game, s.current_streak, s.best_streak, s.played_today, s.last_played,
         case when s.before_gap is not null and not s.played_yesterday then s.d - 1 end,
         case when s.before_gap is not null and not s.played_yesterday then s.before_gap end,
         case when s.before_gap is not null and not s.played_yesterday then public._arcade_recovery_cost(s.before_gap) end,
         s.before_gap is not null and not s.played_yesterday
    from summary s;
$$;
revoke all on function public.arcade_streaks() from public, anon;
grant execute on function public.arcade_streaks() to authenticated;

-- Fills yesterday for one game at the price the player saw. Repeating it returns status 'already' without charging.
create or replace function public.recover_arcade_streak(p_game text, p_expected_cost integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := public._arcade_utc_today();
  v_missed date := v_today - 1;
  v_restored integer;
  v_cost integer;
  v_balance integer;
  v_tx bigint;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_game is null or not public._arcade_game_known(p_game) then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  -- The wallet lock serializes every spend and recovery for this player.
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;

  if exists (select 1 from public.arcade_streak_recoveries where user_id = v_user and game = p_game and missed_date = v_missed) then
    return jsonb_build_object('status', 'already', 'balance', v_balance, 'cost', 0,
      'streak', greatest(public._arcade_streak_ending(v_user, p_game, v_today), public._arcade_streak_ending(v_user, p_game, v_missed)));
  end if;
  if exists (select 1 from public.arcade_play_days where user_id = v_user and game = p_game and play_date = v_missed) then
    raise exception 'Yesterday already counts for this streak.' using errcode = 'P0001', hint = 'streak_not_recoverable';
  end if;
  v_restored := public._arcade_streak_ending(v_user, p_game, v_today - 2);
  if v_restored = 0 then
    raise exception 'Only a streak that missed just yesterday can be recovered.' using errcode = 'P0001', hint = 'streak_not_recoverable';
  end if;

  v_cost := public._arcade_recovery_cost(v_restored);
  if p_expected_cost is distinct from v_cost then
    raise exception 'The recovery price changed. Check the new price and try again.' using errcode = 'P0001', hint = 'price_changed';
  end if;
  if v_balance < v_cost then
    raise exception 'Not enough coins to recover this streak.' using errcode = 'P0001', hint = 'insufficient_funds';
  end if;

  update public.coin_wallets
     set balance = balance - v_cost, spent = spent + v_cost, updated_at = now()
   where user_id = v_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (v_user, -v_cost, v_balance, 'streak', 'streak:' || p_game || ':' || v_missed::text,
    jsonb_build_object('game', p_game, 'missedDate', v_missed, 'restoredStreak', v_restored, 'cost', v_cost))
  returning id into v_tx;
  insert into public.arcade_play_days (user_id, game, play_date, source) values (v_user, p_game, v_missed, 'recovery');
  insert into public.arcade_streak_recoveries (user_id, game, missed_date, restored_streak, cost, transaction_id)
  values (v_user, p_game, v_missed, v_restored, v_cost, v_tx);

  -- Today counts too when it was already played; otherwise the streak runs through yesterday.
  return jsonb_build_object('status', 'recovered', 'balance', v_balance, 'cost', v_cost,
    'streak', greatest(public._arcade_streak_ending(v_user, p_game, v_today), public._arcade_streak_ending(v_user, p_game, v_missed)));
end;
$$;
revoke all on function public.recover_arcade_streak(text, integer) from public, anon;
grant execute on function public.recover_arcade_streak(text, integer) to authenticated;
