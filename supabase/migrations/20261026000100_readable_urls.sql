-- Readable page URLs: every collection and entry gets a per-account slug derived from
-- its name (/collections/anime, /entries/one-piece). IDs stay the primary keys; slugs
-- are only an address. Slugs are assigned by the database (clients cannot set them),
-- stay stable until the name changes, and a renamed page keeps its old slug as a
-- redirect so saved links keep working. Existing rows are backfilled; no data changes.

create extension if not exists unaccent with schema extensions;

-- Lowercase ASCII words joined by single hyphens, at most 60 characters. Names with
-- nothing usable (e.g. only emoji) fall back to p_fallback, and a slug that looks like
-- a UUID is prefixed so it can never be mistaken for an id.
create function public.slugify(p_value text, p_fallback text) returns text
language plpgsql stable set search_path = '' as $$
declare
  result text;
begin
  result := lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_value, '')));
  result := regexp_replace(result, '[''’]', '', 'g');
  result := regexp_replace(result, '[^a-z0-9]+', '-', 'g');
  result := btrim(left(btrim(result, '-'), 60), '-');
  if result = '' then
    return p_fallback;
  end if;
  if result ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return p_fallback || '-' || result;
  end if;
  return result;
end $$;

-- The first free slug for one account: base, base-2, base-3, ... "new" is reserved for
-- entries because /entries/new is a route.
create function public.next_free_slug(p_kind text, p_user uuid, p_self uuid, p_base text) returns text
language plpgsql set search_path = '' as $$
declare
  candidate text := p_base;
  n integer := 1;
  taken boolean;
begin
  loop
    if p_kind = 'collection' then
      select exists (select 1 from public.collections c where c.user_id = p_user and c.slug = candidate and c.id <> p_self) into taken;
    else
      taken := candidate = 'new'
        or exists (select 1 from public.entries e where e.user_id = p_user and e.slug = candidate and e.id <> p_self);
    end if;
    exit when not taken;
    n := n + 1;
    candidate := rtrim(left(p_base, 55), '-') || '-' || n;
  end loop;
  return candidate;
end $$;

-- Old slugs of renamed pages. Current slugs always win over redirects.
create table public.slug_redirects (
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('collection', 'entry')),
  slug text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, slug)
);
create index slug_redirects_target_idx on public.slug_redirects (target_id);
alter table public.slug_redirects enable row level security;
create policy owner_read on public.slug_redirects for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.slug_redirects from public, anon, authenticated;
grant select on public.slug_redirects to authenticated;
grant all on public.slug_redirects to service_role;

-- Backfill, oldest first so the original page keeps the unsuffixed slug.
alter table public.collections add column slug text;
alter table public.entries add column slug text;
create unique index collections_user_slug_key on public.collections (user_id, slug);
create unique index entries_user_slug_key on public.entries (user_id, slug);

alter table public.collections disable trigger collections_set_updated_at;
do $$
declare r record;
begin
  for r in select id, user_id, name from public.collections order by user_id, created_at, id loop
    update public.collections set slug = public.next_free_slug('collection', r.user_id, r.id, public.slugify(r.name, 'collection'))
    where id = r.id;
  end loop;
end $$;
alter table public.collections enable trigger collections_set_updated_at;

alter table public.entries disable trigger entries_bump_version;
do $$
declare r record;
begin
  for r in select id, user_id, title from public.entries order by user_id, created_at, id loop
    update public.entries set slug = public.next_free_slug('entry', r.user_id, r.id, public.slugify(r.title, 'entry'))
    where id = r.id;
  end loop;
end $$;
alter table public.entries enable trigger entries_bump_version;

alter table public.collections alter column slug set not null;
alter table public.entries alter column slug set not null;

-- Assign slugs on insert and on rename. Runs as definer so it can record redirects,
-- which clients can read but never write.
create function public.assign_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := case tg_table_name when 'collections' then 'collection' else 'entry' end;
  new_name text;
  old_name text;
begin
  if v_kind = 'collection' then
    new_name := new.name;
  else
    new_name := new.title;
  end if;

  if tg_op = 'UPDATE' then
    if v_kind = 'collection' then
      old_name := old.name;
    else
      old_name := old.title;
    end if;
    -- Same name (or one that slugifies the same, like a case change): keep the address.
    if new.user_id = old.user_id
      and (new_name is not distinct from old_name or public.slugify(new_name, v_kind) = public.slugify(old_name, v_kind)) then
      new.slug := old.slug;
      return new;
    end if;
  end if;

  new.slug := public.next_free_slug(v_kind, new.user_id, new.id, public.slugify(new_name, v_kind));

  -- The new slug is current again, so it no longer needs to redirect anywhere.
  delete from public.slug_redirects r where r.user_id = new.user_id and r.kind = v_kind and r.slug = new.slug;

  if tg_op = 'UPDATE' and old.slug is not null and old.slug <> new.slug and new.user_id = old.user_id then
    insert into public.slug_redirects as r (user_id, kind, slug, target_id)
    values (old.user_id, v_kind, old.slug, new.id)
    on conflict on constraint slug_redirects_pkey do update set target_id = excluded.target_id, created_at = now();
  end if;
  return new;
end $$;
revoke execute on function public.assign_slug() from public, anon, authenticated;
revoke execute on function public.next_free_slug(text, uuid, uuid, text) from public, anon, authenticated;

create trigger collections_assign_slug before insert or update on public.collections
  for each row execute function public.assign_slug();
create trigger entries_assign_slug before insert or update on public.entries
  for each row execute function public.assign_slug();

-- Deleted pages take their redirects with them.
create function public.drop_slug_redirects() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.slug_redirects r where r.user_id = old.user_id and r.target_id = old.id;
  return old;
end $$;
revoke execute on function public.drop_slug_redirects() from public, anon, authenticated;

create trigger collections_drop_slug_redirects after delete on public.collections
  for each row execute function public.drop_slug_redirects();
create trigger entries_drop_slug_redirects after delete on public.entries
  for each row execute function public.drop_slug_redirects();
