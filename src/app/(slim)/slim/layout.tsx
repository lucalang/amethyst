import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { SlimShell } from "@/components/slim/slim-shell";
import { loadCollections } from "@/lib/data/collections";
import { loadPreferences, loadProfile } from "@/lib/data/preferences";
import { loadOwnedCosmetics } from "@/lib/data/shop";
import { SLIM_NAME } from "@/lib/edition";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: { default: SLIM_NAME, template: `%s · ${SLIM_NAME}` } };

/**
 * The Slim edition. Same sign-in, same account, same data and the same authorization as the full app (every page
 * still calls requireUser and every query runs as the account); only the interface is smaller. It reads the
 * account's settings but never writes them, and it loads no game, reward or admin data.
 */
export default async function SlimLayout({ children }: { children: ReactNode }) {
  const ctx = await requireUser();
  // Guests only have the Arcade, and a brand-new account is set up by the full app first.
  if (ctx.guest) redirect("/");
  const [profile, preferences, collections, owned] = await Promise.all([
    loadProfile(ctx).catch(() => null),
    loadPreferences(ctx),
    loadCollections(ctx),
    // Only for the frame picker: which artwork frames this account may choose.
    loadOwnedCosmetics(ctx).catch(() => []),
  ]);
  if (!profile) redirect("/");
  return (
    <SlimShell preferences={preferences} collections={collections} ownedCosmetics={owned} name={profile.display_name?.trim() || null}>
      {children}
    </SlimShell>
  );
}
