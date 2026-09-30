import { describe, expect, it } from "vitest";
import { newEntrySchema, starterFilesFor } from "@/lib/validation/entries";
import { getAllowedImageHosts, isAllowedImageUrl, parseExtraImageHosts } from "@/lib/validation/image-hosts";
import { safeNextPath } from "@/lib/validation/redirect";
import { addItemsSchema, createNodeSchema, nodeNameSchema, splitLines, updateItemSchema, updateNodeSchema } from "@/lib/validation/workspace";

describe("new entries", () => {
  const schema = newEntrySchema(getAllowedImageHosts(undefined));

  it("accepts a manual anime with only a title and an allowed image", () => {
    const parsed = schema.parse({ kind: "anime", title: "  One Piece ", coverUrl: "https://cdn.myanimelist.net/images/anime/6/73245.jpg" });
    expect(parsed).toMatchObject({ kind: "anime", title: "One Piece", coverUrl: "https://cdn.myanimelist.net/images/anime/6/73245.jpg", bannerUrl: null });
  });

  it("rejects unknown kinds, blank titles and foreign image hosts", () => {
    expect(schema.safeParse({ kind: "franchise", title: "x" }).success).toBe(false);
    expect(schema.safeParse({ kind: "anime", title: "   " }).success).toBe(false);
    expect(schema.safeParse({ kind: "anime", title: "x", coverUrl: "https://evil.test/a.png" }).success).toBe(false);
  });

  it("starts every kind with editable starter files", () => {
    expect(starterFilesFor("anime").map((file) => [file.kind, file.name])).toEqual([
      ["note", "Notes"],
      ["checklist", "Arcs"],
    ]);
    expect(starterFilesFor("game").map((file) => file.name)).toEqual(["Tier List", "Codes", "Guides", "Checklist"]);
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

describe("image host allow-list", () => {
  const hosts = getAllowedImageHosts("images.example.com, bad_host, ");

  it("includes provider defaults and valid extras only", () => {
    expect(hosts).toContain("cdn.myanimelist.net");
    expect(hosts).toContain("images.example.com");
    expect(parseExtraImageHosts("bad_host,,-x.com")).toEqual([]);
  });

  it("accepts https URLs on allowed hosts", () => {
    expect(isAllowedImageUrl("https://cdn.myanimelist.net/images/anime/1/1.jpg", hosts)).toBe(true);
  });

  it.each([
    "http://cdn.myanimelist.net/a.jpg",
    "https://evil.test/a.jpg",
    "https://user:pw@cdn.myanimelist.net/a.jpg",
    "https://cdn.myanimelist.net:8443/a.jpg",
    "https://cdn.myanimelist.net.evil.test/a.jpg",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAllowedImageUrl(url, hosts)).toBe(false);
  });
});
