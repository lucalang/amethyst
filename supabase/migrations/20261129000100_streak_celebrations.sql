-- One streak celebration per player and UTC day, claimed only after a server-verified completion today.
create table public.arcade_streak_celebrations (
  user_id uuid not null references public.users (id) on delete cascade,
  celebrate_date date not null,
  game text not null check (game ~ '^[a-z0-9-]{1,24}$'),
  streak integer not null check (streak > 0),
  created_at timestamptz not null default now(),
  primary key (user_id, celebrate_date)
);

alter table public.arcade_streak_celebrations enable row level security;
create policy owner_read on public.arcade_streak_celebrations for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.arcade_streak_celebrations from public, anon, authenticated;
grant select on public.arcade_streak_celebrations to authenticated;
grant all on public.arcade_streak_celebrations to service_role;

-- Returns {celebrate, streak}; celebrate is true for exactly one call per player and UTC day.
create function public.claim_streak_celebration(p_game text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := public._arcade_utc_today();
  v_streak integer;
  v_inserted integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_game is null or not public._arcade_game_known(p_game) then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;

  if not (
    (p_game <> 'sudoku' and exists (
      select 1 from public.arcade_runs
       where user_id = v_user and game = p_game and outcome in ('paid', 'unpaid')
         and finished_at is not null and (finished_at at time zone 'utc')::date = v_today))
    or (p_game = 'sudoku' and exists (
      select 1 from public.sudoku_games
       where user_id = v_user and completed_at is not null and (completed_at at time zone 'utc')::date = v_today))
  ) then
    return jsonb_build_object('celebrate', false, 'streak', 0);
  end if;

  v_streak := public._arcade_streak_ending(v_user, p_game, v_today);
  if v_streak = 0 then
    return jsonb_build_object('celebrate', false, 'streak', 0);
  end if;

  insert into public.arcade_streak_celebrations (user_id, celebrate_date, game, streak)
  values (v_user, v_today, p_game, v_streak)
  on conflict (user_id, celebrate_date) do nothing;
  get diagnostics v_inserted = row_count;
  return jsonb_build_object('celebrate', v_inserted = 1, 'streak', v_streak);
end;
$$;
revoke all on function public.claim_streak_celebration(text) from public, anon;
grant execute on function public.claim_streak_celebration(text) to authenticated;
