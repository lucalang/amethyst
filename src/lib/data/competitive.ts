import "server-only";
import type { CompetitiveGame, TournamentState, WagerList, WagerState } from "@/lib/competitive";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { isShopGame } from "@/lib/game-cosmetics";
import type { AuthContext } from "@/lib/supabase/auth";
import type { WhoAmIState } from "@/lib/who-am-i";

/** A game's personal records keyed by board ("" = default) and the equipped look, for a competitive play page. */
export async function loadCompetitivePlay(ctx: AuthContext, game: Exclude<CompetitiveGame, "who-am-i">) {
  // Games without a shop (Sumbreak) play with the default look.
  const [all, look] = await Promise.all([loadArcadeRecords(ctx), isShopGame(game) ? loadGameLoadout(ctx, game) : Promise.resolve({})]);
  const records: Record<string, number> = {};
  for (const [key, score] of Object.entries(all)) {
    if (score === undefined) continue;
    if (key === game) records[""] = score;
    else if (key.startsWith(`${game}:`)) records[key.slice(game.length + 1)] = score;
  }
  return { records, look };
}

export async function loadTournamentState(ctx: AuthContext, day?: string | null): Promise<TournamentState> {
  const { data, error } = await ctx.supabase.rpc("tournament_state", { p_day: day ?? null });
  if (error) throw error;
  return data as unknown as TournamentState;
}

export async function loadWagerList(ctx: AuthContext): Promise<WagerList> {
  const { data, error } = await ctx.supabase.rpc("wager_list");
  if (error) throw error;
  return data as unknown as WagerList;
}

/** Null when the wager doesn't exist or isn't visible to this member. */
export async function loadWagerState(ctx: AuthContext, id: string): Promise<WagerState | null> {
  const { data, error } = await ctx.supabase.rpc("wager_state", { p_wager: id });
  if (error) {
    if (error.hint === "wager_not_found" || error.code === "22P02") return null;
    throw error;
  }
  return data as unknown as WagerState;
}

/** A Who Am I? round as this player may see it; null when it isn't theirs. */
export async function loadWhoAmIState(ctx: AuthContext, id: string, round: number): Promise<WhoAmIState | null> {
  const { data, error } = await ctx.supabase.rpc("whoami_state", { p_wager: id, p_round: round });
  if (error) {
    if (error.hint === "wager_not_found" || error.code === "22P02") return null;
    throw error;
  }
  return data as unknown as WhoAmIState;
}
