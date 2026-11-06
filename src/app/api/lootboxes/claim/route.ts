import { z } from "zod";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const claimSchema = z.object({ openings: z.array(z.uuid()).min(1).max(50) }).strict();

/** Claim opened rewards. Already claimed openings are skipped, so repeating a claim grants nothing. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, claimSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("claim_loot_openings", { p_openings: parsed.data.openings });
  if (error) return dbError(error, "Your rewards couldn't be claimed yet. They're saved, so try again.");
  const result = (data ?? {}) as { claimed?: number; newItems?: number };
  return jsonResponse({ claimed: result.claimed ?? 0, newItems: result.newItems ?? 0 });
}
