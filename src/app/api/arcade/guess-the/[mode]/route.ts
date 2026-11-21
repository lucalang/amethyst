import { isRoundMode, roundRequestSchema } from "@/lib/minigames/guess-the";
import { dealRound, revealPrompt, roundIds, scoreRound } from "@/lib/minigames/guess-the-rounds";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/**
 * The round-based Guess The ... modes (flag, size, price; the chart has its own route). GET deals a round of prompts
 * without their answers; `recent` lists prompt ids played lately. POST `reveal` answers one prompt and returns its
 * answer and score; POST `finish` re-scores the whole round on the server and only then saves the personal record.
 */
export async function GET(request: Request, { params }: { params: Promise<{ mode: string }> }) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { mode } = await params;
  if (!isRoundMode(mode)) return apiError(404, "unknown_mode", "That mode doesn't exist.");
  const ids = roundIds(mode);
  const recent = (new URL(request.url).searchParams.get("recent") ?? "")
    .split(",")
    .filter((id) => ids.includes(id))
    .slice(-ids.length);
  return jsonResponse({ prompts: dealRound(mode, recent) });
}

export async function POST(request: Request, { params }: { params: Promise<{ mode: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { mode } = await params;
  if (!isRoundMode(mode)) return apiError(404, "unknown_mode", "That mode doesn't exist.");
  const parsed = await parseJson(request, roundRequestSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  if (body.action === "reveal") {
    const result = revealPrompt(mode, body.id, body.guess);
    if (!result) return apiError(422, "invalid_guess", "That guess can't be scored.");
    return jsonResponse({ result });
  }

  const round = scoreRound(mode, body.answers);
  if (round === "invalid") return apiError(422, "incomplete", "Answer every prompt in the round before finishing.");
  const { data, error } = await ctx.supabase.rpc("record_arcade_score", { p_game: "guess-the", p_variant: mode, p_score: round.score });
  if (error) return dbError(error, "Could not save your result.");
  return jsonResponse({ score: round.score, best: data?.[0]?.best ?? round.score });
}
