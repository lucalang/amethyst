import type { Metadata } from "next";
import { loadCollections } from "@/lib/data/collections";
import { loadTemplates } from "@/lib/data/templates";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsHeader } from "../settings-ui";
import { NewTemplateButton, TemplateList } from "./templates-manager";

export const metadata: Metadata = { title: "Templates · Settings" };

export default async function TemplatesSettingsPage() {
  const ctx = await requireUser();
  const [templates, collections] = await Promise.all([loadTemplates(ctx), loadCollections(ctx)]);
  const defaults: Record<string, string[]> = {};
  for (const collection of collections) {
    if (collection.default_template_id) (defaults[collection.default_template_id] ??= []).push(collection.name);
  }

  return (
    <>
      <SettingsHeader
        title="Templates"
        description="Starter workspaces with folders, notes and checklists. Pick one when you add an entry, or make it a collection’s default. Entries get their own copy, so editing a template never changes existing entries."
        actions={<NewTemplateButton />}
      />
      <TemplateList templates={templates} defaults={defaults} />
    </>
  );
}
