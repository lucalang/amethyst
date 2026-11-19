/**
 * Level progression for the logic puzzles (Tango, Zip, Queens, Sumbreak, Patches).
 *
 * Levels mode is an endless ladder: Level 1 is gentle, every solved puzzle opens the next level, and a new
 * random puzzle is generated for each one. Each function below maps a level to the settings its game's
 * generator takes (grid size, how many clues stay, how many candidates the trickiest is picked from), so the
 * curve is easy to read and tune in one place. Pure and dependency-free: the game, the hint rules and the API
 * routes all use it.
 *
 * Records keep the highest level completed, in their own record variant ("levels"), apart from the old
 * score-based practice records and from the daily puzzles.
 */

/** The record variant, run board and leaderboard board of the Medium levels; the other difficulties add a suffix. */
export const PUZZLE_LEVELS_VARIANT = "levels";
/** Records and runs top out here (the database enforces the same bound). */
export const MAX_PUZZLE_LEVEL = 1000;
/** Hints per level; the clock takes no penalty for them in Levels mode. */
export const HINTS_PER_LEVEL = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type PuzzleLevelGame = "tango" | "zip" | "queens" | "sumbreak" | "patches";
export type PuzzleDifficulty = "easy" | "medium" | "hard" | "expert";
export type DifficultyOption = { id: PuzzleDifficulty; label: string; hint: string };

const OPTIONS: Record<PuzzleDifficulty, DifficultyOption> = {
  easy: { id: "easy", label: "Easy", hint: "Smaller grids and plenty of clues" },
  medium: { id: "medium", label: "Medium", hint: "The classic size" },
  hard: { id: "hard", label: "Hard", hint: "Bigger grids, fewer clues" },
  expert: { id: "expert", label: "Expert", hint: "The biggest grids and the fewest clues" },
};

/** Difficulties each game offers, easiest first (Zip also has Expert, as before). */
export const PUZZLE_DIFFICULTIES: Record<PuzzleLevelGame, readonly DifficultyOption[]> = {
  tango: [OPTIONS.easy, OPTIONS.medium, OPTIONS.hard],
  zip: [OPTIONS.easy, OPTIONS.medium, OPTIONS.hard, OPTIONS.expert],
  queens: [OPTIONS.easy, OPTIONS.medium, OPTIONS.hard],
  sumbreak: [OPTIONS.easy, OPTIONS.medium, OPTIONS.hard],
  patches: [OPTIONS.easy, OPTIONS.medium, OPTIONS.hard],
};

/**
 * Where each difficulty's Level 1 sits on the game's difficulty curve below: Level 1 of Medium is a normal-sized
 * puzzle, Easy a notch under, Hard and Expert above, and every level after it steps up from there.
 */
const START: Record<PuzzleLevelGame, Record<PuzzleDifficulty, number>> = {
  tango: { easy: 4, medium: 7, hard: 10, expert: 12 },
  zip: { easy: 4, medium: 7, hard: 10, expert: 13 },
  queens: { easy: 4, medium: 7, hard: 10, expert: 12 },
  patches: { easy: 4, medium: 7, hard: 10, expert: 12 },
  sumbreak: { easy: 2, medium: 4, hard: 7, expert: 7 },
};
const curve = (game: PuzzleLevelGame, difficulty: PuzzleDifficulty, level: number) => START[game][difficulty] + level - 1;

/** The run board, record variant and leaderboard board of a difficulty: Medium keeps "levels". */
export const levelsBoard = (difficulty: PuzzleDifficulty) => (difficulty === "medium" ? PUZZLE_LEVELS_VARIANT : `${PUZZLE_LEVELS_VARIANT}-${difficulty}`);

/** The difficulty a levels board stands for, or null if it isn't one. */
export function levelsBoardDifficulty(board: string | null | undefined): PuzzleDifficulty | null {
  if (board === PUZZLE_LEVELS_VARIANT) return "medium";
  const match = /^levels-(easy|hard|expert)$/.exec(board ?? "");
  return match ? (match[1] as PuzzleDifficulty) : null;
}
export const isLevelsVariant = (board: string | null | undefined) => levelsBoardDifficulty(board) !== null;

/** Tango: a 6×6 board whose clues thin out along the curve until its Level 12, then the fewest-clue puzzle of a few is kept. */
export function tangoLevel(level: number, difficulty: PuzzleDifficulty = "medium") {
  const e = curve("tango", difficulty, level);
  const t = clamp(e - 1, 0, 11) / 11;
  return {
    /** Givens (and signs) kept at least; the puzzle still has exactly one solution. */
    givens: Math.round(16 * (1 - t)),
    signs: Math.round(8 * (1 - t)),
    candidates: 1 + clamp(Math.floor((e - 12) / 4), 0, 5),
  };
}

/** Queens: the board grows from 5×5 to 9×9. */
export const queensLevelSize = (level: number, difficulty: PuzzleDifficulty = "medium") => {
  const e = curve("queens", difficulty, level);
  return e <= 2 ? 5 : e <= 5 ? 6 : e <= 9 ? 7 : e <= 14 ? 8 : 9;
};

/** Zip: the grid grows from 4×4 to 8×8 and the up-front numbers get fewer. */
export function zipLevel(level: number, difficulty: PuzzleDifficulty = "medium") {
  const e = curve("zip", difficulty, level);
  const size = Math.min(8, 4 + Math.floor((e - 1) / 3));
  const step = size < 8 ? (e - 1) % 3 : Math.floor((e - 13) / 3);
  return { size, hints: Math.max(4, size + 2 - step) };
}

/** Patches: the grid grows from 4×4 to 8×8 and more clues hide their shape (half of them from curve step 11). */
export function patchesLevel(level: number, difficulty: PuzzleDifficulty = "medium") {
  const e = curve("patches", difficulty, level);
  const size = e <= 2 ? 4 : e <= 5 ? 5 : e <= 9 ? 6 : e <= 14 ? 7 : 8;
  return { size, hide: clamp((e - 1) / 10, 0, 1) * 0.5 };
}

/** Sumbreak: 3×3, then 4×4 from curve step 3 and 5×5 from step 6; later steps keep the trickiest of more candidates. */
export const sumbreakLevelBoard = (level: number, difficulty: PuzzleDifficulty = "medium") => {
  const e = curve("sumbreak", difficulty, level);
  return { size: e <= 2 ? 3 : e <= 5 ? 4 : 5, candidates: clamp(6 + 2 * (e - 1), 6, 24) };
};

const sizeOf: Record<PuzzleLevelGame, (level: number, difficulty: PuzzleDifficulty) => number> = {
  tango: () => 6,
  zip: (level, d) => zipLevel(level, d).size,
  queens: queensLevelSize,
  sumbreak: (level, d) => sumbreakLevelBoard(level, d).size,
  patches: (level, d) => patchesLevel(level, d).size,
};

/** What a level looks like and what the next step up is, for the line under the board. */
export function levelInfo(game: PuzzleLevelGame, level: number, difficulty: PuzzleDifficulty = "medium"): { detail: string; next: string | null } {
  const size = sizeOf[game](level, difficulty);
  const detail = `${size}×${size} grid`;
  let next: string | null = null;
  for (let ahead = level + 1; ahead <= level + 40; ahead += 1) {
    const bigger = sizeOf[game](ahead, difficulty);
    if (bigger !== size) {
      next = `${bigger}×${bigger} grid from Level ${ahead}`;
      break;
    }
  }
  if (!next && game === "tango" && curve(game, difficulty, level) < 12) next = "Fewer clues each level";
  return { detail, next };
}
