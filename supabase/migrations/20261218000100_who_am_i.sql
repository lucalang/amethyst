-- Who Am I?: a live, turn-based Wager round between the two players of a match.
--
-- A Who Am I? round is one duel played on the server. Each player has a secret character from a shared roster
-- (mirrored from src/lib/who-am-i.ts); each may see the other's but never their own until the round ends. Players
-- take turns asking a yes/no question about themselves (a predefined card, or a custom question when BOTH players
-- opted in) or guessing. Card answers are checked against the character's traits; guesses are checked here; the
-- first correct guess wins. The client never sends a winner, an identity or a finished round.
--
-- The result feeds the existing Wager machinery unchanged: the winner's wager_attempts row is scored 1 and the
-- loser's 0 (or 'invalid' after a timeout or no-show, which _wager_tick reads as a forfeit). _wager_tick then
-- resolves the round, opens the next one and settles the stake exactly as for every other game.
--
-- Locking: every path locks the wager row first (as the other wager functions do), then the game row.
begin;

-- ---------------------------------------------------------------------------
-- Roster and cards (no client access: answers are checked here)
-- ---------------------------------------------------------------------------
create table public.whoami_characters (
  id text primary key check (id ~ '^[a-z]{1,24}$'),
  name text not null,
  traits jsonb not null check (jsonb_typeof(traits) = 'object'),
  playable boolean not null default true
);

create table public.whoami_cards (
  id text primary key check (id ~ '^[a-z-]{1,24}$'),
  trait text not null,
  op text not null check (op in ('eq', 'ne')),
  value text not null
);

-- ---------------------------------------------------------------------------
-- Match state (no client access; read through whoami_state / whoami_act)
-- ---------------------------------------------------------------------------
create table public.whoami_games (
  wager_id uuid not null,
  round integer not null,
  phase text not null default 'lobby' check (phase in ('lobby', 'ask', 'answer', 'done')),
  host_joined_at timestamptz,
  opponent_joined_at timestamptz,
  started_at timestamptz,
  host_identity text references public.whoami_characters (id),
  opponent_identity text references public.whoami_characters (id),
  -- Whose turn it is to ask or guess; in 'answer' the other player answers.
  turn text check (turn in ('host', 'opponent')),
  -- The deadline of the move the game is waiting for.
  deadline timestamptz,
  -- The question awaiting an answer: {kind: card|custom, card, text}.
  pending jsonb,
  seq integer not null default 0,
  turns integer not null default 0,
  host_strikes integer not null default 0,
  opponent_strikes integer not null default 0,
  winner text check (winner in ('host', 'opponent')),
  reason text check (reason in ('guess', 'timeout', 'no_show', 'turn_limit')),
  ended_at timestamptz,
  primary key (wager_id, round),
  foreign key (wager_id, round) references public.wager_rounds (wager_id, round) on delete cascade,
  check (host_identity is null or opponent_identity is null or host_identity <> opponent_identity)
);

create table public.whoami_events (
  wager_id uuid not null,
  round integer not null,
  seq integer not null,
  actor text not null check (actor in ('host', 'opponent', 'system')),
  kind text not null check (kind in ('start', 'ask', 'answer', 'guess', 'timeout', 'end')),
  card text references public.whoami_cards (id),
  body text check (body is null or char_length(body) between 3 and 140),
  answer text check (answer in ('yes', 'no', 'unsure', 'none')),
  guess text references public.whoami_characters (id),
  correct boolean,
  auto boolean not null default false,
  -- The client's request id: a repeated request is answered with the current state instead of acting twice.
  request uuid,
  created_at timestamptz not null default now(),
  primary key (wager_id, round, seq),
  foreign key (wager_id, round) references public.whoami_games (wager_id, round) on delete cascade
);
create unique index whoami_events_request on public.whoami_events (wager_id, round, request) where request is not null;

-- Custom questions are off unless both players of the match opt in (and stay opted in).
create table public.whoami_consent (
  wager_id uuid not null references public.wagers (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  custom boolean not null,
  decided_at timestamptz not null default now(),
  primary key (wager_id, user_id)
);

alter table public.whoami_characters enable row level security;
alter table public.whoami_cards enable row level security;
alter table public.whoami_games enable row level security;
alter table public.whoami_events enable row level security;
alter table public.whoami_consent enable row level security;
revoke all on public.whoami_characters, public.whoami_cards, public.whoami_games, public.whoami_events, public.whoami_consent
  from public, anon, authenticated;
grant all on public.whoami_characters, public.whoami_cards, public.whoami_games, public.whoami_events, public.whoami_consent
  to service_role;

-- Generated from src/lib/who-am-i.ts (PLAYABLE and CARDS). Keep both in sync.
insert into public.whoami_characters (id, name, traits) values
  ('aster', 'Aster', '{"gem":"amethyst","hair":"long","hairColor":"violet","headwear":"none","glasses":"no","beard":"no","earrings":"yes","smiling":"yes","scarf":"no","companion":"no"}'::jsonb),
  ('bram', 'Bram', '{"gem":"emerald","hair":"short","hairColor":"dark","headwear":"cap","glasses":"no","beard":"yes","earrings":"no","smiling":"yes","scarf":"no","companion":"yes"}'::jsonb),
  ('cora', 'Cora', '{"gem":"sapphire","hair":"curly","hairColor":"red","headwear":"none","glasses":"yes","beard":"no","earrings":"yes","smiling":"no","scarf":"no","companion":"no"}'::jsonb),
  ('dax', 'Dax', '{"gem":"ruby","hair":"none","hairColor":"none","headwear":"none","glasses":"yes","beard":"no","earrings":"no","smiling":"no","scarf":"yes","companion":"no"}'::jsonb),
  ('elio', 'Elio', '{"gem":"topaz","hair":"short","hairColor":"gold","headwear":"crown","glasses":"no","beard":"no","earrings":"no","smiling":"yes","scarf":"no","companion":"no"}'::jsonb),
  ('fenna', 'Fenna', '{"gem":"emerald","hair":"long","hairColor":"gold","headwear":"flowers","glasses":"no","beard":"no","earrings":"yes","smiling":"yes","scarf":"no","companion":"yes"}'::jsonb),
  ('gil', 'Gil', '{"gem":"sapphire","hair":"short","hairColor":"silver","headwear":"wizard","glasses":"yes","beard":"yes","earrings":"no","smiling":"no","scarf":"no","companion":"yes"}'::jsonb),
  ('hana', 'Hana', '{"gem":"amethyst","hair":"curly","hairColor":"dark","headwear":"none","glasses":"no","beard":"no","earrings":"no","smiling":"yes","scarf":"yes","companion":"no"}'::jsonb),
  ('iris', 'Iris', '{"gem":"ruby","hair":"long","hairColor":"silver","headwear":"crown","glasses":"no","beard":"no","earrings":"yes","smiling":"no","scarf":"no","companion":"no"}'::jsonb),
  ('jory', 'Jory', '{"gem":"topaz","hair":"curly","hairColor":"red","headwear":"cap","glasses":"no","beard":"no","earrings":"no","smiling":"yes","scarf":"yes","companion":"yes"}'::jsonb),
  ('kit', 'Kit', '{"gem":"amethyst","hair":"short","hairColor":"red","headwear":"none","glasses":"yes","beard":"no","earrings":"no","smiling":"yes","scarf":"no","companion":"yes"}'::jsonb),
  ('luma', 'Luma', '{"gem":"sapphire","hair":"long","hairColor":"dark","headwear":"flowers","glasses":"no","beard":"no","earrings":"yes","smiling":"no","scarf":"yes","companion":"no"}'::jsonb),
  ('milo', 'Milo', '{"gem":"ruby","hair":"short","hairColor":"gold","headwear":"none","glasses":"no","beard":"yes","earrings":"no","smiling":"yes","scarf":"yes","companion":"no"}'::jsonb),
  ('nell', 'Nell', '{"gem":"emerald","hair":"curly","hairColor":"silver","headwear":"none","glasses":"yes","beard":"no","earrings":"yes","smiling":"no","scarf":"no","companion":"no"}'::jsonb),
  ('orin', 'Orin', '{"gem":"topaz","hair":"none","hairColor":"none","headwear":"wizard","glasses":"no","beard":"no","earrings":"no","smiling":"no","scarf":"no","companion":"yes"}'::jsonb),
  ('pip', 'Pip', '{"gem":"amethyst","hair":"short","hairColor":"gold","headwear":"cap","glasses":"yes","beard":"no","earrings":"no","smiling":"yes","scarf":"no","companion":"no"}'::jsonb),
  ('quill', 'Quill', '{"gem":"sapphire","hair":"curly","hairColor":"violet","headwear":"crown","glasses":"yes","beard":"no","earrings":"no","smiling":"yes","scarf":"no","companion":"no"}'::jsonb),
  ('rhea', 'Rhea', '{"gem":"ruby","hair":"long","hairColor":"red","headwear":"none","glasses":"no","beard":"no","earrings":"yes","smiling":"yes","scarf":"yes","companion":"no"}'::jsonb),
  ('sol', 'Sol', '{"gem":"topaz","hair":"short","hairColor":"dark","headwear":"none","glasses":"no","beard":"no","earrings":"no","smiling":"no","scarf":"yes","companion":"no"}'::jsonb),
  ('tamsin', 'Tamsin', '{"gem":"emerald","hair":"long","hairColor":"violet","headwear":"wizard","glasses":"no","beard":"no","earrings":"yes","smiling":"no","scarf":"no","companion":"no"}'::jsonb),
  ('uma', 'Uma', '{"gem":"amethyst","hair":"none","hairColor":"none","headwear":"flowers","glasses":"no","beard":"no","earrings":"yes","smiling":"yes","scarf":"no","companion":"no"}'::jsonb),
  ('vale', 'Vale', '{"gem":"sapphire","hair":"short","hairColor":"dark","headwear":"none","glasses":"no","beard":"yes","earrings":"no","smiling":"yes","scarf":"no","companion":"no"}'::jsonb),
  ('wren', 'Wren', '{"gem":"emerald","hair":"short","hairColor":"red","headwear":"none","glasses":"no","beard":"no","earrings":"no","smiling":"no","scarf":"no","companion":"yes"}'::jsonb),
  ('zed', 'Zed', '{"gem":"ruby","hair":"curly","hairColor":"dark","headwear":"cap","glasses":"yes","beard":"yes","earrings":"no","smiling":"yes","scarf":"no","companion":"no"}'::jsonb);
insert into public.whoami_cards (id, trait, op, value) values
  ('gem-amethyst', 'gem', 'eq', 'amethyst'),
  ('gem-emerald', 'gem', 'eq', 'emerald'),
  ('gem-sapphire', 'gem', 'eq', 'sapphire'),
  ('gem-ruby', 'gem', 'eq', 'ruby'),
  ('gem-topaz', 'gem', 'eq', 'topaz'),
  ('hair-none', 'hair', 'eq', 'none'),
  ('hair-short', 'hair', 'eq', 'short'),
  ('hair-long', 'hair', 'eq', 'long'),
  ('hair-curly', 'hair', 'eq', 'curly'),
  ('color-dark', 'hairColor', 'eq', 'dark'),
  ('color-gold', 'hairColor', 'eq', 'gold'),
  ('color-red', 'hairColor', 'eq', 'red'),
  ('color-silver', 'hairColor', 'eq', 'silver'),
  ('color-violet', 'hairColor', 'eq', 'violet'),
  ('head-any', 'headwear', 'ne', 'none'),
  ('head-crown', 'headwear', 'eq', 'crown'),
  ('head-wizard', 'headwear', 'eq', 'wizard'),
  ('head-cap', 'headwear', 'eq', 'cap'),
  ('head-flowers', 'headwear', 'eq', 'flowers'),
  ('glasses', 'glasses', 'eq', 'yes'),
  ('beard', 'beard', 'eq', 'yes'),
  ('earrings', 'earrings', 'eq', 'yes'),
  ('smiling', 'smiling', 'eq', 'yes'),
  ('scarf', 'scarf', 'eq', 'yes'),
  ('companion', 'companion', 'eq', 'yes');

-- ---------------------------------------------------------------------------
-- Wager hooks: Who Am I? is a wager game with one board (''); it never starts an arcade run.
-- ---------------------------------------------------------------------------
create or replace function public._wager_board_direction(p_game text, p_board text)
returns text
language plpgsql stable set search_path = '' as $$
begin
  if p_game is null or p_board is null or p_board like 'daily-%' then
    return null;
  end if;
  if p_game = 'who-am-i' then
    return case when p_board = '' then 'high' end;
  end if;
  if p_game = 'sudoku' then
    return case when p_board ~ '^((mini|xxl)-)?(easy|medium|hard)$' then 'low' end;
  end if;
  if p_game = 'snake' and p_board like 'peace-%' then
    return null;
  end if;
  return case when public._arcade_board_valid(p_game, p_board) then 'high' end;
end;
$$;
revoke all on function public._wager_board_direction(text, text) from public, anon, authenticated;

-- Score runs only: a Who Am I? round is joined through whoami_act.
create or replace function public.start_wager_attempt(p_wager uuid, p_round integer, p_game text, p_board text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  w public.wagers;
  rd public.wager_rounds;
  v_run uuid;
begin
  perform public._wager_tick(p_wager, true);
  select * into w from public.wagers where id = p_wager and v_user in (host_id, opponent_id) for update;
  if not found then
    raise exception 'That match was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  if w.status <> 'active' or w.current_round <> p_round then
    raise exception 'This round is already over.' using errcode = 'P0001', hint = 'wager_round_closed';
  end if;
  select * into rd from public.wager_rounds where wager_id = w.id and round = w.current_round;
  if p_game is distinct from rd.game or p_board is distinct from rd.board or rd.game = 'who-am-i' then
    raise exception 'That isn''t this round''s game.' using errcode = '22023';
  end if;
  if exists (select 1 from public.wager_attempts where wager_id = w.id and round = rd.round and user_id = v_user) then
    raise exception 'You''ve already played this round.' using errcode = 'P0001', hint = 'wager_attempt_used';
  end if;
  v_run := public._competitive_start_run(v_user, rd.game, rd.board);
  insert into public.wager_attempts (wager_id, round, user_id, run_id) values (w.id, rd.round, v_user, v_run);
  return v_run;
end;
$$;
revoke all on function public.start_wager_attempt(uuid, integer, text, text) from public, anon;
grant execute on function public.start_wager_attempt(uuid, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create function public._whoami_other(p_side text)
returns text
language sql immutable set search_path = '' as $$
  select case when p_side = 'host' then 'opponent' else 'host' end;
$$;
revoke all on function public._whoami_other(text) from public, anon, authenticated;

-- The truthful answer to a card for a character (null if either is unknown).
create function public._whoami_truth(p_character text, p_card text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case c.op when 'eq' then (ch.traits ->> c.trait) = c.value else (ch.traits ->> c.trait) is distinct from c.value end
    from public.whoami_characters ch, public.whoami_cards c
   where ch.id = p_character and c.id = p_card;
$$;
revoke all on function public._whoami_truth(text, text) from public, anon, authenticated;

-- Appends one event and bumps the game's sequence number.
create function public._whoami_log(p_wager uuid, p_round integer, p_actor text, p_kind text, p_card text, p_body text,
  p_answer text, p_guess text, p_correct boolean, p_auto boolean, p_request uuid)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_seq integer;
begin
  update public.whoami_games set seq = seq + 1 where wager_id = p_wager and round = p_round returning seq into v_seq;
  insert into public.whoami_events (wager_id, round, seq, actor, kind, card, body, answer, guess, correct, auto, request)
  values (p_wager, p_round, v_seq, p_actor, p_kind, p_card, p_body, p_answer, p_guess, p_correct, coalesce(p_auto, false), p_request);
  return v_seq;
end;
$$;
revoke all on function public._whoami_log(uuid, integer, text, text, text, text, text, text, boolean, boolean, uuid) from public, anon, authenticated;

-- Ends a game once and records it as the round's attempts; _wager_tick then resolves the round.
-- p_winner null is a tie (both score 0). After a timeout or no-show the loser's attempt is 'invalid' (a forfeit).
create function public._whoami_finish(p_wager uuid, p_round integer, p_winner text, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wagers;
  g public.whoami_games;
  v_win uuid;
  v_lose uuid;
begin
  select * into w from public.wagers where id = p_wager;
  update public.whoami_games
     set phase = 'done', winner = p_winner, reason = p_reason, ended_at = now(), deadline = null, pending = null
   where wager_id = p_wager and round = p_round and phase <> 'done'
  returning * into g;
  if not found then
    return;
  end if;
  perform public._whoami_log(p_wager, p_round, 'system', 'end', null, null, null, null, null, false, null);
  if p_winner is null then
    update public.wager_attempts set status = 'scored', score = 0, finished_at = now()
     where wager_id = p_wager and round = p_round and status = 'playing';
    return;
  end if;
  v_win := case when p_winner = 'host' then w.host_id else w.opponent_id end;
  v_lose := case when p_winner = 'host' then w.opponent_id else w.host_id end;
  update public.wager_attempts set status = 'scored', score = 1, finished_at = now()
   where wager_id = p_wager and round = p_round and user_id = v_win and status = 'playing';
  update public.wager_attempts
     set status = case when p_reason = 'guess' then 'scored' else 'invalid' end,
         score = case when p_reason = 'guess' then 0 end,
         finished_at = now()
   where wager_id = p_wager and round = p_round and user_id = v_lose and status = 'playing';
end;
$$;
revoke all on function public._whoami_finish(uuid, integer, text, text) from public, anon, authenticated;

-- Applies missed deadlines (the caller holds the wager row). A missed ask passes the turn; a missed card answer
-- is answered truthfully by the server; a missed custom answer counts as "no answer". Each miss is a strike, and a
-- second strike in a row loses the round. A lobby where only one player turned up by the round deadline goes to
-- that player. While a game runs, the round deadline stays ahead of the move deadline.
create function public._whoami_tick(p_wager uuid, p_round integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  rd public.wager_rounds;
  g public.whoami_games;
  v_step constant interval := interval '120 seconds';
  v_missed text;
  v_truth boolean;
  v_strikes integer;
begin
  select * into rd from public.wager_rounds where wager_id = p_wager and round = p_round;
  if not found or rd.resolved_at is not null then
    return;
  end if;
  select * into g from public.whoami_games where wager_id = p_wager and round = p_round for update;
  if not found or g.phase = 'done' then
    return;
  end if;
  if g.phase = 'lobby' then
    if now() >= rd.deadline and (g.host_joined_at is null) <> (g.opponent_joined_at is null) then
      perform public._whoami_finish(p_wager, p_round, case when g.host_joined_at is not null then 'host' else 'opponent' end, 'no_show');
    end if;
    return;
  end if;

  while g.phase in ('ask', 'answer') and now() >= g.deadline loop
    if g.phase = 'ask' then
      v_missed := g.turn;
      perform public._whoami_log(p_wager, p_round, v_missed, 'timeout', null, null, null, null, null, true, null);
    else
      v_missed := public._whoami_other(g.turn);
      if g.pending ->> 'kind' = 'card' then
        v_truth := public._whoami_truth(case when g.turn = 'host' then g.host_identity else g.opponent_identity end, g.pending ->> 'card');
        perform public._whoami_log(p_wager, p_round, v_missed, 'answer', g.pending ->> 'card', null,
          case when v_truth then 'yes' else 'no' end, null, null, true, null);
      else
        perform public._whoami_log(p_wager, p_round, v_missed, 'answer', null, null, 'none', null, null, true, null);
      end if;
    end if;
    -- After a missed ask the other player asks; after a missed answer the answerer's own turn comes up as usual.
    update public.whoami_games
       set host_strikes = host_strikes + (v_missed = 'host')::integer,
           opponent_strikes = opponent_strikes + (v_missed = 'opponent')::integer,
           phase = 'ask', pending = null,
           turn = case when g.phase = 'ask' then public._whoami_other(g.turn) else v_missed end,
           turns = turns + 1,
           deadline = g.deadline + v_step
     where wager_id = p_wager and round = p_round
    returning * into g;
    v_strikes := case when v_missed = 'host' then g.host_strikes else g.opponent_strikes end;
    if v_strikes >= 2 then
      perform public._whoami_finish(p_wager, p_round, public._whoami_other(v_missed), 'timeout');
      return;
    end if;
    if g.turns >= 80 then
      perform public._whoami_finish(p_wager, p_round, null, 'turn_limit');
      return;
    end if;
  end loop;
  update public.wager_rounds set deadline = greatest(deadline, g.deadline + interval '10 minutes')
   where wager_id = p_wager and round = p_round;
end;
$$;
revoke all on function public._whoami_tick(uuid, integer) from public, anon, authenticated;

-- The wager tick with one addition: a Who Am I? round applies its move deadlines before the round is checked.
create or replace function public._wager_tick(p_wager uuid, p_wait boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.wagers;
  rd public.wager_rounds;
  ah public.wager_attempts;
  ao public.wager_attempts;
  v_hs integer;
  v_os integer;
  v_outcome text;
  v_reason text;
  v_prev text;
begin
  if p_wait then
    select * into w from public.wagers where id = p_wager for update;
  else
    select * into w from public.wagers where id = p_wager for update skip locked;
  end if;
  if not found then
    return;
  end if;
  if w.status = 'open' and now() >= w.expires_at then
    perform public._wager_settle(w.id, 'expired', null, 'expired');
    return;
  end if;

  while w.status = 'active' loop
    select * into rd from public.wager_rounds where wager_id = w.id and round = w.current_round;
    exit when not found or rd.resolved_at is not null;
    if rd.game = 'who-am-i' then
      perform public._whoami_tick(w.id, rd.round);
      select * into rd from public.wager_rounds where wager_id = w.id and round = rd.round;
    end if;
    ah := null;
    ao := null;
    select * into ah from public.wager_attempts where wager_id = w.id and round = rd.round and user_id = w.host_id;
    select * into ao from public.wager_attempts where wager_id = w.id and round = rd.round and user_id = w.opponent_id;
    exit when now() < rd.deadline
          and not (coalesce(ah.status, 'none') in ('scored', 'invalid', 'late') and coalesce(ao.status, 'none') in ('scored', 'invalid', 'late'));

    v_hs := case when ah.status = 'scored' then ah.score end;
    v_os := case when ao.status = 'scored' then ao.score end;
    if v_hs is not null and v_os is not null then
      if v_hs = v_os then
        v_outcome := 'tie';
      elsif (case when rd.direction = 'high' then v_hs > v_os else v_hs < v_os end) then
        v_outcome := 'host';
      else
        v_outcome := 'opponent';
      end if;
      v_reason := case when v_outcome = 'tie' then 'tie' else 'score' end;
    elsif v_hs is not null then
      v_outcome := 'host';
      v_reason := 'forfeit';
    elsif v_os is not null then
      v_outcome := 'opponent';
      v_reason := 'forfeit';
    else
      v_outcome := 'void';
      v_reason := 'no_results';
    end if;

    update public.wager_rounds
       set host_score = v_hs, opponent_score = v_os, outcome = v_outcome, reason = v_reason, resolved_at = now()
     where wager_id = w.id and round = rd.round;
    update public.wagers
       set host_wins = host_wins + (v_outcome = 'host')::integer,
           opponent_wins = opponent_wins + (v_outcome = 'opponent')::integer
     where id = w.id
    returning * into w;

    select outcome into v_prev from public.wager_rounds where wager_id = w.id and round = rd.round - 1;
    if w.host_wins >= w.wins_needed then
      perform public._wager_settle(w.id, 'completed', w.host_id, 'wins');
    elsif w.opponent_wins >= w.wins_needed then
      perform public._wager_settle(w.id, 'completed', w.opponent_id, 'wins');
    elsif v_outcome = 'void' and v_prev = 'void' then
      perform public._wager_settle(w.id, 'abandoned', null, 'no_results');
    elsif rd.round >= w.max_rounds then
      if w.host_wins > w.opponent_wins then
        perform public._wager_settle(w.id, 'completed', w.host_id, 'round_limit');
      elsif w.opponent_wins > w.host_wins then
        perform public._wager_settle(w.id, 'completed', w.opponent_id, 'round_limit');
      else
        perform public._wager_settle(w.id, 'drawn', null, 'round_limit');
      end if;
    else
      perform public._wager_open_round(w.id, rd.round + 1);
    end if;
    select * into w from public.wagers where id = w.id;
  end loop;
end;
$$;
revoke all on function public._wager_tick(uuid, boolean) from public, anon, authenticated;

-- One round as a participant may see it: the opponent's identity once dealt, the caller's own only after the end.
create function public._whoami_json(p_wager uuid, p_round integer, p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  w public.wagers;
  rd public.wager_rounds;
  g public.whoami_games;
  v_me text;
  v_them uuid;
  v_custom_me boolean;
  v_custom_them boolean;
  v_active boolean;
begin
  select * into w from public.wagers where id = p_wager;
  select * into rd from public.wager_rounds where wager_id = p_wager and round = p_round;
  select * into g from public.whoami_games where wager_id = p_wager and round = p_round;
  v_me := case when w.host_id = p_user then 'host' else 'opponent' end;
  v_them := case when v_me = 'host' then w.opponent_id else w.host_id end;
  select custom into v_custom_me from public.whoami_consent where wager_id = w.id and user_id = p_user;
  select custom into v_custom_them from public.whoami_consent where wager_id = w.id and user_id = v_them;
  v_active := g.phase in ('ask', 'answer');
  return jsonb_build_object(
    'now', now(),
    'round', rd.round,
    'wagerStatus', w.status,
    'roundOutcome', rd.outcome,
    'phase', coalesce(g.phase, 'lobby'),
    'seq', coalesce(g.seq, 0),
    'joined', jsonb_build_object(
      'you', coalesce(case when v_me = 'host' then g.host_joined_at else g.opponent_joined_at end is not null, false),
      'them', coalesce(case when v_me = 'host' then g.opponent_joined_at else g.host_joined_at end is not null, false)),
    'names', jsonb_build_object('you', public._arcade_name(p_user), 'them', public._arcade_name(v_them)),
    'turn', case when not coalesce(v_active, false) then null when g.turn = v_me then 'you' else 'them' end,
    'deadline', case when v_active then g.deadline end,
    'roundDeadline', rd.deadline,
    'identity', jsonb_build_object(
      'you', case when g.phase = 'done' then (case when v_me = 'host' then g.host_identity else g.opponent_identity end) end,
      'them', case when v_me = 'host' then g.opponent_identity else g.host_identity end),
    'pending', case when g.phase = 'answer' then g.pending end,
    'custom', jsonb_build_object('you', v_custom_me, 'them', v_custom_them,
      'enabled', coalesce(v_custom_me, false) and coalesce(v_custom_them, false)),
    'strikes', jsonb_build_object(
      'you', coalesce(case when v_me = 'host' then g.host_strikes else g.opponent_strikes end, 0),
      'them', coalesce(case when v_me = 'host' then g.opponent_strikes else g.host_strikes end, 0)),
    'turns', coalesce(g.turns, 0),
    'winner', case when g.winner is null then null when g.winner = v_me then 'you' else 'them' end,
    'reason', g.reason,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'seq', e.seq,
               'by', case when e.actor = 'system' then 'system' when e.actor = v_me then 'you' else 'them' end,
               'kind', e.kind, 'card', e.card, 'text', e.body, 'answer', e.answer, 'guess', e.guess,
               'correct', e.correct, 'auto', e.auto, 'at', e.created_at) order by e.seq)
        from public.whoami_events e where e.wager_id = p_wager and e.round = p_round), '[]'::jsonb));
end;
$$;
revoke all on function public._whoami_json(uuid, integer, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Client functions
-- ---------------------------------------------------------------------------
-- A Who Am I? round of the caller's match (any round, so a finished one can show its reveal).
create function public.whoami_state(p_wager uuid, p_round integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  w public.wagers;
  rd public.wager_rounds;
begin
  perform public._wager_tick(p_wager, true);
  select * into w from public.wagers where id = p_wager and v_user in (host_id, opponent_id);
  if not found then
    raise exception 'That match was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  select * into rd from public.wager_rounds where wager_id = w.id and round = p_round;
  if not found or rd.game <> 'who-am-i' then
    raise exception 'That round was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  return public._whoami_json(w.id, rd.round, v_user);
end;
$$;
revoke all on function public.whoami_state(uuid, integer) from public, anon;
grant execute on function public.whoami_state(uuid, integer) to authenticated;

-- One move: join, consent, ask, answer or guess. p_seq must match the state the player acted on (a stale move
-- is refused), and p_request makes a retried move return the current state instead of acting twice.
create function public.whoami_act(p_wager uuid, p_round integer, p_action text, p_request uuid default null,
  p_seq integer default null, p_card text default null, p_text text default null, p_answer text default null,
  p_guess text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := public._competitive_user();
  v_step constant interval := interval '120 seconds';
  w public.wagers;
  rd public.wager_rounds;
  g public.whoami_games;
  v_me text;
  v_text text;
  v_truth boolean;
  v_mine text;
  v_a text;
  v_b text;
  v_invisible text := '[[:cntrl:]' || chr(8203) || '-' || chr(8207) || chr(8232) || '-' || chr(8238)
    || chr(8288) || '-' || chr(8303) || chr(65279) || '<>]';
begin
  perform public._wager_tick(p_wager, true);
  select * into w from public.wagers where id = p_wager and v_user in (host_id, opponent_id) for update;
  if not found then
    raise exception 'That match was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  v_me := case when w.host_id = v_user then 'host' else 'opponent' end;
  select * into rd from public.wager_rounds where wager_id = w.id and round = p_round;
  if not found or rd.game <> 'who-am-i' then
    raise exception 'That round was not found.' using errcode = 'P0002', hint = 'wager_not_found';
  end if;
  if p_request is not null and exists (
       select 1 from public.whoami_events where wager_id = w.id and round = rd.round and request = p_request) then
    return public._whoami_json(w.id, rd.round, v_user);
  end if;

  if p_action = 'consent' then
    if w.status <> 'active' then
      raise exception 'This match is over.' using errcode = 'P0001', hint = 'wager_round_closed';
    end if;
    if p_answer is null or p_answer not in ('yes', 'no') then
      raise exception 'Choose yes or no.' using errcode = '22023';
    end if;
    insert into public.whoami_consent (wager_id, user_id, custom) values (w.id, v_user, p_answer = 'yes')
    on conflict (wager_id, user_id) do update set custom = excluded.custom, decided_at = now();
    return public._whoami_json(w.id, rd.round, v_user);
  end if;

  if w.status <> 'active' or rd.resolved_at is not null or w.current_round <> rd.round then
    raise exception 'This round is already over.' using errcode = 'P0001', hint = 'wager_round_closed';
  end if;

  if p_action = 'join' then
    if exists (select 1 from public.wager_attempts
                where wager_id = w.id and round = rd.round and user_id = v_user and status <> 'playing') then
      return public._whoami_json(w.id, rd.round, v_user);
    end if;
    insert into public.wager_attempts (wager_id, round, user_id) values (w.id, rd.round, v_user) on conflict do nothing;
    insert into public.whoami_games (wager_id, round) values (w.id, rd.round) on conflict do nothing;
    update public.whoami_games
       set host_joined_at = case when v_me = 'host' then coalesce(host_joined_at, now()) else host_joined_at end,
           opponent_joined_at = case when v_me = 'opponent' then coalesce(opponent_joined_at, now()) else opponent_joined_at end
     where wager_id = w.id and round = rd.round
    returning * into g;
    if g.phase = 'lobby' and g.host_joined_at is not null and g.opponent_joined_at is not null then
      select id into v_a from public.whoami_characters where playable order by random() limit 1;
      select id into v_b from public.whoami_characters where playable and id <> v_a order by random() limit 1;
      update public.whoami_games
         set phase = 'ask', started_at = now(), host_identity = v_a, opponent_identity = v_b,
             turn = case when random() < 0.5 then 'host' else 'opponent' end, deadline = now() + v_step
       where wager_id = w.id and round = rd.round
      returning * into g;
      perform public._whoami_log(w.id, rd.round, 'system', 'start', null, null, null, null, null, false, null);
      update public.wager_rounds set deadline = greatest(deadline, g.deadline + interval '10 minutes')
       where wager_id = w.id and round = rd.round;
    end if;
    return public._whoami_json(w.id, rd.round, v_user);
  end if;

  select * into g from public.whoami_games where wager_id = w.id and round = rd.round for update;
  if not found or g.phase = 'lobby' then
    raise exception 'The round starts once both players have joined.' using errcode = 'P0001', hint = 'whoami_not_ready';
  end if;
  if g.phase = 'done' then
    raise exception 'This round is already over.' using errcode = 'P0001', hint = 'wager_round_closed';
  end if;
  if p_seq is distinct from g.seq then
    raise exception 'The round moved on. Here''s the latest.' using errcode = 'P0001', hint = 'whoami_stale';
  end if;

  if p_action = 'ask' then
    if g.phase <> 'ask' or g.turn <> v_me then
      raise exception 'It isn''t your turn to ask.' using errcode = 'P0001', hint = 'whoami_not_your_turn';
    end if;
    if p_card is not null then
      if not exists (select 1 from public.whoami_cards where id = p_card) then
        raise exception 'That card doesn''t exist.' using errcode = '22023';
      end if;
      if exists (select 1 from public.whoami_events
                  where wager_id = w.id and round = rd.round and kind = 'ask' and actor = v_me and card = p_card) then
        raise exception 'You already asked that card.' using errcode = '22023';
      end if;
      update public.whoami_games set pending = jsonb_build_object('kind', 'card', 'card', p_card, 'text', null)
       where wager_id = w.id and round = rd.round;
    else
      if not exists (select 1 from public.whoami_consent where wager_id = w.id and user_id = w.host_id and custom)
         or not exists (select 1 from public.whoami_consent where wager_id = w.id and user_id = w.opponent_id and custom) then
        raise exception 'Custom questions need both players to opt in. Pick a card instead.'
          using errcode = 'P0001', hint = 'whoami_custom_off';
      end if;
      v_text := btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), v_invisible, ' ', 'g'), '\s+', ' ', 'g'));
      if char_length(v_text) < 3 or char_length(v_text) > 140 then
        raise exception 'Questions need 3 to 140 characters.' using errcode = '22023';
      end if;
      update public.whoami_games set pending = jsonb_build_object('kind', 'custom', 'card', null, 'text', v_text)
       where wager_id = w.id and round = rd.round;
    end if;
    update public.whoami_games
       set phase = 'answer', deadline = now() + v_step,
           host_strikes = case when v_me = 'host' then 0 else host_strikes end,
           opponent_strikes = case when v_me = 'opponent' then 0 else opponent_strikes end
     where wager_id = w.id and round = rd.round;
    perform public._whoami_log(w.id, rd.round, v_me, 'ask', p_card, case when p_card is null then v_text end,
      null, null, null, false, p_request);

  elsif p_action = 'answer' then
    if g.phase <> 'answer' or g.turn = v_me then
      raise exception 'There''s no question for you to answer.' using errcode = 'P0001', hint = 'whoami_not_your_turn';
    end if;
    if g.pending ->> 'kind' = 'card' then
      if p_answer is null or p_answer not in ('yes', 'no') then
        raise exception 'Answer yes or no.' using errcode = '22023';
      end if;
      v_truth := public._whoami_truth(case when g.turn = 'host' then g.host_identity else g.opponent_identity end, g.pending ->> 'card');
      if (p_answer = 'yes') is distinct from v_truth then
        raise exception 'Check the card again: that answer doesn''t match the character you can see.'
          using errcode = 'P0001', hint = 'whoami_wrong_answer';
      end if;
    elsif p_answer is null or p_answer not in ('yes', 'no', 'unsure') then
      raise exception 'Answer yes, no or not sure.' using errcode = '22023';
    end if;
    perform public._whoami_log(w.id, rd.round, v_me, 'answer', g.pending ->> 'card', null, p_answer, null, null, false, p_request);
    update public.whoami_games
       set phase = 'ask', pending = null, turn = v_me, turns = turns + 1, deadline = now() + v_step,
           host_strikes = case when v_me = 'host' then 0 else host_strikes end,
           opponent_strikes = case when v_me = 'opponent' then 0 else opponent_strikes end
     where wager_id = w.id and round = rd.round
    returning * into g;
    if g.turns >= 80 then
      perform public._whoami_finish(w.id, rd.round, null, 'turn_limit');
    end if;

  elsif p_action = 'guess' then
    if g.phase <> 'ask' or g.turn <> v_me then
      raise exception 'It isn''t your turn to guess.' using errcode = 'P0001', hint = 'whoami_not_your_turn';
    end if;
    if not exists (select 1 from public.whoami_characters where id = p_guess and playable) then
      raise exception 'Pick a character from the board.' using errcode = '22023';
    end if;
    v_mine := case when v_me = 'host' then g.host_identity else g.opponent_identity end;
    perform public._whoami_log(w.id, rd.round, v_me, 'guess', null, null, null, p_guess, p_guess = v_mine, false, p_request);
    if p_guess = v_mine then
      perform public._whoami_finish(w.id, rd.round, v_me, 'guess');
    else
      update public.whoami_games
         set turn = public._whoami_other(v_me), turns = turns + 1, deadline = now() + v_step,
             host_strikes = case when v_me = 'host' then 0 else host_strikes end,
             opponent_strikes = case when v_me = 'opponent' then 0 else opponent_strikes end
       where wager_id = w.id and round = rd.round
      returning * into g;
      if g.turns >= 80 then
        perform public._whoami_finish(w.id, rd.round, null, 'turn_limit');
      end if;
    end if;

  else
    raise exception 'Unknown move.' using errcode = '22023';
  end if;

  update public.wager_rounds set deadline = greatest(deadline, now() + v_step + interval '10 minutes')
   where wager_id = w.id and round = rd.round and resolved_at is null;
  perform public._wager_tick(w.id, true);
  return public._whoami_json(w.id, rd.round, v_user);
end;
$$;
revoke all on function public.whoami_act(uuid, integer, text, uuid, integer, text, text, text, text) from public, anon;
grant execute on function public.whoami_act(uuid, integer, text, uuid, integer, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
