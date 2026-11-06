import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { MAX_BOOSTER_PURCHASE, boostSchema } from "@/lib/boosters";

const purchaseSchema = z
  .object({
    /** Generated once per confirmed purchase; a retry with the same id is never charged again. */
    request: z.uuid(),
    booster: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    quantity: z.number().int("Enter a whole number of boosters.").min(1, "Buy at least one booster.").max(MAX_BOOSTER_PURCHASE, `Buy up to ${MAX_BOOSTER_PURCHASE} boosters at a time.`),
    /** The unit price the buyer confirmed; the purchase fails instead of charging a different amount. */
    price: z.number().int().positive(),
  })
  .strict();

const resultSchema = z.object({ status: z.enum(["purchased", "repeat"]), bought: z.number().int(), balance: z.number().int(), boost: boostSchema });

/** Buy Luck Booster charges. The database checks the price and balance, then charges and adds them in one transaction. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, purchaseSchema);
  if ("response" in parsed) return parsed.response;

  const { request: id, booster, quantity, price } = parsed.data;
  const { data, error } = await ctx.supabase.rpc("buy_loot_boosters", { p_request: id, p_booster: booster, p_quantity: quantity, p_expected_price: price });
  if (error) return dbError(error, "The purchase didn't go through, and no coins were taken.");
  const result = resultSchema.safeParse(data);
  if (!result.success) return apiError(500, "server_error", "The purchase couldn't be confirmed. Reload to check your boosters.");
  return jsonResponse(result.data);
}
