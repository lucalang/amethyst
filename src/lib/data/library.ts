import "server-only";
import type { AuthContext } from "@/lib/supabase/auth";
import { EMPTY_SUMMARY, type LibraryEntry } from "@/lib/progress/library";
import { fetchAll } from "./fetch-all";

export type ContinueItem = {
  mediaItemId: string;
  title: string;
  kind: string;
  totalEpisodes: number | null;
  imageUrl: string | null;
  watched: number;
  entryId: string;
  entryTitle: string;
  updatedAt: string;
};

export async function loadLibrary(ctx: AuthContext) {
  const { supabase } = ctx;
  const [entries, summaries, continueRows, activeJobs] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("entries").select("id, kind, title, cover_url, created_at, updated_at, metadata").order("updated_at", { ascending: false }).range(from, to),
    ),
    fetchAll((from, to) => supabase.from("entry_progress_summary").select("*").range(from, to)),
    supabase.from("continue_watching").select("*").order("updated_at", { ascending: false }).limit(12),
    supabase.from("jobs").select("id, input, progress, status").in("status", ["queued", "running"]).eq("kind", "franchise_import").limit(5),
  ]);

  const summaryById = new Map(summaries.map((row) => [row.entry_id, row]));
  const library: LibraryEntry[] = entries.map((entry) => {
    const row = summaryById.get(entry.id);
    const meta = (entry.metadata ?? {}) as { import_status?: string };
    return {
      id: entry.id,
      kind: entry.kind as LibraryEntry["kind"],
      title: entry.title,
      coverUrl: entry.cover_url,
      createdAt: entry.created_at,
      lastActivityAt: row?.last_activity_at ?? entry.updated_at,
      importing: meta.import_status === "running",
      summary: row
        ? {
            worksTotal: row.works_total ?? 0,
            worksCompleted: row.works_completed ?? 0,
            episodesWatched: row.episodes_watched ?? 0,
            episodesKnownTotal: row.episodes_known_total ?? 0,
            hasUnknownTotal: row.has_unknown_total ?? false,
            checklistTotal: row.checklist_total ?? 0,
            checklistChecked: row.checklist_checked ?? 0,
            anyWatching: row.any_watching ?? false,
          }
        : EMPTY_SUMMARY,
    };
  });

  const continueWatching: ContinueItem[] = (continueRows.data ?? []).map((row) => ({
    mediaItemId: row.media_item_id!,
    title: row.title!,
    kind: row.kind!,
    totalEpisodes: row.total_episodes,
    imageUrl: row.image_url ?? row.entry_cover_url,
    watched: row.episodes_watched ?? 0,
    entryId: row.entry_id!,
    entryTitle: row.entry_title!,
    updatedAt: row.updated_at!,
  }));

  return { library, continueWatching, activeJobs: activeJobs.data ?? [] };
}
