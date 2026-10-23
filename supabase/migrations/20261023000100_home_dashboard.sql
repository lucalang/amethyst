-- Saved category order, deleting populated categories, bulk tasks with state,
-- and the per-account Home data (entry visits and pins).

-- ---------------------------------------------------------------------------
-- Category order
-- ---------------------------------------------------------------------------
alter table public.collections add column position integer;

alter table public.collections disable trigger collections_set_updated_at;
update public.collections c set position = o.rn
from (
  select id, (row_number() over (partition by user_id order by created_at, id))::integer - 1 as rn
  from public.collections
) o
where o.id = c.id;
alter table public.collections enable trigger collections_set_updated_at;

alter table public.collections alter column position set not null;
create index collections_user_position_idx on public.collections (user_id, position);

-- New categories go to the end of the owner's order.
create function public.collections_append_position() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('collections:' || new.user_id::text, 0));
  select coalesce(max(c.position) + 1, 0) into new.position
  from public.collections c where c.user_id = new.user_id;
  return new;
end;
$$;
create trigger collections_append_position before insert on public.collections
  for each row execute function public.collections_append_position();
revoke execute on function public.collections_append_position() from public, anon, authenticated;

grant update (position) on public.collections to authenticated;

-- Persist a complete ordering of the caller's categories.
create function public.reorder_collections(p_collection_ids uuid[])
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('collections:' || v_user::text, 0));
  if coalesce(cardinality(p_collection_ids), 0) <> (select count(distinct x) from unnest(p_collection_ids) x)
     or (select count(*) from public.collections where user_id = v_user) <> coalesce(cardinality(p_collection_ids), 0)
     or exists (
       select 1 from unnest(p_collection_ids) x
       where not exists (select 1 from public.collections c where c.user_id = v_user and c.id = x)
     ) then
    raise exception 'Your categories changed in the meantime. Reload and try again.' using errcode = '22023';
  end if;

  update public.collections c
     set position = o.ord::integer - 1
    from unnest(p_collection_ids) with ordinality as o(collection_id, ord)
   where c.user_id = v_user and c.id = o.collection_id and c.position <> o.ord::integer - 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete a category together with its entries
-- ---------------------------------------------------------------------------
-- Entries cascade to their workspace nodes, checklist items, steps, label
-- assignments, visits and pins; the category cascades to its labels. Uploaded
-- images live in storage and are never removed here. p_expected_entries is the
-- count the user confirmed, so entries added meanwhile are never deleted unseen.
create function public.delete_collection(p_collection_id uuid, p_expected_entries integer)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Blocks concurrent inserts or moves into this category until we commit.
  perform 1 from public.collections where id = p_collection_id and user_id = v_user for update;
  if not found then
    raise exception 'Category not found.' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_count from public.entries
  where user_id = v_user and collection_id = p_collection_id;
  if v_count <> coalesce(p_expected_entries, -1) then
    raise exception 'This category now has % %. Review it and confirm again.', v_count, case when v_count = 1 then 'entry' else 'entries' end
      using errcode = '22023';
  end if;

  delete from public.entries where user_id = v_user and collection_id = p_collection_id;
  delete from public.collections where id = p_collection_id and user_id = v_user;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bulk tasks that keep their completion state
-- ---------------------------------------------------------------------------
create function public.add_checklist_tasks(p_file_id uuid, p_labels text[], p_checked boolean[])
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
    raise exception 'Add at most 500 tasks at once.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_checked), 0) <> cardinality(p_labels) then
    raise exception 'Every task needs a completion state.' using errcode = '22023';
  end if;
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
    insert into public.workspace_checklist_items (file_id, label, checked, position)
    select p_file_id, btrim(l.label), coalesce(p_checked[l.ord::integer], false), v_next + l.ord::integer - 1
    from unnest(p_labels) with ordinality as l(label, ord)
    returning *;
end;
$$;

-- ---------------------------------------------------------------------------
-- Home: recently opened entries (with their last open file) and pins
-- ---------------------------------------------------------------------------
create table public.entry_visits (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  entry_id uuid not null,
  last_file_id uuid,
  visited_at timestamptz not null default now(),
  primary key (user_id, entry_id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, entry_id, last_file_id) references public.workspace_nodes (user_id, entry_id, id)
    on delete set null (last_file_id)
);
create index entry_visits_recent_idx on public.entry_visits (user_id, visited_at desc);

create table public.entry_pins (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  entry_id uuid not null,
  pinned_at timestamptz not null default now(),
  primary key (user_id, entry_id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade
);
create index entry_pins_recent_idx on public.entry_pins (user_id, pinned_at desc);

alter table public.entry_visits enable row level security;
alter table public.entry_pins enable row level security;
create policy owner_access on public.entry_visits for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_access on public.entry_pins for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.entry_visits, public.entry_pins from public, anon, authenticated;
grant select, delete on public.entry_visits, public.entry_pins to authenticated;
grant insert (entry_id, last_file_id), update (last_file_id, visited_at) on public.entry_visits to authenticated;
grant insert (entry_id) on public.entry_pins to authenticated;
grant all on public.entry_visits, public.entry_pins to service_role;

-- Remember that the caller opened an entry, and which file (never a folder) was open.
create function public.record_entry_visit(p_entry_id uuid, p_file_id uuid default null)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_file uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.entries where user_id = v_user and id = p_entry_id) then
    raise exception 'Entry not found.' using errcode = '22023';
  end if;
  if p_file_id is not null then
    select n.id into v_file from public.workspace_nodes n
    where n.user_id = v_user and n.entry_id = p_entry_id and n.id = p_file_id and n.kind <> 'folder';
  end if;
  insert into public.entry_visits (entry_id, last_file_id) values (p_entry_id, v_file)
  on conflict (user_id, entry_id) do update set last_file_id = excluded.last_file_id, visited_at = now();
end;
$$;

revoke execute on function public.reorder_collections(uuid[]), public.delete_collection(uuid, integer),
  public.add_checklist_tasks(uuid, text[], boolean[]), public.record_entry_visit(uuid, uuid) from public, anon;
grant execute on function public.reorder_collections(uuid[]), public.delete_collection(uuid, integer),
  public.add_checklist_tasks(uuid, text[], boolean[]), public.record_entry_visit(uuid, uuid) to authenticated, service_role;
