"use client";

import type { GameLook } from "@/lib/game-cosmetics";
import { mix, withAlpha } from "./engine";

/**
 * Flutter cosmetics: characters, flight trails, obstacle skins and background scenery. Everything
 * here is drawing only: characters are painted inside the same small circle whatever their shape
 * (the hitbox lives in the game and never changes), and obstacles fill the exact pillar outline.
 * Layering: scenery (sky, parallax, ground) → obstacles → trail → character.
 */

type Ctx = CanvasRenderingContext2D;

export const WIDTH = 480;
export const HEIGHT = 640;
export const GROUND = HEIGHT - 70;
export const PIPE_W = 70;
/** Height of the faceted point at each pillar's end. */
export const TIP = 18;
export const GAP = 165;

export type FlutterTheme = { key: string; character: string; trail: string; obstacle: string; scenery: string };

export function flutterTheme(look: GameLook): FlutterTheme {
  const character = look.character ?? "";
  const trail = look.trail ?? "";
  const obstacle = look.obstacle ?? "";
  const scenery = look.scenery ?? "";
  return { key: [character, trail, obstacle, scenery].join("|"), character, trail, obstacle, scenery };
}

const hash = (n: number) => (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;

// ---------------------------------------------------------------------------
// Scenery
// ---------------------------------------------------------------------------

type Scenery = {
  top: string;
  bottom: string;
  ground: string;
  groundTop: string;
  stripe: string;
  text: string;
  outline: string;
  layers: (ctx: Ctx, offset: number, now: number, animate: boolean) => void;
};

/** Calls `fn` for each repeat of a layer `span` wide scrolling at `factor` of the world speed. */
function repeat(offset: number, factor: number, span: number, fn: (x: number, i: number) => void) {
  const shift = (offset * factor) % span;
  const first = Math.floor((offset * factor) / span);
  for (let i = -1; i < WIDTH / span + 2; i += 1) fn(i * span - shift, i + first);
}

function crystalPath(c: Ctx, x: number, y: number, w: number, h: number, up: boolean) {
  c.beginPath();
  if (up) {
    c.moveTo(x, y + h);
    c.lineTo(x, y + TIP);
    c.lineTo(x + w / 2, y);
    c.lineTo(x + w, y + TIP);
    c.lineTo(x + w, y + h);
  } else {
    c.moveTo(x, y);
    c.lineTo(x, y + h - TIP);
    c.lineTo(x + w / 2, y + h);
    c.lineTo(x + w, y + h - TIP);
    c.lineTo(x + w, y);
  }
  c.closePath();
}

function hills(ctx: Ctx, offset: number, factor: number, base: number, amp: number, color: string, seed: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  const o = offset * factor;
  for (let x = 0; x <= WIDTH; x += 12) {
    const wx = x + o;
    ctx.lineTo(x, base - Math.sin(wx / 90 + seed) * amp - Math.sin(wx / 37 + seed * 2) * amp * 0.35);
  }
  ctx.lineTo(WIDTH, GROUND);
  ctx.closePath();
  ctx.fill();
}

function pine(ctx: Ctx, x: number, base: number, h: number) {
  ctx.beginPath();
  for (let k = 0; k < 3; k += 1) {
    const top = base - h + k * h * 0.25;
    const w = h * (0.22 + k * 0.1);
    ctx.moveTo(x, top);
    ctx.lineTo(x + w, top + h * 0.4);
    ctx.lineTo(x - w, top + h * 0.4);
    ctx.closePath();
  }
  ctx.rect(x - h * 0.04, base - h * 0.2, h * 0.08, h * 0.2);
  ctx.fill();
}

function starField(ctx: Ctx, count: number, offset: number, factor: number, now: number, animate: boolean, salt: number, maxY = GROUND - 80) {
  for (let i = 0; i < count; i += 1) {
    const x = (((hash(i * 7 + salt) * WIDTH * 2 - offset * factor) % (WIDTH * 2)) + WIDTH * 2) % (WIDTH * 2);
    if (x > WIDTH) continue;
    const y = hash(i * 13 + salt) * maxY;
    const tw = animate ? 0.55 + 0.45 * Math.sin(now / 400 + i * 1.7) : 0.8;
    ctx.fillStyle = withAlpha("#ffffff", tw * (0.5 + hash(i + salt) * 0.5));
    ctx.fillRect(x, y, 1.5 + hash(i * 3 + salt) * 1.5, 1.5 + hash(i * 3 + salt) * 1.5);
  }
}

const SCENERIES: Record<string, Scenery> = {
  default: {
    top: mix("#70c5ce", "#5cb83a", 0.1),
    bottom: mix("#70c5ce", "#ded895", 0.6),
    ground: mix("#ded895", "#5cb83a", 0.18),
    groundTop: mix("#ded895", "#5cb83a", 0.35),
    stripe: withAlpha("#1e3440", 0.06),
    text: "#1e3440",
    outline: withAlpha("#70c5ce", 0.55),
    layers(ctx, offset) {
      ctx.fillStyle = withAlpha("#5cb83a", 0.12);
      repeat(offset, 0.25, 120, (x, i) => {
        const h = 60 + ((((i * 37) % 5) + 5) % 5) * 18;
        crystalPath(ctx, x, GROUND - h, 46, h, true);
        ctx.fill();
        crystalPath(ctx, x + 54, GROUND - h * 0.6, 30, h * 0.6, true);
        ctx.fill();
      });
    },
  },
  sunset: {
    top: "#ff8a5c",
    bottom: "#ffd79a",
    ground: "#7a4a5a",
    groundTop: "#a86a6a",
    stripe: withAlpha("#2a1020", 0.12),
    text: "#3a1428",
    outline: withAlpha("#ffd79a", 0.6),
    layers(ctx, offset) {
      ctx.fillStyle = withAlpha("#fff2b0", 0.9);
      ctx.beginPath();
      ctx.arc(350, 360, 64, 0, Math.PI * 2);
      ctx.fill();
      hills(ctx, offset, 0.12, GROUND - 120, 26, withAlpha("#c4607a", 0.55), 1);
      hills(ctx, offset, 0.3, GROUND - 60, 22, withAlpha("#8a3f6a", 0.7), 4);
    },
  },
  forest: {
    top: "#9fd8c0",
    bottom: "#e6f6d6",
    ground: "#4f7a3a",
    groundTop: "#7fb84a",
    stripe: withAlpha("#1e3a14", 0.12),
    text: "#173222",
    outline: withAlpha("#e6f6d6", 0.6),
    layers(ctx, offset) {
      ctx.fillStyle = withAlpha("#6fae8a", 0.55);
      repeat(offset, 0.15, 70, (x, i) => pine(ctx, x + hash(i) * 30, GROUND, 120 + hash(i * 3) * 60));
      ctx.fillStyle = "#3f7f52";
      repeat(offset, 0.4, 95, (x, i) => pine(ctx, x + hash(i * 5) * 40, GROUND, 80 + hash(i * 7) * 50));
    },
  },
  snow: {
    top: "#a9cdf0",
    bottom: "#eef6ff",
    ground: "#e8f2fb",
    groundTop: "#ffffff",
    stripe: withAlpha("#7a9cc6", 0.18),
    text: "#1f3a5c",
    outline: withAlpha("#ffffff", 0.7),
    layers(ctx, offset, now, animate) {
      repeat(offset, 0.12, 200, (x, i) => {
        const h = 160 + hash(i) * 90;
        ctx.fillStyle = "#9fb8d6";
        ctx.beginPath();
        ctx.moveTo(x - 30, GROUND);
        ctx.lineTo(x + 100, GROUND - h);
        ctx.lineTo(x + 230, GROUND);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(x + 100, GROUND - h);
        ctx.lineTo(x + 100 - h * 0.25, GROUND - h * 0.75);
        ctx.lineTo(x + 92, GROUND - h * 0.8);
        ctx.lineTo(x + 108, GROUND - h * 0.72);
        ctx.lineTo(x + 100 + h * 0.25, GROUND - h * 0.75);
        ctx.closePath();
        ctx.fill();
      });
      ctx.fillStyle = withAlpha("#ffffff", 0.85);
      for (let i = 0; i < 40; i += 1) {
        const fall = animate ? now * (0.02 + hash(i) * 0.03) : 0;
        const x = (((hash(i * 7) * WIDTH + (animate ? Math.sin(now / 900 + i) * 12 : 0) - offset * 0.5) % WIDTH) + WIDTH) % WIDTH;
        const y = (hash(i * 11) * GROUND + fall) % GROUND;
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + hash(i * 3) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  desert: {
    top: "#ffc98a",
    bottom: "#fff1cc",
    ground: "#e2b56e",
    groundTop: "#f5d896",
    stripe: withAlpha("#8a5a20", 0.12),
    text: "#5a3410",
    outline: withAlpha("#fff1cc", 0.6),
    layers(ctx, offset) {
      ctx.fillStyle = withAlpha("#fff6c8", 0.95);
      ctx.beginPath();
      ctx.arc(120, 150, 44, 0, Math.PI * 2);
      ctx.fill();
      hills(ctx, offset, 0.15, GROUND - 70, 30, "#f0c27a", 2);
      ctx.fillStyle = "#5f9a4a";
      repeat(offset, 0.4, 160, (x, i) => {
        const h = 40 + hash(i) * 40;
        const cx = x + hash(i * 3) * 80;
        ctx.beginPath();
        ctx.roundRect(cx - 6, GROUND - h, 12, h, 6);
        ctx.roundRect(cx - 20, GROUND - h * 0.7, 8, h * 0.35, 4);
        ctx.roundRect(cx - 20, GROUND - h * 0.45, 18, 7, 3);
        ctx.roundRect(cx + 12, GROUND - h * 0.85, 8, h * 0.35, 4);
        ctx.roundRect(cx + 2, GROUND - h * 0.58, 18, 7, 3);
        ctx.fill();
      });
    },
  },
  night: {
    top: "#0d1440",
    bottom: "#2e3478",
    ground: "#1b2148",
    groundTop: "#2c3570",
    stripe: withAlpha("#8fa0ff", 0.1),
    text: "#ffffff",
    outline: withAlpha("#000000", 0.4),
    layers(ctx, offset, now, animate) {
      starField(ctx, 70, offset, 0.05, now, animate, 3);
      ctx.fillStyle = "#fff5d6";
      ctx.beginPath();
      ctx.arc(380, 110, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#d8c8a0", 0.6);
      for (const [x, y, r] of [
        [370, 100, 7],
        [392, 122, 5],
        [386, 96, 3],
      ]) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      hills(ctx, offset, 0.2, GROUND - 60, 24, "#1a2152", 3);
    },
  },
  city: {
    top: "#8fb4ff",
    bottom: "#ffd6e8",
    ground: "#3a3d4a",
    groundTop: "#555a6a",
    stripe: withAlpha("#ffe08a", 0.35),
    text: "#1f2240",
    outline: withAlpha("#ffffff", 0.55),
    layers(ctx, offset) {
      ctx.fillStyle = withAlpha("#9aa8d8", 0.75);
      repeat(offset, 0.15, 60, (x, i) => {
        const h = 120 + hash(i) * 140;
        ctx.fillRect(x, GROUND - h, 52, h);
      });
      repeat(offset, 0.4, 80, (x, i) => {
        const h = 70 + hash(i * 3) * 110;
        const w = 60;
        ctx.fillStyle = "#5a6390";
        ctx.fillRect(x, GROUND - h, w, h);
        ctx.fillStyle = withAlpha("#ffe08a", 0.85);
        for (let wy = GROUND - h + 10; wy < GROUND - 14; wy += 18)
          for (let wx = 8; wx < w - 8; wx += 16) if (hash(i * 97 + wy * 3 + wx) > 0.45) ctx.fillRect(x + wx, wy, 7, 9);
      });
    },
  },
  space: {
    top: "#07061a",
    bottom: "#2a1a52",
    ground: "#4a4560",
    groundTop: "#6a6480",
    stripe: withAlpha("#000000", 0.18),
    text: "#ffffff",
    outline: withAlpha("#000000", 0.45),
    layers(ctx, offset, now, animate) {
      const neb = ctx.createRadialGradient(120, 220, 10, 120, 220, 220);
      neb.addColorStop(0, withAlpha("#c46cff", 0.35));
      neb.addColorStop(1, withAlpha("#c46cff", 0));
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, WIDTH, GROUND);
      starField(ctx, 60, offset, 0.04, now, animate, 11, GROUND);
      starField(ctx, 30, offset, 0.15, now, false, 29, GROUND);
      ctx.fillStyle = "#b48cff";
      ctx.beginPath();
      ctx.arc(370, 170, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#ffffff", 0.18);
      ctx.beginPath();
      ctx.arc(356, 156, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffd0a0";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(370, 170, 78, 16, -0.25, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
};

export const sceneryOf = (theme: FlutterTheme) => SCENERIES[theme.scenery] ?? SCENERIES.default;

/** Sky and parallax layers (still when motion is off). */
export function drawSky(ctx: Ctx, theme: FlutterTheme, offset: number, now: number, animate: boolean) {
  const s = sceneryOf(theme);
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, s.top);
  sky.addColorStop(1, s.bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  s.layers(ctx, animate ? offset : 0, now, animate);
}

export function drawGround(ctx: Ctx, theme: FlutterTheme, offset: number) {
  const s = sceneryOf(theme);
  ctx.fillStyle = s.ground;
  ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);
  ctx.fillStyle = s.groundTop;
  ctx.fillRect(0, GROUND, WIDTH, 6);
  ctx.fillStyle = s.stripe;
  const stripe = 28;
  const groundShift = offset % stripe;
  for (let x = -stripe; x < WIDTH + stripe; x += stripe) {
    ctx.beginPath();
    ctx.moveTo(x - groundShift, GROUND + 6);
    ctx.lineTo(x - groundShift + 14, GROUND + 6);
    ctx.lineTo(x - groundShift + 4, HEIGHT);
    ctx.lineTo(x - groundShift - 10, HEIGHT);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------------

const tiles = new Map<string, CanvasPattern | null>();

function tilePattern(ctx: Ctx, key: string, w: number, h: number, paint: (c: Ctx) => void) {
  if (!tiles.has(key)) {
    const canvas = document.createElement("canvas");
    canvas.width = w * 2;
    canvas.height = h * 2;
    const c = canvas.getContext("2d");
    if (c) {
      c.scale(2, 2);
      paint(c);
    }
    const pattern = c ? ctx.createPattern(canvas, "repeat") : null;
    pattern?.setTransform(new DOMMatrix().scale(0.5, 0.5));
    tiles.set(key, pattern);
  }
  return tiles.get(key) ?? null;
}

function hGradient(ctx: Ctx, a: string, b: string, c: string) {
  const g = ctx.createLinearGradient(0, 0, PIPE_W, 0);
  g.addColorStop(0, a);
  g.addColorStop(0.45, b);
  g.addColorStop(1, c);
  return g;
}

/**
 * One obstacle pair in pillar-local coordinates (x from 0 to PIPE_W). Every skin fills exactly the
 * hitbox outline and keeps a solid edge so the gap always reads clearly.
 */
export function drawObstacle(ctx: Ctx, theme: FlutterTheme, gapY: number, seed: number, now: number, animate: boolean) {
  const top = gapY - GAP / 2;
  const bottom = gapY + GAP / 2;
  const parts: [boolean, number, number][] = [
    [false, -10, top + 10],
    [true, bottom, GROUND - bottom],
  ];
  const kind = theme.obstacle;
  for (const [up, y, h] of parts) {
    const end = up ? y : y + h;
    const path = () => crystalPath(ctx, 0, y, PIPE_W, h, up);
    ctx.lineJoin = "round";
    switch (kind) {
      case "bamboo": {
        path();
        ctx.fillStyle = hGradient(ctx, "#4f9a2e", "#a8dc6c", "#3f7f24");
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        ctx.fillStyle = "#3a6f1e";
        for (let ny = Math.floor(y / 56) * 56; ny < y + h; ny += 56) ctx.fillRect(0, ny, PIPE_W, 5);
        ctx.fillStyle = withAlpha("#ffffff", 0.25);
        ctx.fillRect(PIPE_W * 0.28, y, 5, h);
        ctx.restore();
        path();
        ctx.strokeStyle = "#2f5a18";
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case "brick": {
        path();
        ctx.fillStyle =
          tilePattern(ctx, "brick", 70, 28, (c) => {
            c.fillStyle = "#b9533a";
            c.fillRect(0, 0, 70, 28);
            c.fillStyle = "#c96a4a";
            c.fillRect(2, 2, 31, 10);
            c.fillRect(37, 2, 31, 10);
            c.fillRect(-16, 16, 33, 10);
            c.fillRect(19, 16, 33, 10);
            c.fillRect(54, 16, 33, 10);
            c.strokeStyle = "#e8c9b0";
            c.lineWidth = 2;
            c.beginPath();
            c.moveTo(0, 14);
            c.lineTo(70, 14);
            c.moveTo(0, 28);
            c.lineTo(70, 28);
            c.moveTo(35, 0);
            c.lineTo(35, 14);
            c.moveTo(17.5, 14);
            c.lineTo(17.5, 28);
            c.moveTo(52.5, 14);
            c.lineTo(52.5, 28);
            c.stroke();
          }) ?? "#b9533a";
        ctx.fill();
        path();
        ctx.strokeStyle = "#6a2a1a";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      }
      case "candy-cane": {
        path();
        ctx.fillStyle =
          tilePattern(ctx, "candy", 70, 70, (c) => {
            c.fillStyle = "#fffafa";
            c.fillRect(0, 0, 70, 70);
            c.fillStyle = "#e3263c";
            c.beginPath();
            for (const o of [-70, 0, 70]) {
              c.moveTo(o, 70);
              c.lineTo(o + 22, 70);
              c.lineTo(o + 92, 0);
              c.lineTo(o + 70, 0);
              c.closePath();
            }
            c.fill();
          }) ?? "#fffafa";
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        ctx.fillStyle = hGradient(ctx, "rgb(0 0 0 / 0.12)", "rgb(255 255 255 / 0.3)", "rgb(0 0 0 / 0.2)");
        ctx.fillRect(0, y, PIPE_W, h);
        ctx.restore();
        path();
        ctx.strokeStyle = "#9a1022";
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case "temple": {
        path();
        ctx.fillStyle = hGradient(ctx, "#bfa26a", "#ead6a0", "#a68a52");
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        ctx.strokeStyle = withAlpha("#7a6034", 0.45);
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (const fx of [16, 30, 44, 58]) {
          ctx.moveTo(fx, y);
          ctx.lineTo(fx, y + h);
        }
        ctx.stroke();
        ctx.fillStyle = "#d9b45a";
        const capital = up ? end + TIP + 2 : end - TIP - 14;
        ctx.fillRect(0, capital, PIPE_W, 12);
        ctx.fillStyle = withAlpha("#7a6034", 0.5);
        ctx.fillRect(0, capital + (up ? 12 : -3), PIPE_W, 3);
        ctx.restore();
        path();
        ctx.strokeStyle = "#6e5428";
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case "ice": {
        path();
        ctx.fillStyle = hGradient(ctx, "rgb(150 210 245 / 0.92)", "rgb(235 250 255 / 0.95)", "rgb(120 190 235 / 0.92)");
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        ctx.strokeStyle = withAlpha("#ffffff", 0.85);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let k = 0; k < 4; k += 1) {
          const sy = y + hash(seed * 7 + k + (up ? 50 : 0)) * h;
          ctx.moveTo(6 + hash(seed + k) * 20, sy);
          ctx.lineTo(30 + hash(seed * 3 + k) * 10, sy + 14);
          ctx.lineTo(PIPE_W - 8, sy + 6 + hash(seed * 5 + k) * 18);
        }
        ctx.stroke();
        const glint = animate ? ((now / 14 + seed * 40) % (h + 120)) - 60 : -100;
        ctx.fillStyle = withAlpha("#ffffff", 0.35);
        ctx.beginPath();
        ctx.moveTo(0, y + glint);
        ctx.lineTo(PIPE_W, y + glint - 30);
        ctx.lineTo(PIPE_W, y + glint - 16);
        ctx.lineTo(0, y + glint + 14);
        ctx.fill();
        ctx.restore();
        path();
        ctx.strokeStyle = "#4a9ad0";
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case "magma": {
        path();
        ctx.fillStyle = hGradient(ctx, "#2e2224", "#5a3a34", "#241a1c");
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        const glow = animate ? 0.65 + 0.35 * Math.sin(now / 300 + seed) : 0.85;
        ctx.beginPath();
        for (let k = 0; k < 5; k += 1) {
          const sy = y + hash(seed * 11 + k + (up ? 30 : 0)) * h;
          ctx.moveTo(4, sy);
          ctx.lineTo(22, sy + 10 + hash(k + seed) * 10);
          ctx.lineTo(40, sy - 6);
          ctx.lineTo(PIPE_W - 4, sy + 12);
        }
        ctx.strokeStyle = withAlpha("#ff6a1a", 0.35 * glow);
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.strokeStyle = withAlpha("#ffc04a", glow);
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
        path();
        ctx.strokeStyle = withAlpha("#ff7a2e", 0.9);
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case "neon": {
        path();
        ctx.fillStyle = "#130e28";
        ctx.fill();
        const pulse = animate ? 0.8 + 0.2 * Math.sin(now / 220 + seed) : 1;
        path();
        ctx.strokeStyle = withAlpha("#ff4fd8", 0.18 * pulse);
        ctx.lineWidth = 12;
        ctx.stroke();
        ctx.strokeStyle = withAlpha("#ff4fd8", 0.4 * pulse);
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = "#ffb3f0";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.save();
        path();
        ctx.clip();
        ctx.strokeStyle = withAlpha("#4ff0ff", 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(PIPE_W / 2, y);
        ctx.lineTo(PIPE_W / 2, y + h);
        ctx.stroke();
        ctx.restore();
        break;
      }
      default: {
        path();
        ctx.fillStyle = hGradient(ctx, mix("#5cb83a", "#70c5ce", 0.15), mix("#5cb83a", "#ffffff", 0.12), mix("#5cb83a", "#70c5ce", 0.45));
        ctx.fill();
        ctx.strokeStyle = withAlpha("#ffffff", 0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (up) {
          ctx.moveTo(PIPE_W * 0.32, y + 14);
          ctx.lineTo(PIPE_W * 0.32, y + h);
        } else {
          ctx.moveTo(PIPE_W * 0.32, Math.max(0, y));
          ctx.lineTo(PIPE_W * 0.32, y + h - 14);
        }
        ctx.stroke();
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Characters (drawn facing right around 0,0, within the same small circle)
// ---------------------------------------------------------------------------

function eye(ctx: Ctx, x: number, y: number, r: number, dead: boolean) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1325";
  ctx.beginPath();
  ctx.arc(dead ? x : x + r * 0.3, y, r * 0.48, 0, Math.PI * 2);
  ctx.fill();
}

/** `wing` is the flap amount (0 at rest, up to ~1.3). */
export function drawCharacter(ctx: Ctx, theme: FlutterTheme, wing: number, dead: boolean, now: number, animate: boolean) {
  switch (theme.character) {
    case "bee": {
      ctx.save();
      ctx.rotate(-0.2 - wing * 0.6);
      ctx.fillStyle = withAlpha("#e6f6ff", 0.85);
      ctx.strokeStyle = withAlpha("#7aa8c8", 0.8);
      ctx.lineWidth = 1.2;
      for (const [wx, wr] of [
        [-2, 11],
        [-9, 8],
      ]) {
        ctx.beginPath();
        ctx.ellipse(wx, -12, wr * 0.6, wr, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#ffcd2e";
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = "#2a1f12";
      for (const sx of [-11, -3, 5]) ctx.fillRect(sx, -14, 4.5, 28);
      ctx.restore();
      ctx.fillStyle = "#2a1f12";
      ctx.beginPath();
      ctx.moveTo(-17, -2);
      ctx.lineTo(-24, 0);
      ctx.lineTo(-17, 3);
      ctx.fill();
      ctx.strokeStyle = "#2a1f12";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(10, -10);
      ctx.quadraticCurveTo(14, -18, 18, -17);
      ctx.stroke();
      eye(ctx, 10, -3, 4.2, dead);
      return;
    }
    case "bat": {
      ctx.fillStyle = "#4a2f6a";
      for (const side of [1, -1]) {
        ctx.save();
        ctx.scale(1, side);
        ctx.rotate(side === 1 ? -wing * 0.5 : wing * 0.3);
        ctx.beginPath();
        ctx.moveTo(-2, -4);
        ctx.quadraticCurveTo(-14, -26, -26, -16);
        ctx.quadraticCurveTo(-20, -12, -22, -6);
        ctx.quadraticCurveTo(-14, -8, -12, -2);
        ctx.closePath();
        ctx.globalAlpha = side === 1 ? 1 : 0.7;
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = "#5e3d86";
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, -10);
      ctx.lineTo(1, -20);
      ctx.lineTo(5, -11);
      ctx.moveTo(6, -9);
      ctx.lineTo(11, -18);
      ctx.lineTo(12, -6);
      ctx.fill();
      eye(ctx, 7, -3, 3.6, dead);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(9, 5);
      ctx.lineTo(10.5, 9);
      ctx.lineTo(12, 5);
      ctx.fill();
      return;
    }
    case "ghost": {
      const sway = animate ? Math.sin(now / 160) * 2 : 0;
      ctx.fillStyle = withAlpha("#f6f4ff", 0.95);
      ctx.beginPath();
      ctx.moveTo(14, 2);
      ctx.arc(0, 0, 15, 0, Math.PI, true);
      ctx.lineTo(-15, 12);
      for (let k = 0; k < 4; k += 1) ctx.quadraticCurveTo(-11 + k * 7.5, 18 + (k % 2 ? sway : -sway), -7.5 + k * 7.5, 12);
      ctx.lineTo(15, 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = withAlpha("#9a8ccf", 0.8);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.save();
      ctx.translate(-12, 2);
      ctx.rotate(-0.4 - wing * 0.8);
      ctx.fillStyle = "#f6f4ff";
      ctx.beginPath();
      ctx.ellipse(-4, 0, 7, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#2a2140";
      for (const ex of [3, 10]) {
        ctx.beginPath();
        if (dead) ctx.rect(ex - 2.5, -4, 5, 1.6);
        else ctx.ellipse(ex, -3, 2.4, 3.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = withAlpha("#ff8fb1", 0.6);
      ctx.beginPath();
      ctx.arc(1, 4, 2.4, 0, Math.PI * 2);
      ctx.arc(13, 4, 2.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "paper-plane": {
      const flex = wing * 4;
      ctx.lineJoin = "round";
      ctx.fillStyle = "#d9dde6";
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-16, 10 + flex);
      ctx.lineTo(-8, 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-18, -12 - flex);
      ctx.lineTo(-8, 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5a6a8a";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-18, -12 - flex);
      ctx.lineTo(-8, 1);
      ctx.lineTo(-16, 10 + flex);
      ctx.closePath();
      ctx.moveTo(20, 0);
      ctx.lineTo(-8, 1);
      ctx.stroke();
      ctx.fillStyle = "#ff6a6a";
      ctx.fillRect(-6, -6, 6, 2.5);
      return;
    }
    case "fish": {
      ctx.save();
      ctx.translate(-13, 0);
      ctx.rotate(Math.sin(wing * 2) * 0.35);
      ctx.fillStyle = "#ff9a3a";
      ctx.beginPath();
      ctx.moveTo(2, 0);
      ctx.lineTo(-11, -11);
      ctx.quadraticCurveTo(-7, 0, -11, 11);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#ff7a1a";
      ctx.beginPath();
      ctx.ellipse(1, 0, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(-3, 0, 2.6, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffb070";
      ctx.beginPath();
      ctx.moveTo(-6, -10);
      ctx.quadraticCurveTo(0, -20, 8, -11);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(2, 6, 5, 2.6, 0.4 + wing * 0.4, 0, Math.PI * 2);
      ctx.fill();
      eye(ctx, 9, -3, 4, dead);
      return;
    }
    case "rocket": {
      if (!dead) {
        const flame = 8 + wing * 10 + (animate ? Math.sin(now / 40) * 2 : 0);
        ctx.fillStyle = "#ffb02e";
        ctx.beginPath();
        ctx.moveTo(-14, -5);
        ctx.lineTo(-14 - flame, 0);
        ctx.lineTo(-14, 5);
        ctx.fill();
        ctx.fillStyle = "#fff2a0";
        ctx.beginPath();
        ctx.moveTo(-14, -2.5);
        ctx.lineTo(-14 - flame * 0.55, 0);
        ctx.lineTo(-14, 2.5);
        ctx.fill();
      }
      ctx.fillStyle = "#e3263c";
      ctx.beginPath();
      ctx.moveTo(-8, -9);
      ctx.lineTo(-17, -15);
      ctx.lineTo(-14, -6);
      ctx.moveTo(-8, 9);
      ctx.lineTo(-17, 15);
      ctx.lineTo(-14, 6);
      ctx.fill();
      ctx.fillStyle = "#f4f6fb";
      ctx.beginPath();
      ctx.moveTo(-14, -8);
      ctx.lineTo(8, -8);
      ctx.quadraticCurveTo(20, -6, 22, 0);
      ctx.quadraticCurveTo(20, 6, 8, 8);
      ctx.lineTo(-14, 8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#7a8296";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#e3263c";
      ctx.beginPath();
      ctx.moveTo(12, -7);
      ctx.quadraticCurveTo(20, -6, 22, 0);
      ctx.quadraticCurveTo(20, 6, 12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#4fb8ff";
      ctx.beginPath();
      ctx.arc(2, 0, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#7a8296";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      return;
    }
    case "dragon": {
      ctx.save();
      ctx.translate(-4, -4);
      ctx.rotate(-0.3 - wing * 0.7);
      ctx.fillStyle = "#2f8f5a";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, -20);
      ctx.lineTo(-10, -12);
      ctx.lineTo(-16, -16);
      ctx.lineTo(-16, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#3fbf6e";
      ctx.beginPath();
      ctx.ellipse(-1, 1, 15, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(13, -3, 8, 6, 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5e3a0";
      ctx.beginPath();
      ctx.ellipse(-1, 6, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f5e3a0";
      ctx.beginPath();
      ctx.moveTo(6, -9);
      ctx.lineTo(3, -16);
      ctx.lineTo(9, -10);
      ctx.moveTo(10, -9);
      ctx.lineTo(9, -16);
      ctx.lineTo(13, -9);
      ctx.fill();
      ctx.fillStyle = "#2f8f5a";
      ctx.beginPath();
      ctx.moveTo(-14, -4);
      ctx.lineTo(-22, -2);
      ctx.lineTo(-15, 3);
      ctx.fill();
      eye(ctx, 12, -5, 3.4, dead);
      ctx.fillStyle = "#1a3a24";
      ctx.beginPath();
      ctx.arc(19, -2, 1, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    default: {
      ctx.fillStyle = "#ff7a45";
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#ffffff", 0.35);
      ctx.beginPath();
      ctx.moveTo(-4, -13);
      ctx.lineTo(6, -6);
      ctx.lineTo(-2, 2);
      ctx.lineTo(-12, -5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = withAlpha("#000000", 0.14);
      ctx.beginPath();
      ctx.moveTo(-12, 4);
      ctx.lineTo(4, 12);
      ctx.lineTo(-6, 14);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.translate(-5, 2);
      ctx.rotate(-0.3 - wing);
      ctx.fillStyle = mix("#ff7a45", "#ffffff", 0.35);
      ctx.beginPath();
      ctx.ellipse(-6, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#ffc857";
      ctx.beginPath();
      ctx.moveTo(16, -3);
      ctx.lineTo(26, 1);
      ctx.lineTo(16, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(7, -5, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1325";
      ctx.beginPath();
      ctx.arc(dead ? 7 : 8.5, -5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// Trails
// ---------------------------------------------------------------------------

export type TrailPoint = { x: number; y: number };
const RAINBOW = ["#ff4d4d", "#ff9a2e", "#ffd23f", "#4fcf6a", "#3fa7ff", "#a77bff"];

function star5(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function strokeThrough(ctx: Ctx, pts: TrailPoint[], dy = 0) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y + dy) : ctx.moveTo(p.x, p.y + dy)));
}

/** Points run newest first, already in world coordinates. `subtle` keeps trails short and simple. */
export function drawTrail(ctx: Ctx, theme: FlutterTheme, points: TrailPoint[], now: number, subtle: boolean) {
  const pts = subtle ? points.slice(0, 10) : points;
  const n = pts.length;
  if (n < 2) return;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  switch (theme.trail) {
    case "sparkles":
      pts.forEach((p, i) => {
        if (i % 3 !== 1) return;
        const k = 1 - i / n;
        const tw = subtle ? 1 : 0.7 + 0.3 * Math.sin(now / 90 + i);
        ctx.fillStyle = withAlpha(i % 2 ? "#fff6b0" : "#ffffff", k);
        ctx.beginPath();
        const r = 6 * k * tw;
        ctx.moveTo(p.x, p.y - r);
        ctx.quadraticCurveTo(p.x, p.y, p.x + r, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y + r);
        ctx.quadraticCurveTo(p.x, p.y, p.x - r, p.y);
        ctx.quadraticCurveTo(p.x, p.y, p.x, p.y - r);
        ctx.fill();
      });
      return;
    case "bubbles":
      pts.forEach((p, i) => {
        if (i % 3 !== 2) return;
        const k = 1 - i / n;
        ctx.strokeStyle = withAlpha("#ffffff", 0.9 * k);
        ctx.fillStyle = withAlpha("#bfe9ff", 0.25 * k);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y - (subtle ? 0 : i * 0.6), 3 + (1 - k) * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      return;
    case "hearts":
      pts.forEach((p, i) => {
        if (i % 4 !== 2) return;
        const k = 1 - i / n;
        const s = 6 * (0.5 + k * 0.5);
        ctx.fillStyle = withAlpha(i % 8 === 2 ? "#ff4f86" : "#ff9ec4", k);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + s * 0.4);
        ctx.bezierCurveTo(p.x - s * 1.1, p.y - s * 0.3, p.x - s * 0.5, p.y - s * 1.05, p.x, p.y - s * 0.45);
        ctx.bezierCurveTo(p.x + s * 0.5, p.y - s * 1.05, p.x + s * 1.1, p.y - s * 0.3, p.x, p.y + s * 0.4);
        ctx.fill();
      });
      return;
    case "stars":
      pts.forEach((p, i) => {
        if (i % 3 !== 1) return;
        const k = 1 - i / n;
        star5(ctx, p.x, p.y, 7 * (0.4 + k * 0.6));
        ctx.fillStyle = withAlpha(RAINBOW[(i / 3) % RAINBOW.length | 0], k);
        ctx.fill();
      });
      return;
    case "ribbon": {
      const wave = (i: number) => (subtle ? 0 : Math.sin(i * 0.5 - now / 120) * 5);
      const wavy = pts.map((p, i) => ({ x: p.x, y: p.y + wave(i) }));
      for (let i = 1; i < n; i += 1) {
        const k = 1 - i / n;
        ctx.strokeStyle = withAlpha("#ff5fa2", k);
        ctx.lineWidth = 8 * k + 1;
        strokeThrough(ctx, [wavy[i - 1], wavy[i]]);
        ctx.stroke();
      }
      ctx.strokeStyle = withAlpha("#ffffff", 0.7);
      ctx.lineWidth = 1.5;
      strokeThrough(ctx, wavy.slice(0, Math.ceil(n * 0.6)));
      ctx.stroke();
      return;
    }
    case "rainbow":
      RAINBOW.forEach((color, band) => {
        for (let i = 1; i < n; i += 1) {
          const k = 1 - i / n;
          ctx.strokeStyle = withAlpha(color, k * 0.9);
          ctx.lineWidth = 3;
          strokeThrough(ctx, [pts[i - 1], pts[i]], (band - 2.5) * 3);
          ctx.stroke();
        }
      });
      return;
    case "comet": {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 1; i < n; i += 1) {
        const k = 1 - i / n;
        ctx.strokeStyle = withAlpha(i < n / 3 ? "#fff2a0" : "#ff8a2e", k * 0.8);
        ctx.lineWidth = 16 * k + 2;
        strokeThrough(ctx, [pts[i - 1], pts[i]]);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    default:
      // Wing puffs: a few soft clouds left behind.
      pts.forEach((p, i) => {
        if (i % 5 !== 3) return;
        const k = 1 - i / n;
        ctx.fillStyle = withAlpha("#ffffff", 0.55 * k);
        ctx.beginPath();
        ctx.arc(p.x, p.y + 4, 3 + (1 - k) * 5, 0, Math.PI * 2);
        ctx.fill();
      });
  }
}
