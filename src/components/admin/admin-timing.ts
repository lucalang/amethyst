/**
 * Timings shared by the Crimson Sanctum scene, its sounds and its DOM effects, in ms.
 * Ranges are [start, end] from the beginning of the sequence.
 */

export type IntroKind = "full" | "short";

type Range = readonly [number, number];
export type IntroTiming = {
  /** The sigil starts tracing itself. */
  trace: Range;
  /** The ring spins up; the bloom flash lands at `flash`. */
  spin: Range;
  flash: number;
  /** Panels assemble from shards, staggered across this range. */
  assemble: Range;
  /** Panel text decodes. */
  decode: Range;
  end: number;
};

export const INTRO: Record<IntroKind, IntroTiming> = {
  full: { trace: [250, 1450], spin: [1150, 2250], flash: 2000, assemble: [2050, 3150], decode: [2600, 3700], end: 3800 },
  short: { trace: [0, 380], spin: [120, 700], flash: 520, assemble: [450, 1050], decode: [700, 1300], end: 1350 },
};

/** Camera flights between views: panels dissolve out, the camera travels, the next panels assemble. */
export const FLIGHT = { duration: 1450, out: [0, 420] as Range, in: [820, 1450] as Range };

/** Publishing: how long the button has to be held, and the implosion before the answer can land. */
export const PUBLISH = { hold: 1300, implode: 650, plate: 900 };

/** Session flag: the full intro plays once per browser session. */
export const INTRO_KEY = "archive:sanctum:intro";
