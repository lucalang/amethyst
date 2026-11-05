-- Multiple profile badges: each member wears up to five owned badges, in display order.
-- users.profile_badge stays as a legacy column; writes to it are mirrored here as a single badge.

create table public.user_profile_badges (
  user_id uuid not null references public.users (id) on delete cascade,
  position smallint not null check (position between 1 and 5),
  badge_id text not null references public.cosmetic_items (id) on delete cascade,
  primary key (user_id, position),
  unique (user_id, badge_id)
);

alter table public.user_profile_badges enable row level security;
create policy read_own_badges on public.user_profile_badges for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on table public.user_profile_badges from public, anon, authenticated;
grant select on table public.user_profile_badges to authenticated;

-- Existing equipped badges become the first position (only ones that are still valid and owned).
insert into public.user_profile_badges (user_id, position, badge_id)
select u.id, 1, u.profile_badge
  from public.users u
 where u.profile_badge is not null
   and public._cosmetic_allowed(u.id, u.profile_badge, 'badge');

create function public.user_profile_badges_check()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not public._cosmetic_allowed(new.user_id, new.badge_id, 'badge') then
    raise exception 'You don''t own that badge.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  return new;
end;
$$;
revoke all on function public.user_profile_badges_check() from public, anon, authenticated;

create trigger user_profile_badges_check before insert or update on public.user_profile_badges
  for each row execute function public.user_profile_badges_check();

-- Replaces the caller's badges with p_badges (in order). Ownership is checked by the trigger.
create function public.set_profile_badges(p_badges text[])
returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_badges text[] := coalesce(p_badges, '{}');
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if cardinality(v_badges) > 5 then
    raise exception 'You can wear up to five badges.' using errcode = '22023', hint = 'badge_limit';
  end if;
  if array_position(v_badges, null) is not null
     or (select count(distinct b) from unnest(v_badges) as b) <> cardinality(v_badges) then
    raise exception 'Each badge can only be worn once.' using errcode = '22023', hint = 'badge_duplicate';
  end if;
  perform 1 from public.users where id = v_user for update;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  delete from public.user_profile_badges where user_id = v_user;
  insert into public.user_profile_badges (user_id, position, badge_id)
  select v_user, t.ord, t.b from unnest(v_badges) with ordinality as t(b, ord);
  return v_badges;
end;
$$;
revoke all on function public.set_profile_badges(text[]) from public, anon;
grant execute on function public.set_profile_badges(text[]) to authenticated;

-- Adds one badge after the ones already worn (no-op if already worn).
create function public.wear_profile_badge(p_badge text)
returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_badges text[];
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform 1 from public.users where id = v_user for update;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(badge_id order by position), '{}') into v_badges
    from public.user_profile_badges where user_id = v_user;
  if p_badge = any (v_badges) then
    return v_badges;
  end if;
  if cardinality(v_badges) >= 5 then
    raise exception 'You already wear five badges. Remove one in Customization → Profile first.' using errcode = '22023', hint = 'badge_limit';
  end if;
  insert into public.user_profile_badges (user_id, position, badge_id)
  values (v_user, cardinality(v_badges) + 1, p_badge);
  return v_badges || p_badge;
end;
$$;
revoke all on function public.wear_profile_badge(text) from public, anon;
grant execute on function public.wear_profile_badge(text) to authenticated;

-- Older clients still write users.profile_badge: treat that as wearing exactly that badge.
create function public.users_mirror_profile_badge()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.user_profile_badges where user_id = new.id;
  if new.profile_badge is not null then
    insert into public.user_profile_badges (user_id, position, badge_id) values (new.id, 1, new.profile_badge);
  end if;
  return null;
end;
$$;
revoke all on function public.users_mirror_profile_badge() from public, anon, authenticated;

create trigger users_mirror_profile_badge after update of profile_badge on public.users
  for each row when (new.profile_badge is distinct from old.profile_badge)
  execute function public.users_mirror_profile_badge();

-- member_profile now returns the ordered badge list instead of the single legacy badge.
drop function public.member_profile(uuid);
create function public.member_profile(p_user uuid)
returns table (
  id uuid,
  display_name text,
  has_avatar boolean,
  motto text,
  avatar_decoration text,
  profile_badges text[],
  profile_title text,
  member_since timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return query
    select u.id, u.display_name, u.avatar_url is not null, u.motto, u.avatar_decoration,
           coalesce((select array_agg(b.badge_id order by b.position) from public.user_profile_badges b where b.user_id = u.id), '{}'),
           u.profile_title, u.created_at
      from public.users u
     where u.id = p_user;
end;
$$;
revoke all on function public.member_profile(uuid) from public, anon;
grant execute on function public.member_profile(uuid) to authenticated, service_role;
