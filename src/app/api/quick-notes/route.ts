import { loadQuickNoteList, QUICK_NOTE_COLUMNS, toQuickNote } from "@/lib/data/quick-notes";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { createQuickNoteSchema, MAX_QUICK_NOTES, nameFromContent } from "@/lib/validation/quick-notes";

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  try {
    return jsonResponse({ notes: await loadQuickNoteList(ctx) });
  } catch (error) {
    return dbError(error as { code?: string; message: string });
  }
}

export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, createQuickNoteSchema);
  if ("response" in parsed) return parsed.response;
  const content = parsed.data.content ?? "";
  const name = parsed.data.name ?? nameFromContent(content);

  const { data, error } = await ctx.supabase.from("quick_notes").insert({ name, content }).select(QUICK_NOTE_COLUMNS).single();
  if (error) {
    if (error.hint === "quick_note_limit") {
      return apiError(409, "quick_note_limit", `You can keep up to ${MAX_QUICK_NOTES.toLocaleString("en")} quick notes. Delete some to add more.`);
    }
    return dbError(error);
  }
  return jsonResponse({ node: toQuickNote(data) }, { status: 201 });
}
