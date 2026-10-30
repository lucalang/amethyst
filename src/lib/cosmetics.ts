import { ARTWORK_FRAMES, SHOP_FRAME_IDS, type ShopFrameId } from "@/lib/frames";

/**
 * The Arcade shop catalogue. Ids are stable and match `cosmetic_items` in the database, which is
 * the source of truth for prices and availability; this file only describes how items look.
 * New items need a row there, an entry here and their artwork.
 */
export const AVATAR_DECORATION_IDS = ["laurel-wreath", "orbit-ring", "gem-crown", "vault-sigil"] as const;
export type AvatarDecorationId = (typeof AVATAR_DECORATION_IDS)[number];
export const isAvatarDecorationId = (value: unknown): value is AvatarDecorationId => AVATAR_DECORATION_IDS.includes(value as AvatarDecorationId);

export type CosmeticKind = "frame" | "avatar_decoration";
export type CosmeticId = ShopFrameId | AvatarDecorationId;
export const COSMETIC_IDS: readonly CosmeticId[] = [...SHOP_FRAME_IDS, ...AVATAR_DECORATION_IDS];
export const isCosmeticId = (value: unknown): value is CosmeticId => COSMETIC_IDS.includes(value as CosmeticId);

export type CosmeticInfo = { kind: CosmeticKind; name: string; description: string };

export const AVATAR_DECORATIONS: Record<AvatarDecorationId, { name: string; description: string }> = {
  "laurel-wreath": { name: "Laurel wreath", description: "Two gilded laurel branches curving up around your picture." },
  "orbit-ring": { name: "Orbit ring", description: "A glowing orbit around your picture, with a ringed planet and a small moon." },
  "gem-crown": { name: "Gem crown", description: "A small gold crown perched at a jaunty angle, set with an amethyst, a ruby and a sapphire." },
  // Secret: only a Vault code unlocks it, and it stays out of the shop until it's yours.
  "vault-sigil": { name: "Vault sigil", description: "A ring of turning runes with a keyhole spark, found behind a secret code." },
};

/**
 * Profile flair: one badge and one title shown with your name. They're never sold; Vault codes (and
 * future rewards) grant them. Ids match `cosmetic_items` rows of kind 'badge' and 'title'.
 */
export const PROFILE_BADGE_IDS = ["badge-keyhole", "badge-comet", "badge-lantern"] as const;
export type ProfileBadgeId = (typeof PROFILE_BADGE_IDS)[number];
export const isProfileBadgeId = (value: unknown): value is ProfileBadgeId => PROFILE_BADGE_IDS.includes(value as ProfileBadgeId);
export const PROFILE_BADGES: Record<ProfileBadgeId, { name: string; description: string }> = {
  "badge-keyhole": { name: "Keyhole", description: "A brass keyhole with violet light behind it." },
  "badge-comet": { name: "Comet", description: "A comet with a long amethyst tail." },
  "badge-lantern": { name: "Lantern", description: "A small lantern for late nights in the archive." },
};

export const PROFILE_TITLE_IDS = ["title-vault-keeper", "title-code-breaker", "title-night-archivist"] as const;
export type ProfileTitleId = (typeof PROFILE_TITLE_IDS)[number];
export const isProfileTitleId = (value: unknown): value is ProfileTitleId => PROFILE_TITLE_IDS.includes(value as ProfileTitleId);
export const PROFILE_TITLES: Record<ProfileTitleId, { name: string }> = {
  "title-vault-keeper": { name: "Vault Keeper" },
  "title-code-breaker": { name: "Code Breaker" },
  "title-night-archivist": { name: "Night Archivist" },
};

/** How any reward item is named wherever it's shown (the Vault, profile pickers). */
export function rewardItemInfo(id: string): { kind: "frame" | "avatar_decoration" | "badge" | "title" | "other"; name: string; description: string } {
  if (isCosmeticId(id)) return COSMETICS[id];
  if (isProfileBadgeId(id)) return { kind: "badge", ...PROFILE_BADGES[id] };
  if (isProfileTitleId(id)) return { kind: "title", name: PROFILE_TITLES[id].name, description: "A title shown under your name." };
  return { kind: "other", name: "Mystery item", description: "Something new for your collection." };
}

export const COSMETICS: Record<CosmeticId, CosmeticInfo> = {
  ...(Object.fromEntries(SHOP_FRAME_IDS.map((id) => [id, { kind: "frame", ...ARTWORK_FRAMES[id] }])) as Record<ShopFrameId, CosmeticInfo>),
  ...(Object.fromEntries(Object.entries(AVATAR_DECORATIONS).map(([id, info]) => [id, { kind: "avatar_decoration", ...info }])) as Record<AvatarDecorationId, CosmeticInfo>),
};

export const COSMETIC_KIND_LABELS: Record<CosmeticKind, string> = { frame: "Artwork frame", avatar_decoration: "Avatar decoration" };

/** A shop item with its server price and this account's state. */
export type ShopItem = {
  id: CosmeticId;
  kind: CosmeticKind;
  price: number;
  available: boolean;
  owned: boolean;
  equipped: boolean;
};
