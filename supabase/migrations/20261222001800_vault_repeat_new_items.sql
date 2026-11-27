-- Redeeming a code again (an admin raised its per-account limit, often after adding rewards) now says so: the
-- answer carries `repeat`, true when this account had redeemed the code before. The API then lists only the
-- cosmetics that are new to the account for a repeat, while coins, cases, boosters and achievements stay as they
-- were. Same as 20261206000100_rarities_luck_rework.sql apart from that one field.

begin;

create or replace function public.redeem_vault_code(p_loose_hash text, p_phrase_hash text default null, p_request uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code public.secret_codes;
  v_last public.secret_code_redemptions;
  v_match boolean;
  v_open boolean := false;
  v_used integer := 0;
  v_recent integer;
  v_daily integer;
  v_retry timestamptz;
  v_items text[];
  v_owned text[];
  v_achievements text[];
  v_new_achievements text[] := '{}';
  v_loot jsonb;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_loose_hash is null or p_loose_hash !~ '^[0-9a-f]{64}$' or p_phrase_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'That doesn''t look like a code.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('secret_codes:' || v_user::text, 0));

  if p_request is not null then
    select * into v_last from public.secret_code_redemptions where user_id = v_user and request_id = p_request;
    if found then
      return jsonb_build_object(
        'status', 'already', 'coins', v_last.coins, 'items', to_jsonb(v_last.items), 'achievements', to_jsonb(v_last.achievements),
        'loot', v_last.loot, 'redeemedAt', v_last.redeemed_at, 'balance', public._wallet_balance(v_user)
      );
    end if;
  end if;

  delete from public.secret_code_attempts where user_id = v_user and attempted_at < now() - interval '2 days';
  select count(*) filter (where attempted_at > now() - interval '15 minutes'), count(*)
    into v_recent, v_daily
    from public.secret_code_attempts
   where user_id = v_user and not succeeded and attempted_at > now() - interval '24 hours';
  if v_recent >= 5 or v_daily >= 20 then
    select max(t) into v_retry from (
      (select attempted_at + interval '15 minutes' as t from public.secret_code_attempts
        where v_recent >= 5 and user_id = v_user and not succeeded and attempted_at > now() - interval '15 minutes'
        order by attempted_at desc offset 4 limit 1)
      union all
      (select attempted_at + interval '24 hours' from public.secret_code_attempts
        where v_daily >= 20 and user_id = v_user and not succeeded and attempted_at > now() - interval '24 hours'
        order by attempted_at desc offset 19 limit 1)
    ) s;
    raise exception 'Too many tries. The vault will listen again in about % minute(s).',
      greatest(1, ceil(extract(epoch from (coalesce(v_retry, now() + interval '15 minutes') - now())) / 60))::integer
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  select * into v_code from public.secret_codes where loose_hash = decode(p_loose_hash, 'hex') for update;
  v_match := coalesce(found and (v_code.format = 'compact' or v_code.code_hash = decode(p_phrase_hash, 'hex')), false);
  if v_match and v_code.audience = 'allowlist' then
    v_match := exists (select 1 from public.secret_code_allowlist where code_id = v_code.id and user_id = v_user);
  end if;
  if v_match then
    select count(*) into v_used from public.secret_code_redemptions where code_id = v_code.id and user_id = v_user;
    if v_used >= v_code.per_account_limit then
      select * into v_last from public.secret_code_redemptions
       where code_id = v_code.id and user_id = v_user
       order by redeemed_at desc, id desc limit 1;
      return jsonb_build_object(
        'status', 'already', 'coins', v_last.coins, 'items', to_jsonb(v_last.items), 'achievements', to_jsonb(v_last.achievements),
        'loot', v_last.loot, 'redeemedAt', v_last.redeemed_at, 'balance', public._wallet_balance(v_user)
      );
    end if;
    v_open := v_code.disabled_at is null
      and (v_code.starts_at is null or v_code.starts_at <= now())
      and (v_code.expires_at is null or v_code.expires_at > now())
      and (v_code.max_redemptions is null or v_code.redemption_count < v_code.max_redemptions);
  end if;

  if not v_open then
    insert into public.secret_code_attempts (user_id, succeeded) values (v_user, false);
    return jsonb_build_object(
      'status', case when v_match then 'unavailable' else 'unknown' end,
      'triesLeft', greatest(0, least(4 - v_recent, 19 - v_daily))
    );
  end if;

  select coalesce(array_agg(item_id order by item_id), '{}') into v_items from public.secret_code_items where code_id = v_code.id;
  select coalesce(array_agg(achievement_id order by achievement_id), '{}') into v_achievements from public.secret_code_achievements where code_id = v_code.id;
  select coalesce(jsonb_agg(jsonb_build_object('kind', l.kind, 'id', l.ref_id, 'quantity', l.quantity) order by l.kind, l.ref_id), '[]'::jsonb)
    into v_loot from public.secret_code_loot l where l.code_id = v_code.id;
  select coalesce(array_agg(item_id), '{}') into v_owned from public.user_cosmetics where user_id = v_user and item_id = any (v_items);

  if cardinality(v_achievements) > 0 then
    insert into public.user_achievement_progress as current (user_id, achievement_id, progress)
    select v_user, d.id, d.target from public.achievement_definitions d where d.id = any (v_achievements)
    on conflict (user_id, achievement_id) do update
      set progress = greatest(current.progress, excluded.progress), updated_at = now()
      where current.progress < excluded.progress;
    with added as (
      insert into public.user_achievements (user_id, achievement_id, source)
      select v_user, a, 'code' from unnest(v_achievements) as a
      on conflict (user_id, achievement_id) do nothing
      returning achievement_id
    )
    select coalesce(array_agg(achievement_id order by achievement_id), '{}') into v_new_achievements from added;
    perform public._grant_achievement_rewards(v_user, 'event', true);
  end if;

  insert into public.user_cosmetics (user_id, item_id)
  select v_user, item from unnest(v_items) as item
  on conflict (user_id, item_id) do nothing;

  -- Gifted cases cost nothing, so their duplicate refunds are 0.
  insert into public.user_loot_cases (user_id, case_id, quantity)
  select v_user, l.ref_id, l.quantity from public.secret_code_loot l where l.code_id = v_code.id and l.kind = 'case'
  on conflict (user_id, case_id) do update set quantity = public.user_loot_cases.quantity + excluded.quantity, updated_at = now();
  insert into public.user_loot_case_lots (user_id, case_id, unit_price, quantity, source)
  select v_user, l.ref_id, 0, l.quantity, 'code:' || v_code.id::text from public.secret_code_loot l where l.code_id = v_code.id and l.kind = 'case';
  insert into public.user_loot_boosters (user_id, booster_id, quantity)
  select v_user, l.ref_id, l.quantity * b.charges
    from public.secret_code_loot l join public.loot_boosters b on b.id = l.ref_id
   where l.code_id = v_code.id and l.kind = 'booster'
  on conflict (user_id, booster_id) do update set quantity = public.user_loot_boosters.quantity + excluded.quantity, updated_at = now();

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;
  if v_code.coins > 0 then
    if v_balance::bigint + v_code.coins > 2147483647 then
      raise exception 'Your wallet can''t hold that many coins.' using errcode = 'P0001', hint = 'wallet_full';
    end if;
    update public.coin_wallets set balance = balance + v_code.coins, updated_at = now()
     where user_id = v_user
    returning balance into v_balance;
    insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
    values (
      v_user, v_code.coins, v_balance, 'code',
      'code:' || v_code.id::text || case when v_used > 0 then ':' || (v_used + 1)::text else '' end,
      jsonb_build_object('items', to_jsonb(v_items), 'achievements', to_jsonb(v_achievements))
    );
  end if;

  insert into public.secret_code_redemptions (code_id, user_id, coins, items, achievements, achievements_new, request_id, loot)
  values (v_code.id, v_user, v_code.coins, v_items, v_achievements, v_new_achievements, p_request, v_loot);
  update public.secret_codes set redemption_count = redemption_count + 1 where id = v_code.id;
  insert into public.secret_code_attempts (user_id, succeeded) values (v_user, true);

  return jsonb_build_object(
    'status', 'unlocked',
    'repeat', v_used > 0,
    'coins', v_code.coins,
    'items', to_jsonb(v_items),
    'newItems', to_jsonb(array(select item from unnest(v_items) as item where item <> all (v_owned) order by item)),
    'achievements', to_jsonb(v_achievements),
    'newAchievements', to_jsonb(v_new_achievements),
    'loot', v_loot,
    'balance', v_balance
  );
end;
$$;

commit;
