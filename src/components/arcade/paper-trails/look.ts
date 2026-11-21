"use client";

import { contours } from "d3-contour";
import type { GameLook } from "@/lib/game-cosmetics";
import { mix, withAlpha } from "../engine";

/**
 * Paper Trails cosmetics and drawing, shared by the game and its shop preview. Everything here is drawn in
 * world units (1 = one arena cell). Cosmetics only change looks: sizes, speeds and hit cells never change,
 * and every art style keeps territories, their borders and trails clearly visible.
 */

type Ctx = CanvasRenderingContext2D;
export type Point = { x: number; y: number };

// ---------------------------------------------------------------------------------------------
// Piece skins

export type PieceDecor = "fold" | "sticker" | "star" | "waves" | "stripes" | "foil" | "stars" | "plain" | "airmail" | "veins" | "marbled";
/** `color` is the piece and its territory, `dark` its outlines and trail edge, `light` highlights and trail. */
export type PieceSkin = { color: string; dark: string; light: string; decor: PieceDecor };

const SKINS: Record<string, PieceSkin> = {
  "": { color: "#8b5cf6", dark: "#43198f", light: "#d3c2ff", decor: "fold" },
  tangerine: { color: "#fb8a2b", dark: "#8f3a07", light: "#ffd2a6", decor: "fold" },
  mint: { color: "#2fc495", dark: "#0b6249", light: "#b5f2dd", decor: "sticker" },
  cherry: { color: "#e23a5b", dark: "#7a1026", light: "#ffb8c6", decor: "star" },
  ocean: { color: "#2c84df", dark: "#103d75", light: "#b0d6ff", decor: "waves" },
  bumblebee: { color: "#f4c21a", dark: "#5a4300", light: "#fff2a8", decor: "stripes" },
  gold: { color: "#d8a01c", dark: "#6e4b00", light: "#fff1bd", decor: "foil" },
  galaxy: { color: "#33358a", dark: "#0c0d33", light: "#a9adff", decor: "stars" },
  airmail: { color: "#4f8fe0", dark: "#173c78", light: "#d6e6ff", decor: "airmail" },
  "pressed-leaf": { color: "#5aa83a", dark: "#1f4a12", light: "#cdeab0", decor: "veins" },
  marbled: { color: "#2a4a8a", dark: "#0e1c3a", light: "#e8c86a", decor: "marbled" },
};

/** Computer opponents' colours, kept apart from the player's hue (see `botSkins`). */
const BOT_COLORS = ["#e5484d", "#f5a524", "#30a46c", "#2f7fe0", "#e5489d", "#12a594", "#8fb31c", "#f06b1f", "#6e56cf", "#7c5a3c"];

function hue(color: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

export function plainSkin(color: string): PieceSkin {
  return { color, dark: mix(color, "#120c1c", 0.55), light: mix(color, "#ffffff", 0.55), decor: "plain" };
}

/** Distinct bot colours that never share the player's hue, so your land always stands out. */
export function botSkins(player: PieceSkin): PieceSkin[] {
  const mine = hue(player.color);
  return BOT_COLORS.filter((color) => hueGap(hue(color), mine) > 22).map(plainSkin);
}

// ---------------------------------------------------------------------------------------------
// Territory patterns and trail effects

export type PatternId = "" | "stripes" | "dots" | "gingham" | "hatch" | "waves" | "scales" | "confetti" | "chevron" | "tartan" | "honeycomb";
const PATTERNS: readonly PatternId[] = ["stripes", "dots", "gingham", "hatch", "waves", "scales", "confetti", "chevron", "tartan", "honeycomb"];
export type TrailEffect = "" | "stitches" | "crayon" | "ricrac" | "splats" | "glitter" | "comet" | "rainbow" | "washi" | "footprints" | "paper-chain";
const TRAILS: readonly TrailEffect[] = ["stitches", "crayon", "ricrac", "splats", "glitter", "comet", "rainbow", "washi", "footprints", "paper-chain"];

// ---------------------------------------------------------------------------------------------
// Art styles

export type ArtStyleId = "" | "blueprint" | "newsprint" | "papercraft" | "chalkboard" | "treasure-map";
const STYLES: readonly ArtStyleId[] = ["blueprint", "newsprint", "papercraft", "chalkboard", "treasure-map"];

export type ArtStyle = {
  id: ArtStyleId;
  /** The arena paper and the margin around it. */
  paper: string;
  margin: string;
  grid: string;
  gridMajor: string;
  border: string;
  /** Outlines, eyes and text. */
  ink: string;
  dark: boolean;
  /** Outline width of territories (cells). */
  outline: number;
  /** How far land and pieces are lifted off the page (cells); 0 draws them flat. */
  raise: number;
  /** Soft cast shadow under land (papercraft). */
  cast: number;
  /** A second, offset pencil stroke on outlines. */
  sketch: boolean;
  label: { bg: string; fg: string };
  font: string;
};

const STYLE_DEFS: Record<ArtStyleId, ArtStyle> = {
  "": {
    id: "",
    paper: "#fbf6ea",
    margin: "#e6dcc5",
    grid: "rgb(96 140 210 / 0.16)",
    gridMajor: "rgb(96 140 210 / 0.3)",
    border: "#d0463c",
    ink: "#2a2238",
    dark: false,
    outline: 0.12,
    raise: 0.2,
    cast: 0,
    sketch: true,
    label: { bg: "rgb(255 253 246 / 0.92)", fg: "#2a2238" },
    font: "'Comic Sans MS', 'Chalkboard SE', 'Segoe Print', ui-rounded, system-ui, sans-serif",
  },
  blueprint: {
    id: "blueprint",
    paper: "#1d4f8f",
    margin: "#123563",
    grid: "rgb(214 233 255 / 0.14)",
    gridMajor: "rgb(214 233 255 / 0.3)",
    border: "#e8f3ff",
    ink: "#f2f8ff",
    dark: true,
    outline: 0.1,
    raise: 0,
    cast: 0,
    sketch: false,
    label: { bg: "rgb(16 46 88 / 0.9)", fg: "#f2f8ff" },
    font: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
  },
  newsprint: {
    id: "newsprint",
    paper: "#eeebe3",
    margin: "#cfcac0",
    grid: "rgb(40 40 40 / 0.08)",
    gridMajor: "rgb(40 40 40 / 0.16)",
    border: "#151515",
    ink: "#111111",
    dark: false,
    outline: 0.18,
    raise: 0.16,
    cast: 0,
    sketch: false,
    label: { bg: "#fffef8", fg: "#111111" },
    font: "'Arial Black', Impact, 'Helvetica Neue', system-ui, sans-serif",
  },
  papercraft: {
    id: "papercraft",
    paper: "#cfae82",
    margin: "#a9875c",
    grid: "rgb(90 60 30 / 0.07)",
    gridMajor: "rgb(90 60 30 / 0.14)",
    border: "#6b4a2b",
    ink: "#3d2a19",
    dark: false,
    outline: 0.05,
    raise: 0.28,
    cast: 0.34,
    sketch: false,
    label: { bg: "rgb(255 249 238 / 0.94)", fg: "#3d2a19" },
    font: "ui-rounded, 'Trebuchet MS', system-ui, sans-serif",
  },
  chalkboard: {
    id: "chalkboard",
    paper: "#2e3d36",
    margin: "#1f2a25",
    grid: "rgb(240 240 228 / 0.06)",
    gridMajor: "rgb(240 240 228 / 0.13)",
    border: "#efe9d8",
    ink: "#f3efe2",
    dark: true,
    outline: 0.11,
    raise: 0,
    cast: 0,
    sketch: true,
    label: { bg: "rgb(30 42 37 / 0.9)", fg: "#f3efe2" },
    font: "'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', ui-rounded, system-ui, sans-serif",
  },
  "treasure-map": {
    id: "treasure-map",
    paper: "#e9d6a8",
    margin: "#b8945a",
    grid: "rgb(110 70 30 / 0.07)",
    gridMajor: "rgb(110 70 30 / 0.16)",
    border: "#6a3e18",
    ink: "#4a2a10",
    dark: false,
    outline: 0.1,
    raise: 0,
    cast: 0,
    sketch: false,
    label: { bg: "rgb(244 230 196 / 0.94)", fg: "#4a2a10" },
    font: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  },
};

export type PaperTrailsTheme = { key: string; skin: PieceSkin; pattern: PatternId; trail: TrailEffect; style: ArtStyle };

export function paperTrailsTheme(look: GameLook): PaperTrailsTheme {
  const skin = SKINS[look.piece ?? ""] ?? SKINS[""];
  const pattern = PATTERNS.find((entry) => entry === look.pattern) ?? "";
  const trail = TRAILS.find((entry) => entry === look.trail) ?? "";
  const style = STYLE_DEFS[STYLES.find((entry) => entry === look.style) ?? ""];
  return { key: `${look.piece ?? ""}|${pattern}|${trail}|${style.id}`, skin, pattern, trail, style };
}

/** A territory's fill in an art style: chalk and blueprint wash colours lighter so they read on dark paper. */
export function landColor(style: ArtStyle, skin: PieceSkin) {
  if (style.id === "blueprint") return mix(skin.color, "#dbeaff", 0.28);
  if (style.id === "chalkboard") return mix(skin.color, "#f3efe2", 0.22);
  if (style.id === "newsprint") return mix(skin.color, "#eeebe3", 0.08);
  if (style.id === "treasure-map") return mix(skin.color, "#c8a46a", 0.38);
  return skin.color;
}

/** The land's border colour: ink-darkened skin on paper, light chalk/blueprint lines on dark styles. */
export function edgeColor(style: ArtStyle, skin: PieceSkin) {
  if (style.dark) return mix(skin.light, style.ink, 0.35);
  if (style.id === "newsprint") return style.ink;
  if (style.id === "treasure-map") return mix(skin.dark, style.ink, 0.6);
  return mix(skin.dark, style.ink, 0.25);
}

// ---------------------------------------------------------------------------------------------
// Geometry: territory outlines

const contourMaker = contours();

/**
 * The outline of every cell where `values[i] === owner` as a Path2D, traced with marching squares
 * (d3-contour) so land has smooth, chamfered edges instead of a jagged pixel staircase. Holes stay holes
 * (fill it with "evenodd").
 */
export function territoryPath(owners: ArrayLike<number>, cols: number, rows: number, owner: number): Path2D | null {
  const mask = new Float64Array(cols * rows);
  let any = false;
  for (let i = 0; i < mask.length; i += 1) {
    if (owners[i] === owner) {
      mask[i] = 1;
      any = true;
    }
  }
  if (!any) return null;
  return maskPath(mask, cols, rows);
}

/** A Path2D around every non-zero cell of a mask. */
export function maskPath(mask: ArrayLike<number>, cols: number, rows: number): Path2D {
  const [shape] = contourMaker.size([cols, rows]).thresholds([0.5])(Array.from(mask));
  const path = new Path2D();
  for (const polygon of shape.coordinates) {
    for (const ring of polygon) {
      ring.forEach(([x, y], i) => (i === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
      path.closePath();
    }
  }
  return path;
}

// ---------------------------------------------------------------------------------------------
// Small helpers

/** A stable pseudo-random number in [0, 1) for an integer seed. */
export function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function star(ctx: Ctx, x: number, y: number, r: number, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const rr = i % 2 ? r * inner : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------------------------
// The page

const paperTiles = new Map<ArtStyleId, HTMLCanvasElement>();
const patternCache = new WeakMap<Ctx, Map<string, CanvasPattern | null>>();

function cachedPattern(ctx: Ctx, key: string, make: () => HTMLCanvasElement | null, cells: number): CanvasPattern | null {
  let map = patternCache.get(ctx);
  if (!map) {
    map = new Map();
    patternCache.set(ctx, map);
  }
  if (map.has(key)) return map.get(key) ?? null;
  const tile = make();
  const pattern = tile ? ctx.createPattern(tile, "repeat") : null;
  if (pattern && tile) pattern.setTransform(new DOMMatrix().scale(cells / tile.width));
  map.set(key, pattern);
  return pattern;
}

/** Texture on the page itself: paper grain, halftone, kraft fibres or chalk dust (4 cells per tile). */
function paperTile(style: ArtStyle): HTMLCanvasElement | null {
  const cached = paperTiles.get(style.id);
  if (cached) return cached;
  const tile = document.createElement("canvas");
  tile.width = tile.height = 128;
  const g = tile.getContext("2d");
  if (!g) return null;
  if (style.id === "newsprint") {
    g.fillStyle = "rgb(30 30 30 / 0.09)";
    for (let y = 0; y < 128; y += 8) {
      for (let x = (y / 8) % 2 ? 4 : 0; x < 128; x += 8) {
        g.beginPath();
        g.arc(x, y, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    }
  } else if (style.id === "treasure-map") {
    // Tea stains and foxing on old parchment.
    for (let i = 0; i < 7; i += 1) {
      const x = hash(i * 7 + 1) * 128;
      const y = hash(i * 7 + 2) * 128;
      const r = 10 + hash(i * 7 + 3) * 26;
      const stain = g.createRadialGradient(x, y, r * 0.6, x, y, r);
      stain.addColorStop(0, "rgb(150 100 40 / 0.04)");
      stain.addColorStop(0.9, "rgb(130 80 30 / 0.12)");
      stain.addColorStop(1, "rgb(130 80 30 / 0)");
      g.fillStyle = stain;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 90; i += 1) {
      g.fillStyle = `rgb(120 80 30 / ${0.05 + hash(i + 500) * 0.08})`;
      g.fillRect(hash(i + 300) * 128, hash(i + 400) * 128, 1.2, 1.2);
    }
  } else {
    const count = style.id === "papercraft" ? 260 : style.id === "chalkboard" ? 180 : 140;
    for (let i = 0; i < count; i += 1) {
      const x = hash(i * 3 + 1) * 128;
      const y = hash(i * 3 + 2) * 128;
      const r = hash(i * 3 + 3);
      if (style.id === "papercraft") {
        g.strokeStyle = r > 0.5 ? "rgb(255 240 210 / 0.28)" : "rgb(90 55 20 / 0.2)";
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(r * 9) * 6, y + Math.sin(r * 9) * 6);
        g.stroke();
      } else if (style.id === "chalkboard") {
        g.fillStyle = `rgb(240 240 228 / ${0.03 + r * 0.05})`;
        g.beginPath();
        g.ellipse(x, y, 2 + r * 8, 1 + r * 2, r * 6, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = style.dark ? "rgb(255 255 255 / 0.05)" : `rgb(120 100 70 / ${0.05 + r * 0.06})`;
        g.fillRect(x, y, 1 + r * 1.2, 1 + r * 1.2);
      }
    }
  }
  paperTiles.set(style.id, tile);
  return tile;
}

/** The arena paper, its grid (only the visible part) and the border. */
export function drawArena(ctx: Ctx, style: ArtStyle, cols: number, rows: number, view: { x0: number; y0: number; x1: number; y1: number }) {
  ctx.fillStyle = style.paper;
  ctx.fillRect(0, 0, cols, rows);
  const texture = cachedPattern(ctx, `paper:${style.id}`, () => paperTile(style), 4);
  if (texture) {
    ctx.fillStyle = texture;
    ctx.fillRect(0, 0, cols, rows);
  }
  const x0 = Math.max(0, Math.floor(view.x0));
  const x1 = Math.min(cols, Math.ceil(view.x1));
  const y0 = Math.max(0, Math.floor(view.y0));
  const y1 = Math.min(rows, Math.ceil(view.y1));
  ctx.lineWidth = 0.035;
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? style.gridMajor : style.grid;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 1) {
      if ((x % 6 === 0) !== major) continue;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (let y = y0; y <= y1; y += 1) {
      if ((y % 6 === 0) !== major) continue;
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  }
  // The border: a bold margin line, dashed like a fold on blueprint and chalk.
  ctx.save();
  ctx.strokeStyle = style.border;
  ctx.lineWidth = style.id === "newsprint" ? 0.3 : 0.22;
  if (style.dark) ctx.setLineDash([0.8, 0.4]);
  ctx.strokeRect(-0.11, -0.11, cols + 0.22, rows + 0.22);
  if (style.id === "treasure-map") {
    // A second inked rule, and a compass rose in the corner.
    ctx.lineWidth = 0.08;
    ctx.strokeRect(0.35, 0.35, cols - 0.7, rows - 0.7);
    const cx = cols - 3.2;
    const cy = rows - 3.2;
    ctx.fillStyle = withAlpha(style.ink, 0.35);
    ctx.strokeStyle = withAlpha(style.ink, 0.45);
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
    ctx.stroke();
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4 - Math.PI / 2;
      const len = k % 2 ? 1.1 : 2.2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
      ctx.lineTo(cx + Math.cos(a + 0.35) * 0.35, cy + Math.sin(a + 0.35) * 0.35);
      ctx.lineTo(cx + Math.cos(a - 0.35) * 0.35, cy + Math.sin(a - 0.35) * 0.35);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Territory

const PATTERN_CELLS = 2;
const TILE_PX = 64;

function patternTile(pattern: PatternId, ink: string, accent: string): HTMLCanvasElement | null {
  const tile = document.createElement("canvas");
  tile.width = tile.height = TILE_PX;
  const g = tile.getContext("2d");
  if (!g) return null;
  const s = TILE_PX;
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = "round";
  switch (pattern) {
    case "stripes":
      g.lineWidth = s * 0.09;
      for (let i = -2; i <= 2; i += 1) {
        g.beginPath();
        g.moveTo(i * (s / 2), s);
        g.lineTo(i * (s / 2) + s, 0);
        g.stroke();
      }
      break;
    case "dots":
      for (const [x, y] of [
        [0.25, 0.25],
        [0.75, 0.75],
      ]) {
        g.beginPath();
        g.arc(x * s, y * s, s * 0.085, 0, Math.PI * 2);
        g.fill();
      }
      break;
    case "gingham":
      g.globalAlpha = 0.6;
      g.fillRect(0, s * 0.25, s, s * 0.25);
      g.fillRect(0, s * 0.75, s, s * 0.25);
      g.fillRect(s * 0.25, 0, s * 0.25, s);
      g.fillRect(s * 0.75, 0, s * 0.25, s);
      break;
    case "hatch":
      g.lineWidth = s * 0.03;
      for (let i = -4; i <= 4; i += 1) {
        g.beginPath();
        g.moveTo(i * (s / 4), s);
        g.lineTo(i * (s / 4) + s, 0);
        g.moveTo(i * (s / 4), 0);
        g.lineTo(i * (s / 4) + s, s);
        g.stroke();
      }
      break;
    case "waves":
      g.lineWidth = s * 0.05;
      for (const row of [0.25, 0.75]) {
        g.beginPath();
        for (let x = 0; x <= s; x += 2) {
          const y = row * s + Math.sin((x / s) * Math.PI * 4) * s * 0.07;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    case "scales":
      g.lineWidth = s * 0.04;
      for (let row = 0; row < 3; row += 1) {
        for (let col = -1; col < 3; col += 1) {
          const cx = col * (s / 2) + (row % 2 ? s / 4 : 0);
          const cy = row * (s / 2);
          g.beginPath();
          g.arc(cx, cy, s / 4, 0, Math.PI);
          g.stroke();
        }
      }
      break;
    case "chevron":
      g.lineWidth = s * 0.08;
      g.lineJoin = "miter";
      for (const row of [0.25, 0.75]) {
        g.beginPath();
        g.moveTo(0, row * s + s * 0.12);
        g.lineTo(s * 0.25, row * s - s * 0.12);
        g.lineTo(s * 0.5, row * s + s * 0.12);
        g.lineTo(s * 0.75, row * s - s * 0.12);
        g.lineTo(s, row * s + s * 0.12);
        g.stroke();
      }
      break;
    case "tartan":
      g.globalAlpha = 0.45;
      g.fillRect(0, s * 0.1, s, s * 0.18);
      g.fillRect(s * 0.1, 0, s * 0.18, s);
      g.globalAlpha = 0.8;
      g.lineWidth = s * 0.025;
      g.beginPath();
      g.moveTo(0, s * 0.62);
      g.lineTo(s, s * 0.62);
      g.moveTo(s * 0.62, 0);
      g.lineTo(s * 0.62, s);
      g.stroke();
      g.fillStyle = accent;
      g.fillRect(0, s * 0.18, s, s * 0.03);
      g.fillRect(s * 0.18, 0, s * 0.03, s);
      break;
    case "honeycomb": {
      g.lineWidth = s * 0.035;
      const r = s / 4 / Math.cos(Math.PI / 6) / 1.0;
      for (const [cx, cy] of [
        [0, 0],
        [s / 2, 0],
        [s, 0],
        [s / 4, s / 2],
        [(s * 3) / 4, s / 2],
        [0, s],
        [s / 2, s],
        [s, s],
      ]) {
        g.beginPath();
        for (let k = 0; k <= 6; k += 1) {
          const a = (k * Math.PI) / 3 + Math.PI / 6;
          const x = cx + Math.cos(a) * r * 0.55;
          const y = cy + Math.sin(a) * r * 0.55;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      break;
    }
    case "confetti":
      for (let i = 0; i < 9; i += 1) {
        g.save();
        g.fillStyle = i % 3 === 0 ? accent : ink;
        g.translate(hash(i * 5 + 11) * s, hash(i * 5 + 12) * s);
        g.rotate(hash(i * 5 + 13) * Math.PI);
        g.fillRect(-s * 0.05, -s * 0.022, s * 0.1, s * 0.044);
        g.restore();
      }
      break;
    default:
      return null;
  }
  return tile;
}

/** Pattern ink stays a gentle tone of the land colour so borders and trails always read on top. */
function landPattern(ctx: Ctx, pattern: PatternId, style: ArtStyle, skin: PieceSkin) {
  if (!pattern) return null;
  const ink = style.dark ? withAlpha(skin.light, 0.38) : withAlpha(mix(skin.dark, skin.color, 0.25), 0.38);
  const accent = withAlpha(style.dark ? "#ffffff" : skin.light, 0.6);
  return cachedPattern(ctx, `land:${pattern}:${ink}:${accent}`, () => patternTile(pattern, ink, accent), PATTERN_CELLS);
}

export type Land = { path: Path2D; skin: PieceSkin; pattern: PatternId };

/**
 * Every territory, drawn in passes so lifted edges never overlap a neighbour's face: the paper edge (or cast
 * shadow), the faces, patterns, then outlines.
 */
export function drawLands(ctx: Ctx, style: ArtStyle, lands: readonly Land[]) {
  ctx.save();
  ctx.lineJoin = "round";
  if (style.cast > 0) {
    ctx.fillStyle = "rgb(60 35 10 / 0.22)";
    for (const land of lands) {
      ctx.save();
      ctx.translate(style.cast * 0.45, style.cast);
      ctx.fill(land.path, "evenodd");
      ctx.restore();
    }
  }
  if (style.raise > 0) {
    for (const land of lands) {
      ctx.save();
      ctx.translate(0, style.raise);
      ctx.fillStyle = style.id === "newsprint" ? style.ink : mix(land.skin.dark, land.skin.color, 0.3);
      ctx.fill(land.path, "evenodd");
      ctx.restore();
    }
  }
  for (const land of lands) {
    ctx.fillStyle = landColor(style, land.skin);
    ctx.globalAlpha = style.id === "blueprint" ? 0.82 : 1;
    ctx.fill(land.path, "evenodd");
    ctx.globalAlpha = 1;
    const pattern = landPattern(ctx, land.pattern, style, land.skin);
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fill(land.path, "evenodd");
    }
  }
  if (style.id === "treasure-map") {
    // Old-map coastlines: faint ripple lines echo every shore.
    for (const land of lands) {
      ctx.strokeStyle = withAlpha(style.ink, 0.12);
      for (const w of [0.7, 0.4]) {
        ctx.lineWidth = w;
        ctx.stroke(land.path);
        ctx.strokeStyle = withAlpha(style.paper, 0.85);
        ctx.lineWidth = w - 0.12;
        ctx.stroke(land.path);
        ctx.strokeStyle = withAlpha(style.ink, 0.12);
      }
    }
    for (const land of lands) {
      ctx.fillStyle = landColor(style, land.skin);
      ctx.fill(land.path, "evenodd");
      const pattern = landPattern(ctx, land.pattern, style, land.skin);
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fill(land.path, "evenodd");
      }
    }
  }
  for (const land of lands) {
    ctx.strokeStyle = edgeColor(style, land.skin);
    ctx.lineWidth = style.outline;
    if (style.id === "blueprint") ctx.setLineDash([0.45, 0.2]);
    ctx.stroke(land.path);
    ctx.setLineDash([]);
    if (style.sketch) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.translate(0.06, -0.05);
      ctx.lineWidth = style.outline * 0.6;
      ctx.stroke(land.path);
      ctx.restore();
    }
    if (style.id === "papercraft") {
      // A light cut edge along the top of each paper piece.
      ctx.save();
      ctx.strokeStyle = withAlpha(land.skin.light, 0.7);
      ctx.lineWidth = 0.06;
      ctx.translate(0, -0.03);
      ctx.stroke(land.path);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** A brief bright wash over freshly captured land. */
export function drawCaptureFlash(ctx: Ctx, style: ArtStyle, path: Path2D, t: number) {
  ctx.save();
  ctx.fillStyle = withAlpha(style.dark ? "#ffffff" : "#fffdf2", 0.55 * (1 - t));
  ctx.fill(path, "evenodd");
  ctx.strokeStyle = withAlpha(style.dark ? "#ffffff" : style.ink, 0.5 * (1 - t));
  ctx.lineWidth = 0.08 + t * 0.4;
  ctx.stroke(path);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Trails

const TRAIL_W = 0.42;

type Sample = { x: number; y: number; nx: number; ny: number; d: number };

/** Points every `spacing` cells along the trail, from the head backwards, with normals and distance from the head. */
function resample(points: readonly Point[], spacing: number): Sample[] {
  const out: Sample[] = [];
  let d = 0;
  let carry = 0;
  for (let i = points.length - 1; i > 0; i -= 1) {
    const a = points[i];
    const b = points[i - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let t = carry;
    while (t <= len) {
      out.push({ x: a.x + ux * t, y: a.y + uy * t, nx: -uy, ny: ux, d: d + t });
      t += spacing;
    }
    carry = t - len;
    d += len;
  }
  return out;
}

function trailPath(points: readonly Point[]) {
  const path = new Path2D();
  points.forEach((p, i) => (i === 0 ? path.moveTo(p.x, p.y) : path.lineTo(p.x, p.y)));
  return path;
}

/**
 * One exposed trail. Every effect sits on the same base, an outlined band in the owner's colours, so a
 * trail is always readable and clearly someone's. `points` run from where the trail left land to the head.
 */
export function drawTrail(ctx: Ctx, style: ArtStyle, skin: PieceSkin, effect: TrailEffect, points: readonly Point[], now: number, animate: boolean, seed = 0) {
  if (points.length < 2) return;
  const path = trailPath(points);
  const edge = style.dark ? mix(skin.light, "#ffffff", 0.3) : style.id === "newsprint" ? style.ink : skin.dark;
  const body = style.dark ? mix(skin.color, "#ffffff", 0.35) : mix(skin.color, "#ffffff", 0.3);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (effect === "comet") {
    ctx.strokeStyle = withAlpha(skin.light, 0.35);
    ctx.lineWidth = TRAIL_W * 2.4;
    ctx.stroke(path);
  }
  if (style.raise > 0 && !style.dark) {
    ctx.save();
    ctx.translate(0, style.raise * 0.6);
    ctx.strokeStyle = withAlpha(style.id === "newsprint" ? style.ink : skin.dark, 0.45);
    ctx.lineWidth = TRAIL_W + 0.14;
    ctx.stroke(path);
    ctx.restore();
  }
  ctx.strokeStyle = edge;
  ctx.lineWidth = TRAIL_W + (style.id === "newsprint" ? 0.2 : 0.14);
  ctx.stroke(path);

  if (effect === "crayon") {
    // Waxy strokes: a few slightly offset, see-through passes.
    for (let i = 0; i < 3; i += 1) {
      ctx.save();
      ctx.translate((hash(seed + i) - 0.5) * 0.08, (hash(seed + i + 7) - 0.5) * 0.08);
      ctx.strokeStyle = withAlpha(i === 1 ? skin.light : body, 0.75);
      ctx.lineWidth = TRAIL_W * (0.95 - i * 0.12);
      ctx.setLineDash([0.18 + i * 0.05, 0.05]);
      ctx.stroke(path);
      ctx.restore();
    }
  } else if (effect === "rainbow") {
    ctx.strokeStyle = body;
    ctx.lineWidth = TRAIL_W;
    ctx.stroke(path);
    const samples = resample(points, 0.3);
    const shift = animate ? now * 0.12 : 0;
    ctx.lineWidth = TRAIL_W * 0.62;
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1];
      const b = samples[i];
      ctx.strokeStyle = `hsl(${(a.d * 40 + shift) % 360} 90% ${style.dark ? 70 : 60}%)`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = body;
    ctx.lineWidth = TRAIL_W;
    ctx.stroke(path);
  }

  switch (effect) {
    case "": {
      // The default: a dashed "cut here" guide down the middle.
      ctx.strokeStyle = withAlpha(edge, 0.7);
      ctx.lineWidth = 0.07;
      ctx.setLineDash([0.22, 0.16]);
      ctx.lineDashOffset = animate ? -now * 0.0012 : 0;
      ctx.stroke(path);
      break;
    }
    case "stitches": {
      ctx.strokeStyle = style.dark ? "#ffffff" : "#fffaf0";
      ctx.lineWidth = 0.09;
      ctx.setLineDash([0.2, 0.14]);
      ctx.stroke(path);
      ctx.setLineDash([]);
      for (const s of resample(points, 0.55)) {
        ctx.beginPath();
        ctx.moveTo(s.x + s.nx * TRAIL_W * 0.52, s.y + s.ny * TRAIL_W * 0.52);
        ctx.lineTo(s.x + s.nx * TRAIL_W * 0.3, s.y + s.ny * TRAIL_W * 0.3);
        ctx.moveTo(s.x - s.nx * TRAIL_W * 0.52, s.y - s.ny * TRAIL_W * 0.52);
        ctx.lineTo(s.x - s.nx * TRAIL_W * 0.3, s.y - s.ny * TRAIL_W * 0.3);
        ctx.strokeStyle = edge;
        ctx.lineWidth = 0.05;
        ctx.stroke();
      }
      break;
    }
    case "ricrac": {
      const samples = resample(points, 0.22);
      ctx.strokeStyle = style.dark ? "#ffffff" : skin.light;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      samples.forEach((s, i) => {
        const o = (i % 2 ? 1 : -1) * TRAIL_W * 0.28;
        if (i === 0) ctx.moveTo(s.x + s.nx * o, s.y + s.ny * o);
        else ctx.lineTo(s.x + s.nx * o, s.y + s.ny * o);
      });
      ctx.stroke();
      break;
    }
    case "splats": {
      ctx.fillStyle = withAlpha(edge, 0.85);
      for (const s of resample(points, 0.9)) {
        const k = Math.round(s.d / 0.9) + seed;
        const side = hash(k) > 0.5 ? 1 : -1;
        const r = 0.08 + hash(k + 3) * 0.1;
        const off = TRAIL_W * (0.55 + hash(k + 5) * 0.25) * side;
        ctx.beginPath();
        ctx.arc(s.x + s.nx * off, s.y + s.ny * off, r, 0, Math.PI * 2);
        ctx.arc(s.x + s.nx * (off + side * r * 1.4), s.y + s.ny * (off + side * r * 1.4), r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "glitter": {
      for (const s of resample(points, 0.35)) {
        const k = Math.round(s.d / 0.35) + seed;
        const twinkle = animate ? (Math.sin(now / 160 + k * 1.7) + 1) / 2 : hash(k);
        if (twinkle < 0.35) continue;
        const off = (hash(k + 1) - 0.5) * TRAIL_W * 1.2;
        ctx.fillStyle = hash(k + 2) > 0.5 ? "#fff6c4" : "#ffffff";
        star(ctx, s.x + s.nx * off, s.y + s.ny * off, 0.08 + twinkle * 0.1, 4, 0.35);
        ctx.fill();
      }
      break;
    }
    case "washi": {
      // Translucent tape strips with a printed pattern and torn, slightly crooked joins.
      const samples = resample(points, 0.9);
      for (let i = 1; i < samples.length; i += 1) {
        const a = samples[i - 1];
        const b = samples[i];
        const k = i + seed;
        ctx.save();
        ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x) + (hash(k) - 0.5) * 0.12);
        ctx.fillStyle = withAlpha(i % 2 ? skin.light : "#ffffff", 0.55);
        ctx.fillRect(-0.5, -TRAIL_W * 0.6, 1, TRAIL_W * 1.2);
        ctx.fillStyle = withAlpha(skin.dark, 0.35);
        for (let d = -0.35; d <= 0.35; d += 0.35) {
          ctx.beginPath();
          ctx.arc(d, 0, 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      break;
    }
    case "footprints": {
      ctx.fillStyle = withAlpha(style.dark ? "#ffffff" : edge, 0.8);
      for (const s of resample(points, 0.5)) {
        const k = Math.round(s.d / 0.5);
        const side = k % 2 ? 1 : -1;
        const ang = Math.atan2(-s.nx, s.ny);
        ctx.save();
        ctx.translate(s.x + s.nx * side * TRAIL_W * 0.2, s.y + s.ny * side * TRAIL_W * 0.2);
        ctx.rotate(ang + Math.PI);
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.09, 0.06, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0.11, 0, 0.035, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      break;
    }
    case "paper-chain": {
      ctx.lineWidth = 0.07;
      const samples = resample(points, 0.42);
      samples.forEach((s, i) => {
        ctx.strokeStyle = i % 2 ? skin.light : style.dark ? "#ffffff" : skin.dark;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(Math.atan2(-s.nx, s.ny) + Math.PI / 2);
        ctx.beginPath();
        if (i % 2) ctx.ellipse(0, 0, 0.26, 0.12, 0, 0, Math.PI * 2);
        else ctx.ellipse(0, 0, 0.12, 0.17, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      });
      break;
    }
    case "comet": {
      ctx.strokeStyle = withAlpha("#ffffff", 0.85);
      ctx.lineWidth = TRAIL_W * 0.25;
      ctx.stroke(path);
      const samples = resample(points, 0.25);
      const total = samples.length;
      for (let k = 0; k < 9 && total > 2; k += 1) {
        const age = animate ? (now / 700 + k / 9) % 1 : k / 9;
        const s = samples[Math.min(total - 1, Math.floor(age * Math.min(total, 14)))];
        const off = (hash(k + seed) - 0.5) * TRAIL_W * (1 + age * 2);
        ctx.fillStyle = withAlpha(k % 2 ? skin.light : "#fff3b0", 1 - age);
        ctx.beginPath();
        ctx.arc(s.x + s.nx * off, s.y + s.ny * off, 0.06 + (1 - age) * 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Pieces

export const PIECE_R = 0.46;

/** A folded-paper piece, turned to face where it's going, with eyes so its heading is always clear. */
export function drawPiece(ctx: Ctx, style: ArtStyle, skin: PieceSkin, x: number, y: number, angle: number, now: number, animate: boolean, scale = 1) {
  const r = PIECE_R * scale;
  const ink = style.id === "newsprint" ? style.ink : style.dark ? mix(skin.light, "#ffffff", 0.4) : mix(skin.dark, style.ink, 0.3);
  ctx.save();
  ctx.translate(x, y);
  if (style.cast > 0) {
    ctx.fillStyle = "rgb(60 35 10 / 0.28)";
    ctx.beginPath();
    ctx.roundRect(-r + style.cast * 0.4, -r + style.cast, r * 2, r * 2, r * 0.35);
    ctx.fill();
  }
  if (style.raise > 0) {
    ctx.fillStyle = style.id === "newsprint" ? style.ink : skin.dark;
    ctx.beginPath();
    ctx.roundRect(-r, -r + style.raise * 1.2, r * 2, r * 2, r * 0.35);
    ctx.fill();
  }
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.35);
  ctx.fillStyle = style.id === "blueprint" ? mix(skin.color, "#dbeaff", 0.2) : skin.color;
  ctx.fill();

  ctx.save();
  ctx.clip();
  switch (skin.decor) {
    case "fold":
      ctx.fillStyle = skin.light;
      ctx.beginPath();
      ctx.moveTo(-r, r * 0.25);
      ctx.lineTo(-r * 0.25, r);
      ctx.lineTo(-r, r);
      ctx.closePath();
      ctx.fill();
      break;
    case "sticker":
      ctx.fillStyle = withAlpha("#ffffff", 0.45);
      ctx.beginPath();
      ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.5, r * 0.22, -0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "star":
      ctx.fillStyle = skin.light;
      star(ctx, -r * 0.35, 0, r * 0.42);
      ctx.fill();
      break;
    case "waves":
      ctx.strokeStyle = skin.light;
      ctx.lineWidth = r * 0.14;
      for (const row of [-0.45, 0.05, 0.55]) {
        ctx.beginPath();
        for (let i = 0; i <= 12; i += 1) {
          const px = -r + (i / 12) * r * 2;
          const py = row * r + Math.sin(i * 1.4 + (animate ? now / 300 : 0)) * r * 0.1;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    case "stripes":
      ctx.fillStyle = skin.dark;
      for (const sx of [-0.75, -0.15]) ctx.fillRect(sx * r, -r, r * 0.3, r * 2);
      break;
    case "foil": {
      const sweep = animate ? ((now / 1400) % 1) * 4 - 2 : 0;
      const g = ctx.createLinearGradient(-r + sweep * r, -r, r + sweep * r, r);
      g.addColorStop(0, withAlpha("#ffffff", 0));
      g.addColorStop(0.5, withAlpha("#ffffff", 0.65));
      g.addColorStop(1, withAlpha("#ffffff", 0));
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      break;
    }
    case "airmail": {
      // Red and white diagonal border dashes round the envelope edge.
      ctx.lineWidth = r * 0.22;
      ctx.setLineDash([r * 0.3, r * 0.3]);
      for (const [color, offset] of [["#e0263a", 0], ["#ffffff", r * 0.3]] as const) {
        ctx.strokeStyle = color;
        ctx.lineDashOffset = offset;
        ctx.beginPath();
        ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.35);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha("#ffffff", 0.8);
      ctx.fillRect(-r * 0.55, -r * 0.3, r * 0.5, r * 0.36);
      break;
    }
    case "veins":
      ctx.strokeStyle = withAlpha(skin.light, 0.85);
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r * 0.2, 0);
      for (const k of [-0.7, -0.35, 0]) {
        ctx.moveTo(k * r, 0);
        ctx.lineTo(k * r + r * 0.35, -r * 0.45);
        ctx.moveTo(k * r, 0);
        ctx.lineTo(k * r + r * 0.35, r * 0.45);
      }
      ctx.stroke();
      break;
    case "marbled":
      ctx.lineWidth = r * 0.1;
      for (let i = 0; i < 5; i += 1) {
        ctx.strokeStyle = i % 2 ? withAlpha(skin.light, 0.75) : withAlpha("#8ab0ff", 0.55);
        ctx.beginPath();
        for (let k = 0; k <= 16; k += 1) {
          const px = -r + (k / 16) * r * 2;
          const py = (i - 2) * r * 0.42 + Math.sin(k * 0.8 + i * 1.7) * r * 0.22 + Math.sin(k * 0.3 + i) * r * 0.12;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      break;
    case "stars":
      for (let i = 0; i < 6; i += 1) {
        const tw = animate ? (Math.sin(now / 250 + i * 2) + 1) / 2 : 0.7;
        ctx.fillStyle = withAlpha("#ffffff", 0.4 + tw * 0.6);
        star(ctx, (hash(i + 40) - 0.5) * r * 1.6 - r * 0.15, (hash(i + 50) - 0.5) * r * 1.6, r * (0.09 + tw * 0.08), 4, 0.4);
        ctx.fill();
      }
      break;
    default:
      break;
  }
  ctx.restore();

  ctx.strokeStyle = ink;
  ctx.lineWidth = style.id === "newsprint" ? 0.12 : 0.08;
  ctx.beginPath();
  ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.35);
  ctx.stroke();

  // Eyes look the way the piece is heading.
  for (const side of [-1, 1]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(r * 0.38, side * r * 0.36, r * 0.24, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#18121f";
    ctx.beginPath();
    ctx.arc(r * 0.46, side * r * 0.36, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A name tag above a piece. Computer opponents are always marked "CPU". */
export function drawLabel(ctx: Ctx, style: ArtStyle, skin: PieceSkin, x: number, y: number, name: string, cpu: boolean) {
  // Text is laid out at 40× and scaled down: tiny fractional font sizes render unevenly across browsers.
  const K = 40;
  ctx.save();
  ctx.translate(x, y - PIECE_R - 1.05);
  ctx.scale(1 / K, 1 / K);
  ctx.font = `700 20px ${style.font}`;
  const tagW = cpu ? 38 : 0;
  const width = ctx.measureText(name).width + tagW + 20;
  ctx.fillStyle = style.label.bg;
  ctx.strokeStyle = style.dark ? withAlpha(skin.light, 0.7) : withAlpha(skin.dark, 0.6);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-width / 2, 0, width, 29, 8);
  ctx.fill();
  ctx.stroke();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = style.label.fg;
  ctx.fillText(name, -width / 2 + 10, 15);
  if (cpu) {
    const tx = width / 2 - tagW - 4;
    ctx.fillStyle = skin.dark;
    ctx.beginPath();
    ctx.roundRect(tx, 5, tagW, 19, 5);
    ctx.fill();
    ctx.font = "800 13px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText("CPU", tx + tagW / 2, 15);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Particles

export type Scrap = { x: number; y: number; vx: number; vy: number; spin: number; angle: number; age: number; life: number; color: string; kind: "scrap" | "blot" };

export function scrapBurst(x: number, y: number, colors: readonly string[], count: number, speed: number, kind: Scrap["kind"] = "scrap", rng: () => number = Math.random): Scrap[] {
  return Array.from({ length: count }, (_, i) => {
    const a = rng() * Math.PI * 2;
    const v = speed * (0.35 + rng() * 0.65);
    return {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      spin: (rng() - 0.5) * 12,
      angle: rng() * Math.PI,
      age: 0,
      life: 0.6 + rng() * 0.6,
      color: colors[i % colors.length],
      kind,
    };
  });
}

export function stepScraps(scraps: Scrap[], dt: number) {
  for (const s of scraps) {
    s.age += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.9;
    s.vy *= 0.9;
    s.angle += s.spin * dt;
  }
  return scraps.filter((s) => s.age < s.life);
}

export function drawScraps(ctx: Ctx, style: ArtStyle, scraps: readonly Scrap[]) {
  for (const s of scraps) {
    const t = s.age / s.life;
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.fillStyle = s.color;
    if (s.kind === "blot") {
      ctx.beginPath();
      ctx.arc(0, 0, 0.18 * (1 - t * 0.4), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-0.16, -0.09, 0.32, 0.18);
      if (!style.dark) {
        ctx.strokeStyle = withAlpha(style.ink, 0.35);
        ctx.lineWidth = 0.03;
        ctx.strokeRect(-0.16, -0.09, 0.32, 0.18);
      }
    }
    ctx.restore();
  }
}
