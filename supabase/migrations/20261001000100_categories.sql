-- Custom categories: one private, reusable set of labels per account that can be
-- assigned to any number of entries of any kind. Existing entries start
-- uncategorized; nothing else changes.

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  constraint categories_name_valid check (name = btrim(name) and char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]')
);

-- Names are unique per account regardless of case ("Romance" = "romance").
create unique index categories_user_name_key on public.categories (user_id, lower(name));

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create table public.entry_categories (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  entry_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, entry_id, category_id),
  -- Composite keys: an assignment can only join an entry and a category of the same owner.
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, category_id) references public.categories (user_id, id) on delete cascade
);

create index entry_categories_category_idx on public.entry_categories (user_id, category_id);

alter table public.categories enable row level security;
alter table public.entry_categories enable row level security;
create policy owner_access on public.categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy owner_access on public.entry_categories for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.categories, public.entry_categories from anon, authenticated, public;
grant select, delete on public.categories, public.entry_categories to authenticated;
grant insert (name) on public.categories to authenticated;
grant update (name) on public.categories to authenticated;
grant insert (entry_id, category_id) on public.entry_categories to authenticated;
grant all on public.categories, public.entry_categories to service_role;

-- Replace an entry's category assignments; returns the resulting category ids.
create function public.set_entry_categories(p_entry_id uuid, p_category_ids uuid[])
returns setof uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[] := coalesce(p_category_ids, '{}');
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.entries e where e.id = p_entry_id and e.user_id = v_user) then
    raise exception 'Entry not found.' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 100 then
    raise exception 'An entry can have at most 100 categories.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) x
    where not exists (select 1 from public.categories c where c.user_id = v_user and c.id = x)
  ) then
    raise exception 'A category no longer exists. Reload and try again.' using errcode = '22023';
  end if;

  delete from public.entry_categories ec
   where ec.user_id = v_user and ec.entry_id = p_entry_id and ec.category_id <> all (v_ids);
  insert into public.entry_categories (entry_id, category_id)
  select p_entry_id, x from (select distinct unnest(v_ids) as x) ids
  on conflict do nothing;

  return query select ec.category_id from public.entry_categories ec where ec.user_id = v_user and ec.entry_id = p_entry_id;
end;
$$;

revoke execute on function public.set_entry_categories(uuid, uuid[]) from public, anon;
grant execute on function public.set_entry_categories(uuid, uuid[]) to authenticated, service_role;
