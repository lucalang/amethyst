-- Six new Arcade games: Gem Chase, Space Blaster (score runs) and the Zip, Patches, Tango and Queens
-- logic puzzles (scored by solve time, with a daily puzzle). Existing games' rules are unchanged.

begin;

-- Coin rules for the new games only; the shared daily coin cap still applies.
-- Puzzle scores are 100-1000 (faster solves score more), so the per-second bound is just the 1000 cap.
insert into public.arcade_reward_rules
  (game, variant, min_score, min_seconds, points_per_coin, flat_coins, max_coins, max_score_per_second, score_allowance, max_score)
values
  ('gem-chase',     '', 500, 20, 300, 0, 30,  400, 6000, 10000000),
  ('space-blaster', '', 300, 15, 100, 0, 30,  300, 1000, 10000000),
  ('zip',           '',   1,  8,  50, 0, 20, 1000, 1000,     1000),
  ('patches',       '',   1,  8,  50, 0, 20, 1000, 1000,     1000),
  ('tango',         '',   1,  8,  50, 0, 20, 1000, 1000,     1000),
  ('queens',        '',   1,  8,  50, 0, 20, 1000, 1000,     1000)
on conflict (game, variant) do nothing;

-- Personal records: one best for the action games; the puzzles also keep one best per daily puzzle.
do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game in (''gem-chase'', ''space-blaster'') and variant = '''' and score between 0 and 100000000)'
    || ' or (game in (''zip'', ''patches'', ''tango'', ''queens'') and (variant = '''' or variant ~ ''^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'') and score between 0 and 1000))';
end;
$$;

-- Leaderboard entries accept any known game id (the reward rules are the registry).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid = 'public.arcade_leaderboard_entries'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%''fruit-slice''%'
  loop
    execute format('alter table public.arcade_leaderboard_entries drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.arcade_leaderboard_entries
  add constraint arcade_leaderboard_entries_game_check check (game ~ '^[a-z0-9-]{1,24}$');

create or replace function public._arcade_board_valid(p_game text, p_board text)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_board ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return p_game in ('2048', 'flutter', 'snake', 'fruit-slice', 'stacker', 'zip', 'patches', 'tango', 'queens')
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
    when 'zip' then p_board = ''
    when 'patches' then p_board = ''
    when 'tango' then p_board = ''
    when 'queens' then p_board = ''
    else false
  end;
end;
$$;
revoke all on function public._arcade_board_valid(text, text) from public, anon, authenticated;

-- Same reader as before; the game check now uses the reward-rule registry instead of a fixed list.
create or replace function public._arcade_leaderboard_including_blender(p_game text, p_board text, p_limit integer default 25, p_puzzle text default null)
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
  if not public._arcade_game_known(p_game) or p_board is null or length(p_board) > 40
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
revoke all on function public._arcade_leaderboard_including_blender(text, text, integer, text) from public, anon, authenticated;

commit;
