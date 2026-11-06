import { celebrateStreakSchema, type StreakCelebration } from "@/lib/arcade-streaks";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Claims today's streak celebration; the database grants it once per day after a verified completion. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, celebrateStreakSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("claim_streak_celebration", { p_game: parsed.data.game });
  if (error) return dbError(error, "Could not check the streak.");
  return jsonResponse({ celebration: data as StreakCelebration });
}
