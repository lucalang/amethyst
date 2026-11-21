-- Every minigame shop grows: three more cosmetics in each category (ten per category) and more art styles, so every
-- game has five. Flutter, Sudoku and Tower Stacker get an Art styles category for the first time. Visual only; rarity
-- follows price, and gameplay, scoring and Wagers are unchanged.

begin;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'snake', v.category, v.price
from (values
  ('snake-diamondback', 'skin', 150),
  ('snake-emerald-boa', 'skin', 160),
  ('snake-aurora', 'skin', 180),
  ('snake-zen-garden', 'map', 200),
  ('snake-toadstool-grove', 'map', 210),
  ('snake-autumn-orchard', 'map', 220),
  ('snake-nom-burst', 'effect', 170),
  ('snake-static-crackle', 'effect', 180),
  ('snake-ink-splash', 'effect', 190),
  ('snake-mosaic', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', '2048', v.category, v.price
from (values
  ('g2048-honeycomb', 'tiles', 150),
  ('g2048-denim', 'tiles', 160),
  ('g2048-lava-lamp', 'tiles', 180),
  ('g2048-aquarium', 'board', 160),
  ('g2048-parquet', 'board', 170),
  ('g2048-quilt', 'board', 180),
  ('g2048-inscribed', 'font', 90),
  ('g2048-terminal', 'font', 90),
  ('g2048-outline', 'font', 100),
  ('g2048-stamp', 'merge', 160),
  ('g2048-bubble', 'merge', 160),
  ('g2048-glitch', 'merge', 170),
  ('g2048-origami', 'style', 450)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'flutter', v.category, v.price
from (values
  ('flutter-jellyfish', 'character', 170),
  ('flutter-maple-seed', 'character', 170),
  ('flutter-owl', 'character', 180),
  ('flutter-notes', 'trail', 150),
  ('flutter-feathers', 'trail', 160),
  ('flutter-paint-splats', 'trail', 170),
  ('flutter-birch', 'obstacle', 160),
  ('flutter-coral', 'obstacle', 170),
  ('flutter-clockwork', 'obstacle', 190),
  ('flutter-reef', 'scenery', 200),
  ('flutter-blossom', 'scenery', 210),
  ('flutter-sky-islands', 'scenery', 220),
  ('flutter-pixel', 'style', 300),
  ('flutter-silent-film', 'style', 350),
  ('flutter-blueprint', 'style', 400),
  ('flutter-watercolor', 'style', 450),
  ('flutter-pop-art', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'sudoku', v.category, v.price
from (values
  ('sudoku-washi', 'theme', 160),
  ('sudoku-kraft', 'theme', 160),
  ('sudoku-neon-grid', 'theme', 180),
  ('sudoku-margin-notes', 'font', 80),
  ('sudoku-signboard', 'font', 90),
  ('sudoku-engraved', 'font', 90),
  ('sudoku-crosshairs', 'grid', 120),
  ('sudoku-bubbles', 'grid', 120),
  ('sudoku-ridges', 'grid', 130),
  ('sudoku-sunset', 'highlight', 80),
  ('sudoku-forest', 'highlight', 80),
  ('sudoku-spotlight', 'highlight', 90),
  ('sudoku-pixel', 'style', 300),
  ('sudoku-sketch', 'style', 350),
  ('sudoku-stone', 'style', 400),
  ('sudoku-lightboard', 'style', 450),
  ('sudoku-swiss', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'fruit-slice', v.category, v.price
from (values
  ('fruit-laser', 'blade', 180),
  ('fruit-vine', 'blade', 180),
  ('fruit-shadow', 'blade', 190),
  ('fruit-knitted', 'skin', 160),
  ('fruit-stained-glass', 'skin', 170),
  ('fruit-disco', 'skin', 180),
  ('fruit-diner', 'background', 170),
  ('fruit-greenhouse', 'background', 180),
  ('fruit-volcano', 'background', 190),
  ('fruit-seeds', 'juice', 140),
  ('fruit-smoothie', 'juice', 150),
  ('fruit-fireworks', 'juice', 160),
  ('fruit-linocut', 'style', 450),
  ('fruit-neon', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'stacker', v.category, v.price
from (values
  ('stacker-terracotta', 'blocks', 150),
  ('stacker-jade', 'blocks', 170),
  ('stacker-opal', 'blocks', 190),
  ('stacker-sushi', 'theme', 170),
  ('stacker-timber', 'theme', 180),
  ('stacker-pagoda', 'theme', 190),
  ('stacker-savanna', 'scenery', 180),
  ('stacker-candy-clouds', 'scenery', 190),
  ('stacker-storm', 'scenery', 200),
  ('stacker-coins', 'perfect', 170),
  ('stacker-bubbles', 'perfect', 170),
  ('stacker-paint', 'perfect', 180),
  ('stacker-voxel', 'style', 300),
  ('stacker-toon', 'style', 350),
  ('stacker-papercraft', 'style', 400),
  ('stacker-low-poly', 'style', 450),
  ('stacker-hologram', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'gem-chase', v.category, v.price
from (values
  ('gem-chase-molten', 'gem', 160),
  ('gem-chase-galaxy', 'gem', 170),
  ('gem-chase-gumdrop', 'gem', 170),
  ('gem-chase-hedge', 'maze', 160),
  ('gem-chase-gingerbread', 'maze', 170),
  ('gem-chase-tomb', 'maze', 180),
  ('gem-chase-coins', 'collect', 140),
  ('gem-chase-notes', 'collect', 140),
  ('gem-chase-leaves', 'collect', 150),
  ('gem-chase-slime', 'shades', 150),
  ('gem-chase-lanterns', 'shades', 160),
  ('gem-chase-bedsheets', 'shades', 160),
  ('gem-chase-chalk', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'space-blaster', v.category, v.price
from (values
  ('space-blaster-sharkmouth', 'hull', 160),
  ('space-blaster-checker', 'hull', 170),
  ('space-blaster-hotrod', 'hull', 180),
  ('space-blaster-warp', 'trail', 150),
  ('space-blaster-steam', 'trail', 150),
  ('space-blaster-starlight', 'trail', 160),
  ('space-blaster-crescent', 'weapon', 150),
  ('space-blaster-starshot', 'weapon', 160),
  ('space-blaster-orb', 'weapon', 170),
  ('space-blaster-spiral', 'sector', 170),
  ('space-blaster-gas-giant', 'sector', 180),
  ('space-blaster-binary', 'sector', 190),
  ('space-blaster-vhs', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'zip', v.category, v.price
from (values
  ('zip-neon', 'path', 140),
  ('zip-rope', 'path', 140),
  ('zip-lava', 'path', 150),
  ('zip-terminal', 'board', 150),
  ('zip-oak', 'board', 150),
  ('zip-tatami', 'board', 160),
  ('zip-gems', 'marker', 100),
  ('zip-pins', 'marker', 100),
  ('zip-blossoms', 'marker', 110),
  ('zip-lanterns', 'finish', 140),
  ('zip-streamers', 'finish', 140),
  ('zip-comets', 'finish', 150),
  ('zip-metro', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'patches', v.category, v.price
from (values
  ('patches-corduroy', 'fill', 130),
  ('patches-argyle', 'fill', 140),
  ('patches-batik', 'fill', 150),
  ('patches-cutting-mat', 'paper', 130),
  ('patches-pegboard', 'paper', 130),
  ('patches-midnight', 'paper', 150),
  ('patches-buttons', 'badge', 100),
  ('patches-pennants', 'badge', 100),
  ('patches-rosettes', 'badge', 120),
  ('patches-unfold', 'effect', 140),
  ('patches-twirl', 'effect', 150),
  ('patches-sew', 'effect', 150),
  ('patches-embroidery', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'tango', v.category, v.price
from (values
  ('tango-paw-bone', 'icons', 120),
  ('tango-rocket-planet', 'icons', 130),
  ('tango-key-lock', 'icons', 130),
  ('tango-terracotta', 'board', 130),
  ('tango-matcha', 'board', 130),
  ('tango-nightfall', 'board', 150),
  ('tango-ink', 'place', 120),
  ('tango-slide', 'place', 110),
  ('tango-jelly', 'place', 120),
  ('tango-balloons', 'finish', 140),
  ('tango-coins', 'finish', 140),
  ('tango-kites', 'finish', 150),
  ('tango-azulejo', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'queens', v.category, v.price
from (values
  ('queens-circlet', 'crown', 130),
  ('queens-sun-crown', 'crown', 140),
  ('queens-paper-crown', 'crown', 120),
  ('queens-terrazzo', 'regions', 140),
  ('queens-inlay', 'regions', 150),
  ('queens-neon', 'regions', 150),
  ('queens-porcelain', 'board', 140),
  ('queens-copper', 'board', 150),
  ('queens-candy', 'board', 140),
  ('queens-coronation', 'effect', 150),
  ('queens-fanfare', 'effect', 150),
  ('queens-doves', 'effect', 160),
  ('queens-heraldry', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'paper-trails', v.category, v.price
from (values
  ('paper-trails-airmail', 'piece', 150),
  ('paper-trails-pressed-leaf', 'piece', 150),
  ('paper-trails-marbled', 'piece', 170),
  ('paper-trails-chevron', 'pattern', 130),
  ('paper-trails-tartan', 'pattern', 140),
  ('paper-trails-honeycomb', 'pattern', 140),
  ('paper-trails-washi', 'trail', 140),
  ('paper-trails-footprints', 'trail', 150),
  ('paper-trails-paper-chain', 'trail', 160),
  ('paper-trails-treasure-map', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'front-wars', v.category, v.price
from (values
  ('front-wars-dunes', 'map', 240),
  ('front-wars-autumn', 'map', 250),
  ('front-wars-sweets', 'map', 260),
  ('front-wars-tartan', 'pattern', 170),
  ('front-wars-waves', 'pattern', 170),
  ('front-wars-scales', 'pattern', 180),
  ('front-wars-lanterns', 'building', 200),
  ('front-wars-terracotta', 'building', 200),
  ('front-wars-neon', 'building', 220),
  ('front-wars-cavalry', 'attack', 190),
  ('front-wars-paint', 'attack', 190),
  ('front-wars-cranes', 'attack', 200),
  ('front-wars-galleon', 'boat', 200),
  ('front-wars-duck', 'boat', 200),
  ('front-wars-hovercraft', 'boat', 210),
  ('front-wars-sampler', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'blank-atlas', v.category, v.price
from (values
  ('blank-atlas-hourglass', 'lantern', 200),
  ('blank-atlas-anglerfish', 'lantern', 210),
  ('blank-atlas-lotus', 'lantern', 220),
  ('blank-atlas-marine-snow', 'fog', 180),
  ('blank-atlas-kelp', 'fog', 190),
  ('blank-atlas-stardust', 'fog', 200),
  ('blank-atlas-vine', 'trail', 180),
  ('blank-atlas-morse', 'trail', 180),
  ('blank-atlas-zipper', 'trail', 190),
  ('blank-atlas-lifebuoy', 'marker', 170),
  ('blank-atlas-moon-phase', 'marker', 180),
  ('blank-atlas-nautilus', 'marker', 190),
  ('blank-atlas-ukiyo-e', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'the-ascent', v.category, v.price
from (values
  ('the-ascent-sunflower', 'stalk', 190),
  ('the-ascent-rope-ladder', 'stalk', 190),
  ('the-ascent-pumpkin-vine', 'stalk', 200),
  ('the-ascent-robin', 'climber', 180),
  ('the-ascent-squirrel', 'climber', 190),
  ('the-ascent-astronaut', 'climber', 210),
  ('the-ascent-soap-bubbles', 'growth', 180),
  ('the-ascent-autumn-leaves', 'growth', 180),
  ('the-ascent-fairy-dust', 'growth', 200),
  ('the-ascent-golden-sunrise', 'sky', 200),
  ('the-ascent-kite-festival', 'sky', 200),
  ('the-ascent-aurora-night', 'sky', 220),
  ('the-ascent-tulip-windmill', 'garden', 190),
  ('the-ascent-jungle-ruins', 'garden', 200),
  ('the-ascent-moon-base', 'garden', 220),
  ('the-ascent-watercolour', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'sumbreak', v.category, v.price
from (values
  ('sumbreak-sea-glass', 'tile', 180),
  ('sumbreak-felt-patch', 'tile', 190),
  ('sumbreak-lacquer', 'tile', 200),
  ('sumbreak-beach', 'board', 180),
  ('sumbreak-bento', 'board', 190),
  ('sumbreak-picnic', 'board', 200),
  ('sumbreak-stencil', 'number', 160),
  ('sumbreak-chalk', 'number', 160),
  ('sumbreak-engraved', 'number', 170),
  ('sumbreak-paper-cranes', 'merge', 190),
  ('sumbreak-snowflakes', 'merge', 190),
  ('sumbreak-honey-drip', 'merge', 200),
  ('sumbreak-art-deco', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', 'who-am-i', v.category, v.price
from (values
  ('who-am-i-alchemy-lab', 'table', 190),
  ('who-am-i-dining-car', 'table', 200),
  ('who-am-i-snowed-cabin', 'table', 210),
  ('who-am-i-royal-deck', 'card', 200),
  ('who-am-i-blue-willow', 'card', 200),
  ('who-am-i-treasure-map', 'card', 210),
  ('who-am-i-megaphone', 'question', 160),
  ('who-am-i-ransom-note', 'question', 170),
  ('who-am-i-carrier-pigeon', 'question', 180),
  ('who-am-i-leather-tag', 'marker', 160),
  ('who-am-i-pixel-badge', 'marker', 160),
  ('who-am-i-paint-blot', 'marker', 170),
  ('who-am-i-butterfly-flight', 'reveal', 200),
  ('who-am-i-rainbow-arch', 'reveal', 210),
  ('who-am-i-trophy', 'reveal', 220),
  ('who-am-i-art-nouveau', 'style', 500)
) as v(id, category, price)
on conflict (id) do nothing;

commit;
