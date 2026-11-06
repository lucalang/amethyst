-- Larger Coin rewards for Season Pass quests. Claims read the quest's current coins, so unclaimed
-- completed quests pay the new amount too.
update public.season_quests q
   set coins = v.coins
  from (values
    ('daily-runs-3', 35), ('daily-runs-6', 50), ('daily-games-2', 35), ('daily-sudoku-1', 50),
    ('daily-2048', 50), ('daily-flutter', 50), ('daily-snake', 50), ('daily-fruit', 50), ('daily-stacker', 50),
    ('weekly-runs-20', 225), ('weekly-games-4', 200), ('weekly-days-4', 200), ('weekly-sudoku-3', 250),
    ('weekly-2048', 175), ('weekly-flutter', 175), ('weekly-snake', 175), ('weekly-fruit', 175), ('weekly-stacker', 175),
    ('s1-runs-150', 750), ('s1-days-30', 750), ('s1-games-6', 400), ('s1-sudoku-15', 600), ('s1-2048-20000', 600)
  ) as v(id, coins)
 where q.id = v.id;
