import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { resolveEntry } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

// Resolves the entry before the loading boundary streams, so unknown addresses
// answer with a real 404 status instead of a soft 404.
export default async function EntryLayout({ children, params }: { children: ReactNode; params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  if (!(await resolveEntry(await requireUser(), entry))) notFound();
  return children;
}
