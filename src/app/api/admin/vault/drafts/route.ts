import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";
import { draftConfigSchema } from "@/lib/vault-admin";

const draftSchema = z.strictObject({ id: z.uuid().nullable(), config: draftConfigSchema });

/** Save a draft: the configuration only, never a code. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, draftSchema);
  if ("response" in parsed) return parsed.response;
  const { id, config } = parsed.data;
  const { data, error } = await ctx.supabase.rpc("admin_vault_save_draft", { p_id: id, p_label: config.label ?? "", p_config: config });
  if (error) return dbError(error, "The draft couldn’t be saved. Try again.");
  return jsonResponse({ id: data });
}
