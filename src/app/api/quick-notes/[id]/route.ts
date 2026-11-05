import { z } from "zod";
import { loadQuickNote, QUICK_NOTE_COLUMNS, toQuickNote } from "@/lib/data/quick-notes";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { updateQuickNoteSchema } from "@/lib/validation/quick-notes";

type Params = { params: Promise<{ id: string }> };

const notFound = () => apiError(404, "not_found", "Quick note not found.");

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  try {
    const detail = await loadQuickNote(ctx, id);
    return detail ? jsonResponse(detail) : notFound();
  } catch (error) {
    return dbError(error as { code?: string; message: string });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = await parseJson(request, updateQuickNoteSchema);
  if ("response" in parsed) return parsed.response;
  const { name, content, expectedVersion } = parsed.data;

  let query = ctx.supabase
    .from("quick_notes")
    .update({ ...(name !== undefined ? { name } : {}), ...(content !== undefined ? { content } : {}) })
    .eq("id", id);
  if (expectedVersion !== undefined) query = query.eq("version", expectedVersion);
  const { data, error } = await query.select(QUICK_NOTE_COLUMNS).maybeSingle();
  if (error) return dbError(error);
  if (!data) {
    const { data: exists } = await ctx.supabase.from("quick_notes").select("id").eq("id", id).maybeSingle();
    return exists
      ? apiError(409, "version_conflict", "This note was changed somewhere else (another tab or device).")
      : notFound();
  }
  return jsonResponse({ node: toQuickNote(data) });
}

export async function DELETE(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const { data, error } = await ctx.supabase.from("quick_notes").delete().eq("id", id).select("id").maybeSingle();
  if (error) return dbError(error);
  return data ? new Response(null, { status: 204 }) : notFound();
}
