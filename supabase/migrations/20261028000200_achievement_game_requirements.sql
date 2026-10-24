-- Freeze Arcade Explorer to the six games that existed when the achievement shipped.
create table public.achievement_game_requirements (
  achievement_id text not null references public.achievement_definitions (id) on delete cascade,
  game_id text not null,
  primary key (achievement_id, game_id)
);

insert into public.achievement_game_requirements (achievement_id, game_id) values
  ('arcade-explorer', '2048'),
  ('arcade-explorer', 'flutter'),
  ('arcade-explorer', 'snake'),
  ('arcade-explorer', 'sudoku'),
  ('arcade-explorer', 'fruit-slice'),
  ('arcade-explorer', 'stacker');

alter table public.achievement_game_requirements enable row level security;
revoke all on public.achievement_game_requirements from public, anon, authenticated;

create function public._merge_achievement_game_progress()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_existing jsonb := '{}'::jsonb;
  v_games jsonb;
begin
  if new.achievement_id not in ('arcade-explorer', 'personal-best') then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('achievement-progress:' || new.user_id::text || ':' || new.achievement_id, 0));
  select p.details into v_existing
  from public.user_achievement_progress p
  where p.user_id = new.user_id and p.achievement_id = new.achievement_id;

  select coalesce(jsonb_agg(game_id order by game_id), '[]'::jsonb) into v_games
  from (
    select distinct games.game_id
    from (
      select value as game_id from jsonb_array_elements_text(coalesce(v_existing->'games', '[]'::jsonb))
      union
      select value as game_id from jsonb_array_elements_text(coalesce(new.details->'games', '[]'::jsonb))
    ) games
    where new.achievement_id <> 'arcade-explorer'
       or exists (
         select 1 from public.achievement_game_requirements r
         where r.achievement_id = new.achievement_id and r.game_id = games.game_id
       )
  ) kept;

  new.details := jsonb_build_object('games', v_games);
  new.progress := jsonb_array_length(v_games);
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public._merge_achievement_game_progress() from public, anon, authenticated;
create trigger user_achievement_game_progress_merge
before insert or update on public.user_achievement_progress
for each row execute function public._merge_achievement_game_progress();