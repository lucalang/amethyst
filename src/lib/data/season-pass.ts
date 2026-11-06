import "server-only";
import { seasonStateSchema, type SeasonState } from "@/lib/season-pass";
import type { AuthContext } from "@/lib/supabase/auth";

/** The account's Season Pass and quests (the running or most recent season unless one is named). */
export async function loadSeasonState(ctx: AuthContext, season?: string | null): Promise<SeasonState> {
  const { data, error } = await ctx.supabase.rpc("season_state", { p_season: season ?? null });
  if (error) throw error;
  return seasonStateSchema.parse(data);
}
