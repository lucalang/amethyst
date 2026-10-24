import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { ProfileForm } from "../forms";
import { SettingsGroup, SettingsHeader } from "../settings-ui";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileSettingsPage() {
  const ctx = await requireUser();
  const { data: profile } = await ctx.supabase.from("users").select("display_name, avatar_url, motto").eq("id", ctx.userId).maybeSingle();

  return (
    <>
      <SettingsHeader
        title="Profile"
        description="How the archive greets you on Home and in your achievement cabinet. Your profile is private to your account — nobody else can see it."
      />
      <SettingsGroup id="profile" title="Your profile">
        <ProfileForm displayName={profile?.display_name ?? ""} motto={profile?.motto ?? ""} avatarUrl={profile?.avatar_url ?? ""} />
      </SettingsGroup>
      <SettingsGroup id="sign-in" title="Sign-in details">
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Signed in as <span className="text-foreground">{ctx.email ?? "unknown email"}</span>. Your sign-in email is never used as your name, and changing your
          profile doesn’t change how you sign in. To change your password, go to{" "}
          <Link href="/settings/password" className="text-amethyst underline-offset-4 hover:underline">
            Change password
          </Link>
          .
        </p>
      </SettingsGroup>
    </>
  );
}
