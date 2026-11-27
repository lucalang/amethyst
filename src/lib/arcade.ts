import * as z from "zod";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { MAX_PUZZLE_LEVEL, PUZZLE_DIFFICULTIES, isLevelsVariant, levelsBoard, type PuzzleDifficulty } from "@/lib/minigames/levels";
import { GUESS_THE_MODE_IDS } from "@/lib/minigames/guess-the";
import { SUMBREAK_LEVEL_VARIANTS } from "@/lib/minigames/sumbreak";
import { ZIP_LEVEL_VARIANTS } from "@/lib/minigames/zip";
import { isSnakeVariant } from "@/lib/snake";
import { SUDOKU_SIZES, sudokuProgressValid, type SudokuSize, type SudokuSlot } from "@/lib/sudoku";

/** Games with a single higher-is-better record (Sudoku keeps fastest times per difficulty). */
export const SCORE_GAMES = ["2048", "flutter", "snake", "fruit-slice", "stacker", "gem-chase", "space-blaster", "zip", "patches", "tango", "queens", "sumbreak", "paper-trails", "front-wars", "blank-atlas", "the-ascent", "guess-the"] as const;
export type ScoreGame = (typeof SCORE_GAMES)[number];
export type ArcadeGameId = ScoreGame | "sudoku" | "who-am-i";

/**
 * Games that keep only a personal record. They have no coin runs, so they also have no leaderboards, streaks,
 * Tournaments or Wagers (all of which are built on runs). Everything that lists those reads `RankedGameId`.
 */
export const RECORD_ONLY_GAMES = ["front-wars", "blank-atlas", "the-ascent", "guess-the"] as const;
export type RecordOnlyGame = (typeof RECORD_ONLY_GAMES)[number];
/**
 * Head-to-head games: a bot match outside Wagers and a live duel inside them. They have no coin runs, records,
 * leaderboards, streaks or Tournaments; Wagers list them through `COMPETITIVE_GAME_IDS` (src/lib/competitive.ts).
 */
export const HEAD_TO_HEAD_GAMES = ["who-am-i"] as const;
export type HeadToHeadGame = (typeof HEAD_TO_HEAD_GAMES)[number];
export type RankedGameId = Exclude<ArcadeGameId, RecordOnlyGame | HeadToHeadGame>;
export type RankedScoreGame = Exclude<ScoreGame, RecordOnlyGame>;
export const isRankedGame = (id: ArcadeGameId): id is RankedGameId =>
  !(RECORD_ONLY_GAMES as readonly string[]).includes(id) && !(HEAD_TO_HEAD_GAMES as readonly string[]).includes(id);
export const RANKED_SCORE_GAMES = SCORE_GAMES.filter((game): game is RankedScoreGame => isRankedGame(game)) as [RankedScoreGame, ...RankedScoreGame[]];

export const SUDOKU_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type SudokuDifficulty = (typeof SUDOKU_DIFFICULTIES)[number];
export const SUDOKU_LABELS: Record<SudokuDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/**
 * The Arcade's two shelves. A game's category only decides where the hub shows it: ids, routes, records,
 * leaderboards, streaks and cosmetics are the same in both. Add a game to a shelf by giving it that `category`.
 */
export const ARCADE_CATEGORIES = [
  {
    id: "full",
    title: "Full Games",
    description: "Bigger games built for longer sessions, with progression, upgrades and runs that build on each other.",
  },
  {
    id: "minigames",
    title: "Minigames",
    description: "Quick puzzles and casual games for a break: pick one up, set a record, play again.",
  },
] as const;
export type ArcadeCategoryId = (typeof ARCADE_CATEGORIES)[number]["id"];

export type ArcadeGame = {
  id: ArcadeGameId;
  title: string;
  href: string;
  blurb: string;
  /** What the record measures, shown next to it. */
  recordLabel: string;
  category: ArcadeCategoryId;
  /** Full Games only: a few things the game offers, shown as tags on its card. */
  features?: readonly string[];
};

/** Every game, in the order other lists (leaderboards, streaks, wagers) show them. The hub groups by category. */
export const ARCADE_GAMES: readonly ArcadeGame[] = [
  { id: "2048", title: "2048", href: "/arcade/2048", blurb: "Slide matching tiles together and build up to 2048.", recordLabel: "Best score", category: "minigames" },
  { id: "flutter", title: "Flutter", href: "/arcade/flutter", blurb: "Tap to keep a little gem-bird aloft through the crystal pillars.", recordLabel: "Best score", category: "minigames" },
  { id: "snake", title: "Snake", href: "/arcade/snake", blurb: "Eat, grow longer and never bite your own tail.", recordLabel: "Best score", category: "minigames" },
  { id: "sudoku", title: "Sudoku", href: "/arcade/sudoku", blurb: "Mini 4×4, Normal 9×9 and XXL 16×16 logic puzzles. Pick up where you left off.", recordLabel: "Fastest times", category: "minigames" },
  { id: "fruit-slice", title: "Fruit Slice", href: "/arcade/fruit-slice", blurb: "Swipe through flying fruit, chain combos and steer clear of bombs.", recordLabel: "Best score", category: "minigames" },
  { id: "stacker", title: "Tower Stacker", href: "/arcade/stacker", blurb: "Drop each sliding block right on top. Only the overlap stays.", recordLabel: "Highest tower", category: "minigames" },
  { id: "gem-chase", title: "Gem Chase", href: "/arcade/gem-chase", blurb: "Collect every glimmer in the maze while four shades give chase. Prisms turn the tables.", recordLabel: "Best score", category: "minigames" },
  {
    id: "space-blaster",
    title: "Space Blaster",
    href: "/arcade/space-blaster",
    blurb: "A roguelite shooter: clear waves, stack upgrades and outgun ever tougher enemies and bosses.",
    recordLabel: "Best score",
    category: "full",
    features: ["Roguelite runs", "Upgrades", "Boss waves"],
  },
  {
    id: "front-wars",
    title: "Front Wars",
    href: "/arcade/front-wars",
    blurb: "Conquer the world against real-country Nations and hundreds of Bots: spawn, flood across open land, and hold 72% of the map.",
    recordLabel: "Best score",
    category: "full",
    features: ["World map", "Up to 484 rivals", "Real-time strategy"],
  },
  { id: "zip", title: "Zip", href: "/arcade/zip", blurb: "Draw one path through every cell, passing the numbers in order.", recordLabel: "Highest level", category: "minigames" },
  { id: "patches", title: "Patches", href: "/arcade/patches", blurb: "Split the grid into rectangles: one clue each, sized and shaped as it says.", recordLabel: "Highest level", category: "minigames" },
  { id: "tango", title: "Tango", href: "/arcade/tango", blurb: "Fill the grid with suns and moons, balanced in every row and column.", recordLabel: "Highest level", category: "minigames" },
  { id: "queens", title: "Queens", href: "/arcade/queens", blurb: "Place one crown in every row, column and color region, never touching.", recordLabel: "Highest level", category: "minigames" },
  { id: "sumbreak", title: "Sumbreak", href: "/arcade/sumbreak", blurb: "Merge equal neighbours into their sum until a single tile is left. Order is everything.", recordLabel: "Highest level", category: "minigames" },
  {
    id: "paper-trails",
    title: "Paper Trails",
    href: "/arcade/paper-trails",
    blurb: "Leave your land, draw a trail and loop back home to claim the paper. Cut rivals' trails, and keep yours safe.",
    recordLabel: "Best score",
    category: "minigames",
  },
  {
    id: "blank-atlas",
    title: "The Descent",
    href: "/arcade/blank-atlas",
    blurb: "Seven questions, one dive into an endless gray fog. Name the rarest answer you can: every point sinks you 10 metres deeper.",
    recordLabel: "Best descent",
    category: "minigames",
  },
  {
    id: "the-ascent",
    title: "The Ascent",
    href: "/arcade/the-ascent",
    blurb: "Seven questions, one magic beanstalk. Give the answer everyone else would, and climb toward the giant’s castle in the clouds.",
    recordLabel: "Highest climb",
    category: "minigames",
  },
  {
    id: "guess-the",
    title: "Guess The ...",
    href: "/arcade/guess-the",
    blurb: "Guessing games built on real-world data: draw how a chart carried on, name flags, size things against each other and guess real prices.",
    recordLabel: "Best accuracy",
    category: "minigames",
  },
  {
    id: "who-am-i",
    title: "Who Am I?",
    href: "/arcade/who-am-i",
    blurb: "Your rival can see your secret character, but you can't. Ask yes/no questions and guess who you are first.",
    recordLabel: "Play a bot, or a real rival in Wagers",
    category: "minigames",
  },
];

/** Games with coin runs: the ones leaderboards, streaks, Tournaments and Wagers list. */
export const RANKED_GAMES = ARCADE_GAMES.filter((game): game is ArcadeGame & { id: RankedGameId } => isRankedGame(game.id));

/** The games on one shelf, in registry order. */
export const arcadeGamesIn = (category: ArcadeCategoryId, games: readonly ArcadeGame[] = ARCADE_GAMES) => games.filter((game) => game.category === category);

/** "11 minigames and 1 full game": the Arcade in a phrase, for links into it. */
export function arcadeShelfSummary() {
  const minis = arcadeGamesIn("minigames").length;
  const full = arcadeGamesIn("full").length;
  const part = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return full ? `${part(minis, "minigame", "minigames")} and ${part(full, "full game", "full games")}` : part(minis, "minigame", "minigames");
}

/**
 * Logic puzzles with endless Levels (the record is the highest level completed, in the `levels` variant) and a
 * daily puzzle (scored by solve speed). Older score records on their other variants stay, but aren't levels.
 */
export const PUZZLE_GAMES = ["zip", "patches", "tango", "queens", "sumbreak"] as const;
export type PuzzleGame = (typeof PUZZLE_GAMES)[number];

export const isPuzzleGame = (id: string): id is PuzzleGame => (PUZZLE_GAMES as readonly string[]).includes(id);

/** The record key of a game's highest completed level on one difficulty in `ArcadeRecords`. */
export const levelRecordKey = (game: PuzzleGame, difficulty: PuzzleDifficulty) => `${game}:${levelsBoard(difficulty)}` as const;
export { PUZZLE_DIFFICULTIES };

/**
 * The bests a puzzle page passes to its game: the highest level and recent daily scores, nothing else. The old
 * practice scores sit on other variants and are left out so they can't be mistaken for levels.
 */
export function puzzleBests(game: PuzzleGame, records: ArcadeRecords) {
  const bests: Record<string, number> = {};
  for (const [key, value] of Object.entries(records)) {
    if (value === undefined || !key.startsWith(`${game}:`)) continue;
    const variant = key.slice(game.length + 1);
    if (isLevelsVariant(variant) || isRecentDailyVariant(variant)) bests[variant] = value;
  }
  return bests;
}

/** Daily puzzle score: 1,000 for an instant solve, 4 fewer per second, never below 100. */
export const puzzleScore = (seconds: number) => Math.max(100, 1000 - 4 * Math.floor(seconds));

/**
 * Records keyed by game id (the main record), by `sudoku:<difficulty>` for Sudoku times (seconds) and
 * by `<game>:<variant>` for other variants (Snake setups, 2048 board sizes, daily challenges).
 */
export type ArcadeRecords = Partial<Record<ScoreGame | `sudoku:${string}` | `${ScoreGame}:${string}`, number>>;

/** 2048 board sizes with their own records; the classic 4×4 keeps the main record (""). */
export const G2048_SIZE_VARIANTS = ["3x3", "5x5"] as const;

/** Fruit Slice's timed modes; Classic keeps the main record (""). */
export const FRUIT_MODE_VARIANTS = ["arcade", "zen"] as const;

/** Tower Stacker's strict rules; the main record ("") stays with Casual, the original rules. */
export const STACKER_CLASSIC = "classic";

function isKnownVariant(game: ScoreGame, variant: string) {
  if (game === "snake") return isSnakeVariant(variant);
  if (game === "2048") return (G2048_SIZE_VARIANTS as readonly string[]).includes(variant) || isRecentDailyVariant(variant);
  if (game === "flutter") return isRecentDailyVariant(variant);
  if (game === "fruit-slice") return (FRUIT_MODE_VARIANTS as readonly string[]).includes(variant) || isRecentDailyVariant(variant);
  if (game === "stacker") return variant === STACKER_CLASSIC || isRecentDailyVariant(variant);
  if (game === "zip") return ZIP_LEVEL_VARIANTS.includes(variant) || isLevelsVariant(variant) || isRecentDailyVariant(variant);
  if (game === "sumbreak") return SUMBREAK_LEVEL_VARIANTS.includes(variant) || isLevelsVariant(variant) || isRecentDailyVariant(variant);
  // Guess The ...: one record per mode.
  if (game === "guess-the") return GUESS_THE_MODE_IDS.includes(variant);
  if ((PUZZLE_GAMES as readonly string[]).includes(game)) return isLevelsVariant(variant) || isRecentDailyVariant(variant);
  return false;
}

export const MAX_ARCADE_SCORE = 100_000_000;

export const recordScoreSchema = z
  .object({
    game: z.enum(SCORE_GAMES),
    /** "" is a game's main record; Snake setups, 2048 sizes and daily challenges keep their own. */
    variant: z.string().max(40).default(""),
    score: z.number().int().min(0).max(MAX_ARCADE_SCORE),
    /** A verified game's solve (Sumbreak), replayed by the server before the record is saved. */
    proof: z.unknown().optional(),
  })
  .strict()
  .refine((value) => value.variant === "" || isKnownVariant(value.game, value.variant), {
    message: "Unknown game variant.",
    path: ["variant"],
  })
  // A level record is a level number, not a score.
  .refine((value) => !isLevelsVariant(value.variant) || (value.score >= 1 && value.score <= MAX_PUZZLE_LEVEL), {
    message: "Unknown level.",
    path: ["score"],
  });

/** A won match in a game that ranks wins (Front Wars). Counted once per victory; the score record is separate. */
export const recordWinSchema = z.object({ game: z.literal("front-wars") }).strict();

export const SUDOKU_CELLS = 81;

/** Most coins rewards pay in any 24 hours; the database (`daily_limit` in _credit_coins) enforces it. */
export const DAILY_COIN_LIMIT = 600;

/** `board` tags the run for a leaderboard (a record variant, "" = the main board). */
export const startRunSchema = z
  .object({ game: z.enum(RANKED_SCORE_GAMES), board: z.string().max(40).optional() })
  .strict()
  .refine((value) => value.board === undefined || value.board === "" || isKnownVariant(value.game, value.board), {
    message: "Unknown board.",
    path: ["board"],
  });

/** A finished run: the score plus the few numbers the server cross-checks it against. */
export const finishRunSchema = z
  .object({
    score: z.number().int().min(0).max(MAX_ARCADE_SCORE),
    metrics: z
      .record(z.string().regex(/^[a-zA-Z]{1,24}$/), z.number().finite().min(0).max(MAX_ARCADE_SCORE))
      .refine((metrics) => Object.keys(metrics).length <= 8, "Too many metrics.")
      .default({}),
    /** A verified game's solve (Sumbreak), replayed by the server before the run can pay. */
    proof: z.unknown().optional(),
  })
  .strict();

export type RunStatus = "paid" | "unpaid" | "rejected" | "expired" | "started";

/** The server's verdict on a run or a solved Sudoku. */
export type RunReward = {
  status: RunStatus;
  coins: number;
  balance: number;
  /** Why a run paid nothing (or less): below_minimum, too_short, implausible, daily_limit, not_eligible. */
  reason: string | null;
  minScore: number;
  minSeconds: number;
};

export function toRunReward(value: unknown): RunReward {
  const raw = (value ?? {}) as Record<string, unknown>;
  const status = typeof raw.status === "string" ? (raw.status as RunStatus) : "unpaid";
  const number = (key: string) => (typeof raw[key] === "number" ? (raw[key] as number) : 0);
  return {
    status,
    coins: number("coins"),
    balance: number("balance"),
    reason: typeof raw.reason === "string" ? raw.reason : null,
    minScore: number("minScore"),
    minSeconds: number("minSeconds"),
  };
}
const board = z.string().regex(/^[0-9A-G]+$/).min(16).max(256);

export const sudokuStartSchema = z.union([
  z.object({ difficulty: z.enum(SUDOKU_DIFFICULTIES), size: z.enum(SUDOKU_SIZES).default("normal") }).strict(),
  /** Today's daily puzzle; `replace` confirms dropping an unfinished puzzle from an earlier day. */
  z.object({ daily: z.literal(true), replace: z.boolean().optional() }).strict(),
]);

export const sudokuHintSchema = z
  .object({
    id: z.uuid(),
    size: z.enum(SUDOKU_SIZES).default("normal"),
    cell: z.number().int().min(0).max(255),
    entries: board,
    notes: z.array(z.number().int().min(0).max(65535)).min(16).max(256),
    elapsedMs: z.number().int().min(0).max(2_000_000_000),
  })
  .strict()
  .refine(value => sudokuProgressValid(value.size, value.entries, value.notes) && value.cell < value.entries.length, "Invalid board or hint cell for this size.");

/** The daily puzzle's fixed difficulty. */
export const SUDOKU_DAILY_DIFFICULTY: SudokuDifficulty = "medium";

export const sudokuSaveSchema = z
  .object({
    id: z.uuid(),
    size: z.enum(SUDOKU_SIZES).default("normal"),
    entries: board,
    notes: z.array(z.number().int().min(0).max(65535)).min(16).max(256),
    elapsedMs: z.number().int().min(0).max(2_000_000_000),
    complete: z.boolean().optional(),
  })
  .strict()
  .refine(value => sudokuProgressValid(value.size, value.entries, value.notes), "Invalid board or notes for this size.");

/** A saved puzzle as the client sees it (the solution stays on the server). */
export type SudokuSave = {
  id: string;
  size: SudokuSize;
  difficulty: SudokuDifficulty;
  puzzle: string;
  entries: string;
  notes: number[];
  elapsedMs: number;
  completed: boolean;
  slot: SudokuSlot;
  /** The UTC date a daily puzzle belongs to (null for regular puzzles). */
  puzzleDate: string | null;
  /** Cells revealed with hints; any hint makes the solve "assisted". */
  hints: number;
};

/** A solved daily puzzle (kept apart from regular fastest times). */
export type SudokuDailyResult = { date: string; elapsedMs: number; hints: number };

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
