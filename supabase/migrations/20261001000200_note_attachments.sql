-- Images embedded in notes (Obsidian-style ![[Pasted image ….png]]). Files live in
-- a private bucket under one folder per account: <user id>/<file name>.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-attachments', 'note-attachments', false, 10485760, array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage resolves the bucket under the caller's RLS; only this bucket's metadata is exposed.
create policy "note attachments: bucket visible to users" on storage.buckets for select to authenticated
  using (id = 'note-attachments');

create policy "note attachments: owners read" on storage.objects for select to authenticated
  using (bucket_id = 'note-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note attachments: owners upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'note-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "note attachments: owners delete" on storage.objects for delete to authenticated
  using (bucket_id = 'note-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
