import { z } from "zod";
import { ITEM_COLUMNS, STEP_COLUMNS, toChecklistItem } from "@/lib/data/workspace";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { updateItemSchema } from "@/lib/validation/workspace";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "Task not found.");

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const parsed = await parseJson(request, updateItemSchema);
  if ("response" in parsed) return parsed.response;
  const { dueDate, ...rest } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("workspace_checklist_items")
    .update({ ...rest, ...(dueDate !== undefined ? { due_date: dueDate } : {}) })
    .eq("id", id)
    .select(`${ITEM_COLUMNS}, steps:workspace_checklist_steps(${STEP_COLUMNS})`)
    .maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ item: toChecklistItem(data, data.steps) }) : notFound();
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
