import { ARTWORK_FRAMES, SHOP_FRAME_IDS, type ShopFrameId } from "@/lib/frames";

/**
 * The Arcade shop catalogue. Ids are stable and match `cosmetic_items` in the database, which is
 * the source of truth for prices and availability; this file only describes how items look.
 * New items need a row there, an entry here and their artwork.
 */
export const AVATAR_DECORATION_IDS = ["laurel-wreath", "orbit-ring", "gem-crown"] as const;
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
};

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
