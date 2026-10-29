"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameLook, ShopGame } from "@/lib/game-cosmetics";
import type { MotionLevel } from "@/lib/preferences";
import type { SnakeFruit } from "@/lib/snake";
import { cn } from "@/lib/utils";
import { fitWorld, mix, observeCanvas, withAlpha, type CanvasSize } from "../engine";
import { drawEatEffect, eatLife, paintGround, paintRim, paintSnakeBody, paintSnakeHead, snakeColors, snakeTheme, type Point, type SnakePath, type SnakeTheme } from "../snake-look";
import { FRUIT_COLORS, drawFruit as drawSnakeFruit, setSnakeArtStyle } from "../snake-art";
import { HEIGHT as FLUTTER_H, PIPE_W, WIDTH as FLUTTER_W, drawCharacter, drawGround, drawObstacle, drawSky, drawTrail, flutterTheme, type FlutterTheme } from "../flutter-look";
import {
  PIXEL_UNIT,
  drawBackdrop,
  drawBackdropMotion,
  drawBlade,
  drawBomb,
  drawFruit,
  drawHalf,
  drawJuice,
  drawSplats,
  fruitTheme,
  juiceBurst,
  makeSplat,
  type FruitKind,
  type FruitTheme,
  type JuiceParticle,
  type JuiceSplat,
} from "../fruit-look";
import { drawBlock, drawPerfect, drawScenery, pedestalColor, perfectDuration, stackerTheme, type StackerTheme } from "../stacker-look";

/**
 * Shop previews: a small, looping scene of each game drawn with the real renderers, so what you
 * try on is exactly what you get. Previews never touch game state. With motion off they show a
 * single still frame that still includes the effect being previewed.
 */

type Painter = (ctx: CanvasRenderingContext2D, size: CanvasSize, now: number) => void;

const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

function CanvasPreview({ create, still, label }: { create: () => Painter; still: boolean; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The parent remounts this (by key) whenever the look changes, so the first factory is the one to use.
  const factory = useRef(create);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const paint = factory.current();
    let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
    let raf = 0;
    const frame = () => {
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      paint(ctx, size, performance.now());
      if (!still) raf = requestAnimationFrame(frame);
    };
    const stop = observeCanvas(canvas, (next) => {
      size = next;
      if (still) frame();
    });
    if (!still) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      stop();
    };
  }, [still]);

  return <canvas ref={ref} role="img" aria-label={label} className="absolute inset-0 size-full" />;
}

// ---------------------------------------------------------------------------------------------
// Snake: a short snake looping round a small board, eating fruit as it goes.
// ---------------------------------------------------------------------------------------------

type Dir = "up" | "down" | "left" | "right";
const VECTORS: Record<Dir, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const ANGLES: Record<Dir, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const SNAKE_COLS = 7;
const SNAKE_ROWS = 5;
const SNAKE_LEN = 6;
const SNAKE_STEP = 300;
const SNAKE_FRUITS: SnakeFruit[] = ["apple", "orange", "grapes", "strawberry", "cherry"];
const LOOP: (Point & { d: Dir })[] = (() => {
  const pts = [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [5, 3], [4, 3], [3, 3], [2, 3], [1, 3], [1, 2]];
  return pts.map(([x, y], i) => {
    const [px, py] = pts[(i + pts.length - 1) % pts.length];
    const d: Dir = x > px ? "right" : x < px ? "left" : y > py ? "down" : "up";
    return { x, y, d };
  });
})();
const loopAt = (i: number) => LOOP[((i % LOOP.length) + LOOP.length) % LOOP.length];

function createSnakeScene(theme: SnakeTheme, effects: MotionLevel): Painter {
  const moving = effects !== "off";
  const full = effects === "full";
  const start = performance.now();
  let ground: HTMLCanvasElement | null = null;
  let groundKey = "";
  let low: HTMLCanvasElement | null = null;
  let tick = -1;
  let fruitAt = 0;
  let fruitKind = 0;
  let ateAt = -Infinity;
  let bursts: { x: number; y: number; color: string; born: number }[] = [];
  let swallows: number[] = [];

  function advance(now: number, T: number) {
    if (tick < 0 || T - tick > LOOP.length) {
      tick = T;
      fruitAt = T + (moving ? 4 : 2);
      if (!moving) swallows = [T - 2];
      return;
    }
    while (tick < T) {
      tick += 1;
      if (tick === fruitAt) {
        const head = loopAt(tick);
        bursts.push({ x: head.x, y: head.y, color: FRUIT_COLORS[SNAKE_FRUITS[fruitKind % SNAKE_FRUITS.length]], born: now });
        swallows.push(tick);
        ateAt = now;
        fruitAt = tick + 5;
        fruitKind += 1;
      }
    }
  }

  function path(T: number, t: number): SnakePath {
    const cells = Array.from({ length: SNAKE_LEN }, (_, k) => loopAt(T - k));
    const last = loopAt(T - SNAKE_LEN);
    const pts: Point[] = [];
    const ds: number[] = [];
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
    const hv = VECTORS[cells[0].d];
    add({ x: cells[1].x + hv.x * t, y: cells[1].y + hv.y * t });
    const cellDist = [0];
    for (let i = 1; i < cells.length; i += 1) {
      add({ x: cells[i].x, y: cells[i].y });
      cellDist.push(dist);
    }
    const tail = cells[cells.length - 1];
    add({ x: last.x + (tail.x - last.x) * t, y: last.y + (tail.y - last.y) * t });
    return { segs: [{ pts, d: ds }], cellDist, total: dist };
  }

  function render(ctx: CanvasRenderingContext2D, scale: number, size: CanvasSize, now: number) {
    const { width, height, dpr } = size;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cell = Math.min(width / SNAKE_COLS, height / SNAKE_ROWS) * 0.94;
    const bw = cell * SNAKE_COLS;
    const bh = cell * SNAKE_ROWS;
    const ox = (width - bw) / 2;
    const oy = (height - bh) / 2;
    const corner = Math.min(16, cell * 0.7);
    const cx = (x: number) => ox + (x + 0.5) * cell;
    const cy = (y: number) => oy + (y + 0.5) * cell;

    // The board is painted once into a cache and reused every frame.
    const key = [width, height, dpr, theme.key].join();
    if (key !== groundKey || !ground) {
      ground ??= document.createElement("canvas");
      ground.width = Math.round(width * dpr);
      ground.height = Math.round(height * dpr);
      const b = ground.getContext("2d");
      if (b) {
        b.setTransform(dpr, 0, 0, dpr, 0, 0);
        b.clearRect(0, 0, width, height);
        paintGround(b, theme, ox, oy, cell, SNAKE_COLS, SNAKE_ROWS, corner);
      }
      groundKey = key;
    }
    ctx.drawImage(ground, 0, 0, width, height);

    const T = moving ? Math.floor((now - start) / SNAKE_STEP) + 24 : 24;
    const t = moving ? ((now - start) % SNAKE_STEP) / SNAKE_STEP : 1;
    advance(now, T);

    const fruit = loopAt(fruitAt);
    const kind = SNAKE_FRUITS[fruitKind % SNAKE_FRUITS.length];
    const fx = cx(fruit.x);
    const fy = cy(fruit.y);
    const bob = full ? Math.sin(now / 320) * 0.035 : 0;
    ctx.fillStyle = "rgb(60 40 10 / 0.18)";
    ctx.beginPath();
    ctx.ellipse(fx, fy + cell * 0.38, cell * 0.27, cell * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    drawSnakeFruit(ctx, kind, fx, fy, cell * 0.9 * (1 + bob));

    // The snake, built the same way as in the game.
    const px = (p: Point) => ({ x: ox + (p.x + 0.5) * cell, y: oy + (p.y + 0.5) * cell });
    const p = path(T, t);
    const { total, cellDist } = p;
    const colors = snakeColors(theme, 0);
    const width72 = cell * 0.72;
    const taper = Math.min(2.2, total * 0.45);
    const neck = total - taper;
    const blobs: { d: number; r: number }[] = [];
    const swallowAt: number[] = [];
    for (let d = neck; d <= total + 1e-6; d += 0.12) blobs.push({ d, r: (width72 / 2) * (1 - 0.5 * ((d - neck) / (taper || 1))) });
    swallows = swallows.filter((n) => T - n + t < total - 0.4);
    for (const n of swallows) {
      const d = T - n + t;
      if (d > 0.6) {
        blobs.push({ d, r: width72 * 0.6 });
        swallowAt.push(d);
      }
    }
    const marks: { d: number; id: number; angle: number }[] = [];
    for (let i = 1; i < SNAKE_LEN; i += 1) {
      if (cellDist[i] >= neck) continue;
      marks.push({ d: cellDist[i], id: T - i + 1000, angle: ANGLES[loopAt(T - i).d] });
    }
    paintSnakeBody(ctx, {
      path: p,
      px,
      cell,
      sections: [{ from: 0, to: total, ghost: false }],
      neck,
      blobs,
      swallows: swallowAt,
      gaps: [],
      marks,
      colors,
      ghost: colors,
      theme,
      now,
      moving,
    });

    const head = px(p.segs[0].pts[0]);
    const from = ANGLES[loopAt(T - 1).d];
    let turn = ANGLES[loopAt(T).d] - from;
    if (turn > Math.PI) turn -= Math.PI * 2;
    if (turn < -Math.PI) turn += Math.PI * 2;
    const ahead = [1, 2].some((k) => (T + k) === fruitAt);
    paintSnakeHead(ctx, {
      x: head.x,
      y: head.y,
      angle: from + turn * (moving ? easeOut(t / 0.45) : 1),
      cell,
      eat: moving ? Math.max(0, 1 - (now - ateAt) / 200) : 0,
      colors,
      theme,
      dead: false,
      hungry: ahead,
      happy: now - ateAt < 320,
      blinking: full && now % 3400 < 120,
      tongue: !ahead && full && now % 2600 < 200,
      dizzy: false,
      worried: false,
      now,
      moving,
    });

    if (moving) {
      const life = eatLife(theme.effect);
      bursts = bursts.filter((b) => now - b.born < life);
      for (const b of bursts) drawEatEffect(ctx, theme.effect, cx(b.x), cy(b.y), cell, (now - b.born) / life, b.color, full, b.x + b.y, 0.85);
    } else {
      // Still frame: the moment just after a bite, so the eating effect is visible.
      const spot = loopAt(T - 1);
      drawEatEffect(ctx, theme.effect, cx(spot.x), cy(spot.y), cell, 0.3, FRUIT_COLORS.apple, false, 3, 0.85);
    }

    paintRim(ctx, theme, ox, oy, bw, bh, corner, cell, false, null);
  }

  return (screen, size, now) => {
    setSnakeArtStyle(theme.style);
    if (theme.style !== "pixel") return render(screen, size.dpr, size, now);
    // Pixel art: draw at a coarse resolution, then scale up without smoothing.
    const { width, height, dpr } = size;
    const unit = Math.max(1.5, Math.min(width, height) / SNAKE_ROWS / 10);
    low ??= document.createElement("canvas");
    const pw = Math.ceil(width / unit);
    const ph = Math.ceil(height / unit);
    if (low.width !== pw || low.height !== ph) {
      low.width = pw;
      low.height = ph;
    }
    const lc = low.getContext("2d");
    if (!lc) return;
    lc.imageSmoothingEnabled = false;
    render(lc, 1 / unit, size, now);
    screen.setTransform(1, 0, 0, 1, 0, 0);
    screen.imageSmoothingEnabled = false;
    screen.drawImage(low, 0, 0, pw * unit * dpr, ph * unit * dpr);
    screen.imageSmoothingEnabled = true;
  };
}

// ---------------------------------------------------------------------------------------------
// Flutter: the character gliding through a few obstacles.
// ---------------------------------------------------------------------------------------------

const FLUTTER_BIRD_X = 130;
const FLUTTER_TOP = 120;
const FLUTTER_SPEED = 0.156;
const FLUTTER_SPACING = 210;
const FLUTTER_GAPS = [0, -22, 18, -10];

function createFlutterScene(theme: FlutterTheme, effects: MotionLevel, focus: string): Painter {
  const animate = effects !== "off";
  const start = performance.now();
  const birdY = (ms: number) => 385 + Math.sin(ms / 430) * 26;
  const viewH = FLUTTER_H - FLUTTER_TOP;

  return (ctx, size, now) => {
    const ms = animate ? now - start : 900;
    const offset = ms * FLUTTER_SPEED;
    const scale = Math.min(size.width / FLUTTER_W, size.height / viewH);
    ctx.save();
    ctx.translate((size.width - FLUTTER_W * scale) / 2, (size.height - viewH * scale) / 2);
    ctx.scale(scale, scale);
    ctx.translate(0, -FLUTTER_TOP);
    ctx.beginPath();
    ctx.rect(0, FLUTTER_TOP, FLUTTER_W, viewH);
    ctx.clip();

    drawSky(ctx, theme, offset, now, animate);
    const first = Math.floor((offset - 330 - PIPE_W) / FLUTTER_SPACING);
    for (let k = first; k < first + 5; k += 1) {
      const x = 330 + k * FLUTTER_SPACING - offset;
      if (x < -PIPE_W || x > FLUTTER_W + PIPE_W) continue;
      const gapY = 385 + FLUTTER_GAPS[((k % 4) + 4) % 4];
      ctx.save();
      ctx.translate(x - PIPE_W / 2, 0);
      drawObstacle(ctx, theme, gapY, Math.round(gapY), now, animate);
      ctx.restore();
    }
    drawGround(ctx, theme, offset);

    // Newest first, like the game's trail; shown subtly when motion is off so it can still be judged.
    const points = Array.from({ length: 26 }, (_, i) => ({ x: FLUTTER_BIRD_X - 6 - i * 2.6, y: birdY(ms - i * 16.7) }));
    drawTrail(ctx, theme, points, now, effects !== "full");

    const y = birdY(ms);
    const wing = animate ? Math.sin(Math.min(1, (ms % 640) / 220) * Math.PI) * 0.9 : 0.4;
    ctx.save();
    ctx.translate(FLUTTER_BIRD_X, y);
    ctx.rotate(Math.cos(ms / 430) * 0.28);
    drawCharacter(ctx, theme, wing, false, now, animate);
    ctx.restore();

    // A close-up of the character when that's what is being chosen.
    if (focus === "character") {
      const r = 58;
      const bx = FLUTTER_W - r - 18;
      const by = FLUTTER_TOP + r + 18;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha("#ffffff", 0.82);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = withAlpha("#1d2433", 0.35);
      ctx.stroke();
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(2.3, 2.3);
      drawCharacter(ctx, theme, wing, false, now, animate);
      ctx.restore();
    }
    ctx.restore();
  };
}

// ---------------------------------------------------------------------------------------------
// Fruit Slice: fruit thrown up and sliced by the blade, with a bomb now and then.
// ---------------------------------------------------------------------------------------------

const FRUIT_W = 800;
const FRUIT_H = 600;
const FRUIT_GRAVITY = 900;
const FRUIT_CYCLE = 2800;
const BLADE_MS = 160;
const SWIPE_MS = 150;
const PREVIEW_KINDS: FruitKind[] = [
  { skin: "#2f9e57", flesh: "#ff5d6c", radius: 38, leaf: false },
  { skin: "#ff8a1f", flesh: "#ffd08a", radius: 32, leaf: true },
  { skin: "#7b3fa0", flesh: "#f3c76b", radius: 30, leaf: true },
  { skin: "#ff6f7d", flesh: "#ffd5b8", radius: 30, leaf: true },
];

type Body = { kind: FruitKind | null; x: number; y: number; vx: number; vy: number; angle: number; spin: number };
type Piece = Body & { kind: FruitKind; side: 1 | -1 };
type Swipe = { from: Point; to: Point; start: number; target: Body; cut: boolean };

function createFruitScene(theme: FruitTheme, effects: MotionLevel): Painter {
  const animate = effects !== "off";
  const full = effects === "full";
  const pixelCanvas = document.createElement("canvas");
  let flyers: Body[] = [];
  let halves: Piece[] = [];
  let particles: JuiceParticle[] = [];
  let splats: JuiceSplat[] = [];
  let trail: { x: number; y: number; t: number }[] = [];
  let swipe: Swipe | null = null;
  let cuts: { at: number; target: Body; mirror: boolean }[] = [];
  const start = performance.now();
  let last = start;
  let cycle = -1;

  function slice(f: Body) {
    if (!f.kind) return;
    const kind = f.kind;
    flyers = flyers.filter((other) => other !== f);
    for (const side of [1, -1] as const) {
      halves.push({ kind, side, x: f.x + side * 4, y: f.y, vx: f.vx + side * 110, vy: f.vy * 0.6 - 60, angle: f.angle, spin: side * 2.2 });
    }
    if (animate) particles.push(...juiceBurst(theme, f.x, f.y, kind, full ? 10 : 5, 260));
    splats.push(makeSplat(theme, f.x, f.y, kind));
    if (splats.length > 6) splats.shift();
  }

  if (!animate) {
    // One still moment: a fruit just cut, its juice in the air, the blade's stroke and a bomb.
    const cut: Body = { kind: PREVIEW_KINDS[0], x: 430, y: 330, vx: 0, vy: 0, angle: 0.3, spin: 0 };
    flyers = [
      { kind: PREVIEW_KINDS[1], x: 240, y: 250, vx: 0, vy: 0, angle: -0.4, spin: 0 },
      { kind: null, x: 620, y: 220, vx: 0, vy: 0, angle: 0, spin: 0 },
      cut,
    ];
    slice(cut);
    halves = halves.map((h) => ({ ...h, x: h.x + h.side * 34, y: h.y + 10, angle: h.angle + h.side * 0.5 }));
    particles = juiceBurst(theme, 430, 330, PREVIEW_KINDS[0], 8, 260).map((pt) => ({ ...pt, x: pt.x + pt.vx * 0.12, y: pt.y + pt.vy * 0.12, life: 0.7 }));
  }

  function step(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const c = Math.floor((now - start) / FRUIT_CYCLE);
    if (c !== cycle) {
      cycle = c;
      const at = start + c * FRUIT_CYCLE;
      const a: Body = { kind: PREVIEW_KINDS[(c * 2) % PREVIEW_KINDS.length], x: 300, y: 650, vx: 60, vy: -860, angle: 0, spin: 1.4 };
      const b: Body = { kind: PREVIEW_KINDS[(c * 2 + 1) % PREVIEW_KINDS.length], x: 540, y: 660, vx: -50, vy: -800, angle: 0.5, spin: -1.8 };
      flyers.push(a, b);
      if (c % 2 === 1) flyers.push({ kind: null, x: 690, y: 670, vx: -70, vy: -780, angle: 0, spin: 0.6 });
      cuts = [
        { at: at + 820, target: a, mirror: false },
        { at: at + 1260, target: b, mirror: true },
      ];
    }
    if (!swipe && cuts.length && now >= cuts[0].at) {
      const next = cuts.shift();
      if (next && flyers.includes(next.target)) {
        const t = SWIPE_MS / 2000;
        const mid = { x: next.target.x + next.target.vx * t, y: next.target.y + next.target.vy * t };
        const dx = next.mirror ? -1 : 1;
        swipe = { from: { x: mid.x - 160 * dx, y: mid.y - 80 }, to: { x: mid.x + 160 * dx, y: mid.y + 80 }, start: now, target: next.target, cut: false };
      }
    }
    if (swipe) {
      const u = Math.min(1, (now - swipe.start) / SWIPE_MS);
      trail.push({ x: swipe.from.x + (swipe.to.x - swipe.from.x) * u, y: swipe.from.y + (swipe.to.y - swipe.from.y) * u, t: now });
      if (u >= 0.5 && !swipe.cut) {
        swipe.cut = true;
        slice(swipe.target);
      }
      if (u >= 1) swipe = null;
    }
    for (const f of flyers) {
      f.vy += FRUIT_GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.angle += f.spin * dt;
    }
    flyers = flyers.filter((f) => f.vy < 0 || f.y < FRUIT_H + 80);
    for (const h of halves) {
      h.vy += FRUIT_GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.angle += h.spin * dt;
    }
    halves = halves.filter((h) => h.y < FRUIT_H + 100);
    for (const pt of particles) {
      pt.vy += FRUIT_GRAVITY * pt.g * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rot += pt.spin * dt;
      pt.life -= dt / pt.span;
    }
    particles = particles.filter((pt) => pt.life > 0);
    for (const s of splats) s.life -= dt / 1.4;
    splats = splats.filter((s) => s.life > 0);
    trail = trail.filter((pt) => now - pt.t < BLADE_MS);
  }

  return (screen, size, now) => {
    if (animate) step(now);
    const { dpr } = size;
    const view = fitWorld(size, FRUIT_W, FRUIT_H);
    screen.save();
    screen.translate(view.x, view.y);
    screen.scale(view.scale, view.scale);
    screen.beginPath();
    screen.rect(0, 0, FRUIT_W, FRUIT_H);
    screen.clip();

    const pixel = theme.style === "pixel";
    const bw = Math.ceil(FRUIT_W / PIXEL_UNIT);
    const bh = Math.ceil(FRUIT_H / PIXEL_UNIT);
    if (pixel && (pixelCanvas.width !== bw || pixelCanvas.height !== bh)) {
      pixelCanvas.width = bw;
      pixelCanvas.height = bh;
    }
    const buffer = pixel ? pixelCanvas.getContext("2d") : null;
    const ctx = buffer ?? screen;
    const scale = buffer ? 1 / PIXEL_UNIT : view.scale * dpr;
    if (buffer) {
      buffer.setTransform(1 / PIXEL_UNIT, 0, 0, 1 / PIXEL_UNIT, 0, 0);
      buffer.imageSmoothingEnabled = false;
    }

    drawBackdrop(ctx, theme, FRUIT_W, FRUIT_H, scale);
    if (animate) drawBackdropMotion(ctx, theme, FRUIT_W, FRUIT_H, now);
    drawSplats(ctx, splats, theme);
    for (const h of halves) {
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.rotate(h.angle);
      drawHalf(ctx, h.kind, h.side, theme, scale);
      ctx.restore();
    }
    drawJuice(ctx, particles, theme);
    for (const f of flyers) {
      ctx.save();
      ctx.translate(f.x, f.y);
      if (f.kind) {
        ctx.rotate(f.angle);
        drawFruit(ctx, f.kind, theme, scale);
      } else drawBomb(ctx, theme, now, animate);
      ctx.restore();
    }
    const blade = animate ? trail : Array.from({ length: 9 }, (_, i) => ({ x: 300 + i * 32, y: 270 + i * 15, t: now - (8 - i) * 12 }));
    drawBlade(ctx, blade, now, BLADE_MS, theme);

    if (buffer) {
      screen.imageSmoothingEnabled = false;
      screen.drawImage(pixelCanvas, 0, 0, bw * PIXEL_UNIT, bh * PIXEL_UNIT);
      screen.imageSmoothingEnabled = true;
    }
    screen.restore();
  };
}

// ---------------------------------------------------------------------------------------------
// Tower Stacker: a short tower; a block slides in, lands perfectly and sets off the effect.
// ---------------------------------------------------------------------------------------------

const SLAB = 14;
const BOX = 100;
const ISO = Math.cos(Math.PI / 6);
const STACK_PERIOD = 2600;
const STACK_LAND = 700;
const TOWER = [
  { cx: 0, cz: 0, w: 100, d: 100 },
  { cx: 0, cz: 0, w: 100, d: 100 },
  { cx: -4, cz: 0, w: 92, d: 100 },
  { cx: -4, cz: 3, w: 92, d: 94 },
  { cx: -2, cz: 3, w: 88, d: 94 },
];

function createStackerScene(theme: StackerTheme, effects: MotionLevel): Painter {
  const animate = effects !== "off";
  const full = effects === "full";
  const start = performance.now();

  function face(ctx: CanvasRenderingContext2D, points: [number, number, number][], fill: string) {
    ctx.beginPath();
    points.forEach(([x, y, z], i) => {
      const sx = (x - z) * ISO;
      const sy = (x + z) * 0.5 - y;
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  return (ctx, size, now) => {
    const { width: cw, height: ch } = size;
    const top = TOWER[TOWER.length - 1];
    const level = TOWER.length + 1;
    const camera = TOWER.length * SLAB;
    const scale = Math.min(cw / 440, ch / 560) * 1.6;
    const phase = animate ? (now - start) % STACK_PERIOD : STACK_PERIOD - 1;
    const landedAt = now - (phase - STACK_LAND);
    const landed = phase >= STACK_LAND;

    drawScenery(ctx, theme, cw, ch, camera, now, animate);
    ctx.save();
    ctx.translate(cw / 2, ch * 0.5);
    ctx.scale(scale, scale);
    ctx.translate(0, camera);
    ctx.lineJoin = "round";

    ctx.fillStyle = withAlpha("#000000", 0.18);
    ctx.beginPath();
    ctx.ellipse(0, 70, 150, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    const pedestal = pedestalColor(theme);
    const h = BOX / 2;
    face(ctx, [[-h, 0, h], [h, 0, h], [h, -700, h], [-h, -700, h]], mix(pedestal, "#000000", 0.12));
    face(ctx, [[h, 0, -h], [h, 0, h], [h, -700, h], [h, -700, -h]], mix(pedestal, "#000000", 0.32));
    face(ctx, [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h]], mix(pedestal, "#ffffff", 0.2));

    TOWER.forEach((block, i) => {
      const y1 = (i + 1) * SLAB;
      drawBlock(ctx, theme, { ...block, y0: y1 - SLAB, y1, level: i + 1, flash: 0, alpha: 1, top: !landed && i === TOWER.length - 1 }, scale);
    });

    // The sliding block eases in from the side and lands exactly on top.
    const slide = landed ? 0 : -130 * (1 - easeOut(phase / STACK_LAND));
    const flash = landed && animate ? Math.max(0, 1 - (now - landedAt) / 260) * 0.75 : 0;
    drawBlock(ctx, theme, { cx: top.cx + slide, cz: top.cz, w: top.w, d: top.d, y0: (level - 1) * SLAB, y1: level * SLAB, level, flash, alpha: 1, top: true }, scale);

    if (landed) {
      const duration = perfectDuration(theme);
      const count = full ? 3 : 1;
      for (let i = 0; i < count; i += 1) {
        const ring = { cx: top.cx, cz: top.cz, w: top.w, d: top.d, y: level * SLAB, at: landedAt, delay: i * 90, reach: 23 + i * 6 };
        const t = animate ? (now - landedAt - ring.delay) / duration : 0.35;
        if (t >= 0 && t < 1) drawPerfect(ctx, theme, ring, t, full, scale);
      }
    }
    ctx.restore();
  };
}

// ---------------------------------------------------------------------------------------------
// 2048 and Sudoku: the real boards in miniature, styled by the same CSS as the games.
// ---------------------------------------------------------------------------------------------

const tileStep = (value: number) => Math.min(12, Math.log2(value));
const fontScale = (value: number) => {
  const digits = String(value).length;
  return digits <= 2 ? 0.46 : digits === 3 ? 0.38 : digits === 4 ? 0.3 : 0.24;
};
const BOARD_2048 = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 0, 2, 0, 4];
const MERGE_SPOTS = [2, 6, 10];

function Preview2048({ look, effects }: { look: GameLook; effects: MotionLevel }) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (effects === "off") return;
    const id = window.setInterval(() => setBeat((b) => b + 1), 1700);
    return () => window.clearInterval(id);
  }, [effects]);
  const spot = effects === "off" ? -1 : MERGE_SPOTS[beat % MERGE_SPOTS.length];

  return (
    <div className="arcade-stage [--stage-h:min(20rem,50dvh)]">
      <div
        role="img"
        aria-label="2048 board preview"
        className="g2048"
        data-effects={effects}
        data-tiles={look.tiles}
        data-board={look.board}
        data-font={look.font}
        data-merge={look.merge}
        data-style={look.style}
        style={{ "--n": 4 } as CSSProperties}
      >
        {BOARD_2048.map((_, cell) => (
          <div key={cell} aria-hidden className="g2048-cell" style={{ "--r": Math.floor(cell / 4), "--c": cell % 4 } as CSSProperties} />
        ))}
        {BOARD_2048.map((value, i) =>
          value ? (
            <div
              key={i === spot ? `merge-${beat}` : i}
              aria-hidden
              data-step={tileStep(value)}
              className={cn("g2048-tile", i === spot && "is-merged", i === spot && value >= 128 && "is-big")}
              style={{ "--r": Math.floor(i / 4), "--c": i % 4, "--fs": fontScale(value) } as CSSProperties}
            >
              <span className="g2048-face">{value}</span>
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

const SDK_SOLUTION = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
type SdkCell = { digit: number; given: boolean; notes: number[] };
const SDK_CELLS: SdkCell[] = Array.from({ length: 81 }, (_, i) => {
  const digit = Number(SDK_SOLUTION[i]);
  const m = (i * 37 + 11) % 10;
  if (i === 79) return { digit: 7, given: true, notes: [] };
  if (i === 80) return { digit: 7, given: false, notes: [] };
  if (m < 5) return { digit, given: true, notes: [] };
  if (m < 7) return { digit, given: false, notes: [] };
  if (m < 9) return { digit: 0, given: false, notes: [...new Set([digit, ((digit + 2) % 9) + 1, ...(m === 8 ? [((digit + 5) % 9) + 1] : [])])].sort() };
  return { digit: 0, given: false, notes: [] };
});
const SDK_BAD = new Set([79, 80]);
const SDK_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function PreviewSudoku({ look, effects }: { look: GameLook; effects: MotionLevel }) {
  const [selected, setSelected] = useState(40);
  const row = (i: number) => Math.floor(i / 9);
  const col = (i: number) => i % 9;
  const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
  const selectedDigit = SDK_CELLS[selected].digit;

  return (
    <div className="arcade-stage [--stage-h:min(20rem,50dvh)]">
      <div
        role="group"
        aria-label="Sudoku board preview. Pick a cell to see the highlights."
        className="sdk absolute inset-0 grid grid-cols-9 grid-rows-9 overflow-hidden select-none"
        data-effects={effects}
        data-theme={look.theme}
        data-font={look.font}
        data-grid={look.grid}
        data-highlight={look.highlight}
      >
        {SDK_CELLS.map((cell, i) => {
          const r = row(i);
          const c = col(i);
          const isSelected = i === selected;
          const peer = !isSelected && (r === row(selected) || c === col(selected) || box(i) === box(selected));
          const same = !isSelected && cell.digit !== 0 && cell.digit === selectedDigit;
          return (
            <button
              key={i}
              type="button"
              tabIndex={isSelected ? 0 : -1}
              aria-label={`Row ${r + 1}, column ${c + 1}`}
              aria-pressed={isSelected}
              onClick={() => setSelected(i)}
              className="sdk-cell relative grid place-items-center leading-none tabular-nums outline-none"
              data-r={c < 8 ? (c % 3 === 2 ? "box" : "cell") : undefined}
              data-b={r < 8 ? (r % 3 === 2 ? "box" : "cell") : undefined}
              data-l={c > 0 && c % 3 === 0 ? "box" : undefined}
              data-t={r > 0 && r % 3 === 0 ? "box" : undefined}
              data-bc={c % 3}
              data-br={r % 3}
              data-alt={(Math.floor(r / 3) + Math.floor(c / 3)) % 2 || undefined}
              data-given={cell.given || undefined}
              data-peer={peer || undefined}
              data-same={same || undefined}
              data-bad={SDK_BAD.has(i) || undefined}
              data-sel={isSelected || undefined}
            >
              {cell.digit ? (
                cell.digit
              ) : cell.notes.length ? (
                <span aria-hidden className="sdk-notes grid size-full grid-cols-3 grid-rows-3 p-[0.4cqi]">
                  {SDK_DIGITS.map((d) => (
                    <span key={d} className="grid place-items-center" data-hit={d === selectedDigit || undefined}>
                      {cell.notes.includes(d) ? d : ""}
                    </span>
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const ASPECT: Record<ShopGame, string> = {
  snake: "aspect-[7/5]",
  "2048": "",
  flutter: "aspect-[12/13] max-w-[22rem]",
  sudoku: "",
  "fruit-slice": "aspect-[4/3]",
  stacker: "aspect-[4/3]",
};

/** A live preview of a game with the given look; `focus` is the category being browsed. */
export function CosmeticPreview({ game, look, focus, effects }: { game: ShopGame; look: GameLook; focus: string; effects: MotionLevel }) {
  if (game === "2048") return <Preview2048 look={look} effects={effects} />;
  if (game === "sudoku") return <PreviewSudoku look={look} effects={effects} />;
  const key = `${JSON.stringify(look)}|${effects}|${game === "flutter" ? focus : ""}`;
  const create = (): Painter => {
    if (game === "snake") return createSnakeScene(snakeTheme(look), effects);
    if (game === "flutter") return createFlutterScene(flutterTheme(look), effects, focus);
    if (game === "fruit-slice") return createFruitScene(fruitTheme(look), effects);
    return createStackerScene(stackerTheme(look), effects);
  };
  return (
    <div className={cn("relative mx-auto w-full max-w-[26rem] overflow-hidden rounded-xl", ASPECT[game])}>
      <CanvasPreview key={key} create={create} still={effects === "off"} label="Live preview of the selected look" />
    </div>
  );
}
