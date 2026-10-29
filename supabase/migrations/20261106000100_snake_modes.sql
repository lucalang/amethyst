-- Snake modes: separate records per mode, board size and fruit amount, and reward
-- plausibility limits that fit larger boards and several fruits at once.

-- '' stays the original record (Classic, Medium board, one fruit); every other setup is
-- '<mode>-<size>-<fruits>'. The API checks the exact ids; this only keeps the shape sane.
alter table public.arcade_records drop constraint arcade_records_game_valid;
alter table public.arcade_records add constraint arcade_records_game_valid check (
  (game in ('2048', 'flutter', 'fruit-slice', 'stacker') and variant = '' and score between 0 and 100000000)
  or (game = 'snake' and (variant = '' or variant ~ '^[a-z]+-[a-z]+-[0-9]{1,2}$') and score between 0 and 100000000)
  or (game = 'sudoku' and variant in ('easy', 'medium', 'hard') and score between 1 and 8640000)
);

-- The large board has 676 cells (was 400), and with several fruits out a quick snake can eat
-- more than 2.5 per second. Payouts (coins per point, cap per run, daily limit) are unchanged.
update public.arcade_reward_rules
   set max_score = 997, max_score_per_second = 8, score_allowance = 5
 where game = 'snake' and variant = '';
