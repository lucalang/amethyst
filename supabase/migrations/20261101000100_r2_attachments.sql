-- Uploaded images move from Supabase Storage (bucket note-attachments) to a private Cloudflare R2
-- bucket under the same key, <user id>/<file name>. Image links (/api/attachments/<name>) never change.
--
-- attachment_objects is the per-account manifest of uploaded images:
-- * A row reserves a file name across both stores, so names stay unique per account.
-- * origin: where the file was first uploaded. 'supabase' originals are never touched here.
-- * r2_state = 'verified' is the only state that switches delivery to R2. Files without a verified
--   row keep loading from the legacy bucket; 'pending' R2 uploads are never served.
-- * Rows are written only by the functions below (uploads) and by the service-role migration script.

create table public.attachment_objects (
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 200 and name !~ '[/\\[:cntrl:]]'),
  origin text not null check (origin in ('supabase', 'r2')),
  r2_state text check (r2_state in ('pending', 'verified')),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp')),
  size_bytes bigint not null check (size_bytes between 0 and 10485760),
  md5 text check (md5 ~ '^[0-9a-f]{32}$'),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  primary key (user_id, name),
  constraint attachment_objects_verified check ((r2_state = 'verified') = (verified_at is not null and md5 is not null))
);

alter table public.attachment_objects enable row level security;
create policy owner_read on public.attachment_objects for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.attachment_objects from public, anon, authenticated;
grant select on public.attachment_objects to authenticated;
grant all on public.attachment_objects to service_role;

-- Reserve `p_name` for the caller unless it is taken in either store. Returns false when taken.
create function public.reserve_attachment(p_name text, p_content_type text, p_size bigint, p_origin text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_origin not in ('supabase', 'r2') then
    raise exception 'Unknown storage.' using errcode = '22023';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'note-attachments' and name = v_user::text || '/' || p_name) then
    return false;
  end if;
  insert into public.attachment_objects (user_id, name, origin, r2_state, content_type, size_bytes)
  values (v_user, p_name, p_origin, case when p_origin = 'r2' then 'pending' end, p_content_type, p_size)
  on conflict (user_id, name) do nothing;
  return found;
end;
$$;

revoke execute on function public.reserve_attachment(text, text, bigint, text) from public, anon;
grant execute on function public.reserve_attachment(text, text, bigint, text) to authenticated, service_role;

-- Mark the caller's pending R2 upload as verified (the server checks the stored object first).
create function public.confirm_attachment(p_name text, p_size bigint, p_md5 text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  update public.attachment_objects
     set r2_state = 'verified', verified_at = now(), md5 = p_md5
   where user_id = v_user and name = p_name and origin = 'r2' and r2_state = 'pending' and size_bytes = p_size;
  return found;
end;
$$;

revoke execute on function public.confirm_attachment(text, bigint, text) from public, anon;
grant execute on function public.confirm_attachment(text, bigint, text) to authenticated, service_role;

-- Migration inventory (service role only): every legacy object with its manifest row, if any.
create function public.attachment_inventory()
returns table (
  object_name text,
  size_bytes bigint,
  content_type text,
  etag text,
  uploaded_at timestamptz,
  origin text,
  r2_state text,
  manifest_size bigint,
  manifest_md5 text
)
language sql stable security definer set search_path = '' as $$
  select o.name,
         nullif(o.metadata ->> 'size', '')::bigint,
         o.metadata ->> 'mimetype',
         o.metadata ->> 'eTag',
         o.created_at,
         a.origin,
         a.r2_state,
         a.size_bytes,
         a.md5
    from storage.objects o
    left join public.attachment_objects a
      on a.user_id::text = split_part(o.name, '/', 1) and a.name = substr(o.name, length(split_part(o.name, '/', 1)) + 2)
   where o.bucket_id = 'note-attachments'
   order by o.name;
$$;

revoke execute on function public.attachment_inventory() from public, anon, authenticated;
grant execute on function public.attachment_inventory() to service_role;
