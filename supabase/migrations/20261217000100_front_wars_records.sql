-- Front Wars: a solo strategy game against bots that keeps a personal record only.
-- Deliberately NOT added to arcade_reward_rules (no coin runs, so no leaderboards, streaks or Tournaments)
-- or to _arcade_board_valid (so _wager_board_direction rejects it and it can never be a Wager round).
-- Existing games' records and rules are unchanged.

begin;

do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''front-wars'' and variant = '''' and score between 0 and 100000000))';
end;
$$;

commit;
