-- Stats catch up with newer features: Arcade streaks, cases, tournaments, wagers, season quests and spin wheels.
-- Both functions keep their signatures and grants; the new keys are plain counts, so stats_history snapshots
-- them like every other number from today on (no history is invented for earlier days).

CREATE OR REPLACE FUNCTION public.my_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'member_since', (select created_at from public.users where id = v_uid),
    'collections', (select count(*) from public.collections where user_id = v_uid),
    'entries', (select count(*) from public.entries where user_id = v_uid),
    'entries_30d', (select count(*) from public.entries where user_id = v_uid and created_at > now() - interval '30 days'),
    'entries_completed', (select count(*) from public.entry_workspace_summary
      where user_id = v_uid and checklist_total > 0 and checklist_checked = checklist_total),
    'entries_in_progress', (select count(*) from public.entry_workspace_summary
      where user_id = v_uid and checklist_checked > 0 and checklist_checked < checklist_total),
    'progress_done', (select coalesce(sum(checklist_checked), 0) from public.entry_workspace_summary where user_id = v_uid),
    'progress_total', (select coalesce(sum(checklist_total), 0) from public.entry_workspace_summary where user_id = v_uid),
    'pinned', (select count(*) from public.entry_pins where user_id = v_uid),
    'notes', (select count(*) from public.workspace_nodes where user_id = v_uid and kind = 'note'),
    'checklists', (select count(*) from public.workspace_nodes where user_id = v_uid and kind = 'checklist'),
    'checklist_items', (select count(*) from public.workspace_checklist_items where user_id = v_uid),
    'checklist_done', (select count(*) from public.workspace_checklist_items where user_id = v_uid and checked),
    'checklist_starred_open', (select count(*) from public.workspace_checklist_items where user_id = v_uid and starred and not checked),
    'quick_notes', (select count(*) from public.quick_notes where user_id = v_uid),
    'by_collection', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'accent', c.accent_color,
        'entries', coalesce(s.entries, 0), 'completed', coalesce(s.completed, 0),
        'done', coalesce(s.done, 0), 'total', coalesce(s.total, 0)
      ) order by c.position, c.created_at), '[]'::jsonb)
      from public.collections c
      left join lateral (
        select count(*) as entries,
          count(*) filter (where w.checklist_total > 0 and w.checklist_checked = w.checklist_total) as completed,
          sum(w.checklist_checked) as done, sum(w.checklist_total) as total
        from public.entries e
        join public.entry_workspace_summary w on w.entry_id = e.id
        where e.user_id = v_uid and e.collection_id = c.id
      ) s on true
      where c.user_id = v_uid
    ),
    'todo_total', (select count(*) from public.tasks where user_id = v_uid),
    'todo_completed', (select count(*) from public.tasks where user_id = v_uid and completed_at is not null),
    'todo_completed_7d', (select count(*) from public.tasks where user_id = v_uid and completed_at > now() - interval '7 days'),
    'todo_important_open', (select count(*) from public.tasks where user_id = v_uid and important and completed_at is null),
    'coins_balance', (select coalesce(balance, 0) from public.coin_wallets where user_id = v_uid),
    'coins_in', (select coalesce(sum(amount), 0) from public.coin_transactions where user_id = v_uid and amount > 0),
    'coins_out', (select coalesce(-sum(amount), 0) from public.coin_transactions where user_id = v_uid and amount < 0),
    'runs', (select count(*) from public.arcade_runs where user_id = v_uid and finished_at is not null),
    'favorite_game', (select game from public.arcade_runs where user_id = v_uid and finished_at is not null
      group by game order by count(*) desc, game limit 1),
    'records', (select count(*) from public.arcade_records where user_id = v_uid),
    'daily_sudokus', (select count(*) from public.sudoku_daily_results where user_id = v_uid),
    'slot_spins', (select count(*) from public.slot_spins where user_id = v_uid),
    'slot_best', (select coalesce(max(payout), 0) from public.slot_spins where user_id = v_uid),
    'achievements', (select count(*) from public.user_achievements where user_id = v_uid),
    'cosmetics', (select count(*) from public.user_cosmetics where user_id = v_uid),
    'codes', (select count(*) from public.secret_code_redemptions where user_id = v_uid),
    -- Arcade streaks: days with a played round, the longest run of consecutive days in any one game, games whose
    -- streak is still alive (played today or yesterday) and restores bought.
    'arcade_days', (select count(distinct play_date) from public.arcade_play_days where user_id = v_uid and source = 'play'),
    'streak_best', (select coalesce(max(len), 0) from (
      select count(*) as len from (
        select game, play_date - (row_number() over (partition by game order by play_date))::integer as grp
          from public.arcade_play_days where user_id = v_uid
      ) islands group by game, grp
    ) runs),
    'streak_active', (select count(distinct game) from public.arcade_play_days
      where user_id = v_uid and play_date >= (now() at time zone 'utc')::date - 1),
    'streak_restores', (select count(*) from public.arcade_streak_recoveries where user_id = v_uid),
    'cases_opened', (select coalesce(sum(quantity), 0) from public.loot_openings where user_id = v_uid),
    'tournaments_joined', (select count(*) from public.tournament_entries where user_id = v_uid),
    'tournament_podiums', (select count(*) from public.tournament_entries where user_id = v_uid and place between 1 and 3),
    'wagers_played', (select count(*) from public.wagers
      where v_uid in (host_id, opponent_id) and accepted_at is not null and ended_at is not null),
    'wagers_won', (select count(*) from public.wagers where winner_id = v_uid),
    'quests_claimed', (select count(*) from public.user_quests where user_id = v_uid and claimed_at is not null),
    'spin_wheels', (select count(*) from public.spin_wheels where user_id = v_uid)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.amethyst_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'collections', (select count(*) from public.collections),
    'entries', (select count(*) from public.entries),
    'checklist_tasks', (select count(*) from public.workspace_checklist_items),
    'todo_tasks', (select count(*) from public.tasks),
    'coins_arcade', (select coalesce(sum(amount), 0) from public.coin_transactions where kind = 'reward' and amount > 0),
    'coins_codes', (select coalesce(sum(amount), 0) from public.coin_transactions where kind = 'code' and amount > 0),
    'coins_achievements', (select coalesce(sum(amount), 0) from public.coin_transactions where kind = 'achievement' and amount > 0),
    'redemptions', (select count(*) from public.secret_code_redemptions),
    'redemption_pairs', (select count(*) from (select distinct code_id, user_id from public.secret_code_redemptions) pairs),
    'cosmetics_granted', (select count(*) from public.user_cosmetics),
    'arcade_runs', (select count(*) from public.arcade_runs where finished_at is not null),
    'cases_opened', (select coalesce(sum(quantity), 0) from public.loot_openings),
    'tournament_entries', (select count(*) from public.tournament_entries),
    'wagers_played', (select count(*) from public.wagers where accepted_at is not null and ended_at is not null),
    'quests_claimed', (select count(*) from public.user_quests where claimed_at is not null),
    'spin_wheels', (select count(*) from public.spin_wheels)
  );
end;
$function$;
