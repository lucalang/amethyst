-- Endless Levels for the logic puzzles Zip, Patches, Tango, Queens and Sumbreak.
--
-- * The new record is the highest level completed. It lives in arcade_records under the new variant 'levels'
--   (score = level number), so no new table is needed and the older score-based records (the main "" variant,
--   Zip/Sumbreak difficulties, daily puzzles) are left exactly as they are; they are never read as levels.
-- * A solved level is one finished run on the board 'levels' with the level number as its score. Those runs
--   pay a small coin reward per level (rules below) and feed the ranked leaderboard board 'levels'.
-- * Leaderboard ranks on 'levels' are shared by players on the same level; other boards rank as before.
-- * Daily puzzles, Wagers and Tournaments keep their single-puzzle boards; 'levels' can't be wagered.

begin;

-- Coin rules for level runs: 3 coins a level, 1 more every 5 levels, at most 10 (the shared daily cap still applies).
-- A level's score is its number, so the plausibility bounds are just the level cap.
insert into public.arcade_reward_rules
  (game, variant, min_score, min_seconds, points_per_coin, flat_coins, max_coins, max_score_per_second, score_allowance, max_score)
values
  ('zip',      'levels', 1, 4, 5, 3, 10, 1000, 1000, 1000),
  ('patches',  'levels', 1, 4, 5, 3, 10, 1000, 1000, 1000),
  ('tango',    'levels', 1, 4, 5, 3, 10, 1000, 1000, 1000),
  ('queens',   'levels', 1, 4, 5, 3, 10, 1000, 1000, 1000),
  ('sumbreak', 'levels', 1, 4, 5, 3, 10, 1000, 1000, 1000)
on conflict (game, variant) do nothing;

-- Personal records: one 'levels' record per puzzle game (a level number from 1 to 1000).
do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game in (''zip'', ''patches'', ''tango'', ''queens'', ''sumbreak'') and variant = ''levels'' and score between 1 and 1000))';
end;
$$;

-- Boards runs and leaderboards accept: as before, plus 'levels' for the five puzzles.
create or replace function public._arcade_board_valid(p_game text, p_board text)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_board ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return p_game in ('2048', 'flutter', 'snake', 'fruit-slice', 'stacker', 'zip', 'patches', 'tango', 'queens', 'sumbreak')
      and substr(p_board, 7) in (v_today::text, (v_today - 1)::text);
  end if;
  return case p_game
    when '2048' then p_board in ('', '3x3', '5x5')
    when 'flutter' then p_board = ''
    when 'snake' then p_board = '' or (p_board !~ '^x[0-9a-z]+-'
      and p_board ~ '^[a-z0-9]{1,12}-(small|medium|large)-[0-9]{1,2}(-(slow|fast))?$')
    when 'fruit-slice' then p_board in ('', 'arcade', 'zen')
    when 'stacker' then p_board in ('', 'classic')
    when 'gem-chase' then p_board = ''
    when 'space-blaster' then p_board = ''
    when 'zip' then p_board in ('', 'easy', 'hard', 'expert', 'levels')
    when 'patches' then p_board in ('', 'levels')
    when 'tango' then p_board in ('', 'levels')
    when 'queens' then p_board in ('', 'levels')
    when 'sumbreak' then p_board in ('', 'easy', 'hard', 'levels')
    else false
  end;
end;
$$;
revoke all on function public._arcade_board_valid(text, text) from public, anon, authenticated;

-- Endless Levels have no single round to win, so Wagers can't use them.
create or replace function public._wager_board_direction(p_game text, p_board text)
returns text
language plpgsql stable set search_path = '' as $$
begin
  if p_game is null or p_board is null or p_board like 'daily-%' or p_board = 'levels' then
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

-- Runs on the 'levels' board use the 'levels' coin rules (every other run keeps the main rules).
create or replace function public.start_arcade_run(p_game text, p_board text default null)
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

  insert into public.arcade_runs (user_id, game, variant, board)
  values (v_user, p_game, case when p_board = 'levels' then 'levels' else '' end, p_board)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.start_arcade_run(text, text) from public, anon;
grant execute on function public.start_arcade_run(text, text) to authenticated;

-- A finished run keeps the player's best on its board. A level that was solved too fast to be plausible
-- (a run the coin rules call 'too_short') doesn't count toward the 'levels' ranking.
create or replace function public._arcade_run_leaderboard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.board is null or new.game = 'sudoku' or old.outcome <> 'started'
     or new.outcome not in ('paid', 'unpaid') or coalesce(new.score, 0) <= 0
     or (new.game = 'snake' and new.board ~ '^x[0-9a-z]+-')
     or (new.board = 'levels' and new.note = 'too_short') then
    return null;
  end if;
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

-- The reader: players on the same level of a 'levels' board share a rank (listed in a fixed order by their
-- arcade name, so nobody is placed ahead by when they got there); every other board ranks exactly as before.
create or replace function public._arcade_leaderboard_including_blender(p_game text, p_board text, p_limit integer default 25, p_puzzle text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_fast boolean := p_game = 'sudoku';
  v_levels boolean := p_board = 'levels';
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if not public._arcade_game_known(p_game) or p_board is null or length(p_board) > 40
     or (v_fast and p_board like 'daily-%' and (p_puzzle is null or p_puzzle !~ '^[0-9]{81}$')) then
    raise exception 'Unknown leaderboard.' using errcode = '22023';
  end if;

  with entries as (
    select e.user_id, e.score, e.hints, e.achieved_at, e.source_id,
           case when v_levels then public._arcade_name(e.user_id) end as tie_name
      from public.arcade_leaderboard_entries e
     where e.game = p_game and e.board = p_board and (p_puzzle is null or e.puzzle = p_puzzle)
  ),
  ranked as (
    select en.*,
           case when v_levels then rank() over (order by en.score desc)
                else row_number() over (order by case when v_fast then en.score else -en.score end, en.hints, en.achieved_at, en.source_id) end as rank,
           row_number() over (order by case when v_levels then -en.score when v_fast then en.score else -en.score end,
                                       case when v_levels then 0 else en.hints end,
                                       case when v_levels then null else en.achieved_at end,
                                       en.tie_name, en.source_id) as pos
      from entries en
  ),
  shown as (
    select r.*, jsonb_build_object('rank', r.rank, 'name', public._arcade_name(r.user_id), 'score', r.score,
             'hints', case when v_fast then r.hints end, 'achievedAt', r.achieved_at, 'you', r.user_id = v_user) as item
      from ranked r
     where r.pos <= v_limit or r.user_id = v_user
  )
  select jsonb_build_object(
    'players', (select count(*) from ranked),
    'top', coalesce((select jsonb_agg(s.item order by s.pos) from shown s where s.pos <= v_limit), '[]'::jsonb),
    'you', (select s.item from shown s where s.user_id = v_user)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public._arcade_leaderboard_including_blender(text, text, integer, text) from public, anon, authenticated;

commit;
