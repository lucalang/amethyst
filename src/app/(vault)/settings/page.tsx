import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadPreferences } from "@/lib/data/preferences";
import { requireUser } from "@/lib/supabase/auth";
import { ProfileForm } from "./forms";
import { PinStyleSetting } from "./pin-style-setting";
import { SettingRow, SettingsGroup, SettingsHeader } from "./settings-ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Older links opened the labels of one collection here.
  const { collection } = await searchParams;
  if (typeof collection === "string" && collection) redirect(`/settings/labels?collection=${encodeURIComponent(collection)}`);

  const ctx = await requireUser();
  const [{ data: profile }, preferences] = await Promise.all([
    ctx.supabase.from("users").select("display_name").eq("id", ctx.userId).maybeSingle(),
    loadPreferences(ctx),
  ]);

  return (
    <>
      <SettingsHeader title="Settings" description="General preferences for your account." />

      <SettingsGroup id="display" title="Display" description="How your archive looks. Changes apply to this account on every device.">
        <div className="space-y-8">
          <SettingRow
            labelId="pin-style-label"
            label="Pinning style"
            description="Choose whether pins and progress appear on cover artwork, or keep covers clean with details below."
          >
            <PinStyleSetting value={preferences.pinStyle} labelId="pin-style-label" />
          </SettingRow>
        </div>
      </SettingsGroup>

      <SettingsGroup id="profile" title="Profile" description={<>Signed in as <span className="text-foreground">{ctx.email ?? "unknown email"}</span>.</>}>
        <ProfileForm displayName={profile?.display_name ?? ""} />
      </SettingsGroup>

      <SettingsGroup id="security" title="Security" description="Change your password, or sign out of this device. Your data is private to your account.">
        <div className="flex flex-wrap gap-2">
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
        </div>
      </SettingsGroup>
    </>
  );
}
