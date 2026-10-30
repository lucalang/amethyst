-- Achievement rewards: server-authoritative coins and exclusive cosmetics, badges and titles.
--
-- * Every achievement has an authoritative reward definition in achievement_definitions /
--   achievement_reward_items. Clients never supply reward amounts or item ids.
-- * Grants are recorded once per (user_id, achievement_id) in user_achievement_rewards and
--   once per (user_id, 'achievement:' || achievement_id) in coin_transactions.
-- * Achievement coins use ledger kind 'achievement': they are one-time milestone grants, so
--   they never disappear when a player has reached the 600-coin daily play/slots limit and
--   do not consume daily play room.
-- * Already-owned cosmetics are recorded in items_already_owned without inventing extra coin
--   compensation.

-- ---------------------------------------------------------------------------
-- 1. Cosmetic catalogue: source tracking and achievement-exclusive items
-- ---------------------------------------------------------------------------
alter table public.cosmetic_items
  add column if not exists source text not null default 'shop'
  check (source in ('shop', 'vault', 'achievement'));

update public.cosmetic_items set source = 'vault' where secret and source = 'shop';

alter table public.cosmetic_items drop constraint if exists cosmetic_items_price_check;
alter table public.cosmetic_items drop constraint if exists cosmetic_items_secret_unavailable;
alter table public.cosmetic_items
  add constraint cosmetic_items_price_check check (case when source = 'shop' then price > 0 else price = 0 end),
  add constraint cosmetic_items_nonshop_unavailable check (source = 'shop' or not available);

insert into public.cosmetic_items (id, kind, price, available, secret, source) values
  ('obsidian-relic',        'frame',             0, false, false, 'achievement'),
  ('celestial-prism',       'frame',             0, false, false, 'achievement'),
  ('archivist-quill',       'avatar_decoration', 0, false, false, 'achievement'),
  ('champion-halo',         'avatar_decoration', 0, false, false, 'achievement'),
  ('badge-sovereign',       'badge',             0, false, false, 'achievement'),
  ('badge-needle',          'badge',             0, false, false, 'achievement'),
  ('badge-ouroboros',       'badge',             0, false, false, 'achievement'),
  ('badge-aegis',           'badge',             0, false, false, 'achievement'),
  ('title-logic-master',    'title',             0, false, false, 'achievement'),
  ('title-blade-dancer',    'title',             0, false, false, 'achievement'),
  ('title-master-builder',  'title',             0, false, false, 'achievement'),
  ('title-cabinet-curator', 'title',             0, false, false, 'achievement'),
  ('title-grand-archivist', 'title',             0, false, false, 'achievement')
on conflict (id) do update set
  kind = excluded.kind,
  price = excluded.price,
  available = excluded.available,
  secret = excluded.secret,
  source = excluded.source;

-- ---------------------------------------------------------------------------
-- 2. Coin ledger kind for achievement milestone rewards
-- ---------------------------------------------------------------------------
alter table public.coin_transactions drop constraint if exists coin_transactions_kind_check;
alter table public.coin_transactions
  add constraint coin_transactions_kind_check
  check (kind in ('reward', 'purchase', 'code', 'slots', 'achievement'));

-- ---------------------------------------------------------------------------
-- 3. Achievement definitions, reward mapping and durable grant records
-- ---------------------------------------------------------------------------
alter table public.achievement_definitions
  add column if not exists reward_coins integer not null default 0 check (reward_coins >= 0),
  add column if not exists hidden boolean not null default false;

insert into public.achievement_definitions (id, metric, target, display_order, reward_coins, hidden) values
  ('light-sculptor', 'light_sculptor', 1, 23, 0, true),
  ('seal-breaker',   'seal_breaker',   1, 24, 0, true)
on conflict (id) do update set
  metric = excluded.metric,
  target = excluded.target,
  display_order = excluded.display_order,
  reward_coins = excluded.reward_coins,
  hidden = excluded.hidden;

update public.achievement_definitions as d
   set reward_coins = v.coins,
       hidden = v.hidden
  from (values
    ('four-figures',        75,  false),
    ('double-trouble',      100, false),
    ('taking-flight',       40,  false),
    ('thread-the-needle',   100, false),
    ('growing-appetite',    45,  false),
    ('running-out-of-room', 100, false),
    ('first-solution',      45,  false),
    ('hard-thinking',       0,   false),
    ('combo-starter',       30,  false),
    ('precision',           0,   false),
    ('skyward',             50,  false),
    ('perfect-alignment',   0,   false),
    ('first-chapter',       30,  false),
    ('blueprint',           40,  false),
    ('made-it-mine',        35,  false),
    ('checked-off',         0,   false),
    ('the-collector',       120, false),
    ('collection-complete', 150, false),
    ('arcade-explorer',     75,  false),
    ('personal-best',       0,   false),
    ('gallery-visitor',     30,  false),
    ('closer-look',         30,  false),
    ('light-sculptor',      0,   true),
    ('seal-breaker',        0,   true)
  ) as v(id, coins, hidden)
 where d.id = v.id;

create table if not exists public.achievement_reward_items (
  achievement_id text not null references public.achievement_definitions (id) on delete cascade,
  item_id text not null references public.cosmetic_items (id),
  position integer not null default 0,
  primary key (achievement_id, item_id)
);

alter table public.achievement_reward_items enable row level security;
drop policy if exists authenticated_read on public.achievement_reward_items;
create policy authenticated_read on public.achievement_reward_items for select to authenticated using (true);
revoke all on public.achievement_reward_items from public, anon, authenticated;
grant select on public.achievement_reward_items to authenticated;
grant all on public.achievement_reward_items to service_role;

insert into public.achievement_reward_items (achievement_id, item_id, position) values
  ('double-trouble',      'badge-sovereign',       0),
  ('thread-the-needle',   'badge-needle',          0),
  ('running-out-of-room', 'badge-ouroboros',       0),
  ('hard-thinking',       'title-logic-master',    0),
  ('precision',           'title-blade-dancer',    0),
  ('perfect-alignment',   'title-master-builder',  0),
  ('checked-off',         'title-cabinet-curator', 0),
  ('the-collector',       'archivist-quill',       0),
  ('collection-complete', 'obsidian-relic',        0),
  ('collection-complete', 'title-grand-archivist', 1),
  ('personal-best',       'champion-halo',         0),
  ('light-sculptor',      'celestial-prism',       0),
  ('seal-breaker',        'badge-aegis',           0)
on conflict (achievement_id, item_id) do update set position = excluded.position;

create table if not exists public.user_achievement_rewards (
  user_id uuid not null references public.users (id) on delete cascade,
  achievement_id text not null references public.achievement_definitions (id) on delete cascade,
  coins_granted integer not null default 0 check (coins_granted >= 0),
  items_granted text[] not null default '{}',
  items_new text[] not null default '{}',
  items_already_owned text[] not null default '{}',
  transaction_id bigint references public.coin_transactions (id),
  source text not null check (source in ('event', 'backfill')),
  granted_at timestamptz not null default now(),
  notification_claimed_at timestamptz,
  primary key (user_id, achievement_id),
  foreign key (user_id, achievement_id) references public.user_achievements (user_id, achievement_id) on delete cascade
);
create index if not exists user_achievement_rewards_unclaimed
  on public.user_achievement_rewards (user_id)
  where notification_claimed_at is null;

alter table public.user_achievement_rewards enable row level security;
drop policy if exists owner_read on public.user_achievement_rewards;
create policy owner_read on public.user_achievement_rewards
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_achievement_rewards from public, anon, authenticated;
grant select on public.user_achievement_rewards to authenticated;
grant all on public.user_achievement_rewards to service_role;

-- ---------------------------------------------------------------------------
-- 4. Atomic reward granting & notification claiming
-- ---------------------------------------------------------------------------
create or replace function public._grant_achievement_rewards(p_user uuid, p_source text, p_notify boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_source text := case when p_source = 'backfill' then 'backfill' else 'event' end;
  v_rec record;
  v_items text[];
  v_owned text[];
  v_new text[];
  v_balance integer := 0;
  v_tx bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if p_user is null then
    return '[]'::jsonb;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('achievement-rewards:' || p_user::text, 0));

  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;

  for v_rec in
    select d.id, d.reward_coins, d.display_order, ua.earned_at
      from public.user_achievements ua
      join public.achievement_definitions d on d.id = ua.achievement_id
      join public.user_achievement_progress p on p.user_id = ua.user_id and p.achievement_id = d.id
     where ua.user_id = p_user
       and p.progress >= d.target
       and not exists (
         select 1 from public.user_achievement_rewards uar
          where uar.user_id = p_user and uar.achievement_id = d.id
       )
     order by d.display_order
     for update of ua
  loop
    v_tx := null;
    select coalesce(array_agg(ri.item_id order by ri.position, ri.item_id), '{}')
      into v_items
      from public.achievement_reward_items ri
     where ri.achievement_id = v_rec.id;

    select coalesce(array_agg(u.item_id order by u.item_id), '{}')
      into v_owned
      from public.user_cosmetics u
     where u.user_id = p_user and u.item_id = any (v_items);

    if v_rec.reward_coins > 0 then
      select id into v_tx
        from public.coin_transactions
       where user_id = p_user and reference = 'achievement:' || v_rec.id;
      if not found then
        update public.coin_wallets
           set balance = balance + v_rec.reward_coins,
               earned = earned + v_rec.reward_coins,
               updated_at = now()
         where user_id = p_user
        returning balance into v_balance;

        insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
        values (
          p_user,
          v_rec.reward_coins,
          v_balance,
          'achievement',
          'achievement:' || v_rec.id,
          jsonb_build_object('achievement', v_rec.id, 'items', to_jsonb(v_items), 'source', v_source)
        )
        returning id into v_tx;
      end if;
    end if;

    with added as (
      insert into public.user_cosmetics (user_id, item_id, transaction_id)
      select p_user, item, v_tx
        from unnest(v_items) as item
      on conflict (user_id, item_id) do nothing
      returning item_id
    )
    select coalesce(array_agg(item_id order by item_id), '{}') into v_new from added;

    insert into public.user_achievement_rewards (
      user_id, achievement_id, coins_granted, items_granted, items_new, items_already_owned,
      transaction_id, source, notification_claimed_at
    )
    values (
      p_user,
      v_rec.id,
      v_rec.reward_coins,
      v_items,
      v_new,
      v_owned,
      v_tx,
      v_source,
      case when p_notify then null else now() end
    )
    on conflict (user_id, achievement_id) do nothing;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id', v_rec.id,
      'earnedAt', v_rec.earned_at,
      'source', v_source,
      'coins', v_rec.reward_coins,
      'items', to_jsonb(v_items),
      'newItems', to_jsonb(v_new),
      'alreadyOwnedItems', to_jsonb(v_owned),
      'balance', v_balance
    ));
  end loop;

  return v_results;
end;
$$;
revoke all on function public._grant_achievement_rewards(uuid, text, boolean) from public, anon, authenticated;

create or replace function public._award_eligible_achievements(p_user uuid, p_source text, p_notify boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_achievements (user_id, achievement_id, source, notification_claimed_at)
  select p_user, d.id, case when p_source = 'backfill' then 'backfill' else 'event' end, case when p_notify then null else now() end
    from public.achievement_definitions d
    join public.user_achievement_progress p on p.user_id = p_user and p.achievement_id = d.id
   where p.progress >= d.target
  on conflict (user_id, achievement_id) do nothing;

  return public._grant_achievement_rewards(p_user, p_source, p_notify);
end;
$$;
revoke all on function public._award_eligible_achievements(uuid, text, boolean) from public, anon, authenticated;

-- Evaluates archive & historical state for a user and awards/grants any eligible achievements.
create or replace function public._evaluate_user_achievements(p_user uuid, p_full_backfill boolean, p_notify boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_source text := case when p_full_backfill then 'backfill' else 'event' end;
  v_games jsonb;
  v_value integer;
  v_checked integer;
  v_complete integer;
  v_collection_percent integer;
begin
  perform public._set_achievement_progress(p_user, 'first-chapter', case when exists (
    select 1 from public.workspace_nodes n where n.user_id = p_user and n.kind = 'note' and btrim(n.content) <> ''
  ) then 1 else 0 end);
  perform public._set_achievement_progress(p_user, 'blueprint', case when exists (
    select 1 from public.workspace_templates t where t.user_id = p_user
  ) then 1 else 0 end);
  perform public._set_achievement_progress(p_user, 'made-it-mine', case when exists (
    select 1 from public.collections c where c.user_id = p_user and (c.icon is not null or c.accent_color is not null or c.banner_url is not null)
  ) then 1 else 0 end);
  perform public._set_achievement_progress(p_user, 'light-sculptor', case when exists (
    select 1 from public.viewer_presets vp where vp.user_id = p_user
  ) then 1 else 0 end);
  perform public._set_achievement_progress(p_user, 'seal-breaker', case when exists (
    select 1 from public.secret_code_redemptions scr where scr.user_id = p_user
  ) then 1 else 0 end);

  select coalesce(max(case when t.items_total >= 10 and t.items_checked = t.items_total then 10 else least(t.items_checked, 9) end), 0)
    into v_complete
    from public.workspace_tree t
   where t.user_id = p_user and t.kind = 'checklist' and t.items_total >= 10;
  perform public._set_achievement_progress(p_user, 'checked-off', v_complete);

  select coalesce(sum(t.items_checked), 0)::integer into v_checked
    from public.workspace_tree t
   where t.user_id = p_user and t.kind <> 'folder' and t.include_in_cover_progress;
  perform public._set_achievement_progress(p_user, 'the-collector', v_checked);

  select coalesce(max(case when totals.total >= 20 then floor(totals.checked * 100.0 / totals.total)::integer else 0 end), 0)
    into v_collection_percent
    from (
      select t.entry_id, sum(t.items_total)::integer as total, sum(t.items_checked)::integer as checked
        from public.workspace_tree t
       where t.user_id = p_user and t.kind <> 'folder' and t.include_in_cover_progress
       group by t.entry_id
    ) totals;
  perform public._set_achievement_progress(p_user, 'collection-complete', v_collection_percent);

  if p_full_backfill then
    select coalesce(jsonb_agg(game_id order by game_id), '[]'::jsonb) into v_games
      from (
        select distinct r.game as game_id
          from public.arcade_records r
         where r.user_id = p_user and r.score > 0
           and r.game in ('2048', 'flutter', 'snake', 'sudoku', 'fruit-slice', 'stacker')
      ) games;
    perform public._set_achievement_progress(p_user, 'arcade-explorer', jsonb_array_length(v_games), jsonb_build_object('games', v_games));

    select coalesce(max(score), 0) into v_value from public.arcade_records where user_id = p_user and game = 'flutter';
    perform public._set_achievement_progress(p_user, 'taking-flight', least(v_value, 10), '{}'::jsonb, true);
    perform public._set_achievement_progress(p_user, 'thread-the-needle', least(v_value, 50), '{}'::jsonb, true);
    select coalesce(max(score + 3), 3) into v_value from public.arcade_records where user_id = p_user and game = 'snake';
    perform public._set_achievement_progress(p_user, 'growing-appetite', least(v_value, 20), '{}'::jsonb, true);
    perform public._set_achievement_progress(p_user, 'running-out-of-room', least(v_value, 50), '{}'::jsonb, true);
    select coalesce(max(score), 0) into v_value from public.arcade_records where user_id = p_user and game = 'stacker';
    perform public._set_achievement_progress(p_user, 'skyward', least(v_value, 20), '{}'::jsonb, true);
    if exists (select 1 from public.arcade_records where user_id = p_user and game = 'sudoku') then
      perform public._set_achievement_progress(p_user, 'first-solution', 1);
    end if;
    if exists (select 1 from public.arcade_records where user_id = p_user and game = 'sudoku' and variant = 'hard') then
      perform public._set_achievement_progress(p_user, 'hard-thinking', 1);
    end if;
  end if;

  return public._award_eligible_achievements(p_user, v_source, p_notify);
end;
$$;
revoke all on function public._evaluate_user_achievements(uuid, boolean, boolean) from public, anon, authenticated;

create or replace function public.record_achievement_event(p_event text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_games jsonb;
  v_game text;
  v_value integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_event = 'game_started' then
    v_game := p_payload->>'game';
    if v_game not in ('2048', 'flutter', 'snake', 'sudoku', 'fruit-slice', 'stacker') then
      raise exception 'unsupported game' using errcode = '22023';
    end if;
    select coalesce(jsonb_agg(game_id order by game_id), '[]'::jsonb) into v_games
    from (
      select distinct value as game_id
      from public.user_achievement_progress p,
           lateral jsonb_array_elements_text(coalesce(p.details->'games', '[]'::jsonb))
      where p.user_id = v_user and p.achievement_id = 'arcade-explorer'
      union select v_game
    ) games;
    perform public._set_achievement_progress(v_user, 'arcade-explorer', jsonb_array_length(v_games), jsonb_build_object('games', v_games));

  elsif p_event in ('run_finished', 'run_progress') then
    v_game := p_payload->>'game';
    if v_game = '2048' then
      v_value := greatest(0, (p_payload->>'maxTile')::integer);
      perform public._set_achievement_progress(v_user, 'four-figures', least(v_value, 1024), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'double-trouble', least(v_value, 2048), '{}'::jsonb, true);
    elsif v_game = 'flutter' then
      v_value := greatest(0, (p_payload->>'obstacles')::integer);
      perform public._set_achievement_progress(v_user, 'taking-flight', least(v_value, 10), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'thread-the-needle', least(v_value, 50), '{}'::jsonb, true);
    elsif v_game = 'snake' then
      v_value := greatest(3, (p_payload->>'length')::integer);
      perform public._set_achievement_progress(v_user, 'growing-appetite', least(v_value, 20), '{}'::jsonb, true);
      perform public._set_achievement_progress(v_user, 'running-out-of-room', least(v_value, 50), '{}'::jsonb, true);
    elsif v_game = 'fruit-slice' then
      v_value := greatest(0, (p_payload->>'maxCombo')::integer);
      perform public._set_achievement_progress(v_user, 'combo-starter', least(v_value, 3), '{}'::jsonb, true);
      if p_event = 'run_finished' then
        v_value := case when p_payload->>'reason' = 'misses' and (p_payload->>'fruitsSliced')::integer >= 25 then 1 else 0 end;
        perform public._set_achievement_progress(v_user, 'precision', v_value, '{}'::jsonb, true);
      end if;
    elsif v_game = 'stacker' then
      v_value := greatest(0, (p_payload->>'height')::integer);
      perform public._set_achievement_progress(v_user, 'skyward', least(v_value, 20), '{}'::jsonb, true);
      v_value := greatest(0, (p_payload->>'perfectStreak')::integer);
      perform public._set_achievement_progress(v_user, 'perfect-alignment', least(v_value, 5), '{}'::jsonb, true);
    else
      raise exception 'unsupported game result' using errcode = '22023';
    end if;

  elsif p_event = 'sudoku_completed' then
    perform public._set_achievement_progress(v_user, 'first-solution', 1);
    if p_payload->>'difficulty' = 'hard' then
      perform public._set_achievement_progress(v_user, 'hard-thinking', 1);
    end if;

  elsif p_event = 'gallery_open' then
    perform public._set_achievement_progress(v_user, 'gallery-visitor', 1);

  elsif p_event = 'manual_rotation' then
    perform public._set_achievement_progress(v_user, 'closer-look', 1);

  elsif p_event = 'archive_snapshot' then
    return public._evaluate_user_achievements(v_user, false, true);

  elsif p_event = 'backfill' then
    return public._evaluate_user_achievements(v_user, true, true);

  else
    raise exception 'unsupported achievement event' using errcode = '22023';
  end if;

  return public._award_eligible_achievements(v_user, 'event', true);
end;
$$;
revoke all on function public.record_achievement_event(text, jsonb) from public, anon;
grant execute on function public.record_achievement_event(text, jsonb) to authenticated;

create or replace function public.claim_achievement_notifications()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_balance integer;
  v_claimed jsonb;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  perform public._grant_achievement_rewards(v_user, 'event', true);
  v_balance := public._wallet_balance(v_user);

  with claimed_rewards as (
    update public.user_achievement_rewards r
       set notification_claimed_at = now()
     where r.user_id = v_user
       and r.notification_claimed_at is null
    returning r.achievement_id, r.coins_granted, r.items_granted, r.items_new, r.items_already_owned, r.source, r.granted_at
  ),
  claimed_awards as (
    update public.user_achievements a
       set notification_claimed_at = now()
     where a.user_id = v_user
       and a.notification_claimed_at is null
       and exists (select 1 from claimed_rewards cr where cr.achievement_id = a.achievement_id)
    returning a.achievement_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', cr.achievement_id,
        'earnedAt', coalesce((select ua.earned_at from public.user_achievements ua where ua.user_id = v_user and ua.achievement_id = cr.achievement_id), cr.granted_at),
        'source', cr.source,
        'coins', cr.coins_granted,
        'items', to_jsonb(cr.items_granted),
        'newItems', to_jsonb(cr.items_new),
        'alreadyOwnedItems', to_jsonb(cr.items_already_owned),
        'balance', v_balance
      )
      order by (select d.display_order from public.achievement_definitions d where d.id = cr.achievement_id)
    ),
    '[]'::jsonb
  )
  into v_claimed
  from claimed_rewards cr;

  return v_claimed;
end;
$$;
revoke all on function public.claim_achievement_notifications() from public, anon;
grant execute on function public.claim_achievement_notifications() to authenticated;

-- Bump background reconciliation to version 2 so accounts reconcile rewards once in the background.
create or replace function public.reconcile_achievements()
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_version constant integer := 2;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('achievement-reconcile:' || v_user::text, 0));
  if exists (
    select 1 from public.achievement_reconciliations r
    where r.user_id = v_user and r.version >= v_version
  ) and not exists (
    select 1 from public.user_achievements ua
    where ua.user_id = v_user
      and not exists (
        select 1 from public.user_achievement_rewards uar
        where uar.user_id = v_user and uar.achievement_id = ua.achievement_id
      )
  ) then
    return false;
  end if;

  perform public._evaluate_user_achievements(v_user, true, true);
  insert into public.achievement_reconciliations (user_id, version)
    values (v_user, v_version)
    on conflict (user_id) do update set version = excluded.version, reconciled_at = now();
  return true;
end;
$$;
revoke all on function public.reconcile_achievements() from public, anon;
grant execute on function public.reconcile_achievements() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Idempotent, resumable historical backfill (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.backfill_achievement_rewards(p_limit integer default 500)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_version constant integer := 2;
  v_user uuid;
  v_granted jsonb;
  v_accounts_processed integer := 0;
  v_accounts_rewarded integer := 0;
  v_achievements_rewarded integer := 0;
  v_coins_granted integer := 0;
  v_cosmetics_granted integer := 0;
  v_remaining integer := 0;
  v_total_accounts integer := 0;
  v_total_achievements integer := 0;
  v_total_coins integer := 0;
  v_total_cosmetics integer := 0;
  v_item jsonb;
begin
  for v_user in
    select u.id
      from public.users u
     where not exists (
             select 1 from public.achievement_reconciliations r
              where r.user_id = u.id and r.version >= v_version
           )
        or exists (
             select 1 from public.user_achievements ua
              where ua.user_id = u.id
                and not exists (
                  select 1 from public.user_achievement_rewards uar
                   where uar.user_id = u.id and uar.achievement_id = ua.achievement_id
                )
           )
     order by u.created_at, u.id
     limit greatest(1, coalesce(p_limit, 500))
  loop
    v_accounts_processed := v_accounts_processed + 1;
    v_granted := public._evaluate_user_achievements(v_user, true, true);

    if jsonb_array_length(v_granted) > 0 then
      v_accounts_rewarded := v_accounts_rewarded + 1;
      v_achievements_rewarded := v_achievements_rewarded + jsonb_array_length(v_granted);
      for v_item in select value from jsonb_array_elements(v_granted) loop
        v_coins_granted := v_coins_granted + coalesce((v_item ->> 'coins')::integer, 0);
        v_cosmetics_granted := v_cosmetics_granted + coalesce(jsonb_array_length(v_item -> 'newItems'), 0);
      end loop;
    end if;

    insert into public.achievement_reconciliations (user_id, version)
      values (v_user, v_version)
      on conflict (user_id) do update set version = excluded.version, reconciled_at = now();
  end loop;

  select count(*)::integer into v_remaining
    from public.users u
   where not exists (
           select 1 from public.achievement_reconciliations r
            where r.user_id = u.id and r.version >= v_version
         )
      or exists (
           select 1 from public.user_achievements ua
            where ua.user_id = u.id
              and not exists (
                select 1 from public.user_achievement_rewards uar
                 where uar.user_id = u.id and uar.achievement_id = ua.achievement_id
              )
         );

  select
    count(distinct user_id)::integer,
    count(*)::integer,
    coalesce(sum(coins_granted), 0)::integer,
    coalesce(sum(cardinality(items_new)), 0)::integer
    into v_total_accounts, v_total_achievements, v_total_coins, v_total_cosmetics
    from public.user_achievement_rewards
   where source = 'backfill';

  return jsonb_build_object(
    'accountsProcessed', v_accounts_processed,
    'accountsRewarded', v_accounts_rewarded,
    'achievementsRewarded', v_achievements_rewarded,
    'coinsGranted', v_coins_granted,
    'cosmeticsGranted', v_cosmetics_granted,
    'remainingAccounts', v_remaining,
    'totalBackfilledAccounts', v_total_accounts,
    'totalBackfilledAchievements', v_total_achievements,
    'totalBackfilledCoins', v_total_coins,
    'totalBackfilledCosmetics', v_total_cosmetics
  );
end;
$$;
revoke all on function public.backfill_achievement_rewards(integer) from public, anon, authenticated;
grant execute on function public.backfill_achievement_rewards(integer) to service_role;

-- Run the backfill for existing accounts during migration application.
select public.backfill_achievement_rewards(1000);
