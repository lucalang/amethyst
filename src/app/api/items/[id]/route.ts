import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const patchSchema = z.object({ title: z.string().trim().min(1).max(500) });
type Params = { params: Promise<{ id: string }> };

// Custom checklist items only; imported works and episodes are provider-managed.
export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Item not found.");
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase
    .from("media_items")
    .update({ title: parsed.data.title })
    .eq("id", id)
    .eq("kind", "checklist")
    .select("id, title")
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Item not found.");
  return jsonResponse({ item: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Item not found.");

  const { data, error } = await ctx.supabase.from("media_items").delete().eq("id", id).eq("kind", "checklist").select("id").maybeSingle();
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Item not found.");
  return jsonResponse({ deleted: true });
}
