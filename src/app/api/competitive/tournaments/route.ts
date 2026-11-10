import { DAY_PATTERN, tournamentActionSchema } from "@/lib/competitive";
import { loadTournamentState } from "@/lib/data/competitive";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** The tournament schedule, one day's tournament (today by default), history and unclaimed rewards. */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const day = new URL(request.url).searchParams.get("day");
  if (day !== null && !DAY_PATTERN.test(day)) return apiError(422, "rejected", "Unknown day.");
  try {
    return jsonResponse(await loadTournamentState(ctx, day));
  } catch (error) {
    return dbError(error as { message: string }, "Tournaments couldn’t be loaded.");
  }
}

/** Join (free), start a run on the day's game, or claim a final placement's rewards. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, tournamentActionSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  if (body.action === "run") {
    const { data, error } = await ctx.supabase.rpc("start_tournament_run", { p_tournament: body.tournament, p_game: body.game, p_board: body.board });
    if (error) return dbError(error, "The run couldn’t start.");
    return jsonResponse({ runId: data });
  }
  const { data, error } =
    body.action === "join"
      ? await ctx.supabase.rpc("join_tournament", { p_tournament: body.tournament })
      : await ctx.supabase.rpc("claim_tournament_reward", { p_tournament: body.tournament });
  if (error) return dbError(error, body.action === "join" ? "Couldn’t join the tournament." : "The claim didn’t go through.");
  return jsonResponse({ result: data });
}
