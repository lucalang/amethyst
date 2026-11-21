"use client";

import type { GameLook } from "@/lib/game-cosmetics";
import { mix, withAlpha } from "./engine";
import { GRAPHITE, GROUT, INK, NEON_DARK, PAPER, type SnakeArtStyle } from "./snake-art";

/**
 * Snake cosmetics: skins (colors + back pattern), map themes (board colors + scenery), eating and
 * growth effects, and art styles. Shared by the game and the shop preview. Layering: the art style
 * decides how things are rendered (lines, shading, glow); skins and maps supply the colors and
 * patterns it renders, so every combination shows each purchase.
 */

type Ctx = CanvasRenderingContext2D;
export type Point = { x: number; y: number };
export type Seg = { pts: Point[]; d: number[] };
export type SnakePath = { segs: Seg[]; cellDist: number[]; total: number };

const hash = (n: number) => (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;
const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** A polyline with rounded corners, so turns bend instead of kinking. */
export function trace(ctx: Ctx, points: Point[], radius: number) {
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

export function pointIn(seg: Seg, d: number): Point {
  const last = seg.d.length - 1;
  for (let i = 1; i <= last; i += 1) {
    if (seg.d[i] >= d) {
      const k = Math.min(1, Math.max(0, (d - seg.d[i - 1]) / (seg.d[i] - seg.d[i - 1] || 1)));
      return { x: seg.pts[i - 1].x + (seg.pts[i].x - seg.pts[i - 1].x) * k, y: seg.pts[i - 1].y + (seg.pts[i].y - seg.pts[i - 1].y) * k };
    }
  }
  return seg.pts[last];
}

export function pointAt(path: SnakePath, d: number): Point {
  const seg = path.segs.find((s) => d <= s.d[s.d.length - 1] + 1e-9) ?? path.segs[path.segs.length - 1];
  return pointIn(seg, d);
}

/** The parts of the body path between two distances from the head. */
export function slice(path: SnakePath, a: number, b: number): Point[][] {
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

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

type Pattern = "spots" | "bands" | "diagonal" | "stripe" | "chevrons" | "rings" | "rosettes" | "stars" | "diamonds" | "zigzag" | "aurora";
type Skin = { hues: [string, string]; marks: [string, string] | null; glow?: [string, string]; pattern: Pattern };

const SKINS: Record<string, Skin> = {
  default: { hues: ["#46b03c", "#3d82d6"], marks: null, pattern: "spots" },
  "coral-bands": { hues: ["#ff7a5c", "#22a99a"], marks: ["#fff1d6", "#e9fffb"], pattern: "bands" },
  peppermint: { hues: ["#fbf3f0", "#eef6ff"], marks: ["#e0263a", "#2a7de1"], glow: ["#ff5470", "#5aa8ff"], pattern: "diagonal" },
  "midnight-stripe": { hues: ["#2f3180", "#6b2a63"], marks: ["#ffd447", "#7ff0ff"], glow: ["#7c86ff", "#ff6fd8"], pattern: "stripe" },
  tiger: { hues: ["#ff8a1c", "#f5c542"], marks: ["#2b1b26", "#2b1b26"], pattern: "chevrons" },
  "milk-snake": { hues: ["#d8262c", "#e0702a"], marks: ["#1e1418", "#1e1418"], pattern: "rings" },
  "snow-leopard": { hues: ["#dcdfe5", "#ebdfc9"], marks: ["#4a4652", "#5a4a3a"], glow: ["#e8eeff", "#ffe9c4"], pattern: "rosettes" },
  galaxy: { hues: ["#2a1f5e", "#103b5c"], marks: ["#fff7c2", "#d6f3ff"], glow: ["#b78bff", "#6fd0ff"], pattern: "stars" },
  diamondback: { hues: ["#c9a46a", "#a9b47a"], marks: ["#4a3020", "#3a3a22"], glow: ["#ffc46b", "#d8f07a"], pattern: "diamonds" },
  "emerald-boa": { hues: ["#12a05a", "#1f86c4"], marks: ["#f4fff2", "#f0f8ff"], glow: ["#3dffa0", "#5ad0ff"], pattern: "zigzag" },
  aurora: { hues: ["#151a3a", "#22163a"], marks: ["#4dffb0", "#ff7ad9"], glow: ["#4dffb0", "#c98bff"], pattern: "aurora" },
};

type Decor = "tufts" | "daisies" | "gingham" | "flakes" | "ripples" | "sprinkles" | "stars" | "cracks" | "raked" | "toadstools" | "leaves";
type Ground = { board: string; check: string; decor: string; rim: string; wrapRim: string; neon: string; kind: Decor };

const GROUNDS: Record<string, Ground> = {
  default: { board: "#f3e3b5", check: "#e9d49b", decor: "#c9ae6a", rim: "#7a5a2e", wrapRim: "#3f8fd8", neon: "#ffcf5a", kind: "tufts" },
  meadow: { board: "#a3d76c", check: "#94cb5e", decor: "#ffffff", rim: "#3f6e22", wrapRim: "#2f7fd0", neon: "#7dff8a", kind: "daisies" },
  gingham: { board: "#f6f8fc", check: "#9fc0ec", decor: "#ffffff", rim: "#35588e", wrapRim: "#e0484f", neon: "#6fb6ff", kind: "gingham" },
  snowfield: { board: "#eef4fb", check: "#dde8f5", decor: "#a9c3e2", rim: "#5a7896", wrapRim: "#3f8fd8", neon: "#9fe8ff", kind: "flakes" },
  "tide-pool": { board: "#86d9d2", check: "#73cdc7", decor: "#ffffff", rim: "#1f6f7a", wrapRim: "#ffb23f", neon: "#3ff0e0", kind: "ripples" },
  "candy-land": { board: "#ffd0e2", check: "#ffbcd5", decor: "#ff5fa2", rim: "#c2457a", wrapRim: "#3fa7d8", neon: "#ff6fc4", kind: "sprinkles" },
  "desert-night": { board: "#6e5d9c", check: "#62528f", decor: "#ffe9a8", rim: "#2b2050", wrapRim: "#7fd1ff", neon: "#b48cff", kind: "stars" },
  "lava-rock": { board: "#43373a", check: "#3a2f32", decor: "#ff7a2e", rim: "#1a1214", wrapRim: "#ffb020", neon: "#ff7a2e", kind: "cracks" },
  "zen-garden": { board: "#ece6d8", check: "#e4ddcd", decor: "#b9ae98", rim: "#5d5446", wrapRim: "#c0503a", neon: "#e8e2ff", kind: "raked" },
  "toadstool-grove": { board: "#5f8a3e", check: "#557e37", decor: "#d93b2b", rim: "#2f4a1c", wrapRim: "#f0c040", neon: "#ff5a48", kind: "toadstools" },
  "autumn-orchard": { board: "#c79a4e", check: "#bd8f45", decor: "#c4461e", rim: "#5e3a17", wrapRim: "#3f8fd8", neon: "#ff9a3a", kind: "leaves" },
};

export type SnakeTheme = { key: string; style: SnakeArtStyle; skin: Skin; ground: Ground; effect: string };
export type SnakeColors = { body: string; edge: string; mark: string };

const STYLES: SnakeArtStyle[] = ["pixel", "hand-drawn", "clay", "neon", "mosaic"];
export const DEAD = "#9b9488";

export function snakeTheme(look: GameLook): SnakeTheme {
  const style = STYLES.find((s) => s === look.style) ?? "cartoon";
  const skin = SKINS[look.skin] ?? SKINS.default;
  let ground = GROUNDS[look.map] ?? GROUNDS.default;
  if (style === "neon") {
    ground = {
      ...ground,
      board: mix(ground.board, NEON_DARK, 0.86),
      check: mix(ground.check, NEON_DARK, 0.8),
      decor: ground.neon,
      rim: ground.neon,
      wrapRim: mix(ground.wrapRim, "#ffffff", 0.2),
    };
  } else if (style === "hand-drawn") {
    ground = { ...ground, board: mix(ground.board, PAPER, 0.55), check: mix(ground.check, PAPER, 0.45), rim: GRAPHITE };
  } else if (style === "mosaic") {
    // Stone tesserae are a little chalky, and the frame is a band of dark grout.
    ground = { ...ground, board: mix(ground.board, "#e8dcc4", 0.18), check: mix(ground.check, "#d8c8a8", 0.18), rim: mix(ground.rim, GROUT, 0.5) };
  }
  const effect = look.effect ?? "";
  return { key: [style, look.skin ?? "", look.map ?? "", effect].join("|"), style, skin, ground, effect };
}

export function snakeColors(theme: SnakeTheme, which: number, fade = 0): SnakeColors {
  const { skin, style } = theme;
  const hue = skin.hues[which % 2];
  const mark = skin.marks?.[which % 2];
  if (style === "neon") {
    const glow = skin.glow?.[which % 2] ?? hue;
    return { body: mix(mix(hue, NEON_DARK, 0.7), DEAD, fade), edge: mix(glow, DEAD, fade), mark: mix(mark ?? glow, DEAD, fade) };
  }
  if (style === "hand-drawn") {
    const body = mix(mix(hue, PAPER, 0.28), DEAD, fade);
    return { body, edge: GRAPHITE, mark: mark ? mix(mark, DEAD, fade) : mix(body, GRAPHITE, 0.35) };
  }
  const body = mix(hue, DEAD, fade);
  if (style === "mosaic") return { body, edge: mix(GROUT, DEAD, fade * 0.5), mark: mark ? mix(mark, DEAD, fade) : mix(body, GROUT, 0.3) };
  const edge = style === "clay" ? mix(hue, "#1a1010", 0.38) : mix(hue, INK, 0.65);
  return { body, edge, mark: mark ? mix(mark, DEAD, fade) : mix(body, edge, 0.3) };
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

const SPRINKLES = ["#ff5fa2", "#ffd23f", "#4fcfff", "#7be07b", "#ffffff", "#b58cff"];

/** Board base, checks and scenery for the map theme, finished in the art style. */
export function paintGround(b: Ctx, theme: SnakeTheme, ox: number, oy: number, cell: number, cols: number, rows: number, corner: number, tint = (c: string) => c) {
  const g = theme.ground;
  const style = theme.style;
  const w = cols * cell;
  const h = rows * cell;
  b.beginPath();
  b.roundRect(ox, oy, w, h, corner);
  b.fillStyle = tint(g.board);
  b.fill();
  b.save();
  b.clip();
  b.fillStyle = tint(g.check);
  if (g.kind === "gingham") {
    b.globalAlpha = 0.5;
    for (let y = 0; y < rows; y += 2) b.fillRect(ox, oy + y * cell, w, cell);
    for (let x = 0; x < cols; x += 2) b.fillRect(ox + x * cell, oy, cell, h);
    b.globalAlpha = 1;
  } else {
    for (let y = 0; y < rows; y += 1)
      for (let x = y % 2; x < cols; x += 2) {
        if (style === "clay") {
          b.beginPath();
          b.roundRect(ox + (x + 0.07) * cell, oy + (y + 0.07) * cell, cell * 0.86, cell * 0.86, cell * 0.24);
          b.fill();
        } else b.fillRect(ox + x * cell, oy + y * cell, cell, cell);
      }
  }

  const salt = cols * 31;
  const spot = (c: number) => ({ x: ox + ((c % cols) + 0.25 + hash(c) * 0.5) * cell, y: oy + (Math.floor(c / cols) + 0.3 + hash(c * 7) * 0.4) * cell });
  const chance = (c: number, p: number) => hash(c + salt) <= p;
  const n = cols * rows;
  b.lineCap = style === "pixel" ? "square" : "round";
  b.lineJoin = "round";
  b.lineWidth = Math.max(1, cell * 0.05);
  switch (g.kind) {
    case "tufts": {
      b.strokeStyle = tint(g.decor);
      b.beginPath();
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.12)) continue;
        const { x, y } = spot(c);
        b.moveTo(x - cell * 0.1, y - cell * 0.08);
        b.lineTo(x, y + cell * 0.06);
        b.lineTo(x + cell * 0.1, y - cell * 0.1);
      }
      b.stroke();
      break;
    }
    case "daisies": {
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.1)) continue;
        const { x, y } = spot(c);
        b.fillStyle = tint(style === "neon" ? g.decor : "#ffffff");
        for (let k = 0; k < 5; k += 1) {
          const a = (k / 5) * Math.PI * 2 + hash(c * 3);
          b.beginPath();
          b.arc(x + Math.cos(a) * cell * 0.08, y + Math.sin(a) * cell * 0.08, cell * 0.06, 0, Math.PI * 2);
          b.fill();
        }
        b.fillStyle = "#ffc93a";
        b.beginPath();
        b.arc(x, y, cell * 0.05, 0, Math.PI * 2);
        b.fill();
      }
      break;
    }
    case "gingham": {
      // Little cross-stitches where the stripes meet.
      b.strokeStyle = withAlpha(g.decor, 0.8);
      b.lineWidth = Math.max(1, cell * 0.04);
      b.beginPath();
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.08)) continue;
        const { x, y } = spot(c);
        const k = cell * 0.07;
        b.moveTo(x - k, y - k);
        b.lineTo(x + k, y + k);
        b.moveTo(x + k, y - k);
        b.lineTo(x - k, y + k);
      }
      b.stroke();
      break;
    }
    case "flakes": {
      b.strokeStyle = tint(g.decor);
      b.lineWidth = Math.max(1, cell * 0.035);
      b.beginPath();
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.13)) continue;
        const { x, y } = spot(c);
        const r = cell * (0.09 + hash(c * 5) * 0.06);
        for (let k = 0; k < 3; k += 1) {
          const a = (k / 3) * Math.PI;
          b.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
          b.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
      }
      b.stroke();
      break;
    }
    case "ripples": {
      b.strokeStyle = withAlpha(style === "neon" ? g.decor : "#ffffff", 0.6);
      b.lineWidth = Math.max(1, cell * 0.04);
      b.beginPath();
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.14)) continue;
        const { x, y } = spot(c);
        b.moveTo(x + cell * 0.13, y);
        b.arc(x, y, cell * 0.13, 0, Math.PI);
        b.moveTo(x + cell * 0.22, y - cell * 0.02);
        b.arc(x, y - cell * 0.02, cell * 0.22, 0.15, Math.PI - 0.15);
      }
      b.stroke();
      break;
    }
    case "sprinkles": {
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.4)) continue;
        const { x, y } = spot(c);
        b.save();
        b.translate(x, y);
        b.rotate(hash(c * 11) * Math.PI);
        b.fillStyle = SPRINKLES[Math.floor(hash(c * 13) * SPRINKLES.length)];
        b.beginPath();
        b.roundRect(-cell * 0.09, -cell * 0.03, cell * 0.18, cell * 0.06, cell * 0.03);
        b.fill();
        b.restore();
      }
      break;
    }
    case "stars": {
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.16)) continue;
        const { x, y } = spot(c);
        b.fillStyle = withAlpha(g.decor, 0.55 + hash(c * 3) * 0.45);
        if (hash(c * 17) > 0.6) star4(b, x, y, cell * 0.08);
        else {
          b.beginPath();
          b.arc(x, y, cell * 0.03, 0, Math.PI * 2);
        }
        b.fill();
      }
      break;
    }
    case "cracks": {
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.1)) continue;
        const { x, y } = spot(c);
        b.beginPath();
        b.moveTo(x - cell * 0.22, y - cell * 0.1);
        b.lineTo(x - cell * 0.06, y + cell * 0.02);
        b.lineTo(x + cell * 0.04, y - cell * 0.08);
        b.lineTo(x + cell * 0.22, y + cell * 0.1);
        b.strokeStyle = withAlpha(g.decor, 0.35);
        b.lineWidth = Math.max(2, cell * 0.12);
        b.stroke();
        b.strokeStyle = "#ffb36b";
        b.lineWidth = Math.max(1, cell * 0.035);
        b.stroke();
      }
      break;
    }
    case "raked": {
      // Gravel raked in long waves, swirling into rings round a few mossy stones.
      const stones: Point[] = [];
      for (let c = 0; c < n; c += 1) if (chance(c, 0.05)) stones.push(spot(c));
      b.strokeStyle = tint(g.decor);
      b.lineWidth = Math.max(1, cell * 0.035);
      b.beginPath();
      for (let y = 0; y < rows * 3; y += 1) {
        const yy = oy + (y + 0.5) * (cell / 3);
        b.moveTo(ox, yy);
        for (let x = 0; x <= cols * 4; x += 1) b.lineTo(ox + (x * cell) / 4, yy + Math.sin(x * 0.9 + y * 0.3) * cell * 0.03);
      }
      b.stroke();
      for (const s of stones) {
        b.fillStyle = tint(g.board);
        b.beginPath();
        b.arc(s.x, s.y, cell * 0.55, 0, Math.PI * 2);
        b.fill();
        b.beginPath();
        for (const r of [0.3, 0.42, 0.54]) {
          b.moveTo(s.x + cell * r, s.y);
          b.arc(s.x, s.y, cell * r, 0, Math.PI * 2);
        }
        b.stroke();
        b.fillStyle = tint(style === "neon" ? g.neon : "#7d7a72");
        b.beginPath();
        b.ellipse(s.x, s.y, cell * 0.2, cell * 0.15, hash(s.x) * 3, 0, Math.PI * 2);
        b.fill();
        b.fillStyle = tint("#6f9a4a");
        b.beginPath();
        b.ellipse(s.x - cell * 0.04, s.y - cell * 0.06, cell * 0.1, cell * 0.06, 0.3, 0, Math.PI * 2);
        b.fill();
      }
      break;
    }
    case "toadstools": {
      b.fillStyle = tint("#3f6a26");
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.25)) continue;
        const { x, y } = spot(c * 3 + 1);
        b.beginPath();
        b.arc(x, y, cell * (0.05 + hash(c) * 0.05), 0, Math.PI * 2);
        b.fill();
      }
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.08)) continue;
        const { x, y } = spot(c);
        const s = cell * (0.12 + hash(c * 9) * 0.06);
        b.fillStyle = tint("#f3ead2");
        b.beginPath();
        b.roundRect(x - s * 0.3, y - s * 0.2, s * 0.6, s * 0.9, s * 0.2);
        b.fill();
        b.fillStyle = tint(g.decor);
        b.beginPath();
        b.ellipse(x, y - s * 0.2, s, s * 0.65, 0, Math.PI, 0);
        b.closePath();
        b.fill();
        b.fillStyle = tint("#ffffff");
        for (const [dx, dy] of [[-0.45, -0.45], [0.2, -0.6], [0.55, -0.35]]) {
          b.beginPath();
          b.arc(x + dx * s, y + dy * s, s * 0.12, 0, Math.PI * 2);
          b.fill();
        }
      }
      break;
    }
    case "leaves": {
      const hues = ["#c4461e", "#e2862a", "#d9b23a", "#9c3a1c"];
      for (let c = 0; c < n; c += 1) {
        if (!chance(c, 0.14)) continue;
        const { x, y } = spot(c);
        b.save();
        b.translate(x, y);
        b.rotate(hash(c * 7) * Math.PI * 2);
        b.fillStyle = tint(style === "neon" ? g.neon : hues[Math.floor(hash(c * 5) * hues.length)]);
        const s = cell * (0.13 + hash(c * 3) * 0.05);
        b.beginPath();
        for (let k = 0; k < 5; k += 1) {
          const a = -Math.PI / 2 + ((k - 2) / 2) * 1.1;
          b.lineTo(Math.cos(a) * s * (k % 2 ? 0.7 : 1), Math.sin(a) * s * (k % 2 ? 0.7 : 1));
          b.lineTo(Math.cos(a + 0.28) * s * 0.4, Math.sin(a + 0.28) * s * 0.4);
        }
        b.lineTo(0, s * 0.35);
        b.closePath();
        b.fill();
        b.strokeStyle = withAlpha("#5e3a17", 0.5);
        b.lineWidth = Math.max(0.6, cell * 0.02);
        b.beginPath();
        b.moveTo(0, s * 0.6);
        b.lineTo(0, -s * 0.7);
        b.stroke();
        b.restore();
      }
      break;
    }
  }

  if (style === "hand-drawn") {
    // Wobbly pencil grid and paper fibres.
    b.strokeStyle = withAlpha(GRAPHITE, 0.16);
    b.lineWidth = Math.max(0.8, cell * 0.025);
    b.beginPath();
    for (let x = 1; x < cols; x += 1) {
      const j = (hash(x * 13) - 0.5) * cell * 0.12;
      b.moveTo(ox + x * cell + j, oy);
      b.lineTo(ox + x * cell - j, oy + h);
    }
    for (let y = 1; y < rows; y += 1) {
      const j = (hash(y * 29) - 0.5) * cell * 0.12;
      b.moveTo(ox, oy + y * cell + j);
      b.lineTo(ox + w, oy + y * cell - j);
    }
    b.stroke();
    b.strokeStyle = withAlpha(GRAPHITE, 0.07);
    b.beginPath();
    for (let c = 0; c < n; c += 1) {
      if (hash(c * 23 + 5) > 0.3) continue;
      const { x, y } = spot(c * 3 + 1);
      b.moveTo(x, y);
      b.quadraticCurveTo(x + cell * 0.1, y - cell * 0.08, x + cell * 0.22, y + cell * 0.02);
    }
    b.stroke();
  } else if (style === "neon") {
    b.strokeStyle = withAlpha(g.neon, 0.14);
    b.lineWidth = 1;
    b.beginPath();
    for (let x = 1; x < cols; x += 1) {
      b.moveTo(ox + x * cell, oy);
      b.lineTo(ox + x * cell, oy + h);
    }
    for (let y = 1; y < rows; y += 1) {
      b.moveTo(ox, oy + y * cell);
      b.lineTo(ox + w, oy + y * cell);
    }
    b.stroke();
  } else if (style === "mosaic") {
    // Rows of tesserae: each stone a touch lighter or darker, laid in offset courses with grout between.
    const t = cell / 3;
    for (let y = 0; y < rows * 3; y += 1)
      for (let x = -1; x < cols * 3; x += 1) {
        const v = hash(x * 131 + y * 977);
        if (v > 0.45) continue;
        b.fillStyle = v < 0.22 ? "rgb(255 255 255 / 0.1)" : "rgb(0 0 0 / 0.07)";
        b.fillRect(ox + (x + (y % 2) * 0.5) * t, oy + y * t, t, t);
      }
    b.strokeStyle = withAlpha(GROUT, 0.32);
    b.lineWidth = Math.max(0.8, cell * 0.035);
    b.beginPath();
    for (let y = 0; y <= rows * 3; y += 1) {
      b.moveTo(ox, oy + y * t);
      b.lineTo(ox + w, oy + y * t);
      for (let x = 0; x <= cols * 3; x += 1) {
        const xx = ox + (x + (y % 2) * 0.5) * t + (hash(x + y * 53) - 0.5) * t * 0.15;
        b.moveTo(xx, oy + y * t);
        b.lineTo(xx, oy + (y + 1) * t);
      }
    }
    b.stroke();
  } else if (style === "clay") {
    // Thumb-pressed dimples.
    for (let c = 0; c < n; c += 1) {
      if (hash(c * 19 + 3) > 0.14) continue;
      const { x, y } = spot(c * 5 + 2);
      b.beginPath();
      b.arc(x, y, cell * 0.12, 0, Math.PI * 2);
      b.fillStyle = "rgb(0 0 0 / 0.06)";
      b.fill();
      b.beginPath();
      b.arc(x - cell * 0.03, y - cell * 0.03, cell * 0.08, 0, Math.PI * 2);
      b.fillStyle = "rgb(255 255 255 / 0.16)";
      b.fill();
    }
  }
  b.restore();
}

/** The board's outer frame. */
export function paintRim(ctx: Ctx, theme: SnakeTheme, x: number, y: number, w: number, h: number, corner: number, cell: number, wrap: boolean, override: string | null) {
  ctx.beginPath();
  ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, corner);
  const color = override ?? (wrap ? theme.ground.wrapRim : theme.ground.rim);
  if (wrap) ctx.setLineDash([Math.max(4, cell * 0.4), Math.max(4, cell * 0.3)]);
  if (theme.style === "neon") {
    ctx.strokeStyle = withAlpha(color, 0.25);
    ctx.lineWidth = 8;
    ctx.stroke();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = wrap ? 2.5 : 3;
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------------
// Snake
// ---------------------------------------------------------------------------

export function star4(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
}

export function heart(ctx: Ctx, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.4);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.3, x - s * 0.5, y - s * 1.05, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.5, y - s * 1.05, x + s * 1.1, y - s * 0.3, x, y + s * 0.4);
  ctx.closePath();
}

/** A spiky comic starburst. */
function burst(ctx: Ctx, x: number, y: number, outer: number, inner: number, points: number) {
  ctx.beginPath();
  for (let k = 0; k < points * 2; k += 1) {
    const a = (k / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 ? inner : outer;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
}

function line(ctx: Ctx, ax: number, ay: number, bx: number, by: number) {
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

/** One cell's back marking for the skin's pattern. */
function drawMarking(ctx: Ctx, pattern: Pattern, p: Point, angle: number, width: number, cell: number, id: number, color: string, now: number, moving: boolean) {
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  const nx = -ty;
  const ny = tx;
  const w = width;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "butt";
  switch (pattern) {
    case "spots":
      ctx.beginPath();
      if (id % 2) ctx.arc(p.x, p.y, w * 0.17, 0, Math.PI * 2);
      else ctx.ellipse(p.x, p.y, w * 0.11, w * 0.2, angle, 0, Math.PI * 2);
      ctx.fill();
      return;
    case "bands":
      ctx.lineWidth = w * 0.24;
      line(ctx, p.x + nx * w * 0.47, p.y + ny * w * 0.47, p.x - nx * w * 0.47, p.y - ny * w * 0.47);
      return;
    case "rings":
      if (id % 2) return;
      ctx.lineWidth = w * 0.42;
      line(ctx, p.x + nx * w * 0.48, p.y + ny * w * 0.48, p.x - nx * w * 0.48, p.y - ny * w * 0.48);
      ctx.strokeStyle = "#fff0cc";
      ctx.lineWidth = w * 0.14;
      line(ctx, p.x + nx * w * 0.48, p.y + ny * w * 0.48, p.x - nx * w * 0.48, p.y - ny * w * 0.48);
      return;
    case "diagonal": {
      ctx.lineWidth = w * 0.16;
      const ca = Math.cos(0.65);
      const sa = Math.sin(0.65);
      const dx = nx * ca - ny * sa;
      const dy = nx * sa + ny * ca;
      for (const o of [-0.25, 0.25]) {
        const cx = p.x + tx * o * cell;
        const cy = p.y + ty * o * cell;
        line(ctx, cx + dx * w * 0.42, cy + dy * w * 0.42, cx - dx * w * 0.42, cy - dy * w * 0.42);
      }
      return;
    }
    case "chevrons": {
      ctx.lineWidth = w * 0.15;
      ctx.lineCap = "round";
      const shift = (id % 2 ? 0.1 : -0.1) * cell;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(p.x + nx * side * w * 0.46 - tx * cell * 0.14 + tx * shift, p.y + ny * side * w * 0.46 - ty * cell * 0.14 + ty * shift);
        ctx.lineTo(p.x + nx * side * w * 0.14 + tx * cell * 0.04 + tx * shift, p.y + ny * side * w * 0.14 + ty * cell * 0.04 + ty * shift);
        ctx.stroke();
      }
      return;
    }
    case "rosettes": {
      const side = id % 2 ? 1 : -1;
      const cx = p.x + nx * side * w * 0.12;
      const cy = p.y + ny * side * w * 0.12;
      ctx.fillStyle = withAlpha(color, 0.22);
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      for (let k = 0; k < 5; k += 1) {
        const a = (k / 5) * Math.PI * 2 + id;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * w * 0.17, cy + Math.sin(a) * w * 0.17, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    case "stars": {
      const twinkle = moving ? 0.7 + 0.3 * Math.sin(now / 280 + id) : 1;
      const ox = (hash(id) - 0.5) * w * 0.5;
      const oy = (hash(id * 3) - 0.5) * cell * 0.3;
      star4(ctx, p.x + nx * ox + tx * oy, p.y + ny * ox + ty * oy, w * 0.16 * twinkle);
      ctx.fill();
      ctx.globalAlpha *= 0.7;
      ctx.beginPath();
      ctx.arc(p.x - nx * ox * 0.8 - tx * oy, p.y - ny * ox * 0.8 - ty * oy, w * 0.04, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.7;
      return;
    }
    case "diamonds": {
      // A dark diamond with a cream rim on every cell, point to point down the spine.
      const len = cell * 0.46;
      const half = w * 0.32;
      const diamond = (k: number) => {
        ctx.beginPath();
        ctx.moveTo(p.x + tx * len * k, p.y + ty * len * k);
        ctx.lineTo(p.x + nx * half * k, p.y + ny * half * k);
        ctx.lineTo(p.x - tx * len * k, p.y - ty * len * k);
        ctx.lineTo(p.x - nx * half * k, p.y - ny * half * k);
        ctx.closePath();
      };
      diamond(1);
      ctx.fillStyle = "#f3e2b8";
      ctx.fill();
      diamond(0.74);
      ctx.fillStyle = color;
      ctx.fill();
      return;
    }
    case "zigzag": {
      // White lightning flashes: a broken zig-zag bolt across the back.
      ctx.lineWidth = w * 0.1;
      ctx.lineJoin = "miter";
      const side = id % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(p.x - tx * cell * 0.4 + nx * side * w * 0.05, p.y - ty * cell * 0.4 + ny * side * w * 0.05);
      ctx.lineTo(p.x - tx * cell * 0.12 + nx * side * w * 0.34, p.y - ty * cell * 0.12 + ny * side * w * 0.34);
      ctx.lineTo(p.x + tx * cell * 0.02 - nx * side * w * 0.1, p.y + ty * cell * 0.02 - ny * side * w * 0.1);
      ctx.lineTo(p.x + tx * cell * 0.3 + nx * side * w * 0.22, p.y + ty * cell * 0.3 + ny * side * w * 0.22);
      ctx.stroke();
      ctx.lineJoin = "round";
      return;
    }
    case "aurora": {
      // Curtains of light: two soft ribbons whose sway runs down the body over time.
      const phase = moving ? now / 700 : 0;
      for (const [k, alpha] of [[0, 0.55], [2.1, 0.35]] as const) {
        const off = Math.sin(id * 0.9 + phase + k) * w * 0.22;
        ctx.globalAlpha *= alpha;
        ctx.lineWidth = w * 0.18;
        ctx.lineCap = "round";
        ctx.strokeStyle = k ? "#c98bff" : color;
        line(ctx, p.x + nx * off - tx * cell * 0.45, p.y + ny * off - ty * cell * 0.45, p.x + nx * off * -0.4 + tx * cell * 0.45, p.y + ny * off * -0.4 + ty * cell * 0.45);
        ctx.globalAlpha /= alpha;
      }
      return;
    }
    case "stripe":
      return;
  }
}

/** The decoration riding on a swallowed-fruit bulge. */
function drawGrowthMark(ctx: Ctx, effect: string, x: number, y: number, r: number, now: number, moving: boolean) {
  const pulse = moving ? 0.85 + 0.15 * Math.sin(now / 120) : 1;
  switch (effect) {
    case "bubbles":
      ctx.beginPath();
      ctx.arc(x, y, r * 0.5 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = "rgb(255 255 255 / 0.85)";
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - r * 0.18, y - r * 0.18, r * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      return;
    case "confetti":
      ["#ffd23f", "#4fcfff", "#ff5fa2"].forEach((c, i) => {
        const a = (i / 3) * Math.PI * 2 + (moving ? now / 300 : 0);
        ctx.fillStyle = c;
        ctx.fillRect(x + Math.cos(a) * r * 0.35 - r * 0.12, y + Math.sin(a) * r * 0.35 - r * 0.07, r * 0.24, r * 0.14);
      });
      return;
    case "hearts":
      heart(ctx, x, y, r * 0.45 * pulse);
      ctx.fillStyle = "#ff5d8f";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.stroke();
      return;
    case "pixel-burst": {
      const s = r * 0.5 * pulse;
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - s / 2, y - s / 2, s / 3, s / 3);
      return;
    }
    case "stardust":
      star4(ctx, x, y, r * 0.6 * pulse);
      ctx.fillStyle = "#ffe27a";
      ctx.fill();
      return;
    case "petals":
      ctx.fillStyle = "#ff9ec4";
      for (const a of [0.5, 0.5 + Math.PI]) {
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2, r * 0.3, r * 0.16, a, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    case "shockwave":
      ctx.beginPath();
      ctx.arc(x, y, r * 0.75 * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = "rgb(255 255 255 / 0.7)";
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      return;
    case "nom-burst":
      burst(ctx, x, y, r * 0.55 * pulse, r * 0.32 * pulse, 8);
      ctx.fillStyle = "#ffe14a";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, r * 0.08);
      ctx.stroke();
      return;
    case "static-crackle": {
      const flick = moving ? Math.floor(now / 70) : 0;
      ctx.strokeStyle = "#bfe9ff";
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.lineJoin = "miter";
      ctx.beginPath();
      for (let k = 0; k < 3; k += 1) {
        const a = hash(flick * 3 + k) * Math.PI * 2;
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a + 0.5) * r * 0.3, y + Math.sin(a + 0.5) * r * 0.3);
        ctx.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
      }
      ctx.stroke();
      ctx.lineJoin = "round";
      return;
    }
    case "ink-splash":
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.5 * pulse);
      ctx.quadraticCurveTo(x + r * 0.38, y + r * 0.05, x, y + r * 0.35);
      ctx.quadraticCurveTo(x - r * 0.38, y + r * 0.05, x, y - r * 0.5 * pulse);
      ctx.fillStyle = "#1d1b3a";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x - r * 0.08, y + r * 0.08, r * 0.07, 0, Math.PI * 2);
      ctx.fillStyle = "rgb(255 255 255 / 0.7)";
      ctx.fill();
      return;
  }
}

export type BodySpec = {
  path: SnakePath;
  px: (p: Point) => Point;
  cell: number;
  sections: { from: number; to: number; ghost: boolean }[];
  neck: number;
  blobs: { d: number; r: number }[];
  /** Distances of swallowed-fruit bulges. */
  swallows: number[];
  gaps: number[];
  marks: { d: number; id: number; angle: number }[];
  colors: SnakeColors;
  ghost: SnakeColors;
  theme: SnakeTheme;
  now: number;
  moving: boolean;
};

/** The body: outline, fill, the skin's markings and the art style's shading. */
export function paintSnakeBody(ctx: Ctx, spec: BodySpec) {
  const { path, px, cell, sections, neck, theme, colors, ghost, now, moving } = spec;
  const style = theme.style;
  const width = cell * 0.72;
  const edge = Math.max(1.4, cell * 0.08);
  const corner = style === "pixel" ? cell * 0.15 : cell * 0.5;
  const sectionAt = (d: number) => sections.find((sec) => d >= sec.from - 1e-6 && d <= sec.to + 1e-6);
  ctx.lineJoin = style === "pixel" ? "miter" : "round";
  ctx.lineCap = "butt";

  const tube = (color: (ghost: boolean) => string, extra: number, dashed = false, from = 0, trim = 0, blobs = true) => {
    const w = Math.max(0.5, width + extra * 2);
    for (const sec of sections) {
      ctx.strokeStyle = color(sec.ghost);
      ctx.lineWidth = w;
      if (dashed && sec.ghost) ctx.setLineDash([cell * 0.22, cell * 0.14]);
      for (const part of slice(path, sec.from + from, Math.min(sec.to, neck) - trim)) {
        trace(ctx, part.map(px), corner);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (!blobs) return;
    for (const blob of spec.blobs) {
      const sec = sectionAt(blob.d);
      if (!sec) continue;
      const p = px(pointAt(path, blob.d));
      ctx.fillStyle = color(sec.ghost);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, blob.r + extra), 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const edgeOf = (g: boolean) => (g ? ghost.edge : colors.edge);
  const bodyOf = (g: boolean) => (g ? ghost.body : colors.body);

  if (style === "clay") {
    const shadow = mix(theme.ground.board, "#3a2414", 0.22);
    ctx.save();
    ctx.translate(cell * 0.05, cell * 0.1);
    tube(() => shadow, edge * 0.6);
    ctx.restore();
    tube(edgeOf, edge * 0.45, true);
  } else if (style === "neon") {
    tube((g) => withAlpha(edgeOf(g), 0.12), edge * 4.5);
    tube((g) => withAlpha(edgeOf(g), 0.28), edge * 2.4);
    tube(edgeOf, edge * 0.8, true);
  } else if (style === "hand-drawn") {
    ctx.save();
    ctx.translate(cell * 0.06, cell * 0.05);
    tube((g) => mix(edgeOf(g), theme.ground.board, 0.55), edge * 0.6, true);
    ctx.restore();
    tube(edgeOf, edge * 0.7, true);
  } else tube(edgeOf, edge, true);
  tube(bodyOf, 0);

  if (style === "clay") {
    ctx.save();
    ctx.translate(-cell * 0.05, -cell * 0.08);
    tube((g) => (g ? ghost.body : mix(colors.body, "#ffffff", 0.2)), -width * 0.2);
    ctx.lineCap = "round";
    tube(() => "rgb(255 255 255 / 0.35)", -width * 0.42, false, 0.3, 0.1, false);
    ctx.restore();
  } else if (style === "mosaic") {
    // Two courses of tesserae run along the body, cut across into stones at a steady pitch.
    ctx.lineCap = "butt";
    tube((g) => withAlpha(g ? ghost.edge : colors.edge, 0.55), -width * 0.44, false, 0, 0, false);
    tube((g) => (g ? ghost.body : mix(colors.body, "#ffffff", 0.08)), -width * 0.48, false, 0, 0, false);
    ctx.strokeStyle = withAlpha(colors.edge, 0.55);
    ctx.lineWidth = Math.max(0.8, cell * 0.035);
    ctx.beginPath();
    const pitch = 0.22;
    for (const sec of sections) {
      for (let d = sec.from + pitch / 2; d < Math.min(sec.to, neck); d += pitch) {
        const a = pointAt(path, d);
        const b2 = pointAt(path, Math.min(d + 0.05, path.total));
        const len = Math.hypot(b2.x - a.x, b2.y - a.y) || 1;
        const nx = -(b2.y - a.y) / len;
        const ny = (b2.x - a.x) / len;
        const p = px(a);
        const step = Math.round(d / pitch) % 2 ? 1 : -1;
        // Inner and outer stones are staggered like real coursework.
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + nx * step * width * 0.5, p.y + ny * step * width * 0.5);
        const q = px(pointAt(path, Math.min(d + pitch / 2, path.total)));
        ctx.moveTo(q.x, q.y);
        ctx.lineTo(q.x - nx * step * width * 0.5, q.y - ny * step * width * 0.5);
      }
    }
    ctx.stroke();
  } else if (style === "hand-drawn") {
    // Pencil hatching on the shaded side of every segment.
    ctx.strokeStyle = withAlpha(GRAPHITE, 0.4);
    ctx.lineWidth = Math.max(0.8, cell * 0.03);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const m of spec.marks) {
      const p = px(pointAt(path, m.d));
      for (let k = -1; k <= 1; k += 1) {
        const x = p.x + width * 0.12 + k * cell * 0.11;
        const y = p.y + width * 0.12;
        ctx.moveTo(x - width * 0.12, y + width * 0.12);
        ctx.lineTo(x + width * 0.12, y - width * 0.12);
      }
    }
    ctx.stroke();
  }

  const pattern = theme.skin.pattern;
  if (pattern === "stripe") {
    ctx.lineCap = "round";
    tube((g) => (g ? ghost.mark : colors.mark), -width * 0.37, false, 0.2, 0.05, false);
  } else {
    for (const m of spec.marks) {
      const sec = sectionAt(m.d);
      drawMarking(ctx, pattern, px(pointAt(path, m.d)), m.angle, width, cell, m.id, sec?.ghost ? ghost.mark : colors.mark, now, moving);
    }
  }

  if (style === "cartoon" || style === "pixel") {
    ctx.save();
    ctx.translate(-cell * 0.05, -cell * 0.08);
    ctx.lineCap = style === "pixel" ? "butt" : "round";
    ctx.strokeStyle = withAlpha("#ffffff", style === "pixel" ? 0.4 : 0.3);
    ctx.lineWidth = width * (style === "pixel" ? 0.16 : 0.22);
    for (const sec of sections) {
      if (sec.ghost) continue;
      for (const part of slice(path, sec.from + 0.3, Math.min(sec.to, neck) - 0.1)) {
        trace(ctx, part.map(px), corner);
        ctx.stroke();
      }
    }
    ctx.restore();
  } else if (style === "neon") {
    ctx.lineCap = "round";
    tube((g) => withAlpha(edgeOf(g), 0.5), -width * 0.44, false, 0.25, 0.1, false);
  }

  // Cheese holes: a dashed ring marks each safe gap.
  for (const d of spec.gaps) {
    const p = px(pointAt(path, d));
    ctx.beginPath();
    ctx.arc(p.x, p.y, width * 0.34, 0, Math.PI * 2);
    ctx.setLineDash([cell * 0.1, cell * 0.08]);
    ctx.strokeStyle = withAlpha(colors.edge, 0.75);
    ctx.lineWidth = Math.max(1, cell * 0.06);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (theme.effect) {
    for (const d of spec.swallows) {
      const p = px(pointAt(path, d));
      drawGrowthMark(ctx, theme.effect, p.x, p.y, width * 0.6, now, moving);
    }
  }
}

export type HeadSpec = {
  x: number;
  y: number;
  angle: number;
  cell: number;
  /** Mouth opening after a bite, 0–1. */
  eat: number;
  colors: SnakeColors;
  theme: SnakeTheme;
  dead: boolean;
  hungry: boolean;
  happy: boolean;
  blinking: boolean;
  tongue: boolean;
  dizzy: boolean;
  worried: boolean;
  now: number;
  moving: boolean;
};

export function paintSnakeHead(ctx: Ctx, h: HeadSpec) {
  const { cell, colors, theme } = h;
  const style = theme.style;
  const edge = Math.max(1.4, cell * 0.08);
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle);
  const r = cell * (0.42 + h.eat * 0.08);
  const head = (grow: number) => {
    ctx.beginPath();
    if (style === "pixel") ctx.roundRect(cell * 0.05 - r * 1.12 - grow, -r - grow, (r * 1.12 + grow) * 2, (r + grow) * 2, r * 0.45);
    else ctx.ellipse(cell * 0.05, 0, r * 1.12 + grow, r + grow, 0, 0, Math.PI * 2);
  };
  if (style === "neon") {
    head(edge * 3.2);
    ctx.fillStyle = withAlpha(colors.edge, 0.18);
    ctx.fill();
  } else if (style === "clay") {
    ctx.save();
    ctx.translate(cell * 0.06, cell * 0.08);
    head(edge * 0.6);
    ctx.fillStyle = mix(theme.ground.board, "#3a2414", 0.22);
    ctx.fill();
    ctx.restore();
  } else if (style === "hand-drawn") {
    ctx.save();
    ctx.translate(cell * 0.05, cell * 0.05);
    head(edge * 0.7);
    ctx.fillStyle = mix(colors.edge, theme.ground.board, 0.55);
    ctx.fill();
    ctx.restore();
  }
  head(style === "clay" ? edge * 0.45 : style === "hand-drawn" ? edge * 0.7 : edge);
  ctx.fillStyle = colors.edge;
  ctx.fill();
  head(0);
  if (style === "clay") {
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.2);
    g.addColorStop(0, mix(colors.body, "#ffffff", 0.35));
    g.addColorStop(0.6, colors.body);
    g.addColorStop(1, mix(colors.body, "#000000", 0.2));
    ctx.fillStyle = g;
  } else ctx.fillStyle = colors.body;
  ctx.fill();
  if (style === "mosaic") {
    // The head is pieced from wedge-shaped stones fanning out from the snout.
    ctx.save();
    head(0);
    ctx.clip();
    ctx.strokeStyle = withAlpha(colors.edge, 0.5);
    ctx.lineWidth = Math.max(0.8, cell * 0.035);
    ctx.beginPath();
    for (let k = -3; k <= 3; k += 1) {
      const a = Math.PI + k * 0.42;
      ctx.moveTo(r * 0.6, 0);
      ctx.lineTo(r * 0.6 + Math.cos(a) * r * 2.4, Math.sin(a) * r * 2.4);
    }
    for (const rr of [0.55, 1.05]) {
      ctx.moveTo(r * 0.6 + Math.cos(Math.PI * 0.4) * r * rr, Math.sin(Math.PI * 0.4) * r * rr);
      ctx.arc(r * 0.6, 0, r * rr, Math.PI * 0.4, Math.PI * 1.6);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (style === "cartoon" || style === "pixel") {
    ctx.beginPath();
    if (style === "pixel") ctx.rect(-r * 0.5, -r * 0.6, r * 0.6, r * 0.22);
    else ctx.ellipse(-r * 0.15, -r * 0.42, r * 0.42, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha("#ffffff", 0.25);
    ctx.fill();
  }
  // Mouth: open toward fruit just ahead, tongue out after a crash, an occasional tongue flick.
  if (h.hungry || h.dead) {
    ctx.beginPath();
    ctx.ellipse(r * 0.98, 0, r * 0.26, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#3a1020";
    ctx.fill();
  }
  if (h.dead || h.tongue) {
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
  const inkColor = style === "hand-drawn" ? GRAPHITE : INK;
  for (const side of [-1, 1]) {
    const ex = cell * 0.16;
    const ey = side * cell * 0.21;
    ctx.beginPath();
    ctx.arc(ex - cell * 0.12, ey * 1.25, cell * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha("#ff7d9c", 0.45);
    ctx.fill();
    ctx.strokeStyle = style === "neon" ? "#ffffff" : inkColor;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1, cell * 0.055);
    if (h.dead) {
      const k = cell * 0.075;
      ctx.beginPath();
      ctx.moveTo(ex - k, ey - k);
      ctx.lineTo(ex + k, ey + k);
      ctx.moveTo(ex + k, ey - k);
      ctx.lineTo(ex - k, ey + k);
      ctx.stroke();
      continue;
    }
    if (h.happy || h.blinking) {
      ctx.beginPath();
      if (h.happy) ctx.arc(ex, ey, cell * 0.08, Math.PI * 0.5 + 0.4, Math.PI * 1.5 - 0.4);
      else {
        ctx.moveTo(ex, ey - cell * 0.09);
        ctx.lineTo(ex, ey + cell * 0.09);
      }
      ctx.stroke();
      continue;
    }
    ctx.strokeStyle = inkColor;
    ctx.beginPath();
    if (style === "pixel") ctx.rect(ex - cell * 0.13, ey - cell * 0.13, cell * 0.26, cell * 0.26);
    else ctx.arc(ex, ey, cell * 0.135, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = Math.max(0.8, cell * 0.035);
    ctx.stroke();
    if (h.dizzy) {
      // Dizzy spiral eyes while controls are scrambled.
      ctx.beginPath();
      for (let k = 0; k <= 14; k += 1) {
        const a = k * 0.75 + (h.moving ? h.now / 160 : 0);
        const rr = cell * 0.008 * k;
        ctx.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr);
      }
      ctx.lineWidth = Math.max(0.8, cell * 0.03);
      ctx.stroke();
    } else {
      ctx.beginPath();
      if (style === "pixel") ctx.rect(ex - cell * 0.02, ey - cell * 0.07, cell * 0.13, cell * 0.14);
      else ctx.arc(ex + cell * 0.045, ey, cell * 0.072, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex + cell * 0.065, ey - cell * 0.03, cell * 0.024, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    }
    if (h.worried) {
      ctx.beginPath();
      ctx.moveTo(ex - cell * 0.1, ey - side * cell * 0.2);
      ctx.lineTo(ex + cell * 0.08, ey - side * cell * 0.13);
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Eating effects
// ---------------------------------------------------------------------------

const EAT_MS: Record<string, number> = { bubbles: 800, confetti: 750, hearts: 800, "pixel-burst": 600, stardust: 700, petals: 850, shockwave: 650, "nom-burst": 700, "static-crackle": 520, "ink-splash": 900 };
export const eatLife = (effect: string) => EAT_MS[effect] ?? 560;
const CONFETTI = ["#ffd23f", "#4fcfff", "#ff5fa2", "#7be07b", "#ffffff", "#b58cff"];

/** The burst when a fruit is eaten; `k` runs 0–1 over `eatLife`. `full` adds particles and spin. */
export function drawEatEffect(ctx: Ctx, effect: string, x: number, y: number, cell: number, k: number, color: string, full: boolean, seed: number, reach = 0.85) {
  const e = easeOut(k);
  const fadeOut = 1 - k;
  switch (effect) {
    case "bubbles": {
      const n = full ? 7 : 4;
      for (let i = 0; i < n; i += 1) {
        const a = seed + i * 2.4;
        const bx = x + Math.cos(a) * cell * 0.45 * e + (full ? Math.sin(k * 7 + i) * cell * 0.08 : 0);
        const by = y - e * cell * (0.5 + hash(i + 1) * 0.7);
        const r = cell * (0.08 + hash(i + 3) * 0.09);
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(color, 0.18 * fadeOut);
        ctx.fill();
        ctx.strokeStyle = withAlpha("#ffffff", 0.9 * fadeOut);
        ctx.lineWidth = Math.max(1, cell * 0.035);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(bx - r * 0.35, by - r * 0.35, r * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha("#ffffff", fadeOut);
        ctx.fill();
      }
      return;
    }
    case "confetti": {
      const n = full ? 14 : 7;
      ctx.globalAlpha = 1 - k * k;
      for (let i = 0; i < n; i += 1) {
        const a = seed + (i / n) * Math.PI * 2;
        const d = cell * (0.2 + e * 1.1 * (0.7 + hash(i) * 0.5));
        ctx.save();
        ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d + k * k * cell * 0.9);
        ctx.rotate(full ? k * 8 + i : i);
        ctx.fillStyle = i === 0 ? color : CONFETTI[i % CONFETTI.length];
        ctx.fillRect(-cell * 0.07, -cell * 0.035, cell * 0.14, cell * 0.07);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      return;
    }
    case "hearts": {
      const n = full ? 5 : 3;
      ctx.globalAlpha = fadeOut;
      for (let i = 0; i < n; i += 1) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.6;
        const d = cell * (0.3 + e * 0.9);
        heart(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d - k * cell * 0.3, cell * 0.17 * (1 - k * 0.4));
        ctx.fillStyle = i % 2 ? "#ff8fb1" : "#ff4f86";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1, cell * 0.03);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    }
    case "pixel-burst": {
      const n = full ? 12 : 6;
      const snap = Math.max(1, cell * 0.12);
      const q = (v: number) => Math.round(v / snap) * snap;
      const s = q(cell * 0.2 * (1 - k)) || snap;
      ctx.globalAlpha = fadeOut;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2;
        const d = cell * (0.25 + e * 1.2);
        ctx.fillStyle = i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? color : "#ffd23f";
        ctx.fillRect(q(x + Math.cos(a) * d) - s / 2, q(y + Math.sin(a) * d) - s / 2, s, s);
      }
      const box = q(cell * (0.4 + e * reach));
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, snap * 0.8);
      ctx.strokeRect(x - box, y - box, box * 2, box * 2);
      ctx.globalAlpha = 1;
      return;
    }
    case "stardust": {
      if (k < 0.3) {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.55 * e + 1, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha("#fff6c8", ((0.3 - k) / 0.3) * 0.6);
        ctx.fill();
      }
      const n = full ? 8 : 4;
      for (let i = 0; i < n; i += 1) {
        const a = seed + (i / n) * Math.PI * 2 + (full ? k : 0);
        const d = cell * (0.25 + e * 0.95);
        star4(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, cell * 0.16 * (1 - k * 0.8));
        ctx.fillStyle = withAlpha(i % 2 ? "#ffffff" : "#ffd75e", fadeOut);
        ctx.fill();
      }
      return;
    }
    case "petals": {
      const n = full ? 8 : 4;
      ctx.globalAlpha = fadeOut;
      for (let i = 0; i < n; i += 1) {
        const a = seed + (i / n) * Math.PI * 2 + (full ? k * 1.5 : 0);
        const d = cell * (0.2 + e * 1.0);
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d + k * cell * 0.3, cell * 0.13, cell * 0.07, a + (full ? k * 3 : 0), 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? "#ffd1e3" : "#ff9ec4";
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    case "shockwave": {
      if (k < 0.25) {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha("#ffffff", ((0.25 - k) / 0.25) * 0.5);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, cell * (0.3 + e * 1.8), 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha("#ffffff", fadeOut * 0.85);
      ctx.lineWidth = Math.max(1, cell * 0.16 * fadeOut);
      ctx.stroke();
      if (!full) return;
      const k2 = Math.max(0, (k - 0.15) / 0.85);
      ctx.beginPath();
      ctx.arc(x, y, cell * (0.3 + easeOut(k2) * 1.3), 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(color, (1 - k2) * 0.8);
      ctx.lineWidth = Math.max(1, cell * 0.1 * (1 - k2));
      ctx.stroke();
      return;
    }
    case "nom-burst": {
      // A comic starburst pops with NOM! in it, then shrinks away; full effects add speed lines.
      const pop = k < 0.2 ? easeOut(k / 0.2) * 1.15 : 1.15 - Math.min(0.15, (k - 0.2) * 0.6);
      const s = cell * 0.5 * pop * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
      if (s <= 0.5) return;
      const by = y - cell * 0.35 - e * cell * 0.25;
      if (full) {
        ctx.strokeStyle = withAlpha(INK, 0.6 * fadeOut);
        ctx.lineWidth = Math.max(1, cell * 0.04);
        ctx.beginPath();
        for (let i = 0; i < 8; i += 1) {
          const a = seed + (i / 8) * Math.PI * 2;
          ctx.moveTo(x + Math.cos(a) * s * 1.2, by + Math.sin(a) * s * 1.2);
          ctx.lineTo(x + Math.cos(a) * s * 1.6, by + Math.sin(a) * s * 1.6);
        }
        ctx.stroke();
      }
      burst(ctx, x, by, s, s * 0.68, 10);
      ctx.fillStyle = "#ffe14a";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, cell * 0.05);
      ctx.stroke();
      ctx.save();
      ctx.translate(x, by);
      ctx.rotate(-0.15);
      ctx.font = `900 ${Math.max(6, s * 0.62)}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#e0263a";
      ctx.fillText("NOM!", 0, s * 0.04);
      ctx.restore();
      return;
    }
    case "static-crackle": {
      // Forked lightning that re-strikes a few times, with a pale flash at the start.
      if (k < 0.18) {
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha("#dff4ff", ((0.18 - k) / 0.18) * 0.55);
        ctx.fill();
      }
      const n = full ? 6 : 4;
      const strike = Math.floor(k * (full ? 5 : 2));
      ctx.lineJoin = "miter";
      for (const [width, col] of [[cell * 0.14, withAlpha("#4fb4ff", 0.35 * fadeOut)], [cell * 0.05, withAlpha("#f2fbff", fadeOut)]] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = Math.max(1, width);
        ctx.beginPath();
        for (let i = 0; i < n; i += 1) {
          const a = seed + (i / n) * Math.PI * 2;
          const reachK = cell * (0.4 + e * 0.9);
          ctx.moveTo(x + Math.cos(a) * cell * 0.2, y + Math.sin(a) * cell * 0.2);
          for (let j = 1; j <= 3; j += 1) {
            const jit = (hash(i * 7 + j * 13 + strike * 31) - 0.5) * 0.9;
            ctx.lineTo(x + Math.cos(a + jit) * reachK * (j / 3), y + Math.sin(a + jit) * reachK * (j / 3));
          }
        }
        ctx.stroke();
      }
      ctx.lineJoin = "round";
      return;
    }
    case "ink-splash": {
      // Droplets fly out and land, and a blot spreads where the fruit was, then fades.
      const blot = Math.min(1, k / 0.35);
      ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      ctx.fillStyle = "#1d1b3a";
      ctx.beginPath();
      for (let i = 0; i <= 14; i += 1) {
        const a = (i / 14) * Math.PI * 2;
        const r = cell * 0.32 * easeOut(blot) * (0.8 + hash(i + seed * 5) * 0.4);
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      const n = full ? 9 : 5;
      for (let i = 0; i < n; i += 1) {
        const a = seed + i * 2.1;
        const d = cell * (0.3 + Math.min(1, e * 1.3) * (0.6 + hash(i) * 0.6));
        const r = cell * (0.04 + hash(i * 3) * 0.06);
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (k < 0.3 ? 1.6 : 1), r, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    default: {
      ctx.strokeStyle = withAlpha(color, fadeOut * 0.7);
      ctx.lineWidth = Math.max(1, cell * 0.09);
      ctx.beginPath();
      ctx.arc(x, y, cell * (0.3 + e * reach), 0, Math.PI * 2);
      ctx.stroke();
      if (!full) return;
      ctx.fillStyle = withAlpha(color, fadeOut);
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2 + seed;
        const d = cell * (0.3 + e * (reach + 0.2));
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, cell * 0.1 * fadeOut, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
