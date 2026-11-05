import type { MotionLevel } from "@/lib/preferences";

/**
 * The Vault's timeline in milliseconds, shared by the 3D scene, the page and the sound so all three tell one story.
 */

/** "full" plays the first time in a browser session; later visits get the short re-summon. */
export type SummonKind = "full" | "short";

export type SummonTimeline = {
  total: number;
  /** The sigil behind the vault traces itself in the dark. */
  trace: readonly [number, number];
  /** The rings spin up toward the flash. */
  spin: readonly [number, number];
  /** The core flares; the camera pulls back from the door. */
  flash: number;
  /** The console's glass flies together from shards. */
  assemble: readonly [number, number];
  /** Its text decodes. */
  decode: readonly [number, number];
  /** The header arrives. */
  hud: number;
};

/** The Admin panel's ignition, played on the vault. */
export const SUMMON: Record<SummonKind, SummonTimeline> = {
  full: { total: 3800, trace: [250, 1450], spin: [1150, 2250], flash: 2000, assemble: [2050, 3150], decode: [2600, 3700], hud: 2600 },
  short: { total: 1350, trace: [0, 380], spin: [120, 700], flash: 520, assemble: [450, 1050], decode: [700, 1300], hud: 600 },
};

/** A scene that finishes loading after the entrance only assembles the console frame behind the controls. */
export const LATE_ASSEMBLY = 900;

/**
 * The unlock after a confirmed grant. The core flashes and the hub's key turns; the outer ring, the inner ring
 * and the dial lock in turn (`locks`, each taking `lockTime`); the eight bolts retract one after another from
 * `retract`; pressure vents through the seams at `vent`; the iris swings open from `open` (over `openTime`) and
 * the light breaks out at `burst`. At `handoff` the cards take over the page and the first leaves the core at `reveal`.
 */
export const UNLOCK = {
  locks: [320, 560, 800],
  lockTime: 260,
  retract: 1000,
  retractStep: 40,
  retractTime: 200,
  vent: 1460,
  open: 1700,
  openTime: 950,
  burst: 2020,
  handoff: 2400,
  reveal: 2850,
} as const;

/** Gap between reward cards as they leave the vault. */
export const CARD_STAGGER = 110;

/**
 * Sending a code: the typed glyphs stream off the console, a packet leaves the link port at `depart`, runs
 * the link and hits the seal at `impact`; the vault is fully charged at `charged`, then breathes once per
 * `breath` until the answer arrives. A rejected packet takes `recoil` to fly back and hit the console.
 */
export const TRANSMIT = { glyph: 340, glyphStep: 18, depart: 420, impact: 840, charged: 1000, breath: 1100, recoil: 420 } as const;

/** Subtle motion plays every one-shot sequence at this share of its full length. */
export const PACE: Record<MotionLevel, number> = { full: 1, subtle: 0.45, off: 0 };
