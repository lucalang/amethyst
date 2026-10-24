import { claimAchievementNotifications } from "@/lib/data/achievements";
import { jsonResponse, requireApiUser } from "@/lib/http";

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  return jsonResponse({ achievementUnlocks: await claimAchievementNotifications(ctx) });
}