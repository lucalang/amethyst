import { z } from "zod";
import { ITEM_COLUMNS, toChecklistItem } from "@/lib/data/workspace";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { addItemsSchema, addTasksSchema, checkAllSchema, reorderItemsSchema } from "@/lib/validation/workspace";
import { refreshArchiveAchievements } from "@/lib/data/achievements";

type Params = { params: Promise<{ id: string }> };

async function prepare(request: Request, params: Params["params"]) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "not_found", "Checklist not found.");
  return { ctx, id };
}

/** Append items: `{ labels }` (all unchecked) or `{ tasks: [{ label, checked }] }`. */
export async function POST(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const parsed = await parseJson(request, z.union([addItemsSchema, addTasksSchema]));
  if ("response" in parsed) return parsed.response;

  const body = parsed.data;
  const { data, error } = "tasks" in body && body.batchId
    ? await prepared.ctx.supabase.rpc("add_task_batch", {
        p_batch_id: body.batchId,
        p_target_id: prepared.id,
        p_kind: "checklist",
        p_tasks: body.tasks,
      })
    : "tasks" in body
    ? await prepared.ctx.supabase
        .rpc("add_checklist_tasks", {
          p_file_id: prepared.id,
          p_labels: body.tasks.map((task) => task.label),
          p_checked: body.tasks.map((task) => task.checked),
        })
        .select(ITEM_COLUMNS)
    : await prepared.ctx.supabase.rpc("add_checklist_items", { p_file_id: prepared.id, p_labels: body.labels }).select(ITEM_COLUMNS);
  if (error) return dbError(error, "Could not add tasks. Try again in a moment.");
  const achievementUnlocks = await refreshArchiveAchievements(prepared.ctx);
  const rows = (data ?? []) as unknown as Parameters<typeof toChecklistItem>[0][];
  return jsonResponse({ items: rows.map((row) => toChecklistItem(row)).sort((a, b) => a.position - b.position), achievementUnlocks }, { status: 201 });
}

/** Persist a complete item order. */
export async function PUT(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const parsed = await parseJson(request, reorderItemsSchema);
  if ("response" in parsed) return parsed.response;

  const { error } = await prepared.ctx.supabase.rpc("reorder_checklist_items", { p_file_id: prepared.id, p_item_ids: parsed.data.itemIds });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}

/** Check or uncheck every item. */
export async function PATCH(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const parsed = await parseJson(request, checkAllSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await prepared.ctx.supabase.rpc("set_checklist_checked", { p_file_id: prepared.id, p_checked: parsed.data.checked });
  if (error) return dbError(error);
  const achievementUnlocks = await refreshArchiveAchievements(prepared.ctx);
  return jsonResponse({ changed: data ?? 0, achievementUnlocks });
}
