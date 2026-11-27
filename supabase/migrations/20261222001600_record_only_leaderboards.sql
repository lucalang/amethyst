-- Leaderboards for the record-only games: The Descent (blank-atlas) and The Ascent rank their best score, Front
-- Wars ranks its wins. They are still NOT in arcade_reward_rules / _arcade_board_valid, so they get no coin
-- runs, streaks, Tournaments or Wagers; only this reader and the wins counter below are new.

begin;

-- Front Wars victories (reaching the win share), one counter per player and game. Only the owner reads it; the
-- counter moves through record_arcade_win only.
create table public.arcade_wins (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  game text not null,
  wins integer not null default 0,
  last_win_at timestamptz not null default now(),
  primary key (user_id, game),
  constraint arcade_wins_game_valid check (game = 'front-wars' and wins >= 0)
);

alter table public.arcade_wins enable row level security;
create policy owner_read on public.arcade_wins for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.arcade_wins from public, anon, authenticated;
grant select on public.arcade_wins to authenticated;
grant all on public.arcade_wins to service_role;

-- Adds one win; returns the new total.
create function public.record_arcade_win(p_game text)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_wins integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_game is distinct from 'front-wars' then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;
  insert into public.arcade_wins (user_id, game, wins, last_win_at)
    values (v_user, p_game, 1, now())
    on conflict (user_id, game) do update set wins = public.arcade_wins.wins + 1, last_win_at = now()
    returning wins into v_wins;
  return v_wins;
end;
$$;
revoke all on function public.record_arcade_win(text) from public, anon;
grant execute on function public.record_arcade_win(text) to authenticated;

-- Top players and the caller's own placement, in the shape arcade_leaderboard returns. Descent and Ascent rank
-- the saved best score (ties go to whoever got there first); Front Wars ranks wins (ties likewise).
create function public.arcade_record_leaderboard(p_game text, p_limit integer default 25)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_game not in ('front-wars', 'blank-atlas', 'the-ascent') then
    raise exception 'Unknown leaderboard.' using errcode = '22023';
  end if;

  with entries as (
    select w.user_id, w.wins as score, w.last_win_at as achieved_at
      from public.arcade_wins w
     where p_game = 'front-wars' and w.game = 'front-wars' and w.wins > 0
    union all
    select r.user_id, r.score, r.achieved_at
      from public.arcade_records r
     where p_game <> 'front-wars' and r.game = p_game and r.variant = '' and r.score > 0
  ),
  ranked as (
    select e.*, row_number() over (order by e.score desc, e.achieved_at, e.user_id) as rank
      from entries e
  ),
  shown as (
    select r.*, jsonb_build_object('rank', r.rank, 'name', public._arcade_name(r.user_id), 'score', r.score,
             'hints', null, 'achievedAt', r.achieved_at, 'you', r.user_id = v_user) as item
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
revoke all on function public.arcade_record_leaderboard(text, integer) from public, anon;
grant execute on function public.arcade_record_leaderboard(text, integer) to authenticated;

commit;
