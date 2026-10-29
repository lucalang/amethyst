import type { Palette } from "./engine";

/**
 * Each canvas game's own colors. They are fixed so the playfield keeps its identity whatever the
 * app theme; the matching page colors live in the game's [data-game-skin] block in globals.css.
 */
export const GAME_PALETTES = {
  /** Daytime sky, green pipes, a sandy ground and an orange bird. */
  flutter: { background: "#70c5ce", surface: "#ded895", foreground: "#1e3440", muted: "#4a6572", accent: "#5cb83a", accent2: "#ff7a45", dark: false },
  /** A dark wooden chopping board with bright fruit and a red bomb. */
  "fruit-slice": { background: "#3b2414", surface: "#6b4423", foreground: "#fff4e0", muted: "#d8b98f", accent: "#e8a33d", accent2: "#ff4d4d", dark: true },
  /** A dusk city sky with warm orange-to-pink blocks. */
  stacker: { background: "#1b2647", surface: "#2c3b66", foreground: "#f4f1ff", muted: "#aab3d6", accent: "#ffb347", accent2: "#ff5e7e", dark: true },
} satisfies Record<string, Palette>;
