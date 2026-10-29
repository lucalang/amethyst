-- Daily challenges and modes for Sudoku, Fruit Slice and Tower Stacker.
--
-- Records: '' stays each game's original record, so every saved best stays where it is.
--   Fruit Slice: '' = Classic, 'arcade' and 'zen' = the timed modes, 'daily-YYYY-MM-DD' = daily Arcade.
--   Tower Stacker: '' = Casual (the original rules: perfect streaks win width back),
--   'classic' = strict rules, 'daily-YYYY-MM-DD' = daily tower (strict rules).
alter table public.arcade_records drop constraint arcade_records_game_valid;
alter table public.arcade_records add constraint arcade_records_game_valid check (
  (game = 'fruit-slice' and (variant in ('', 'arcade', 'zen') or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'stacker' and (variant in ('', 'classic') or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = '2048' and (variant in ('', '3x3', '5x5') or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'flutter' and (variant = '' or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'snake' and (variant = '' or variant ~ '^[a-z0-9]+-[a-z]+-[0-9]{1,2}(-(slow|fast))?$') and score between 0 and 100000000)
  or (game = 'sudoku' and variant in ('easy', 'medium', 'hard') and score between 1 and 8640000)
);

-- Fruit Slice runs: Arcade bombs cost points, so a score can now fall below the fruit count.
-- Combo bonuses still pay at most one extra point per fruit. Timed modes slice a little faster.
create or replace function public._arcade_run_plausible(p_game text, p_score integer, p_metrics jsonb)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  a numeric;
  b numeric;
begin
  if p_game = '2048' then
    a := public._run_metric(p_metrics, 'maxTile');
    b := coalesce(public._run_metric(p_metrics, 'cells'), 16);
    if a is null or a < 2 or a > 131072 or a <> trunc(a) then return false; end if;
    if (a::bigint & (a::bigint - 1)) <> 0 then return false; end if;
    if b not in (9, 16, 25) then return false; end if;
    return p_score <= (ln(a) / ln(2) - 1) * a * greatest(4, b / 4) + 64;
  elsif p_game = 'flutter' then
    a := public._run_metric(p_metrics, 'obstacles');
    return a is null or a = p_score;
  elsif p_game = 'snake' then
    a := public._run_metric(p_metrics, 'length');
    return a is not null and a = p_score + 3;
  elsif p_game = 'fruit-slice' then
    a := public._run_metric(p_metrics, 'fruitsSliced');
    b := coalesce(public._run_metric(p_metrics, 'maxCombo'), 0);
    return a is not null and p_score <= a * 2 and b >= 0 and b <= a;
  elsif p_game = 'stacker' then
    a := public._run_metric(p_metrics, 'height');
    b := coalesce(public._run_metric(p_metrics, 'perfectStreak'), 0);
    return a is not null and a = p_score and b >= 0 and b <= a;
  end if;
  return true;
end;
$$;
revoke all on function public._arcade_run_plausible(text, integer, jsonb) from public, anon, authenticated;

update public.arcade_reward_rules set max_score_per_second = 8 where game = 'fruit-slice' and variant = '';

-- ---------------------------------------------------------------------------
-- Sudoku: a regular and a daily puzzle side by side, with hints tracked
-- ---------------------------------------------------------------------------
-- Each account keeps one regular puzzle and one daily puzzle ('slot'). The daily slot remembers
-- its puzzle date, so a puzzle started before midnight keeps counting for its own day.
alter table public.sudoku_games
  add column slot text not null default 'regular' check (slot in ('regular', 'daily')),
  add column puzzle_date date,
  add column hints smallint not null default 0 check (hints between 0 and 81),
  add constraint sudoku_games_daily_date check ((slot = 'daily') = (puzzle_date is not null));
alter table public.sudoku_games drop constraint sudoku_games_pkey;
alter table public.sudoku_games add primary key (user_id, slot);
create unique index sudoku_games_id_key on public.sudoku_games (id);

-- Hints only change through sudoku_hint (no column grant); slot and date are fixed per puzzle.
revoke insert, update on public.sudoku_games from authenticated;
grant insert (id, slot, puzzle_date, difficulty, puzzle, solution, entries, notes, elapsed_ms, completed_at, started_at),
  update (id, slot, puzzle_date, difficulty, puzzle, solution, entries, notes, elapsed_ms, completed_at, started_at)
  on public.sudoku_games to authenticated;

create or replace function public.sudoku_games_server_times()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.slot is distinct from old.slot then
    raise exception 'A puzzle cannot move between slots.' using errcode = '22023';
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
    new.completed_at := now();
  end if;
  return new;
end;
$$;

-- Daily results, one per account and puzzle date; written once when a daily puzzle is solved.
create table public.sudoku_daily_results (
  user_id uuid not null references public.users (id) on delete cascade,
  puzzle_date date not null,
  game_id uuid not null,
  elapsed_ms integer not null check (elapsed_ms between 0 and 2000000000),
  hints smallint not null check (hints between 0 and 81),
  completed_at timestamptz not null default now(),
  primary key (user_id, puzzle_date)
);
alter table public.sudoku_daily_results enable row level security;
create policy owner_read on public.sudoku_daily_results for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.sudoku_daily_results from public, anon, authenticated;
grant select on public.sudoku_daily_results to authenticated;
grant all on public.sudoku_daily_results to service_role;

create function public.sudoku_daily_result()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.slot = 'daily' and old.completed_at is null and new.completed_at is not null then
    insert into public.sudoku_daily_results (user_id, puzzle_date, game_id, elapsed_ms, hints, completed_at)
    values (new.user_id, new.puzzle_date, new.id, new.elapsed_ms, new.hints, new.completed_at)
    on conflict (user_id, puzzle_date) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function public.sudoku_daily_result() from public, anon, authenticated;
create trigger sudoku_games_daily_result after update on public.sudoku_games
  for each row execute function public.sudoku_daily_result();

-- Reveals one cell of an unfinished puzzle and counts it as a hint (a cell already right is free).
create function public.sudoku_hint(p_game uuid, p_cell integer)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  g public.sudoku_games;
  v_digit text;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  select * into g from public.sudoku_games where user_id = v_user and id = p_game and completed_at is null for update;
  if not found then
    raise exception 'This puzzle was finished or replaced in another window.' using errcode = 'P0002', hint = 'replaced';
  end if;
  if p_cell is null or p_cell < 0 or p_cell > 80 or substr(g.puzzle, p_cell + 1, 1) <> '0' then
    raise exception 'Pick an empty cell for a hint.' using errcode = '22023';
  end if;
  v_digit := substr(g.solution, p_cell + 1, 1);
  if substr(g.entries, p_cell + 1, 1) <> v_digit then
    update public.sudoku_games
       set entries = overlay(entries placing v_digit from p_cell + 1 for 1),
           notes[p_cell + 1] = 0,
           hints = least(81, hints + 1)
     where user_id = v_user and id = p_game;
  end if;
  return v_digit::integer;
end;
$$;
revoke all on function public.sudoku_hint(uuid, integer) from public, anon;
grant execute on function public.sudoku_hint(uuid, integer) to authenticated;
