/**
 * The Vault's timeline in milliseconds, shared by the 3D scene, the page and the sound so all three tell one story.
 */

/** "full" plays the first time in a browser session; later visits get the short re-summon. */
export type SummonKind = "full" | "short";

export type SummonTimeline = {
  total: number;
  /** The artifact starts to climb out of the dark. */
  rise: number;
  /** The access console starts to rise and turn toward the viewer. */
  console: number;
  /** Its frame pieces fly in and assemble around it. */
  assemble: number;
  /** Everything locks into place. */
  lock: number;
  /** The console's screen powers on (the page's controls appear). */
  panel: number;
  hud: number;
  settle: number;
};

export const SUMMON: Record<SummonKind, SummonTimeline> = {
  // Seams glow in the dark; light builds; the vault climbs out; the console rises, turns, assembles and powers on.
  full: { total: 3400, rise: 450, console: 1050, assemble: 1750, lock: 2500, panel: 2600, hud: 1600, settle: 3000 },
  short: { total: 1300, rise: 0, console: 60, assemble: 420, lock: 850, panel: 900, hud: 120, settle: 1100 },
};

/** A scene that finishes loading after the entrance only assembles the console frame behind the controls. */
export const LATE_ASSEMBLY = 900;

/**
 * The unlock after a confirmed grant: rings align, teeth retract, the door segments swing open, then the
 * rewards come out. `handoff` is when the console has moved aside and the rewards take over the page.
 */
export const UNLOCK = { retract: 300, open: 560, burst: 650, settle: 1500, handoff: 700 } as const;

/** Gap between reward cards as they leave the vault. */
export const CARD_STAGGER = 110;
