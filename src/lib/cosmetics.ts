import { ARTWORK_FRAMES, UNLOCKABLE_FRAME_IDS, isAchievementFrameId, type UnlockableFrameId } from "@/lib/frames";

/**
 * The Arcade shop & reward cosmetics catalogue. Ids are stable and match `cosmetic_items` in the
 * database, which is the source of truth for prices, sources and availability; this file describes
 * how items look. New items need a row there, an entry here and their artwork.
 */
export const AVATAR_DECORATION_IDS = ["laurel-wreath", "orbit-ring", "gem-crown", "archivist-quill", "champion-halo", "vault-sigil"] as const;
export type AvatarDecorationId = (typeof AVATAR_DECORATION_IDS)[number];
export const isAvatarDecorationId = (value: unknown): value is AvatarDecorationId => AVATAR_DECORATION_IDS.includes(value as AvatarDecorationId);

export type CosmeticSource = "shop" | "achievement" | "vault";
export type CosmeticKind = "frame" | "avatar_decoration";
export type CosmeticId = UnlockableFrameId | AvatarDecorationId;
export const COSMETIC_IDS: readonly CosmeticId[] = [...UNLOCKABLE_FRAME_IDS, ...AVATAR_DECORATION_IDS];
export const isCosmeticId = (value: unknown): value is CosmeticId => COSMETIC_IDS.includes(value as CosmeticId);

export type CosmeticInfo = { kind: CosmeticKind; name: string; description: string; source: CosmeticSource };

export const AVATAR_DECORATIONS: Record<AvatarDecorationId, { name: string; description: string; source: CosmeticSource }> = {
  "laurel-wreath": { name: "Laurel wreath", description: "Two gilded laurel branches curving up around your picture.", source: "shop" },
  "orbit-ring": { name: "Orbit ring", description: "A glowing orbit around your picture, with a ringed planet and a small moon.", source: "shop" },
  "gem-crown": { name: "Gem crown", description: "A small gold crown perched at a jaunty angle, set with an amethyst, a ruby and a sapphire.", source: "shop" },
  "archivist-quill": { name: "Archivist’s plume", description: "A gilded feather quill and violet ink-crystal arc curving around your picture.", source: "achievement" },
  "champion-halo": { name: "Champion’s halo", description: "A crown of faceted gold stars and amethyst sparks for multi-game record breakers.", source: "achievement" },
  // Secret: only a Vault code unlocks it, and it stays out of the shop until it's yours.
  "vault-sigil": { name: "Vault sigil", description: "A ring of turning runes with a keyhole spark, found behind a secret code.", source: "vault" },
};

/**
 * Profile flair: one badge and one title shown with your name. They're never sold; Vault codes and
 * milestone achievements grant them. Ids match `cosmetic_items` rows of kind 'badge' and 'title'.
 */
export const PROFILE_BADGE_IDS = [
  "badge-keyhole",
  "badge-comet",
  "badge-lantern",
  "badge-sovereign",
  "badge-needle",
  "badge-ouroboros",
  "badge-aegis",
] as const;
export type ProfileBadgeId = (typeof PROFILE_BADGE_IDS)[number];
export const isProfileBadgeId = (value: unknown): value is ProfileBadgeId => PROFILE_BADGE_IDS.includes(value as ProfileBadgeId);
export const PROFILE_BADGES: Record<ProfileBadgeId, { name: string; description: string; source: "vault" | "achievement" }> = {
  "badge-keyhole": { name: "Keyhole", description: "A brass keyhole with violet light behind it.", source: "vault" },
  "badge-comet": { name: "Comet", description: "A comet with a long amethyst tail.", source: "vault" },
  "badge-lantern": { name: "Lantern", description: "A small lantern for late nights in the archive.", source: "vault" },
  "badge-sovereign": { name: "2048 Sovereign", description: "A golden 2048 crown tile set in deep rose enamel.", source: "achievement" },
  "badge-needle": { name: "Sky Threader", description: "Silver wings threading a twin crystal gate.", source: "achievement" },
  "badge-ouroboros": { name: "Ouroboros", description: "An emerald serpent coiled in an unbroken gold ring.", source: "achievement" },
  "badge-aegis": { name: "Broken Seal", description: "A crimson-lit vault iris cloven by a golden key.", source: "achievement" },
};

export const PROFILE_TITLE_IDS = [
  "title-vault-keeper",
  "title-code-breaker",
  "title-night-archivist",
  "title-logic-master",
  "title-blade-dancer",
  "title-master-builder",
  "title-cabinet-curator",
  "title-grand-archivist",
] as const;
export type ProfileTitleId = (typeof PROFILE_TITLE_IDS)[number];
export const isProfileTitleId = (value: unknown): value is ProfileTitleId => PROFILE_TITLE_IDS.includes(value as ProfileTitleId);
export const PROFILE_TITLES: Record<ProfileTitleId, { name: string; description: string; source: "vault" | "achievement" }> = {
  "title-vault-keeper": { name: "Vault Keeper", description: "A title from the Vault, shown under your name.", source: "vault" },
  "title-code-breaker": { name: "Code Breaker", description: "A title from the Vault, shown under your name.", source: "vault" },
  "title-night-archivist": { name: "Night Archivist", description: "A title from the Vault, shown under your name.", source: "vault" },
  "title-logic-master": { name: "Grandmaster", description: "Earned by solving a Hard Sudoku puzzle.", source: "achievement" },
  "title-blade-dancer": { name: "Blade Dancer", description: "Earned by slicing 25+ fruits in one clean run with no bomb hits.", source: "achievement" },
  "title-master-builder": { name: "Master Builder", description: "Earned by placing five blocks perfectly in a row in Tower Stacker.", source: "achievement" },
  "title-cabinet-curator": { name: "Curator", description: "Earned by completing every task in a checklist of 10 or more.", source: "achievement" },
  "title-grand-archivist": { name: "Grand Archivist", description: "Earned by reaching 100% progress on an entry with at least 20 tasks.", source: "achievement" },
};

export type EquipItemId = CosmeticId | ProfileBadgeId | ProfileTitleId;
export const EQUIP_ITEM_IDS: readonly EquipItemId[] = [...COSMETIC_IDS, ...PROFILE_BADGE_IDS, ...PROFILE_TITLE_IDS];
export const isEquipItemId = (value: unknown): value is EquipItemId => EQUIP_ITEM_IDS.includes(value as EquipItemId);

/** How any reward item is named wherever it's shown (the Vault, achievements, profile pickers). */
export function rewardItemInfo(id: string): { kind: "frame" | "avatar_decoration" | "badge" | "title" | "other"; name: string; description: string; source?: CosmeticSource } {
  if (isCosmeticId(id)) return COSMETICS[id];
  if (isProfileBadgeId(id)) return { kind: "badge", ...PROFILE_BADGES[id] };
  if (isProfileTitleId(id)) return { kind: "title", ...PROFILE_TITLES[id] };
  return { kind: "other", name: "Mystery item", description: "Something new for your collection." };
}

export const COSMETICS: Record<CosmeticId, CosmeticInfo> = {
  ...(Object.fromEntries(
    UNLOCKABLE_FRAME_IDS.map((id) => [
      id,
      { kind: "frame", ...ARTWORK_FRAMES[id], source: isAchievementFrameId(id) ? ("achievement" as const) : ("shop" as const) },
    ]),
  ) as Record<UnlockableFrameId, CosmeticInfo>),
  ...(Object.fromEntries(Object.entries(AVATAR_DECORATIONS).map(([id, info]) => [id, { kind: "avatar_decoration", ...info }])) as Record<AvatarDecorationId, CosmeticInfo>),
};

export const COSMETIC_KIND_LABELS: Record<CosmeticKind, string> = { frame: "Artwork frame", avatar_decoration: "Avatar decoration" };

/** A shop or reward item with its server price and this account's state. */
export type ShopItem = {
  id: CosmeticId;
  kind: CosmeticKind;
  price: number;
  available: boolean;
  source: CosmeticSource;
  owned: boolean;
  equipped: boolean;
};
