-- User-facing RPCs (SECURITY INVOKER: they run under the caller's RLS) and
-- worker-only functions (granted to service_role only).

create function public.derive_watch_status(p_current text, p_watched integer, p_total integer)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_total is not null and p_total > 0 and p_watched >= p_total then 'completed'
    when p_watched > 0 then case when p_current in ('on_hold', 'dropped') then p_current else 'watching' end
    else case when p_current in ('watching', 'completed') then 'plan_to_watch' else p_current end
  end;
$$;

create function public.ensure_profile() returns void
language sql security invoker set search_path = '' as $$
  insert into public.users (id) values ((select auth.uid())) on conflict (id) do nothing;
$$;

-- Recompute aggregate progress of works from their checked child episodes.
-- Imported aggregates that are not mapped to episodes are never lowered.
create function public.recompute_container_progress(p_item_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item record;
  v_prev public.user_progress;
  v_checked integer;
  v_watched integer;
  v_mapped boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  for v_item in
    select m.id, m.total_episodes
    from public.media_items m
    where m.user_id = v_user and m.id = any (p_item_ids)
      and m.kind in ('series', 'movie', 'ova', 'ona', 'special')
  loop
    select count(*) into v_checked
    from public.media_items c
    join public.user_progress p on p.user_id = c.user_id and p.media_item_id = c.id and p.is_checked
    where c.user_id = v_user and c.parent_id = v_item.id and c.kind = 'episode';

    select * into v_prev from public.user_progress
    where user_id = v_user and media_item_id = v_item.id;

    if not found or v_prev.episodes_mapped or v_checked >= v_prev.episodes_watched then
      v_watched := v_checked;
      v_mapped := true;
    else
      v_watched := v_prev.episodes_watched;
      v_mapped := false;
    end if;

    insert into public.user_progress as up (user_id, media_item_id, episodes_watched, episodes_mapped, status)
    values (
      v_user, v_item.id, v_watched, v_mapped,
      public.derive_watch_status(coalesce(v_prev.status, 'plan_to_watch'), v_watched, v_item.total_episodes)
    )
    on conflict (user_id, media_item_id) do update
      set episodes_watched = excluded.episodes_watched,
          episodes_mapped = excluded.episodes_mapped,
          status = excluded.status
      where (up.episodes_watched, up.episodes_mapped, up.status)
            is distinct from (excluded.episodes_watched, excluded.episodes_mapped, excluded.status);
  end loop;
end;
$$;

-- Atomically check/uncheck atomic items (episodes, checklist items) and update
-- every affected aggregate in the same transaction (outbox rows are queued by
-- trigger inside this transaction too).
create function public.set_items_checked(p_item_ids uuid[], p_checked boolean)
returns setof public.user_progress
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[];
  v_found integer;
  v_parents uuid[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  v_ids := array(select distinct x from unnest(coalesce(p_item_ids, '{}')) x where x is not null);
  if cardinality(v_ids) = 0 then
    return;
  end if;
  if cardinality(v_ids) > 5000 then
    raise exception 'too many items in one request' using errcode = '22023';
  end if;

  select count(*) into v_found
  from public.media_items m
  where m.user_id = v_user and m.id = any (v_ids) and m.kind in ('episode', 'checklist');
  if v_found <> cardinality(v_ids) then
    raise exception 'unknown or non-checkable items' using errcode = '22023';
  end if;

  insert into public.user_progress as up (user_id, media_item_id, is_checked)
  select v_user, x, p_checked from unnest(v_ids) x
  on conflict (user_id, media_item_id) do update
    set is_checked = excluded.is_checked
    where up.is_checked is distinct from excluded.is_checked;

  v_parents := array(
    select distinct m.parent_id from public.media_items m
    where m.user_id = v_user and m.id = any (v_ids) and m.kind = 'episode' and m.parent_id is not null
  );
  perform public.recompute_container_progress(v_parents);

  return query
    select up.* from public.user_progress up
    where up.user_id = v_user and (up.media_item_id = any (v_ids) or up.media_item_id = any (v_parents));
end;
$$;

-- Set aggregate progress for a work (movie checkbox, watched count, status, score).
create function public.set_container_progress(
  p_item_id uuid,
  p_episodes_watched integer default null,
  p_status text default null,
  p_score integer default null,
  p_clear_score boolean default false
)
returns setof public.user_progress
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item public.media_items;
  v_prev public.user_progress;
  v_children integer;
  v_checked integer;
  v_watched integer;
  v_status text;
  v_score smallint;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_item from public.media_items
  where id = p_item_id and user_id = v_user and kind in ('series', 'movie', 'ova', 'ona', 'special');
  if not found then
    raise exception 'work not found' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_score is not null and (p_score < 0 or p_score > 10) then
    raise exception 'score must be between 0 and 10' using errcode = '22023';
  end if;
  if p_episodes_watched is not null and p_episodes_watched < 0 then
    raise exception 'watched count cannot be negative' using errcode = '22023';
  end if;
  if p_episodes_watched is not null and coalesce(v_item.total_episodes, 0) > 0 and p_episodes_watched > v_item.total_episodes then
    raise exception 'watched count exceeds the known episode total' using errcode = '22023';
  end if;

  select * into v_prev from public.user_progress where user_id = v_user and media_item_id = v_item.id;

  v_watched := coalesce(p_episodes_watched, v_prev.episodes_watched, 0);
  if p_status = 'completed' and p_episodes_watched is null and coalesce(v_item.total_episodes, 0) > 0 then
    v_watched := v_item.total_episodes;
  end if;

  if p_status is not null then
    v_status := p_status;
  elsif p_episodes_watched is not null then
    v_status := public.derive_watch_status(coalesce(v_prev.status, 'plan_to_watch'), v_watched, v_item.total_episodes);
  else
    v_status := coalesce(v_prev.status, 'plan_to_watch');
  end if;

  if p_clear_score then
    v_score := null;
  elsif p_score is not null then
    v_score := p_score;
  else
    v_score := v_prev.score;
  end if;

  select count(*), count(*) filter (where p.is_checked)
    into v_children, v_checked
  from public.media_items c
  left join public.user_progress p on p.user_id = c.user_id and p.media_item_id = c.id
  where c.user_id = v_user and c.parent_id = v_item.id and c.kind = 'episode';

  insert into public.user_progress as up (user_id, media_item_id, episodes_watched, episodes_mapped, status, score)
  values (v_user, v_item.id, v_watched, v_children = 0 or v_checked = v_watched, v_status, v_score)
  on conflict (user_id, media_item_id) do update
    set episodes_watched = excluded.episodes_watched,
        episodes_mapped = excluded.episodes_mapped,
        status = excluded.status,
        score = excluded.score;

  return query select up.* from public.user_progress up where up.user_id = v_user and up.media_item_id = v_item.id;
end;
$$;

-- Explicit, user-confirmed mapping of an aggregate watched count to the first
-- N episodes. Never called implicitly.
create function public.map_watched_count_to_episodes(p_item_id uuid)
returns setof public.user_progress
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_watched integer;
  v_ids uuid[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select p.episodes_watched into v_watched
  from public.user_progress p
  join public.media_items m on m.user_id = p.user_id and m.id = p.media_item_id
  where p.user_id = v_user and p.media_item_id = p_item_id
    and m.kind in ('series', 'movie', 'ova', 'ona', 'special');
  if v_watched is null then
    raise exception 'no aggregate progress to map' using errcode = '22023';
  end if;

  v_ids := array(
    select c.id from public.media_items c
    where c.user_id = v_user and c.parent_id = p_item_id and c.kind = 'episode'
    order by c.episode_number nulls last, c.position
    limit v_watched
  );

  insert into public.user_progress as up (user_id, media_item_id, is_checked)
  select v_user, x, true from unnest(v_ids) x
  on conflict (user_id, media_item_id) do update set is_checked = true where not up.is_checked;

  perform public.recompute_container_progress(array[p_item_id]);

  return query
    select up.* from public.user_progress up
    where up.user_id = v_user and (up.media_item_id = p_item_id or up.media_item_id = any (v_ids));
end;
$$;

-- Curated arc by episode range over one work in a franchise.
create function public.create_arc(
  p_entry_id uuid,
  p_series_item_id uuid,
  p_title text,
  p_start integer,
  p_end integer
)
returns public.arcs
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_arc public.arcs;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_start < 1 or p_end < p_start then
    raise exception 'invalid episode range' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.entry_media_items em
    join public.media_items m on m.user_id = em.user_id and m.id = em.media_item_id
    where em.user_id = v_user and em.entry_id = p_entry_id and em.media_item_id = p_series_item_id
      and m.kind in ('series', 'movie', 'ova', 'ona', 'special')
  ) then
    raise exception 'work is not part of this franchise' using errcode = '22023';
  end if;

  insert into public.arcs (user_id, entry_id, series_item_id, title, start_episode, end_episode, position, source)
  values (
    v_user, p_entry_id, p_series_item_id, btrim(p_title), p_start, p_end,
    coalesce((select max(a.position) + 1 from public.arcs a where a.user_id = v_user and a.entry_id = p_entry_id), 0),
    'curated'
  )
  returning * into v_arc;

  insert into public.arc_items (user_id, arc_id, media_item_id)
  select v_user, v_arc.id, c.id
  from public.media_items c
  where c.user_id = v_user and c.parent_id = p_series_item_id and c.kind = 'episode'
    and c.episode_number between p_start and p_end;

  return v_arc;
end;
$$;

create function public.set_arc_checked(p_arc_id uuid, p_checked boolean)
returns setof public.user_progress
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[];
begin
  if not exists (select 1 from public.arcs where id = p_arc_id and user_id = v_user) then
    raise exception 'arc not found' using errcode = '22023';
  end if;
  v_ids := array(select ai.media_item_id from public.arc_items ai where ai.user_id = v_user and ai.arc_id = p_arc_id);
  return query select * from public.set_items_checked(v_ids, p_checked);
end;
$$;

-- Replace the ordered tab list of a custom entry, removing checklist items of
-- deleted checklist tabs in the same transaction.
create function public.save_custom_tabs(p_entry_id uuid, p_tabs jsonb)
returns public.custom_games
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_row public.custom_games;
  v_checklist_tabs uuid[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.is_valid_custom_tabs(p_tabs) then
    raise exception 'invalid tabs' using errcode = '22023';
  end if;

  update public.custom_games set tabs = p_tabs
  where entry_id = p_entry_id and user_id = v_user
  returning * into v_row;
  if not found then
    raise exception 'entry not found' using errcode = '22023';
  end if;

  v_checklist_tabs := array(
    select (t ->> 'id')::uuid from jsonb_array_elements(p_tabs) t where t ->> 'type' = 'checklist'
  );

  delete from public.media_items m
  using public.entry_media_items em
  where em.user_id = v_user and em.entry_id = p_entry_id and em.section = 'checklist'
    and em.media_item_id = m.id and m.user_id = v_user
    and (em.tab_id is null or not (em.tab_id = any (v_checklist_tabs)));

  return v_row;
end;
$$;

create function public.add_checklist_item(p_entry_id uuid, p_tab_id uuid, p_title text)
returns public.media_items
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item public.media_items;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.custom_games g, jsonb_array_elements(g.tabs) t
    where g.entry_id = p_entry_id and g.user_id = v_user
      and t ->> 'type' = 'checklist' and t ->> 'id' = p_tab_id::text
  ) then
    raise exception 'checklist tab not found' using errcode = '22023';
  end if;

  insert into public.media_items (user_id, source_key, kind, title)
  values (v_user, 'custom:' || gen_random_uuid()::text, 'checklist', btrim(p_title))
  returning * into v_item;

  insert into public.entry_media_items (user_id, entry_id, media_item_id, section, tab_id, position, added_via)
  values (
    v_user, p_entry_id, v_item.id, 'checklist', p_tab_id,
    coalesce((select max(em.position) + 1 from public.entry_media_items em
              where em.user_id = v_user and em.entry_id = p_entry_id and em.tab_id = p_tab_id), 0),
    'manual'
  );
  return v_item;
end;
$$;

create function public.reorder_entry_items(p_entry_id uuid, p_item_ids uuid[])
returns void
language sql security invoker set search_path = '' as $$
  update public.entry_media_items em
     set position = o.ord - 1
    from unnest(p_item_ids) with ordinality as o(item_id, ord)
   where em.user_id = (select auth.uid()) and em.entry_id = p_entry_id and em.media_item_id = o.item_id;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard read models (security_invoker views respect RLS).
-- ---------------------------------------------------------------------------
create view public.entry_progress_summary with (security_invoker = true) as
select
  e.id as entry_id,
  e.user_id,
  count(m.id) filter (where m.kind in ('series', 'movie', 'ova', 'ona', 'special'))::integer as works_total,
  count(m.id) filter (
    where m.kind in ('series', 'movie', 'ova', 'ona', 'special')
      and (p.status = 'completed' or (m.total_episodes > 0 and p.episodes_watched >= m.total_episodes))
  )::integer as works_completed,
  coalesce(sum(p.episodes_watched) filter (where m.kind in ('series', 'movie', 'ova', 'ona', 'special')), 0)::integer as episodes_watched,
  coalesce(sum(m.total_episodes) filter (where m.kind in ('series', 'movie', 'ova', 'ona', 'special') and m.total_episodes > 0), 0)::integer as episodes_known_total,
  coalesce(bool_or(m.kind in ('series', 'movie', 'ova', 'ona', 'special') and coalesce(m.total_episodes, 0) = 0), false) as has_unknown_total,
  count(m.id) filter (where m.kind = 'checklist')::integer as checklist_total,
  count(m.id) filter (where m.kind = 'checklist' and p.is_checked)::integer as checklist_checked,
  coalesce(bool_or(p.status = 'watching'), false) as any_watching,
  greatest(e.updated_at, max(p.updated_at)) as last_activity_at
from public.entries e
left join public.entry_media_items em on em.user_id = e.user_id and em.entry_id = e.id
left join public.media_items m on m.user_id = em.user_id and m.id = em.media_item_id
left join public.user_progress p on p.user_id = m.user_id and p.media_item_id = m.id
group by e.id, e.user_id, e.updated_at;

create view public.continue_watching with (security_invoker = true) as
select distinct on (p.media_item_id)
  p.user_id,
  p.media_item_id,
  m.title,
  m.kind,
  m.total_episodes,
  m.metadata ->> 'image_url' as image_url,
  p.episodes_watched,
  p.status,
  p.updated_at,
  em.entry_id,
  e.title as entry_title,
  e.cover_url as entry_cover_url
from public.user_progress p
join public.media_items m on m.user_id = p.user_id and m.id = p.media_item_id
join public.entry_media_items em on em.user_id = m.user_id and em.media_item_id = m.id
join public.entries e on e.user_id = em.user_id and e.id = em.entry_id
where p.status = 'watching' and m.kind in ('series', 'movie', 'ova', 'ona', 'special')
order by p.media_item_id, e.created_at;

revoke all on public.entry_progress_summary, public.continue_watching from anon, authenticated, public;
grant select on public.entry_progress_summary, public.continue_watching to authenticated;
grant select on public.entry_progress_summary, public.continue_watching to service_role;

-- ---------------------------------------------------------------------------
-- Worker-only functions. Ownership is always derived from the job row, never
-- from provider payloads.
-- ---------------------------------------------------------------------------
create function public.import_begin(p_job_id uuid, p_root jsonb)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_job public.jobs;
  v_entry uuid;
  v_target uuid;
  v_image text := case when p_root ->> 'image_url' ~ '^https://' then p_root ->> 'image_url' end;
begin
  select * into v_job from public.jobs where id = p_job_id and status = 'running' for update;
  if not found then
    raise exception 'job % is not running', p_job_id;
  end if;

  v_target := nullif(v_job.input ->> 'entry_id', '')::uuid;
  if v_target is not null then
    select id into v_entry from public.entries
    where id = v_target and user_id = v_job.user_id and kind = 'franchise';
    if v_entry is null then
      raise exception 'target franchise not found for job owner';
    end if;
  else
    select id into v_entry from public.entries
    where user_id = v_job.user_id and kind = 'franchise'
      and metadata ->> 'root_mal_id' = (p_root ->> 'mal_id')
    order by created_at
    limit 1;
    if v_entry is null then
      insert into public.entries (user_id, kind, title, cover_url, metadata)
      values (
        v_job.user_id, 'franchise', left(p_root ->> 'title', 300), v_image,
        jsonb_build_object('root_mal_id', (p_root ->> 'mal_id')::bigint, 'attribution', 'Metadata from MyAnimeList via Jikan')
      )
      returning id into v_entry;
    end if;
  end if;

  update public.entries
     set metadata = metadata || jsonb_build_object('import_status', 'running', 'last_import_job_id', p_job_id),
         cover_url = coalesce(cover_url, v_image)
   where id = v_entry;
  update public.jobs set result = result || jsonb_build_object('entry_id', v_entry) where id = p_job_id;
  return v_entry;
end;
$$;

create function public.import_apply_node(p_job_id uuid, p_entry_id uuid, p_node jsonb)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_user uuid;
  v_item uuid;
begin
  select user_id into v_user from public.jobs where id = p_job_id and status = 'running';
  if v_user is null then
    raise exception 'job % is not running', p_job_id;
  end if;
  if not exists (select 1 from public.entries where id = p_entry_id and user_id = v_user) then
    raise exception 'entry does not belong to job owner';
  end if;

  insert into public.media_items as m (user_id, source_key, mal_id, kind, title, total_episodes, position, metadata)
  values (
    v_user,
    'mal:' || (p_node ->> 'mal_id')::bigint,
    (p_node ->> 'mal_id')::bigint,
    p_node ->> 'kind',
    left(p_node ->> 'title', 500),
    nullif(p_node ->> 'total_episodes', '')::integer,
    coalesce((p_node ->> 'position')::integer, 0),
    coalesce(p_node -> 'metadata', '{}')
  )
  on conflict (user_id, source_key) do update
    set title = excluded.title,
        kind = excluded.kind,
        total_episodes = excluded.total_episodes,
        metadata = m.metadata || excluded.metadata
  returning id into v_item;

  insert into public.entry_media_items as l (user_id, entry_id, media_item_id, section, relation, position, added_via)
  values (
    v_user, p_entry_id, v_item, p_node ->> 'section', nullif(p_node ->> 'relation', ''),
    coalesce((p_node ->> 'position')::integer, 0), 'import'
  )
  on conflict (user_id, entry_id, media_item_id) do update
    set section = excluded.section, relation = excluded.relation, position = excluded.position;

  return v_item;
end;
$$;

create function public.import_apply_episodes(p_job_id uuid, p_parent_mal_id bigint, p_episodes jsonb)
returns integer
language plpgsql set search_path = '' as $$
declare
  v_user uuid;
  v_parent uuid;
  v_count integer;
begin
  select user_id into v_user from public.jobs where id = p_job_id and status = 'running';
  if v_user is null then
    raise exception 'job % is not running', p_job_id;
  end if;
  select id into v_parent from public.media_items
  where user_id = v_user and source_key = 'mal:' || p_parent_mal_id;
  if v_parent is null then
    raise exception 'parent work mal:% not imported', p_parent_mal_id;
  end if;

  insert into public.media_items as m (user_id, parent_id, source_key, kind, title, episode_number, position, metadata)
  select distinct on (e.number)
    v_user, v_parent,
    'mal:' || p_parent_mal_id || ':episode:' || e.number,
    'episode',
    left(coalesce(nullif(btrim(e.title), ''), 'Episode ' || e.number), 500),
    e.number,
    e.number,
    jsonb_strip_nulls(jsonb_build_object('aired', e.aired, 'filler', e.filler, 'recap', e.recap, 'title_japanese', e.title_japanese))
  from jsonb_to_recordset(p_episodes) as e(number integer, title text, aired text, filler boolean, recap boolean, title_japanese text)
  where e.number > 0
  order by e.number
  on conflict (user_id, source_key) do update
    set title = excluded.title, metadata = m.metadata || excluded.metadata;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.import_finish(p_job_id uuid, p_entry_id uuid, p_summary jsonb)
returns void
language plpgsql set search_path = '' as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.jobs where id = p_job_id and status = 'running' for update;
  if v_user is null then
    raise exception 'job % is not running', p_job_id;
  end if;
  update public.entries
     set metadata = metadata || jsonb_build_object(
           'import_status', 'complete',
           'imported_at', now(),
           'coverage', coalesce(p_summary -> 'coverage', '{}'),
           'warnings', coalesce(p_summary -> 'warnings', '[]'),
           'candidates', coalesce(p_summary -> 'candidates', '[]')
         )
   where id = p_entry_id and user_id = v_user;
  update public.jobs
     set status = 'succeeded',
         finished_at = now(),
         locked_by = null,
         locked_until = null,
         last_error = null,
         warnings = coalesce(p_summary -> 'warnings', '[]'),
         result = result || jsonb_build_object('entry_id', p_entry_id, 'coverage', coalesce(p_summary -> 'coverage', '{}'))
   where id = p_job_id;
end;
$$;

-- Apply a MAL list state to local aggregate progress without echoing it back,
-- and record it as the agreed baseline.
create function public.apply_mal_remote(
  p_user uuid,
  p_media_item_id uuid,
  p_status text,
  p_score integer,
  p_watched integer,
  p_remote_updated_at timestamptz default null
)
returns void
language plpgsql set search_path = '' as $$
declare
  v_item public.media_items;
  v_children integer;
  v_checked integer;
begin
  select * into v_item from public.media_items
  where id = p_media_item_id and user_id = p_user and kind in ('series', 'movie', 'ova', 'ona', 'special');
  if not found or v_item.mal_id is null then
    raise exception 'linked work not found';
  end if;

  perform set_config('app.sync_origin', 'mal', true);

  select count(*), count(*) filter (where p.is_checked)
    into v_children, v_checked
  from public.media_items c
  left join public.user_progress p on p.user_id = c.user_id and p.media_item_id = c.id
  where c.user_id = p_user and c.parent_id = v_item.id and c.kind = 'episode';

  insert into public.user_progress as up (user_id, media_item_id, status, score, episodes_watched, episodes_mapped)
  values (
    p_user, v_item.id, coalesce(p_status, 'plan_to_watch'), nullif(p_score, 0), greatest(coalesce(p_watched, 0), 0),
    v_children = 0 or v_checked = coalesce(p_watched, 0)
  )
  on conflict (user_id, media_item_id) do update
    set status = excluded.status,
        score = excluded.score,
        episodes_watched = excluded.episodes_watched,
        episodes_mapped = excluded.episodes_mapped;

  insert into public.sync_baselines as b (user_id, media_item_id, mal_id, status, score, episodes_watched, remote_updated_at, synced_at)
  values (p_user, v_item.id, v_item.mal_id, coalesce(p_status, 'plan_to_watch'), coalesce(p_score, 0), coalesce(p_watched, 0), p_remote_updated_at, now())
  on conflict (user_id, media_item_id) do update
    set mal_id = excluded.mal_id, status = excluded.status, score = excluded.score,
        episodes_watched = excluded.episodes_watched, remote_updated_at = excluded.remote_updated_at, synced_at = now();

  perform set_config('app.sync_origin', '', true);
end;
$$;

create function public.record_sync_conflict(
  p_user uuid,
  p_media_item_id uuid,
  p_mal_id bigint,
  p_local jsonb,
  p_remote jsonb,
  p_baseline jsonb
)
returns void
language sql set search_path = '' as $$
  insert into public.sync_conflicts (user_id, media_item_id, mal_id, local, remote, baseline)
  values (p_user, p_media_item_id, p_mal_id, p_local, p_remote, p_baseline)
  on conflict (user_id, media_item_id) where state = 'open'
  do update set local = excluded.local, remote = excluded.remote, baseline = excluded.baseline, created_at = now();
$$;

create function public.purge_expired_server_state() returns void
language sql set search_path = '' as $$
  delete from public.oauth_states where expires_at < now() - interval '1 day';
  delete from public.provider_cache where expires_at < now() - interval '7 days';
$$;

-- ---------------------------------------------------------------------------
-- User-invoked sync decisions. SECURITY DEFINER because they write
-- worker-managed tables; every statement is scoped to auth.uid().
-- ---------------------------------------------------------------------------
create function public.approve_initial_sync(p_apply_remote bigint[], p_enable_outbound boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_account public.mal_accounts;
  v_row record;
  v_applied integer := 0;
  v_kept integer := 0;
  v_apply bigint[] := coalesce(p_apply_remote, '{}');
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_account from public.mal_accounts where user_id = v_user for update;
  if not found or v_account.status <> 'connected' or v_account.initial_sync = 'pending' then
    raise exception 'sync preview is not ready' using errcode = '22023';
  end if;

  for v_row in
    select e.*, m.id as media_item_id
    from public.mal_list_entries e
    join public.media_items m
      on m.user_id = e.user_id and m.mal_id = e.mal_id and m.kind in ('series', 'movie', 'ova', 'ona', 'special')
    where e.user_id = v_user
  loop
    if v_row.mal_id = any (v_apply) then
      perform public.apply_mal_remote(v_user, v_row.media_item_id, v_row.status, v_row.score, v_row.num_episodes_watched, v_row.remote_updated_at);
      v_applied := v_applied + 1;
    else
      insert into public.sync_baselines as b (user_id, media_item_id, mal_id, status, score, episodes_watched, remote_updated_at)
      values (v_user, v_row.media_item_id, v_row.mal_id, v_row.status, coalesce(v_row.score, 0), v_row.num_episodes_watched, v_row.remote_updated_at)
      on conflict (user_id, media_item_id) do update
        set status = excluded.status, score = excluded.score, episodes_watched = excluded.episodes_watched,
            remote_updated_at = excluded.remote_updated_at, synced_at = now();
      v_kept := v_kept + 1;
    end if;
  end loop;

  update public.mal_accounts
     set initial_sync = 'approved', outbound_enabled = coalesce(p_enable_outbound, false)
   where user_id = v_user;

  if coalesce(p_enable_outbound, false) then
    insert into public.sync_outbox (user_id, media_item_id, mal_id, desired, not_before)
    select v_user, m.id, m.mal_id,
           jsonb_build_object('status', p.status, 'score', coalesce(p.score, 0), 'num_watched_episodes', p.episodes_watched),
           now()
    from public.sync_baselines b
    join public.media_items m on m.user_id = b.user_id and m.id = b.media_item_id
    join public.user_progress p on p.user_id = m.user_id and p.media_item_id = m.id
    where b.user_id = v_user
      and not (b.mal_id = any (v_apply))
      and (p.status, coalesce(p.score, 0), p.episodes_watched)
          is distinct from (b.status, coalesce(b.score, 0), b.episodes_watched)
    on conflict (user_id, media_item_id) where state = 'pending'
    do update set desired = excluded.desired, not_before = excluded.not_before;
  end if;

  return jsonb_build_object('applied_remote', v_applied, 'kept_local', v_kept);
end;
$$;

create function public.resolve_sync_conflict(p_conflict_id uuid, p_choice text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_conflict public.sync_conflicts;
  v_local public.user_progress;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_conflict from public.sync_conflicts
  where id = p_conflict_id and user_id = v_user and state = 'open'
  for update;
  if not found then
    raise exception 'conflict not found' using errcode = '22023';
  end if;

  if p_choice = 'remote' then
    perform public.apply_mal_remote(
      v_user, v_conflict.media_item_id,
      v_conflict.remote ->> 'status',
      coalesce((v_conflict.remote ->> 'score')::integer, 0),
      coalesce((v_conflict.remote ->> 'num_watched_episodes')::integer, 0),
      nullif(v_conflict.remote ->> 'updated_at', '')::timestamptz
    );
    update public.sync_outbox set state = 'superseded', completed_at = now(), locked_by = null
     where user_id = v_user and media_item_id = v_conflict.media_item_id and state in ('pending', 'conflict');
    update public.sync_conflicts set state = 'resolved_remote', resolved_at = now() where id = v_conflict.id;
  elsif p_choice = 'local' then
    insert into public.sync_baselines as b (user_id, media_item_id, mal_id, status, score, episodes_watched, remote_updated_at)
    values (
      v_user, v_conflict.media_item_id, v_conflict.mal_id,
      v_conflict.remote ->> 'status',
      coalesce((v_conflict.remote ->> 'score')::integer, 0),
      coalesce((v_conflict.remote ->> 'num_watched_episodes')::integer, 0),
      nullif(v_conflict.remote ->> 'updated_at', '')::timestamptz
    )
    on conflict (user_id, media_item_id) do update
      set status = excluded.status, score = excluded.score, episodes_watched = excluded.episodes_watched,
          remote_updated_at = excluded.remote_updated_at, synced_at = now();

    update public.sync_outbox set state = 'superseded', completed_at = now(), locked_by = null
     where user_id = v_user and media_item_id = v_conflict.media_item_id and state = 'conflict';

    select * into v_local from public.user_progress where user_id = v_user and media_item_id = v_conflict.media_item_id;
    insert into public.sync_outbox (user_id, media_item_id, mal_id, desired, not_before)
    values (
      v_user, v_conflict.media_item_id, v_conflict.mal_id,
      jsonb_build_object(
        'status', coalesce(v_local.status, 'plan_to_watch'),
        'score', coalesce(v_local.score, 0),
        'num_watched_episodes', coalesce(v_local.episodes_watched, 0)
      ),
      now()
    )
    on conflict (user_id, media_item_id) where state = 'pending'
    do update set desired = excluded.desired, not_before = excluded.not_before;
    update public.sync_conflicts set state = 'resolved_local', resolved_at = now() where id = v_conflict.id;
  else
    raise exception 'choice must be local or remote' using errcode = '22023';
  end if;
end;
$$;

-- Execute privileges
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.derive_watch_status(text, integer, integer)',
    'public.ensure_profile()',
    'public.recompute_container_progress(uuid[])',
    'public.set_items_checked(uuid[], boolean)',
    'public.set_container_progress(uuid, integer, text, integer, boolean)',
    'public.map_watched_count_to_episodes(uuid)',
    'public.create_arc(uuid, uuid, text, integer, integer)',
    'public.set_arc_checked(uuid, boolean)',
    'public.save_custom_tabs(uuid, jsonb)',
    'public.add_checklist_item(uuid, uuid, text)',
    'public.reorder_entry_items(uuid, uuid[])',
    'public.approve_initial_sync(bigint[], boolean)',
    'public.resolve_sync_conflict(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.import_begin(uuid, jsonb)',
    'public.import_apply_node(uuid, uuid, jsonb)',
    'public.import_apply_episodes(uuid, bigint, jsonb)',
    'public.import_finish(uuid, uuid, jsonb)',
    'public.apply_mal_remote(uuid, uuid, text, integer, integer, timestamptz)',
    'public.record_sync_conflict(uuid, uuid, bigint, jsonb, jsonb, jsonb)',
    'public.purge_expired_server_state()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
