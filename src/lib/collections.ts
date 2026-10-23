import { z } from "zod";
import { categoryNameSchema } from "@/lib/categories";
import { ICON_NAME_PATTERN } from "@/lib/collection-identity";
import { progressLabelSchema } from "@/lib/progress/label";
import { artworkUrl } from "@/lib/validation/entries";

/** A user-created top-level collection (internally still called a category in places). */
export type LibraryCategory = {
  id: string;
  name: string;
  /** Readable URL segment, unique per account; assigned by the database. */
  slug?: string;
  description?: string;
  /** Lucide icon name; null keeps the default library icon. */
  icon?: string | null;
  accent_color?: string | null;
  banner_url?: string | null;
  /** Default progress name copied into new entries. */
  progress_label?: string | null;
  default_template_id?: string | null;
};

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

export const collectionInputSchema = z
  .object({
    name: categoryNameSchema,
    description: collectionDescriptionSchema.optional(),
    icon: z.string().max(64).regex(ICON_NAME_PATTERN, "Choose an icon from the list.").nullable().optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #a57cff.")
      .transform((value) => value.toLowerCase())
      .nullable()
      .optional(),
    bannerUrl: artworkUrl.nullable().optional(),
    progressLabel: progressLabelSchema.nullable().optional(),
    defaultTemplateId: z.uuid().nullable().optional(),
  })
  .strict();
export type CollectionInput = z.input<typeof collectionInputSchema>;

/** Columns every collection read needs for names, identity and entry defaults. */
export const COLLECTION_COLUMNS = "id, name, slug, description, icon, accent_color, banner_url, progress_label, default_template_id";

/** API input → table columns (only the keys that were sent). */
export function collectionColumns(input: z.output<typeof collectionInputSchema>) {
  return {
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.accentColor !== undefined ? { accent_color: input.accentColor } : {}),
    ...(input.bannerUrl !== undefined ? { banner_url: input.bannerUrl } : {}),
    ...(input.progressLabel !== undefined ? { progress_label: input.progressLabel } : {}),
    ...(input.defaultTemplateId !== undefined ? { default_template_id: input.defaultTemplateId } : {}),
  };
}

export function isLegacyCollection(value: string): boolean {
  return ["anime", "games", "other"].includes(value);
}

/** Readable URL of a collection; falls back to the id (which redirects) when no slug was loaded. */
export function collectionPath(collection: { id: string; slug?: string | null }): string {
  return `/collections/${encodeURIComponent(collection.slug || collection.id)}`;
}

/** Readable URL of an entry; falls back to the id (which redirects) when no slug was loaded. */
export function entryPath(entry: { id: string; slug?: string | null }): string {
  return `/entries/${encodeURIComponent(entry.slug || entry.id)}`;
}
