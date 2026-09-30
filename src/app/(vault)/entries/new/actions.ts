"use server";

import { redirect } from "next/navigation";
import { allowedImageHosts } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";
import { defaultTabsFor, newEntrySchema } from "@/lib/validation/entries";

export type NewEntryState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export async function createEntry(_prev: NewEntryState, formData: FormData): Promise<NewEntryState> {
  const ctx = await requireUser();
  const values = Object.fromEntries(
    ["kind", "title", "platform", "coverUrl", "bannerUrl", "notes"].map((key) => [key, String(formData.get(key) ?? "")]),
  );
  const parsed = newEntrySchema(allowedImageHosts()).safeParse({
    kind: formData.get("kind"),
    title: formData.get("title"),
    platform: formData.get("platform") || undefined,
    coverUrl: formData.get("coverUrl") || undefined,
    bannerUrl: formData.get("bannerUrl") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", message: "Check the highlighted fields.", fieldErrors, values };
  }
  const input = parsed.data;

  const { data: entry, error } = await ctx.supabase
    .from("entries")
    .insert({ kind: input.kind, title: input.title, cover_url: input.coverUrl, banner_url: input.bannerUrl, notes: input.notes })
    .select("id")
    .single();
  if (error || !entry) return { status: "error", message: "Could not create the entry.", values };

  const { error: tabsError } = await ctx.supabase
    .from("custom_games")
    .insert({ entry_id: entry.id, platform: input.platform, tabs: defaultTabsFor(input.kind, () => crypto.randomUUID()) });
  if (tabsError) {
    await ctx.supabase.from("entries").delete().eq("id", entry.id);
    return { status: "error", message: "Could not create the entry's tabs.", values };
  }

  redirect(`/entries/${entry.id}`);
}
