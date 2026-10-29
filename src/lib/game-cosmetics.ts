/**
 * Minigame cosmetics: one dedicated shop per Arcade game. Pure data shared by the server (prices are
 * mirrored in `cosmetic_items`, which stays the source of truth) and the client (names, categories).
 * How each item looks lives with the game's renderer, keyed by the item's slug.
 */

export const SHOP_GAMES = ["snake", "2048", "flutter", "sudoku", "fruit-slice", "stacker"] as const;
export type ShopGame = (typeof SHOP_GAMES)[number];
export const isShopGame = (value: unknown): value is ShopGame => typeof value === "string" && (SHOP_GAMES as readonly string[]).includes(value);

export type CategoryIcon =
  | "palette"
  | "map"
  | "sparkles"
  | "brush"
  | "grid"
  | "type"
  | "bird"
  | "wind"
  | "columns"
  | "mountain"
  | "book"
  | "highlighter"
  | "sword"
  | "apple"
  | "image"
  | "droplets"
  | "building";

type ItemDef = { slug: string; name: string; price: number; description: string };
export type GameCategory = {
  id: string;
  label: string;
  icon: CategoryIcon;
  blurb: string;
  /** Art styles are bigger changes and may have fewer items. */
  style?: boolean;
  default: { name: string; description: string };
  items: ItemDef[];
};
export type GameShopInfo = { game: ShopGame; title: string; prefix: string; href: string; blurb: string; categories: GameCategory[] };

const item = (slug: string, name: string, price: number, description: string): ItemDef => ({ slug, name, price, description });

export const GAME_SHOPS: Record<ShopGame, GameShopInfo> = {
  snake: {
    game: "snake",
    title: "Snake",
    prefix: "snake",
    href: "/arcade/snake",
    blurb: "Skins, gardens, snack effects and whole new art styles for your snake.",
    categories: [
      {
        id: "skin",
        label: "Colors & patterns",
        icon: "palette",
        blurb: "Your snake's colors and markings. The second snake in two-player gets a matching partner color.",
        default: { name: "Garden Green", description: "Leafy green with darker spots; the partner snake is sky blue." },
        items: [
          item("coral-bands", "Coral Bands", 80, "Warm coral with cream bands across the back; the partner is teal."),
          item("peppermint", "Peppermint", 90, "Candy-white scales wrapped in bright red diagonal stripes."),
          item("midnight-stripe", "Midnight Stripe", 90, "Deep indigo with a golden stripe running from nose to tail."),
          item("tiger", "Tiger", 100, "Orange with bold black chevrons that bend with every turn."),
          item("milk-snake", "Milk Snake", 110, "The classic red, black and cream ringed pattern."),
          item("snow-leopard", "Snow Leopard", 110, "Pale silver-grey covered in dark rosettes."),
          item("galaxy", "Galaxy", 140, "A night-sky body scattered with twinkling stars."),
        ],
      },
      {
        id: "map",
        label: "Map themes",
        icon: "map",
        blurb: "The ground your snake slithers over. Walls, fruit and hazards keep their usual look.",
        default: { name: "Sunny Sand", description: "Warm sand checks with little grass tufts." },
        items: [
          item("meadow", "Spring Meadow", 120, "Two-tone grass dotted with tiny daisies."),
          item("gingham", "Gingham Picnic", 120, "A blue picnic cloth with stitched checks."),
          item("snowfield", "Snowfield", 140, "Fresh snow with snowflakes pressed into it."),
          item("tide-pool", "Tide Pool", 150, "Shallow turquoise water with gentle ripples."),
          item("candy-land", "Candy Land", 160, "Strawberry frosting covered in sprinkles."),
          item("desert-night", "Desert Night", 180, "Cool violet dunes under faint stars."),
          item("lava-rock", "Lava Rock", 200, "Dark basalt crossed with glowing cracks."),
        ],
      },
      {
        id: "effect",
        label: "Eating & growth effects",
        icon: "sparkles",
        blurb: "What happens when your snake eats, plus the mark that travels down its body as it grows.",
        default: { name: "Pop Ring", description: "A colored ring and a few juice drops." },
        items: [
          item("bubbles", "Bubbles", 120, "Soap bubbles float up, and a bubble rides the bulge down the body."),
          item("confetti", "Confetti", 130, "A party popper of paper confetti and a glowing growth bulge."),
          item("hearts", "Hearts", 130, "Little hearts burst out, and a heart travels down the body."),
          item("pixel-burst", "Pixel Burst", 140, "Square pixels scatter in a retro explosion."),
          item("stardust", "Stardust", 150, "Golden stars and sparkles, with a shining star in the bulge."),
          item("petals", "Petals", 150, "Flower petals flutter away from every snack."),
          item("shockwave", "Shockwave", 170, "Twin shock rings and a flash that ripples across the board."),
        ],
      },
      {
        id: "style",
        label: "Art styles",
        icon: "brush",
        style: true,
        blurb: "Redraws the whole game: snake, fruit, walls and board. Combines with your colors, map and effects.",
        default: { name: "Cartoon", description: "Cel-shaded cartoon art with ink outlines." },
        items: [
          item("pixel", "Pixel", 300, "Chunky 8-bit pixels, square segments and crisp edges."),
          item("hand-drawn", "Hand-drawn", 350, "Pencil on paper: sketchy double outlines and cross-hatched shading."),
          item("clay", "Clay", 400, "Soft modelling clay with rounded shading and no ink lines."),
          item("neon", "Neon", 450, "Glowing neon tubes on a darkened board."),
        ],
      },
    ],
  },
  "2048": {
    game: "2048",
    title: "2048",
    prefix: "g2048",
    href: "/arcade/2048",
    blurb: "Tile colors, boards, number fonts, merge effects and full art styles.",
    categories: [
      {
        id: "tiles",
        label: "Tile colors & materials",
        icon: "palette",
        blurb: "The color ramp your tiles climb as they grow. Every value keeps its own color.",
        default: { name: "Classic Beige", description: "The original warm beige-to-gold ramp." },
        items: [
          item("ocean", "Ocean Depths", 70, "Sea foam to deep navy, ending in glowing teal."),
          item("forest", "Forest Floor", 70, "Moss, fern and pine, finishing in autumn gold."),
          item("sunset", "Sunset Sorbet", 80, "Peach, coral and magenta into a violet dusk."),
          item("mono", "Monochrome Ink", 80, "Paper white to ink black, with crisp contrast."),
          item("pastel", "Pastel Macarons", 90, "Soft pistachio, lavender, rose and lemon."),
          item("metallic", "Brushed Metal", 120, "Bronze, silver and gold with a brushed sheen."),
          item("gemstone", "Gemstones", 140, "Faceted amethyst, sapphire, emerald and ruby."),
        ],
      },
      {
        id: "board",
        label: "Board themes",
        icon: "grid",
        blurb: "The tray and empty cells behind your tiles.",
        default: { name: "Classic", description: "The familiar taupe tray." },
        items: [
          item("slate", "Slate", 100, "Cool grey slate with chalky edges."),
          item("bamboo", "Bamboo Mat", 120, "Woven bamboo slats."),
          item("felt", "Card Table", 110, "Green felt with a brass trim."),
          item("marble", "Marble", 130, "White marble with soft grey veins."),
          item("terrazzo", "Terrazzo", 130, "Speckled terrazzo chips on cream."),
          item("night", "Night Sky", 140, "A starry midnight tray."),
          item("circuit", "Circuit Board", 150, "Green circuitry with copper traces."),
        ],
      },
      {
        id: "font",
        label: "Number fonts",
        icon: "type",
        blurb: "The typeface on every tile. Overrides the font an art style suggests.",
        default: { name: "Bold Sans", description: "Heavy, clean sans-serif numbers." },
        items: [
          item("rounded", "Bubbly", 60, "Soft, rounded Fredoka numbers."),
          item("serif", "Classic Serif", 60, "Elegant Playfair Display numerals."),
          item("typewriter", "Typewriter", 70, "Inky Special Elite typewriter keys."),
          item("script", "Handwritten", 70, "Casual Caveat handwriting."),
          item("marker", "Marker", 70, "Thick Permanent Marker strokes."),
          item("pixel-font", "Arcade Pixel", 80, "Press Start 2P, straight out of an arcade cabinet."),
          item("display", "Block Display", 80, "Chunky Bungee sign lettering."),
        ],
      },
      {
        id: "merge",
        label: "Merge effects",
        icon: "sparkles",
        blurb: "What plays when two tiles combine.",
        default: { name: "Pop & Ring", description: "A bouncy pop and a soft ring." },
        items: [
          item("sparkle", "Sparkle Burst", 120, "Four-point sparkles flash around the new tile."),
          item("jelly", "Jelly Wobble", 120, "The tile wobbles like jelly when it lands."),
          item("shockwave", "Shockwave", 120, "A sharp square shockwave races outward."),
          item("flash", "Prism Flash", 130, "A rainbow sheen sweeps across the tile."),
          item("confetti", "Confetti Pop", 140, "A burst of confetti dots in every direction."),
          item("spin", "Spin Flip", 140, "The tile flips around to reveal its new value."),
          item("embers", "Ember Rise", 150, "Glowing embers drift up from the merge."),
        ],
      },
      {
        id: "style",
        label: "Art styles",
        icon: "brush",
        style: true,
        blurb: "Changes tile shapes, materials and textures. Your tile colors, board and font still apply.",
        default: { name: "Flat Classic", description: "Smooth rounded tiles." },
        items: [
          item("retro", "Retro", 300, "Square pixel tiles with stepped bevels and scanlines."),
          item("candy", "Candy", 350, "Glossy candy pills with sugar stripes."),
          item("glass", "Glass", 400, "Frosted glass tiles with bright edges and reflections."),
          item("wooden", "Wooden", 400, "Carved wooden blocks with grain and engraved numbers."),
        ],
      },
    ],
  },
  flutter: {
    game: "flutter",
    title: "Flutter",
    prefix: "flutter",
    href: "/arcade/flutter",
    blurb: "New flyers, trails, obstacle skins and skies. The hitbox never changes.",
    categories: [
      {
        id: "character",
        label: "Playable characters",
        icon: "bird",
        blurb: "Who flies. Every character uses exactly the same hitbox as the default bird.",
        default: { name: "Gem Bird", description: "The orange crystal bird." },
        items: [
          item("bee", "Bumblebee", 100, "A fuzzy bee with buzzing wings."),
          item("bat", "Night Bat", 110, "A little purple bat with leathery wings."),
          item("ghost", "Little Ghost", 110, "A friendly ghost with a wavy tail."),
          item("paper-plane", "Paper Plane", 120, "A folded paper plane that tilts as it glides."),
          item("fish", "Flying Fish", 120, "A striped fish with fin wings."),
          item("rocket", "Pocket Rocket", 140, "A tiny rocket with a flickering flame."),
          item("dragon", "Baby Dragon", 160, "A green dragonling with flapping wings."),
        ],
      },
      {
        id: "trail",
        label: "Flight trails",
        icon: "wind",
        blurb: "What streams behind you as you fly.",
        default: { name: "Wing Puffs", description: "Little puffs of air on every flap." },
        items: [
          item("sparkles", "Sparkles", 100, "Twinkling sparkles in your wake."),
          item("bubbles", "Bubbles", 100, "A stream of drifting bubbles."),
          item("hearts", "Hearts", 110, "Tiny hearts float behind you."),
          item("stars", "Shooting Stars", 120, "Golden stars spin off your path."),
          item("ribbon", "Silk Ribbon", 130, "A flowing silk ribbon traces your flight."),
          item("rainbow", "Rainbow", 140, "A classic rainbow stripe follows every move."),
          item("comet", "Comet Fire", 150, "A blazing comet tail with embers."),
        ],
      },
      {
        id: "obstacle",
        label: "Obstacle skins",
        icon: "columns",
        blurb: "New looks for the pillars. Their shape and gap size are exactly the same.",
        default: { name: "Green Crystal", description: "Faceted green crystal pillars." },
        items: [
          item("bamboo", "Bamboo", 120, "Jointed bamboo stalks."),
          item("brick", "Brick Chimney", 120, "Red brick with mortar lines."),
          item("candy-cane", "Candy Cane", 130, "Red and white peppermint stripes."),
          item("temple", "Temple Stone", 130, "Carved sandstone with glyphs."),
          item("ice", "Ice Spire", 140, "Frosty blue ice with frozen cracks."),
          item("magma", "Magma Rock", 150, "Dark rock with glowing lava seams."),
          item("neon", "Neon Tube", 160, "Glowing neon outlines on dark glass."),
        ],
      },
      {
        id: "scenery",
        label: "Background scenery",
        icon: "mountain",
        blurb: "The sky, skyline and ground you fly over.",
        default: { name: "Daytime Sky", description: "Clear blue sky over sandy hills." },
        items: [
          item("sunset", "Sunset Hills", 140, "Orange dusk over rolling hills."),
          item("forest", "Pine Forest", 140, "Layers of pine trees under a misty sky."),
          item("snow", "Snowy Peaks", 150, "Snow-capped mountains and falling snow."),
          item("desert", "Desert Mesa", 150, "Red mesas and cacti under a hot sky."),
          item("night", "Starry Night", 160, "A moonlit sky full of stars."),
          item("city", "City Skyline", 160, "Evening skyscrapers with lit windows."),
          item("space", "Outer Space", 200, "Planets and nebulae beyond the clouds."),
        ],
      },
    ],
  },
  sudoku: {
    game: "sudoku",
    title: "Sudoku",
    prefix: "sudoku",
    href: "/arcade/sudoku",
    blurb: "Paper themes, number fonts, grid styles and highlight colors. Always readable.",
    categories: [
      {
        id: "theme",
        label: "Board themes",
        icon: "book",
        blurb: "The paper (or board) your puzzle is printed on.",
        default: { name: "Paper & Ink", description: "Clean cream paper with dark ink." },
        items: [
          item("newspaper", "Newspaper", 120, "Grey newsprint with halftone dots and serif ink."),
          item("notebook", "Notebook", 120, "Ruled school paper with a red margin and blue ink."),
          item("parchment", "Parchment", 130, "Aged parchment with sepia ink."),
          item("blueprint", "Blueprint", 140, "White lines on drafting blue."),
          item("midnight", "Midnight", 140, "Navy paper with soft gold numbers."),
          item("sakura", "Sakura", 140, "Pale blossom pink with falling petals."),
          item("chalkboard", "Chalkboard", 150, "Dusty green chalkboard with chalk numbers."),
        ],
      },
      {
        id: "font",
        label: "Number fonts",
        icon: "type",
        blurb: "The typeface for numbers and pencil marks.",
        default: { name: "Clean Sans", description: "The standard crisp sans-serif." },
        items: [
          item("book-serif", "Book Serif", 60, "Literata, a calm reading serif."),
          item("rounded", "Rounded", 60, "Friendly Fredoka numbers."),
          item("code-mono", "Code Mono", 60, "JetBrains Mono, evenly spaced."),
          item("typewriter", "Typewriter", 70, "Special Elite typewriter keys."),
          item("pencil-print", "Pencil Print", 70, "Patrick Hand, neat handwriting."),
          item("elegant", "Elegant Serif", 70, "High-contrast Playfair Display."),
          item("terminal", "Terminal", 80, "VT323 green-screen digits."),
        ],
      },
      {
        id: "grid",
        label: "Cell & grid styles",
        icon: "grid",
        blurb: "How cells and the 3×3 boxes are drawn.",
        default: { name: "Ruled Lines", description: "Thin cell lines with bolder box lines." },
        items: [
          item("dotted", "Dotted", 90, "Dotted cell lines between solid boxes."),
          item("bold-boxes", "Bold Boxes", 90, "Extra-thick box borders and faint cell lines."),
          item("checker", "Checker Boxes", 100, "Alternate boxes are softly shaded."),
          item("double", "Double Rule", 100, "Elegant double lines around each box."),
          item("tiles", "Soft Tiles", 100, "Every cell is a little rounded tile."),
          item("wells", "Inset Wells", 110, "Cells are pressed into the page."),
          item("rounded-boxes", "Rounded Boxes", 110, "Each 3×3 box is its own rounded card."),
        ],
      },
      {
        id: "highlight",
        label: "Selection & highlight colors",
        icon: "highlighter",
        blurb: "Colors for the selected cell, its row, column and box, and matching numbers.",
        default: { name: "Amethyst", description: "Soft purple highlights." },
        items: [
          item("amber", "Amber Glow", 60, "Warm honey highlights."),
          item("mint", "Mint", 60, "Fresh green highlights."),
          item("rose", "Rose Quartz", 60, "Gentle pink highlights."),
          item("lavender", "Lavender", 60, "Soft lilac with a violet outline."),
          item("ocean", "Deep Ocean", 70, "Cool blue and teal highlights."),
          item("citrus", "Citrus", 70, "Lime and orange highlights."),
          item("contrast", "High Contrast", 80, "Bold yellow with a black outline."),
        ],
      },
    ],
  },
  "fruit-slice": {
    game: "fruit-slice",
    title: "Fruit Slice",
    prefix: "fruit",
    href: "/arcade/fruit-slice",
    blurb: "Blades, fruit skins, backgrounds, juice effects and art styles.",
    categories: [
      {
        id: "blade",
        label: "Blades & slicing trails",
        icon: "sword",
        blurb: "The trail your swipe leaves behind.",
        default: { name: "Classic Blade", description: "A red swipe with a white-hot core." },
        items: [
          item("katana", "Katana", 100, "A razor-thin silver edge with a cold glint."),
          item("ink-brush", "Ink Brush", 130, "A tapered calligraphy stroke with ink flecks."),
          item("flame", "Flame Blade", 140, "Blazing orange fire that sheds embers."),
          item("frost", "Frost Blade", 140, "Icy cyan with drifting snowflakes."),
          item("starlight", "Starlight", 150, "Gold light scattering little stars."),
          item("rainbow", "Rainbow", 160, "Shifts through every color as you swipe."),
          item("lightning", "Lightning", 170, "A crackling electric bolt."),
        ],
      },
      {
        id: "skin",
        label: "Fruit skins",
        icon: "apple",
        blurb: "Restyles every fruit. Each fruit keeps its own color, and bombs always look like bombs.",
        default: { name: "Fresh", description: "Juicy, glossy fruit." },
        items: [
          item("polka", "Polka Dots", 90, "Playful polka-dot fruit."),
          item("glossy", "Candy Gloss", 100, "Hard-candy shine with a sugar rim."),
          item("frosted", "Frosted", 110, "Sugar-frosted with icy sparkles."),
          item("faces", "Fruit Friends", 110, "Every fruit has a happy little face."),
          item("plush", "Plush", 120, "Stitched plush toys with felt leaves."),
          item("golden", "Gilded", 140, "Polished gold with a hint of the fruit's color."),
          item("cosmic", "Cosmic", 150, "Starry space swirls in each fruit's color."),
        ],
      },
      {
        id: "background",
        label: "Backgrounds",
        icon: "image",
        blurb: "The surface fruit flies over.",
        default: { name: "Chopping Board", description: "Warm wooden board with grain." },
        items: [
          item("picnic", "Picnic Cloth", 120, "Red gingham picnic cloth."),
          item("bamboo", "Bamboo Dojo", 130, "Green bamboo slats in a training hall."),
          item("marble", "Marble Counter", 130, "Dark kitchen marble with gold veins."),
          item("beach", "Sunny Beach", 140, "Sand, sea and sky."),
          item("sakura", "Cherry Blossom", 150, "Pink petals drifting over dusk."),
          item("night-market", "Night Market", 160, "Glowing lanterns above a busy street."),
          item("space", "Space Station", 160, "Stars and a distant planet."),
        ],
      },
      {
        id: "juice",
        label: "Juice & particle effects",
        icon: "droplets",
        blurb: "What sprays out of sliced fruit and the splats it leaves.",
        default: { name: "Juice Drops", description: "Drops and splats of juice." },
        items: [
          item("glitter", "Glitter", 100, "A shimmer of glitter in the fruit's color."),
          item("bubbles", "Soda Bubbles", 110, "Fizzy bubbles instead of drops."),
          item("pixel-cubes", "Pixel Cubes", 110, "Little cubes scatter and tumble."),
          item("petals", "Petals", 120, "Soft petals flutter away."),
          item("ink", "Ink Splash", 120, "Dark ink splashes and blots."),
          item("stars", "Star Pop", 120, "Bright stars pop out."),
          item("confetti", "Confetti", 130, "Party confetti in every color."),
        ],
      },
      {
        id: "style",
        label: "Art styles",
        icon: "brush",
        style: true,
        blurb: "Redraws fruit, bombs, halves and the board. Your skins, blade, background and juice still apply.",
        default: { name: "Smooth", description: "Soft, glossy shading." },
        items: [
          item("cartoon", "Cartoon", 300, "Thick ink outlines and flat cel shading."),
          item("pixel", "Pixel", 350, "Low-resolution pixel art with crisp edges."),
          item("watercolor", "Watercolor", 400, "Soft painted washes, bleeding edges and paper texture."),
        ],
      },
    ],
  },
  stacker: {
    game: "stacker",
    title: "Tower Stacker",
    prefix: "stacker",
    href: "/arcade/stacker",
    blurb: "Block materials, tower themes, skies and perfect-placement effects.",
    categories: [
      {
        id: "blocks",
        label: "Block colors & materials",
        icon: "palette",
        blurb: "The colors and finish of each block.",
        default: { name: "Dusk Glow", description: "Amber blending into rose." },
        items: [
          item("ocean", "Ocean Blues", 70, "Aqua through deep sea blue."),
          item("pastel", "Pastel Rainbow", 90, "Soft rainbow layers."),
          item("graphite", "Graphite", 90, "Cool greys with a satin finish."),
          item("wood", "Polished Wood", 120, "Warm wood with visible grain."),
          item("marble", "Marble", 130, "White marble with veins."),
          item("metal", "Brushed Metal", 140, "Steel and brass with brushed lines."),
          item("glass", "Glass", 150, "See-through glass with bright edges."),
        ],
      },
      {
        id: "theme",
        label: "Tower themes",
        icon: "building",
        blurb: "Turns your stack into something. Uses your block colors.",
        default: { name: "Plain Slabs", description: "Clean, simple slabs." },
        items: [
          item("books", "Book Stack", 140, "Pages along the sides and a spine band."),
          item("containers", "Shipping Containers", 140, "Corrugated steel containers."),
          item("skyscraper", "Skyscraper", 150, "Window grids on every floor."),
          item("toys", "Toy Bricks", 150, "Snap-together bricks with studs."),
          item("pancakes", "Pancake Stack", 150, "Fluffy pancakes with butter and syrup."),
          item("castle", "Castle", 160, "Stone blocks with battlements."),
          item("cake", "Layer Cake", 170, "Sponge, cream and frosting with sprinkles."),
        ],
      },
      {
        id: "scenery",
        label: "Background scenery",
        icon: "mountain",
        blurb: "The sky behind your tower.",
        default: { name: "Dusk Sky", description: "Deep indigo dusk." },
        items: [
          item("day", "Blue Sky", 120, "A bright day with drifting clouds."),
          item("sunset", "Sunset Ridge", 140, "Orange sunset behind mountain ridges."),
          item("ocean-view", "Ocean Horizon", 140, "Calm sea under a pastel sky."),
          item("night", "Starry Night", 150, "Stars and a crescent moon."),
          item("city", "City Lights", 160, "A skyline of glowing windows."),
          item("aurora", "Aurora", 180, "Shimmering northern lights."),
          item("space", "Orbit", 180, "Your tower reaches space, with a ringed planet."),
        ],
      },
      {
        id: "perfect",
        label: "Perfect-placement effects",
        icon: "sparkles",
        blurb: "What plays when you land a perfect drop.",
        default: { name: "Glow Rings", description: "Glowing outlines spread from the block." },
        items: [
          item("sparkles", "Sparkles", 120, "Twinkling sparkles around the block."),
          item("hearts", "Hearts", 120, "Hearts float up from the block."),
          item("stars", "Star Burst", 120, "Stars shoot outward."),
          item("confetti", "Confetti", 130, "A confetti cannon on every perfect."),
          item("shockwave", "Shockwave", 130, "A bright flash and a wide shockwave."),
          item("lightning", "Lightning", 150, "Electric bolts crackle around the edges."),
          item("fireworks", "Fireworks", 160, "Fireworks burst above the tower."),
        ],
      },
    ],
  },
};

export type GameCosmetic = { id: string; game: ShopGame; category: string; slug: string; name: string; description: string; price: number };

export const GAME_COSMETICS: GameCosmetic[] = SHOP_GAMES.flatMap((game) =>
  GAME_SHOPS[game].categories.flatMap((category) =>
    category.items.map((entry) => ({ ...entry, id: `${GAME_SHOPS[game].prefix}-${entry.slug}`, game, category: category.id })),
  ),
);

const BY_ID = new Map(GAME_COSMETICS.map((entry) => [entry.id, entry]));
export const GAME_COSMETIC_IDS = GAME_COSMETICS.map((entry) => entry.id) as [string, ...string[]];
export const gameCosmetic = (id: unknown): GameCosmetic | undefined => (typeof id === "string" ? BY_ID.get(id) : undefined);

/** Equipped item slug per category; a missing category means the free default. */
export type GameLook = Record<string, string>;

/** Builds a look from stored item ids, ignoring anything that no longer belongs to this game's catalog. */
export function lookFromItems(game: ShopGame, rows: { category: string; item_id: string }[]): GameLook {
  const look: GameLook = {};
  for (const row of rows) {
    const entry = BY_ID.get(row.item_id);
    if (entry && entry.game === game && entry.category === row.category) look[row.category] = entry.slug;
  }
  return look;
}

export const shopHref = (game: ShopGame) => `${GAME_SHOPS[game].href}/shop`;
