-- Core private vault schema.
-- Every user-owned table carries user_id, composite (user_id, id) keys, and
-- ownership-safe composite foreign keys so rows can never reference another
-- user's data, even when the referenced id is known.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  kind text not null check (kind in ('franchise', 'game', 'custom')),
  title text not null check (char_length(title) between 1 and 300),
  cover_url text check (cover_url is null or (cover_url ~ '^https://' and char_length(cover_url) <= 2048)),
  banner_url text check (banner_url is null or (banner_url ~ '^https://' and char_length(banner_url) <= 2048)),
  notes text not null default '' check (char_length(notes) <= 50000),
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);

create table public.media_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  parent_id uuid,
  source_key text not null check (char_length(source_key) between 1 and 200),
  mal_id bigint check (mal_id > 0),
  kind text not null check (kind in ('series', 'movie', 'ova', 'ona', 'special', 'episode', 'checklist')),
  title text not null check (char_length(title) between 1 and 500),
  episode_number integer check (episode_number > 0),
  total_episodes integer check (total_episodes >= 0),
  position integer not null default 0,
  metadata jsonb not null default '{}' check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, source_key),
  unique (user_id, mal_id),
  foreign key (user_id, parent_id) references public.media_items (user_id, id) on delete cascade,
  constraint media_items_not_self_parent check (parent_id is null or parent_id <> id),
  -- Episodes never inherit their parent anime's MAL id.
  constraint media_items_episode_has_no_mal_id check (kind <> 'episode' or mal_id is null),
  constraint media_items_episode_number_only_on_atomic check (episode_number is null or kind in ('episode', 'checklist')),
  constraint media_items_totals_only_on_containers check (total_episodes is null or kind in ('series', 'movie', 'ova', 'ona', 'special'))
);

create table public.entry_media_items (
  user_id uuid not null default auth.uid(),
  entry_id uuid not null,
  media_item_id uuid not null,
  section text not null default 'main' check (section in ('main', 'movie', 'ova_special', 'checklist', 'related')),
  relation text check (relation is null or char_length(relation) <= 60),
  tab_id uuid,
  position integer not null default 0,
  added_via text not null default 'manual' check (added_via in ('import', 'manual')),
  created_at timestamptz not null default now(),
  primary key (user_id, entry_id, media_item_id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, media_item_id) references public.media_items (user_id, id) on delete cascade,
  constraint entry_media_items_tab_only_for_checklists check (tab_id is null or section = 'checklist')
);

create table public.user_progress (
  user_id uuid not null default auth.uid(),
  media_item_id uuid not null,
  is_checked boolean not null default false,
  episodes_watched integer not null default 0 check (episodes_watched >= 0),
  -- false when episodes_watched is an aggregate (for example imported from MAL)
  -- that has not been mapped to specific episodes.
  episodes_mapped boolean not null default true,
  status text not null default 'plan_to_watch' check (status in ('watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch')),
  score smallint check (score between 0 and 10),
  notes text not null default '' check (char_length(notes) <= 20000),
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, media_item_id),
  foreign key (user_id, media_item_id) references public.media_items (user_id, id) on delete cascade
);

create table public.custom_games (
  entry_id uuid primary key,
  user_id uuid not null default auth.uid(),
  platform text check (platform is null or char_length(platform) <= 80),
  tabs jsonb not null default '[]' check (jsonb_typeof(tabs) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade
);

create table public.arcs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  entry_id uuid not null,
  series_item_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  start_episode integer check (start_episode > 0),
  end_episode integer check (end_episode > 0),
  position integer not null default 0,
  source text not null default 'manual' check (source in ('manual', 'curated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, series_item_id) references public.media_items (user_id, id) on delete cascade,
  constraint arcs_range_order check (start_episode is null or end_episode is null or end_episode >= start_episode)
);

create table public.arc_items (
  user_id uuid not null default auth.uid(),
  arc_id uuid not null,
  media_item_id uuid not null,
  primary key (user_id, arc_id, media_item_id),
  foreign key (user_id, arc_id) references public.arcs (user_id, id) on delete cascade,
  foreign key (user_id, media_item_id) references public.media_items (user_id, id) on delete cascade
);

create index entries_user_kind_idx on public.entries (user_id, kind, updated_at desc);
create index entries_root_mal_idx on public.entries (user_id, ((metadata ->> 'root_mal_id'))) where kind = 'franchise';
create index media_items_parent_idx on public.media_items (user_id, parent_id, episode_number) where parent_id is not null;
create index entry_media_items_item_idx on public.entry_media_items (user_id, media_item_id);
create index entry_media_items_entry_idx on public.entry_media_items (user_id, entry_id, section, position);
create index user_progress_status_idx on public.user_progress (user_id, status, updated_at desc);
create index custom_games_user_idx on public.custom_games (user_id);
create index arcs_entry_idx on public.arcs (user_id, entry_id, position);
create index arc_items_item_idx on public.arc_items (user_id, media_item_id);

-- ---------------------------------------------------------------------------
-- Generic timestamp / version triggers
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger users_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger entries_bump_version before update on public.entries
  for each row execute function public.bump_version();
create trigger media_items_set_updated_at before update on public.media_items
  for each row execute function public.set_updated_at();
create trigger custom_games_set_updated_at before update on public.custom_games
  for each row execute function public.set_updated_at();
create trigger arcs_set_updated_at before update on public.arcs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Hierarchy rules: no self-parenting, no cycles, sensible parent kinds.
-- ---------------------------------------------------------------------------
create function public.media_items_enforce_hierarchy() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_parent_kind text;
begin
  if new.parent_id is null then
    if new.kind = 'episode' then
      raise exception 'episodes require a parent work' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'a media item cannot be its own parent' using errcode = '23514';
  end if;

  -- Serialize hierarchy edits per owner so concurrent updates cannot form a cycle.
  perform pg_advisory_xact_lock(hashtextextended('media_hierarchy:' || new.user_id::text, 0));

  select kind into v_parent_kind
  from public.media_items
  where id = new.parent_id and user_id = new.user_id;

  if v_parent_kind is null then
    return new; -- the composite foreign key reports the missing parent
  end if;

  if new.kind = 'episode' and v_parent_kind not in ('series', 'movie', 'ova', 'ona', 'special') then
    raise exception 'episodes must belong to a series, movie, OVA, ONA or special' using errcode = '23514';
  elsif new.kind = 'checklist' and v_parent_kind <> 'checklist' then
    raise exception 'checklist items can only be nested under checklist items' using errcode = '23514';
  elsif new.kind in ('series', 'movie', 'ova', 'ona', 'special') then
    raise exception 'works cannot be nested under another item' using errcode = '23514';
  end if;

  if exists (
    with recursive ancestors (id, parent_id, depth) as (
      select m.id, m.parent_id, 1
      from public.media_items m
      where m.id = new.parent_id and m.user_id = new.user_id
      union all
      select m.id, m.parent_id, a.depth + 1
      from public.media_items m
      join ancestors a on m.id = a.parent_id
      where m.user_id = new.user_id and a.depth < 64
    )
    select 1 from ancestors where id = new.id or depth >= 64
  ) then
    raise exception 'media hierarchy cycle detected' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger media_items_enforce_hierarchy
  before insert or update of parent_id, kind on public.media_items
  for each row execute function public.media_items_enforce_hierarchy();

-- ---------------------------------------------------------------------------
-- Progress rules: atomic items use is_checked, works use aggregate counts.
-- ---------------------------------------------------------------------------
create function public.user_progress_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text;
begin
  select kind into v_kind
  from public.media_items
  where id = new.media_item_id and user_id = new.user_id;

  if v_kind in ('episode', 'checklist') then
    if new.episodes_watched <> 0 then
      raise exception 'atomic items track is_checked, not episodes_watched' using errcode = '23514';
    end if;
  elsif v_kind is not null and new.is_checked then
    raise exception 'works track aggregate episodes_watched, not is_checked' using errcode = '23514';
  end if;

  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create trigger user_progress_guard
  before insert or update on public.user_progress
  for each row execute function public.user_progress_guard();

-- ---------------------------------------------------------------------------
-- Custom content tabs (Markdown or checklist), validated in the database.
-- ---------------------------------------------------------------------------
create function public.is_valid_custom_tabs(p_tabs jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_tab jsonb;
  v_ids text[] := '{}';
begin
  if p_tabs is null or jsonb_typeof(p_tabs) <> 'array' or jsonb_array_length(p_tabs) > 20 then
    return false;
  end if;
  for v_tab in select value from jsonb_array_elements(p_tabs) loop
    if jsonb_typeof(v_tab) <> 'object' or not (v_tab ?& array['id', 'title', 'type']) then
      return false;
    end if;
    if exists (select 1 from jsonb_object_keys(v_tab) k where k not in ('id', 'title', 'type', 'content')) then
      return false;
    end if;
    if jsonb_typeof(v_tab -> 'id') <> 'string'
       or (v_tab ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_tab ->> 'id') = any (v_ids) then
      return false;
    end if;
    v_ids := v_ids || (v_tab ->> 'id');
    if jsonb_typeof(v_tab -> 'title') <> 'string' or char_length(btrim(v_tab ->> 'title')) not between 1 and 60 then
      return false;
    end if;
    if (v_tab ->> 'type') = 'markdown' then
      if jsonb_typeof(v_tab -> 'content') is distinct from 'string' or char_length(v_tab ->> 'content') > 100000 then
        return false;
      end if;
    elsif (v_tab ->> 'type') = 'checklist' then
      if v_tab ? 'content' then
        return false; -- checklist items are media_items so they can be checked
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter table public.custom_games
  add constraint custom_games_tabs_valid check (public.is_valid_custom_tabs(tabs));

create function public.custom_games_require_custom_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text;
begin
  select kind into v_kind from public.entries
  where id = new.entry_id and user_id = new.user_id;
  -- A missing (or foreign) entry is reported by the composite foreign key.
  if v_kind is not null and v_kind not in ('game', 'custom') then
    raise exception 'custom content tabs belong to game or custom entries' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger custom_games_require_custom_entry
  before insert or update of entry_id on public.custom_games
  for each row execute function public.custom_games_require_custom_entry();

create function public.arc_items_require_atomic() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (
    select 1 from public.media_items
    where id = new.media_item_id and user_id = new.user_id and kind in ('episode', 'checklist')
  ) then
    raise exception 'arcs can only contain episodes or checklist items' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger arc_items_require_atomic
  before insert or update on public.arc_items
  for each row execute function public.arc_items_require_atomic();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
create policy own_profile on public.users for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['entries', 'media_items', 'entry_media_items', 'user_progress', 'custom_games', 'arcs', 'arc_items'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
  end loop;
end;
$$;

revoke all on public.users, public.entries, public.media_items, public.entry_media_items,
  public.user_progress, public.custom_games, public.arcs, public.arc_items from anon, public;
revoke all on public.users, public.entries, public.media_items, public.entry_media_items,
  public.user_progress, public.custom_games, public.arcs, public.arc_items from authenticated;
grant select, insert, update, delete on public.users, public.entries, public.media_items, public.entry_media_items,
  public.user_progress, public.custom_games, public.arcs, public.arc_items to authenticated;
grant all on public.users, public.entries, public.media_items, public.entry_media_items,
  public.user_progress, public.custom_games, public.arcs, public.arc_items to service_role;

revoke execute on function public.is_valid_custom_tabs(jsonb) from public, anon;
grant execute on function public.is_valid_custom_tabs(jsonb) to authenticated, service_role;
