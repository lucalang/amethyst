import "server-only";
import { generate, getUniqueSolution, type Board, type Difficulty } from "sudoku-core";
import { SUDOKU_CELLS, SUDOKU_DAILY_DIFFICULTY, type SudokuDifficulty } from "@/lib/arcade";
import { seedFrom } from "@/lib/arcade-daily";

/** sudoku-core levels to try, first choice first (a lower level is the fallback if generation runs out of time). */
const LEVELS: Record<SudokuDifficulty, Difficulty[]> = {
  easy: ["L2", "L1"],
  medium: ["L4", "L3"],
  hard: ["L6", "L5"],
};

const toDigits = (board: Board | number[]) => board.map((cell) => cell ?? 0).join("");

/** A fresh puzzle with exactly one solution, rated at the requested difficulty by sudoku-core. */
export function newPuzzle(difficulty: SudokuDifficulty) {
  for (const level of LEVELS[difficulty]) {
    try {
      const puzzle = generate(level, { timeoutMs: 8_000 });
      const solution = getUniqueSolution(puzzle);
      if (puzzle.length === SUDOKU_CELLS && solution) return { puzzle: toDigits(puzzle), solution: toDigits(solution) };
    } catch {
      // Out of time for this level; try the next one.
    }
  }
  return null;
}

/** Daily puzzles are the same for everyone: generated from the date, cached per server instance. */
const dailyCache = new Map<string, { puzzle: string; solution: string }>();

export function dailyPuzzle(date: string) {
  const cached = dailyCache.get(date);
  if (cached) return cached;
  const seed = seedFrom(`sudoku:${date}`);
  for (const level of LEVELS[SUDOKU_DAILY_DIFFICULTY]) {
    try {
      const puzzle = generate(level, { seed });
      const solution = getUniqueSolution(puzzle);
      if (puzzle.length === SUDOKU_CELLS && solution) {
        const generated = { puzzle: toDigits(puzzle), solution: toDigits(solution) };
        dailyCache.set(date, generated);
        if (dailyCache.size > 8) dailyCache.delete(dailyCache.keys().next().value!);
        return generated;
      }
    } catch {
      // No puzzle at this level for this seed; the next level is just as deterministic.
    }
  }
  return null;
}
