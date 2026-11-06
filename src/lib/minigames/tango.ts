/**
 * Tango: fill a 6×6 grid with suns and moons. Every row and column holds three of each, no three
 * of a kind sit next to each other in a line, "=" joins equal neighbours and "×" opposite ones.
 * Puzzles are generated from a random valid grid and trimmed to clues with exactly one solution.
 */

export const TANGO_SIZE = 6;
export const SUN = 1;
export const MOON = 2;
export type TangoCell = 0 | typeof SUN | typeof MOON;
/** A sign between two neighbouring cells (`a` < `b`). */
export type TangoSign = { a: number; b: number; same: boolean };
export type TangoPuzzle = { size: number; givens: TangoCell[]; signs: TangoSign[] };

const N = TANGO_SIZE;
const HALF = N / 2;

/** Every valid row: three of each, never three in a line. */
const ROWS: TangoCell[][] = (() => {
  const rows: TangoCell[][] = [];
  for (let mask = 0; mask < 1 << N; mask += 1) {
    const row = Array.from({ length: N }, (_, i) => ((mask >> i) & 1 ? SUN : MOON) as TangoCell);
    if (row.filter((cell) => cell === SUN).length !== HALF) continue;
    if (row.some((cell, i) => i >= 2 && cell === row[i - 1] && cell === row[i - 2])) continue;
    rows.push(row);
  }
  return rows;
})();

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Counts solutions (stopping at `limit`), row by row from the valid rows. */
function solve(givens: TangoCell[], signs: TangoSign[], limit: number, random?: () => number): { count: number; first: TangoCell[] | null } {
  const grid: TangoCell[] = new Array(N * N).fill(0);
  let count = 0;
  let first: TangoCell[] | null = null;
  const rowOrder = random ? () => shuffle([...ROWS], random) : () => ROWS;

  const fits = (r: number, row: TangoCell[]) => {
    for (let c = 0; c < N; c += 1) {
      const given = givens[r * N + c];
      if (given && given !== row[c]) return false;
      // Columns: at most three of a kind so far and never three in a line.
      let same = 0;
      for (let rr = 0; rr < r; rr += 1) if (grid[rr * N + c] === row[c]) same += 1;
      if (same + 1 > HALF) return false;
      if (r >= 2 && grid[(r - 1) * N + c] === row[c] && grid[(r - 2) * N + c] === row[c]) return false;
    }
    for (const sign of signs) {
      const ra = Math.floor(sign.a / N);
      const rb = Math.floor(sign.b / N);
      if (rb !== r) continue;
      const va = ra === r ? row[sign.a % N] : grid[sign.a];
      const vb = row[sign.b % N];
      if ((va === vb) !== sign.same) return false;
    }
    return true;
  };

  const place = (r: number) => {
    if (count >= limit) return;
    if (r === N) {
      count += 1;
      if (!first) first = [...grid];
      return;
    }
    for (const row of rowOrder()) {
      if (!fits(r, row)) continue;
      for (let c = 0; c < N; c += 1) grid[r * N + c] = row[c];
      place(r + 1);
      if (count >= limit) return;
    }
    for (let c = 0; c < N; c += 1) grid[r * N + c] = 0;
  };
  place(0);
  return { count, first };
}

export function generateTango(random: () => number): TangoPuzzle {
  const solution = solve(new Array(N * N).fill(0), [], 1, random).first!;
  const pairs: TangoSign[] = [];
  for (let i = 0; i < N * N; i += 1) {
    if (i % N < N - 1) pairs.push({ a: i, b: i + 1, same: solution[i] === solution[i + 1] });
    if (i + N < N * N) pairs.push({ a: i, b: i + N, same: solution[i] === solution[i + N] });
  }
  let givens: TangoCell[] = [...solution];
  let signs = shuffle(pairs, random).slice(0, 12);
  // Trim givens first (so signs carry part of the logic), then signs, keeping exactly one solution.
  for (const cell of shuffle(Array.from({ length: N * N }, (_, i) => i), random)) {
    const next = [...givens];
    next[cell] = 0;
    if (solve(next, signs, 2).count === 1) givens = next;
  }
  for (const sign of [...signs]) {
    const next = signs.filter((s) => s !== sign);
    if (solve(givens, next, 2).count === 1) signs = next;
  }
  return { size: N, givens, signs };
}

/** Cells breaking a rule (for highlighting) and the signs that are violated. */
export function tangoIssues(cells: TangoCell[], signs: TangoSign[]) {
  const bad = new Set<number>();
  const badSigns = new Set<number>();
  const line = (indexes: number[]) => {
    for (const kind of [SUN, MOON] as const) {
      const of = indexes.filter((i) => cells[i] === kind);
      if (of.length > HALF) of.forEach((i) => bad.add(i));
    }
    for (let k = 2; k < indexes.length; k += 1) {
      const [a, b, c] = [indexes[k - 2], indexes[k - 1], indexes[k]];
      if (cells[a] && cells[a] === cells[b] && cells[b] === cells[c]) [a, b, c].forEach((i) => bad.add(i));
    }
  };
  for (let r = 0; r < N; r += 1) line(Array.from({ length: N }, (_, c) => r * N + c));
  for (let c = 0; c < N; c += 1) line(Array.from({ length: N }, (_, r) => r * N + c));
  signs.forEach((sign, index) => {
    const a = cells[sign.a];
    const b = cells[sign.b];
    if (a && b && (a === b) !== sign.same) {
      badSigns.add(index);
      bad.add(sign.a);
      bad.add(sign.b);
    }
  });
  return { bad, badSigns };
}

export function tangoSolved(cells: TangoCell[], signs: TangoSign[]) {
  if (cells.some((cell) => cell === 0)) return false;
  const { bad } = tangoIssues(cells, signs);
  return bad.size === 0;
}
