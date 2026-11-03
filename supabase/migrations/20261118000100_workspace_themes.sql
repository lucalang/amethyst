alter table public.entries add column workspace_theme text default null;

grant update (workspace_theme) on public.entries to authenticated;