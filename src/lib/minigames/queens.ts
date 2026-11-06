/**
 * Queens: place one crown in every row, column and colored region so that no two crowns touch,
 * not even diagonally. Regions grow from a random valid placement and are then reshaped until no
 * other placement fits, so each puzzle has exactly one solution (with a solvable fallback).
 */

/** `solution`: the crown's column in each row. */
export type QueensPuzzle = { size: number; regions: number[]; solution: number[] };

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function neighbours(cell: number, size: number) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  if (c < size - 1) out.push(cell + 1);
  return out;
}

/** A crown column per row with no two in the same column or touching. */
function placement(size: number, random: () => number): number[] | null {
  const cols: number[] = [];
  const used = new Set<number>();
  const go = (r: number): boolean => {
    if (r === size) return true;
    for (const c of shuffle(Array.from({ length: size }, (_, i) => i), random)) {
      if (used.has(c) || (r > 0 && Math.abs(cols[r - 1] - c) < 2)) continue;
      cols.push(c);
      used.add(c);
      if (go(r + 1)) return true;
      cols.pop();
      used.delete(c);
    }
    return false;
  };
  return go(0) ? cols : null;
}

/** All solutions up to `limit` (as crown columns per row). */
function solutions(size: number, regions: number[], limit: number) {
  const found: number[][] = [];
  const cols: number[] = [];
  const usedCol = new Set<number>();
  const usedRegion = new Set<number>();
  const go = (r: number) => {
    if (found.length >= limit) return;
    if (r === size) {
      found.push([...cols]);
      return;
    }
    for (let c = 0; c < size; c += 1) {
      const region = regions[r * size + c];
      if (usedCol.has(c) || usedRegion.has(region) || (r > 0 && Math.abs(cols[r - 1] - c) < 2)) continue;
      cols.push(c);
      usedCol.add(c);
      usedRegion.add(region);
      go(r + 1);
      cols.pop();
      usedCol.delete(c);
      usedRegion.delete(region);
    }
  };
  go(0);
  return found;
}

function connectedWithout(regions: number[], size: number, region: number, removed: number) {
  const cells = regions.flatMap((value, cell) => (value === region && cell !== removed ? [cell] : []));
  if (cells.length === 0) return false;
  const seen = new Set([cells[0]]);
  const queue = [cells[0]];
  while (queue.length) {
    const cell = queue.pop()!;
    for (const next of neighbours(cell, size)) {
      if (next !== removed && regions[next] === region && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size === cells.length;
}

function growRegions(size: number, crowns: number[], random: () => number) {
  const regions = new Array<number>(size * size).fill(-1);
  crowns.forEach((c, r) => (regions[r * size + c] = r));
  let left = size * size - size;
  while (left > 0) {
    const region = Math.floor(random() * size);
    const edge = regions.flatMap((value, cell) => (value === region ? neighbours(cell, size).filter((n) => regions[n] === -1) : []));
    if (edge.length === 0) continue;
    regions[edge[Math.floor(random() * edge.length)]] = region;
    left -= 1;
  }
  return regions;
}

export function generateQueens(random: () => number, size = 8): QueensPuzzle {
  let fallback: QueensPuzzle | null = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const crowns = placement(size, random);
    if (!crowns) continue;
    const regions = growRegions(size, crowns, random);
    const seeds = new Set(crowns.map((c, r) => r * size + c));
    fallback ??= { size, regions: [...regions], solution: crowns };
    for (let step = 0; step < 160; step += 1) {
      const other = solutions(size, regions, 2).find((cols) => cols.some((c, r) => c !== crowns[r]));
      if (!other) return { size, regions, solution: crowns };
      // Move one of the other solution's crowns into a neighbouring region; that solution breaks.
      let moved = false;
      for (const r of shuffle(Array.from({ length: size }, (_, i) => i), random)) {
        const cell = r * size + other[r];
        if (seeds.has(cell)) continue;
        const from = regions[cell];
        const targets = shuffle(neighbours(cell, size).map((n) => regions[n]).filter((region) => region !== from), random);
        if (targets.length === 0 || !connectedWithout(regions, size, from, cell)) continue;
        regions[cell] = targets[0];
        moved = true;
        break;
      }
      if (!moved) break;
    }
  }
  if (fallback) return fallback;
  const crowns = placement(size, random)!;
  return { size, regions: growRegions(size, crowns, random), solution: crowns };
}

/** Crowns that break a rule: same row, column or region, or touching. */
export function queensConflicts(size: number, regions: number[], crowns: number[]) {
  const bad = new Set<number>();
  for (let i = 0; i < crowns.length; i += 1) {
    for (let j = i + 1; j < crowns.length; j += 1) {
      const a = crowns[i];
      const b = crowns[j];
      const ra = Math.floor(a / size);
      const rb = Math.floor(b / size);
      const ca = a % size;
      const cb = b % size;
      if (ra === rb || ca === cb || regions[a] === regions[b] || (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1)) {
        bad.add(a);
        bad.add(b);
      }
    }
  }
  return bad;
}

export function queensSolved(size: number, regions: number[], crowns: number[]) {
  return crowns.length === size && queensConflicts(size, regions, crowns).size === 0;
}
