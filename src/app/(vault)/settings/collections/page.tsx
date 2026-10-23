import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, LibraryBig } from "lucide-react";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { CollectionActions, NewCategoryButton } from "@/components/categories/collection-actions";
import { loadCollectionEntryCounts, loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";
import { SettingsHeader } from "../settings-ui";

export const metadata: Metadata = { title: "Collections · Settings" };

export default async function CollectionsSettingsPage() {
  const ctx = await requireUser();
  const [collections, entryCounts] = await Promise.all([loadCollections(ctx), loadCollectionEntryCounts(ctx)]);

  return (
    <>
      <SettingsHeader
        title="Collections"
        description="Your top-level libraries. Edit a name or description, change the order, or start a new one."
        actions={
          <>
            {collections.length > 1 ? <ArrangeCollectionsButton collections={collections} /> : null}
            <NewCategoryButton />
          </>
        }
      />
      {collections.length ? (
        <ul aria-label="Your collections" className="enter enter-soft divide-y divide-white/[0.06] border-y border-white/[0.08]">
          {collections.map((item) => {
            const count = entryCounts[item.id] ?? 0;
            return (
              <li key={item.id} className="group/collection flex items-center gap-3 px-3 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025]">
                <Link href={`/${item.id}`} title={item.name} className="flex min-h-18 min-w-0 flex-1 items-center gap-3.5 py-3.5">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center self-start rounded-md border border-white/[0.08] bg-surface-raised text-amethyst/80 transition-[color,background-color,border-color] group-hover/collection:border-amethyst/30 group-hover/collection:bg-amethyst/[0.08] group-hover/collection:text-amethyst">
                    <LibraryBig className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium break-words text-foreground transition-colors group-hover/collection:text-amethyst">{item.name}</span>
                    {item.description ? (
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-5 whitespace-pre-line break-words text-muted-foreground">{item.description}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count} {count === 1 ? "entry" : "entries"}</span>
                  <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground/40 transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5 group-hover/collection:text-amethyst" />
                </Link>
                <CollectionActions collection={item} entryCount={count} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="enter enter-soft flex flex-col items-start gap-4 rounded-lg border border-dashed border-white/[0.1] px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <LibraryBig aria-hidden className="size-5 shrink-0 text-amethyst/70" />
          <p className="flex-1">No collections yet. A collection holds related entries, such as games, books or projects.</p>
          <NewCategoryButton label="Create your first collection" />
        </div>
      )}
    </>
  );
}
