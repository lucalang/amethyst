import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

const addSchema = z.object({ tabId: z.uuid(), title: z.string().trim().min(1).max(500) });
const reorderSchema = z.object({ itemIds: z.array(z.uuid()).min(1).max(2000) });

type Params = { params: Promise<{ id: string }> };

async function entryId(params: Params["params"]) {
  const { id } = await params;
  return z.uuid().safeParse(id).success ? id : null;
}

export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const id = await entryId(params);
  if (!id) return apiError(404, "not_found", "Entry not found.");
  const parsed = await parseJson(request, addSchema);
  if ("response" in parsed) return parsed.response;

  const { data, error } = await ctx.supabase.rpc("add_checklist_item", {
    p_entry_id: id,
    p_tab_id: parsed.data.tabId,
    p_title: parsed.data.title,
  });
  if (error) return dbError(error);
  return jsonResponse({ item: { id: data.id, title: data.title, tabId: parsed.data.tabId } }, { status: 201 });
}

// Reorder checklist items within an entry.
export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const id = await entryId(params);
  if (!id) return apiError(404, "not_found", "Entry not found.");
  const parsed = await parseJson(request, reorderSchema);
  if ("response" in parsed) return parsed.response;

  const { error } = await ctx.supabase.rpc("reorder_entry_items", { p_entry_id: id, p_item_ids: parsed.data.itemIds });
  if (error) return dbError(error);
  return jsonResponse({ ok: true });
}
