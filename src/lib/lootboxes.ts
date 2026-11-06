import { z } from "zod";
import { INVENTORY_TYPES, INVENTORY_TYPE_LABELS, type InventoryType } from "@/lib/inventory";
import { RARITY_IDS } from "@/lib/rarities";

/**
 * Lootboxes: cases bought with coins and opened for cosmetics. The database owns prices, drop tables,
 * quantities and results (`loot_cases`, `loot_case_rarities`, `loot_case_items`); this file describes how
 * cases look. A new case needs rows there and an entry in LOOT_CASES.
 */
export const LOOT_CASES: Record<string, { name: string; tagline: string; hue: string; glow: string }> = {
  release: {
    name: "Release Case",
    tagline: "The first case: frames, decorations, banners, profile frames, game cosmetics and three secret Vault rewards.",
    hue: "#8b5cf6",
    glow: "#f0abfc",
  },
};
export const lootCaseInfo = (id: string) => LOOT_CASES[id] ?? { name: "Case", tagline: "", hue: "#8b5cf6", glow: "#f0abfc" };

/** Cases opened per batch (enforced by the database too). */
export const OPEN_BATCH = 10;
/** Cases bought per purchase (enforced by the database too). */
export const MAX_CASE_PURCHASE = 100;
export const OPEN_PRESETS = [1, 3, 5, 10] as const;

const rarity = z.enum(RARITY_IDS);
const kind = z.string().transform((value): InventoryType | null => (INVENTORY_TYPES.includes(value as InventoryType) ? (value as InventoryType) : null));

const resultSchema = z.object({ item: z.string(), kind, rarity, duplicate: z.boolean() });
export const openingSchema = z.object({
  id: z.string(),
  case: z.string(),
  quantity: z.number().int(),
  createdAt: z.string(),
  claimed: z.boolean(),
  results: z.array(resultSchema),
  remaining: z.number().int().optional(),
});
const tierSchema = z.object({
  rarity,
  weight: z.number().int().positive(),
  items: z.array(z.object({ id: z.string().nullable(), kind, owned: z.boolean() })),
});
const caseSchema = z.object({ id: z.string(), price: z.number().int(), available: z.boolean(), quantity: z.number().int(), tiers: z.array(tierSchema) });
export const lootStateSchema = z.object({ balance: z.number().int(), cases: z.array(caseSchema), pending: z.array(openingSchema) });

export type LootResult = z.infer<typeof resultSchema>;
export type LootOpening = z.infer<typeof openingSchema>;
export type LootTier = z.infer<typeof tierSchema>;
export type LootCase = z.infer<typeof caseSchema>;
export type LootState = z.infer<typeof lootStateSchema>;

/**
 * Exact chances from the drop table, by the database's rule: a rarity's weight over the total weight of
 * rarities that have items, split equally between its items.
 */
export function caseOdds(tiers: readonly LootTier[]) {
  const live = tiers.filter((tier) => tier.items.length > 0);
  const total = live.reduce((sum, tier) => sum + tier.weight, 0);
  return live.map((tier) => ({ ...tier, chance: tier.weight / total, itemChance: tier.weight / total / tier.items.length }));
}

/** A probability as a percentage with three significant digits ("45%", "1.5%", "0.167%"). */
export const formatChance = (chance: number) => `${(chance * 100).toLocaleString("en", { maximumSignificantDigits: 3 })}%`;

export const typeLabel = (kind: InventoryType | null) => (kind ? INVENTORY_TYPE_LABELS[kind].one : "Cosmetic");
