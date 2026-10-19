import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { CategoryManager } from "@/components/categories/category-manager";
import { CollectionActions, NewCategoryButton } from "@/components/categories/collection-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCategories, loadCategoryUsage } from "@/lib/data/categories";
import { loadCollections } from "@/lib/data/collections";
import { requireUser } from "@/lib/supabase/auth";
import { ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { collection: slug } = await searchParams;
  const ctx = await requireUser();
  const collections = await loadCollections(ctx);
  const collection = collections.find((item) => item.id === slug || item.legacy_slug === slug) ?? collections[0];
  const [{ data: profile }, categories, usage] = await Promise.all([
    ctx.supabase.from("users").select("display_name, created_at").eq("id", ctx.userId).maybeSingle(),
    collection ? loadCategories(ctx, collection.id) : Promise.resolve([]),
    collection ? loadCategoryUsage(ctx, collection.id) : Promise.resolve({}),
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

        <Card id="collections" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="mb-4 divide-y divide-border">
              {collections.map((item) => <li key={item.id} className="flex min-h-12 items-center justify-between gap-3"><Link href={`/${item.id}`} className="min-w-0 break-words text-sm hover:text-amethyst">{item.name}</Link><CollectionActions collection={item} /></li>)}
            </ul>
            <NewCategoryButton />
          </CardContent>
        </Card>

        {collection ? <Card id="categories" className="scroll-mt-20">
          <CardHeader><CardTitle>Labels</CardTitle><CardDescription className="break-words">Labels for {collection.name}.</CardDescription></CardHeader>
          <CardContent>
            <nav aria-label="Labels by category" className="mb-4 flex gap-4 overflow-x-auto border-b border-white/[0.08]">
              {collections.map((item) => (
                <Link
                  key={item.id}
                  href={`/settings?collection=${item.id}#categories`}
                  aria-current={item.id === collection.id ? "page" : undefined}
                  title={item.name}
                  className={`max-w-48 shrink-0 truncate border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${item.id === collection.id ? "border-amethyst text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
            <CategoryManager key={collection.id} collectionId={collection.id} categories={categories} usage={usage} />
          </CardContent>
        </Card> : null}

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
