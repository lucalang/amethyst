-- Spin Wheel: named wheels saved privately to the owner's account (choices, order, colors and look).
-- Choices and settings are small JSON documents validated by the API; the checks here bound their shape and size.
create table public.spin_wheels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null
    constraint spin_wheels_name_valid check (char_length(name) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  choices jsonb not null default '[]'::jsonb
    constraint spin_wheels_choices_valid check (jsonb_typeof(choices) = 'array' and jsonb_array_length(choices) <= 100 and pg_column_size(choices) <= 65536),
  settings jsonb not null default '{}'::jsonb
    constraint spin_wheels_settings_valid check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 4096),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index spin_wheels_user_updated on public.spin_wheels (user_id, updated_at desc);

-- Every write bumps the version so a stale tab gets a conflict instead of overwriting.
create function public.spin_wheels_touch()
returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;
revoke execute on function public.spin_wheels_touch() from public, anon, authenticated;
create trigger spin_wheels_touch before update on public.spin_wheels
  for each row execute function public.spin_wheels_touch();

create function public.spin_wheels_limit()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('spin_wheels:' || new.user_id::text, 0));
  if (select count(*) from public.spin_wheels where user_id = new.user_id) >= 100 then
    raise exception 'spin wheel limit reached' using errcode = 'P0001', hint = 'spin_wheel_limit';
  end if;
  return new;
end;
$$;
revoke execute on function public.spin_wheels_limit() from public, anon, authenticated;
create trigger spin_wheels_limit before insert on public.spin_wheels
  for each row execute function public.spin_wheels_limit();

alter table public.spin_wheels enable row level security;
create policy owner_access on public.spin_wheels for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.spin_wheels from public, anon, authenticated;
grant select, delete on public.spin_wheels to authenticated;
grant insert (name, choices, settings), update (name, choices, settings) on public.spin_wheels to authenticated;
grant all on public.spin_wheels to service_role;
