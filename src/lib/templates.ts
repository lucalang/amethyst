import { z } from "zod";
import { MAX_NOTE_LENGTH, NODE_KINDS, itemLabelSchema, nodeNameSchema } from "@/lib/validation/workspace";
import type { NodeKind, WorkspaceNode } from "@/lib/workspace/tree";

export const MAX_TEMPLATE_NODES = 500;
export const MAX_TEMPLATE_TASKS = 500;
export const MAX_TEMPLATE_DEPTH = 32;

/** One folder, note or checklist in a template. Ids are local to the template. */
export type TemplateNode = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  name: string;
  /** Initial Markdown text (notes only). */
  content?: string;
  includeInCoverProgress?: boolean;
  /** Starter tasks (checklists only); always created unchecked. */
  tasks?: string[];
  /** Markdown task counts, computed on the server when the template is saved. */
  tasksTotal?: number;
  tasksChecked?: number;
};

export type TemplateStructure = { nodes: TemplateNode[] };
export type TemplateSummary = { id: string; name: string; updatedAt: string; files: number; folders: number };
export type WorkspaceTemplate = { id: string; name: string; updatedAt: string; structure: TemplateStructure };

/** Form value for "which template should a new entry use". */
export const NO_TEMPLATE = "none";

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a template name.")
  .max(80, "Template names can be at most 80 characters.")
  .refine((value) => !CONTROL_CHARS.test(value), "Names cannot contain line breaks or control characters.");

const templateNodeSchema = z
  .object({
    id: z.string().min(1).max(64),
    parentId: z.string().min(1).max(64).nullable(),
    kind: z.enum(NODE_KINDS),
    name: nodeNameSchema,
    content: z.string().max(MAX_NOTE_LENGTH, `Notes can be at most ${MAX_NOTE_LENGTH.toLocaleString("en")} characters.`).optional(),
    includeInCoverProgress: z.boolean().optional(),
    tasks: z.array(itemLabelSchema).max(MAX_TEMPLATE_TASKS, `A checklist can start with at most ${MAX_TEMPLATE_TASKS} tasks.`).optional(),
  })
  .strip();

/** A valid tree: unique ids, parents are folders, no cycles, limited depth, unique sibling names. */
export const templateStructureSchema = z
  .object({ nodes: z.array(templateNodeSchema).max(MAX_TEMPLATE_NODES, `Templates can hold at most ${MAX_TEMPLATE_NODES} items.`) })
  .strip()
  .superRefine((structure, ctx) => {
    const byId = new Map<string, (typeof structure.nodes)[number]>();
    for (const node of structure.nodes) {
      if (byId.has(node.id)) return ctx.addIssue({ code: "custom", message: "Template items must have unique ids." });
      byId.set(node.id, node);
    }
    const siblings = new Set<string>();
    for (const node of structure.nodes) {
      if (node.parentId !== null && byId.get(node.parentId)?.kind !== "folder") {
        return ctx.addIssue({ code: "custom", message: `“${node.name}” must be inside a folder of this template.` });
      }
      const key = `${node.parentId ?? ""}/${node.name.toLowerCase()}`;
      if (siblings.has(key)) return ctx.addIssue({ code: "custom", message: `“${node.name}” exists twice in the same folder.` });
      siblings.add(key);
      let depth = 0;
      for (let parent = node.parentId; parent !== null; parent = byId.get(parent)?.parentId ?? null) {
        depth += 1;
        if (depth > MAX_TEMPLATE_DEPTH) {
          return ctx.addIssue({ code: "custom", message: `Folders can be nested at most ${MAX_TEMPLATE_DEPTH} levels deep.` });
        }
      }
    }
  });

export const templateInputSchema = z.object({ name: templateNameSchema, structure: templateStructureSchema.optional() }).strict();
export const templatePatchSchema = z
  .object({ name: templateNameSchema.optional(), structure: templateStructureSchema.optional() })
  .strict()
  .refine((value) => value.name !== undefined || value.structure !== undefined, "Nothing to update.");

/** Stored JSON → structure (malformed parts are dropped rather than crashing the editor). */
export function readTemplateStructure(raw: unknown): TemplateStructure {
  const parsed = templateStructureSchema.safeParse(raw);
  if (parsed.success) {
    return {
      nodes: parsed.data.nodes.map((node) => {
        const source = (raw as { nodes: Record<string, unknown>[] }).nodes.find((candidate) => candidate.id === node.id);
        return { ...node, tasksTotal: Number(source?.tasksTotal) || 0, tasksChecked: Number(source?.tasksChecked) || 0 };
      }),
    };
  }
  return { nodes: [] };
}

export function templateCounts(structure: TemplateStructure) {
  const folders = structure.nodes.filter((node) => node.kind === "folder").length;
  return { folders, files: structure.nodes.length - folders };
}

/** Template items as explorer rows (the explorer and move dialog work on workspace nodes). */
export function templateExplorerNodes(structure: TemplateStructure): WorkspaceNode[] {
  return structure.nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    name: node.name,
    version: 1,
    updatedAt: "",
    includeInCoverProgress: node.kind !== "folder" && (node.includeInCoverProgress ?? node.kind === "checklist"),
    itemsTotal: node.kind === "checklist" ? (node.tasks?.length ?? 0) : (node.tasksTotal ?? 0),
    itemsChecked: 0,
  }));
}

/** Copy of a structure with fresh local ids (used when duplicating). */
export function cloneTemplateStructure(structure: TemplateStructure, newId: () => string): TemplateStructure {
  const ids = new Map(structure.nodes.map((node) => [node.id, newId()]));
  return {
    nodes: structure.nodes.map((node) => ({ ...node, id: ids.get(node.id)!, parentId: node.parentId ? (ids.get(node.parentId) ?? null) : null })),
  };
}
