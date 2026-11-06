-- Profile showcase: a presentation style, pinned earned achievements and explicitly chosen Archive artwork.
-- Owners write through set_profile_showcase; other members read only member_showcase / member_showcase_image.

-- Style ids live in the app's registry (lib/profile-styles.ts); unknown ids fall back to the default there.
alter table public.users add column profile_style text not null default 'gallery'
  check (profile_style ~ '^[a-z][a-z0-9-]{0,31}$');

-- The composite key into user_achievements guarantees a pin is earned and disappears if the award is removed.
create table public.profile_showcase_achievements (
  user_id uuid not null references public.users (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  achievement_id text not null,
  primary key (user_id, position),
  unique (user_id, achievement_id),
  foreign key (user_id, achievement_id) references public.user_achievements (user_id, achievement_id) on delete cascade
);

create table public.profile_showcase_items (
  user_id uuid not null references public.users (id) on delete cascade,
  position smallint not null check (position between 1 and 4),
  entry_id uuid,
  collection_id uuid,
  show_title boolean not null default true,
  primary key (user_id, position),
  constraint profile_showcase_items_one_source check ((entry_id is null) <> (collection_id is null)),
  unique (user_id, entry_id),
  unique (user_id, collection_id),
  foreign key (user_id, entry_id) references public.entries (user_id, id) on delete cascade,
  foreign key (user_id, collection_id) references public.collections (user_id, id) on delete cascade
);

alter table public.profile_showcase_achievements enable row level security;
alter table public.profile_showcase_items enable row level security;
create policy read_own_showcase_achievements on public.profile_showcase_achievements for select to authenticated
  using (user_id = (select auth.uid()));
create policy read_own_showcase_items on public.profile_showcase_items for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on table public.profile_showcase_achievements from public, anon, authenticated;
revoke all on table public.profile_showcase_items from public, anon, authenticated;
grant select on table public.profile_showcase_achievements to authenticated;
grant select on table public.profile_showcase_items to authenticated;

-- The raw artwork reference of one showcase slot: an entry's cover, or a collection's first chosen cover, else its banner.
create function public._showcase_source(p_user uuid, p_position smallint)
returns table (source text, shape text)
language sql stable security definer set search_path = '' as $$
  select coalesce(e.cover_url, cov.url, c.banner_url),
         case when e.id is not null then e.cover_shape
              when cov.url is not null then cov.shape
              else 'wide' end
    from public.profile_showcase_items s
    left join public.entries e on e.user_id = s.user_id and e.id = s.entry_id
    left join public.collections c on c.user_id = s.user_id and c.id = s.collection_id
    left join lateral (
      select coalesce(ci.image_url, ce.cover_url) as url,
             case when ci.image_url is not null then ci.image_shape else ce.cover_shape end as shape
        from public.collection_cover_items ci
        left join public.entries ce on ce.user_id = ci.user_id and ce.id = ci.entry_id
       where ci.user_id = s.user_id and ci.collection_id = c.id and coalesce(ci.image_url, ce.cover_url) is not null
       order by ci.position
       limit 1
    ) cov on true
   where s.user_id = p_user and s.position = p_position;
$$;
revoke all on function public._showcase_source(uuid, smallint) from public, anon, authenticated;

-- Where a slot's artwork loads from: a public image URL, or the owner's verified private upload.
create function public._showcase_image(p_user uuid, p_position smallint)
returns table (remote_url text, object_name text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_source text;
begin
  select s.source into v_source from public._showcase_source(p_user, p_position) s;
  if v_source is null then
    return;
  end if;
  if v_source ~* '^https?://' then
    return query select v_source, null::text;
    return;
  end if;
  if v_source ~ '^/api/attachments/' then
    return query
      select null::text, a.name
        from public.attachment_objects a
       where a.user_id = p_user and a.r2_state = 'verified' and public._attachment_path(a.name) = v_source
       limit 1;
  end if;
end;
$$;
revoke all on function public._showcase_image(uuid, smallint) from public, anon, authenticated;

-- A member's showcase with approved display fields only: titles only where the owner allowed them, never notes or tasks.
create function public.member_showcase(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_style text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select u.profile_style into v_style from public.users u where u.id = p_user;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'style', v_style,
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
revoke all on function public.member_showcase(uuid) from public, anon;
grant execute on function public.member_showcase(uuid) to authenticated, service_role;

create function public.member_showcase_image(p_user uuid, p_position smallint)
returns table (remote_url text, object_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return query select i.remote_url, i.object_name from public._showcase_image(p_user, p_position) i limit 1;
end;
$$;
revoke all on function public.member_showcase_image(uuid, smallint) from public, anon;
grant execute on function public.member_showcase_image(uuid, smallint) to authenticated, service_role;

-- Replaces the caller's style, pins and featured items. p_items: [{"kind":"entry"|"collection","id":uuid,"showTitle":bool}].
create function public.set_profile_showcase(p_style text, p_achievements text[], p_items jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_achievements text[] := coalesce(p_achievements, '{}');
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_item jsonb;
  v_ord bigint;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_style is null or p_style !~ '^[a-z][a-z0-9-]{0,31}$' then
    raise exception 'Unknown showcase style.' using errcode = '22023', hint = 'showcase_style';
  end if;
  if cardinality(v_achievements) > 3 then
    raise exception 'Pin up to three achievements.' using errcode = '22023', hint = 'showcase_limit';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 4 then
    raise exception 'Feature up to four Archive items.' using errcode = '22023', hint = 'showcase_limit';
  end if;
  if array_position(v_achievements, null) is not null
     or (select count(distinct a) from unnest(v_achievements) as a) <> cardinality(v_achievements) then
    raise exception 'Each achievement can only be pinned once.' using errcode = '22023', hint = 'showcase_duplicate';
  end if;
  if exists (select 1 from unnest(v_achievements) as a
              where not exists (select 1 from public.user_achievements ua where ua.user_id = v_user and ua.achievement_id = a)) then
    raise exception 'You can only pin achievements you have earned.' using errcode = '22023', hint = 'showcase_not_earned';
  end if;

  perform 1 from public.users where id = v_user for update;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  update public.users set profile_style = p_style where id = v_user;

  delete from public.profile_showcase_achievements where user_id = v_user;
  insert into public.profile_showcase_achievements (user_id, position, achievement_id)
  select v_user, t.ord, t.a from unnest(v_achievements) with ordinality as t(a, ord);

  delete from public.profile_showcase_items where user_id = v_user;
  for v_item, v_ord in select t.value, t.ord from jsonb_array_elements(v_items) with ordinality as t(value, ord) loop
    begin
      v_id := (v_item ->> 'id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Unknown Archive item.' using errcode = '22023', hint = 'showcase_item';
    end;
    if v_item ->> 'kind' = 'entry' then
      if not exists (select 1 from public.entries e where e.user_id = v_user and e.id = v_id) then
        raise exception 'That entry is no longer in your Archive.' using errcode = '22023', hint = 'showcase_item';
      end if;
      insert into public.profile_showcase_items (user_id, position, entry_id, show_title)
      values (v_user, v_ord, v_id, coalesce((v_item ->> 'showTitle')::boolean, true));
    elsif v_item ->> 'kind' = 'collection' then
      if not exists (select 1 from public.collections c where c.user_id = v_user and c.id = v_id) then
        raise exception 'That collection is no longer in your Archive.' using errcode = '22023', hint = 'showcase_item';
      end if;
      insert into public.profile_showcase_items (user_id, position, collection_id, show_title)
      values (v_user, v_ord, v_id, coalesce((v_item ->> 'showTitle')::boolean, true));
    else
      raise exception 'Unknown Archive item.' using errcode = '22023', hint = 'showcase_item';
    end if;
  end loop;
exception when unique_violation then
  raise exception 'Each item can only be featured once.' using errcode = '22023', hint = 'showcase_duplicate';
end;
$$;
revoke all on function public.set_profile_showcase(text, text[], jsonb) from public, anon;
grant execute on function public.set_profile_showcase(text, text[], jsonb) to authenticated;
