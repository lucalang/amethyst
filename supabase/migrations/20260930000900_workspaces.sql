-- Personal workspaces.
--
-- Anime, games and custom entries become user-organized workspaces: nested
-- folders holding Markdown notes and checklists. The catalog-shaped model
-- (works, episodes, aggregate progress, arcs, custom tabs), the MyAnimeList
-- sync and the Jikan import worker are removed. Everything users wrote or
-- tracked is migrated into workspace files first:
--   entries.notes           -> "Notes" note at the workspace root
--   custom tabs             -> one note or checklist per tab (items keep their state)
--   works with episodes     -> "N. <title>" folder with an "Episodes" checklist
--   works without episodes  -> items in "Series" / "Movies" / "OVAs & Specials" / "Related"
--   arcs                    -> "Arcs" checklist (checked when every member episode was)
--   status, score, per-work notes and unmapped counts -> "Progress notes"

-- ---------------------------------------------------------------------------
-- Stop the scheduled worker before its tables disappear.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('archive-worker', 'archive-mal-refresh');
  end if;
end;
$$;

do $$
begin
  delete from vault.secrets where name in ('archive_worker_url', 'archive_worker_secret');
exception
  when undefined_table or invalid_schema_name or insufficient_privilege then null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entries: anime replaces the imported "franchise" kind; platform moves here.
-- ---------------------------------------------------------------------------
alter table public.entries disable trigger entries_bump_version;

drop index if exists public.entries_root_mal_idx;
alter table public.entries add column platform text check (platform is null or char_length(platform) <= 80);
update public.entries e
set platform = g.platform
from public.custom_games g
where g.user_id = e.user_id and g.entry_id = e.id and g.platform is not null;

alter table public.entries drop constraint entries_kind_check;
update public.entries set kind = 'anime' where kind = 'franchise';
alter table public.entries add constraint entries_kind_check check (kind in ('anime', 'game', 'custom'));

update public.entries
set metadata = metadata - array['root_mal_id', 'import_status', 'last_import_job_id', 'imported_at', 'coverage', 'warnings', 'candidates', 'attribution']
where metadata ?| array['root_mal_id', 'import_status', 'last_import_job_id', 'imported_at', 'coverage', 'warnings', 'candidates', 'attribution'];

-- ---------------------------------------------------------------------------
-- Workspace tree
-- ---------------------------------------------------------------------------
create table public.workspace_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  entry_id uuid not null,
  parent_id uuid,
  kind text not null check (kind in ('folder', 'note', 'checklist')),
  name text not null,
  content text not null default '',
  -- Increments only when content changes, so renames and moves never make an
  -- open editor's save look like a conflict.
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, entry_id, id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  -- The parent must be in the same workspace of the same owner.
  foreign key (user_id, entry_id, parent_id) references public.workspace_nodes (user_id, entry_id, id) on delete cascade,
  constraint workspace_nodes_name_valid check (name = btrim(name) and char_length(name) between 1 and 200 and name !~ '[[:cntrl:]]'),
  constraint workspace_nodes_content_size check (char_length(content) <= 200000),
  constraint workspace_nodes_content_only_in_notes check (kind = 'note' or content = ''),
  constraint workspace_nodes_not_self_parent check (parent_id is null or parent_id <> id)
);

-- Sibling names are unique regardless of case; the entry id stands in for the root.
create unique index workspace_nodes_sibling_name_key
  on public.workspace_nodes (user_id, entry_id, coalesce(parent_id, entry_id), lower(name));
create index workspace_nodes_parent_idx on public.workspace_nodes (user_id, parent_id) where parent_id is not null;

create table public.workspace_checklist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  file_id uuid not null,
  label text not null,
  checked boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, file_id) references public.workspace_nodes (user_id, id) on delete cascade,
  constraint workspace_checklist_items_label_valid check (label = btrim(label) and char_length(label) between 1 and 500 and label !~ '[[:cntrl:]]')
);

create index workspace_checklist_items_file_idx on public.workspace_checklist_items (user_id, file_id, position);

create function public.workspace_nodes_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_parent_kind text;
  v_depth integer;
  v_cycle boolean;
  v_height integer := 0;
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.entry_id <> old.entry_id or new.kind <> old.kind then
      raise exception 'Items cannot change workspace or type.' using errcode = '23514';
    end if;
    new.version := case when new.content is distinct from old.content then old.version + 1 else old.version end;
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.parent_id is not distinct from old.parent_id then
      return new;
    end if;
  end if;

  if new.parent_id is null then
    return new;
  end if;

  -- Serialize structural edits per workspace so concurrent moves cannot form a cycle.
  perform pg_advisory_xact_lock(hashtextextended('workspace:' || new.entry_id::text, 0));

  select kind into v_parent_kind
  from public.workspace_nodes
  where user_id = new.user_id and entry_id = new.entry_id and id = new.parent_id;
  if v_parent_kind is null then
    return new; -- the composite foreign key reports a missing or foreign parent
  end if;
  if v_parent_kind <> 'folder' then
    raise exception 'Only folders can contain other items.' using errcode = '23514';
  end if;

  with recursive ancestors (id, parent_id, depth) as (
    select n.id, n.parent_id, 1
    from public.workspace_nodes n
    where n.user_id = new.user_id and n.id = new.parent_id
    union all
    select n.id, n.parent_id, a.depth + 1
    from public.workspace_nodes n
    join ancestors a on n.id = a.parent_id
    where n.user_id = new.user_id and a.depth <= 64
  )
  select max(depth), coalesce(bool_or(id = new.id), false) into v_depth, v_cycle from ancestors;
  if v_cycle then
    raise exception 'A folder cannot be moved into itself.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and new.kind = 'folder' then
    with recursive subtree (id, depth) as (
      select n.id, 1 from public.workspace_nodes n where n.user_id = new.user_id and n.parent_id = new.id
      union all
      select n.id, s.depth + 1
      from public.workspace_nodes n
      join subtree s on n.parent_id = s.id
      where n.user_id = new.user_id and s.depth <= 64
    )
    select coalesce(max(depth), 0) into v_height from subtree;
  end if;
  if v_depth + 1 + v_height > 32 then
    raise exception 'Folders can be nested at most 32 levels deep.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger workspace_nodes_guard
  before insert or update on public.workspace_nodes
  for each row execute function public.workspace_nodes_guard();

create function public.workspace_checklist_items_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.file_id <> old.file_id then
      raise exception 'Checklist items cannot move between files.' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    new.updated_at := now();
    return new;
  end if;
  select kind into v_kind from public.workspace_nodes where user_id = new.user_id and id = new.file_id;
  -- A missing (or foreign) file is reported by the composite foreign key.
  if v_kind is not null and v_kind <> 'checklist' then
    raise exception 'Checklist items belong to checklist files.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger workspace_checklist_items_guard
  before insert or update on public.workspace_checklist_items
  for each row execute function public.workspace_checklist_items_guard();

-- ---------------------------------------------------------------------------
-- Data migration
-- ---------------------------------------------------------------------------
create function pg_temp.ws_clean(p_text text, p_max integer, p_fallback text) returns text
language sql immutable as $$
  select coalesce(
    nullif(btrim(left(btrim(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]+', ' ', 'g')), p_max)), ''),
    p_fallback
  );
$$;

-- Insert a node, suffixing " (2)", " (3)", … when a sibling already has the name.
create function pg_temp.ws_add_node(
  p_user uuid, p_entry uuid, p_parent uuid, p_kind text, p_name text, p_content text, p_stamp timestamptz
) returns uuid
language plpgsql as $$
declare
  v_base text := pg_temp.ws_clean(p_name, 190, 'Untitled');
  v_name text := v_base;
  v_n integer := 1;
  v_id uuid;
begin
  loop
    begin
      insert into public.workspace_nodes (user_id, entry_id, parent_id, kind, name, content, created_at, updated_at)
      values (p_user, p_entry, p_parent, p_kind, v_name, left(coalesce(p_content, ''), 200000), p_stamp, p_stamp)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      v_n := v_n + 1;
      v_name := v_base || ' (' || v_n || ')';
    end;
  end loop;
end;
$$;

create function pg_temp.ws_add_item(p_user uuid, p_file uuid, p_label text, p_checked boolean, p_stamp timestamptz) returns void
language sql as $$
  insert into public.workspace_checklist_items (user_id, file_id, label, checked, position, created_at, updated_at)
  select p_user, p_file, pg_temp.ws_clean(p_label, 500, 'Item'), coalesce(p_checked, false),
         coalesce((select max(i.position) + 1 from public.workspace_checklist_items i where i.user_id = p_user and i.file_id = p_file), 0),
         p_stamp, p_stamp;
$$;

do $$
declare
  e record;
  t record;
  w record;
  a record;
  v_stamp timestamptz;
  v_file uuid;
  v_folder uuid;
  v_fallback uuid;
  v_tab_files jsonb;
  v_section_files jsonb;
  v_work_folders jsonb;
  v_arc_files jsonb;
  v_section text;
  v_arc_key text;
  v_notes text;
  v_lines text[];
  v_work_no integer;
  v_complete boolean;
begin
  for e in select * from public.entries order by user_id, created_at loop
    select greatest(e.updated_at, s.last_activity_at) into v_stamp
    from public.entry_progress_summary s where s.entry_id = e.id;
    v_stamp := coalesce(v_stamp, e.updated_at);
    v_tab_files := '{}';
    v_section_files := '{}';
    v_work_folders := '{}';
    v_arc_files := '{}';
    v_fallback := null;
    v_notes := '';
    v_work_no := 0;

    -- Entry notes (previously the Notes side panel).
    if btrim(e.notes) <> '' then
      perform pg_temp.ws_add_node(e.user_id, e.id, null, 'note', 'Notes', e.notes, v_stamp);
    end if;

    -- Custom tabs, in their saved order.
    for t in
      select x.tab, x.ord
      from public.custom_games g
      cross join lateral jsonb_array_elements(g.tabs) with ordinality as x(tab, ord)
      where g.user_id = e.user_id and g.entry_id = e.id
      order by x.ord
    loop
      if t.tab ->> 'type' = 'markdown' then
        perform pg_temp.ws_add_node(e.user_id, e.id, null, 'note', t.tab ->> 'title', t.tab ->> 'content', v_stamp);
      else
        v_file := pg_temp.ws_add_node(e.user_id, e.id, null, 'checklist', t.tab ->> 'title', '', v_stamp);
        v_tab_files := v_tab_files || jsonb_build_object(t.tab ->> 'id', v_file);
      end if;
    end loop;

    -- Custom checklist items keep their tab, order and checked state.
    for t in
      select em.tab_id, m.title, coalesce(p.is_checked, false) as checked
      from public.entry_media_items em
      join public.media_items m on m.user_id = em.user_id and m.id = em.media_item_id and m.kind = 'checklist'
      left join public.user_progress p on p.user_id = m.user_id and p.media_item_id = m.id
      where em.user_id = e.user_id and em.entry_id = e.id and em.section = 'checklist'
      order by em.position, m.created_at
    loop
      v_file := (v_tab_files ->> t.tab_id::text)::uuid;
      if v_file is null then
        if v_fallback is null then
          v_fallback := pg_temp.ws_add_node(e.user_id, e.id, null, 'checklist', 'Checklist', '', v_stamp);
        end if;
        v_file := v_fallback;
      end if;
      perform pg_temp.ws_add_item(e.user_id, v_file, t.title, t.checked, v_stamp);
    end loop;

    -- Imported works.
    for w in
      select m.id, m.title, m.total_episodes, em.section,
             coalesce(p.episodes_watched, 0) as watched, p.status, p.score, coalesce(p.notes, '') as notes,
             (select count(*) from public.media_items c
               where c.user_id = m.user_id and c.parent_id = m.id and c.kind = 'episode') as episode_count,
             (select count(*) from public.media_items c
               join public.user_progress cp on cp.user_id = c.user_id and cp.media_item_id = c.id and cp.is_checked
               where c.user_id = m.user_id and c.parent_id = m.id and c.kind = 'episode') as episodes_checked
      from public.entry_media_items em
      join public.media_items m on m.user_id = em.user_id and m.id = em.media_item_id
      left join public.user_progress p on p.user_id = m.user_id and p.media_item_id = m.id
      where em.user_id = e.user_id and em.entry_id = e.id
        and m.kind in ('series', 'movie', 'ova', 'ona', 'special')
      order by array_position(array['main', 'movie', 'ova_special', 'related', 'checklist'], em.section), em.position, m.title
    loop
      v_complete := coalesce(w.status = 'completed', false) or (coalesce(w.total_episodes, 0) > 0 and w.watched >= w.total_episodes);
      if w.episode_count > 0 then
        v_work_no := v_work_no + 1;
        v_folder := pg_temp.ws_add_node(e.user_id, e.id, null, 'folder', v_work_no || '. ' || w.title, '', v_stamp);
        v_work_folders := v_work_folders || jsonb_build_object(w.id::text, v_folder);
        v_file := pg_temp.ws_add_node(e.user_id, e.id, v_folder, 'checklist', 'Episodes', '', v_stamp);
        insert into public.workspace_checklist_items (user_id, file_id, label, checked, position, created_at, updated_at)
        select e.user_id, v_file,
               pg_temp.ws_clean(
                 case
                   when c.episode_number is null or c.title ~* ('^(episode|ep\.?)\s*0*' || c.episode_number || '\M') then c.title
                   else 'Episode ' || c.episode_number || ' – ' || c.title
                 end, 500, 'Episode'),
               coalesce(cp.is_checked, false),
               (row_number() over (order by c.episode_number nulls last, c.position, c.title))::integer - 1,
               v_stamp, v_stamp
        from public.media_items c
        left join public.user_progress cp on cp.user_id = c.user_id and cp.media_item_id = c.id
        where c.user_id = e.user_id and c.parent_id = w.id and c.kind = 'episode';
      else
        v_section := case w.section
          when 'movie' then 'Movies'
          when 'ova_special' then 'OVAs & Specials'
          when 'related' then 'Related'
          else 'Series'
        end;
        v_file := (v_section_files ->> v_section)::uuid;
        if v_file is null then
          v_file := pg_temp.ws_add_node(e.user_id, e.id, null, 'checklist', v_section, '', v_stamp);
          v_section_files := v_section_files || jsonb_build_object(v_section, v_file);
        end if;
        perform pg_temp.ws_add_item(e.user_id, v_file, w.title, v_complete, v_stamp);
      end if;

      -- Whatever a checklist cannot express is kept as text.
      v_lines := '{}';
      if w.status in ('on_hold', 'dropped') then
        v_lines := v_lines || ('Status: ' || case w.status when 'on_hold' then 'On hold' else 'Dropped' end);
      end if;
      if coalesce(w.score, 0) > 0 then
        v_lines := v_lines || ('Score: ' || w.score || '/10');
      end if;
      if w.episode_count > 0 and w.watched > w.episodes_checked then
        v_lines := v_lines || format('Watched %s of %s episodes (a count that was never mapped to specific episodes)',
          w.watched, coalesce(nullif(w.total_episodes, 0)::text, 'unknown'));
      elsif w.episode_count = 0 and w.watched > 0 and not v_complete then
        v_lines := v_lines || format('Watched %s of %s episodes', w.watched, coalesce(nullif(w.total_episodes, 0)::text, 'unknown'));
      end if;
      if cardinality(v_lines) > 0 or btrim(w.notes) <> '' then
        v_notes := v_notes || E'\n## ' || w.title || E'\n\n'
          || coalesce((select string_agg('- ' || l, E'\n') from unnest(v_lines) l) || E'\n', '')
          || case when btrim(w.notes) <> '' then E'\n' || w.notes || E'\n' else '' end;
      end if;
    end loop;

    -- Arcs go next to their work's episodes, or to the root.
    for a in
      select ar.title, ar.start_episode, ar.end_episode, ar.series_item_id,
             count(ai.media_item_id) as members,
             count(ai.media_item_id) filter (where coalesce(ap.is_checked, false)) as members_checked
      from public.arcs ar
      left join public.arc_items ai on ai.user_id = ar.user_id and ai.arc_id = ar.id
      left join public.user_progress ap on ap.user_id = ai.user_id and ap.media_item_id = ai.media_item_id
      where ar.user_id = e.user_id and ar.entry_id = e.id
      group by ar.id
      order by ar.position, ar.created_at
    loop
      v_folder := (v_work_folders ->> a.series_item_id::text)::uuid;
      v_arc_key := coalesce(v_folder::text, 'root');
      v_file := (v_arc_files ->> v_arc_key)::uuid;
      if v_file is null then
        v_file := pg_temp.ws_add_node(e.user_id, e.id, v_folder, 'checklist', 'Arcs', '', v_stamp);
        v_arc_files := v_arc_files || jsonb_build_object(v_arc_key, v_file);
      end if;
      perform pg_temp.ws_add_item(
        e.user_id, v_file,
        a.title || case
          when a.start_episode is not null and a.start_episode = a.end_episode then format(' (episode %s)', a.start_episode)
          when a.start_episode is not null and a.end_episode is not null then format(' (episodes %s–%s)', a.start_episode, a.end_episode)
          else ''
        end,
        a.members > 0 and a.members = a.members_checked,
        v_stamp
      );
    end loop;

    if v_notes <> '' then
      perform pg_temp.ws_add_node(
        e.user_id, e.id, null, 'note', 'Progress notes',
        E'# Progress notes\n\nCarried over from the previous tracker: details a checklist cannot show.\n' || v_notes,
        v_stamp
      );
    end if;
  end loop;
end;
$$;

alter table public.entries enable trigger entries_bump_version;

-- ---------------------------------------------------------------------------
-- Remove the catalog model, MyAnimeList sync and the import worker.
-- ---------------------------------------------------------------------------
drop function if exists public.set_worker_schedule_active(boolean);
drop function if exists public.invoke_worker();
drop function if exists public.enqueue_scheduled_mal_pulls();
drop function if exists public.purge_expired_server_state();
drop function if exists public.approve_initial_sync(bigint[], boolean);
drop function if exists public.resolve_sync_conflict(uuid, text);
drop function if exists public.record_sync_conflict(uuid, uuid, bigint, jsonb, jsonb, jsonb);
drop function if exists public.apply_mal_remote(uuid, uuid, text, integer, integer, timestamptz);
drop function if exists public.claim_outbox(text, integer, integer);
drop function if exists public.release_stale_outbox();
drop function if exists public.claim_jobs(text, integer, integer);
drop function if exists public.reserve_provider_slot(text, integer);
drop function if exists public.block_provider(text, integer);
drop function if exists public.import_begin(uuid, jsonb);
drop function if exists public.import_apply_node(uuid, uuid, jsonb);
drop function if exists public.import_apply_episodes(uuid, bigint, jsonb);
drop function if exists public.import_finish(uuid, uuid, jsonb);
drop function if exists public.entry_episode_rows(uuid);
drop function if exists public.entry_progress_rows(uuid);
drop function if exists public.set_items_checked(uuid[], boolean);
drop function if exists public.set_container_progress(uuid, integer, text, integer, boolean);
drop function if exists public.map_watched_count_to_episodes(uuid);
drop function if exists public.recompute_container_progress(uuid[]);
drop function if exists public.lock_progress_items(uuid[]);
drop function if exists public.create_arc(uuid, uuid, text, integer, integer);
drop function if exists public.set_arc_checked(uuid, boolean);
drop function if exists public.save_custom_tabs(uuid, jsonb);
drop function if exists public.add_checklist_item(uuid, uuid, text);
drop function if exists public.reorder_entry_items(uuid, uuid[]);
drop function if exists public.derive_watch_status(text, integer, integer);

drop view if exists public.continue_watching;
drop view if exists public.entry_progress_summary;

drop table public.sync_conflicts, public.sync_outbox, public.sync_baselines, public.mal_list_entries,
  public.mal_accounts, public.mal_credentials, public.oauth_states;
drop table public.jobs, public.provider_cache, public.provider_throttle,
  public.catalog_characters, public.catalog_relations, public.catalog_anime;
drop table public.arc_items, public.arcs, public.custom_games, public.user_progress, public.entry_media_items, public.media_items;

drop function if exists public.enqueue_mal_sync();
drop function if exists public.mal_accounts_guard_user_changes();
drop function if exists public.media_items_enforce_hierarchy();
drop function if exists public.user_progress_guard();
drop function if exists public.arc_items_require_atomic();
drop function if exists public.custom_games_require_custom_entry();
drop function if exists public.is_valid_custom_tabs(jsonb);

alter table public.entries drop column notes;

-- ---------------------------------------------------------------------------
-- Row level security and privileges
-- ---------------------------------------------------------------------------
alter table public.workspace_nodes enable row level security;
alter table public.workspace_checklist_items enable row level security;
create policy owner_access on public.workspace_nodes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_access on public.workspace_checklist_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.workspace_nodes, public.workspace_checklist_items from anon, authenticated, public;
grant select, delete on public.workspace_nodes, public.workspace_checklist_items to authenticated;
-- Ownership, ids, versions and timestamps are never client-controlled.
grant insert (entry_id, parent_id, kind, name, content) on public.workspace_nodes to authenticated;
grant update (parent_id, name, content) on public.workspace_nodes to authenticated;
grant insert (file_id, label, checked, position) on public.workspace_checklist_items to authenticated;
grant update (label, checked, position) on public.workspace_checklist_items to authenticated;
grant all on public.workspace_nodes, public.workspace_checklist_items to service_role;

-- ---------------------------------------------------------------------------
-- Read models and RPCs (SECURITY INVOKER: they run under the caller's RLS)
-- ---------------------------------------------------------------------------
create view public.workspace_tree with (security_invoker = true) as
select
  n.id,
  n.user_id,
  n.entry_id,
  n.parent_id,
  n.kind,
  n.name,
  n.version,
  n.updated_at,
  coalesce(c.total, 0)::integer as items_total,
  coalesce(c.checked, 0)::integer as items_checked
from public.workspace_nodes n
left join lateral (
  select count(*) as total, count(*) filter (where i.checked) as checked
  from public.workspace_checklist_items i
  where i.user_id = n.user_id and i.file_id = n.id
) c on n.kind = 'checklist';

create view public.entry_workspace_summary with (security_invoker = true) as
select
  e.id as entry_id,
  e.user_id,
  coalesce(n.files, 0)::integer as files_total,
  coalesce(c.total, 0)::integer as checklist_total,
  coalesce(c.checked, 0)::integer as checklist_checked,
  greatest(e.updated_at, n.last_node_at, c.last_item_at) as last_activity_at
from public.entries e
left join lateral (
  select count(*) filter (where x.kind <> 'folder') as files, max(x.updated_at) as last_node_at
  from public.workspace_nodes x
  where x.user_id = e.user_id and x.entry_id = e.id
) n on true
left join lateral (
  select count(*) as total, count(*) filter (where i.checked) as checked, max(i.updated_at) as last_item_at
  from public.workspace_nodes f
  join public.workspace_checklist_items i on i.user_id = f.user_id and i.file_id = f.id
  where f.user_id = e.user_id and f.entry_id = e.id
) c on true;

revoke all on public.workspace_tree, public.entry_workspace_summary from anon, authenticated, public;
grant select on public.workspace_tree, public.entry_workspace_summary to authenticated, service_role;

-- Append items to a checklist; positions continue after the current last item.
create function public.add_checklist_items(p_file_id uuid, p_labels text[])
returns setof public.workspace_checklist_items
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_next integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_labels), 0) = 0 then
    return;
  end if;
  if cardinality(p_labels) > 500 then
    raise exception 'Add at most 500 items at once.' using errcode = '22023';
  end if;
  -- Lock the file so concurrent appends get distinct positions.
  perform 1 from public.workspace_nodes
  where id = p_file_id and user_id = v_user and kind = 'checklist'
  for update;
  if not found then
    raise exception 'Checklist not found.' using errcode = '22023';
  end if;
  select coalesce(max(position) + 1, 0) into v_next
  from public.workspace_checklist_items
  where user_id = v_user and file_id = p_file_id;

  return query
    insert into public.workspace_checklist_items (file_id, label, position)
    select p_file_id, btrim(l.label), v_next + l.ord::integer - 1
    from unnest(p_labels) with ordinality as l(label, ord)
    returning *;
end;
$$;

-- Persist a complete ordering of a checklist's items.
create function public.reorder_checklist_items(p_file_id uuid, p_item_ids uuid[])
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.workspace_nodes
  where id = p_file_id and user_id = v_user and kind = 'checklist'
  for update;
  if not found then
    raise exception 'Checklist not found.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_item_ids), 0) <> (select count(distinct x) from unnest(p_item_ids) x)
     or (select count(*) from public.workspace_checklist_items where user_id = v_user and file_id = p_file_id)
        <> coalesce(cardinality(p_item_ids), 0)
     or exists (
       select 1 from unnest(p_item_ids) x
       where not exists (
         select 1 from public.workspace_checklist_items i where i.user_id = v_user and i.file_id = p_file_id and i.id = x
       )
     ) then
    raise exception 'The order must list every item of this checklist exactly once. Reload and try again.' using errcode = '22023';
  end if;

  update public.workspace_checklist_items i
     set position = o.ord::integer - 1
    from unnest(p_item_ids) with ordinality as o(item_id, ord)
   where i.user_id = v_user and i.file_id = p_file_id and i.id = o.item_id and i.position <> o.ord::integer - 1;
end;
$$;

-- Check or uncheck every item of a checklist; returns the number of changed items.
create function public.set_checklist_checked(p_file_id uuid, p_checked boolean)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_nodes where id = p_file_id and user_id = v_user and kind = 'checklist') then
    raise exception 'Checklist not found.' using errcode = '22023';
  end if;
  update public.workspace_checklist_items
     set checked = p_checked
   where user_id = v_user and file_id = p_file_id and checked <> p_checked;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.add_checklist_items(uuid, text[]), public.reorder_checklist_items(uuid, uuid[]),
  public.set_checklist_checked(uuid, boolean) from public, anon;
grant execute on function public.add_checklist_items(uuid, text[]), public.reorder_checklist_items(uuid, uuid[]),
  public.set_checklist_checked(uuid, boolean) to authenticated, service_role;

revoke execute on function public.workspace_nodes_guard(), public.workspace_checklist_items_guard() from public, anon, authenticated;
