import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { playerActionSchema, playerSchema } from "@/lib/admin-players";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";

const validId = (id: string) => z.uuid().safeParse(id).success;

/** One player's coins, Season Pass, cosmetics and boosters (administrators only). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!validId(id)) return apiError(404, "not_found", "That player doesn’t exist.");
  const { data, error } = await ctx.supabase.rpc("admin_player_state", { p_user: id });
  if (error) return dbError(error, "The player couldn’t be loaded. Try again.");
  const parsed = playerSchema.safeParse(data);
  if (!parsed.success) return apiError(500, "server_error", "The player couldn’t be read. Try again.");
  return jsonResponse(parsed.data);
}

/** Change a player's Premium Pass, coins, cosmetics or boosters. Every change is audited by the database. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!validId(id)) return apiError(404, "not_found", "That player doesn’t exist.");
  const parsed = await parseJson(request, playerActionSchema);
  if ("response" in parsed) return parsed.response;

  const body = parsed.data;
  const { data, error } =
    body.action === "premium"
      ? await ctx.supabase.rpc("admin_set_season_premium", { p_request: body.id, p_user: id, p_premium: body.premium, p_refund: body.refund })
      : body.action === "coins"
        ? await ctx.supabase.rpc("admin_adjust_coins", { p_request: body.id, p_user: id, p_amount: body.amount, p_reason: body.reason })
        : body.action === "cosmetic"
          ? await ctx.supabase.rpc("admin_set_cosmetic", { p_request: body.id, p_user: id, p_item: body.item, p_owned: body.owned })
          : await ctx.supabase.rpc("admin_adjust_booster", { p_request: body.id, p_user: id, p_booster: body.booster, p_action: body.op, p_charges: body.charges ?? undefined });
  if (error) return dbError(error, "That change couldn’t be made. Nothing was changed.");
  return jsonResponse(data);
}
