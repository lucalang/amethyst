-- Sumbreak's cosmetic shop: tile materials, board themes, number styles, merge effects and art styles (visual
-- only; rarity follows price). Sumbreak's puzzles, rules, scoring and records are unchanged.

begin;

alter table public.cosmetic_items drop constraint cosmetic_items_game_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_game_check check (game in ('snake', '2048', 'flutter', 'sudoku', 'fruit-slice', 'stacker', 'gem-chase', 'space-blaster', 'zip', 'patches', 'tango', 'queens', 'paper-trails', 'front-wars', 'blank-atlas', 'the-ascent', 'sumbreak'));

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'sumbreak', v.category, v.price
from (values
  ('sumbreak-toy-blocks', 'tile', 80),
  ('sumbreak-porcelain', 'tile', 90),
  ('sumbreak-gummy', 'tile', 100),
  ('sumbreak-cloisonne', 'tile', 120),
  ('sumbreak-stained-glass', 'tile', 140),
  ('sumbreak-neon-sign', 'tile', 160),
  ('sumbreak-gemstone', 'tile', 180),
  ('sumbreak-zen-garden', 'board', 90),
  ('sumbreak-scholars-desk', 'board', 100),
  ('sumbreak-koi-pond', 'board', 120),
  ('sumbreak-circuit-board', 'board', 120),
  ('sumbreak-aurora-floe', 'board', 140),
  ('sumbreak-volcanic-forge', 'board', 160),
  ('sumbreak-observatory', 'board', 180),
  ('sumbreak-typewriter', 'number', 70),
  ('sumbreak-letterpress', 'number', 80),
  ('sumbreak-bubble-letters', 'number', 90),
  ('sumbreak-brush-ink', 'number', 100),
  ('sumbreak-digital-clock', 'number', 110),
  ('sumbreak-marquee', 'number', 130),
  ('sumbreak-luminous', 'number', 150),
  ('sumbreak-soap-bubbles', 'merge', 90),
  ('sumbreak-petal-whirl', 'merge', 100),
  ('sumbreak-pixel-shatter', 'merge', 110),
  ('sumbreak-ink-splash', 'merge', 120),
  ('sumbreak-lightning', 'merge', 140),
  ('sumbreak-firework-peony', 'merge', 160),
  ('sumbreak-supernova', 'merge', 180),
  ('sumbreak-woodcut', 'style', 300),
  ('sumbreak-watercolour', 'style', 350),
  ('sumbreak-bauhaus', 'style', 400),
  ('sumbreak-crt-arcade', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

commit;
