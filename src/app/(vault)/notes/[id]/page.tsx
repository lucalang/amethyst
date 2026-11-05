import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuickNoteWorkspace } from "@/components/notes/quick-note-actions";
import { loadQuickNote } from "@/lib/data/quick-notes";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Quick Notes" };

export default async function QuickNotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const detail = await loadQuickNote(ctx, id);
  if (!detail) notFound();
  return <QuickNoteWorkspace key={detail.node.id} detail={detail} />;
}
