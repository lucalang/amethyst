-- Member profiles: signed-in members may read a few approved fields of any profile.
-- public.users keeps its owner-only RLS; these definer functions are the only cross-account read.

-- Same encoding as the app's attachmentUrl() (encodeURIComponent), so avatar_url can be matched to a stored file.
create function public._attachment_path(p_name text)
returns text
language sql immutable set search_path = '' as $$
  select '/api/attachments/' || coalesce(string_agg(
    case when (b between 48 and 57) or (b between 65 and 90) or (b between 97 and 122) or b in (33, 39, 40, 41, 42, 45, 46, 95, 126)
      then chr(b) else '%' || upper(lpad(to_hex(b), 2, '0')) end, '' order by i), '')
  from (select i, get_byte(convert_to(p_name, 'UTF8'), i) as b
          from generate_series(0, octet_length(convert_to(p_name, 'UTF8')) - 1) as i) as bytes;
$$;
revoke all on function public._attachment_path(text) from public, anon, authenticated;

create function public.member_profile(p_user uuid)
returns table (
  id uuid,
  display_name text,
  has_avatar boolean,
  motto text,
  avatar_decoration text,
  profile_badge text,
  profile_title text,
  member_since timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return query
    select u.id, u.display_name, u.avatar_url is not null, u.motto, u.avatar_decoration, u.profile_badge, u.profile_title, u.created_at
      from public.users u
     where u.id = p_user;
end;
$$;
revoke all on function public.member_profile(uuid) from public, anon;
grant execute on function public.member_profile(uuid) to authenticated, service_role;

-- Where a member's avatar loads from: a public image URL, or a verified private upload (served by the app).
create function public.member_avatar(p_user uuid)
returns table (remote_url text, object_name text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_url text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  select u.avatar_url into v_url from public.users u where u.id = p_user;
  if v_url is null then
    return;
  end if;
  if v_url !~ '^/api/attachments/' then
    return query select v_url, null::text;
    return;
  end if;
  return query
    select null::text, a.name
      from public.attachment_objects a
     where a.user_id = p_user and a.r2_state = 'verified' and public._attachment_path(a.name) = v_url
     limit 1;
end;
$$;
revoke all on function public.member_avatar(uuid) from public, anon;
grant execute on function public.member_avatar(uuid) to authenticated, service_role;
