-- Optional collection descriptions, per-account pinning style and the once-per-day opening animation.

alter table public.collections
  add column description text not null default ''
    constraint collections_description_valid check (char_length(description) <= 1000);
grant insert (description), update (description) on public.collections to authenticated;

alter table public.users
  add column pin_style text not null default 'current'
    constraint users_pin_style_valid check (pin_style in ('current', 'clean')),
  add column intro_seen_on date;
grant update (pin_style, intro_seen_on) on public.users to authenticated;
