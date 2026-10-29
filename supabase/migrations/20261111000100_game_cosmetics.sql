-- Minigame cosmetics: every Arcade game gets its own shop. Items live in the existing catalogue
-- (kind 'game'), are bought with the existing purchase_cosmetic() (atomic charge + permanent
-- ownership), and the equipped item per game and category is stored in game_loadouts.

alter table public.cosmetic_items drop constraint cosmetic_items_kind_check;
alter table public.cosmetic_items
  add constraint cosmetic_items_kind_check check (kind in ('frame', 'avatar_decoration', 'game')),
  add column game text check (game in ('snake', '2048', 'flutter', 'sudoku', 'fruit-slice', 'stacker')),
  add column category text check (category ~ '^[a-z][a-z0-9-]{0,23}$');
alter table public.cosmetic_items
  add constraint cosmetic_items_game_slot check ((kind = 'game') = (game is not null and category is not null));

insert into public.cosmetic_items (id, kind, game, category, price)
select v.id, 'game', v.game, v.category, v.price
from (values
  ('snake-coral-bands', 'snake', 'skin', 80),
  ('snake-peppermint', 'snake', 'skin', 90),
  ('snake-midnight-stripe', 'snake', 'skin', 90),
  ('snake-tiger', 'snake', 'skin', 100),
  ('snake-milk-snake', 'snake', 'skin', 110),
  ('snake-snow-leopard', 'snake', 'skin', 110),
  ('snake-galaxy', 'snake', 'skin', 140),
  ('snake-meadow', 'snake', 'map', 120),
  ('snake-gingham', 'snake', 'map', 120),
  ('snake-snowfield', 'snake', 'map', 140),
  ('snake-tide-pool', 'snake', 'map', 150),
  ('snake-candy-land', 'snake', 'map', 160),
  ('snake-desert-night', 'snake', 'map', 180),
  ('snake-lava-rock', 'snake', 'map', 200),
  ('snake-bubbles', 'snake', 'effect', 120),
  ('snake-confetti', 'snake', 'effect', 130),
  ('snake-hearts', 'snake', 'effect', 130),
  ('snake-pixel-burst', 'snake', 'effect', 140),
  ('snake-stardust', 'snake', 'effect', 150),
  ('snake-petals', 'snake', 'effect', 150),
  ('snake-shockwave', 'snake', 'effect', 170),
  ('snake-pixel', 'snake', 'style', 300),
  ('snake-hand-drawn', 'snake', 'style', 350),
  ('snake-clay', 'snake', 'style', 400),
  ('snake-neon', 'snake', 'style', 450),
  ('g2048-ocean', '2048', 'tiles', 70),
  ('g2048-forest', '2048', 'tiles', 70),
  ('g2048-sunset', '2048', 'tiles', 80),
  ('g2048-mono', '2048', 'tiles', 80),
  ('g2048-pastel', '2048', 'tiles', 90),
  ('g2048-metallic', '2048', 'tiles', 120),
  ('g2048-gemstone', '2048', 'tiles', 140),
  ('g2048-slate', '2048', 'board', 100),
  ('g2048-bamboo', '2048', 'board', 120),
  ('g2048-felt', '2048', 'board', 110),
  ('g2048-marble', '2048', 'board', 130),
  ('g2048-terrazzo', '2048', 'board', 130),
  ('g2048-night', '2048', 'board', 140),
  ('g2048-circuit', '2048', 'board', 150),
  ('g2048-rounded', '2048', 'font', 60),
  ('g2048-serif', '2048', 'font', 60),
  ('g2048-typewriter', '2048', 'font', 70),
  ('g2048-script', '2048', 'font', 70),
  ('g2048-marker', '2048', 'font', 70),
  ('g2048-pixel-font', '2048', 'font', 80),
  ('g2048-display', '2048', 'font', 80),
  ('g2048-sparkle', '2048', 'merge', 120),
  ('g2048-jelly', '2048', 'merge', 120),
  ('g2048-shockwave', '2048', 'merge', 120),
  ('g2048-flash', '2048', 'merge', 130),
  ('g2048-confetti', '2048', 'merge', 140),
  ('g2048-spin', '2048', 'merge', 140),
  ('g2048-embers', '2048', 'merge', 150),
  ('g2048-retro', '2048', 'style', 300),
  ('g2048-candy', '2048', 'style', 350),
  ('g2048-glass', '2048', 'style', 400),
  ('g2048-wooden', '2048', 'style', 400),
  ('flutter-bee', 'flutter', 'character', 100),
  ('flutter-bat', 'flutter', 'character', 110),
  ('flutter-ghost', 'flutter', 'character', 110),
  ('flutter-paper-plane', 'flutter', 'character', 120),
  ('flutter-fish', 'flutter', 'character', 120),
  ('flutter-rocket', 'flutter', 'character', 140),
  ('flutter-dragon', 'flutter', 'character', 160),
  ('flutter-sparkles', 'flutter', 'trail', 100),
  ('flutter-bubbles', 'flutter', 'trail', 100),
  ('flutter-hearts', 'flutter', 'trail', 110),
  ('flutter-stars', 'flutter', 'trail', 120),
  ('flutter-ribbon', 'flutter', 'trail', 130),
  ('flutter-rainbow', 'flutter', 'trail', 140),
  ('flutter-comet', 'flutter', 'trail', 150),
  ('flutter-bamboo', 'flutter', 'obstacle', 120),
  ('flutter-brick', 'flutter', 'obstacle', 120),
  ('flutter-candy-cane', 'flutter', 'obstacle', 130),
  ('flutter-temple', 'flutter', 'obstacle', 130),
  ('flutter-ice', 'flutter', 'obstacle', 140),
  ('flutter-magma', 'flutter', 'obstacle', 150),
  ('flutter-neon', 'flutter', 'obstacle', 160),
  ('flutter-sunset', 'flutter', 'scenery', 140),
  ('flutter-forest', 'flutter', 'scenery', 140),
  ('flutter-snow', 'flutter', 'scenery', 150),
  ('flutter-desert', 'flutter', 'scenery', 150),
  ('flutter-night', 'flutter', 'scenery', 160),
  ('flutter-city', 'flutter', 'scenery', 160),
  ('flutter-space', 'flutter', 'scenery', 200),
  ('sudoku-newspaper', 'sudoku', 'theme', 120),
  ('sudoku-notebook', 'sudoku', 'theme', 120),
  ('sudoku-parchment', 'sudoku', 'theme', 130),
  ('sudoku-blueprint', 'sudoku', 'theme', 140),
  ('sudoku-midnight', 'sudoku', 'theme', 140),
  ('sudoku-sakura', 'sudoku', 'theme', 140),
  ('sudoku-chalkboard', 'sudoku', 'theme', 150),
  ('sudoku-book-serif', 'sudoku', 'font', 60),
  ('sudoku-rounded', 'sudoku', 'font', 60),
  ('sudoku-code-mono', 'sudoku', 'font', 60),
  ('sudoku-typewriter', 'sudoku', 'font', 70),
  ('sudoku-pencil-print', 'sudoku', 'font', 70),
  ('sudoku-elegant', 'sudoku', 'font', 70),
  ('sudoku-terminal', 'sudoku', 'font', 80),
  ('sudoku-dotted', 'sudoku', 'grid', 90),
  ('sudoku-bold-boxes', 'sudoku', 'grid', 90),
  ('sudoku-checker', 'sudoku', 'grid', 100),
  ('sudoku-double', 'sudoku', 'grid', 100),
  ('sudoku-tiles', 'sudoku', 'grid', 100),
  ('sudoku-wells', 'sudoku', 'grid', 110),
  ('sudoku-rounded-boxes', 'sudoku', 'grid', 110),
  ('sudoku-amber', 'sudoku', 'highlight', 60),
  ('sudoku-mint', 'sudoku', 'highlight', 60),
  ('sudoku-rose', 'sudoku', 'highlight', 60),
  ('sudoku-lavender', 'sudoku', 'highlight', 60),
  ('sudoku-ocean', 'sudoku', 'highlight', 70),
  ('sudoku-citrus', 'sudoku', 'highlight', 70),
  ('sudoku-contrast', 'sudoku', 'highlight', 80),
  ('fruit-katana', 'fruit-slice', 'blade', 100),
  ('fruit-ink-brush', 'fruit-slice', 'blade', 130),
  ('fruit-flame', 'fruit-slice', 'blade', 140),
  ('fruit-frost', 'fruit-slice', 'blade', 140),
  ('fruit-starlight', 'fruit-slice', 'blade', 150),
  ('fruit-rainbow', 'fruit-slice', 'blade', 160),
  ('fruit-lightning', 'fruit-slice', 'blade', 170),
  ('fruit-polka', 'fruit-slice', 'skin', 90),
  ('fruit-glossy', 'fruit-slice', 'skin', 100),
  ('fruit-frosted', 'fruit-slice', 'skin', 110),
  ('fruit-faces', 'fruit-slice', 'skin', 110),
  ('fruit-plush', 'fruit-slice', 'skin', 120),
  ('fruit-golden', 'fruit-slice', 'skin', 140),
  ('fruit-cosmic', 'fruit-slice', 'skin', 150),
  ('fruit-picnic', 'fruit-slice', 'background', 120),
  ('fruit-bamboo', 'fruit-slice', 'background', 130),
  ('fruit-marble', 'fruit-slice', 'background', 130),
  ('fruit-beach', 'fruit-slice', 'background', 140),
  ('fruit-sakura', 'fruit-slice', 'background', 150),
  ('fruit-night-market', 'fruit-slice', 'background', 160),
  ('fruit-space', 'fruit-slice', 'background', 160),
  ('fruit-glitter', 'fruit-slice', 'juice', 100),
  ('fruit-bubbles', 'fruit-slice', 'juice', 110),
  ('fruit-pixel-cubes', 'fruit-slice', 'juice', 110),
  ('fruit-petals', 'fruit-slice', 'juice', 120),
  ('fruit-ink', 'fruit-slice', 'juice', 120),
  ('fruit-stars', 'fruit-slice', 'juice', 120),
  ('fruit-confetti', 'fruit-slice', 'juice', 130),
  ('fruit-cartoon', 'fruit-slice', 'style', 300),
  ('fruit-pixel', 'fruit-slice', 'style', 350),
  ('fruit-watercolor', 'fruit-slice', 'style', 400),
  ('stacker-ocean', 'stacker', 'blocks', 70),
  ('stacker-pastel', 'stacker', 'blocks', 90),
  ('stacker-graphite', 'stacker', 'blocks', 90),
  ('stacker-wood', 'stacker', 'blocks', 120),
  ('stacker-marble', 'stacker', 'blocks', 130),
  ('stacker-metal', 'stacker', 'blocks', 140),
  ('stacker-glass', 'stacker', 'blocks', 150),
  ('stacker-books', 'stacker', 'theme', 140),
  ('stacker-containers', 'stacker', 'theme', 140),
  ('stacker-skyscraper', 'stacker', 'theme', 150),
  ('stacker-toys', 'stacker', 'theme', 150),
  ('stacker-pancakes', 'stacker', 'theme', 150),
  ('stacker-castle', 'stacker', 'theme', 160),
  ('stacker-cake', 'stacker', 'theme', 170),
  ('stacker-day', 'stacker', 'scenery', 120),
  ('stacker-sunset', 'stacker', 'scenery', 140),
  ('stacker-ocean-view', 'stacker', 'scenery', 140),
  ('stacker-night', 'stacker', 'scenery', 150),
  ('stacker-city', 'stacker', 'scenery', 160),
  ('stacker-aurora', 'stacker', 'scenery', 180),
  ('stacker-space', 'stacker', 'scenery', 180),
  ('stacker-sparkles', 'stacker', 'perfect', 120),
  ('stacker-hearts', 'stacker', 'perfect', 120),
  ('stacker-stars', 'stacker', 'perfect', 120),
  ('stacker-confetti', 'stacker', 'perfect', 130),
  ('stacker-shockwave', 'stacker', 'perfect', 130),
  ('stacker-lightning', 'stacker', 'perfect', 150),
  ('stacker-fireworks', 'stacker', 'perfect', 160)
) as v(id, game, category, price)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- What each account has equipped per game and category (no row = the free default)
-- ---------------------------------------------------------------------------
create table public.game_loadouts (
  user_id uuid not null references public.users (id) on delete cascade,
  game text not null,
  category text not null,
  item_id text not null references public.cosmetic_items (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, game, category)
);

alter table public.game_loadouts enable row level security;
create policy owner_read on public.game_loadouts for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.game_loadouts from public, anon, authenticated;
grant select on public.game_loadouts to authenticated;
grant all on public.game_loadouts to service_role;

-- Equips an owned item (or restores the default with p_item null) for the signed-in account only.
create function public.set_game_cosmetic(p_game text, p_category text, p_item text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Sign in required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cosmetic_items where kind = 'game' and game = p_game and category = p_category) then
    raise exception 'Unknown cosmetic slot.' using errcode = 'P0001', hint = 'item_unavailable';
  end if;

  if p_item is null then
    delete from public.game_loadouts where user_id = v_user and game = p_game and category = p_category;
    return jsonb_build_object('game', p_game, 'category', p_category, 'item', null);
  end if;

  if not exists (
    select 1
      from public.cosmetic_items c
      join public.user_cosmetics u on u.item_id = c.id and u.user_id = v_user
     where c.id = p_item and c.kind = 'game' and c.game = p_game and c.category = p_category
  ) then
    raise exception 'You don''t own that item.' using errcode = '42501', hint = 'cosmetic_not_owned';
  end if;

  insert into public.game_loadouts (user_id, game, category, item_id)
  values (v_user, p_game, p_category, p_item)
  on conflict (user_id, game, category) do update set item_id = excluded.item_id, updated_at = now();
  return jsonb_build_object('game', p_game, 'category', p_category, 'item', p_item);
end;
$$;
revoke all on function public.set_game_cosmetic(text, text, text) from public, anon;
grant execute on function public.set_game_cosmetic(text, text, text) to authenticated;
