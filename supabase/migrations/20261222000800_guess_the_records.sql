-- Guess The ...: a family of guessing minigames that keeps a personal record per mode only (variant = mode id; the
-- first mode is 'chart', Guess the Chart, scored 0–100). Like The Ascent it is deliberately NOT added to
-- arcade_reward_rules (no coin runs, so no leaderboards, streaks, Tournaments or Wagers). The API scores every
-- guess on the server and saves the record itself. Existing games' records and rules are unchanged.

do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''guess-the'' and variant in (''chart'') and score between 0 and 100))';
end;
$$;
