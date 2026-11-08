"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { AVATAR_DECORATION_IDS, MAX_PROFILE_BADGES, PROFILE_BADGE_IDS, PROFILE_TITLE_IDS } from "@/lib/cosmetics";
import { MAX_SHOWCASE_ACHIEVEMENTS, MAX_SHOWCASE_ITEMS, PROFILE_AMBIENT_IDS, PROFILE_SECTION_IDS, PROFILE_STYLE_IDS, pedestalCollectible, type ProfileStyleId } from "@/lib/profile-styles";
import { DEFAULT_PROFILE_BANNER, PROFILE_BANNER_IDS, PROFILE_FRAME_IDS } from "@/lib/profile-cosmetics";
import { requireAccount as requireUser } from "@/lib/supabase/auth";

export type ShowcaseSaveState = { status: "idle" | "success" | "error"; message?: string; look?: string | null };

const unique = (values: readonly string[]) => new Set(values).size === values.length;
const lookName = z.string().trim().min(1, "Give your look a name.").max(40, "Keep look names to 40 characters.");

const showcaseSchema = z.object({
  style: z.enum(PROFILE_STYLE_IDS as [ProfileStyleId, ...ProfileStyleId[]]),
  sections: z.array(z.enum(PROFILE_SECTION_IDS)).max(PROFILE_SECTION_IDS.length).refine(unique, "Each section can only appear once."),
  ambient: z.enum(PROFILE_AMBIENT_IDS),
  pedestal: z.string().max(80).refine((id) => pedestalCollectible(id) !== null, "That collectible can’t stand on the pedestal.").nullable(),
  banner: z.enum(PROFILE_BANNER_IDS),
  frame: z.enum(PROFILE_FRAME_IDS).nullable(),
  achievements: z
    .array(z.enum(ACHIEVEMENTS.map((item) => item.id) as [string, ...string[]]))
    .max(MAX_SHOWCASE_ACHIEVEMENTS, `Pin up to ${MAX_SHOWCASE_ACHIEVEMENTS} achievements.`)
    .refine(unique, "Each achievement can only be pinned once."),
  items: z
    .array(z.object({ kind: z.enum(["entry", "collection"]), id: z.uuid(), showTitle: z.boolean() }).strict())
    .max(MAX_SHOWCASE_ITEMS, `Feature up to ${MAX_SHOWCASE_ITEMS} Archive items.`)
    .refine((items) => unique(items.map((item) => `${item.kind}:${item.id}`)), "Each item can only be featured once."),
  badges: z
    .array(z.enum(PROFILE_BADGE_IDS))
    .max(MAX_PROFILE_BADGES, `You can wear up to ${MAX_PROFILE_BADGES} badges.`)
    .refine(unique, "Each badge can only be worn once."),
  title: z.enum(PROFILE_TITLE_IDS).nullable(),
  decoration: z.enum(AVATAR_DECORATION_IDS).nullable(),
  /** Which saved look this becomes: update `id` (null = none), or create one named `create`. */
  look: z.union([z.object({ id: z.uuid().nullable() }).strict(), z.object({ create: lookName }).strict()]),
}).strict();

export type ShowcaseInput = z.input<typeof showcaseSchema>;
type Ctx = Awaited<ReturnType<typeof requireUser>>;

function readable(error: { code?: string; hint?: string | null; message: string }, fallback: string): ShowcaseSaveState {
  const known = error.code === "22023" && error.hint?.startsWith("showcase_");
  return { status: "error", message: known ? error.message : fallback };
}

async function persist(ctx: Ctx, input: ShowcaseInput): Promise<ShowcaseSaveState> {
  const parsed = showcaseSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your showcase." };
  const data = parsed.data;

  const profile = await ctx.supabase.from("users").update({ avatar_decoration: data.decoration, profile_title: data.title }).eq("id", ctx.userId);
  const badges = profile.error ? null : await ctx.supabase.rpc("set_profile_badges", { p_badges: data.badges });
  if (profile.error?.hint === "cosmetic_not_owned" || badges?.error?.hint === "cosmetic_not_owned") {
    return { status: "error", message: "One of those collectibles isn’t in your collection yet." };
  }
  if (profile.error || badges?.error) return { status: "error", message: "Could not save your showcase." };

  const showcase = await ctx.supabase.rpc("save_profile_showcase", {
    p_style: data.style,
    p_sections: data.sections,
    p_ambient: data.ambient,
    p_pedestal: data.pedestal,
    p_banner: data.banner === DEFAULT_PROFILE_BANNER ? null : data.banner,
    p_frame: data.frame,
    p_achievements: data.achievements,
    p_items: data.items,
    p_look: "id" in data.look ? data.look.id : null,
    p_new_look: "create" in data.look ? data.look.create : null,
  });
  if (showcase.error) return readable(showcase.error, "Could not save your showcase.");
  return { status: "success", message: "Showcase saved.", look: showcase.data ?? null };
}

/** Saves the signed-in member's own showcase. Ownership, earned pins and item access are re-checked by the database. */
export async function saveShowcase(input: ShowcaseInput): Promise<ShowcaseSaveState> {
  const ctx = await requireUser();
  const result = await persist(ctx, input);
  if (result.status === "success") revalidatePath("/", "layout");
  return result;
}

export async function renameLook(id: string, name: string): Promise<ShowcaseSaveState> {
  const ctx = await requireUser();
  const parsed = z.object({ id: z.uuid(), name: lookName }).safeParse({ id, name });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the name." };
  const { error } = await ctx.supabase.rpc("rename_profile_look", { p_look: parsed.data.id, p_name: parsed.data.name });
  if (error) return readable(error, "Could not rename the look.");
  revalidatePath("/", "layout");
  return { status: "success", message: "Look renamed." };
}

/** Deletes a saved look. Deleting the worn look needs `replacement`: the showcase to wear instead (another look or the default). */
export async function deleteLook(id: string, replacement: ShowcaseInput | null): Promise<ShowcaseSaveState> {
  const ctx = await requireUser();
  if (!z.uuid().safeParse(id).success) return { status: "error", message: "That look no longer exists." };
  if (replacement) {
    if ("id" in replacement.look && replacement.look.id === id) return { status: "error", message: "Choose a different look to wear." };
    const worn = await persist(ctx, replacement);
    if (worn.status === "error") return worn;
  }
  const { error } = await ctx.supabase.rpc("delete_profile_look", { p_look: id });
  revalidatePath("/", "layout");
  if (error) return readable(error, "Could not delete the look.");
  return { status: "success", message: "Look deleted." };
}
