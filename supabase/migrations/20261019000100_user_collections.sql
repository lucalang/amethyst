create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null,
  legacy_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id),
  unique (user_id, legacy_slug),
  constraint collections_name_valid check (name = btrim(name) and char_length(name) between 1 and 60 and name !~ '[[:cntrl:]]')
);
create unique index collections_user_name_key on public.collections (user_id, lower(name));
create trigger collections_set_updated_at before update on public.collections
  for each row execute function public.set_updated_at();
alter table public.collections enable row level security;
create policy owner_access on public.collections for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.collections from public, anon, authenticated;
grant select, delete on public.collections to authenticated;
grant insert (name), update (name) on public.collections to authenticated;
grant all on public.collections to service_role;

insert into public.collections (user_id, name, legacy_slug)
select u.id, defaults.name, defaults.slug from public.users u
cross join (values ('Anime', 'anime'), ('Games', 'games'), ('Other', 'other')) defaults(name, slug);

alter table public.entries add column collection_id uuid;
alter table public.categories add column collection_id uuid;
alter table public.entry_categories add column collection_id uuid;

alter table public.entries disable trigger entries_bump_version;
update public.entries e set collection_id = c.id from public.collections c
where c.user_id = e.user_id and c.legacy_slug = case e.kind when 'anime' then 'anime' when 'game' then 'games' else 'other' end;
alter table public.entries enable trigger entries_bump_version;
alter table public.categories disable trigger categories_set_updated_at;
update public.categories label set collection_id = c.id from public.collections c
where c.user_id = label.user_id and c.legacy_slug = case label.kind when 'anime' then 'anime' when 'game' then 'games' else 'other' end;
alter table public.categories enable trigger categories_set_updated_at;
update public.entry_categories ec set collection_id = e.collection_id from public.entries e
where e.user_id = ec.user_id and e.id = ec.entry_id;

alter table public.entries alter column collection_id set not null;
alter table public.entries alter column kind set default 'custom';
alter table public.categories alter column collection_id set not null;
alter table public.categories alter column kind drop not null;
alter table public.entry_categories alter column collection_id set not null;
alter table public.entry_categories alter column kind drop not null;
alter table public.entries add constraint entries_collection_fkey
  foreign key (user_id, collection_id) references public.collections (user_id, id) on delete restrict;
alter table public.categories add constraint categories_collection_fkey
  foreign key (user_id, collection_id) references public.collections (user_id, id) on delete cascade;
create index entries_collection_idx on public.entries (user_id, collection_id);
alter table public.entries add unique (user_id, id, collection_id);
alter table public.categories add unique (user_id, id, collection_id);
drop index public.categories_user_kind_name_key;
create unique index categories_user_collection_name_key on public.categories (user_id, collection_id, lower(name));

alter table public.entry_categories drop constraint entry_categories_user_id_entry_id_fkey;
alter table public.entry_categories drop constraint entry_categories_user_id_category_id_fkey;
alter table public.entry_categories add constraint entry_categories_user_id_entry_id_fkey
  foreign key (user_id, entry_id, collection_id) references public.entries (user_id, id, collection_id)
  on delete cascade deferrable initially deferred;
alter table public.entry_categories add constraint entry_categories_user_id_category_id_fkey
  foreign key (user_id, category_id, collection_id) references public.categories (user_id, id, collection_id) on delete cascade;
drop trigger entry_categories_set_kind on public.entry_categories;
drop function public.entry_categories_set_kind();

create function public.entry_categories_set_collection() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select e.collection_id into new.collection_id from public.entries e
  where e.user_id = new.user_id and e.id = new.entry_id;
  return new;
end;
$$;
create trigger entry_categories_set_collection before insert or update on public.entry_categories
  for each row execute function public.entry_categories_set_collection();
revoke execute on function public.entry_categories_set_collection() from public, anon, authenticated;

grant insert (collection_id), update (collection_id) on public.entries to authenticated;
grant insert (collection_id) on public.categories to authenticated;

create function public.entries_move_labels() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare
  v_ids uuid[];
begin
  if new.collection_id is not distinct from old.collection_id then return new; end if;
  perform 1 from public.collections where user_id = new.user_id and id = new.collection_id for key share;
  if not found then raise exception 'Category not found.' using errcode = '23503'; end if;

  perform 1 from public.categories c
  join public.entry_categories ec on ec.user_id = c.user_id and ec.category_id = c.id
  where ec.user_id = new.user_id and ec.entry_id = new.id for share of c;

  insert into public.categories (name, collection_id)
  select c.name, new.collection_id from public.categories c
  join public.entry_categories ec on ec.user_id = c.user_id and ec.category_id = c.id
  where ec.user_id = new.user_id and ec.entry_id = new.id
  on conflict (user_id, collection_id, lower(name)) do nothing;

  perform 1 from public.categories where user_id = new.user_id and collection_id = new.collection_id for share;

  select coalesce(array_agg(destination.id), '{}') into v_ids
  from public.entry_categories ec
  join public.categories source on source.user_id = ec.user_id and source.id = ec.category_id
  join public.categories destination on destination.user_id = source.user_id
    and destination.collection_id = new.collection_id and lower(destination.name) = lower(source.name)
  where ec.user_id = new.user_id and ec.entry_id = new.id;

  delete from public.entry_categories where user_id = new.user_id and entry_id = new.id;
  insert into public.entry_categories (entry_id, category_id) select new.id, unnest(v_ids);
  return new;
end;
$$;
create trigger entries_move_labels after update of collection_id on public.entries
  for each row execute function public.entries_move_labels();
revoke execute on function public.entries_move_labels() from public, anon, authenticated;

create or replace function public.set_entry_categories(p_entry_id uuid, p_category_ids uuid[])
returns setof uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[] := coalesce(p_category_ids, '{}');
  v_collection uuid;
begin
  if v_user is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select e.collection_id into v_collection from public.entries e
  where e.id = p_entry_id and e.user_id = v_user for update;
  if not found then raise exception 'Entry not found.' using errcode = '22023'; end if;
  if cardinality(v_ids) > 100 then
    raise exception 'An entry can have at most 100 labels.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) category_id where not exists (
      select 1 from public.categories c where c.user_id = v_user and c.id = category_id and c.collection_id = v_collection
    )
  ) then raise exception 'A label does not exist in this category. Reload and try again.' using errcode = '22023'; end if;
  delete from public.entry_categories ec
  where ec.user_id = v_user and ec.entry_id = p_entry_id and ec.category_id <> all (v_ids);
  insert into public.entry_categories (entry_id, category_id)
  select p_entry_id, category_id from (select distinct unnest(v_ids) as category_id) ids on conflict do nothing;
  return query select ec.category_id from public.entry_categories ec where ec.user_id = v_user and ec.entry_id = p_entry_id;
end;
$$;