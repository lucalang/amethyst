// Pure helpers for the workspace explorer (shared by server and client code).

export type NodeKind = "folder" | "note" | "checklist";

export type WorkspaceNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  version: number;
  updatedAt: string;
  includeInCoverProgress: boolean;
  itemsTotal: number;
  itemsChecked: number;
};

export type TreeNode = WorkspaceNode & { depth: number; children: TreeNode[] };

export type ChecklistStep = { id: string; label: string; checked: boolean; position: number };

export type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  position: number;
  notes: string;
  starred: boolean;
  dueDate: string | null;
  steps: ChecklistStep[];
};

/** A file (or folder) with its content, as returned by GET /api/nodes/:id. */
export type NodeDetail = { node: WorkspaceNode & { content: string }; items: ChecklistItem[] };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Folders first, then natural name order ("Episode 2" before "Episode 10"). */
export function compareNodes(a: Pick<WorkspaceNode, "kind" | "name" | "id">, b: Pick<WorkspaceNode, "kind" | "name" | "id">) {
  if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function buildTree(nodes: readonly WorkspaceNode[]): TreeNode[] {
  const ids = new Set(nodes.map((node) => node.id));
  const byParent = new Map<string | null, WorkspaceNode[]>();
  for (const node of nodes) {
    const parent = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const siblings = byParent.get(parent);
    if (siblings) siblings.push(node);
    else byParent.set(parent, [node]);
  }
  const build = (parentId: string | null, depth: number, seen: Set<string>): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .filter((node) => !seen.has(node.id))
      .sort(compareNodes)
      .map((node) => {
        const next = new Set(seen).add(node.id);
        return { ...node, depth, children: node.kind === "folder" ? build(node.id, depth + 1, next) : [] };
      });
  return build(null, 0, new Set());
}

/** Rows in display order, descending only into expanded folders. */
export function visibleRows(tree: readonly TreeNode[], expanded: ReadonlySet<string>): TreeNode[] {
  const rows: TreeNode[] = [];
  const walk = (nodes: readonly TreeNode[]) => {
    for (const node of nodes) {
      rows.push(node);
      if (node.kind === "folder" && expanded.has(node.id)) walk(node.children);
    }
  };
  walk(tree);
  return rows;
}

/** Ancestors from the root down to the direct parent. */
export function ancestorsOf(nodes: readonly WorkspaceNode[], id: string): WorkspaceNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: WorkspaceNode[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parentId ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    chain.unshift(node);
    current = node.parentId;
  }
  return chain;
}

export function descendantIds(nodes: readonly WorkspaceNode[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId);
    if (list) list.push(node.id);
    else children.set(node.parentId, [node.id]);
  }
  const result = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    if (result.has(next)) continue;
    result.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return result;
}

/** Whether `id` can move into `targetParentId` (null = workspace root). */
export function canMoveTo(nodes: readonly WorkspaceNode[], id: string, targetParentId: string | null): boolean {
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node || node.parentId === targetParentId) return false;
  if (targetParentId === null) return true;
  if (targetParentId === id) return false;
  const target = nodes.find((candidate) => candidate.id === targetParentId);
  if (!target || target.kind !== "folder") return false;
  return !descendantIds(nodes, id).has(targetParentId);
}

export function nameTaken(nodes: readonly WorkspaceNode[], parentId: string | null, name: string, exceptId?: string): boolean {
  const wanted = name.trim().toLocaleLowerCase();
  return nodes.some((node) => node.parentId === parentId && node.id !== exceptId && node.name.toLocaleLowerCase() === wanted);
}

/** "Untitled", then "Untitled 2", "Untitled 3", … among the target's children. */
export function suggestName(nodes: readonly WorkspaceNode[], parentId: string | null, base: string): string {
  if (!nameTaken(nodes, parentId, base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!nameTaken(nodes, parentId, candidate)) return candidate;
  }
}

export function checklistTotals(nodes: readonly WorkspaceNode[]): { total: number; checked: number } {
  return nodes.reduce(
    (sum, node) => (node.kind !== "folder" && node.includeInCoverProgress ? { total: sum.total + node.itemsTotal, checked: sum.checked + node.itemsChecked } : sum),
    { total: 0, checked: 0 },
  );
}

export function firstFile(tree: readonly TreeNode[]): TreeNode | null {
  for (const node of tree) {
    if (node.kind !== "folder") return node;
  }
  for (const node of tree) {
    const found = firstFile(node.children);
    if (found) return found;
  }
  return null;
}
