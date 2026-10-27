import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { LIST_COLUMNS, mapList } from "@/lib/tasks/model";
import { deleteListSchema, updateListSchema } from "@/lib/validation/tasks";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "That list no longer exists.");

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, updateListSchema);
  if ("response" in parsed) return parsed.response;
  const { name, icon, accentColor, showCompleted } = parsed.data;
  const { data, error } = await ctx.supabase
    .from("task_lists")
    .update({
      ...(name !== undefined && { name }),
      ...(icon !== undefined && { icon }),
      ...(accentColor !== undefined && { accent_color: accentColor }),
      ...(showCompleted !== undefined && { show_completed: showCompleted }),
    })
    .eq("id", id)
    .select(LIST_COLUMNS)
    .maybeSingle();
  if (error) return dbError(error, "Could not save the list.");
  return data ? jsonResponse({ list: mapList(data) }) : notFound();
}

/** Deletes the list and its tasks, if it still holds exactly the confirmed number of tasks. */
export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, deleteListSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("delete_task_list", { p_list_id: id, p_expected_tasks: parsed.data.expectedTasks });
  if (error) return dbError(error, "Could not delete the list.");
  return jsonResponse({ deleted: true });
}
