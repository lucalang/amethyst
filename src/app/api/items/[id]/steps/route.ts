import { z } from "zod";
import { STEP_COLUMNS } from "@/lib/data/workspace";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { addStepSchema, reorderStepsSchema } from "@/lib/validation/workspace";

type Params = { params: Promise<{ id: string }> };

async function prepare(request: Request, params: Params["params"]) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Task not found.");
  return { ctx, id };
}

/** Append a step to a task. */
export async function POST(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const parsed = await parseJson(request, addStepSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await prepared.ctx.supabase
    .rpc("add_checklist_step", { p_item_id: prepared.id, p_label: parsed.data.label })
    .select(STEP_COLUMNS)
    .single();
  if (error) return dbError(error);
  return jsonResponse({ step: data }, { status: 201 });
}

/** Persist a complete step order. */
export async function PUT(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const parsed = await parseJson(request, reorderStepsSchema);
  if ("response" in parsed) return parsed.response;

  const { error } = await prepared.ctx.supabase.rpc("reorder_checklist_steps", { p_item_id: prepared.id, p_step_ids: parsed.data.stepIds });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}
