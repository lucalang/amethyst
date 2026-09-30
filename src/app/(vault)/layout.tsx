import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ensureProfile, requireUser } from "@/lib/supabase/auth";

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUser();
  let { data: profile } = await ctx.supabase.from("users").select("display_name").eq("id", ctx.userId).maybeSingle();
  if (!profile) {
    if (!(await ensureProfile(ctx))) redirect("/auth/session-expired");
    ({ data: profile } = await ctx.supabase.from("users").select("display_name").eq("id", ctx.userId).maybeSingle());
  }
  const displayName = profile?.display_name || ctx.email || "Account";
  return <AppShell displayName={displayName}>{children}</AppShell>;
}
