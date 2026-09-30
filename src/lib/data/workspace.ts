import "server-only";
import { apiError, dbError } from "@/lib/http";
import type { AuthContext } from "@/lib/supabase/auth";
import type { Tables } from "@/lib/supabase/database.types";
import type { ChecklistItem, ChecklistStep, NodeDetail, NodeKind, WorkspaceNode } from "@/lib/workspace/tree";
import { fetchAll } from "./fetch-all";

type Supabase = AuthContext["supabase"];

export type WorkspaceData = { entry: Tables<"entries">; nodes: WorkspaceNode[] };

export const NODE_COLUMNS = "id, parent_id, kind, name, version, updated_at";
export const ITEM_COLUMNS = "id, label, checked, position, notes, starred, due_date";
export const STEP_COLUMNS = "id, label, checked, position";

type ItemRow = { id: string; label: string; checked: boolean; position: number; notes: string; starred: boolean; due_date: string | null };

export function toChecklistItem(row: ItemRow, steps: ChecklistStep[] = []): ChecklistItem {
  return {
    id: row.id,
    label: row.label,
    checked: row.checked,
    position: row.position,
    notes: row.notes,
    starred: row.starred,
    dueDate: row.due_date,
    steps: [...steps].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)),
  };
}

export function toWorkspaceNode(
  row: { id: string; parent_id: string | null; kind: string; name: string; version: number; updated_at: string },
  counts: { total: number; checked: number } = { total: 0, checked: 0 },
): WorkspaceNode {
  return {
    id: row.id,
    parentId: row.parent_id,
    kind: row.kind as NodeKind,
    name: row.name,
    version: row.version,
    updatedAt: row.updated_at,
    itemsTotal: counts.total,
    itemsChecked: counts.checked,
  };
}

/** Friendly responses for create/rename/move failures. */
export function nodeWriteError(error: { code?: string; message: string }, name?: string) {
  if (error.code === "23505") {
    return apiError(409, "name_taken", `${name ? `“${name}”` : "That name"} already exists in this folder. Choose another name.`);
  }
  if (error.code === "23503") return apiError(404, "not_found", "That folder no longer exists. Reload and try again.");
  return dbError(error);
}

export async function loadWorkspaceNodes(supabase: Supabase, entryId: string): Promise<WorkspaceNode[]> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("workspace_tree")
      .select("id, parent_id, kind, name, version, updated_at, items_total, items_checked")
      .eq("entry_id", entryId)
      .order("id")
      .range(from, to),
  );
  return rows.map((row) => ({
    id: row.id!,
    parentId: row.parent_id,
    kind: row.kind as NodeKind,
    name: row.name!,
    version: row.version ?? 1,
    updatedAt: row.updated_at!,
    itemsTotal: row.items_total ?? 0,
    itemsChecked: row.items_checked ?? 0,
  }));
}

export async function loadWorkspace(ctx: AuthContext, entryId: string): Promise<WorkspaceData | null> {
  const { data: entry } = await ctx.supabase.from("entries").select("*").eq("id", entryId).maybeSingle();
  if (!entry) return null;
  return { entry, nodes: await loadWorkspaceNodes(ctx.supabase, entryId) };
}

export async function loadNodeDetail(supabase: Supabase, nodeId: string, entryId?: string): Promise<NodeDetail | null> {
  let query = supabase.from("workspace_nodes").select("id, entry_id, parent_id, kind, name, content, version, updated_at").eq("id", nodeId);
  if (entryId) query = query.eq("entry_id", entryId);
  const { data: node, error } = await query.maybeSingle();
  if (error) throw new Error(`Query failed (${error.code ?? "unknown"})`);
  if (!node) return null;

  const rows =
    node.kind === "checklist"
      ? await fetchAll((from, to) =>
          supabase
            .from("workspace_checklist_items")
            .select(`${ITEM_COLUMNS}, steps:workspace_checklist_steps(${STEP_COLUMNS})`)
            .eq("file_id", nodeId)
            .order("position")
            .order("id")
            .range(from, to),
        )
      : [];
  const items = rows.map((row) => toChecklistItem(row, row.steps));

  return {
    node: {
      ...toWorkspaceNode(node, { total: items.length, checked: items.filter((item) => item.checked).length }),
      content: node.content,
    },
    items,
  };
}
