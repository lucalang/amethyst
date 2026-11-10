import { createWagerSchema } from "@/lib/competitive";
import { loadWagerList } from "@/lib/data/competitive";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Open challenges from others, the caller's wagers and the wager limits. */
export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  try {
    return jsonResponse(await loadWagerList(ctx));
  } catch (error) {
    return dbError(error as { message: string }, "Wagers couldn’t be loaded.");
  }
}

/** Opens a challenge and escrows the stake. `request` is generated once per confirmation, so retries are safe. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, createWagerSchema);
  if ("response" in parsed) return parsed.response;
  const { request: id, stake, games } = parsed.data;
  const { data, error } = await ctx.supabase.rpc("create_wager", { p_request: id, p_stake: stake, p_games: games });
  if (error) return dbError(error, "The challenge couldn’t be created, and no Coins were taken.");
  return jsonResponse({ wager: data });
}
