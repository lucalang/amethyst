import { z } from "zod";

/** Wording used for aggregate progress when an entry has no custom name. */
export const DEFAULT_PROGRESS_LABEL = "tasks";
export const MAX_PROGRESS_LABEL_LENGTH = 40;

/** Optional custom progress name; blank means "use the default wording". */
export const progressLabelSchema = z
  .string()
  .trim()
  .max(MAX_PROGRESS_LABEL_LENGTH, `Progress names can be at most ${MAX_PROGRESS_LABEL_LENGTH} characters.`)
  .refine((value) => ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127), "Progress names cannot contain control characters.")
  .transform((value) => value || null);

export function progressLabel(custom: string | null | undefined): string {
  return custom?.trim() || DEFAULT_PROGRESS_LABEL;
}
