-- Admin Dashboard: player lookup and player tools (Season Pass premium, coins, cosmetics, luck boosters).
-- Every change goes through a security-definer function that checks the admin list, locks the player,
-- is safe to retry by request id (one audit entry per request) and writes one append-only audit entry.

-- ---------------------------------------------------------------------------
-- 1. Audit actions, request ids and the admin coin kind
-- ---------------------------------------------------------------------------
alter table public.admin_audit drop constraint admin_audit_action_check;
alter table public.admin_audit add constraint admin_audit_action_check check (action in (
  'admin_grant', 'admin_role_change', 'admin_revoke',
  'loot_override_create', 'loot_override_cancel', 'loot_override_use',
  'slot_override_create', 'slot_override_cancel', 'slot_override_use',
  'season_premium_grant', 'season_premium_revoke',
  'coins_grant', 'coins_take',
  'cosmetic_grant', 'cosmetic_take',
  'booster_grant', 'booster_take', 'booster_end'
));
-- A retried request finds its own entry instead of applying twice.
create unique index admin_audit_request on public.admin_audit ((details ->> 'request')) where details ? 'request';

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('reward', 'purchase', 'code', 'slots', 'achievement', 'streak', 'refund', 'season', 'tournament', 'wager', 'admin'));

-- ---------------------------------------------------------------------------
-- 2. How Premium was obtained, so a revoke knows what can be refunded
-- ---------------------------------------------------------------------------
alter table public.user_seasons
  add column premium_source text check (premium_source in ('purchase', 'admin')),
  add column premium_paid integer check (premium_paid > 0);

update public.user_seasons set premium_source = 'admin' where premium_at is not null;
update public.user_seasons us
   set premium_source = 'purchase', premium_paid = -t.amount
  from public.coin_transactions t
 where us.premium_at is not null
   and t.user_id = us.user_id
   and t.reference = 'season-premium:' || us.season_id
   and t.amount < 0;

-- Same purchase as before. It records the source and price, and a repurchase after an admin revoke
-- gets its own coin reference (the first one is unique per account).
create or replace function public.buy_season_premium(p_season text, p_expected_price integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  s public.seasons;
  us public.user_seasons;
  v_balance integer;
  v_ref text;
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

  v_ref := 'season-premium:' || s.id;
  if exists (select 1 from public.coin_transactions where user_id = v_user and reference = v_ref) then
    v_ref := v_ref || ':' || gen_random_uuid()::text;
  end if;
  v_balance := public._season_charge(v_user, s.premium_price, v_ref,
    jsonb_build_object('season', s.id, 'price', s.premium_price));
  update public.user_seasons
     set premium_at = now(), premium_source = 'purchase', premium_paid = s.premium_price, updated_at = now()
   where user_id = v_user and season_id = s.id;
  return jsonb_build_object('status', 'purchased', 'balance', v_balance);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
-- The calling admin, after checking the request and the player and locking the player.
create function public._admin_player_begin(p_request uuid, p_user uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._require_admin();
begin
  if p_request is null or p_user is null then
    raise exception 'Choose a player.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = p_user) then
    raise exception 'That account doesn''t exist.' using errcode = 'P0001', hint = 'account_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('admin-player:' || p_user::text, 0));
  return v_actor;
end;
$$;
revoke all on function public._admin_player_begin(uuid, uuid) from public, anon, authenticated;

create function public._admin_request_done(p_request uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_audit where details ? 'request' and details ->> 'request' = p_request::text);
$$;
revoke all on function public._admin_request_done(uuid) from public, anon, authenticated;

-- Adds (or with a negative amount removes) coins as an 'admin' transaction. Never below zero.
create function public._admin_move_coins(p_user uuid, p_amount integer, p_reference text, p_details jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_balance integer;
begin
  insert into public.coin_wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = p_user for update;
  if v_balance + p_amount < 0 then
    raise exception 'They only have % coins.', v_balance using errcode = 'P0001', hint = 'insufficient_funds';
  end if;
  update public.coin_wallets
     set balance = balance + p_amount,
         earned = earned + greatest(p_amount, 0),
         spent = spent + greatest(-p_amount, 0),
         updated_at = now()
   where user_id = p_user
  returning balance into v_balance;
  insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
  values (p_user, p_amount, v_balance, 'admin', p_reference, coalesce(p_details, '{}'::jsonb));
  return v_balance;
end;
$$;
revoke all on function public._admin_move_coins(uuid, integer, text, jsonb) from public, anon, authenticated;

create function public._admin_current_season()
returns public.seasons
language sql stable security definer set search_path = '' as $$
  select * from public.seasons where starts_at <= now() and now() < ends_at order by starts_at desc limit 1;
$$;
revoke all on function public._admin_current_season() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Player lookup
-- ---------------------------------------------------------------------------
create function public.admin_player_state(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.seasons;
  us public.user_seasons;
begin
  perform public._require_admin();
  if p_user is null or not exists (select 1 from public.users where id = p_user) then
    raise exception 'That account doesn''t exist.' using errcode = 'P0001', hint = 'account_not_found';
  end if;
  s := public._admin_current_season();
  if s.id is not null then
    select * into us from public.user_seasons where user_id = p_user and season_id = s.id;
  end if;

  return jsonb_build_object(
    'account', public._admin_account_json(p_user),
    'admin', public._admin_role(p_user),
    'memberSince', (select created_at from public.users where id = p_user),
    'wallet', (
      select jsonb_build_object('balance', coalesce(w.balance, 0), 'earned', coalesce(w.earned, 0), 'spent', coalesce(w.spent, 0))
        from (select 1) x left join public.coin_wallets w on w.user_id = p_user),
    'transactions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'amount', t.amount, 'kind', t.kind, 'balanceAfter', t.balance_after,
        'createdAt', t.created_at, 'reason', t.details ->> 'reason') order by t.created_at desc, t.id desc)
        from (select * from public.coin_transactions where user_id = p_user order by created_at desc, id desc limit 12) t), '[]'::jsonb),
    'season', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'endsAt', s.ends_at, 'price', s.premium_price,
      'tier', coalesce(public._season_tier(p_user, s.id), 0),
      'tiers', (select max(tier) from public.season_tiers where season_id = s.id),
      'premium', us.premium_at is not null, 'premiumAt', us.premium_at,
      'premiumSource', us.premium_source, 'premiumPaid', us.premium_paid) end,
    'cosmetics', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.item_id, 'kind', c.kind, 'rarity', c.rarity, 'acquiredAt', u.acquired_at) order by u.acquired_at desc, u.item_id)
        from public.user_cosmetics u join public.cosmetic_items c on c.id = u.item_id
       where u.user_id = p_user), '[]'::jsonb),
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'rarity', c.rarity) order by c.kind, c.id)
        from public.cosmetic_items c), '[]'::jsonb),
    'boosters', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'multiplier', b.multiplier,
        'quantity', coalesce(u.quantity, 0), 'active', coalesce(u.active, 0)) order by b.position, b.multiplier)
        from public.loot_boosters b
        left join public.user_loot_boosters u on u.user_id = p_user and u.booster_id = b.id), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Season Pass premium (the running season only). Claimed premium rewards are kept.
-- ---------------------------------------------------------------------------
create function public.admin_set_season_premium(p_request uuid, p_user uuid, p_premium boolean, p_refund boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._admin_player_begin(p_request, p_user);
  s public.seasons;
  us public.user_seasons;
  v_refund integer := 0;
begin
  if public._admin_request_done(p_request) then
    return jsonb_build_object('status', 'repeat');
  end if;
  if p_premium is null then
    raise exception 'Choose whether to grant or revoke Premium.' using errcode = '22023';
  end if;
  s := public._admin_current_season();
  if s.id is null then
    raise exception 'No season is running right now.' using errcode = 'P0001', hint = 'season_closed';
  end if;
  perform public._season_lock(p_user);
  insert into public.user_seasons (user_id, season_id) values (p_user, s.id) on conflict (user_id, season_id) do nothing;
  select * into us from public.user_seasons where user_id = p_user and season_id = s.id for update;

  if p_premium then
    if us.premium_at is not null then
      return jsonb_build_object('status', 'unchanged');
    end if;
    update public.user_seasons
       set premium_at = now(), premium_source = 'admin', premium_paid = null, updated_at = now()
     where user_id = p_user and season_id = s.id;
    perform public._admin_log(v_actor, p_user, 'season_premium_grant', jsonb_build_object('request', p_request, 'season', s.id));
  else
    if us.premium_at is null then
      return jsonb_build_object('status', 'unchanged');
    end if;
    if coalesce(p_refund, false) and us.premium_source = 'purchase' and coalesce(us.premium_paid, 0) > 0 then
      v_refund := us.premium_paid;
      perform public._admin_move_coins(p_user, v_refund, 'admin:' || p_request::text,
        jsonb_build_object('reason', 'Premium Pass refund', 'season', s.id));
    end if;
    update public.user_seasons
       set premium_at = null, premium_source = null, premium_paid = null, updated_at = now()
     where user_id = p_user and season_id = s.id;
    perform public._admin_log(v_actor, p_user, 'season_premium_revoke', jsonb_build_object(
      'request', p_request, 'season', s.id, 'source', us.premium_source, 'refund', v_refund));
  end if;
  return jsonb_build_object('status', 'done', 'season', s.id, 'refund', v_refund);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Coins (a reason is required; never below zero)
-- ---------------------------------------------------------------------------
create function public.admin_adjust_coins(p_request uuid, p_user uuid, p_amount integer, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._admin_player_begin(p_request, p_user);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_balance integer;
begin
  if public._admin_request_done(p_request) then
    return jsonb_build_object('status', 'repeat');
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then
    raise exception 'Enter an amount between 1 and 1,000,000 coins.' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 200 then
    raise exception 'Add a short reason (3 to 200 characters).' using errcode = '22023';
  end if;
  v_balance := public._admin_move_coins(p_user, p_amount, 'admin:' || p_request::text, jsonb_build_object('reason', v_reason));
  perform public._admin_log(v_actor, p_user, case when p_amount > 0 then 'coins_grant' else 'coins_take' end,
    jsonb_build_object('request', p_request, 'amount', abs(p_amount), 'reason', v_reason, 'balance', v_balance));
  return jsonb_build_object('status', 'done', 'balance', v_balance);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Cosmetics. Taking one also takes it off everywhere it is worn or used.
-- ---------------------------------------------------------------------------
create function public.admin_set_cosmetic(p_request uuid, p_user uuid, p_item text, p_owned boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._admin_player_begin(p_request, p_user);
  c public.cosmetic_items;
  v_had boolean;
  v_badges text[];
begin
  if public._admin_request_done(p_request) then
    return jsonb_build_object('status', 'repeat');
  end if;
  if p_owned is null then
    raise exception 'Choose whether to give or take the item.' using errcode = '22023';
  end if;
  select * into c from public.cosmetic_items where id = p_item;
  if not found then
    raise exception 'That item doesn''t exist.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  v_had := exists (select 1 from public.user_cosmetics where user_id = p_user and item_id = p_item);

  if p_owned then
    if v_had then
      return jsonb_build_object('status', 'unchanged');
    end if;
    insert into public.user_cosmetics (user_id, item_id) values (p_user, p_item);
    perform public._admin_log(v_actor, p_user, 'cosmetic_grant', jsonb_build_object('request', p_request, 'item', p_item, 'kind', c.kind));
  else
    if not v_had then
      return jsonb_build_object('status', 'unchanged');
    end if;
    -- Badges they keep wearing, in order (clearing the legacy column below rewrites the list).
    select coalesce(array_agg(badge_id order by position) filter (where badge_id <> p_item), '{}')
      into v_badges from public.user_profile_badges where user_id = p_user;
    update public.users
       set avatar_decoration = case when avatar_decoration = p_item then null else avatar_decoration end,
           profile_title = case when profile_title = p_item then null else profile_title end,
           profile_badge = case when profile_badge = p_item then null else profile_badge end,
           settings = case when settings ->> 'artworkFrame' = p_item then settings - 'artworkFrame' else settings end
     where id = p_user
       and (p_item in (avatar_decoration, profile_title, profile_badge) or settings ->> 'artworkFrame' = p_item);
    if c.kind = 'badge' then
      delete from public.user_profile_badges where user_id = p_user;
      insert into public.user_profile_badges (user_id, position, badge_id)
      select p_user, t.ord, t.b from unnest(v_badges) with ordinality as t(b, ord);
    end if;
    delete from public.game_loadouts where user_id = p_user and item_id = p_item;
    update public.profile_looks
       set banner = case when banner = p_item then null else banner end,
           frame = case when frame = p_item then null else frame end,
           updated_at = now()
     where user_id = p_user and p_item in (banner, frame);
    update public.entries set frame = null where user_id = p_user and frame = p_item;
    -- The worn profile banner and frame clear through their foreign keys.
    delete from public.user_cosmetics where user_id = p_user and item_id = p_item;
    perform public._admin_log(v_actor, p_user, 'cosmetic_take', jsonb_build_object('request', p_request, 'item', p_item, 'kind', c.kind));
  end if;
  return jsonb_build_object('status', 'done');
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Luck boosters: give or take unused boosted openings, or end the active ones.
-- ---------------------------------------------------------------------------
create function public.admin_adjust_booster(p_request uuid, p_user uuid, p_booster text, p_action text, p_charges integer default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._admin_player_begin(p_request, p_user);
  b public.loot_boosters;
  u public.user_loot_boosters;
begin
  if public._admin_request_done(p_request) then
    return jsonb_build_object('status', 'repeat');
  end if;
  if p_action is null or p_action not in ('give', 'take', 'end') then
    raise exception 'Choose give, take or end.' using errcode = '22023';
  end if;
  if p_action <> 'end' and (p_charges is null or p_charges not between 1 and 10000) then
    raise exception 'Enter between 1 and 10,000 boosted openings.' using errcode = '22023';
  end if;
  select * into b from public.loot_boosters where id = p_booster;
  if not found then
    raise exception 'That booster doesn''t exist.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;
  insert into public.user_loot_boosters (user_id, booster_id) values (p_user, b.id) on conflict (user_id, booster_id) do nothing;
  select * into u from public.user_loot_boosters where user_id = p_user and booster_id = b.id for update;

  if p_action = 'give' then
    update public.user_loot_boosters set quantity = quantity + p_charges, updated_at = now() where user_id = p_user and booster_id = b.id;
    perform public._admin_log(v_actor, p_user, 'booster_grant', jsonb_build_object('request', p_request, 'booster', b.id, 'charges', p_charges));
  elsif p_action = 'take' then
    if u.quantity < p_charges then
      raise exception 'They only have % unused boosted openings.', u.quantity using errcode = 'P0001', hint = 'not_enough_boosters';
    end if;
    update public.user_loot_boosters set quantity = quantity - p_charges, updated_at = now() where user_id = p_user and booster_id = b.id;
    perform public._admin_log(v_actor, p_user, 'booster_take', jsonb_build_object('request', p_request, 'booster', b.id, 'charges', p_charges));
  else
    if u.active = 0 then
      return jsonb_build_object('status', 'unchanged');
    end if;
    update public.user_loot_boosters set active = 0, updated_at = now() where user_id = p_user and booster_id = b.id;
    perform public._admin_log(v_actor, p_user, 'booster_end', jsonb_build_object('request', p_request, 'booster', b.id, 'charges', u.active));
  end if;
  return jsonb_build_object('status', 'done');
end;
$$;

revoke all on function public.admin_player_state(uuid) from public, anon;
revoke all on function public.admin_set_season_premium(uuid, uuid, boolean, boolean) from public, anon;
revoke all on function public.admin_adjust_coins(uuid, uuid, integer, text) from public, anon;
revoke all on function public.admin_set_cosmetic(uuid, uuid, text, boolean) from public, anon;
revoke all on function public.admin_adjust_booster(uuid, uuid, text, text, integer) from public, anon;
grant execute on function public.admin_player_state(uuid) to authenticated;
grant execute on function public.admin_set_season_premium(uuid, uuid, boolean, boolean) to authenticated;
grant execute on function public.admin_adjust_coins(uuid, uuid, integer, text) to authenticated;
grant execute on function public.admin_set_cosmetic(uuid, uuid, text, boolean) to authenticated;
grant execute on function public.admin_adjust_booster(uuid, uuid, text, text, integer) to authenticated;
