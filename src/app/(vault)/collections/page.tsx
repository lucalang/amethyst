import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { LibraryBig } from "lucide-react";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { CollectionCard, ContinueCard } from "@/components/home/archive-cards";
import { NewEntryButton } from "@/components/home/new-entry-button";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { loadHome } from "@/lib/data/home";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Archive" };

const enterIndex = (index: number) => ({ "--enter-index": index }) as CSSProperties;

export default async function ArchivePage() {
  const ctx = await requireUser();
  const home = await loadHome(ctx, null);
  const categories = home.collections.map(({ id, slug, name, description }) => ({ id, slug, name, description }));
  const { collections, entries } = home.counts;

  return (
    <EntranceScope>
      <div className="mx-auto w-full max-w-[88rem] px-4 py-7 md:px-6 md:py-9">
        <header className="ui-hero enter flex flex-wrap items-end justify-between gap-4" style={enterIndex(0)}>
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden className="ui-hero-icon">
              <LibraryBig className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">Archive</h1>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                {collections
                  ? `${collections.toLocaleString("en")} ${collections === 1 ? "collection" : "collections"} · ${entries.toLocaleString("en")} ${entries === 1 ? "entry" : "entries"}`
                  : "Collections are your shelves: games, books, films, or anything else."}
              </p>
            </div>
          </div>
          {collections ? (
            <div className="flex flex-wrap items-center gap-2.5">
              {collections > 1 ? <ArrangeCollectionsButton collections={categories} /> : null}
              <NewCategoryButton className="h-10 px-4" />
              <NewEntryButton collections={categories} className="h-10 px-4" />
            </div>
          ) : null}
        </header>

        {home.continueEntry ? (
          <div className="enter mt-6" style={enterIndex(1)}>
            <ContinueCard item={home.continueEntry} />
          </div>
        ) : null}

        <section aria-label="Your collections" className="mt-8">
          {home.collections.length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {home.collections.map((collection, index) => (
                <li key={collection.id} className="enter enter-card min-w-0" style={enterIndex(index + 2)}>
                  <CollectionCard collection={collection} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="ui-empty enter flex flex-col items-center gap-4 px-6 py-12 text-center" style={enterIndex(2)}>
              <span aria-hidden className="ui-icon">
                <LibraryBig className="size-4" />
              </span>
              <p className="max-w-lg text-sm text-pretty text-muted-foreground">
                Your archive is empty. Create a collection, then add entries with cover art, notes and checklists.
              </p>
              <NewCategoryButton label="Create your first collection" className="h-10 border-amethyst/50 bg-amethyst/15 px-4 text-foreground hover:bg-amethyst/25" />
            </div>
          )}
        </section>
      </div>
    </EntranceScope>
  );
}
