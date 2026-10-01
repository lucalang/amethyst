import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LibraryBig, Plus, SearchX } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { EmptyState } from "@/components/media/empty-state";
import { LibraryControls } from "@/components/media/library-controls";
import { PosterCard } from "@/components/media/poster-card";
import { Button } from "@/components/ui/button";
import { COLLECTIONS, isCollectionSlug } from "@/lib/collections";
import { loadLibrary } from "@/lib/data/library";
import { filterLibrary, librarySearchSchema } from "@/lib/progress/library";
import { requireUser } from "@/lib/supabase/auth";

type Props = {
  params: Promise<{ collection: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { collection } = await params;
  return { title: isCollectionSlug(collection) ? COLLECTIONS[collection].label : "Not found" };
}

export default async function LibraryPage({ params, searchParams }: Props) {
  const [{ collection: slug }, query] = await Promise.all([params, searchParams]);
  if (!isCollectionSlug(slug)) notFound();
  const collection = COLLECTIONS[slug];
  const ctx = await requireUser();
  const search = librarySearchSchema.parse({
    q: typeof query.q === "string" ? query.q : undefined,
    status: query.status,
    sort: query.sort,
  });
  const library = await loadLibrary(ctx, collection.kind);
  const visible = filterLibrary(library, search);

  return (
    <EntranceScope>
      <PageContainer>
        <section aria-labelledby="library-heading">
          <div className="scroll-fade mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="enter min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.22em] text-amethyst uppercase">Collection</p>
              <h1 id="library-heading" className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
                {search.q ? `“${search.q}” in ${collection.label}` : collection.label}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {collection.description}{" "}
                <span className="tabular-nums">
                  {visible.length === library.length ? library.length : `${visible.length} of ${library.length}`}{" "}
                  {library.length === 1 ? "entry" : "entries"}
                </span>
              </p>
            </div>
            <Button asChild className="enter h-10 px-4" style={{ "--enter-index": 1 } as React.CSSProperties}>
              <Link href={`/${slug}/new`}>
                <Plus aria-hidden /> {collection.newLabel}
              </Link>
            </Button>
          </div>

          <div className="enter enter-soft mb-8" style={{ "--enter-index": 2 } as React.CSSProperties}>
            <LibraryControls search={search} label={collection.label} />
          </div>

          {library.length === 0 ? (
            <EmptyState
              icon={LibraryBig}
              title={`No ${collection.label.toLowerCase()} yet`}
              description={`Create your first ${collection.singular}. Each one gets its own workspace for notes, checklists and folders.`}
              action={
                <Button asChild>
                  <Link href={`/${slug}/new`}>
                    <Plus aria-hidden /> {collection.newLabel}
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
            <ul aria-label={collection.label} className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
