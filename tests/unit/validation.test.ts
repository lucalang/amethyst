import { describe, expect, it } from "vitest";
import { entryPatchSchema, newEntrySchema } from "@/lib/validation/entries";
import { safeNextPath } from "@/lib/validation/redirect";
import {
  addItemsSchema,
  addStepSchema,
  createNodeSchema,
  nodeNameSchema,
  reorderStepsSchema,
  splitLines,
  updateItemSchema,
  updateNodeSchema,
  updateStepSchema,
} from "@/lib/validation/workspace";

describe("new entries", () => {
  const schema = newEntrySchema;

  it("accepts a manual anime with only a title and an image from any public host", () => {
    const parsed = schema.parse({ kind: "anime", title: "  One Piece ", coverUrl: "https://i.imgur.com/abc.jpg" });
    expect(parsed).toMatchObject({ kind: "anime", title: "One Piece", coverUrl: "https://i.imgur.com/abc.jpg", bannerUrl: null });
    expect(schema.parse({ kind: "game", title: "Fortnite", coverUrl: "http://static.example.org/cover.png" }).coverUrl).toBe(
      "http://static.example.org/cover.png",
    );
  });

  it("rejects unknown kinds, blank titles and local image targets", () => {
    expect(schema.safeParse({ kind: "franchise", title: "x" }).success).toBe(false);
    expect(schema.safeParse({ kind: "anime", title: "   " }).success).toBe(false);
    expect(schema.safeParse({ kind: "anime", title: "x", coverUrl: "http://127.0.0.1/a.png" }).success).toBe(false);
    expect(schema.safeParse({ kind: "anime", title: "x", coverUrl: "ftp://files.example.com/a.png" }).success).toBe(false);
  });

  it("creates games with only a title and leaves platform out of detail patches", () => {
    expect(schema.parse({ kind: "game", title: "Hollow Knight" })).toEqual({
      kind: "game", title: "Hollow Knight", platform: null, coverUrl: null, bannerUrl: null,
    });
    expect(entryPatchSchema.parse({ title: "Hollow Knight", expectedVersion: 1 })).not.toHaveProperty("platform");
    expect(entryPatchSchema.parse({ platform: "Legacy PC" })).toEqual({ platform: "Legacy PC" });
  });
});

describe("workspace input", () => {
  it("trims names and rejects empty, oversized or multi-line names", () => {
    expect(nodeNameSchema.parse("  Arcs ")).toBe("Arcs");
    expect(nodeNameSchema.parse("Fate/Zero")).toBe("Fate/Zero");
    expect(nodeNameSchema.safeParse("  ").success).toBe(false);
    expect(nodeNameSchema.safeParse("a".repeat(201)).success).toBe(false);
    expect(nodeNameSchema.safeParse("two\nlines").success).toBe(false);
  });

  it("validates node creation and updates", () => {
    expect(createNodeSchema.safeParse({ parentId: null, kind: "folder", name: "Season 1" }).success).toBe(true);
    expect(createNodeSchema.safeParse({ parentId: "not-a-uuid", kind: "folder", name: "x" }).success).toBe(false);
    expect(createNodeSchema.safeParse({ parentId: null, kind: "episode", name: "x" }).success).toBe(false);
    expect(createNodeSchema.safeParse({ parentId: null, kind: "note", name: "x", user_id: "someone" }).success).toBe(false);
    expect(updateNodeSchema.safeParse({}).success).toBe(false);
    expect(updateNodeSchema.safeParse({ parentId: null }).success).toBe(true);
    expect(updateNodeSchema.safeParse({ content: "x".repeat(200_001) }).success).toBe(false);
  });

  it("turns pasted lists into one checklist item per line", () => {
    expect(splitLines("- [ ] Romance Dawn\n\n* Orange Town\r\n+ [x] Syrup Village\n  Baratie  \n1. Arlong Park")).toEqual([
      "Romance Dawn",
      "Orange Town",
      "Syrup Village",
      "Baratie",
      "1. Arlong Park",
    ]);
    expect(addItemsSchema.parse({ labels: [" Alabasta ", "", "Skypiea"] }).labels).toEqual(["Alabasta", "Skypiea"]);
    expect(addItemsSchema.safeParse({ labels: ["", " "] }).success).toBe(false);
    expect(addItemsSchema.safeParse({ labels: ["x".repeat(501)] }).success).toBe(false);
    expect(updateItemSchema.safeParse({ checked: true }).success).toBe(true);
    expect(updateItemSchema.safeParse({}).success).toBe(false);
  });

  it("validates task details and steps", () => {
    expect(updateItemSchema.safeParse({ notes: "Watch the extended cut", starred: true, dueDate: "2026-10-31" }).success).toBe(true);
    expect(updateItemSchema.safeParse({ dueDate: null }).success).toBe(true);
    expect(updateItemSchema.safeParse({ notes: "" }).success).toBe(true);
    expect(updateItemSchema.safeParse({ notes: "x".repeat(20_001) }).success).toBe(false);
    expect(updateItemSchema.safeParse({ dueDate: "31.10.2026" }).success).toBe(false);
    expect(updateItemSchema.safeParse({ dueDate: "2026-02-30" }).success).toBe(false);
    expect(updateItemSchema.safeParse({ dueDate: "1800-01-01" }).success).toBe(false);
    expect(updateItemSchema.safeParse({ starred: "yes" }).success).toBe(false);
    expect(updateItemSchema.safeParse({ position: 3 }).success).toBe(false);

    expect(addStepSchema.parse({ label: "  Buy the box set " }).label).toBe("Buy the box set");
    expect(addStepSchema.safeParse({ label: " " }).success).toBe(false);
    expect(updateStepSchema.safeParse({ checked: true }).success).toBe(true);
    expect(updateStepSchema.safeParse({}).success).toBe(false);
    expect(updateStepSchema.safeParse({ item_id: crypto.randomUUID() }).success).toBe(false);
    expect(reorderStepsSchema.safeParse({ stepIds: [crypto.randomUUID()] }).success).toBe(true);
    expect(reorderStepsSchema.safeParse({ stepIds: ["nope"] }).success).toBe(false);
  });
});

describe("safeNextPath", () => {
  it.each([
    ["/franchise/1?tab=movies", "/franchise/1?tab=movies"],
    ["/", "/"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "", "relative", "/a\u0000b", undefined, 42])(
    "rejects %s",
    (input) => {
      expect(safeNextPath(input)).toBe("/");
    },
  );
});
