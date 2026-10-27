import { z } from "zod";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { mapTask, TASK_COLUMNS } from "@/lib/tasks/model";
import { updateTaskSchema } from "@/lib/validation/tasks";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "That task no longer exists.");

/** A task's notes, loaded only when its details open. */
export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { data, error } = await ctx.supabase.from("tasks").select("notes, notes_rev").eq("id", id).maybeSingle();
  if (error) return dbError(error);
  return data ? jsonResponse({ notes: data.notes, notesRev: data.notes_rev }) : notFound();
}

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, updateTaskSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  const patch = {
    ...(body.title !== undefined && { title: body.title }),
    ...(body.notes !== undefined && { notes: body.notes }),
    ...(body.important !== undefined && { important: body.important }),
    ...(body.dueDate !== undefined && { due_date: body.dueDate }),
    ...(body.myDay !== undefined && { my_day_on: body.myDay }),
    ...(body.completed !== undefined && { completed_at: body.completed ? new Date().toISOString() : null }),
    ...(body.listId !== undefined && { list_id: body.listId }),
    ...(body.entryId !== undefined && { entry_id: body.entryId }),
  };
  let query = ctx.supabase.from("tasks").update(patch).eq("id", id);
  // Notes only save over the revision they were edited from, so another device's text is never lost silently.
  if (body.notes !== undefined) query = query.eq("notes_rev", body.notesRev!);
  const { data, error } = await query.select(TASK_COLUMNS).maybeSingle();
  if (error) return dbError(error, "Could not save the task.");
  if (!data) {
    if (body.notes === undefined) return notFound();
    const { data: current } = await ctx.supabase.from("tasks").select("id").eq("id", id).maybeSingle();
    return current ? apiError(409, "notes_conflict", "These notes were changed on another device.") : notFound();
  }

  let entry = null;
  if (data.entry_id && body.entryId !== undefined) {
    const { data: row } = await ctx.supabase.from("entries").select("id, title, slug").eq("id", data.entry_id).maybeSingle();
    entry = row;
  }
  return jsonResponse({ task: mapTask(data), entry });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { data, error } = await ctx.supabase.from("tasks").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  // Already gone (e.g. deleted on another device) is the outcome the user wanted.
  return jsonResponse({ deleted: Boolean(data) });
}
