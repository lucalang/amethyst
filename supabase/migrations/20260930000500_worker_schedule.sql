-- Scheduling: pg_cron wakes the Edge Function worker only when there is due
-- work, and periodically enqueues MAL list refreshes. The worker URL and
-- secret are read from Supabase Vault at run time, so each environment
-- configures its own values (see README "Worker scheduling").

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function public.invoke_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'archive_worker_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'archive_worker_secret';
  if v_url is null or v_secret is null then
    return; -- worker not configured for this environment
  end if;

  if not exists (select 1 from public.jobs where status in ('queued', 'running') and run_after <= now())
     and not exists (select 1 from public.sync_outbox where state = 'pending' and not_before <= now())
     and not exists (select 1 from public.sync_outbox where state = 'in_flight' and locked_until < now()) then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 5000
  );
end;
$$;

create function public.enqueue_scheduled_mal_pulls() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.jobs (user_id, kind, input, dedupe_key)
  select a.user_id, 'mal_pull', jsonb_build_object('reason', 'scheduled'), 'mal_pull'
  from public.mal_accounts a
  where a.status = 'connected'
    and a.initial_sync = 'approved'
    and (a.last_pull_at is null or a.last_pull_at < now() - interval '6 hours')
  on conflict do nothing;
  get diagnostics v_count = row_count;
  perform public.purge_expired_server_state();
  return v_count;
end;
$$;

revoke execute on function public.invoke_worker() from public, anon, authenticated;
revoke execute on function public.enqueue_scheduled_mal_pulls() from public, anon, authenticated;
grant execute on function public.invoke_worker() to service_role;
grant execute on function public.enqueue_scheduled_mal_pulls() to service_role;

select cron.schedule('archive-worker', '* * * * *', 'select public.invoke_worker()');
select cron.schedule('archive-mal-refresh', '*/30 * * * *', 'select public.enqueue_scheduled_mal_pulls()');
