-- Home cover fan: artwork the account picks by hand, in display order (left to right).
--
-- * Each item is either an entry (by id, so renames never break it) or a standalone image
--   (an uploaded attachment path or an http(s) link, the same rule as entry covers).
-- * Removing an item never touches its entry or its uploaded file.
-- * Deleting an entry removes it from the fan; nothing is substituted in its place.
-- * Visiting entries never changes this table; it is written only by set_home_fan.

create table public.home_fan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  position smallint not null check (position between 0 and 11),
  entry_id uuid,
  image_url text check (
    image_url is null
    or ((image_url ~* '^https?://' or image_url ~ '^/api/attachments/[^/?#]+$') and char_length(image_url) <= 2048)
  ),
  image_shape text not null default 'portrait' check (image_shape in ('portrait', 'square')),
  created_at timestamptz not null default now(),
  constraint home_fan_items_one_source check ((entry_id is null) <> (image_url is null)),
  unique (user_id, position),
  unique (user_id, entry_id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade
);

alter table public.home_fan_items enable row level security;
create policy owner_access on public.home_fan_items for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.home_fan_items from public, anon, authenticated;
grant select on public.home_fan_items to authenticated;
grant all on public.home_fan_items to service_role;

-- Replace the caller's fan with `p_items` (in order): [{"entry_id": uuid} | {"image_url": text, "image_shape": text}].
create function public.set_home_fan(p_items jsonb)
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
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Fan items must be a list.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 12 then
    raise exception 'The cover fan holds at most 12 pieces of artwork.' using errcode = '22023';
  end if;

  delete from public.home_fan_items where user_id = v_user;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if v_item ? 'entry_id' then
      v_entry := (v_item ->> 'entry_id')::uuid;
      if not exists (select 1 from public.entries where user_id = v_user and id = v_entry) then
        raise exception 'An entry in the fan no longer exists. Reload and try again.' using errcode = '22023';
      end if;
      insert into public.home_fan_items (user_id, position, entry_id) values (v_user, v_position, v_entry);
    else
      insert into public.home_fan_items (user_id, position, image_url, image_shape)
      values (v_user, v_position, v_item ->> 'image_url', coalesce(v_item ->> 'image_shape', 'portrait'));
    end if;
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke execute on function public.set_home_fan(jsonb) from public, anon;
grant execute on function public.set_home_fan(jsonb) to authenticated, service_role;
