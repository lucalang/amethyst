alter table public.workspace_nodes
  add column include_in_cover_progress boolean,
  add column markdown_tasks_total integer not null default 0,
  add column markdown_tasks_checked integer not null default 0;

alter table public.workspace_nodes disable trigger workspace_nodes_guard;
update public.workspace_nodes set include_in_cover_progress = (kind = 'checklist');
alter table public.workspace_nodes enable trigger workspace_nodes_guard;
alter table public.workspace_nodes alter column include_in_cover_progress set not null;
alter table public.workspace_nodes add constraint workspace_nodes_progress_valid check (
  (kind <> 'folder' or not include_in_cover_progress)
  and markdown_tasks_checked between 0 and markdown_tasks_total
  and (kind = 'note' or (markdown_tasks_total = 0 and markdown_tasks_checked = 0))
);

create function public.workspace_nodes_progress_default() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.include_in_cover_progress is null then
    new.include_in_cover_progress := (new.kind = 'checklist');
  end if;
  return new;
end;
$$;
create trigger workspace_nodes_progress_default before insert on public.workspace_nodes
  for each row execute function public.workspace_nodes_progress_default();
revoke execute on function public.workspace_nodes_progress_default() from public, anon, authenticated;

grant insert (include_in_cover_progress) on public.workspace_nodes to authenticated;
grant update (include_in_cover_progress, markdown_tasks_total, markdown_tasks_checked) on public.workspace_nodes to authenticated;

create or replace view public.workspace_tree with (security_invoker = true) as
select
  n.id, n.user_id, n.entry_id, n.parent_id, n.kind, n.name, n.version, n.updated_at,
  case when n.kind = 'note' then n.markdown_tasks_total else coalesce(c.total, 0)::integer end as items_total,
  case when n.kind = 'note' then n.markdown_tasks_checked else coalesce(c.checked, 0)::integer end as items_checked,
  n.include_in_cover_progress
from public.workspace_nodes n
left join lateral (
  select count(*) as total, count(*) filter (where i.checked) as checked
  from public.workspace_checklist_items i
  where i.user_id = n.user_id and i.file_id = n.id
) c on n.kind = 'checklist';

create or replace view public.entry_workspace_summary with (security_invoker = true) as
select
  e.id as entry_id, e.user_id,
  coalesce(n.files, 0)::integer as files_total,
  coalesce(n.total, 0)::integer as checklist_total,
  coalesce(n.checked, 0)::integer as checklist_checked,
  greatest(e.updated_at, n.last_node_at, c.last_item_at) as last_activity_at
from public.entries e
left join lateral (
  select
    count(*) filter (where x.kind <> 'folder') as files,
    sum(x.items_total) filter (where x.include_in_cover_progress and x.kind <> 'folder') as total,
    sum(x.items_checked) filter (where x.include_in_cover_progress and x.kind <> 'folder') as checked,
    max(x.updated_at) as last_node_at
  from public.workspace_tree x
  where x.user_id = e.user_id and x.entry_id = e.id
) n on true
left join lateral (
  select max(i.updated_at) as last_item_at
  from public.workspace_nodes f
  join public.workspace_checklist_items i on i.user_id = f.user_id and i.file_id = f.id
  where f.user_id = e.user_id and f.entry_id = e.id
) c on true;