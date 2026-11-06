/**
 * Cosmetic rarities, lowest to highest. Every `cosmetic_items` row has one (the database assigns it);
 * this registry only describes how each looks. Ids are stable.
 */
export const RARITY_IDS = ["common", "uncommon", "epic", "legendary", "mythic", "secret"] as const;
export type RarityId = (typeof RARITY_IDS)[number];
export const isRarity = (value: unknown): value is RarityId => RARITY_IDS.includes(value as RarityId);

export const RARITIES: Record<RarityId, { label: string; color: string }> = {
  common: { label: "Common", color: "#9ca3af" },
  uncommon: { label: "Uncommon", color: "#4ade80" },
  epic: { label: "Epic", color: "#a855f7" },
  legendary: { label: "Legendary", color: "#f59e0b" },
  mythic: { label: "Mythic", color: "#f43f5e" },
  secret: { label: "Secret", color: "#22d3ee" },
};

export const rarityRank = (rarity: RarityId) => RARITY_IDS.indexOf(rarity);
