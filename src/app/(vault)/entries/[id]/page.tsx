import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CustomEntryView } from "@/components/media/custom-entry-view";
import { loadCustomEntry } from "@/lib/data/custom-entry";
import { allowedImageHosts } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Entry" };

export default async function CustomEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await requireUser();
  const data = await loadCustomEntry(ctx, id);
  if (!data) notFound();
  return <CustomEntryView key={data.entry.id} data={data} imageHosts={allowedImageHosts()} />;
}
