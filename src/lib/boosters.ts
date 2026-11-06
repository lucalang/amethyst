import { z } from "zod";

/**
 * Luck Boosters. The database owns prices, owned/active charges and the odds rule (`loot_boosters`,
 * `user_loot_boosters`, `_loot_weights`); this file describes how each tier looks. A new tier needs a
 * row there and an entry here.
 */
export const BOOSTER_LOOKS: Record<string, { name: string; color: string }> = {
  "luck-2x": { name: "2x Luck", color: "#22c55e" },
  "luck-5x": { name: "5x Luck", color: "#3b82f6" },
  "luck-10x": { name: "10x Luck", color: "#f59e0b" },
};
export const boosterLook = (id: string, multiplier: number) => BOOSTER_LOOKS[id] ?? { name: `${multiplier}x Luck`, color: "#a78bfa" };

/** Boosters bought per purchase (enforced by the database too). */
export const MAX_BOOSTER_PURCHASE = 100;

export const boosterSchema = z.object({
  id: z.string(),
  multiplier: z.number().int(),
  price: z.number().int(),
  /** Boosted case openings one booster adds. */
  charges: z.number().int().positive().default(10),
  available: z.boolean(),
  /** Owned charges not yet activated. */
  quantity: z.number().int(),
  /** Boosted openings left for this tier. */
  active: z.number().int(),
});
export const boostSchema = z.object({ luck: z.number().int().min(1), cap: z.number().int(), boosters: z.array(boosterSchema) });
export const NO_BOOST: Boost = { luck: 1, cap: 1, boosters: [] };

export type Booster = z.infer<typeof boosterSchema>;
export type Boost = z.infer<typeof boostSchema>;

export const activeBoosters = (boost: Boost) => boost.boosters.filter((booster) => booster.active > 0);

/** How many of the next openings get at least some boost (the longest active tier). */
export const boostedOpenings = (boost: Boost) => Math.max(0, ...boost.boosters.map((booster) => booster.active));

/**
 * The color for a luck value: the highest tier it contains. Totals are sums of distinct tiers, and each
 * tier beats the sum of the smaller ones, so the largest multiplier at or below the total is that tier.
 */
export function luckColor(luck: number, boosters: readonly Pick<Booster, "id" | "multiplier">[]) {
  const top = [...boosters].sort((a, b) => b.multiplier - a.multiplier).find((booster) => booster.multiplier <= luck);
  return top ? boosterLook(top.id, top.multiplier).color : "#a78bfa";
}
