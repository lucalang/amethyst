"use client";

import type { MotionLevel } from "@/lib/preferences";
import { SALAD_FRUITS, SNAKE_SIZES, SNAKE_SPEEDS, SPEED_RAMP, TIMED_SECONDS, activeModes, type BlendMode, type SnakeFruit, type SnakeSetup } from "@/lib/snake";
import { mix, observeCanvas, startLoop, withAlpha, type CanvasSize } from "./engine";
import {
  FRUIT_COLORS,
  INK,
  PAIR_HUES,
  drawBrick,
  drawCrate,
  drawCrystal,
  drawFruit,
  drawKey,
  drawLockBox,
  drawMine,
  drawPoison,
  drawPortal,
  drawStatue,
  drawStone,
  drawTarget,
} from "./snake-art";
import type { SoundName } from "./sound";

export const START_LENGTH = 3;
const MAX_QUEUED_TURNS = 3;
const GHOST_MS = 5000;
const SCRAMBLE_MS = 7000;
const STATUE_MS = 8000;
const WING_MS = 300;
/** How long the head may stay inside a danger zone before it goes off, at any speed. */
const FUSE_MS = 1200;
const MAX_PORTAL_PAIRS = 3;
/** One simulation step of the shared loop. */
const STEP_MS = 1000 / 60;
export const LAYER_HUES = ["#22b5a5", "#c64fdc"] as const;

/** Snake's own colors: a sunny sand board, a green snake and a blue partner, whatever the app theme. */
const LOOK = {
  board: "#f3e3b5",
  check: "#e9d49b",
  tuft: "#c9ae6a",
  rim: "#7a5a2e",
  wrapRim: "#3f8fd8",
  text: INK,
  snakes: ["#46b03c", "#3d82d6"],
  dead: "#9b9488",
} as const;

export type Direction = "up" | "down" | "left" | "right";
export type Phase = "ready" | "playing" | "paused" | "over";
export type OverReason = "crash" | "time" | "cleared" | "boom";
export type SnakeStatus = {
  layer: 0 | 1 | null;
  /** Seconds left on scrambled controls, and where each arrow currently steers. */
  scrambled: { seconds: number; map: Record<Direction, Direction> } | null;
  ghost: number | null;
};

type Point = { x: number; y: number };
/** A body cell, the direction the snake moved to enter it, and a per-snake serial number. */
type Cell = Point & { d: Direction; id: number };
type Snake = {
  cells: Cell[];
  lastTail: Point;
  dir: Direction;
  from: Direction;
  queue: Direction[];
  /** Yin Yang's second snake steers opposite to the input. */
  flip: boolean;
  nextId: number;
  ateAt: number;
  swallows: number[];
  ghost: Set<number>;
  ghostLeft: number;
  fuse: number;
  dead: boolean;
  /** Head and tail were just swapped: skip this step's glide. */
  frozen: boolean;
};
type Fruit = Point & { kind: SnakeFruit; born: number; layer: 0 | 1; lock: number | null; vx: number; vy: number; from: Point; movedAt: number };
type Key = Point & { lock: number; born: number };
type Crate = Point & { kind: SnakeFruit; hue: number; target: Point; from: Point; movedAt: number; born: number };
type Portal = { a: Point; b: Point; hue: number; born: number };
type Spot = Point & { born: number };
type Burst = Point & { color: string; born: number; big?: boolean };
type Floater = Point & { text: string; color: string; born: number };
type Seg = { pts: Point[]; d: number[] };
type SnakePath = { segs: Seg[]; cellDist: number[]; total: number };

const DIRS: Direction[] = ["up", "right", "down", "left"];
const VECTORS: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };
const ANGLES: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const easeOutBack = (t: number) => {
  const k = Math.min(1, Math.max(0, t));
  return 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;
};
const rand = (n: number) => Math.floor(Math.random() * n);
const hash = (n: number) => (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;
function takeRandom<T>(list: T[]): T {
  const i = rand(list.length);
  const [item] = list.splice(i, 1);
  return item;
}

export const sameSetup = (a: SnakeSetup, b: SnakeSetup) =>
  a.mode === b.mode &&
  a.fruit === b.fruit &&
  a.fruitCount === b.fruitCount &&
  a.size === b.size &&
  a.speed === b.speed &&
  a.blend.join() === b.blend.join();

/** A scrambled control map: every arrow steers somewhere new, and the map stays fixed for the effect. */
function scrambledMap(): Record<Direction, Direction> {
  for (;;) {
    const order = [...DIRS].sort(() => Math.random() - 0.5);
    if (order.every((d, i) => d !== DIRS[i])) return Object.fromEntries(DIRS.map((d, i) => [d, order[i]])) as Record<Direction, Direction>;
  }
}

function connected(blocked: Set<number>, grid: number) {
  const total = grid * grid;
  let start = 0;
  while (blocked.has(start)) start += 1;
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const cell = stack.pop() as number;
    const x = cell % grid;
    for (const next of [x > 0 ? cell - 1 : -1, x < grid - 1 ? cell + 1 : -1, cell - grid, cell + grid]) {
      if (next < 0 || next >= total || seen.has(next) || blocked.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen.size === total - blocked.size;
}

/**
 * Short straight walls (or single crystals) kept off the outer ring, out of the starting lanes and
 * apart from each other and from `avoid`, so the open board always stays one connected space.
 */
function scatter(grid: number, lanes: number[], density: number, maxLength: number, avoid: Set<number>): Set<number> {
  const target = Math.round(grid * grid * density);
  const near = (blocked: Set<number>, x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (blocked.has((y + dy) * grid + x + dx) || avoid.has((y + dy) * grid + x + dx)) return true;
    return false;
  };
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const blocked = new Set<number>();
    for (let tries = 0; tries < 500 && blocked.size < target; tries += 1) {
      const length = maxLength > 1 ? 2 + rand(maxLength - 1) : 1;
      const horizontal = Math.random() < 0.5;
      const x0 = 1 + rand(grid - 2);
      const y0 = 1 + rand(grid - 2);
      const cells = Array.from({ length }, (_, i) => (horizontal ? { x: x0 + i, y: y0 } : { x: x0, y: y0 + i }));
      const fits = cells.every(({ x, y }) => x <= grid - 2 && y <= grid - 2 && lanes.every((lane) => Math.abs(y - lane) > 1) && !near(blocked, x, y));
      if (fits) for (const { x, y } of cells) blocked.add(y * grid + x);
    }
    if (blocked.size >= target * 0.7 && connected(new Set([...blocked, ...avoid]), grid)) return blocked;
  }
  return new Set();
}

/** A polyline with rounded corners, so turns bend instead of kinking. */
function trace(ctx: CanvasRenderingContext2D, points: Point[], radius: number) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const before = Math.hypot(b.x - a.x, b.y - a.y) * (i === 1 ? 1 : 0.5);
    const after = Math.hypot(c.x - b.x, c.y - b.y) * (i === points.length - 2 ? 1 : 0.5);
    ctx.arcTo(b.x, b.y, c.x, c.y, Math.min(radius, before, after));
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

function pointIn(seg: Seg, d: number): Point {
  const last = seg.d.length - 1;
  for (let i = 1; i <= last; i += 1) {
    if (seg.d[i] >= d) {
      const k = Math.min(1, Math.max(0, (d - seg.d[i - 1]) / (seg.d[i] - seg.d[i - 1] || 1)));
      return { x: seg.pts[i - 1].x + (seg.pts[i].x - seg.pts[i - 1].x) * k, y: seg.pts[i - 1].y + (seg.pts[i].y - seg.pts[i - 1].y) * k };
    }
  }
  return seg.pts[last];
}

function pointAt(path: SnakePath, d: number): Point {
  const seg = path.segs.find((s) => d <= s.d[s.d.length - 1] + 1e-9) ?? path.segs[path.segs.length - 1];
  return pointIn(seg, d);
}

/** The parts of the body path between two distances from the head. */
function slice(path: SnakePath, a: number, b: number): Point[][] {
  const out: Point[][] = [];
  if (b <= a) return out;
  for (const seg of path.segs) {
    const last = seg.d.length - 1;
    if (seg.d[last] < a || seg.d[0] > b) continue;
    const from = Math.max(a, seg.d[0]);
    const to = Math.min(b, seg.d[last]);
    const pts = [pointIn(seg, from)];
    for (let i = 0; i <= last; i += 1) if (seg.d[i] > from && seg.d[i] < to) pts.push(seg.pts[i]);
    pts.push(pointIn(seg, to));
    out.push(pts);
  }
  return out;
}

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number) => void;
  onTime: (seconds: number | null) => void;
  onRound: (setup: SnakeSetup) => void;
  onOver: (score: number, reason: OverReason) => void;
  onStatus: (status: SnakeStatus) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

/**
 * Shared rules for every mode and mix:
 * - Each step every snake moves once. Leaving the board wraps (No Borders, Peace) or crashes; a
 *   portal cell sends the head straight to its twin, once per step.
 * - Deadly: walls, rocks, bricks, statues, active crystals, locked boxes, crates that can't move,
 *   any snake body (except Cheese holes and Ghost segments) and another head. Peace makes all of it
 *   harmless; crates are still pushed when they can move.
 * - Food is only eaten on the active layer and never while locked. Each fruit is one point.
 * - Anything solid spawns away from heads and never cuts the board apart, food only appears where
 *   a head can reach, and objectives that become impossible are moved or replaced.
 */
export function createSnake(canvas: HTMLCanvasElement, initial: SnakeSetup, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  let lightCanvas: HTMLCanvasElement | null = null;
  // The board and everything that never moves are painted once into this layer and reused.
  let boardCanvas: HTMLCanvasElement | null = null;
  let boardKey = "";
  let statics = 0;
  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let setup = initial;
  let upcoming = initial;
  let modes = new Set<BlendMode>();
  let grid = SNAKE_SIZES[setup.size].grid;
  let wrap = false;
  let peace = false;
  let stones = new Set<number>();
  const bricks = new Map<number, number>();
  const statues = new Map<number, number>();
  let crystals: [Set<number>, Set<number>] = [new Set(), new Set()];
  let layer: 0 | 1 | null = null;
  let layerAt = -1e4;
  let snakes: Snake[] = [];
  let fruits: Fruit[] = [];
  let keys: Key[] = [];
  let crates: Crate[] = [];
  let portals: Portal[] = [];
  let mines: Spot[] = [];
  let poisons: Spot[] = [];
  let bursts: Burst[] = [];
  let floaters: Floater[] = [];
  let ticks = 0;
  let interval = SNAKE_SPEEDS[initial.speed].start;
  let elapsed = 0;
  let clock = 0;
  let score = 0;
  let timeLeft: number | null = null;
  let shownSeconds: number | null | undefined;
  let scramble: Record<Direction, Direction> | null = null;
  let scrambleLeft = 0;
  let statueIn = STATUE_MS;
  let nextHue = 0;
  let shownStatus = "";
  let diedAt = 0;
  let resetAt = 0;
  let reason: OverReason = "crash";

  const idx = (x: number, y: number) => y * grid + x;
  const cellOf = (p: Point) => p.y * grid + p.x;
  const at = (c: number): Point => ({ x: c % grid, y: Math.floor(c / grid) });
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < grid && y < grid;
  const wrapped = (n: number) => (n + grid) % grid;
  const span = (a: number, b: number) => {
    const d = Math.abs(a - b);
    return wrap ? Math.min(d, grid - d) : d;
  };
  const kindFor = (): SnakeFruit => (setup.fruit === "salad" ? SALAD_FRUITS[rand(SALAD_FRUITS.length)] : setup.fruit);
  const hueOf = (n: number) => PAIR_HUES[n % PAIR_HUES.length];

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };

  function emitTime() {
    const seconds = timeLeft === null ? null : Math.ceil(timeLeft / 1000);
    if (seconds === shownSeconds) return;
    shownSeconds = seconds;
    hooks.onTime(seconds);
  }

  function emitStatus() {
    const ghost = Math.max(0, ...snakes.map((s) => s.ghostLeft));
    const status: SnakeStatus = {
      layer,
      scrambled: scramble ? { seconds: Math.ceil(scrambleLeft / 1000), map: scramble } : null,
      ghost: ghost > 0 ? Math.ceil(ghost / 1000) : null,
    };
    const key = JSON.stringify(status);
    if (key === shownStatus) return;
    shownStatus = key;
    hooks.onStatus(status);
  }

  function floater(p: Point, text: string, color: string) {
    floaters.push({ x: p.x, y: p.y, text, color, born: performance.now() });
  }

  // ---------------------------------------------------------------------------
  // Board queries
  // ---------------------------------------------------------------------------

  function solidAt(c: number) {
    return stones.has(c) || bricks.has(c) || statues.has(c) || (layer !== null && crystals[layer].has(c));
  }
  const lockedAt = (c: number) => fruits.some((f) => f.lock !== null && cellOf(f) === c);
  const crateAt = (c: number) => crates.find((k) => cellOf(k) === c);
  const bodyAt = (c: number) => snakes.some((s) => s.cells.some((p) => cellOf(p) === c));
  function portalExit(c: number): Point | null {
    for (const p of portals) {
      if (cellOf(p.a) === c) return p.b;
      if (cellOf(p.b) === c) return p.a;
    }
    return null;
  }
  const inZone = (c: number) => {
    const { x, y } = at(c);
    return mines.some((m) => Math.abs(m.x - x) <= 1 && Math.abs(m.y - y) <= 1);
  };
  const isGap = (cell: Cell, index: number) => modes.has("cheese") && index >= 2 && cell.id % 4 === 0;

  function neighbours(c: number): number[] {
    const { x, y } = at(c);
    const out: number[] = [];
    for (const d of DIRS) {
      let nx = x + VECTORS[d].x;
      let ny = y + VECTORS[d].y;
      if (!inBounds(nx, ny)) {
        if (!wrap) continue;
        nx = wrapped(nx);
        ny = wrapped(ny);
      }
      out.push(idx(nx, ny));
    }
    return out;
  }

  /** Cells nothing can walk through for planning purposes (bodies move, so they don't count). */
  function blockedSet() {
    const out = new Set<number>([...stones, ...bricks.keys(), ...statues.keys()]);
    if (layer !== null) for (const c of crystals[layer]) out.add(c);
    for (const f of fruits) if (f.lock !== null) out.add(cellOf(f));
    for (const k of crates) out.add(cellOf(k));
    return out;
  }

  /** Cells a head can reach. */
  function flood(blocked: Set<number>) {
    const seen = new Set<number>();
    const stack: number[] = [];
    for (const s of snakes) {
      const c = cellOf(s.cells[0]);
      if (!seen.has(c)) {
        seen.add(c);
        stack.push(c);
      }
    }
    while (stack.length) {
      const c = stack.pop() as number;
      for (const n of neighbours(c)) {
        if (seen.has(n) || blocked.has(n)) continue;
        seen.add(n);
        stack.push(n);
      }
    }
    return seen;
  }

  /** The cells a crate needs clear: its target, the line to it and the spot to push from. */
  function lane(k: Crate): number[] {
    const out = [cellOf(k.target)];
    const dx = Math.sign(k.target.x - k.x);
    const dy = Math.sign(k.target.y - k.y);
    if ((dx === 0) === (dy === 0)) return out;
    if (inBounds(k.x - dx, k.y - dy)) out.push(idx(k.x - dx, k.y - dy));
    for (let x = k.x + dx, y = k.y + dy; x !== k.target.x || y !== k.target.y; x += dx, y += dy) out.push(idx(x, y));
    return out;
  }

  /** Everything already on the board, plus cells reserved for crate pushes. */
  function taken() {
    const out = new Set<number>([...stones, ...bricks.keys(), ...statues.keys(), ...crystals[0], ...crystals[1]]);
    for (const s of snakes) for (const c of s.cells) out.add(cellOf(c));
    for (const list of [fruits, keys, poisons]) for (const p of list) out.add(cellOf(p));
    for (const k of crates) {
      out.add(cellOf(k));
      for (const c of lane(k)) out.add(c);
    }
    for (const p of portals) {
      out.add(cellOf(p.a));
      out.add(cellOf(p.b));
    }
    return out;
  }

  /** Close to a head, or in a line ahead of it: no place for anything new and dangerous. */
  function nearHead(c: number, reach = 2) {
    const { x, y } = at(c);
    for (const s of snakes) {
      const h = s.cells[0];
      if (span(h.x, x) <= reach && span(h.y, y) <= reach) return true;
      for (const d of [s.dir, ...s.queue]) {
        for (let k = 1; k <= 4; k += 1) {
          let ax = h.x + VECTORS[d].x * k;
          let ay = h.y + VECTORS[d].y * k;
          if (wrap) {
            ax = wrapped(ax);
            ay = wrapped(ay);
          }
          if (ax === x && ay === y) return true;
        }
      }
    }
    return false;
  }

  /** Open cells a head can reach, outside danger zones. */
  function freeCells() {
    const used = taken();
    const reach = flood(blockedSet());
    const out: number[] = [];
    for (let c = 0; c < grid * grid; c += 1) if (!used.has(c) && reach.has(c) && !inZone(c)) out.push(c);
    return out;
  }

  /** A cell for something solid that keeps every reachable cell reachable, away from heads. */
  function placeBlocker(candidates: number[]): number | null {
    const blocked = blockedSet();
    const before = flood(blocked);
    const pool = [...candidates];
    for (let tries = 0; tries < 30 && pool.length; tries += 1) {
      const c = takeRandom(pool);
      if (nearHead(c)) continue;
      blocked.add(c);
      const after = flood(blocked).size;
      blocked.delete(c);
      if (after === before.size - (before.has(c) ? 1 : 0)) return c;
    }
    return null;
  }

  function hitsBody(c: number, vacating: Set<Snake>) {
    for (const s of snakes) {
      const last = s.cells.length - 1;
      for (let i = 0; i <= last; i += 1) {
        const cell = s.cells[i];
        if (cellOf(cell) !== c) continue;
        if (i === last && vacating.has(s)) continue;
        if (isGap(cell, i) || (s.ghostLeft > 0 && s.ghost.has(cell.id))) continue;
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------------

  function chooseLayer(): 0 | 1 {
    if (layer === null) return 0;
    if (!fruits.some((f) => f.layer === layer)) return layer;
    return Math.random() < 0.5 ? 0 : 1;
  }

  function addFruit(p: Point, kind: SnakeFruit, now: number, lock: number | null, fruitLayer: 0 | 1) {
    fruits.push({ ...p, kind, born: now, layer: fruitLayer, lock, vx: Math.random() < 0.5 ? -1 : 1, vy: Math.random() < 0.5 ? -1 : 1, from: { ...p }, movedAt: clock });
  }

  function spawnFruit(now: number) {
    const free = freeCells();
    if (!free.length) return false;
    let cell: number | null = null;
    let lock: number | null = null;
    if (modes.has("key")) {
      const box = placeBlocker(free);
      const keyCells = free.filter((c) => c !== box);
      if (box !== null && keyCells.length) {
        lock = nextHue++;
        cell = box;
        keys.push({ ...at(keyCells[rand(keyCells.length)]), lock, born: now });
      }
    }
    addFruit(at(cell ?? free[rand(free.length)]), kindFor(), now, lock, chooseLayer());
    return true;
  }

  /** A crate pushed straight onto its target from a clear spot behind it, so it can always be solved. */
  function spawnCrate(now: number) {
    const list = freeCells();
    const free = new Set(list);
    const blocked = blockedSet();
    const before = flood(blocked).size;
    for (let tries = 0; tries < 60 && list.length; tries += 1) {
      const target = at(list[rand(list.length)]);
      const v = VECTORS[DIRS[rand(4)]];
      const k = 2 + rand(3);
      const bx = target.x - v.x * k;
      const by = target.y - v.y * k;
      if (!inBounds(bx, by) || !inBounds(bx - v.x, by - v.y)) continue;
      const box = idx(bx, by);
      let ok = free.has(box) && free.has(idx(bx - v.x, by - v.y)) && !nearHead(box);
      for (let j = 1; ok && j <= k; j += 1) ok = free.has(idx(bx + v.x * j, by + v.y * j));
      if (!ok) continue;
      blocked.add(box);
      const after = flood(blocked).size;
      blocked.delete(box);
      if (after !== before - 1) continue;
      crates.push({ x: bx, y: by, from: { x: bx, y: by }, movedAt: -1e4, kind: kindFor(), hue: nextHue++, target, born: now });
      return true;
    }
    return false;
  }

  /** Top food up to the chosen amount (crates count), plus poison, using only open, reachable cells. */
  function spawnFood(now: number) {
    let missing = setup.fruitCount - fruits.length - crates.length;
    while (missing > 0) {
      missing -= 1;
      if (modes.has("sokoban") && spawnCrate(now)) continue;
      if (!spawnFruit(now)) break;
    }
    if (!modes.has("poison")) return;
    const want = Math.max(1, Math.round(setup.fruitCount / 3));
    while (poisons.length < want) {
      const free = freeCells();
      if (!free.length) break;
      poisons.push({ ...at(free[rand(free.length)]), born: now });
    }
  }

  function addBrick(now: number) {
    const c = placeBlocker(freeCells());
    if (c !== null) bricks.set(c, now);
  }

  function addPortals(now: number) {
    const ok = (c: number) => {
      const { x, y } = at(c);
      if (!wrap && (x === 0 || y === 0 || x === grid - 1 || y === grid - 1)) return false;
      if (nearHead(c)) return false;
      if (portals.some((p) => [p.a, p.b].some((q) => Math.abs(q.x - x) <= 1 && Math.abs(q.y - y) <= 1))) return false;
      return neighbours(c).filter((n) => !solidAt(n) && !lockedAt(n)).length >= 3;
    };
    const free = freeCells().filter(ok);
    for (let tries = 0; tries < 40 && free.length >= 2; tries += 1) {
      const a = at(free[rand(free.length)]);
      const b = at(free[rand(free.length)]);
      if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 4) continue;
      portals.push({ a, b, hue: nextHue++, born: now });
      if (portals.length > MAX_PORTAL_PAIRS) portals.shift();
      return;
    }
  }

  function addMine(now: number) {
    const max = Math.max(2, Math.floor((grid * grid) / 60));
    const options: number[] = [];
    for (let y = 1; y < grid - 1; y += 1) {
      for (let x = 1; x < grid - 1; x += 1) {
        if (mines.some((m) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) < 4)) continue;
        if (snakes.some((s) => span(s.cells[0].x, x) <= 3 && span(s.cells[0].y, y) <= 3)) continue;
        if (nearHead(idx(x, y), 3)) continue;
        options.push(idx(x, y));
      }
    }
    if (!options.length) return;
    if (mines.length >= max) mines.shift();
    mines.push({ ...at(options[rand(options.length)]), born: now });
  }

  function crateSolvable(k: Crate) {
    const dx = Math.sign(k.target.x - k.x);
    const dy = Math.sign(k.target.y - k.y);
    if ((dx === 0) === (dy === 0)) return dx === 0;
    if (!inBounds(k.x - dx, k.y - dy) || solidAt(idx(k.x - dx, k.y - dy))) return false;
    for (let x = k.x + dx, y = k.y + dy; ; x += dx, y += dy) {
      const c = idx(x, y);
      if (solidAt(c) || lockedAt(c) || crates.some((o) => o !== k && o.x === x && o.y === y)) return false;
      if (x === k.target.x && y === k.target.y) return true;
    }
  }

  /** Give a crate that can no longer reach its target a new target it can be pushed onto. */
  function retarget(k: Crate) {
    const used = taken();
    for (const c of lane(k)) used.delete(c);
    const options: Point[] = [];
    for (const d of DIRS) {
      const v = VECTORS[d];
      if (!inBounds(k.x - v.x, k.y - v.y) || solidAt(idx(k.x - v.x, k.y - v.y))) continue;
      for (let j = 1; j <= 4; j += 1) {
        const x = k.x + v.x * j;
        const y = k.y + v.y * j;
        if (!inBounds(x, y) || used.has(idx(x, y)) || inZone(idx(x, y))) break;
        options.push({ x, y });
      }
    }
    if (!options.length) return false;
    k.target = options[rand(options.length)];
    return true;
  }

  function fixCrates() {
    for (const k of [...crates]) {
      if (crateSolvable(k) || retarget(k)) continue;
      crates = crates.filter((o) => o !== k);
      floater(k, "Poof", "#d39457");
    }
  }

  /** Move a crate one cell; false when something is in the way. */
  function pushCrate(k: Crate, dir: Direction, now: number) {
    const v = VECTORS[dir];
    let x = k.x + v.x;
    let y = k.y + v.y;
    if (!inBounds(x, y)) {
      if (!wrap) return false;
      x = wrapped(x);
      y = wrapped(y);
    }
    const c = idx(x, y);
    const busy =
      solidAt(c) ||
      bodyAt(c) ||
      portalExit(c) !== null ||
      crates.some((o) => o !== k && cellOf(o) === c) ||
      [fruits, keys, poisons].some((list: Point[]) => list.some((p) => cellOf(p) === c));
    if (busy) return false;
    k.from = { x: k.x, y: k.y };
    k.movedAt = clock;
    k.x = x;
    k.y = y;
    hooks.live().play("chip");
    if (x === k.target.x && y === k.target.y) {
      crates = crates.filter((o) => o !== k);
      addFruit({ x, y }, k.kind, now, null, layer ?? 0);
      bursts.push({ x, y, color: hueOf(k.hue), born: now, big: true });
      floater({ x, y }, "Open!", hueOf(k.hue));
      hooks.live().play("combo");
    } else if (!crateSolvable(k) && !retarget(k)) {
      crates = crates.filter((o) => o !== k);
      floater({ x, y }, "Poof", "#d39457");
    }
    return true;
  }

  /** Remove food and pickups the snakes can no longer reach; spawning replaces them. */
  function dropUnreachable() {
    const reach = flood(blockedSet());
    const near = (p: Point) => reach.has(cellOf(p)) || neighbours(cellOf(p)).some((n) => reach.has(n));
    keys = keys.filter((k) => reach.has(cellOf(k)));
    fruits = fruits.filter((f) => (f.lock === null ? reach.has(cellOf(f)) : near(f) && keys.some((k) => k.lock === f.lock)));
    keys = keys.filter((k) => fruits.some((f) => f.lock === k.lock));
    crates = crates.filter((k) => near(k) && reach.has(cellOf(k.target)));
    poisons = poisons.filter((p) => reach.has(cellOf(p)));
  }

  // ---------------------------------------------------------------------------
  // Round lifecycle
  // ---------------------------------------------------------------------------

  function makeSnake(x: number, y: number, dir: Direction, flip: boolean): Snake {
    const v = VECTORS[dir];
    const cells = Array.from({ length: START_LENGTH }, (_, i) => ({ x: x - v.x * i, y: y - v.y * i, d: dir, id: START_LENGTH - 1 - i }));
    return {
      cells,
      lastTail: { ...cells[START_LENGTH - 1] },
      dir,
      from: dir,
      queue: [],
      flip,
      nextId: START_LENGTH,
      ateAt: -1e4,
      swallows: [],
      ghost: new Set(),
      ghostLeft: 0,
      fuse: 0,
      dead: false,
      frozen: false,
    };
  }

  function reset() {
    setup = upcoming;
    modes = new Set(activeModes(setup));
    grid = SNAKE_SIZES[setup.size].grid;
    peace = modes.has("peace");
    wrap = peace || modes.has("wrap");
    const twin = modes.has("yinyang");
    const x = Math.floor(grid * (twin ? 0.3 : 0.4));
    const y = Math.floor(grid * (twin ? 0.3 : 0.5));
    snakes = [makeSnake(x, y, "right", false)];
    if (twin) snakes.push(makeSnake(grid - 1 - x, grid - 1 - y, "left", true));
    const lanes = snakes.map((s) => s.cells[0].y);
    stones = modes.has("obstacles") ? scatter(grid, lanes, 0.05, 4, new Set()) : new Set();
    if (modes.has("dimension")) {
      const first = scatter(grid, lanes, 0.035, 1, stones);
      crystals = [first, scatter(grid, lanes, 0.035, 1, new Set([...stones, ...first]))];
      layer = 0;
    } else {
      crystals = [new Set(), new Set()];
      layer = null;
    }
    bricks.clear();
    statues.clear();
    fruits = [];
    keys = [];
    crates = [];
    portals = [];
    mines = [];
    poisons = [];
    bursts = [];
    floaters = [];
    ticks = 0;
    score = 0;
    interval = pace();
    statics += 1;
    elapsed = 0;
    clock = 0;
    scramble = null;
    scrambleLeft = 0;
    statueIn = STATUE_MS;
    nextHue = 0;
    layerAt = -1e4;
    resetAt = performance.now();
    spawnFood(resetAt);
    timeLeft = modes.has("timed") ? TIMED_SECONDS * 1000 : null;
    emitTime();
    emitStatus();
    hooks.onScore(0);
    hooks.onRound(setup);
    setPhase("ready");
  }

  function end(why: OverReason) {
    reason = why;
    diedAt = performance.now();
    for (const s of snakes) s.queue = [];
    // Show the last completed move rather than freezing mid-step (the clock may stop mid-step).
    if (why !== "time") elapsed = interval;
    setPhase("over");
    hooks.live().play(why === "crash" ? "over" : why === "boom" ? "bomb" : "win");
    hooks.onOver(score, why);
  }

  /** Whether a step in `d` is survivable right now (used to pick a heading after a swap). */
  function safeMove(s: Snake, d: Direction) {
    const h = s.cells[0];
    let x = h.x + VECTORS[d].x;
    let y = h.y + VECTORS[d].y;
    if (!inBounds(x, y)) {
      if (!wrap) return false;
      x = wrapped(x);
      y = wrapped(y);
    }
    const exit = portalExit(idx(x, y));
    const c = exit ? cellOf(exit) : idx(x, y);
    return !solidAt(c) && !lockedAt(c) && !crateAt(c) && !hitsBody(c, new Set(snakes));
  }

  /** Two Heads: the tail becomes the head and the snake heads away from its body. */
  function swapEnds(s: Snake) {
    const old = s.cells;
    const n = old.length;
    s.cells = old.map((_, j) => {
      const k = n - 1 - j;
      const c = old[k];
      return { x: c.x, y: c.y, id: c.id, d: k >= 1 ? OPPOSITE[old[k - 1].d] : OPPOSITE[c.d] };
    });
    s.lastTail = { ...s.cells[n - 1] };
    s.frozen = true;
    const natural = s.cells[0].d;
    const options = [natural, ...DIRS.filter((d) => d !== natural && d !== OPPOSITE[natural])];
    const dir = options.find((d) => safeMove(s, d)) ?? natural;
    s.dir = s.from = dir;
    s.queue = [];
    s.swallows = [];
    floater(s.cells[0], "Swap!", "#ffd34d");
  }

  function switchLayer(now: number) {
    if (layer === null) return;
    layer = layer === 0 ? 1 : 0;
    layerAt = now;
    // Crystals of the new layer never appear under or right in front of a snake.
    for (const c of [...crystals[layer]]) if (bodyAt(c) || nearHead(c, 1)) crystals[layer].delete(c);
    hooks.live().play("tap", layer ? 1.3 : 0.9);
  }

  /** Statue: the last few tail cells turn to stone. */
  function petrify(now: number) {
    let changed = false;
    for (const s of snakes) {
      if (s.cells.length < 5) continue;
      const parts = s.cells.splice(s.cells.length - Math.min(3, s.cells.length - 4));
      s.lastTail = { ...s.cells[s.cells.length - 1] };
      for (const p of parts) statues.set(cellOf(p), now);
      floater(parts[0], "Stone!", "#a7b0a2");
      changed = true;
    }
    if (!changed) return;
    // A portal end turned to stone would lead straight into it.
    portals = portals.filter((p) => !statues.has(cellOf(p.a)) && !statues.has(cellOf(p.b)));
    fruits = fruits.filter((f) => !statues.has(cellOf(f)));
    hooks.live().play("place");
    dropUnreachable();
    fixCrates();
    spawnFood(now);
  }

  function moveFruits() {
    for (const f of fruits) {
      if (clock - f.movedAt < WING_MS) continue;
      f.from = { x: f.x, y: f.y };
      f.movedAt = clock;
      for (const [vx, vy] of [
        [f.vx, f.vy],
        [-f.vx, f.vy],
        [f.vx, -f.vy],
        [-f.vx, -f.vy],
      ]) {
        const x = f.x + vx;
        const y = f.y + vy;
        if (!inBounds(x, y)) continue;
        const c = idx(x, y);
        const blocked =
          stones.has(c) ||
          bricks.has(c) ||
          statues.has(c) ||
          (layer !== null && crystals[f.layer].has(c)) ||
          bodyAt(c) ||
          portalExit(c) !== null ||
          fruits.some((o) => o !== f && cellOf(o) === c) ||
          [keys, poisons].some((list: Point[]) => list.some((p) => cellOf(p) === c));
        if (blocked) continue;
        f.vx = vx;
        f.vy = vy;
        f.x = x;
        f.y = y;
        break;
      }
    }
  }

  function tick() {
    const now = performance.now();
    ticks += 1;
    const plans = snakes.map((s) => {
      s.frozen = false;
      s.from = s.dir;
      s.dir = s.queue.shift() ?? s.dir;
      const h = s.cells[0];
      let x = h.x + VECTORS[s.dir].x;
      let y = h.y + VECTORS[s.dir].y;
      let out = false;
      if (!inBounds(x, y)) {
        if (wrap) {
          x = wrapped(x);
          y = wrapped(y);
        } else out = true;
      }
      if (!out) {
        const exit = portalExit(idx(x, y));
        if (exit) {
          x = exit.x;
          y = exit.y;
        }
      }
      const food = out ? undefined : fruits.find((f) => f.x === x && f.y === y && f.lock === null && (layer === null || f.layer === layer));
      return { s, x, y, out, food };
    });
    if (plans.length === 2 && plans[0].food && plans[0].food === plans[1].food) plans[1].food = undefined;

    const vacating = new Set(plans.filter((p) => !p.food).map((p) => p.s));
    const crashed: Snake[] = [];
    for (const p of plans) {
      if (p.out) {
        crashed.push(p.s);
        continue;
      }
      const c = idx(p.x, p.y);
      const crate = crateAt(c);
      if (crate && !pushCrate(crate, p.s.dir, now) && !peace) {
        crashed.push(p.s);
        continue;
      }
      if (peace) continue;
      const headOn = plans.some((q) => q !== p && q.x === p.x && q.y === p.y);
      if (solidAt(c) || lockedAt(c) || hitsBody(c, vacating) || headOn) crashed.push(p.s);
    }
    if (crashed.length) {
      for (const s of crashed) s.dead = true;
      return end("crash");
    }

    for (const { s, x, y, food } of plans) {
      s.lastTail = { ...s.cells[s.cells.length - 1] };
      const head: Cell = { x, y, d: s.dir, id: s.nextId++ };
      s.cells = [head, ...(food ? s.cells : s.cells.slice(0, -1))];
    }

    let ate = false;
    for (const { s, x, y, food } of plans) {
      const c = idx(x, y);
      const key = keys.find((k) => cellOf(k) === c);
      if (key) {
        keys = keys.filter((k) => k !== key);
        const box = fruits.find((f) => f.lock === key.lock);
        if (box) {
          box.lock = null;
          box.born = now;
          bursts.push({ ...box, color: hueOf(key.lock), born: now });
          floater(box, "Unlocked!", hueOf(key.lock));
        }
        hooks.live().play("combo");
      }
      const poison = poisons.find((p) => cellOf(p) === c);
      if (poison) {
        poisons = poisons.filter((p) => p !== poison);
        scramble = scrambledMap();
        scrambleLeft = SCRAMBLE_MS;
        for (const other of snakes) other.queue = [];
        bursts.push({ x, y, color: "#8e8a96", born: now });
        floater({ x, y }, "Scrambled!", "#b58cff");
        hooks.live().play("miss");
      }
      if (!food) continue;
      fruits = fruits.filter((f) => f !== food);
      ate = true;
      score += 1;
      s.ateAt = now;
      s.swallows.push(ticks);
      if (hooks.live().effects !== "off") bursts.push({ x, y, color: FRUIT_COLORS[food.kind], born: now });
      hooks.live().play("eat", 1 + Math.min(score, 40) / 80);
      if (modes.has("ghost")) {
        s.ghost = new Set(s.cells.slice(1).map((cell) => cell.id));
        s.ghostLeft = GHOST_MS;
      }
      if (modes.has("twin")) swapEnds(s);
    }

    if (ate) {
      if (layer !== null) switchLayer(now);
      if (modes.has("wall")) addBrick(now);
      if (modes.has("portal")) addPortals(now);
      if (modes.has("minesweeper")) addMine(now);
      if (modes.has("wall")) fixCrates();
      interval = pace();
      hooks.onScore(score);
    }

    spawnFood(now);
    if (!fruits.length && !crates.length) end("cleared");
  }

  /** Milliseconds per move for the round's speed, quickening evenly with each fruit. */
  function pace() {
    const { start, min } = SNAKE_SPEEDS[setup.speed];
    return Math.max(min, start - (score * (start - min)) / SPEED_RAMP);
  }

  /** Danger zones burn in real time, so the fuse lasts as long at every speed. */
  function burnFuses(ms: number) {
    if (!mines.length) return;
    const now = performance.now();
    for (const s of snakes) {
      const h = s.cells[0];
      const zone = mines.filter((m) => Math.abs(m.x - h.x) <= 1 && Math.abs(m.y - h.y) <= 1);
      s.fuse = zone.length ? s.fuse + ms : 0;
      if (s.fuse < FUSE_MS) continue;
      mines = mines.filter((m) => !zone.includes(m));
      for (const m of zone) bursts.push({ ...m, color: "#ff6a2e", born: now, big: true });
      s.fuse = 0;
      if (!peace) {
        s.dead = true;
        return end("boom");
      }
      floater(h, "Boom!", "#ff6a2e");
      hooks.live().play("bomb");
    }
  }

  function step(ms: number) {
    if (phase !== "playing") return;
    clock += ms;
    if (timeLeft !== null) {
      timeLeft = Math.max(0, timeLeft - ms);
      emitTime();
      if (timeLeft === 0) return end("time");
    }
    if (scramble) {
      scrambleLeft -= ms;
      if (scrambleLeft <= 0) {
        scramble = null;
        for (const s of snakes) s.queue = [];
        floater(snakes[0].cells[0], "Controls back", "#4fcf6a");
        hooks.live().play("tap");
      }
    }
    for (const s of snakes) {
      if (s.ghostLeft <= 0) continue;
      s.ghostLeft = Math.max(0, s.ghostLeft - ms);
      if (s.ghostLeft === 0) s.ghost.clear();
    }
    if (modes.has("statue")) {
      statueIn -= ms;
      if (statueIn <= 0) {
        statueIn = STATUE_MS;
        petrify(performance.now());
      }
    }
    if (modes.has("winged")) moveFruits();
    burnFuses(ms);
    if (phase !== "playing") return;
    emitStatus();
    elapsed += ms;
    while (elapsed >= interval && phase === "playing") {
      elapsed -= interval;
      tick();
    }
  }

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------

  /** How two consecutive body cells connect: side by side, across a wrapped edge, or through a portal. */
  function link(newer: Cell, older: Point): "adjacent" | "wrapped" | "jump" {
    const v = VECTORS[newer.d];
    if (newer.x === older.x + v.x && newer.y === older.y + v.y) return "adjacent";
    if (wrap && newer.x === wrapped(older.x + v.x) && newer.y === wrapped(older.y + v.y)) return "wrapped";
    return "jump";
  }

  /** The body as smooth lines in grid units, broken where it wraps or passes through a portal. */
  function snakePath(s: Snake, t: number): SnakePath {
    const c = s.cells;
    const n = c.length;
    const segs: Seg[] = [];
    let pts: Point[] = [];
    let ds: number[] = [];
    let dist = 0;
    const add = (p: Point) => {
      const q = pts[pts.length - 1];
      if (q) {
        const step = Math.hypot(p.x - q.x, p.y - q.y);
        if (step < 1e-4) return;
        dist += step;
      }
      pts.push(p);
      ds.push(dist);
    };
    const tt = s.frozen ? 1 : t;
    const h = c[0];
    const hv = VECTORS[h.d];
    const headLink = link(h, c[1]);
    if (headLink === "adjacent") add({ x: c[1].x + hv.x * tt, y: c[1].y + hv.y * tt });
    else {
      const stub = headLink === "wrapped" ? 1 : 0.45;
      add({ x: h.x - hv.x * (1 - tt) * stub, y: h.y - hv.y * (1 - tt) * stub });
    }
    const cellDist = [0];
    for (let i = 1; i < n; i += 1) {
      const newer = c[i - 1];
      const older = c[i];
      const kind = link(newer, older);
      if (kind !== "adjacent") {
        const v = VECTORS[newer.d];
        const stub = kind === "wrapped" ? 1 : 0.45;
        add({ x: newer.x - v.x * stub, y: newer.y - v.y * stub });
        segs.push({ pts, d: ds });
        pts = [{ x: older.x + v.x * stub, y: older.y + v.y * stub }];
        ds = [dist];
      }
      add(older);
      cellDist.push(dist);
    }
    const tail = c[n - 1];
    if (!s.frozen && link(tail, s.lastTail) === "adjacent") add({ x: s.lastTail.x + (tail.x - s.lastTail.x) * t, y: s.lastTail.y + (tail.y - s.lastTail.y) * t });
    segs.push({ pts, d: ds });
    return { segs, cellDist, total: dist };
  }

  function draw(alpha = 0) {
    if (!ctx) return;
    const { width, height, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cell = Math.min(width, height) / grid;
    const board = cell * grid;
    const ox = (width - board) / 2;
    const oy = (height - board) / 2;
    const cx = (x: number) => ox + (x + 0.5) * cell;
    const cy = (y: number) => oy + (y + 0.5) * cell;
    const now = performance.now();
    const effects = hooks.live().effects;
    const moving = effects !== "off";
    const full = effects === "full";
    const lost = phase === "over" && (reason === "crash" || reason === "boom");
    const corner = Math.min(16, cell * 0.7);
    const pop = (born: number) => (moving ? easeOutBack((now - born) / 260) : 1);
    const bob = (seed: number) => (full && phase !== "over" ? Math.sin(now / 320 + seed) * 0.035 : 0);
    // Simulation runs in fixed steps; motion is drawn between them so it stays smooth at any refresh rate.
    const ahead = phase === "playing" ? alpha * STEP_MS : 0;
    const vclock = clock + ahead;
    const t = phase === "ready" ? 1 : Math.min(1, (elapsed + ahead) / interval);
    const settled = (born: number) => !moving || now - born >= 300;

    const sinceDeath = now - diedAt;
    const shake = lost && full && sinceDeath < 320 ? Math.sin(now / 16) * cell * 0.08 * (1 - sinceDeath / 320) : 0;
    ctx.save();
    ctx.translate(shake, 0);

    // Board and settled scenery come from a cached layer that is repainted only when they change.
    let matured = 0;
    for (const born of bricks.values()) if (settled(born)) matured += 1;
    for (const born of statues.values()) if (settled(born)) matured += 1;
    const key = [width, height, dpr, grid, layer, statics, stones.size, crystals[0].size, crystals[1].size, matured].join();
    if (key !== boardKey || !boardCanvas) {
      paintBoard(cell, ox, oy, board, corner, settled);
      boardKey = key;
    }
    if (boardCanvas) ctx.drawImage(boardCanvas, 0, 0, width, height);

    // Everything on the board fades in together when a round is set up.
    ctx.globalAlpha = moving ? easeOut((now - resetAt) / 320) : 1;
    const fadeIn = ctx.globalAlpha;

    for (const m of mines) {
      const occupied = snakes.some((s) => s.fuse > 0 && Math.abs(s.cells[0].x - m.x) <= 1 && Math.abs(s.cells[0].y - m.y) <= 1);
      const pulse = full ? (Math.sin(now / (occupied ? 70 : 200)) + 1) / 2 : 0.5;
      const k = pop(m.born);
      const x0 = ox + (m.x - 1) * cell;
      const y0 = oy + (m.y - 1) * cell;
      ctx.save();
      ctx.translate(x0 + cell * 1.5, y0 + cell * 1.5);
      ctx.scale(k, k);
      ctx.translate(-(x0 + cell * 1.5), -(y0 + cell * 1.5));
      ctx.beginPath();
      ctx.roundRect(x0 + 2, y0 + 2, cell * 3 - 4, cell * 3 - 4, cell * 0.45);
      ctx.fillStyle = withAlpha("#ff4d2e", (occupied ? 0.22 : 0.12) + pulse * 0.08);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = withAlpha("#ffb020", 0.28);
      ctx.lineWidth = cell * 0.18;
      ctx.beginPath();
      for (let d = -3; d <= 6; d += 1) {
        ctx.moveTo(x0 + d * cell * 0.6, y0);
        ctx.lineTo(x0 + d * cell * 0.6 - cell * 3, y0 + cell * 3);
      }
      ctx.stroke();
      ctx.restore();
      ctx.setLineDash([cell * 0.3, cell * 0.2]);
      ctx.strokeStyle = "#e03a1e";
      ctx.lineWidth = Math.max(1.5, cell * 0.09);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawMine(ctx, cx(m.x), cy(m.y), cell * 0.8 * k, full ? (Math.sin(now / 150) + 1) / 2 : 1);
    }

    for (const k of crates) drawTarget(ctx, cx(k.target.x), cy(k.target.y), cell * 0.95, hueOf(k.hue), full ? (Math.sin(now / 260) + 1) / 2 : 0);

    for (const p of portals) {
      const k = pop(p.born);
      for (const [end, dir] of [
        [p.a, 1],
        [p.b, -1],
      ] as const) {
        drawPortal(ctx, cx(end.x), cy(end.y), cell * 0.95 * k, hueOf(p.hue), full ? (now / 500) * dir : 0);
      }
    }

    for (const [c, born] of bricks) if (!settled(born)) drawBrick(ctx, cx(c % grid), cy(Math.floor(c / grid)), cell * 0.96 * pop(born));
    for (const [c, born] of statues) if (!settled(born)) drawStatue(ctx, cx(c % grid), cy(Math.floor(c / grid)), cell * 0.96 * pop(born));

    for (const p of poisons) drawPoison(ctx, cx(p.x), cy(p.y), cell * 0.86 * pop(p.born) * (1 + bob(p.x + p.y)));
    for (const k of keys) drawKey(ctx, cx(k.x), cy(k.y), cell * 0.92 * pop(k.born) * (1 + bob(k.x * 2 + k.y)), hueOf(k.lock));

    const winged = modes.has("winged");
    for (const f of fruits) {
      const k = winged ? easeOut((vclock - f.movedAt) / WING_MS) : 1;
      const x = cx(f.from.x + (f.x - f.from.x) * k);
      const y = cy(f.from.y + (f.y - f.from.y) * k);
      const sz = cell * 0.9 * pop(f.born) * (1 + bob(f.x * 1.3 + f.y * 0.7));
      const away = layer !== null && f.layer !== layer;
      ctx.globalAlpha = fadeIn * (away ? 0.4 : 1);
      if (away) {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.44, 0, Math.PI * 2);
        ctx.setLineDash([cell * 0.15, cell * 0.12]);
        ctx.strokeStyle = LAYER_HUES[f.layer];
        ctx.lineWidth = Math.max(1, cell * 0.07);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (f.lock !== null) {
        drawLockBox(ctx, x, y, cell * 0.96, f.kind, hueOf(f.lock));
        continue;
      }
      ctx.fillStyle = "rgb(60 40 10 / 0.18)";
      ctx.beginPath();
      ctx.ellipse(x, y + cell * 0.38, Math.max(0, sz * 0.3), Math.max(0, sz * 0.08), 0, 0, Math.PI * 2);
      ctx.fill();
      if (winged) {
        const flap = full ? Math.sin(now / 70 + f.x) * 0.35 : 0;
        for (const side of [-1, 1]) {
          ctx.save();
          ctx.translate(x + side * cell * 0.3, y - cell * 0.12);
          ctx.rotate(side * (0.5 + flap));
          ctx.beginPath();
          ctx.ellipse(side * cell * 0.12, 0, cell * 0.2, cell * 0.11, 0, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.lineWidth = Math.max(1, cell * 0.05);
          ctx.strokeStyle = INK;
          ctx.stroke();
          ctx.restore();
        }
      }
      drawFruit(ctx, f.kind, x, y, sz);
    }
    ctx.globalAlpha = fadeIn;

    for (const k of crates) {
      const m = easeOut((vclock - k.movedAt) / Math.max(60, interval * 0.8));
      drawCrate(ctx, cx(k.from.x + (k.x - k.from.x) * m), cy(k.from.y + (k.y - k.from.y) * m), cell * 0.94 * pop(k.born), k.kind, hueOf(k.hue));
    }

    const heads = snakes.map((s, i) => drawSnake(s, i, cell, ox, oy, now, effects, t));

    ctx.globalAlpha = 1;
    bursts = bursts.filter((b) => now - b.born < 560);
    for (const b of bursts) {
      const k = (now - b.born) / 560;
      const reach = b.big ? 1.6 : 0.85;
      ctx.strokeStyle = withAlpha(b.color, (1 - k) * 0.7);
      ctx.lineWidth = Math.max(1, cell * 0.09);
      ctx.beginPath();
      ctx.arc(cx(b.x), cy(b.y), cell * (0.3 + easeOut(k) * reach), 0, Math.PI * 2);
      ctx.stroke();
      if (!full) continue;
      ctx.fillStyle = withAlpha(b.color, 1 - k);
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + b.x + b.y;
        const d = cell * (0.3 + easeOut(k) * (reach + 0.2));
        ctx.beginPath();
        ctx.arc(cx(b.x) + Math.cos(a) * d, cy(b.y) + Math.sin(a) * d, cell * 0.1 * (1 - k), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Light: darkness everywhere except a glow around each head; fruit still glints faintly.
    if (modes.has("light")) {
      const lift = phase === "over" ? easeOut((now - diedAt) / 700) : 0;
      if (lift < 1) {
        lightCanvas ??= document.createElement("canvas");
        const w = Math.round(width * dpr);
        const hgt = Math.round(height * dpr);
        if (lightCanvas.width !== w || lightCanvas.height !== hgt) {
          lightCanvas.width = w;
          lightCanvas.height = hgt;
        }
        const lc = lightCanvas.getContext("2d");
        if (lc) {
          lc.setTransform(dpr, 0, 0, dpr, 0, 0);
          lc.globalCompositeOperation = "source-over";
          lc.clearRect(0, 0, width, height);
          lc.fillStyle = `rgb(6 4 12 / ${0.94 * (1 - lift)})`;
          lc.fillRect(ox, oy, board, board);
          lc.globalCompositeOperation = "destination-out";
          for (const h of heads) {
            const glow = lc.createRadialGradient(h.x, h.y, cell * 1.6, h.x, h.y, cell * 3.6);
            glow.addColorStop(0, "rgb(0 0 0 / 1)");
            glow.addColorStop(1, "rgb(0 0 0 / 0)");
            lc.fillStyle = glow;
            lc.fillRect(ox, oy, board, board);
          }
          ctx.drawImage(lightCanvas, 0, 0, width, height);
          ctx.fillStyle = `rgb(255 240 200 / ${0.55 * (1 - lift)})`;
          for (const f of fruits) {
            const twinkle = full ? 0.7 + Math.sin(now / 240 + f.x * 3) * 0.3 : 1;
            const r = cell * 0.12 * twinkle;
            ctx.beginPath();
            ctx.moveTo(cx(f.x), cy(f.y) - r * 2);
            ctx.lineTo(cx(f.x) + r * 0.5, cy(f.y) - r * 0.5);
            ctx.lineTo(cx(f.x) + r * 2, cy(f.y));
            ctx.lineTo(cx(f.x) + r * 0.5, cy(f.y) + r * 0.5);
            ctx.lineTo(cx(f.x), cy(f.y) + r * 2);
            ctx.lineTo(cx(f.x) - r * 0.5, cy(f.y) + r * 0.5);
            ctx.lineTo(cx(f.x) - r * 2, cy(f.y));
            ctx.lineTo(cx(f.x) - r * 0.5, cy(f.y) - r * 0.5);
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }

    // Dimension switch ripple.
    if (layer !== null && moving && now - layerAt < 520) {
      const k = (now - layerAt) / 520;
      for (const h of heads) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, board * easeOut(k), 0, Math.PI * 2);
        ctx.strokeStyle = withAlpha(LAYER_HUES[layer], (1 - k) * 0.8);
        ctx.lineWidth = cell * 0.35 * (1 - k);
        ctx.stroke();
      }
    }

    // Landmine fuse: a shrinking ring and the seconds left, above the darkness.
    snakes.forEach((s, i) => {
      if (!s.fuse || phase === "over") return;
      const h = heads[i];
      const left = Math.max(0, FUSE_MS - s.fuse);
      const urgent = left < 500;
      ctx.beginPath();
      ctx.arc(h.x, h.y, cell * 0.75, -Math.PI / 2, -Math.PI / 2 + (left / FUSE_MS) * Math.PI * 2);
      ctx.strokeStyle = urgent ? "#ff3b3b" : "#ffb020";
      ctx.lineWidth = Math.max(2, cell * 0.14);
      ctx.lineCap = "round";
      ctx.stroke();
      label((left / 1000).toFixed(1), h.x, h.y - cell * 1.05, Math.max(12, cell * 0.62), urgent ? "#ff3b3b" : "#ffb020");
    });

    floaters = floaters.filter((f) => now - f.born < 900);
    for (const f of floaters) {
      const k = (now - f.born) / 900;
      ctx.globalAlpha = 1 - k * k;
      label(f.text, cx(f.x), cy(f.y) - cell * (0.6 + (moving ? easeOut(k) * 0.9 : 0)), Math.max(11, cell * 0.55), f.color);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Frame: an inked wall, a dashed line when edges wrap, colored by layer in Dimension.
    ctx.beginPath();
    ctx.roundRect(ox + 1.5, oy + 1.5, board - 3, board - 3, corner);
    const frame = layer !== null ? LAYER_HUES[layer] : null;
    if (wrap) {
      ctx.setLineDash([Math.max(4, cell * 0.4), Math.max(4, cell * 0.3)]);
      ctx.strokeStyle = frame ?? LOOK.wrapRim;
      ctx.lineWidth = 2.5;
    } else {
      ctx.strokeStyle = frame ?? LOOK.rim;
      ctx.lineWidth = 3;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  /** Paints the board, its checks and tufts, and all scenery that has finished appearing into the cached layer. */
  function paintBoard(cell: number, ox: number, oy: number, board: number, corner: number, settled: (born: number) => boolean) {
    const { width, height, dpr } = size;
    boardCanvas ??= document.createElement("canvas");
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (boardCanvas.width !== w || boardCanvas.height !== h) {
      boardCanvas.width = w;
      boardCanvas.height = h;
    }
    const b = boardCanvas.getContext("2d");
    if (!b) return;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.clearRect(0, 0, width, height);
    const tint = (color: string) => (layer === null ? color : mix(color, LAYER_HUES[layer], 0.12));
    const cx = (x: number) => ox + (x + 0.5) * cell;
    const cy = (y: number) => oy + (y + 0.5) * cell;

    b.beginPath();
    b.roundRect(ox, oy, board, board, corner);
    b.fillStyle = tint(LOOK.board);
    b.fill();
    b.save();
    b.clip();
    b.fillStyle = tint(LOOK.check);
    for (let y = 0; y < grid; y += 1) for (let x = y % 2; x < grid; x += 2) b.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    b.strokeStyle = tint(LOOK.tuft);
    b.lineWidth = Math.max(1, cell * 0.05);
    b.lineCap = "round";
    b.beginPath();
    for (let c = 0; c < grid * grid; c += 1) {
      if (hash(c + grid * 31) > 0.12) continue;
      const tx = ox + ((c % grid) + 0.25 + hash(c) * 0.5) * cell;
      const ty = oy + (Math.floor(c / grid) + 0.4 + hash(c * 7) * 0.3) * cell;
      b.moveTo(tx - cell * 0.1, ty - cell * 0.08);
      b.lineTo(tx, ty + cell * 0.06);
      b.lineTo(tx + cell * 0.1, ty - cell * 0.1);
    }
    b.stroke();
    b.restore();

    for (const c of stones) drawStone(b, cx(c % grid), cy(Math.floor(c / grid)), cell * 0.98, c);
    for (const [c, born] of bricks) if (settled(born)) drawBrick(b, cx(c % grid), cy(Math.floor(c / grid)), cell * 0.96);
    for (const [c, born] of statues) if (settled(born)) drawStatue(b, cx(c % grid), cy(Math.floor(c / grid)), cell * 0.96);
    if (layer !== null) {
      const active = layer;
      for (const l of [active === 0 ? 1 : 0, active] as const) {
        b.globalAlpha = l === active ? 1 : 0.55;
        for (const c of crystals[l]) drawCrystal(b, cx(c % grid), cy(Math.floor(c / grid)), cell * 0.9, LAYER_HUES[l], l === active);
      }
      b.globalAlpha = 1;
    }
  }

  function label(text: string, x: number, y: number, px: number, color: string) {
    if (!ctx) return;
    ctx.font = `800 ${px}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, px * 0.28);
    ctx.strokeStyle = INK;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /** Draws one snake and returns its head position in pixels. */
  function drawSnake(s: Snake, which: number, cell: number, ox: number, oy: number, now: number, effects: MotionLevel, t: number): Point {
    const px = (p: Point) => ({ x: ox + (p.x + 0.5) * cell, y: oy + (p.y + 0.5) * cell });
    if (!ctx) return px(s.cells[0]);
    const moving = effects !== "off";
    const path = snakePath(s, t);
    const { total, cellDist } = path;
    const fade = s.dead ? (moving ? Math.min(1, (now - diedAt) / 450) : 1) * 0.6 : 0;
    const hue = LOOK.snakes[which];
    const board = LOOK.board;
    const body = mix(hue, LOOK.dead, fade);
    const edgeColor = mix(hue, INK, 0.65);
    const ghostOn = s.ghostLeft > 0 && s.ghost.size > 0;
    // Ghost segments turn pale and dashed; they flicker during the last moments of the effect.
    const flicker = ghostOn && s.ghostLeft < 1500 && (moving ? Math.floor(now / 140) % 2 === 0 : false);
    const ghostBody = mix(body, board, 0.62);
    const ghostEdge = mix(edgeColor, board, 0.45);
    const width = cell * 0.72;
    const edge = Math.max(1.4, cell * 0.08);

    type Section = { from: number; to: number; ghost: boolean };
    const sections: Section[] = [];
    const gaps: number[] = [];
    s.cells.forEach((c, i) => {
      const from = i === 0 ? 0 : (cellDist[i - 1] + cellDist[i]) / 2;
      const to = i === s.cells.length - 1 ? total : (cellDist[i] + cellDist[i + 1]) / 2;
      if (isGap(c, i)) {
        gaps.push(cellDist[i]);
        return;
      }
      const ghost = ghostOn && !flicker && s.ghost.has(c.id);
      const last = sections[sections.length - 1];
      if (last && last.ghost === ghost && Math.abs(last.to - from) < 1e-6) last.to = to;
      else sections.push({ from, to, ghost });
    });
    const sectionAt = (d: number) => sections.find((sec) => d >= sec.from - 1e-6 && d <= sec.to + 1e-6);

    // Taper toward the tail, plus a bulge for each swallowed fruit travelling down the body.
    const taper = Math.min(2.2, total * 0.45);
    const neck = total - taper;
    const blobs: { d: number; r: number }[] = [];
    for (let d = neck; d <= total + 1e-6; d += 0.12) blobs.push({ d, r: (width / 2) * (1 - 0.5 * ((d - neck) / (taper || 1))) });
    s.swallows = s.swallows.filter((tick) => ticks - tick + t < total - 0.4);
    for (const tick of s.swallows) {
      const d = ticks - tick + t;
      if (d > 0.6) blobs.push({ d, r: width * 0.6 });
    }

    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    for (const pass of [0, 1]) {
      for (const sec of sections) {
        ctx.strokeStyle = pass === 0 ? (sec.ghost ? ghostEdge : edgeColor) : sec.ghost ? ghostBody : body;
        ctx.lineWidth = pass === 0 ? width + edge * 2 : width;
        if (pass === 0 && sec.ghost) ctx.setLineDash([cell * 0.22, cell * 0.14]);
        for (const line of slice(path, sec.from, Math.min(sec.to, neck))) {
          trace(ctx, line.map(px), cell * 0.5);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      for (const blob of blobs) {
        const sec = sectionAt(blob.d);
        if (!sec) continue;
        const p = px(pointAt(path, blob.d));
        ctx.fillStyle = pass === 0 ? (sec.ghost ? ghostEdge : edgeColor) : sec.ghost ? ghostBody : body;
        ctx.beginPath();
        ctx.arc(p.x, p.y, blob.r + (pass === 0 ? edge : 0), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Back markings: alternating spots, and a soft highlight along solid parts.
    for (let i = 1; i < s.cells.length; i += 1) {
      if (cellDist[i] >= neck || isGap(s.cells[i], i)) continue;
      const sec = sectionAt(cellDist[i]);
      const p = px(pointAt(path, cellDist[i]));
      ctx.fillStyle = mix(sec?.ghost ? ghostBody : body, edgeColor, 0.3);
      ctx.beginPath();
      if (s.cells[i].id % 2) ctx.arc(p.x, p.y, width * 0.17, 0, Math.PI * 2);
      else ctx.ellipse(p.x, p.y, width * 0.11, width * 0.2, ANGLES[s.cells[i].d], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(-cell * 0.05, -cell * 0.08);
    ctx.lineCap = "round";
    ctx.strokeStyle = withAlpha("#ffffff", 0.3);
    ctx.lineWidth = width * 0.22;
    for (const sec of sections) {
      if (sec.ghost) continue;
      for (const line of slice(path, sec.from + 0.3, Math.min(sec.to, neck) - 0.1)) {
        trace(ctx, line.map(px), cell * 0.5);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Cheese holes: a dashed ring marks each safe gap.
    for (const d of gaps) {
      const p = px(pointAt(path, d));
      ctx.beginPath();
      ctx.arc(p.x, p.y, width * 0.34, 0, Math.PI * 2);
      ctx.setLineDash([cell * 0.1, cell * 0.08]);
      ctx.strokeStyle = withAlpha(edgeColor, 0.75);
      ctx.lineWidth = Math.max(1, cell * 0.06);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Head.
    const headAt = px(path.segs[0].pts[0]);
    const fromAngle = ANGLES[s.from];
    let turn = ANGLES[s.dir] - fromAngle;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const angle = fromAngle + turn * (moving && !s.frozen ? easeOut(t / 0.45) : 1);
    const sinceDeath = (now - diedAt) / 240;
    const bump = s.dead && moving && sinceDeath < 1 ? Math.sin(sinceDeath * Math.PI) * 0.18 : 0;
    const eat = moving ? Math.max(0, 1 - (now - s.ateAt) / 200) : 0;
    const happy = now - s.ateAt < 320 && !s.dead;
    const h = s.cells[0];
    const v = VECTORS[s.dir];
    const ahead = [1, 2].map((k) => ({ x: wrap ? wrapped(h.x + v.x * k) : h.x + v.x * k, y: wrap ? wrapped(h.y + v.y * k) : h.y + v.y * k }));
    const hungry = !s.dead && fruits.some((f) => f.lock === null && (layer === null || f.layer === layer) && ahead.some((a) => a.x === f.x && a.y === f.y));
    const next = ahead[0];
    const worried = !s.dead && !peace && (!inBounds(next.x, next.y) || solidAt(idx(next.x, next.y)) || lockedAt(idx(next.x, next.y)));

    ctx.save();
    ctx.translate(headAt.x + Math.cos(angle) * bump * cell, headAt.y + Math.sin(angle) * bump * cell);
    ctx.rotate(angle);
    const r = cell * (0.42 + eat * 0.08);
    ctx.beginPath();
    ctx.ellipse(cell * 0.05, 0, r * 1.12 + edge, r + edge, 0, 0, Math.PI * 2);
    ctx.fillStyle = edgeColor;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cell * 0.05, 0, r * 1.12, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, -r * 0.42, r * 0.42, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha("#ffffff", 0.25);
    ctx.fill();
    // Mouth: open toward fruit just ahead, tongue out after a crash, an occasional tongue flick.
    if (hungry || s.dead) {
      ctx.beginPath();
      ctx.ellipse(r * 0.98, 0, r * 0.26, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#3a1020";
      ctx.fill();
    }
    if (s.dead || (!hungry && effects === "full" && now % 2600 < 200)) {
      ctx.strokeStyle = "#ff5d7a";
      ctx.lineWidth = Math.max(1.2, cell * 0.07);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(r * 1.05, 0);
      ctx.lineTo(r * 1.05 + cell * 0.22, 0);
      ctx.moveTo(r * 1.05 + cell * 0.22, 0);
      ctx.lineTo(r * 1.05 + cell * 0.32, -cell * 0.08);
      ctx.moveTo(r * 1.05 + cell * 0.22, 0);
      ctx.lineTo(r * 1.05 + cell * 0.32, cell * 0.08);
      ctx.stroke();
    }
    const blinking = effects === "full" && !s.dead && (now + which * 900) % 3400 < 120;
    for (const side of [-1, 1]) {
      const ex = cell * 0.16;
      const ey = side * cell * 0.21;
      ctx.beginPath();
      ctx.arc(ex - cell * 0.12, ey * 1.25, cell * 0.06, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha("#ff7d9c", 0.45);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1, cell * 0.055);
      if (s.dead) {
        const k = cell * 0.075;
        ctx.beginPath();
        ctx.moveTo(ex - k, ey - k);
        ctx.lineTo(ex + k, ey + k);
        ctx.moveTo(ex + k, ey - k);
        ctx.lineTo(ex - k, ey + k);
        ctx.stroke();
        continue;
      }
      if (happy || blinking) {
        ctx.beginPath();
        if (happy) ctx.arc(ex, ey, cell * 0.08, Math.PI * 0.5 + 0.4, Math.PI * 1.5 - 0.4);
        else {
          ctx.moveTo(ex, ey - cell * 0.09);
          ctx.lineTo(ex, ey + cell * 0.09);
        }
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.arc(ex, ey, cell * 0.135, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, cell * 0.035);
      ctx.stroke();
      if (scramble) {
        // Dizzy spiral eyes while controls are scrambled.
        ctx.beginPath();
        for (let k = 0; k <= 14; k += 1) {
          const a = k * 0.75 + (moving ? now / 160 : 0);
          const rr = cell * 0.008 * k;
          ctx.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr);
        }
        ctx.lineWidth = Math.max(0.8, cell * 0.03);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(ex + cell * 0.045, ey, cell * 0.072, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex + cell * 0.065, ey - cell * 0.03, cell * 0.024, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      if (worried) {
        ctx.beginPath();
        ctx.moveTo(ex - cell * 0.1, ey - side * cell * 0.2);
        ctx.lineTo(ex + cell * 0.08, ey - side * cell * 0.13);
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.stroke();
      }
    }
    ctx.restore();
    return headAt;
  }

  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    draw();
  });
  reset();
  const stopLoop = startLoop(step, draw);

  return {
    get score() {
      return score;
    },
    get phase() {
      return phase;
    },
    get setup() {
      return setup;
    },
    turn(input: Direction) {
      if (phase === "over") return;
      if (phase === "ready" || phase === "paused") setPhase("playing");
      const mapped = scramble ? scramble[input] : input;
      for (const s of snakes) {
        const want = s.flip ? OPPOSITE[mapped] : mapped;
        const last = s.queue[s.queue.length - 1] ?? s.dir;
        if (want === last || want === OPPOSITE[last] || s.queue.length >= MAX_QUEUED_TURNS) continue;
        s.queue.push(want);
      }
    },
    start() {
      if (phase === "ready" || phase === "paused") setPhase("playing");
    },
    pause() {
      if (phase === "playing") setPhase("paused");
    },
    /** Takes effect right away before a round starts, otherwise with the next round. */
    configure(next: SnakeSetup) {
      if (sameSetup(next, upcoming)) return;
      upcoming = next;
      if (phase === "ready") reset();
    },
    restart() {
      reset();
    },
    /** Ignore restarts right after a round ends so a held key doesn't skip the result. */
    canRestart() {
      return phase === "over" && performance.now() - diedAt > 400;
    },
    destroy() {
      stopLoop();
      stopResize();
    },
  };
}

export type SnakeGame = ReturnType<typeof createSnake>;
