import { z } from "zod";
import { ICON_NAME_PATTERN } from "@/lib/collection-identity";
import { dueDateSchema, itemLabelSchema, MAX_ITEMS_PER_REQUEST, MAX_TASK_NOTES_LENGTH } from "./workspace";

// Mirrors the checks in supabase/migrations/20261102000100_tasks.sql.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export const taskNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(120, "Names can be at most 120 characters.")
  .refine((value) => !CONTROL_CHARS.test(value), "Names cannot contain line breaks or control characters.");

export const taskTitleSchema = itemLabelSchema;
const notesSchema = z.string().max(MAX_TASK_NOTES_LENGTH, `Notes can be at most ${MAX_TASK_NOTES_LENGTH.toLocaleString("en")} characters.`);
const iconSchema = z.string().regex(ICON_NAME_PATTERN).max(64);
const accentSchema = z.string().regex(/^#[0-9a-f]{6}$/);

export const createGroupSchema = z.object({ name: taskNameSchema }).strict();
export const updateGroupSchema = z
  .object({ name: taskNameSchema.optional(), collapsed: z.boolean().optional() })
  .strict()
  .refine((value) => value.name !== undefined || value.collapsed !== undefined, "Nothing to update.");

export const createListSchema = z
  .object({
    name: taskNameSchema,
    groupId: z.uuid().nullable().optional(),
    icon: iconSchema.nullable().optional(),
    accentColor: accentSchema.nullable().optional(),
  })
  .strict();

export const updateListSchema = z
  .object({
    name: taskNameSchema.optional(),
    icon: iconSchema.nullable().optional(),
    accentColor: accentSchema.nullable().optional(),
    showCompleted: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), "Nothing to update.");

export const deleteListSchema = z.object({ expectedTasks: z.number().int().min(0) }).strict();

const layoutItemSchema = z.union([
  z.object({ group: z.uuid(), lists: z.array(z.uuid()).max(500) }).strict(),
  z.object({ list: z.uuid() }).strict(),
]);
export const layoutSchema = z.object({ layout: z.array(layoutItemSchema).max(500) }).strict();
export type TaskLayoutItem = z.infer<typeof layoutItemSchema>;

export const addTasksSchema = z
  .object({
    listId: z.uuid(),
    tasks: z
      .array(z.object({ title: taskTitleSchema, completed: z.boolean() }).strict())
      .min(1, "Enter at least one task.")
      .max(MAX_ITEMS_PER_REQUEST, `Add at most ${MAX_ITEMS_PER_REQUEST} tasks at once.`),
    important: z.boolean().optional(),
    dueDate: dueDateSchema.nullable().optional(),
    myDay: dueDateSchema.nullable().optional(),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    notes: notesSchema.optional(),
    /** The notes revision the edit was based on; required with `notes`. */
    notesRev: z.number().int().min(0).optional(),
    important: z.boolean().optional(),
    dueDate: dueDateSchema.nullable().optional(),
    myDay: dueDateSchema.nullable().optional(),
    completed: z.boolean().optional(),
    listId: z.uuid().optional(),
    entryId: z.uuid().nullable().optional(),
  })
  .strict()
  .refine((value) => value.notes === undefined || value.notesRev !== undefined, "Missing notes revision.")
  .refine((value) => Object.entries(value).some(([key, field]) => key !== "notesRev" && field !== undefined), "Nothing to update.");

export const reorderTasksSchema = z.object({ taskIds: z.array(z.uuid()).min(1).max(5000) }).strict();

export const addStepSchema = z.object({ title: taskTitleSchema }).strict();
export const reorderStepsSchema = z.object({ stepIds: z.array(z.uuid()).max(500) }).strict();
export const updateStepSchema = z
  .object({ title: taskTitleSchema.optional(), completed: z.boolean().optional() })
  .strict()
  .refine((value) => value.title !== undefined || value.completed !== undefined, "Nothing to update.");

export const taskSearchSchema = z.string().trim().min(1).max(100);
