import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { loadCollection } from "@/lib/data/collections";
import { isLegacyCollection } from "@/lib/collections";
import { loadCategories } from "@/lib/data/categories";
import { requireUser } from "@/lib/supabase/auth";
import { NewEntryForm } from "./new-entry-form";

type Props = { params: Promise<{ collection: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = await loadCollection(await requireUser(), (await params).collection);
  return { title: collection ? `New entry in ${collection.name}` : "Not found" };
}

export default async function NewEntryPage({ params }: Props) {
  const { collection: slug } = await params;
  const ctx = await requireUser();
  const collection = await loadCollection(ctx, slug);
  if (!collection) {
    if (isLegacyCollection(slug)) redirect("/");
    notFound();
  }
  if (slug !== collection.id) redirect(`/${collection.id}/new`);
  const categories = await loadCategories(ctx, collection.id);
  const { data: profile, error } = await ctx.supabase.from("users").select("preferred_cover_shape").eq("id", ctx.userId).single();
  if (error) throw new Error("Could not load your cover shape preference.");
  return (
    <PageContainer>
      <PageHeader
        title={`New entry in ${collection.name}`}
        description="A name is all it needs. Artwork is optional, and the workspace starts empty for your own folders, notes and checklists."
      />
      <NewEntryForm collection={collection} categories={categories} defaultCoverShape={profile.preferred_cover_shape} />
    </PageContainer>
  );
}
