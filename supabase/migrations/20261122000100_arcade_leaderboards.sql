-- Arcade leaderboards.
--
-- * Personal records (arcade_records) stay owner-only and are never ranked: owners can write them directly.
-- * Ranked entries come only from server-checked sources: finished runs that passed finish_arcade_run's
--   timing and plausibility checks (tagged with a board when started), and solved Sudoku puzzles.
-- * Entries are written by triggers only; clients read bounded results through arcade_leaderboard(),
--   which returns an anonymous arcade name per player and never account data.
-- No backfill: earlier runs carried no board, so boards start empty.

-- ---------------------------------------------------------------------------
-- Boards on runs
-- ---------------------------------------------------------------------------
alter table public.arcade_runs add column board text check (board is null or length(board) <= 40);

-- Whether a run may be tagged with a board: the record variants, daily boards only for today or yesterday (UTC).
create function public._arcade_board_valid(p_game text, p_board text)
returns boolean
language plpgsql stable set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_board ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return p_game in ('2048', 'flutter', 'fruit-slice', 'stacker')
      and substr(p_board, 7) in (v_today::text, (v_today - 1)::text);
  end if;
  return case p_game
    when '2048' then p_board in ('', '3x3', '5x5')
    when 'flutter' then p_board = ''
    when 'snake' then p_board = '' or p_board ~ '^[a-z0-9]{1,12}-(small|medium|large)-[0-9]{1,2}(-(slow|fast))?$'
    when 'fruit-slice' then p_board in ('', 'arcade', 'zen')
    when 'stacker' then p_board in ('', 'classic')
    else false
  end;
end;
$$;
revoke all on function public._arcade_board_valid(text, text) from public, anon, authenticated;

drop function public.start_arcade_run(text);

-- Starts a timed run for a score game, optionally on a leaderboard board. Rate limited per account.
create function public.start_arcade_run(p_game text, p_board text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_game = 'sudoku' or not exists (select 1 from public.arcade_reward_rules where game = p_game and variant = '') then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;
  if p_board is not null and not public._arcade_board_valid(p_game, p_board) then
    raise exception 'Unknown board.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('arcade_runs:' || v_user::text, 0));

  update public.arcade_runs
     set outcome = 'expired', finished_at = now()
   where user_id = v_user and outcome = 'started' and started_at < now() - interval '6 hours';
  delete from public.arcade_runs
   where user_id = v_user and outcome = 'expired' and started_at < now() - interval '30 days';

  if (select count(*) from public.arcade_runs where user_id = v_user and game <> 'sudoku' and started_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.arcade_runs where user_id = v_user and game <> 'sudoku' and started_at > now() - interval '1 hour') >= 300 then
    raise exception 'Lots of runs in a short time, so coins are paused for a moment. Your games and records still work.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.arcade_runs (user_id, game, board) values (v_user, p_game, p_board) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.start_arcade_run(text, text) from public, anon;
grant execute on function public.start_arcade_run(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ranked entries (one best per player and board; no client access)
-- ---------------------------------------------------------------------------
create table public.arcade_leaderboard_entries (
  user_id uuid not null references public.users (id) on delete cascade,
  game text not null check (game in ('2048', 'flutter', 'snake', 'sudoku', 'fruit-slice', 'stacker')),
  board text not null check (length(board) <= 40),
  -- Points, or seconds for Sudoku (lower is better).
  score integer not null check (score > 0),
  hints smallint not null default 0 check (hints between 0 and 81),
  -- Sudoku only: the solved puzzle, so a daily board ranks only the shared puzzle.
  puzzle text check (puzzle is null or puzzle ~ '^[0-9]{81}$'),
  achieved_at timestamptz not null default now(),
  source_id uuid not null,
  primary key (user_id, game, board)
);
create index arcade_leaderboard_entries_rank on public.arcade_leaderboard_entries (game, board, score, hints, achieved_at);

alter table public.arcade_leaderboard_entries enable row level security;
revoke all on public.arcade_leaderboard_entries from public, anon, authenticated;
grant all on public.arcade_leaderboard_entries to service_role;

-- A finished run that passed the server's checks keeps the player's best on its board.
create function public._arcade_run_leaderboard()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.board is null or new.game = 'sudoku' or old.outcome <> 'started'
     or new.outcome not in ('paid', 'unpaid') or coalesce(new.score, 0) <= 0 then
    return null;
  end if;
  -- The 2048 board size must match the cells the run reported (the plausibility bound depends on it).
  if new.game = '2048' and coalesce(public._run_metric(new.metrics, 'cells'), 16)
     <> (case new.board when '3x3' then 9 when '5x5' then 25 else 16 end) then
    return null;
  end if;
  insert into public.arcade_leaderboard_entries as e (user_id, game, board, score, achieved_at, source_id)
  values (new.user_id, new.game, new.board, new.score, coalesce(new.finished_at, now()), new.id)
  on conflict (user_id, game, board) do update
    set score = excluded.score, achieved_at = excluded.achieved_at, source_id = excluded.source_id
    where excluded.score > e.score;
  return null;
end;
$$;
revoke all on function public._arcade_run_leaderboard() from public, anon, authenticated;
create trigger arcade_runs_leaderboard after update of outcome on public.arcade_runs
  for each row execute function public._arcade_run_leaderboard();

-- Every row, column and box of a full grid holds 1-9 exactly once.
create function public._sudoku_grid_valid(p_grid text)
returns boolean
language sql immutable set search_path = '' as $$
  select p_grid ~ '^[1-9]{81}$' and (
    select count(*) = 27 from (
      select unit from (
        select substr(p_grid, i + 1, 1) as digit, unnest(array[i / 9, 9 + i % 9, 18 + (i / 27) * 3 + (i % 9) / 3]) as unit
          from generate_series(0, 80) as i
      ) cells group by unit having count(distinct digit) = 9
    ) units
  );
$$;
revoke all on function public._sudoku_grid_valid(text) from public, anon, authenticated;

-- A solved puzzle ranks by its play time when that time is plausible: no faster than 1.5 s per empty
-- cell and no longer than the server's wall clock since the puzzle started.
create function public._sudoku_leaderboard()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_empty integer;
  v_wall_ms numeric;
  v_seconds integer;
  v_board text;
begin
  if old.completed_at is not null or new.completed_at is null or not public._sudoku_grid_valid(new.solution) then
    return null;
  end if;
  if exists (
    select 1 from generate_series(1, 81) as i
     where case when substr(new.puzzle, i, 1) <> '0' then substr(new.puzzle, i, 1) <> substr(new.solution, i, 1)
                else substr(new.entries, i, 1) <> substr(new.solution, i, 1) end
  ) then
    return null;
  end if;
  v_empty := length(new.puzzle) - length(replace(new.puzzle, '0', ''));
  v_wall_ms := extract(epoch from new.completed_at - new.started_at) * 1000;
  if new.elapsed_ms < v_empty * 1500 or new.elapsed_ms > v_wall_ms + 5000 then
    return null;
  end if;
  v_seconds := greatest(1, round(new.elapsed_ms / 1000.0)::integer);
  v_board := case when new.slot = 'daily' then 'daily-' || new.puzzle_date::text else new.difficulty end;

  insert into public.arcade_leaderboard_entries as e (user_id, game, board, score, hints, puzzle, achieved_at, source_id)
  values (new.user_id, 'sudoku', v_board, v_seconds, new.hints, new.puzzle, new.completed_at, new.id)
  on conflict (user_id, game, board) do update
    set score = excluded.score, hints = excluded.hints, puzzle = excluded.puzzle, achieved_at = excluded.achieved_at, source_id = excluded.source_id
    where (excluded.score, excluded.hints) < (e.score, e.hints) or (new.slot = 'daily' and e.puzzle is distinct from excluded.puzzle);
  return null;
end;
$$;
revoke all on function public._sudoku_leaderboard() from public, anon, authenticated;
create trigger sudoku_games_leaderboard after update of completed_at on public.sudoku_games
  for each row execute function public._sudoku_leaderboard();

-- ---------------------------------------------------------------------------
-- Anonymous arcade names
-- ---------------------------------------------------------------------------
-- A secret salt keeps names from being derived from account ids.
create table public.arcade_name_salt (
  id boolean primary key default true check (id),
  salt text not null
);
insert into public.arcade_name_salt (salt) values (gen_random_uuid()::text || gen_random_uuid()::text);
alter table public.arcade_name_salt enable row level security;
revoke all on public.arcade_name_salt from public, anon, authenticated;
grant all on public.arcade_name_salt to service_role;

create function public._arcade_name(p_user uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  adjectives constant text[] := array['Amber', 'Arctic', 'Brave', 'Bright', 'Calm', 'Clever', 'Copper', 'Cosmic', 'Crystal', 'Dusky',
    'Ember', 'Fable', 'Frost', 'Gilded', 'Glowing', 'Golden', 'Hidden', 'Jade', 'Lucky', 'Lunar',
    'Misty', 'Nimble', 'Quiet', 'Rapid', 'Rosy', 'Silver', 'Solar', 'Swift', 'Velvet', 'Violet', 'Wild', 'Zesty'];
  animals constant text[] := array['Badger', 'Bat', 'Crane', 'Falcon', 'Ferret', 'Finch', 'Fox', 'Gecko', 'Hare', 'Hedgehog',
    'Heron', 'Ibis', 'Koala', 'Lark', 'Lemur', 'Lynx', 'Marten', 'Moth', 'Newt', 'Ocelot',
    'Orca', 'Otter', 'Owl', 'Panda', 'Puffin', 'Quokka', 'Raven', 'Seal', 'Stoat', 'Tapir', 'Wren', 'Yak'];
  h bytea;
begin
  h := decode(md5((select salt from public.arcade_name_salt) || p_user::text), 'hex');
  return adjectives[1 + get_byte(h, 0) % 32] || ' ' || animals[1 + get_byte(h, 1) % 32] || ' '
    || lpad(((get_byte(h, 2) * 256 + get_byte(h, 3)) % 100)::text, 2, '0');
end;
$$;
revoke all on function public._arcade_name(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Top players on one board plus the caller's own placement. Sudoku ranks the fastest time, then fewer
-- hints; other games the highest score. Ties go to whoever got there first. Daily Sudoku needs p_puzzle.
create function public.arcade_leaderboard(p_game text, p_board text, p_limit integer default 25, p_puzzle text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_fast boolean := p_game = 'sudoku';
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_game not in ('2048', 'flutter', 'snake', 'sudoku', 'fruit-slice', 'stacker') or p_board is null or length(p_board) > 40
     or (v_fast and p_board like 'daily-%' and (p_puzzle is null or p_puzzle !~ '^[0-9]{81}$')) then
    raise exception 'Unknown leaderboard.' using errcode = '22023';
  end if;

  with ranked as (
    select e.user_id, e.score, e.hints, e.achieved_at,
           row_number() over (order by case when v_fast then e.score else -e.score end, e.hints, e.achieved_at, e.source_id) as rank
      from public.arcade_leaderboard_entries e
     where e.game = p_game and e.board = p_board and (p_puzzle is null or e.puzzle = p_puzzle)
  ),
  shown as (
    select r.*, jsonb_build_object('rank', r.rank, 'name', public._arcade_name(r.user_id), 'score', r.score,
             'hints', case when v_fast then r.hints end, 'achievedAt', r.achieved_at, 'you', r.user_id = v_user) as item
      from ranked r
     where r.rank <= v_limit or r.user_id = v_user
  )
  select jsonb_build_object(
    'players', (select count(*) from ranked),
    'top', coalesce((select jsonb_agg(s.item order by s.rank) from shown s where s.rank <= v_limit), '[]'::jsonb),
    'you', (select s.item from shown s where s.user_id = v_user)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.arcade_leaderboard(text, text, integer, text) from public, anon;
grant execute on function public.arcade_leaderboard(text, text, integer, text) to authenticated;

-- Boards of a game that have ranked players, busiest first (Snake has too many setups to list them all).
create function public.arcade_leaderboard_boards(p_game text)
returns table (board text, players bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  return query
    select e.board, count(*) from public.arcade_leaderboard_entries e
     where e.game = p_game and e.board not like 'daily-%'
     group by e.board order by count(*) desc, e.board limit 30;
end;
$$;
revoke all on function public.arcade_leaderboard_boards(text) from public, anon;
grant execute on function public.arcade_leaderboard_boards(text) to authenticated;
