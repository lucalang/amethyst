-- Preserve earned achievement progress and grant rewards for all recorded user_achievements rows,
-- including milestones whose underlying archive content was later edited or removed after unlock.

create or replace function public._set_achievement_progress(
  p_user uuid, p_id text, p_value integer, p_details jsonb default '{}'::jsonb, p_keep_best boolean default false
) returns void
language sql security definer set search_path = '' as $$
  insert into public.user_achievement_progress as current (user_id, achievement_id, progress, details)
  select
    p_user,
    d.id,
    case
      when exists (select 1 from public.user_achievements ua where ua.user_id = p_user and ua.achievement_id = d.id)
        then greatest(d.target, greatest(0, p_value))
      else greatest(0, p_value)
    end,
    coalesce(p_details, '{}'::jsonb)
  from public.achievement_definitions d where d.id = p_id
  on conflict (user_id, achievement_id) do update set
    progress = case
      when exists (select 1 from public.user_achievements ua where ua.user_id = p_user and ua.achievement_id = current.achievement_id)
        then greatest(current.progress, excluded.progress)
      when p_keep_best
        then greatest(current.progress, excluded.progress)
      else excluded.progress
    end,
    details = case
      when (p_keep_best or exists (select 1 from public.user_achievements ua where ua.user_id = p_user and ua.achievement_id = current.achievement_id))
           and current.progress > excluded.progress
        then current.details
      else excluded.details
    end,
    updated_at = now();
$$;
revoke all on function public._set_achievement_progress(uuid, text, integer, jsonb, boolean) from public, anon, authenticated;

-- Ensure any already-earned achievement has progress >= target in user_achievement_progress.
insert into public.user_achievement_progress as current (user_id, achievement_id, progress, details)
select ua.user_id, d.id, d.target, '{}'::jsonb
  from public.user_achievements ua
  join public.achievement_definitions d on d.id = ua.achievement_id
on conflict (user_id, achievement_id) do update
  set progress = greatest(current.progress, excluded.progress),
      updated_at = now()
where current.progress < excluded.progress;

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
     where ua.user_id = p_user
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

select public.backfill_achievement_rewards(1000);
