import {
  COSMETIC_IDS,
  COSMETICS,
  PROFILE_BADGE_IDS,
  PROFILE_BADGES,
  PROFILE_TITLE_IDS,
  PROFILE_TITLES,
  isCosmeticId,
  isProfileBadgeId,
  isProfileTitleId,
  type AvatarDecorationId,
  type ProfileBadgeId,
  type ProfileTitleId,
} from "@/lib/cosmetics";
import type { UnlockableFrameId } from "@/lib/frames";
import { GAME_COSMETIC_IDS, GAME_SHOPS, gameCosmetic, type ShopGame } from "@/lib/game-cosmetics";
import type { ProfileBannerItemId, ProfileFrameId } from "@/lib/profile-cosmetics";
import type { RarityId } from "@/lib/rarities";

/**
 * Everything an account owns, as one flat list. Ownership is `user_cosmetics`; names and art come
 * from the existing registries. Item ids are the stable `cosmetic_items` ids and types mirror its `kind`.
 */
export const INVENTORY_TYPES = ["frame", "avatar_decoration", "profile_banner", "profile_frame", "badge", "title", "game"] as const;
export type InventoryType = (typeof INVENTORY_TYPES)[number];

export const INVENTORY_TYPE_LABELS: Record<InventoryType, { one: string; many: string }> = {
  frame: { one: "Artwork frame", many: "Artwork frames" },
  avatar_decoration: { one: "Avatar decoration", many: "Avatar decorations" },
  profile_banner: { one: "Banner theme", many: "Banner themes" },
  profile_frame: { one: "Profile frame", many: "Profile frames" },
  badge: { one: "Badge", many: "Badges" },
  title: { one: "Title", many: "Titles" },
  game: { one: "Game cosmetic", many: "Game cosmetics" },
};

type Described<Type extends InventoryType, Id extends string> = { type: Type; id: Id; name: string; description: string };

/** Any item an account can own, described by the registries (ownership not included). */
export type CollectibleItem =
  | Described<"frame", UnlockableFrameId>
  | Described<"avatar_decoration", AvatarDecorationId>
  | Described<"profile_banner", ProfileBannerItemId>
  | Described<"profile_frame", ProfileFrameId>
  | Described<"badge", ProfileBadgeId>
  | Described<"title", ProfileTitleId>
  | (Described<"game", string> & { game: ShopGame; category: string; slug: string });

export type InventoryItem = CollectibleItem & { acquiredAt: string; rarity: RarityId };

/** Every item id the registries can describe, in catalogue order (types follow INVENTORY_TYPES). */
export const COLLECTIBLE_IDS: readonly string[] = [...COSMETIC_IDS, ...PROFILE_BADGE_IDS, ...PROFILE_TITLE_IDS, ...GAME_COSMETIC_IDS];

/** An item id resolved through the registries, or null when this version doesn't know it. */
export function describeItem(id: string): CollectibleItem | null {
  const game = gameCosmetic(id);
  if (game) return { type: "game", id, name: game.name, description: game.description, game: game.game, category: game.category, slug: game.slug };
  if (isProfileBadgeId(id)) return { type: "badge", id, name: PROFILE_BADGES[id].name, description: PROFILE_BADGES[id].description };
  if (isProfileTitleId(id)) return { type: "title", id, name: PROFILE_TITLES[id].name, description: PROFILE_TITLES[id].description };
  if (isCosmeticId(id)) {
    const { kind, name, description } = COSMETICS[id];
    return { type: kind, id, name, description } as CollectibleItem;
  }
  return null;
}

/** How the registries say an item is obtained (the database's `cosmetic_items.source` is authoritative). */
export function registrySource(id: string): "shop" | "achievement" | "vault" | "case" | null {
  if (gameCosmetic(id)) return "shop";
  if (isProfileBadgeId(id)) return PROFILE_BADGES[id].source;
  if (isProfileTitleId(id)) return PROFILE_TITLES[id].source;
  if (isCosmeticId(id)) return COSMETICS[id].source;
  return null;
}

/** An owned item id resolved through the registries, or null when this version doesn't know it. */
export function toInventoryItem(id: string, acquiredAt: string, rarity: RarityId): InventoryItem | null {
  const item = describeItem(id);
  return item ? { ...item, acquiredAt, rarity } : null;
}

/** Where an item belongs, in words: its type, or the game and category for game cosmetics. */
export function inventoryItemLabel(item: CollectibleItem): string {
  if (item.type !== "game") return INVENTORY_TYPE_LABELS[item.type].one;
  const shop = GAME_SHOPS[item.game];
  return `${shop.title} · ${shop.categories.find((category) => category.id === item.category)?.label ?? "Cosmetic"}`;
}
