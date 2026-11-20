-- The Descent's cosmetic shop (game id 'blank-atlas'): lanterns, fog styles, dive trails, answer markers and art
-- styles (visual only; rarity follows price). The Descent's questions, scoring and records are unchanged.

begin;

alter table public.cosmetic_items drop constraint cosmetic_items_game_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_game_check check (game in ('snake', '2048', 'flutter', 'sudoku', 'fruit-slice', 'stacker', 'gem-chase', 'space-blaster', 'zip', 'patches', 'tango', 'queens', 'paper-trails', 'front-wars', 'blank-atlas'));

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'blank-atlas', v.category, v.price
from (values
  ('blank-atlas-moth', 'lantern', 90),
  ('blank-atlas-bell-jar', 'lantern', 100),
  ('blank-atlas-caged-star', 'lantern', 110),
  ('blank-atlas-jelly', 'lantern', 130),
  ('blank-atlas-orrery', 'lantern', 150),
  ('blank-atlas-watcher', 'lantern', 170),
  ('blank-atlas-crystal', 'lantern', 190),
  ('blank-atlas-ash', 'fog', 90),
  ('blank-atlas-bubbles', 'fog', 100),
  ('blank-atlas-silk', 'fog', 110),
  ('blank-atlas-will-o-wisps', 'fog', 120),
  ('blank-atlas-ink', 'fog', 130),
  ('blank-atlas-runes', 'fog', 150),
  ('blank-atlas-tarot', 'fog', 170),
  ('blank-atlas-cross-stitch', 'trail', 80),
  ('blank-atlas-pearls', 'trail', 90),
  ('blank-atlas-chain', 'trail', 100),
  ('blank-atlas-rune-ladder', 'trail', 120),
  ('blank-atlas-embers', 'trail', 130),
  ('blank-atlas-twin-spirits', 'trail', 150),
  ('blank-atlas-shattered', 'trail', 170),
  ('blank-atlas-compass', 'marker', 80),
  ('blank-atlas-wax-seal', 'marker', 90),
  ('blank-atlas-bell', 'marker', 100),
  ('blank-atlas-crystal-shard', 'marker', 120),
  ('blank-atlas-tarot-card', 'marker', 140),
  ('blank-atlas-sigil', 'marker', 150),
  ('blank-atlas-clockwork', 'marker', 160),
  ('blank-atlas-etching', 'style', 300),
  ('blank-atlas-stained-glass', 'style', 350),
  ('blank-atlas-shadow-theatre', 'style', 400),
  ('blank-atlas-cyanotype', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

commit;
