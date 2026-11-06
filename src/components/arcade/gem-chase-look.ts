"use client";

import type { GameLook } from "@/lib/game-cosmetics";
import { withAlpha } from "./engine";
import { GAME_PALETTES } from "./palettes";

/**
 * Gem Chase cosmetics: the Gem's colors, maze materials, pickup sparks and shade colors.
 * Drawing only: sizes, hitboxes and the frightened-shade colors never change.
 */

type Ctx = CanvasRenderingContext2D;

export type SparkShape = "square" | "star" | "ring" | "petal" | "heart" | "flake" | "confetti";
export type GemArtStyle = "" | "pixel" | "cartoon" | "paper" | "wireframe";
const ART_STYLES: readonly GemArtStyle[] = ["pixel", "cartoon", "paper", "wireframe"];
const INK = "#120a24";

export type GemChaseTheme = {
  key: string;
  style: GemArtStyle;
  gem: { light: string; mid: string; edge: string; glow: string; shimmer: boolean };
  maze: { background: string; surface: string; wall: string; floor: string; glimmer: string; foreground: string };
  collect: { shape: SparkShape; colors: string[] | null };
  shades: string[];
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
};

export function gemChaseTheme(look: GameLook): GemChaseTheme {
  const gem = look.gem ?? "";
  const maze = look.maze ?? "";
  const collect = look.collect ?? "";
  const shades = look.shades ?? "";
  const style = ART_STYLES.find((s) => s === look.style) ?? "";
  return {
    key: [gem, maze, collect, shades, style].join("|"),
    style,
    gem: GEMS[gem] ?? GEMS[""],
    maze: MAZES[maze] ?? MAZES[""],
    collect: COLLECTS[collect] ?? COLLECTS[""],
    shades: SHADES[shades] ?? SHADES[""],
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
  if (theme.style === "pixel") {
    const cell = Math.max(1.5, r / 3.5);
    const n = Math.ceil(r / cell);
    for (let i = -n; i < n; i += 1) {
      for (let j = -n; j < n; j += 1) {
        const cx = (i + 0.5) * cell;
        const cy = (j + 0.5) * cell;
        const d = Math.hypot(cx, cy);
        if (d > r || (d > cell * 0.5 && Math.abs(Math.atan2(cy, cx)) < open)) continue;
        ctx.fillStyle = d > r - cell * 1.1 ? edge : cx < 0 && cy < 0 && d < r * 0.6 ? g.light : mid;
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
export function drawShadeBody(ctx: Ctx, x: number, y: number, r: number, color: string, wave: number, animate: boolean, style: GemArtStyle = "") {
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
      if (style === "") {
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
  if (style === "wireframe") {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
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
