import { z } from "zod";
import { isAllowedImageUrl } from "./image-hosts";

export const TAB_TYPES = ["markdown", "checklist"] as const;

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
      notes: z.string().max(50_000).optional(),
      coverUrl: artworkUrl(hosts).nullable().optional(),
      bannerUrl: artworkUrl(hosts).nullable().optional(),
      platform: z.string().trim().max(80).nullable().optional(),
      expectedVersion: z.number().int().positive().optional(),
    })
    .strict();
}

export function newEntrySchema(hosts: readonly string[]) {
  return z.object({
    kind: z.enum(["game", "custom"]),
    title: z.string().trim().min(1, "Title is required.").max(300),
    platform: z.string().trim().max(80).optional().transform((value) => value || null),
    coverUrl: artworkUrl(hosts).optional().transform((value) => value ?? null),
    bannerUrl: artworkUrl(hosts).optional().transform((value) => value ?? null),
    notes: z.string().max(50_000).optional().transform((value) => value ?? ""),
  });
}

export const customTabSchema = z.discriminatedUnion("type", [
  z.object({ id: z.uuid(), title: z.string().trim().min(1).max(60), type: z.literal("markdown"), content: z.string().max(100_000) }),
  z.object({ id: z.uuid(), title: z.string().trim().min(1).max(60), type: z.literal("checklist") }),
]);
export const customTabsSchema = z
  .array(customTabSchema)
  .max(20)
  .refine((tabs) => new Set(tabs.map((tab) => tab.id)).size === tabs.length, "Tab ids must be unique.");
export type CustomTab = z.infer<typeof customTabSchema>;

export function defaultTabsFor(kind: "game" | "custom", uuid: () => string): CustomTab[] {
  if (kind === "game") {
    return [
      { id: uuid(), title: "Tier List", type: "markdown", content: "## S\n\n## A\n\n## B\n" },
      { id: uuid(), title: "Codes", type: "markdown", content: "" },
      { id: uuid(), title: "Guides", type: "markdown", content: "" },
      { id: uuid(), title: "Checklist", type: "checklist" },
    ];
  }
  return [
    { id: uuid(), title: "Notes", type: "markdown", content: "" },
    { id: uuid(), title: "Checklist", type: "checklist" },
  ];
}
