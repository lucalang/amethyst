-- Profile showcase arrangement (section order, ambient effect, pedestal centerpiece) and saved looks.
-- Section and ambient ids live in the app's registries (lib/profile-styles.ts); unknown ids are ignored there.

alter table public.users
  add column profile_sections text[] not null default '{gallery,achievements,pedestal}'
    check (cardinality(profile_sections) <= 8 and array_position(profile_sections, null) is null),
  add column profile_ambient text not null default 'motes'
    check (profile_ambient ~ '^[a-z][a-z0-9-]{0,31}$'),
  add column profile_pedestal text,
  add column profile_look uuid;

-- A centerpiece must be owned; it disappears with the ownership row.
alter table public.users
  add constraint users_profile_pedestal_owned foreign key (id, profile_pedestal)
    references public.user_cosmetics (user_id, item_id) on delete set null (profile_pedestal);

create table public.profile_looks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  style text not null check (style ~ '^[a-z][a-z0-9-]{0,31}$'),
  sections text[] not null check (cardinality(sections) <= 8 and array_position(sections, null) is null),
  ambient text not null check (ambient ~ '^[a-z][a-z0-9-]{0,31}$'),
  pedestal text,
  achievements text[] not null default '{}' check (cardinality(achievements) <= 3),
  -- [{"kind":"entry"|"collection","id":uuid,"showTitle":bool}], validated on save; re-checked when worn.
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, id)
);
create unique index profile_looks_name_key on public.profile_looks (user_id, lower(name));

alter table public.users
  add constraint users_profile_look_fkey foreign key (id, profile_look)
    references public.profile_looks (user_id, id) on delete set null (profile_look);

alter table public.profile_looks enable row level security;
create policy read_own_profile_looks on public.profile_looks for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on table public.profile_looks from public, anon, authenticated;
grant select on table public.profile_looks to authenticated;

-- Member-visible showcase, now with arrangement and the (owned) centerpiece id. Still approved fields only.
create or replace function public.member_showcase(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user public.users%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select * into v_user from public.users u where u.id = p_user;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'style', v_user.profile_style,
    'sections', to_jsonb(v_user.profile_sections),
    'ambient', v_user.profile_ambient,
    'pedestal', (select uc.item_id from public.user_cosmetics uc where uc.user_id = p_user and uc.item_id = v_user.profile_pedestal),
    'achievements', coalesce((
      select jsonb_agg(a.achievement_id order by a.position)
        from public.profile_showcase_achievements a
       where a.user_id = p_user), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'position', s.position,
               'kind', case when s.entry_id is not null then 'entry' else 'collection' end,
               'title', case when s.show_title then coalesce(e.title, c.name) end,
               'accent', c.accent_color,
               'shape', src.shape,
               'image', case when img.remote_url is not null or img.object_name is not null
                             then left(md5(src.source), 12) end
             ) order by s.position)
        from public.profile_showcase_items s
        left join public.entries e on e.user_id = s.user_id and e.id = s.entry_id
        left join public.collections c on c.user_id = s.user_id and c.id = s.collection_id
        left join lateral public._showcase_source(s.user_id, s.position) src on true
        left join lateral (select i.remote_url, i.object_name from public._showcase_image(s.user_id, s.position) i limit 1) img on true
       where s.user_id = p_user), '[]'::jsonb)
  );
end;
$$;

-- Saves the caller's whole showcase. p_new_look creates a saved look from it; otherwise p_look (if set) is updated to match.
-- Returns the look now worn (null when the showcase is not a saved look).
create function public.save_profile_showcase(
  p_style text,
  p_sections text[],
  p_ambient text,
  p_pedestal text,
  p_achievements text[],
  p_items jsonb,
  p_look uuid,
  p_new_look text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_sections text[] := coalesce(p_sections, '{}');
  v_name text := btrim(p_new_look);
  v_look uuid;
  v_achievements text[];
  v_items jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if cardinality(v_sections) > 8 or array_position(v_sections, null) is not null
     or exists (select 1 from unnest(v_sections) s where s !~ '^[a-z][a-z0-9-]{0,31}$')
     or (select count(distinct s) from unnest(v_sections) s) <> cardinality(v_sections) then
    raise exception 'Unknown showcase sections.' using errcode = '22023', hint = 'showcase_sections';
  end if;
  if p_ambient is null or p_ambient !~ '^[a-z][a-z0-9-]{0,31}$' then
    raise exception 'Unknown ambient effect.' using errcode = '22023', hint = 'showcase_ambient';
  end if;
  if p_pedestal is not null and not exists (
    select 1 from public.user_cosmetics uc where uc.user_id = v_user and uc.item_id = p_pedestal) then
    raise exception 'That collectible isn’t in your collection.' using errcode = '22023', hint = 'showcase_pedestal';
  end if;

  -- Validates and stores style, earned pins and owned Archive items (locks the users row).
  perform public.set_profile_showcase(p_style, p_achievements, p_items);

  select coalesce(array_agg(a.achievement_id order by a.position), '{}') into v_achievements
    from public.profile_showcase_achievements a where a.user_id = v_user;
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', case when s.entry_id is not null then 'entry' else 'collection' end,
           'id', coalesce(s.entry_id, s.collection_id),
           'showTitle', s.show_title) order by s.position), '[]'::jsonb) into v_items
    from public.profile_showcase_items s where s.user_id = v_user;

  if v_name is not null then
    if char_length(v_name) not between 1 and 40 then
      raise exception 'Name your look in 1 to 40 characters.' using errcode = '22023', hint = 'showcase_look_name';
    end if;
    if (select count(*) from public.profile_looks l where l.user_id = v_user) >= 5 then
      raise exception 'You can keep up to five looks. Delete one first.' using errcode = '22023', hint = 'showcase_look_limit';
    end if;
    begin
      insert into public.profile_looks (user_id, name, style, sections, ambient, pedestal, achievements, items)
      values (v_user, v_name, p_style, v_sections, p_ambient, p_pedestal, v_achievements, v_items)
      returning id into v_look;
    exception when unique_violation then
      raise exception 'You already have a look with that name.' using errcode = '22023', hint = 'showcase_look_name';
    end;
  elsif p_look is not null then
    update public.profile_looks
       set style = p_style, sections = v_sections, ambient = p_ambient, pedestal = p_pedestal,
           achievements = v_achievements, items = v_items, updated_at = now()
     where id = p_look and user_id = v_user
    returning id into v_look;
    if v_look is null then
      raise exception 'That look no longer exists.' using errcode = '22023', hint = 'showcase_look';
    end if;
  end if;

  update public.users
     set profile_sections = v_sections, profile_ambient = p_ambient, profile_pedestal = p_pedestal, profile_look = v_look
   where id = v_user;
  return v_look;
end;
$$;
revoke all on function public.save_profile_showcase(text, text[], text, text, text[], jsonb, uuid, text) from public, anon;
grant execute on function public.save_profile_showcase(text, text[], text, text, text[], jsonb, uuid, text) to authenticated;

create function public.rename_profile_look(p_look uuid, p_name text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(p_name);
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if v_name is null or char_length(v_name) not between 1 and 40 then
    raise exception 'Name your look in 1 to 40 characters.' using errcode = '22023', hint = 'showcase_look_name';
  end if;
  update public.profile_looks set name = v_name, updated_at = now() where id = p_look and user_id = auth.uid();
  if not found then
    raise exception 'That look no longer exists.' using errcode = '22023', hint = 'showcase_look';
  end if;
exception when unique_violation then
  raise exception 'You already have a look with that name.' using errcode = '22023', hint = 'showcase_look_name';
end;
$$;
revoke all on function public.rename_profile_look(uuid, text) from public, anon;
grant execute on function public.rename_profile_look(uuid, text) to authenticated;

-- The look being worn can't be deleted: wear another look (or the default) first.
create function public.delete_profile_look(p_look uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if exists (select 1 from public.users u where u.id = auth.uid() and u.profile_look = p_look) then
    raise exception 'Choose another look before deleting the one you’re wearing.' using errcode = '22023', hint = 'showcase_look_active';
  end if;
  delete from public.profile_looks where id = p_look and user_id = auth.uid();
end;
$$;
revoke all on function public.delete_profile_look(uuid) from public, anon;
grant execute on function public.delete_profile_look(uuid) to authenticated;
