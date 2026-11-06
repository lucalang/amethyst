import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { boostSchema } from "@/lib/boosters";

const activateSchema = z
  .object({
    /** Generated once per confirmed activation; a retry with the same id changes nothing. */
    request: z.uuid(),
    booster: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    charges: z.number().int("Enter a whole number of charges.").min(1, "Activate at least one charge.").max(10000),
  })
  .strict();

const resultSchema = z.object({ status: z.enum(["activated", "repeat"]), boost: boostSchema });

/** Activate owned booster charges: they boost the next openings, across every case. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, activateSchema);
  if ("response" in parsed) return parsed.response;

  const { request: id, booster, charges } = parsed.data;
  const { data, error } = await ctx.supabase.rpc("activate_loot_booster", { p_request: id, p_booster: booster, p_charges: charges });
  if (error) return dbError(error, "The booster couldn't be activated. No charges were used.");
  const result = resultSchema.safeParse(data);
  if (!result.success) return apiError(500, "server_error", "The activation couldn't be confirmed. Reload to check your boosters.");
  return jsonResponse(result.data);
}
