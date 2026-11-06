import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowUpRight, LibraryBig } from "lucide-react";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { CollectionActions, NewCategoryButton } from "@/components/categories/collection-actions";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { accentStyle } from "@/lib/collection-identity";
import { collectionPath } from "@/lib/collections";
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
        <ul aria-label="Your collections" className="ui-panel enter enter-soft divide-y divide-border overflow-hidden">
          {collections.map((item) => {
            const count = entryCounts[item.id] ?? 0;
            const accent = accentStyle(item.accent_color);
            return (
              <li key={item.id} style={{ ...accent, "--tone": accent ? "var(--ca)" : undefined } as CSSProperties} className="set-list-row group/collection flex items-center gap-3 px-4">
                <Link href={collectionPath(item)} title={item.name} className="flex min-h-18 min-w-0 flex-1 items-center gap-3.5 rounded-lg py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span aria-hidden className="ui-icon self-start">
                    <CollectionIcon icon={item.icon} className="size-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold break-words text-foreground transition-colors group-hover/collection:text-(--tone,var(--amethyst))">{item.name}</span>
                    {item.description ? (
                      <span className="mt-0.5 line-clamp-2 block text-xs leading-5 whitespace-pre-line break-words text-muted-foreground">{item.description}</span>
                    ) : null}
                  </span>
                  <span className="ui-pill shrink-0 tabular-nums">{count} {count === 1 ? "entry" : "entries"}</span>
                  <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5 group-hover/collection:text-(--tone,var(--amethyst)) motion-reduce:transition-none motion-reduce:group-hover/collection:translate-none" />
                </Link>
                <CollectionActions collection={item} entryCount={count} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ui-empty enter enter-soft flex flex-col items-start gap-4 px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <span aria-hidden className="ui-icon">
            <LibraryBig className="size-[18px]" />
          </span>
          <p className="flex-1">No collections yet. A collection holds related entries, such as games, books or projects.</p>
          <NewCategoryButton label="Create your first collection" />
        </div>
      )}
    </>
  );
}
