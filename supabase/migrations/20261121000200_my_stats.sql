-- Personal stats: totals over the caller's own rows only.
-- Replaces the per-collection stats strip, which is no longer used.
drop function if exists public.collection_workspace_stats(uuid);

create function public.my_stats()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
    'codes', (select count(*) from public.secret_code_redemptions where user_id = v_uid)
  );
end;
$$;
revoke execute on function public.my_stats() from public, anon;
grant execute on function public.my_stats() to authenticated;
