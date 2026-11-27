import { recordWinSchema } from "@/lib/arcade";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Count one won match toward the player's wins (Front Wars leaderboard). */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, recordWinSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("record_arcade_win", { p_game: parsed.data.game });
  if (error) return dbError(error, "Could not save your win.");
  if (typeof data !== "number") return apiError(500, "server_error", "Could not save your win.");
  return jsonResponse({ wins: data });
}
