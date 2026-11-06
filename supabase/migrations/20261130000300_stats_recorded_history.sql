create function public.stats_recorded_history(p_scope text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_platform boolean := p_scope = 'amethyst';
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_scope not in ('amethyst', 'personal') or p_scope is null then
    raise exception 'invalid stats scope' using errcode = '22023';
  end if;
  with events as (
    select (created_at at time zone 'UTC')::date as day, 'collections' as key, 1::bigint as amount
      from public.collections where v_platform or user_id = v_uid
    union all
    select (created_at at time zone 'UTC')::date, 'entries', 1
      from public.entries where v_platform or user_id = v_uid
    union all
    select (created_at at time zone 'UTC')::date, case when v_platform then 'checklist_tasks' else 'checklist_items' end, 1
      from public.workspace_checklist_items where v_platform or user_id = v_uid
    union all
    select (created_at at time zone 'UTC')::date, case when v_platform then 'todo_tasks' else 'todo_total' end, 1
      from public.tasks where v_platform or user_id = v_uid
    union all
    select (created_at at time zone 'UTC')::date,
      case kind when 'reward' then 'coins_arcade' when 'code' then 'coins_codes' else 'coins_achievements' end, amount
      from public.coin_transactions where v_platform and amount > 0 and kind in ('reward', 'code', 'achievement')
    union all
    select (redeemed_at at time zone 'UTC')::date, case when v_platform then 'redemptions' else 'codes' end, 1
      from public.secret_code_redemptions where v_platform or user_id = v_uid
    union all
    select (acquired_at at time zone 'UTC')::date, case when v_platform then 'cosmetics_granted' else 'cosmetics' end, 1
      from public.user_cosmetics where v_platform or user_id = v_uid
    union all
    select (created_at at time zone 'UTC')::date, kind, 1
      from public.workspace_nodes where not v_platform and user_id = v_uid and kind in ('note', 'checklist')
    union all
    select (created_at at time zone 'UTC')::date, 'quick_notes', 1
      from public.quick_notes where not v_platform and user_id = v_uid
    union all
    select (completed_at at time zone 'UTC')::date, 'todo_completed', 1
      from public.tasks where not v_platform and user_id = v_uid and completed_at is not null
    union all
    select (finished_at at time zone 'UTC')::date, 'runs', 1
      from public.arcade_runs where not v_platform and user_id = v_uid and finished_at is not null
    union all
    select (completed_at at time zone 'UTC')::date, 'daily_sudokus', 1
      from public.sudoku_daily_results where not v_platform and user_id = v_uid
    union all
    select (created_at at time zone 'UTC')::date, 'slot_spins', 1
      from public.slot_spins where not v_platform and user_id = v_uid
    union all
    select (earned_at at time zone 'UTC')::date, 'achievements', 1
      from public.user_achievements where not v_platform and user_id = v_uid
    union all
    select (created_at at time zone 'UTC')::date, case when amount > 0 then 'coins_in' else 'coins_out' end, abs(amount::bigint)
      from public.coin_transactions where not v_platform and user_id = v_uid
  ), daily as (
    select day, key, sum(amount) as amount from events
      where day <= (now() at time zone 'UTC')::date group by day, key
  ), totals as (
    select day, key, sum(amount) over (partition by key order by day) as value from daily
  ), balances as (
    select distinct on ((created_at at time zone 'UTC')::date)
      (created_at at time zone 'UTC')::date as day, balance_after as value
      from public.coin_transactions where not v_platform and user_id = v_uid
        and created_at <= now()
      order by (created_at at time zone 'UTC')::date, created_at desc, id desc
  ), dates as (
    select distinct day from daily union select day from balances
  ), metrics as (
    select unnest(case when v_platform then array[
      'collections', 'entries', 'checklist_tasks', 'todo_tasks', 'coins_arcade', 'coins_codes', 'coins_achievements', 'redemptions', 'cosmetics_granted'
    ] else array[
      'collections', 'entries', 'checklist_items', 'todo_total', 'todo_completed', 'note', 'checklist', 'quick_notes',
      'runs', 'daily_sudokus', 'slot_spins', 'achievements', 'cosmetics', 'codes', 'coins_in', 'coins_out'
    ] end) as key
  ), history as (
    select dates.day, jsonb_object_agg(
      case metrics.key when 'note' then 'notes' when 'checklist' then 'checklists' else metrics.key end,
      coalesce((select value from totals where totals.key = metrics.key and totals.day <= dates.day order by totals.day desc limit 1), 0)
    ) || jsonb_strip_nulls(jsonb_build_object('coins_balance', (
      select value from balances where balances.day <= dates.day order by balances.day desc limit 1
    ))) as values
    from dates cross join metrics group by dates.day
  )
  select coalesce(jsonb_agg(jsonb_build_object('date', day, 'values', values) order by day), '[]'::jsonb)
    into v_result from history;
  return v_result;
end;
$$;
revoke execute on function public.stats_recorded_history(text) from public, anon;
grant execute on function public.stats_recorded_history(text) to authenticated;