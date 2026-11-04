/**
 * Decorative artwork frames for Showcase and the artwork viewer. The 2D look lives in
 * `globals.css` (`.art-frame[data-frame=…]`), the 3D look in the card renderer. Frames are
 * independent of the app theme and never apply to banners or images inside notes.
 */
/** Frames everyone has. */
export const FREE_FRAME_IDS = ["none", "gilt", "amethyst", "holo", "aurora"] as const;
/** Frames bought with Arcade coins (stable ids, also the `cosmetic_items` ids). */
export const SHOP_FRAME_IDS = [
  "pixel-quest",
  "neon-marquee",
  "constellation",
  "koi-rail",
  "pressed-diary",
  "spider-lily",
  "sonata-keys",
  "demon-wing",
  "moonshot",
  "golden-arrow",
  "tsuba-guard",
  "five-ribbons",
  "frost-glam",
  "hollow-fang",
  "summer-fireworks",
  "sakura-storm",
  "kagune-coil",
  "stained-prelude",
  "fallen-halo",
  "afterimage",
  "zipper-rush",
  "bridal-bouquet",
  "lavender-north",
] as const;
/** Frames unlocked exclusively by earning milestone achievements. */
export const ACHIEVEMENT_FRAME_IDS = ["obsidian-relic", "celestial-prism"] as const;
export const UNLOCKABLE_FRAME_IDS = [...SHOP_FRAME_IDS, ...ACHIEVEMENT_FRAME_IDS] as const;
export const ARTWORK_FRAME_IDS = [...FREE_FRAME_IDS, ...SHOP_FRAME_IDS, ...ACHIEVEMENT_FRAME_IDS] as const;
export type ArtworkFrameId = (typeof ARTWORK_FRAME_IDS)[number];
export type ShopFrameId = (typeof SHOP_FRAME_IDS)[number];
export type AchievementFrameId = (typeof ACHIEVEMENT_FRAME_IDS)[number];
export type UnlockableFrameId = (typeof UNLOCKABLE_FRAME_IDS)[number];
export const DEFAULT_ARTWORK_FRAME: ArtworkFrameId = "none";
/** Frames still in design: the frame renderers draw them, but nobody can select or save them yet. */
export const DRAFT_FRAME_IDS = ["seraph-wings"] as const;
export type DraftFrameId = (typeof DRAFT_FRAME_IDS)[number];
/** Any frame the 2D and 3D renderers can draw. */
export type FrameLookId = ArtworkFrameId | DraftFrameId;

export const isArtworkFrameId = (value: unknown): value is ArtworkFrameId => ARTWORK_FRAME_IDS.includes(value as ArtworkFrameId);
export const isShopFrameId = (value: unknown): value is ShopFrameId => SHOP_FRAME_IDS.includes(value as ShopFrameId);
export const isAchievementFrameId = (value: unknown): value is AchievementFrameId => ACHIEVEMENT_FRAME_IDS.includes(value as AchievementFrameId);
export const isUnlockableFrameId = (value: unknown): value is UnlockableFrameId => UNLOCKABLE_FRAME_IDS.includes(value as UnlockableFrameId);

/** Frames this account can choose: every free frame plus the shop and achievement frames it owns, in catalogue order. */
export function availableFrames(owned: readonly string[]): ArtworkFrameId[] {
  return ARTWORK_FRAME_IDS.filter((id) => !isUnlockableFrameId(id) || owned.includes(id));
}

/**
 * The frame an entry shows: its own choice when it has one (including an explicit "none"),
 * otherwise the account default. Entries store null to inherit, so default changes reach them.
 */
export function resolveFrame(entryFrame: string | null | undefined, accountFrame: ArtworkFrameId): ArtworkFrameId {
  return isArtworkFrameId(entryFrame) ? entryFrame : accountFrame;
}

export type ArtworkFrameInfo = { name: string; description: string; animated?: boolean };

export const ARTWORK_FRAMES: Record<ArtworkFrameId, ArtworkFrameInfo> = {
  none: { name: "No frame", description: "Just the artwork, edge to edge." },
  gilt: { name: "Gilt edge", description: "A slim champagne-gold rim with small studs at the corners." },
  amethyst: { name: "Amethyst filigree", description: "Violet filigree corners and a small faceted crest above the art." },
  holo: { name: "Holographic edge", description: "An iridescent rim that shifts color as the light moves across it." },
  aurora: { name: "Aurora trace", description: "A quiet thread of light that slowly travels around the edge.", animated: true },
  "pixel-quest": { name: "Pixel quest", description: "A chunky 8-bit border with pixel-gem corners and a little coin crest." },
  "neon-marquee": { name: "Marquee lights", description: "A dark marquee band lined with warm bulbs inside a pink-and-cyan neon tube." },
  constellation: { name: "Constellation", description: "A deep night rim scattered with stars, gold hairlines and star-chart corners." },
  "koi-rail": { name: "Koi rail", description: "A wooden bridge rail over rippling water, with a koi gliding past, a lotus blooming among the rings and a wave breaking under a red sun." },
  "pressed-diary": { name: "Pressed diary", description: "Cream linen with stitched cherry leather, gold filigree corners, a pressed cherry spray and a wax seal over ribbon tails." },
  "spider-lily": { name: "Spider lily", description: "A dark lacquer rim with a glowing crimson inlay, spider lilies curling from the corners and one crowning the top." },
  "sonata-keys": { name: "Sonata keys", description: "A keyboard running all the way round, gold violin scrolls at the corners, a treble clef on its staff and drifting notes." },
  "demon-wing": { name: "Demon wing", description: "Neon-splashed black with devil bat wings spreading from the top corners, a horned head with glowing eyes, dripping blood and a relay baton shedding tears." },
  moonshot: { name: "Moonshot", description: "Chrome plating bolted at the corners, glowing circuit traces, glitch slices, a crescent moon and a rocket blasting off." },
  "golden-arrow": { name: "Golden arrow", description: "A violet Art Deco lattice with the Stand Arrow over a gold sunburst, ladybug brooches at the corners and menacing ゴゴゴ rumbling up the sides." },
  "tsuba-guard": { name: "Sword guard", description: "Gold-railed silk hilt wrapping, crimson-sheathed katanas, gilded iron sword guards, an ember-enamelled black butterfly and a tasselled cord knot." },
  "five-ribbons": { name: "Five ribbons", description: "Blush satin and lace with the sisters' keepsakes: blue headphones, a green bunny-ear ribbon, black butterflies, star clips, a wedding bell and five ribbon tails." },
  "frost-glam": { name: "Frost glam", description: "Icy rhinestones and snowflake corners beneath a crystal tiara set with a pink heart." },
  "hollow-fang": { name: "Hollow fang", description: "A jaw of bone fangs, black crescent slashes burning crimson, a cracked bone mask and horns around a hollow." },
  "summer-fireworks": { name: "Summer fireworks", description: "Golden fireworks bursting at every corner, sparkler trails along the rails, a sunflower on top and paper lanterns below." },
  "sakura-storm": { name: "Sakura storm", description: "Cherry branches in full bloom climbing the sides, a blossoming bough arching over the top and omikuji fortunes tied on a string below." },
  "kagune-coil": { name: "Kagune coil", description: "Segmented crimson tendrils coiling out of the corners, red crystal shards and a single red-on-black eye." },
  "stained-prelude": { name: "Stained prelude", description: "Leaded pastel stained glass with violin sound holes, a rose window on top and a bow resting below." },
  "fallen-halo": { name: "Fallen halo", description: "Layered white wings at the top corners, a broken gold halo and loose feathers drifting below." },
  afterimage: { name: "Afterimage", description: "Chrome vertebrae on a lime light line, colour-split speed streaks, wired hex chips and a chrome chevron visor." },
  "zipper-rush": { name: "Zipper rush", description: "A gold zip running all the way round, torn open at two corners onto a starry void, with star studs and a violet aura flickering on top." },
  "bridal-bouquet": { name: "Bridal bouquet", description: "Veil lace and pearl strands, two linked wedding rings on top and a five-flower bouquet tied with ribbon." },
  "lavender-north": { name: "Lavender north", description: "Lavender bundles tied with pink bows, a fox beside a snow globe, pink heart charms and a lavender field in the snow." },
  "obsidian-relic": { name: "Obsidian relic", description: "Faceted black obsidian with gold-leaf seams and a crown-cut amethyst seal." },
  "celestial-prism": { name: "Celestial prism", description: "Crystal prism bevels with a slow starlight refraction and silver astrolabe corners.", animated: true },
};
