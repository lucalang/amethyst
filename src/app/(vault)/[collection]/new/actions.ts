"use server";

import { redirect } from "next/navigation";
import { parseCategoryIds } from "@/lib/categories";
import { COLLECTIONS, entryPath, isCollectionSlug } from "@/lib/collections";
import { requireUser } from "@/lib/supabase/auth";
import { newEntrySchema } from "@/lib/validation/entries";

export type NewEntryState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export async function createEntry(_prev: NewEntryState, formData: FormData): Promise<NewEntryState> {
  const ctx = await requireUser();
  const values = Object.fromEntries(["title", "coverUrl", "bannerUrl"].map((key) => [key, String(formData.get(key) ?? "")]));
  const slug = String(formData.get("collection") ?? "");
  if (!isCollectionSlug(slug)) return { status: "error", message: "Unknown collection.", values };
  const kind = COLLECTIONS[slug].kind;

  const parsed = newEntrySchema.safeParse({
    kind,
    title: formData.get("title"),
    coverUrl: formData.get("coverUrl") || undefined,
    bannerUrl: formData.get("bannerUrl") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", message: "Check the highlighted fields.", fieldErrors, values };
  }
  const input = parsed.data;

  const { data: entry, error } = await ctx.supabase
    .from("entries")
    .insert({
      kind: input.kind,
      title: input.title,
      cover_url: input.coverUrl,
      banner_url: input.bannerUrl,
    })
    .select("id, kind")
    .single();
  if (error || !entry) return { status: "error", message: "Could not create the entry.", values };

  const categoryIds = parseCategoryIds(formData.getAll("categoryIds"));
  if (categoryIds.length) {
    const { error: categoriesError } = await ctx.supabase.rpc("set_entry_categories", { p_entry_id: entry.id, p_category_ids: categoryIds });
    if (categoriesError) {
      await ctx.supabase.from("entries").delete().eq("id", entry.id);
      return { status: "error", message: "A selected category no longer exists. Check the categories and try again.", values };
    }
  }

  redirect(entryPath(entry));
}
