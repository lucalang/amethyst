"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { parseCategoryIds } from "@/lib/categories";
import { entryPath } from "@/lib/collections";
import { loadCollection } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";
import { NO_TEMPLATE } from "@/lib/templates";
import { newEntrySchema } from "@/lib/validation/entries";

export type NewEntryState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export async function createEntry(_prev: NewEntryState, formData: FormData): Promise<NewEntryState> {
  const ctx = await requireUser();
  const values = Object.fromEntries(["title", "coverUrl", "bannerUrl", "progressLabel", "templateId"].map((key) => [key, String(formData.get(key) ?? "")]));
  const collection = await loadCollection(ctx, String(formData.get("collection") ?? ""));
  if (!collection) return { status: "error", message: "Collection not found.", values };

  const templateId = values.templateId && values.templateId !== NO_TEMPLATE ? values.templateId : null;
  if (templateId && !z.uuid().safeParse(templateId).success) {
    return { status: "error", message: "Choose a template from the list.", fieldErrors: { templateId: "Choose a template from the list." }, values };
  }

  const parsed = newEntrySchema.safeParse({
    collectionId: collection.id,
    title: formData.get("title"),
    coverUrl: formData.get("coverUrl") || undefined,
    coverShape: formData.get("coverShape") || undefined,
    bannerUrl: formData.get("bannerUrl") || undefined,
    progressLabel: values.progressLabel,
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
      progress_label: input.progressLabel,
    })
    .select("id, collection_id")
    .single();
  if (error || !entry) return { status: "error", message: "Could not create the entry.", values };

  const categoryIds = parseCategoryIds(formData.getAll("categoryIds"));
  if (categoryIds.length) {
    const { error: categoriesError } = await ctx.supabase.rpc("set_entry_categories", { p_entry_id: entry.id, p_category_ids: categoryIds });
    if (categoriesError) {
      await ctx.supabase.from("entries").delete().eq("id", entry.id);
      return { status: "error", message: "A selected label no longer exists. Check the labels and try again.", values };
    }
  }

  if (templateId) {
    // Atomic on the database side: either every template item is copied or none is.
    const { error: templateError } = await ctx.supabase.rpc("apply_workspace_template", { p_entry_id: entry.id, p_template_id: templateId });
    if (templateError) {
      const { error: cleanupError } = await ctx.supabase.from("entries").delete().eq("id", entry.id);
      const reason = templateError.code === "22023" ? templateError.message : "Something went wrong while copying its files.";
      return {
        status: "error",
        message: cleanupError
          ? `The template couldn’t be applied (${reason}) and the new entry couldn’t be removed. Open it from the collection and add files yourself, or delete it and try again.`
          : `The template couldn’t be applied: ${reason} The entry was not created, so you can try again or pick “No template”.`,
        fieldErrors: { templateId: reason },
        values,
      };
    }
  }

  redirect(entryPath(entry));
}
