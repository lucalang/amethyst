import { describe, expect, it } from "vitest";
import {
  applyChecks,
  deriveStatus,
  franchiseSummary,
  groupState,
  workProgress,
  type Episode,
  type ProgressMap,
  type Work,
} from "@/lib/progress/derive";
import { EMPTY_SUMMARY, entryProgress, entryState, filterLibrary, librarySearchSchema, type LibraryEntry } from "@/lib/progress/library";

const work = (id: string, overrides: Partial<Work> = {}): Work => ({
  id,
  kind: "series",
  title: id,
  malId: 1,
  totalEpisodes: 3,
  section: "main",
  relation: null,
  position: 0,
  airedFrom: null,
  imageUrl: null,
  year: null,
  providerType: "TV",
  ...overrides,
});
const eps = (parentId: string, count: number): Episode[] =>
  Array.from({ length: count }, (_, index) => ({ id: `${parentId}-e${index + 1}`, parentId, number: index + 1, title: `E${index + 1}`, filler: false, recap: false, aired: null }));

describe("progress derivation", () => {
  const series = work("s1");
  const episodesByParent = new Map([["s1", eps("s1", 3)]]);
  const worksById = new Map([["s1", series]]);

  it("derives status like the database", () => {
    expect(deriveStatus("plan_to_watch", 1, 3)).toBe("watching");
    expect(deriveStatus("on_hold", 1, 3)).toBe("on_hold");
    expect(deriveStatus("watching", 3, 3)).toBe("completed");
    expect(deriveStatus("completed", 0, 3)).toBe("plan_to_watch");
    expect(deriveStatus("dropped", 0, null)).toBe("dropped");
  });

  it("recomputes the parent aggregate optimistically", () => {
    let progress: ProgressMap = {};
    progress = applyChecks(progress, ["s1-e1", "s1-e2"], true, episodesByParent, worksById);
    expect(progress.s1).toMatchObject({ episodes_watched: 2, status: "watching" });
    progress = applyChecks(progress, ["s1-e3"], true, episodesByParent, worksById);
    expect(progress.s1).toMatchObject({ episodes_watched: 3, status: "completed" });
  });

  it("does not lower an unmapped imported aggregate", () => {
    const progress: ProgressMap = {
      s1: { media_item_id: "s1", is_checked: false, episodes_watched: 2, episodes_mapped: false, status: "watching", score: 7, version: 1, updated_at: "" },
    };
    const next = applyChecks(progress, ["s1-e3"], true, episodesByParent, worksById);
    expect(next.s1).toMatchObject({ episodes_watched: 2, episodes_mapped: false });
    expect(workProgress(series, next, episodesByParent.get("s1")!)).toMatchObject({ unmapped: true, checkedEpisodes: 1 });
  });

  it("counts each work once and keeps unknown totals unknown", () => {
    const works = [
      work("s1"),
      work("s2", { totalEpisodes: null }),
      work("m1", { kind: "movie", section: "movie", totalEpisodes: 1 }),
      work("m2", { kind: "movie", section: "movie", totalEpisodes: 1 }),
      work("s1"),
    ];
    const progress: ProgressMap = {
      s1: { media_item_id: "s1", is_checked: false, episodes_watched: 3, episodes_mapped: true, status: "completed", score: null, version: 1, updated_at: "" },
      m1: { media_item_id: "m1", is_checked: false, episodes_watched: 1, episodes_mapped: true, status: "completed", score: null, version: 1, updated_at: "" },
    };
    const summary = franchiseSummary(works, progress, new Map());
    expect(summary.movies).toEqual({ done: 1, total: 2 });
    expect(summary.series).toEqual({ done: 1, total: 2 });
    expect(summary.episodes).toEqual({ watched: 4, knownTotal: 5, unknownTotals: 1 });
  });

  it("reports arc tri-state without double counting", () => {
    const progress = applyChecks({}, ["s1-e1"], true, episodesByParent, worksById);
    expect(groupState(["s1-e1", "s1-e2", "s1-e1"], progress)).toEqual({ checked: 1, total: 2, state: "indeterminate" });
    expect(groupState(["s1-e1"], progress).state).toBe("checked");
    expect(groupState([], progress).state).toBe("unchecked");
  });
});

describe("library filters", () => {
  const entry = (id: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry => ({
    id,
    kind: "franchise",
    title: id,
    coverUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
    lastActivityAt: "2026-01-01T00:00:00Z",
    importing: false,
    summary: EMPTY_SUMMARY,
    ...overrides,
  });

  const entries = [
    entry("Alpha", { summary: { ...EMPTY_SUMMARY, worksTotal: 2, worksCompleted: 2, episodesWatched: 24, episodesKnownTotal: 24 }, lastActivityAt: "2026-03-01T00:00:00Z" }),
    entry("Beta", { summary: { ...EMPTY_SUMMARY, worksTotal: 2, worksCompleted: 0, episodesWatched: 5, episodesKnownTotal: 24, hasUnknownTotal: true }, lastActivityAt: "2026-05-01T00:00:00Z" }),
    entry("Gamma", { kind: "game", summary: { ...EMPTY_SUMMARY, checklistTotal: 4, checklistChecked: 0 }, createdAt: "2026-06-01T00:00:00Z" }),
  ];

  it("derives card state and progress", () => {
    expect(entryState(entries[0].summary)).toBe("completed");
    expect(entryState(entries[1].summary)).toBe("in_progress");
    expect(entryState(entries[2].summary)).toBe("not_started");
    expect(entryProgress(entries[1])).toEqual({ done: 5, total: null, label: "episodes" });
    expect(entryProgress(entries[2])).toEqual({ done: 0, total: 4, label: "items" });
  });

  it("filters, searches and sorts", () => {
    const search = (params: Record<string, string>) => filterLibrary(entries, librarySearchSchema.parse(params)).map((e) => e.title);
    expect(search({})).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(search({ kind: "game" })).toEqual(["Gamma"]);
    expect(search({ status: "completed" })).toEqual(["Alpha"]);
    expect(search({ q: "et" })).toEqual(["Beta"]);
    expect(search({ sort: "title" })).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(search({ sort: "added" })[0]).toBe("Gamma");
    expect(search({ kind: "bogus", sort: "nope" })).toHaveLength(3);
  });
});
