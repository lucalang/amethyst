import type { Metadata } from "next";
import { Tour } from "@/components/tour/tour";
import { isAdmin } from "@/lib/admin";
import { loadPreferences } from "@/lib/data/preferences";
import { getAuthContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "Tour",
  description: "A scrolling 3D tour of Amethyst: the Archive, To Do, the Arcade, Coin Slots, the Vault, the Lab, customization and achievements.",
};

/** Public product tour; signed-in visitors keep their motion setting. */
export default async function TourPage() {
  const ctx = await getAuthContext();
  const [motion, admin] = ctx ? await Promise.all([loadPreferences(ctx).then((preferences) => preferences.motion), isAdmin(ctx)]) : (["full", false] as const);
  return <Tour signedIn={Boolean(ctx)} admin={admin} motion={motion} />;
}
