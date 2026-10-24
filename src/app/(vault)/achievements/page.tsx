import type { Metadata } from "next";
import { AchievementsPage } from "@/components/achievements/achievements-page";
import { loadAchievementCards } from "@/lib/data/achievements";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Achievements" };

export default async function AchievementsRoute() {
  const ctx = await requireUser();
  const [items, { data: profile }] = await Promise.all([
    loadAchievementCards(ctx),
    ctx.supabase.from("users").select("display_name, avatar_url").eq("id", ctx.userId).maybeSingle(),
  ]);
  return <AchievementsPage items={items} owner={{ name: profile?.display_name?.trim() ?? "", avatarUrl: profile?.avatar_url ?? null }} />;
}