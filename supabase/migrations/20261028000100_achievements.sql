-- Recognition-only achievements, scoped to each account.

create table public.achievement_definitions (
  id text primary key,
  metric text not null,
  target integer not null check (target > 0),
  display_order integer not null
);

insert into public.achievement_definitions (id, metric, target, display_order) values
  ('four-figures', 'four_figures', 1024, 1),
  ('double-trouble', 'double_trouble', 2048, 2),
  ('taking-flight', 'flutter_obstacles', 10, 3),
  ('thread-the-needle', 'flutter_obstacles', 50, 4),
  ('growing-appetite', 'snake_length', 20, 5),
  ('running-out-of-room', 'snake_length', 50, 6),
  ('first-solution', 'sudoku_solved', 1, 7),
  ('hard-thinking', 'sudoku_hard_solved', 1, 8),
  ('combo-starter', 'fruit_combo', 3, 9),
  ('precision', 'fruit_precision', 1, 10),
  ('skyward', 'stacker_height', 20, 11),
  ('perfect-alignment', 'stacker_streak', 5, 12),
  ('first-chapter', 'first_chapter', 1, 13),
  ('blueprint', 'blueprint', 1, 14),
  ('made-it-mine', 'made_it_mine', 1, 15),
  ('checked-off', 'checked_off', 10, 16),
  ('the-collector', 'the_collector', 100, 17),
  ('collection-complete', 'collection_complete', 100, 18),
  ('arcade-explorer', 'arcade_explorer', 6, 19),
  ('personal-best', 'personal_best', 3, 20),
  ('gallery-visitor', 'gallery_visitor', 1, 21),
  ('closer-look', 'closer_look', 1, 22);

alter table public.achievement_definitions enable row level security;
create policy authenticated_read on public.achievement_definitions for select to authenticated using (true);
grant select on public.achievement_definitions to authenticated;

create table public.user_achievement_progress (
  user_id uuid not null references public.users (id) on delete cascade,
  achievement_id text not null references public.achievement_definitions (id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.user_achievements (
  user_id uuid not null references public.users (id) on delete cascade,
  achievement_id text not null references public.achievement_definitions (id) on delete cascade,
  earned_at timestamptz not null default now(),
  source text not null check (source in ('event', 'backfill')),
  notification_claimed_at timestamptz,
  primary key (user_id, achievement_id)
);

alter table public.user_achievement_progress enable row level security;
alter table public.user_achievements enable row level security;
create policy owner_read on public.user_achievement_progress for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_read on public.user_achievements for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_achievement_progress, public.user_achievements from public, anon, authenticated;
grant select on public.user_achievement_progress, public.user_achievements to authenticated;

create function public._set_achievement_progress(
  p_user uuid, p_id text, p_value integer, p_details jsonb default '{}'::jsonb, p_keep_best boolean default false
) returns void
language sql security definer set search_path = '' as $$
  insert into public.user_achievement_progress as current (user_id, achievement_id, progress, details)
  select p_user, d.id, greatest(0, p_value), coalesce(p_details, '{}'::jsonb)
  from public.achievement_definitions d where d.id = p_id
  on conflict (user_id, achievement_id) do update set
    progress = case when p_keep_best then greatest(current.progress, excluded.progress) else excluded.progress end,
    details = case when p_keep_best and current.progress > excluded.progress then current.details else excluded.details end,
    updated_at = now();
$$;

create function public._award_eligible_achievements(p_user uuid, p_source text, p_notify boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_unlocked jsonb;
begin
  with inserted as (
    insert into public.user_achievements (user_id, achievement_id, source, notification_claimed_at)
    select p_user, d.id, p_source, case when p_notify then null else now() end
    from public.achievement_definitions d
    join public.user_achievement_progress p on p.user_id = p_user and p.achievement_id = d.id
    where p.progress >= d.target
    on conflict (user_id, achievement_id) do nothing
    returning achievement_id, earned_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', achievement_id, 'earnedAt', earned_at)), '[]'::jsonb)
    into v_unlocked from inserted;
  return v_unlocked;
end;
$$;

revoke all on function public._set_achievement_progress(uuid, text, integer, jsonb, boolean) from public, anon, authenticated;
revoke all on function public._award_eligible_achievements(uuid, text, boolean) from public, anon, authenticated;

create function public.record_achievement_event(p_event text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_source text := case when p_event = 'backfill' then 'backfill' else 'event' end;
  v_games jsonb;
  v_game text;
  v_value integer;
  v_total integer;
  v_checked integer;
  v_complete integer;
  v_collection_percent integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_event = 'game_started' then
    v_game := p_payload->>'game';
    if v_game not in ('2048', 'flutter', 'snake', 'sudoku', 'fruit-slice', 'stacker') then
      raise exception 'unsupported game' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(game_id order by game_id), '[]'::jsonb) into v_games
    from (
      select distinct value as game_id
      from public.user_achievement_progress p,
           lateral jsonb_array_elements_text(coalesce(p.details->'games', '[]'::jsonb))
      where p.user_id = v_user and p.achievement_id = 'arcade-explorer'
      union select v_game
    ) games;
    perform public._set_achievement_progress(v_user, 'arcade-explorer', jsonb_array_length(v_games), jsonb_build_object('games', v_games));

  elsif p_event = 'run_finished' then
    v_game := p_payload->>'game';
    if v_game = '2048' then
      v_value := greatest(0, (p_payload->>'maxTile')::integer);
      perform public._set_achievement_progress(v_user, 'four-figures', least(v_value, 1024), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'double-trouble', least(v_value, 2048), '{}'::jsonb, true);
    elsif v_game = 'flutter' then
      v_value := greatest(0, (p_payload->>'obstacles')::integer);
      perform public._set_achievement_progress(v_user, 'taking-flight', least(v_value, 10), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'thread-the-needle', least(v_value, 50), '{}'::jsonb, true);
    elsif v_game = 'snake' then
      v_value := greatest(3, (p_payload->>'length')::integer);
      perform public._set_achievement_progress(v_user, 'growing-appetite', least(v_value, 20), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'running-out-of-room', least(v_value, 50), '{}'::jsonb, true);
    elsif v_game = 'fruit-slice' then
      v_value := greatest(0, (p_payload->>'maxCombo')::integer);
      perform public._set_achievement_progress(v_user, 'combo-starter', least(v_value, 3), '{}'::jsonb, true);
      v_value := case when p_payload->>'reason' = 'misses' and (p_payload->>'fruitsSliced')::integer >= 25 then 1 else 0 end;
      perform public._set_achievement_progress(v_user, 'precision', v_value, '{}'::jsonb, true);
    elsif v_game = 'stacker' then
      v_value := greatest(0, (p_payload->>'height')::integer);
      perform public._set_achievement_progress(v_user, 'skyward', least(v_value, 20), '{}'::jsonb, true);
      v_value := greatest(0, (p_payload->>'perfectStreak')::integer);
      perform public._set_achievement_progress(v_user, 'perfect-alignment', least(v_value, 5), '{}'::jsonb, true);
    else
      raise exception 'unsupported game result' using errcode = '22023';
    end if;

  elsif p_event = 'sudoku_completed' then
    perform public._set_achievement_progress(v_user, 'first-solution', 1);
    if p_payload->>'difficulty' = 'hard' then
      perform public._set_achievement_progress(v_user, 'hard-thinking', 1);
    end if;

  elsif p_event = 'gallery_open' then
    perform public._set_achievement_progress(v_user, 'gallery-visitor', 1);

  elsif p_event = 'manual_rotation' then
    perform public._set_achievement_progress(v_user, 'closer-look', 1);

  elsif p_event = 'archive_snapshot' or p_event = 'backfill' then
    perform public._set_achievement_progress(v_user, 'first-chapter', case when exists (
      select 1 from public.workspace_nodes n where n.user_id = v_user and n.kind = 'note' and btrim(n.content) <> ''
    ) then 1 else 0 end);
    perform public._set_achievement_progress(v_user, 'blueprint', case when exists (
      select 1 from public.workspace_templates t where t.user_id = v_user
    ) then 1 else 0 end);
    perform public._set_achievement_progress(v_user, 'made-it-mine', case when exists (
      select 1 from public.collections c where c.user_id = v_user and (c.icon is not null or c.accent_color is not null or c.banner_url is not null)
    ) then 1 else 0 end);

    select coalesce(max(case when t.items_total >= 10 and t.items_checked = t.items_total then 10 else least(t.items_checked, 9) end), 0)
      into v_complete
    from public.workspace_tree t
    where t.user_id = v_user and t.kind = 'checklist' and t.items_total >= 10;
    perform public._set_achievement_progress(v_user, 'checked-off', v_complete);

    select coalesce(sum(t.items_checked), 0)::integer into v_checked
    from public.workspace_tree t
    where t.user_id = v_user and t.kind <> 'folder' and t.include_in_cover_progress;
    perform public._set_achievement_progress(v_user, 'the-collector', v_checked);

    select coalesce(max(case when totals.total >= 20 then floor(totals.checked * 100.0 / totals.total)::integer else 0 end), 0)
      into v_collection_percent
    from (
      select t.entry_id, sum(t.items_total)::integer as total, sum(t.items_checked)::integer as checked
      from public.workspace_tree t
      where t.user_id = v_user and t.kind <> 'folder' and t.include_in_cover_progress
      group by t.entry_id
    ) totals;
    perform public._set_achievement_progress(v_user, 'collection-complete', v_collection_percent);

    if p_event = 'backfill' then
      select coalesce(jsonb_agg(game_id order by game_id), '[]'::jsonb) into v_games
      from (select distinct case when r.game = 'sudoku' then 'sudoku' else r.game end as game_id
        from public.arcade_records r where r.user_id = v_user and r.score > 0
          and r.game in ('2048', 'flutter', 'snake', 'sudoku', 'fruit-slice', 'stacker')) games;
      perform public._set_achievement_progress(v_user, 'arcade-explorer', jsonb_array_length(v_games), jsonb_build_object('games', v_games));

      select coalesce(max(score), 0) into v_value from public.arcade_records where user_id = v_user and game = 'flutter';
      perform public._set_achievement_progress(v_user, 'taking-flight', least(v_value, 10), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'thread-the-needle', least(v_value, 50), '{}'::jsonb, true);
      select coalesce(max(score + 3), 3) into v_value from public.arcade_records where user_id = v_user and game = 'snake';
      perform public._set_achievement_progress(v_user, 'growing-appetite', least(v_value, 20), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'running-out-of-room', least(v_value, 50), '{}'::jsonb, true);
      select coalesce(max(score), 0) into v_value from public.arcade_records where user_id = v_user and game = 'stacker';
      perform public._set_achievement_progress(v_user, 'skyward', least(v_value, 20), '{}'::jsonb, true);
      if exists (select 1 from public.arcade_records where user_id = v_user and game = 'sudoku') then
        perform public._set_achievement_progress(v_user, 'first-solution', 1);
      end if;
      if exists (select 1 from public.arcade_records where user_id = v_user and game = 'sudoku' and variant = 'hard') then
        perform public._set_achievement_progress(v_user, 'hard-thinking', 1);
      end if;
    end if;

  else
    raise exception 'unsupported achievement event' using errcode = '22023';
  end if;

  return public._award_eligible_achievements(v_user, v_source, p_event <> 'backfill');
end;
$$;

revoke all on function public.record_achievement_event(text, jsonb) from public, anon;
grant execute on function public.record_achievement_event(text, jsonb) to authenticated;

create function public.claim_achievement_notifications()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_claimed jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  with claimed as (
    update public.user_achievements a set notification_claimed_at = now()
    where a.user_id = v_user and a.notification_claimed_at is null and a.source = 'event'
    returning a.achievement_id, a.earned_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', achievement_id, 'earnedAt', earned_at)), '[]'::jsonb)
    into v_claimed from claimed;
  return v_claimed;
end;
$$;

revoke all on function public.claim_achievement_notifications() from public, anon;
grant execute on function public.claim_achievement_notifications() to authenticated;

drop function public.record_arcade_score(text, text, integer);
create function public.record_arcade_score(p_game text, p_variant text, p_score integer)
returns table (best integer, improved boolean, had_previous boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_variant text := coalesce(p_variant, '');
  v_previous integer;
  v_best integer;
  v_improved boolean := false;
  v_games jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('arcade-record:' || v_user::text || ':' || p_game || ':' || v_variant, 0));
  select r.score into v_previous from public.arcade_records r
    where r.user_id = v_user and r.game = p_game and r.variant = v_variant for update;

  if v_previous is null then
    insert into public.arcade_records (user_id, game, variant, score)
      values (v_user, p_game, v_variant, p_score);
    v_best := p_score;
    v_improved := true;
  elsif (p_game = 'sudoku' and p_score < v_previous) or (p_game <> 'sudoku' and p_score > v_previous) then
    update public.arcade_records set score = p_score, achieved_at = now()
      where user_id = v_user and game = p_game and variant = v_variant;
    v_best := p_score;
    v_improved := true;
  else
    v_best := v_previous;
  end if;

  if v_previous is not null and v_improved then
    select coalesce(jsonb_agg(game_id order by game_id), '[]'::jsonb) into v_games
    from (
      select distinct value as game_id
      from public.user_achievement_progress p,
           lateral jsonb_array_elements_text(coalesce(p.details->'games', '[]'::jsonb))
      where p.user_id = v_user and p.achievement_id = 'personal-best'
      union select case when p_game = 'sudoku' then 'sudoku' else p_game end
    ) games;
    perform public._set_achievement_progress(v_user, 'personal-best', jsonb_array_length(v_games), jsonb_build_object('games', v_games));
    perform public._award_eligible_achievements(v_user, 'event', true);
  end if;

  return query select v_best, v_improved, v_previous is not null;
end;
$$;

revoke all on function public.record_arcade_score(text, text, integer) from public, anon;
grant execute on function public.record_arcade_score(text, text, integer) to authenticated, service_role;