-- The Vault: secret codes that unlock coins, exclusive cosmetics, profile badges and titles.
--
-- Codes are never stored, only the SHA-256 of the normalized code (uppercase letters and digits).
-- The app hashes what the player typed before it reaches the database, so code values don't show
-- up in database logs either. Operators create and disable codes with `npm run codes` (README →
-- "Secret codes"), which hashes locally too. Nothing here is readable or callable by clients
-- except the redeem function and each account's own redemption history.

-- ---------------------------------------------------------------------------
-- Cosmetics: profile badges and titles, and secret (code-only) items
-- ---------------------------------------------------------------------------
alter table public.cosmetic_items drop constraint cosmetic_items_kind_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_kind_check check (kind in ('frame', 'avatar_decoration', 'game', 'badge', 'title'));

-- Secret items are never on sale and stay invisible until an account owns one.
alter table public.cosmetic_items add column secret boolean not null default false;
alter table public.cosmetic_items drop constraint cosmetic_items_price_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_price_check check (case when secret then price = 0 else price > 0 end),
  add constraint cosmetic_items_secret_unavailable check (not (secret and available));

drop policy read_items on public.cosmetic_items;
create policy read_items on public.cosmetic_items for select to authenticated using (
  not secret
  or exists (select 1 from public.user_cosmetics u where u.item_id = cosmetic_items.id and u.user_id = (select auth.uid()))
);

insert into public.cosmetic_items (id, kind, price, available, secret) values
  ('vault-sigil', 'avatar_decoration', 0, false, true),
  ('badge-keyhole', 'badge', 0, false, true),
  ('badge-comet', 'badge', 0, false, true),
  ('badge-lantern', 'badge', 0, false, true),
  ('title-vault-keeper', 'title', 0, false, true),
  ('title-code-breaker', 'title', 0, false, true),
  ('title-night-archivist', 'title', 0, false, true)
on conflict (id) do nothing;

-- The badge and title shown with the account's name (owned items only, like decorations).
alter table public.users
  add column profile_badge text references public.cosmetic_items (id) on delete set null,
  add column profile_title text references public.cosmetic_items (id) on delete set null;

create or replace function public.users_check_cosmetics()
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
  if (tg_op = 'INSERT' or new.profile_badge is distinct from old.profile_badge)
     and not public._cosmetic_allowed(new.id, new.profile_badge, 'badge') then
    raise exception 'You don''t own that badge.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  if (tg_op = 'INSERT' or new.profile_title is distinct from old.profile_title)
     and not public._cosmetic_allowed(new.id, new.profile_title, 'title') then
    raise exception 'You don''t own that title.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;
  return new;
end;
$$;

-- Coins from codes are their own ledger kind: they don't count as play rewards or toward the daily limit.
alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check check (kind in ('reward', 'purchase', 'code'));

-- ---------------------------------------------------------------------------
-- Codes (operator-only)
-- ---------------------------------------------------------------------------
create table public.secret_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  -- An operator note such as "Winter newsletter". Never the code itself.
  label text not null check (char_length(label) between 1 and 120),
  coins integer not null default 0 check (coins between 0 and 100000),
  expires_at timestamptz,
  max_redemptions integer check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  check (max_redemptions is null or redemption_count <= max_redemptions)
);

create table public.secret_code_items (
  code_id uuid not null references public.secret_codes (id) on delete cascade,
  item_id text not null references public.cosmetic_items (id),
  primary key (code_id, item_id)
);

-- One per account and code. Codes with redemptions can be disabled but not deleted.
create table public.secret_code_redemptions (
  code_id uuid not null references public.secret_codes (id),
  user_id uuid not null references public.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  coins integer not null default 0,
  items text[] not null default '{}',
  primary key (code_id, user_id)
);
create index secret_code_redemptions_user on public.secret_code_redemptions (user_id, redeemed_at desc);

-- Outcomes only (never the code), for brute-force throttling. Pruned after two days.
create table public.secret_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  succeeded boolean not null,
  attempted_at timestamptz not null default now()
);
create index secret_code_attempts_user on public.secret_code_attempts (user_id, attempted_at desc);

alter table public.secret_codes enable row level security;
alter table public.secret_code_items enable row level security;
alter table public.secret_code_attempts enable row level security;
alter table public.secret_code_redemptions enable row level security;
create policy owner_read on public.secret_code_redemptions for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.secret_codes, public.secret_code_items, public.secret_code_attempts, public.secret_code_redemptions from public, anon, authenticated;
grant select on public.secret_code_redemptions to authenticated;
grant all on public.secret_codes, public.secret_code_items, public.secret_code_attempts, public.secret_code_redemptions to service_role;

-- ---------------------------------------------------------------------------
-- Redeeming
-- ---------------------------------------------------------------------------

-- Redeems the code whose normalized SHA-256 (lowercase hex) is p_code_hash, granting everything
-- in one transaction. Unknown, expired, used-up and disabled codes all answer 'unknown' and count
-- as a failed try; 5 failures in 15 minutes or 20 in 24 hours pause redeeming (hint rate_limited).
create function public.redeem_secret_code(p_code_hash text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code public.secret_codes;
  v_redemption public.secret_code_redemptions;
  v_valid boolean;
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
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
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

  select * into v_code from public.secret_codes where code_hash = decode(p_code_hash, 'hex') for update;
  v_valid := found;
  if v_valid then
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
    v_valid := v_code.disabled_at is null
      and (v_code.expires_at is null or v_code.expires_at > now())
      and (v_code.max_redemptions is null or v_code.redemption_count < v_code.max_redemptions);
  end if;

  if not v_valid then
    insert into public.secret_code_attempts (user_id, succeeded) values (v_user, false);
    return jsonb_build_object('status', 'unknown', 'triesLeft', greatest(0, least(4 - v_recent, 19 - v_daily)));
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
revoke all on function public.redeem_secret_code(text) from public, anon;
grant execute on function public.redeem_secret_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Operator functions (service role only; used by `npm run codes`)
-- ---------------------------------------------------------------------------
create function public.admin_create_secret_code(
  p_code_hash text,
  p_label text,
  p_coins integer default 0,
  p_items text[] default '{}',
  p_expires_at timestamptz default null,
  p_max_redemptions integer default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_missing text;
begin
  if p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'p_code_hash must be a lowercase hex SHA-256 of the normalized code.' using errcode = '22023';
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

  insert into public.secret_codes (code_hash, label, coins, expires_at, max_redemptions)
  values (decode(p_code_hash, 'hex'), p_label, coalesce(p_coins, 0), p_expires_at, p_max_redemptions)
  returning id into v_id;
  insert into public.secret_code_items (code_id, item_id)
  select distinct v_id, item from unnest(coalesce(p_items, '{}')) as item;
  return v_id;
end;
$$;
revoke all on function public.admin_create_secret_code(text, text, integer, text[], timestamptz, integer) from public, anon, authenticated;
grant execute on function public.admin_create_secret_code(text, text, integer, text[], timestamptz, integer) to service_role;

-- Stops a code from opening anything (already granted rewards stay). Returns false if it was already disabled.
create function public.admin_disable_secret_code(p_id uuid)
returns boolean
language sql security definer set search_path = '' as $$
  with changed as (
    update public.secret_codes set disabled_at = now() where id = p_id and disabled_at is null returning 1
  )
  select exists (select 1 from changed);
$$;
revoke all on function public.admin_disable_secret_code(uuid) from public, anon, authenticated;
grant execute on function public.admin_disable_secret_code(uuid) to service_role;
