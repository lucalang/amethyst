"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CompetitionLock } from "@/lib/competitive";

/**
 * Competitive play (a tournament or a wager round): the game plays only the locked board, and runs start
 * through the competition instead of the regular run endpoint.
 */
export type Competition = {
  lock: CompetitionLock;
  /** Starts the run server-side and returns its id; rejects with a shown message when it can't. */
  start: () => Promise<string>;
  /** Called after a run's score has been reported (or failed to be). */
  onSettled?: () => void;
};

const CompetitionContext = createContext<Competition | null>(null);

export function CompetitionProvider({ value, children }: { value: Competition; children: ReactNode }) {
  return <CompetitionContext.Provider value={value}>{children}</CompetitionContext.Provider>;
}

export const useCompetition = () => useContext(CompetitionContext);

/** The locked board for this game during competitive play, or null in regular play. */
export function useCompetitionBoard(game: string): string | null {
  return useCompetitionLock(game)?.board ?? null;
}

export function useCompetitionLock(game: string): CompetitionLock | null {
  const competition = useCompetition();
  return competition?.lock.game === game ? competition.lock : null;
}
