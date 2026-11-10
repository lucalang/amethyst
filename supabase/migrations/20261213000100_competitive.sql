-- Competitive play: Daily Tournaments and Coin Wagers.
--
-- Both only use games whose finished runs the server checks (_arcade_run_plausible) and that always
-- start fresh: Flutter, Snake, Fruit Slice and Tower Stacker. Scores come from arcade_runs finished
-- through finish_arcade_run; nothing here trusts a client score, winner, stake or balance.
--
-- Locking: wager paths lock the wager row before any wallet. The arcade_runs trigger already holds the
-- player's wallet (run rewards), so it only takes a wager row with SKIP LOCKED; the next state read
-- resolves anything it skipped.

-- ---------------------------------------------------------------------------
-- Configuration (readable by members; the app mirrors labels in src/lib/competitive.ts)
-- ---------------------------------------------------------------------------
create table public.competitive_boards (
  game text not null,
  board text not null,
  -- The one board a game's daily tournament uses.
  tournament boolean not null default false,
  wager boolean not null default true,
  direction text not null default 'high' check (direction in ('high', 'low')),
  primary key (game, board)
);
create unique index competitive_boards_tournament on public.competitive_boards (game) where tournament;

insert into public.competitive_boards (game, board, tournament, wager) values
  ('flutter', '', true, true),
  ('snake', '', true, true),
  ('snake', 'wrap-medium-1', false, true),
  ('snake', 'timed-medium-1', false, true),
  ('fruit-slice', '', true, true),
  ('fruit-slice', 'arcade', false, true),
  ('stacker', 'classic', true, true),
  ('stacker', '', false, true);

create table public.tournament_reward_tiers (
  place_from integer primary key check (place_from >= 1),
  place_to integer not null,
  coins integer not null check (coins >= 0),
  check (place_to >= place_from)
);
create table public.tournament_reward_items (
  place_from integer not null references public.tournament_reward_tiers (place_from) on delete cascade,
  item_id text not null references public.cosmetic_items (id),
  primary key (place_from, item_id)
);

-- One row of wager limits.
create table public.wager_rules (
  id boolean primary key default true check (id),
  min_stake integer not null check (min_stake > 0),
  max_stake integer not null,
  open_hours integer not null check (open_hours > 0),
  round_hours integer not null check (round_hours > 0),
  wins_needed integer not null check (wins_needed > 0),
  max_rounds integer not null,
  max_open integer not null check (max_open > 0),
  max_games integer not null check (max_games between 1 and 5),
  check (max_stake >= min_stake),
  check (max_rounds >= wins_needed * 2 - 1)
);
insert into public.wager_rules (min_stake, max_stake, open_hours, round_hours, wins_needed, max_rounds, max_open, max_games)
values (10, 500, 48, 24, 3, 9, 3, 5);

alter table public.competitive_boards enable row level security;
alter table public.tournament_reward_tiers enable row level security;
alter table public.tournament_reward_items enable row level security;
alter table public.wager_rules enable row level security;
create policy member_read on public.competitive_boards for select to authenticated using (true);
create policy member_read on public.tournament_reward_tiers for select to authenticated using (true);
create policy member_read on public.tournament_reward_items for select to authenticated using (true);
create policy member_read on public.wager_rules for select to authenticated using (true);
revoke all on public.competitive_boards, public.tournament_reward_tiers, public.tournament_reward_items, public.wager_rules
  from public, anon, authenticated;
grant select on public.competitive_boards, public.tournament_reward_tiers, public.tournament_reward_items, public.wager_rules
  to authenticated;
grant all on public.competitive_boards, public.tournament_reward_tiers, public.tournament_reward_items, public.wager_rules
  to service_role;

-- ---------------------------------------------------------------------------
-- Tournament-exclusive flair, ledger kinds
-- ---------------------------------------------------------------------------
alter table public.cosmetic_items drop constraint cosmetic_items_source_check;
alter table public.cosmetic_items add constraint cosmetic_items_source_check
  check (source in ('shop', 'vault', 'achievement', 'case', 'tournament'));

insert into public.cosmetic_items (id, kind, price, available, secret, source, rarity) values
  ('badge-daybreak-cup', 'badge', 0, false, false, 'tournament', 'legendary'),
  ('badge-podium', 'badge', 0, false, false, 'tournament', 'epic'),
  ('title-daily-champion', 'title', 0, false, false, 'tournament', 'legendary')
on conflict (id) do nothing;

insert into public.tournament_reward_tiers (place_from, place_to, coins) values
  (1, 1, 300), (2, 2, 180), (3, 3, 120), (4, 10, 40);
insert into public.tournament_reward_items (place_from, item_id) values
  (1, 'badge-daybreak-cup'), (1, 'title-daily-champion'), (2, 'badge-podium'), (3, 'badge-podium');

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('reward', 'purchase', 'code', 'slots', 'achievement', 'streak', 'refund', 'season', 'tournament', 'wager'));

-- ---------------------------------------------------------------------------
-- Tournaments (one per UTC day; no client table access, only the functions below)
-- ---------------------------------------------------------------------------
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  game text not null,
  board text not null,
  direction text not null check (direction in ('high', 'low')),
  -- Games don't repeat within a rotation.
  rotation integer not null check (rotation > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Reward tiers as they were when the day was scheduled.
  rewards jsonb not null,
  min_players integer not null default 2,
  players integer,
  finalized_at timestamptz,
  check (ends_at > starts_at)
);

create table public.tournament_entries (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  runs integer not null default 0,
  score integer,
  achieved_at timestamptz,
  run_id uuid,
  place integer,
  reward_coins integer not null default 0,
  reward_items text[] not null default '{}',
  claimed_at timestamptz,
  primary key (tournament_id, user_id)
);
create index tournament_entries_user on public.tournament_entries (user_id, joined_at desc);

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
revoke all on public.tournaments, public.tournament_entries from public, anon, authenticated;
grant all on public.tournaments, public.tournament_entries to service_role;

-- ---------------------------------------------------------------------------
-- Wagers (no client table access)
-- ---------------------------------------------------------------------------
create table public.wagers (
  id uuid primary key,
  host_id uuid not null references public.users (id) on delete cascade,
  opponent_id uuid references public.users (id) on delete cascade,
  stake integer not null check (stake > 0),
  -- [{game, board}], played in order and repeated if the match runs longer.
  games jsonb not null check (jsonb_typeof(games) = 'array' and jsonb_array_length(games) between 1 and 5),
  status text not null default 'open'
    check (status in ('open', 'cancelled', 'expired', 'active', 'completed', 'drawn', 'abandoned')),
  wins_needed integer not null,
  max_rounds integer not null,
  round_hours integer not null,
  host_wins integer not null default 0,
  opponent_wins integer not null default 0,
  current_round integer not null default 0,
  winner_id uuid references public.users (id) on delete set null,
  end_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  ended_at timestamptz,
  check (opponent_id is null or opponent_id <> host_id)
);
create index wagers_open on public.wagers (expires_at) where status = 'open';
create index wagers_host on public.wagers (host_id, created_at desc);
create index wagers_opponent on public.wagers (opponent_id, created_at desc);

create table public.wager_rounds (
  wager_id uuid not null references public.wagers (id) on delete cascade,
  round integer not null check (round > 0),
  game text not null,
  board text not null,
  direction text not null check (direction in ('high', 'low')),
  opened_at timestamptz not null default now(),
  deadline timestamptz not null,
  host_score integer,
  opponent_score integer,
  outcome text check (outcome in ('host', 'opponent', 'tie', 'void')),
  reason text,
  resolved_at timestamptz,
  primary key (wager_id, round)
);

create table public.wager_attempts (
  wager_id uuid not null,
  round integer not null,
  user_id uuid not null references public.users (id) on delete cascade,
  run_id uuid unique references public.arcade_runs (id) on delete set null,
  status text not null default 'playing' check (status in ('playing', 'scored', 'invalid', 'late')),
  score integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (wager_id, round, user_id),
  foreign key (wager_id, round) references public.wager_rounds (wager_id, round) on delete cascade
);

alter table public.wagers enable row level security;
alter table public.wager_rounds enable row level security;
alter table public.wager_attempts enable row level security;
revoke all on public.wagers, public.wager_rounds, public.wager_attempts from public, anon, authenticated;
grant all on public.wagers, public.wager_rounds, public.wager_attempts to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- The signed-in member; guest sessions can't compete.
create function public._competitive_user()
returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Create an account to compete.' using errcode = '42501';
  end if;
  return v_user;
end;
$$;
revoke all on function public._competitive_user() from public, anon, authenticated;

-- Credits Coins once per reference. p_returned is the part that gives back the member's own stake
-- (it lowers "spent" instead of raising "earned"). Returns the balance.
create function public._competitive_credit(p_user uuid, p_amount integer, p_returned integer, p_kind text, p_reference text, p_details jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;
  if p_amount <= 0 or exists (select 1 from public.coin_transactions where user_id = p_user and reference = p_reference) then
    return v_balance;
  end if;
  update public.coin_wallets
     set balance = balance + p_amount,
         earned = earned + (p_amount - least(p_returned, p_amount)),
         spent = greatest(spent - least(p_returned, p_amount), 0),
         updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (p_user, p_amount, v_balance, p_kind, p_reference, coalesce(p_details, '{}'::jsonb));
  return v_balance;
end;
$$;
revoke all on function public._competitive_credit(uuid, integer, integer, text, text, jsonb) from public, anon, authenticated;

-- Escrows a stake once per reference; fails without enough Coins. Returns the balance.
create function public._competitive_charge(p_user uuid, p_amount integer, p_reference text, p_details jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;
  if exists (select 1 from public.coin_transactions where user_id = p_user and reference = p_reference) then
    return v_balance;
  end if;
  if v_balance < p_amount then
    raise exception 'Not enough Coins for that stake.' using errcode = 'P0001', hint = 'insufficient_funds';
  end if;
  update public.coin_wallets
     set balance = balance - p_amount, spent = spent + p_amount, updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (p_user, -p_amount, v_balance, 'wager', p_reference, coalesce(p_details, '{}'::jsonb));
  return v_balance;
end;
$$;
revoke all on function public._competitive_charge(uuid, integer, text, jsonb) from public, anon, authenticated;

-- Starts an arcade run on a fixed board with the usual expiry sweep and rate limits.
create function public._competitive_start_run(p_user uuid, p_game text, p_board text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not public._arcade_board_valid(p_game, p_board) then
    raise exception 'Unknown board.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('arcade_runs:' || p_user::text, 0));
  update public.arcade_runs
     set outcome = 'expired', finished_at = now()
   where user_id = p_user and outcome = 'started' and started_at < now() - interval '6 hours';
  if (select count(*) from public.arcade_runs where user_id = p_user and game <> 'sudoku' and started_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.arcade_runs where user_id = p_user and game <> 'sudoku' and started_at > now() - interval '1 hour') >= 300 then
    raise exception 'Lots of runs in a short time. Wait a moment, then try again.' using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public.arcade_runs (user_id, game, board) values (p_user, p_game, p_board) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public._competitive_start_run(uuid, text, text) from public, anon, authenticated;

-- Schedules tournament days up to p_through. Each day takes the next unused game of the rotation in a
-- fixed shuffled order; a new rotation never opens with yesterday's game.
create function public._tournament_ensure(p_through date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'UTC')::date;
  v_last public.tournaments;
  v_day date;
  v_rotation integer;
  v_game text;
  v_board text;
  v_direction text;
  v_rewards jsonb;
begin
  if exists (select 1 from public.tournaments where day = p_through) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('tournaments:schedule', 0));
  select * into v_last from public.tournaments order by day desc limit 1;
  v_day := greatest(coalesce(v_last.day + 1, v_today), v_today);
  select coalesce(jsonb_agg(jsonb_build_object(
           'from', t.place_from, 'to', t.place_to, 'coins', t.coins,
           'items', coalesce((select jsonb_agg(i.item_id order by i.item_id) from public.tournament_reward_items i
                               where i.place_from = t.place_from), '[]'::jsonb)) order by t.place_from), '[]'::jsonb)
    into v_rewards
    from public.tournament_reward_tiers t;

  while v_day <= p_through loop
    v_rotation := coalesce(v_last.rotation, 1);
    v_game := null;
    select b.game into v_game
      from public.competitive_boards b
     where b.tournament
       and not exists (select 1 from public.tournaments x where x.rotation = v_rotation and x.game = b.game)
     order by md5(v_day::text || ':' || b.game)
     limit 1;
    if v_game is null then
      v_rotation := v_rotation + 1;
      select b.game into v_game
        from public.competitive_boards b
       where b.tournament and b.game is distinct from v_last.game
       order by md5(v_day::text || ':' || b.game)
       limit 1;
    end if;
    if v_game is null then
      select b.game into v_game from public.competitive_boards b where b.tournament order by b.game limit 1;
    end if;
    exit when v_game is null;
    select b.board, b.direction into v_board, v_direction from public.competitive_boards b where b.game = v_game and b.tournament;

    insert into public.tournaments (day, game, board, direction, rotation, starts_at, ends_at, rewards)
    values (v_day, v_game, v_board, v_direction, v_rotation,
            v_day::timestamp at time zone 'UTC', (v_day + 1)::timestamp at time zone 'UTC', v_rewards)
    returning * into v_last;
    v_day := v_day + 1;
  end loop;
end;
$$;
revoke all on function public._tournament_ensure(date) from public, anon, authenticated;

-- Fixes final places and rewards once a day has ended (with a short grace for runs finishing at the end).
create function public._tournament_finalize(p_tournament uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  t public.tournaments;
  v_players integer;
begin
  select * into t from public.tournaments where id = p_tournament for update;
  if not found or t.finalized_at is not null or now() < t.ends_at + interval '2 minutes' then
    return;
  end if;
  with ranked as (
    select e.user_id,
           row_number() over (order by case when t.direction = 'high' then -e.score else e.score end, e.achieved_at, e.run_id) as place
      from public.tournament_entries e
     where e.tournament_id = t.id and e.score is not null)
  update public.tournament_entries e set place = ranked.place
    from ranked
   where e.tournament_id = t.id and e.user_id = ranked.user_id;
  select count(*) into v_players from public.tournament_entries where tournament_id = t.id and place is not null;

  if v_players >= t.min_players then
    update public.tournament_entries e
       set reward_coins = (tier ->> 'coins')::integer,
           reward_items = array(select jsonb_array_elements_text(tier -> 'items'))
      from jsonb_array_elements(t.rewards) tier
     where e.tournament_id = t.id
       and e.place between (tier ->> 'from')::integer and (tier ->> 'to')::integer;
  end if;
  update public.tournaments set finalized_at = now(), players = v_players where id = t.id;
end;
$$;
revoke all on function public._tournament_finalize(uuid) from public, anon, authenticated;

-- A tournament as members see it, with its live (or final) top 25 and the caller's entry.
create function public._tournament_json(p_tournament uuid, p_user uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select * from public.tournaments where id = p_tournament),
  ranked as (
    select e.*, coalesce(e.place, row_number() over (
             order by case when t.direction = 'high' then -e.score else e.score end, e.achieved_at, e.run_id))::integer as rank
      from public.tournament_entries e, t
     where e.tournament_id = t.id and e.score is not null)
  select jsonb_build_object(
    'id', t.id, 'day', t.day, 'game', t.game, 'board', t.board, 'direction', t.direction, 'rotation', t.rotation,
    'startsAt', t.starts_at, 'endsAt', t.ends_at, 'rewards', t.rewards, 'minPlayers', t.min_players,
    'status', case when now() < t.starts_at then 'upcoming' when now() < t.ends_at then 'active'
                   when t.finalized_at is null then 'finalizing' else 'final' end,
    'players', coalesce(t.players, (select count(*) from ranked)),
    'entrants', (select count(*) from public.tournament_entries where tournament_id = t.id),
    'leaderboard', coalesce((
      select jsonb_agg(jsonb_build_object('rank', r.rank, 'name', public._arcade_name(r.user_id), 'score', r.score,
               'achievedAt', r.achieved_at, 'you', r.user_id = p_user, 'coins', r.reward_coins, 'items', to_jsonb(r.reward_items))
               order by r.rank)
        from (select * from ranked order by rank limit 25) r), '[]'::jsonb),
    'you', (select jsonb_build_object('joinedAt', e.joined_at, 'runs', e.runs, 'score', e.score, 'achievedAt', e.achieved_at,
                     'rank', (select r.rank from ranked r where r.user_id = e.user_id), 'place', e.place,
                     'coins', e.reward_coins, 'items', to_jsonb(e.reward_items), 'claimedAt', e.claimed_at)
              from public.tournament_entries e where e.tournament_id = t.id and e.user_id = p_user))
  from t;
$$;
revoke all on function public._tournament_json(uuid, uuid) from public, anon, authenticated;

-- Counts a finished run toward the caller's tournament entry when it started after joining and both
-- started and finished inside the day, on the day's game and board. Keeps the best (earliest on ties).
create function public._tournament_record(p_run uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.arcade_runs;
  t public.tournaments;
begin
  select * into r from public.arcade_runs where id = p_run;
  select * into t from public.tournaments
   where game = r.game and board = r.board and starts_at <= r.started_at and r.finished_at < ends_at and finalized_at is null
   for share;
  if not found then
    return;
  end if;
  update public.tournament_entries e
     set runs = e.runs + 1,
         score = case when e.score is null or (case when t.direction = 'high' then r.score > e.score else r.score < e.score end)
                      then r.score else e.score end,
         achieved_at = case when e.score is null or (case when t.direction = 'high' then r.score > e.score else r.score < e.score end)
                            then r.finished_at else e.achieved_at end,
         run_id = case when e.score is null or (case when t.direction = 'high' then r.score > e.score else r.score < e.score end)
                       then r.id else e.run_id end
   where e.tournament_id = t.id and e.user_id = r.user_id and e.joined_at <= r.started_at;
end;
$$;
revoke all on function public._tournament_record(uuid) from public, anon, authenticated;

-- Opens a wager round with its game from the locked rotation.
create function public._wager_open_round(p_wager uuid, p_round integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wagers;
  v_pick jsonb;
begin
  select * into w from public.wagers where id = p_wager;
  v_pick := w.games -> ((p_round - 1) % jsonb_array_length(w.games));
  insert into public.wager_rounds (wager_id, round, game, board, direction, deadline)
  select w.id, p_round, v_pick ->> 'game', v_pick ->> 'board', coalesce(b.direction, 'high'), now() + make_interval(hours => w.round_hours)
    from (select 1) one
    left join public.competitive_boards b on b.game = v_pick ->> 'game' and b.board = v_pick ->> 'board'
  on conflict (wager_id, round) do nothing;
  update public.wagers set current_round = p_round where id = w.id;
end;
$$;
revoke all on function public._wager_open_round(uuid, integer) from public, anon, authenticated;

-- Ends a wager once: the winner takes the whole pot; draws and abandoned matches refund both stakes.
create function public._wager_settle(p_wager uuid, p_status text, p_winner uuid, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wagers;
begin
  select * into w from public.wagers where id = p_wager;
  if w.status not in ('open', 'active') then
    return;
  end if;
  update public.wagers
     set status = p_status, winner_id = p_winner, end_reason = p_reason, ended_at = now()
   where id = w.id;
  if p_status = 'completed' then
    perform public._competitive_credit(p_winner, w.stake * 2, w.stake, 'wager', 'wager:' || w.id::text || ':payout',
      jsonb_build_object('wager', w.id, 'result', 'won'));
  else
    perform public._competitive_credit(w.host_id, w.stake, w.stake, 'wager', 'wager:' || w.id::text || ':refund:host',
      jsonb_build_object('wager', w.id, 'result', p_status));
    if w.opponent_id is not null then
      perform public._competitive_credit(w.opponent_id, w.stake, w.stake, 'wager', 'wager:' || w.id::text || ':refund:opponent',
        jsonb_build_object('wager', w.id, 'result', p_status));
    end if;
  end if;
end;
$$;
revoke all on function public._wager_settle(uuid, text, uuid, text) from public, anon, authenticated;

-- Brings a wager up to date: expires open challenges, resolves rounds that both players finished or
-- whose deadline passed, opens the next round, and settles the match. p_wait = false skips a wager that
-- another transaction holds.
create function public._wager_tick(p_wager uuid, p_wait boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wagers;
  rd public.wager_rounds;
  ah public.wager_attempts;
  ao public.wager_attempts;
  v_hs integer;
  v_os integer;
  v_outcome text;
  v_reason text;
  v_prev text;
begin
  if p_wait then
    select * into w from public.wagers where id = p_wager for update;
  else
    select * into w from public.wagers where id = p_wager for update skip locked;
  end if;
  if not found then
    return;
  end if;
  if w.status = 'open' and now() >= w.expires_at then
    perform public._wager_settle(w.id, 'expired', null, 'expired');
    return;
  end if;

  while w.status = 'active' loop
    select * into rd from public.wager_rounds where wager_id = w.id and round = w.current_round;
    exit when not found or rd.resolved_at is not null;
    ah := null;
    ao := null;
    select * into ah from public.wager_attempts where wager_id = w.id and round = rd.round and user_id = w.host_id;
    select * into ao from public.wager_attempts where wager_id = w.id and round = rd.round and user_id = w.opponent_id;
    exit when now() < rd.deadline
          and not (coalesce(ah.status, 'none') in ('scored', 'invalid', 'late') and coalesce(ao.status, 'none') in ('scored', 'invalid', 'late'));

    v_hs := case when ah.status = 'scored' then ah.score end;
    v_os := case when ao.status = 'scored' then ao.score end;
    if v_hs is not null and v_os is not null then
      if v_hs = v_os then
        v_outcome := 'tie';
      elsif (case when rd.direction = 'high' then v_hs > v_os else v_hs < v_os end) then
        v_outcome := 'host';
      else
        v_outcome := 'opponent';
      end if;
      v_reason := case when v_outcome = 'tie' then 'tie' else 'score' end;
    elsif v_hs is not null then
      v_outcome := 'host';
      v_reason := 'forfeit';
    elsif v_os is not null then
      v_outcome := 'opponent';
      v_reason := 'forfeit';
    else
      v_outcome := 'void';
      v_reason := 'no_results';
    end if;

    update public.wager_rounds
       set host_score = v_hs, opponent_score = v_os, outcome = v_outcome, reason = v_reason, resolved_at = now()
     where wager_id = w.id and round = rd.round;
    update public.wagers
       set host_wins = host_wins + (v_outcome = 'host')::integer,
           opponent_wins = opponent_wins + (v_outcome = 'opponent')::integer
     where id = w.id
    returning * into w;

    select outcome into v_prev from public.wager_rounds where wager_id = w.id and round = rd.round - 1;
    if w.host_wins >= w.wins_needed then
      perform public._wager_settle(w.id, 'completed', w.host_id, 'wins');
    elsif w.opponent_wins >= w.wins_needed then
      perform public._wager_settle(w.id, 'completed', w.opponent_id, 'wins');
    elsif v_outcome = 'void' and v_prev = 'void' then
      perform public._wager_settle(w.id, 'abandoned', null, 'no_results');
    elsif rd.round >= w.max_rounds then
      if w.host_wins > w.opponent_wins then
        perform public._wager_settle(w.id, 'completed', w.host_id, 'round_limit');
      elsif w.opponent_wins > w.host_wins then
        perform public._wager_settle(w.id, 'completed', w.opponent_id, 'round_limit');
      else
        perform public._wager_settle(w.id, 'drawn', null, 'round_limit');
      end if;
    else
      perform public._wager_open_round(w.id, rd.round + 1);
    end if;
    select * into w from public.wagers where id = w.id;
  end loop;
end;
$$;
revoke all on function public._wager_tick(uuid, boolean) from public, anon, authenticated;

-- Brings a few overdue wagers up to date (expired challenges, rounds past their deadline).
create function public._wager_sweep()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in
    select w.id from public.wagers w
     where (w.status = 'open' and w.expires_at <= now())
        or (w.status = 'active' and exists (
              select 1 from public.wager_rounds r
               where r.wager_id = w.id and r.round = w.current_round and r.resolved_at is null and r.deadline <= now()))
     order by w.created_at
     limit 25
  loop
    perform public._wager_tick(v_id, false);
  end loop;
end;
$$;
revoke all on function public._wager_sweep() from public, anon, authenticated;

-- A wager as the caller may see it. The other player's score in an unresolved round stays hidden.
create function public._wager_json(p_wager uuid, p_user uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', w.id, 'status', w.status, 'stake', w.stake, 'pot', w.stake * 2, 'games', w.games,
    'you', case when w.host_id = p_user then 'host' when w.opponent_id = p_user then 'opponent' end,
    'host', jsonb_build_object('name', public._arcade_name(w.host_id)),
    'opponent', case when w.opponent_id is not null then jsonb_build_object('name', public._arcade_name(w.opponent_id)) end,
    'hostWins', w.host_wins, 'opponentWins', w.opponent_wins, 'winsNeeded', w.wins_needed, 'maxRounds', w.max_rounds,
    'roundHours', w.round_hours, 'currentRound', w.current_round,
    'winner', case when w.winner_id is null then null when w.winner_id = w.host_id then 'host' else 'opponent' end,
    'endReason', w.end_reason, 'createdAt', w.created_at, 'expiresAt', w.expires_at, 'acceptedAt', w.accepted_at, 'endedAt', w.ended_at,
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'round', r.round, 'game', r.game, 'board', r.board, 'direction', r.direction,
               'openedAt', r.opened_at, 'deadline', r.deadline, 'outcome', r.outcome, 'reason', r.reason,
               'hostScore', case when r.resolved_at is not null then r.host_score when w.host_id = p_user then ah.score end,
               'opponentScore', case when r.resolved_at is not null then r.opponent_score when w.opponent_id = p_user then ao.score end,
               'hostState', case when ah.status is null then 'waiting' when ah.status = 'playing' then 'playing' else 'done' end,
               'opponentState', case when ao.status is null then 'waiting' when ao.status = 'playing' then 'playing' else 'done' end,
               'yourAttempt', case when w.host_id = p_user then ah.status when w.opponent_id = p_user then ao.status end)
               order by r.round)
        from public.wager_rounds r
        left join public.wager_attempts ah on ah.wager_id = r.wager_id and ah.round = r.round and ah.user_id = w.host_id
        left join public.wager_attempts ao on ao.wager_id = r.wager_id and ao.round = r.round and ao.user_id = w.opponent_id
       where r.wager_id = w.id), '[]'::jsonb))
  from public.wagers w where w.id = p_wager;
$$;
revoke all on function public._wager_json(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Run results feed both systems
-- ---------------------------------------------------------------------------
create function public._competitive_run_finished()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.wager_attempts;
  rd public.wager_rounds;
begin
  if old.outcome <> 'started' or new.outcome = 'started' then
    return null;
  end if;

  select * into a from public.wager_attempts where run_id = new.id;
  if found then
    select * into rd from public.wager_rounds where wager_id = a.wager_id and round = a.round;
    update public.wager_attempts
       set finished_at = new.finished_at,
           score = case when new.outcome in ('paid', 'unpaid') then new.score end,
           status = case when new.outcome not in ('paid', 'unpaid') then 'invalid'
                         when rd.resolved_at is not null or new.finished_at > rd.deadline then 'late'
                         else 'scored' end
     where wager_id = a.wager_id and round = a.round and user_id = a.user_id and status = 'playing';
    perform public._wager_tick(a.wager_id, false);
  end if;

  if new.outcome in ('paid', 'unpaid') and new.board is not null and coalesce(new.score, 0) > 0 then
    perform public._tournament_record(new.id);
  end if;
  return null;
end;
$$;
revoke all on function public._competitive_run_finished() from public, anon, authenticated;

create trigger arcade_runs_competitive after update of outcome on public.arcade_runs
  for each row execute function public._competitive_run_finished();

-- ---------------------------------------------------------------------------
-- Client functions: tournaments
-- ---------------------------------------------------------------------------

-- The schedule (last week to next week), one day's tournament, the caller's history and unclaimed rewards.
create function public.tournament_state(p_day date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  v_today date := (now() at time zone 'UTC')::date;
  v_id uuid;
begin
  perform public._tournament_ensure(v_today + 6);
  for v_id in
    select id from public.tournaments where finalized_at is null and ends_at + interval '2 minutes' <= now() order by day limit 10
  loop
    perform public._tournament_finalize(v_id);
  end loop;
  select id into v_id from public.tournaments where day = coalesce(p_day, v_today) and day <= v_today + 6;

  return jsonb_build_object(
    'now', now(),
    'today', v_today,
    'balance', public._wallet_balance(v_user),
    'schedule', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'day', t.day, 'game', t.game, 'board', t.board,
               'startsAt', t.starts_at, 'endsAt', t.ends_at,
               'status', case when now() < t.starts_at then 'upcoming' when now() < t.ends_at then 'active'
                              when t.finalized_at is null then 'finalizing' else 'final' end) order by t.day)
        from public.tournaments t where t.day between v_today - 6 and v_today + 6), '[]'::jsonb),
    'tournament', case when v_id is not null then public._tournament_json(v_id, v_user) end,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'day', t.day, 'game', t.game, 'score', e.score, 'place', e.place,
               'coins', e.reward_coins, 'items', to_jsonb(e.reward_items), 'claimedAt', e.claimed_at,
               'final', t.finalized_at is not null) order by t.day desc)
        from (select * from public.tournament_entries where user_id = v_user order by joined_at desc limit 20) e
        join public.tournaments t on t.id = e.tournament_id), '[]'::jsonb),
    'claimable', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'day', t.day, 'game', t.game, 'place', e.place,
               'coins', e.reward_coins, 'items', to_jsonb(e.reward_items)) order by t.day desc)
        from public.tournament_entries e join public.tournaments t on t.id = e.tournament_id
       where e.user_id = v_user and t.finalized_at is not null and e.claimed_at is null
         and (e.reward_coins > 0 or cardinality(e.reward_items) > 0)), '[]'::jsonb));
end;
$$;
revoke all on function public.tournament_state(date) from public, anon;
grant execute on function public.tournament_state(date) to authenticated;

-- Joins today's tournament (free). Repeating it is a no-op.
create function public.join_tournament(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'That tournament was not found.' using errcode = 'P0002', hint = 'tournament_not_found';
  end if;
  if now() < t.starts_at or now() >= t.ends_at then
    raise exception 'This tournament isn''t running right now.' using errcode = 'P0001', hint = 'tournament_closed';
  end if;
  insert into public.tournament_entries (tournament_id, user_id) values (t.id, v_user) on conflict do nothing;
  return public._tournament_json(t.id, v_user);
end;
$$;
revoke all on function public.join_tournament(uuid) from public, anon;
grant execute on function public.join_tournament(uuid) to authenticated;

-- Joins (if needed) and starts a run on the tournament's own game and board.
create function public.start_tournament_run(p_tournament uuid, p_game text, p_board text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  t public.tournaments;
begin
  select * into t from public.tournaments where id = p_tournament;
  if not found then
    raise exception 'That tournament was not found.' using errcode = 'P0002', hint = 'tournament_not_found';
  end if;
  if now() < t.starts_at or now() >= t.ends_at then
    raise exception 'This tournament isn''t running right now.' using errcode = 'P0001', hint = 'tournament_closed';
  end if;
  if p_game is distinct from t.game or p_board is distinct from t.board then
    raise exception 'That isn''t this tournament''s game.' using errcode = '22023';
  end if;
  insert into public.tournament_entries (tournament_id, user_id) values (t.id, v_user) on conflict do nothing;
  return public._competitive_start_run(v_user, t.game, t.board);
end;
$$;
revoke all on function public.start_tournament_run(uuid, text, text) from public, anon;
grant execute on function public.start_tournament_run(uuid, text, text) to authenticated;

-- Claims a final placement's Coins and items once.
create function public.claim_tournament_reward(p_tournament uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  e public.tournament_entries;
  v_balance integer;
begin
  perform public._tournament_finalize(p_tournament);
  select * into e from public.tournament_entries where tournament_id = p_tournament and user_id = v_user for update;
  if not found or e.place is null or (e.reward_coins = 0 and cardinality(e.reward_items) = 0) then
    raise exception 'There''s no reward to claim here.' using errcode = 'P0001', hint = 'nothing_to_claim';
  end if;
  if e.claimed_at is not null then
    return jsonb_build_object('status', 'repeat', 'coins', e.reward_coins, 'items', to_jsonb(e.reward_items),
      'balance', public._wallet_balance(v_user));
  end if;
  update public.tournament_entries set claimed_at = now() where tournament_id = e.tournament_id and user_id = v_user;
  insert into public.user_cosmetics (user_id, item_id)
  select v_user, unnest(e.reward_items) on conflict (user_id, item_id) do nothing;
  v_balance := public._competitive_credit(v_user, e.reward_coins, 0, 'tournament', 'tournament:' || e.tournament_id::text,
    jsonb_build_object('tournament', e.tournament_id, 'place', e.place));
  return jsonb_build_object('status', 'claimed', 'coins', e.reward_coins, 'items', to_jsonb(e.reward_items),
    'balance', coalesce(v_balance, public._wallet_balance(v_user)));
end;
$$;
revoke all on function public.claim_tournament_reward(uuid) from public, anon;
grant execute on function public.claim_tournament_reward(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Client functions: wagers
-- ---------------------------------------------------------------------------

-- Open challenges from others and the caller's own wagers.
create function public.wager_list()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
begin
  perform public._wager_sweep();
  return jsonb_build_object(
    'now', now(),
    'balance', public._wallet_balance(v_user),
    'rules', (select jsonb_build_object('minStake', min_stake, 'maxStake', max_stake, 'openHours', open_hours,
                       'roundHours', round_hours, 'winsNeeded', wins_needed, 'maxRounds', max_rounds,
                       'maxOpen', max_open, 'maxGames', max_games) from public.wager_rules),
    'open', coalesce((
      select jsonb_agg(public._wager_json(w.id, v_user) order by w.created_at desc)
        from (select id, created_at from public.wagers
               where status = 'open' and expires_at > now() and host_id <> v_user
               order by created_at desc limit 30) w), '[]'::jsonb),
    'mine', coalesce((
      select jsonb_agg(public._wager_json(w.id, v_user) order by w.active desc, w.created_at desc)
        from (select id, created_at, status in ('open', 'active') as active from public.wagers
               where host_id = v_user or opponent_id = v_user
               order by status in ('open', 'active') desc, created_at desc limit 30) w), '[]'::jsonb));
end;
$$;
revoke all on function public.wager_list() from public, anon;
grant execute on function public.wager_list() to authenticated;

-- Opens a challenge and escrows the host's stake. p_request makes retries safe (it becomes the id).
create function public.create_wager(p_request uuid, p_stake integer, p_games jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  cfg public.wager_rules;
  w public.wagers;
  v_games jsonb;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('wagers:' || v_user::text, 0));
  select * into w from public.wagers where id = p_request;
  if found then
    if w.host_id <> v_user then
      raise exception 'Try again.' using errcode = '22023';
    end if;
    return public._wager_json(w.id, v_user);
  end if;

  select * into cfg from public.wager_rules;
  if p_stake is null or p_stake < cfg.min_stake or p_stake > cfg.max_stake then
    raise exception 'Stakes run from % to % Coins.', cfg.min_stake, cfg.max_stake using errcode = '22023';
  end if;
  if jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games) < 1 or jsonb_array_length(p_games) > cfg.max_games then
    raise exception 'Pick 1 to % games.', cfg.max_games using errcode = '22023';
  end if;
  select jsonb_agg(jsonb_build_object('game', b.game, 'board', b.board) order by g.n), count(b.game)
    into v_games, v_count
    from jsonb_array_elements(p_games) with ordinality g(item, n)
    join public.competitive_boards b on b.wager and b.game = g.item ->> 'game' and b.board = g.item ->> 'board';
  if v_count <> jsonb_array_length(p_games)
     or (select count(distinct (e ->> 'game') || ':' || (e ->> 'board')) from jsonb_array_elements(v_games) e) <> v_count then
    raise exception 'One of those games or settings can''t be used in a wager.' using errcode = '22023';
  end if;
  if (select count(*) from public.wagers where host_id = v_user and status = 'open' and expires_at > now()) >= cfg.max_open then
    raise exception 'You already have % open challenges. Cancel one or wait for a taker.', cfg.max_open
      using errcode = 'P0001', hint = 'wager_limit';
  end if;

  insert into public.wagers (id, host_id, stake, games, wins_needed, max_rounds, round_hours, expires_at)
  values (p_request, v_user, p_stake, v_games, cfg.wins_needed, cfg.max_rounds, cfg.round_hours,
          now() + make_interval(hours => cfg.open_hours));
  perform public._competitive_charge(v_user, p_stake, 'wager:' || p_request::text || ':stake:host',
    jsonb_build_object('wager', p_request, 'role', 'host'));
  return public._wager_json(p_request, v_user);
end;
$$;
revoke all on function public.create_wager(uuid, integer, jsonb) from public, anon;
grant execute on function public.create_wager(uuid, integer, jsonb) to authenticated;

-- Accepts someone else's open challenge at the stake the caller saw, escrowing it; round 1 opens.
create function public.accept_wager(p_wager uuid, p_expected_stake integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  w public.wagers;
begin
  perform public._wager_tick(p_wager, true);
  select * into w from public.wagers where id = p_wager for update;
  if not found then
    raise exception 'That challenge was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  if w.opponent_id = v_user then
    return public._wager_json(w.id, v_user);
  end if;
  if w.host_id = v_user then
    raise exception 'You can''t accept your own challenge.' using errcode = 'P0001', hint = 'own_wager';
  end if;
  if w.status <> 'open' then
    raise exception 'This challenge is no longer open.' using errcode = 'P0001', hint = 'wager_closed';
  end if;
  if w.stake <> p_expected_stake then
    raise exception 'The stake changed. Check it again.' using errcode = 'P0001', hint = 'price_changed';
  end if;
  perform public._competitive_charge(v_user, w.stake, 'wager:' || w.id::text || ':stake:opponent',
    jsonb_build_object('wager', w.id, 'role', 'opponent'));
  update public.wagers set opponent_id = v_user, status = 'active', accepted_at = now() where id = w.id;
  perform public._wager_open_round(w.id, 1);
  return public._wager_json(w.id, v_user);
end;
$$;
revoke all on function public.accept_wager(uuid, integer) from public, anon;
grant execute on function public.accept_wager(uuid, integer) to authenticated;

-- The host withdraws an open challenge and gets the stake back. Accepted matches can't be cancelled.
create function public.cancel_wager(p_wager uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  w public.wagers;
begin
  perform public._wager_tick(p_wager, true);
  select * into w from public.wagers where id = p_wager and host_id = v_user for update;
  if not found then
    raise exception 'That challenge was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  if w.status in ('cancelled', 'expired') then
    return public._wager_json(w.id, v_user);
  end if;
  if w.status <> 'open' then
    raise exception 'An accepted match can''t be cancelled.' using errcode = 'P0001', hint = 'wager_locked';
  end if;
  perform public._wager_settle(w.id, 'cancelled', null, 'cancelled');
  return public._wager_json(w.id, v_user);
end;
$$;
revoke all on function public.cancel_wager(uuid) from public, anon;
grant execute on function public.cancel_wager(uuid) to authenticated;

-- A wager for its players, or an open challenge for anyone signed in.
create function public.wager_state(p_wager uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  w public.wagers;
begin
  perform public._wager_tick(p_wager, true);
  select * into w from public.wagers where id = p_wager;
  if not found or (w.status <> 'open' and v_user is distinct from w.host_id and v_user is distinct from w.opponent_id) then
    raise exception 'That challenge was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  return public._wager_json(w.id, v_user) || jsonb_build_object('now', now(), 'balance', public._wallet_balance(v_user));
end;
$$;
revoke all on function public.wager_state(uuid) from public, anon;
grant execute on function public.wager_state(uuid) to authenticated;

-- Starts the caller's single attempt at the current round, on the round's locked game and board.
create function public.start_wager_attempt(p_wager uuid, p_round integer, p_game text, p_board text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  w public.wagers;
  rd public.wager_rounds;
  v_run uuid;
begin
  perform public._wager_tick(p_wager, true);
  select * into w from public.wagers where id = p_wager and v_user in (host_id, opponent_id) for update;
  if not found then
    raise exception 'That match was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  if w.status <> 'active' or w.current_round <> p_round then
    raise exception 'This round is already over.' using errcode = 'P0001', hint = 'wager_round_closed';
  end if;
  select * into rd from public.wager_rounds where wager_id = w.id and round = w.current_round;
  if p_game is distinct from rd.game or p_board is distinct from rd.board then
    raise exception 'That isn''t this round''s game.' using errcode = '22023';
  end if;
  if exists (select 1 from public.wager_attempts where wager_id = w.id and round = rd.round and user_id = v_user) then
    raise exception 'You''ve already played this round.' using errcode = 'P0001', hint = 'wager_attempt_used';
  end if;
  v_run := public._competitive_start_run(v_user, rd.game, rd.board);
  insert into public.wager_attempts (wager_id, round, user_id, run_id) values (w.id, rd.round, v_user, v_run);
  return v_run;
end;
$$;
revoke all on function public.start_wager_attempt(uuid, integer, text, text) from public, anon;
grant execute on function public.start_wager_attempt(uuid, integer, text, text) to authenticated;
