import { describe, expect, it } from "vitest";
import { EMPTY_SUMMARY, entryProgress, entryState, filterLibrary, librarySearchSchema, type LibraryEntry } from "@/lib/progress/library";

describe("library filters", () => {
  const entry = (id: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry => ({
    id,
    kind: "anime",
    title: id,
    coverUrl: null,
    createdAt: "2026-01-01T00:00:00Z",
    lastActivityAt: "2026-01-01T00:00:00Z",
    summary: EMPTY_SUMMARY,
    ...overrides,
  });

  const entries = [
    entry("Alpha", { summary: { filesTotal: 3, checklistTotal: 24, checklistChecked: 24 }, lastActivityAt: "2026-03-01T00:00:00Z" }),
    entry("Beta", { summary: { filesTotal: 2, checklistTotal: 24, checklistChecked: 5 }, lastActivityAt: "2026-05-01T00:00:00Z" }),
    entry("Gamma", { kind: "game", summary: { filesTotal: 4, checklistTotal: 4, checklistChecked: 0 }, createdAt: "2026-06-01T00:00:00Z" }),
    entry("Delta", { kind: "custom", summary: { filesTotal: 1, checklistTotal: 0, checklistChecked: 0 } }),
  ];

  it("derives card state and progress from checklist items", () => {
    expect(entryState(entries[0].summary)).toBe("completed");
    expect(entryState(entries[1].summary)).toBe("in_progress");
    expect(entryState(entries[2].summary)).toBe("not_started");
    expect(entryState(entries[3].summary)).toBe("not_started");
    expect(entryProgress(entries[1])).toEqual({ done: 5, total: 24, label: "tasks" });
    expect(entryProgress(entries[3])).toEqual({ done: 0, total: null, label: "tasks" });
  });

  it("filters, searches and sorts within one collection", () => {
    const search = (params: Record<string, string>) => filterLibrary(entries, librarySearchSchema.parse(params)).map((e) => e.title);
    expect(search({})).toEqual(["Beta", "Alpha", "Gamma", "Delta"]);
    expect(search({ status: "completed" })).toEqual(["Alpha"]);
    expect(search({ q: "et" })).toEqual(["Beta"]);
    expect(search({ sort: "title" })).toEqual(["Alpha", "Beta", "Delta", "Gamma"]);
    expect(search({ sort: "progress" }).slice(0, 2)).toEqual(["Alpha", "Beta"]);
    expect(search({ sort: "added" })[0]).toBe("Gamma");
    expect(search({ status: "nope", sort: "nope" })).toHaveLength(4);
    // The collection (anime vs games) is chosen by the route, never by a search parameter.
    expect(librarySearchSchema.parse({ kind: "game" })).not.toHaveProperty("kind");
  });
});
