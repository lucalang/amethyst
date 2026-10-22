"use server";

import { redirect } from "next/navigation";
import { parseCategoryIds } from "@/lib/categories";
import { entryPath } from "@/lib/collections";
import { loadCollection } from "@/lib/data/collections";
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
  const collection = await loadCollection(ctx, String(formData.get("collection") ?? ""));
  if (!collection) return { status: "error", message: "Category not found.", values };

  const parsed = newEntrySchema.safeParse({
    collectionId: collection.id,
    title: formData.get("title"),
    coverUrl: formData.get("coverUrl") || undefined,
    coverShape: formData.get("coverShape") || undefined,
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
      collection_id: input.collectionId,
      title: input.title,
      cover_url: input.coverUrl,
      cover_shape: input.coverShape,
      banner_url: input.bannerUrl,
    })
    .select("id, collection_id")
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
