-- Arcade coins and the cosmetic shop.
--
-- * Runs are started and finished on the server, which times them, checks them for plausibility
--   and decides the payout from arcade_reward_rules. Each run (and each Sudoku puzzle) pays once.
-- * Wallets, transactions and ownership are readable by their owner only and writable only through
--   the security-definer functions below; nothing here trusts amounts or prices from the client.
-- * Shop cosmetics can only be equipped when owned, enforced by triggers (users and entries are
--   otherwise directly writable by their owners).
-- No earnings are granted for play before this migration.

-- ---------------------------------------------------------------------------
-- Reward rules (one row per game, Sudoku per difficulty)
-- ---------------------------------------------------------------------------
create table public.arcade_reward_rules (
  game text not null,
  variant text not null default '',
  -- Runs below either minimum finish without coins.
  min_score integer not null default 0 check (min_score >= 0),
  min_seconds integer not null default 0 check (min_seconds >= 0),
  -- Coins = flat_coins + floor(score / points_per_coin) (0 = no per-point part), capped at max_coins.
  points_per_coin numeric not null default 0 check (points_per_coin >= 0),
  flat_coins integer not null default 0 check (flat_coins >= 0),
  max_coins integer not null check (max_coins > 0),
  -- Plausibility: score <= max_score_per_second * seconds + score_allowance, and <= max_score.
  max_score_per_second numeric not null check (max_score_per_second > 0),
  score_allowance integer not null default 0 check (score_allowance >= 0),
  max_score integer not null check (max_score > 0),
  primary key (game, variant)
);

insert into public.arcade_reward_rules
  (game, variant, min_score, min_seconds, points_per_coin, flat_coins, max_coins, max_score_per_second, score_allowance, max_score)
values
  ('2048',        '',       256,  20, 400, 0, 50, 200, 2000, 4000000),
  ('flutter',     '',         3,   5,   2, 0, 30, 0.8,    2,  100000),
  ('snake',       '',         3,  10, 1.5, 0, 40, 2.5,    3,     397),
  ('fruit-slice', '',        10,  15,   4, 0, 30,   5,   10,  100000),
  ('stacker',     '',         5,   8,   2, 0, 30,   3,    3,  100000),
  ('sudoku',      'easy',     0, 150,   0, 20, 20,   1,    0, 2000000000),
  ('sudoku',      'medium',   0, 240,   0, 35, 35,   1,    0, 2000000000),
  ('sudoku',      'hard',     0, 360,   0, 60, 60,   1,    0, 2000000000);

alter table public.arcade_reward_rules enable row level security;
create policy read_rules on public.arcade_reward_rules for select to authenticated using (true);
revoke all on public.arcade_reward_rules from public, anon, authenticated;
grant select on public.arcade_reward_rules to authenticated;
grant all on public.arcade_reward_rules to service_role;

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------
create table public.arcade_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  game text not null,
  variant text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  score integer,
  metrics jsonb,
  coins integer not null default 0 check (coins >= 0),
  outcome text not null default 'started' check (outcome in ('started', 'paid', 'unpaid', 'rejected', 'expired')),
  note text,
  foreign key (game, variant) references public.arcade_reward_rules (game, variant)
);
create index arcade_runs_user_started on public.arcade_runs (user_id, started_at desc);

alter table public.arcade_runs enable row level security;
create policy owner_read on public.arcade_runs for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.arcade_runs from public, anon, authenticated;
grant select on public.arcade_runs to authenticated;
grant all on public.arcade_runs to service_role;

-- ---------------------------------------------------------------------------
-- Wallets and the transaction ledger
-- ---------------------------------------------------------------------------
create table public.coin_wallets (
  user_id uuid primary key references public.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  earned integer not null default 0 check (earned >= 0),
  spent integer not null default 0 check (spent >= 0),
  updated_at timestamptz not null default now()
);

alter table public.coin_wallets enable row level security;
create policy owner_read on public.coin_wallets for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.coin_wallets from public, anon, authenticated;
grant select on public.coin_wallets to authenticated;
grant all on public.coin_wallets to service_role;

create table public.coin_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  kind text not null check (kind in ('reward', 'purchase')),
  -- 'run:<uuid>' for rewards, 'item:<id>' for purchases: one transaction per reference.
  reference text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, reference)
);
create index coin_transactions_user_created on public.coin_transactions (user_id, created_at desc);

alter table public.coin_transactions enable row level security;
create policy owner_read on public.coin_transactions for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.coin_transactions from public, anon, authenticated;
grant select on public.coin_transactions to authenticated;
grant all on public.coin_transactions to service_role;

-- ---------------------------------------------------------------------------
-- Cosmetic catalogue and ownership
-- ---------------------------------------------------------------------------
create table public.cosmetic_items (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{0,31}$'),
  kind text not null check (kind in ('frame', 'avatar_decoration')),
  price integer not null check (price > 0),
  available boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.cosmetic_items (id, kind, price) values
  ('pixel-quest', 'frame', 150),
  ('neon-marquee', 'frame', 250),
  ('constellation', 'frame', 350),
  ('laurel-wreath', 'avatar_decoration', 120),
  ('orbit-ring', 'avatar_decoration', 200),
  ('gem-crown', 'avatar_decoration', 300);

alter table public.cosmetic_items enable row level security;
create policy read_items on public.cosmetic_items for select to authenticated using (true);
revoke all on public.cosmetic_items from public, anon, authenticated;
grant select on public.cosmetic_items to authenticated;
grant all on public.cosmetic_items to service_role;

create table public.user_cosmetics (
  user_id uuid not null references public.users (id) on delete cascade,
  item_id text not null references public.cosmetic_items (id),
  acquired_at timestamptz not null default now(),
  transaction_id bigint references public.coin_transactions (id),
  primary key (user_id, item_id)
);

alter table public.user_cosmetics enable row level security;
create policy owner_read on public.user_cosmetics for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.user_cosmetics from public, anon, authenticated;
grant select on public.user_cosmetics to authenticated;
grant all on public.user_cosmetics to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Credits a reward once per reference, within the rolling 24-hour limit. Returns {coins, balance, capped}.
create function public._credit_coins(p_user uuid, p_amount integer, p_reference text, p_details jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  daily_limit constant integer := 600;
  v_balance integer;
  v_existing public.coin_transactions;
  v_recent integer;
  v_amount integer;
begin
  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;

  select * into v_existing from public.coin_transactions where user_id = p_user and reference = p_reference;
  if found then
    return jsonb_build_object('coins', v_existing.amount, 'balance', v_balance, 'capped', false);
  end if;

  select coalesce(sum(amount), 0)::integer into v_recent
    from public.coin_transactions
   where user_id = p_user and kind = 'reward' and created_at > now() - interval '24 hours';
  v_amount := least(greatest(p_amount, 0), greatest(0, daily_limit - v_recent));
  if v_amount <= 0 then
    return jsonb_build_object('coins', 0, 'balance', v_balance, 'capped', p_amount > 0);
  end if;

  update public.coin_wallets
     set balance = balance + v_amount, earned = earned + v_amount, updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (p_user, v_amount, v_balance, 'reward', p_reference, coalesce(p_details, '{}'::jsonb));
  return jsonb_build_object('coins', v_amount, 'balance', v_balance, 'capped', v_amount < p_amount);
end;
$$;
revoke all on function public._credit_coins(uuid, integer, text, jsonb) from public, anon, authenticated;

-- An integer metric from a run's metrics object, or null.
create function public._run_metric(p_metrics jsonb, p_key text)
returns numeric
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_metrics -> p_key) = 'number' then (p_metrics ->> p_key)::numeric end;
$$;
revoke all on function public._run_metric(jsonb, text) from public, anon, authenticated;

-- Game-specific consistency between the score and the run's metrics. Games without a check pass.
create function public._arcade_run_plausible(p_game text, p_score integer, p_metrics jsonb)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  a numeric;
  b numeric;
begin
  if p_game = '2048' then
    a := public._run_metric(p_metrics, 'maxTile');
    if a is null or a < 2 or a > 131072 or a <> trunc(a) then return false; end if;
    if (a::bigint & (a::bigint - 1)) <> 0 then return false; end if;
    -- Every point comes from a merge; a board's merges can't outscore its tiles by more than this.
    return p_score <= (ln(a) / ln(2) - 1) * a * 4 + 64;
  elsif p_game = 'flutter' then
    a := public._run_metric(p_metrics, 'obstacles');
    return a is null or a = p_score;
  elsif p_game = 'snake' then
    a := public._run_metric(p_metrics, 'length');
    return a is not null and a = p_score + 3;
  elsif p_game = 'fruit-slice' then
    a := public._run_metric(p_metrics, 'fruitsSliced');
    b := coalesce(public._run_metric(p_metrics, 'maxCombo'), 0);
    -- One point per fruit plus combo bonuses (at most one more point per fruit).
    return a is not null and a <= p_score and p_score <= a * 2 and b >= 0 and b <= a;
  elsif p_game = 'stacker' then
    a := public._run_metric(p_metrics, 'height');
    b := coalesce(public._run_metric(p_metrics, 'perfectStreak'), 0);
    return a is not null and a = p_score and b >= 0 and b <= a;
  end if;
  return true;
end;
$$;
revoke all on function public._arcade_run_plausible(text, integer, jsonb) from public, anon, authenticated;

create function public._wallet_balance(p_user uuid)
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select balance from public.coin_wallets where user_id = p_user), 0);
$$;
revoke all on function public._wallet_balance(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Run lifecycle
-- ---------------------------------------------------------------------------

-- Starts a timed run for a score game. Rate limited per account.
create function public.start_arcade_run(p_game text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_game = 'sudoku' or not exists (select 1 from public.arcade_reward_rules where game = p_game and variant = '') then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('arcade_runs:' || v_user::text, 0));

  -- Abandoned runs (never finished) expire; old expired rows are pruned.
  update public.arcade_runs
     set outcome = 'expired', finished_at = now()
   where user_id = v_user and outcome = 'started' and started_at < now() - interval '6 hours';
  delete from public.arcade_runs
   where user_id = v_user and outcome = 'expired' and started_at < now() - interval '30 days';

  if (select count(*) from public.arcade_runs where user_id = v_user and game <> 'sudoku' and started_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.arcade_runs where user_id = v_user and game <> 'sudoku' and started_at > now() - interval '1 hour') >= 300 then
    raise exception 'Lots of runs in a short time, so coins are paused for a moment. Your games and records still work.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  insert into public.arcade_runs (user_id, game) values (v_user, p_game) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.start_arcade_run(text) from public, anon;
grant execute on function public.start_arcade_run(text) to authenticated;

-- Finishes a run once; repeating the call returns the stored result. Returns
-- {status, coins, balance, reason, minScore, minSeconds}.
create function public.finish_arcade_run(p_run uuid, p_score integer, p_metrics jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  r public.arcade_runs;
  rule public.arcade_reward_rules;
  v_seconds numeric;
  v_score integer := greatest(coalesce(p_score, 0), 0);
  v_metrics jsonb := case when jsonb_typeof(p_metrics) = 'object' and pg_column_size(p_metrics) <= 2048 then p_metrics else '{}'::jsonb end;
  v_outcome text;
  v_note text;
  v_coins integer := 0;
  v_credit jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  select * into r from public.arcade_runs where id = p_run and user_id = v_user and game <> 'sudoku' for update;
  if not found then
    raise exception 'That run was not found.' using errcode = 'P0002', hint = 'run_not_found';
  end if;
  select * into rule from public.arcade_reward_rules where game = r.game and variant = r.variant;

  if r.outcome <> 'started' then
    return jsonb_build_object('status', r.outcome, 'coins', r.coins, 'balance', public._wallet_balance(v_user), 'reason', r.note,
      'minScore', rule.min_score, 'minSeconds', rule.min_seconds);
  end if;

  v_seconds := extract(epoch from now() - r.started_at);
  if v_seconds > 6 * 3600 then
    v_outcome := 'expired';
  elsif v_score > rule.max_score
     or v_score > rule.max_score_per_second * v_seconds + rule.score_allowance
     or not public._arcade_run_plausible(r.game, v_score, v_metrics) then
    v_outcome := 'rejected';
    v_note := 'implausible';
  elsif v_score < rule.min_score or v_score = 0 then
    v_outcome := 'unpaid';
    v_note := 'below_minimum';
  elsif v_seconds < rule.min_seconds then
    v_outcome := 'unpaid';
    v_note := 'too_short';
  else
    v_coins := least(rule.max_coins, rule.flat_coins + case when rule.points_per_coin > 0 then floor(v_score / rule.points_per_coin)::integer else 0 end);
    if v_coins <= 0 then
      v_outcome := 'unpaid';
      v_note := 'below_minimum';
    else
      v_credit := public._credit_coins(v_user, v_coins, 'run:' || r.id::text,
        jsonb_build_object('game', r.game, 'score', v_score, 'seconds', round(v_seconds)));
      v_coins := (v_credit ->> 'coins')::integer;
      v_outcome := case when v_coins > 0 then 'paid' else 'unpaid' end;
      v_note := case when (v_credit ->> 'capped')::boolean then 'daily_limit' end;
    end if;
  end if;

  update public.arcade_runs
     set finished_at = now(), score = v_score, metrics = v_metrics, coins = v_coins, outcome = v_outcome, note = v_note
   where id = r.id;

  return jsonb_build_object('status', v_outcome, 'coins', v_coins, 'balance', public._wallet_balance(v_user), 'reason', v_note,
    'minScore', rule.min_score, 'minSeconds', rule.min_seconds);
end;
$$;
revoke all on function public.finish_arcade_run(uuid, integer, jsonb) from public, anon;
grant execute on function public.finish_arcade_run(uuid, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Sudoku: server-side timing and a once-per-puzzle reward
-- ---------------------------------------------------------------------------
alter table public.sudoku_games add column reward_eligible boolean not null default false;
-- Puzzles finished before coins existed never pay; unfinished ones can when they are solved.
update public.sudoku_games set reward_eligible = (completed_at is null);

-- Start and completion times come from the database clock, and a puzzle can't be swapped in place.
create function public.sudoku_games_server_times()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.id is distinct from old.id then
    new.started_at := now();
    new.completed_at := null;
    new.reward_eligible := true;
    return new;
  end if;
  new.started_at := old.started_at;
  new.reward_eligible := old.reward_eligible;
  if new.puzzle is distinct from old.puzzle or new.solution is distinct from old.solution or new.difficulty is distinct from old.difficulty then
    raise exception 'Start a new puzzle instead of changing this one.' using errcode = '22023';
  end if;
  if old.completed_at is not null then
    new.completed_at := old.completed_at;
  elsif new.completed_at is not null then
    new.completed_at := now();
  end if;
  return new;
end;
$$;
create trigger sudoku_games_server_times before insert or update on public.sudoku_games
  for each row execute function public.sudoku_games_server_times();

-- Pays a solved puzzle once (repeat calls return the stored result).
create function public.claim_sudoku_reward(p_game uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  g public.sudoku_games;
  r public.arcade_runs;
  rule public.arcade_reward_rules;
  v_seconds numeric;
  v_solved boolean;
  v_outcome text;
  v_note text;
  v_coins integer := 0;
  v_credit jsonb;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  select * into g from public.sudoku_games where user_id = v_user and id = p_game for update;
  if not found then
    raise exception 'That puzzle was not found.' using errcode = 'P0002', hint = 'run_not_found';
  end if;
  select * into rule from public.arcade_reward_rules where game = 'sudoku' and variant = g.difficulty;

  select * into r from public.arcade_runs where id = p_game;
  if found then
    if r.user_id <> v_user then
      raise exception 'That puzzle was not found.' using errcode = 'P0002', hint = 'run_not_found';
    end if;
    return jsonb_build_object('status', r.outcome, 'coins', r.coins, 'balance', public._wallet_balance(v_user), 'reason', r.note,
      'minScore', 0, 'minSeconds', rule.min_seconds);
  end if;

  if g.completed_at is null then
    raise exception 'Finish the puzzle first.' using errcode = '22023';
  end if;

  select bool_and(case when substr(g.puzzle, i, 1) <> '0' then substr(g.puzzle, i, 1) = substr(g.solution, i, 1)
                       else substr(g.entries, i, 1) = substr(g.solution, i, 1) end)
    into v_solved
    from generate_series(1, 81) as i;
  v_seconds := extract(epoch from g.completed_at - g.started_at);

  if not g.reward_eligible then
    v_outcome := 'unpaid';
    v_note := 'not_eligible';
  elsif not v_solved then
    v_outcome := 'rejected';
    v_note := 'implausible';
  elsif v_seconds < rule.min_seconds then
    v_outcome := 'unpaid';
    v_note := 'too_short';
  else
    v_credit := public._credit_coins(v_user, rule.flat_coins, 'run:' || g.id::text,
      jsonb_build_object('game', 'sudoku', 'difficulty', g.difficulty, 'seconds', round(v_seconds)));
    v_coins := (v_credit ->> 'coins')::integer;
    v_outcome := case when v_coins > 0 then 'paid' else 'unpaid' end;
    v_note := case when (v_credit ->> 'capped')::boolean then 'daily_limit' end;
  end if;

  insert into public.arcade_runs (id, user_id, game, variant, started_at, finished_at, score, coins, outcome, note)
  values (g.id, v_user, 'sudoku', g.difficulty, g.started_at, g.completed_at, floor(v_seconds)::integer, v_coins, v_outcome, v_note);

  return jsonb_build_object('status', v_outcome, 'coins', v_coins, 'balance', public._wallet_balance(v_user), 'reason', v_note,
    'minScore', 0, 'minSeconds', rule.min_seconds);
end;
$$;
revoke all on function public.claim_sudoku_reward(uuid) from public, anon;
grant execute on function public.claim_sudoku_reward(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------------

-- Buys an item at the price the buyer saw. Owning it already is a no-op (status 'owned').
create function public.purchase_cosmetic(p_item text, p_expected_price integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  item public.cosmetic_items;
  v_balance integer;
  v_tx bigint;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  select * into item from public.cosmetic_items where id = p_item;
  if not found or not item.available then
    raise exception 'That item isn''t available.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;

  if exists (select 1 from public.user_cosmetics where user_id = v_user and item_id = p_item) then
    return jsonb_build_object('status', 'owned', 'balance', v_balance, 'price', 0);
  end if;
  if p_expected_price is distinct from item.price then
    raise exception 'The price changed. Check the new price and try again.' using errcode = 'P0001', hint = 'price_changed';
  end if;
  if v_balance < item.price then
    raise exception 'Not enough coins for that item yet.' using errcode = 'P0001', hint = 'insufficient_funds';
  end if;

  update public.coin_wallets
     set balance = balance - item.price, spent = spent + item.price, updated_at = now()
   where user_id = v_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (v_user, -item.price, v_balance, 'purchase', 'item:' || item.id, jsonb_build_object('item', item.id, 'price', item.price))
  returning id into v_tx;
  insert into public.user_cosmetics (user_id, item_id, transaction_id) values (v_user, item.id, v_tx);

  return jsonb_build_object('status', 'purchased', 'balance', v_balance, 'price', item.price);
end;
$$;
revoke all on function public.purchase_cosmetic(text, integer) from public, anon;
grant execute on function public.purchase_cosmetic(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Equipping: shop items must be owned (free frames are not in the catalogue)
-- ---------------------------------------------------------------------------
alter table public.users add column avatar_decoration text references public.cosmetic_items (id) on delete set null;

create function public._cosmetic_allowed(p_user uuid, p_item text, p_kind text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_item is null
    or (p_kind = 'frame' and not exists (select 1 from public.cosmetic_items where id = p_item))
    or exists (
      select 1
        from public.cosmetic_items c
        join public.user_cosmetics u on u.item_id = c.id
       where c.id = p_item and c.kind = p_kind and u.user_id = p_user
    );
$$;
revoke all on function public._cosmetic_allowed(uuid, text, text) from public, anon, authenticated;

create function public.users_check_cosmetics()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.avatar_decoration is distinct from old.avatar_decoration)
     and not public._cosmetic_allowed(new.id, new.avatar_decoration, 'avatar_decoration') then
    raise exception 'You don''t own that avatar decoration.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  if (tg_op = 'INSERT' or (new.settings ->> 'artworkFrame') is distinct from (old.settings ->> 'artworkFrame'))
     and not public._cosmetic_allowed(new.id, new.settings ->> 'artworkFrame', 'frame') then
    raise exception 'You don''t own that frame.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  return new;
end;
$$;
create trigger users_check_cosmetics before insert or update on public.users
  for each row execute function public.users_check_cosmetics();

create function public.entries_check_frame()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.frame is distinct from old.frame)
     and not public._cosmetic_allowed(new.user_id, new.frame, 'frame') then
    raise exception 'You don''t own that frame.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  return new;
end;
$$;
create trigger entries_check_frame before insert or update of frame on public.entries
  for each row execute function public.entries_check_frame();
