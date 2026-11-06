create or replace function public.amethyst_stats()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
    'cosmetics_granted', (select count(*) from public.user_cosmetics)
  );
end;
$$;

update public.stats_snapshots set values = values - 'cosmetics_granted'
  where scope = 'amethyst' and day < (now() at time zone 'UTC')::date;
select public.capture_daily_stats();