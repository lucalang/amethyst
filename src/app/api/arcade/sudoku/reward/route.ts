import { z } from "zod";
import { toRunReward } from "@/lib/arcade";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const claimSchema = z.object({ id: z.uuid() }).strict();

/** The coin result for a solved puzzle (idempotent: it pays at most once and then repeats the result). */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, claimSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("claim_sudoku_reward", { p_game: parsed.data.id });
  if (error) return dbError(error, "Could not count the coins for this puzzle.");
  return jsonResponse({ reward: toRunReward(data) });
}
