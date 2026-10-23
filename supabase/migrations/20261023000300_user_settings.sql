-- Account-level appearance, editor, checklist, startup and shortcut settings. The app validates the shape.

alter table public.users
  add column settings jsonb not null default '{}'::jsonb
    constraint users_settings_valid check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 8192);
grant update (settings) on public.users to authenticated;

-- Shallow merge, so concurrent saves of different settings never overwrite each other.
create function public.update_user_settings(patch jsonb)
returns jsonb
language sql security invoker set search_path = '' as $$
  update public.users
     set settings = settings || patch
   where id = (select auth.uid())
  returning settings;
$$;
revoke all on function public.update_user_settings(jsonb) from public, anon;
grant execute on function public.update_user_settings(jsonb) to authenticated;
