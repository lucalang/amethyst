import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { loadAdminCode } from "@/lib/data/vault-admin";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";
import { codeUpdateSchema } from "@/lib/vault-admin";

const patchSchema = z.union([
  z.strictObject({ disabled: z.boolean() }),
  z.strictObject({ config: codeUpdateSchema, confirmRepeat: z.boolean() }),
]);

const validId = (id: string) => z.uuid().safeParse(id).success;

/** One code with its allowlist, redemption history and audit log. Never its hash. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!validId(id)) return apiError(404, "not_found", "That code doesn’t exist.");
  try {
    const { code, now } = await loadAdminCode(ctx, id);
    if (!code) return apiError(404, "not_found", "That code doesn’t exist.");
    return jsonResponse({ code, now });
  } catch {
    return apiError(500, "server_error", "The code couldn’t be loaded. Try again.");
  }
}

/**
 * Disable or re-enable a code, or edit it. Edits only affect future redemptions; what was already granted stays.
 * Every change is audited by the database.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!validId(id)) return apiError(404, "not_found", "That code doesn’t exist.");
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  if ("disabled" in body) {
    const { data, error } = body.disabled
      ? await ctx.supabase.rpc("admin_vault_disable", { p_id: id })
      : await ctx.supabase.rpc("admin_vault_enable", { p_id: id });
    if (error) return dbError(error, body.disabled ? "The code couldn’t be disabled. Try again." : "The code couldn’t be enabled. Try again.");
    return jsonResponse({ changed: data });
  }

  const { config, confirmRepeat } = body;
  const { data, error } = await ctx.supabase.rpc("admin_vault_update", {
    p_id: id,
    p_label: config.label,
    p_coins: config.coins,
    p_items: config.items,
    p_achievements: config.achievements,
    p_starts_at: config.startsAt,
    p_expires_at: config.expiresAt,
    p_max_redemptions: config.maxRedemptions,
    p_per_account_limit: config.perAccountLimit,
    p_audience: config.audience,
    p_allowlist: config.audience === "allowlist" ? config.allowlist : [],
    p_confirm_repeat: confirmRepeat,
  });
  if (error?.hint === "confirm_repeat") return apiError(422, "confirm_repeat", error.message);
  if (error?.hint === "not_found") return apiError(404, "not_found", error.message);
  if (error) return dbError(error, "The changes couldn’t be saved. Nothing was changed.");
  return jsonResponse({ code: data });
}
