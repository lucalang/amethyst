import "server-only";
import { SCORE_GAMES, SUDOKU_DIFFICULTIES, type ArcadeRecords, type ScoreGame, type SudokuDailyResult, type SudokuDifficulty, type SudokuSave } from "@/lib/arcade";
import { toArcadeStreaks, type ArcadeStreaks } from "@/lib/arcade-streaks";
import type { AuthContext } from "@/lib/supabase/auth";
import { SUDOKU_SIZES, sudokuVariant, type SudokuSize } from "@/lib/sudoku";

/** Daily play streaks for every registered game. */
export async function loadArcadeStreaks(ctx: AuthContext): Promise<ArcadeStreaks> {
  const { data, error } = await ctx.supabase.rpc("arcade_streaks");
  if (error) throw new Error(`Could not load arcade streaks: ${error.code}`);
  return toArcadeStreaks(data ?? []);
}

/** The signed-in account's personal records (missing games have none yet). */
export async function loadArcadeRecords(ctx: AuthContext): Promise<ArcadeRecords> {
  const { data, error } = await ctx.supabase.from("arcade_records").select("game, variant, score").eq("user_id", ctx.userId);
  if (error) throw new Error(`Could not load arcade records: ${error.code}`);
  const records: ArcadeRecords = {};
  for (const row of data ?? []) {
    if (row.game === "sudoku" && SUDOKU_SIZES.some(size => SUDOKU_DIFFICULTIES.some(difficulty => sudokuVariant(size, difficulty) === row.variant))) {
      records[`sudoku:${row.variant}`] = row.score;
    } else if (SCORE_GAMES.includes(row.game as ScoreGame)) {
      if (row.variant === "") records[row.game as ScoreGame] = row.score;
      else records[`${row.game as ScoreGame}:${row.variant}`] = row.score;
    }
  }
  return records;
}

export const SUDOKU_COLUMNS = "id, size, slot, puzzle_date, hints, difficulty, puzzle, entries, notes, elapsed_ms, completed_at" as const;

export function toSudokuSave(row: {
  id: string;
  size: SudokuSize;
  slot: "regular" | "daily";
  puzzle_date: string | null;
  hints: number;
  difficulty: SudokuDifficulty;
  puzzle: string;
  entries: string;
  notes: number[];
  elapsed_ms: number;
  completed_at: string | null;
}): SudokuSave {
  return {
    id: row.id,
    size: row.size,
    difficulty: row.difficulty,
    puzzle: row.puzzle,
    entries: row.entries,
    notes: row.notes,
    elapsedMs: row.elapsed_ms,
    completed: row.completed_at !== null,
    slot: row.slot,
    puzzleDate: row.puzzle_date,
    hints: row.hints,
  };
}

/** The account's current (or last finished) Sudoku in a slot, without its solution. */
export async function loadSudoku(ctx: AuthContext, slot: "regular" | "daily" = "regular", size: SudokuSize = "normal"): Promise<SudokuSave | null> {
  const { data, error } = await ctx.supabase
    .from("sudoku_games")
    .select(SUDOKU_COLUMNS)
    .eq("user_id", ctx.userId)
    .eq("slot", slot)
    .eq("size", slot === "daily" ? "normal" : size)
    .maybeSingle();
  if (error) throw new Error(`Could not load the saved Sudoku: ${error.code}`);
  return data ? toSudokuSave(data) : null;
}

/** The account's result for one daily puzzle, if solved. */
export async function loadSudokuDailyResult(ctx: AuthContext, date: string): Promise<SudokuDailyResult | null> {
  const { data, error } = await ctx.supabase
    .from("sudoku_daily_results")
    .select("puzzle_date, elapsed_ms, hints")
    .eq("user_id", ctx.userId)
    .eq("puzzle_date", date)
    .maybeSingle();
  if (error) throw new Error(`Could not load the daily Sudoku result: ${error.code}`);
  return data ? { date: data.puzzle_date, elapsedMs: data.elapsed_ms, hints: data.hints } : null;
}
