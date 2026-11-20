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
  /** A one-word theme shown as a tag ("Jobs", "Climate"). */
  topic: string;
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

/** The score halves for every this-much of the axis height you miss by on average. */
export const HALVING_SHARE = 0.25;

/**
 * The scoring rule, the same for every chart whatever its scale: the average miss across all drawn years is
 * measured as a share of the value axis height, and the score halves for every quarter of the height. Small misses
 * cost little and a wild guess still scores a few points: 5% off scores 87, 10% scores 76, 25% scores 50.
 */
export function scoreGuess(guesses: readonly number[], actual: readonly number[], yDomain: readonly [number, number]) {
  const span = yDomain[1] - yDomain[0];
  const averageMiss = actual.reduce((sum, value, i) => sum + Math.abs(guesses[i] - value), 0) / actual.length;
  const missShare = averageMiss / span;
  const score = Math.max(0, Math.min(100, Math.round(100 * 0.5 ** (missShare / HALVING_SHARE))));
  return { score, averageMiss, missShare };
}

export const SCORING_RULE = "Your score is out of 100. We measure how far your line is from the real one in each year you drew, average it, and compare it with the chart’s height. Every quarter of the chart’s height you’re off by on average halves your score: 5% off scores 87, 10% scores 76, 25% scores 50 and 50% scores 25. Every chart is scored the same way, whatever its units.";

/** Five bands, kind at the bottom: even a rough guess gets credit for the trend. */
export function chartVerdict(score: number) {
  if (score >= 90) return "Spot on!";
  if (score >= 78) return "Very close";
  if (score >= 62) return "Good read";
  if (score >= 45) return "Right idea";
  return "Surprising one";
}

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
