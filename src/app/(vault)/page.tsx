import Link from "next/link";
import { Gamepad2, LibraryBig, SearchX, Tv } from "lucide-react";
import { PageContainer } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/media/empty-state";
import { LibraryControls } from "@/components/media/library-controls";
import { PosterCard } from "@/components/media/poster-card";
import { Button } from "@/components/ui/button";
import { loadLibrary } from "@/lib/data/library";
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
  const library = await loadLibrary(ctx);
  const visible = filterLibrary(library, search);

  return (
    <PageContainer>
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
            description="Create an anime or game. Each one gets its own workspace for notes, checklists and folders."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href="/entries/new?kind=anime">
                    <Tv aria-hidden /> New anime
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/entries/new?kind=game">
                    <Gamepad2 aria-hidden /> New game
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
