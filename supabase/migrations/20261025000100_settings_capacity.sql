-- Room for the Home cover-fan collection list (up to 200 collection ids) next to the
-- existing preferences. Only the size cap changes; existing settings are untouched.
alter table public.users drop constraint if exists users_settings_valid;
alter table public.users
  add constraint users_settings_valid check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 32768);
