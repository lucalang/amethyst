import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { loadTemplate } from "@/lib/data/templates";
import { requireUser } from "@/lib/supabase/auth";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Edit template · Settings" };

export default async function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const template = await loadTemplate(ctx, id);
  if (!template) notFound();
  return <TemplateEditor key={template.id} template={template} />;
}
