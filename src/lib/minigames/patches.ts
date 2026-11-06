/**
 * Patches: split the whole grid into rectangles. Each rectangle holds exactly one clue; the
 * clue's number is its area and its icon its shape (square, wide, tall, or any). Puzzles come
 * from a random partition and are kept only when the clues allow exactly one split.
 */

export type PatchShape = "square" | "wide" | "tall" | "any";
export type PatchClue = { cell: number; area: number; shape: PatchShape };
export type PatchesPuzzle = { size: number; clues: PatchClue[] };
export type Rect = { r: number; c: number; h: number; w: number };

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export const shapeOf = (rect: Rect): Exclude<PatchShape, "any"> => (rect.w === rect.h ? "square" : rect.w > rect.h ? "wide" : "tall");
export const rectCells = (rect: Rect, size: number) =>
  Array.from({ length: rect.h * rect.w }, (_, i) => (rect.r + Math.floor(i / rect.w)) * size + rect.c + (i % rect.w));
export const rectContains = (rect: Rect, cell: number, size: number) => {
  const r = Math.floor(cell / size);
  const c = cell % size;
  return r >= rect.r && r < rect.r + rect.h && c >= rect.c && c < rect.c + rect.w;
};

function partition(size: number, random: () => number): Rect[] {
  const taken = new Array<boolean>(size * size).fill(false);
  const rects: Rect[] = [];
  for (let cell = 0; cell < size * size; cell += 1) {
    if (taken[cell]) continue;
    const r = Math.floor(cell / size);
    const c = cell % size;
    const options: { rect: Rect; weight: number }[] = [];
    for (let h = 1; r + h <= size && h <= 4; h += 1) {
      for (let w = 1; c + w <= size && w <= 4; w += 1) {
        const area = h * w;
        if (area > 8) continue;
        const rect = { r, c, h, w };
        if (rectCells(rect, size).some((i) => taken[i])) continue;
        options.push({ rect, weight: area === 1 ? 0.15 : area <= 6 ? 1 : 0.5 });
      }
    }
    let pick = random() * options.reduce((sum, option) => sum + option.weight, 0);
    let chosen = options[0].rect;
    for (const option of options) {
      pick -= option.weight;
      if (pick <= 0) {
        chosen = option.rect;
        break;
      }
    }
    rectCells(chosen, size).forEach((i) => (taken[i] = true));
    rects.push(chosen);
  }
  return rects;
}

/** Every rectangle a clue could stand for. */
function candidates(size: number, clues: PatchClue[], index: number): Rect[] {
  const clue = clues[index];
  const r0 = Math.floor(clue.cell / size);
  const c0 = clue.cell % size;
  const out: Rect[] = [];
  for (let h = 1; h <= clue.area; h += 1) {
    if (clue.area % h) continue;
    const w = clue.area / h;
    const rectShape = shapeOf({ r: 0, c: 0, h, w });
    if (clue.shape !== "any" && clue.shape !== rectShape) continue;
    for (let r = r0 - h + 1; r <= r0; r += 1) {
      for (let c = c0 - w + 1; c <= c0; c += 1) {
        if (r < 0 || c < 0 || r + h > size || c + w > size) continue;
        const rect = { r, c, h, w };
        if (clues.some((other, j) => j !== index && rectContains(rect, other.cell, size))) continue;
        out.push(rect);
      }
    }
  }
  return out;
}

function countSolutions(size: number, clues: PatchClue[], limit: number) {
  const options = clues.map((_, i) => candidates(size, clues, i));
  const covered = new Array<boolean>(size * size).fill(false);
  const done = new Array<boolean>(clues.length).fill(false);
  let count = 0;
  const go = (placed: number) => {
    if (count >= limit) return;
    if (placed === clues.length) {
      if (covered.every(Boolean)) count += 1;
      return;
    }
    // Most constrained clue first.
    let best = -1;
    let bestFits: Rect[] = [];
    for (let i = 0; i < clues.length; i += 1) {
      if (done[i]) continue;
      const fits = options[i].filter((rect) => rectCells(rect, size).every((cell) => !covered[cell]));
      if (fits.length === 0) return;
      if (best === -1 || fits.length < bestFits.length) {
        best = i;
        bestFits = fits;
      }
    }
    done[best] = true;
    for (const rect of bestFits) {
      const cells = rectCells(rect, size);
      cells.forEach((cell) => (covered[cell] = true));
      go(placed + 1);
      cells.forEach((cell) => (covered[cell] = false));
      if (count >= limit) break;
    }
    done[best] = false;
  };
  go(0);
  return count;
}

export function generatePatches(random: () => number, size = 6): PatchesPuzzle {
  let fallback: PatchClue[] | null = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const rects = partition(size, random);
    if (rects.length < size || rects.filter((rect) => rect.h * rect.w === 1).length > 2) continue;
    let clues: PatchClue[] = rects.map((rect) => {
      const cells = rectCells(rect, size);
      return { cell: cells[Math.floor(random() * cells.length)], area: cells.length, shape: shapeOf(rect) };
    });
    fallback ??= clues;
    if (countSolutions(size, clues, 2) !== 1) continue;
    // Hide some shapes while the answer stays unique.
    for (const index of shuffle(clues.map((_, i) => i), random).slice(0, Math.ceil(clues.length / 2))) {
      const next = clues.map((clue, i) => (i === index ? { ...clue, shape: "any" as const } : clue));
      if (countSolutions(size, next, 2) === 1) clues = next;
    }
    return { size, clues };
  }
  return { size, clues: fallback ?? [] };
}

/** Whether a drawn patch matches exactly one clue's area and shape. */
export function patchValid(rect: Rect, puzzle: PatchesPuzzle) {
  const inside = puzzle.clues.filter((clue) => rectContains(rect, clue.cell, puzzle.size));
  if (inside.length !== 1) return false;
  const [clue] = inside;
  return clue.area === rect.h * rect.w && (clue.shape === "any" || clue.shape === shapeOf(rect));
}

export function patchesSolved(rects: Rect[], puzzle: PatchesPuzzle) {
  const area = rects.reduce((sum, rect) => sum + rect.h * rect.w, 0);
  return area === puzzle.size * puzzle.size && rects.every((rect) => patchValid(rect, puzzle));
}
