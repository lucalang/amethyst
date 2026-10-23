import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CollectionActions } from "@/components/categories/collection-actions";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { LibraryBig, Plus, SearchX } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { EmptyState } from "@/components/media/empty-state";
import { LibraryControls } from "@/components/media/library-controls";
import { MediaImage } from "@/components/media/media-image";
import { PosterCard } from "@/components/media/poster-card";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/lib/collection-identity";
import { cn } from "@/lib/utils";
import { loadCollection } from "@/lib/data/collections";
import { isLegacyCollection } from "@/lib/collections";
import { CATEGORY_PARAM } from "@/lib/categories";
import { loadCategories } from "@/lib/data/categories";
import { loadLibrary } from "@/lib/data/library";
import { loadPreferences } from "@/lib/data/preferences";
import { filterLibrary, librarySearchSchema } from "@/lib/progress/library";
import type { LibraryDensity } from "@/lib/preferences";
import { requireUser } from "@/lib/supabase/auth";

const DENSITY_GRID: Record<LibraryDensity, string> = {
  comfortable: "grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
  compact: "grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8",
  large: "grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 xl:grid-cols-4",
};

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
  const [library, categories, preferences] = await Promise.all([
    loadLibrary(ctx, collection.id),
    loadCategories(ctx, collection.id),
    loadPreferences(ctx),
  ]);
  // Ignore ids of labels deleted since the link was made.
  search.categories = search.categories.filter((id) => categories.some((category) => category.id === id));
  const visible = filterLibrary(library, search);
  const categoryCounts: Record<string, number> = {};
  for (const entry of visible) for (const id of entry.categoryIds) categoryCounts[id] = (categoryCounts[id] ?? 0) + 1;
  const labelNames = new Map(categories.map((category) => [category.id, category.name]));
  const display = { title: preferences.cardTitle, labels: preferences.cardLabels, progress: preferences.cardProgress };
  const accent = accentStyle(collection.accent_color);

  return (
    <EntranceScope>
      <PageContainer>
        <section aria-labelledby="library-heading">
          {collection.banner_url ? (
            <div aria-hidden className="scroll-fade enter enter-soft relative mb-6 h-32 overflow-hidden rounded-lg border border-white/[0.06] bg-surface sm:h-40 md:h-48" style={accent}>
              <MediaImage src={collection.banner_url} alt="" priority className="opacity-85" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/25 to-transparent" />
              {accent ? <div className="absolute inset-x-0 bottom-0 h-px bg-[var(--ca-line)]" /> : null}
            </div>
          ) : null}
          <div className="scroll-fade mb-6 flex flex-wrap items-center justify-between gap-5 border-b border-white/[0.08] pb-6" style={accent}>
            <div className="enter flex min-w-0 flex-1 basis-full items-start gap-3.5 sm:basis-0">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-12 shrink-0 place-items-center rounded-lg border",
                  accent ? "border-[var(--ca-line)] bg-[var(--ca-soft)] text-[var(--ca)]" : "border-amethyst/20 bg-amethyst/[0.07] text-amethyst",
                )}
              >
                <CollectionIcon icon={collection.icon} className="size-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                  <span className={accent ? "font-medium text-[var(--ca)]" : undefined}>Collection</span>
                  <span className="border-l border-white/[0.12] pl-2.5 tabular-nums">
                    {visible.length === library.length ? library.length : `${visible.length} of ${library.length}`}{" "}
                    {library.length === 1 ? "entry" : "entries"}
                  </span>
                </p>
                <h1 id="library-heading" className="mt-1 text-2xl leading-tight font-semibold tracking-normal break-words md:text-3xl">
                  {search.q ? `“${search.q}” in ${collection.name}` : collection.name}
                </h1>
                {collection.description ? (
                  <p className="mt-2 max-w-[68ch] text-sm leading-6 whitespace-pre-line break-words text-muted-foreground">{collection.description}</p>
                ) : null}
              </div>
            </div>
            <div className="enter flex w-full shrink-0 items-center gap-2 sm:w-auto" style={{ "--enter-index": 1 } as React.CSSProperties}>
              <Button asChild className="h-10 flex-1 gap-2 px-4 sm:flex-none">
                <Link href={`/${slug}/new`}>
                  <Plus aria-hidden /> New entry
                </Link>
              </Button>
              <CollectionActions collection={collection} entryCount={library.length} className="size-10" />
            </div>
          </div>

          <div className="enter enter-soft mb-8" style={{ "--enter-index": 2 } as React.CSSProperties}>
            <LibraryControls search={search} label={collection.name} collectionId={collection.id} categories={categories} categoryCounts={categoryCounts} />
          </div>

          {library.length === 0 ? (
            <EmptyState
              icon={LibraryBig}
              title="No entries yet"
              description={`Add your first entry to ${collection.name}.`}
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
            <ul aria-label={collection.name} className={DENSITY_GRID[preferences.libraryDensity]}>
              {visible.map((entry, index) => (
                <li key={entry.id} className="enter enter-card" style={{ "--enter-index": Math.min(index, 8) + 1 } as React.CSSProperties}>
                  <PosterCard
                    entry={entry}
                    priority={index < (preferences.libraryDensity === "compact" ? 8 : 6)}
                    pinStyle={preferences.pinStyle}
                    display={display}
                    labels={display.labels ? entry.categoryIds.flatMap((id) => labelNames.get(id) ?? []) : undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </PageContainer>
    </EntranceScope>
  );
}
