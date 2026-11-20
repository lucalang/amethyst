-- The Ascent's cosmetic shop: beanstalk styles, climbers, growth effects, sky styles, starting gardens and art
-- styles (visual only; rarity follows price). The Ascent's questions, scoring and records are unchanged.

begin;

alter table public.cosmetic_items drop constraint cosmetic_items_game_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_game_check check (game in ('snake', '2048', 'flutter', 'sudoku', 'fruit-slice', 'stacker', 'gem-chase', 'space-blaster', 'zip', 'patches', 'tango', 'queens', 'paper-trails', 'front-wars', 'blank-atlas', 'the-ascent'));

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'the-ascent', v.category, v.price
from (values
  ('the-ascent-bamboo', 'stalk', 90),
  ('the-ascent-pennant-rope', 'stalk', 100),
  ('the-ascent-flowering', 'stalk', 110),
  ('the-ascent-candy-cane', 'stalk', 120),
  ('the-ascent-toadstool', 'stalk', 140),
  ('the-ascent-crystal-stem', 'stalk', 160),
  ('the-ascent-starlight', 'stalk', 180),
  ('the-ascent-snail', 'climber', 90),
  ('the-ascent-tree-frog', 'climber', 100),
  ('the-ascent-ladybird', 'climber', 110),
  ('the-ascent-paper-kite', 'climber', 130),
  ('the-ascent-acorn-sprite', 'climber', 140),
  ('the-ascent-balloon-cat', 'climber', 160),
  ('the-ascent-tin-gardener', 'climber', 180),
  ('the-ascent-dandelion', 'growth', 90),
  ('the-ascent-petals', 'growth', 100),
  ('the-ascent-confetti', 'growth', 110),
  ('the-ascent-music-box', 'growth', 120),
  ('the-ascent-butterflies', 'growth', 140),
  ('the-ascent-fireflies', 'growth', 150),
  ('the-ascent-rainbow-wake', 'growth', 170),
  ('the-ascent-storybook', 'sky', 110),
  ('the-ascent-candyfloss', 'sky', 120),
  ('the-ascent-patchwork-sky', 'sky', 130),
  ('the-ascent-origami-flock', 'sky', 150),
  ('the-ascent-balloon-regatta', 'sky', 160),
  ('the-ascent-lantern-festival', 'sky', 170),
  ('the-ascent-starry-night', 'sky', 190),
  ('the-ascent-pumpkin-patch', 'garden', 100),
  ('the-ascent-seaside', 'garden', 110),
  ('the-ascent-oasis', 'garden', 120),
  ('the-ascent-rooftop', 'garden', 130),
  ('the-ascent-winter-greenhouse', 'garden', 150),
  ('the-ascent-moss-temple', 'garden', 160),
  ('the-ascent-enchanted-grove', 'garden', 180),
  ('the-ascent-pen-and-ink', 'style', 300),
  ('the-ascent-papercraft', 'style', 350),
  ('the-ascent-pixel-quest', 'style', 400),
  ('the-ascent-chalk-mural', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

commit;
