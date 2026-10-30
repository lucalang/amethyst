import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { apiError, dbError, jsonResponse, rejectCrossOrigin } from "@/lib/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireAdminApi();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Not found.");
  const { data, error } = await ctx.supabase.rpc("admin_vault_delete_draft", { p_id: id });
  if (error) return dbError(error, "The draft couldn’t be deleted. Try again.");
  return jsonResponse({ deleted: data });
}
