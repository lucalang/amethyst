-- Vault admin panel: trusted administrators build, publish and disable Vault codes in the app.
--
-- * Administrators are listed in public.app_admins. Only the service role (`npm run codes --
--   admin-grant <email>` on a trusted machine) or the Supabase SQL editor can change it; an account
--   can read only its own row (to show the Admin menu entry). Every admin function checks the list
--   itself, so hiding the menu is never the protection.
-- * Codes stay hash-only. The app server normalizes and hashes a new code, shows it once and never
--   stores or logs it. Drafts never contain a code.
-- * Published codes are immutable apart from being disabled. Publishing and disabling are audited,
--   from the app and from `npm run codes` alike. The CLI functions keep their signatures.
-- * New rules: an optional start, a per-account limit (default 1, so existing codes behave exactly as
--   before), an allowlist of accounts, and achievements a code unlocks through the achievement system.
-- * Redemptions may repeat per account (up to the code's per-account limit), and a request id makes a
--   retried request answer with what it already granted instead of granting again.

-- ---------------------------------------------------------------------------
-- 1. Administrators
-- ---------------------------------------------------------------------------
create table public.app_admins (
  user_id uuid primary key references public.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('owner', 'admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.users (id) on delete set null
);
alter table public.app_admins enable row level security;
create policy own_row on public.app_admins for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.app_admins from public, anon, authenticated;
grant select on public.app_admins to authenticated;
grant all on public.app_admins to service_role;

-- The calling administrator, or an error for everyone else.
create function public._require_admin()
returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (select 1 from public.app_admins where user_id = v_user) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return v_user;
end;
$$;
revoke all on function public._require_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Code rules, achievement rewards, allowlists, drafts and the audit trail
-- ---------------------------------------------------------------------------
alter table public.secret_codes
  add column starts_at timestamptz,
  add column per_account_limit integer not null default 1 check (per_account_limit between 1 and 100),
  add column audience text not null default 'everyone' check (audience in ('everyone', 'allowlist')),
  add column created_by uuid references public.users (id) on delete set null,
  add constraint secret_codes_window check (starts_at is null or expires_at is null or expires_at > starts_at);

create table public.secret_code_achievements (
  code_id uuid not null references public.secret_codes (id) on delete cascade,
  achievement_id text not null references public.achievement_definitions (id),
  primary key (code_id, achievement_id)
);

-- Accounts (stable ids, never emails) that may redeem an allowlist code.
create table public.secret_code_allowlist (
  code_id uuid not null references public.secret_codes (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  primary key (code_id, user_id)
);

-- Unpublished configurations. Never a code: it's chosen or generated when publishing.
create table public.secret_code_drafts (
  id uuid primary key default gen_random_uuid(),
  label text not null default '' check (char_length(label) <= 120),
  config jsonb not null check (jsonb_typeof(config) = 'object' and octet_length(config::text) <= 32768),
  created_by uuid references public.users (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who published or disabled which code, with the configured rewards and rules at that moment.
create table public.secret_code_audit (
  id bigint generated always as identity primary key,
  code_id uuid not null references public.secret_codes (id) on delete cascade,
  action text not null check (action in ('publish', 'disable')),
  actor uuid references public.users (id) on delete set null,
  via text not null check (via in ('app', 'cli')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index secret_code_audit_code on public.secret_code_audit (code_id, created_at desc);

-- Several redemptions per account and code are now possible (per_account_limit), each with an
-- optional request id for safe retries, and the achievements the code unlocked (provenance).
alter table public.secret_code_redemptions drop constraint secret_code_redemptions_pkey;
alter table public.secret_code_redemptions
  add column id bigint generated always as identity primary key,
  add column request_id uuid,
  add column achievements text[] not null default '{}',
  add column achievements_new text[] not null default '{}';
create index secret_code_redemptions_code_user on public.secret_code_redemptions (code_id, user_id);
create unique index secret_code_redemptions_request on public.secret_code_redemptions (user_id, request_id) where request_id is not null;

alter table public.secret_code_achievements enable row level security;
alter table public.secret_code_allowlist enable row level security;
alter table public.secret_code_drafts enable row level security;
alter table public.secret_code_audit enable row level security;
revoke all on public.secret_code_achievements, public.secret_code_allowlist, public.secret_code_drafts, public.secret_code_audit
  from public, anon, authenticated;
grant all on public.secret_code_achievements, public.secret_code_allowlist, public.secret_code_drafts, public.secret_code_audit
  to service_role;

-- Achievements unlocked by a code say so ('code'); gameplay records and scores are never touched.
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'public.user_achievements'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table public.user_achievements drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.user_achievements
  add constraint user_achievements_source_check check (source in ('event', 'backfill', 'code'));

-- ---------------------------------------------------------------------------
-- 3. Creating and disabling (shared by the app and `npm run codes`)
-- ---------------------------------------------------------------------------
create function public._secret_code_json(p_code public.secret_codes)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_code.id,
    'label', p_code.label,
    'format', p_code.format,
    'coins', p_code.coins,
    'items', coalesce((select jsonb_agg(i.item_id order by i.item_id) from public.secret_code_items i where i.code_id = p_code.id), '[]'::jsonb),
    'achievements', coalesce((select jsonb_agg(a.achievement_id order by a.achievement_id) from public.secret_code_achievements a where a.code_id = p_code.id), '[]'::jsonb),
    'audience', p_code.audience,
    'allowlistCount', (select count(*) from public.secret_code_allowlist l where l.code_id = p_code.id),
    'startsAt', p_code.starts_at,
    'expiresAt', p_code.expires_at,
    'maxRedemptions', p_code.max_redemptions,
    'perAccountLimit', p_code.per_account_limit,
    'redemptionCount', p_code.redemption_count,
    'disabledAt', p_code.disabled_at,
    'createdAt', p_code.created_at,
    'createdBy', p_code.created_by
  );
$$;
revoke all on function public._secret_code_json(public.secret_codes) from public, anon, authenticated;

create function public._create_secret_code(
  p_actor uuid,
  p_via text,
  p_code_hash text,
  p_loose_hash text,
  p_format text,
  p_label text,
  p_coins integer,
  p_items text[],
  p_achievements text[],
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_max_redemptions integer,
  p_per_account_limit integer,
  p_audience text,
  p_allowlist uuid[]
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_code public.secret_codes;
  v_missing text;
  v_loose text := coalesce(p_loose_hash, p_code_hash);
  v_label text := btrim(coalesce(p_label, ''));
  v_coins integer := coalesce(p_coins, 0);
  v_items text[] := array(select distinct item from unnest(coalesce(p_items, '{}')) as item order by item);
  v_achievements text[] := array(select distinct a from unnest(coalesce(p_achievements, '{}')) as a order by a);
  v_allowlist uuid[] := array(select distinct u from unnest(coalesce(p_allowlist, '{}')) as u);
  v_audience text := coalesce(p_audience, 'everyone');
  v_per_account integer := coalesce(p_per_account_limit, 1);
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
  if char_length(v_label) not between 1 and 120 then
    raise exception 'Give the code a label of 1 to 120 characters.' using errcode = '22023';
  end if;
  if v_coins not between 0 and 100000 then
    raise exception 'Coins must be a whole number from 0 to 100,000.' using errcode = '22023';
  end if;
  if v_coins = 0 and cardinality(v_items) = 0 and cardinality(v_achievements) = 0 then
    raise exception 'A code needs coins, cosmetics, achievements or a combination.' using errcode = '22023';
  end if;
  if cardinality(v_items) > 100 or cardinality(v_achievements) > 50 then
    raise exception 'A code can grant at most 100 cosmetics and 50 achievements.' using errcode = '22023';
  end if;
  select string_agg(item, ', ') into v_missing
    from unnest(v_items) as item
   where not exists (select 1 from public.cosmetic_items c where c.id = item);
  if v_missing is not null then
    raise exception 'Unknown cosmetic items: %', v_missing using errcode = '22023';
  end if;
  select string_agg(a, ', ') into v_missing
    from unnest(v_achievements) as a
   where not exists (select 1 from public.achievement_definitions d where d.id = a);
  if v_missing is not null then
    raise exception 'Unknown achievements: %', v_missing using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiry date is in the past.' using errcode = '22023';
  end if;
  if p_starts_at is not null and p_expires_at is not null and p_expires_at <= p_starts_at then
    raise exception 'The code must expire after it starts.' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions not between 1 and 1000000 then
    raise exception 'The total limit must be between 1 and 1,000,000 redemptions.' using errcode = '22023';
  end if;
  if v_per_account not between 1 and 100 then
    raise exception 'The per-account limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if v_audience not in ('everyone', 'allowlist') then
    raise exception 'Choose who can redeem the code.' using errcode = '22023';
  end if;
  if v_audience = 'allowlist' and cardinality(v_allowlist) not between 1 and 500 then
    raise exception 'An allowlist code needs 1 to 500 accounts.' using errcode = '22023';
  end if;
  if v_audience = 'everyone' and cardinality(v_allowlist) > 0 then
    raise exception 'Codes for everyone don''t take an allowlist.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_allowlist) as u where not exists (select 1 from public.users x where x.id = u)) then
    raise exception 'Some selected accounts no longer exist.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.secret_codes
     where loose_hash = decode(v_loose, 'hex') or code_hash = decode(p_code_hash, 'hex')
  ) then
    raise exception 'That code already exists, or one that differs only in case, spacing or punctuation. Codes can''t be reused, even after they expire or are disabled.'
      using errcode = '23505', hint = 'duplicate_code';
  end if;

  insert into public.secret_codes (
    code_hash, loose_hash, format, label, coins, starts_at, expires_at, max_redemptions, per_account_limit, audience, created_by
  )
  values (
    decode(p_code_hash, 'hex'), decode(v_loose, 'hex'), p_format, v_label, v_coins, p_starts_at, p_expires_at,
    p_max_redemptions, v_per_account, v_audience, p_actor
  )
  returning * into v_code;
  v_id := v_code.id;
  insert into public.secret_code_items (code_id, item_id) select v_id, item from unnest(v_items) as item;
  insert into public.secret_code_achievements (code_id, achievement_id) select v_id, a from unnest(v_achievements) as a;
  insert into public.secret_code_allowlist (code_id, user_id) select v_id, u from unnest(v_allowlist) as u;

  insert into public.secret_code_audit (code_id, action, actor, via, details)
  values (v_id, 'publish', p_actor, coalesce(p_via, 'cli'), public._secret_code_json(v_code) || jsonb_build_object('allowlist', to_jsonb(v_allowlist)));
  return v_id;
end;
$$;
revoke all on function public._create_secret_code(uuid, text, text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[])
  from public, anon, authenticated;

create function public._disable_secret_code(p_actor uuid, p_via text, p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.secret_codes set disabled_at = now() where id = p_id and disabled_at is null;
  if not found then
    return false;
  end if;
  insert into public.secret_code_audit (code_id, action, actor, via) values (p_id, 'disable', p_actor, coalesce(p_via, 'cli'));
  return true;
end;
$$;
revoke all on function public._disable_secret_code(uuid, text, uuid) from public, anon, authenticated;

-- The CLI functions keep their signatures and behaviour (one redemption per account, for everyone).
create or replace function public.admin_create_secret_code(
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
begin
  return public._create_secret_code(
    null, 'cli', p_code_hash, p_loose_hash, p_format, p_label, p_coins, p_items, '{}',
    null, p_expires_at, p_max_redemptions, 1, 'everyone', '{}'
  );
end;
$$;

create or replace function public.admin_disable_secret_code(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  return public._disable_secret_code(null, 'cli', p_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin panel functions (signed-in administrators only, checked inside each one)
-- ---------------------------------------------------------------------------
create function public._admin_account_json(p_user uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', u.id, 'name', u.display_name, 'email', au.email, 'avatarUrl', u.avatar_url)
    from public.users u
    left join auth.users au on au.id = u.id
   where u.id = p_user;
$$;
revoke all on function public._admin_account_json(uuid) from public, anon, authenticated;

-- Every cosmetic (hidden and exclusive ones too) and every achievement with its own reward.
create function public.admin_vault_catalog()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'source', c.source, 'secret', c.secret, 'available', c.available,
        'price', c.price, 'game', c.game, 'category', c.category
      ) order by c.kind, c.id)
      from public.cosmetic_items c
    ), '[]'::jsonb),
    'achievements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'coins', d.reward_coins, 'hidden', d.hidden,
        'items', coalesce((select jsonb_agg(ri.item_id order by ri.position, ri.item_id) from public.achievement_reward_items ri where ri.achievement_id = d.id), '[]'::jsonb)
      ) order by d.display_order)
      from public.achievement_definitions d
    ), '[]'::jsonb)
  );
end;
$$;

create function public.admin_vault_overview()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'codes', coalesce((
      select jsonb_agg(public._secret_code_json(c) || jsonb_build_object('createdByName', u.display_name) order by c.created_at desc)
        from public.secret_codes c
        left join public.users u on u.id = c.created_by
       where c.id in (select id from public.secret_codes order by created_at desc limit 1000)
    ), '[]'::jsonb),
    'drafts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'label', d.label, 'config', d.config, 'updatedAt', d.updated_at, 'updatedByName', u.display_name
      ) order by d.updated_at desc)
        from public.secret_code_drafts d
        left join public.users u on u.id = coalesce(d.updated_by, d.created_by)
    ), '[]'::jsonb)
  );
end;
$$;

create function public.admin_vault_code(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code public.secret_codes;
begin
  perform public._require_admin();
  select * into v_code from public.secret_codes where id = p_id;
  if not found then
    return null;
  end if;
  return public._secret_code_json(v_code) || jsonb_build_object(
    'createdByName', (select display_name from public.users where id = v_code.created_by),
    'allowlist', coalesce((
      select jsonb_agg(public._admin_account_json(l.user_id))
        from public.secret_code_allowlist l where l.code_id = p_id
    ), '[]'::jsonb),
    'redemptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'account', public._admin_account_json(r.user_id), 'redeemedAt', r.redeemed_at,
        'coins', r.coins, 'items', to_jsonb(r.items), 'achievements', to_jsonb(r.achievements), 'achievementsNew', to_jsonb(r.achievements_new)
      ) order by r.redeemed_at desc, r.id desc)
        from (select * from public.secret_code_redemptions where code_id = p_id order by redeemed_at desc, id desc limit 500) r
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', a.action, 'via', a.via, 'at', a.created_at,
        'actor', case when a.actor is null then null else public._admin_account_json(a.actor) end
      ) order by a.created_at desc, a.id desc)
        from public.secret_code_audit a where a.code_id = p_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Account lookup for allowlists: by name, email or id (p_query), or the given ids (p_ids).
create function public.admin_vault_accounts(p_query text default null, p_ids uuid[] default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_query text := left(btrim(coalesce(p_query, '')), 100);
  v_pattern text;
begin
  perform public._require_admin();
  if p_ids is not null then
    return coalesce((
      select jsonb_agg(public._admin_account_json(u.id))
        from public.users u where u.id = any (p_ids[1:500])
    ), '[]'::jsonb);
  end if;
  if char_length(v_query) < 2 then
    return '[]'::jsonb;
  end if;
  v_pattern := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return coalesce((
    select jsonb_agg(public._admin_account_json(s.id))
      from (
        select u.id
          from public.users u
          left join auth.users au on au.id = u.id
         where u.id::text = lower(v_query) or u.display_name ilike v_pattern or au.email ilike v_pattern
         order by (lower(au.email) = lower(v_query)) desc nulls last, u.display_name nulls last, au.email
         limit 20
      ) s
  ), '[]'::jsonb);
end;
$$;

create function public.admin_vault_publish(
  p_code_hash text,
  p_loose_hash text,
  p_format text,
  p_label text,
  p_coins integer,
  p_items text[],
  p_achievements text[],
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_max_redemptions integer,
  p_per_account_limit integer,
  p_audience text,
  p_allowlist uuid[],
  p_confirm_repeat boolean,
  p_draft uuid default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._require_admin();
  v_id uuid;
begin
  if coalesce(p_coins, 0) > 0 and coalesce(p_per_account_limit, 1) > 1 and not coalesce(p_confirm_repeat, false) then
    raise exception 'Confirm the maximum payout of this repeatable coin code before publishing.' using errcode = '22023', hint = 'confirm_repeat';
  end if;
  v_id := public._create_secret_code(
    v_actor, 'app', p_code_hash, p_loose_hash, p_format, p_label, p_coins, p_items, p_achievements,
    p_starts_at, p_expires_at, p_max_redemptions, p_per_account_limit, p_audience, p_allowlist
  );
  if p_draft is not null then
    delete from public.secret_code_drafts where id = p_draft;
  end if;
  return v_id;
end;
$$;

create function public.admin_vault_disable(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  return public._disable_secret_code(public._require_admin(), 'app', p_id);
end;
$$;

create function public.admin_vault_save_draft(p_id uuid, p_label text, p_config jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := public._require_admin();
  v_label text := left(btrim(coalesce(p_label, '')), 120);
  v_id uuid;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' or octet_length(p_config::text) > 32768 then
    raise exception 'That draft can''t be saved.' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.secret_code_drafts (label, config, created_by, updated_by)
    values (v_label, p_config, v_actor, v_actor)
    returning id into v_id;
  else
    update public.secret_code_drafts
       set label = v_label, config = p_config, updated_by = v_actor, updated_at = now()
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'That draft no longer exists. It may have been published or deleted.' using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$$;

create function public.admin_vault_delete_draft(p_id uuid)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  delete from public.secret_code_drafts where id = p_id;
  return found;
end;
$$;

revoke all on function public.admin_vault_catalog() from public, anon;
revoke all on function public.admin_vault_overview() from public, anon;
revoke all on function public.admin_vault_code(uuid) from public, anon;
revoke all on function public.admin_vault_accounts(text, uuid[]) from public, anon;
revoke all on function public.admin_vault_publish(text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean, uuid) from public, anon;
revoke all on function public.admin_vault_disable(uuid) from public, anon;
revoke all on function public.admin_vault_save_draft(uuid, text, jsonb) from public, anon;
revoke all on function public.admin_vault_delete_draft(uuid) from public, anon;
grant execute on function public.admin_vault_catalog() to authenticated;
grant execute on function public.admin_vault_overview() to authenticated;
grant execute on function public.admin_vault_code(uuid) to authenticated;
grant execute on function public.admin_vault_accounts(text, uuid[]) to authenticated;
grant execute on function public.admin_vault_publish(text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, integer, text, uuid[], boolean, uuid) to authenticated;
grant execute on function public.admin_vault_disable(uuid) to authenticated;
grant execute on function public.admin_vault_save_draft(uuid, text, jsonb) to authenticated;
grant execute on function public.admin_vault_delete_draft(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Redeeming
-- ---------------------------------------------------------------------------

-- As before (hashes, throttling, answers), plus: codes that haven't started yet answer 'unavailable';
-- allowlist codes answer 'unknown' to accounts not on the list (the list never leaks); 'already' means
-- the account reached the code's per-account limit; achievements unlock through the achievement system
-- (their own reward once per account, earlier unlocks keep their date); and a repeated p_request answers
-- 'already' with what that request granted, never granting twice.
drop function public.redeem_vault_code(text, text);
create function public.redeem_vault_code(p_loose_hash text, p_phrase_hash text default null, p_request uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_code public.secret_codes;
  v_last public.secret_code_redemptions;
  v_match boolean;
  v_open boolean := false;
  v_used integer;
  v_recent integer;
  v_daily integer;
  v_retry timestamptz;
  v_items text[];
  v_owned text[];
  v_achievements text[];
  v_new_achievements text[] := '{}';
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if p_loose_hash is null or p_loose_hash !~ '^[0-9a-f]{64}$' or p_phrase_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'That doesn''t look like a code.' using errcode = '22023';
  end if;

  -- One redemption at a time per account, so throttling, limits and grants can't race each other.
  perform pg_advisory_xact_lock(hashtextextended('secret_codes:' || v_user::text, 0));

  if p_request is not null then
    select * into v_last from public.secret_code_redemptions where user_id = v_user and request_id = p_request;
    if found then
      return jsonb_build_object(
        'status', 'already', 'coins', v_last.coins, 'items', to_jsonb(v_last.items), 'achievements', to_jsonb(v_last.achievements),
        'redeemedAt', v_last.redeemed_at, 'balance', public._wallet_balance(v_user)
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

  -- The row lock serializes every redemption of this code, so the total limit holds under load.
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
        'redeemedAt', v_last.redeemed_at, 'balance', public._wallet_balance(v_user)
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
  -- What the account owned before anything below, so "new" stays true for items an unlocked
  -- achievement happens to grant as well (granted once either way).
  select coalesce(array_agg(item_id), '{}') into v_owned from public.user_cosmetics where user_id = v_user and item_id = any (v_items);

  if cardinality(v_achievements) > 0 then
    -- Same order as gameplay events: progress, unlock, then the achievement's own reward.
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

  insert into public.coin_wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_balance from public.coin_wallets where user_id = v_user for update;
  if v_code.coins > 0 then
    update public.coin_wallets set balance = balance + v_code.coins, updated_at = now()
     where user_id = v_user
    returning balance into v_balance;
    insert into public.coin_transactions (user_id, amount, balance_after, kind, reference, details)
    values (v_user, v_code.coins, v_balance, 'code', 'code:' || v_code.id::text, jsonb_build_object('items', to_jsonb(v_items), 'achievements', to_jsonb(v_achievements)));
  end if;

  insert into public.secret_code_redemptions (code_id, user_id, coins, items, achievements, achievements_new, request_id)
  values (v_code.id, v_user, v_code.coins, v_items, v_achievements, v_new_achievements, p_request);
  update public.secret_codes set redemption_count = redemption_count + 1 where id = v_code.id;
  insert into public.secret_code_attempts (user_id, succeeded) values (v_user, true);

  return jsonb_build_object(
    'status', 'unlocked',
    'coins', v_code.coins,
    'items', to_jsonb(v_items),
    'newItems', to_jsonb(array(select item from unnest(v_items) as item where item <> all (v_owned) order by item)),
    'achievements', to_jsonb(v_achievements),
    'newAchievements', to_jsonb(v_new_achievements),
    'balance', v_balance
  );
end;
$$;
revoke all on function public.redeem_vault_code(text, text, uuid) from public, anon;
grant execute on function public.redeem_vault_code(text, text, uuid) to authenticated;
