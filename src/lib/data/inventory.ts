import "server-only";
import { buildCollectionIndex, type IndexItem } from "@/lib/collection-index";
import { toInventoryItem, type InventoryItem } from "@/lib/inventory";
import { lootStateSchema, type LootState } from "@/lib/lootboxes";
import type { AuthContext } from "@/lib/supabase/auth";

/** The account's owned items, most recently acquired first. */
export async function loadInventory(ctx: AuthContext): Promise<InventoryItem[]> {
  const { data, error } = await ctx.supabase
    .from("user_cosmetics")
    .select("item_id, acquired_at, cosmetic_items(rarity)")
    .eq("user_id", ctx.userId)
    .order("acquired_at", { ascending: false });
  if (error) throw new Error(`Could not load the inventory: ${error.code}`);
  return (data ?? []).flatMap((row) => toInventoryItem(row.item_id, row.acquired_at, row.cosmetic_items?.rarity ?? "common") ?? []);
}

/** Every collectible with this account's ownership and sources. `oddsLoaded` is false when case drop tables failed to load. */
export async function loadCollectionIndex(ctx: AuthContext): Promise<{ items: IndexItem[]; oddsLoaded: boolean }> {
  const [catalog, owned, loot] = await Promise.all([
    ctx.supabase.from("cosmetic_items").select("id, price, available, source, secret, rarity"),
    ctx.supabase.from("user_cosmetics").select("item_id, acquired_at").eq("user_id", ctx.userId),
    loadLootState(ctx).catch(() => null),
  ]);
  if (catalog.error) throw new Error(`Could not load the item catalog: ${catalog.error.code}`);
  if (owned.error) throw new Error(`Could not load owned items: ${owned.error.code}`);
  const ownedAt = new Map((owned.data ?? []).map((row) => [row.item_id, row.acquired_at]));
  return { items: buildCollectionIndex(catalog.data ?? [], ownedAt, loot?.cases ?? null), oddsLoaded: loot !== null };
}

/** Coin balance, cases with owned quantities and drop tables, and unclaimed openings. */
export async function loadLootState(ctx: AuthContext): Promise<LootState> {
  const { data, error } = await ctx.supabase.rpc("loot_state");
  if (error) throw new Error(`Could not load cases: ${error.code}`);
  return lootStateSchema.parse(data);
}
