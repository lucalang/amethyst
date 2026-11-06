import { AVATAR_DECORATIONS, COSMETICS, PROFILE_BADGES, PROFILE_TITLES, isAvatarDecorationId, isCosmeticId, isProfileBadgeId, isProfileTitleId } from "@/lib/cosmetics";
import { GAME_SHOPS, gameCosmetic, type ShopGame } from "@/lib/game-cosmetics";
import type { UnlockableFrameId } from "@/lib/frames";

/**
 * Profile showcase presentation styles. Ids are stored in users.profile_style and profile_looks and must never
 * change; a new style needs an entry here, a `[data-pf-style=<id>]` block in profile-showcase.css and a
 * pedestal finish in pedestal-scene.ts (it falls back to the gallery finish).
 */
export const PROFILE_STYLES = {
  gallery: { name: "Gallery wall", description: "Spotlit artwork hung in a quiet salon, with your nameplate beside it.", ambient: "motes" },
  cabinet: { name: "Trophy cabinet", description: "A dark glass vitrine with medals and artwork resting on lit shelves.", ambient: "glints" },
  desk: { name: "Collector’s desk", description: "Your ID card and favourite pieces laid out loosely on a lamp-lit desk.", ambient: "motes" },
} as const satisfies Record<string, { name: string; description: string; ambient: ProfileAmbientId }>;

export type ProfileStyleId = keyof typeof PROFILE_STYLES;
export const PROFILE_STYLE_IDS = Object.keys(PROFILE_STYLES) as ProfileStyleId[];
export const DEFAULT_PROFILE_STYLE: ProfileStyleId = "gallery";
export const isProfileStyleId = (value: unknown): value is ProfileStyleId => typeof value === "string" && Object.hasOwn(PROFILE_STYLES, value);
export const toProfileStyle = (value: unknown): ProfileStyleId => (isProfileStyleId(value) ? value : DEFAULT_PROFILE_STYLE);

export const MAX_SHOWCASE_ACHIEVEMENTS = 3;
export const MAX_SHOWCASE_ITEMS = 4;
/** Saved profile looks per member (enforced by the database too). */
export const MAX_PROFILE_LOOKS = 5;

/** Showcase sections the owner can order below their identity. Ids are stored; append new ones only. */
export const PROFILE_SECTIONS = {
  gallery: { name: "Featured artwork", description: "Covers and artwork you chose from your Archive." },
  achievements: { name: "Pinned achievements", description: "Up to three medals you have earned." },
  pedestal: { name: "Centerpiece", description: "One collectible you own, on a lit pedestal." },
} as const satisfies Record<string, { name: string; description: string }>;
export type ProfileSectionId = keyof typeof PROFILE_SECTIONS;
export const PROFILE_SECTION_IDS = Object.keys(PROFILE_SECTIONS) as ProfileSectionId[];
const isSectionId = (value: unknown): value is ProfileSectionId => typeof value === "string" && Object.hasOwn(PROFILE_SECTIONS, value);
/** Known, unique sections in the stored order; sections added later are appended. */
export function toProfileSections(values: readonly unknown[] | null | undefined): ProfileSectionId[] {
  const known = [...new Set((values ?? []).filter(isSectionId))];
  return [...known, ...PROFILE_SECTION_IDS.filter((id) => !known.includes(id))];
}

/**
 * Optional ambient scene effects layered behind the showcase; "off" is a full choice, not a fallback.
 * Ids are stored; a new effect needs an entry here and a `[data-pf-ambient=<id>]` block in profile-showcase.css.
 */
export const PROFILE_AMBIENTS = {
  off: { name: "Off", description: "A still room — nothing drifts or glows." },
  motes: { name: "Drifting motes", description: "Dust motes rising slowly through the light." },
  glints: { name: "Glints", description: "Small points of light catching on glass and metal." },
  aurora: { name: "Aurora", description: "A slow veil of colour moving across the back wall." },
} as const satisfies Record<string, { name: string; description: string }>;
export type ProfileAmbientId = keyof typeof PROFILE_AMBIENTS;
export const PROFILE_AMBIENT_IDS = Object.keys(PROFILE_AMBIENTS) as ProfileAmbientId[];
export const toProfileAmbient = (value: unknown): ProfileAmbientId =>
  typeof value === "string" && Object.hasOwn(PROFILE_AMBIENTS, value) ? (value as ProfileAmbientId) : "motes";

/** How an owned collectible stands on the pedestal. Only game cosmetics have a live preview; the rest are shown in 2D. */
export type PedestalCollectible =
  | { kind: "game"; id: string; name: string; description: string; label: string; game: ShopGame; category: string; slug: string }
  | { kind: "frame"; id: UnlockableFrameId; name: string; description: string; label: string }
  | { kind: "decoration"; id: keyof typeof AVATAR_DECORATIONS; name: string; description: string; label: string }
  | { kind: "badge"; id: keyof typeof PROFILE_BADGES; name: string; description: string; label: string }
  | { kind: "title"; id: keyof typeof PROFILE_TITLES; name: string; description: string; label: string };

/** The pedestal description of an owned item id, or null when it can't be displayed. */
export function pedestalCollectible(id: unknown): PedestalCollectible | null {
  if (typeof id !== "string") return null;
  const game = gameCosmetic(id);
  if (game) {
    const shop = GAME_SHOPS[game.game];
    const category = shop.categories.find((entry) => entry.id === game.category);
    return { kind: "game", id, name: game.name, description: game.description, label: `${shop.title} · ${category?.label ?? "Cosmetic"}`, game: game.game, category: game.category, slug: game.slug };
  }
  if (isAvatarDecorationId(id)) return { kind: "decoration", id, name: AVATAR_DECORATIONS[id].name, description: AVATAR_DECORATIONS[id].description, label: "Avatar decoration" };
  if (isCosmeticId(id)) return { kind: "frame", id: id as UnlockableFrameId, name: COSMETICS[id].name, description: COSMETICS[id].description, label: "Artwork frame" };
  if (isProfileBadgeId(id)) return { kind: "badge", id, name: PROFILE_BADGES[id].name, description: PROFILE_BADGES[id].description, label: "Badge" };
  if (isProfileTitleId(id)) return { kind: "title", id, name: PROFILE_TITLES[id].name, description: PROFILE_TITLES[id].description, label: "Title" };
  return null;
}

/** Everything a saved look (or the worn showcase) arranges. Items are stored by id; their artwork is resolved per viewer. */
export type ShowcaseArrangement = {
  style: ProfileStyleId;
  sections: ProfileSectionId[];
  ambient: ProfileAmbientId;
  pedestal: string | null;
  achievements: string[];
};

export type ShowcaseShape = "portrait" | "square" | "wide";

/** One featured Archive piece as displayed: artwork plus only the metadata the owner approved. */
export type ShowcasePiece = {
  key: string;
  kind: "entry" | "collection";
  title: string | null;
  accent: string | null;
  shape: ShowcaseShape;
  src: string | null;
};
