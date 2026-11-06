import type { Metadata } from "next";
import Link from "next/link";
import { LibraryBig, Tags } from "lucide-react";
import { CategoryManager } from "@/components/categories/category-manager";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { loadCategories, loadCategoryUsage } from "@/lib/data/categories";
import { loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";
import { cn } from "@/lib/utils";
import { SettingsHeader } from "../settings-ui";

export const metadata: Metadata = { title: "Labels · Settings" };

export default async function LabelsSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { collection: requested } = await searchParams;
  const ctx = await requireUser();
  const collections = await loadCollections(ctx);
  const collection = collections.find((item) => item.id === requested || item.legacy_slug === requested) ?? collections[0];
  const [categories, usage] = collection
    ? await Promise.all([loadCategories(ctx, collection.id), loadCategoryUsage(ctx, collection.id)])
    : [[], {}];

  return (
    <>
      <SettingsHeader title="Labels" description="Labels tag entries inside a collection so you can filter them. Each collection has its own set." />
      {collection ? (
        <div className="enter enter-soft space-y-5">
          <nav aria-label="Labels by collection" className="collection-nav-strip ui-segment max-w-full overflow-x-auto">
            {collections.map((item) => {
              const active = item.id === collection.id;
              return (
                <Link
                  key={item.id}
                  href={`/settings/labels?collection=${item.id}`}
                  aria-current={active ? "page" : undefined}
                  title={item.name}
                  scroll={false}
                  className="set-segment-item max-w-48"
                >
                  <LibraryBig aria-hidden className={cn("size-3.5 shrink-0 transition-colors", active ? "text-amethyst" : "text-muted-foreground")} />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>
          <CategoryManager key={collection.id} collectionId={collection.id} categories={categories} usage={usage} />
        </div>
      ) : (
        <div className="ui-empty enter enter-soft flex flex-col items-start gap-4 px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <span aria-hidden className="ui-icon">
            <Tags className="size-[18px]" />
          </span>
          <p className="flex-1">Labels belong to a collection. Create a collection first, then add labels to it here.</p>
          <NewCategoryButton label="Create a collection" />
        </div>
      )}
    </>
  );
}
