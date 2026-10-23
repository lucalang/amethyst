import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { loadCollection } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

// Resolves the collection before any loading boundary streams, so unknown
// addresses answer with a real 404 status instead of a soft 404.
export default async function CollectionLayout({ children, params }: { children: ReactNode; params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!(await loadCollection(await requireUser(), collection))) notFound();
  return children;
}
