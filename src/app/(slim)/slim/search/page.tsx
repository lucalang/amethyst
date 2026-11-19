import type { Metadata } from "next";
import { SlimEntryGrid, SlimEntryTile } from "@/components/slim/slim-entries";
import { loadCollections } from "@/lib/data/collections";
import { searchSlimEntries } from "@/lib/data/slim";
import { SLIM_BASE } from "@/lib/edition";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Search" };

export default async function SlimSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = (await searchParams).q;
  const q = typeof query === "string" ? query.trim() : "";
  const ctx = await requireUser();
  const [results, collections] = await Promise.all([searchSlimEntries(ctx, q), loadCollections(ctx)]);
  const names = Object.fromEntries(collections.map((collection) => [collection.id, collection.name]));
  return (
    <div className="slim-page grid gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Search</h1>
        <form action={`${SLIM_BASE}/search`} method="get" role="search" className="mt-3 flex max-w-xl gap-2">
          <input type="search" name="q" defaultValue={q} placeholder="Entry title" aria-label="Search entries" className="slim-field flex-1" autoFocus={!q} />
          <button type="submit" className="slim-switch">
            Search
          </button>
        </form>
      </header>
      {q ? (
        results.length ? (
          <section aria-label={`Results for ${q}`}>
            <p className="mb-4 text-sm text-muted-foreground" role="status">
              {results.length === 60 ? "The 60 most recently changed entries" : `${results.length} ${results.length === 1 ? "entry" : "entries"}`} matching “{q}”
            </p>
            <SlimEntryGrid>
              {results.map((entry) => (
                <SlimEntryTile key={entry.id} entry={entry} meta={names[entry.collectionId]} />
              ))}
            </SlimEntryGrid>
          </section>
        ) : (
          <p role="status" className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground [overflow-wrap:anywhere]">
            No entry titles contain “{q}”.
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">Search every collection by entry title.</p>
      )}
    </div>
  );
}
