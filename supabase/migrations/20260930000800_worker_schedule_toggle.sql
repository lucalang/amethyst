-- Lets trusted server tooling (service role only) pause the scheduled worker,
-- e.g. while automated tests drive the worker directly with mocked providers.
create function public.set_worker_schedule_active(p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_job bigint;
begin
  select jobid into v_job from cron.job where jobname = 'archive-worker';
  if v_job is not null then
    perform cron.alter_job(job_id := v_job, active := p_active);
  end if;
end;
$$;

revoke execute on function public.set_worker_schedule_active(boolean) from public, anon, authenticated;
grant execute on function public.set_worker_schedule_active(boolean) to service_role;
