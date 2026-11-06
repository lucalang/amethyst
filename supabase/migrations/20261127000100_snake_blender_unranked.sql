begin;

create or replace function public._arcade_board_valid(p_game text, p_board text)
returns boolean language plpgsql stable set search_path = '' as $$
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
    when 'snake' then p_board = '' or (p_board !~ '^x[0-9a-z]+-'
      and p_board ~ '^[a-z0-9]{1,12}-(small|medium|large)-[0-9]{1,2}(-(slow|fast))?$')
    when 'fruit-slice' then p_board in ('', 'arcade', 'zen')
    when 'stacker' then p_board in ('', 'classic')
    else false
  end;
end;
$$;

create or replace function public._arcade_run_leaderboard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.board is null or new.game = 'sudoku' or old.outcome <> 'started'
     or new.outcome not in ('paid', 'unpaid') or coalesce(new.score, 0) <= 0
     or (new.game = 'snake' and new.board ~ '^x[0-9a-z]+-') then
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

alter function public.arcade_leaderboard(text, text, integer, text) rename to _arcade_leaderboard_including_blender;
revoke all on function public._arcade_leaderboard_including_blender(text, text, integer, text) from public, anon, authenticated;

create function public.arcade_leaderboard(p_game text, p_board text, p_limit integer default 25, p_puzzle text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_game = 'snake' and p_board ~ '^x[0-9a-z]+-' then
    raise exception 'Blender is not ranked.' using errcode = '22023';
  end if;
  return public._arcade_leaderboard_including_blender(p_game, p_board, p_limit, p_puzzle);
end;
$$;
revoke all on function public.arcade_leaderboard(text, text, integer, text) from public, anon;
grant execute on function public.arcade_leaderboard(text, text, integer, text) to authenticated;

create or replace function public.arcade_leaderboard_boards(p_game text)
returns table (board text, players bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  return query
    select e.board, count(*) from public.arcade_leaderboard_entries e
     where e.game = p_game and e.board not like 'daily-%'
       and not (e.game = 'snake' and e.board ~ '^x[0-9a-z]+-')
     group by e.board order by count(*) desc, e.board limit 30;
end;
$$;

notify pgrst, 'reload schema';
commit;