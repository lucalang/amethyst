-- Wagers: stakes up to 10,000,000 Coins, every minigame with its own settings, and Sudoku rounds.
begin;

update public.wager_rules set max_stake = 10000000;

-- The score direction for a board a wager may use, or null when it can't be used. Daily boards and
-- Snake's endless Peace mode are out; Sudoku boards are size/difficulty and the faster time wins.
create function public._wager_board_direction(p_game text, p_board text)
returns text
language plpgsql stable set search_path = '' as $$
begin
  if p_game is null or p_board is null or p_board like 'daily-%' then
    return null;
  end if;
  if p_game = 'sudoku' then
    return case when p_board ~ '^((mini|xxl)-)?(easy|medium|hard)$' then 'low' end;
  end if;
  if p_game = 'snake' and p_board like 'peace-%' then
    return null;
  end if;
  return case when public._arcade_board_valid(p_game, p_board) then 'high' end;
end;
$$;
revoke all on function public._wager_board_direction(text, text) from public, anon, authenticated;

-- Sudoku runs carry their difficulty as the reward variant.
create or replace function public._competitive_start_run(p_user uuid, p_game text, p_board text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not (public._arcade_board_valid(p_game, p_board) or public._wager_board_direction(p_game, p_board) is not null) then
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
  insert into public.arcade_runs (user_id, game, variant, board)
  values (p_user, p_game, case when p_game = 'sudoku' then regexp_replace(p_board, '^(mini|xxl)-', '') else '' end, p_board)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public._wager_open_round(p_wager uuid, p_round integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wagers;
  v_pick jsonb;
begin
  select * into w from public.wagers where id = p_wager;
  v_pick := w.games -> ((p_round - 1) % jsonb_array_length(w.games));
  insert into public.wager_rounds (wager_id, round, game, board, direction, deadline)
  values (w.id, p_round, v_pick ->> 'game', v_pick ->> 'board',
          coalesce(public._wager_board_direction(v_pick ->> 'game', v_pick ->> 'board'), 'high'),
          now() + make_interval(hours => w.round_hours))
  on conflict (wager_id, round) do nothing;
  update public.wagers set current_round = p_round where id = w.id;
end;
$$;

create or replace function public.create_wager(p_request uuid, p_stake integer, p_games jsonb)
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
  select jsonb_agg(jsonb_build_object('game', g.item ->> 'game', 'board', g.item ->> 'board') order by g.n),
         count(*) filter (where jsonb_typeof(g.item) = 'object'
                            and public._wager_board_direction(g.item ->> 'game', g.item ->> 'board') is not null)
    into v_games, v_count
    from jsonb_array_elements(p_games) with ordinality g(item, n);
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

-- ---------------------------------------------------------------------------
-- Sudoku rounds: both players solve the same stored puzzle in a 'wager' slot
-- ---------------------------------------------------------------------------
alter table public.sudoku_games drop constraint sudoku_games_slot_check;
alter table public.sudoku_games add constraint sudoku_games_slot_check check (slot in ('regular', 'daily', 'wager'));

create table public.wager_puzzles (
  wager_id uuid not null,
  round integer not null,
  puzzle text not null,
  solution text not null,
  created_at timestamptz not null default now(),
  primary key (wager_id, round),
  foreign key (wager_id, round) references public.wager_rounds (wager_id, round) on delete cascade
);
alter table public.wager_puzzles enable row level security;
revoke all on public.wager_puzzles from public, anon, authenticated;
grant all on public.wager_puzzles to service_role;

-- The puzzle for a round: the first stored puzzle is kept, so both players solve the same one.
create function public.wager_sudoku_puzzle(p_wager uuid, p_round integer, p_puzzle text, p_solution text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  w public.wagers;
  rd public.wager_rounds;
  p public.wager_puzzles;
  v_size text;
  v_min integer;
  v_blank integer;
begin
  select * into w from public.wagers where id = p_wager and v_user in (host_id, opponent_id);
  if not found then
    raise exception 'That match was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  select * into rd from public.wager_rounds where wager_id = w.id and round = p_round;
  if not found or rd.game <> 'sudoku' or rd.resolved_at is not null or w.status <> 'active' then
    raise exception 'This round is already over.' using errcode = 'P0001', hint = 'wager_round_closed';
  end if;
  select * into p from public.wager_puzzles where wager_id = w.id and round = rd.round;
  if found then
    return jsonb_build_object('puzzle', p.puzzle, 'solution', p.solution);
  end if;

  v_size := 'normal';
  v_min := 30;
  if rd.board like 'mini-%' then
    v_size := 'mini';
    v_min := 6;
  elsif rd.board like 'xxl-%' then
    v_size := 'xxl';
    v_min := 96;
  end if;
  v_blank := length(p_puzzle) - length(replace(p_puzzle, '0', ''));
  if not coalesce(public.sudoku_board_valid(v_size, p_puzzle) and public.sudoku_board_valid(v_size, p_solution, false)
                  and public._sudoku_grid_valid(p_solution), false)
     or v_blank < v_min
     or exists (select 1 from generate_series(1, length(p_puzzle)) cell
                 where substr(p_puzzle, cell, 1) <> '0' and substr(p_puzzle, cell, 1) <> substr(p_solution, cell, 1)) then
    raise exception 'That puzzle can''t be used.' using errcode = '22023';
  end if;
  insert into public.wager_puzzles (wager_id, round, puzzle, solution) values (w.id, rd.round, p_puzzle, p_solution)
  on conflict (wager_id, round) do nothing;
  select * into p from public.wager_puzzles where wager_id = w.id and round = rd.round;
  return jsonb_build_object('puzzle', p.puzzle, 'solution', p.solution);
end;
$$;
revoke all on function public.wager_sudoku_puzzle(uuid, integer, text, text) from public, anon;
grant execute on function public.wager_sudoku_puzzle(uuid, integer, text, text) to authenticated;

-- A solved wager Sudoku finishes its started run (the competitive trigger scores the round). Its time
-- is server wall-clock from the run's start; hints, a different puzzle or an impossible pace reject it.
create or replace function public.claim_sudoku_reward(p_game uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  g public.sudoku_games;
  r public.arcade_runs;
  rule public.arcade_reward_rules;
  v_seconds numeric;
  v_outcome text;
  v_note text;
  v_coins integer := 0;
  v_credit jsonb;
  v_expected text;
  v_blank integer;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select * into g from public.sudoku_games where user_id = v_user and id = p_game for update;
  if not found then raise exception 'That puzzle was not found.' using errcode = 'P0002', hint = 'run_not_found'; end if;
  select * into rule from public.arcade_reward_rules where game = 'sudoku' and variant = g.difficulty;
  select * into r from public.arcade_runs where id = p_game for update;
  if found then
    if r.user_id <> v_user then raise exception 'That puzzle was not found.' using errcode = 'P0002', hint = 'run_not_found'; end if;
    if r.outcome <> 'started' or r.game <> 'sudoku' then
      return jsonb_build_object('status', r.outcome, 'coins', r.coins, 'balance', public._wallet_balance(v_user), 'reason', r.note,
        'minScore', 0, 'minSeconds', rule.min_seconds);
    end if;
    if g.completed_at is null then raise exception 'Finish the puzzle first.' using errcode = '22023'; end if;
    v_seconds := extract(epoch from g.completed_at - r.started_at);
    v_blank := length(g.puzzle) - length(replace(g.puzzle, '0', ''));
    select wp.puzzle into v_expected
      from public.wager_attempts a
      join public.wager_puzzles wp on wp.wager_id = a.wager_id and wp.round = a.round
     where a.run_id = r.id;
    if g.slot <> 'wager' or v_expected is distinct from g.puzzle
       or r.board is distinct from (case when g.size = 'normal' then g.difficulty else g.size || '-' || g.difficulty end)
       or not public._sudoku_solved(g.puzzle, g.entries, g.solution) or v_seconds < v_blank * 1.5 then
      v_outcome := 'rejected'; v_note := 'implausible';
    elsif g.hints > 0 then
      v_outcome := 'rejected'; v_note := 'assisted';
    elsif v_seconds < rule.min_seconds then
      v_outcome := 'unpaid'; v_note := 'too_short';
    else
      v_credit := public._credit_coins(v_user, rule.flat_coins, 'run:' || g.id::text,
        jsonb_build_object('game', 'sudoku', 'size', g.size, 'difficulty', g.difficulty, 'seconds', round(v_seconds)));
      v_coins := (v_credit ->> 'coins')::integer;
      v_outcome := case when v_coins > 0 then 'paid' else 'unpaid' end;
      v_note := case when (v_credit ->> 'capped')::boolean then 'daily_limit' end;
    end if;
    update public.arcade_runs
       set finished_at = g.completed_at, score = greatest(1, floor(v_seconds)::integer), coins = v_coins, outcome = v_outcome, note = v_note
     where id = r.id;
    return jsonb_build_object('status', v_outcome, 'coins', v_coins, 'balance', public._wallet_balance(v_user), 'reason', v_note,
      'minScore', 0, 'minSeconds', rule.min_seconds);
  end if;
  if g.completed_at is null then raise exception 'Finish the puzzle first.' using errcode = '22023'; end if;
  v_seconds := extract(epoch from g.completed_at - g.started_at);
  if not g.reward_eligible then v_outcome := 'unpaid'; v_note := 'not_eligible';
  elsif not public._sudoku_solved(g.puzzle, g.entries, g.solution) then v_outcome := 'rejected'; v_note := 'implausible';
  elsif v_seconds < rule.min_seconds then v_outcome := 'unpaid'; v_note := 'too_short';
  else
    v_credit := public._credit_coins(v_user, rule.flat_coins, 'run:' || g.id::text,
      jsonb_build_object('game', 'sudoku', 'size', g.size, 'difficulty', g.difficulty, 'seconds', round(v_seconds)));
    v_coins := (v_credit ->> 'coins')::integer;
    v_outcome := case when v_coins > 0 then 'paid' else 'unpaid' end;
    v_note := case when (v_credit ->> 'capped')::boolean then 'daily_limit' end;
  end if;
  insert into public.arcade_runs (id, user_id, game, variant, started_at, finished_at, score, coins, outcome, note)
  values (g.id, v_user, 'sudoku', g.difficulty, g.started_at, g.completed_at, floor(v_seconds)::integer, v_coins, v_outcome, v_note);
  return jsonb_build_object('status', v_outcome, 'coins', v_coins, 'balance', public._wallet_balance(v_user), 'reason', v_note,
    'minScore', 0, 'minSeconds', rule.min_seconds);
end;
$$;

notify pgrst, 'reload schema';
commit;
