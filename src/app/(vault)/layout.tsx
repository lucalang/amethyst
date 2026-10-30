import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { AppShell } from "@/components/layout/app-shell";
import { isAdmin } from "@/lib/admin";
import { loadCollections } from "@/lib/data/collections";
import { loadPreferences, loadProfile } from "@/lib/data/preferences";
import { loadOwnedCosmetics, toAvatarDecoration } from "@/lib/data/shop";
import { measureServer } from "@/lib/data/timing";
import { isProfileBadgeId, isProfileTitleId } from "@/lib/cosmetics";
import { ensureProfile, requireUser } from "@/lib/supabase/auth";

type Profile = {
  display_name: string | null;
  avatar_url: string | null;
  avatar_decoration: string | null;
  profile_badge: string | null;
  profile_title: string | null;
  intro_seen_on: string | null;
} | null;

export default async function VaultLayout({ children }: { children: ReactNode }) {
  const ctx = await measureServer("layout.auth", requireUser);
  const loadShell = (profile: () => Promise<Profile>) => Promise.all([
    measureServer("layout.profile", profile),
    measureServer("layout.collections", () => loadCollections(ctx)),
    measureServer("layout.preferences", () => loadPreferences(ctx)),
    measureServer("layout.cosmetics", () => loadOwnedCosmetics(ctx).catch(() => [])),
    isAdmin(ctx),
  ]);
  let [profile, collections, preferences, owned, admin] = await loadShell(() => loadProfile(ctx).catch(() => null));
  if (!profile) {
    if (!(await ensureProfile(ctx))) redirect("/auth/session-expired");
    // The cached read above saw no row, so re-read the new profile directly.
    const fresh = async () =>
      (await ctx.supabase.from("users").select("display_name, avatar_url, avatar_decoration, profile_badge, profile_title, intro_seen_on").eq("id", ctx.userId).maybeSingle()).data;
    [profile, collections, preferences, owned, admin] = await loadShell(fresh);
  }
  const avatarDecoration = toAvatarDecoration(profile?.avatar_decoration);
  const badge = isProfileBadgeId(profile?.profile_badge) ? profile.profile_badge : null;
  const title = isProfileTitleId(profile?.profile_title) ? profile.profile_title : null;
  // The email is never used as a name; it only appears as private account detail.
  const account = { name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null, decoration: avatarDecoration, email: ctx.email ?? null, admin };
  const collectionIcons = Object.fromEntries(collections.map((item) => [item.id, <CollectionIcon key={item.id} icon={item.icon} className="size-full" />]));
  return (
    <AppShell
      account={account}
      collections={collections}
      collectionIcons={collectionIcons}
      userId={ctx.userId}
      introSeenOn={profile?.intro_seen_on ?? null}
      preferences={preferences}
      cosmetics={{ owned, avatarDecoration, badge, title }}
    >
      {children}
    </AppShell>
  );
}
