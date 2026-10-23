import { z } from "zod";

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

/** Records keyed by game id, and by `sudoku:<difficulty>` for Sudoku times (seconds). */
export type ArcadeRecords = Partial<Record<ScoreGame | `sudoku:${SudokuDifficulty}`, number>>;

export const MAX_ARCADE_SCORE = 100_000_000;

export const recordScoreSchema = z
  .object({
    game: z.enum(SCORE_GAMES),
    score: z.number().int().min(0).max(MAX_ARCADE_SCORE),
  })
  .strict();

export const SUDOKU_CELLS = 81;
const board = z.string().regex(/^[0-9]{81}$/, "Boards have 81 digits.");

export const sudokuStartSchema = z.object({ difficulty: z.enum(SUDOKU_DIFFICULTIES) }).strict();

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
};

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
