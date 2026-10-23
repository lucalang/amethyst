import { recordScoreSchema } from "@/lib/arcade";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Submit a finished run; the saved record only ever improves. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, recordScoreSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("record_arcade_score", { p_game: parsed.data.game, p_variant: "", p_score: parsed.data.score });
  if (error) return dbError(error, "Could not save your record.");
  const row = data?.[0];
  if (!row) return apiError(500, "server_error", "Could not save your record.");
  return jsonResponse({ best: row.best, improved: row.improved });
}
