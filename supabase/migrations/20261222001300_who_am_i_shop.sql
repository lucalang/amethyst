-- Who Am I?'s cosmetic shop: table themes, card backs and frames, question effects, answer markers, victory
-- reveals and art styles (visual only; rarity follows price). Each player only sees their own cosmetics; the game,
-- its Wagers and records are unchanged.

begin;

alter table public.cosmetic_items drop constraint cosmetic_items_game_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_game_check check (game in ('snake', '2048', 'flutter', 'sudoku', 'fruit-slice', 'stacker', 'gem-chase', 'space-blaster', 'zip', 'patches', 'tango', 'queens', 'paper-trails', 'front-wars', 'blank-atlas', 'the-ascent', 'sumbreak', 'who-am-i'));

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'who-am-i', v.category, v.price
from (values
  ('who-am-i-green-baize', 'table', 90),
  ('who-am-i-noir-office', 'table', 100),
  ('who-am-i-lantern-garden', 'table', 110),
  ('who-am-i-fortune-tent', 'table', 130),
  ('who-am-i-sunken-galleon', 'table', 150),
  ('who-am-i-starship-bridge', 'table', 160),
  ('who-am-i-moonlit-library', 'table', 180),
  ('who-am-i-pressed-botanicals', 'card', 90),
  ('who-am-i-woven-tapestry', 'card', 100),
  ('who-am-i-celestial-almanac', 'card', 110),
  ('who-am-i-art-deco', 'card', 130),
  ('who-am-i-gilded-baroque', 'card', 150),
  ('who-am-i-stained-glass', 'card', 170),
  ('who-am-i-holo-foil', 'card', 190),
  ('who-am-i-telegram', 'question', 80),
  ('who-am-i-quill-ink', 'question', 90),
  ('who-am-i-paper-plane', 'question', 100),
  ('who-am-i-comic-burst', 'question', 110),
  ('who-am-i-spotlight', 'question', 120),
  ('who-am-i-crystal-mist', 'question', 140),
  ('who-am-i-wax-seal', 'question', 150),
  ('who-am-i-chalk-scrawl', 'marker', 70),
  ('who-am-i-rubber-stamp', 'marker', 80),
  ('who-am-i-cross-stitch', 'marker', 90),
  ('who-am-i-die-cut-sticker', 'marker', 100),
  ('who-am-i-ticket-punch', 'marker', 110),
  ('who-am-i-brass-medallion', 'marker', 130),
  ('who-am-i-neon-script', 'marker', 150),
  ('who-am-i-lantern-release', 'reveal', 100),
  ('who-am-i-fireworks-finale', 'reveal', 120),
  ('who-am-i-magicians-hat', 'reveal', 130),
  ('who-am-i-masquerade', 'reveal', 140),
  ('who-am-i-constellation-crown', 'reveal', 160),
  ('who-am-i-gallery-unveil', 'reveal', 170),
  ('who-am-i-curtain-call', 'reveal', 190),
  ('who-am-i-cut-paper', 'style', 300),
  ('who-am-i-comic-panel', 'style', 350),
  ('who-am-i-illuminated', 'style', 400),
  ('who-am-i-phosphor-terminal', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

commit;
