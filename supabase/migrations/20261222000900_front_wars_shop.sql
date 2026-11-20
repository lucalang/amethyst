-- Front Wars cosmetic shop: map styles, territory patterns, building skins, attack effects, boat skins and art
-- styles (visual only; rarity follows price). Front Wars rules, records and other games' items are unchanged.

begin;

alter table public.cosmetic_items drop constraint cosmetic_items_game_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_game_check check (game in ('snake', '2048', 'flutter', 'sudoku', 'fruit-slice', 'stacker', 'gem-chase', 'space-blaster', 'zip', 'patches', 'tango', 'queens', 'paper-trails', 'front-wars'));

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'front-wars', v.category, v.price
from (values
  ('front-wars-war-room', 'map', 150),
  ('front-wars-topographic', 'map', 150),
  ('front-wars-coral-atoll', 'map', 170),
  ('front-wars-frostbound', 'map', 180),
  ('front-wars-circuit-board', 'map', 200),
  ('front-wars-ember-wastes', 'map', 220),
  ('front-wars-lunar-survey', 'map', 240),
  ('front-wars-chevrons', 'pattern', 100),
  ('front-wars-masonry', 'pattern', 100),
  ('front-wars-fields', 'pattern', 110),
  ('front-wars-honeycomb', 'pattern', 120),
  ('front-wars-camouflage', 'pattern', 130),
  ('front-wars-circuit', 'pattern', 150),
  ('front-wars-starfield', 'pattern', 160),
  ('front-wars-origami', 'building', 110),
  ('front-wars-carved', 'building', 120),
  ('front-wars-stone-keep', 'building', 130),
  ('front-wars-campaign-banners', 'building', 140),
  ('front-wars-ice', 'building', 150),
  ('front-wars-clockwork', 'building', 170),
  ('front-wars-hologram', 'building', 190),
  ('front-wars-arrows', 'attack', 110),
  ('front-wars-ink', 'attack', 110),
  ('front-wars-flares', 'attack', 130),
  ('front-wars-tide', 'attack', 130),
  ('front-wars-swarm', 'attack', 150),
  ('front-wars-packets', 'attack', 160),
  ('front-wars-storm', 'attack', 180),
  ('front-wars-paper-boat', 'boat', 100),
  ('front-wars-swan', 'boat', 120),
  ('front-wars-lantern-junk', 'boat', 130),
  ('front-wars-longship', 'boat', 140),
  ('front-wars-sea-turtle', 'boat', 160),
  ('front-wars-submarine', 'boat', 170),
  ('front-wars-zeppelin', 'boat', 190),
  ('front-wars-diorama', 'style', 300),
  ('front-wars-woodcut', 'style', 350),
  ('front-wars-watercolour', 'style', 400),
  ('front-wars-console', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

commit;
