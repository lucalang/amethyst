import {
  COSMETICS,
  PROFILE_BADGES,
  PROFILE_TITLES,
  isCosmeticId,
  isProfileBadgeId,
  isProfileTitleId,
  type AvatarDecorationId,
  type ProfileBadgeId,
  type ProfileTitleId,
} from "@/lib/cosmetics";
import type { UnlockableFrameId } from "@/lib/frames";
import { GAME_SHOPS, gameCosmetic, type ShopGame } from "@/lib/game-cosmetics";
import type { ProfileBannerItemId, ProfileFrameId } from "@/lib/profile-cosmetics";

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

type Owned<Type extends InventoryType, Id extends string> = { type: Type; id: Id; name: string; description: string; acquiredAt: string };

export type InventoryItem =
  | Owned<"frame", UnlockableFrameId>
  | Owned<"avatar_decoration", AvatarDecorationId>
  | Owned<"profile_banner", ProfileBannerItemId>
  | Owned<"profile_frame", ProfileFrameId>
  | Owned<"badge", ProfileBadgeId>
  | Owned<"title", ProfileTitleId>
  | (Owned<"game", string> & { game: ShopGame; category: string; slug: string });

/** An owned item id resolved through the registries, or null when this version doesn't know it. */
export function toInventoryItem(id: string, acquiredAt: string): InventoryItem | null {
  const owned = { acquiredAt };
  const game = gameCosmetic(id);
  if (game) return { type: "game", id, name: game.name, description: game.description, game: game.game, category: game.category, slug: game.slug, ...owned };
  if (isProfileBadgeId(id)) return { type: "badge", id, name: PROFILE_BADGES[id].name, description: PROFILE_BADGES[id].description, ...owned };
  if (isProfileTitleId(id)) return { type: "title", id, name: PROFILE_TITLES[id].name, description: PROFILE_TITLES[id].description, ...owned };
  if (isCosmeticId(id)) {
    const { kind, name, description } = COSMETICS[id];
    return { type: kind, id, name, description, ...owned } as InventoryItem;
  }
  return null;
}

/** Where an item belongs, in words: its type, or the game and category for game cosmetics. */
export function inventoryItemLabel(item: InventoryItem): string {
  if (item.type !== "game") return INVENTORY_TYPE_LABELS[item.type].one;
  const shop = GAME_SHOPS[item.game];
  return `${shop.title} · ${shop.categories.find((category) => category.id === item.category)?.label ?? "Cosmetic"}`;
}
