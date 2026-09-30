-- RLS, ownership and integrity tests for personal workspaces. Run with: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '', now(), now(), now(), '{}', '{}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '', now(), now(), now(), '{}', '{}');
insert into public.users (id) values ('aaaaaaaa-0000-4000-8000-000000000001'), ('bbbbbbbb-0000-4000-8000-000000000002');

-- User A: an anime workspace with Arcs/East Blue/Notes and a checklist.
insert into public.entries (id, user_id, kind, title) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001', 'anime', 'One Piece'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', 'game', 'A game');
insert into public.workspace_nodes (id, user_id, entry_id, parent_id, kind, name, content) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', null, 'folder', 'Arcs', ''),
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'folder', 'East Blue', ''),
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000f2', 'note', 'Notes', 'Luffy'),
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'checklist', 'Arc list', '');
insert into public.workspace_checklist_items (id, user_id, file_id, label, checked, position) values
  ('aaaaaaaa-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Romance Dawn', true, 0),
  ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Orange Town', false, 1);

-- User B
insert into public.entries (id, user_id, kind, title) values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000002', 'anime', 'B anime');
insert into public.workspace_nodes (id, user_id, entry_id, parent_id, kind, name) values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000e1', null, 'folder', 'B folder'),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000e1', null, 'checklist', 'B list');
insert into public.workspace_checklist_items (id, user_id, file_id, label) values
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'B secret');

-- ---------------------------------------------------------------------------
-- Schema: the catalog model, MyAnimeList sync and the import worker are gone
-- ---------------------------------------------------------------------------
select hasnt_table('public', 'media_items', 'catalog media items were removed');
select hasnt_table('public', 'user_progress', 'catalog progress was removed');
select hasnt_table('public', 'mal_credentials', 'MAL tokens table was removed');
select hasnt_table('public', 'sync_outbox', 'MAL outbox was removed');
select hasnt_table('public', 'jobs', 'import job queue was removed');
select hasnt_function('public', 'claim_jobs', 'worker claim function was removed');
select hasnt_column('public', 'entries', 'notes', 'entry notes moved into workspace files');
select is((select count(*)::int from cron.job where jobname in ('archive-worker', 'archive-mal-refresh')), 0, 'no scheduled worker or MAL refresh');

-- ---------------------------------------------------------------------------
-- Anonymous access
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.entries', '42501', null, 'anon cannot read entries');
select throws_ok('select * from public.workspace_nodes', '42501', null, 'anon cannot read workspace nodes');
select throws_ok('select * from public.workspace_checklist_items', '42501', null, 'anon cannot read checklist items');
select throws_ok('select * from public.workspace_tree', '42501', null, 'anon cannot read the tree view');
select throws_ok($$insert into public.workspace_nodes (entry_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'note', 'x')$$, '42501', null, 'anon cannot create nodes');
select throws_ok($$select public.set_checklist_checked('aaaaaaaa-0000-4000-8000-0000000000c1', true)$$, '42501', null, 'anon cannot call checklist RPCs');

-- ---------------------------------------------------------------------------
-- User A
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.entries), 2, 'A sees only own entries');
select is((select count(*)::int from public.workspace_nodes), 4, 'A sees only own nodes');
select is((select count(*)::int from public.workspace_checklist_items), 2, 'A sees only own items');
select is_empty($$select 1 from public.workspace_tree where entry_id = 'bbbbbbbb-0000-4000-8000-0000000000e1'$$, 'tree view respects RLS');
select is((select count(*)::int from public.entry_workspace_summary), 2, 'summary view respects RLS');

-- Writes against B are filtered or rejected
select lives_ok($$update public.workspace_nodes set name = 'hijacked' where id = 'bbbbbbbb-0000-4000-8000-0000000000f1'$$, 'update of B node is silently filtered');
select lives_ok($$delete from public.workspace_checklist_items where id = 'bbbbbbbb-0000-4000-8000-0000000000d1'$$, 'delete of B item is silently filtered');
select throws_ok($$insert into public.entries (user_id, kind, title) values ('bbbbbbbb-0000-4000-8000-000000000002', 'anime', 'planted')$$, '42501', null, 'A cannot create entries owned by B');
select throws_ok($$update public.entries set user_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$, '42501', null, 'A cannot transfer entries to B');
select throws_ok($$insert into public.workspace_nodes (user_id, entry_id, kind, name) values ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'note', 'x')$$, '42501', null, 'A cannot set node ownership');
select throws_ok($$update public.workspace_nodes set version = 42 where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'versions are not client-writable');
select throws_ok($$update public.workspace_nodes set kind = 'folder' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, '42501', null, 'node type is not client-writable');

-- Cross-owner foreign-key attacks
select throws_ok($$insert into public.workspace_nodes (entry_id, kind, name) values ('bbbbbbbb-0000-4000-8000-0000000000e1', 'note', 'planted')$$, '23503', null, 'cannot create files in B workspace');
select throws_ok($$insert into public.workspace_nodes (entry_id, parent_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-0000000000f1', 'note', 'planted')$$, '23503', null, 'cannot nest under a B folder');
select throws_ok($$update public.workspace_nodes set parent_id = 'bbbbbbbb-0000-4000-8000-0000000000f1' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, '23503', null, 'cannot move into a B folder');
select throws_ok($$insert into public.workspace_checklist_items (file_id, label) values ('bbbbbbbb-0000-4000-8000-0000000000c1', 'planted')$$, '23503', null, 'cannot add items to a B checklist');
select throws_ok($$insert into public.workspace_nodes (entry_id, parent_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'note', 'x')$$, '23503', null, 'parents must be in the same workspace');
select throws_ok($$select public.add_checklist_items('bbbbbbbb-0000-4000-8000-0000000000c1', array['x'])$$, '22023', null, 'RPC cannot append to B checklist');
select throws_ok($$select public.set_checklist_checked('bbbbbbbb-0000-4000-8000-0000000000c1', true)$$, '22023', null, 'RPC cannot check B checklist');
select throws_ok($$select public.reorder_checklist_items('bbbbbbbb-0000-4000-8000-0000000000c1', array['bbbbbbbb-0000-4000-8000-0000000000d1']::uuid[])$$, '22023', null, 'RPC cannot reorder B checklist');

-- Hierarchy integrity
select throws_ok($$update public.workspace_nodes set parent_id = id where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, '23514', null, 'self-parenting is rejected');
select throws_ok($$update public.workspace_nodes set parent_id = 'aaaaaaaa-0000-4000-8000-0000000000f2' where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, '23514', 'A folder cannot be moved into itself.', 'cycles are rejected');
select throws_ok($$insert into public.workspace_nodes (entry_id, parent_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'note', 'x')$$, '23514', 'Only folders can contain other items.', 'files cannot contain items');
select lives_ok($$update public.workspace_nodes set parent_id = null where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, 'files move to the root');
select lives_ok($$update public.workspace_nodes set parent_id = 'aaaaaaaa-0000-4000-8000-0000000000f2' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, 'files move into folders');
select throws_ok(
  $t$do $d$
    declare parent uuid := null; next uuid;
    begin
      for i in 1..33 loop
        insert into public.workspace_nodes (entry_id, parent_id, kind, name)
        values ('aaaaaaaa-0000-4000-8000-0000000000e2', parent, 'folder', 'Level ' || i) returning id into next;
        parent := next;
      end loop;
    end $d$$t$,
  '23514', 'Folders can be nested at most 32 levels deep.', 'nesting depth is bounded'
);

-- Names and content
select throws_ok($$insert into public.workspace_nodes (entry_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'folder', 'arcs')$$, '23505', null, 'sibling names are unique regardless of case');
select lives_ok($$insert into public.workspace_nodes (entry_id, parent_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'note', 'Notes')$$, 'the same name is fine in another folder');
select throws_ok($$insert into public.workspace_nodes (entry_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'note', ' padded')$$, '23514', null, 'names are trimmed');
select throws_ok($$insert into public.workspace_nodes (entry_id, kind, name) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'note', E'two\nlines')$$, '23514', null, 'names cannot contain control characters');
select throws_ok($$insert into public.workspace_nodes (entry_id, kind, name, content) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'checklist', 'List', 'text')$$, '23514', null, 'only notes have text content');
select throws_ok($$insert into public.workspace_checklist_items (file_id, label) values ('aaaaaaaa-0000-4000-8000-0000000000a1', 'x')$$, '23514', null, 'items only belong to checklists');
select throws_ok($$insert into public.workspace_checklist_items (file_id, label) values ('aaaaaaaa-0000-4000-8000-0000000000c1', '  ')$$, '23514', null, 'blank labels are rejected');

-- Versions
select lives_ok($$update public.workspace_nodes set name = 'Notes renamed' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, 'rename a note');
select is((select version from public.workspace_nodes where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), 1::bigint, 'renames keep the content version');
select lives_ok($$update public.workspace_nodes set content = 'Luffy and Zoro' where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$, 'edit a note');
select is((select version from public.workspace_nodes where id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), 2::bigint, 'content edits bump the version');

-- Checklist RPCs and read models
select results_eq(
  $$select label, position from public.add_checklist_items('aaaaaaaa-0000-4000-8000-0000000000c1', array['Syrup Village', 'My own arc']) order by position$$,
  $$values ('Syrup Village', 2), ('My own arc', 3)$$,
  'appended items continue the order'
);
select throws_ok(
  $$select public.reorder_checklist_items('aaaaaaaa-0000-4000-8000-0000000000c1', array['aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-0000000000d1']::uuid[])$$,
  '22023', null, 'partial reorders are rejected'
);
select lives_ok(
  $$select public.reorder_checklist_items('aaaaaaaa-0000-4000-8000-0000000000c1',
      array(select id from public.workspace_checklist_items where file_id = 'aaaaaaaa-0000-4000-8000-0000000000c1' order by position desc))$$,
  'complete reorders are applied'
);
select is((select label from public.workspace_checklist_items where file_id = 'aaaaaaaa-0000-4000-8000-0000000000c1' and position = 0), 'My own arc', 'order was reversed');
select is(public.set_checklist_checked('aaaaaaaa-0000-4000-8000-0000000000c1', true), 3, 'check all reports changed items');
select results_eq(
  $$select items_total, items_checked from public.workspace_tree where id = 'aaaaaaaa-0000-4000-8000-0000000000c1'$$,
  $$values (4, 4)$$,
  'tree view counts checklist items'
);
select results_eq(
  $$select files_total, checklist_total, checklist_checked from public.entry_workspace_summary where entry_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$,
  $$values (3, 4, 4)$$,
  'entry summary counts files and items'
);

-- Cascading deletes
select lives_ok($$delete from public.workspace_nodes where id = 'aaaaaaaa-0000-4000-8000-0000000000f1'$$, 'delete a folder');
select is((select count(*)::int from public.workspace_nodes where entry_id = 'aaaaaaaa-0000-4000-8000-0000000000e1'), 0, 'its whole subtree is deleted');
select is((select count(*)::int from public.workspace_checklist_items where file_id = 'aaaaaaaa-0000-4000-8000-0000000000c1'), 0, 'with checklist items');

-- ---------------------------------------------------------------------------
-- Guards that apply even to privileged roles
-- ---------------------------------------------------------------------------
reset role;
select throws_ok($$update public.workspace_nodes set kind = 'note' where id = 'bbbbbbbb-0000-4000-8000-0000000000f1'$$, '23514', null, 'node type is immutable');
select throws_ok($$update public.workspace_checklist_items set file_id = 'bbbbbbbb-0000-4000-8000-0000000000f1' where id = 'bbbbbbbb-0000-4000-8000-0000000000d1'$$, '23514', null, 'items cannot move between files');
select is((select name from public.workspace_nodes where id = 'bbbbbbbb-0000-4000-8000-0000000000f1'), 'B folder', 'B node unchanged');
select is((select count(*)::int from public.workspace_checklist_items where id = 'bbbbbbbb-0000-4000-8000-0000000000d1'), 1, 'B item not deleted');

select * from finish();
rollback;
