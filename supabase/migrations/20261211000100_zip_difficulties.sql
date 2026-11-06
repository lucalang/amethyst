-- Zip practice difficulties: Easy, Hard and Expert keep their own records and leaderboards
-- (Medium stays on the original unnamed variant). Coin rules are unchanged.

begin;

do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''zip'' and variant in (''easy'', ''hard'', ''expert'') and score between 0 and 1000))';
end;
$$;

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
    when 'zip' then p_board in ('', 'easy', 'hard', 'expert')
    when 'patches' then p_board = ''
    when 'tango' then p_board = ''
    when 'queens' then p_board = ''
    else false
  end;
end;
$$;
revoke all on function public._arcade_board_valid(text, text) from public, anon, authenticated;

commit;
