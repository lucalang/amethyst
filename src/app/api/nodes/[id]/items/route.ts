import { z } from "zod";
import { ITEM_COLUMNS, toChecklistItem } from "@/lib/data/workspace";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { addItemsSchema, checkAllSchema, reorderItemsSchema } from "@/lib/validation/workspace";

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

/** Append items (one per label). */
export async function POST(request: Request, { params }: Params) {
  const prepared = await prepare(request, params);
  if (prepared instanceof Response) return prepared;
  const parsed = await parseJson(request, addItemsSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await prepared.ctx.supabase
    .rpc("add_checklist_items", { p_file_id: prepared.id, p_labels: parsed.data.labels })
    .select(ITEM_COLUMNS);
  if (error) return dbError(error);
  return jsonResponse({ items: (data ?? []).map((row) => toChecklistItem(row)).sort((a, b) => a.position - b.position) }, { status: 201 });
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
  return jsonResponse({ changed: data ?? 0 });
}
