-- Daily play streaks per minigame (UTC days), with a paid one-day recovery.
--
-- * arcade_play_days: one row per player, game and UTC date. Written only by triggers (a run starting, or a
--   Sudoku save that changes the board) and by recover_arcade_streak; clients can only read their own rows.
-- * A recovery fills exactly yesterday, only after playing today, only when the day before yesterday was played.
--   The debit is a 'streak' ledger row (reference streak:<game>:<date>), so it is unique and auditable.
-- * No coins are paid for streaks; earning limits (_coin_room/_credit_coins) ignore 'streak' rows.

alter table public.coin_transactions drop constraint if exists coin_transactions_kind_check;
alter table public.coin_transactions
  add constraint coin_transactions_kind_check
  check (kind in ('reward', 'purchase', 'code', 'slots', 'achievement', 'streak'));

create table public.arcade_play_days (
  user_id uuid not null references public.users (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9-]{1,24}$'),
  play_date date not null,
  source text not null check (source in ('play', 'recovery')),
  created_at timestamptz not null default now(),
  primary key (user_id, game, play_date)
);

alter table public.arcade_play_days enable row level security;
create policy owner_read on public.arcade_play_days for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.arcade_play_days from public, anon, authenticated;
grant select on public.arcade_play_days to authenticated;
grant all on public.arcade_play_days to service_role;

create table public.arcade_streak_recoveries (
  user_id uuid not null references public.users (id) on delete cascade,
  game text not null check (game ~ '^[a-z0-9-]{1,24}$'),
  missed_date date not null,
  restored_streak integer not null check (restored_streak > 0),
  cost integer not null check (cost > 0),
  transaction_id bigint not null references public.coin_transactions (id),
  created_at timestamptz not null default now(),
  primary key (user_id, game, missed_date)
);

alter table public.arcade_streak_recoveries enable row level security;
create policy owner_read on public.arcade_streak_recoveries for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.arcade_streak_recoveries from public, anon, authenticated;
grant select on public.arcade_streak_recoveries to authenticated;
grant all on public.arcade_streak_recoveries to service_role;

-- ---------------------------------------------------------------------------
-- Helpers (not callable by clients)
-- ---------------------------------------------------------------------------
create function public._arcade_utc_today()
returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'utc')::date;
$$;
revoke all on function public._arcade_utc_today() from public, anon, authenticated;

-- A game exists when it has reward rules (the same registry start_arcade_run checks).
create function public._arcade_game_known(p_game text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.arcade_reward_rules where game = p_game);
$$;
revoke all on function public._arcade_game_known(text) from public, anon, authenticated;

create function public._record_arcade_play(p_user uuid, p_game text)
returns void
language sql security definer set search_path = '' as $$
  insert into public.arcade_play_days (user_id, game, play_date, source)
  values (p_user, p_game, public._arcade_utc_today(), 'play')
  on conflict (user_id, game, play_date) do nothing;
$$;
revoke all on function public._record_arcade_play(uuid, text) from public, anon, authenticated;

-- Consecutive days played up to and including p_end (0 when p_end wasn't played).
create function public._arcade_streak_ending(p_user uuid, p_game text, p_end date)
returns integer
language sql stable security definer set search_path = '' as $$
  with recursive chain(d) as (
    select p_end where exists (select 1 from public.arcade_play_days where user_id = p_user and game = p_game and play_date = p_end)
    union all
    select c.d - 1 from chain c
     where exists (select 1 from public.arcade_play_days where user_id = p_user and game = p_game and play_date = c.d - 1)
  )
  select count(*)::integer from chain;
$$;
revoke all on function public._arcade_streak_ending(uuid, text, date) from public, anon, authenticated;

-- Recovery price: 25 coins + 5 per day of the streak being restored, capped at 300.
create function public._arcade_recovery_cost(p_streak integer)
returns integer
language sql immutable set search_path = '' as $$
  select least(300, 25 + 5 * greatest(p_streak, 1));
$$;
revoke all on function public._arcade_recovery_cost(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Activity sources
-- ---------------------------------------------------------------------------

-- A score-game run counts when start_arcade_run inserts it (Sudoku rows here are completion receipts).
create function public.arcade_runs_play_day()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.game <> 'sudoku' then
    perform public._record_arcade_play(new.user_id, new.game);
  end if;
  return new;
end;
$$;
revoke all on function public.arcade_runs_play_day() from public, anon, authenticated;
create trigger arcade_runs_play_day after insert on public.arcade_runs
  for each row execute function public.arcade_runs_play_day();

-- Sudoku counts when a save changes the board or notes of an unfinished puzzle (not when a puzzle is created).
create function public.sudoku_games_play_day()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.id = old.id and old.completed_at is null
     and (new.entries is distinct from old.entries or new.notes is distinct from old.notes) then
    perform public._record_arcade_play(new.user_id, 'sudoku');
  end if;
  return new;
end;
$$;
revoke all on function public.sudoku_games_play_day() from public, anon, authenticated;
create trigger sudoku_games_play_day after update of entries, notes on public.sudoku_games
  for each row execute function public.sudoku_games_play_day();

-- Exact start dates of earlier score-game runs and Sudoku completions (incomplete history only shortens streaks).
insert into public.arcade_play_days (user_id, game, play_date, source)
select distinct user_id, game,
       case when game = 'sudoku' then (finished_at at time zone 'utc')::date else (started_at at time zone 'utc')::date end,
       'play'
  from public.arcade_runs
 where game ~ '^[a-z0-9-]{1,24}$' and (game <> 'sudoku' or finished_at is not null)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Reading streaks
-- ---------------------------------------------------------------------------

-- One row per game the caller has played: current/best streak, today's play and any recovery offer.
-- recover_ready: today was played, so recover_arcade_streak(game, recover_cost) can fill recover_date.
create function public.arcade_streaks()
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
         s.before_gap is not null and not s.played_yesterday and s.played_today
    from summary s;
$$;
revoke all on function public.arcade_streaks() from public, anon;
grant execute on function public.arcade_streaks() to authenticated;

-- ---------------------------------------------------------------------------
-- Recovery
-- ---------------------------------------------------------------------------

-- Fills yesterday for one game at the price the player saw. Repeating it returns status 'already' without charging.
create function public.recover_arcade_streak(p_game text, p_expected_cost integer)
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
      'streak', public._arcade_streak_ending(v_user, p_game, v_today));
  end if;
  if not exists (select 1 from public.arcade_play_days where user_id = v_user and game = p_game and play_date = v_today and source = 'play') then
    raise exception 'Play this game today first, then recover yesterday.' using errcode = 'P0001', hint = 'streak_not_recoverable';
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

  return jsonb_build_object('status', 'recovered', 'balance', v_balance, 'cost', v_cost,
    'streak', public._arcade_streak_ending(v_user, p_game, v_today));
end;
$$;
revoke all on function public.recover_arcade_streak(text, integer) from public, anon;
grant execute on function public.recover_arcade_streak(text, integer) to authenticated;
