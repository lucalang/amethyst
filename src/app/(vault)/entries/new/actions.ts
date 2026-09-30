"use server";

import { redirect } from "next/navigation";
import { allowedImageHosts } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";
import { newEntrySchema, starterFilesFor } from "@/lib/validation/entries";

export type NewEntryState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export async function createEntry(_prev: NewEntryState, formData: FormData): Promise<NewEntryState> {
  const ctx = await requireUser();
  const values = Object.fromEntries(
    ["kind", "title", "platform", "coverUrl", "bannerUrl"].map((key) => [key, String(formData.get(key) ?? "")]),
  );
  const parsed = newEntrySchema(allowedImageHosts()).safeParse({
    kind: formData.get("kind"),
    title: formData.get("title"),
    platform: formData.get("platform") || undefined,
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
      platform: input.kind === "game" ? input.platform : null,
    })
    .select("id")
    .single();
  if (error || !entry) return { status: "error", message: "Could not create the entry.", values };

  const { error: filesError } = await ctx.supabase.from("workspace_nodes").insert(
    starterFilesFor(input.kind).map((file) => ({ entry_id: entry.id, parent_id: null, kind: file.kind, name: file.name, content: file.content ?? "" })),
  );
  if (filesError) {
    await ctx.supabase.from("entries").delete().eq("id", entry.id);
    return { status: "error", message: "Could not create the workspace files.", values };
  }

  redirect(`/entries/${entry.id}`);
}
