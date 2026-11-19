import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { NewEntryForm } from "@/app/(vault)/collections/[collection]/new/new-entry-form";
import { collectionPath } from "@/lib/collections";
import { loadCategories } from "@/lib/data/categories";
import { loadCollection } from "@/lib/data/collections";
import { loadTemplates } from "@/lib/data/templates";
import { SLIM_BASE } from "@/lib/edition";
import { requireUser } from "@/lib/supabase/auth";

type Props = { params: Promise<{ collection: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = await loadCollection(await requireUser(), (await params).collection);
  return { title: collection ? `New entry in ${collection.name}` : "Not found" };
}

/** The full app's new-entry form; created entries open in Slim. */
export default async function SlimNewEntryPage({ params }: Props) {
  const { collection: param } = await params;
  const ctx = await requireUser();
  const collection = await loadCollection(ctx, param);
  if (!collection) notFound();
  if (param !== collection.slug) redirect(`${SLIM_BASE}${collectionPath(collection)}/new`);
  const [categories, templates, profileResult] = await Promise.all([
    loadCategories(ctx, collection.id),
    loadTemplates(ctx),
    ctx.supabase.from("users").select("preferred_cover_shape").eq("id", ctx.userId).single(),
  ]);
  if (profileResult.error) throw new Error("Could not load your cover shape preference.");
  return (
    <div className="slim-page grid gap-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">New entry in {collection.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">A name is all it needs. Artwork is optional, and the workspace can start empty or from one of your templates.</p>
      </header>
      <NewEntryForm collection={collection} categories={categories} templates={templates} defaultCoverShape={profileResult.data.preferred_cover_shape} />
    </div>
  );
}
