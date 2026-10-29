-- Snake speeds: Slow and Fast rounds keep separate records by appending '-slow' or '-fast' to the
-- variant. Normal keeps the existing keys, so every saved record stays where it is.
alter table public.arcade_records drop constraint arcade_records_game_valid;
alter table public.arcade_records add constraint arcade_records_game_valid check (
  (game in ('2048', 'flutter', 'fruit-slice', 'stacker') and variant = '' and score between 0 and 100000000)
  or (game = 'snake' and (variant = '' or variant ~ '^[a-z0-9]+-[a-z]+-[0-9]{1,2}(-(slow|fast))?$') and score between 0 and 100000000)
  or (game = 'sudoku' and variant in ('easy', 'medium', 'hard') and score between 1 and 8640000)
);

-- Fast moves up to 1.4x quicker than Normal, so allow a matching scoring rate. Payouts are unchanged.
update public.arcade_reward_rules
   set max_score_per_second = 17
 where game = 'snake' and variant = '';
