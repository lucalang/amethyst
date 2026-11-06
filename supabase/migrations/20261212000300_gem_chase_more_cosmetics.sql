-- Gem Chase: three more items in each category plus four art styles. Rarity comes from price.
insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'gem-chase', v.category, v.price
from (values
  ('gem-chase-aquamarine', 'gem', 100),
  ('gem-chase-amethyst', 'gem', 110),
  ('gem-chase-diamond', 'gem', 150),
  ('gem-chase-glacier', 'maze', 130),
  ('gem-chase-circuit', 'maze', 130),
  ('gem-chase-lava-forge', 'maze', 160),
  ('gem-chase-hearts', 'collect', 120),
  ('gem-chase-snowflakes', 'collect', 120),
  ('gem-chase-confetti', 'collect', 130),
  ('gem-chase-arcade', 'shades', 110),
  ('gem-chase-jewel', 'shades', 120),
  ('gem-chase-aurora', 'shades', 130),
  ('gem-chase-pixel', 'style', 300),
  ('gem-chase-cartoon', 'style', 350),
  ('gem-chase-paper', 'style', 400),
  ('gem-chase-wireframe', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;
