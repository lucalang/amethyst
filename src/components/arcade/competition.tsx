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

/**
 * How the game frame leads back during competitive play: its back button goes to the match (or tournament)
 * instead of the Arcade, the round's info shows inside the frame (so it stays visible in fullscreen), and once
 * the round is in, a floating button returns to the match without scrolling.
 */
export type ShellNav = {
  back: { href: string; label: string; short: string };
  banner: ReactNode;
  /** The round's result is in: show the floating return button. */
  done: boolean;
};

const ShellNavContext = createContext<ShellNav | null>(null);

export function ShellNavProvider({ value, children }: { value: ShellNav; children: ReactNode }) {
  return <ShellNavContext.Provider value={value}>{children}</ShellNavContext.Provider>;
}

export const useShellNav = () => useContext(ShellNavContext);

export function useCompetitionLock(game: string): CompetitionLock | null {
  const competition = useCompetition();
  return competition?.lock.game === game ? competition.lock : null;
}
