import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { resolveEntry } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

// Resolves the entry before the page streams, so unknown addresses answer with a real 404.
export default async function SlimEntryLayout({ children, params }: { children: ReactNode; params: Promise<{ entry: string }> }) {
  const { entry } = await params;
  if (!(await resolveEntry(await requireUser(), entry))) notFound();
  return children;
}
