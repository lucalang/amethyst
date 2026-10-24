import { z } from "zod";
import { isUploadedImagePath } from "@/lib/attachments";
import { COVER_SHAPES } from "@/lib/cover-shape";
import { ARTWORK_FRAME_IDS } from "@/lib/frames";
import { progressLabelSchema } from "@/lib/progress/label";
import { IMAGE_URL_MESSAGES, checkImageUrl } from "./image-url";

export const ENTRY_KINDS = ["anime", "game", "custom"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  anime: "Anime",
  game: "Game",
  custom: "Custom",
};

export const artworkUrl = z
  .string()
  .trim()
  .max(2048, "Image addresses can be at most 2048 characters.")
  .superRefine((value, ctx) => {
    if (value === "" || isUploadedImagePath(value)) return;
    const checked = checkImageUrl(value);
    if (!checked.ok) ctx.addIssue({ code: "custom", message: IMAGE_URL_MESSAGES[checked.problem] });
  })
  .transform((value) => (value === "" ? null : value));

export const entryPatchSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(300).optional(),
    coverUrl: artworkUrl.nullable().optional(),
    coverShape: z.enum(COVER_SHAPES).optional(),
    bannerUrl: artworkUrl.nullable().optional(),
    progressLabel: progressLabelSchema.nullable().optional(),
    platform: z.string().trim().max(80).nullable().optional(),
    /** null follows the account default frame; "none" keeps this entry unframed. */
    frame: z.enum(ARTWORK_FRAME_IDS).nullable().optional(),
    collectionId: z.uuid().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

export const newEntrySchema = z.object({
  collectionId: z.uuid(),
  title: z.string().trim().min(1, "Title is required.").max(300),
  platform: z.string().trim().max(80).optional().transform((value) => value || null),
  coverUrl: artworkUrl.optional().transform((value) => value ?? null),
  coverShape: z.enum(COVER_SHAPES).default("portrait"),
  bannerUrl: artworkUrl.optional().transform((value) => value ?? null),
  progressLabel: progressLabelSchema.optional().transform((value) => value ?? null),
  /** The picker's "default" (or nothing) means inherit the account frame. */
  frame: z
    .enum(["default", ...ARTWORK_FRAME_IDS])
    .optional()
    .transform((value) => (!value || value === "default" ? null : value)),
});
