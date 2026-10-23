import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, KeyRound, LibraryBig, LogOut, Tags } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { CategoryManager } from "@/components/categories/category-manager";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { CollectionActions, NewCategoryButton } from "@/components/categories/collection-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCategories, loadCategoryUsage } from "@/lib/data/categories";
import { loadCollectionEntryCounts, loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";
import { ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { collection: slug } = await searchParams;
  const ctx = await requireUser();
  const collections = await loadCollections(ctx);
  const collection = collections.find((item) => item.id === slug || item.legacy_slug === slug) ?? collections[0];
  const [{ data: profile }, categories, usage, entryCounts] = await Promise.all([
    ctx.supabase.from("users").select("display_name, created_at").eq("id", ctx.userId).maybeSingle(),
    collection ? loadCategories(ctx, collection.id) : Promise.resolve([]),
    collection ? loadCategoryUsage(ctx, collection.id) : Promise.resolve({}),
    loadCollectionEntryCounts(ctx),
  ]);

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Settings" description="Account, categories and security." />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Signed in as {ctx.email ?? "unknown email"}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm displayName={profile?.display_name ?? ""} />
          </CardContent>
        </Card>

        <section id="collections" aria-labelledby="collections-heading" className="scroll-mt-24 border-t border-white/[0.08] pt-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 id="collections-heading" className="text-base font-semibold tracking-normal">Categories</h2>
              <span className="grid h-5 min-w-5 place-items-center rounded bg-white/[0.06] px-1.5 text-[11px] font-medium text-muted-foreground tabular-nums" aria-label={`${collections.length} categories`}>{collections.length}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {collections.length > 1 ? <ArrangeCollectionsButton collections={collections} /> : null}
              <NewCategoryButton />
            </div>
          </div>
          {collections.length ? (
            <ul aria-label="Your categories" className="divide-y divide-white/[0.06] border-y border-white/[0.08]">
              {collections.map((item) => (
                <li key={item.id} className="group/collection flex items-center gap-3 px-3 transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025]">
                  <Link href={`/${item.id}`} title={item.name} className="flex min-h-18 min-w-0 flex-1 items-center gap-3.5 py-3">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md border border-white/[0.08] bg-surface-raised text-amethyst/80 transition-[color,background-color,border-color] group-hover/collection:border-amethyst/30 group-hover/collection:bg-amethyst/[0.08] group-hover/collection:text-amethyst">
                      <LibraryBig className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium break-words text-foreground transition-colors group-hover/collection:text-amethyst">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{entryCounts[item.id] ?? 0} {(entryCounts[item.id] ?? 0) === 1 ? "entry" : "entries"}</span>
                    <ArrowUpRight aria-hidden className="size-4 shrink-0 text-muted-foreground/40 transition-[color,translate] group-hover/collection:translate-x-0.5 group-hover/collection:-translate-y-0.5 group-hover/collection:text-amethyst" />
                  </Link>
                  <CollectionActions collection={item} entryCount={entryCounts[item.id] ?? 0} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3 border-y border-dashed border-white/[0.1] py-7 text-sm text-muted-foreground">
              <LibraryBig aria-hidden className="size-5 text-amethyst/60" />
              No categories yet
            </div>
          )}
        </section>

        {collection ? <section id="categories" aria-labelledby="labels-heading" className="scroll-mt-24 pt-2">
          <div className="mb-4 flex items-center gap-2.5">
            <Tags aria-hidden className="size-4 text-muted-foreground" />
            <h2 id="labels-heading" className="text-base font-semibold tracking-normal">Labels</h2>
          </div>
          <div className="space-y-5">
            <nav aria-label="Labels by category" className="collection-nav-strip flex gap-1 overflow-x-auto rounded-md border border-white/[0.08] bg-white/[0.02] p-1">
              {collections.map((item) => (
                <Link
                  key={item.id}
                  href={`/settings?collection=${item.id}#categories`}
                  aria-current={item.id === collection.id ? "page" : undefined}
                  title={item.name}
                  className={`flex h-9 max-w-48 shrink-0 items-center gap-2 rounded border px-3 text-sm font-medium transition-colors ${item.id === collection.id ? "border-white/[0.1] bg-surface-raised text-foreground shadow-sm" : "border-transparent text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"}`}
                >
                  <LibraryBig aria-hidden className={`size-3.5 shrink-0 ${item.id === collection.id ? "text-amethyst" : "text-muted-foreground/60"}`} />
                  <span className="truncate">{item.name}</span>
                </Link>
              ))}
            </nav>
            <CategoryManager key={collection.id} collectionId={collection.id} categories={categories} usage={usage} />
          </div>
        </section> : null}

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Change your password, or sign out of this device. Your data is private to your account.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/settings/password">
                <KeyRound aria-hidden /> Change password
              </Link>
            </Button>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline">
                <LogOut aria-hidden /> Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
