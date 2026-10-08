alter table public.categories add column kind text;

create temporary table category_type_mapping as
with kinds as (
  select kind from (values ('anime'), ('game'), ('custom')) supported(kind)
  union
  select distinct kind from public.entries
), required as (
  select c.id, c.user_id, k.kind
  from public.categories c cross join kinds k
  where exists (
    select 1 from public.entry_categories ec
    join public.entries e on e.user_id = ec.user_id and e.id = ec.entry_id
    where ec.user_id = c.user_id and ec.category_id = c.id and e.kind = k.kind
  ) or not exists (
    select 1 from public.entry_categories ec where ec.user_id = c.user_id and ec.category_id = c.id
  )
)
select id as old_id, user_id, kind,
  case when row_number() over (partition by id order by kind) = 1 then id else gen_random_uuid() end as new_id
from required;

alter table public.categories disable trigger categories_set_updated_at;
update public.categories c set kind = m.kind
from category_type_mapping m where c.id = m.new_id;
alter table public.categories enable trigger categories_set_updated_at;

drop index public.categories_user_name_key;
insert into public.categories (id, user_id, kind, name, created_at, updated_at)
select m.new_id, c.user_id, m.kind, c.name, c.created_at, c.updated_at
from category_type_mapping m join public.categories c on c.id = m.old_id
where m.new_id <> m.old_id;

alter table public.categories alter column kind set not null;
alter table public.categories add constraint categories_kind_valid check (kind = btrim(kind) and kind <> '');
create unique index categories_user_kind_name_key on public.categories (user_id, kind, lower(name));
alter table public.categories add unique (user_id, id, kind);
alter table public.entries add unique (user_id, id, kind);

alter table public.entry_categories add column kind text;
update public.entry_categories ec set category_id = m.new_id, kind = e.kind
from public.entries e, category_type_mapping m
where e.user_id = ec.user_id and e.id = ec.entry_id
  and m.user_id = ec.user_id and m.old_id = ec.category_id and m.kind = e.kind;
alter table public.entry_categories alter column kind set not null;
alter table public.entry_categories drop constraint entry_categories_user_id_entry_id_fkey;
alter table public.entry_categories drop constraint entry_categories_user_id_category_id_fkey;
alter table public.entry_categories add constraint entry_categories_user_id_entry_id_fkey
  foreign key (user_id, entry_id, kind) references public.entries (user_id, id, kind) on delete cascade;
alter table public.entry_categories add constraint entry_categories_user_id_category_id_fkey
  foreign key (user_id, category_id, kind) references public.categories (user_id, id, kind) on delete cascade;

drop table category_type_mapping;

create function public.entry_categories_set_kind() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  select e.kind into new.kind from public.entries e where e.user_id = new.user_id and e.id = new.entry_id;
  return new;
end;
$$;
create trigger entry_categories_set_kind before insert or update on public.entry_categories
  for each row execute function public.entry_categories_set_kind();
revoke execute on function public.entry_categories_set_kind() from public, anon, authenticated;

grant insert (kind) on public.categories to authenticated;

create or replace function public.set_entry_categories(p_entry_id uuid, p_category_ids uuid[])
returns setof uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ids uuid[] := coalesce(p_category_ids, '{}');
  v_kind text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select e.kind into v_kind from public.entries e where e.id = p_entry_id and e.user_id = v_user for update;
  if not found then
    raise exception 'Entry not found.' using errcode = '22023';
  end if;
  if cardinality(v_ids) > 100 then
    raise exception 'An entry can have at most 100 categories.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_ids) category_id
    where not exists (
      select 1 from public.categories c where c.user_id = v_user and c.id = category_id and c.kind = v_kind
    )
  ) then
    raise exception 'A category does not exist for this entry type. Reload and try again.' using errcode = '22023';
  end if;

  delete from public.entry_categories ec
   where ec.user_id = v_user and ec.entry_id = p_entry_id and ec.category_id <> all (v_ids);
  insert into public.entry_categories (entry_id, category_id)
  select p_entry_id, category_id from (select distinct unnest(v_ids) as category_id) ids
  on conflict do nothing;

  return query select ec.category_id from public.entry_categories ec where ec.user_id = v_user and ec.entry_id = p_entry_id;
end;
$$;