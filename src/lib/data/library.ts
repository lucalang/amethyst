import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import { EMPTY_SUMMARY, type LibraryEntry } from "@/lib/progress/library";
import { fetchAll } from "./fetch-all";

export async function loadLibrary(ctx: AuthContext): Promise<LibraryEntry[]> {
  const { supabase } = ctx;
  const [entries, summaries] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("entries").select("id, kind, title, cover_url, created_at, updated_at").order("updated_at", { ascending: false }).range(from, to),
    ),
    fetchAll((from, to) => supabase.from("entry_workspace_summary").select("*").range(from, to)),
  ]);

  const summaryById = new Map(summaries.map((row) => [row.entry_id, row]));
  return entries.map((entry) => {
    const row = summaryById.get(entry.id);
    return {
      id: entry.id,
      kind: entry.kind as LibraryEntry["kind"],
      title: entry.title,
      coverUrl: entry.cover_url,
      createdAt: entry.created_at,
      lastActivityAt: row?.last_activity_at ?? entry.updated_at,
      summary: row
        ? { filesTotal: row.files_total ?? 0, checklistTotal: row.checklist_total ?? 0, checklistChecked: row.checklist_checked ?? 0 }
        : EMPTY_SUMMARY,
    };
  });
}
