import { z } from "zod";
import { loadGameShop } from "@/lib/data/shop";
import { gameCosmetic, GAME_SHOPS, SHOP_GAMES } from "@/lib/game-cosmetics";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const gameSchema = z.enum(SHOP_GAMES);

/** One game's shop for the signed-in account: balance, prices, ownership and the equipped look. */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const game = gameSchema.safeParse(new URL(request.url).searchParams.get("game"));
  if (!game.success) return apiError(400, "invalid_game", "Unknown game.");
  try {
    return jsonResponse(await loadGameShop(ctx, game.data), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return apiError(500, "server_error", "Could not load the shop.");
  }
}

const equipSchema = z
  .object({
    game: gameSchema,
    category: z.string().regex(/^[a-z][a-z0-9-]{0,23}$/),
    /** An owned item for that slot, or null to restore the free default. */
    item: z.string().max(32).nullable(),
  })
  .strict();

/** Equip an owned minigame cosmetic (or restore the default). Ownership is enforced by the database. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, equipSchema);
  if ("response" in parsed) return parsed.response;
  const { game, category, item } = parsed.data;

  if (!GAME_SHOPS[game].categories.some((entry) => entry.id === category)) return apiError(400, "invalid_category", "Unknown category.");
  if (item !== null) {
    const entry = gameCosmetic(item);
    if (!entry || entry.game !== game || entry.category !== category) return apiError(400, "invalid_item", "That item doesn't fit there.");
  }
  const { error } = await ctx.supabase.rpc("set_game_cosmetic", { p_game: game, p_category: category, p_item: item });
  if (error) return dbError(error, "Could not equip that item.");
  return jsonResponse({ game, category, item });
}
