import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import { LIST_COLUMNS, mapChanges, mapList, mapTask, TASK_COLUMNS, type Task, type TaskChanges, type TaskList } from "@/lib/tasks/model";

/** Full snapshot of the account's groups, lists, tasks and steps (notes excluded). */
export async function loadTaskSnapshot(ctx: AuthContext): Promise<TaskChanges> {
  const { data, error } = await ctx.supabase.rpc("task_changes", { p_since: null });
  if (error) throw new Error(`Could not load tasks: ${error.message}`);
  return mapChanges(data);
}

export type MyDayPreview = { tasks: Task[]; lists: TaskList[] };

/**
 * Candidates for the Home "My Day" section. The exact day depends on the viewer's time zone,
 * so this returns tasks picked for yesterday..tomorrow (UTC) and the client narrows it down.
 */
export async function loadMyDayPreview(ctx: AuthContext): Promise<MyDayPreview> {
  const now = Date.now();
  const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
  const [tasks, lists] = await Promise.all([
    ctx.supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .gte("my_day_on", day(-1))
      .lte("my_day_on", day(1))
      .order("position")
      .limit(200),
    ctx.supabase.from("task_lists").select(LIST_COLUMNS),
  ]);
  if (tasks.error || lists.error) return { tasks: [], lists: [] };
  return { tasks: tasks.data.map(mapTask), lists: lists.data.map(mapList) };
}
