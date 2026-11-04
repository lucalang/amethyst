-- Ten more illustrated artwork frames sold in the Arcade shop (ids match SHOP_FRAME_IDS in src/lib/frames.ts).
insert into public.cosmetic_items (id, kind, price) values
  ('sakura-storm', 'frame', 450),
  ('bridal-bouquet', 'frame', 450),
  ('lavender-north', 'frame', 450),
  ('summer-fireworks', 'frame', 550),
  ('stained-prelude', 'frame', 550),
  ('kagune-coil', 'frame', 550),
  ('hollow-fang', 'frame', 550),
  ('fallen-halo', 'frame', 650),
  ('afterimage', 'frame', 650),
  ('zipper-rush', 'frame', 650)
on conflict (id) do nothing;
