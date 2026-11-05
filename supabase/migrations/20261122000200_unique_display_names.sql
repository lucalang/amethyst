-- Display names are public on Arcade leaderboards, so they must be unique (case-insensitive).
alter table public.users add constraint users_display_name_trimmed check (display_name = btrim(display_name));
create unique index users_display_name_unique on public.users (lower(display_name)) where display_name is not null;

-- Leaderboards show the player's display name; players without one keep their anonymous arcade name.
create or replace function public._arcade_name(p_user uuid)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  adjectives constant text[] := array['Amber', 'Arctic', 'Brave', 'Bright', 'Calm', 'Clever', 'Copper', 'Cosmic', 'Crystal', 'Dusky',
    'Ember', 'Fable', 'Frost', 'Gilded', 'Glowing', 'Golden', 'Hidden', 'Jade', 'Lucky', 'Lunar',
    'Misty', 'Nimble', 'Quiet', 'Rapid', 'Rosy', 'Silver', 'Solar', 'Swift', 'Velvet', 'Violet', 'Wild', 'Zesty'];
  animals constant text[] := array['Badger', 'Bat', 'Crane', 'Falcon', 'Ferret', 'Finch', 'Fox', 'Gecko', 'Hare', 'Hedgehog',
    'Heron', 'Ibis', 'Koala', 'Lark', 'Lemur', 'Lynx', 'Marten', 'Moth', 'Newt', 'Ocelot',
    'Orca', 'Otter', 'Owl', 'Panda', 'Puffin', 'Quokka', 'Raven', 'Seal', 'Stoat', 'Tapir', 'Wren', 'Yak'];
  v_name text;
  h bytea;
begin
  select display_name into v_name from public.users where id = p_user;
  if v_name is not null then
    return v_name;
  end if;
  h := decode(md5((select salt from public.arcade_name_salt) || p_user::text), 'hex');
  return adjectives[1 + get_byte(h, 0) % 32] || ' ' || animals[1 + get_byte(h, 1) % 32] || ' '
    || lpad(((get_byte(h, 2) * 256 + get_byte(h, 3)) % 100)::text, 2, '0');
end;
$$;
revoke all on function public._arcade_name(uuid) from public, anon, authenticated;
