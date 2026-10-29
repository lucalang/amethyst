import { z } from "zod";
import { COSMETIC_IDS } from "@/lib/cosmetics";
import { GAME_COSMETIC_IDS } from "@/lib/game-cosmetics";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const ITEM_IDS = [...COSMETIC_IDS, ...GAME_COSMETIC_IDS] as [string, ...string[]];

const purchaseSchema = z
  .object({
    /** An Arcade Shop cosmetic or a minigame cosmetic; the database still checks it exists and is on sale. */
    item: z.enum(ITEM_IDS),
    /** The price the buyer confirmed; the purchase fails instead of charging a different amount. */
    price: z.number().int().positive(),
  })
  .strict();

/** Buy a cosmetic. The database checks the balance, charges once and grants permanent ownership in one transaction. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, purchaseSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("purchase_cosmetic", { p_item: parsed.data.item, p_expected_price: parsed.data.price });
  if (error) return dbError(error, "The purchase didn't go through, and no coins were taken.");
  const result = (data ?? {}) as { status?: string; balance?: number };
  if (result.status !== "purchased" && result.status !== "owned") return apiError(500, "server_error", "The purchase didn't go through.");
  return jsonResponse({ status: result.status, balance: result.balance ?? 0 });
}
