import { startRunSchema } from "@/lib/arcade";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Start a timed run; the server clock and the run id are what a later payout is checked against. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, startRunSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("start_arcade_run", { p_game: parsed.data.game });
  if (error) return dbError(error, "Could not start the run.");
  return jsonResponse({ runId: data });
}
