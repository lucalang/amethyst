import { z } from "zod";

// Matches the database checks on workspace_nodes / workspace_checklist_items.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const NODE_KINDS = ["folder", "note", "checklist"] as const;
export const MAX_NOTE_LENGTH = 200_000;
export const MAX_ITEMS_PER_REQUEST = 500;

export const nodeNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(200, "Names can be at most 200 characters.")
  .refine((value) => !CONTROL_CHARS.test(value), "Names cannot contain line breaks or control characters.");

export const itemLabelSchema = z
  .string()
  .trim()
  .min(1, "Enter a label.")
  .max(500, "Labels can be at most 500 characters.")
  .refine((value) => !CONTROL_CHARS.test(value), "Labels cannot contain line breaks or control characters.");

export const createNodeSchema = z
  .object({
    parentId: z.uuid().nullable(),
    kind: z.enum(NODE_KINDS),
    name: nodeNameSchema,
    includeInCoverProgress: z.boolean().optional(),
  })
  .strict();

export const updateNodeSchema = z
  .object({
    name: nodeNameSchema.optional(),
    parentId: z.uuid().nullable().optional(),
    content: z.string().max(MAX_NOTE_LENGTH, `Notes can be at most ${MAX_NOTE_LENGTH.toLocaleString("en")} characters.`).optional(),
    includeInCoverProgress: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.parentId !== undefined || value.content !== undefined || value.includeInCoverProgress !== undefined, "Nothing to update.");

/** Blank lines are dropped so a pasted list becomes one item per line. */
export const addItemsSchema = z
  .object({
    labels: z
      .array(z.string())
      .min(1)
      .max(MAX_ITEMS_PER_REQUEST, `Add at most ${MAX_ITEMS_PER_REQUEST} items at once.`)
      .transform((labels) => labels.map((label) => label.trim()).filter(Boolean))
      .pipe(z.array(itemLabelSchema).min(1, "Enter at least one label.")),
  })
  .strict();

export const MAX_TASK_NOTES_LENGTH = 20_000;

export const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-31.")
  .refine((value) => {
    const time = Date.parse(`${value}T00:00:00Z`);
    // Round-trip so impossible dates such as 2026-02-30 are rejected rather than rolled over.
    return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value && value >= "1900-01-01" && value <= "2999-12-31";
  }, "Choose a valid date.");

export const updateItemSchema = z
  .object({
    label: itemLabelSchema.optional(),
    checked: z.boolean().optional(),
    notes: z.string().max(MAX_TASK_NOTES_LENGTH, `Notes can be at most ${MAX_TASK_NOTES_LENGTH.toLocaleString("en")} characters.`).optional(),
    starred: z.boolean().optional(),
    dueDate: dueDateSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Nothing to update.");

export const addStepSchema = z.object({ label: itemLabelSchema }).strict();

export const updateStepSchema = z
  .object({ label: itemLabelSchema.optional(), checked: z.boolean().optional() })
  .strict()
  .refine((value) => value.label !== undefined || value.checked !== undefined, "Nothing to update.");

export const reorderStepsSchema = z.object({ stepIds: z.array(z.uuid()).max(1000) }).strict();

export const reorderItemsSchema = z.object({ itemIds: z.array(z.uuid()).max(10_000) }).strict();

export const checkAllSchema = z.object({ checked: z.boolean() }).strict();

/** Split pasted text into checklist labels (one per non-empty line). */
export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/, "").trim())
    .filter(Boolean);
}
