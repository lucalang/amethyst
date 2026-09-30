import { z } from "zod";
import { apiError, dbError, jsonResponse, rejectCrossOrigin, requireApiUser } from "@/lib/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Arc not found.");

  const { data, error } = await ctx.supabase.from("arcs").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Arc not found.");
  return jsonResponse({ deleted: true });
}
