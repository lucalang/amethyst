import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";
import { CODE_RULES, compactCode, generateCode, newCodeHashes, normalizePhrase } from "@/lib/secret-codes";
import { codeConfigSchema } from "@/lib/vault-admin";

const publishSchema = z.strictObject({
  config: codeConfigSchema,
  code: z.string().max(200).optional(),
  confirmRepeat: z.boolean(),
  draftId: z.uuid().nullable().optional(),
});

/**
 * Publish a Vault code. A chosen phrase is normalized here, custom text is checked here and a random code is
 * generated here; either way only its hashes reach the database, and the code is returned this once (never
 * logged or kept).
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, publishSchema);
  if ("response" in parsed) return parsed.response;
  const { config, confirmRepeat, draftId } = parsed.data;

  const phrase = config.codeMode === "phrase" ? normalizePhrase(parsed.data.code ?? "") : null;
  if (config.codeMode === "phrase" && !phrase) return apiError(422, "invalid_code", `${CODE_RULES} For example: OPEN THE VAULT.`);
  // Custom text is a compact code: only its letters and numbers count, separators are kept for display.
  const custom = config.codeMode === "custom" ? (parsed.data.code ?? "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ") : null;
  if (custom !== null && !compactCode(custom)) return apiError(422, "invalid_code", `${CODE_RULES} Dashes and dots are allowed between them.`);
  const chosen = phrase ?? custom;

  // A random code colliding with an existing one is practically impossible, but draw again if it does.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = chosen ?? generateCode();
    const format = phrase ? "phrase" : "compact";
    const hashes = newCodeHashes(code, format);
    if (!hashes) return apiError(422, "invalid_code", CODE_RULES);
    const { data, error } = await ctx.supabase.rpc("admin_vault_publish", {
      p_code_hash: hashes.code,
      p_loose_hash: hashes.loose,
      p_format: format,
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
      p_draft: draftId ?? null,
    });
    if (!error) return jsonResponse({ id: data, code, format }, { status: 201 });
    if (error.hint === "duplicate_code") {
      if (chosen) return apiError(409, "duplicate_code", error.message);
      continue;
    }
    if (error.hint === "confirm_repeat") return apiError(422, "confirm_repeat", error.message);
    return dbError(error, "The code couldn’t be published. Nothing was created.");
  }
  return apiError(500, "server_error", "The code couldn’t be published. Nothing was created.");
}
