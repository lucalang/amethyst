import { describe, expect, it } from "vitest";
import {
  ancestorsOf,
  buildTree,
  canMoveTo,
  checklistTotals,
  descendantIds,
  firstFile,
  nameTaken,
  suggestName,
  visibleRows,
  type NodeKind,
  type WorkspaceNode,
} from "@/lib/workspace/tree";

const node = (id: string, name: string, kind: NodeKind, parentId: string | null = null, items: [number, number] = [0, 0]): WorkspaceNode => ({
  id,
  name,
  kind,
  parentId,
  version: 1,
  updatedAt: "2026-01-01T00:00:00Z",
  itemsTotal: items[0],
  itemsChecked: items[1],
});

// root
// ├── Arcs/            (folder a)
// │   ├── East Blue/   (folder b)
// │   │   └── Notes    (note c)
// │   └── Checklist    (checklist d, 3/10)
// ├── Episode 10       (note e)
// ├── Episode 2        (note f)
// └── Zebra/           (folder g)
const nodes: WorkspaceNode[] = [
  node("f", "Episode 2", "note"),
  node("e", "Episode 10", "note"),
  node("g", "Zebra", "folder"),
  node("d", "Checklist", "checklist", "a", [10, 3]),
  node("c", "Notes", "note", "b"),
  node("b", "East Blue", "folder", "a"),
  node("a", "Arcs", "folder"),
];

describe("workspace tree", () => {
  it("sorts folders first, then names in natural order", () => {
    const tree = buildTree(nodes);
    expect(tree.map((n) => n.name)).toEqual(["Arcs", "Zebra", "Episode 2", "Episode 10"]);
    expect(tree[0].children.map((n) => n.name)).toEqual(["East Blue", "Checklist"]);
    expect(tree[0].children[0].children[0]).toMatchObject({ name: "Notes", depth: 2 });
  });

  it("attaches orphans to the root instead of dropping them", () => {
    const tree = buildTree([node("x", "Lost", "note", "missing")]);
    expect(tree.map((n) => n.id)).toEqual(["x"]);
  });

  it("lists visible rows for expanded folders only", () => {
    const tree = buildTree(nodes);
    expect(visibleRows(tree, new Set()).map((n) => n.id)).toEqual(["a", "g", "f", "e"]);
    expect(visibleRows(tree, new Set(["a"])).map((n) => n.id)).toEqual(["a", "b", "d", "g", "f", "e"]);
    expect(visibleRows(tree, new Set(["a", "b"])).map((n) => n.id)).toEqual(["a", "b", "c", "d", "g", "f", "e"]);
  });

  it("finds ancestors and descendants", () => {
    expect(ancestorsOf(nodes, "c").map((n) => n.id)).toEqual(["a", "b"]);
    expect(ancestorsOf(nodes, "a")).toEqual([]);
    expect([...descendantIds(nodes, "a")].sort()).toEqual(["b", "c", "d"]);
    expect(descendantIds(nodes, "e").size).toBe(0);
  });

  it("only allows moves into folders outside the moved subtree", () => {
    expect(canMoveTo(nodes, "c", null)).toBe(true);
    expect(canMoveTo(nodes, "c", "g")).toBe(true);
    expect(canMoveTo(nodes, "c", "b")).toBe(false); // already there
    expect(canMoveTo(nodes, "a", "a")).toBe(false); // itself
    expect(canMoveTo(nodes, "a", "b")).toBe(false); // own descendant
    expect(canMoveTo(nodes, "f", "e")).toBe(false); // files cannot contain items
    expect(canMoveTo(nodes, "f", null)).toBe(false); // already at the root
    expect(canMoveTo(nodes, "missing", null)).toBe(false);
  });

  it("checks sibling names case-insensitively", () => {
    expect(nameTaken(nodes, null, "arcs")).toBe(true);
    expect(nameTaken(nodes, null, "  ZEBRA ")).toBe(true);
    expect(nameTaken(nodes, "a", "Arcs")).toBe(false);
    expect(nameTaken(nodes, null, "Arcs", "a")).toBe(false);
    expect(suggestName(nodes, null, "Untitled")).toBe("Untitled");
    expect(suggestName([...nodes, node("u", "Untitled", "note"), node("v", "untitled 2", "note")], null, "Untitled")).toBe("Untitled 3");
  });

  it("totals checklist items and finds a file to open", () => {
    expect(checklistTotals(nodes)).toEqual({ total: 10, checked: 3 });
    expect(firstFile(buildTree(nodes))?.id).toBe("f");
    expect(firstFile(buildTree(nodes.filter((n) => n.parentId !== null || n.kind === "folder")))?.id).toBe("d");
    expect(firstFile([])).toBeNull();
  });
});
