-- Tasks workspace: groups, lists (with a permanent Inbox), tasks and ordered steps.
-- Completely separate from workspace checklists and cover progress. Every row is
-- owned by one account; composite (user_id, id) foreign keys make it impossible to
-- attach a task, list or step to another account's records. Smart views (My Day,
-- Important, Planned, All, Completed) are derived from task columns, never copied.
--
-- Extension points: recurrence and reminders are expected to become nullable task
-- columns (or a per-task child table) guarded by the same triggers and returned by
-- task_changes(); no scheduling infrastructure exists yet.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.task_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint task_groups_name_valid check (name = btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]')
);

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  group_id uuid,
  name text not null,
  icon text check (icon is null or (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(icon) <= 64)),
  accent_color text check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'),
  is_inbox boolean not null default false,
  position integer not null default 0,
  show_completed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, group_id) references public.task_groups (user_id, id) on delete set null (group_id),
  constraint task_lists_name_valid check (name = btrim(name) and char_length(name) between 1 and 120 and name !~ '[[:cntrl:]]'),
  constraint task_lists_inbox_ungrouped check (not is_inbox or group_id is null)
);

create unique index task_lists_one_inbox on public.task_lists (user_id) where is_inbox;
create index task_lists_layout_idx on public.task_lists (user_id, group_id, position);
create index task_lists_updated_idx on public.task_lists (user_id, updated_at);
create index task_groups_updated_idx on public.task_groups (user_id, updated_at);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  list_id uuid not null,
  title text not null,
  notes text not null default '' check (char_length(notes) <= 20000),
  -- Bumped by the guard trigger whenever notes change; writers send the revision they edited.
  notes_rev integer not null default 0,
  has_notes boolean generated always as (notes <> '') stored,
  important boolean not null default false,
  due_date date check (due_date is null or due_date between date '1900-01-01' and date '2999-12-31'),
  -- The calendar day (in the account's time zone) this task was picked for My Day.
  my_day_on date check (my_day_on is null or my_day_on between date '1900-01-01' and date '2999-12-31'),
  completed_at timestamptz,
  -- Optional link to an archive entry; unlinked automatically when the entry is deleted.
  entry_id uuid,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, list_id) references public.task_lists (user_id, id) on delete cascade,
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete set null (entry_id),
  constraint tasks_title_valid check (title = btrim(title) and char_length(title) between 1 and 500 and title !~ '[[:cntrl:]]')
);

create index tasks_list_idx on public.tasks (user_id, list_id, position);
create index tasks_updated_idx on public.tasks (user_id, updated_at);
create index tasks_my_day_idx on public.tasks (user_id, my_day_on) where my_day_on is not null;
create index tasks_entry_idx on public.tasks (user_id, entry_id) where entry_id is not null;

create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  task_id uuid not null,
  title text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, task_id) references public.tasks (user_id, id) on delete cascade,
  constraint task_steps_title_valid check (title = btrim(title) and char_length(title) between 1 and 500 and title !~ '[[:cntrl:]]')
);

create index task_steps_task_idx on public.task_steps (user_id, task_id, position);
create index task_steps_updated_idx on public.task_steps (user_id, updated_at);

-- Deletions since a sync cursor, so other devices can drop rows without a full download.
-- No foreign key: rows are written while an account's data is being cascaded away.
create table public.task_deletions (
  user_id uuid not null,
  kind text not null check (kind in ('group', 'list', 'task', 'step')),
  id uuid not null,
  deleted_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index task_deletions_since_idx on public.task_deletions (user_id, deleted_at);

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
-- Next free top-level slot shared by groups and ungrouped lists.
create function public._task_top_position(p_user uuid) returns integer
language sql stable security invoker set search_path = '' as $$
  select greatest(
    coalesce((select max(g.position) + 1 from public.task_groups g where g.user_id = p_user), 0),
    coalesce((select max(l.position) + 1 from public.task_lists l where l.user_id = p_user and l.group_id is null and not l.is_inbox), 0)
  );
$$;

create function public.task_groups_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.position := public._task_top_position(new.user_id);
    return new;
  end if;
  if new.user_id <> old.user_id then
    raise exception 'Groups cannot change owner.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger task_groups_guard before insert or update on public.task_groups
  for each row execute function public.task_groups_guard();

create function public.task_lists_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.position := case
      when new.group_id is null then public._task_top_position(new.user_id)
      else coalesce((select max(l.position) + 1 from public.task_lists l where l.user_id = new.user_id and l.group_id = new.group_id), 0)
    end;
    return new;
  end if;
  if new.user_id <> old.user_id or new.is_inbox <> old.is_inbox then
    raise exception 'Lists cannot change owner or kind.' using errcode = '23514';
  end if;
  if old.is_inbox and new.name <> old.name then
    raise exception 'The Inbox cannot be renamed.' using errcode = '22023';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger task_lists_guard before insert or update on public.task_lists
  for each row execute function public.task_lists_guard();

create function public.task_lists_protect_inbox() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- The account itself is being deleted when its profile row is already gone.
  if old.is_inbox and exists (select 1 from public.users u where u.id = old.user_id) then
    raise exception 'The Inbox cannot be deleted.' using errcode = '22023';
  end if;
  return old;
end;
$$;

create trigger task_lists_protect_inbox before delete on public.task_lists
  for each row execute function public.task_lists_protect_inbox();

create function public.tasks_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'Tasks cannot change owner.' using errcode = '23514';
  end if;
  if new.list_id <> old.list_id then
    -- A moved task lands at the top of its new list.
    new.position := coalesce((select min(t.position) from public.tasks t where t.user_id = new.user_id and t.list_id = new.list_id), 0) - 1;
  end if;
  new.notes_rev := case when new.notes is distinct from old.notes then old.notes_rev + 1 else old.notes_rev end;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_guard before update on public.tasks
  for each row execute function public.tasks_guard();

create function public.task_steps_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.task_id <> old.task_id then
    raise exception 'Steps cannot move between tasks.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger task_steps_guard before update on public.task_steps
  for each row execute function public.task_steps_guard();

-- ---------------------------------------------------------------------------
-- Sync: tombstones and a per-account broadcast after each changing statement
-- ---------------------------------------------------------------------------
create function public.task_record_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.users u where u.id = old.user_id) then
    insert into public.task_deletions (user_id, kind, id)
    values (old.user_id, tg_argv[0], old.id)
    on conflict (user_id, kind, id) do update set deleted_at = now();
  end if;
  return null;
end;
$$;

create trigger task_groups_deleted after delete on public.task_groups
  for each row execute function public.task_record_deletion('group');
create trigger task_lists_deleted after delete on public.task_lists
  for each row execute function public.task_record_deletion('list');
create trigger tasks_deleted after delete on public.tasks
  for each row execute function public.task_record_deletion('task');
create trigger task_steps_deleted after delete on public.task_steps
  for each row execute function public.task_record_deletion('step');

-- A tiny "something changed" signal on the account's private Realtime topic. Devices
-- then pull only rows changed since their cursor. Never blocks the write itself.
create function public.task_broadcast_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return null;
  end if;
  begin
    execute 'select realtime.send($1, $2, $3, true)'
      using jsonb_build_object('table', tg_table_name), 'changed', 'tasks:' || v_user::text;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create trigger task_groups_broadcast after insert or update or delete on public.task_groups
  for each statement execute function public.task_broadcast_change();
create trigger task_lists_broadcast after insert or update or delete on public.task_lists
  for each statement execute function public.task_broadcast_change();
create trigger tasks_broadcast after insert or update or delete on public.tasks
  for each statement execute function public.task_broadcast_change();
create trigger task_steps_broadcast after insert or update or delete on public.task_steps
  for each statement execute function public.task_broadcast_change();

-- Only the owner may join their private tasks topic.
do $$
begin
  if to_regclass('realtime.messages') is not null and to_regprocedure('realtime.topic()') is not null then
    execute $policy$
      create policy tasks_sync_own_topic on realtime.messages for select to authenticated
        using (
          realtime.messages.extension = 'broadcast'
          and (select realtime.topic()) = 'tasks:' || (select auth.uid())::text
        )
    $policy$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security and column privileges
-- ---------------------------------------------------------------------------
alter table public.task_groups enable row level security;
alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.task_steps enable row level security;
alter table public.task_deletions enable row level security;

create policy owner_access on public.task_groups for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_access on public.task_lists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_access on public.tasks for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_access on public.task_steps for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_read on public.task_deletions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy owner_prune on public.task_deletions for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.task_groups, public.task_lists, public.tasks, public.task_steps, public.task_deletions from public, anon, authenticated;
grant select, delete on public.task_groups, public.task_lists, public.tasks, public.task_steps, public.task_deletions to authenticated;
grant insert (name) on public.task_groups to authenticated;
grant update (name, collapsed, position) on public.task_groups to authenticated;
grant insert (name, group_id, icon, accent_color) on public.task_lists to authenticated;
grant update (name, group_id, icon, accent_color, show_completed, position) on public.task_lists to authenticated;
grant insert (list_id, title, notes, important, due_date, my_day_on, completed_at, entry_id, position) on public.tasks to authenticated;
grant update (list_id, title, notes, important, due_date, my_day_on, completed_at, entry_id, position) on public.tasks to authenticated;
grant insert (task_id, title, completed, position) on public.task_steps to authenticated;
grant update (title, completed, position) on public.task_steps to authenticated;
grant all on public.task_groups, public.task_lists, public.tasks, public.task_steps, public.task_deletions to service_role;

revoke execute on function
  public._task_top_position(uuid), public.task_groups_guard(), public.task_lists_guard(), public.task_lists_protect_inbox(),
  public.tasks_guard(), public.task_steps_guard(), public.task_record_deletion(), public.task_broadcast_change()
from public, anon, authenticated;
grant execute on function public._task_top_position(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------
-- The account's Inbox, created on first use.
create function public.ensure_task_inbox() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select l.id into v_id from public.task_lists l where l.user_id = v_user and l.is_inbox;
  if v_id is null then
    insert into public.task_lists (user_id, name, is_inbox) values (v_user, 'Inbox', true)
    on conflict (user_id) where is_inbox do nothing
    returning id into v_id;
    if v_id is null then
      select l.id into v_id from public.task_lists l where l.user_id = v_user and l.is_inbox;
    end if;
  end if;
  return v_id;
end;
$$;

-- Everything changed since a cursor (or a full snapshot when p_since is null or too
-- old for the tombstone window). Notes are never included; they load per task.
create function public.task_changes(p_since timestamptz default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_full boolean := p_since is null or p_since < clock_timestamp() - interval '30 days';
  -- Overlap the cursor so rows committed by slightly older transactions are not missed.
  v_from timestamptz := case when v_full then '-infinity'::timestamptz else p_since - interval '2 minutes' end;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_full then
    perform public.ensure_task_inbox();
    delete from public.task_deletions d where d.user_id = v_user and d.deleted_at < v_now - interval '31 days';
  end if;
  return jsonb_build_object(
    'now', v_now,
    'full', v_full,
    'groups', (select coalesce(jsonb_agg(to_jsonb(g) - 'user_id'), '[]'::jsonb) from public.task_groups g where g.user_id = v_user and g.updated_at > v_from),
    'lists', (select coalesce(jsonb_agg(to_jsonb(l) - 'user_id'), '[]'::jsonb) from public.task_lists l where l.user_id = v_user and l.updated_at > v_from),
    'tasks', (select coalesce(jsonb_agg(to_jsonb(t) - 'user_id' - 'notes'), '[]'::jsonb) from public.tasks t where t.user_id = v_user and t.updated_at > v_from),
    'steps', (select coalesce(jsonb_agg(to_jsonb(s) - 'user_id'), '[]'::jsonb) from public.task_steps s where s.user_id = v_user and s.updated_at > v_from),
    'entries', (
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title, 'slug', e.slug)), '[]'::jsonb)
      from public.entries e
      where e.user_id = v_user
        and e.id in (select t.entry_id from public.tasks t where t.user_id = v_user and t.entry_id is not null and t.updated_at > v_from)
    ),
    'deleted', case when v_full then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object('kind', d.kind, 'id', d.id)), '[]'::jsonb)
      from public.task_deletions d where d.user_id = v_user and d.deleted_at > v_from
    ) end
  );
end;
$$;

-- Add tasks to the top of a list in the given order (bulk paste keeps input order).
create function public.add_tasks(
  p_list_id uuid,
  p_titles text[],
  p_completed boolean[],
  p_important boolean default false,
  p_due_date date default null,
  p_my_day date default null
) returns setof public.tasks
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer := coalesce(cardinality(p_titles), 0);
  v_top integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_count not between 1 and 500 or coalesce(cardinality(p_completed), 0) <> v_count then
    raise exception 'Add between 1 and 500 tasks at once.' using errcode = '22023';
  end if;
  perform 1 from public.task_lists l where l.id = p_list_id and l.user_id = v_user for update;
  if not found then
    raise exception 'That list no longer exists.' using errcode = '22023';
  end if;
  select coalesce(min(t.position), 0) into v_top from public.tasks t where t.user_id = v_user and t.list_id = p_list_id;
  return query
    insert into public.tasks (list_id, title, completed_at, important, due_date, my_day_on, position)
    select p_list_id, btrim(x.title), case when x.done then now() end, coalesce(p_important, false), p_due_date, p_my_day, v_top - v_count + x.ord::integer - 1
    from unnest(p_titles, p_completed) with ordinality as x(title, done, ord)
    order by x.ord
    returning *;
end;
$$;

-- Reorder some tasks of one list among the slots they already occupy.
create function public.reorder_tasks(p_task_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_list uuid;
  v_count integer := coalesce(cardinality(p_task_ids), 0);
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_count = 0 then
    return;
  end if;
  select min(t.list_id::text)::uuid into v_list from public.tasks t where t.user_id = v_user and t.id = any(p_task_ids);
  if v_list is null
     or v_count <> (select count(distinct x) from unnest(p_task_ids) x)
     or v_count <> (select count(*) from public.tasks t where t.user_id = v_user and t.list_id = v_list and t.id = any(p_task_ids)) then
    raise exception 'Those tasks changed in the meantime. Try again.' using errcode = '22023';
  end if;
  perform 1 from public.task_lists l where l.id = v_list and l.user_id = v_user for update;
  -- Make positions unique first so the permutation is well defined.
  if exists (select 1 from public.tasks t where t.user_id = v_user and t.list_id = v_list group by t.position having count(*) > 1) then
    update public.tasks t set position = o.ord::integer
      from (select t2.id, row_number() over (order by t2.position, t2.id) as ord from public.tasks t2 where t2.user_id = v_user and t2.list_id = v_list) o
     where t.id = o.id and t.user_id = v_user;
  end if;
  update public.tasks t
     set position = s.position
    from unnest(p_task_ids) with ordinality as w(id, ord)
    join (
      select t2.position, row_number() over (order by t2.position, t2.id) as ord
      from public.tasks t2 where t2.user_id = v_user and t2.id = any(p_task_ids)
    ) s on s.ord = w.ord
   where t.id = w.id and t.user_id = v_user and t.position <> s.position;
end;
$$;

-- Persist the whole sidebar: [{"group": id, "lists": [ids]} | {"list": id}, ...].
create function public.set_task_layout(p_layout jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_group_ids uuid[];
  v_group_pos integer[];
  v_list_ids uuid[];
  v_list_groups uuid[];
  v_list_pos integer[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if jsonb_typeof(p_layout) <> 'array' then
    raise exception 'Invalid layout.' using errcode = '22023';
  end if;
  perform 1 from public.users u where u.id = v_user for update;

  select coalesce(array_agg((t.value->>'group')::uuid order by t.ord), '{}'), coalesce(array_agg(t.ord::integer - 1 order by t.ord), '{}')
    into v_group_ids, v_group_pos
  from jsonb_array_elements(p_layout) with ordinality as t(value, ord)
  where t.value ? 'group';

  select coalesce(array_agg(x.list_id order by x.k), '{}'), coalesce(array_agg(x.group_id order by x.k), '{}'), coalesce(array_agg(x.pos order by x.k), '{}')
    into v_list_ids, v_list_groups, v_list_pos
  from (
    select (t.value->>'list')::uuid as list_id, null::uuid as group_id, t.ord::integer - 1 as pos, t.ord * 100000 as k
      from jsonb_array_elements(p_layout) with ordinality as t(value, ord)
     where t.value ? 'list'
    union all
    select (l.value #>> '{}')::uuid, (t.value->>'group')::uuid, l.ord::integer - 1, t.ord * 100000 + l.ord
      from jsonb_array_elements(p_layout) with ordinality as t(value, ord)
      cross join lateral jsonb_array_elements(coalesce(t.value->'lists', '[]'::jsonb)) with ordinality as l(value, ord)
     where t.value ? 'group'
  ) x;

  if cardinality(v_group_ids) <> (select count(distinct g) from unnest(v_group_ids) g)
     or cardinality(v_group_ids) <> (select count(*) from public.task_groups g where g.user_id = v_user)
     or exists (select 1 from unnest(v_group_ids) g where not exists (select 1 from public.task_groups x where x.user_id = v_user and x.id = g))
     or cardinality(v_list_ids) <> (select count(distinct l) from unnest(v_list_ids) l)
     or cardinality(v_list_ids) <> (select count(*) from public.task_lists l where l.user_id = v_user and not l.is_inbox)
     or exists (select 1 from unnest(v_list_ids) l where not exists (select 1 from public.task_lists x where x.user_id = v_user and x.id = l and not x.is_inbox)) then
    raise exception 'Your lists changed on another device. The sidebar was refreshed; try again.' using errcode = '22023', hint = 'layout_changed';
  end if;

  update public.task_groups g set position = o.pos
    from unnest(v_group_ids, v_group_pos) as o(id, pos)
   where g.user_id = v_user and g.id = o.id and g.position <> o.pos;
  update public.task_lists l set group_id = o.group_id, position = o.pos
    from unnest(v_list_ids, v_list_groups, v_list_pos) as o(id, group_id, pos)
   where l.user_id = v_user and l.id = o.id and (l.group_id is distinct from o.group_id or l.position <> o.pos);
end;
$$;

-- Delete a group; its lists (and their tasks) stay, ungrouped, where the group was.
create function public.delete_task_group(p_group_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_pos integer;
  v_count integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.users u where u.id = v_user for update;
  select g.position into v_pos from public.task_groups g where g.id = p_group_id and g.user_id = v_user;
  if not found then
    raise exception 'That group no longer exists.' using errcode = '22023';
  end if;
  select count(*) into v_count from public.task_lists l where l.user_id = v_user and l.group_id = p_group_id;
  if v_count > 0 then
    update public.task_groups g set position = g.position + v_count where g.user_id = v_user and g.position > v_pos;
    update public.task_lists l set position = l.position + v_count where l.user_id = v_user and l.group_id is null and l.position > v_pos;
    update public.task_lists l set group_id = null, position = v_pos + o.ord::integer
      from (select x.id, row_number() over (order by x.position, x.id) as ord from public.task_lists x where x.user_id = v_user and x.group_id = p_group_id) o
     where l.id = o.id and l.user_id = v_user;
  end if;
  delete from public.task_groups g where g.id = p_group_id and g.user_id = v_user;
end;
$$;

-- Delete a list and its tasks, only if it still holds the number of tasks the user confirmed.
create function public.delete_task_list(p_list_id uuid, p_expected_tasks integer) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_inbox boolean;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select l.is_inbox into v_inbox from public.task_lists l where l.id = p_list_id and l.user_id = v_user for update;
  if not found then
    raise exception 'That list no longer exists.' using errcode = '22023';
  end if;
  if v_inbox then
    raise exception 'The Inbox cannot be deleted.' using errcode = '22023';
  end if;
  if (select count(*) from public.tasks t where t.user_id = v_user and t.list_id = p_list_id) <> p_expected_tasks then
    raise exception 'Tasks were added or removed on another device. Review the list and try again.' using errcode = '22023', hint = 'list_changed';
  end if;
  delete from public.task_lists l where l.id = p_list_id and l.user_id = v_user;
end;
$$;

-- Append a step to a task.
create function public.add_task_step(p_task_id uuid, p_title text) returns public.task_steps
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_step public.task_steps;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.tasks t where t.id = p_task_id and t.user_id = v_user for update;
  if not found then
    raise exception 'That task no longer exists.' using errcode = '22023';
  end if;
  insert into public.task_steps (task_id, title, position)
  values (
    p_task_id,
    btrim(p_title),
    coalesce((select max(s.position) + 1 from public.task_steps s where s.user_id = v_user and s.task_id = p_task_id), 0)
  )
  returning * into v_step;
  return v_step;
end;
$$;

-- Persist a complete ordering of a task's steps.
create function public.reorder_task_steps(p_task_id uuid, p_step_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.tasks t where t.id = p_task_id and t.user_id = v_user for update;
  if not found then
    raise exception 'That task no longer exists.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_step_ids), 0) <> (select count(distinct x) from unnest(p_step_ids) x)
     or (select count(*) from public.task_steps s where s.user_id = v_user and s.task_id = p_task_id) <> coalesce(cardinality(p_step_ids), 0)
     or exists (
       select 1 from unnest(p_step_ids) x
       where not exists (select 1 from public.task_steps s where s.user_id = v_user and s.task_id = p_task_id and s.id = x)
     ) then
    raise exception 'Steps changed on another device. Try again.' using errcode = '22023';
  end if;
  update public.task_steps s
     set position = o.ord::integer - 1
    from unnest(p_step_ids) with ordinality as o(step_id, ord)
   where s.user_id = v_user and s.task_id = p_task_id and s.id = o.step_id and s.position <> o.ord::integer - 1;
end;
$$;

revoke execute on function
  public.ensure_task_inbox(), public.task_changes(timestamptz),
  public.add_tasks(uuid, text[], boolean[], boolean, date, date), public.reorder_tasks(uuid[]),
  public.set_task_layout(jsonb), public.delete_task_group(uuid), public.delete_task_list(uuid, integer),
  public.add_task_step(uuid, text), public.reorder_task_steps(uuid, uuid[])
from public, anon;
grant execute on function
  public.ensure_task_inbox(), public.task_changes(timestamptz),
  public.add_tasks(uuid, text[], boolean[], boolean, date, date), public.reorder_tasks(uuid[]),
  public.set_task_layout(jsonb), public.delete_task_group(uuid), public.delete_task_list(uuid, integer),
  public.add_task_step(uuid, text), public.reorder_task_steps(uuid, uuid[])
to authenticated, service_role;
