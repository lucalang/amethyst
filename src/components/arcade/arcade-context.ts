"use client";

import { createContext, use, type RefObject } from "react";
import type { SoundName } from "./sound";
import type { MotionLevel } from "@/lib/preferences";
import type { GameLook } from "@/lib/game-cosmetics";

/**
 * The Arcade game context on its own, without the game shell: interface sounds anywhere in the app read it
 * (to use a game's sound settings inside a game), and importing it never pulls the games into a page.
 */
export type ArcadeContextValue = {
  rootRef: RefObject<HTMLDivElement | null>;
  play: (name: SoundName, pitch?: number) => void;
  /** Decorative effects level: the account's animation setting, "off" under reduced motion. */
  effects: MotionLevel;
  sound: boolean;
  toggleSound: () => void;
  /** Equipped minigame cosmetics (category → item slug). Purely visual; never touches game rules. */
  look: GameLook;
  setLook: (look: GameLook) => void;
};

export const ArcadeContext = createContext<ArcadeContextValue | null>(null);

export function useArcade() {
  const value = use(ArcadeContext);
  if (!value) throw new Error("useArcade must be used inside ArcadeProvider");
  return value;
}

/** The surrounding game's context, or null outside one. */
export function useOptionalArcade() {
  return use(ArcadeContext);
}
