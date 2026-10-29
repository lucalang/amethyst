import { nextRandom } from "@/lib/arcade-daily";

export const SIZES = [3, 4, 5] as const;
export type BoardSize = (typeof SIZES)[number];
export const GOAL = 2048;

export type Direction = "up" | "down" | "left" | "right";

export type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  /** Created by a merge this move (pops in). */
  merged?: boolean;
  /** Spawned after this move (grows in). */
  fresh?: boolean;
  /** Slid to a new cell this move without merging (wobbles as it lands). */
  moved?: boolean;
  /** Slid into a merge this move; removed on the next move. */
  consumed?: boolean;
};

/**
 * `rng` is the seeded generator's state for a daily board (the same spawns for everyone who makes
 * the same moves), or null for regular play.
 */
export type Board = { size: BoardSize; tiles: Tile[]; score: number; rng: number | null };

let nextId = 1;

/** Cells of one row or column, ordered from the edge the tiles move toward. */
function line(size: number, direction: Direction, index: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let k = 0; k < size; k += 1) {
    if (direction === "left") cells.push([index, k]);
    else if (direction === "right") cells.push([index, size - 1 - k]);
    else if (direction === "up") cells.push([k, index]);
    else cells.push([size - 1 - k, index]);
  }
  return cells;
}

const live = (tiles: Tile[]) => tiles.filter((tile) => !tile.consumed);

function roll(rng: number | null): { value: number; rng: number | null } {
  if (rng === null) return { value: Math.random(), rng };
  const step = nextRandom(rng);
  return { value: step.value, rng: step.state };
}

/** A new 2 (90%) or 4 on a random empty cell. Seeded boards always use two draws per spawn. */
function spawn(tiles: Tile[], size: number, rng: number | null): { tile: Tile | null; rng: number | null } {
  const taken = new Set(live(tiles).map((tile) => tile.row * size + tile.col));
  const empty: number[] = [];
  for (let cell = 0; cell < size * size; cell += 1) if (!taken.has(cell)) empty.push(cell);
  if (!empty.length) return { tile: null, rng };
  const where = roll(rng);
  const kind = roll(where.rng);
  const cell = empty[Math.floor(where.value * empty.length)];
  return { tile: { id: nextId++, value: kind.value < 0.9 ? 2 : 4, row: Math.floor(cell / size), col: cell % size, fresh: true }, rng: kind.rng };
}

/** A fresh board with two tiles; pass a seed for a daily board. */
export function newBoard(size: BoardSize = 4, seed: number | null = null): Board {
  const tiles: Tile[] = [];
  let rng = seed === null ? null : seed >>> 0;
  for (let i = 0; i < 2; i += 1) {
    const result = spawn(tiles, size, rng);
    rng = result.rng;
    if (result.tile) tiles.push(result.tile);
  }
  return { size, tiles, score: 0, rng };
}

/**
 * Slide every tile toward `direction`. Equal neighbours merge once per move (2-2-2-2 → 4-4).
 * A new tile appears only when something actually moved.
 */
export function slide(board: Board, direction: Direction): { board: Board; moved: boolean; gained: number; largestMerge: number } {
  const { size } = board;
  const at = new Map(live(board.tiles).map((tile) => [tile.row * size + tile.col, tile]));
  const tiles: Tile[] = [];
  let moved = false;
  let gained = 0;
  let largestMerge = 0;

  for (let index = 0; index < size; index += 1) {
    const cells = line(size, direction, index);
    const groups: { value: number; sources: Tile[] }[] = [];
    for (const [row, col] of cells) {
      const tile = at.get(row * size + col);
      if (!tile) continue;
      const last = groups[groups.length - 1];
      if (last && last.sources.length === 1 && last.value === tile.value) {
        last.sources.push(tile);
        last.value *= 2;
      } else {
        groups.push({ value: tile.value, sources: [tile] });
      }
    }
    groups.forEach((group, slot) => {
      const [row, col] = cells[slot];
      if (group.sources.length === 1) {
        const tile = group.sources[0];
        const shifted = tile.row !== row || tile.col !== col;
        if (shifted) moved = true;
        tiles.push({ id: tile.id, value: tile.value, row, col, moved: shifted || undefined });
        return;
      }
      moved = true;
      for (const source of group.sources) tiles.push({ id: source.id, value: source.value, row, col, consumed: true });
      tiles.push({ id: nextId++, value: group.value, row, col, merged: true });
      gained += group.value;
      largestMerge = Math.max(largestMerge, group.value);
    });
  }

  if (!moved) return { board, moved: false, gained: 0, largestMerge: 0 };
  const fresh = spawn(tiles, size, board.rng);
  if (fresh.tile) tiles.push(fresh.tile);
  return { board: { size, tiles, score: board.score + gained, rng: fresh.rng }, moved, gained, largestMerge };
}

/** Whether any move is still possible: an empty cell or two equal neighbours. */
export function hasMoves(board: Board) {
  const { size } = board;
  const grid: (number | undefined)[] = Array(size * size);
  for (const tile of live(board.tiles)) grid[tile.row * size + tile.col] = tile.value;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const value = grid[row * size + col];
      if (value === undefined) return true;
      if (col + 1 < size && grid[row * size + col + 1] === value) return true;
      if (row + 1 < size && grid[(row + 1) * size + col] === value) return true;
    }
  }
  return false;
}

export const highestTile = (board: Board) => Math.max(2, ...live(board.tiles).map((tile) => tile.value));

// ---------------------------------------------------------------------------
// Saved rounds
// ---------------------------------------------------------------------------

export type RoundPhase = "playing" | "won" | "over";

/** An unfinished (or just finished) round as stored in the browser. Bump `v` when the shape changes. */
export type SavedRound = {
  v: 1;
  size: BoardSize;
  score: number;
  tiles: [value: number, row: number, col: number][];
  rng: number | null;
  phase: RoundPhase;
  /** The 2048 celebration was shown this round (it appears once). */
  celebrated: boolean;
  /** Daily challenge date (UTC), or null for regular play. */
  date: string | null;
};

export function toSaved(board: Board, phase: RoundPhase, celebrated: boolean, date: string | null): SavedRound {
  return {
    v: 1,
    size: board.size,
    score: board.score,
    tiles: live(board.tiles).map((tile) => [tile.value, tile.row, tile.col]),
    rng: board.rng,
    phase,
    celebrated,
    date,
  };
}

const isInt = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

/** A saved round read back, or null when it is from an older version or damaged. */
export function fromSaved(raw: unknown): { board: Board; phase: RoundPhase; celebrated: boolean; date: string | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const save = raw as Partial<SavedRound>;
  if (save.v !== 1 || !SIZES.includes(save.size as BoardSize) || !isInt(save.score, 0, 100_000_000) || !Array.isArray(save.tiles)) return null;
  const size = save.size as BoardSize;
  if (save.tiles.length > size * size) return null;
  if (save.rng !== null && !isInt(save.rng, 0, 0xffffffff)) return null;
  if (save.phase !== "playing" && save.phase !== "won" && save.phase !== "over") return null;
  if (typeof save.celebrated !== "boolean") return null;
  if (save.date !== null && (typeof save.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(save.date))) return null;
  const seen = new Set<number>();
  const tiles: Tile[] = [];
  for (const entry of save.tiles) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [value, row, col] = entry;
    if (!isInt(value, 2, 131072) || (value & (value - 1)) !== 0 || !isInt(row, 0, size - 1) || !isInt(col, 0, size - 1)) return null;
    if (seen.has(row * size + col)) return null;
    seen.add(row * size + col);
    tiles.push({ id: nextId++, value, row, col });
  }
  if (!tiles.length) return null;
  const board: Board = { size, tiles, score: save.score, rng: save.rng ?? null };
  // A round saved as still playing with no moves left is really over.
  const phase = save.phase === "playing" && !hasMoves(board) ? "over" : save.phase;
  return { board, phase, celebrated: save.celebrated, date: save.date ?? null };
}
