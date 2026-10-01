import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { CategoryManager } from "@/components/categories/category-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadCategories, loadCategoryUsage } from "@/lib/data/categories";
import { requireUser } from "@/lib/supabase/auth";
import { ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireUser();
  const [{ data: profile }, categories, usage] = await Promise.all([
    ctx.supabase.from("users").select("display_name, created_at").eq("id", ctx.userId).maybeSingle(),
    loadCategories(ctx),
    loadCategoryUsage(ctx),
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
              Your own labels, usable across anime, games and other entries. Renaming updates every entry; deleting only removes the label.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryManager categories={categories} usage={usage} />
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
