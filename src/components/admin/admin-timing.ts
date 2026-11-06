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

/** Publishing: how long the button has to be held. */
export const PUBLISH = { hold: 1300 };

export type ForgePace = "full" | "subtle" | "off";

/**
 * The forging sequence after the hold completes, from the moment the request is sent. The scene, its sound
 * and the Forge's reveal all read these. The answer can't land before `fuse` ends; `strike` and `settle`
 * run from the moment a successful answer is shown (the seal hits the plate at `strike`); `fail` is the
 * breakup after an error.
 */
export type ForgeTiming = {
  /** Energy gathers around the core; the camera pushes in. */
  gather: Range;
  /** The reward tokens leave their track one after another, each flight taking `flight`. */
  draw: Range;
  flight: number;
  /** The drawn energy is beaten into the seal. */
  fuse: Range;
  /** The seal's stamp into the plate: wind-up length, the impact lands at its end. */
  strike: number;
  /** After the impact: cooling, the seal sinking into the core and the camera easing back. */
  settle: number;
  fail: number;
};

export const FORGE: Record<ForgePace, ForgeTiming> = {
  full: { gather: [0, 800], draw: [300, 1550], flight: 650, fuse: [1350, 2150], strike: 420, settle: 1800, fail: 1300 },
  subtle: { gather: [0, 400], draw: [120, 820], flight: 380, fuse: [680, 1150], strike: 240, settle: 950, fail: 800 },
  off: { gather: [0, 0], draw: [0, 0], flight: 0, fuse: [0, 0], strike: 0, settle: 0, fail: 0 },
};

/** When token `index` of `count` reaches the core, in ms from the start of the sequence. */
export function drawArrival(timing: ForgeTiming, index: number, count: number) {
  const spread = Math.max(0, timing.draw[1] - timing.draw[0] - timing.flight);
  return timing.draw[0] + (count > 1 ? (spread * index) / (count - 1) : spread / 2) + timing.flight;
}

/** Session flag: the full intro plays once per browser session. */
export const INTRO_KEY = "archive:sanctum:intro";
