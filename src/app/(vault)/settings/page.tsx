import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { CategoryManager } from "@/components/categories/category-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCategories, loadCategoryUsage } from "@/lib/data/categories";
import { COLLECTIONS, isCollectionSlug } from "@/lib/collections";
import { requireUser } from "@/lib/supabase/auth";
import { ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { collection: slug } = await searchParams;
  const collection = COLLECTIONS[typeof slug === "string" && isCollectionSlug(slug) ? slug : "anime"];
  const ctx = await requireUser();
  const [{ data: profile }, categories, usage] = await Promise.all([
    ctx.supabase.from("users").select("display_name, created_at").eq("id", ctx.userId).maybeSingle(),
    loadCategories(ctx, collection.kind),
    loadCategoryUsage(ctx, collection.kind),
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

        <Card id="categories" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Categories</CardTitle>
            <CardDescription>
              Labels for {collection.label.toLowerCase()}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <nav aria-label="Category entry type" className="mb-4 flex gap-4 border-b border-white/[0.08]">
              {Object.values(COLLECTIONS).map((item) => (
                <Link
                  key={item.slug}
                  href={`/settings?collection=${item.slug}#categories`}
                  aria-current={item.slug === collection.slug ? "page" : undefined}
                  className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${item.slug === collection.slug ? "border-amethyst text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <CategoryManager key={collection.kind} kind={collection.kind} categories={categories} usage={usage} />
          </CardContent>
        </Card>

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
