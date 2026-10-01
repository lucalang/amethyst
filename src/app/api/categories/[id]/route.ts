import { z } from "zod";
import { categoryInputSchema } from "@/lib/categories";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "Category not found.");

/** Rename; every assignment shows the new name because entries reference the category by id. */
export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, categoryInputSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.from("categories").update({ name: parsed.data.name }).eq("id", id).select("id, name").maybeSingle();
  if (error?.code === "23505") return apiError(409, "conflict", `A category named “${parsed.data.name}” already exists.`);
  if (error) return dbError(error);
  return data ? jsonResponse({ category: data }) : notFound();
}

/** Delete a category and its assignments; the entries themselves are untouched. */
export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const { data, error } = await ctx.supabase.from("categories").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ deleted: true }) : notFound();
}
