import { z } from "zod";
import { finishRunSchema, toRunReward } from "@/lib/arcade";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { SUMBREAK_GAME, sumbreakBoardOf, verifySumbreakProof } from "@/lib/minigames/sumbreak";

/** Finish a run. Repeating the request (retries, reloads, other tabs) returns the same result without paying again. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "run_not_found", "That run was not found.");
  const parsed = await parseJson(request, finishRunSchema);
  if ("response" in parsed) return parsed.response;

  // Sumbreak runs only score for a solve the server has replayed: the puzzle is rebuilt from its seed and every
  // merge checked. Without one the run stays open (and expires) rather than paying or ranking.
  if (parsed.data.score > 0) {
    const { data: run, error: runError } = await ctx.supabase.from("arcade_runs").select("game, board").eq("id", id).maybeSingle();
    if (runError) return dbError(runError, "Could not count the coins for this run.");
    if (run?.game === SUMBREAK_GAME) {
      const board = sumbreakBoardOf(run.board, parsed.data.score);
      if (!board || !verifySumbreakProof(parsed.data.proof, board)) return apiError(422, "unverified", "That solve could not be verified.");
    }
  }

  const { data, error } = await ctx.supabase.rpc("finish_arcade_run", { p_run: id, p_score: parsed.data.score, p_metrics: parsed.data.metrics });
  if (error) return dbError(error, "Could not count the coins for this run.");
  return jsonResponse({ reward: toRunReward(data) });
}
