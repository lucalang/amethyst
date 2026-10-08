import { z } from "zod";
import { ENTRY_KINDS } from "@/lib/validation/entries";

export type Category = { id: string; name: string };

export const MAX_CATEGORY_NAME_LENGTH = 60;
export const MAX_CATEGORIES_PER_ENTRY = 100;
/** Library search parameter holding selected category ids (comma separated). */
export const CATEGORY_PARAM = "categories";

const hasControlCharacters = (value: string) => [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

export const categoryNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a category name.")
  .max(MAX_CATEGORY_NAME_LENGTH, `Category names can be at most ${MAX_CATEGORY_NAME_LENGTH} characters.`)
  .refine((value) => !hasControlCharacters(value), "Category names cannot contain line breaks.");

export const categoryInputSchema = z.object({ name: categoryNameSchema }).strict();
export const categoryCreateSchema = categoryInputSchema.extend({ kind: z.enum(ENTRY_KINDS) });

export const entryCategoriesSchema = z
  .object({ categoryIds: z.array(z.uuid()).max(MAX_CATEGORIES_PER_ENTRY, `An entry can have at most ${MAX_CATEGORIES_PER_ENTRY} categories.`) })
  .strict();

/** Case-insensitive identity of a name; the database enforces the same per account. */
export const categoryKey = (name: string) => name.trim().toLocaleLowerCase();

export function sortCategories<T extends Category>(categories: readonly T[]): T[] {
  return [...categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
}

/** Distinct, well-formed category ids from a search parameter or form values. */
export function parseCategoryIds(value: unknown): string[] {
  const raw = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  const ids = raw.filter((id): id is string => typeof id === "string" && z.uuid().safeParse(id.trim()).success).map((id) => id.trim());
  return [...new Set(ids)].slice(0, MAX_CATEGORIES_PER_ENTRY);
}
