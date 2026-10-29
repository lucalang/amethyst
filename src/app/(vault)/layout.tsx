import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { AppShell } from "@/components/layout/app-shell";
import { loadCollections } from "@/lib/data/collections";
import { loadPreferences } from "@/lib/data/preferences";
import { loadOwnedCosmetics, toAvatarDecoration } from "@/lib/data/shop";
import { measureServer } from "@/lib/data/timing";
import { ensureProfile, requireUser } from "@/lib/supabase/auth";

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const ctx = await measureServer("layout.auth", requireUser);
  const columns = "display_name, avatar_url, avatar_decoration, intro_seen_on";
  const loadShell = () => Promise.all([
    measureServer("layout.profile", () => ctx.supabase.from("users").select(columns).eq("id", ctx.userId).maybeSingle()),
    measureServer("layout.collections", () => loadCollections(ctx)),
    measureServer("layout.preferences", () => loadPreferences(ctx)),
    measureServer("layout.cosmetics", () => loadOwnedCosmetics(ctx).catch(() => [])),
  ]);
  let [{ data: profile }, collections, preferences, owned] = await loadShell();
  if (!profile) {
    if (!(await ensureProfile(ctx))) redirect("/auth/session-expired");
    [{ data: profile }, collections, preferences, owned] = await loadShell();
  }
  const avatarDecoration = toAvatarDecoration(profile?.avatar_decoration);
  // The email is never used as a name; it only appears as private account detail.
  const account = { name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null, decoration: avatarDecoration, email: ctx.email ?? null };
  const collectionIcons = Object.fromEntries(collections.map((item) => [item.id, <CollectionIcon key={item.id} icon={item.icon} className="size-full" />]));
  return (
    <AppShell
      account={account}
      collections={collections}
      collectionIcons={collectionIcons}
      userId={ctx.userId}
      introSeenOn={profile?.intro_seen_on ?? null}
      preferences={preferences}
      cosmetics={{ owned, avatarDecoration }}
    >
      {children}
    </AppShell>
  );
}
