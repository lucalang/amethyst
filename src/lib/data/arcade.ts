import "server-only";
import { SCORE_GAMES, SUDOKU_DIFFICULTIES, type ArcadeRecords, type ScoreGame, type SudokuDifficulty, type SudokuSave } from "@/lib/arcade";
import type { AuthContext } from "@/lib/supabase/auth";

/** The signed-in account's personal records (missing games have none yet). */
export async function loadArcadeRecords(ctx: AuthContext): Promise<ArcadeRecords> {
  const { data, error } = await ctx.supabase.from("arcade_records").select("game, variant, score").eq("user_id", ctx.userId);
  if (error) throw new Error(`Could not load arcade records: ${error.code}`);
  const records: ArcadeRecords = {};
  for (const row of data ?? []) {
    if (row.game === "sudoku" && SUDOKU_DIFFICULTIES.includes(row.variant as SudokuDifficulty)) {
      records[`sudoku:${row.variant as SudokuDifficulty}`] = row.score;
    } else if (SCORE_GAMES.includes(row.game as ScoreGame)) {
      if (row.variant === "") records[row.game as ScoreGame] = row.score;
      else records[`${row.game as ScoreGame}:${row.variant}`] = row.score;
    }
  }
  return records;
}

export const SUDOKU_COLUMNS = "id, difficulty, puzzle, entries, notes, elapsed_ms, completed_at" as const;

export function toSudokuSave(row: {
  id: string;
  difficulty: SudokuDifficulty;
  puzzle: string;
  entries: string;
  notes: number[];
  elapsed_ms: number;
  completed_at: string | null;
}): SudokuSave {
  return {
    id: row.id,
    difficulty: row.difficulty,
    puzzle: row.puzzle,
    entries: row.entries,
    notes: row.notes,
    elapsedMs: row.elapsed_ms,
    completed: row.completed_at !== null,
  };
}

/** The account's current (or last finished) Sudoku, without its solution. */
export async function loadSudoku(ctx: AuthContext): Promise<SudokuSave | null> {
  const { data, error } = await ctx.supabase.from("sudoku_games").select(SUDOKU_COLUMNS).eq("user_id", ctx.userId).maybeSingle();
  if (error) throw new Error(`Could not load the saved Sudoku: ${error.code}`);
  return data ? toSudokuSave(data) : null;
}
