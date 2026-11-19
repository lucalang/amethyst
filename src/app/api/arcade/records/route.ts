import { recordScoreSchema } from "@/lib/arcade";
import { claimAchievementNotifications } from "@/lib/data/achievements";
import { SUMBREAK_GAME, sumbreakBoardOf, verifySumbreakProof } from "@/lib/minigames/sumbreak";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Submit a finished run; the saved record only ever improves. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, recordScoreSchema);
  if ("response" in parsed) return parsed.response;
  // Sumbreak records are only saved for a solve the server has replayed under the rules.
  if (parsed.data.game === SUMBREAK_GAME && parsed.data.score > 0) {
    const board = sumbreakBoardOf(parsed.data.variant);
    if (!board || !verifySumbreakProof(parsed.data.proof, board)) return apiError(422, "unverified", "That solve could not be verified.");
  }

  const { data, error } = await ctx.supabase.rpc("record_arcade_score", { p_game: parsed.data.game, p_variant: parsed.data.variant, p_score: parsed.data.score });
  if (error) return dbError(error, "Could not save your record.");
  const row = data?.[0];
  if (!row) return apiError(500, "server_error", "Could not save your record.");
  const achievementUnlocks = await claimAchievementNotifications(ctx);
  return jsonResponse({ best: row.best, improved: row.improved, hadPrevious: row.had_previous, achievementUnlocks });
}
