import { z } from "zod";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { isSnakeVariant } from "@/lib/snake";

/** Games with a single higher-is-better record (Sudoku keeps fastest times per difficulty). */
export const SCORE_GAMES = ["2048", "flutter", "snake", "fruit-slice", "stacker"] as const;
export type ScoreGame = (typeof SCORE_GAMES)[number];
export type ArcadeGameId = ScoreGame | "sudoku";

export const SUDOKU_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type SudokuDifficulty = (typeof SUDOKU_DIFFICULTIES)[number];
export const SUDOKU_LABELS: Record<SudokuDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export type ArcadeGame = {
  id: ArcadeGameId;
  title: string;
  href: string;
  blurb: string;
  /** What the record measures, shown next to it. */
  recordLabel: string;
};

export const ARCADE_GAMES: readonly ArcadeGame[] = [
  { id: "2048", title: "2048", href: "/arcade/2048", blurb: "Slide matching tiles together and build up to 2048.", recordLabel: "Best score" },
  { id: "flutter", title: "Flutter", href: "/arcade/flutter", blurb: "Tap to keep a little gem-bird aloft through the crystal pillars.", recordLabel: "Best score" },
  { id: "snake", title: "Snake", href: "/arcade/snake", blurb: "Eat, grow longer and never bite your own tail.", recordLabel: "Best score" },
  { id: "sudoku", title: "Sudoku", href: "/arcade/sudoku", blurb: "Classic 9×9 logic puzzles in three difficulties. Pick up where you left off.", recordLabel: "Fastest times" },
  { id: "fruit-slice", title: "Fruit Slice", href: "/arcade/fruit-slice", blurb: "Swipe through flying fruit, chain combos and steer clear of bombs.", recordLabel: "Best score" },
  { id: "stacker", title: "Tower Stacker", href: "/arcade/stacker", blurb: "Drop each sliding block right on top. Only the overlap stays.", recordLabel: "Highest tower" },
];

/**
 * Records keyed by game id (the main record), by `sudoku:<difficulty>` for Sudoku times (seconds) and
 * by `<game>:<variant>` for other variants (Snake setups, 2048 board sizes, daily challenges).
 */
export type ArcadeRecords = Partial<Record<ScoreGame | `sudoku:${SudokuDifficulty}` | `${ScoreGame}:${string}`, number>>;

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
  return false;
}

export const MAX_ARCADE_SCORE = 100_000_000;

export const recordScoreSchema = z
  .object({
    game: z.enum(SCORE_GAMES),
    /** "" is a game's main record; Snake setups, 2048 sizes and daily challenges keep their own. */
    variant: z.string().max(40).default(""),
    score: z.number().int().min(0).max(MAX_ARCADE_SCORE),
  })
  .strict()
  .refine((value) => value.variant === "" || isKnownVariant(value.game, value.variant), {
    message: "Unknown game variant.",
    path: ["variant"],
  });

export const SUDOKU_CELLS = 81;

/** Most coins rewards pay in any 24 hours; the database (`daily_limit` in _credit_coins) enforces it. */
export const DAILY_COIN_LIMIT = 600;

export const startRunSchema = z.object({ game: z.enum(SCORE_GAMES) }).strict();

/** A finished run: the score plus the few numbers the server cross-checks it against. */
export const finishRunSchema = z
  .object({
    score: z.number().int().min(0).max(MAX_ARCADE_SCORE),
    metrics: z
      .record(z.string().regex(/^[a-zA-Z]{1,24}$/), z.number().finite().min(0).max(MAX_ARCADE_SCORE))
      .refine((metrics) => Object.keys(metrics).length <= 8, "Too many metrics.")
      .default({}),
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
const board = z.string().regex(/^[0-9]{81}$/, "Boards have 81 digits.");

export const sudokuStartSchema = z.union([
  z.object({ difficulty: z.enum(SUDOKU_DIFFICULTIES) }).strict(),
  /** Today's daily puzzle; `replace` confirms dropping an unfinished puzzle from an earlier day. */
  z.object({ daily: z.literal(true), replace: z.boolean().optional() }).strict(),
]);

export const sudokuHintSchema = z
  .object({
    id: z.uuid(),
    cell: z.number().int().min(0).max(SUDOKU_CELLS - 1),
    entries: board,
    notes: z.array(z.number().int().min(0).max(511)).length(SUDOKU_CELLS),
    elapsedMs: z.number().int().min(0).max(2_000_000_000),
  })
  .strict();

/** The daily puzzle's fixed difficulty. */
export const SUDOKU_DAILY_DIFFICULTY: SudokuDifficulty = "medium";

export const sudokuSaveSchema = z
  .object({
    id: z.uuid(),
    entries: board,
    notes: z.array(z.number().int().min(0).max(511)).length(SUDOKU_CELLS),
    elapsedMs: z.number().int().min(0).max(2_000_000_000),
    complete: z.boolean().optional(),
  })
  .strict();

/** A saved puzzle as the client sees it (the solution stays on the server). */
export type SudokuSave = {
  id: string;
  difficulty: SudokuDifficulty;
  puzzle: string;
  entries: string;
  notes: number[];
  elapsedMs: number;
  completed: boolean;
  slot: "regular" | "daily";
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
