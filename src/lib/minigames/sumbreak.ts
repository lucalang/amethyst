/**
 * Sumbreak: merge equal numbers until one tile is left.
 *
 * Rules (as LinkedIn's Sumbreak plays): every cell of a square board holds a number. Drag (or tap) a tile onto
 * a neighbour above, below, left or right of it that holds the same number: the two become their sum, which
 * lands on the tile you dropped onto; the tile you moved from is left empty. Tiles never slide, so an emptied
 * cell stays a gap that nothing merges across. The puzzle is solved when a single tile remains.
 *
 * Puzzles are built backwards from that last tile: a tile is split into two equal halves on itself and an empty
 * neighbour until the board is full, so every puzzle has at least one solution (those splits, undone in
 * reverse). Each puzzle is fully determined by its seed and size, which lets the server rebuild a board and
 * replay a submitted solution instead of trusting the client.
 *
 * Pure and dependency-free: used by the game, the hint solver and the API routes.
 */

import { seedFrom, seededRandom } from "@/lib/arcade-daily";
import { MAX_PUZZLE_LEVEL, levelsBoardDifficulty, sumbreakLevelBoard } from "@/lib/minigames/levels";

export const SUMBREAK_GAME = "sumbreak";

/** Practice difficulties ("" = Medium keeps the main record), each a board size. */
export const SUMBREAK_LEVELS = [
  { id: "easy", label: "Easy", hint: "A 3×3 board: eight merges", size: 3 },
  { id: "", label: "Medium", hint: "A 4×4 board: fifteen merges", size: 4 },
  { id: "hard", label: "Hard", hint: "A 5×5 board: twenty-four merges", size: 5 },
] as const;
export const SUMBREAK_LEVEL_VARIANTS: readonly string[] = SUMBREAK_LEVELS.map((level) => level.id).filter(Boolean);
export const SUMBREAK_DAILY_SIZE = 4;
export const SUMBREAK_SIZES = [3, 4, 5] as const;

export const sumbreakLevelSize = (level: string) => SUMBREAK_LEVELS.find((entry) => entry.id === level)?.size ?? SUMBREAK_DAILY_SIZE;

/** A board: `size`² cells, 0 = empty. */
export type SumbreakBoard = number[];
/** A merge: the tile at `from` joins the equal tile at `to` (an orthogonal neighbour); the sum lands on `to`. */
export type SumbreakMove = { from: number; to: number };
/** `candidates`: how many boards were built to pick the trickiest from (the default for daily and match puzzles). */
export type SumbreakPuzzle = { seed: number; size: number; candidates: number; cells: SumbreakBoard; solution: SumbreakMove[] };
export const SUMBREAK_CANDIDATES = 6;
export const SUMBREAK_MAX_CANDIDATES = 32;

export function sumbreakNeighbours(cell: number, size: number) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const list: number[] = [];
  if (r > 0) list.push(cell - size);
  if (r < size - 1) list.push(cell + size);
  if (c > 0) list.push(cell - 1);
  if (c < size - 1) list.push(cell + 1);
  return list;
}

/** Whether `from` may merge onto `to` on this board. */
export function canMerge(cells: SumbreakBoard, size: number, from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= cells.length || to >= cells.length) return false;
  if (!cells[from] || cells[from] !== cells[to]) return false;
  return sumbreakNeighbours(from, size).includes(to);
}

/** The board after a merge (assumes `canMerge`). */
export function applyMerge(cells: SumbreakBoard, move: SumbreakMove): SumbreakBoard {
  const next = [...cells];
  next[move.to] = cells[move.to] + cells[move.from];
  next[move.from] = 0;
  return next;
}

export const tilesLeft = (cells: SumbreakBoard) => cells.reduce((count, value) => count + (value ? 1 : 0), 0);
export const sumbreakSolved = (cells: SumbreakBoard) => tilesLeft(cells) === 1;

/** Every legal merge on the board. */
export function legalMerges(cells: SumbreakBoard, size: number): SumbreakMove[] {
  const moves: SumbreakMove[] = [];
  for (let from = 0; from < cells.length; from += 1) {
    if (!cells[from]) continue;
    for (const to of sumbreakNeighbours(from, size)) if (cells[to] === cells[from]) moves.push({ from, to });
  }
  return moves;
}

/**
 * Boards that can't be solved, spotted without searching. Tiles only grow, so a tile of the smallest value can
 * only ever merge with another tile of that value that is beside it now (an empty cell can only be refilled by a
 * bigger sum): the smallest tiles must pair up, and each needs an equal neighbour. A tile with no tile beside it
 * at all is stuck for good too.
 */
function hopeless(cells: SumbreakBoard, size: number) {
  if (tilesLeft(cells) <= 1) return false;
  let smallest = Infinity;
  for (const value of cells) if (value && value < smallest) smallest = value;
  let count = 0;
  for (let cell = 0; cell < cells.length; cell += 1) {
    const value = cells[cell];
    if (!value) continue;
    const around = sumbreakNeighbours(cell, size);
    if (around.every((n) => !cells[n])) return true;
    if (value === smallest) {
      count += 1;
      if (!around.some((n) => cells[n] === smallest)) return true;
    }
  }
  return count % 2 === 1;
}

/**
 * A solution from this board (the merges in order), [] if it's already solved, null if there is none, or
 * undefined if the search ran out of budget before deciding.
 */
export function solveSumbreak(cells: SumbreakBoard, size: number, budget = 60_000): SumbreakMove[] | null | undefined {
  const dead = new Set<string>();
  const path: SumbreakMove[] = [];
  let nodes = 0;
  let exhausted = false;
  const search = (board: SumbreakBoard): boolean => {
    if (sumbreakSolved(board)) return true;
    const key = board.join(",");
    if (dead.has(key)) return false;
    if ((nodes += 1) > budget) {
      exhausted = true;
      return false;
    }
    if (!hopeless(board, size)) {
      for (const move of legalMerges(board, size)) {
        path.push(move);
        if (search(applyMerge(board, move))) return true;
        path.pop();
        if (exhausted) return false;
      }
    }
    dead.add(key);
    return false;
  };
  if (search(cells)) return path;
  return exhausted ? undefined : null;
}

/** Share of random play-throughs that reach one tile: lower means more ways to get stuck. */
function luckRate(cells: SumbreakBoard, size: number, random: () => number, tries: number) {
  let wins = 0;
  for (let t = 0; t < tries; t += 1) {
    let board = cells;
    for (;;) {
      const moves = legalMerges(board, size);
      if (!moves.length) break;
      board = applyMerge(board, moves[Math.floor(random() * moves.length)]);
    }
    if (sumbreakSolved(board)) wins += 1;
  }
  return wins / tries;
}

/** One board built backwards from a single tile, or null if the splits boxed themselves in. */
function buildOnce(size: number, random: () => number): { cells: SumbreakBoard; solution: SumbreakMove[] } | null {
  const count = size * size;
  // Every number on a board is the same odd base times a power of two (equal halves keep it so).
  const base = [1, 1, 3, 3, 5, 7][Math.floor(random() * 6)];
  const levels = Math.ceil(Math.log2(count)) + (size === 5 ? 1 : 2);
  const cells: SumbreakBoard = new Array(count).fill(0);
  cells[Math.floor(random() * count)] = base * 2 ** levels;
  const splits: SumbreakMove[] = [];
  for (let filled = 1; filled < count; filled += 1) {
    const options: { from: number; to: number; weight: number }[] = [];
    for (let cell = 0; cell < count; cell += 1) {
      const value = cells[cell];
      if (!value || value / base < 2) continue;
      for (const n of sumbreakNeighbours(cell, size)) {
        // Prefer splitting big tiles (keeps numbers varied) and filling cells with few filled neighbours.
        if (!cells[n]) options.push({ from: cell, to: n, weight: Math.log2(value / base) + 0.5 });
      }
    }
    if (!options.length) return null;
    let pick = random() * options.reduce((sum, option) => sum + option.weight, 0);
    let chosen = options[0];
    for (const option of options) {
      pick -= option.weight;
      if (pick <= 0) {
        chosen = option;
        break;
      }
    }
    const half = cells[chosen.from] / 2;
    cells[chosen.from] = half;
    cells[chosen.to] = half;
    // Played forwards, the new tile merges back onto the one it split from.
    splits.push({ from: chosen.to, to: chosen.from });
  }
  return { cells, solution: splits.reverse() };
}

/** The puzzle for a seed and size: the trickiest of a few candidates (fewest lucky random solves). */
export function buildSumbreak(seed: number, size: number, candidates = SUMBREAK_CANDIDATES): SumbreakPuzzle {
  const random = seededRandom(seed);
  let best: { cells: SumbreakBoard; solution: SumbreakMove[]; luck: number } | null = null;
  for (let candidate = 0; candidate < 200 + candidates && (candidate < candidates || !best); candidate += 1) {
    const built = buildOnce(size, random);
    if (!built) continue;
    const luck = luckRate(built.cells, size, random, 30);
    if (!best || luck < best.luck) best = { ...built, luck };
  }
  if (!best) throw new Error("Could not build a Sumbreak board.");
  return { seed, size, candidates, cells: best.cells, solution: best.solution };
}

/** A fresh puzzle from the shell's random source (practice, daily or a match seed all pass through here). */
export function generateSumbreak(random: () => number, size: number, candidates = SUMBREAK_CANDIDATES) {
  return buildSumbreak(Math.floor(random() * 2 ** 32) >>> 0, size, candidates);
}

/** The seed of a day's daily puzzle (the same draw the game makes from the daily random source). */
export function dailySumbreakSeed(date: string) {
  return Math.floor(seededRandom(seedFrom(`${SUMBREAK_GAME}:${date}`))() * 2 ** 32) >>> 0;
}

/* ---------------------------------------------------------------------------------------------- Proof */

/**
 * The board a record variant or run board stands for: a practice level, a day's daily puzzle or an endless level
 * (whose size depends on the level reached, the record's or run's score), or null.
 */
export function sumbreakBoardOf(board: string | null | undefined, score = 0): { size: number; date: string | null } | null {
  if (board === null || board === undefined) return null;
  const difficulty = levelsBoardDifficulty(board);
  if (difficulty) return score >= 1 && score <= MAX_PUZZLE_LEVEL ? { size: sumbreakLevelBoard(score, difficulty).size, date: null } : null;
  const daily = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(board);
  if (daily) return { size: SUMBREAK_DAILY_SIZE, date: daily[1] };
  const level = SUMBREAK_LEVELS.find((entry) => entry.id === board);
  return level ? { size: level.size, date: null } : null;
}

/** What a solve sends to the server: the puzzle's seed and size and the merges, as from/to pairs. */
export type SumbreakProof = { seed: number; size: number; moves: number[]; candidates?: number };

/**
 * Whether a proof solves its puzzle under the rules: the board is rebuilt from the seed and every merge is
 * replayed and checked. `size` must match the board the run or record was for, and a daily puzzle's seed must
 * be that day's.
 */
export function verifySumbreakProof(proof: unknown, expected: { size: number; date?: string | null }): boolean {
  if (!proof || typeof proof !== "object") return false;
  const { seed, size, moves, candidates = SUMBREAK_CANDIDATES } = proof as Partial<SumbreakProof>;
  if (!Number.isInteger(candidates) || candidates < 1 || candidates > SUMBREAK_MAX_CANDIDATES) return false;
  if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32) return false;
  if (size !== expected.size || !(SUMBREAK_SIZES as readonly number[]).includes(size)) return false;
  if (expected.date && (seed !== dailySumbreakSeed(expected.date) || candidates !== SUMBREAK_CANDIDATES)) return false;
  if (!Array.isArray(moves) || moves.length !== (size * size - 1) * 2) return false;
  let cells = buildSumbreak(seed, size, candidates).cells;
  for (let i = 0; i < moves.length; i += 2) {
    const from = moves[i];
    const to = moves[i + 1];
    if (!Number.isInteger(from) || !Number.isInteger(to) || !canMerge(cells, size, from, to)) return false;
    cells = applyMerge(cells, { from, to });
  }
  return sumbreakSolved(cells);
}
