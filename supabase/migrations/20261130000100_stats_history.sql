create table public.stats_snapshots (
  scope text not null check (scope in ('amethyst', 'personal')),
  user_id uuid references public.users(id) on delete cascade,
  day date not null,
  captured_at timestamptz not null default now(),
  values jsonb not null,
  constraint stats_snapshot_owner check ((scope = 'amethyst' and user_id is null) or (scope = 'personal' and user_id is not null)),
  unique nulls not distinct (scope, user_id, day)
);
alter table public.stats_snapshots enable row level security;
create policy stats_history_read on public.stats_snapshots for select to authenticated
  using (scope = 'amethyst' or user_id = (select auth.uid()));
revoke all on public.stats_snapshots from public, anon, authenticated;
grant select on public.stats_snapshots to authenticated;
grant all on public.stats_snapshots to service_role;

create function public.stats_history(p_scope text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_current jsonb;
  v_values jsonb;
begin
  if v_uid is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  if p_scope not in ('amethyst', 'personal') or p_scope is null then
    raise exception 'invalid stats scope' using errcode = '22023';
  end if;
  v_owner := case when p_scope = 'personal' then v_uid else null end;
  perform pg_advisory_xact_lock(hashtextextended('stats:' || p_scope || coalesce(v_owner::text, ''), 0));
  v_current := case when p_scope = 'personal' then public.my_stats() else public.amethyst_stats() end;
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into v_values
    from jsonb_each(v_current) where jsonb_typeof(value) = 'number';
  insert into public.stats_snapshots (scope, user_id, day, captured_at, values)
    values (p_scope, v_owner, (now() at time zone 'UTC')::date, now(), v_values)
    on conflict (scope, user_id, day) do update set values = excluded.values, captured_at = excluded.captured_at;
  return jsonb_build_object('current', v_current, 'history', (
    select coalesce(jsonb_agg(jsonb_build_object('date', day, 'values', values) order by day), '[]'::jsonb)
    from public.stats_snapshots where scope = p_scope and user_id is not distinct from v_owner
  ));
end;
$$;
revoke execute on function public.stats_history(text) from public, anon;
grant execute on function public.stats_history(text) to authenticated;

create function public.capture_daily_stats()
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_first boolean := true;
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
begin
  for v_user in select id from public.users order by id loop
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user)::text, true);
    perform public.stats_history('personal');
    if v_first then
      perform public.stats_history('amethyst');
      v_first := false;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end;
$$;
revoke execute on function public.capture_daily_stats() from public, anon, authenticated;
grant execute on function public.capture_daily_stats() to service_role;
select cron.schedule('amethyst-stats-daily', '55 23 * * *', 'select public.capture_daily_stats()');
select public.capture_daily_stats();