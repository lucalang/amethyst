import { z } from "zod";
import { categoryInputSchema } from "@/lib/categories";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Category not found.");
  const parsed = await parseJson(request, categoryInputSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.from("collections").update(parsed.data).eq("id", id).select("id, name").maybeSingle();
  if (error?.code === "23505") return apiError(409, "name_taken", "You already have a category with that name.");
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Category not found.");
  return jsonResponse({ collection: data });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Category not found.");
  const { data, error } = await ctx.supabase.from("collections").delete().eq("id", id).select("id").maybeSingle();
  if (error?.code === "23503") return apiError(409, "category_not_empty", "Move all entries to another category before deleting this category.");
  if (error) return dbError(error);
  if (!data) return apiError(404, "not_found", "Category not found.");
  return jsonResponse({ deleted: true });
}