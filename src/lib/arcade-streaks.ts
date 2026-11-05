import { z } from "zod";
import { ARCADE_GAMES, type ArcadeGameId } from "@/lib/arcade";

/** A game's daily play streak (UTC days). Recovery prices come from the server. */
export type ArcadeStreak = {
  game: ArcadeGameId;
  current: number;
  best: number;
  playedToday: boolean;
  /** Yesterday was missed but the day before was played: it can be bought back once today is played. */
  recovery: { date: string; streak: number; cost: number; ready: boolean } | null;
};

export type ArcadeStreaks = Record<ArcadeGameId, ArcadeStreak>;

type StreakRow = {
  game: string;
  current_streak: number;
  best_streak: number;
  played_today: boolean;
  recover_date: string | null;
  recover_streak: number | null;
  recover_cost: number | null;
  recover_ready: boolean;
};

/** Every registered game, with zeros for games not played yet. */
export function toArcadeStreaks(rows: readonly StreakRow[]): ArcadeStreaks {
  const byGame = new Map(rows.map((row) => [row.game, row]));
  return Object.fromEntries(
    ARCADE_GAMES.map(({ id }) => {
      const row = byGame.get(id);
      const streak: ArcadeStreak = {
        game: id,
        current: row?.current_streak ?? 0,
        best: row?.best_streak ?? 0,
        playedToday: row?.played_today ?? false,
        recovery:
          row?.recover_date && row.recover_streak && row.recover_cost
            ? { date: row.recover_date, streak: row.recover_streak, cost: row.recover_cost, ready: row.recover_ready }
            : null,
      };
      return [id, streak];
    }),
  ) as ArcadeStreaks;
}

export const recoverStreakSchema = z
  .object({
    game: z.enum(ARCADE_GAMES.map((game) => game.id) as [ArcadeGameId, ...ArcadeGameId[]]),
    expectedCost: z.number().int().min(1).max(10_000),
  })
  .strict();

export type StreakRecovery = { status: "recovered" | "already"; balance: number; cost: number; streak: number };

/** Fired after the server may have counted today's play, so streak displays refresh. */
export const ARCADE_PLAYED_EVENT = "archive:arcade-played";

export function announcePlayed() {
  window.dispatchEvent(new Event(ARCADE_PLAYED_EVENT));
}

export const dayWord = (count: number) => `${count} day${count === 1 ? "" : "s"}`;
