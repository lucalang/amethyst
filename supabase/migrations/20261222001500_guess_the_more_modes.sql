-- Guess The ...: three new modes, each keeping its own personal record (variant = mode id, score 0–100 per round):
-- 'flag' (Guess the Flag), 'size' (Guess the Real Size) and 'price' (Guess the Price). Like Guess the Chart they are
-- record-only (not in arcade_reward_rules) and the API scores every round on the server before saving. Existing
-- records and the 'chart' variant are unchanged.

do $$
declare definition text;
begin
  select pg_get_expr(conbin, conrelid) into definition from pg_constraint
    where conrelid = 'public.arcade_records'::regclass and conname = 'arcade_records_game_valid';
  alter table public.arcade_records drop constraint arcade_records_game_valid;
  execute 'alter table public.arcade_records add constraint arcade_records_game_valid check ('
    || definition
    || ' or (game = ''guess-the'' and variant in (''flag'', ''size'', ''price'') and score between 0 and 100))';
end;
$$;
