import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { MalConnectionCard } from "@/components/sync/mal-connection-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { malConfig } from "@/lib/env";
import { requireUser } from "@/lib/supabase/auth";
import { ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireUser();
  const [{ data: profile }, { data: account }] = await Promise.all([
    ctx.supabase.from("users").select("display_name, created_at").eq("id", ctx.userId).maybeSingle(),
    ctx.supabase.from("mal_accounts").select("*").eq("user_id", ctx.userId).maybeSingle(),
  ]);

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Settings" description="Account, security and connected services." />
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

        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Accounts are invite-only. Magic links never create new accounts.</CardDescription>
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

        <MalConnectionCard account={account} configured={malConfig() !== null} />
      </div>
    </PageContainer>
  );
}
