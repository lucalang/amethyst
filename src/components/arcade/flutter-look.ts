"use client";

import type { GameLook } from "@/lib/game-cosmetics";
import { mix, withAlpha } from "./engine";

/**
 * Flutter cosmetics: characters, flight trails, obstacle skins and background scenery. Everything
 * here is drawing only: characters are painted inside the same small circle whatever their shape
 * (the hitbox lives in the game and never changes), and obstacles fill the exact pillar outline.
 * Layering: scenery (sky, parallax, ground) → obstacles → trail → character, then the art style
 * re-renders the finished frame (see `applyFlutterStyle`), so it combines with everything else.
 */

type Ctx = CanvasRenderingContext2D;

export const WIDTH = 480;
export const HEIGHT = 640;
export const GROUND = HEIGHT - 70;
export const PIPE_W = 70;
/** Height of the faceted point at each pillar's end. */
export const TIP = 18;
export const GAP = 165;

export type FlutterStyle = "" | "pixel" | "silent-film" | "blueprint" | "watercolor" | "pop-art";
const STYLES: FlutterStyle[] = ["pixel", "silent-film", "blueprint", "watercolor", "pop-art"];
export type FlutterTheme = { key: string; character: string; trail: string; obstacle: string; scenery: string; style: FlutterStyle };

export function flutterTheme(look: GameLook): FlutterTheme {
  const character = look.character ?? "";
  const trail = look.trail ?? "";
  const obstacle = look.obstacle ?? "";
  const scenery = look.scenery ?? "";
  const style = STYLES.find((entry) => entry === look.style) ?? "";
  return { key: [character, trail, obstacle, scenery, style].join("|"), character, trail, obstacle, scenery, style };
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
  reef: {
    top: "#47b8d6",
    bottom: "#0f5b82",
    ground: "#e3cc93",
    groundTop: "#f3e2b2",
    stripe: withAlpha("#8a6a30", 0.14),
    text: "#ffffff",
    outline: withAlpha("#06304a", 0.5),
    layers(ctx, offset, now, animate) {
      // Sun rays slanting down through the water.
      ctx.fillStyle = withAlpha("#e8fbff", 0.09);
      for (let k = 0; k < 5; k += 1) {
        const sway = animate ? Math.sin(now / 1800 + k) * 18 : 0;
        const x = 40 + k * 100 + sway;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 46, 0);
        ctx.lineTo(x - 40 + sway, GROUND);
        ctx.lineTo(x - 110 + sway, GROUND);
        ctx.fill();
      }
      // Far coral heads.
      ctx.fillStyle = withAlpha("#1f6f92", 0.6);
      repeat(offset, 0.15, 150, (x, i) => {
        const h = 60 + hash(i) * 70;
        ctx.beginPath();
        ctx.moveTo(x, GROUND);
        for (let b = 0; b <= 6; b += 1) ctx.lineTo(x + b * 22, GROUND - h * (0.55 + 0.45 * Math.abs(Math.sin(b * 1.3 + i))));
        ctx.lineTo(x + 132, GROUND);
        ctx.fill();
      });
      // Swaying kelp in front.
      ctx.lineCap = "round";
      repeat(offset, 0.4, 110, (x, i) => {
        const h = 90 + hash(i * 3) * 120;
        const bx = x + hash(i * 5) * 60;
        ctx.strokeStyle = i % 2 ? "#2f8a5a" : "#3f9f4a";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(bx, GROUND);
        for (let y = 0; y <= h; y += 12) ctx.lineTo(bx + Math.sin(y / 26 + (animate ? now / 700 : 0) + i) * 7, GROUND - y);
        ctx.stroke();
      });
      if (animate) {
        ctx.strokeStyle = withAlpha("#ffffff", 0.55);
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 18; i += 1) {
          const x = (((hash(i * 7) * WIDTH - offset * 0.3) % WIDTH) + WIDTH) % WIDTH + Math.sin(now / 500 + i) * 4;
          const y = GROUND - ((now * (0.03 + hash(i) * 0.03) + hash(i * 9) * GROUND) % GROUND);
          ctx.beginPath();
          ctx.arc(x, y, 2 + hash(i * 3) * 2.5, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
  },
  blossom: {
    top: "#ffcfe2",
    bottom: "#fff5ee",
    ground: "#86ba68",
    groundTop: "#b6de8a",
    stripe: withAlpha("#3a6a20", 0.12),
    text: "#5a2040",
    outline: withAlpha("#ffffff", 0.7),
    layers(ctx, offset, now, animate) {
      // A snow-capped mountain far away, then pink hills and blossoming trees.
      ctx.fillStyle = withAlpha("#a78bc6", 0.55);
      ctx.beginPath();
      ctx.moveTo(150, GROUND);
      ctx.lineTo(300, GROUND - 250);
      ctx.lineTo(460, GROUND);
      ctx.fill();
      ctx.fillStyle = withAlpha("#ffffff", 0.9);
      ctx.beginPath();
      ctx.moveTo(300, GROUND - 250);
      ctx.lineTo(262, GROUND - 188);
      ctx.lineTo(284, GROUND - 196);
      ctx.lineTo(300, GROUND - 180);
      ctx.lineTo(318, GROUND - 198);
      ctx.lineTo(340, GROUND - 186);
      ctx.closePath();
      ctx.fill();
      hills(ctx, offset, 0.18, GROUND - 60, 20, withAlpha("#e7a8c6", 0.6), 5);
      repeat(offset, 0.4, 150, (x, i) => {
        const tx = x + hash(i * 3) * 60;
        const h = 70 + hash(i) * 40;
        ctx.strokeStyle = "#6a4034";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(tx, GROUND);
        ctx.quadraticCurveTo(tx + 6, GROUND - h * 0.5, tx - 4, GROUND - h);
        ctx.moveTo(tx + 2, GROUND - h * 0.55);
        ctx.lineTo(tx + 22, GROUND - h * 0.8);
        ctx.stroke();
        for (let b = 0; b < 7; b += 1) {
          ctx.fillStyle = b % 2 ? "#ffb7d2" : "#ff9cc2";
          ctx.beginPath();
          ctx.arc(tx - 22 + hash(i * 11 + b) * 50, GROUND - h - 8 + hash(i * 13 + b) * 30, 14 + hash(b + i) * 8, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      if (animate) {
        ctx.fillStyle = withAlpha("#ff8fb8", 0.85);
        for (let i = 0; i < 26; i += 1) {
          const fall = now * (0.025 + hash(i) * 0.02);
          const x = (((hash(i * 7) * WIDTH + Math.sin(now / 700 + i) * 20 - offset * 0.6 - fall * 0.6) % WIDTH) + WIDTH) % WIDTH;
          const y = (hash(i * 11) * GROUND + fall) % GROUND;
          ctx.beginPath();
          ctx.ellipse(x, y, 3.2, 1.8, now / 400 + i, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  "sky-islands": {
    top: "#4f9ff0",
    bottom: "#d6ecff",
    ground: "#eef4ff",
    groundTop: "#ffffff",
    stripe: withAlpha("#9ab0d8", 0.28),
    text: "#183058",
    outline: withAlpha("#ffffff", 0.7),
    layers(ctx, offset, now, animate) {
      ctx.fillStyle = withAlpha("#ffffff", 0.7);
      repeat(offset, 0.05, 260, (x, i) => {
        const y = 120 + hash(i) * 160;
        for (const [dx, dy, r] of [[0, 0, 26], [26, -10, 32], [58, 0, 24], [30, 10, 26]]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const island = (x: number, y: number, w: number, i: number) => {
        // Waterfall first, so the island sits on top of it.
        const fall = animate ? (now / 25) % 20 : 0;
        ctx.fillStyle = withAlpha("#bfe6ff", 0.7);
        ctx.fillRect(x + w * 0.62, y, 5, 130);
        ctx.fillStyle = withAlpha("#ffffff", 0.8);
        for (let k = 0; k < 7; k += 1) ctx.fillRect(x + w * 0.62 + 1, y + k * 20 + fall, 3, 7);
        ctx.fillStyle = "#8a6446";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w * 0.7, y + w * 0.4);
        ctx.lineTo(x + w * 0.5, y + w * 0.75);
        ctx.lineTo(x + w * 0.3, y + w * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#6fc05a";
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y, w / 2 + 4, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3f8f4a";
        ctx.beginPath();
        ctx.arc(x + w * 0.3, y - 14, 10, 0, Math.PI * 2);
        ctx.arc(x + w * 0.4, y - 20, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#6a4034";
        ctx.fillRect(x + w * 0.33, y - 10, 3, 10);
        if (i % 3 === 0) {
          ctx.fillStyle = "#f4efe4";
          ctx.fillRect(x + w * 0.66, y - 14, 12, 12);
          ctx.fillStyle = "#c4503a";
          ctx.beginPath();
          ctx.moveTo(x + w * 0.66 - 3, y - 14);
          ctx.lineTo(x + w * 0.66 + 6, y - 22);
          ctx.lineTo(x + w * 0.66 + 15, y - 14);
          ctx.fill();
        }
      };
      repeat(offset, 0.2, 230, (x, i) => island(x + hash(i) * 50, 210 + hash(i * 3) * 120 + (animate ? Math.sin(now / 1200 + i) * 4 : 0), 70 + hash(i * 5) * 30, i));
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
      case "birch": {
        path();
        ctx.fillStyle = hGradient(ctx, "#d4cfc2", "#f8f5ee", "#c4bdae");
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        // Dark lenticels across the bark, a few knotted "eyes" and a shelf fungus near the tip.
        ctx.fillStyle = "#2f2c27";
        for (let ny = Math.floor(y / 20) * 20; ny < y + h; ny += 20) {
          const r = hash(Math.round(ny) * 3 + seed);
          ctx.beginPath();
          ctx.ellipse(8 + r * 40, ny + 6, 6 + r * 9, 1.6 + r, 0, 0, Math.PI * 2);
          ctx.fill();
          if (r > 0.82) {
            ctx.beginPath();
            ctx.moveTo(PIPE_W * 0.5, ny);
            ctx.quadraticCurveTo(PIPE_W * 0.62, ny + 8, PIPE_W * 0.5, ny + 16);
            ctx.quadraticCurveTo(PIPE_W * 0.38, ny + 8, PIPE_W * 0.5, ny);
            ctx.fill();
          }
        }
        const shelf = up ? end + TIP + 26 : end - TIP - 26;
        ctx.fillStyle = "#c98a4a";
        ctx.beginPath();
        ctx.ellipse(PIPE_W - 4, shelf, 16, 6, 0, Math.PI * 0.5, Math.PI * 1.5);
        ctx.fill();
        ctx.fillStyle = "#e8b878";
        ctx.fillRect(PIPE_W - 18, shelf - 1, 14, 2);
        ctx.restore();
        path();
        ctx.strokeStyle = "#6e675a";
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case "coral": {
        path();
        ctx.fillStyle = hGradient(ctx, "#f2647e", "#ffb0a4", "#d84a68");
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        // Rows of polyps that slowly open and close.
        let idx = 0;
        for (let ny = Math.floor(y / 14) * 14; ny < y + h + 14; ny += 14) {
          const row = Math.round(ny / 14);
          for (let nx = row % 2 ? 7 : 14; nx < PIPE_W; nx += 14) {
            idx += 1;
            const open = animate ? 0.6 + 0.4 * Math.sin(now / 500 + idx * 0.7 + seed) : 0.85;
            ctx.fillStyle = withAlpha("#a8324a", 0.45);
            ctx.beginPath();
            ctx.arc(nx, ny, 4.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#fff0e6";
            for (let t = 0; t < 6; t += 1) {
              const a = (t / 6) * Math.PI * 2;
              ctx.beginPath();
              ctx.arc(nx + Math.cos(a) * 3.2 * open, ny + Math.sin(a) * 3.2 * open, 1.1, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
        ctx.restore();
        path();
        ctx.strokeStyle = "#9a2a44";
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case "clockwork": {
        path();
        ctx.fillStyle = hGradient(ctx, "#86662a", "#e2be64", "#6a4e1e");
        ctx.fill();
        ctx.save();
        path();
        ctx.clip();
        for (let ny = Math.floor(y / 64) * 64; ny < y + h; ny += 64) {
          ctx.fillStyle = withAlpha("#4a360e", 0.5);
          ctx.fillRect(0, ny, PIPE_W, 7);
          ctx.fillStyle = "#f2d690";
          for (let rx = 6; rx < PIPE_W; rx += 12) {
            ctx.beginPath();
            ctx.arc(rx, ny + 3.5, 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Gears turn against each other: neighbours spin opposite ways.
        let g = 0;
        for (let ny = Math.floor(y / 64) * 64 + 34; ny < y + h; ny += 64) {
          g += 1;
          const r = 13 + hash(Math.round(ny) + seed) * 5;
          const cx = g % 2 ? 22 : PIPE_W - 22;
          const spin = (animate ? now / 900 : 0) * (g % 2 ? 1 : -1) + g;
          ctx.save();
          ctx.translate(cx, ny);
          ctx.rotate(spin);
          ctx.fillStyle = "#c9a24a";
          ctx.beginPath();
          for (let t = 0; t < 20; t += 1) {
            const a = (t / 20) * Math.PI * 2;
            const rr = t % 2 ? r : r + 4;
            ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#5a4210";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = "#5a4210";
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = withAlpha("#5a4210", 0.6);
          ctx.beginPath();
          for (let t = 0; t < 4; t += 1) {
            ctx.moveTo(Math.cos((t * Math.PI) / 2) * r * 0.35, Math.sin((t * Math.PI) / 2) * r * 0.35);
            ctx.lineTo(Math.cos((t * Math.PI) / 2) * r * 0.85, Math.sin((t * Math.PI) / 2) * r * 0.85);
          }
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
        path();
        ctx.strokeStyle = "#4a360e";
        ctx.lineWidth = 2.5;
        ctx.stroke();
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
    if (theme.style === "pop-art") {
      // Comic ink: a heavy black outline round every pillar.
      path();
      ctx.strokeStyle = "#111018";
      ctx.lineWidth = 4.5;
      ctx.stroke();
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

/** Offscreen buffers for the Pop Art ink outline round the character. */
let inkSprite: HTMLCanvasElement | null = null;
let inkMask: HTMLCanvasElement | null = null;
const INK_BOX = 72;

/** `wing` is the flap amount (0 at rest, up to ~1.3). */
export function drawCharacter(ctx: Ctx, theme: FlutterTheme, wing: number, dead: boolean, now: number, animate: boolean) {
  if (theme.style !== "pop-art" || typeof document === "undefined") return paintCharacter(ctx, theme, wing, dead, now, animate);
  // Pop Art: draw the flyer once offscreen, then stamp a black silhouette round it for a thick ink line.
  const m = ctx.getTransform();
  const k = Math.min(4, Math.max(1, Math.hypot(m.a, m.b)));
  const px = Math.ceil(INK_BOX * k);
  inkSprite ??= document.createElement("canvas");
  inkMask ??= document.createElement("canvas");
  for (const c of [inkSprite, inkMask]) {
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
  }
  const sc = inkSprite.getContext("2d");
  const mc = inkMask.getContext("2d");
  if (!sc || !mc) return paintCharacter(ctx, theme, wing, dead, now, animate);
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, px, px);
  sc.setTransform(k, 0, 0, k, px / 2, px / 2);
  paintCharacter(sc, theme, wing, dead, now, animate);
  mc.setTransform(1, 0, 0, 1, 0, 0);
  mc.globalCompositeOperation = "source-over";
  mc.clearRect(0, 0, px, px);
  mc.drawImage(inkSprite, 0, 0);
  mc.globalCompositeOperation = "source-in";
  mc.fillStyle = "#111018";
  mc.fillRect(0, 0, px, px);
  const h = INK_BOX / 2;
  for (let a = 0; a < 8; a += 1) {
    const ox = Math.cos((a / 8) * Math.PI * 2) * 2.4;
    const oy = Math.sin((a / 8) * Math.PI * 2) * 2.4;
    ctx.drawImage(inkMask, -h + ox, -h + oy, INK_BOX, INK_BOX);
  }
  ctx.drawImage(inkSprite, -h, -h, INK_BOX, INK_BOX);
}

function paintCharacter(ctx: Ctx, theme: FlutterTheme, wing: number, dead: boolean, now: number, animate: boolean) {
  switch (theme.character) {
    case "jellyfish": {
      const pulse = (animate ? Math.sin(now / 170) * 0.1 : 0) + wing * 0.12;
      const sy = 1 - pulse;
      // Tentacles stream out behind the bell.
      ctx.strokeStyle = withAlpha("#ff9ad8", 0.85);
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      for (let t = 0; t < 4; t += 1) {
        const ty = -6 + t * 4;
        ctx.beginPath();
        ctx.moveTo(-5, ty);
        for (let j = 1; j <= 4; j += 1) ctx.lineTo(-5 - j * 5, ty + Math.sin((animate ? now / 110 : 0) + j + t) * 2.4);
        ctx.stroke();
      }
      ctx.save();
      ctx.scale(1 + pulse * 0.6, sy);
      ctx.beginPath();
      ctx.moveTo(-6, -14);
      ctx.bezierCurveTo(10, -18, 21, -10, 21, 0);
      ctx.bezierCurveTo(21, 10, 10, 18, -6, 14);
      for (let b = 0; b < 4; b += 1) ctx.quadraticCurveTo(-10, 10.5 - b * 7, -6, 7 - b * 7);
      ctx.closePath();
      const g = ctx.createRadialGradient(8, -4, 2, 4, 0, 22);
      g.addColorStop(0, "#fff0fb");
      g.addColorStop(0.5, "#f5a8e8");
      g.addColorStop(1, "#a77bff");
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.92;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = withAlpha("#ffffff", 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = withAlpha("#ffffff", 0.55);
      for (const [cx, cy] of [[2, -6], [2, 6], [-1, 0]]) {
        ctx.beginPath();
        ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      eye(ctx, 11, -3, 3.4, dead);
      return;
    }
    case "maple-seed": {
      // A samara: the nut leads and its single veined wing whirls round behind it.
      const spin = animate ? now / 70 + wing * 3 : 0.8;
      ctx.save();
      ctx.translate(5, 0);
      ctx.rotate(-0.28);
      ctx.scale(1, Math.cos(spin) * 0.85 + (Math.cos(spin) < 0 ? -0.15 : 0.15));
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.bezierCurveTo(-10, -15, -27, -13, -31, -4);
      ctx.bezierCurveTo(-27, 2, -12, 4, 0, 3);
      ctx.closePath();
      ctx.fillStyle = "#dba552";
      ctx.fill();
      ctx.strokeStyle = "#a8702a";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      for (let v = 0; v < 5; v += 1) {
        ctx.moveTo(0, 1);
        ctx.lineTo(-10 - v * 4, -10 + v * 2.4);
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#7f5226";
      ctx.beginPath();
      ctx.ellipse(7, 0, 10, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#ffffff", 0.25);
      ctx.beginPath();
      ctx.ellipse(5, -4, 5, 2.2, -0.2, 0, Math.PI * 2);
      ctx.fill();
      eye(ctx, 11, -1, 3.4, dead);
      return;
    }
    case "owl": {
      ctx.fillStyle = "#9a6a42";
      ctx.beginPath();
      ctx.ellipse(0, 1, 16, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ead6ae";
      ctx.beginPath();
      ctx.ellipse(4, 6, 9, 8.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#a8794a";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      for (const [cx, cy] of [[1, 5], [6, 5], [3.5, 9], [8.5, 9]]) {
        ctx.moveTo(cx - 1.6, cy - 1);
        ctx.lineTo(cx, cy + 0.6);
        ctx.lineTo(cx + 1.6, cy - 1);
      }
      ctx.stroke();
      ctx.save();
      ctx.translate(-6, 2);
      ctx.rotate(-0.2 - wing * 0.9);
      ctx.fillStyle = "#7a5032";
      ctx.beginPath();
      ctx.ellipse(-5, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#7a5032";
      ctx.beginPath();
      ctx.moveTo(1, -12);
      ctx.lineTo(2, -19);
      ctx.lineTo(7, -13);
      ctx.moveTo(10, -12);
      ctx.lineTo(15, -18);
      ctx.lineTo(15, -10);
      ctx.fill();
      for (const ex of [4.5, 12.5]) {
        ctx.fillStyle = "#ffb43a";
        ctx.beginPath();
        ctx.arc(ex, -4, 5.2, 0, Math.PI * 2);
        ctx.fill();
        eye(ctx, ex, -4, 3.8, dead);
      }
      ctx.fillStyle = "#f0a030";
      ctx.beginPath();
      ctx.moveTo(7.2, 0);
      ctx.lineTo(9.8, 0);
      ctx.lineTo(8.5, 4);
      ctx.closePath();
      ctx.fill();
      return;
    }
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
    case "notes": {
      const colors = ["#ffd23f", "#ff7ad9", "#7ad9ff"];
      pts.forEach((p, i) => {
        if (i % 5 !== 2) return;
        const k = 1 - i / n;
        const s = 6.5 * (0.6 + k * 0.4);
        const x = p.x;
        const y = p.y + (subtle ? 0 : Math.sin(now / 200 + i) * 4 - (1 - k) * 12);
        ctx.globalAlpha = k;
        ctx.fillStyle = colors[((i / 5) | 0) % 3];
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.ellipse(x, y, s * 0.55, s * 0.4, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + s * 0.48, y - s * 0.1);
        ctx.lineTo(x + s * 0.48, y - s * 1.7);
        ctx.quadraticCurveTo(x + s * 1.2, y - s * 1.3, x + s * 1.05, y - s * 0.7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
      return;
    }
    case "feathers":
      pts.forEach((p, i) => {
        if (i % 6 !== 3) return;
        const k = 1 - i / n;
        const rock = subtle ? 0.4 : Math.sin(now / 280 + i) * 0.7;
        ctx.save();
        ctx.translate(p.x, p.y + (subtle ? 0 : (1 - k) * 16));
        ctx.rotate(rock + 0.3);
        ctx.globalAlpha = k * 0.95;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(-8, 0);
        ctx.quadraticCurveTo(-2, -4.5, 8, -0.5);
        ctx.quadraticCurveTo(-2, 4, -8, 0);
        ctx.fill();
        ctx.strokeStyle = "#b8b0c8";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(-10, 0.5);
        ctx.lineTo(8, -0.5);
        ctx.moveTo(-2, -2.8);
        ctx.lineTo(0, -0.4);
        ctx.moveTo(2, 2.4);
        ctx.lineTo(3, 0);
        ctx.stroke();
        ctx.restore();
      });
      return;
    case "paint-splats": {
      const paints = ["#00b4d8", "#ff006e", "#ffbe0b", "#7b2cbf"];
      for (let i = 1; i < n; i += 1) {
        const k = 1 - i / n;
        ctx.strokeStyle = withAlpha(paints[Math.floor(i / 6) % paints.length], k);
        ctx.lineWidth = 7 * k + 1;
        strokeThrough(ctx, [pts[i - 1], pts[i]]);
        ctx.stroke();
      }
      pts.forEach((p, i) => {
        if (i % 6 !== 5) return;
        const k = 1 - i / n;
        ctx.fillStyle = withAlpha(paints[Math.floor(i / 6) % paints.length], k);
        for (let b = 0; b < 5; b += 1) {
          const a = hash(i * 7 + b) * Math.PI * 2;
          const d = 4 + hash(i * 3 + b) * 6;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 1.4 + hash(b + i) * 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!subtle) {
          const drip = (1 - k) * 14;
          ctx.fillRect(p.x - 1.2, p.y, 2.4, drip);
          ctx.beginPath();
          ctx.arc(p.x, p.y + drip, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });
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

// ---------------------------------------------------------------------------
// Art styles: a pass over the finished frame
// ---------------------------------------------------------------------------

let styleBuffer: HTMLCanvasElement | null = null;
const textures = new Map<string, HTMLCanvasElement>();

/** A small cached texture canvas (noise, paper, halftone) built once per kind. */
function texture(key: string, size: number, paint: (c: Ctx, size: number) => void) {
  let canvas = textures.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext("2d");
    if (c) paint(c, size);
    textures.set(key, canvas);
  }
  return canvas;
}

const grain = (c: Ctx, size: number) => {
  const img = c.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const v = Math.floor(hash(i * 7 + 3) * 255);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
};

const paper = (c: Ctx, size: number) => {
  c.fillStyle = "#f4ead6";
  c.fillRect(0, 0, size, size);
  // Blotchy pigment pooling and paper fibres.
  for (let i = 0; i < 26; i += 1) {
    const g = c.createRadialGradient(hash(i) * size, hash(i * 3) * size, 0, hash(i) * size, hash(i * 3) * size, 20 + hash(i * 5) * 60);
    g.addColorStop(0, `rgb(200 175 140 / ${0.12 + hash(i * 9) * 0.12})`);
    g.addColorStop(1, "rgb(200 175 140 / 0)");
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  c.strokeStyle = "rgb(150 120 90 / 0.18)";
  c.lineWidth = 0.6;
  c.beginPath();
  for (let i = 0; i < 160; i += 1) {
    const x = hash(i * 11) * size;
    const y = hash(i * 13) * size;
    const a = hash(i * 17) * Math.PI;
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6);
  }
  c.stroke();
};

const halftone = (c: Ctx, size: number) => {
  c.fillStyle = "#ffffff";
  c.fillRect(0, 0, size, size);
  c.fillStyle = "#3a2a6a";
  const step = size / 4;
  for (let y = 0; y < 4; y += 1)
    for (let x = 0; x < 4; x += 1) {
      c.beginPath();
      c.arc((x + (y % 2 ? 0.5 : 0)) * step, y * step + step / 2, step * 0.22, 0, Math.PI * 2);
      c.arc((x + (y % 2 ? 0.5 : 0)) * step + step, y * step + step / 2, step * 0.22, 0, Math.PI * 2);
      c.fill();
    }
};

/**
 * Re-renders the world rect (x, y, w, h in the current transform) in the equipped art style. Call it
 * after the world is drawn and before HUD text, so the score stays crisp. A no-op for the default.
 */
export function applyFlutterStyle(ctx: Ctx, theme: FlutterTheme, x: number, y: number, w: number, h: number, now: number, animate: boolean) {
  const style = theme.style;
  if (!style || typeof document === "undefined") return;
  const m = ctx.getTransform();
  const dx = m.e + x * m.a;
  const dy = m.f + y * m.d;
  const dw = w * m.a;
  const dh = h * m.d;
  const unit = m.a;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  const fill = (op: GlobalCompositeOperation, color: string | CanvasGradient | CanvasPattern, alpha = 1) => {
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(dx, dy, dw, dh);
  };
  const pattern = (canvas: HTMLCanvasElement, scale: number, ox = 0, oy = 0) => {
    const p = ctx.createPattern(canvas, "repeat");
    p?.setTransform(new DOMMatrix().translate(dx + ox, dy + oy).scale(scale, scale));
    return p;
  };

  switch (style) {
    case "pixel": {
      // Sample the frame down to a coarse grid, then blow it back up with hard edges.
      const pw = Math.max(1, Math.round(w / 4));
      const ph = Math.max(1, Math.round(h / 4));
      styleBuffer ??= document.createElement("canvas");
      if (styleBuffer.width !== pw || styleBuffer.height !== ph) {
        styleBuffer.width = pw;
        styleBuffer.height = ph;
      }
      const b = styleBuffer.getContext("2d");
      if (b) {
        b.imageSmoothingEnabled = true;
        b.clearRect(0, 0, pw, ph);
        b.drawImage(ctx.canvas, dx, dy, dw, dh, 0, 0, pw, ph);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(styleBuffer, 0, 0, pw, ph, dx, dy, dw, dh);
      }
      break;
    }
    case "silent-film": {
      fill("saturation", "#808080");
      fill("color", "#a8865a", 0.4);
      fill("multiply", "#efe2c8");
      const jitter = animate ? Math.floor(now / 70) : 0;
      const noise = texture("grain", 128, grain);
      const grainPattern = pattern(noise, unit * 0.9, hash(jitter) * 128, hash(jitter * 3) * 128);
      if (grainPattern) fill("overlay", grainPattern, 0.22);
      const vignette = ctx.createRadialGradient(dx + dw / 2, dy + dh / 2, Math.min(dw, dh) * 0.3, dx + dw / 2, dy + dh / 2, Math.max(dw, dh) * 0.72);
      vignette.addColorStop(0, "rgb(255 255 255)");
      vignette.addColorStop(1, "rgb(70 52 34)");
      fill("multiply", vignette);
      if (animate) {
        // A gentle exposure flicker and a couple of passing scratches.
        fill("source-over", "#1a1208", 0.03 + hash(jitter * 5) * 0.04);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = "#f6ecd6";
        ctx.lineWidth = Math.max(1, unit * 1.2);
        ctx.beginPath();
        for (let s = 0; s < 2; s += 1) {
          if (hash(jitter * 7 + s) < 0.5) continue;
          const sx = dx + hash(jitter * 11 + s) * dw;
          ctx.moveTo(sx, dy);
          ctx.lineTo(sx + (hash(jitter + s) - 0.5) * unit * 10, dy + dh);
        }
        ctx.stroke();
      }
      break;
    }
    case "blueprint": {
      fill("difference", "#ffffff");
      fill("color", "#1f5fbf");
      fill("multiply", "#bcd4ff");
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1, unit * 0.8);
      ctx.strokeStyle = "rgb(220 235 255 / 0.12)";
      ctx.beginPath();
      for (let gx = 0; gx <= w; gx += 20) {
        ctx.moveTo(dx + gx * unit, dy);
        ctx.lineTo(dx + gx * unit, dy + dh);
      }
      for (let gy = 0; gy <= h; gy += 20) {
        ctx.moveTo(dx, dy + gy * unit);
        ctx.lineTo(dx + dw, dy + gy * unit);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgb(230 242 255 / 0.25)";
      ctx.beginPath();
      for (let gx = 0; gx <= w; gx += 100) {
        ctx.moveTo(dx + gx * unit, dy);
        ctx.lineTo(dx + gx * unit, dy + dh);
      }
      for (let gy = 0; gy <= h; gy += 100) {
        ctx.moveTo(dx, dy + gy * unit);
        ctx.lineTo(dx + dw, dy + gy * unit);
      }
      ctx.stroke();
      // A drafting title block in the corner.
      const bw = 128 * unit;
      const bh = 30 * unit;
      const bx = dx + dw - bw - 8 * unit;
      const by = dy + dh - bh - 8 * unit;
      ctx.strokeStyle = "rgb(235 245 255 / 0.75)";
      ctx.lineWidth = Math.max(1, unit);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.beginPath();
      ctx.moveTo(bx, by + bh / 2);
      ctx.lineTo(bx + bw, by + bh / 2);
      ctx.stroke();
      ctx.fillStyle = "rgb(235 245 255 / 0.85)";
      ctx.font = `600 ${Math.round(9 * unit)}px ui-monospace, monospace`;
      ctx.textBaseline = "middle";
      ctx.fillText("FLUTTER  Mk.I", bx + 6 * unit, by + bh / 4);
      ctx.fillText("SCALE 1:1  SHEET 01", bx + 6 * unit, by + (bh * 3) / 4);
      break;
    }
    case "watercolor": {
      fill("saturation", "hsl(30 40% 50%)", 0.45);
      fill("soft-light", "#ffe7c4", 0.5);
      const sheet = pattern(texture("paper", 256, paper), unit * 1.2);
      if (sheet) fill("multiply", sheet);
      // Pigment gathers at the edges of the page.
      const edge = ctx.createRadialGradient(dx + dw / 2, dy + dh / 2, Math.min(dw, dh) * 0.35, dx + dw / 2, dy + dh / 2, Math.max(dw, dh) * 0.7);
      edge.addColorStop(0, "rgb(255 250 240 / 0)");
      edge.addColorStop(1, "rgb(250 240 222 / 0.55)");
      fill("source-over", edge);
      break;
    }
    case "pop-art": {
      fill("saturation", "hsl(0 100% 50%)", 0.45);
      const dots = pattern(texture("halftone", 32, halftone), unit * 0.75);
      if (dots) fill("multiply", dots, 0.28);
      break;
    }
  }
  ctx.restore();
}
