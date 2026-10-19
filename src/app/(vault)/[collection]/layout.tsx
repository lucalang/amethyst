import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isLegacyCollection } from "@/lib/collections";

// Validates the collection before any loading boundary streams, so unknown
// paths such as /sync answer with a real 404 status instead of a soft 404.
export default async function CollectionLayout({ children, params }: { children: ReactNode; params: Promise<{ collection: string }> }) {
  const { collection } = await params;
  if (!z.uuid().safeParse(collection).success && !isLegacyCollection(collection)) notFound();
  return children;
}
