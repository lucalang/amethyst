-- Personalization: collection identities, custom progress names and per-account workspace templates.
-- Every new column is nullable, so existing collections and entries keep their current appearance.

-- Workspace templates: a self-contained JSON tree ({ "nodes": [...] }) copied into new entries.
create table public.workspace_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  structure jsonb not null default '{"nodes": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint workspace_templates_name_valid check (name = btrim(name) and char_length(name) between 1 and 80 and name !~ '[[:cntrl:]]'),
  constraint workspace_templates_structure_valid check (
    jsonb_typeof(structure) = 'object'
    and jsonb_typeof(structure -> 'nodes') = 'array'
    and pg_column_size(structure) <= 4194304
  )
);
create unique index workspace_templates_user_name_key on public.workspace_templates (user_id, lower(name));
create trigger workspace_templates_set_updated_at before update on public.workspace_templates
  for each row execute function public.set_updated_at();
alter table public.workspace_templates enable row level security;
create policy owner_access on public.workspace_templates for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.workspace_templates from public, anon, authenticated;
grant select, delete on public.workspace_templates to authenticated;
grant insert (name, structure), update (name, structure) on public.workspace_templates to authenticated;
grant all on public.workspace_templates to service_role;

-- Collection identity and defaults for new entries.
alter table public.collections
  add column icon text
    constraint collections_icon_valid check (icon is null or (char_length(icon) <= 64 and icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
  add column accent_color text
    constraint collections_accent_color_valid check (accent_color is null or accent_color ~ '^#[0-9a-f]{6}$'),
  add column banner_url text
    constraint collections_banner_url_valid check (
      banner_url is null or (char_length(banner_url) <= 2048 and (banner_url ~ '^https?://' or banner_url ~ '^/api/attachments/[^/?#]+$'))
    ),
  add column progress_label text
    constraint collections_progress_label_valid check (
      progress_label is null or (progress_label = btrim(progress_label) and char_length(progress_label) between 1 and 40 and progress_label !~ '[[:cntrl:]]')
    ),
  add column default_template_id uuid;
alter table public.collections add constraint collections_default_template_fkey
  foreign key (user_id, default_template_id) references public.workspace_templates (user_id, id) on delete set null (default_template_id);
create index collections_default_template_idx on public.collections (user_id, default_template_id) where default_template_id is not null;
grant insert (icon, accent_color, banner_url, progress_label, default_template_id),
  update (icon, accent_color, banner_url, progress_label, default_template_id) on public.collections to authenticated;

-- Entry-specific progress name ("tasks" when null).
alter table public.entries
  add column progress_label text
    constraint entries_progress_label_valid check (
      progress_label is null or (progress_label = btrim(progress_label) and char_length(progress_label) between 1 and 40 and progress_label !~ '[[:cntrl:]]')
    );
grant insert (progress_label), update (progress_label) on public.entries to authenticated;

-- Copy a template into an entry's (still empty) workspace in one transaction.
-- Refuses when the workspace already has items, so a retry can never duplicate files.
create function public.apply_workspace_template(p_entry_id uuid, p_template_id uuid)
returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_nodes jsonb;
  v_ids jsonb := '{}'::jsonb;
  v_row record;
  v_kind text;
  v_id uuid;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.entries where id = p_entry_id and user_id = v_user for update;
  if not found then
    raise exception 'Entry not found.' using errcode = '22023';
  end if;
  if exists (select 1 from public.workspace_nodes where user_id = v_user and entry_id = p_entry_id) then
    raise exception 'This workspace already has files, so the template was not applied again.' using errcode = '22023';
  end if;
  select structure -> 'nodes' into v_nodes from public.workspace_templates where id = p_template_id and user_id = v_user;
  if v_nodes is null then
    raise exception 'Template not found.' using errcode = '22023';
  end if;

  for v_row in
    with recursive tree (node, depth, ord) as (
      select n.value, 0, n.ordinality
      from jsonb_array_elements(v_nodes) with ordinality as n(value, ordinality)
      where coalesce(n.value ->> 'parentId', '') = ''
      union all
      select c.value, t.depth + 1, c.ordinality
      from tree t
      join jsonb_array_elements(v_nodes) with ordinality as c(value, ordinality) on c.value ->> 'parentId' = t.node ->> 'id'
      where t.depth < 32
    )
    select node, depth from tree order by depth, ord
  loop
    v_kind := v_row.node ->> 'kind';
    insert into public.workspace_nodes (entry_id, parent_id, kind, name, content, include_in_cover_progress)
    values (
      p_entry_id,
      (v_ids ->> (v_row.node ->> 'parentId'))::uuid,
      v_kind,
      v_row.node ->> 'name',
      case when v_kind = 'note' then coalesce(v_row.node ->> 'content', '') else '' end,
      case when v_kind = 'folder' then false else coalesce((v_row.node ->> 'includeInCoverProgress')::boolean, v_kind = 'checklist') end
    )
    returning id into v_id;
    v_ids := v_ids || jsonb_build_object(v_row.node ->> 'id', v_id);
    v_count := v_count + 1;

    if v_kind = 'note' and coalesce((v_row.node ->> 'tasksTotal')::integer, 0) > 0 then
      update public.workspace_nodes
         set markdown_tasks_total = (v_row.node ->> 'tasksTotal')::integer,
             markdown_tasks_checked = coalesce((v_row.node ->> 'tasksChecked')::integer, 0)
       where id = v_id;
    elsif v_kind = 'checklist' then
      -- Starter tasks always begin unchecked.
      insert into public.workspace_checklist_items (file_id, label, checked, position)
      select v_id, btrim(t.label), false, t.ord::integer - 1
      from jsonb_array_elements_text(coalesce(v_row.node -> 'tasks', '[]'::jsonb)) with ordinality as t(label, ord);
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.apply_workspace_template(uuid, uuid) from public, anon;
grant execute on function public.apply_workspace_template(uuid, uuid) to authenticated, service_role;
