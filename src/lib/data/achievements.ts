import "server-only";
import { ACHIEVEMENTS, type AchievementEvent, type AchievementNotice } from "@/lib/achievements";
import type { AuthContext } from "@/lib/supabase/auth";

export type AchievementCardData = {
  id: string;
  progress: number;
  earnedAt: string | null;
};

const eventPayload = (event: AchievementEvent): { event: string; payload: Record<string, string | number> } => {
  switch (event.type) {
    case "game_started":
      return { event: "game_started", payload: { game: event.game } };
    case "run_finished":
    case "run_progress": {
      const { type, ...payload } = event;
      return { event: type, payload };
    }
    case "gallery_open":
      return { event: "gallery_open", payload: {} };
    case "manual_rotation":
      return { event: "manual_rotation", payload: {} };
  }
};

export async function claimAchievementNotifications(ctx: AuthContext): Promise<AchievementNotice[]> {
  const { data, error } = await ctx.supabase.rpc("claim_achievement_notifications");
  if (error) return [];
  return Array.isArray(data) ? (data as AchievementNotice[]) : [];
}

export async function recordAchievementEvent(ctx: AuthContext, event: AchievementEvent): Promise<AchievementNotice[]> {
  const input = eventPayload(event);
  const { error } = await ctx.supabase.rpc("record_achievement_event", { p_event: input.event, p_payload: input.payload });
  if (error) return [];
  return claimAchievementNotifications(ctx);
}

export async function refreshArchiveAchievements(ctx: AuthContext): Promise<AchievementNotice[]> {
  const { error } = await ctx.supabase.rpc("record_achievement_event", { p_event: "archive_snapshot", p_payload: {} });
  if (error) return [];
  return claimAchievementNotifications(ctx);
}

export async function recordVerifiedSudokuCompletion(ctx: AuthContext, difficulty: "easy" | "medium" | "hard"): Promise<AchievementNotice[]> {
  const { error } = await ctx.supabase.rpc("record_achievement_event", { p_event: "sudoku_completed", p_payload: { difficulty } });
  if (error) return [];
  return claimAchievementNotifications(ctx);
}

export async function loadAchievementCards(ctx: AuthContext): Promise<AchievementCardData[]> {
  await ctx.supabase.rpc("record_achievement_event", { p_event: "backfill", p_payload: {} });
  const [progressResult, awardResult] = await Promise.all([
    ctx.supabase.from("user_achievement_progress").select("achievement_id, progress").eq("user_id", ctx.userId),
    ctx.supabase.from("user_achievements").select("achievement_id, earned_at").eq("user_id", ctx.userId),
  ]);
  if (progressResult.error || awardResult.error) throw new Error("Could not load achievements.");
  const progress = new Map((progressResult.data ?? []).map((row) => [row.achievement_id, row.progress]));
  const earned = new Map((awardResult.data ?? []).map((row) => [row.achievement_id, row.earned_at]));
  return ACHIEVEMENTS.map(({ id }) => ({ id, progress: progress.get(id) ?? 0, earnedAt: earned.get(id) ?? null }));
}