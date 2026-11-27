import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { mapStep } from "@/lib/tasks/model";
import { moveStepSchema } from "@/lib/validation/tasks";

type Params = { params: Promise<{ id: string }> };

/** Move a step to another task of the same list; it goes to the end of that task's steps. */
export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "That step no longer exists.");
  const parsed = await parseJson(request, moveStepSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.rpc("move_task_step", { p_step_id: id, p_task_id: parsed.data.taskId });
  if (error) {
    // The guard trigger's refusal (a task in another list) is a plain rule, not a server fault.
    if (error.code === "23514" && /same list/.test(error.message)) return apiError(422, "other_list", "A step can only move to a task in the same list.");
    return dbError(error, "Could not move the step.");
  }
  return jsonResponse({ step: mapStep(data) });
}
