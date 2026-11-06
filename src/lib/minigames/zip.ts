/**
 * Zip: draw one path that starts on 1, passes every number in order, ends on the highest number
 * and fills every cell exactly once without crossing a wall. Puzzles start from a random path
 * (so they are always solvable); numbers and walls are added until no other path fits.
 */

export type ZipPuzzle = { size: number; numbers: number[]; walls: string[]; last: number };

export const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function zipNeighbours(cell: number, size: number) {
  const r = Math.floor(cell / size);
  const c = cell % size;
  const out: number[] = [];
  if (r > 0) out.push(cell - size);
  if (c < size - 1) out.push(cell + 1);
  if (r < size - 1) out.push(cell + size);
  if (c > 0) out.push(cell - 1);
  return out;
}

/** A random path through every cell: a snake, reshaped many times by "backbite" moves. */
function randomPath(size: number, random: () => number) {
  let path: number[] = [];
  for (let r = 0; r < size; r += 1) for (let i = 0; i < size; i += 1) path.push(r * size + (r % 2 ? size - 1 - i : i));
  for (let step = 0; step < size * size * 30; step += 1) {
    if (random() < 0.5) path.reverse();
    const head = path[0];
    const options = zipNeighbours(head, size).filter((cell) => cell !== path[1]);
    const next = options[Math.floor(random() * options.length)];
    const at = path.indexOf(next);
    path = [...path.slice(0, at).reverse(), ...path.slice(at)];
  }
  return path;
}

/** Up to `limit` complete paths (each a cell list), within a search budget; `null` if the budget ran out. */
function findPaths(puzzle: ZipPuzzle, limit: number, budget = 120_000): number[][] | null {
  const { size, numbers, last } = puzzle;
  const total = size * size;
  const walls = new Set(puzzle.walls);
  const start = numbers.indexOf(1);
  const visited = new Array<boolean>(total).fill(false);
  const path = [start];
  visited[start] = true;
  const found: number[][] = [];
  let steps = 0;

  const reachable = (from: number) => {
    // Every unvisited cell must still be reachable from the path's end.
    const seen = new Set<number>();
    const queue = [from];
    while (queue.length) {
      const cell = queue.pop()!;
      for (const next of zipNeighbours(cell, size)) {
        if (visited[next] || seen.has(next) || walls.has(edgeKey(cell, next))) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    return seen.size === total - path.length;
  };

  const go = (expected: number): boolean => {
    if ((steps += 1) > budget) return false;
    const end = path[path.length - 1];
    if (path.length === total) {
      if (numbers[end] === last) found.push([...path]);
      return true;
    }
    if (!reachable(end)) return true;
    for (const next of zipNeighbours(end, size)) {
      if (visited[next] || walls.has(edgeKey(end, next))) continue;
      const number = numbers[next];
      if (number && number !== expected) continue;
      visited[next] = true;
      path.push(next);
      const ok = go(number ? expected + 1 : expected);
      path.pop();
      visited[next] = false;
      if (!ok) return false;
      if (found.length >= limit) return true;
    }
    return true;
  };
  const finished = go(2);
  return finished || found.length >= limit ? found : null;
}

function numbersAlong(path: number[], marks: Set<number>) {
  const numbers = new Array<number>(path.length).fill(0);
  let n = 0;
  path.forEach((cell, index) => {
    if (marks.has(index)) numbers[cell] = ++n;
  });
  return { numbers, last: n };
}

export function generateZip(random: () => number, size = 6): ZipPuzzle {
  const path = randomPath(size, random);
  const total = size * size;
  const marks = new Set([0, total - 1]);
  const extra = size + Math.floor(random() * 3) - 1;
  while (marks.size < extra) marks.add(1 + Math.floor(random() * (total - 2)));
  const used = new Set(path.slice(1).map((cell, i) => edgeKey(path[i], cell)));
  const spare: string[] = [];
  for (let cell = 0; cell < total; cell += 1) {
    for (const next of zipNeighbours(cell, size)) if (cell < next && !used.has(edgeKey(cell, next))) spare.push(edgeKey(cell, next));
  }
  const walls = new Set<string>();
  const wallCount = Math.floor(random() * 4);
  while (walls.size < wallCount && spare.length) walls.add(spare.splice(Math.floor(random() * spare.length), 1)[0]);

  let puzzle: ZipPuzzle = { size, walls: [...walls], ...numbersAlong(path, marks) };
  for (let round = 0; round < 40; round += 1) {
    const found = findPaths(puzzle, 2);
    const other = found?.find((candidate) => candidate.some((cell, i) => cell !== path[i]));
    if (found && !other) break;
    if (other) {
      // Block where the other path first leaves ours: a wall, or a number on our next cell.
      const at = other.findIndex((cell, i) => cell !== path[i]);
      if (random() < 0.5 && !marks.has(at)) marks.add(at);
      else walls.add(edgeKey(other[at - 1], other[at]));
    } else {
      const free = path.map((_, i) => i).filter((i) => !marks.has(i));
      marks.add(free[Math.floor(random() * free.length)]);
    }
    puzzle = { size, walls: [...walls], ...numbersAlong(path, marks) };
  }
  return puzzle;
}

/** Whether `path` (cells in order) is a complete, valid answer. */
export function zipSolved(puzzle: ZipPuzzle, path: number[]) {
  if (path.length !== puzzle.size * puzzle.size || puzzle.numbers[path[0]] !== 1) return false;
  if (puzzle.numbers[path[path.length - 1]] !== puzzle.last) return false;
  let expected = 1;
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i += 1) {
    const cell = path[i];
    if (seen.has(cell)) return false;
    seen.add(cell);
    if (i > 0 && (!zipNeighbours(path[i - 1], puzzle.size).includes(cell) || puzzle.walls.includes(edgeKey(path[i - 1], cell)))) return false;
    const number = puzzle.numbers[cell];
    if (number) {
      if (number !== expected) return false;
      expected += 1;
    }
  }
  return expected === puzzle.last + 1;
}
