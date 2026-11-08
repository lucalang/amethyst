"use client";

import { useCallback } from "react";
import { useOptionalArcade } from "@/components/arcade/game-shell";
import { playSound, type SoundName } from "@/components/arcade/sound";
import { useSettings } from "./settings-context";

/** Interface sound effects; silent while the Sound effects setting (or a game's sound toggle) is off. */
export function useUiSound() {
  const { arcadeSound } = useSettings();
  const arcade = useOptionalArcade();
  const play = arcade?.play;
  return useCallback(
    (name: SoundName, pitch?: number) => {
      if (play) play(name, pitch);
      else if (arcadeSound) playSound(name, pitch);
    },
    [arcadeSound, play],
  );
}
