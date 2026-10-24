-- Accept partial run progress (sent when a player leaves mid-run). Progress is
-- only ever raised, never lowered. Clean-run checks such as Precision still
-- need a finished run.
create or replace function public.record_achievement_event(p_event text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_source text := case when p_event = 'backfill' then 'backfill' else 'event' end;
  v_games jsonb;
  v_game text;
  v_value integer;
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

  elsif p_event in ('run_finished', 'run_progress') then
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
      if p_event = 'run_finished' then
        v_value := case when p_payload->>'reason' = 'misses' and (p_payload->>'fruitsSliced')::integer >= 25 then 1 else 0 end;
        perform public._set_achievement_progress(v_user, 'precision', v_value, '{}'::jsonb, true);
      end if;
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
      from (select distinct r.game as game_id
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
