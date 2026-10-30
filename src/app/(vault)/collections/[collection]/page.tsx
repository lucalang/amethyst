import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CollectionActions } from "@/components/categories/collection-actions";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { Plus } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { LibraryControls } from "@/components/media/library-controls";
import { CollectionLayoutProvider } from "@/components/media/collection-layout";
import { LibraryCount, LibraryResults, LibrarySearchProvider, LibraryTitle } from "@/components/media/library-view";
import { MediaImage } from "@/components/media/media-image";
import { ShowcaseButton, ShowcaseProvider } from "@/components/showcase/showcase-provider";
import { Button } from "@/components/ui/button";
import { accentStyle } from "@/lib/collection-identity";
import { cn } from "@/lib/utils";
import { loadCollection } from "@/lib/data/collections";
import { collectionPath } from "@/lib/collections";
import { CATEGORY_PARAM } from "@/lib/categories";
import { loadCategories } from "@/lib/data/categories";
import { loadLibrary } from "@/lib/data/library";
import { loadPreferences } from "@/lib/data/preferences";
import { loadViewerPresets } from "@/lib/data/viewer-presets";
import { measureServer } from "@/lib/data/timing";
import { librarySearchSchema } from "@/lib/progress/library";
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
  const ctx = await measureServer("collection.auth", requireUser);
  // These don't depend on the collection, so they overlap its lookup.
  const preferenceRead = measureServer("collection.preferences", () => loadPreferences(ctx));
  const presetRead = measureServer("collection.viewer-presets", () => loadViewerPresets(ctx));
  presetRead.catch(() => {});
  const collection = await measureServer("collection.resolve", () => loadCollection(ctx, slug));
  if (!collection) notFound();
  const path = collectionPath(collection);
  if (slug !== collection.slug) {
    const preserved = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string") preserved.set(key, value);
      else if (Array.isArray(value)) for (const item of value) preserved.append(key, item);
    }
    redirect(`${path}${preserved.size ? `?${preserved}` : ""}`);
  }
  const search = librarySearchSchema.parse({
    q: typeof query.q === "string" ? query.q : undefined,
    status: query.status,
    sort: query.sort,
    categories: query[CATEGORY_PARAM],
  });
  const [library, categories, preferences, viewerPresets] = await Promise.all([
    measureServer("collection.library", () => loadLibrary(ctx, collection.id)),
    measureServer("collection.categories", () => loadCategories(ctx, collection.id)),
    preferenceRead,
    presetRead,
  ]);
  // Ignore ids of labels deleted since the link was made.
  search.categories = search.categories.filter((id) => categories.some((category) => category.id === id));
  const labelNames = Object.fromEntries(categories.map((category) => [category.id, category.name]));
  const display = { title: preferences.cardTitle, labels: preferences.cardLabels, progress: preferences.cardProgress };
  const accent = accentStyle(collection.accent_color);
  const banner = collection.banner_url;

  const icon = (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-lg border",
        banner ? "size-11 backdrop-blur-md md:size-12" : "mt-0.5 size-12",
        accent
          ? cn("border-[var(--ca-line)] text-[var(--ca)]", banner ? "bg-[color-mix(in_srgb,var(--background)_70%,var(--ca-soft))]" : "bg-[var(--ca-soft)]")
          : cn("border-amethyst/25 text-amethyst", banner ? "bg-background/70" : "bg-amethyst/[0.07]"),
      )}
    >
      <CollectionIcon icon={collection.icon} className="size-5" strokeWidth={1.75} />
    </span>
  );
  const eyebrow = (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
      <span className={accent ? "font-medium text-[var(--ca)]" : undefined}>Collection</span>
      <span className="border-l border-white/[0.15] pl-2.5">
        <LibraryCount />
      </span>
    </p>
  );
  const title = (
    <h1 id="library-heading" className="mt-1 text-2xl leading-tight font-semibold tracking-normal break-words md:text-3xl">
      <LibraryTitle name={collection.name} />
    </h1>
  );
  const description = collection.description ? (
    <p className="max-w-[68ch] text-sm leading-6 whitespace-pre-line break-words text-muted-foreground">{collection.description}</p>
  ) : null;
  const actions = (overlay: boolean) => (
    <>
      <Button asChild className="h-10 flex-1 gap-2 px-4 sm:flex-none">
        <Link href={`${path}/new`}>
          <Plus aria-hidden /> New entry
        </Link>
      </Button>
      <CollectionActions collection={collection} entryCount={library.length} className={cn("size-10", overlay && "bg-background/60 backdrop-blur-md")} />
      <ShowcaseButton className={cn("h-10 gap-2 px-3.5", overlay && "bg-background/60 backdrop-blur-md")} />
    </>
  );

  return (
    <EntranceScope>
      <PageContainer>
        <LibrarySearchProvider library={library} search={search}>
          <CollectionLayoutProvider collectionId={collection.id} initial={collection.layout}>
          <ShowcaseProvider name={collection.name} viewerPresets={viewerPresets} icon={<CollectionIcon icon={collection.icon} strokeWidth={1.75} />}>
          <section aria-labelledby="library-heading">
            {banner ? (
              <header className="scroll-fade enter enter-soft mb-6" style={accent}>
                <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-surface shadow-[0_24px_60px_-40px_rgb(var(--shadow-rgb)/calc(0.9*var(--shadow-alpha)))]">
                  <div className="relative h-40 sm:h-52 md:h-60 lg:h-64">
                    <MediaImage src={banner} alt="" sizes="100vw" priority className="object-[50%_35%]" />
                    {/* Only the lower band is shaded, so the artwork stays visible. */}
                    <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />
                    {accent ? <div aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--ca)] opacity-70" /> : null}
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 md:p-5">
                      <div className="flex min-w-0 items-end gap-3.5 [text-shadow:0_1px_12px_rgb(var(--paper-rgb)/0.6)]">
                        {icon}
                        <div className="min-w-0">
                          {eyebrow}
                          {title}
                        </div>
                      </div>
                      <div className="enter hidden shrink-0 items-center gap-2 sm:flex" style={{ "--enter-index": 1 } as React.CSSProperties}>
                        {actions(true)}
                      </div>
                    </div>
                  </div>
                  {description ? <div className="border-t border-white/[0.06] px-4 py-3 md:px-5">{description}</div> : null}
                </div>
                <div className="mt-3 flex items-center gap-2 sm:hidden">{actions(false)}</div>
              </header>
            ) : (
              <header className="scroll-fade mb-6 flex flex-wrap items-center justify-between gap-5 border-b border-white/[0.08] pb-6" style={accent}>
                <div className="enter flex min-w-0 flex-1 basis-full items-start gap-3.5 sm:basis-0">
                  {icon}
                  <div className="min-w-0">
                    {eyebrow}
                    {title}
                    {description ? <div className="mt-2">{description}</div> : null}
                  </div>
                </div>
                <div className="enter flex w-full shrink-0 items-center gap-2 sm:w-auto" style={{ "--enter-index": 1 } as React.CSSProperties}>
                  {actions(false)}
                </div>
              </header>
            )}

            <div className="enter enter-soft mb-8" style={{ "--enter-index": 2 } as React.CSSProperties}>
              <LibraryControls search={search} label={collection.name} collectionId={collection.id} categories={categories} />
            </div>

            <LibraryResults
              name={collection.name}
              newHref={`${path}/new`}
              clearHref={path}
              density={preferences.libraryDensity}
              pinStyle={preferences.pinStyle}
              display={display}
              labelNames={labelNames}
            />
          </section>
          </ShowcaseProvider>
          </CollectionLayoutProvider>
        </LibrarySearchProvider>
      </PageContainer>
    </EntranceScope>
  );
}
