import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { COLLECTIONS, isCollectionSlug } from "@/lib/collections";
import { requireUser } from "@/lib/supabase/auth";
import { NewEntryForm } from "./new-entry-form";

type Props = { params: Promise<{ collection: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection } = await params;
  return { title: isCollectionSlug(collection) ? COLLECTIONS[collection].newLabel : "Not found" };
}

export default async function NewEntryPage({ params }: Props) {
  const { collection: slug } = await params;
  if (!isCollectionSlug(slug)) notFound();
  await requireUser();
  const collection = COLLECTIONS[slug];
  return (
    <PageContainer>
      <PageHeader
        title={collection.newLabel}
        description="A name is all it needs. Artwork is optional, and everything else lives in its workspace of folders, notes and checklists."
      />
      <NewEntryForm collection={collection} />
    </PageContainer>
  );
}
