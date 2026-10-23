import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { collectionPath } from "@/lib/collections";
import { loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";

// Old /<collection id>/new links now live at /collections/<slug>/new.
export default async function LegacyNewEntryPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection: param } = await params;
  const collections = await loadCollections(await requireUser());
  const isId = z.uuid().safeParse(param).success;
  const collection = collections.find((item) => (isId ? item.id === param : item.legacy_slug === param));
  if (!collection) {
    if (!isId) redirect("/");
    notFound();
  }
  redirect(`${collectionPath(collection)}/new`);
}
