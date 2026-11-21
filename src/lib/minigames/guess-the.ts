import * as z from "zod";

/**
 * Guess The ...: a family of guessing games under one Arcade cabinet (id "guess-the"). Each mode has its own page
 * under /arcade/guess-the/<mode> and keeps its own personal record in the `guess-the:<mode>` variant. Add a mode
 * by adding it here, giving it a page and allowing its variant in `arcade_records_game_valid`. Round-based modes
 * (every mode except the chart) also add a prompt set to guess-the-rounds.ts; /api/arcade/guess-the/<mode> then
 * deals, reveals and scores them, and RoundGame plays them.
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
  {
    id: "flag",
    title: "Guess the Flag",
    blurb: "Ten flags, one at a time. Type the country each one belongs to; close spellings and common names count.",
    href: "/arcade/guess-the/flag",
    recordLabel: "Best round",
  },
  {
    id: "size",
    title: "Guess the Real Size",
    blurb: "Two things side by side. Resize one until it matches its real size next to the other, then see the true comparison.",
    href: "/arcade/guess-the/size",
    recordLabel: "Best round",
  },
  {
    id: "price",
    title: "Guess the Price",
    blurb: "Real prices with a date, a market and a source: launch prices, postage and record auction results. How close can you get?",
    href: "/arcade/guess-the/price",
    recordLabel: "Best round",
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

// ---------------------------------------------------------------------------------------------
// Round modes: a round deals a few prompts; each is revealed as soon as it's answered, and the server re-scores the
// whole round before saving the record. Round scores are out of 100 like the chart.

export const ROUND_MODES = ["flag", "size", "price"] as const;
export type RoundModeId = (typeof ROUND_MODES)[number];
export const isRoundMode = (value: string): value is RoundModeId => (ROUND_MODES as readonly string[]).includes(value);

/** Prompts per round. Flags are quick, so there are more of them. */
export const ROUND_SIZE: Record<RoundModeId, number> = { flag: 10, size: 5, price: 5 };

export type SourceRef = {
  /** Who published the figure. */
  publisher: string;
  /** The page it comes from. */
  title: string;
  url: string;
};

export type FlagPrompt = {
  id: string;
  /** The flag artwork as an SVG data URI (shown in an <img>, so it can't carry markup). */
  image: string;
};
export type FlagResult = {
  correct: boolean;
  /** The country's usual English name. */
  answer: string;
  /** What the guess was read as, when a close spelling or alias was accepted. */
  matched: string | null;
  score: number;
};

export type SizeArt =
  | "earth"
  | "moon"
  | "mars"
  | "jupiter"
  | "sun"
  | "eiffel"
  | "liberty"
  | "burj"
  | "empire-state"
  | "saturn-v"
  | "a380"
  | "b737"
  | "card"
  | "quarter"
  | "dollar"
  | "a4"
  | "football"
  | "tennis-ball"
  | "golf-ball"
  | "tennis-court"
  | "badminton-court"
  | "pool";
export type SizeThing = {
  name: string;
  /** Exactly what is measured ("to the tip of the antenna"). */
  detail: string;
  art: SizeArt;
  /** Width ÷ height of the artwork's box. */
  aspect: number;
  /** Which side of the artwork is the measured dimension. */
  axis: "height" | "width";
};
export type SizePrompt = {
  id: string;
  topic: string;
  /** The dimension both things are compared by ("height", "diameter"). */
  dimension: string;
  /** Fixed size. */
  reference: SizeThing;
  /** The one the player resizes. */
  subject: SizeThing;
  /** The slider's range, as subject ÷ reference. Wide and never centred on the answer. */
  range: readonly [number, number];
};
export type SizeResult = {
  score: number;
  /** subject ÷ reference, really and as guessed. */
  actual: number;
  guess: number;
  reference: { value: number; unit: string };
  subject: { value: number; unit: string };
  note: string;
  sources: readonly SourceRef[];
};

export type PriceCurrency = "USD" | "GBP" | "CHF";
export type PricePrompt = {
  id: string;
  /** "Launch price", "Auction record", "Postage". */
  kind: string;
  name: string;
  /** Model, market, condition and date: what exactly the price is for. */
  detail: string;
  currency: PriceCurrency;
  icon: PriceIcon;
};
export type PriceIcon = "phone" | "console" | "headset" | "board" | "painting" | "stamp" | "dinosaur" | "jersey" | "bricks" | "card" | "road" | "music";
export type PriceResult = {
  score: number;
  actual: number;
  guess: number;
  /** What's included and when (fees, taxes). */
  note: string;
  date: string;
  source: SourceRef;
};

export type RoundPrompt = { flag: FlagPrompt; size: SizePrompt; price: PricePrompt };
export type RoundResult = { flag: FlagResult; size: SizeResult; price: PriceResult };

/** What a player sends for one prompt: a typed country name, a size ratio or a price. */
export const roundGuessSchema = {
  flag: z.string().trim().max(80),
  size: z.number().finite().positive().max(1e6),
  price: z.number().finite().positive().max(1e13),
} as const;

const promptId = z.string().regex(/^[a-z0-9-]{1,40}$/);
export const roundRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reveal"), id: promptId, guess: z.union([z.string().max(80), z.number()]) }).strict(),
  z
    .object({
      action: z.literal("finish"),
      answers: z.array(z.object({ id: promptId, guess: z.union([z.string().max(80), z.number()]) }).strict()).min(1).max(20),
    })
    .strict(),
]);

/** Points per flag. */
export const FLAG_POINTS = 10;

/**
 * Size and price guesses are scored on how many times too big or too small they are, so a guess of half or double
 * scores the same, and a 10% miss means the same for a coin as for a planet. The score halves every time the guess is
 * off by another factor of √2 (41% too high or 29% too low): 10% off scores 83, 25% off 64, double or half 25.
 */
export const RATIO_HALVING = Math.SQRT2;
export function ratioScore(guess: number, actual: number) {
  if (!(guess > 0) || !(actual > 0)) return 0;
  const off = Math.abs(Math.log(guess / actual)) / Math.log(RATIO_HALVING);
  return Math.max(0, Math.min(100, Math.round(100 * 0.5 ** off)));
}

export const ROUND_SCORING: Record<RoundModeId, string> = {
  flag: `Each round has ${ROUND_SIZE.flag} flags, worth ${FLAG_POINTS} points each, so a perfect round scores 100. Close spellings, accents left out and common short names (“USA”, “UK”, “Czech Republic”) all count; naming a different country doesn’t.`,
  size: `Each round has ${ROUND_SIZE.size} comparisons, each scored out of 100, and your round score is their average. A comparison is scored by how many times too big or too small your guess is: every time you’re off by another factor of 1.41 the score halves, so 10% off scores 83, 25% off scores 64 and double or half scores 25.`,
  price: `Each round has ${ROUND_SIZE.price} prices, each scored out of 100, and your round score is their average. A price is scored by how many times too high or too low your guess is: every time you’re off by another factor of 1.41 the score halves, so 10% off scores 83, 25% off scores 64 and double or half scores 25.`,
};

export function roundVerdict(score: number) {
  if (score >= 90) return "Outstanding!";
  if (score >= 75) return "Excellent round";
  if (score >= 55) return "Good round";
  if (score >= 35) return "Not bad";
  return "Tough round";
}

const CURRENCY_SYMBOL: Record<PriceCurrency, string> = { USD: "$", GBP: "£", CHF: "CHF " };
export function formatPrice(currency: PriceCurrency, value: number) {
  const decimals = value < 10 && value % 1 !== 0 ? 2 : 0;
  return `${CURRENCY_SYMBOL[currency]}${value.toLocaleString("en", { minimumFractionDigits: decimals, maximumFractionDigits: 2 })}`;
}
export function formatMeasure(value: number, unit: string) {
  const digits = value >= 1000 ? 0 : value >= 100 ? 1 : 2;
  return `${Number(value.toFixed(digits)).toLocaleString("en")} ${unit}`;
}
