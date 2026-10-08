import { describe, expect, it } from "vitest";
import { categoryCreateSchema, categoryInputSchema, categoryKey, entryCategoriesSchema, parseCategoryIds, sortCategories } from "@/lib/categories";
import { EMPTY_SUMMARY, entryProgress, entryState, filterLibrary, librarySearchSchema, type LibraryEntry } from "@/lib/progress/library";

const AFK = "11111111-1111-4111-8111-111111111111";
const TOWER = "22222222-2222-4222-8222-222222222222";
const ROMANCE = "33333333-3333-4333-8333-333333333333";

describe("library filters", () => {
  const entry = (id: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry => ({
    id,
    kind: "anime",
    title: id,
    coverUrl: null,
    categoryIds: [],
    createdAt: "2026-01-01T00:00:00Z",
    lastActivityAt: "2026-01-01T00:00:00Z",
    summary: EMPTY_SUMMARY,
    ...overrides,
  });

  const entries = [
    entry("Alpha", { summary: { filesTotal: 3, checklistTotal: 24, checklistChecked: 24 }, lastActivityAt: "2026-03-01T00:00:00Z", categoryIds: [AFK, TOWER] }),
    entry("Beta", { summary: { filesTotal: 2, checklistTotal: 24, checklistChecked: 5 }, lastActivityAt: "2026-05-01T00:00:00Z", categoryIds: [ROMANCE] }),
    entry("Gamma", { kind: "game", summary: { filesTotal: 4, checklistTotal: 4, checklistChecked: 0 }, createdAt: "2026-06-01T00:00:00Z", categoryIds: [TOWER] }),
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

  it("matches ALL selected categories, combined with the other filters", () => {
    const search = (params: Record<string, unknown>) => filterLibrary(entries, librarySearchSchema.parse(params)).map((e) => e.title);
    expect(search({ categories: TOWER })).toEqual(["Alpha", "Gamma"]);
    expect(search({ categories: `${AFK},${ROMANCE}` })).toEqual([]);
    expect(search({ categories: `${AFK},${TOWER}` })).toEqual(["Alpha"]);
    expect(search({ categories: AFK })).toEqual(["Alpha"]);
    expect(search({ categories: `${AFK},${TOWER}`, status: "completed", q: "alp" })).toEqual(["Alpha"]);
    expect(search({ categories: `${AFK},${TOWER}`, status: "in_progress" })).toEqual([]);
    expect(search({ categories: `${TOWER}`, status: "completed" })).toEqual(["Alpha"]);
    expect(search({ categories: `${TOWER}`, q: "gam" })).toEqual(["Gamma"]);
    // No selection, or only malformed ids, means no category restriction.
    expect(search({ categories: "" })).toHaveLength(4);
    expect(search({ categories: "not-a-uuid,," })).toHaveLength(4);
    expect(librarySearchSchema.parse({}).categories).toEqual([]);
  });
});

describe("categories", () => {
  it("trims names, rejects empty or oversized ones and line breaks", () => {
    expect(categoryInputSchema.parse({ name: "  Tower Defense " }).name).toBe("Tower Defense");
    expect(categoryInputSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ name: "two\nlines" }).success).toBe(false);
    expect(categoryInputSchema.safeParse({ name: "AFK", user_id: AFK }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: "AFK" }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: "AFK", kind: "unknown" }).success).toBe(false);
    for (const kind of ["game", "anime", "custom"]) expect(categoryCreateSchema.parse({ name: "AFK", kind }).kind).toBe(kind);
  });

  it("treats names case-insensitively and sorts them naturally", () => {
    expect(categoryKey(" Romance ")).toBe(categoryKey("ROMANCE"));
    expect(sortCategories([{ id: "b", name: "tower Defense" }, { id: "a", name: "AFK" }, { id: "c", name: "Act 10" }, { id: "d", name: "Act 2" }]).map((c) => c.name)).toEqual([
      "Act 2",
      "Act 10",
      "AFK",
      "tower Defense",
    ]);
  });

  it("accepts only distinct, well-formed ids", () => {
    expect(parseCategoryIds([AFK, AFK, "x", TOWER])).toEqual([AFK, TOWER]);
    expect(parseCategoryIds(`${ROMANCE}, ${AFK}`)).toEqual([ROMANCE, AFK]);
    expect(parseCategoryIds(undefined)).toEqual([]);
    expect(entryCategoriesSchema.safeParse({ categoryIds: [AFK] }).success).toBe(true);
    expect(entryCategoriesSchema.safeParse({ categoryIds: ["nope"] }).success).toBe(false);
  });
});
