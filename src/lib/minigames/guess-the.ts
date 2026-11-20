import * as z from "zod";

/**
 * Guess The ...: a family of guessing games under one Arcade cabinet (id "guess-the"). Each mode has its own page
 * under /arcade/guess-the/<mode> and keeps its own personal record in the `guess-the:<mode>` variant. Add a mode
 * by adding it here, giving it a page and allowing its variant in `arcade_records_game_valid`.
 */
export const GUESS_THE_GAME = "guess-the" as const;

export type GuessTheMode = {
  id: string;
  title: string;
  blurb: string;
  href: string;
  /** What the mode's record measures. */
  recordLabel: string;
};

export const GUESS_THE_MODES = [
  {
    id: "chart",
    title: "Guess the Chart",
    blurb: "See how a real-world chart began, then draw how you think it carried on. The real line is revealed when you submit.",
    href: "/arcade/guess-the/chart",
    recordLabel: "Best accuracy",
  },
] as const satisfies readonly GuessTheMode[];

export type GuessTheModeId = (typeof GUESS_THE_MODES)[number]["id"];
export const GUESS_THE_MODE_IDS: readonly string[] = GUESS_THE_MODES.map((mode) => mode.id);
export const guessTheMode = (id: string) => GUESS_THE_MODES.find((mode) => mode.id === id);

// ---------------------------------------------------------------------------------------------
// Guess the Chart

/** What the player sees before guessing: never any value after `cutoff`. */
export type ChartPuzzle = {
  id: string;
  title: string;
  subtitle: string;
  /** The value axis unit, e.g. "%" or "US dollars per barrel". */
  unit: string;
  /** How values print: decimals plus an optional prefix/suffix ("$", "%", " ppm"). */
  format: { decimals: number; prefix?: string; suffix?: string };
  /** The fixed value axis. It is chosen to fit the whole series with room to spare, so it doesn't give the answer away. */
  yDomain: readonly [number, number];
  firstYear: number;
  lastYear: number;
  /** The last year shown; the player draws every year after it. */
  cutoff: number;
  /** [year, value] up to and including `cutoff`. */
  visible: readonly (readonly [number, number])[];
  source: ChartSource;
};

export type ChartSource = {
  /** Who produced the data. */
  publisher: string;
  /** The dataset as published (with series id where there is one). */
  dataset: string;
  url: string;
  /** How the annual values were derived and anything left out. */
  note: string;
  /** When Amethyst downloaded the data. It is a curated snapshot, not live. */
  retrieved: string;
};

/** The revealed answer and how the guess scored. */
export type ChartResult = {
  actual: readonly (readonly [number, number])[];
  score: number;
  /** Mean absolute difference, in the chart's units. */
  averageMiss: number;
  /** That miss as a share of the value axis height (0–1). */
  missShare: number;
};

/** Each 1% of the axis height you miss by on average costs this many points. */
export const POINTS_PER_PERCENT = 4;

/**
 * The scoring rule, the same for every chart whatever its scale: the average miss across all drawn years is
 * measured as a share of the value axis height, and every 1% of height costs 4 points. Missing by a quarter of
 * the height or more on average scores 0.
 */
export function scoreGuess(guesses: readonly number[], actual: readonly number[], yDomain: readonly [number, number]) {
  const span = yDomain[1] - yDomain[0];
  const averageMiss = actual.reduce((sum, value, i) => sum + Math.abs(guesses[i] - value), 0) / actual.length;
  const missShare = averageMiss / span;
  const score = Math.max(0, Math.round(100 - missShare * 100 * POINTS_PER_PERCENT));
  return { score, averageMiss, missShare };
}

export const SCORING_RULE = `Your score is out of 100. We take how far your line is from the real one in each year you drew, average it, and compare that to the height of the chart: every 1% of the chart’s height you’re off by on average costs ${POINTS_PER_PERCENT} points, so being off by a quarter of the height or more scores 0. Every chart is scored the same way, whatever its units.`;

export const chartGuessSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    /** One value per year after the cutoff, in order. */
    guesses: z.array(z.number().finite()).min(1).max(200),
  })
  .strict();

export function formatChartValue(format: ChartPuzzle["format"], value: number) {
  const fixed = Math.abs(value).toLocaleString("en", { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals });
  return `${value < 0 ? "−" : ""}${format.prefix ?? ""}${fixed}${format.suffix ?? ""}`;
}
