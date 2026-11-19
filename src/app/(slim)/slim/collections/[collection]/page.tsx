import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { CollectionActions } from "@/components/categories/collection-actions";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { SlimLibrary } from "@/components/slim/slim-library";
import { Button } from "@/components/ui/button";
import { collectionPath } from "@/lib/collections";
import { loadCategories } from "@/lib/data/categories";
import { loadCollection } from "@/lib/data/collections";
import { loadLibrary } from "@/lib/data/library";
import { SLIM_BASE } from "@/lib/edition";
import { requireUser } from "@/lib/supabase/auth";

type Props = { params: Promise<{ collection: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = await loadCollection(await requireUser(), (await params).collection);
  return { title: collection?.name ?? "Not found" };
}

/** A collection in the Slim edition: the same library data as the full app, without showcases or films. */
export default async function SlimCollectionPage({ params }: Props) {
  const { collection: param } = await params;
  const ctx = await requireUser();
  const collection = await loadCollection(ctx, param);
  if (!collection) notFound();
  const path = `${SLIM_BASE}${collectionPath(collection)}`;
  if (param !== collection.slug) redirect(path);
  const [library, categories] = await Promise.all([loadLibrary(ctx, collection.id), loadCategories(ctx, collection.id)]);

  return (
    <div className="slim-page grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl border border-border text-amethyst">
            <CollectionIcon icon={collection.icon} className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight break-words">{collection.name}</h1>
            {collection.description ? <p className="mt-0.5 max-w-[68ch] text-sm whitespace-pre-line text-muted-foreground">{collection.description}</p> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild className="h-9 px-3.5">
            <Link href={`${path}/new`}>
              <Plus aria-hidden /> New entry
            </Link>
          </Button>
          <CollectionActions collection={collection} entryCount={library.length} className="size-9" />
        </div>
      </header>
      <SlimLibrary entries={library} categories={categories} />
    </div>
  );
}
