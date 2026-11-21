"use client";

import type { GameLook } from "@/lib/game-cosmetics";
import { mix, withAlpha } from "./engine";
import { GAME_PALETTES } from "./palettes";

/**
 * Gem Chase cosmetics: the Gem's colors, maze materials, pickup sparks and shade colors.
 * Drawing only: sizes, hitboxes and the frightened-shade colors never change.
 */

type Ctx = CanvasRenderingContext2D;

export type SparkShape = "square" | "star" | "ring" | "petal" | "heart" | "flake" | "confetti" | "coin" | "note" | "leaf";
export type GemArtStyle = "" | "pixel" | "cartoon" | "paper" | "wireframe" | "chalk";
const ART_STYLES: readonly GemArtStyle[] = ["pixel", "cartoon", "paper", "wireframe", "chalk"];
export type ShadeKind = "" | "slime" | "lantern" | "sheet";
type GemPattern = "" | "molten" | "galaxy" | "sugar";
type MazeTexture = "" | "hedge" | "icing" | "sandstone";
/** Chalkboard slate and chalk. */
const SLATE = "#22362c";
const CHALK = "#eef2ea";
const INK = "#120a24";

export type GemChaseTheme = {
  key: string;
  style: GemArtStyle;
  gem: { light: string; mid: string; edge: string; glow: string; shimmer: boolean; pattern?: GemPattern };
  maze: { background: string; surface: string; wall: string; floor: string; glimmer: string; foreground: string; texture?: MazeTexture };
  collect: { shape: SparkShape; colors: string[] | null };
  shades: string[];
  shadeKind: ShadeKind;
};

const base = GAME_PALETTES["gem-chase"];

const GEMS: Record<string, GemChaseTheme["gem"]> = {
  "": { light: "#ffffff", mid: base.accent2, edge: base.accent, glow: base.accent2, shimmer: false },
  ruby: { light: "#ffe3ea", mid: "#ff3d6e", edge: "#8a0f3a", glow: "#ff3d6e", shimmer: false },
  sapphire: { light: "#e6f4ff", mid: "#3d8bff", edge: "#14267a", glow: "#5fa8ff", shimmer: false },
  emerald: { light: "#e9fff1", mid: "#2fe08a", edge: "#0b6b48", glow: "#3dff9e", shimmer: false },
  opal: { light: "#ffffff", mid: "#ffd1f2", edge: "#7fd8ff", glow: "#ffffff", shimmer: true },
  aquamarine: { light: "#e8fffb", mid: "#3fe6d0", edge: "#0c6f73", glow: "#5ff5e0", shimmer: false },
  amethyst: { light: "#f6ecff", mid: "#b46bff", edge: "#4b1a8f", glow: "#c99bff", shimmer: false },
  diamond: { light: "#ffffff", mid: "#e9f6ff", edge: "#8fb8d8", glow: "#ffffff", shimmer: false },
  molten: { light: "#6a4a40", mid: "#3a2420", edge: "#160c0a", glow: "#ff7a2e", shimmer: false, pattern: "molten" },
  galaxy: { light: "#b48cff", mid: "#3a1f7a", edge: "#120838", glow: "#9f7bff", shimmer: false, pattern: "galaxy" },
  gumdrop: { light: "#ffe0ef", mid: "#ff5fa8", edge: "#b2216a", glow: "#ff8fc4", shimmer: false, pattern: "sugar" },
};

const MAZES: Record<string, GemChaseTheme["maze"]> = {
  "": { background: base.background, surface: base.surface, wall: base.accent, floor: base.accent, glimmer: base.accent2, foreground: base.foreground },
  "neon-grid": { background: "#03060f", surface: "#071a2e", wall: "#39f3ff", floor: "#ff3df2", glimmer: "#fff36b", foreground: "#e8fdff" },
  "rose-quartz": { background: "#1d0a14", surface: "#5c2340", wall: "#ffa3c8", floor: "#ffc2d9", glimmer: "#fff1c9", foreground: "#fff0f6" },
  "obsidian-gold": { background: "#050505", surface: "#1b1712", wall: "#e8b33f", floor: "#e8b33f", glimmer: "#fff0b8", foreground: "#fff8e6" },
  jade: { background: "#04140f", surface: "#0f4a38", wall: "#57e3a8", floor: "#9cf5cf", glimmer: "#ffe08a", foreground: "#effff7" },
  glacier: { background: "#06101f", surface: "#1d3f63", wall: "#bfe9ff", floor: "#8fd3ff", glimmer: "#ffffff", foreground: "#f0faff" },
  circuit: { background: "#03120a", surface: "#0b3a22", wall: "#3dff7a", floor: "#c9a24a", glimmer: "#ffd36b", foreground: "#eaffef" },
  "lava-forge": { background: "#120604", surface: "#3a1610", wall: "#ff7a2e", floor: "#ffb36b", glimmer: "#fff1a8", foreground: "#fff3e8" },
  hedge: { background: "#2b2418", surface: "#2f6a2a", wall: "#8fd46a", floor: "#c9b88a", glimmer: "#fff6b0", foreground: "#f4f8ea", texture: "hedge" },
  gingerbread: { background: "#2a140a", surface: "#a8612a", wall: "#fff6ee", floor: "#e8a868", glimmer: "#ff6fa8", foreground: "#fff6ee", texture: "icing" },
  tomb: { background: "#140e08", surface: "#c69a5a", wall: "#ffd27a", floor: "#d8b07a", glimmer: "#7fe8ff", foreground: "#fff2dc", texture: "sandstone" },
};

const COLLECTS: Record<string, GemChaseTheme["collect"]> = {
  "": { shape: "square", colors: null },
  stardust: { shape: "star", colors: ["#fff6c2", "#ffd84a", "#ffffff"] },
  bubbles: { shape: "ring", colors: ["#9fe9ff", "#c7f7ff", "#7fb8ff"] },
  petals: { shape: "petal", colors: ["#ffb3d1", "#ff8fbf", "#fff0f6"] },
  prism: { shape: "square", colors: ["#ff5f8f", "#ffae4f", "#fff36b", "#7dff9a", "#5fe3ff", "#b48cff"] },
  hearts: { shape: "heart", colors: ["#ff5f8f", "#ff9ab8", "#ffd1e0"] },
  snowflakes: { shape: "flake", colors: ["#ffffff", "#cfefff", "#9fdcff"] },
  confetti: { shape: "confetti", colors: ["#ff5f8f", "#ffd84a", "#5fe3ff", "#7dff9a", "#c38bff"] },
  coins: { shape: "coin", colors: ["#ffd84a", "#ffb02e", "#fff2a8"] },
  notes: { shape: "note", colors: ["#5fe3ff", "#ff8fd8", "#fff36b"] },
  leaves: { shape: "leaf", colors: ["#7dff6a", "#c4e84a", "#ffc84a"] },
};

/** Every palette keeps four clearly different hues and avoids the frightened blue. */
const SHADES: Record<string, string[]> = {
  "": ["#ff5f8f", "#5fe3ff", "#7dff9a", "#ffae4f"],
  pastel: ["#ffb3c7", "#b3f0ff", "#c6ffb3", "#ffe0a3"],
  sunset: ["#ff4d4d", "#ff9a3d", "#ffd93d", "#ff6fcf"],
  candy: ["#ff6fb5", "#5ff0d0", "#c38bff", "#ffdd57"],
  toxic: ["#b6ff3d", "#ff3df2", "#3dffd6", "#ff8a3d"],
  arcade: ["#ff2b2b", "#ffb8ff", "#00f0ff", "#ffb852"],
  jewel: ["#ff2e6e", "#3ddc84", "#ffc30b", "#c084ff"],
  aurora: ["#6bffb8", "#d49bff", "#ff8fd8", "#fff27a"],
  slime: ["#9cff3d", "#3dffc8", "#c06bff", "#ff9a3d"],
  lanterns: ["#ff4a3a", "#ffb03a", "#ff6fa0", "#ffe14a"],
  bedsheets: ["#ffc4d8", "#c4f0e0", "#e0d0ff", "#fff0b8"],
};
const SHADE_KINDS: Record<string, ShadeKind> = { slime: "slime", lanterns: "lantern", bedsheets: "sheet" };

export function gemChaseTheme(look: GameLook): GemChaseTheme {
  const gem = look.gem ?? "";
  const maze = look.maze ?? "";
  const collect = look.collect ?? "";
  const shades = look.shades ?? "";
  const style = ART_STYLES.find((s) => s === look.style) ?? "";
  let mazeLook = MAZES[maze] ?? MAZES[""];
  if (style === "chalk") {
    // Everything is drawn in chalk on a green slate; the maze's colours tint the chalk.
    mazeLook = { ...mazeLook, background: SLATE, surface: mix(SLATE, mazeLook.surface, 0.2), wall: mix(mazeLook.wall, CHALK, 0.55), glimmer: mix(mazeLook.glimmer, CHALK, 0.4), foreground: CHALK };
  }
  return {
    key: [gem, maze, collect, shades, style].join("|"),
    style,
    gem: GEMS[gem] ?? GEMS[""],
    maze: mazeLook,
    collect: COLLECTS[collect] ?? COLLECTS[""],
    shades: SHADES[shades] ?? SHADES[""],
    shadeKind: SHADE_KINDS[shades] ?? "",
  };
}

/** Draws the Gem centered at the origin, facing +x, with its mouth `open` radians wide. */
export function drawGemBody(ctx: Ctx, theme: GemChaseTheme, r: number, open: number, now: number, animate: boolean) {
  const g = theme.gem;
  const mid = g.shimmer && animate ? `hsl(${(now / 12) % 360} 90% 82%)` : g.mid;
  const edge = g.shimmer && animate ? `hsl(${(now / 12 + 140) % 360} 80% 66%)` : g.edge;
  const gemPath = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, open, Math.PI * 2 - open);
    ctx.closePath();
  };
  if (theme.style === "chalk") {
    // Chalk: a dusty outline and scribbled hatching, the gem's colour as the chalk.
    gemPath();
    ctx.fillStyle = withAlpha(mid, 0.18);
    ctx.fill();
    ctx.save();
    gemPath();
    ctx.clip();
    ctx.strokeStyle = withAlpha(mid, 0.75);
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.beginPath();
    for (let k = -r * 2; k < r * 2; k += r * 0.32) {
      ctx.moveTo(k, -r);
      ctx.lineTo(k + r * 1.2, r);
    }
    ctx.stroke();
    ctx.restore();
    chalkStroke(ctx, gemPath, mid, Math.max(1.4, r * 0.16));
    gemPattern(ctx, g.pattern, gemPath, r, now, animate);
    return;
  }
  if (theme.style === "pixel") {
    const cell = Math.max(1.5, r / 3.5);
    const n = Math.ceil(r / cell);
    for (let i = -n; i < n; i += 1) {
      for (let j = -n; j < n; j += 1) {
        const cx = (i + 0.5) * cell;
        const cy = (j + 0.5) * cell;
        const d = Math.hypot(cx, cy);
        if (d > r || (d > cell * 0.5 && Math.abs(Math.atan2(cy, cx)) < open)) continue;
        const fleck = g.pattern && ((i * 7 + j * 13) & 7) === 0;
        ctx.fillStyle = fleck ? (g.pattern === "molten" ? "#ffb02e" : g.pattern === "galaxy" ? "#ffffff" : "#fff6fb") : d > r - cell * 1.1 ? edge : cx < 0 && cy < 0 && d < r * 0.6 ? g.light : mid;
        ctx.fillRect(i * cell, j * cell, cell + 0.3, cell + 0.3);
      }
    }
    return;
  }
  if (theme.style === "cartoon" || theme.style === "paper") {
    const paper = theme.style === "paper";
    if (paper) castShadow(ctx, r * 0.2);
    gemPath();
    ctx.fillStyle = mid;
    ctx.fill();
    clearShadow(ctx);
    ctx.fillStyle = paper ? withAlpha("#ffffff", 0.35) : g.light;
    ctx.beginPath();
    if (paper) {
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, Math.PI, Math.PI * 1.5);
      ctx.closePath();
    } else ctx.ellipse(-r * 0.3, -r * 0.45, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
    ctx.fill();
    gemPattern(ctx, g.pattern, gemPath, r, now, animate);
    if (!paper) {
      gemPath();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, r * 0.2);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    return;
  }
  if (theme.style === "wireframe") {
    gemPath();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = mid;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = mid;
    ctx.lineWidth = Math.max(1.2, r * 0.16);
    ctx.lineJoin = "round";
    ctx.shadowColor = g.glow;
    ctx.shadowBlur = animate ? 10 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    for (const a of [Math.PI * 0.55, Math.PI, Math.PI * 1.45]) {
      ctx.moveTo(-r * 0.15, 0);
      ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    gemPattern(ctx, g.pattern, gemPath, r, now, animate);
    return;
  }
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, g.light);
  body.addColorStop(0.35, mid);
  body.addColorStop(1, edge.startsWith("#") ? withAlpha(edge, 0.95) : edge);
  ctx.fillStyle = body;
  ctx.shadowColor = g.glow;
  ctx.shadowBlur = animate ? 14 : 0;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, open, Math.PI * 2 - open);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  gemPattern(ctx, g.pattern, gemPath, r, now, animate);
  // Facet lines make the round body read as a cut gem.
  ctx.strokeStyle = withAlpha("#ffffff", 0.35);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const a of [Math.PI * 0.55, Math.PI, Math.PI * 1.45]) {
    ctx.moveTo(-r * 0.15, 0);
    ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
  }
  ctx.stroke();
  ctx.strokeStyle = withAlpha("#ffffff", 0.6);
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.5, open, Math.PI * 2 - open);
  ctx.stroke();
  ctx.fillStyle = withAlpha("#ffffff", 0.7);
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.75);
  ctx.lineTo(r * 0.25, -r * 0.45);
  ctx.lineTo(-r * 0.35, -r * 0.2);
  ctx.closePath();
  ctx.fill();
}

/** The gem's own surface pattern, clipped to the body: lava cracks, a star swirl or sugar crystals. */
function gemPattern(ctx: Ctx, pattern: GemPattern | undefined, path: () => void, r: number, now: number, animate: boolean) {
  if (!pattern) return;
  ctx.save();
  path();
  ctx.clip();
  if (pattern === "molten") {
    const pulse = animate ? 0.7 + 0.3 * Math.sin(now / 260) : 0.9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [w, color] of [[r * 0.32, withAlpha("#ff5a1a", 0.35 * pulse)], [r * 0.1, withAlpha("#ffd36a", pulse)]] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.8, w);
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, -r * 0.2);
      ctx.lineTo(-r * 0.35, -r * 0.05);
      ctx.lineTo(-r * 0.1, -r * 0.55);
      ctx.moveTo(-r * 0.35, -r * 0.05);
      ctx.lineTo(-r * 0.25, r * 0.6);
      ctx.moveTo(-r * 0.1, -r * 0.55);
      ctx.lineTo(r * 0.3, -r * 0.9);
      ctx.stroke();
    }
  } else if (pattern === "galaxy") {
    const spin = animate ? now / 1600 : 0.5;
    for (let i = 0; i < 14; i += 1) {
      const a = spin + i * 0.9;
      const d = r * (0.12 + (i / 14) * 0.8);
      ctx.fillStyle = withAlpha(i % 3 ? "#ffffff" : "#ffd1f2", 0.5 + (i % 4) * 0.12);
      ctx.fillRect(Math.cos(a) * d - 0.7, Math.sin(a) * d - 0.7, i % 5 ? 1.2 : 2, i % 5 ? 1.2 : 2);
    }
    const swirl = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    swirl.addColorStop(0, withAlpha("#ffb3f2", 0.45));
    swirl.addColorStop(1, withAlpha("#ffb3f2", 0));
    ctx.fillStyle = swirl;
    ctx.fillRect(-r, -r, r * 2, r * 2);
  } else {
    for (let i = 0; i < 18; i += 1) {
      const a = i * 2.39;
      const d = r * Math.sqrt((i + 0.5) / 18) * 0.92;
      const tw = animate ? 0.5 + 0.5 * Math.sin(now / 150 + i * 1.7) : 0.8;
      ctx.fillStyle = withAlpha("#ffffff", 0.35 + tw * 0.55);
      ctx.fillRect(Math.cos(a) * d - 0.6, Math.sin(a) * d - 0.6, 1.2, 1.2);
    }
  }
  ctx.restore();
}

/** A dusty chalk line: a wide faint pass, then a broken, slightly offset stroke. */
function chalkStroke(ctx: Ctx, path: () => void, color: string, width: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  path();
  ctx.strokeStyle = withAlpha(color, 0.25);
  ctx.lineWidth = width * 1.8;
  ctx.stroke();
  ctx.setLineDash([width * 3, width * 0.6, width * 1.5, width * 0.5]);
  ctx.strokeStyle = withAlpha(color, 0.9);
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Offsets a hard drop shadow in screen space, so it falls the same way however the shape is rotated. */
function castShadow(ctx: Ctx, distance: number) {
  const m = ctx.getTransform();
  const d = distance * Math.hypot(m.a, m.b);
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = d;
  ctx.shadowOffsetY = d;
}

function clearShadow(ctx: Ctx) {
  ctx.shadowColor = "transparent";
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/** Ghost-shaped shade body (no eyes) in `color`. */
export function drawShadeBody(ctx: Ctx, x: number, y: number, r: number, color: string, wave: number, animate: boolean, style: GemArtStyle = "", kind: ShadeKind = "") {
  paintShadeBody(ctx, x, y, r, color, wave, animate, style);
  if (kind && style !== "pixel") shadeKindDetail(ctx, kind, x, y, r, color, wave, animate);
}

/** Extra shape details for a shade set: slime drips, lantern ribs and a glow, or bedsheet folds. */
function shadeKindDetail(ctx: Ctx, kind: ShadeKind, x: number, y: number, r: number, color: string, wave: number, animate: boolean) {
  ctx.save();
  if (kind === "slime") {
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i += 1) {
      const dx = x - r * 0.6 + i * r * 0.6;
      const len = r * (0.25 + ((i * 7) % 3) * 0.12) + (animate ? Math.abs(wave) * 0.8 : 0);
      ctx.beginPath();
      ctx.ellipse(dx, y + r + len * 0.5, r * 0.1, len * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = withAlpha("#ffffff", 0.55);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.45, y - r * 0.55, r * 0.18, r * 0.1, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "lantern") {
    const glow = ctx.createRadialGradient(x, y + r * 0.2, 0, x, y + r * 0.2, r * 0.9);
    glow.addColorStop(0, withAlpha("#fff2b0", 0.55));
    glow.addColorStop(1, withAlpha("#fff2b0", 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.strokeStyle = withAlpha("#5a1a0a", 0.45);
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.beginPath();
    for (const k of [-0.55, 0, 0.55]) {
      ctx.moveTo(x + k * r, y - r * 1.05);
      ctx.quadraticCurveTo(x + k * r * 1.35, y + r * 0.1, x + k * r, y + r * 0.9);
    }
    ctx.stroke();
    ctx.fillStyle = "#3a1a0a";
    ctx.fillRect(x - r * 0.35, y - r * 1.2, r * 0.7, r * 0.14);
  } else if (kind === "sheet") {
    ctx.strokeStyle = withAlpha("#000000", 0.14);
    ctx.lineWidth = Math.max(0.8, r * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y + r * 0.1);
    ctx.quadraticCurveTo(x - r * 0.45, y + r * 0.6, x - r * 0.6, y + r * 0.85);
    ctx.moveTo(x + r * 0.5, y);
    ctx.quadraticCurveTo(x + r * 0.62, y + r * 0.5, x + r * 0.48, y + r * 0.8);
    ctx.stroke();
    ctx.fillStyle = withAlpha("#ffffff", 0.75);
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(x - r + (i + 0.5) * (r * 0.4), y + r * 0.82 + (i % 2 ? wave * 0.5 : 0), r * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function paintShadeBody(ctx: Ctx, x: number, y: number, r: number, color: string, wave: number, animate: boolean, style: GemArtStyle) {
  const feet = 4;
  const outline = () => {
    ctx.beginPath();
    ctx.arc(x, y - r * 0.15, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r);
    for (let i = feet; i >= 0; i -= 1) {
      const fx = x - r + (2 * r * i) / feet;
      ctx.lineTo(fx, y + r - (i % 2 ? r * 0.35 + wave : 0));
    }
    ctx.closePath();
  };
  if (style === "pixel") {
    const cell = Math.max(1.5, r / 3.5);
    const n = Math.ceil(r / cell);
    const top = y - r * 0.15;
    for (let i = -n; i < n; i += 1) {
      for (let j = -n - 1; j < n; j += 1) {
        const cx = (i + 0.5) * cell;
        const cy = y + (j + 0.5) * cell;
        if (Math.abs(cx) > r || cy > y + r) continue;
        if (cy < top && Math.hypot(cx, cy - top) > r) continue;
        // Notched feet: skip alternate columns on the bottom row.
        if (cy > y + r - cell && Math.floor((cx + r) / (r / 2)) % 2 === 1) continue;
        ctx.fillStyle = cy < top - r * 0.55 ? withAlpha("#ffffff", 0.85) : color;
        ctx.fillRect(x + i * cell, y + j * cell, cell + 0.3, cell + 0.3);
      }
    }
    return;
  }
  if (style === "cartoon" || style === "paper") {
    if (style === "paper") castShadow(ctx, r * 0.2);
    outline();
    ctx.fillStyle = color;
    ctx.fill();
    clearShadow(ctx);
    if (style === "cartoon") {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1.5, r * 0.18);
      ctx.lineJoin = "round";
      ctx.stroke();
    }
    return;
  }
  if (style === "chalk") {
    outline();
    ctx.fillStyle = withAlpha(color, 0.16);
    ctx.fill();
    chalkStroke(ctx, outline, color, Math.max(1.3, r * 0.14));
    return;
  }
  if (style === "wireframe") {
    outline();
    ctx.fillStyle = withAlpha(color, 0.2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, r * 0.15);
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = animate ? 8 : 0;
    ctx.stroke();
    ctx.shadowBlur = 0;
    return;
  }
  const body = ctx.createLinearGradient(x, y - r, x, y + r);
  body.addColorStop(0, withAlpha("#ffffff", 0.85));
  body.addColorStop(0.18, color);
  body.addColorStop(1, withAlpha(color, 0.7));
  ctx.fillStyle = body;
  ctx.shadowColor = color;
  ctx.shadowBlur = animate ? 10 : 0;
  outline();
  ctx.fill();
  ctx.shadowBlur = 0;
}

/** Paints one spark; `t` runs 0→1 over its life. Call with "lighter" compositing. */
export function drawSpark(ctx: Ctx, shape: SparkShape, x: number, y: number, size: number, color: string, t: number, spin: number, style: GemArtStyle = "") {
  const alpha = 1 - t;
  if (shape === "square" || style === "pixel") {
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin + t * 3);
  if (shape === "ring") {
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, size * (0.8 + t * 1.2), 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === "petal") {
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.3, size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "heart") {
    const s = size * 1.2;
    ctx.rotate(-(spin + t * 3));
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.9);
    ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.4, -s * 0.1, 0, s * 0.9);
    ctx.fill();
  } else if (shape === "flake") {
    const s = size * 1.5;
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = (i * Math.PI) / 3;
      ctx.moveTo(-Math.cos(a) * s, -Math.sin(a) * s);
      ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
    }
    ctx.stroke();
  } else if (shape === "coin") {
    ctx.rotate(-(spin + t * 3));
    const flip = Math.abs(Math.cos(t * 14 + spin));
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.2 * flip + 0.4, size * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha("#fff8d0", alpha);
    ctx.fillRect(-0.5, -size * 0.6, 1, size * 1.2);
  } else if (shape === "note") {
    ctx.rotate(-(spin + t * 3));
    const s = size * 1.4;
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.strokeStyle = withAlpha(color, alpha);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.4, s * 0.45, s * 0.32, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.4, s * 0.35);
    ctx.lineTo(s * 0.4, -s * 0.9);
    ctx.lineTo(s * 0.95, -s * 0.55);
    ctx.stroke();
  } else if (shape === "leaf") {
    const s = size * 1.5;
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, -s * 0.7, s, 0);
    ctx.quadraticCurveTo(0, s * 0.7, -s, 0);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#1a3a10", alpha * 0.5);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.lineTo(s * 0.8, 0);
    ctx.stroke();
  } else if (shape === "confetti") {
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.scale(1, Math.cos(t * 12 + spin));
    ctx.fillRect(-size * 0.9, -size * 0.45, size * 1.8, size * 0.9);
  } else {
    const s = size * 1.4;
    ctx.fillStyle = withAlpha(color, alpha);
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i * Math.PI) / 4;
      const d = i % 2 ? s * 0.35 : s;
      ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Renders the maze walls and floor checker into `g` (already scaled to world units). */
export function paintMaze(g: Ctx, grid: string[][], tile: number, maze: GemChaseTheme["maze"], color: string, solid: (x: number, y: number) => boolean, style: GemArtStyle = "") {
  const edges = new Path2D();
  if (style === "paper") castShadow(g, 3);
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      const c = grid[y][x];
      const px = x * tile;
      const py = y * tile;
      if (c !== "#") {
        if (c !== " " && (x + y) % 2 === 0) {
          g.fillStyle = withAlpha(maze.floor, 0.035);
          g.fillRect(px, py, tile, tile);
        }
        continue;
      }
      if (style === "chalk") {
        g.fillStyle = withAlpha(color, 0.06);
        g.fillRect(px, py, tile, tile);
        if ((x * 3 + y * 5) % 4 === 0) {
          g.strokeStyle = withAlpha(CHALK, 0.12);
          g.lineWidth = 0.8;
          g.beginPath();
          for (let k = 0; k < tile; k += 4) {
            g.moveTo(px + k, py + tile);
            g.lineTo(px + k + 4, py);
          }
          g.stroke();
        }
      } else if (style === "") {
        const fill = g.createLinearGradient(px, py, px + tile, py + tile);
        fill.addColorStop(0, withAlpha(maze.surface, 0.95));
        fill.addColorStop(1, withAlpha(maze.surface, 0.75));
        g.fillStyle = fill;
        g.fillRect(px, py, tile, tile);
        g.fillStyle = withAlpha(color, 0.07);
        g.fillRect(px, py, tile, tile);
      } else if (style !== "wireframe") {
        // Paper walls are drawn in reading order, so each shadow lands on floor, never on a later wall.
        g.fillStyle = maze.surface;
        g.fillRect(px, py, tile, tile);
      }
      if (maze.texture && style !== "wireframe" && style !== "chalk") wallTexture(g, maze.texture, px, py, tile, x, y, style === "pixel");
      // Outline only the sides that face open floor.
      if (!solid(x, y - 1)) {
        edges.moveTo(px, py + 2);
        edges.lineTo(px + tile, py + 2);
      }
      if (!solid(x, y + 1)) {
        edges.moveTo(px, py + tile - 2);
        edges.lineTo(px + tile, py + tile - 2);
      }
      if (x > 0 && !solid(x - 1, y)) {
        edges.moveTo(px + 2, py);
        edges.lineTo(px + 2, py + tile);
      }
      if (x < grid[y].length - 1 && !solid(x + 1, y)) {
        edges.moveTo(px + tile - 2, py);
        edges.lineTo(px + tile - 2, py + tile);
      }
    }
  }
  clearShadow(g);
  if (style === "chalk") {
    g.lineCap = "round";
    g.strokeStyle = withAlpha(color, 0.25);
    g.lineWidth = 4;
    g.stroke(edges);
    g.setLineDash([7, 1.5, 4, 1]);
    g.strokeStyle = withAlpha(color, 0.9);
    g.lineWidth = 2;
    g.stroke(edges);
    g.setLineDash([]);
    return;
  }
  if (style === "pixel") {
    g.lineCap = "butt";
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.stroke(edges);
    return;
  }
  if (style === "cartoon" || style === "paper") {
    g.lineCap = "round";
    if (style === "cartoon") {
      g.strokeStyle = INK;
      g.lineWidth = 4.5;
      g.stroke(edges);
    }
    g.strokeStyle = color;
    g.lineWidth = style === "cartoon" ? 2 : 1.5;
    g.stroke(edges);
    return;
  }
  if (style === "wireframe") {
    g.lineCap = "round";
    g.shadowColor = color;
    g.shadowBlur = 6;
    g.strokeStyle = color;
    g.lineWidth = 1.25;
    g.stroke(edges);
    g.shadowBlur = 0;
    return;
  }
  g.lineCap = "round";
  g.shadowColor = color;
  g.shadowBlur = 10;
  g.strokeStyle = withAlpha(color, 0.35);
  g.lineWidth = 5;
  g.stroke(edges);
  g.shadowBlur = 0;
  g.strokeStyle = withAlpha(color, 0.95);
  g.lineWidth = 2;
  g.stroke(edges);
  g.strokeStyle = withAlpha("#ffffff", 0.35);
  g.lineWidth = 0.75;
  g.stroke(edges);
}

/** A material texture over one wall tile: leaves, icing dots or carved sandstone. */
function wallTexture(g: Ctx, texture: MazeTexture, px: number, py: number, tile: number, x: number, y: number, blocky: boolean) {
  const seed = (n: number) => {
    const v = Math.sin((x * 97 + y * 57 + n) * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  if (texture === "hedge") {
    for (let i = 0; i < 6; i += 1) {
      g.fillStyle = i % 2 ? "#3f8a32" : "#24561f";
      const lx = px + seed(i) * tile;
      const ly = py + seed(i + 9) * tile;
      if (blocky) g.fillRect(lx, ly, 3, 3);
      else {
        g.beginPath();
        g.ellipse(lx, ly, 2.6, 1.6, seed(i + 3) * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (texture === "icing") {
    g.fillStyle = withAlpha("#fff6ee", 0.9);
    if ((x + y) % 3 === 0) {
      g.beginPath();
      g.arc(px + tile / 2, py + tile / 2, 2, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = withAlpha("#ff6fa8", 0.8);
    if ((x * 7 + y) % 5 === 0) g.fillRect(px + tile * 0.3, py + tile * 0.3, 2, 2);
  } else if (texture === "sandstone") {
    g.strokeStyle = withAlpha("#5a3a1a", 0.35);
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(px, py + tile / 2);
    g.lineTo(px + tile, py + tile / 2);
    const off = y % 2 ? tile / 2 : 0;
    g.moveTo(px + off, py);
    g.lineTo(px + off, py + tile / 2);
    g.moveTo(px + (off + tile / 2) % tile, py + tile / 2);
    g.lineTo(px + (off + tile / 2) % tile, py + tile);
    g.stroke();
    if ((x * 5 + y * 3) % 7 === 0) {
      // A tiny hieroglyph: an eye.
      g.strokeStyle = withAlpha("#3a2410", 0.55);
      g.beginPath();
      g.ellipse(px + tile / 2, py + tile * 0.28, 3.5, 1.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
}

/** Small diamond glimmer pellet. */
export function drawGlimmer(ctx: Ctx, cx: number, cy: number, s: number, color: string, style: GemArtStyle = "") {
  if (style === "pixel") {
    ctx.fillStyle = color;
    ctx.fillRect(cx - s * 0.7, cy - s * 0.7, s * 1.4, s * 1.4);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s * 0.8, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s * 0.8, cy);
  ctx.closePath();
  if (style === "wireframe" || style === "chalk") {
    ctx.strokeStyle = color;
    ctx.lineWidth = style === "chalk" ? 1.3 : 1;
    ctx.stroke();
    return;
  }
  if (style === "paper") castShadow(ctx, s * 0.35);
  ctx.fillStyle = color;
  ctx.fill();
  clearShadow(ctx);
  if (style === "cartoon") {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
