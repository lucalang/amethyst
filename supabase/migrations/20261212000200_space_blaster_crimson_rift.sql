-- The Crimson Rift sector shared an id with the Crimson Ace hull; give it its own id.
insert into public.cosmetic_items (id, kind, game, category, price)
values ('space-blaster-crimson-rift', 'game', 'space-blaster', 'sector', 140)
on conflict (id) do nothing;
