-- Space Blaster: three more items in each category plus four art styles. Rarity comes from price.
insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'space-blaster', v.category, v.price
from (values
  ('space-blaster-hornet', 'hull', 110),
  ('space-blaster-arctic', 'hull', 120),
  ('space-blaster-phantom', 'hull', 150),
  ('space-blaster-toxic', 'trail', 100),
  ('space-blaster-inferno', 'trail', 120),
  ('space-blaster-aurora', 'trail', 140),
  ('space-blaster-frost', 'weapon', 110),
  ('space-blaster-rose-gold', 'weapon', 120),
  ('space-blaster-needle', 'weapon', 140),
  ('space-blaster-abyss', 'sector', 140),
  ('space-blaster-amethyst-nebula', 'sector', 150),
  ('space-blaster-obsidian', 'sector', 160),
  ('space-blaster-pixel', 'style', 300),
  ('space-blaster-crt', 'style', 350),
  ('space-blaster-comic', 'style', 400),
  ('space-blaster-hyperglow', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;
