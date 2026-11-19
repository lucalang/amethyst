-- Sumbreak: a logic puzzle scored by solve time like Zip, Patches, Tango and Queens, with Easy / Medium / Hard
-- practice boards (Medium keeps the main "" record) and a daily puzzle. The API replays every scored solve
-- before it reaches these functions. Existing games' rules and records are unchanged.

begin;

-- Coin rules: the same as the other puzzles (scores 100-1000; the shared daily coin cap still applies).
insert into public.arcade_reward_rules
  (game, variant, min_score, min_seconds, points_per_coin, flat_coins, max_coins, max_score_per_second, score_allowance, max_score)
values
  ('sumbreak', '', 1, 8, 50, 0, 20, 1000, 1000, 1000)
on conflict (game, variant) do nothing;

-- Personal records: Medium (""), Easy, Hard and recent daily puzzles.
do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''sumbreak'' and (variant in ('''', ''easy'', ''hard'') or variant ~ ''^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$'') and score between 0 and 1000))';
end;
$$;

-- Leaderboard boards (also what runs, Tournaments and Wagers accept): as before, plus Sumbreak's.
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
    when 'zip' then p_board in ('', 'easy', 'hard', 'expert')
    when 'patches' then p_board = ''
    when 'tango' then p_board = ''
    when 'queens' then p_board = ''
    when 'sumbreak' then p_board in ('', 'easy', 'hard')
    else false
  end;
end;
$$;
revoke all on function public._arcade_board_valid(text, text) from public, anon, authenticated;

commit;
