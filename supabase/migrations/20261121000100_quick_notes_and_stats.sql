-- Quick Notes: standalone per-user Markdown notes (no entry or collection), plus read-only
-- aggregates for Collection Stats and the platform-wide Amethyst Stats page.

-- ---------------------------------------------------------------------------
-- 1. Quick Notes
-- ---------------------------------------------------------------------------
create table public.quick_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  name text not null
    constraint quick_notes_name_valid check (char_length(name) between 1 and 200 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  content text not null default ''
    constraint quick_notes_content_length check (char_length(content) <= 200000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quick_notes_user_updated on public.quick_notes (user_id, updated_at desc);

-- Every write bumps the version so stale editors get a conflict instead of overwriting.
create function public.quick_notes_touch()
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
revoke execute on function public.quick_notes_touch() from public, anon, authenticated;
create trigger quick_notes_touch before update on public.quick_notes
  for each row execute function public.quick_notes_touch();

create function public.quick_notes_limit()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('quick_notes:' || new.user_id::text, 0));
  if (select count(*) from public.quick_notes where user_id = new.user_id) >= 1000 then
    raise exception 'quick note limit reached' using errcode = 'P0001', hint = 'quick_note_limit';
  end if;
  return new;
end;
$$;
revoke execute on function public.quick_notes_limit() from public, anon, authenticated;
create trigger quick_notes_limit before insert on public.quick_notes
  for each row execute function public.quick_notes_limit();

alter table public.quick_notes enable row level security;
create policy owner_access on public.quick_notes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.quick_notes from public, anon, authenticated;
grant select, delete on public.quick_notes to authenticated;
grant insert (name, content), update (name, content) on public.quick_notes to authenticated;
grant all on public.quick_notes to service_role;

-- ---------------------------------------------------------------------------
-- 2. Collection Stats (caller's own rows via RLS)
-- ---------------------------------------------------------------------------
create function public.collection_workspace_stats(p_collection uuid)
returns table (notes integer, checklists integer, items_total integer, items_done integer, items_starred_open integer)
language sql stable security invoker set search_path = '' as $$
  select
    (select count(*) from public.workspace_nodes n join public.entries e on e.id = n.entry_id
      where e.collection_id = p_collection and n.kind = 'note')::integer,
    (select count(*) from public.workspace_nodes n join public.entries e on e.id = n.entry_id
      where e.collection_id = p_collection and n.kind = 'checklist')::integer,
    count(i.id)::integer,
    (count(i.id) filter (where i.checked))::integer,
    (count(i.id) filter (where i.starred and not i.checked))::integer
  from public.workspace_checklist_items i
  join public.workspace_nodes n on n.id = i.file_id
  join public.entries e on e.id = n.entry_id
  where e.collection_id = p_collection;
$$;
revoke execute on function public.collection_workspace_stats(uuid) from public, anon;
grant execute on function public.collection_workspace_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Amethyst Stats: platform totals only (no ids, emails, codes or per-account rows)
-- ---------------------------------------------------------------------------
create function public.amethyst_stats()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sign in required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'collections', (select count(*) from public.collections),
    'entries', (select count(*) from public.entries),
    'checklist_tasks', (select count(*) from public.workspace_checklist_items),
    'todo_tasks', (select count(*) from public.tasks),
    -- Positive ledger rows of award kinds only: no purchases, Slots payouts or balances.
    'coins_arcade', (select coalesce(sum(amount), 0) from public.coin_transactions where kind = 'reward' and amount > 0),
    'coins_codes', (select coalesce(sum(amount), 0) from public.coin_transactions where kind = 'code' and amount > 0),
    'coins_achievements', (select coalesce(sum(amount), 0) from public.coin_transactions where kind = 'achievement' and amount > 0),
    'redemptions', (select count(*) from public.secret_code_redemptions),
    'redemption_pairs', (select count(*) from (select distinct code_id, user_id from public.secret_code_redemptions) pairs),
    -- Unique ownerships not bought in a shop.
    'cosmetics_granted', (
      select count(*) from public.user_cosmetics uc
      left join public.coin_transactions t on t.id = uc.transaction_id
      where t.id is null or t.kind <> 'purchase'
    )
  );
end;
$$;
revoke execute on function public.amethyst_stats() from public, anon;
grant execute on function public.amethyst_stats() to authenticated;
