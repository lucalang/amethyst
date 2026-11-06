import "server-only";
import { toInventoryItem, type InventoryItem } from "@/lib/inventory";
import type { AuthContext } from "@/lib/supabase/auth";

/** The account's owned items, most recently acquired first. */
export async function loadInventory(ctx: AuthContext): Promise<InventoryItem[]> {
  const { data, error } = await ctx.supabase
    .from("user_cosmetics")
    .select("item_id, acquired_at")
    .eq("user_id", ctx.userId)
    .order("acquired_at", { ascending: false });
  if (error) throw new Error(`Could not load the inventory: ${error.code}`);
  return (data ?? []).flatMap((row) => toInventoryItem(row.item_id, row.acquired_at) ?? []);
}
