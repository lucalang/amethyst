import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { loadSeasonState } from "@/lib/data/season-pass";
import { MAX_SKIP } from "@/lib/season-pass";

const SEASON_ID = /^[a-z][a-z0-9-]{0,31}$/;
const season = z.string().regex(SEASON_ID);

const loadFailed = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? dbError(error as { message: string }, "The Season Pass couldn’t be loaded.")
    : apiError(500, "server_error", "The Season Pass couldn’t be loaded.");

/** The account's Season Pass state; assigns the current quests on first view of a period. */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const id = new URL(request.url).searchParams.get("season");
  if (id !== null && !SEASON_ID.test(id)) return apiError(422, "rejected", "Unknown season.");
  try {
    return jsonResponse(await loadSeasonState(ctx, id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return loadFailed(error);
  }
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quest"), assignment: z.uuid(), season: season.optional() }).strict(),
  z.object({ action: z.literal("rewards"), season }).strict(),
  /** `price` is the price the buyer confirmed; a different server price fails instead of charging. */
  z.object({ action: z.literal("premium"), season, price: z.number().int().positive() }).strict(),
  /** `request` is generated once per confirmed skip, so a retry is never charged twice. */
  z
    .object({ action: z.literal("skip"), request: z.uuid(), season, tiers: z.number().int().min(1).max(MAX_SKIP), cost: z.number().int().positive() })
    .strict(),
]);

/**
 * Claims and purchases. The database checks completion, prices, balance and limits, and applies each
 * one atomically; the response carries the result and the refreshed state.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, actionSchema);
  if ("response" in parsed) return parsed.response;

  const body = parsed.data;
  const { data, error } =
    body.action === "quest"
      ? await ctx.supabase.rpc("claim_season_quest", { p_assignment: body.assignment })
      : body.action === "rewards"
        ? await ctx.supabase.rpc("claim_season_rewards", { p_season: body.season })
        : body.action === "premium"
          ? await ctx.supabase.rpc("buy_season_premium", { p_season: body.season, p_expected_price: body.price })
          : await ctx.supabase.rpc("skip_season_tiers", { p_request: body.request, p_season: body.season, p_tiers: body.tiers, p_expected_cost: body.cost });
  if (error) return dbError(error, body.action === "premium" || body.action === "skip" ? "The purchase didn’t go through, and no coins were taken." : "The claim didn’t go through.");

  const state = await loadSeasonState(ctx, body.season ?? null).catch(() => null);
  return jsonResponse({ result: data ?? {}, state });
}
