"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play, RotateCcw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { formatDuration } from "@/lib/arcade";
import type { MotionLevel } from "@/lib/preferences";
import { SALAD_FRUITS, SNAKE_MODES, SNAKE_SIZES, snakeVariant, type SnakeFruit, type SnakeSetup } from "@/lib/snake";
import { livePalette, observeCanvas, startLoop, swipeDirection, withAlpha, mix, type CanvasSize } from "./engine";
import { GameOverlay, GameShell, Stat, keyDirection, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { FRUIT_COLORS, drawFruit } from "./snake-art";
import { SnakeSetupPanel, describeSetup } from "./snake-setup";
import type { SoundName } from "./sound";

const START_INTERVAL = 140;
const MIN_INTERVAL = 70;
const START_LENGTH = 3;
const MAX_QUEUED_TURNS = 3;

type Direction = "up" | "down" | "left" | "right";
type Point = { x: number; y: number };
type Phase = "ready" | "playing" | "paused" | "over";
type OverReason = "crash" | "time" | "cleared";
type Fruit = Point & { kind: SnakeFruit; born: number };
type Burst = Point & { color: string; born: number };

const VECTORS: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };
const ANGLES: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const sameSetup = (a: SnakeSetup, b: SnakeSetup) => a.mode === b.mode && a.fruit === b.fruit && a.fruitCount === b.fruitCount && a.size === b.size;

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number) => void;
  onTime: (seconds: number | null) => void;
  onRound: (setup: SnakeSetup) => void;
  onOver: (score: number, reason: OverReason) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

/**
 * Short straight walls that stay off the outer ring, out of the starting lane and apart from
 * each other (no touching, even diagonally). Every open cell then keeps at least two open
 * neighbours and the board stays one connected space, so no wall can seal off fruit or the snake.
 */
function makeObstacles(grid: number, laneY: number): Set<number> {
  const target = Math.round(grid * grid * 0.05);
  const near = (blocked: Set<number>, x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (blocked.has((y + dy) * grid + x + dx)) return true;
    return false;
  };
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const blocked = new Set<number>();
    for (let tries = 0; tries < 500 && blocked.size < target; tries += 1) {
      const length = 2 + Math.floor(Math.random() * 3);
      const horizontal = Math.random() < 0.5;
      const x0 = 1 + Math.floor(Math.random() * (grid - 2));
      const y0 = 1 + Math.floor(Math.random() * (grid - 2));
      const cells = Array.from({ length }, (_, i) => (horizontal ? { x: x0 + i, y: y0 } : { x: x0, y: y0 + i }));
      const fits = cells.every(({ x, y }) => x <= grid - 2 && y <= grid - 2 && Math.abs(y - laneY) > 1 && !near(blocked, x, y));
      if (fits) for (const { x, y } of cells) blocked.add(y * grid + x);
    }
    if (blocked.size >= target * 0.7 && connected(blocked, grid)) return blocked;
  }
  return new Set();
}

function connected(blocked: Set<number>, grid: number) {
  const total = grid * grid;
  let start = 0;
  while (blocked.has(start)) start += 1;
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cell = queue.pop()!;
    const x = cell % grid;
    for (const next of [x > 0 ? cell - 1 : -1, x < grid - 1 ? cell + 1 : -1, cell - grid, cell + grid]) {
      if (next < 0 || next >= total || seen.has(next) || blocked.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen.size === total - blocked.size;
}

/** Cumulative lengths along a polyline. */
function lengths(points: Point[]) {
  const out = [0];
  for (let i = 1; i < points.length; i += 1) out.push(out[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return out;
}

function pointAt(points: Point[], cum: number[], d: number): Point {
  if (d <= 0) return points[0];
  for (let i = 1; i < points.length; i += 1) {
    if (cum[i] >= d) {
      const k = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * k, y: points[i - 1].y + (points[i].y - points[i - 1].y) * k };
    }
  }
  return points[points.length - 1];
}

/** A polyline with rounded corners, so turns bend instead of kinking. */
function trace(ctx: CanvasRenderingContext2D, points: Point[], radius: number) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
    const before = Math.hypot(b.x - a.x, b.y - a.y) * (i === 1 ? 1 : 0.5);
    const after = Math.hypot(c.x - b.x, c.y - b.y) * (i === points.length - 2 ? 1 : 0.5);
    ctx.arcTo(b.x, b.y, c.x, c.y, Math.min(radius, before, after));
  }
  if (points.length > 1) ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
}

function createSnake(canvas: HTMLCanvasElement, initial: SnakeSetup, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const palette = livePalette(canvas);
  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let setup = initial;
  let upcoming = initial;
  let grid = SNAKE_SIZES[setup.size].grid;
  let wrap = false;
  let obstacles = new Set<number>();
  let snake: Point[] = [];
  let lastTail: Point = { x: 0, y: 0 };
  let direction: Direction = "right";
  let turnedFrom: Direction = "right";
  let queue: Direction[] = [];
  let fruits: Fruit[] = [];
  let bursts: Burst[] = [];
  let swallows: number[] = [];
  let ticks = 0;
  let interval = START_INTERVAL;
  let elapsed = 0;
  let score = 0;
  let timeLeft: number | null = null;
  let shownSeconds: number | null | undefined;
  let ateAt = -1000;
  let diedAt = 0;
  let resetAt = 0;
  let reason: OverReason = "crash";

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

  /** Top up the board to the chosen fruit amount, using only open cells (none when the board is full). */
  function spawnFruits(now: number) {
    const missing = setup.fruitCount - fruits.length;
    if (missing <= 0) return;
    const taken = new Set(obstacles);
    for (const p of snake) taken.add(p.y * grid + p.x);
    for (const f of fruits) taken.add(f.y * grid + f.x);
    const open: number[] = [];
    for (let cell = 0; cell < grid * grid; cell += 1) if (!taken.has(cell)) open.push(cell);
    for (let i = 0; i < missing && open.length; i += 1) {
      const pick = Math.floor(Math.random() * open.length);
      const cell = open[pick];
      open[pick] = open[open.length - 1];
      open.pop();
      const kind = setup.fruit === "salad" ? SALAD_FRUITS[Math.floor(Math.random() * SALAD_FRUITS.length)] : setup.fruit;
      fruits.push({ x: cell % grid, y: Math.floor(cell / grid), kind, born: now });
    }
  }

  function reset() {
    setup = upcoming;
    const mode = SNAKE_MODES[setup.mode];
    grid = SNAKE_SIZES[setup.size].grid;
    wrap = mode.wrap;
    const x = Math.floor(grid * 0.4);
    const y = Math.floor(grid / 2);
    obstacles = mode.obstacles ? makeObstacles(grid, y) : new Set();
    snake = Array.from({ length: START_LENGTH }, (_, i) => ({ x: x - i, y }));
    lastTail = { ...snake[snake.length - 1] };
    direction = turnedFrom = "right";
    queue = [];
    fruits = [];
    bursts = [];
    swallows = [];
    ticks = 0;
    interval = START_INTERVAL;
    elapsed = 0;
    score = 0;
    resetAt = performance.now();
    spawnFruits(resetAt);
    timeLeft = mode.seconds === null ? null : mode.seconds * 1000;
    emitTime();
    hooks.onScore(0);
    hooks.onRound(setup);
    setPhase("ready");
  }

  function end(why: OverReason) {
    reason = why;
    diedAt = performance.now();
    queue = [];
    // Show the last completed move rather than freezing mid-step (the clock may stop mid-step).
    if (why !== "time") elapsed = interval;
    setPhase("over");
    hooks.live().play(why === "crash" ? "over" : "win");
    hooks.onOver(score, why);
  }

  function tick() {
    const now = performance.now();
    turnedFrom = direction;
    direction = queue.shift() ?? direction;
    const head = snake[0];
    let x = head.x + VECTORS[direction].x;
    let y = head.y + VECTORS[direction].y;
    if (wrap) {
      x = (x + grid) % grid;
      y = (y + grid) % grid;
    } else if (x < 0 || y < 0 || x >= grid || y >= grid) return end("crash");
    const eaten = fruits.findIndex((f) => f.x === x && f.y === y);
    // The tail moves away this tick unless the snake is growing, so the head may follow it.
    const body = eaten >= 0 ? snake : snake.slice(0, -1);
    if (obstacles.has(y * grid + x) || body.some((p) => p.x === x && p.y === y)) return end("crash");
    lastTail = snake[snake.length - 1];
    snake = [{ x, y }, ...body];
    ticks += 1;
    if (eaten < 0) return;
    const [fruit] = fruits.splice(eaten, 1);
    score += 1;
    ateAt = now;
    swallows.push(ticks);
    if (hooks.live().effects !== "off") bursts.push({ x, y, color: FRUIT_COLORS[fruit.kind], born: now });
    interval = Math.max(MIN_INTERVAL, START_INTERVAL - score * 2);
    hooks.onScore(score);
    hooks.live().play("eat", 1 + Math.min(score, 40) / 80);
    spawnFruits(now);
    if (!fruits.length) end("cleared");
  }

  function step(ms: number) {
    if (phase !== "playing") return;
    if (timeLeft !== null) {
      timeLeft = Math.max(0, timeLeft - ms);
      emitTime();
      if (timeLeft === 0) return end("time");
    }
    elapsed += ms;
    while (elapsed >= interval && phase === "playing") {
      elapsed -= interval;
      tick();
    }
  }

  /** The body as a smooth line in grid units: head and tail glide, the cells between stay put. */
  function bodyPath(t: number) {
    const unwrap = (from: Point, a: Point, b: Point) => {
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      if (wrap) {
        if (dx > 1) dx -= grid;
        else if (dx < -1) dx += grid;
        if (dy > 1) dy -= grid;
        else if (dy < -1) dy += grid;
      }
      return { x: from.x + dx, y: from.y + dy };
    };
    const n = snake.length;
    const cells: Point[] = [{ ...snake[0] }];
    for (let i = 1; i < n; i += 1) cells.push(unwrap(cells[i - 1], snake[i - 1], snake[i]));
    const tailFrom = unwrap(cells[n - 1], snake[n - 1], lastTail);
    const head = { x: cells[1].x + (cells[0].x - cells[1].x) * t, y: cells[1].y + (cells[0].y - cells[1].y) * t };
    const tail = { x: tailFrom.x + (cells[n - 1].x - tailFrom.x) * t, y: tailFrom.y + (cells[n - 1].y - tailFrom.y) * t };
    const points: Point[] = [];
    for (const p of [head, ...cells.slice(1), tail]) {
      const last = points[points.length - 1];
      if (!last || Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > 1e-4) points.push(p);
    }
    return points;
  }

  function draw() {
    if (!ctx) return;
    const colors = palette();
    const { width, height, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cell = Math.min(width, height) / grid;
    const span = cell * grid;
    const ox = (width - span) / 2;
    const oy = (height - span) / 2;
    const now = performance.now();
    const effects = hooks.live().effects;
    const moving = effects !== "off";
    const dead = phase === "over" && reason === "crash";
    const board = mix(colors.background, colors.surface, 0.85);
    const corner = Math.min(14, cell * 0.6);

    const sinceDeath = now - diedAt;
    const shake = dead && effects === "full" && sinceDeath < 320 ? Math.sin(now / 16) * cell * 0.08 * (1 - sinceDeath / 320) : 0;
    ctx.save();
    ctx.translate(shake, 0);
    ctx.beginPath();
    ctx.roundRect(ox, oy, span, span, corner);
    ctx.fillStyle = board;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = withAlpha(colors.foreground, colors.dark ? 0.03 : 0.045);
    for (let y = 0; y < grid; y += 1) {
      for (let x = y % 2; x < grid; x += 2) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }

    // Everything on the board fades in together when a round is set up.
    ctx.globalAlpha = moving ? easeOut(Math.min(1, (now - resetAt) / 320)) : 1;

    if (obstacles.size) {
      const stone = mix(board, colors.foreground, colors.dark ? 0.3 : 0.4);
      const edge = mix(board, colors.foreground, colors.dark ? 0.5 : 0.62);
      ctx.lineWidth = Math.max(1, cell * 0.06);
      for (const c of obstacles) {
        const px = ox + (c % grid) * cell;
        const py = oy + Math.floor(c / grid) * cell;
        ctx.beginPath();
        ctx.roundRect(px + cell * 0.07, py + cell * 0.07, cell * 0.86, cell * 0.86, cell * 0.2);
        ctx.fillStyle = stone;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.stroke();
        ctx.beginPath();
        ctx.roundRect(px + cell * 0.18, py + cell * 0.16, cell * 0.64, cell * 0.18, cell * 0.09);
        ctx.fillStyle = withAlpha("#ffffff", colors.dark ? 0.1 : 0.22);
        ctx.fill();
      }
    }

    for (const f of fruits) {
      const pop = moving ? easeOutBack(Math.min(1, (now - f.born) / 260)) : 1;
      const bob = effects === "full" && phase !== "over" ? Math.sin(now / 320 + f.x * 1.3 + f.y * 0.7) * 0.035 : 0;
      const cx = ox + (f.x + 0.5) * cell;
      const cy = oy + (f.y + 0.5) * cell;
      ctx.fillStyle = withAlpha("#000000", colors.dark ? 0.35 : 0.16);
      ctx.beginPath();
      ctx.ellipse(cx, cy + cell * 0.36, Math.max(0, cell * 0.28 * pop), Math.max(0, cell * 0.07 * pop), 0, 0, Math.PI * 2);
      ctx.fill();
      drawFruit(ctx, f.kind, cx, cy, Math.max(0, cell * 0.9 * pop * (1 + bob)));
    }

    drawSnake(cell, ox, oy, now, effects, dead);

    ctx.globalAlpha = 1;
    bursts = bursts.filter((b) => now - b.born < 520);
    for (const b of bursts) {
      const k = (now - b.born) / 520;
      const cx = ox + (b.x + 0.5) * cell;
      const cy = oy + (b.y + 0.5) * cell;
      ctx.strokeStyle = withAlpha(b.color, (1 - k) * 0.65);
      ctx.lineWidth = Math.max(1, cell * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, cell * (0.3 + easeOut(k) * 0.55), 0, Math.PI * 2);
      ctx.stroke();
      if (effects !== "full") continue;
      ctx.fillStyle = withAlpha(b.color, 1 - k);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + b.x + b.y;
        const d = cell * (0.3 + easeOut(k) * 0.75);
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cell * 0.09 * (1 - k), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Solid walls end the run; a dashed edge means it wraps around.
    ctx.beginPath();
    ctx.roundRect(ox + 1, oy + 1, span - 2, span - 2, corner);
    if (wrap) {
      ctx.setLineDash([Math.max(4, cell * 0.4), Math.max(4, cell * 0.3)]);
      ctx.strokeStyle = withAlpha(colors.accent, 0.7);
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = withAlpha(colors.foreground, colors.dark ? 0.28 : 0.38);
      ctx.lineWidth = 2.5;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawSnake(cell: number, ox: number, oy: number, now: number, effects: MotionLevel, dead: boolean) {
    if (!ctx || !snake.length) return;
    const colors = palette();
    const moving = effects !== "off";
    const t = phase === "ready" ? 1 : Math.min(1, elapsed / interval);
    const points = bodyPath(t);
    const cum = lengths(points);
    const total = cum[cum.length - 1];
    const fade = dead ? (moving ? Math.min(1, (now - diedAt) / 450) : 1) * 0.6 : 0;
    const body = mix(colors.accent, colors.muted, fade);
    const edgeColor = mix(colors.accent, "#000000", colors.dark ? 0.55 : 0.4);
    const scale = mix(body, edgeColor, 0.3);
    const width = cell * 0.7;
    const edge = Math.max(1.2, cell * 0.07);

    // Taper toward the tail, plus a bulge for each swallowed fruit travelling down the body.
    const taper = Math.min(2.2, total * 0.45);
    const neck = total - taper;
    const blobs: { d: number; r: number }[] = [];
    for (let d = neck; d <= total + 1e-6; d += 0.12) blobs.push({ d, r: (width / 2) * (1 - 0.45 * ((d - neck) / (taper || 1))) });
    swallows = swallows.filter((tick) => ticks - tick + t < total - 0.4);
    for (const tick of swallows) {
      const d = ticks - tick + t;
      if (d > 0.6) blobs.push({ d, r: width * 0.6 });
    }
    const main: Point[] = [];
    for (let i = 0; i < points.length && cum[i] < neck; i += 1) main.push(points[i]);
    main.push(pointAt(points, cum, neck));

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const offsets = wrap ? [-grid, 0, grid] : [0];

    const fromAngle = ANGLES[turnedFrom];
    let turn = ANGLES[direction] - fromAngle;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const angle = fromAngle + turn * (moving ? easeOut(Math.min(1, t / 0.45)) : 1);
    const sinceDeath = (now - diedAt) / 240;
    const bump = dead && moving && sinceDeath < 1 ? Math.sin(sinceDeath * Math.PI) * 0.18 : 0;
    const eat = moving ? Math.max(0, 1 - (now - ateAt) / 200) : 0;

    for (const offX of offsets) {
      if (minX + offX > grid || maxX + offX < -1) continue;
      for (const offY of offsets) {
        if (minY + offY > grid || maxY + offY < -1) continue;
        const px = (p: Point) => ({ x: ox + (p.x + offX + 0.5) * cell, y: oy + (p.y + offY + 0.5) * cell });
        const line = main.map(px);
        const blobAt = (d: number) => px(pointAt(points, cum, d));

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        trace(ctx, line, cell * 0.5);
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = width + edge * 2;
        ctx.stroke();
        ctx.fillStyle = edgeColor;
        for (const blob of blobs) {
          const p = blobAt(blob.d);
          ctx.beginPath();
          ctx.arc(p.x, p.y, blob.r + edge, 0, Math.PI * 2);
          ctx.fill();
        }
        trace(ctx, line, cell * 0.5);
        ctx.strokeStyle = body;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.fillStyle = body;
        for (const blob of blobs) {
          const p = blobAt(blob.d);
          ctx.beginPath();
          ctx.arc(p.x, p.y, blob.r, 0, Math.PI * 2);
          ctx.fill();
        }
        // Scales on each cell and a soft highlight along the back.
        ctx.fillStyle = scale;
        for (let i = 1; i < points.length - 1 && cum[i] < neck; i += 1) {
          const p = px(points[i]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, width * 0.16, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(-cell * 0.05, -cell * 0.08);
        trace(ctx, line, cell * 0.5);
        ctx.strokeStyle = withAlpha("#ffffff", colors.dark ? 0.14 : 0.24);
        ctx.lineWidth = width * 0.26;
        ctx.stroke();
        ctx.restore();

        const head = px(points[0]);
        ctx.save();
        ctx.translate(head.x + Math.cos(angle) * bump * cell, head.y + Math.sin(angle) * bump * cell);
        ctx.rotate(angle);
        const r = cell * (0.4 + eat * 0.08);
        ctx.beginPath();
        ctx.ellipse(cell * 0.04, 0, r * 1.1 + edge, r + edge, 0, 0, Math.PI * 2);
        ctx.fillStyle = edgeColor;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cell * 0.04, 0, r * 1.1, r, 0, 0, Math.PI * 2);
        ctx.fillStyle = body;
        ctx.fill();
        if (!dead && effects === "full" && now % 2600 < 200) {
          ctx.strokeStyle = colors.accent2;
          ctx.lineWidth = Math.max(1, cell * 0.06);
          ctx.beginPath();
          ctx.moveTo(r * 1.1, 0);
          ctx.lineTo(r * 1.1 + cell * 0.2, 0);
          ctx.moveTo(r * 1.1 + cell * 0.2, 0);
          ctx.lineTo(r * 1.1 + cell * 0.3, -cell * 0.07);
          ctx.moveTo(r * 1.1 + cell * 0.2, 0);
          ctx.lineTo(r * 1.1 + cell * 0.3, cell * 0.07);
          ctx.stroke();
        }
        for (const side of [-1, 1]) {
          const ex = cell * 0.13;
          const ey = side * cell * 0.19;
          if (dead) {
            ctx.strokeStyle = "#16121c";
            ctx.lineWidth = Math.max(1, cell * 0.055);
            const s = cell * 0.07;
            ctx.beginPath();
            ctx.moveTo(ex - s, ey - s);
            ctx.lineTo(ex + s, ey + s);
            ctx.moveTo(ex + s, ey - s);
            ctx.lineTo(ex - s, ey + s);
            ctx.stroke();
            continue;
          }
          ctx.beginPath();
          ctx.arc(ex, ey, cell * 0.12, 0, Math.PI * 2);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
          ctx.strokeStyle = edgeColor;
          ctx.lineWidth = Math.max(0.75, cell * 0.03);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(ex + cell * 0.04, ey, cell * 0.065, 0, Math.PI * 2);
          ctx.fillStyle = "#16121c";
          ctx.fill();
        }
        ctx.restore();
      }
    }
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
    turn(next: Direction) {
      if (phase === "over") return;
      if (phase === "ready" || phase === "paused") setPhase("playing");
      const last = queue[queue.length - 1] ?? direction;
      if (next === last || next === OPPOSITE[last] || queue.length >= MAX_QUEUED_TURNS) return;
      queue.push(next);
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

type SnakeGame = ReturnType<typeof createSnake>;

const OVER_TITLES: Record<OverReason, string> = { crash: "Game over", time: "Time's up!", cleared: "Board cleared!" };

export default function GameSnake({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects } = useArcade();
  const settings = useSettings();
  const router = useRouter();
  const { records, submit } = useRecords("snake", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const live = useRef({ play, effects });
  const [setup, setSetup] = useState<SnakeSetup>(settings.arcadeSnake);
  const initialSetup = useRef(setup);
  const pendingSave = useRef<{ timer: number; setup: SnakeSetup } | null>(null);
  const [round, setRound] = useState<SnakeSetup>(setup);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [reason, setReason] = useState<OverReason>("crash");
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("snake");

  useGameAchievementTracking("snake", phase);

  useEffect(() => {
    if (phase === "playing") beginRun();
  }, [phase, beginRun]);

  useEffect(() => {
    live.current = { play, effects };
  });

  const finish = useEffectEvent((final: number, why: OverReason) => {
    setReason(why);
    submit(final, { variant: snakeVariant(round) });
    finishRun(final, { length: final + START_LENGTH });
    sendAchievementEvent({ type: "run_finished", game: "snake", length: final + START_LENGTH });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createSnake(canvas, initialSetup.current, {
      onPhase: setPhase,
      onScore: setScore,
      onTime: setSeconds,
      onRound: setRound,
      onOver: (final, why) => finish(final, why),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true, variant: snakeVariant(game.setup) });
      finishRun(game.score, { length: game.score + START_LENGTH }, { keepalive: true });
      if (game.score > 0) sendAchievementEvent({ type: "run_progress", game: "snake", length: game.score + START_LENGTH });
      game.destroy();
      gameRef.current = null;
    };
  }, [submit, finishRun]);

  useEffect(() => {
    gameRef.current?.configure(setup);
  }, [setup]);

  // A setup change made just before leaving is still saved.
  useEffect(() => {
    return () => {
      const pending = pendingSave.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      void apiFetch("/api/preferences", { method: "PATCH", json: { settings: { arcadeSnake: pending.setup } }, keepalive: true }).catch(() => {});
    };
  }, []);

  useAway(() => gameRef.current?.pause());

  function changeSetup(next: SnakeSetup) {
    setSetup(next);
    if (pendingSave.current) window.clearTimeout(pendingSave.current.timer);
    const timer = window.setTimeout(() => {
      pendingSave.current = null;
      apiFetch("/api/preferences", { method: "PATCH", json: { settings: { arcadeSnake: next } } })
        .then(() => router.refresh())
        .catch(() => toast.error("Could not save your Snake setup. It applies until you leave this page."));
    }, 600);
    pendingSave.current = { timer, setup: next };
  }

  function restart() {
    const game = gameRef.current;
    if (!game) return;
    if (game.phase === "playing" || game.phase === "paused") {
      // A round abandoned by restarting still counts toward records and coins.
      const final = game.score;
      submit(final, { variant: snakeVariant(game.setup) });
      finishRun(final, { length: final + START_LENGTH }, { announce: true });
      if (final > 0) sendAchievementEvent({ type: "run_progress", game: "snake", length: final + START_LENGTH });
    }
    game.restart();
    canvasRef.current?.focus({ preventScroll: true });
  }

  function togglePause() {
    const game = gameRef.current;
    if (!game) return;
    if (game.phase === "playing") game.pause();
    else game.start();
    canvasRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game) return false;
    const direction = keyDirection(event);
    if (direction) {
      game.turn(direction);
      return true;
    }
    if (event.key === " " || event.key === "Enter") {
      if (game.phase === "over") {
        if (game.canRestart()) restart();
      } else togglePause();
      return true;
    }
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      if (game.phase === "playing" || game.phase === "paused") togglePause();
      return game.phase !== "over";
    }
    if ((event.key === "r" || event.key === "R") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (game.phase === "paused" || game.canRestart()) {
        restart();
        return true;
      }
    }
    return false;
  });

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  // Swipes are read continuously, so one gesture can turn more than once.
  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, 22);
    if (!direction) return;
    gameRef.current?.turn(direction);
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp() {
    swipe.current = null;
  }

  const dpad = (direction: Direction, label: string, Icon: typeof ArrowUp, area: string) => (
    <button
      type="button"
      aria-label={label}
      className={`${area} grid size-14 place-items-center rounded-xl border border-white/[0.1] bg-surface/70 text-foreground active:bg-amethyst/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
      onPointerDown={(event) => {
        event.preventDefault();
        gameRef.current?.turn(direction);
      }}
      onClick={(event) => {
        // Keyboard activation; pointer presses already turned on pointerdown.
        if (event.detail === 0) gameRef.current?.turn(direction);
      }}
    >
      <Icon aria-hidden className="size-6" />
    </button>
  );

  const mode = SNAKE_MODES[round.mode];
  const best = records[snakeVariant(round)] ?? 0;
  const shownBest = Math.max(best, score);
  const inRound = phase === "playing" || phase === "paused";
  const changed = !sameSetup(setup, round);
  // The result card waits for the crash animation before appearing.
  const overlayMotion = effects === "off" ? undefined : { animationDelay: phase === "over" ? "260ms" : "0ms", animationFillMode: "both" as const };

  return (
    <GameShell
      title="Snake"
      active={inRound}
      stats={
        <>
          <Stat label="Score" value={score} />
          <Stat label="Best" value={shownBest} highlight={score > 0 && score >= best} />
          {seconds !== null ? <Stat label="Time" value={formatDuration(seconds)} highlight={inRound && seconds <= 10} /> : null}
          <Stat label="Mode" value={mode.label} className="min-w-0" />
        </>
      }
      actions={
        inRound ? (
          <Button variant="outline" size="sm" className="h-8" onClick={togglePause}>
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            {phase === "paused" ? "Resume" : "Pause"}
          </Button>
        ) : null
      }
      help="Arrow keys or WASD steer; swipe on the board or use the pad on touch screens. Space or P pauses, R restarts from the pause or result screen. You can't reverse straight into yourself, and quick turns are queued in order. The game pauses when you switch away."
    >
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col items-center gap-4">
          <div className="arcade-stage [--stage-ratio:1]">
            <canvas
              ref={canvasRef}
              tabIndex={-1}
              aria-label={`Snake board, ${mode.label} mode, ${SNAKE_SIZES[round.size].grid} by ${SNAKE_SIZES[round.size].grid}, score ${score}`}
              className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {phase !== "playing" ? (
              <div key={phase} className="pointer-events-none absolute inset-0 z-10 animate-in duration-300 fade-in-0 zoom-in-95" style={overlayMotion}>
                {phase === "ready" ? (
                  <GameOverlay
                    tone="quiet"
                    title={mode.label}
                    actions={
                      <>
                        <Button size="sm" onClick={() => gameRef.current?.start()}>Start</Button>
                        <Button size="sm" variant="outline" className="lg:hidden" onClick={() => panelRef.current?.scrollIntoView({ behavior: effects === "off" ? "auto" : "smooth", block: "start" })}>
                          <Settings2 aria-hidden />
                          Setup
                        </Button>
                      </>
                    }
                  >
                    {mode.rules}
                    <span className="mt-1 block">Press an arrow key or swipe to start.</span>
                  </GameOverlay>
                ) : phase === "paused" ? (
                  <GameOverlay
                    title="Paused"
                    actions={
                      <>
                        <Button size="sm" onClick={togglePause} autoFocus>Resume</Button>
                        <Button size="sm" variant="outline" onClick={restart}>
                          <RotateCcw aria-hidden />
                          Restart
                        </Button>
                      </>
                    }
                  >
                    Score {score}
                    {seconds !== null ? ` · ${formatDuration(seconds)} left` : ""}
                  </GameOverlay>
                ) : (
                  <GameOverlay title={OVER_TITLES[reason]} actions={<Button size="sm" onClick={restart}>Play again</Button>}>
                    Score {score}
                    {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest}`}
                    {changed ? <span className="mt-1 block">Next round: {describeSetup(setup)}</span> : null}
                    <CoinReward state={coins} />
                  </GameOverlay>
                )}
              </div>
            ) : null}
          </div>
          <div className="hidden grid-cols-3 grid-rows-2 gap-2 pointer-coarse:grid" role="group" aria-label="Direction pad">
            {dpad("up", "Up", ArrowUp, "col-start-2")}
            {dpad("left", "Left", ArrowLeft, "col-start-1 row-start-2")}
            {dpad("down", "Down", ArrowDown, "col-start-2 row-start-2")}
            {dpad("right", "Right", ArrowRight, "col-start-3 row-start-2")}
          </div>
        </div>
        <div ref={panelRef} className="scroll-mt-4">
          <SnakeSetupPanel setup={setup} onChange={changeSetup} locked={inRound} waiting={phase === "over"} records={records} />
        </div>
      </div>
    </GameShell>
  );
}
