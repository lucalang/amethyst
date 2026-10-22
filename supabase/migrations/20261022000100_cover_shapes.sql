alter table public.entries add column cover_shape text not null default 'portrait'
  check (cover_shape in ('square', 'portrait'));

alter table public.entries disable trigger entries_bump_version;
update public.entries set cover_shape = 'square' where kind = 'game';
alter table public.entries enable trigger entries_bump_version;

alter table public.users add column preferred_cover_shape text not null default 'portrait'
  check (preferred_cover_shape in ('square', 'portrait'));

grant insert (cover_shape), update (cover_shape) on public.entries to authenticated;
grant update (preferred_cover_shape) on public.users to authenticated;