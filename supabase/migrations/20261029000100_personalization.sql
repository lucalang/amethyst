-- Personalization: collection layouts, private profiles, saved 3D viewer presets and
-- per-entry frame overrides. Additive only: existing rows keep their current behaviour
-- (gallery layout, no avatar or motto, the default viewer look, frames inherited).

-- ---------------------------------------------------------------------------
-- Collection layout (collections already belong to one account)
-- ---------------------------------------------------------------------------
-- The application validates the known ids and falls back to the gallery for any
-- other value, so new layouts never need a migration.
alter table public.collections
  add column layout text not null default 'gallery'
    constraint collections_layout_valid check (layout ~ '^[a-z][a-z0-9-]{0,31}$');

grant update (layout) on public.collections to authenticated;

-- ---------------------------------------------------------------------------
-- Private profile details beside the existing display name
-- ---------------------------------------------------------------------------
alter table public.users
  add column avatar_url text
    constraint users_avatar_url_valid check (
      avatar_url is null
      or ((avatar_url ~* '^https?://' or avatar_url ~ '^/api/attachments/[^/?#]+$') and char_length(avatar_url) <= 2048)
    ),
  add column motto text
    constraint users_motto_valid check (motto is null or (char_length(motto) between 1 and 160 and motto = btrim(motto)));

grant update (display_name, avatar_url, motto) on public.users to authenticated;

-- ---------------------------------------------------------------------------
-- Per-entry artwork frame
-- ---------------------------------------------------------------------------
-- null inherits the account's default frame; 'none' keeps the entry unframed even if
-- the default changes; any other id is an explicit frame. Ids are validated in the app.
alter table public.entries
  add column frame text
    constraint entries_frame_valid check (frame is null or frame ~ '^[a-z][a-z0-9-]{0,31}$');

grant insert (frame), update (frame) on public.entries to authenticated;

-- ---------------------------------------------------------------------------
-- Saved 3D viewer presets
-- ---------------------------------------------------------------------------
-- `look` holds the viewer settings (background, lighting, reflections, glow, hover,
-- idle motion). It never stores the frame, theme or image.
create table public.viewer_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null
    constraint viewer_presets_name_valid check (char_length(name) between 1 and 40 and name = btrim(name)),
  look jsonb not null
    constraint viewer_presets_look_valid check (jsonb_typeof(look) = 'object' and pg_column_size(look) <= 2048),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index viewer_presets_user_name on public.viewer_presets (user_id, lower(name));
create index viewer_presets_user_created on public.viewer_presets (user_id, created_at);

create trigger viewer_presets_set_updated_at before update on public.viewer_presets
  for each row execute function public.set_updated_at();

-- A generous cap keeps one account from filling the table.
create function public.viewer_presets_limit()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('viewer_presets:' || new.user_id::text, 0));
  if (select count(*) from public.viewer_presets where user_id = new.user_id) >= 24 then
    raise exception 'viewer preset limit reached' using errcode = 'P0001', hint = 'preset_limit';
  end if;
  return new;
end;
$$;
revoke execute on function public.viewer_presets_limit() from public, anon, authenticated;

create trigger viewer_presets_limit before insert on public.viewer_presets
  for each row execute function public.viewer_presets_limit();

alter table public.viewer_presets enable row level security;
create policy owner_access on public.viewer_presets for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.viewer_presets from public, anon, authenticated;
grant select, delete on public.viewer_presets to authenticated;
grant insert (name, look), update (name, look) on public.viewer_presets to authenticated;
grant all on public.viewer_presets to service_role;
