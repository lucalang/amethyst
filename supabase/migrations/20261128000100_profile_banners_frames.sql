-- Profile banner themes and profile frames: owned showcase cosmetics, worn on the showcase and kept in saved looks.
-- Ids live in the app registry (lib/profile-cosmetics.ts). NULL means the default (original backdrop, no frame).

alter table public.cosmetic_items drop constraint cosmetic_items_kind_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_kind_check
    check (kind in ('frame', 'avatar_decoration', 'game', 'badge', 'title', 'profile_banner', 'profile_frame'));

insert into public.cosmetic_items (id, kind, price, available, source) values
  ('banner-tidepool', 'profile_banner', 180, true, 'shop'),
  ('banner-verdant', 'profile_banner', 180, true, 'shop'),
  ('banner-rosewood', 'profile_banner', 220, true, 'shop'),
  ('banner-nocturne', 'profile_banner', 260, true, 'shop'),
  ('banner-aurum', 'profile_banner', 300, true, 'shop'),
  ('profile-frame-briar', 'profile_frame', 220, true, 'shop'),
  ('profile-frame-deco', 'profile_frame', 280, true, 'shop'),
  ('profile-frame-filigree', 'profile_frame', 340, true, 'shop'),
  ('profile-frame-runic', 'profile_frame', 400, true, 'shop')
on conflict (id) do nothing;

-- Worn banner and frame must be owned; they disappear with the ownership row.
alter table public.users
  add column profile_banner text,
  add column profile_frame text;
alter table public.users
  add constraint users_profile_banner_owned foreign key (id, profile_banner)
    references public.user_cosmetics (user_id, item_id) on delete set null (profile_banner),
  add constraint users_profile_frame_owned foreign key (id, profile_frame)
    references public.user_cosmetics (user_id, item_id) on delete set null (profile_frame);

create function public.users_check_profile_cosmetics()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.profile_banner is distinct from old.profile_banner)
     and not public._cosmetic_allowed(new.id, new.profile_banner, 'profile_banner') then
    raise exception 'You don''t own that banner theme.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  if (tg_op = 'INSERT' or new.profile_frame is distinct from old.profile_frame)
     and not public._cosmetic_allowed(new.id, new.profile_frame, 'profile_frame') then
    raise exception 'You don''t own that profile frame.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  return new;
end;
$$;
create trigger users_check_profile_cosmetics before insert or update of profile_banner, profile_frame on public.users
  for each row execute function public.users_check_profile_cosmetics();

-- Saved looks remember them too; ownership is re-checked whenever a look is worn.
alter table public.profile_looks
  add column banner text check (banner ~ '^[a-z][a-z0-9-]{0,31}$'),
  add column frame text check (frame ~ '^[a-z][a-z0-9-]{0,31}$');

-- Member-visible showcase, now with the worn banner theme and frame.
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
    'banner', v_user.profile_banner,
    'frame', v_user.profile_frame,
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

-- Saves the whole showcase including banner and frame. The 8-argument version stays for older clients.
create function public.save_profile_showcase(
  p_style text,
  p_sections text[],
  p_ambient text,
  p_pedestal text,
  p_banner text,
  p_frame text,
  p_achievements text[],
  p_items jsonb,
  p_look uuid,
  p_new_look text
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_look uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public._cosmetic_allowed(v_user, p_banner, 'profile_banner') then
    raise exception 'That banner theme isn’t in your collection.' using errcode = '22023', hint = 'showcase_banner';
  end if;
  if not public._cosmetic_allowed(v_user, p_frame, 'profile_frame') then
    raise exception 'That profile frame isn’t in your collection.' using errcode = '22023', hint = 'showcase_frame';
  end if;

  v_look := public.save_profile_showcase(p_style, p_sections, p_ambient, p_pedestal, p_achievements, p_items, p_look, p_new_look);

  update public.users set profile_banner = p_banner, profile_frame = p_frame where id = v_user;
  if v_look is not null then
    update public.profile_looks set banner = p_banner, frame = p_frame where id = v_look and user_id = v_user;
  end if;
  return v_look;
end;
$$;
revoke all on function public.save_profile_showcase(text, text[], text, text, text, text, text[], jsonb, uuid, text) from public, anon;
grant execute on function public.save_profile_showcase(text, text[], text, text, text, text, text[], jsonb, uuid, text) to authenticated;

-- Wears (or takes off, with null) a banner theme or frame from the shop; the look being worn follows.
create function public.wear_profile_cosmetic(p_kind text, p_item text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_look uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('profile_banner', 'profile_frame') then
    raise exception 'Unknown cosmetic slot.' using errcode = '22023';
  end if;
  if not public._cosmetic_allowed(v_user, p_item, p_kind) then
    raise exception 'You don''t own that item.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;

  if p_kind = 'profile_banner' then
    update public.users set profile_banner = p_item where id = v_user returning profile_look into v_look;
    update public.profile_looks set banner = p_item, updated_at = now() where id = v_look and user_id = v_user;
  else
    update public.users set profile_frame = p_item where id = v_user returning profile_look into v_look;
    update public.profile_looks set frame = p_item, updated_at = now() where id = v_look and user_id = v_user;
  end if;
end;
$$;
revoke all on function public.wear_profile_cosmetic(text, text) from public, anon;
grant execute on function public.wear_profile_cosmetic(text, text) to authenticated;
