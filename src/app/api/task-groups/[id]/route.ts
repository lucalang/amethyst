import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { GROUP_COLUMNS, mapGroup } from "@/lib/tasks/model";
import { updateGroupSchema } from "@/lib/validation/tasks";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "That group no longer exists.");

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, updateGroupSchema);
  if ("response" in parsed) return parsed.response;
  const { data, error } = await ctx.supabase.from("task_groups").update(parsed.data).eq("id", id).select(GROUP_COLUMNS).maybeSingle();
  if (error) return dbError(error, "Could not save the group.");
  return data ? jsonResponse({ group: mapGroup(data) }) : notFound();
}

/** Deletes the group only; its lists stay where the group was, ungrouped. */
export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { error } = await ctx.supabase.rpc("delete_task_group", { p_group_id: id });
  if (error) return dbError(error, "Could not delete the group.");
  return jsonResponse({ deleted: true });
}
