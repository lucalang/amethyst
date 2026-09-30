import { z } from "zod";

export type EntrySummary = {
  worksTotal: number;
  worksCompleted: number;
  episodesWatched: number;
  episodesKnownTotal: number;
  hasUnknownTotal: boolean;
  checklistTotal: number;
  checklistChecked: number;
  anyWatching: boolean;
};

export type LibraryEntry = {
  id: string;
  kind: "franchise" | "game" | "custom";
  title: string;
  coverUrl: string | null;
  createdAt: string;
  lastActivityAt: string;
  importing: boolean;
  summary: EntrySummary;
};

export type LibraryState = "not_started" | "in_progress" | "completed";

export const EMPTY_SUMMARY: EntrySummary = {
  worksTotal: 0,
  worksCompleted: 0,
  episodesWatched: 0,
  episodesKnownTotal: 0,
  hasUnknownTotal: false,
  checklistTotal: 0,
  checklistChecked: 0,
  anyWatching: false,
};

export function entryState(summary: EntrySummary): LibraryState {
  const total = summary.worksTotal + summary.checklistTotal;
  const done = summary.worksCompleted + summary.checklistChecked;
  if (total > 0 && done === total) return "completed";
  const started = summary.episodesWatched > 0 || done > 0 || summary.anyWatching;
  return started ? "in_progress" : "not_started";
}

/** Headline progress for a library card. Unknown totals stay unknown. */
export function entryProgress(entry: Pick<LibraryEntry, "kind" | "summary">): { done: number; total: number | null; label: string } {
  const { summary } = entry;
  if (entry.kind === "franchise" && summary.worksTotal > 0) {
    return {
      done: summary.episodesWatched,
      total: summary.hasUnknownTotal || summary.episodesKnownTotal === 0 ? null : summary.episodesKnownTotal,
      label: "episodes",
    };
  }
  return { done: summary.checklistChecked, total: summary.checklistTotal > 0 ? summary.checklistTotal : null, label: "items" };
}

export const librarySearchSchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  kind: z.enum(["all", "franchise", "game", "custom"]).catch("all").default("all"),
  status: z.enum(["all", "in_progress", "completed", "not_started"]).catch("all").default("all"),
  sort: z.enum(["recent", "title", "progress", "added"]).catch("recent").default("recent"),
});
export type LibrarySearch = z.infer<typeof librarySearchSchema>;

function ratio(entry: LibraryEntry): number {
  const { done, total } = entryProgress(entry);
  return total ? done / total : done > 0 ? 0.5 : 0;
}

export function filterLibrary(entries: LibraryEntry[], search: LibrarySearch): LibraryEntry[] {
  const q = search.q.toLocaleLowerCase();
  const filtered = entries.filter(
    (entry) =>
      (search.kind === "all" || entry.kind === search.kind) &&
      (search.status === "all" || entryState(entry.summary) === search.status) &&
      (!q || entry.title.toLocaleLowerCase().includes(q)),
  );
  const sorted = [...filtered];
  switch (search.sort) {
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "progress":
      sorted.sort((a, b) => ratio(b) - ratio(a) || a.title.localeCompare(b.title));
      break;
    case "added":
      sorted.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      break;
    default:
      sorted.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));
  }
  return sorted;
}
