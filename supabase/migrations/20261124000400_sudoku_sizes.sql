begin;

create function public.sudoku_board_valid(p_size text, p_board text, p_blank boolean default true)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(case p_size
    when 'mini' then p_board ~ (case when p_blank then '^[0-4]{16}$' else '^[1-4]{16}$' end)
    when 'normal' then p_board ~ (case when p_blank then '^[0-9]{81}$' else '^[1-9]{81}$' end)
    when 'xxl' then p_board ~ (case when p_blank then '^[0-9A-G]{256}$' else '^[1-9A-G]{256}$' end)
    else false end, false);
$$;
revoke all on function public.sudoku_board_valid(text, text, boolean) from public, anon;
grant execute on function public.sudoku_board_valid(text, text, boolean) to authenticated, service_role;

create or replace function public.sudoku_entries_fit(p_puzzle text, p_entries text)
returns boolean language sql immutable set search_path = '' as $$
  select length(p_puzzle) = length(p_entries) and not exists (
    select 1 from generate_series(1, length(p_puzzle)) as cell
     where substr(p_puzzle, cell, 1) <> '0' and substr(p_entries, cell, 1) <> '0'
  );
$$;

create or replace function public._sudoku_grid_valid(p_grid text)
returns boolean language sql immutable set search_path = '' as $$
  with config as (
    select case length(p_grid) when 16 then 4 when 81 then 9 when 256 then 16 end as side,
           case length(p_grid) when 16 then 2 when 81 then 3 when 256 then 4 end as region,
           case length(p_grid) when 16 then 'mini' when 81 then 'normal' when 256 then 'xxl' end as size
  )
  select coalesce(public.sudoku_board_valid(size, p_grid, false) and (
    select count(*) = side * 3 from (
      select unit from (
        select substr(p_grid, cell + 1, 1) as digit,
               unnest(array[cell / side, side + cell % side,
                 side * 2 + (cell / side / region) * region + (cell % side) / region]) as unit
          from generate_series(0, length(p_grid) - 1) as cell
      ) cells group by unit having count(distinct digit) = side
    ) units
  ), false) from config;
$$;
grant execute on function public._sudoku_grid_valid(text) to authenticated, service_role;

create function public._sudoku_solved(p_puzzle text, p_entries text, p_solution text)
returns boolean language sql immutable set search_path = '' as $$
  select public._sudoku_grid_valid(p_solution) and length(p_puzzle) = length(p_solution)
    and length(p_entries) = length(p_solution) and not exists (
      select 1 from generate_series(1, length(p_solution)) as cell
       where (case when substr(p_puzzle, cell, 1) <> '0' then substr(p_puzzle, cell, 1)
                   else substr(p_entries, cell, 1) end) <> substr(p_solution, cell, 1)
    );
$$;
revoke all on function public._sudoku_solved(text, text, text) from public, anon;
grant execute on function public._sudoku_solved(text, text, text) to authenticated, service_role;

alter table public.sudoku_games
  add column size text not null default 'normal' check (size in ('mini', 'normal', 'xxl')),
  drop constraint sudoku_games_pkey,
  drop constraint sudoku_games_puzzle_check,
  drop constraint sudoku_games_solution_check,
  drop constraint sudoku_games_entries_check,
  drop constraint sudoku_games_notes_valid,
  drop constraint sudoku_games_hints_check;
alter table public.sudoku_games alter column notes drop default;
alter table public.sudoku_games alter column notes type integer[] using notes::integer[];
alter table public.sudoku_games alter column notes set default array_fill(0, array[81]);
alter table public.sudoku_games
  add primary key (user_id, slot, size),
  add constraint sudoku_games_daily_size check (slot <> 'daily' or size = 'normal'),
  add constraint sudoku_games_puzzle_check check (public.sudoku_board_valid(size, puzzle)),
  add constraint sudoku_games_entries_check check (public.sudoku_board_valid(size, entries)),
  add constraint sudoku_games_solution_check check (public.sudoku_board_valid(size, solution, false) and public._sudoku_grid_valid(solution)),
  add constraint sudoku_games_notes_valid check (
    array_ndims(notes) = 1 and array_lower(notes, 1) = 1 and cardinality(notes) = length(puzzle)
    and array_position(notes, null) is null and 0 <= all(notes)
    and (case size when 'mini' then 15 when 'normal' then 511 else 65535 end) >= all(notes)
  ),
  add constraint sudoku_games_hints_check check (hints between 0 and length(puzzle));
grant insert (size), update (size) on public.sudoku_games to authenticated;

create or replace function public.sudoku_games_server_times()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.slot is distinct from old.slot or new.size is distinct from old.size) then
    raise exception 'A puzzle cannot move between slots or sizes.' using errcode = '22023';
  end if;
  if exists (select 1 from generate_series(1, length(new.puzzle)) as cell
      where substr(new.puzzle, cell, 1) <> '0' and substr(new.puzzle, cell, 1) <> substr(new.solution, cell, 1)) then
    raise exception 'Clues must match the solution.' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' or new.id is distinct from old.id then
    new.started_at := now();
    new.completed_at := null;
    new.reward_eligible := true;
    new.hints := 0;
    return new;
  end if;
  new.started_at := old.started_at;
  new.reward_eligible := old.reward_eligible;
  if new.puzzle is distinct from old.puzzle or new.solution is distinct from old.solution
     or new.difficulty is distinct from old.difficulty or new.puzzle_date is distinct from old.puzzle_date then
    raise exception 'Start a new puzzle instead of changing this one.' using errcode = '22023';
  end if;
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
  elsif new.completed_at is not null then
    if not public._sudoku_solved(new.puzzle, new.entries, new.solution) then
      raise exception 'That grid is not the solution yet.' using errcode = '22023';
    end if;
    new.completed_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.sudoku_hint(p_game uuid, p_cell integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  g public.sudoku_games;
  v_digit text;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select * into g from public.sudoku_games where user_id = v_user and id = p_game and completed_at is null for update;
  if not found then
    raise exception 'This puzzle was finished or replaced in another window.' using errcode = 'P0002', hint = 'replaced';
  end if;
  if p_cell is null or p_cell < 0 or p_cell >= length(g.puzzle) or substr(g.puzzle, p_cell + 1, 1) <> '0' then
    raise exception 'Pick an empty cell for a hint.' using errcode = '22023';
  end if;
  v_digit := substr(g.solution, p_cell + 1, 1);
  if substr(g.entries, p_cell + 1, 1) <> v_digit then
    update public.sudoku_games set entries = overlay(entries placing v_digit from p_cell + 1 for 1),
      notes[p_cell + 1] = 0, hints = least(length(g.puzzle), hints + 1)
      where user_id = v_user and id = p_game;
  end if;
  return strpos('123456789ABCDEFG', v_digit);
end;
$$;

do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''sudoku'' and variant ~ ''^(mini|xxl)-(easy|medium|hard)$'' and score between 1 and 8640000))';
end;
$$;

alter table public.arcade_leaderboard_entries
  drop constraint arcade_leaderboard_entries_puzzle_check,
  drop constraint arcade_leaderboard_entries_hints_check,
  add constraint arcade_leaderboard_entries_puzzle_check check (puzzle is null or
    public.sudoku_board_valid(case when board like 'mini-%' then 'mini' when board like 'xxl-%' then 'xxl' else 'normal' end, puzzle)),
  add constraint arcade_leaderboard_entries_hints_check check (hints between 0 and coalesce(length(puzzle), 81));

create or replace function public._sudoku_leaderboard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_empty integer;
  v_wall_ms numeric;
  v_seconds integer;
  v_board text;
begin
  if old.completed_at is not null or new.completed_at is null or not public._sudoku_solved(new.puzzle, new.entries, new.solution) then return null; end if;
  v_empty := length(new.puzzle) - length(replace(new.puzzle, '0', ''));
  v_wall_ms := extract(epoch from new.completed_at - new.started_at) * 1000;
  if new.elapsed_ms < v_empty * 1500 or new.elapsed_ms > v_wall_ms + 5000 then return null; end if;
  v_seconds := greatest(1, round(new.elapsed_ms / 1000.0)::integer);
  v_board := case when new.slot = 'daily' then 'daily-' || new.puzzle_date::text
    when new.size = 'normal' then new.difficulty else new.size || '-' || new.difficulty end;
  insert into public.arcade_leaderboard_entries as e (user_id, game, board, score, hints, puzzle, achieved_at, source_id)
  values (new.user_id, 'sudoku', v_board, v_seconds, new.hints, new.puzzle, new.completed_at, new.id)
  on conflict (user_id, game, board) do update
    set score = excluded.score, hints = excluded.hints, puzzle = excluded.puzzle, achieved_at = excluded.achieved_at, source_id = excluded.source_id
    where (excluded.score, excluded.hints) < (e.score, e.hints) or (new.slot = 'daily' and e.puzzle is distinct from excluded.puzzle);
  return null;
end;
$$;

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
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  select * into g from public.sudoku_games where user_id = v_user and id = p_game for update;
  if not found then raise exception 'That puzzle was not found.' using errcode = 'P0002', hint = 'run_not_found'; end if;
  select * into rule from public.arcade_reward_rules where game = 'sudoku' and variant = g.difficulty;
  select * into r from public.arcade_runs where id = p_game;
  if found then
    if r.user_id <> v_user then raise exception 'That puzzle was not found.' using errcode = 'P0002', hint = 'run_not_found'; end if;
    return jsonb_build_object('status', r.outcome, 'coins', r.coins, 'balance', public._wallet_balance(v_user), 'reason', r.note,
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