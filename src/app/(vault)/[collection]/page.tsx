import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CollectionActions } from "@/components/categories/collection-actions";
import { LibraryBig, Plus, SearchX } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { EmptyState } from "@/components/media/empty-state";
import { LibraryControls } from "@/components/media/library-controls";
import { PosterCard } from "@/components/media/poster-card";
import { Button } from "@/components/ui/button";
import { loadCollection } from "@/lib/data/collections";
import { isLegacyCollection } from "@/lib/collections";
import { CATEGORY_PARAM } from "@/lib/categories";
import { loadCategories } from "@/lib/data/categories";
import { loadLibrary } from "@/lib/data/library";
import { filterLibrary, librarySearchSchema } from "@/lib/progress/library";
import { requireUser } from "@/lib/supabase/auth";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = await loadCollection(await requireUser(), (await params).collection);
  return { title: collection?.name ?? "Not found" };
}

export default async function LibraryPage({ params, searchParams }: Props) {
  const [{ collection: slug }, query] = await Promise.all([params, searchParams]);
  const ctx = await requireUser();
  const collection = await loadCollection(ctx, slug);
  if (!collection) {
    if (isLegacyCollection(slug)) redirect("/");
    notFound();
  }
  if (slug !== collection.id) {
    const preserved = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") preserved.set(key, value);
      else if (Array.isArray(value)) for (const item of value) preserved.append(key, item);
    }
    redirect(`/${collection.id}${preserved.size ? `?${preserved}` : ""}`);
  }
  const search = librarySearchSchema.parse({
    q: typeof query.q === "string" ? query.q : undefined,
    status: query.status,
    sort: query.sort,
    categories: query[CATEGORY_PARAM],
  });
  const [library, categories] = await Promise.all([loadLibrary(ctx, collection.id), loadCategories(ctx, collection.id)]);
  // Ignore ids of categories deleted since the link was made.
  search.categories = search.categories.filter((id) => categories.some((category) => category.id === id));
  const visible = filterLibrary(library, search);
  const categoryCounts: Record<string, number> = {};
  for (const entry of visible) for (const id of entry.categoryIds) categoryCounts[id] = (categoryCounts[id] ?? 0) + 1;

  return (
    <EntranceScope>
      <PageContainer>
        <section aria-labelledby="library-heading">
          <div className="scroll-fade mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="enter min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-amethyst uppercase">Category</p>
              <h1 id="library-heading" className="mt-1 text-3xl font-extrabold tracking-tight break-words md:text-4xl">
                {search.q ? `“${search.q}” in ${collection.name}` : collection.name}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                <span className="tabular-nums">
                  {visible.length === library.length ? library.length : `${visible.length} of ${library.length}`}{" "}
                  {library.length === 1 ? "entry" : "entries"}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
            <CollectionActions collection={collection} />
            <Button asChild className="enter h-10 px-4" style={{ "--enter-index": 1 } as React.CSSProperties}>
              <Link href={`/${slug}/new`}>
                <Plus aria-hidden /> New entry
              </Link>
            </Button>
            </div>
          </div>

          <div className="enter enter-soft mb-8" style={{ "--enter-index": 2 } as React.CSSProperties}>
            <LibraryControls search={search} label={collection.name} collectionId={collection.id} categories={categories} categoryCounts={categoryCounts} />
          </div>

          {library.length === 0 ? (
            <EmptyState
              icon={LibraryBig}
              title="No entries yet"
              description={collection.name}
              action={
                <Button asChild>
                  <Link href={`/${slug}/new`}>
                    <Plus aria-hidden /> New entry
                  </Link>
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Nothing matches"
              description="Try a different search or clear the filters."
              action={
                <Button asChild variant="outline">
                  <Link href={`/${slug}`}>Clear filters</Link>
                </Button>
              }
            />
          ) : (
            <ul aria-label={collection.name} className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {visible.map((entry, index) => (
                <li key={entry.id} className="enter enter-card" style={{ "--enter-index": Math.min(index, 8) + 1 } as React.CSSProperties}>
                  <PosterCard entry={entry} priority={index < 6} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageContainer>
    </EntranceScope>
  );
}
