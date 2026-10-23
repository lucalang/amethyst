import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { loadCollections } from "@/lib/data/collections";
import { loadPreferences } from "@/lib/data/preferences";
import { ensureProfile, requireUser } from "@/lib/supabase/auth";

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUser();
  let { data: profile } = await ctx.supabase.from("users").select("display_name, intro_seen_on").eq("id", ctx.userId).maybeSingle();
  if (!profile) {
    if (!(await ensureProfile(ctx))) redirect("/auth/session-expired");
    ({ data: profile } = await ctx.supabase.from("users").select("display_name, intro_seen_on").eq("id", ctx.userId).maybeSingle());
  }
  const displayName = profile?.display_name || ctx.email || "Account";
  const [collections, preferences] = await Promise.all([loadCollections(ctx), loadPreferences(ctx)]);
  return (
    <AppShell
      displayName={displayName}
      collections={collections}
      userId={ctx.userId}
      introSeenOn={profile?.intro_seen_on ?? null}
      preferences={preferences}
    >
      {children}
    </AppShell>
  );
}
