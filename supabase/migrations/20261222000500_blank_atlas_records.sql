-- Blank Atlas: a seven-question rarity game that keeps a personal record only (best expedition, 0–700).
-- Like Front Wars it is deliberately NOT added to arcade_reward_rules (no coin runs, so no leaderboards, streaks,
-- Tournaments or Wagers). Existing games' records and rules are unchanged.

do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''blank-atlas'' and variant = '''' and score between 0 and 700))';
end;
$$;
