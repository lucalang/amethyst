import { z } from "zod";
import { categoryNameSchema } from "@/lib/categories";

/** A user-created top-level collection (internally still called a category in places). */
export type LibraryCategory = { id: string; name: string; description?: string };

export const MAX_COLLECTION_DESCRIPTION_LENGTH = 1000;

const hasDisallowedControls = (value: string) =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return (code < 32 && char !== "\n" && char !== "\t") || code === 127;
  });

/** Multiline, optional; normalized so trailing whitespace and runs of blank lines never create gaps. */
export const collectionDescriptionSchema = z
  .string()
  .transform((value) => value.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim())
  .pipe(
    z
      .string()
      .max(MAX_COLLECTION_DESCRIPTION_LENGTH, `Descriptions can be at most ${MAX_COLLECTION_DESCRIPTION_LENGTH} characters.`)
      .refine((value) => !hasDisallowedControls(value), "Descriptions cannot contain control characters."),
  );

export const collectionInputSchema = z.object({ name: categoryNameSchema, description: collectionDescriptionSchema.optional() }).strict();

export function isLegacyCollection(value: string): boolean {
  return ["anime", "games", "other"].includes(value);
}

export function entryPath(entry: { id: string; collection_id?: string; kind?: string }): string {
  return entry.collection_id ? `/${entry.collection_id}/${entry.id}` : `/entries/${entry.id}`;
}
