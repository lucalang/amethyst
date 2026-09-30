-- RLS, ownership and integrity tests. Run with: npm run test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(72);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '', now(), now(), now(), '{}', '{}'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '', now(), now(), now(), '{}', '{}');
insert into public.users (id) values ('aaaaaaaa-0000-4000-8000-000000000001'), ('bbbbbbbb-0000-4000-8000-000000000002');

-- User A
insert into public.entries (id, user_id, kind, title) values
  ('aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001', 'franchise', 'A franchise'),
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', 'game', 'A game');
insert into public.custom_games (entry_id, user_id, tabs) values
  ('aaaaaaaa-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001', '[]');
insert into public.media_items (id, user_id, source_key, mal_id, kind, title, total_episodes) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'mal:21', 21, 'series', 'A series', 3),
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-000000000001', 'mal:22', 22, 'series', 'A second series', 3);
insert into public.media_items (id, user_id, parent_id, source_key, kind, title, episode_number) values
  ('aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'mal:21:episode:1', 'episode', 'Ep 1', 1),
  ('aaaaaaaa-0000-4000-8000-0000000000b2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'mal:21:episode:2', 'episode', 'Ep 2', 2),
  ('aaaaaaaa-0000-4000-8000-0000000000b3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'mal:21:episode:3', 'episode', 'Ep 3', 3),
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'mal:22:episode:1', 'episode', 'S2 Ep 1', 1),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'mal:22:episode:2', 'episode', 'S2 Ep 2', 2),
  ('aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'mal:22:episode:3', 'episode', 'S2 Ep 3', 3);
insert into public.entry_media_items (user_id, entry_id, media_item_id, section) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'main'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'main');
insert into public.arcs (id, user_id, entry_id, series_item_id, title) values
  ('aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000a1', 'Arc one');
insert into public.arc_items (user_id, arc_id, media_item_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-0000000000b1');

-- User B
insert into public.entries (id, user_id, kind, title) values
  ('bbbbbbbb-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-000000000002', 'franchise', 'B franchise');
insert into public.media_items (id, user_id, source_key, mal_id, kind, title, total_episodes) values
  ('bbbbbbbb-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000002', 'mal:21', 21, 'series', 'B series', 3);
insert into public.media_items (id, user_id, source_key, kind, title) values
  ('bbbbbbbb-0000-4000-8000-0000000000d1', 'bbbbbbbb-0000-4000-8000-000000000002', 'custom:b1', 'checklist', 'B task');
insert into public.arcs (id, user_id, entry_id, title) values
  ('bbbbbbbb-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-0000000000e1', 'B arc');
insert into public.jobs (id, user_id, kind, dedupe_key) values
  ('bbbbbbbb-0000-4000-8000-0000000000aa', 'bbbbbbbb-0000-4000-8000-000000000002', 'franchise_import', 'mal:21');
insert into public.mal_credentials (user_id, access_token_ciphertext, refresh_token_ciphertext, access_expires_at) values
  ('bbbbbbbb-0000-4000-8000-000000000002', 'x', 'y', now() + interval '1 hour');
insert into public.oauth_states (state_hash, user_id, code_verifier_ciphertext, expires_at) values
  (repeat('a', 64), 'bbbbbbbb-0000-4000-8000-000000000002', 'z', now() + interval '10 minutes');
insert into public.catalog_anime (mal_id, title) values (21, 'Public catalog title');

-- ---------------------------------------------------------------------------
-- Anonymous access
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.entries', '42501', null, 'anon cannot read entries');
select throws_ok('select * from public.media_items', '42501', null, 'anon cannot read media items');
select throws_ok('select * from public.user_progress', '42501', null, 'anon cannot read progress');
select throws_ok('select * from public.jobs', '42501', null, 'anon cannot read jobs');
select throws_ok('select * from public.mal_credentials', '42501', null, 'anon cannot read MAL tokens');
select throws_ok('select * from public.catalog_anime', '42501', null, 'anon cannot read the catalog');
select throws_ok($$insert into public.entries (user_id, kind, title) values ('aaaaaaaa-0000-4000-8000-000000000001', 'custom', 'x')$$, '42501', null, 'anon cannot insert entries');
select throws_ok($$select public.set_items_checked(array['aaaaaaaa-0000-4000-8000-0000000000b1']::uuid[], true)$$, '42501', null, 'anon cannot call progress RPCs');

-- ---------------------------------------------------------------------------
-- User A
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.entries), 2, 'A sees only own entries');
select is((select count(*)::int from public.media_items), 8, 'A sees only own media items');
select is_empty($$select 1 from public.entries where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'$$, 'A cannot read B entry by id');
select is_empty($$select 1 from public.jobs$$, 'A cannot read B jobs');
select is((select count(*)::int from public.catalog_anime), 1, 'authenticated users can read the shared catalog');

select lives_ok($$update public.entries set title = 'hijacked' where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'$$, 'update of B entry is silently filtered');
select lives_ok($$delete from public.media_items where id = 'bbbbbbbb-0000-4000-8000-0000000000a1'$$, 'delete of B item is silently filtered');
select throws_ok($$insert into public.entries (user_id, kind, title) values ('bbbbbbbb-0000-4000-8000-000000000002', 'custom', 'planted')$$, '42501', null, 'A cannot create rows owned by B');
select throws_ok($$update public.entries set user_id = 'bbbbbbbb-0000-4000-8000-000000000002' where id = 'aaaaaaaa-0000-4000-8000-0000000000e1'$$, '42501', null, 'A cannot transfer rows to B');

-- Cross-owner foreign-key attacks
select throws_ok($$insert into public.entry_media_items (entry_id, media_item_id) values ('aaaaaaaa-0000-4000-8000-0000000000e1', 'bbbbbbbb-0000-4000-8000-0000000000a1')$$, '23503', null, 'cannot link B media into A franchise');
select throws_ok($$insert into public.entry_media_items (entry_id, media_item_id) values ('bbbbbbbb-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, '23503', null, 'cannot link A media into B franchise');
select throws_ok($$insert into public.user_progress (media_item_id, is_checked) values ('bbbbbbbb-0000-4000-8000-0000000000d1', true)$$, '23503', null, 'cannot record progress on B items');
select throws_ok($$insert into public.media_items (parent_id, source_key, kind, title, episode_number) values ('bbbbbbbb-0000-4000-8000-0000000000a1', 'attack:1', 'episode', 'x', 1)$$, '23503', null, 'cannot parent under B items');
select throws_ok($$insert into public.arc_items (arc_id, media_item_id) values ('bbbbbbbb-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-0000000000b2')$$, '23503', null, 'cannot add items to B arc');
select throws_ok($$insert into public.arcs (entry_id, title) values ('bbbbbbbb-0000-4000-8000-0000000000e1', 'x')$$, '23503', null, 'cannot create arcs in B franchise');
select throws_ok($$insert into public.custom_games (entry_id) values ('bbbbbbbb-0000-4000-8000-0000000000e1')$$, '23503', null, 'cannot attach custom tabs to B entry');
select throws_ok($$insert into public.custom_games (entry_id) values ('aaaaaaaa-0000-4000-8000-0000000000e1')$$, '23514', null, 'franchises cannot carry custom tabs');

-- Hierarchy integrity
select throws_ok($$update public.media_items set parent_id = id where id = 'aaaaaaaa-0000-4000-8000-0000000000b1'$$, '23514', null, 'self-parenting is rejected');
select throws_ok($$insert into public.media_items (source_key, kind, title, episode_number) values ('orphan', 'episode', 'x', 1)$$, '23514', null, 'episodes require a parent');
select throws_ok($$insert into public.media_items (source_key, kind, title, mal_id, parent_id) values ('mal:21:episode:99', 'episode', 'x', 99, 'aaaaaaaa-0000-4000-8000-0000000000a1')$$, '23514', null, 'episodes cannot carry a MAL id');
insert into public.media_items (id, source_key, kind, title) values ('aaaaaaaa-0000-4000-8000-0000000000d1', 'custom:x', 'checklist', 'X');
insert into public.media_items (id, parent_id, source_key, kind, title) values ('aaaaaaaa-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-0000000000d1', 'custom:y', 'checklist', 'Y');
select throws_ok($$update public.media_items set parent_id = 'aaaaaaaa-0000-4000-8000-0000000000d2' where id = 'aaaaaaaa-0000-4000-8000-0000000000d1'$$, '23514', null, 'hierarchy cycles are rejected');
select throws_ok($$insert into public.user_progress (media_item_id, is_checked) values ('aaaaaaaa-0000-4000-8000-0000000000a1', true)$$, '23514', null, 'works cannot use is_checked');

-- Progress RPCs
select throws_ok($$select public.set_items_checked(array['bbbbbbbb-0000-4000-8000-0000000000d1']::uuid[], true)$$, '22023', null, 'cannot check B items through the RPC');
select throws_ok($$select public.set_items_checked(array['aaaaaaaa-0000-4000-8000-0000000000a1']::uuid[], true)$$, '22023', null, 'works are not atomic checklist items');
select lives_ok($$select public.set_items_checked(array['aaaaaaaa-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000b2']::uuid[], true)$$, 'check two episodes');
select results_eq(
  $$select episodes_watched, status, episodes_mapped from public.user_progress where media_item_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$,
  $$values (2, 'watching', true)$$,
  'series aggregate derives from checked episodes'
);
select lives_ok($$select public.set_items_checked(array['aaaaaaaa-0000-4000-8000-0000000000b3', 'aaaaaaaa-0000-4000-8000-0000000000b3']::uuid[], true)$$, 'duplicate ids are counted once');
select results_eq(
  $$select episodes_watched, status from public.user_progress where media_item_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$,
  $$values (3, 'completed')$$,
  'all episodes checked completes the series'
);
select lives_ok($$select public.set_arc_checked('aaaaaaaa-0000-4000-8000-0000000000f1', false)$$, 'arc checkbox acts on its episodes');
select results_eq(
  $$select episodes_watched, status from public.user_progress where media_item_id = 'aaaaaaaa-0000-4000-8000-0000000000a1'$$,
  $$values (2, 'watching')$$,
  'unchecking an arc lowers the derived aggregate'
);
select throws_ok($$select public.set_arc_checked('bbbbbbbb-0000-4000-8000-0000000000f1', true)$$, '22023', null, 'cannot toggle B arcs');
select throws_ok($$select public.set_container_progress('aaaaaaaa-0000-4000-8000-0000000000a1', 9)$$, '22023', null, 'watched count cannot exceed a known total');

-- Imported aggregate (as the worker would apply it) is preserved until mapped.
reset role;
select lives_ok($$select public.apply_mal_remote('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'watching', 7, 2, now())$$, 'worker applies a MAL aggregate');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select results_eq(
  $$select episodes_watched, episodes_mapped, score::int from public.user_progress where media_item_id = 'aaaaaaaa-0000-4000-8000-0000000000a2'$$,
  $$values (2, false, 7)$$,
  'imported count stays an unmapped aggregate'
);
select is((select count(*)::int from public.user_progress where media_item_id in ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-0000000000c2') and is_checked), 0, 'no per-episode history is invented');
select lives_ok($$select public.set_items_checked(array['aaaaaaaa-0000-4000-8000-0000000000c3']::uuid[], true)$$, 'check a later episode');
select results_eq(
  $$select episodes_watched, episodes_mapped from public.user_progress where media_item_id = 'aaaaaaaa-0000-4000-8000-0000000000a2'$$,
  $$values (2, false)$$,
  'unmapped aggregate is not lowered by partial checks'
);
select lives_ok($$select public.map_watched_count_to_episodes('aaaaaaaa-0000-4000-8000-0000000000a2')$$, 'explicit mapping of the first N episodes');
select results_eq(
  $$select episodes_watched, episodes_mapped, status from public.user_progress where media_item_id = 'aaaaaaaa-0000-4000-8000-0000000000a2'$$,
  $$values (3, true, 'completed')$$,
  'mapping checks the first N episodes and re-derives'
);

-- Server-only tables and worker functions
select throws_ok('select * from public.mal_credentials', '42501', null, 'MAL tokens are server-only');
select throws_ok('select * from public.oauth_states', '42501', null, 'OAuth state is server-only');
select throws_ok('select * from public.provider_cache', '42501', null, 'provider cache is server-only');
select throws_ok($$select public.import_begin('bbbbbbbb-0000-4000-8000-0000000000aa', '{}')$$, '42501', null, 'worker functions are not callable by users');
select throws_ok($$select * from public.claim_jobs('x', 10, 60)$$, '42501', null, 'users cannot claim jobs');
select throws_ok($$insert into public.sync_outbox (user_id, media_item_id, mal_id, desired) values ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1', 21, '{}')$$, '42501', null, 'users cannot write the outbox');

-- Jobs: enqueue own, cannot forge worker columns
select lives_ok($$insert into public.jobs (kind, input, dedupe_key) values ('franchise_import', '{"mal_id":21}', 'mal:21')$$, 'A can enqueue an import');
select throws_ok($$insert into public.jobs (kind, input, dedupe_key) values ('franchise_import', '{"mal_id":21}', 'mal:21')$$, '23505', null, 'duplicate active imports are rejected');
select throws_ok($$insert into public.jobs (kind, dedupe_key, status) values ('franchise_import', 'mal:5', 'succeeded')$$, '42501', null, 'users cannot set job status on insert');
select throws_ok($$update public.jobs set checkpoint = '{"x":1}'$$, '42501', null, 'users cannot write job checkpoints');
select throws_ok($$update public.jobs set status = 'succeeded'$$, '42501', null, 'users can only cancel jobs');

-- MAL account settings
reset role;
insert into public.mal_accounts (user_id, mal_username, initial_sync) values ('aaaaaaaa-0000-4000-8000-000000000001', 'a_on_mal', 'pending');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$update public.mal_accounts set initial_sync = 'approved'$$, '42501', null, 'cannot approve before the preview is ready');
select throws_ok($$update public.mal_accounts set outbound_enabled = true$$, '23514', null, 'outbound writes require approval');
select throws_ok($$update public.mal_accounts set status = 'connected'$$, '42501', null, 'connection status is worker-managed');

-- Outbox trigger: coalesced, one pending row per item
reset role;
update public.mal_accounts set initial_sync = 'approved', outbound_enabled = true where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.set_container_progress('aaaaaaaa-0000-4000-8000-0000000000a1', null, 'on_hold', 8)$$, 'local change on a MAL-linked work');
select lives_ok($$select public.set_container_progress('aaaaaaaa-0000-4000-8000-0000000000a1', null, 'dropped')$$, 'second local change');
select results_eq(
  $$select count(*)::int, max(desired ->> 'status') from public.sync_outbox where media_item_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' and state = 'pending'$$,
  $$values (1, 'dropped')$$,
  'outbox coalesces pending changes per item'
);

-- Custom tab validation
select throws_ok($$update public.custom_games set tabs = '[{"id":"nope","title":"Codes","type":"markdown","content":""}]'$$, '23514', null, 'malformed tabs are rejected');
select lives_ok($$select public.save_custom_tabs('aaaaaaaa-0000-4000-8000-0000000000e2', '[{"id":"0d9c6a8e-9a51-4c3c-8a55-0f4e8c1c2b11","title":"Codes","type":"markdown","content":"**hi**"}]')$$, 'valid tabs are saved');

-- ---------------------------------------------------------------------------
-- User B cannot see or act on A's sync state
-- ---------------------------------------------------------------------------
reset role;
select public.record_sync_conflict('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a1', 21, '{"status":"dropped"}', '{"status":"completed"}', null);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.sync_outbox), 0, 'B cannot see A outbox');
select is((select count(*)::int from public.sync_conflicts), 0, 'B cannot see A conflicts');
select throws_ok($$select public.resolve_sync_conflict((select id from public.sync_conflicts limit 1), 'remote')$$, '22023', null, 'B cannot resolve A conflicts');
select is((select count(*)::int from public.entry_progress_summary), 1, 'summary view respects RLS');

-- Confirm filtered writes did not touch B data
reset role;
select is((select title from public.entries where id = 'bbbbbbbb-0000-4000-8000-0000000000e1'), 'B franchise', 'B entry unchanged');
select is((select count(*)::int from public.media_items where id = 'bbbbbbbb-0000-4000-8000-0000000000a1'), 1, 'B item not deleted');

select * from finish();
rollback;
