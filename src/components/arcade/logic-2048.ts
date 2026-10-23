export const SIZE = 4;
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
  /** Slid into a merge this move; removed on the next move. */
  consumed?: boolean;
};

export type Board = { tiles: Tile[]; score: number };

let nextId = 1;

/** Cells of one row or column, ordered from the edge the tiles move toward. */
function line(direction: Direction, index: number): [number, number][] {
  const cells: [number, number][] = [];
  for (let k = 0; k < SIZE; k += 1) {
    if (direction === "left") cells.push([index, k]);
    else if (direction === "right") cells.push([index, SIZE - 1 - k]);
    else if (direction === "up") cells.push([k, index]);
    else cells.push([SIZE - 1 - k, index]);
  }
  return cells;
}

const live = (tiles: Tile[]) => tiles.filter((tile) => !tile.consumed);

function spawn(tiles: Tile[]): Tile | null {
  const taken = new Set(live(tiles).map((tile) => tile.row * SIZE + tile.col));
  const empty: number[] = [];
  for (let cell = 0; cell < SIZE * SIZE; cell += 1) if (!taken.has(cell)) empty.push(cell);
  if (!empty.length) return null;
  const cell = empty[Math.floor(Math.random() * empty.length)];
  return { id: nextId++, value: Math.random() < 0.9 ? 2 : 4, row: Math.floor(cell / SIZE), col: cell % SIZE, fresh: true };
}

export function newBoard(): Board {
  const tiles: Tile[] = [];
  for (let i = 0; i < 2; i += 1) {
    const tile = spawn(tiles);
    if (tile) tiles.push(tile);
  }
  return { tiles, score: 0 };
}

/**
 * Slide every tile toward `direction`. Equal neighbours merge once per move (2-2-2-2 → 4-4).
 * A new tile appears only when something actually moved.
 */
export function slide(board: Board, direction: Direction): { board: Board; moved: boolean; gained: number; largestMerge: number } {
  const at = new Map(live(board.tiles).map((tile) => [tile.row * SIZE + tile.col, tile]));
  const tiles: Tile[] = [];
  let moved = false;
  let gained = 0;
  let largestMerge = 0;

  for (let index = 0; index < SIZE; index += 1) {
    const cells = line(direction, index);
    const groups: { value: number; sources: Tile[] }[] = [];
    for (const [row, col] of cells) {
      const tile = at.get(row * SIZE + col);
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
        if (tile.row !== row || tile.col !== col) moved = true;
        tiles.push({ id: tile.id, value: tile.value, row, col });
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
  const fresh = spawn(tiles);
  if (fresh) tiles.push(fresh);
  return { board: { tiles, score: board.score + gained }, moved, gained, largestMerge };
}

export function hasMoves(board: Board) {
  const grid: (number | undefined)[] = Array(SIZE * SIZE);
  for (const tile of live(board.tiles)) grid[tile.row * SIZE + tile.col] = tile.value;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = grid[row * SIZE + col];
      if (value === undefined) return true;
      if (col + 1 < SIZE && grid[row * SIZE + col + 1] === value) return true;
      if (row + 1 < SIZE && grid[(row + 1) * SIZE + col] === value) return true;
    }
  }
  return false;
}

export const highestTile = (board: Board) => Math.max(0, ...live(board.tiles).map((tile) => tile.value));
