import "server-only";
import { markdownTaskCounts } from "@/lib/progress/markdown";
import type { AuthContext } from "@/lib/supabase/auth";
import type { Json } from "@/lib/supabase/database.types";
import { readTemplateStructure, templateCounts, type TemplateStructure, type TemplateSummary, type WorkspaceTemplate } from "@/lib/templates";
import { fetchAll } from "./fetch-all";

/** The account's templates by name, with item counts. */
export async function loadTemplates(ctx: AuthContext): Promise<TemplateSummary[]> {
  const rows = await fetchAll((from, to) => ctx.supabase.from("workspace_templates").select("id, name, updated_at, structure").order("name").order("id").range(from, to));
  return rows.map((row) => ({ id: row.id, name: row.name, updatedAt: row.updated_at, ...templateCounts(readTemplateStructure(row.structure)) }));
}

export async function loadTemplate(ctx: AuthContext, id: string): Promise<WorkspaceTemplate | null> {
  const { data } = await ctx.supabase.from("workspace_templates").select("id, name, updated_at, structure").eq("id", id).maybeSingle();
  return data ? { id: data.id, name: data.name, updatedAt: data.updated_at, structure: readTemplateStructure(data.structure) } : null;
}

/** Normalized for storage: only notes keep text, only checklists keep tasks, task counts come from the text. */
export function storedStructure(structure: TemplateStructure): { [key: string]: Json } {
  return {
    nodes: structure.nodes.map((node) => {
      const base = { id: node.id, parentId: node.parentId, kind: node.kind, name: node.name };
      if (node.kind === "folder") return base;
      const includeInCoverProgress = node.includeInCoverProgress ?? node.kind === "checklist";
      if (node.kind === "checklist") return { ...base, includeInCoverProgress, tasks: node.tasks ?? [] };
      const content = node.content ?? "";
      const counts = markdownTaskCounts(content);
      return { ...base, includeInCoverProgress, content, tasksTotal: counts.total, tasksChecked: counts.checked };
    }),
  };
}
