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
          <nav aria-label="Labels by collection" className="collection-nav-strip flex gap-1 overflow-x-auto rounded-md border border-white/[0.08] bg-white/[0.02] p-1">
            {collections.map((item) => {
              const active = item.id === collection.id;
              return (
                <Link
                  key={item.id}
                  href={`/settings/labels?collection=${item.id}`}
                  aria-current={active ? "page" : undefined}
                  title={item.name}
                  scroll={false}
                  className={cn(
                    "flex h-9 max-w-48 shrink-0 items-center gap-2 rounded border px-3 text-sm font-medium transition-colors",
                    active ? "border-white/[0.1] bg-surface-raised text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
                  )}
                >
                  <LibraryBig aria-hidden className={cn("size-3.5 shrink-0", active ? "text-amethyst" : "text-muted-foreground")} />
                  <span className="truncate">{item.name}</span>
                </Link>
              );
            })}
          </nav>
          <CategoryManager key={collection.id} collectionId={collection.id} categories={categories} usage={usage} />
        </div>
      ) : (
        <div className="enter enter-soft flex flex-col items-start gap-4 rounded-lg border border-dashed border-white/[0.1] px-5 py-7 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <Tags aria-hidden className="size-5 shrink-0 text-amethyst/70" />
          <p className="flex-1">Labels belong to a collection. Create a collection first, then add labels to it here.</p>
          <NewCategoryButton label="Create a collection" />
        </div>
      )}
    </>
  );
}
