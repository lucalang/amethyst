create table public.achievement_reconciliations (
  user_id uuid primary key references public.users (id) on delete cascade,
  version integer not null check (version > 0),
  reconciled_at timestamptz not null default now()
);

alter table public.achievement_reconciliations enable row level security;
create policy owner_read on public.achievement_reconciliations
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.achievement_reconciliations from public, anon, authenticated;
grant select on public.achievement_reconciliations to authenticated;

create function public.reconcile_achievements()
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_version constant integer := 1;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('achievement-reconcile:' || v_user::text, 0));
  if exists (
    select 1 from public.achievement_reconciliations r
    where r.user_id = v_user and r.version >= v_version
  ) then
    return false;
  end if;

  perform public.record_achievement_event('backfill', '{}'::jsonb);
  insert into public.achievement_reconciliations (user_id, version)
    values (v_user, v_version)
    on conflict (user_id) do update set version = excluded.version, reconciled_at = now();
  return true;
end;
$$;

revoke all on function public.reconcile_achievements() from public, anon;
grant execute on function public.reconcile_achievements() to authenticated;