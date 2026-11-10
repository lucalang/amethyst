import { achievementForItem } from "@/lib/achievements";
import { GAME_SHOPS, shopHref } from "@/lib/game-cosmetics";
import { COLLECTIBLE_IDS, describeItem, registrySource, type CollectibleItem } from "@/lib/inventory";
import { caseOdds, lootCaseInfo, type LootCase } from "@/lib/lootboxes";
import { isRarity, type RarityId } from "@/lib/rarities";

/**
 * The Index: every collectible in the catalogue with this account's ownership and the ways to get it.
 * Built from the registries (names, art), `cosmetic_items` (price, availability, source, rarity),
 * `user_cosmetics` (ownership) and `loot_state()` (case drop tables). No second item list.
 */
export type ItemSource =
  | { kind: "shop"; price: number; label: string; href: string }
  | { kind: "achievement"; name: string; requirement: string; href: string }
  | { kind: "case"; name: string; chance: number; href: string }
  /** A secret the account doesn't own: the case lists it only as a hidden reward. */
  | { kind: "hidden-case"; name: string; href: string }
  | { kind: "vault"; href: string }
  | { kind: "tournament"; href: string };

/** `uncertain`: only secret Vault codes (or hidden case rewards) grant it, and which codes are live isn't public. */
export type Availability = "obtainable" | "uncertain" | "unavailable";

export type IndexItem = CollectibleItem & {
  rarity: RarityId;
  owned: boolean;
  acquiredAt: string | null;
  secret: boolean;
  sources: ItemSource[];
  availability: Availability;
};

export type CatalogRow = { id: string; price: number; available: boolean; source: string; secret: boolean; rarity: string };

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  obtainable: "Obtainable",
  uncertain: "Secret source",
  unavailable: "Not obtainable",
};

export const casesHref = (caseId: string) => `/shop/cases#case-${caseId}`;

/**
 * Secret rows the account doesn't own are hidden from it by row-level security, so they come from the
 * registries with the rarity the database gives every secret item.
 */
export function buildCollectionIndex(rows: readonly CatalogRow[], owned: ReadonlyMap<string, string>, cases: readonly LootCase[] | null): IndexItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const odds = (cases ?? []).filter((lootCase) => lootCase.available).map((lootCase) => ({ lootCase, tiers: caseOdds(lootCase.tiers) }));
  return COLLECTIBLE_IDS.flatMap((id): IndexItem[] => {
    const item = describeItem(id);
    const row = byId.get(id);
    if (!item || (!row && registrySource(id) !== "vault")) return [];
    const hidden = !row;
    const source = row?.source ?? "vault";
    const sources: ItemSource[] = [];

    if (row && source === "shop" && row.available) {
      sources.push(
        item.type === "game"
          ? { kind: "shop", price: row.price, label: `${GAME_SHOPS[item.game].title} shop`, href: shopHref(item.game) }
          : { kind: "shop", price: row.price, label: "Cosmetics shop", href: "/shop/cosmetics" },
      );
    }
    const achievement = achievementForItem(id);
    if (achievement) sources.push({ kind: "achievement", name: achievement.name, requirement: achievement.description, href: `/achievements#${achievement.id}` });
    for (const { lootCase, tiers } of odds) {
      const name = lootCaseInfo(lootCase.id).name;
      const tier = tiers.find((entry) => entry.items.some((entry) => entry.id === id));
      if (tier) sources.push({ kind: "case", name, chance: tier.itemChance, href: casesHref(lootCase.id) });
      else if (hidden && tiers.some((entry) => entry.items.some((entry) => entry.id === null))) sources.push({ kind: "hidden-case", name, href: casesHref(lootCase.id) });
    }
    if (source === "vault") sources.push({ kind: "vault", href: "/vault" });
    if (source === "tournament") sources.push({ kind: "tournament", href: "/arcade/tournaments" });

    const availability: Availability = sources.some((entry) => entry.kind === "shop" || entry.kind === "achievement" || entry.kind === "case" || entry.kind === "tournament")
      ? "obtainable"
      : sources.length
        ? "uncertain"
        : "unavailable";
    const acquiredAt = owned.get(id) ?? null;
    return [
      {
        ...item,
        rarity: row && isRarity(row.rarity) ? row.rarity : hidden ? "secret" : "common",
        owned: acquiredAt !== null,
        acquiredAt,
        secret: row?.secret ?? true,
        sources,
        availability,
      },
    ];
  });
}
