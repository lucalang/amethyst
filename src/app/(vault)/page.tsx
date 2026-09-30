import Link from "next/link";
import { Gamepad2, Import, LibraryBig, Loader2, Play, SearchX } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/media/empty-state";
import { LibraryControls } from "@/components/media/library-controls";
import { MediaImage } from "@/components/media/media-image";
import { PosterCard } from "@/components/media/poster-card";
import { ProgressMeter } from "@/components/media/progress-meter";
import { Button } from "@/components/ui/button";
import { loadLibrary, type ContinueItem } from "@/lib/data/library";
import { formatRelative } from "@/lib/format";
import { filterLibrary, librarySearchSchema } from "@/lib/progress/library";
import { requireUser } from "@/lib/supabase/auth";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const search = librarySearchSchema.parse({
    q: typeof params.q === "string" ? params.q : undefined,
    kind: params.kind,
    status: params.status,
    sort: params.sort,
  });
  const { library, continueWatching, activeJobs } = await loadLibrary(ctx);
  const visible = filterLibrary(library, search);

  return (
    <PageContainer>
      {activeJobs.length > 0 ? (
        <Link
          href="/import"
          className="mb-6 flex items-center gap-3 rounded-lg border border-jade/30 bg-jade/5 px-4 py-3 text-sm hover:bg-jade/10"
        >
          <Loader2 aria-hidden className="size-4 animate-spin text-jade motion-reduce:animate-none" />
          <span className="flex-1">
            {activeJobs.length === 1
              ? `Importing ${(activeJobs[0].input as { title?: string })?.title ?? "a franchise"}…`
              : `${activeJobs.length} imports running…`}
          </span>
          <span className="text-muted-foreground">View</span>
        </Link>
      ) : null}

      {continueWatching.length > 0 && !search.q ? <ContinueWatching items={continueWatching} /> : null}

      <section aria-labelledby="library-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 id="library-heading" className="text-xl font-semibold md:text-2xl">
              {search.q ? `Results for “${search.q}”` : "Library"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground tabular-nums">
              {visible.length} of {library.length} {library.length === 1 ? "entry" : "entries"}
            </p>
          </div>
          <LibraryControls search={search} />
        </div>

        {library.length === 0 ? (
          <EmptyState
            icon={LibraryBig}
            title="Your archive is empty"
            description="Import an anime franchise from MyAnimeList, or add a custom game or entry."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/import">
                    <Import aria-hidden /> Import anime
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/entries/new?kind=game">
                    <Gamepad2 aria-hidden /> Add a game
                  </Link>
                </Button>
              </div>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Nothing matches"
            description="Try a different search or clear the filters."
            action={
              <Button asChild variant="outline">
                <Link href="/">Clear filters</Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {visible.map((entry, index) => (
              <li key={entry.id}>
                <PosterCard entry={entry} priority={index < 6} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

function ContinueWatching({ items }: { items: ContinueItem[] }) {
  return (
    <section aria-labelledby="continue-heading" className="mb-10">
      <h2 id="continue-heading" className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Continue watching
      </h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 lg:grid-cols-3">
        {items.slice(0, 6).map((item) => (
          <li key={item.mediaItemId} className="w-[82%] shrink-0 snap-start sm:w-[60%] md:w-auto">
            <Link
              href={`/franchise/${item.entryId}#w-${item.mediaItemId}`}
              className="group flex gap-3 rounded-lg border border-border bg-card p-2.5 transition-colors hover:bg-surface-raised"
            >
              <div className="relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-md bg-secondary">
                <MediaImage src={item.imageUrl} alt="" sizes="64px" fallbackLabel={item.title} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between py-0.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.entryTitle}</p>
                </div>
                <div>
                  <ProgressMeter done={item.watched} total={item.totalEpisodes} label="episodes" />
                  <p className="sr-only">Updated {formatRelative(item.updatedAt)}</p>
                </div>
              </div>
              <Play aria-hidden className="size-4 shrink-0 self-center text-muted-foreground group-hover:text-jade" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
