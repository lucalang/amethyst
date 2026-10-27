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
        <header className="enter flex flex-wrap items-end justify-between gap-4" style={enterIndex(0)}>
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight md:text-4xl">
              <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-amethyst/[0.12] ring-1 ring-amethyst/25">
                <LibraryBig className="size-5 text-amethyst" />
              </span>
              Archive
            </h1>
            <p className="mt-2 text-sm text-muted-foreground tabular-nums">
              {collections
                ? `${collections.toLocaleString("en")} ${collections === 1 ? "collection" : "collections"} · ${entries.toLocaleString("en")} ${entries === 1 ? "entry" : "entries"}`
                : "Collections are your shelves: games, books, films, or anything else."}
            </p>
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

        <section aria-label="Your collections" className="enter mt-8" style={enterIndex(2)}>
          {home.collections.length ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {home.collections.map((collection) => (
                <li key={collection.id} className="min-w-0">
                  <CollectionCard collection={collection} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-foreground/[0.12] p-6">
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
