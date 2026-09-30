import { z } from "zod";
import { isAllowedImageUrl } from "./image-hosts";

export const ENTRY_KINDS = ["anime", "game", "custom"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  anime: "Anime",
  game: "Game",
  custom: "Custom",
};

export function artworkUrl(hosts: readonly string[]) {
  return z
    .string()
    .trim()
    .max(2048)
    .refine((value) => value === "" || isAllowedImageUrl(value, hosts), {
      message: `Use an https image URL from an allowed host (${hosts.slice(0, 4).join(", ")}, …).`,
    })
    .transform((value) => (value === "" ? null : value));
}

export function entryPatchSchema(hosts: readonly string[]) {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required.").max(300).optional(),
      coverUrl: artworkUrl(hosts).nullable().optional(),
      bannerUrl: artworkUrl(hosts).nullable().optional(),
      platform: z.string().trim().max(80).nullable().optional(),
      expectedVersion: z.number().int().positive().optional(),
    })
    .strict();
}

export function newEntrySchema(hosts: readonly string[]) {
  return z.object({
    kind: z.enum(ENTRY_KINDS),
    title: z.string().trim().min(1, "Title is required.").max(300),
    platform: z.string().trim().max(80).optional().transform((value) => value || null),
    coverUrl: artworkUrl(hosts).optional().transform((value) => value ?? null),
    bannerUrl: artworkUrl(hosts).optional().transform((value) => value ?? null),
  });
}

export type StarterFile = { kind: "folder" | "note" | "checklist"; name: string; content?: string };

/** Starter files for a new workspace; users can rename, move or delete them. */
export function starterFilesFor(kind: EntryKind): StarterFile[] {
  switch (kind) {
    case "anime":
      return [
        { kind: "note", name: "Notes" },
        { kind: "checklist", name: "Arcs" },
      ];
    case "game":
      return [
        { kind: "note", name: "Tier List", content: "## S\n\n## A\n\n## B\n" },
        { kind: "note", name: "Codes" },
        { kind: "note", name: "Guides" },
        { kind: "checklist", name: "Checklist" },
      ];
    default:
      return [
        { kind: "note", name: "Notes" },
        { kind: "checklist", name: "Checklist" },
      ];
  }
}
