import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { mapStep, STEP_COLUMNS } from "@/lib/tasks/model";
import { updateStepSchema } from "@/lib/validation/tasks";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "That step no longer exists.");

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, updateStepSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.from("task_steps").update(parsed.data).eq("id", id).select(STEP_COLUMNS).maybeSingle();
  if (error) return dbError(error, "Could not save the step.");
  return data ? jsonResponse({ step: mapStep(data) }) : notFound();
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { data, error } = await ctx.supabase.from("task_steps").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return jsonResponse({ deleted: Boolean(data) });
}
