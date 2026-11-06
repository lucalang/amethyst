-- Zip, Patches, Tango and Queens: three or four more items per category plus four art styles each.
insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'zip', v.category, v.price
from (values
  ('zip-lime', 'path', 80),
  ('zip-ember', 'path', 100),
  ('zip-candy', 'path', 110),
  ('zip-notebook', 'board', 100),
  ('zip-sakura', 'board', 120),
  ('zip-midnight', 'board', 140),
  ('zip-octagons', 'marker', 70),
  ('zip-star-badges', 'marker', 90),
  ('zip-shields', 'marker', 90),
  ('zip-hearts', 'finish', 120),
  ('zip-bubbles', 'finish', 120),
  ('zip-fireworks', 'finish', 140),
  ('zip-snow', 'finish', 130),
  ('zip-pixel', 'style', 300),
  ('zip-sketch', 'style', 350),
  ('zip-clay', 'style', 400),
  ('zip-glass', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'patches', v.category, v.price
from (values
  ('patches-reef', 'fill', 110),
  ('patches-felt', 'fill', 100),
  ('patches-plaid', 'fill', 120),
  ('patches-notebook', 'paper', 90),
  ('patches-dotgrid', 'paper', 90),
  ('patches-sakura', 'paper', 110),
  ('patches-cork', 'paper', 120),
  ('patches-tiles', 'badge', 70),
  ('patches-hexes', 'badge', 80),
  ('patches-notes', 'badge', 80),
  ('patches-seals', 'badge', 90),
  ('patches-hearts', 'effect', 120),
  ('patches-fizz', 'effect', 120),
  ('patches-fireworks', 'effect', 140),
  ('patches-snow', 'effect', 130),
  ('patches-pixel', 'style', 300),
  ('patches-sketch', 'style', 350),
  ('patches-clay', 'style', 400),
  ('patches-glass', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'tango', v.category, v.price
from (values
  ('tango-x-o', 'icons', 100),
  ('tango-spade-diamond', 'icons', 110),
  ('tango-coin-gem', 'icons', 120),
  ('tango-lavender', 'board', 100),
  ('tango-citrus', 'board', 110),
  ('tango-glacier', 'board', 120),
  ('tango-flip', 'place', 90),
  ('tango-zoom', 'place', 100),
  ('tango-stamp', 'place', 100),
  ('tango-swirl', 'place', 110),
  ('tango-hearts', 'finish', 120),
  ('tango-bubbles', 'finish', 120),
  ('tango-fireworks', 'finish', 140),
  ('tango-snow', 'finish', 130),
  ('tango-pixel', 'style', 300),
  ('tango-sketch', 'style', 350),
  ('tango-clay', 'style', 400),
  ('tango-glass', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'queens', v.category, v.price
from (values
  ('queens-rose-gold', 'crown', 110),
  ('queens-emerald', 'crown', 120),
  ('queens-laurel', 'crown', 130),
  ('queens-sorbet', 'regions', 100),
  ('queens-watercolor', 'regions', 120),
  ('queens-mosaic', 'regions', 130),
  ('queens-pearl', 'board', 110),
  ('queens-jade', 'board', 120),
  ('queens-onyx', 'board', 130),
  ('queens-gilded', 'board', 150),
  ('queens-hearts', 'effect', 120),
  ('queens-bubbles', 'effect', 120),
  ('queens-fireworks', 'effect', 140),
  ('queens-snow', 'effect', 130),
  ('queens-pixel', 'style', 300),
  ('queens-sketch', 'style', 350),
  ('queens-clay', 'style', 400),
  ('queens-glass', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;
