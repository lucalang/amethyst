import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { mapStep } from "@/lib/tasks/model";
import { addStepSchema, reorderStepsSchema } from "@/lib/validation/tasks";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "That task no longer exists.");

export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, addStepSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.rpc("add_task_step", { p_task_id: id, p_title: parsed.data.title });
  if (error) return dbError(error, "Could not add the step.");
  return jsonResponse({ step: mapStep(data) }, { status: 201 });
}

export async function PUT(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, reorderStepsSchema);
  if ("response" in parsed) return parsed.response;
  const { error } = await ctx.supabase.rpc("reorder_task_steps", { p_task_id: id, p_step_ids: parsed.data.stepIds });
  if (error) return dbError(error, "Could not reorder steps.");
  return jsonResponse({ ok: true });
}
