-- Collection covers: artwork the account picks to represent a collection, in display order.
--
-- * No rows for a collection = automatic artwork (entry covers), exactly as before.
-- * Each item is an entry (its cover is read live, never copied) or a standalone image
--   (an uploaded attachment path or an http(s) link, the same rule as entry covers).
-- * Entries and uploads are never modified; deleting an entry or the collection removes its items.

create table public.collection_cover_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  collection_id uuid not null,
  position smallint not null check (position between 0 and 5),
  entry_id uuid,
  image_url text check (
    image_url is null
    or ((image_url ~* '^https?://' or image_url ~ '^/api/attachments/[^/?#]+$') and char_length(image_url) <= 2048)
  ),
  image_shape text not null default 'portrait' check (image_shape in ('portrait', 'square')),
  created_at timestamptz not null default now(),
  constraint collection_cover_items_one_source check ((entry_id is null) <> (image_url is null)),
  unique (collection_id, position),
  unique (collection_id, entry_id),
  foreign key (user_id, collection_id) references public.collections (user_id, id) on delete cascade,
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade
);

create index collection_cover_items_user_idx on public.collection_cover_items (user_id, collection_id, position);
create index collection_cover_items_entry_idx on public.collection_cover_items (user_id, entry_id) where entry_id is not null;

alter table public.collection_cover_items enable row level security;
create policy owner_access on public.collection_cover_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.collection_cover_items from public, anon, authenticated;
grant select on public.collection_cover_items to authenticated;
grant all on public.collection_cover_items to service_role;

-- Replace a collection's chosen covers with `p_items` (in order); an empty list restores automatic artwork.
-- Items: [{"entry_id": uuid} | {"image_url": text, "image_shape": text}].
create function public.set_collection_covers(p_collection uuid, p_items jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_position integer := 0;
  v_entry uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.collections where user_id = v_user and id = p_collection) then
    raise exception 'This collection no longer exists. Reload and try again.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Cover items must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 3 then
    raise exception 'A collection shows at most 3 covers.' using errcode = '22023';
  end if;

  delete from public.collection_cover_items where user_id = v_user and collection_id = p_collection;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item ? 'entry_id' then
      v_entry := (v_item ->> 'entry_id')::uuid;
      if not exists (select 1 from public.entries where user_id = v_user and id = v_entry) then
        raise exception 'A chosen entry no longer exists. Reload and try again.' using errcode = '22023';
      end if;
      insert into public.collection_cover_items (user_id, collection_id, position, entry_id)
      values (v_user, p_collection, v_position, v_entry);
    else
      insert into public.collection_cover_items (user_id, collection_id, position, image_url, image_shape)
      values (v_user, p_collection, v_position, v_item ->> 'image_url', coalesce(v_item ->> 'image_shape', 'portrait'));
    end if;
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke execute on function public.set_collection_covers(uuid, jsonb) from public, anon;
grant execute on function public.set_collection_covers(uuid, jsonb) to authenticated, service_role;
