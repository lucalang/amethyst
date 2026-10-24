import type { Metadata } from "next";
import { AchievementsPage } from "@/components/achievements/achievements-page";
import { loadAchievementCards } from "@/lib/data/achievements";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Achievements" };

export default async function AchievementsRoute() {
  const items = await loadAchievementCards(await requireUser());
  return <AchievementsPage items={items} />;
}