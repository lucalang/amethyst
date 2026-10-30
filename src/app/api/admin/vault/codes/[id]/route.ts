import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin } from "@/lib/http";

const patchSchema = z.strictObject({ disabled: z.literal(true) });

/** Published codes never change; they can only be disabled (rewards already granted stay). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Not found.");
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.rpc("admin_vault_disable", { p_id: id });
  if (error) return dbError(error, "The code couldn’t be disabled. Try again.");
  return jsonResponse({ disabled: data });
}
