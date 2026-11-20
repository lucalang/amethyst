import { CHART_IDS, randomChart, revealChart } from "@/lib/minigames/guess-the-charts";
import { chartGuessSchema } from "@/lib/minigames/guess-the";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/**
 * Guess the Chart. GET deals a random chart (only the years before the cutoff); `recent` lists chart ids played
 * lately so they aren't dealt again while others are left. POST takes a complete guess, scores it, saves the
 * personal record and only then reveals the real continuation.
 */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const recent = (new URL(request.url).searchParams.get("recent") ?? "")
    .split(",")
    .filter((id) => CHART_IDS.includes(id))
    .slice(-CHART_IDS.length);
  return jsonResponse({ chart: randomChart(recent) });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, chartGuessSchema);
  if ("response" in parsed) return parsed.response;
  const result = revealChart(parsed.data.id, parsed.data.guesses);
  if (result === "unknown") return apiError(404, "unknown_chart", "That chart doesn't exist.");
  if (result === "incomplete") return apiError(422, "incomplete", "Draw every year before submitting.");

  const { data, error } = await ctx.supabase.rpc("record_arcade_score", { p_game: "guess-the", p_variant: "chart", p_score: result.score });
  if (error) return dbError(error, "Could not save your result.");
  return jsonResponse({ result, best: data?.[0]?.best ?? result.score });
}
