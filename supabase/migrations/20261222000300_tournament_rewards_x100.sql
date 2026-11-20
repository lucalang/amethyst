-- Daily Tournament Coin prizes ×100 (1st 30,000 · 2nd 18,000 · 3rd 12,000 · 4th–10th 4,000). Item rewards are unchanged.
-- New tournaments copy their prizes from tournament_reward_tiers when they are created (_tournament_ensure); the
-- ones already scheduled but not yet final (today included) carry a copy in tournaments.rewards, so those are
-- scaled too. Final tournaments keep the prizes their places were awarded with.

update public.tournament_reward_tiers set coins = coins * 100;

update public.tournaments t
   set rewards = (
     select jsonb_agg(tier || jsonb_build_object('coins', (tier ->> 'coins')::integer * 100) order by ord)
       from jsonb_array_elements(t.rewards) with ordinality as r(tier, ord)
   )
 where t.finalized_at is null and jsonb_typeof(t.rewards) = 'array' and jsonb_array_length(t.rewards) > 0;
