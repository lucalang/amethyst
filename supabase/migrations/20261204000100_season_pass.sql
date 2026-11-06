-- Season Pass and Quests.
--
-- * Seasons, their reward tracks and the quest pool are configuration rows (no client writes).
-- * Quest progress is never reported by the client: it is counted from finished arcade_runs that met
--   the game's coin minimums (paid, or unpaid only because of the daily coin limit). A replayed or
--   repeated finish can't count twice because each run is one row.
-- * Assignments, claims, season XP, Premium, tier skips and reward grants are written only by the
--   security-definer functions below, under a per-account advisory lock, with Coin movements in the
--   coin_transactions ledger (unique reference per grant or purchase).
-- * Earned rewards never expire: completed quests and reached tiers stay claimable after resets and
--   after the season ends. Premium and tier skips are on sale only while the season runs.

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------
create table public.seasons (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,31}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  xp_per_tier integer not null check (xp_per_tier > 0),
  premium_price integer not null check (premium_price > 0),
  -- Coins per skipped tier.
  skip_price integer not null check (skip_price > 0),
  daily_quests integer not null default 3 check (daily_quests between 0 and 10),
  weekly_quests integer not null default 3 check (weekly_quests between 0 and 10),
  check (ends_at > starts_at)
);

create table public.season_tiers (
  season_id text not null references public.seasons (id) on delete cascade,
  tier integer not null check (tier between 1 and 200),
  track text not null check (track in ('free', 'premium')),
  item_id text references public.cosmetic_items (id),
  coins integer not null default 0 check (coins >= 0),
  primary key (season_id, tier, track),
  unique (season_id, item_id),
  check (item_id is not null or coins > 0),
  -- Premium tiers are cosmetics only.
  check (track = 'free' or (item_id is not null and coins = 0))
);

create table public.season_quests (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,47}$'),
  cadence text not null check (cadence in ('daily', 'weekly', 'season')),
  -- Daily/weekly quests with no season are in every season's pool; seasonal quests name their season.
  season_id text references public.seasons (id) on delete cascade,
  -- runs: qualifying runs; score: qualifying runs scoring at least `threshold`;
  -- games: different games with a qualifying run; days: different UTC days with a qualifying run.
  kind text not null check (kind in ('runs', 'score', 'games', 'days')),
  game text check (game is null or game in ('2048', 'flutter', 'snake', 'sudoku', 'fruit-slice', 'stacker')),
  target integer not null check (target > 0),
  threshold integer check (threshold is null or threshold > 0),
  xp integer not null check (xp >= 0),
  coins integer not null check (coins >= 0),
  active boolean not null default true,
  check (cadence <> 'season' or season_id is not null),
  check ((kind = 'score') = (threshold is not null)),
  -- Sudoku "scores" are times, so score quests exclude it.
  check (kind <> 'score' or (game is not null and game <> 'sudoku'))
);

alter table public.seasons enable row level security;
alter table public.season_tiers enable row level security;
alter table public.season_quests enable row level security;
create policy read_seasons on public.seasons for select to authenticated using (true);
create policy read_tiers on public.season_tiers for select to authenticated using (true);
create policy read_quests on public.season_quests for select to authenticated using (true);
revoke all on public.seasons, public.season_tiers, public.season_quests from public, anon, authenticated;
grant select on public.seasons, public.season_tiers, public.season_quests to authenticated;
grant all on public.seasons, public.season_tiers, public.season_quests to service_role;

-- ---------------------------------------------------------------------------
-- Per-account state (owner read only)
-- ---------------------------------------------------------------------------
create table public.user_seasons (
  user_id uuid not null references public.users (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  skipped integer not null default 0 check (skipped >= 0),
  premium_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, season_id)
);

create table public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  quest_id text not null references public.season_quests (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  -- Final progress, stored once the period is over.
  progress integer,
  claimed_at timestamptz,
  -- Rewards actually granted at claim time.
  xp integer,
  coins integer,
  assigned_at timestamptz not null default now(),
  unique (user_id, quest_id, period_start)
);
create index user_quests_user_season on public.user_quests (user_id, season_id, period_end);

create table public.user_season_rewards (
  user_id uuid not null references public.users (id) on delete cascade,
  season_id text not null references public.seasons (id) on delete cascade,
  tier integer not null,
  track text not null check (track in ('free', 'premium')),
  item_id text references public.cosmetic_items (id),
  -- Coins credited: the tier's coins plus half the item's price when the item was already owned.
  coins integer not null default 0 check (coins >= 0),
  duplicate boolean not null default false,
  claimed_at timestamptz not null default now(),
  primary key (user_id, season_id, tier, track)
);

alter table public.user_seasons enable row level security;
alter table public.user_quests enable row level security;
alter table public.user_season_rewards enable row level security;
create policy owner_read on public.user_seasons for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_read on public.user_quests for select to authenticated using ((select auth.uid()) = user_id);
create policy owner_read on public.user_season_rewards for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_seasons, public.user_quests, public.user_season_rewards from public, anon, authenticated;
grant select on public.user_seasons, public.user_quests, public.user_season_rewards to authenticated;
grant all on public.user_seasons, public.user_quests, public.user_season_rewards to service_role;

create index arcade_runs_user_finished on public.arcade_runs (user_id, finished_at) where outcome in ('paid', 'unpaid');

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('reward', 'purchase', 'code', 'slots', 'achievement', 'streak', 'refund', 'season'));

-- ---------------------------------------------------------------------------
-- Season 1: 6 Nov 2026 – 11 Jan 2027 (UTC), 30 tiers of 1,200 XP.
-- Premium 2,500 Coins (several weeks of ordinary play), skips 150 Coins per tier.
-- ---------------------------------------------------------------------------
insert into public.seasons (id, starts_at, ends_at, xp_per_tier, premium_price, skip_price, daily_quests, weekly_quests)
values ('season-1', '2026-11-06 00:00:00+00', '2027-01-11 00:00:00+00', 1200, 2500, 150, 3, 3);

insert into public.season_tiers (season_id, tier, track, item_id, coins)
select 'season-1', t.tier, 'free', f.item, case when f.item is null then 30 else 0 end
  from generate_series(1, 30) as t(tier)
  left join (values (1, 'laurel-wreath'), (5, 'banner-tidepool'), (10, 'pixel-quest'), (15, 'orbit-ring'),
                    (20, 'banner-verdant'), (25, 'neon-marquee'), (30, 'gem-crown')) as f(tier, item) on f.tier = t.tier;

insert into public.season_tiers (season_id, tier, track, item_id) values
  ('season-1', 1, 'premium', 'flutter-sparkles'),
  ('season-1', 2, 'premium', 'g2048-sparkle'),
  ('season-1', 3, 'premium', 'snake-galaxy'),
  ('season-1', 4, 'premium', 'sudoku-midnight'),
  ('season-1', 5, 'premium', 'fruit-starlight'),
  ('season-1', 6, 'premium', 'stacker-aurora'),
  ('season-1', 7, 'premium', 'banner-rosewood'),
  ('season-1', 8, 'premium', 'flutter-comet'),
  ('season-1', 9, 'premium', 'g2048-gemstone'),
  ('season-1', 10, 'premium', 'profile-frame-deco'),
  ('season-1', 11, 'premium', 'snake-stardust'),
  ('season-1', 12, 'premium', 'fruit-cosmic'),
  ('season-1', 13, 'premium', 'stacker-night'),
  ('season-1', 14, 'premium', 'koi-rail'),
  ('season-1', 15, 'premium', 'banner-nocturne'),
  ('season-1', 16, 'premium', 'flutter-night'),
  ('season-1', 17, 'premium', 'sudoku-chalkboard'),
  ('season-1', 18, 'premium', 'snake-pixel'),
  ('season-1', 19, 'premium', 'frost-glam'),
  ('season-1', 20, 'premium', 'profile-frame-filigree'),
  ('season-1', 21, 'premium', 'g2048-retro'),
  ('season-1', 22, 'premium', 'fruit-cartoon'),
  ('season-1', 23, 'premium', 'lavender-north'),
  ('season-1', 24, 'premium', 'banner-aurum'),
  ('season-1', 25, 'premium', 'snake-neon'),
  ('season-1', 26, 'premium', 'g2048-glass'),
  ('season-1', 27, 'premium', 'profile-frame-runic'),
  ('season-1', 28, 'premium', 'moonshot'),
  ('season-1', 29, 'premium', 'stained-prelude'),
  ('season-1', 30, 'premium', 'afterimage');

-- Score targets sit around the median (daily) and upper quartile (weekly) of real finished runs.
insert into public.season_quests (id, cadence, season_id, kind, game, target, threshold, xp, coins) values
  ('daily-runs-3',      'daily',  null, 'runs',  null,          3,  null,  150, 10),
  ('daily-runs-6',      'daily',  null, 'runs',  null,          6,  null,  250, 15),
  ('daily-games-2',     'daily',  null, 'games', null,          2,  null,  200, 10),
  ('daily-sudoku-1',    'daily',  null, 'runs',  'sudoku',      1,  null,  250, 15),
  ('daily-2048',        'daily',  null, 'score', '2048',        1,  2500,  200, 15),
  ('daily-flutter',     'daily',  null, 'score', 'flutter',     1,  10,    200, 15),
  ('daily-snake',       'daily',  null, 'score', 'snake',       1,  20,    200, 15),
  ('daily-fruit',       'daily',  null, 'score', 'fruit-slice', 1,  40,    200, 15),
  ('daily-stacker',     'daily',  null, 'score', 'stacker',     1,  30,    200, 15),
  ('weekly-runs-20',    'weekly', null, 'runs',  null,          20, null,  1000, 60),
  ('weekly-games-4',    'weekly', null, 'games', null,          4,  null,  900, 60),
  ('weekly-days-4',     'weekly', null, 'days',  null,          4,  null,  900, 60),
  ('weekly-sudoku-3',   'weekly', null, 'runs',  'sudoku',      3,  null,  1000, 70),
  ('weekly-2048',       'weekly', null, 'score', '2048',        1,  8000,  800, 50),
  ('weekly-flutter',    'weekly', null, 'score', 'flutter',     1,  25,    800, 50),
  ('weekly-snake',      'weekly', null, 'score', 'snake',       1,  35,    800, 50),
  ('weekly-fruit',      'weekly', null, 'score', 'fruit-slice', 1,  80,    800, 50),
  ('weekly-stacker',    'weekly', null, 'score', 'stacker',     1,  45,    800, 50),
  ('s1-runs-150',       'season', 'season-1', 'runs',  null,     150, null,  4000, 200),
  ('s1-days-30',        'season', 'season-1', 'days',  null,     30,  null,  4000, 200),
  ('s1-games-6',        'season', 'season-1', 'games', null,     6,   null,  2000, 100),
  ('s1-sudoku-15',      'season', 'season-1', 'runs',  'sudoku', 15,  null,  3000, 150),
  ('s1-2048-20000',     'season', 'season-1', 'score', '2048',   1,   20000, 2500, 150);

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- A quest's verified progress over [p_from, p_to), capped at its target.
create function public._quest_progress(p_user uuid, p_quest text, p_from timestamptz, p_to timestamptz)
returns integer
language sql stable security definer set search_path = '' as $$
  select least(q.target, coalesce((
    select case q.kind
             when 'runs' then count(*)
             when 'score' then count(*) filter (where r.score >= q.threshold)
             when 'games' then count(distinct r.game)
             when 'days' then count(distinct (r.finished_at at time zone 'UTC')::date)
           end
      from public.arcade_runs r
     where r.user_id = p_user
       and r.outcome in ('paid', 'unpaid')
       and (r.outcome = 'paid' or r.note = 'daily_limit')
       and r.finished_at >= p_from and r.finished_at < least(p_to, now())
       and (q.game is null or r.game = q.game)), 0))::integer
    from public.season_quests q where q.id = p_quest;
$$;
revoke all on function public._quest_progress(uuid, text, timestamptz, timestamptz) from public, anon, authenticated;

-- Reached tier: XP tiers plus skipped tiers, capped at the season's last tier.
create function public._season_tier(p_user uuid, p_season text)
returns integer
language sql stable security definer set search_path = '' as $$
  select least(
    coalesce((select max(t.tier) from public.season_tiers t where t.season_id = s.id), 0),
    coalesce(floor(us.xp::numeric / s.xp_per_tier)::integer + us.skipped, 0))
    from public.seasons s
    left join public.user_seasons us on us.user_id = p_user and us.season_id = s.id
   where s.id = p_season;
$$;
revoke all on function public._season_tier(uuid, text) from public, anon, authenticated;

-- Assigns one period's quests from a pool once; the pick is a stable shuffle per account and period.
create function public._season_assign_pool(p_user uuid, p_season text, p_cadence text, p_start timestamptz, p_end timestamptz, p_count integer)
returns void
language sql security definer set search_path = '' as $$
  insert into public.user_quests (user_id, season_id, quest_id, period_start, period_end)
  select p_user, p_season, q.id, p_start, p_end
    from public.season_quests q
   where q.cadence = p_cadence and q.active and (q.season_id is null or q.season_id = p_season)
     -- A shortened first or last week only offers day-count quests that still fit.
     and (q.kind <> 'days' or q.target <= ceil(extract(epoch from p_end - p_start) / 86400))
     and not exists (
       select 1 from public.user_quests u join public.season_quests uq on uq.id = u.quest_id
        where u.user_id = p_user and u.period_start = p_start and uq.cadence = p_cadence)
   order by md5(p_user::text || ':' || extract(epoch from p_start)::bigint::text || ':' || q.id)
   limit greatest(p_count, 0)
  on conflict (user_id, quest_id, period_start) do nothing;
$$;
revoke all on function public._season_assign_pool(uuid, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;

-- Today's, this week's and the season's quests for a running season. Periods are clipped to the season.
create function public._season_assign(p_user uuid, p_season text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.seasons;
  v_day timestamptz := date_trunc('day', now(), 'UTC');
  v_week timestamptz := date_trunc('week', now(), 'UTC');
begin
  select * into s from public.seasons where id = p_season;
  if not found or now() < s.starts_at or now() >= s.ends_at then
    return;
  end if;
  perform public._season_assign_pool(p_user, s.id, 'daily', greatest(v_day, s.starts_at), least(v_day + interval '1 day', s.ends_at), s.daily_quests);
  perform public._season_assign_pool(p_user, s.id, 'weekly', greatest(v_week, s.starts_at), least(v_week + interval '7 days', s.ends_at), s.weekly_quests);
  insert into public.user_quests (user_id, season_id, quest_id, period_start, period_end)
  select p_user, s.id, q.id, s.starts_at, s.ends_at
    from public.season_quests q
   where q.cadence = 'season' and q.season_id = s.id and q.active
  on conflict (user_id, quest_id, period_start) do nothing;
end;
$$;
revoke all on function public._season_assign(uuid, text) from public, anon, authenticated;

-- Stores the final progress of finished, unclaimed periods.
create function public._season_freeze(p_user uuid)
returns void
language sql security definer set search_path = '' as $$
  update public.user_quests u
     set progress = public._quest_progress(u.user_id, u.quest_id, u.period_start, u.period_end)
   where u.user_id = p_user and u.claimed_at is null and u.progress is null and u.period_end <= now();
$$;
revoke all on function public._season_freeze(uuid) from public, anon, authenticated;

-- Rewards and completed quests the account can still claim in a season.
create function public._season_claimable(p_user uuid, p_season text)
returns integer
language sql stable security definer set search_path = '' as $$
  select (
    select count(*)::integer
      from public.season_tiers t
      left join public.user_seasons us on us.user_id = p_user and us.season_id = t.season_id
     where t.season_id = p_season
       and t.tier <= public._season_tier(p_user, p_season)
       and (t.track = 'free' or us.premium_at is not null)
       and not exists (select 1 from public.user_season_rewards r
                        where r.user_id = p_user and r.season_id = t.season_id and r.tier = t.tier and r.track = t.track)
  ) + (
    select count(*)::integer
      from public.user_quests u join public.season_quests q on q.id = u.quest_id
     where u.user_id = p_user and u.season_id = p_season and u.claimed_at is null and u.progress >= q.target
  );
$$;
revoke all on function public._season_claimable(uuid, text) from public, anon, authenticated;

-- Credits season Coins once per reference (outside the daily game-reward limit). Returns the balance.
create function public._season_credit(p_user uuid, p_amount integer, p_reference text, p_details jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;
  if p_amount <= 0 or exists (select 1 from public.coin_transactions where user_id = p_user and reference = p_reference) then
    return v_balance;
  end if;
  update public.coin_wallets
     set balance = balance + p_amount, earned = earned + p_amount, updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (p_user, p_amount, v_balance, 'season', p_reference, coalesce(p_details, '{}'::jsonb));
  return v_balance;
end;
$$;
revoke all on function public._season_credit(uuid, integer, text, jsonb) from public, anon, authenticated;

-- Charges Coins for a season purchase; fails without enough Coins. Returns the balance.
create function public._season_charge(p_user uuid, p_amount integer, p_reference text, p_details jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;
  if v_balance < p_amount then
    raise exception 'Not enough coins for that yet.' using errcode = 'P0001', hint = 'insufficient_funds';
  end if;
  update public.coin_wallets
     set balance = balance - p_amount, spent = spent + p_amount, updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (p_user, -p_amount, v_balance, 'season', p_reference, coalesce(p_details, '{}'::jsonb));
  return v_balance;
end;
$$;
revoke all on function public._season_charge(uuid, integer, text, jsonb) from public, anon, authenticated;

create function public._season_lock(p_user uuid)
returns void
language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('season:' || p_user::text, 0));
$$;
revoke all on function public._season_lock(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------

-- The account's view of a season (the running or most recent one by default). Assigns the current
-- quests on first view of a period, so every device sees the same ones.
create function public.season_state(p_season text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  s public.seasons;
  us public.user_seasons;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  perform public._season_lock(v_user);

  if p_season is not null then
    select * into s from public.seasons where id = p_season and starts_at <= now();
  end if;
  if s.id is null then
    select * into s from public.seasons where starts_at <= now() order by starts_at desc limit 1;
  end if;
  if s.id is null then
    return jsonb_build_object('now', now(), 'balance', public._wallet_balance(v_user), 'season', null);
  end if;

  perform public._season_assign(v_user, s.id);
  perform public._season_freeze(v_user);
  select * into us from public.user_seasons where user_id = v_user and season_id = s.id;

  return jsonb_build_object(
    'now', now(),
    'balance', public._wallet_balance(v_user),
    'season', jsonb_build_object(
      'id', s.id, 'startsAt', s.starts_at, 'endsAt', s.ends_at, 'xpPerTier', s.xp_per_tier,
      'premiumPrice', s.premium_price, 'skipPrice', s.skip_price, 'active', now() < s.ends_at,
      'tierCount', coalesce((select max(tier) from public.season_tiers where season_id = s.id), 0)),
    'progress', jsonb_build_object(
      'xp', coalesce(us.xp, 0), 'skipped', coalesce(us.skipped, 0), 'tier', public._season_tier(v_user, s.id),
      'premium', us.premium_at is not null),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tier', t.tier, 'track', t.track, 'item', t.item_id, 'kind', c.kind, 'rarity', c.rarity, 'coins', t.coins,
        'owned', uc.item_id is not null, 'claimed', r.tier is not null, 'duplicate', coalesce(r.duplicate, false),
        'paid', coalesce(r.coins, 0)) order by t.tier, t.track)
        from public.season_tiers t
        left join public.cosmetic_items c on c.id = t.item_id
        left join public.user_cosmetics uc on uc.user_id = v_user and uc.item_id = t.item_id
        left join public.user_season_rewards r on r.user_id = v_user and r.season_id = t.season_id and r.tier = t.tier and r.track = t.track
       where t.season_id = s.id), '[]'::jsonb),
    'quests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'quest', q.id, 'cadence', q.cadence, 'kind', q.kind, 'game', q.game, 'target', q.target,
        'threshold', q.threshold, 'xp', coalesce(u.xp, q.xp), 'coins', coalesce(u.coins, q.coins),
        'progress', case when u.claimed_at is not null then q.target
                         else coalesce(u.progress, public._quest_progress(v_user, q.id, u.period_start, u.period_end)) end,
        'periodStart', u.period_start, 'periodEnd', u.period_end, 'claimedAt', u.claimed_at)
        order by array_position(array['daily', 'weekly', 'season'], q.cadence), u.period_start, q.xp, q.id)
        from public.user_quests u join public.season_quests q on q.id = u.quest_id
       where u.user_id = v_user and u.season_id = s.id
         and (u.period_end > now() or (u.claimed_at is null and u.progress >= q.target))), '[]'::jsonb),
    'otherSeasons', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'claimable', o.claimable) order by o.starts_at desc)
        from (select x.id, x.starts_at, public._season_claimable(v_user, x.id) as claimable
                from public.seasons x
               where x.id <> s.id and x.starts_at <= now()
                 and exists (select 1 from public.user_seasons y where y.user_id = v_user and y.season_id = x.id)) o
       where o.claimable > 0), '[]'::jsonb));
end;
$$;
revoke all on function public.season_state(text) from public, anon;
grant execute on function public.season_state(text) to authenticated;

-- Claims a completed quest once: adds its XP to the quest's season and credits its Coins.
create function public.claim_season_quest(p_assignment uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  u public.user_quests;
  q public.season_quests;
  v_progress integer;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  perform public._season_lock(v_user);
  select * into u from public.user_quests where id = p_assignment and user_id = v_user for update;
  if not found then
    raise exception 'That quest was not found.' using errcode = 'P0002', hint = 'quest_not_found';
  end if;
  if u.claimed_at is not null then
    return jsonb_build_object('status', 'repeat', 'xp', u.xp, 'coins', u.coins, 'balance', public._wallet_balance(v_user));
  end if;
  select * into q from public.season_quests where id = u.quest_id;
  v_progress := coalesce(u.progress, public._quest_progress(v_user, q.id, u.period_start, u.period_end));
  if v_progress < q.target then
    raise exception 'This quest isn''t complete yet.' using errcode = 'P0001', hint = 'quest_incomplete';
  end if;

  update public.user_quests
     set claimed_at = now(), xp = q.xp, coins = q.coins, progress = v_progress
   where id = u.id;
  insert into public.user_seasons (user_id, season_id, xp) values (v_user, u.season_id, q.xp)
  on conflict (user_id, season_id) do update set xp = public.user_seasons.xp + excluded.xp, updated_at = now();
  v_balance := public._season_credit(v_user, q.coins, 'quest:' || u.id::text,
    jsonb_build_object('season', u.season_id, 'quest', q.id, 'xp', q.xp));

  return jsonb_build_object('status', 'claimed', 'xp', q.xp, 'coins', q.coins, 'balance', v_balance);
end;
$$;
revoke all on function public.claim_season_quest(uuid) from public, anon;
grant execute on function public.claim_season_quest(uuid) to authenticated;

-- Claims every reached, unclaimed tier reward (Premium ones too once Premium is owned). Items already
-- owned pay half their shop price in Coins instead.
create function public.claim_season_rewards(p_season text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_premium boolean;
  v_tier integer;
  v_claimed integer;
  v_items integer;
  v_coins integer;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  perform public._season_lock(v_user);
  if not exists (select 1 from public.seasons where id = p_season and starts_at <= now()) then
    raise exception 'That season isn''t available.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  v_premium := exists (select 1 from public.user_seasons where user_id = v_user and season_id = p_season and premium_at is not null);
  v_tier := public._season_tier(v_user, p_season);

  insert into public.user_season_rewards (user_id, season_id, tier, track, item_id, coins, duplicate)
  select v_user, t.season_id, t.tier, t.track, t.item_id,
         t.coins + case when uc.item_id is not null then coalesce(c.price, 0) / 2 else 0 end,
         uc.item_id is not null
    from public.season_tiers t
    left join public.cosmetic_items c on c.id = t.item_id
    left join public.user_cosmetics uc on uc.user_id = v_user and uc.item_id = t.item_id
   where t.season_id = p_season and t.tier <= v_tier and (t.track = 'free' or v_premium)
  on conflict (user_id, season_id, tier, track) do nothing;

  -- Rows inserted by this transaction share its now().
  select count(*), count(*) filter (where item_id is not null and not duplicate), coalesce(sum(coins), 0)
    into v_claimed, v_items, v_coins
    from public.user_season_rewards
   where user_id = v_user and season_id = p_season and claimed_at = now();

  insert into public.user_cosmetics (user_id, item_id)
  select v_user, r.item_id from public.user_season_rewards r
   where r.user_id = v_user and r.season_id = p_season and r.claimed_at = now() and r.item_id is not null and not r.duplicate
  on conflict (user_id, item_id) do nothing;

  v_balance := public._season_credit(v_user, v_coins, 'season-rewards:' || p_season || ':' || gen_random_uuid()::text,
    jsonb_build_object('season', p_season, 'rewards', v_claimed));

  return jsonb_build_object('claimed', v_claimed, 'items', v_items, 'coins', v_coins, 'balance', v_balance);
end;
$$;
revoke all on function public.claim_season_rewards(text) from public, anon;
grant execute on function public.claim_season_rewards(text) to authenticated;

-- Buys the Premium Pass for a running season at the price the buyer saw. Owning it already is a no-op.
create function public.buy_season_premium(p_season text, p_expected_price integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  s public.seasons;
  us public.user_seasons;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  perform public._season_lock(v_user);
  select * into s from public.seasons where id = p_season;
  if not found then
    raise exception 'That season isn''t available.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  insert into public.user_seasons (user_id, season_id) values (v_user, s.id) on conflict (user_id, season_id) do nothing;
  select * into us from public.user_seasons where user_id = v_user and season_id = s.id for update;
  if us.premium_at is not null then
    return jsonb_build_object('status', 'owned', 'balance', public._wallet_balance(v_user));
  end if;
  if now() < s.starts_at or now() >= s.ends_at then
    raise exception 'This season has ended, so the Premium Pass is no longer on sale.' using errcode = 'P0001', hint = 'season_closed';
  end if;
  if p_expected_price is distinct from s.premium_price then
    raise exception 'The price changed. Check the new price and try again.' using errcode = 'P0001', hint = 'price_changed';
  end if;

  v_balance := public._season_charge(v_user, s.premium_price, 'season-premium:' || s.id,
    jsonb_build_object('season', s.id, 'price', s.premium_price));
  update public.user_seasons set premium_at = now(), updated_at = now() where user_id = v_user and season_id = s.id;
  return jsonb_build_object('status', 'purchased', 'balance', v_balance);
end;
$$;
revoke all on function public.buy_season_premium(text, integer) from public, anon;
grant execute on function public.buy_season_premium(text, integer) to authenticated;

-- Skips tiers in a running season. p_request makes retries safe: a repeated id is never charged again.
create function public.skip_season_tiers(p_request uuid, p_season text, p_tiers integer, p_expected_cost integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ref text := 'season-skip:' || p_request::text;
  s public.seasons;
  v_existing public.coin_transactions;
  v_left integer;
  v_cost integer;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_request is null or p_tiers is null or p_tiers < 1 or p_tiers > 200 then
    raise exception 'Choose how many tiers to skip.' using errcode = '22023';
  end if;
  perform public._season_lock(v_user);

  select * into v_existing from public.coin_transactions where user_id = v_user and reference = v_ref;
  if found then
    return jsonb_build_object('status', 'repeat', 'tiers', (v_existing.details ->> 'tiers')::integer,
      'tier', public._season_tier(v_user, v_existing.details ->> 'season'), 'balance', public._wallet_balance(v_user));
  end if;

  select * into s from public.seasons where id = p_season;
  if not found then
    raise exception 'That season isn''t available.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  if now() < s.starts_at or now() >= s.ends_at then
    raise exception 'This season has ended, so tiers can no longer be skipped.' using errcode = 'P0001', hint = 'season_closed';
  end if;
  insert into public.user_seasons (user_id, season_id) values (v_user, s.id) on conflict (user_id, season_id) do nothing;
  perform 1 from public.user_seasons where user_id = v_user and season_id = s.id for update;

  v_left := coalesce((select max(tier) from public.season_tiers where season_id = s.id), 0) - public._season_tier(v_user, s.id);
  if p_tiers > v_left then
    raise exception 'That would go past the last tier. You can skip up to % more.', greatest(v_left, 0)
      using errcode = 'P0001', hint = 'too_many_tiers';
  end if;
  v_cost := p_tiers * s.skip_price;
  if p_expected_cost is distinct from v_cost then
    raise exception 'The price changed. Check the new price and try again.' using errcode = 'P0001', hint = 'price_changed';
  end if;

  v_balance := public._season_charge(v_user, v_cost, v_ref,
    jsonb_build_object('season', s.id, 'tiers', p_tiers, 'price', s.skip_price));
  update public.user_seasons set skipped = skipped + p_tiers, updated_at = now() where user_id = v_user and season_id = s.id;
  return jsonb_build_object('status', 'skipped', 'tiers', p_tiers, 'tier', public._season_tier(v_user, s.id), 'balance', v_balance);
end;
$$;
revoke all on function public.skip_season_tiers(uuid, text, integer, integer) from public, anon;
grant execute on function public.skip_season_tiers(uuid, text, integer, integer) to authenticated;

notify pgrst, 'reload schema';
