import { z } from "zod";
import type { EntryKind } from "@/lib/validation/entries";

export type EntrySummary = {
  filesTotal: number;
  checklistTotal: number;
  checklistChecked: number;
};

export type LibraryEntry = {
  id: string;
  kind: EntryKind;
  title: string;
  coverUrl: string | null;
  createdAt: string;
  lastActivityAt: string;
  summary: EntrySummary;
};

export type LibraryState = "not_started" | "in_progress" | "completed";

export const EMPTY_SUMMARY: EntrySummary = { filesTotal: 0, checklistTotal: 0, checklistChecked: 0 };

export function entryState(summary: EntrySummary): LibraryState {
  if (summary.checklistTotal > 0 && summary.checklistChecked === summary.checklistTotal) return "completed";
  return summary.checklistChecked > 0 ? "in_progress" : "not_started";
}

/** Headline progress for a library card: checked items across every checklist. */
export function entryProgress(entry: Pick<LibraryEntry, "summary">): { done: number; total: number | null; label: string } {
  const { summary } = entry;
  return { done: summary.checklistChecked, total: summary.checklistTotal > 0 ? summary.checklistTotal : null, label: "tasks" };
}

export const librarySearchSchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  status: z.enum(["all", "in_progress", "completed", "not_started"]).catch("all").default("all"),
  sort: z.enum(["recent", "title", "progress", "added"]).catch("recent").default("recent"),
});
export type LibrarySearch = z.infer<typeof librarySearchSchema>;

function ratio(entry: LibraryEntry): number {
  const { done, total } = entryProgress(entry);
  return total ? done / total : 0;
}

export function filterLibrary(entries: LibraryEntry[], search: LibrarySearch): LibraryEntry[] {
  const q = search.q.toLocaleLowerCase();
  const filtered = entries.filter(
    (entry) =>
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
