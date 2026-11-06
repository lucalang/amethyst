"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { drawGemBody, drawGlimmer, drawShadeBody, drawSpark, gemChaseTheme, paintMaze, type GemChaseTheme } from "../gem-chase-look";
import { applyArtStyle, blasterTheme, drawBossBody, drawLaser, drawShipBody, flameColor, glow, paintNebula, type BlasterTheme } from "../space-blaster-look";
import { CELEBRATIONS, PuzzleCelebration, QueensCrown, QueensDefs, TangoSymbol, ZipMarker, lookAttributes, patchColors, queensRegionColors, zipTrail, type Celebration } from "../puzzle-looks";
import "../minigames.css";

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
    let visible = false;
    let sceneTime = performance.now();
    let lastFrame = sceneTime;
    const frame = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      sceneTime += Math.max(0, now - lastFrame);
      lastFrame = now;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      ctx.clearRect(0, 0, size.width, size.height);
      paint(ctx, size, sceneTime);
      if (!still) raf = requestAnimationFrame(frame);
    };
    const sync = () => {
      if (!visible || document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf) {
        lastFrame = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    const stop = observeCanvas(canvas, (next) => {
      size = next;
      if (still) sync();
    });
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      sync();
    });
    observer.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
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
// Gem Chase: the gem sweeps a row of glimmers while the shades drift below.
// ---------------------------------------------------------------------------------------------

const GEM_MAZE = ["###########", "#.........#", "#.##.#.##.#", "#....#....#", "#.##.#.##.#", "#.........#", "###########"].map((row) => row.split(""));
const GEM_COLS = GEM_MAZE[0].length;
const GEM_ROWS = GEM_MAZE.length;
const GEM_LAP = 2600;
const gemSolid = (x: number, y: number) => (GEM_MAZE[y]?.[x] ?? "#") === "#";

function createGemChaseScene(theme: GemChaseTheme, effects: MotionLevel): Painter {
  const animate = effects !== "off";
  const start = performance.now();
  let maze: HTMLCanvasElement | null = null;
  let mazeKey = "";

  return (ctx, size, now) => {
    const { width: cw, height: ch, dpr } = size;
    const tile = Math.min(cw / GEM_COLS, ch / GEM_ROWS);
    const ox = (cw - tile * GEM_COLS) / 2;
    const oy = (ch - tile * GEM_ROWS) / 2;
    const key = `${cw}x${ch}@${dpr}`;
    if (!maze || mazeKey !== key) {
      maze = document.createElement("canvas");
      maze.width = Math.ceil(cw * dpr);
      maze.height = Math.ceil(ch * dpr);
      const g = maze.getContext("2d");
      if (g) {
        g.scale(dpr, dpr);
        g.translate(ox, oy);
        g.scale(tile / 20, tile / 20);
        paintMaze(g, GEM_MAZE, 20, theme.maze, theme.maze.wall, gemSolid, theme.style);
      }
      mazeKey = key;
    }
    ctx.fillStyle = theme.maze.background;
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(maze, 0, 0, cw, ch);

    const t = animate ? ((now - start) % GEM_LAP) / GEM_LAP : 0.45;
    const gemX = 1 + t * 8;
    const at = (x: number, y: number) => ({ x: ox + (x + 0.5) * tile, y: oy + (y + 0.5) * tile });
    GEM_MAZE.forEach((row, y) =>
      row.forEach((c, x) => {
        if (c !== "." || (y === 1 && x <= gemX)) return;
        const p = at(x, y);
        drawGlimmer(ctx, p.x, p.y, tile * 0.12, theme.maze.glimmer, theme.style);
      }),
    );

    // Collection bursts for the glimmers the gem just picked up.
    const colors = theme.collect.colors ?? [theme.maze.glimmer];
    ctx.globalCompositeOperation = "lighter";
    for (let x = 1; x <= 9; x += 1) {
      const age = (gemX - x) / 1.6;
      if (!animate || age < 0 || age >= 1) continue;
      const p = at(x, 1);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + x;
        const d = tile * (0.15 + easeOut(age) * 0.7);
        drawSpark(ctx, theme.collect.shape, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, tile * 0.09, colors[i % colors.length], age, a, theme.style);
      }
    }
    ctx.globalCompositeOperation = "source-over";

    const gem = at(gemX, 1);
    ctx.save();
    ctx.translate(gem.x, gem.y);
    drawGemBody(ctx, theme, tile * 0.38, animate ? 0.12 + Math.abs(Math.sin(now / 90)) * 0.45 : 0.4, now, animate);
    ctx.restore();

    theme.shades.forEach((color, i) => {
      const x = 1 + ((((8 - t * 8 + i * 2) % 8) + 8) % 8);
      const p = at(x, 5);
      const r = tile * 0.36;
      drawShadeBody(ctx, p.x, p.y, r, color, animate ? Math.sin(now / 120 + i) * r * 0.12 : 0, animate, theme.style);
      for (const side of [-1, 1]) {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x + side * r * 0.35, p.y - r * 0.2, r * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1b1530";
        ctx.beginPath();
        ctx.arc(p.x + side * r * 0.35 - r * 0.08, p.y - r * 0.2, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  };
}

// ---------------------------------------------------------------------------------------------
// Space Blaster: the ship strafes below a boss, firing through the sector backdrop.
// ---------------------------------------------------------------------------------------------

const BLAST_W = 400;
const BLAST_H = 300;
const BLAST_SHOT = 350;
const BLAST_FLIGHT = 1400;

function createBlasterScene(theme: BlasterTheme, effects: MotionLevel): Painter {
  const animate = effects !== "off";
  const start = performance.now();
  let nebula: HTMLCanvasElement | null = null;
  let nebulaKey = "";
  const shipX = (time: number) => BLAST_W / 2 + Math.sin(time / 700) * 70;

  return (ctx, size, now) => {
    const { width: cw, height: ch } = size;
    if (!nebula || nebulaKey !== `${cw}x${ch}`) {
      nebula = paintNebula(theme.sector, cw, ch);
      nebulaKey = `${cw}x${ch}`;
    }
    const elapsed = animate ? now - start : 900;
    const scroll = (elapsed * 0.03) % ch;
    ctx.drawImage(nebula, 0, scroll - ch, cw, ch);
    ctx.drawImage(nebula, 0, scroll, cw, ch);

    const s = Math.min(cw / BLAST_W, ch / BLAST_H);
    ctx.save();
    ctx.translate((cw - BLAST_W * s) / 2, (ch - BLAST_H * s) / 2);
    ctx.scale(s, s);

    ctx.save();
    ctx.translate(BLAST_W / 2, 66);
    ctx.scale(0.62, 0.62);
    drawBossBody(ctx, theme.sector, false, false, now, theme.style);
    ctx.restore();

    // Shots cycle through the three upgrade tiers so every weapon color shows.
    const tier = Math.floor(elapsed / 2400) % 3;
    for (let k = 0; k < BLAST_FLIGHT / BLAST_SHOT; k += 1) {
      const fired = elapsed - ((elapsed % BLAST_SHOT) + k * BLAST_SHOT);
      const age = (elapsed - fired) / BLAST_FLIGHT;
      drawLaser(ctx, theme.weapon, shipX(fired), 222 - age * 150, theme.weapon.tiers[tier]);
    }

    const x = shipX(elapsed);
    const flame = flameColor(theme.trail, false, now);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i < 6; i += 1) {
      const trailX = shipX(elapsed - i * 45);
      glow(ctx, trailX - 6, 254 + i * 8, 6 - i * 0.8, flame, 0.6 - i * 0.1);
      glow(ctx, trailX + 6, 254 + i * 8, 6 - i * 0.8, flame, 0.6 - i * 0.1);
      if (theme.trail.sparks && animate) {
        ctx.fillStyle = withAlpha("#ffffff", 0.7 - i * 0.12);
        ctx.fillRect(trailX + Math.sin(now / 50 + i * 2) * 8, 256 + i * 9, 1.5, 1.5);
      }
    }
    ctx.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.translate(x, 236);
    drawShipBody(ctx, theme, Math.cos(elapsed / 700) * 0.6, flame, now, animate);
    ctx.restore();
    ctx.restore();
    applyArtStyle(ctx, theme.style, now, animate);
  };
}

// ---------------------------------------------------------------------------------------------
// Logic puzzles: tiny solved-in-a-loop boards using the same classes as the games.
// ---------------------------------------------------------------------------------------------

function usePreviewBeat(effects: MotionLevel) {
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (effects === "off") return;
    const id = window.setInterval(() => setBeat((b) => b + 1), 900);
    return () => window.clearInterval(id);
  }, [effects]);
  return beat;
}

function PuzzleStage({ game, look, effects, celebrate, children }: { game: ShopGame; look: GameLook; effects: MotionLevel; celebrate?: Celebration | false; children: ReactNode }) {
  return (
    <div data-game-skin={game} className="rounded-xl p-4">
      <div {...lookAttributes(look)} className="relative mx-auto w-full max-w-[16rem]">
        {children}
        {celebrate && effects !== "off" ? <PuzzleCelebration kind={celebrate} /> : null}
      </div>
    </div>
  );
}

const gridOf = (n: number): CSSProperties => ({ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` });
/** Placed steps out of `total`: grows by one per beat, then holds the solved board for a few beats. */
const stepsAt = (beat: number, total: number, effects: MotionLevel, hold = 4) => (effects === "off" ? total : Math.min(total, (beat % (total + hold)) + 1));

const ZIP_N = 5;
const ZIP_PATH = Array.from({ length: ZIP_N * ZIP_N }, (_, i) => {
  const r = Math.floor(i / ZIP_N);
  const k = i % ZIP_N;
  return r * ZIP_N + (r % 2 ? ZIP_N - 1 - k : k);
});
const ZIP_NUMBERS = new Map([0, 8, 16, 24].map((step, i) => [ZIP_PATH[step], { step, number: i + 1 }]));

function PreviewZip({ look, effects }: { look: GameLook; effects: MotionLevel }) {
  const beat = usePreviewBeat(effects);
  const total = ZIP_PATH.length;
  const steps = stepsAt(Math.floor(beat * 2.5), total, effects, 10);
  const solved = steps === total;
  const trailColor = zipTrail(look);
  const point = (cell: number) => ({ x: (cell % ZIP_N) + 0.5, y: Math.floor(cell / ZIP_N) + 0.5 });
  const path = ZIP_PATH.slice(0, steps);
  return (
    <PuzzleStage game="zip" look={look} effects={effects} celebrate={solved && CELEBRATIONS[look.finish ?? ""]}>
      <div role="img" aria-label="Zip board preview" className={cn("puzzle-board zip-board relative aspect-square w-full", solved && "puzzle-board-solved zip-solved", effects !== "off" && "zip-fx")}>
        <div aria-hidden className="grid size-full" style={gridOf(ZIP_N)}>
          {ZIP_PATH.map((_, cell) => {
            const index = path.indexOf(cell);
            return <div key={cell} className={cn("zip-cell", index >= 0 && "zip-cell-on")} style={index >= 0 ? ({ "--zip-tint": trailColor(index / (total - 1)), "--zip-i": index } as CSSProperties) : undefined} />;
          })}
        </div>
        <svg aria-hidden viewBox={`0 0 ${ZIP_N} ${ZIP_N}`} className="pointer-events-none absolute inset-0 size-full">
          <polyline points={path.map((cell) => `${point(cell).x},${point(cell).y}`).join(" ")} className="zip-path-glow" />
          {path.slice(1).map((cell, index) => {
            const a = point(path[index]);
            const b = point(cell);
            return <line key={cell} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={trailColor((index + 1) / (total - 1))} className="zip-path" />;
          })}
          {[...ZIP_NUMBERS].map(([cell, { step, number }]) => (
            <g key={cell} transform={`translate(${point(cell).x} ${point(cell).y})`}>
              <ZipMarker shape={look.marker} number={number} on={step < steps} />
            </g>
          ))}
        </svg>
      </div>
    </PuzzleStage>
  );
}

const PATCHES_N = 5;
const PATCHES = [
  { r: 0, c: 0, h: 2, w: 2, clue: [0, 0] },
  { r: 0, c: 2, h: 1, w: 3, clue: [0, 3] },
  { r: 1, c: 2, h: 2, w: 3, clue: [2, 4] },
  { r: 2, c: 0, h: 3, w: 2, clue: [3, 1] },
  { r: 3, c: 2, h: 2, w: 3, clue: [4, 2] },
];
const pct = (v: number) => `${(v / PATCHES_N) * 100}%`;

function PreviewPatches({ look, effects }: { look: GameLook; effects: MotionLevel }) {
  const beat = usePreviewBeat(effects);
  const placed = stepsAt(beat, PATCHES.length, effects);
  const solved = placed === PATCHES.length;
  const palette = patchColors(look);
  return (
    <PuzzleStage game="patches" look={look} effects={effects} celebrate={solved && CELEBRATIONS[look.effect ?? ""]}>
      <div role="img" aria-label="Patches board preview" className={cn("puzzle-board patches-board relative aspect-square w-full", solved && "puzzle-board-solved patches-solved", effects !== "off" && "patches-fx")}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {PATCHES.slice(0, placed).map((patch, index) => (
            <div key={index} className="patch" style={{ left: pct(patch.c), top: pct(patch.r), width: pct(patch.w), height: pct(patch.h), "--patch-i": index, "--patch": palette[index % palette.length] } as CSSProperties} />
          ))}
        </div>
        <div aria-hidden className="relative grid size-full" style={gridOf(PATCHES_N)}>
          {Array.from({ length: PATCHES_N * PATCHES_N }, (_, cell) => {
            const index = PATCHES.findIndex((patch) => patch.clue[0] * PATCHES_N + patch.clue[1] === cell);
            return (
              <div key={cell} className="patches-cell grid place-items-center">
                {index >= 0 ? (
                  <span className={cn("patches-clue flex flex-col items-center justify-center leading-none", index < placed && "patches-clue-done")}>
                    <span className="text-[clamp(0.9rem,4.5cqi,1.4rem)] font-bold tabular-nums">{PATCHES[index].h * PATCHES[index].w}</span>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </PuzzleStage>
  );
}

const TANGO_N = 4;
const TANGO_BOARD = "SMMSMSSMSMSMMSMS";
const TANGO_GIVEN = new Set([0, 5, 10, 15]);
const TANGO_ORDER = [...TANGO_GIVEN, ...Array.from({ length: 16 }, (_, i) => i).filter((i) => !TANGO_GIVEN.has(i))];

function PreviewTango({ look, effects }: { look: GameLook; effects: MotionLevel }) {
  const beat = usePreviewBeat(effects);
  const filled = TANGO_GIVEN.size + stepsAt(beat, TANGO_ORDER.length - TANGO_GIVEN.size, effects);
  const solved = filled === TANGO_ORDER.length;
  const shown = new Set(TANGO_ORDER.slice(0, filled));
  return (
    <PuzzleStage game="tango" look={look} effects={effects} celebrate={solved && CELEBRATIONS[look.finish ?? ""]}>
      <div role="img" aria-label="Tango board preview" className={cn("puzzle-board tango-board relative aspect-square w-full", solved && "puzzle-board-solved tango-solved", effects !== "off" && "tango-fx")}>
        <div aria-hidden className="grid size-full gap-1" style={gridOf(TANGO_N)}>
          {Array.from({ length: TANGO_N * TANGO_N }, (_, cell) => {
            const sun = TANGO_BOARD[cell] === "S";
            const on = shown.has(cell);
            return (
              <div
                key={cell}
                className={cn("puzzle-cell tango-cell relative grid place-items-center overflow-hidden rounded-md", on && (sun ? "tango-cell-sun" : "tango-cell-moon"), TANGO_GIVEN.has(cell) && "puzzle-cell-given")}
                style={{ "--tango-d": Math.floor(cell / TANGO_N) + (cell % TANGO_N) } as CSSProperties}
              >
                {on ? (
                  <span className={cn("tango-mark col-start-1 row-start-1 grid size-full place-items-center", sun ? "tango-mark-sun" : "tango-mark-moon")}>
                    <TangoSymbol side={sun ? "sun" : "moon"} pair={look.icons} className={sun ? "size-[62%] text-[var(--tango-sun)]" : "size-[58%] text-[var(--tango-moon)]"} />
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </PuzzleStage>
  );
}

const QUEENS_N = 5;
const QUEENS_REGIONS = [0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 2, 2, 3, 4, 4, 2, 3, 3, 4, 4, 2, 3, 3, 4, 4];
const QUEENS_CROWNS = [1, 8, 10, 17, 24];

function PreviewQueens({ look, effects }: { look: GameLook; effects: MotionLevel }) {
  const beat = usePreviewBeat(effects);
  const placed = stepsAt(beat, QUEENS_CROWNS.length, effects);
  const solved = placed === QUEENS_CROWNS.length;
  const crowns = new Set(QUEENS_CROWNS.slice(0, placed));
  const colors = queensRegionColors(look);
  const edge = (cell: number, other: number | null) => other === null || QUEENS_REGIONS[other] !== QUEENS_REGIONS[cell];
  return (
    <PuzzleStage game="queens" look={look} effects={effects} celebrate={solved && CELEBRATIONS[look.effect ?? ""]}>
      <QueensDefs />
      <div role="img" aria-label="Queens board preview" className={cn("puzzle-board queens-board grid aspect-square w-full overflow-hidden rounded-xl", solved && "puzzle-board-solved queens-solved", effects !== "off" && "queens-fx")} style={gridOf(QUEENS_N)}>
        {QUEENS_REGIONS.map((region, cell) => {
          const r = Math.floor(cell / QUEENS_N);
          const c = cell % QUEENS_N;
          return (
            <div
              key={cell}
              className={cn("queens-cell relative grid place-items-center", `queens-region-${region % 5}`)}
              style={
                {
                  backgroundColor: colors[region % colors.length],
                  borderTopWidth: edge(cell, r > 0 ? cell - QUEENS_N : null) ? 2 : 0.5,
                  borderLeftWidth: edge(cell, c > 0 ? cell - 1 : null) ? 2 : 0.5,
                  borderRightWidth: edge(cell, c < QUEENS_N - 1 ? cell + 1 : null) ? 2 : 0.5,
                  borderBottomWidth: edge(cell, r < QUEENS_N - 1 ? cell + QUEENS_N : null) ? 2 : 0.5,
                  "--queens-d": r + c,
                } as CSSProperties
              }
            >
              {crowns.has(cell) ? <QueensCrown design={look.crown} className="queens-crown size-[64%]" /> : null}
            </div>
          );
        })}
      </div>
    </PuzzleStage>
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
  "gem-chase": "aspect-[11/7]",
  "space-blaster": "aspect-[4/3]",
  zip: "",
  patches: "",
  tango: "",
  queens: "",
};

/** A live preview of a game with the given look; `focus` is the category being browsed. */
export function CosmeticPreview({ game, look, focus, effects }: { game: ShopGame; look: GameLook; focus: string; effects: MotionLevel }) {
  if (game === "2048") return <Preview2048 look={look} effects={effects} />;
  if (game === "sudoku") return <PreviewSudoku look={look} effects={effects} />;
  if (game === "zip") return <PreviewZip look={look} effects={effects} />;
  if (game === "patches") return <PreviewPatches look={look} effects={effects} />;
  if (game === "tango") return <PreviewTango look={look} effects={effects} />;
  if (game === "queens") return <PreviewQueens look={look} effects={effects} />;
  const key = `${JSON.stringify(look)}|${effects}|${game === "flutter" ? focus : ""}`;
  const create = (): Painter => {
    if (game === "snake") return createSnakeScene(snakeTheme(look), effects);
    if (game === "flutter") return createFlutterScene(flutterTheme(look), effects, focus);
    if (game === "fruit-slice") return createFruitScene(fruitTheme(look), effects);
    if (game === "gem-chase") return createGemChaseScene(gemChaseTheme(look), effects);
    if (game === "space-blaster") return createBlasterScene(blasterTheme(look), effects);
    return createStackerScene(stackerTheme(look), effects);
  };
  return (
    <div className={cn("relative mx-auto w-full max-w-[26rem] overflow-hidden rounded-xl", ASPECT[game])}>
      <CanvasPreview key={key} create={create} still={effects === "off"} label="Live preview of the selected look" />
    </div>
  );
}
