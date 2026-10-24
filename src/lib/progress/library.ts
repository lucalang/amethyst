import { z } from "zod";
import { parseCategoryIds } from "@/lib/categories";
import type { CoverShape } from "@/lib/cover-shape";
import { progressLabel } from "@/lib/progress/label";
import type { EntryKind } from "@/lib/validation/entries";

export type EntrySummary = {
  filesTotal: number;
  checklistTotal: number;
  checklistChecked: number;
};

export type LibraryEntry = {
  id: string;
  /** Readable URL segment (see entryPath). */
  slug?: string;
  collection_id?: string;
  kind: EntryKind;
  title: string;
  coverUrl: string | null;
  coverShape: CoverShape;
  categoryIds: string[];
  createdAt: string;
  lastActivityAt: string;
  summary: EntrySummary;
  /** Pinned to Home by the user. */
  pinned?: boolean;
  /** Custom wording for aggregate progress ("tasks" when unset). */
  progressLabel?: string | null;
  /** The entry's own artwork frame ("none" = explicitly unframed); null/undefined follows the account default. */
  frame?: string | null;
};

export type LibraryState = "not_started" | "in_progress" | "completed";

export const EMPTY_SUMMARY: EntrySummary = { filesTotal: 0, checklistTotal: 0, checklistChecked: 0 };

export function entryState(summary: EntrySummary): LibraryState {
  if (summary.checklistTotal > 0 && summary.checklistChecked === summary.checklistTotal) return "completed";
  return summary.checklistChecked > 0 ? "in_progress" : "not_started";
}

/** Headline progress for a library card: checked items across every checklist. */
export function entryProgress(entry: Pick<LibraryEntry, "summary" | "progressLabel">): { done: number; total: number | null; label: string; custom: boolean } {
  const { summary } = entry;
  return {
    done: summary.checklistChecked,
    total: summary.checklistTotal > 0 ? summary.checklistTotal : null,
    label: progressLabel(entry.progressLabel),
    custom: Boolean(entry.progressLabel?.trim()),
  };
}

/** Screen-reader wording, e.g. "3 of 10 tasks done" or "Quests: 3 of 10". */
export function progressPhrase(progress: { done: number; total: number | null; label: string; custom: boolean }): string {
  if (progress.custom) return progress.total ? `${progress.label}: ${progress.done} of ${progress.total}` : `no ${progress.label} yet`;
  return `${progress.done} of ${progress.total ?? "no"} ${progress.label} done`;
}

export const librarySearchSchema = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  status: z.enum(["all", "in_progress", "completed", "not_started"]).catch("all").default("all"),
  sort: z.enum(["recent", "title", "progress", "added"]).catch("recent").default("recent"),
  /** Entries in ALL of these categories; empty means no category restriction. */
  categories: z.unknown().optional().transform(parseCategoryIds),
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
      (!q || entry.title.toLocaleLowerCase().includes(q)) &&
      search.categories.every((id) => entry.categoryIds.includes(id)),
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
