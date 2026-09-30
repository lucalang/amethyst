-- Shared public-catalog cache (MyAnimeList metadata via Jikan) and the durable
-- job queue. Catalog tables hold only public provider data; they are readable
-- by signed-in users and writable only by the server-side worker.

create table public.catalog_anime (
  mal_id bigint primary key check (mal_id > 0),
  title text not null,
  title_english text,
  media_type text,
  episodes integer check (episodes is null or episodes >= 0),
  airing_status text,
  aired_from timestamptz,
  year integer,
  score numeric(4, 2),
  image_url text,
  synopsis text,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  fetched_at timestamptz not null default now()
);

create table public.catalog_relations (
  from_mal_id bigint not null check (from_mal_id > 0),
  to_mal_id bigint not null check (to_mal_id > 0),
  relation text not null,
  to_type text not null default 'anime',
  to_name text,
  fetched_at timestamptz not null default now(),
  primary key (from_mal_id, to_mal_id, relation)
);

create table public.catalog_characters (
  anime_mal_id bigint not null check (anime_mal_id > 0),
  character_mal_id bigint not null check (character_mal_id > 0),
  name text not null,
  image_url text,
  role text,
  favorites integer,
  position integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (anime_mal_id, character_mal_id)
);

create index catalog_characters_anime_idx on public.catalog_characters (anime_mal_id, position);

alter table public.catalog_anime enable row level security;
alter table public.catalog_relations enable row level security;
alter table public.catalog_characters enable row level security;
create policy catalog_read on public.catalog_anime for select to authenticated using (true);
create policy catalog_read on public.catalog_relations for select to authenticated using (true);
create policy catalog_read on public.catalog_characters for select to authenticated using (true);

revoke all on public.catalog_anime, public.catalog_relations, public.catalog_characters from anon, authenticated, public;
grant select on public.catalog_anime, public.catalog_relations, public.catalog_characters to authenticated;
grant all on public.catalog_anime, public.catalog_relations, public.catalog_characters to service_role;

-- Raw provider response cache, keyed by provider/endpoint/id/page. Server only.
create table public.provider_cache (
  provider text not null,
  endpoint text not null,
  resource_id text not null,
  page integer not null default 1,
  status integer not null,
  payload jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (provider, endpoint, resource_id, page)
);
create index provider_cache_expiry_idx on public.provider_cache (expires_at);

-- Shared throttle so every worker invocation respects provider rate limits.
create table public.provider_throttle (
  provider text primary key,
  next_slot_at timestamptz not null default now(),
  blocked_until timestamptz
);

alter table public.provider_cache enable row level security;
alter table public.provider_throttle enable row level security;
revoke all on public.provider_cache, public.provider_throttle from anon, authenticated, public;
grant all on public.provider_cache, public.provider_throttle to service_role;

-- Reserve the next request slot for a provider. Returns how many milliseconds
-- the caller must wait before sending (computed on the database clock).
create function public.reserve_provider_slot(p_provider text, p_interval_ms integer)
returns integer
language plpgsql set search_path = '' as $$
declare
  v_slot timestamptz;
  v_interval interval := make_interval(secs => greatest(p_interval_ms, 0) / 1000.0);
begin
  insert into public.provider_throttle as t (provider, next_slot_at)
  values (p_provider, now() + v_interval)
  on conflict (provider) do update
    set next_slot_at = greatest(t.next_slot_at, now(), coalesce(t.blocked_until, now())) + v_interval
  returning next_slot_at - v_interval into v_slot;
  return greatest(0, ceil(extract(epoch from (v_slot - clock_timestamp())) * 1000))::integer;
end;
$$;

-- Push the shared slot forward after a provider asks us to back off (Retry-After).
create function public.block_provider(p_provider text, p_retry_after_ms integer)
returns void
language sql set search_path = '' as $$
  insert into public.provider_throttle as t (provider, next_slot_at, blocked_until)
  values (
    p_provider,
    now() + make_interval(secs => greatest(p_retry_after_ms, 0) / 1000.0),
    now() + make_interval(secs => greatest(p_retry_after_ms, 0) / 1000.0)
  )
  on conflict (provider) do update
    set blocked_until = greatest(coalesce(t.blocked_until, excluded.blocked_until), excluded.blocked_until),
        next_slot_at = greatest(t.next_slot_at, excluded.blocked_until);
$$;

-- ---------------------------------------------------------------------------
-- Durable jobs (franchise imports and MAL list pulls)
-- ---------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind text not null check (kind in ('franchise_import', 'mal_pull')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input jsonb not null default '{}' check (jsonb_typeof(input) = 'object' and pg_column_size(input) < 4096),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  checkpoint jsonb not null default '{}' check (jsonb_typeof(checkpoint) = 'object'),
  progress jsonb not null default '{}' check (jsonb_typeof(progress) = 'object'),
  warnings jsonb not null default '[]' check (jsonb_typeof(warnings) = 'array'),
  result jsonb not null default '{}' check (jsonb_typeof(result) = 'object'),
  attempts integer not null default 0,
  max_attempts integer not null default 6,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, id)
);

create unique index jobs_one_active_per_key on public.jobs (user_id, dedupe_key)
  where status in ('queued', 'running');
create index jobs_claimable_idx on public.jobs (run_after) where status in ('queued', 'running');
create index jobs_user_recent_idx on public.jobs (user_id, created_at desc);

create trigger jobs_set_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
create policy jobs_owner_read on public.jobs for select to authenticated
  using ((select auth.uid()) = user_id);
-- Users may enqueue jobs for themselves; status, checkpoints and results are
-- only writable by the worker (column privileges below).
create policy jobs_owner_enqueue on public.jobs for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'queued');
create policy jobs_owner_cancel on public.jobs for update to authenticated
  using ((select auth.uid()) = user_id and status in ('queued', 'running'))
  with check ((select auth.uid()) = user_id and status = 'cancelled');

revoke all on public.jobs from anon, authenticated, public;
grant select on public.jobs to authenticated;
grant insert (kind, input, dedupe_key) on public.jobs to authenticated;
grant update (status) on public.jobs to authenticated;
grant all on public.jobs to service_role;

-- Claim runnable jobs with a lease. Expired leases are reclaimed, so a crashed
-- worker never strands a job.
create function public.claim_jobs(p_worker text, p_limit integer, p_lease_seconds integer)
returns setof public.jobs
language sql set search_path = '' as $$
  update public.jobs j
     set status = 'running',
         locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lease_seconds)
   where j.id in (
     select c.id from public.jobs c
      where c.run_after <= now()
        and (c.status = 'queued' or (c.status = 'running' and c.locked_until < now()))
      order by c.run_after, c.created_at
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning j.*;
$$;

revoke execute on function public.reserve_provider_slot(text, integer) from public, anon, authenticated;
revoke execute on function public.block_provider(text, integer) from public, anon, authenticated;
revoke execute on function public.claim_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_provider_slot(text, integer) to service_role;
grant execute on function public.block_provider(text, integer) to service_role;
grant execute on function public.claim_jobs(text, integer, integer) to service_role;
