-- Tasks no longer have a mandatory system Inbox. Each account's Inbox that still holds
-- tasks becomes an ordinary list (renamable, movable, deletable) at the top of the
-- sidebar; an empty Inbox is removed. Task creation always targets an explicit list.

drop trigger task_lists_protect_inbox on public.task_lists;
drop function public.task_lists_protect_inbox();

create or replace function public.task_lists_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.position := case
      when new.group_id is null then public._task_top_position(new.user_id)
      else coalesce((select max(l.position) + 1 from public.task_lists l where l.user_id = new.user_id and l.group_id = new.group_id), 0)
    end;
    return new;
  end if;
  if new.user_id <> old.user_id then
    raise exception 'Lists cannot change owner.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

-- Empty Inboxes go (tombstoned for other devices by the existing delete trigger).
delete from public.task_lists l
 where l.is_inbox
   and not exists (select 1 from public.tasks t where t.user_id = l.user_id and t.list_id = l.id);

-- Inboxes with tasks become ordinary lists, first in the sidebar where the Inbox used to be.
update public.task_lists l
   set is_inbox = false,
       icon = coalesce(l.icon, 'inbox'),
       position = coalesce(least(
         (select min(g.position) from public.task_groups g where g.user_id = l.user_id),
         (select min(x.position) from public.task_lists x where x.user_id = l.user_id and x.group_id is null and not x.is_inbox)
       ), 0) - 1
 where l.is_inbox;

create or replace function public._task_top_position(p_user uuid) returns integer
language sql stable security invoker set search_path = '' as $$
  select greatest(
    coalesce((select max(g.position) + 1 from public.task_groups g where g.user_id = p_user), 0),
    coalesce((select max(l.position) + 1 from public.task_lists l where l.user_id = p_user and l.group_id is null), 0)
  );
$$;

create or replace function public.task_changes(p_since timestamptz default null) returns jsonb
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

create or replace function public.set_task_layout(p_layout jsonb) returns void
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
     or cardinality(v_list_ids) <> (select count(*) from public.task_lists l where l.user_id = v_user)
     or exists (select 1 from unnest(v_list_ids) l where not exists (select 1 from public.task_lists x where x.user_id = v_user and x.id = l)) then
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

create or replace function public.delete_task_list(p_list_id uuid, p_expected_tasks integer) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.task_lists l where l.id = p_list_id and l.user_id = v_user for update;
  if not found then
    raise exception 'That list no longer exists.' using errcode = '22023';
  end if;
  if (select count(*) from public.tasks t where t.user_id = v_user and t.list_id = p_list_id) <> p_expected_tasks then
    raise exception 'Tasks were added or removed on another device. Review the list and try again.' using errcode = '22023', hint = 'list_changed';
  end if;
  delete from public.task_lists l where l.id = p_list_id and l.user_id = v_user;
end;
$$;

drop function public.ensure_task_inbox();

-- is_inbox stays (always false) only so a build deployed before this change keeps reading
-- lists; nothing uses it anymore and a later migration can drop it.
drop index public.task_lists_one_inbox;
alter table public.task_lists drop constraint task_lists_inbox_ungrouped;
alter table public.task_lists add constraint task_lists_no_inbox check (not is_inbox);
