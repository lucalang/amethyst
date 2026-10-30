-- Vault rework: codes can be chosen words ("SHADOW", "OPEN THE VAULT") next to random ones, and codes
-- that exist but no longer open (expired, used up or disabled) get their own answer.
--
-- Still hash-only: the app and `npm run codes` normalize and hash, the database never sees a code.
--   compact  NFKC, uppercase, spaces . _ - removed            "k7qm-3xrp-w9td" -> "K7QM3XRPW9TD"
--            (random codes, and every code created before this migration, unchanged)
--   phrase   NFKC, uppercase, trimmed, runs of spaces -> one  "  open  the vault" -> "OPEN THE VAULT"
-- Every code also keeps the hash of its compact form (loose_hash, unique), so a typed code matches at
-- most one row and two codes can't differ only in case, spacing or punctuation.

alter table public.secret_codes
  add column format text not null default 'compact' check (format in ('compact', 'phrase')),
  add column loose_hash bytea check (octet_length(loose_hash) = 32);
update public.secret_codes set loose_hash = code_hash;
alter table public.secret_codes
  alter column loose_hash set not null,
  add constraint secret_codes_loose_hash_key unique (loose_hash),
  add constraint secret_codes_compact_single_hash check (format = 'phrase' or loose_hash = code_hash);

-- Redeems the code whose compact form hashes to p_loose_hash; phrase codes also need p_phrase_hash
-- (the typed code's phrase form, null when it isn't one). Answers 'unlocked', 'already' (what this
-- account received back then), 'unavailable' (expired, used up or disabled) or 'unknown'. The last two
-- count as failed tries: 5 in 15 minutes or 20 in 24 hours pause redeeming (hint rate_limited).
create function public.redeem_vault_code(p_loose_hash text, p_phrase_hash text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code public.secret_codes;
  v_redemption public.secret_code_redemptions;
  v_match boolean;
  v_open boolean := false;
  v_recent integer;
  v_daily integer;
  v_retry timestamptz;
  v_items text[];
  v_new text[];
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_loose_hash is null or p_loose_hash !~ '^[0-9a-f]{64}$' or p_phrase_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'That doesn''t look like a code.' using errcode = '22023';
  end if;

  -- One redemption at a time per account, so throttling and grants can't race each other.
  perform pg_advisory_xact_lock(hashtextextended('secret_codes:' || v_user::text, 0));

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
  if v_match then
    select * into v_redemption from public.secret_code_redemptions where code_id = v_code.id and user_id = v_user;
    if found then
      return jsonb_build_object(
        'status', 'already',
        'coins', v_redemption.coins,
        'items', to_jsonb(v_redemption.items),
        'redeemedAt', v_redemption.redeemed_at,
        'balance', public._wallet_balance(v_user)
      );
    end if;
    v_open := v_code.disabled_at is null
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
  with added as (
    insert into public.user_cosmetics (user_id, item_id)
    select v_user, item from unnest(v_items) as item
    on conflict (user_id, item_id) do nothing
    returning item_id
  )
  select coalesce(array_agg(item_id), '{}') into v_new from added;

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;
  if v_code.coins > 0 then
    update public.coin_wallets set balance = balance + v_code.coins, updated_at = now()
     where user_id = v_user
    returning balance into v_balance;
    insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
    values (v_user, v_code.coins, v_balance, 'code', 'code:' || v_code.id::text, jsonb_build_object('items', to_jsonb(v_items)));
  end if;

  insert into public.secret_code_redemptions (code_id, user_id, coins, items) values (v_code.id, v_user, v_code.coins, v_items);
  update public.secret_codes set redemption_count = redemption_count + 1 where id = v_code.id;
  insert into public.secret_code_attempts (user_id, succeeded) values (v_user, true);

  return jsonb_build_object('status', 'unlocked', 'coins', v_code.coins, 'items', to_jsonb(v_items), 'newItems', to_jsonb(v_new), 'balance', v_balance);
end;
$$;
revoke all on function public.redeem_vault_code(text, text) from public, anon;
grant execute on function public.redeem_vault_code(text, text) to authenticated;

-- App versions from before this migration send only the compact hash and know three answers. They keep
-- working (phrase codes need the current app) and see 'unavailable' as 'unknown', as before.
create or replace function public.redeem_secret_code(p_code_hash text)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_result jsonb := public.redeem_vault_code(p_code_hash);
begin
  if v_result ->> 'status' = 'unavailable' then
    v_result := v_result || jsonb_build_object('status', 'unknown');
  end if;
  return v_result;
end;
$$;

-- Operators: p_code_hash is the SHA-256 (lowercase hex) of the code in its format, p_loose_hash that of
-- its compact form (defaults to p_code_hash, which is what compact codes use).
drop function public.admin_create_secret_code(text, text, integer, text[], timestamptz, integer);
create function public.admin_create_secret_code(
  p_code_hash text,
  p_label text,
  p_coins integer default 0,
  p_items text[] default '{}',
  p_expires_at timestamptz default null,
  p_max_redemptions integer default null,
  p_format text default 'compact',
  p_loose_hash text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_missing text;
  v_loose text := coalesce(p_loose_hash, p_code_hash);
begin
  if p_format is null or p_format not in ('compact', 'phrase') then
    raise exception 'p_format must be compact or phrase.' using errcode = '22023';
  end if;
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' or v_loose !~ '^[0-9a-f]{64}$' then
    raise exception 'Hashes must be lowercase hex SHA-256 of the normalized code.' using errcode = '22023';
  end if;
  if p_format = 'compact' and v_loose <> p_code_hash then
    raise exception 'Compact codes use one hash for both.' using errcode = '22023';
  end if;
  if coalesce(p_coins, 0) = 0 and coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'A code needs coins, items or both.' using errcode = '22023';
  end if;
  select string_agg(item, ', ') into v_missing
    from unnest(coalesce(p_items, '{}')) as item
   where not exists (select 1 from public.cosmetic_items c where c.id = item);
  if v_missing is not null then
    raise exception 'Unknown cosmetic items: %', v_missing using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiry date is in the past.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.secret_codes
     where loose_hash = decode(v_loose, 'hex') or code_hash = decode(p_code_hash, 'hex')
  ) then
    raise exception 'That code already exists, or one that differs only in case, spacing or punctuation. Codes can''t be reused, even after they expire or are disabled.'
      using errcode = '23505', hint = 'duplicate_code';
  end if;

  insert into public.secret_codes (code_hash, loose_hash, format, label, coins, expires_at, max_redemptions)
  values (decode(p_code_hash, 'hex'), decode(v_loose, 'hex'), p_format, p_label, coalesce(p_coins, 0), p_expires_at, p_max_redemptions)
  returning id into v_id;
  insert into public.secret_code_items (code_id, item_id)
  select distinct v_id, item from unnest(coalesce(p_items, '{}')) as item;
  return v_id;
end;
$$;
revoke all on function public.admin_create_secret_code(text, text, integer, text[], timestamptz, integer, text, text) from public, anon, authenticated;
grant execute on function public.admin_create_secret_code(text, text, integer, text[], timestamptz, integer, text, text) to service_role;
