import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { BULK_STEP } from "@/lib/lootboxes";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";

const stepSchema = z.object({ step: z.uuid(), case: z.string().min(1).max(64), quantity: z.number().int().min(1).max(BULK_STEP) }).strict();

/** Administrator only: opens and claims a batch of one of the caller's own cases. Repeating a step id returns its saved result. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, stepSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("admin_open_loot_cases", { p_step: parsed.data.step, p_case: parsed.data.case, p_quantity: parsed.data.quantity });
  if (error) return dbError(error, "Those cases couldn't be opened. Nothing in this step was used, so try again.");
  return jsonResponse(data ?? {});
}
