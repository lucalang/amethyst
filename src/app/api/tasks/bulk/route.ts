import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { mapTask, TASK_COLUMNS, type Task } from "@/lib/tasks/model";
import { bulkTasksSchema } from "@/lib/validation/tasks";

// Ids travel in the request URL (`id=in.(…)`), so batches stay well below proxy URL limits.
const CHUNK = 150;

/**
 * Update or delete many tasks. Chunks run in order; a failing chunk is reported in `failed`
 * while the others still apply, so the client can restore exactly the rows that didn't save.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, bulkTasksSchema);
  if ("response" in parsed) return parsed.response;
  const { taskIds, action, patch = {} } = parsed.data;
  const ids = [...new Set(taskIds)];

  const values = {
    ...(patch.important !== undefined && { important: patch.important }),
    ...(patch.dueDate !== undefined && { due_date: patch.dueDate }),
    ...(patch.myDay !== undefined && { my_day_on: patch.myDay }),
    ...(patch.completed !== undefined && { completed_at: patch.completed ? new Date().toISOString() : null }),
    ...(patch.listId !== undefined && { list_id: patch.listId }),
  };

  const tasks: Task[] = [];
  const deleted: string[] = [];
  const failed: string[] = [];
  let failure: string | null = null;
  for (let start = 0; start < ids.length; start += CHUNK) {
    const chunk = ids.slice(start, start + CHUNK);
    if (action === "delete") {
      const { data, error } = await ctx.supabase.from("tasks").delete().in("id", chunk).select("id");
      if (error) {
        failed.push(...chunk);
        failure ??= error.message;
      } else deleted.push(...data.map((row) => row.id));
    } else {
      const { data, error } = await ctx.supabase.from("tasks").update(values).in("id", chunk).select(TASK_COLUMNS);
      if (error) {
        failed.push(...chunk);
        failure ??= error.message;
      } else tasks.push(...data.map(mapTask));
    }
  }

  // Moved tasks each land on top of their new list; restore the order they were sent in (clients pull the new positions).
  if (patch.listId && tasks.length > 1) {
    const moved = new Set(tasks.map((task) => task.id));
    await ctx.supabase.rpc("reorder_tasks", { p_task_ids: ids.filter((id) => moved.has(id)) });
  }

  // Rows neither returned nor failed no longer exist (or belong to someone else).
  const done = new Set([...tasks.map((task) => task.id), ...deleted, ...failed]);
  const missing = ids.filter((id) => !done.has(id));
  if (failed.length === ids.length && failure) return dbError({ message: failure }, "Could not update the tasks.");
  return jsonResponse({ tasks, deleted, failed, missing, failure: failure ? "Some tasks could not be saved. Try again." : null });
}
