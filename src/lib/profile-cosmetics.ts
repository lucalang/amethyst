/**
 * Profile showcase cosmetics: banner themes recolour the showcase backdrop, profile frames ornament its edge.
 * Ids are stable and match `cosmetic_items` rows of kind 'profile_banner' / 'profile_frame'. The defaults (the
 * original backdrop, no frame) are free, stored as NULL and not in the catalogue. A new banner needs an entry here
 * (and a `[data-pf-pattern]` block in profile-showcase.css for a new pattern); a new frame needs an entry here and,
 * for a new edge, a `[data-pf-edge]` block. Both need a cosmetic_items row.
 */

export type BannerPattern = "none" | "waves" | "lattice" | "stars" | "rays" | "dots";
/** Space-separated RGB channels, used directly as the showcase's accent tokens. */
type Rgb = `${number} ${number} ${number}`;
type BannerPalette = { accent: Rgb; soft: Rgb; detail: Rgb };

export const DEFAULT_PROFILE_BANNER = "original";
export const PROFILE_BANNERS = {
  original: { name: "Original", description: "The showcase’s own backdrop, tinted by your avatar and lit by your site theme.", palette: null, pattern: "none" },
  "banner-tidepool": {
    name: "Tidepool",
    description: "Sea-glass teal with coral highlights and slow ripples across the wall.",
    palette: { accent: "38 178 178", soft: "120 214 208", detail: "255 150 112" },
    pattern: "waves",
  },
  "banner-verdant": {
    name: "Verdant",
    description: "Fresh greens with a pale gold glow and a fine garden lattice.",
    palette: { accent: "76 170 98", soft: "150 210 140", detail: "226 192 84" },
    pattern: "lattice",
  },
  "banner-nocturne": {
    name: "Nocturne",
    description: "Deep indigo lighting with candle-gold details and a scatter of stars.",
    palette: { accent: "96 112 240", soft: "156 168 250", detail: "236 200 120" },
    pattern: "stars",
  },
  "banner-rosewood": {
    name: "Rosewood",
    description: "Warm rose and orchid tones fanning out like stage light.",
    palette: { accent: "222 88 134", soft: "240 152 180", detail: "180 132 246" },
    pattern: "rays",
  },
  "banner-aurum": {
    name: "Aurum",
    description: "Burnished gold with a violet undertone and an embossed dot grid.",
    palette: { accent: "200 150 52", soft: "228 196 120", detail: "150 110 220" },
    pattern: "dots",
  },
} as const satisfies Record<string, { name: string; description: string; palette: BannerPalette | null; pattern: BannerPattern }>;

export type ProfileBannerId = keyof typeof PROFILE_BANNERS;
/** The banner themes sold as cosmetics (everything except the free default). */
export type ProfileBannerItemId = Exclude<ProfileBannerId, typeof DEFAULT_PROFILE_BANNER>;
export const PROFILE_BANNER_IDS = Object.keys(PROFILE_BANNERS) as ProfileBannerId[];
export const PROFILE_BANNER_ITEM_IDS = PROFILE_BANNER_IDS.filter((id): id is ProfileBannerItemId => id !== DEFAULT_PROFILE_BANNER);
export const isProfileBannerItemId = (value: unknown): value is ProfileBannerItemId => PROFILE_BANNER_ITEM_IDS.includes(value as ProfileBannerItemId);
/** A stored banner id (NULL = default) as a known theme. */
export const toProfileBanner = (value: unknown): ProfileBannerId => (isProfileBannerItemId(value) ? value : DEFAULT_PROFILE_BANNER);

/** Showcase-scoped theme tokens for a banner; the default keeps the site theme's own. */
export function profileBannerStyle(id: ProfileBannerId): Record<string, string> | undefined {
  const palette: BannerPalette | null = PROFILE_BANNERS[id].palette;
  if (!palette) return undefined;
  return {
    "--accent-rgb": palette.accent,
    "--accent-soft-rgb": palette.soft,
    "--rose-rgb": palette.detail,
    "--amethyst": `rgb(${palette.accent})`,
  };
}

export type FrameEdge = "double" | "stepped" | "dotted" | "dashed";
export type FrameMetal = "gilt" | "silver" | "bronze" | "accent";
/** Corner ornament in a 48×48 box with the outer corner at 0,0 (mirrored for the other corners). */
type FrameCorner = { lines: string; gem: string };

export const PROFILE_FRAMES = {
  "profile-frame-filigree": {
    name: "Gilded filigree",
    description: "Curling gold scrollwork at each corner with a fine double rule between.",
    metal: "gilt",
    edge: "double",
    corner: {
      lines: "M3 46V15C3 8.4 8.4 3 15 3h31M9 46V20c0-6.1 4.9-11 11-11h26M9 31c5.5 0 8.5 2.8 8.5 6.6 0 3-2.6 4.6-5 3.4M31 9c0 5.5 2.8 8.5 6.6 8.5 3 0 4.6-2.6 3.4-5",
      gem: "M20 14.5l5.5 5.5-5.5 5.5-5.5-5.5z",
    },
  },
  "profile-frame-deco": {
    name: "Silver deco",
    description: "Stepped silver brackets and a quarter fan, framed by a tiered rule.",
    metal: "silver",
    edge: "stepped",
    corner: {
      lines: "M3 46V3h43M8 46V8h38M13 32V13h19M13 13l9 9M13 24a11 11 0 0 1 11-11M13 19a6 6 0 0 1 6-6",
      gem: "M25 21l4 4-4 4-4-4z",
    },
  },
  "profile-frame-briar": {
    name: "Bronze briar",
    description: "A bronze vine with small leaves and berries, joined by a beaded edge.",
    metal: "bronze",
    edge: "dotted",
    corner: {
      lines: "M5 46C5 22 22 5 46 5M11 33c-4.4-1-6.6-4-5.6-8.4 3.4.2 6.4 3.4 5.6 8.4zM33 11c-1-4.4-4-6.6-8.4-5.6.2 3.4 3.4 6.4 8.4 5.6zM17 21c-3.6-3.2-3.8-7.2-.8-10.4 3 3 3.2 7.2.8 10.4zM21 17c-3.2-3.6-7.2-3.8-10.4-.8 3 3 7.2 3.2 10.4.8z",
      gem: "M12 20a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0zM20 12a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0z",
    },
  },
  "profile-frame-runic": {
    name: "Rune ward",
    description: "Angular wards and a glowing keystone at each corner, in your banner’s colour.",
    metal: "accent",
    edge: "dashed",
    corner: {
      lines: "M3 27V3h24M3 35v11M35 3h11M9 9h10M9 9v10M31 9h6M9 31v6M41 3v5M3 41h5",
      gem: "M17 11l6 6-6 6-6-6z",
    },
  },
} as const satisfies Record<string, { name: string; description: string; metal: FrameMetal; edge: FrameEdge; corner: FrameCorner }>;

export type ProfileFrameId = keyof typeof PROFILE_FRAMES;
export const PROFILE_FRAME_IDS = Object.keys(PROFILE_FRAMES) as ProfileFrameId[];
export const isProfileFrameId = (value: unknown): value is ProfileFrameId => typeof value === "string" && Object.hasOwn(PROFILE_FRAMES, value);
export const toProfileFrame = (value: unknown): ProfileFrameId | null => (isProfileFrameId(value) ? value : null);

/** Shop sources for the catalogue (all of these are sold for coins). */
export const PROFILE_BANNER_ITEMS = Object.fromEntries(
  PROFILE_BANNER_ITEM_IDS.map((id) => [id, { name: PROFILE_BANNERS[id].name, description: PROFILE_BANNERS[id].description, source: "shop" as const }]),
) as Record<ProfileBannerItemId, { name: string; description: string; source: "shop" }>;
export const PROFILE_FRAME_ITEMS = Object.fromEntries(
  PROFILE_FRAME_IDS.map((id) => [id, { name: PROFILE_FRAMES[id].name, description: PROFILE_FRAMES[id].description, source: "shop" as const }]),
) as Record<ProfileFrameId, { name: string; description: string; source: "shop" }>;
