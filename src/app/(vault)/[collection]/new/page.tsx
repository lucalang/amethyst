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
      <div className="enter">
        <PageHeader
          title={collection.newLabel}
          description={`Give it a name and artwork. Everything else lives in its own workspace of folders, notes and checklists.`}
        />
      </div>
      <div className="enter" style={{ "--enter-index": 1 } as React.CSSProperties}>
        <NewEntryForm collection={collection} />
      </div>
    </PageContainer>
  );
}
