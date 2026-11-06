import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { MAX_CASE_PURCHASE } from "@/lib/lootboxes";

const purchaseSchema = z
  .object({
    /** Generated once per confirmed purchase; a retry with the same id is never charged again. */
    request: z.uuid(),
    case: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    quantity: z.number().int("Enter a whole number of cases.").min(1, "Buy at least one case.").max(MAX_CASE_PURCHASE, `Buy up to ${MAX_CASE_PURCHASE} cases at a time.`),
    /** The unit price the buyer confirmed; the purchase fails instead of charging a different amount. */
    price: z.number().int().positive(),
  })
  .strict();

/** Buy cases. The database checks the price and balance, then charges and adds the cases in one transaction. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, purchaseSchema);
  if ("response" in parsed) return parsed.response;

  const { request: id, case: caseId, quantity, price } = parsed.data;
  const { data, error } = await ctx.supabase.rpc("buy_loot_cases", { p_request: id, p_case: caseId, p_quantity: quantity, p_expected_price: price });
  if (error) return dbError(error, "The purchase didn't go through, and no coins were taken.");
  const result = (data ?? {}) as { status?: string; bought?: number; owned?: number; balance?: number };
  if (result.status !== "purchased" && result.status !== "repeat") return apiError(500, "server_error", "The purchase didn't go through.");
  return jsonResponse({ status: result.status, bought: result.bought ?? 0, owned: result.owned ?? 0, balance: result.balance ?? 0 });
}
