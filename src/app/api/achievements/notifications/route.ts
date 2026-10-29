import { claimAchievementNotifications } from "@/lib/data/achievements";
import { dbError, jsonResponse, requireApiUser } from "@/lib/http";

export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { data: reconciled, error } = await ctx.supabase.rpc("reconcile_achievements");
  if (error) return dbError(error, "Could not reconcile achievements.");
  return jsonResponse({ achievementUnlocks: await claimAchievementNotifications(ctx), achievementReconciled: Boolean(reconciled) });
}