-- Paper Trails: a territory minigame against computer opponents, with coin runs (so a leaderboard, streaks and
-- Wagers like Gem Chase) and its own cosmetic shop. Existing games' rules, records and items are unchanged.

begin;

-- Coin rule. Score = peak land in hundredths of a percent (max 10,000) + 500 per opponent eliminated + 2,500
-- for claiming half the arena; the shared daily coin cap still applies.
insert into public.arcade_reward_rules
  (game, variant, min_score, min_seconds, points_per_coin, flat_coins, max_coins, max_score_per_second, score_allowance, max_score)
values
  ('paper-trails', '', 300, 20, 150, 0, 30, 150, 3000, 100000)
on conflict (game, variant) do nothing;

-- Personal record: one best score.
do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''paper-trails'' and variant = '''' and score between 0 and 100000000))';
end;
$$;

-- Leaderboard boards (also what runs and Wagers accept): as before, plus the single Paper Trails board.
create or replace function public._arcade_board_valid(p_game text, p_board text)
returns boolean language plpgsql stable set search_path = '' as $$
declare
  v_today date := (now() at time zone 'utc')::date;
begin
  if p_board ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return p_game in ('2048', 'flutter', 'snake', 'fruit-slice', 'stacker', 'zip', 'patches', 'tango', 'queens', 'sumbreak')
      and substr(p_board, 7) in (v_today::text, (v_today - 1)::text);
  end if;
  return case p_game
    when '2048' then p_board in ('', '3x3', '5x5')
    when 'flutter' then p_board = ''
    when 'snake' then p_board = '' or (p_board !~ '^x[0-9a-z]+-'
      and p_board ~ '^[a-z0-9]{1,12}-(small|medium|large)-[0-9]{1,2}(-(slow|fast))?$')
    when 'fruit-slice' then p_board in ('', 'arcade', 'zen')
    when 'stacker' then p_board in ('', 'classic')
    when 'gem-chase' then p_board = ''
    when 'space-blaster' then p_board = ''
    when 'zip' then p_board in ('', 'easy', 'hard', 'expert', 'levels', 'levels-easy', 'levels-hard', 'levels-expert')
    when 'patches' then p_board in ('', 'levels', 'levels-easy', 'levels-hard')
    when 'tango' then p_board in ('', 'levels', 'levels-easy', 'levels-hard')
    when 'queens' then p_board in ('', 'levels', 'levels-easy', 'levels-hard')
    when 'sumbreak' then p_board in ('', 'easy', 'hard', 'levels', 'levels-easy', 'levels-hard')
    when 'paper-trails' then p_board = ''
    else false
  end;
end;
$$;
revoke all on function public._arcade_board_valid(text, text) from public, anon, authenticated;

-- The shop: piece skins, land patterns, trail effects and art styles (visual only; rarity follows price).
alter table public.cosmetic_items drop constraint cosmetic_items_game_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_game_check check (game in ('snake', '2048', 'flutter', 'sudoku', 'fruit-slice', 'stacker', 'gem-chase', 'space-blaster', 'zip', 'patches', 'tango', 'queens', 'paper-trails'));

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'paper-trails', v.category, v.price
from (values
  ('paper-trails-tangerine', 'piece', 80),
  ('paper-trails-mint', 'piece', 80),
  ('paper-trails-cherry', 'piece', 90),
  ('paper-trails-ocean', 'piece', 90),
  ('paper-trails-bumblebee', 'piece', 110),
  ('paper-trails-gold', 'piece', 130),
  ('paper-trails-galaxy', 'piece', 140),
  ('paper-trails-stripes', 'pattern', 90),
  ('paper-trails-dots', 'pattern', 90),
  ('paper-trails-gingham', 'pattern', 100),
  ('paper-trails-hatch', 'pattern', 100),
  ('paper-trails-waves', 'pattern', 110),
  ('paper-trails-scales', 'pattern', 120),
  ('paper-trails-confetti', 'pattern', 130),
  ('paper-trails-stitches', 'trail', 80),
  ('paper-trails-crayon', 'trail', 90),
  ('paper-trails-ricrac', 'trail', 90),
  ('paper-trails-splats', 'trail', 110),
  ('paper-trails-glitter', 'trail', 120),
  ('paper-trails-comet', 'trail', 130),
  ('paper-trails-rainbow', 'trail', 140),
  ('paper-trails-blueprint', 'style', 300),
  ('paper-trails-newsprint', 'style', 350),
  ('paper-trails-papercraft', 'style', 400),
  ('paper-trails-chalkboard', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

commit;
