/**
 * Decorative artwork frames for Showcase and the artwork viewer. The 2D look lives in
 * `globals.css` (`.art-frame[data-frame=…]`), the 3D look in the card renderer. Frames are
 * independent of the app theme and never apply to banners or images inside notes.
 */
/** Frames everyone has. */
export const FREE_FRAME_IDS = ["none", "gilt", "amethyst", "holo", "aurora"] as const;
/** Frames bought with Arcade coins (stable ids, also the `cosmetic_items` ids). */
export const SHOP_FRAME_IDS = ["pixel-quest", "neon-marquee", "constellation"] as const;
export const ARTWORK_FRAME_IDS = [...FREE_FRAME_IDS, ...SHOP_FRAME_IDS] as const;
export type ArtworkFrameId = (typeof ARTWORK_FRAME_IDS)[number];
export type ShopFrameId = (typeof SHOP_FRAME_IDS)[number];
export const DEFAULT_ARTWORK_FRAME: ArtworkFrameId = "none";

export const isArtworkFrameId = (value: unknown): value is ArtworkFrameId => ARTWORK_FRAME_IDS.includes(value as ArtworkFrameId);
export const isShopFrameId = (value: unknown): value is ShopFrameId => SHOP_FRAME_IDS.includes(value as ShopFrameId);

/** Frames this account can choose: every free frame plus the shop frames it owns, in catalogue order. */
export function availableFrames(owned: readonly string[]): ArtworkFrameId[] {
  return ARTWORK_FRAME_IDS.filter((id) => !isShopFrameId(id) || owned.includes(id));
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
};
