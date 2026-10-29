-- Snake V2: Blender mixes get their own records ('x<base-36 mode mask>-<size>-<fruits>'),
-- so the mode part of a snake variant may now contain digits. Other games are unchanged.
alter table public.arcade_records drop constraint arcade_records_game_valid;
alter table public.arcade_records add constraint arcade_records_game_valid check (
  (game in ('2048', 'flutter', 'fruit-slice', 'stacker') and variant = '' and score between 0 and 100000000)
  or (game = 'snake' and (variant = '' or variant ~ '^[a-z0-9]+-[a-z]+-[0-9]{1,2}$') and score between 0 and 100000000)
  or (game = 'sudoku' and variant in ('easy', 'medium', 'hard') and score between 1 and 8640000)
);

-- Peace never ends and lets the body overlap itself, and Yin Yang eats with two heads, so runs
-- can score past one board's worth and a little faster. Payouts are unchanged.
update public.arcade_reward_rules
   set max_score = 9997, max_score_per_second = 12
 where game = 'snake' and variant = '';
