-- Cover and banner artwork can also be an image uploaded from the device, stored
-- as its same-origin attachment path (/api/attachments/<file name>).

alter table public.entries drop constraint entries_cover_url_check;
alter table public.entries drop constraint entries_banner_url_check;
alter table public.entries add constraint entries_cover_url_check
  check (cover_url is null or ((cover_url ~* '^https?://' or cover_url ~ '^/api/attachments/[^/?#]+$') and char_length(cover_url) <= 2048));
alter table public.entries add constraint entries_banner_url_check
  check (banner_url is null or ((banner_url ~* '^https?://' or banner_url ~ '^/api/attachments/[^/?#]+$') and char_length(banner_url) <= 2048));
