import { recoverStreakSchema, type StreakRecovery } from "@/lib/arcade-streaks";
import { loadArcadeStreaks } from "@/lib/data/arcade";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** The player's streak for every game. */
export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  try {
    return jsonResponse({ streaks: await loadArcadeStreaks(ctx) });
  } catch {
    return apiError(500, "load_failed", "Could not load your streaks.");
  }
}

/** Buy back yesterday for one game at the price shown; the database checks eligibility and balance. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, recoverStreakSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("recover_arcade_streak", { p_game: parsed.data.game, p_expected_cost: parsed.data.expectedCost });
  if (error) return dbError(error, "Could not recover the streak.");
  const streaks = await loadArcadeStreaks(ctx).catch(() => null);
  return jsonResponse({ recovery: data as StreakRecovery, streaks });
}
