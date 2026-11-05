alter table public.arcade_records drop constraint arcade_records_game_valid;
alter table public.arcade_records add constraint arcade_records_game_valid check (
  (game = 'fruit-slice' and (variant in ('', 'arcade', 'zen') or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'stacker' and (variant in ('', 'classic') or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = '2048' and (variant in ('', '3x3', '5x5') or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'flutter' and (variant = '' or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'snake' and (variant = '' or variant ~ '^[a-z0-9]+-[a-z]+-[0-9]{1,2}(-(slow|fast))?$' or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'sudoku' and variant in ('easy', 'medium', 'hard') and score between 1 and 8640000)
);

create or replace function public._arcade_board_valid(p_game text, p_board text)
returns boolean
language plpgsql stable set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_board ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return p_game in ('2048', 'flutter', 'snake', 'fruit-slice', 'stacker')
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