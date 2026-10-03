import { z } from "zod";
import { isUploadedImagePath } from "@/lib/attachments";
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
    bannerUrl: artworkUrl.nullable().optional(),
    platform: z.string().trim().max(80).nullable().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();

export const newEntrySchema = z.object({
  kind: z.enum(ENTRY_KINDS),
  title: z.string().trim().min(1, "Title is required.").max(300),
  platform: z.string().trim().max(80).optional().transform((value) => value || null),
  coverUrl: artworkUrl.optional().transform((value) => value ?? null),
  bannerUrl: artworkUrl.optional().transform((value) => value ?? null),
});
