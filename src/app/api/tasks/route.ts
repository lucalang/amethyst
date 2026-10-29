import { dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { mapTask } from "@/lib/tasks/model";
import { addTasksSchema } from "@/lib/validation/tasks";

/** Add one or more tasks to the top of a list, keeping their order. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, addTasksSchema);
  if ("response" in parsed) return parsed.response;
  const { listId, tasks, important, dueDate, myDay, batchId } = parsed.data;
  const { data, error } = batchId ? await ctx.supabase.rpc("add_task_batch", {
    p_batch_id: batchId,
    p_target_id: listId,
    p_kind: "todo",
    p_tasks: tasks.map((task) => ({ label: task.title, checked: task.completed })),
    p_important: important ?? false,
    p_due_date: dueDate ?? null,
    p_my_day: myDay ?? null,
  }) : await ctx.supabase.rpc("add_tasks", {
    p_list_id: listId,
    p_titles: tasks.map((task) => task.title),
    p_completed: tasks.map((task) => task.completed),
    p_important: important ?? false,
    p_due_date: dueDate ?? null,
    p_my_day: myDay ?? null,
  });
  if (error) return dbError(error, "Could not add tasks.");
  const rows = data as unknown as Parameters<typeof mapTask>[0][];
  return jsonResponse({ tasks: rows.map(mapTask) }, { status: 201 });
}
