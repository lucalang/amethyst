import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import { snippetFromContent, type QuickNoteSummary } from "@/lib/validation/quick-notes";

export const QUICK_NOTE_COLUMNS = "id, name, version, updated_at";

export type QuickNote = { id: string; name: string; version: number; updatedAt: string };
export type QuickNoteDetail = { node: QuickNote & { content: string } };

type Row = { id: string; name: string; version: number; updated_at: string };

export const toQuickNote = (row: Row): QuickNote => ({ id: row.id, name: row.name, version: row.version, updatedAt: row.updated_at });

/** Most recently edited notes with a short preview (Home). */
export async function loadRecentQuickNotes(ctx: AuthContext, limit: number): Promise<QuickNoteSummary[]> {
  const { data, error } = await ctx.supabase
    .from("quick_notes")
    .select("id, name, content, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({ id: row.id, name: row.name, snippet: snippetFromContent(row.content), updatedAt: row.updated_at }));
}

/** Every note without content, newest first (Quick Notes list). */
export async function loadQuickNoteList(ctx: AuthContext): Promise<QuickNote[]> {
  const { data, error } = await ctx.supabase
    .from("quick_notes")
    .select(QUICK_NOTE_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data.map(toQuickNote);
}

export async function loadQuickNote(ctx: AuthContext, id: string): Promise<QuickNoteDetail | null> {
  const { data, error } = await ctx.supabase.from("quick_notes").select(`${QUICK_NOTE_COLUMNS}, content`).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? { node: { ...toQuickNote(data), content: data.content } } : null;
}
