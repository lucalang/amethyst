import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import { EMPTY_SUMMARY, type LibraryEntry } from "@/lib/progress/library";
import { fetchAll } from "./fetch-all";

/** One category's entries, including their label assignments. */
export async function loadLibrary(ctx: AuthContext, collectionId: string): Promise<LibraryEntry[]> {
  const { supabase } = ctx;
  const [entries, summaries, pins] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("entries")
        .select("id, collection_id, kind, title, cover_url, cover_shape, progress_label, created_at, updated_at, entry_categories(category_id)")
        .eq("collection_id", collectionId)
        .order("updated_at", { ascending: false })
        .range(from, to),
    ),
    fetchAll((from, to) => supabase.from("entry_workspace_summary").select("*").range(from, to)),
    fetchAll((from, to) => supabase.from("entry_pins").select("entry_id").order("entry_id").range(from, to)),
  ]);

  const pinned = new Set(pins.map((row) => row.entry_id));

  const summaryById = new Map(summaries.map((row) => [row.entry_id, row]));
  return entries.map((entry) => {
    const row = summaryById.get(entry.id);
    return {
      id: entry.id,
      collection_id: entry.collection_id,
      kind: entry.kind as LibraryEntry["kind"],
      title: entry.title,
      coverUrl: entry.cover_url,
      coverShape: entry.cover_shape,
      categoryIds: entry.entry_categories.map((row) => row.category_id),
      createdAt: entry.created_at,
      lastActivityAt: row?.last_activity_at ?? entry.updated_at,
      summary: row
        ? { filesTotal: row.files_total ?? 0, checklistTotal: row.checklist_total ?? 0, checklistChecked: row.checklist_checked ?? 0 }
        : EMPTY_SUMMARY,
      pinned: pinned.has(entry.id),
      progressLabel: entry.progress_label,
    };
  });
}
