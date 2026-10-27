import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { reorderTasksSchema } from "@/lib/validation/tasks";

/** Reorder tasks of one list among the positions they already occupy. */
export async function PUT(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, reorderTasksSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("reorder_tasks", { p_task_ids: parsed.data.taskIds });
  if (error) return dbError(error, "Could not reorder tasks.");
  return jsonResponse({ ok: true });
}
