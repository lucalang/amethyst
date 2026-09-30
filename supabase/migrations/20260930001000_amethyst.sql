-- Amethyst Archives: artwork from any public HTTP(S) host, and richer checklist
-- tasks (notes, importance, due dates and ordered steps). Existing checklist
-- items keep their label, checked state and order; new columns get defaults.

-- Artwork is fetched through the authenticated image proxy, which enforces the
-- SSRF rules (public addresses only, re-validated redirects) at request time.
alter table public.entries drop constraint entries_cover_url_check;
alter table public.entries drop constraint entries_banner_url_check;
alter table public.entries add constraint entries_cover_url_check
  check (cover_url is null or (cover_url ~* '^https?://' and char_length(cover_url) <= 2048));
alter table public.entries add constraint entries_banner_url_check
  check (banner_url is null or (banner_url ~* '^https?://' and char_length(banner_url) <= 2048));

-- ---------------------------------------------------------------------------
-- Task details
-- ---------------------------------------------------------------------------
alter table public.workspace_checklist_items
  add column notes text not null default '' check (char_length(notes) <= 20000),
  add column starred boolean not null default false,
  add column due_date date check (due_date is null or due_date between date '1900-01-01' and date '2999-12-31'),
  add constraint workspace_checklist_items_user_id_id_key unique (user_id, id);

create table public.workspace_checklist_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  item_id uuid not null,
  label text not null,
  checked boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (user_id, item_id) references public.workspace_checklist_items (user_id, id) on delete cascade,
  constraint workspace_checklist_steps_label_valid check (label = btrim(label) and char_length(label) between 1 and 500 and label !~ '[[:cntrl:]]')
);

create index workspace_checklist_steps_item_idx on public.workspace_checklist_steps (user_id, item_id, position);

create function public.workspace_checklist_steps_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id <> old.user_id or new.item_id <> old.item_id then
    raise exception 'Steps cannot move between tasks.' using errcode = '23514';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspace_checklist_steps_guard
  before update on public.workspace_checklist_steps
  for each row execute function public.workspace_checklist_steps_guard();

alter table public.workspace_checklist_steps enable row level security;
create policy owner_access on public.workspace_checklist_steps for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.workspace_checklist_steps from anon, authenticated, public;
grant select, delete on public.workspace_checklist_steps to authenticated;
grant insert (item_id, label, checked, position) on public.workspace_checklist_steps to authenticated;
grant update (label, checked, position) on public.workspace_checklist_steps to authenticated;
grant all on public.workspace_checklist_steps to service_role;

grant insert (notes, starred, due_date) on public.workspace_checklist_items to authenticated;
grant update (notes, starred, due_date) on public.workspace_checklist_items to authenticated;

revoke execute on function public.workspace_checklist_steps_guard() from public, anon, authenticated;

-- Append a step to a task; positions continue after the current last step.
create function public.add_checklist_step(p_item_id uuid, p_label text)
returns public.workspace_checklist_steps
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_step public.workspace_checklist_steps;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Lock the task so concurrent appends get distinct positions.
  perform 1 from public.workspace_checklist_items where id = p_item_id and user_id = v_user for update;
  if not found then
    raise exception 'Task not found.' using errcode = '22023';
  end if;
  insert into public.workspace_checklist_steps (item_id, label, position)
  values (
    p_item_id,
    btrim(p_label),
    coalesce((select max(s.position) + 1 from public.workspace_checklist_steps s where s.user_id = v_user and s.item_id = p_item_id), 0)
  )
  returning * into v_step;
  return v_step;
end;
$$;

-- Persist a complete ordering of a task's steps.
create function public.reorder_checklist_steps(p_item_id uuid, p_step_ids uuid[])
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.workspace_checklist_items where id = p_item_id and user_id = v_user for update;
  if not found then
    raise exception 'Task not found.' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_step_ids), 0) <> (select count(distinct x) from unnest(p_step_ids) x)
     or (select count(*) from public.workspace_checklist_steps where user_id = v_user and item_id = p_item_id)
        <> coalesce(cardinality(p_step_ids), 0)
     or exists (
       select 1 from unnest(p_step_ids) x
       where not exists (
         select 1 from public.workspace_checklist_steps s where s.user_id = v_user and s.item_id = p_item_id and s.id = x
       )
     ) then
    raise exception 'The order must list every step of this task exactly once. Reload and try again.' using errcode = '22023';
  end if;

  update public.workspace_checklist_steps s
     set position = o.ord::integer - 1
    from unnest(p_step_ids) with ordinality as o(step_id, ord)
   where s.user_id = v_user and s.item_id = p_item_id and s.id = o.step_id and s.position <> o.ord::integer - 1;
end;
$$;

revoke execute on function public.add_checklist_step(uuid, text), public.reorder_checklist_steps(uuid, uuid[]) from public, anon;
grant execute on function public.add_checklist_step(uuid, text), public.reorder_checklist_steps(uuid, uuid[]) to authenticated, service_role;
