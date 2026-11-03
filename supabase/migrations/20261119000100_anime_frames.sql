-- Ten illustrated artwork frames sold in the Arcade shop (ids match SHOP_FRAME_IDS in src/lib/frames.ts).
insert into public.cosmetic_items (id, kind, price) values
  ('koi-rail', 'frame', 300),
  ('pressed-diary', 'frame', 300),
  ('frost-glam', 'frame', 300),
  ('sonata-keys', 'frame', 400),
  ('five-ribbons', 'frame', 400),
  ('spider-lily', 'frame', 400),
  ('tsuba-guard', 'frame', 400),
  ('demon-wing', 'frame', 500),
  ('moonshot', 'frame', 500),
  ('golden-arrow', 'frame', 500)
on conflict (id) do nothing;
