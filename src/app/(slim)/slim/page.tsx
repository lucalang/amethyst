import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Pin } from "lucide-react";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { SlimEntryGrid, SlimEntryTile } from "@/components/slim/slim-entries";
import { MediaImage } from "@/components/media/media-image";
import { collectionPath, entryPath } from "@/lib/collections";
import { loadSlimHome } from "@/lib/data/slim";
import { SLIM_BASE } from "@/lib/edition";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Home" };

export default async function SlimHomePage() {
  const ctx = await requireUser();
  const home = await loadSlimHome(ctx);
  const names = Object.fromEntries(home.collections.map((collection) => [collection.id, collection.name]));
  const total = Object.values(home.counts).reduce((sum, count) => sum + count, 0);
  const resume = home.resume;

  return (
    <div className="slim-page grid gap-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Your archive</h1>
        <p className="mt-1 text-sm text-muted-foreground tabular-nums">
          {home.collections.length.toLocaleString("en")} {home.collections.length === 1 ? "collection" : "collections"} · {total.toLocaleString("en")} {total === 1 ? "entry" : "entries"}
        </p>
      </header>

      {resume ? (
        <section aria-labelledby="slim-continue">
          <h2 id="slim-continue" className="slim-section-title">
            Continue
          </h2>
          <Link href={`${SLIM_BASE}${entryPath(resume.entry)}${resume.fileId ? `?file=${resume.fileId}` : ""}`} className="slim-card max-w-xl">
            <span className="relative block w-12 shrink-0 overflow-hidden rounded-md border border-border" style={{ aspectRatio: resume.entry.square ? "1" : "2 / 3" }}>
              <MediaImage src={resume.entry.coverUrl} alt="" sizes="48px" fallbackLabel={resume.entry.title} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{resume.entry.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{names[resume.entry.collectionId] ?? "Collection"} · pick up where you left off</span>
            </span>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </section>
      ) : null}

      {home.pinned.length ? (
        <section aria-labelledby="slim-pinned">
          <h2 id="slim-pinned" className="slim-section-title flex items-center gap-1.5">
            <Pin aria-hidden className="size-3.5" /> Pinned
          </h2>
          <SlimEntryGrid>
            {home.pinned.map((entry) => (
              <SlimEntryTile key={entry.id} entry={entry} meta={names[entry.collectionId]} />
            ))}
          </SlimEntryGrid>
        </section>
      ) : null}

      <section aria-labelledby="slim-collections">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="slim-collections" className="slim-section-title mb-0">
            Collections
          </h2>
          <NewCategoryButton className="h-8 px-3 text-xs" />
        </div>
        {home.collections.length ? (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {home.collections.map((collection) => (
              <li key={collection.id} className="min-w-0">
                <Link href={`${SLIM_BASE}${collectionPath(collection)}`} className="slim-card">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border text-amethyst">
                    <CollectionIcon icon={collection.icon} className="size-4.5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{collection.name}</span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {(home.counts[collection.id] ?? 0).toLocaleString("en")} {home.counts[collection.id] === 1 ? "entry" : "entries"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-border px-4 py-8 text-center text-sm text-muted-foreground">Your archive is empty. Create a collection to start adding entries.</p>
        )}
      </section>

      {home.recent.length ? (
        <section aria-labelledby="slim-recent">
          <h2 id="slim-recent" className="slim-section-title">
            Recently changed
          </h2>
          <SlimEntryGrid>
            {home.recent.map((entry) => (
              <SlimEntryTile key={entry.id} entry={entry} meta={names[entry.collectionId]} />
            ))}
          </SlimEntryGrid>
        </section>
      ) : null}
    </div>
  );
}
