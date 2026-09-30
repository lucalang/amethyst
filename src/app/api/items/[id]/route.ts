import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { updateItemSchema } from "@/lib/validation/workspace";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "Checklist item not found.");

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const parsed = await parseJson(request, updateItemSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase
    .from("workspace_checklist_items")
    .update(parsed.data)
    .eq("id", id)
    .select("id, label, checked, position")
    .maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ item: data }) : notFound();
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const { data, error } = await ctx.supabase.from("workspace_checklist_items").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ deleted: true }) : notFound();
}
