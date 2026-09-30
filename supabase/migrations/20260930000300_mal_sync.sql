-- MyAnimeList connection, reconciliation and outbound sync.
-- Secrets (tokens, PKCE verifiers) live in server-only tables that anon and
-- authenticated roles cannot touch at all. Non-secret connection state is
-- readable by its owner.

-- Server-only: encrypted OAuth tokens (AES-256-GCM, key held by the server).
create table public.mal_credentials (
  user_id uuid primary key references public.users (id) on delete cascade,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  key_version smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Server-only: OAuth state bound to the initiating user, single use, expiring.
create table public.oauth_states (
  state_hash text primary key check (state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null default 'mal' check (provider = 'mal'),
  code_verifier_ciphertext text not null,
  redirect_path text not null default '/sync' check (redirect_path ~ '^/[A-Za-z0-9/_-]*$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_user_idx on public.oauth_states (user_id, created_at desc);

create trigger mal_credentials_set_updated_at before update on public.mal_credentials
  for each row execute function public.set_updated_at();

alter table public.mal_credentials enable row level security;
alter table public.oauth_states enable row level security;
revoke all on public.mal_credentials, public.oauth_states from anon, authenticated, public;
grant all on public.mal_credentials, public.oauth_states to service_role;

-- Owner-readable connection state.
create table public.mal_accounts (
  user_id uuid primary key references public.users (id) on delete cascade,
  mal_user_id bigint,
  mal_username text,
  status text not null default 'connected' check (status in ('connected', 'reconnect_required', 'disconnected')),
  initial_sync text not null default 'pending' check (initial_sync in ('pending', 'ready', 'approved')),
  outbound_enabled boolean not null default false,
  last_pull_at timestamptz,
  last_push_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mal_accounts_outbound_requires_approval check (not outbound_enabled or initial_sync = 'approved')
);

create trigger mal_accounts_set_updated_at before update on public.mal_accounts
  for each row execute function public.set_updated_at();

-- Remote list snapshot from the most recent pull (used for preview/reconcile).
create table public.mal_list_entries (
  user_id uuid not null references public.users (id) on delete cascade,
  mal_id bigint not null check (mal_id > 0),
  title text not null,
  image_url text,
  media_type text,
  num_episodes integer,
  status text check (status in ('watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch')),
  score smallint check (score between 0 and 10),
  num_episodes_watched integer not null default 0 check (num_episodes_watched >= 0),
  remote_updated_at timestamptz,
  pulled_at timestamptz not null default now(),
  primary key (user_id, mal_id)
);

-- Last state both sides agreed on, per linked media item.
create table public.sync_baselines (
  user_id uuid not null,
  media_item_id uuid not null,
  mal_id bigint not null check (mal_id > 0),
  status text,
  score smallint,
  episodes_watched integer,
  remote_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  primary key (user_id, media_item_id),
  foreign key (user_id, media_item_id) references public.media_items (user_id, id) on delete cascade
);

-- Durable, debounced, per-item serialized outbound queue.
create table public.sync_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  media_item_id uuid not null,
  mal_id bigint not null check (mal_id > 0),
  desired jsonb not null check (jsonb_typeof(desired) = 'object'),
  state text not null default 'pending' check (state in ('pending', 'in_flight', 'synced', 'failed', 'conflict', 'superseded')),
  attempts integer not null default 0,
  not_before timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (user_id, media_item_id) references public.media_items (user_id, id) on delete cascade
);
create unique index sync_outbox_one_pending on public.sync_outbox (user_id, media_item_id) where state = 'pending';
create unique index sync_outbox_one_in_flight on public.sync_outbox (user_id, media_item_id) where state = 'in_flight';
create index sync_outbox_due_idx on public.sync_outbox (not_before) where state = 'pending';
create index sync_outbox_user_recent_idx on public.sync_outbox (user_id, updated_at desc);

create trigger sync_outbox_set_updated_at before update on public.sync_outbox
  for each row execute function public.set_updated_at();

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  media_item_id uuid not null,
  mal_id bigint not null check (mal_id > 0),
  local jsonb not null,
  remote jsonb not null,
  baseline jsonb,
  state text not null default 'open' check (state in ('open', 'resolved_local', 'resolved_remote')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (user_id, media_item_id) references public.media_items (user_id, id) on delete cascade
);
create unique index sync_conflicts_one_open on public.sync_conflicts (user_id, media_item_id) where state = 'open';

alter table public.mal_accounts enable row level security;
alter table public.mal_list_entries enable row level security;
alter table public.sync_baselines enable row level security;
alter table public.sync_outbox enable row level security;
alter table public.sync_conflicts enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['mal_accounts', 'mal_list_entries', 'sync_baselines', 'sync_outbox', 'sync_conflicts'] loop
    execute format(
      'create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',
      table_name
    );
    execute format('revoke all on public.%I from anon, authenticated, public', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end;
$$;

-- Owners may toggle outbound writes after approving the initial sync, and may
-- approve a ready preview. Everything else is worker-managed.
create policy owner_update_settings on public.mal_accounts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant update (outbound_enabled, initial_sync) on public.mal_accounts to authenticated;

create function public.mal_accounts_guard_user_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated'
     and new.initial_sync is distinct from old.initial_sync
     and not (old.initial_sync = 'ready' and new.initial_sync = 'approved') then
    raise exception 'initial sync can only move from ready to approved' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger mal_accounts_guard_user_changes before update on public.mal_accounts
  for each row execute function public.mal_accounts_guard_user_changes();

-- ---------------------------------------------------------------------------
-- Outbox enqueue: any local change to a MAL-linked work's aggregate progress
-- is queued (debounced and coalesced per item) when outbound sync is enabled.
-- Changes applied *from* MAL set app.sync_origin = 'mal' and are not echoed.
-- ---------------------------------------------------------------------------
create function public.enqueue_mal_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_mal_id bigint;
  v_kind text;
begin
  if coalesce(current_setting('app.sync_origin', true), '') = 'mal' then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and old.status = new.status
     and old.score is not distinct from new.score
     and old.episodes_watched = new.episodes_watched then
    return null;
  end if;

  select m.mal_id, m.kind into v_mal_id, v_kind
  from public.media_items m
  where m.id = new.media_item_id and m.user_id = new.user_id;

  if v_mal_id is null or v_kind not in ('series', 'movie', 'ova', 'ona', 'special') then
    return null;
  end if;

  -- Queue even while a reconnect is required; rows are pushed after reconnecting.
  if not exists (
    select 1 from public.mal_accounts a
    where a.user_id = new.user_id and a.outbound_enabled and a.status in ('connected', 'reconnect_required')
  ) then
    return null;
  end if;

  insert into public.sync_outbox (user_id, media_item_id, mal_id, desired, not_before)
  values (
    new.user_id,
    new.media_item_id,
    v_mal_id,
    jsonb_build_object('status', new.status, 'score', coalesce(new.score, 0), 'num_watched_episodes', new.episodes_watched),
    now() + interval '15 seconds'
  )
  on conflict (user_id, media_item_id) where state = 'pending'
  do update set desired = excluded.desired, not_before = excluded.not_before, attempts = 0, last_error = null;

  return null;
end;
$$;

create trigger user_progress_enqueue_mal_sync
  after insert or update on public.user_progress
  for each row execute function public.enqueue_mal_sync();

revoke execute on function public.enqueue_mal_sync() from public, anon, authenticated;

-- Claim due outbox rows. Per-item serialization: an item with an in-flight
-- row is skipped until that push completes.
create function public.claim_outbox(p_worker text, p_limit integer, p_lease_seconds integer)
returns setof public.sync_outbox
language sql set search_path = '' as $$
  update public.sync_outbox o
     set state = 'in_flight',
         locked_by = p_worker,
         locked_until = now() + make_interval(secs => p_lease_seconds)
   where o.id in (
     select c.id from public.sync_outbox c
      where c.state = 'pending'
        and c.not_before <= now()
        and not exists (
          select 1 from public.sync_outbox f
           where f.user_id = c.user_id and f.media_item_id = c.media_item_id and f.state = 'in_flight'
        )
        and exists (
          select 1 from public.mal_accounts a
           where a.user_id = c.user_id and a.status = 'connected' and a.outbound_enabled
        )
      order by c.not_before
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning o.*;
$$;

-- Return in-flight rows whose lease expired to the queue (crash recovery).
create function public.release_stale_outbox() returns integer
language plpgsql set search_path = '' as $$
declare
  v_count integer;
begin
  with stale as (
    select o.id from public.sync_outbox o
     where o.state = 'in_flight' and o.locked_until < now()
       and not exists (
         select 1 from public.sync_outbox p
          where p.user_id = o.user_id and p.media_item_id = o.media_item_id and p.state = 'pending'
       )
     for update skip locked
  )
  update public.sync_outbox o set state = 'pending', locked_by = null, locked_until = null
    from stale where o.id = stale.id;
  get diagnostics v_count = row_count;
  update public.sync_outbox set state = 'superseded', completed_at = now()
   where state = 'in_flight' and locked_until < now();
  return v_count;
end;
$$;

revoke execute on function public.claim_outbox(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.release_stale_outbox() from public, anon, authenticated;
grant execute on function public.claim_outbox(text, integer, integer) to service_role;
grant execute on function public.release_stale_outbox() to service_role;
