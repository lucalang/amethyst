import { z } from "zod";
import { MAX_NOTE_LENGTH, nodeNameSchema } from "@/lib/validation/workspace";

// Matches the checks on public.quick_notes.
export const MAX_QUICK_NOTES = 1000;
export const MAX_QUICK_CAPTURE_LENGTH = 20_000;

export type QuickNoteSummary = { id: string; name: string; snippet: string; updatedAt: string };

const content = z.string().max(MAX_NOTE_LENGTH, `Notes can be at most ${MAX_NOTE_LENGTH.toLocaleString("en")} characters.`);

export const createQuickNoteSchema = z
  .object({ name: nodeNameSchema.optional(), content: content.optional() })
  .strict();

export const updateQuickNoteSchema = z
  .object({ name: nodeNameSchema.optional(), content: content.optional(), expectedVersion: z.number().int().positive().optional() })
  .strict()
  .refine((value) => value.name !== undefined || value.content !== undefined, "Nothing to update.");

/** A name from the first non-empty line, without Markdown heading/list markers. */
export function nameFromContent(text: string): string {
  const line = text.split("\n").map((part) => part.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|>\s+)/, "").trim()).find(Boolean) ?? "";
  const clean = line.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 79).trimEnd()}…` : clean || "Quick note";
}

/** First line after the name line, for list previews. */
export function snippetFromContent(text: string): string {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  return (lines[1] ?? "").slice(0, 140);
}
