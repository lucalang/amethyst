import "server-only";
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

/** Coin balance, cases with owned quantities and drop tables, and unclaimed openings. */
export async function loadLootState(ctx: AuthContext): Promise<LootState> {
  const { data, error } = await ctx.supabase.rpc("loot_state");
  if (error) throw new Error(`Could not load cases: ${error.code}`);
  return lootStateSchema.parse(data);
}
