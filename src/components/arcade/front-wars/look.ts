"use client";

import type { GameLook } from "@/lib/game-cosmetics";
import { HIGHLAND, MOUNTAIN, WATER } from "./engine";

/**
 * Front Wars cosmetics: how each shop item draws, keyed by its slug (see GAME_SHOPS["front-wars"]). Nothing here
 * touches the simulation. Map styles and art styles shape the map image (built once per tile, then only where
 * tiles change); patterns only ever touch the inside of your own land; buildings, boats and attack effects only
 * ever restyle your own pieces. Borders, ownership colours, troop counts, tool ranges and alerts keep their usual
 * colours in every combination.
 */

export type Rgb = [number, number, number];
type Ctx = CanvasRenderingContext2D;

const DARK = "8 6 14";
const TAU = Math.PI * 2;

const put = (out: Rgb, r: number, g: number, b: number) => {
  out[0] = r;
  out[1] = g;
  out[2] = b;
};
const putScaled = (out: Rgb, rgb: Rgb, k: number) => put(out, rgb[0] * k, rgb[1] * k, rgb[2] * k);
const mixInto = (out: Rgb, a: Rgb, b: Rgb, t: number) => put(out, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
const lum = (c: Rgb) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255;

/** A fixed pseudo-random number in [0, 1) per integer point. */
export function hash2(x: number, y: number, seed = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, y: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const fx = tx * tx * (3 - 2 * tx);
  const fy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed);
  const b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed);
  const d = hash2(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
};

/* =============================================================================================== Map styles */

/** One tile of unclaimed ground or sea, as seen when the map image is built. */
export type GroundTile = {
  x: number;
  y: number;
  terrain: number;
  /** Water: tiles to the nearest land (1 = on the shore). Land: tiles to the nearest water (1 = coast). Capped. */
  dist: number;
  /** Latitude on the world map (null on a generated continent). */
  lat: number | null;
  /** A fixed per-tile grain in [0, 1). */
  grain: number;
  /** The terrain changes toward the east or south neighbour. */
  step: boolean;
};

export type Decor = { view: { scale: number; x: number; y: number }; size: { width: number; height: number }; w: number; h: number; world: boolean };

export type MapStyleDef = {
  id: string;
  /** Behind the map (the table it lies on). */
  backdrop: Rgb;
  /** Unclaimed ground and sea, once per tile when the map image is built. */
  ground(tile: GroundTile, out: Rgb): void;
  /** A few map-anchored lines over the map image, under every piece and battle. */
  decorate?(ctx: Ctx, decor: Decor): void;
};

const DEEP: Rgb = [12, 30, 52];
const COAST: Rgb = [26, 62, 92];
const PLAINS_RGB: Rgb = [88, 112, 66];
const HIGHLAND_RGB: Rgb = [126, 116, 80];
const MOUNTAIN_RGB: Rgb = [150, 144, 132];
const TUNDRA_RGB: Rgb = [128, 138, 126];
const ICE_RGB: Rgb = [214, 224, 232];

const scratch: Rgb = [0, 0, 0];

const COMMAND_MAP: MapStyleDef = {
  id: "",
  backdrop: DEEP,
  ground(tile, out) {
    const k = 0.93 + tile.grain * 0.14;
    if (tile.terrain === WATER) return putScaled(out, tile.dist <= 1 ? COAST : DEEP, k);
    const base = tile.terrain === MOUNTAIN ? MOUNTAIN_RGB : tile.terrain === HIGHLAND ? HIGHLAND_RGB : PLAINS_RGB;
    put(scratch, base[0], base[1], base[2]);
    if (tile.lat !== null) {
      const lat = Math.abs(tile.lat);
      if (lat > 66) mixInto(scratch, scratch, ICE_RGB, Math.min(1, (lat - 66) / 8));
      else if (lat > 55) mixInto(scratch, scratch, TUNDRA_RGB, (lat - 55) / 11);
    }
    putScaled(out, scratch, k);
  },
};

/** Map-anchored straight lines every `step` tiles, clipped to the map. */
function gridLines(ctx: Ctx, decor: Decor, stepX: number, stepY: number, offsetY: number, stroke: string, width = 1) {
  const { view, size, w, h } = decor;
  const s = view.scale;
  const left = Math.max(0, view.x);
  const top = Math.max(0, view.y);
  const right = Math.min(size.width, view.x + w * s);
  const bottom = Math.min(size.height, view.y + h * s);
  if (right <= left || bottom <= top) return;
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let x = stepX; x < w; x += stepX) {
    const sx = Math.round(view.x + x * s) + 0.5;
    if (sx < left || sx > right) continue;
    ctx.moveTo(sx, top);
    ctx.lineTo(sx, bottom);
  }
  for (let y = offsetY; y < h; y += stepY) {
    if (y <= 0) continue;
    const sy = Math.round(view.y + y * s) + 0.5;
    if (sy < top || sy > bottom) continue;
    ctx.moveTo(left, sy);
    ctx.lineTo(right, sy);
  }
  ctx.stroke();
  ctx.restore();
}

/** An engraved compass rose, anchored to the map like on an old chart. */
function compassRose(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgb(60 42 26 / 0.75)";
  ctx.lineWidth = Math.max(1, r / 40);
  circle(ctx, 0, 0, r * 0.82);
  ctx.stroke();
  circle(ctx, 0, 0, r * 0.74);
  ctx.stroke();
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * TAU;
    const inner = r * (i % 2 ? 0.7 : 0.66);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74);
    ctx.stroke();
  }
  // Eight points: the cardinal ones long and split light/dark, the others short.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const len = i % 2 ? r * 0.5 : r;
    const side = r * (i % 2 ? 0.1 : 0.14);
    const tip = [Math.cos(a) * len, Math.sin(a) * len] as const;
    const l = [Math.cos(a - Math.PI / 2) * side, Math.sin(a - Math.PI / 2) * side] as const;
    const rr = [Math.cos(a + Math.PI / 2) * side, Math.sin(a + Math.PI / 2) * side] as const;
    ctx.fillStyle = "rgb(236 220 186 / 0.9)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(...l);
    ctx.lineTo(...tip);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = i === 0 ? "rgb(150 40 30 / 0.9)" : "rgb(70 50 30 / 0.85)";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(...rr);
    ctx.lineTo(...tip);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (r > 26) {
    ctx.fillStyle = "rgb(60 42 26 / 0.9)";
    ctx.font = `700 ${Math.round(r * 0.22)}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", 0, -r * 1.14);
  }
  ctx.restore();
}

const WAR_ROOM: MapStyleDef = {
  id: "war-room",
  backdrop: [42, 29, 20],
  ground(tile, out) {
    const n = valueNoise(tile.x / 23, tile.y / 23, 11);
    if (tile.terrain === WATER) {
      if (tile.dist <= 1) return put(out, 74, 58, 40);
      // Engraved ripples hugging the coast, then open water fading darker.
      const ring = tile.dist <= 10 && tile.dist % 3 === 0;
      mixInto(scratch, [132, 158, 144], [84, 112, 108], Math.min(1, tile.dist / 16));
      return putScaled(out, scratch, (ring ? 0.84 : 1) * (0.95 + n * 0.08));
    }
    const k = 0.88 + tile.grain * 0.08 + n * 0.1;
    if (tile.terrain === MOUNTAIN) {
      // Hand-drawn hill marks.
      if (hash2(tile.x, tile.y, 3) < 0.2) return putScaled(out, [112, 84, 56], k);
      return putScaled(out, [176, 142, 100], k);
    }
    if (tile.terrain === HIGHLAND) return putScaled(out, [208, 180, 132], k);
    return putScaled(out, tile.dist <= 1 ? [204, 178, 132] : [226, 204, 160], k);
  },
  decorate(ctx, decor) {
    // Latitude and longitude every 15° on the world (60 tiles), a matching grid on a continent.
    const step = decor.world ? 60 : 64;
    gridLines(ctx, decor, step, step, decor.world ? 20 : step, "rgb(70 48 26 / 0.26)");
    const { view, w, h, size } = decor;
    const r = Math.min(110, Math.max(18, Math.min(w, h) * 0.07 * view.scale));
    const x = view.x + w * 0.08 * view.scale;
    const y = view.y + h * (decor.world ? 0.8 : 0.86) * view.scale;
    if (x > -r && y > -r && x < size.width + r && y < size.height + r) compassRose(ctx, x, y, r);
  },
};

const TOPOGRAPHIC: MapStyleDef = {
  id: "topographic",
  backdrop: [226, 218, 194],
  ground(tile, out) {
    const { x, y } = tile;
    if (tile.terrain === WATER) {
      const d = tile.dist;
      if (d <= 1) return put(out, 74, 116, 148);
      if (d === 4 || d === 9 || d === 15) return put(out, 100, 150, 186);
      if (d <= 3) return put(out, 170, 210, 228);
      if (d <= 8) return put(out, 148, 194, 218);
      if (d <= 14) return put(out, 128, 178, 208);
      return put(out, 112, 162, 198);
    }
    const base = tile.terrain === MOUNTAIN ? 0.66 : tile.terrain === HIGHLAND ? 0.4 : 0.12;
    const height = (px: number, py: number) => valueNoise(px / 16, py / 16, 21) * 0.26 + valueNoise(px / 6, py / 6, 22) * 0.05;
    const hh = base + height(x, y);
    const band = Math.floor(hh * 16);
    const contour = band !== Math.floor((base + height(x + 1, y)) * 16) || band !== Math.floor((base + height(x, y + 1)) * 16) || tile.step;
    if (contour) return band % 4 === 0 ? put(out, 116, 78, 46) : put(out, 156, 116, 78);
    if (hh > 0.66) return put(out, 200, 166, 122);
    if (hh > 0.4) return put(out, 228, 210, 160);
    return mixInto(out, [208, 226, 176], [222, 222, 178], Math.min(1, hh * 3));
  },
  decorate(ctx, decor) {
    gridLines(ctx, decor, 48, 48, 48, "rgb(120 70 40 / 0.2)");
  },
};

const CORAL_ATOLL: MapStyleDef = {
  id: "coral-atoll",
  backdrop: [10, 52, 90],
  ground(tile, out) {
    const { x, y } = tile;
    if (tile.terrain === WATER) {
      const d = tile.dist;
      if ((d === 3 || d === 4) && hash2(x, y, 51) < 0.14) return put(out, 255, 140, 122);
      if (d > 8 && hash2(x, y, 52) < 0.0025) return put(out, 200, 236, 246);
      if (d <= 1) return put(out, 104, 226, 214);
      if (d <= 3) return put(out, 54, 196, 206);
      if (d <= 6) return put(out, 30, 152, 196);
      if (d <= 11) return put(out, 22, 112, 170);
      return put(out, 18, 78, 138);
    }
    const k = 0.9 + tile.grain * 0.1 + valueNoise(x / 9, y / 9, 53) * 0.08;
    if (tile.dist <= 1) return putScaled(out, [238, 220, 162], k);
    if (tile.terrain === MOUNTAIN) return putScaled(out, [112, 92, 72], k);
    if (tile.dist === 2) return putScaled(out, [184, 196, 120], k);
    if (tile.terrain === HIGHLAND) return putScaled(out, [42, 108, 58], k);
    return putScaled(out, [64, 142, 72], k);
  },
};

const FROSTBOUND: MapStyleDef = {
  id: "frostbound",
  backdrop: [8, 20, 32],
  ground(tile, out) {
    const { x, y } = tile;
    if (tile.terrain === WATER) {
      const d = tile.dist;
      if (d <= 1) return put(out, 46, 88, 118);
      if (d <= 14 && valueNoise(x / 5, y / 5, 41) > 0.66 + d * 0.012) return put(out, 92, 128, 156);
      return putScaled(out, [16, 40, 62], 0.92 + tile.grain * 0.12);
    }
    const k = 0.95 + tile.grain * 0.06;
    if (tile.terrain === MOUNTAIN) {
      if (Math.abs(valueNoise(x / 7, y / 7, 42) - 0.5) < 0.04) return putScaled(out, [104, 136, 168], k);
      return putScaled(out, [160, 188, 212], k);
    }
    if (tile.terrain === HIGHLAND) return putScaled(out, [198, 214, 228], k);
    // Wind-carved ridges across the snow.
    const ridge = (x + Math.floor(valueNoise(x / 12, y / 12, 43) * 9) + y * 0.5) % 7 < 1;
    return putScaled(out, [234, 240, 246], k * (ridge ? 0.94 : 1));
  },
};

const CIRCUIT_BOARD: MapStyleDef = {
  id: "circuit-board",
  backdrop: [4, 8, 7],
  ground(tile, out) {
    const { x, y } = tile;
    if (tile.terrain === WATER) {
      if (tile.dist <= 1) return put(out, 196, 226, 208);
      if (x % 6 === 0 && y % 6 === 0) return put(out, 30, 58, 48);
      return put(out, 10, 16, 16);
    }
    const cell = 9;
    if (x % cell === 0 && y % cell === 0 && hash2(x, y, 61) > 0.35) return put(out, 232, 196, 110);
    if ((x % cell === 0 && valueNoise(x / cell, y / 28, 62) > 0.5) || (y % cell === 0 && valueNoise(x / 28, y / cell, 63) > 0.5)) return put(out, 186, 120, 62);
    if (tile.terrain === MOUNTAIN) return hash2(x, y, 64) < 0.14 ? put(out, 150, 156, 160) : put(out, 30, 34, 38);
    const k = 0.9 + tile.grain * 0.12;
    if (tile.terrain === HIGHLAND) return putScaled(out, [22, 78, 62], k);
    return putScaled(out, [28, 94, 58], k);
  },
};

const EMBER_WASTES: MapStyleDef = {
  id: "ember-wastes",
  backdrop: [8, 4, 6],
  ground(tile, out) {
    const { x, y } = tile;
    if (tile.terrain === WATER) {
      if (tile.dist <= 1) return put(out, 76, 24, 16);
      if (tile.dist === 2) return put(out, 44, 16, 18);
      return putScaled(out, [22, 13, 24], 0.88 + valueNoise(x / 11, y / 11, 33) * 0.3);
    }
    const vein = Math.abs(valueNoise(x / 18, y / 18, 31) - 0.5);
    if (vein < 0.016) return put(out, 255, 124, 44);
    if (vein < 0.038) return put(out, 128, 42, 18);
    if (Math.abs(valueNoise(x / 7, y / 7, 32) - 0.5) < 0.012) return put(out, 200, 70, 24);
    const k = 0.84 + tile.grain * 0.22;
    if (tile.terrain === MOUNTAIN) return hash2(x, y, 34) < 0.08 ? put(out, 255, 96, 32) : putScaled(out, [80, 66, 60], k);
    if (tile.terrain === HIGHLAND) return putScaled(out, [60, 50, 48], k);
    return putScaled(out, [42, 36, 34], k);
  },
};

/** Craters on a coarse grid: dark floors, bright rims and a faint ring of ejecta. Returns a brightness change. */
function crater(x: number, y: number) {
  const cell = 20;
  const cx0 = Math.floor(x / cell);
  const cy0 = Math.floor(y / cell);
  let shade = 0;
  for (let j = -1; j <= 1; j += 1) {
    for (let i = -1; i <= 1; i += 1) {
      const cx = cx0 + i;
      const cy = cy0 + j;
      if (hash2(cx, cy, 81) > 0.7) continue;
      const r = 2 + hash2(cx, cy, 82) * 7;
      const d = Math.hypot(x - (cx + hash2(cx, cy, 83)) * cell, y - (cy + hash2(cx, cy, 84)) * cell);
      if (d < r * 0.72) shade = Math.min(shade, -0.28);
      else if (d < r) shade = Math.max(shade, 0.24);
      else if (d < r * 1.3 && shade === 0) shade = 0.07;
    }
  }
  return shade;
}

const LUNAR_SURVEY: MapStyleDef = {
  id: "lunar-survey",
  backdrop: [3, 4, 8],
  ground(tile, out) {
    const { x, y } = tile;
    if (tile.terrain === WATER) {
      if (tile.dist <= 1) return put(out, 40, 52, 86);
      if (tile.dist === 2) return put(out, 20, 26, 46);
      const star = hash2(x, y, 9);
      if (star < 0.0035) return put(out, 232, 236, 255);
      if (star < 0.012) return put(out, 88, 94, 118);
      return put(out, 6, 7, 12);
    }
    const base: Rgb = tile.terrain === MOUNTAIN ? [196, 193, 184] : tile.terrain === HIGHLAND ? [160, 160, 154] : [136, 136, 132];
    const k = (0.88 + tile.grain * 0.1 + valueNoise(x / 15, y / 15, 85) * 0.12) * (1 + crater(x, y));
    putScaled(out, base, k);
  },
};

export const MAP_STYLES: Record<string, MapStyleDef> = Object.fromEntries(
  [WAR_ROOM, TOPOGRAPHIC, CORAL_ATOLL, FROSTBOUND, CIRCUIT_BOARD, EMBER_WASTES, LUNAR_SURVEY].map((style) => [style.id, style]),
);

/* =============================================================================================== Territory patterns */

/**
 * A pattern across the inside of your land, per map pixel (two per tile): a brightness change in [-1, 1], or above
 * 1.5 for the pattern's accent colour. Borders are never patterned.
 */
export type PatternDef = { id: string; accent: Rgb; at(gx: number, gy: number): number };

const SQRT3 = Math.sqrt(3);

export const PATTERNS: Record<string, PatternDef> = {
  chevrons: {
    id: "chevrons",
    accent: [255, 255, 255],
    at(gx, gy) {
      const m = gx & 31;
      return ((gy + (m < 16 ? m : 31 - m)) & 15) < 5 ? 0.5 : -0.12;
    },
  },
  masonry: {
    id: "masonry",
    accent: [255, 255, 255],
    at(gx, gy) {
      const row = Math.floor(gy / 5);
      const shifted = gx + (row & 1) * 5;
      if (gy % 5 === 0 || shifted % 10 === 0) return -0.5;
      return (hash2(Math.floor(shifted / 10), row, 74) - 0.5) * 0.3 + 0.06;
    },
  },
  fields: {
    id: "fields",
    accent: [255, 255, 255],
    at(gx, gy) {
      const b = 14;
      const bx = Math.floor(gx / b);
      const by = Math.floor(gy / b);
      const lx = gx - bx * b;
      const ly = gy - by * b;
      if (lx === 0 || ly === 0) return -0.55;
      const h = hash2(bx, by, 75);
      const dir = Math.floor(h * 3);
      const along = dir === 0 ? ly : dir === 1 ? lx : lx + ly;
      return (along % 3 === 0 ? -0.24 : 0.06) + (hash2(bx, by, 76) - 0.5) * 0.36;
    },
  },
  honeycomb: {
    id: "honeycomb",
    accent: [255, 255, 255],
    at(gx, gy) {
      const s = 5.5;
      const q = ((SQRT3 / 3) * gx - gy / 3) / s;
      const r = ((2 / 3) * gy) / s;
      let rx = Math.round(q);
      let rz = Math.round(r);
      const ry = Math.round(-q - r);
      const dx = Math.abs(rx - q);
      const dy = Math.abs(ry + q + r);
      const dz = Math.abs(rz - r);
      if (dx > dy && dx > dz) rx = -ry - rz;
      else if (dy <= dz) rz = -rx - ry;
      const d = Math.hypot(gx - s * SQRT3 * (rx + rz / 2), gy - s * 1.5 * rz) / s;
      return d > 0.8 ? -0.5 : d < 0.3 ? 0.2 : 0.05;
    },
  },
  camouflage: {
    id: "camouflage",
    accent: [255, 255, 255],
    at(gx, gy) {
      const n = valueNoise(gx / 9, gy / 9, 76) * 0.7 + valueNoise(gx / 4, gy / 4, 77) * 0.3;
      return n < 0.42 ? -0.45 : n < 0.58 ? 0 : 0.32;
    },
  },
  circuit: {
    id: "circuit",
    accent: [255, 214, 110],
    at(gx, gy) {
      const cx = Math.floor(gx / 12);
      const cy = Math.floor(gy / 12);
      const lx = gx - cx * 12;
      const ly = gy - cy * 12;
      if (lx <= 1 && ly <= 1) return hash2(cx, cy, 71) > 0.45 ? 2 : -0.12;
      if (ly === 0 && hash2(cx, cy, 72) > 0.4) return 0.6;
      if (lx === 0 && hash2(cx, cy, 73) > 0.5) return 0.6;
      return -0.14;
    },
  },
  starfield: {
    id: "starfield",
    accent: [255, 255, 255],
    at(gx, gy) {
      const h = hash2(gx, gy, 78);
      if (h < 0.006) return 2;
      if (h < 0.02) return 0.45;
      return -0.26;
    },
  },
};

/** Applies a pattern value to one pixel's colour (in place, at `i` in an RGBA buffer). */
export function shadePixel(data: Uint8ClampedArray, i: number, value: number, accent: Rgb) {
  if (value > 1.5) {
    data[i] += (accent[0] - data[i]) * 0.85;
    data[i + 1] += (accent[1] - data[i + 1]) * 0.85;
    data[i + 2] += (accent[2] - data[i + 2]) * 0.85;
  } else if (value >= 0) {
    data[i] += (255 - data[i]) * value * 0.5;
    data[i + 1] += (255 - data[i + 1]) * value * 0.5;
    data[i + 2] += (255 - data[i + 2]) * value * 0.5;
  } else {
    const k = 1 + value * 0.6;
    data[i] *= k;
    data[i + 1] *= k;
    data[i + 2] *= k;
  }
}

/* =============================================================================================== Art styles */

/** Which sides of a territory tile border someone else's land (or unclaimed land). */
export const EDGE_N = 1;
export const EDGE_S = 2;
export const EDGE_W = 4;
export const EDGE_E = 8;

/** What a map pixel shows, for an art style's per-pixel pass. */
export const PIXEL_LAND = 0;
export const PIXEL_SEA = 1;
export const PIXEL_INSIDE = 2;
export const PIXEL_EDGE = 3;

export type ArtStyleDef = {
  id: string;
  font: string;
  /** Player names in capitals. */
  upper: boolean;
  /** Always smooth the map when scaling (soft edges), not only when zoomed out. */
  smooth: boolean;
  /** Default building markers: body fill and outline (rgb triplet). */
  paper: string;
  ink: string;
  /** Player names: fill, halo (rgb triplet) and an optional drop shadow. */
  nameFill: string;
  nameHalo: string;
  nameShadow: boolean;
  /** Pieces cast a shadow on the board. */
  shadows: boolean;
  /** Tints the ground and sea a map style produced (once per tile). */
  groundFilter?(out: Rgb, water: boolean, x: number, y: number): void;
  /** A territory tile: owner colour `c` over ground `g`; `edge` is a mask of EDGE_* (0 inside). */
  territory(out: Rgb, c: Rgb, g: Rgb, edge: number, player: boolean, x: number, y: number): void;
  /** Ground tiles south or east of a territory: raised land casts a shadow on them. */
  castShadow: boolean;
  /** A per-pixel pass over the map image (gx, gy in map pixels). */
  pixel?(data: Uint8ClampedArray, i: number, gx: number, gy: number, kind: number, player: boolean): void;
  /** Over the whole frame, after everything else. */
  overlay?(ctx: Ctx, size: { width: number; height: number }, tick: number, motion: boolean): void;
};

const SANS = "ui-sans-serif, system-ui, sans-serif";

function defaultTerritory(out: Rgb, c: Rgb, g: Rgb, edge: number, player: boolean) {
  if (edge) {
    const light = player ? 0.75 : 0.32;
    put(out, c[0] + (255 - c[0]) * light, c[1] + (255 - c[1]) * light, c[2] + (255 - c[2]) * light);
  } else put(out, c[0] * 0.74 + g[0] * 0.26, c[1] * 0.74 + g[1] * 0.26, c[2] * 0.74 + g[2] * 0.26);
}

const COMMAND_DISPLAY: ArtStyleDef = {
  id: "",
  font: SANS,
  upper: false,
  smooth: false,
  paper: "#fff",
  ink: DARK,
  nameFill: "#fff",
  nameHalo: DARK,
  nameShadow: false,
  shadows: false,
  castShadow: false,
  territory: defaultTerritory,
};

/** Cached screen textures (built once per page). */
let grainCanvas: HTMLCanvasElement | null = null;
let scanCanvas: HTMLCanvasElement | null = null;
const patterns = new WeakMap<Ctx, Map<string, CanvasPattern | null>>();

function texture(ctx: Ctx, key: "grain" | "scan") {
  let byCtx = patterns.get(ctx);
  if (!byCtx) {
    byCtx = new Map();
    patterns.set(ctx, byCtx);
  }
  if (byCtx.has(key)) return byCtx.get(key) ?? null;
  let source: HTMLCanvasElement;
  if (key === "grain") {
    if (!grainCanvas) {
      grainCanvas = document.createElement("canvas");
      grainCanvas.width = grainCanvas.height = 128;
      const g = grainCanvas.getContext("2d")!;
      const image = g.createImageData(128, 128);
      for (let i = 0; i < 128 * 128; i += 1) {
        const v = 150 + hash2(i % 128, (i / 128) | 0, 91) * 105 + (valueNoise((i % 128) / 9, ((i / 128) | 0) / 9, 92) - 0.5) * 40;
        image.data[i * 4] = v;
        image.data[i * 4 + 1] = v * 0.96;
        image.data[i * 4 + 2] = v * 0.88;
        image.data[i * 4 + 3] = 255;
      }
      g.putImageData(image, 0, 0);
    }
    source = grainCanvas;
  } else {
    if (!scanCanvas) {
      scanCanvas = document.createElement("canvas");
      scanCanvas.width = 4;
      scanCanvas.height = 3;
      const g = scanCanvas.getContext("2d")!;
      g.fillStyle = "rgb(0 0 0 / 0.55)";
      g.fillRect(0, 2, 4, 1);
    }
    source = scanCanvas;
  }
  const pattern = ctx.createPattern(source, "repeat");
  byCtx.set(key, pattern);
  return pattern;
}

function vignette(ctx: Ctx, size: { width: number; height: number }, rgb: string, alpha: number) {
  const { width, height } = size;
  const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.hypot(width, height) * 0.62);
  gradient.addColorStop(0, `rgb(${rgb} / 0)`);
  gradient.addColorStop(1, `rgb(${rgb} / ${alpha})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

const DIORAMA: ArtStyleDef = {
  ...COMMAND_DISPLAY,
  id: "diorama",
  font: 'ui-rounded, "SF Pro Rounded", "Nunito", ui-sans-serif, system-ui, sans-serif',
  nameShadow: true,
  shadows: true,
  castShadow: true,
  territory(out, c, g, edge, player) {
    if (edge && player) return defaultTerritory(out, c, g, edge, player);
    if (edge & (EDGE_N | EDGE_W)) return put(out, c[0] + (255 - c[0]) * 0.42, c[1] + (255 - c[1]) * 0.42, c[2] + (255 - c[2]) * 0.42);
    if (edge) return put(out, c[0] * 0.58, c[1] * 0.58, c[2] * 0.58);
    put(out, (c[0] * 0.8 + g[0] * 0.2) * 1.05, (c[1] * 0.8 + g[1] * 0.2) * 1.05, (c[2] * 0.8 + g[2] * 0.2) * 1.05);
  },
  overlay(ctx, size) {
    vignette(ctx, size, "10 8 6", 0.42);
  },
};

const WOODCUT: ArtStyleDef = {
  id: "woodcut",
  font: 'Georgia, "Times New Roman", serif',
  upper: true,
  smooth: false,
  paper: "#f3e9d2",
  ink: "26 20 14",
  nameFill: "#f6ecd2",
  nameHalo: "26 20 14",
  nameShadow: false,
  shadows: false,
  castShadow: false,
  groundFilter(out, water) {
    // Three tones of ink on warm paper, keeping a little of the map style's colour.
    const l = lum(out);
    const tone = l < 0.3 ? 0.34 : l < 0.58 ? 0.64 : 0.9;
    const paper: Rgb = water ? [196, 204, 196] : [240, 226, 196];
    put(out, out[0] * 0.4 + paper[0] * tone * 0.6, out[1] * 0.4 + paper[1] * tone * 0.6, out[2] * 0.4 + paper[2] * tone * 0.6);
  },
  territory(out, c, g, edge, player) {
    if (edge && player) return defaultTerritory(out, c, g, edge, player);
    if (edge) return put(out, 26, 20, 14);
    put(out, c[0] * 0.8 + 240 * 0.2, c[1] * 0.8 + 226 * 0.2, c[2] * 0.8 + 196 * 0.2);
  },
  pixel(data, i, gx, gy, kind) {
    let k = 1;
    if (kind === PIXEL_INSIDE) k = ((gx + gy) & 3) === 0 ? 0.55 : 1;
    else if (kind === PIXEL_LAND) k = ((gx - gy) & 7) === 0 ? 0.68 : 1;
    else if (kind === PIXEL_SEA) k = (gy + ((gx >> 3) & 1) * 2) % 4 === 0 ? 0.74 : 1;
    if (k === 1) return;
    data[i] *= k;
    data[i + 1] *= k;
    data[i + 2] *= k;
  },
  overlay(ctx, size) {
    const grain = texture(ctx, "grain");
    if (grain) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.restore();
    }
    vignette(ctx, size, "26 20 14", 0.35);
  },
};

const PAPER: Rgb = [244, 238, 226];

const WATERCOLOUR: ArtStyleDef = {
  id: "watercolour",
  font: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
  upper: false,
  smooth: true,
  paper: "#fbf6ea",
  ink: "60 50 40",
  nameFill: "#2a241c",
  nameHalo: "244 238 226",
  nameShadow: false,
  shadows: false,
  castShadow: false,
  groundFilter(out, water) {
    mixInto(out, out, PAPER, water ? 0.34 : 0.5);
  },
  territory(out, c, g, edge, player, x, y) {
    if (edge && player) return put(out, c[0] + (255 - c[0]) * 0.6, c[1] + (255 - c[1]) * 0.6, c[2] + (255 - c[2]) * 0.6);
    // Pigment pools darker where the wash meets the border.
    if (edge) return put(out, c[0] * 0.72, c[1] * 0.72, c[2] * 0.72);
    const bloom = 0.88 + valueNoise(x / 9, y / 9, 7) * 0.24;
    put(out, (c[0] * 0.6 + PAPER[0] * 0.4) * bloom, (c[1] * 0.6 + PAPER[1] * 0.4) * bloom, (c[2] * 0.6 + PAPER[2] * 0.4) * bloom);
  },
  overlay(ctx, size) {
    const grain = texture(ctx, "grain");
    if (grain) {
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = grain;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.restore();
    }
    vignette(ctx, size, "120 96 60", 0.3);
  },
};

const CONSOLE: ArtStyleDef = {
  id: "console",
  font: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  upper: true,
  smooth: false,
  paper: "#0c1a16",
  ink: "150 255 205",
  nameFill: "#c4ffe2",
  nameHalo: "0 12 8",
  nameShadow: false,
  shadows: false,
  castShadow: false,
  groundFilter(out) {
    put(out, out[0] * 0.36, out[1] * 0.42 + 14, out[2] * 0.4 + 10);
  },
  territory(out, c, g, edge, player) {
    if (edge) {
      const light = player ? 0.8 : 0.45;
      return put(out, c[0] + (255 - c[0]) * light, c[1] + (255 - c[1]) * light, c[2] + (255 - c[2]) * light);
    }
    put(out, c[0] * 0.4 + g[0] * 0.2, c[1] * 0.4 + g[1] * 0.2, c[2] * 0.4 + g[2] * 0.2);
  },
  pixel(data, i, gx, gy, kind) {
    if (kind === PIXEL_SEA && (gx % 16 === 0 || gy % 16 === 0)) {
      data[i] += 10;
      data[i + 1] += 34;
      data[i + 2] += 26;
    }
  },
  overlay(ctx, size, tick, motion) {
    const scan = texture(ctx, "scan");
    if (scan) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = scan;
      ctx.fillRect(0, 0, size.width, size.height);
      ctx.restore();
    }
    ctx.fillStyle = "rgb(60 255 160 / 0.035)";
    ctx.fillRect(0, 0, size.width, size.height);
    if (motion) {
      // The slow refresh sweep rolling down the screen.
      const y = ((tick * 4) % (size.height + 160)) - 80;
      const band = ctx.createLinearGradient(0, y - 80, 0, y + 10);
      band.addColorStop(0, "rgb(120 255 190 / 0)");
      band.addColorStop(1, "rgb(120 255 190 / 0.07)");
      ctx.fillStyle = band;
      ctx.fillRect(0, y - 80, size.width, 90);
    }
    vignette(ctx, size, "0 0 0", 0.55);
  },
};

export const ART_STYLES: Record<string, ArtStyleDef> = { diorama: DIORAMA, woodcut: WOODCUT, watercolour: WATERCOLOUR, console: CONSOLE };

/* =============================================================================================== Buildings */

/**
 * A building's outline (City house, Post shield, Port disc, Factory roofline, Silo missile, SAM mount), added to
 * the current path. Every skin keeps it, so each kind of building stays recognisable.
 */
export function glyphPath(ctx: Ctx, code: number, x: number, y: number, g: number) {
  const h = g / 2;
  switch (code) {
    case 1:
      ctx.moveTo(x - h, y + h);
      ctx.lineTo(x - h, y - g / 8);
      ctx.lineTo(x, y - h);
      ctx.lineTo(x + h, y - g / 8);
      ctx.lineTo(x + h, y + h);
      break;
    case 2:
      ctx.moveTo(x, y - h);
      ctx.lineTo(x + h, y - g / 4);
      ctx.quadraticCurveTo(x + h, y + g / 3, x, y + h);
      ctx.quadraticCurveTo(x - h, y + g / 3, x - h, y - g / 4);
      break;
    case 3:
      ctx.moveTo(x + h, y);
      ctx.arc(x, y, h, 0, TAU);
      break;
    case 4:
      ctx.moveTo(x - h, y + h);
      ctx.lineTo(x - h, y - h * 0.1);
      ctx.lineTo(x - h * 0.33, y - h * 0.55);
      ctx.lineTo(x - h * 0.33, y - h * 0.1);
      ctx.lineTo(x + h * 0.33, y - h * 0.55);
      ctx.lineTo(x + h * 0.33, y - h);
      ctx.lineTo(x + h, y - h);
      ctx.lineTo(x + h, y + h);
      break;
    case 5:
      ctx.moveTo(x, y - h * 1.15);
      ctx.quadraticCurveTo(x + h * 0.55, y - h * 0.5, x + h * 0.45, y + h * 0.45);
      ctx.lineTo(x + h * 0.85, y + h);
      ctx.lineTo(x - h * 0.85, y + h);
      ctx.lineTo(x - h * 0.45, y + h * 0.45);
      ctx.quadraticCurveTo(x - h * 0.55, y - h * 0.5, x, y - h * 1.15);
      break;
    default:
      ctx.moveTo(x, y - h * 0.1);
      ctx.lineTo(x + h, y + h);
      ctx.lineTo(x - h, y + h);
      break;
  }
  ctx.closePath();
}

/** The symbol inside a building, in its owner's colour. */
export function glyphMark(ctx: Ctx, code: number, x: number, y: number, g: number, color: string) {
  const h = g / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.2, g / 9);
  ctx.lineCap = "round";
  ctx.beginPath();
  switch (code) {
    case 3:
      // Anchor.
      ctx.moveTo(x, y - h * 0.6);
      ctx.lineTo(x, y + h * 0.55);
      ctx.moveTo(x - h * 0.35, y - h * 0.25);
      ctx.lineTo(x + h * 0.35, y - h * 0.25);
      ctx.moveTo(x - h * 0.55, y + h * 0.15);
      ctx.quadraticCurveTo(x, y + h * 0.9, x + h * 0.55, y + h * 0.15);
      ctx.stroke();
      return;
    case 4:
      ctx.rect(x - h * 0.55, y + h * 0.1, h * 0.4, h * 0.45);
      ctx.rect(x + h * 0.15, y + h * 0.1, h * 0.4, h * 0.45);
      ctx.fill();
      return;
    case 5:
      ctx.moveTo(x - h * 0.85, y + h);
      ctx.lineTo(x + h * 0.85, y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - h * 0.2, g / 7, 0, TAU);
      ctx.fill();
      return;
    case 6:
      // The dish above the mount.
      ctx.arc(x, y - h * 0.35, h * 0.55, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y + h * 0.5, g / 7, 0, TAU);
      ctx.fill();
      return;
    default:
      ctx.arc(x, y + g / 8, g / 5, 0, TAU);
      ctx.fill();
  }
}

export type BuildingDraw = { code: number; x: number; y: number; g: number; color: string; tick: number; motion: boolean; style: ArtStyleDef };
export type BuildingSkinDef = { id: string; draw(ctx: Ctx, b: BuildingDraw): void };

/** The plain marker (also every rival's), in the art style's paper and ink. */
export function drawPlainBuilding(ctx: Ctx, { code, x, y, g, color, style }: BuildingDraw) {
  if (style.shadows) {
    ctx.fillStyle = "rgb(0 0 0 / 0.32)";
    ctx.beginPath();
    ctx.ellipse(x + g * 0.16, y + g * 0.5, g * 0.55, g * 0.16, 0, 0, TAU);
    ctx.fill();
  }
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgb(${style.ink} / 0.85)`;
  ctx.fillStyle = style.paper;
  ctx.beginPath();
  glyphPath(ctx, code, x, y, g);
  ctx.fill();
  ctx.stroke();
  glyphMark(ctx, code, x, y, g, color);
}

function bodyWith(ctx: Ctx, b: BuildingDraw, fill: string | CanvasGradient, stroke: string, width: number) {
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.beginPath();
  glyphPath(ctx, b.code, b.x, b.y, b.g);
  ctx.fill();
  ctx.stroke();
}

/** Draws inside the building's outline only. */
function insideBody(ctx: Ctx, b: BuildingDraw, paint: () => void) {
  ctx.save();
  ctx.beginPath();
  glyphPath(ctx, b.code, b.x, b.y, b.g);
  ctx.clip();
  paint();
  ctx.restore();
}

function groundShadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha: number) {
  ctx.fillStyle = `rgb(0 0 0 / ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

const BUILDING_SKINS: BuildingSkinDef[] = [
  {
    id: "origami",
    draw(ctx, b) {
      const { x, y, g } = b;
      const h = g / 2;
      ctx.save();
      ctx.translate(g * 0.1, g * 0.12);
      ctx.fillStyle = "rgb(0 0 0 / 0.3)";
      ctx.beginPath();
      glyphPath(ctx, b.code, x, y, g);
      ctx.fill();
      ctx.restore();
      bodyWith(ctx, b, "#fffdf7", "#8c826c", 1);
      insideBody(ctx, b, () => {
        // The far half folded into shade, with a crease down the diagonal.
        ctx.fillStyle = "#e2d9c4";
        ctx.beginPath();
        ctx.moveTo(x + h * 1.3, y - h * 1.3);
        ctx.lineTo(x + h * 1.3, y + h * 1.3);
        ctx.lineTo(x - h * 1.3, y + h * 1.3);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgb(140 128 100 / 0.9)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - h * 1.3, y + h * 1.3);
        ctx.lineTo(x + h * 1.3, y - h * 1.3);
        ctx.stroke();
      });
      ctx.strokeStyle = "#8c826c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      glyphPath(ctx, b.code, x, y, g);
      ctx.stroke();
      glyphMark(ctx, b.code, x, y, g, b.color);
    },
  },
  {
    id: "carved",
    draw(ctx, b) {
      const { x, y, g } = b;
      const h = g / 2;
      groundShadow(ctx, x + g * 0.14, y + h + g * 0.1, h * 1.2, h * 0.32, 0.38);
      ctx.fillStyle = "#5b3a22";
      ctx.strokeStyle = "#2e1d10";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y + h, h * 1.12, h * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      const wood = ctx.createLinearGradient(x - h, y - h, x + h, y + h);
      wood.addColorStop(0, "#e8b77e");
      wood.addColorStop(0.55, "#b07642");
      wood.addColorStop(1, "#7a4a24");
      bodyWith(ctx, b, wood, "#3a2414", 1.5);
      insideBody(ctx, b, () => {
        ctx.strokeStyle = "rgb(90 52 24 / 0.55)";
        ctx.lineWidth = 0.9;
        for (const k of [-0.35, 0.05, 0.45]) {
          ctx.beginPath();
          ctx.moveTo(x - h, y + h * k);
          ctx.bezierCurveTo(x - h * 0.3, y + h * (k - 0.22), x + h * 0.3, y + h * (k + 0.22), x + h, y + h * k);
          ctx.stroke();
        }
      });
      glyphMark(ctx, b.code, x, y, g, b.color);
    },
  },
  {
    id: "stone-keep",
    draw(ctx, b) {
      const { x, y, g } = b;
      const h = g / 2;
      ctx.fillStyle = "#6d685e";
      ctx.strokeStyle = "#2e2b27";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.rect(x - h * 1.15, y + h * 0.78, h * 2.3, h * 0.48);
      ctx.fill();
      ctx.stroke();
      bodyWith(ctx, b, "#aaa59a", "#2e2b27", 1.8);
      insideBody(ctx, b, () => {
        ctx.strokeStyle = "rgb(58 54 48 / 0.75)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        const rows = [-0.5, 0, 0.5];
        rows.forEach((row, i) => {
          ctx.moveTo(x - h * 1.2, y + h * row);
          ctx.lineTo(x + h * 1.2, y + h * row);
          for (let j = -2; j <= 2; j += 1) {
            const jx = x + h * (j * 0.6 + (i % 2) * 0.3);
            ctx.moveTo(jx, y + h * row);
            ctx.lineTo(jx, y + h * (row - 0.5));
          }
        });
        ctx.stroke();
        ctx.fillStyle = "rgb(255 255 255 / 0.18)";
        ctx.fillRect(x - h * 1.2, y - h * 1.2, h * 2.4, h * 0.5);
      });
      glyphMark(ctx, b.code, x, y, g, b.color);
    },
  },
  {
    id: "campaign-banners",
    draw(ctx, b) {
      const { x, y, g, tick, motion } = b;
      const h = g / 2;
      // The pole and a swallowtail pennant in your colour, rippling in the wind.
      const px = x + h * 0.78;
      const py = y - h * 1.95;
      ctx.strokeStyle = "#4a3a28";
      ctx.lineWidth = Math.max(1, g / 14);
      ctx.beginPath();
      ctx.moveTo(px, y + h * 0.2);
      ctx.lineTo(px, py);
      ctx.stroke();
      const length = g * 0.95;
      const wave = motion ? Math.sin(tick * 0.5 + x * 0.13) * g * 0.08 : 0;
      ctx.fillStyle = b.color;
      ctx.strokeStyle = "rgb(255 255 255 / 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + length * 0.5, py - g * 0.05 + wave, px + length, py + wave);
      ctx.lineTo(px + length * 0.72, py + g * 0.18 + wave * 0.6);
      ctx.lineTo(px + length, py + g * 0.36 + wave);
      ctx.quadraticCurveTo(px + length * 0.5, py + g * 0.31 + wave * 0.5, px, py + g * 0.36);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px + 1, py + g * 0.18);
      ctx.quadraticCurveTo(px + length * 0.4, py + g * 0.13 + wave * 0.8, px + length * 0.68, py + g * 0.18 + wave * 0.6);
      ctx.stroke();
      // A canvas tent with stitched seams.
      bodyWith(ctx, b, "#f3e7c6", "#7a6038", 1.4);
      ctx.save();
      ctx.setLineDash([2, 1.6]);
      ctx.strokeStyle = "rgb(122 96 56 / 0.85)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y - h * 0.9);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      ctx.restore();
      glyphMark(ctx, b.code, x, y, g, b.color);
    },
  },
  {
    id: "ice",
    draw(ctx, b) {
      const { x, y, g, tick, motion } = b;
      const h = g / 2;
      const ice = ctx.createLinearGradient(x, y - h, x, y + h);
      ice.addColorStop(0, "#ffffff");
      ice.addColorStop(0.5, "#c6e6f8");
      ice.addColorStop(1, "#86bce2");
      bodyWith(ctx, b, ice, "#4f86ad", 1.4);
      insideBody(ctx, b, () => {
        ctx.strokeStyle = "rgb(255 255 255 / 0.85)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - h * 0.2, y - h * 1.1);
        ctx.lineTo(x + h * 0.15, y + h * 0.05);
        ctx.lineTo(x + h * 1.1, y + h * 0.4);
        ctx.moveTo(x - h * 1.1, y - h * 0.05);
        ctx.lineTo(x + h * 0.15, y + h * 0.05);
        ctx.lineTo(x - h * 0.2, y + h * 1.1);
        ctx.stroke();
      });
      glyphMark(ctx, b.code, x, y, g, b.color);
      const glint = motion ? Math.max(0, Math.sin(tick * 0.22 + x * 0.7 + y * 0.3)) : 0.8;
      if (glint > 0.05) {
        const s = g * 0.26 * glint;
        const sx = x + h * 0.72;
        const sy = y - h * 0.82;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(sx, sy - s);
        ctx.quadraticCurveTo(sx, sy, sx + s, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy + s);
        ctx.quadraticCurveTo(sx, sy, sx - s, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy - s);
        ctx.fill();
      }
    },
  },
  {
    id: "clockwork",
    draw(ctx, b) {
      const { x, y, g, tick, motion } = b;
      const h = g / 2;
      // A gear turning behind the piece.
      const r = h * 1.08;
      const turn = motion ? tick * 0.04 : 0;
      ctx.fillStyle = "#7a5a22";
      ctx.strokeStyle = "#3e2c0e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 20; i += 1) {
        const a = turn + (i / 20) * TAU;
        const rr = i % 2 ? r * 0.8 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const brass = ctx.createLinearGradient(x, y - h, x, y + h);
      brass.addColorStop(0, "#ffe7a3");
      brass.addColorStop(0.5, "#cf9d3e");
      brass.addColorStop(1, "#8a6420");
      bodyWith(ctx, b, brass, "#4a3410", 1.4);
      insideBody(ctx, b, () => {
        ctx.fillStyle = "#fff3c0";
        for (const k of [-0.6, 0, 0.6]) {
          circle(ctx, x + h * k, y + h * 0.78, Math.max(0.7, g / 18));
          ctx.fill();
        }
      });
      glyphMark(ctx, b.code, x, y, g, b.color);
    },
  },
  {
    id: "hologram",
    draw(ctx, b) {
      const { x, y, g, tick, motion } = b;
      const h = g / 2;
      const flicker = motion ? 0.82 + 0.18 * Math.sin(tick * 1.7 + x * 0.31) : 1;
      // The projector pad and its beam.
      ctx.fillStyle = "#0b1a24";
      ctx.strokeStyle = "rgb(120 230 255 / 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y + h * 1.12, h * 0.75, h * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgb(120 220 255 / ${0.14 * flicker})`;
      ctx.beginPath();
      ctx.moveTo(x - h * 0.6, y + h * 1.1);
      ctx.lineTo(x - h * 1.2, y - h * 1.1);
      ctx.lineTo(x + h * 1.2, y - h * 1.1);
      ctx.lineTo(x + h * 0.6, y + h * 1.1);
      ctx.closePath();
      ctx.fill();
      ctx.lineJoin = "round";
      ctx.beginPath();
      glyphPath(ctx, b.code, x, y, g);
      ctx.fillStyle = `rgb(110 220 255 / ${0.26 * flicker})`;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgb(90 210 255 / ${0.3 * flicker})`;
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgb(205 250 255 / ${flicker})`;
      ctx.stroke();
      insideBody(ctx, b, () => {
        const gap = Math.max(2.5, g / 5);
        const offset = motion ? (tick * 0.6) % gap : 0;
        ctx.strokeStyle = "rgb(205 250 255 / 0.35)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        for (let ly = y - h * 1.2 + offset; ly < y + h * 1.2; ly += gap) {
          ctx.moveTo(x - h * 1.2, ly);
          ctx.lineTo(x + h * 1.2, ly);
        }
        ctx.stroke();
      });
      glyphMark(ctx, b.code, x, y, g, "#eafcff");
    },
  },
];

/* =============================================================================================== Attack effects */

/** One marker on a front: its position, push direction, size, fade and colour (your white, or amber when stalling). */
export type Marker = { x: number; y: number; dx: number; dy: number; half: number; alpha: number; rgb: string; along: number; tick: number; motion: boolean; full: boolean };

export type AttackFxDef = {
  id: string;
  /** A marker marching toward the front (several per stretch). */
  marker(ctx: Ctx, m: Marker): void;
  /** A tile just taken, `age` 0–6 ticks ago (r: half a tile on screen, plus a little). */
  flash(ctx: Ctx, x: number, y: number, r: number, age: number, rgb: string, seed: number, tick: number, motion: boolean): void;
  /** An attack starting (progress 0–1). */
  launch(ctx: Ctx, x: number, y: number, progress: number, rgb: string, radius: number, motion: boolean, full: boolean): void;
};

function chevronMarker(ctx: Ctx, m: Marker) {
  const { x, y, dx, dy, half, alpha, rgb } = m;
  const tipX = x + dx * half;
  const tipY = y + dy * half;
  const backX = x - dx * half;
  const backY = y - dy * half;
  const nx = -dy * half * 1.15;
  const ny = dx * half * 1.15;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(backX + nx, backY + ny);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(backX - nx, backY - ny);
  ctx.lineWidth = Math.max(3, half * 0.75);
  ctx.strokeStyle = `rgb(${DARK} / ${alpha * 0.55})`;
  ctx.stroke();
  ctx.lineWidth = Math.max(1.6, half * 0.4);
  ctx.strokeStyle = `rgb(${rgb} / ${alpha})`;
  ctx.stroke();
}

export function rippleRing(ctx: Ctx, x: number, y: number, progress: number, rgb: string, radius: number) {
  ctx.lineWidth = 2;
  for (const lag of [0, 0.3]) {
    const p = progress - lag;
    if (p < 0 || p > 1) continue;
    ctx.strokeStyle = `rgb(${rgb} / ${(1 - p) * 0.9})`;
    ctx.beginPath();
    ctx.arc(x, y, radius * (0.3 + p), 0, TAU);
    ctx.stroke();
  }
}

export const DEFAULT_ATTACK: AttackFxDef = {
  id: "",
  marker: chevronMarker,
  flash(ctx, x, y, r, age, rgb) {
    const size = r * (1 + age * 0.3);
    ctx.fillStyle = `rgb(${rgb} / ${(1 - age / 6) * 0.85})`;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
  },
  launch(ctx, x, y, progress, rgb, radius) {
    rippleRing(ctx, x, y, progress, rgb, radius);
  },
};

/** A jagged bolt from (x0, y0) to (x1, y1), its kinks fixed by `seed`. */
function bolt(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, jitter: number, seed: number, segments = 4) {
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const len = Math.hypot(nx, ny) || 1;
  ctx.moveTo(x0, y0);
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const off = (hash2(seed, i, 5) - 0.5) * 2 * jitter;
    ctx.lineTo(x0 + (x1 - x0) * t + (nx / len) * off, y0 + (y1 - y0) * t + (ny / len) * off);
  }
  ctx.lineTo(x1, y1);
}

const ATTACK_FX: AttackFxDef[] = [
  {
    id: "arrows",
    marker(ctx, m) {
      const { dx, dy, half, alpha, rgb } = m;
      // Arrows fly in a shallow arc.
      const lift = Math.sin(Math.PI * m.along) * half * 0.9;
      const x = m.x - dy * lift;
      const y = m.y + dx * lift;
      const len = half * 2.2;
      const tx = x - dx * len;
      const ty = y - dy * len;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgb(${DARK} / ${alpha * 0.5})`;
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgb(${rgb} / ${alpha})`;
      ctx.stroke();
      const nx = -dy * half * 0.42;
      const ny = dx * half * 0.42;
      ctx.fillStyle = `rgb(${rgb} / ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x + dx * half * 0.7, y + dy * half * 0.7);
      ctx.lineTo(x + nx, y + ny);
      ctx.lineTo(x - nx, y - ny);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const side of [1, -1]) {
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - dx * half * 0.45 + nx * side * 0.8, ty - dy * half * 0.45 + ny * side * 0.8);
      }
      ctx.stroke();
    },
    flash(ctx, x, y, r, age, rgb) {
      const p = age / 6;
      const s = r * 0.8;
      ctx.lineCap = "round";
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = `rgb(${rgb} / ${1 - p})`;
      ctx.beginPath();
      ctx.moveTo(x - s, y - s);
      ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s);
      ctx.lineTo(x - s, y + s);
      ctx.stroke();
      ctx.strokeStyle = `rgb(200 180 140 / ${(1 - p) * 0.6})`;
      circle(ctx, x, y, r * (0.6 + p * 1.2));
      ctx.stroke();
    },
    launch(ctx, x, y, progress, rgb, radius) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -progress * 30;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgb(${rgb} / ${1 - progress})`;
      circle(ctx, x, y, radius * (0.4 + progress * 0.7));
      ctx.stroke();
      ctx.restore();
    },
  },
  {
    id: "ink",
    marker(ctx, m) {
      const { x, y, dx, dy, half, alpha, rgb } = m;
      const r = half * 0.62;
      ctx.fillStyle = `rgb(20 16 34 / ${alpha * 0.9})`;
      ctx.strokeStyle = `rgb(${rgb} / ${alpha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - dx * half * 1.7, y - dy * half * 1.7);
      ctx.lineTo(x - dy * r, y + dx * r);
      ctx.arc(x, y, r, Math.atan2(dx, -dy), Math.atan2(dx, -dy) + Math.PI, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = `rgb(${rgb} / ${alpha})`;
      circle(ctx, x + dx * half * 1.05, y + dy * half * 1.05, half * 0.2);
      ctx.fill();
    },
    flash(ctx, x, y, r, age, rgb, seed) {
      const p = age / 6;
      const grow = 0.6 + 0.4 * Math.min(1, age / 2);
      ctx.fillStyle = `rgb(20 16 34 / ${(1 - p) * 0.85})`;
      circle(ctx, x, y, r * 0.8 * grow);
      ctx.fill();
      for (let i = 0; i < 3; i += 1) {
        const a = hash2(seed, i, 7) * TAU;
        const d = r * (1.1 + hash2(seed, i, 8) * 0.6) * grow;
        circle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * 0.25);
        ctx.fill();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgb(${rgb} / ${(1 - p) * 0.7})`;
      circle(ctx, x, y, r * 0.8 * grow);
      ctx.stroke();
    },
    launch(ctx, x, y, progress, rgb, radius) {
      const r = radius * (0.3 + 0.7 * (1 - (1 - progress) ** 3));
      ctx.fillStyle = `rgb(20 16 34 / ${(1 - progress) * 0.5})`;
      circle(ctx, x, y, r);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgb(${rgb} / ${1 - progress})`;
      ctx.stroke();
    },
  },
  {
    id: "flares",
    marker(ctx, m) {
      const { x, y, dx, dy, half, alpha, rgb } = m;
      for (let k = 1; k <= 3; k += 1) {
        ctx.fillStyle = `rgb(200 200 214 / ${(alpha * 0.24) / k})`;
        circle(ctx, x - dx * half * k * 0.9, y - dy * half * k * 0.9 - (m.motion ? k * 0.7 : 0), half * (0.3 + k * 0.12));
        ctx.fill();
      }
      ctx.fillStyle = `rgb(255 92 60 / ${alpha * 0.38})`;
      circle(ctx, x, y, half * 1.05);
      ctx.fill();
      ctx.fillStyle = `rgb(255 170 120 / ${alpha * 0.7})`;
      circle(ctx, x, y, half * 0.62);
      ctx.fill();
      ctx.fillStyle = `rgb(${rgb} / ${alpha})`;
      circle(ctx, x, y, half * 0.36);
      ctx.fill();
    },
    flash(ctx, x, y, r, age) {
      const p = age / 6;
      ctx.fillStyle = `rgb(255 ${Math.round(160 - p * 80)} 70 / ${(1 - p) * 0.9})`;
      circle(ctx, x, y - p * r * 1.4, r * 0.55 * (1 - p * 0.4));
      ctx.fill();
    },
    launch(ctx, x, y, progress, rgb, radius, motion) {
      const cy = y - (motion ? progress * radius * 0.5 : 0);
      ctx.lineCap = "round";
      ctx.lineWidth = 2;
      for (let i = 0; i < 10; i += 1) {
        const a = (i / 10) * TAU;
        const inner = radius * (0.15 + progress * 0.7);
        const outer = inner + radius * 0.35 * (1 - progress);
        ctx.strokeStyle = `rgb(${i % 2 ? "255 110 70" : rgb} / ${1 - progress})`;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(x + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();
      }
      ctx.fillStyle = `rgb(255 200 150 / ${1 - progress})`;
      circle(ctx, x, cy, radius * 0.12);
      ctx.fill();
    },
  },
  {
    id: "tide",
    marker(ctx, m) {
      const { x, y, dx, dy, half, alpha, rgb } = m;
      const nx = -dy * half * 1.15;
      const ny = dx * half * 1.15;
      const bx = x - dx * half * 0.45;
      const by = y - dy * half * 0.45;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(bx + nx, by + ny);
      ctx.quadraticCurveTo(x + dx * half * 0.9, y + dy * half * 0.9, bx - nx, by - ny);
      ctx.lineWidth = Math.max(3, half * 0.7);
      ctx.strokeStyle = `rgb(60 200 215 / ${alpha * 0.7})`;
      ctx.stroke();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = `rgb(${rgb} / ${alpha})`;
      ctx.stroke();
      ctx.fillStyle = `rgb(220 250 255 / ${alpha * 0.8})`;
      for (const side of [0.55, -0.55]) {
        circle(ctx, bx - dx * half * 0.5 + nx * side, by - dy * half * 0.5 + ny * side, half * 0.14);
        ctx.fill();
      }
    },
    flash(ctx, x, y, r, age) {
      const p = age / 6;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgb(205 248 252 / ${1 - p})`;
      circle(ctx, x, y, r * (0.5 + p * 0.8));
      ctx.stroke();
      circle(ctx, x + r * 0.6, y - r * 0.5, r * (0.25 + p * 0.4));
      ctx.stroke();
    },
    launch(ctx, x, y, progress, rgb, radius) {
      ctx.lineWidth = 2;
      for (const lag of [0, 0.2, 0.4]) {
        const p = progress - lag;
        if (p < 0 || p > 1) continue;
        ctx.strokeStyle = lag === 0.2 ? `rgb(60 200 215 / ${1 - p})` : `rgb(${rgb} / ${(1 - p) * 0.9})`;
        ctx.beginPath();
        ctx.ellipse(x, y, radius * (0.3 + p), radius * (0.3 + p) * 0.65, 0, 0, TAU);
        ctx.stroke();
      }
    },
  },
  {
    id: "swarm",
    marker(ctx, m) {
      const { x, y, half, alpha, rgb, tick } = m;
      const count = m.full ? 6 : 4;
      for (let i = 0; i < count; i += 1) {
        const a = (m.motion ? tick * 0.35 : 0) + (i / count) * TAU + m.along * 6;
        const rr = half * (0.55 + 0.35 * Math.sin(a * 1.7 + i));
        const mx = x + Math.cos(a) * rr;
        const my = y + Math.sin(a) * rr * 0.7;
        ctx.fillStyle = `rgb(210 255 120 / ${alpha * 0.35})`;
        circle(ctx, mx, my, 2.6);
        ctx.fill();
        ctx.fillStyle = `rgb(${rgb} / ${alpha})`;
        circle(ctx, mx, my, 1.1);
        ctx.fill();
      }
    },
    flash(ctx, x, y, r, age, _rgb, seed) {
      const p = age / 6;
      ctx.fillStyle = `rgb(220 255 140 / ${1 - p})`;
      for (let i = 0; i < 3; i += 1) {
        const a = hash2(seed, i, 9) * TAU;
        circle(ctx, x + Math.cos(a) * r * (0.3 + p * 1.4), y + Math.sin(a) * r * (0.3 + p * 1.4), 1.3);
        ctx.fill();
      }
    },
    launch(ctx, x, y, progress, rgb, radius, _motion, full) {
      const count = full ? 14 : 8;
      for (let i = 0; i < count; i += 1) {
        const a = (i / count) * TAU + progress;
        const d = radius * (0.2 + progress);
        ctx.fillStyle = i % 2 ? `rgb(210 255 120 / ${1 - progress})` : `rgb(${rgb} / ${1 - progress})`;
        circle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 1.8);
        ctx.fill();
      }
    },
  },
  {
    id: "packets",
    marker(ctx, m) {
      const { x, y, dx, dy, half, alpha, rgb } = m;
      for (let k = 3; k >= 1; k -= 1) {
        const s = half * (0.7 - k * 0.13);
        ctx.fillStyle = `rgb(120 255 170 / ${alpha * 0.6 ** k})`;
        ctx.fillRect(x - dx * half * 0.8 * k - s / 2, y - dy * half * 0.8 * k - s / 2, s, s);
      }
      const s = half * 0.85;
      ctx.fillStyle = `rgb(${DARK} / ${alpha * 0.6})`;
      ctx.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2);
      ctx.fillStyle = `rgb(${rgb} / ${alpha})`;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    },
    flash(ctx, x, y, r, age, _rgb, seed, tick, motion) {
      const p = age / 6;
      const on = !motion || ((Math.floor(tick * 3) + seed) & 1) === 0;
      for (let i = 0; i < 3; i += 1) {
        const ox = (hash2(seed, i, 10) - 0.5) * r * 2;
        const oy = (hash2(seed, i, 11) - 0.5) * r * 2;
        const s = r * (0.4 + hash2(seed, i, 12) * 0.5);
        ctx.fillStyle = i === 0 && on ? `rgb(255 255 255 / ${1 - p})` : `rgb(120 255 170 / ${(1 - p) * (on ? 0.95 : 0.5)})`;
        ctx.fillRect(x + ox - s / 2, y + oy - s / 2, s, s);
      }
    },
    launch(ctx, x, y, progress, rgb, radius) {
      const s = radius * (0.3 + progress);
      const c = s * 0.35;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgb(${rgb} / ${1 - progress})`;
      ctx.beginPath();
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]) {
        ctx.moveTo(x + sx * s, y + sy * (s - c));
        ctx.lineTo(x + sx * s, y + sy * s);
        ctx.lineTo(x + sx * (s - c), y + sy * s);
      }
      ctx.stroke();
    },
  },
  {
    id: "storm",
    marker(ctx, m) {
      const { x, y, dx, dy, half, alpha, rgb, tick } = m;
      const seed = m.motion ? Math.floor(tick * 2) + Math.round(x + y) : Math.round(x * 3 + y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      bolt(ctx, x - dx * half * 1.7, y - dy * half * 1.7, x + dx * half * 0.9, y + dy * half * 0.9, half * 0.5, seed);
      ctx.lineWidth = Math.max(3, half * 0.7);
      ctx.strokeStyle = `rgb(120 200 255 / ${alpha * 0.4})`;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgb(${rgb} / ${alpha})`;
      ctx.stroke();
    },
    flash(ctx, x, y, r, age, _rgb, seed, tick, motion) {
      const p = age / 6;
      const on = !motion || ((Math.floor(tick * 4) + seed) & 1) === 0;
      const size = r * 1.1;
      ctx.fillStyle = `rgb(170 225 255 / ${(1 - p) * (on ? 0.9 : 0.35)})`;
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
      if (on) {
        ctx.fillStyle = `rgb(255 255 255 / ${1 - p})`;
        ctx.fillRect(x - size * 0.4, y - size * 0.4, size * 0.8, size * 0.8);
      }
    },
    launch(ctx, x, y, progress, rgb, radius) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU + 0.4;
        const len = radius * (0.45 + progress * 0.65);
        bolt(ctx, x, y, x + Math.cos(a) * len, y + Math.sin(a) * len, radius * 0.12, i * 31 + 7, 3);
      }
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgb(120 200 255 / ${(1 - progress) * 0.45})`;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgb(${rgb} / ${1 - progress})`;
      ctx.stroke();
    },
  },
];

/* =============================================================================================== Boats */

/** A hull drawn pointing along +x in local coordinates; `hull` is half its length. */
export type BoatDraw = { hull: number; tick: number; motion: boolean; color: string; seed: number; angle: number };
export type BoatSkinDef = {
  id: string;
  /** The outline, for the white "yours" halo. */
  path(ctx: Ctx, b: BoatDraw): void;
  paint(ctx: Ctx, b: BoatDraw): void;
};

const BOAT_SKINS: BoatSkinDef[] = [
  {
    id: "paper-boat",
    path(ctx, { hull }) {
      ctx.moveTo(hull, 0);
      ctx.lineTo(hull * 0.45, -hull * 0.48);
      ctx.lineTo(-hull * 0.45, -hull * 0.48);
      ctx.lineTo(-hull, 0);
      ctx.lineTo(-hull * 0.45, hull * 0.48);
      ctx.lineTo(hull * 0.45, hull * 0.48);
      ctx.closePath();
    },
    paint(ctx, b) {
      const { hull } = b;
      ctx.lineJoin = "round";
      ctx.fillStyle = "#fbf8f0";
      ctx.strokeStyle = "#9c9481";
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.path(ctx, b);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = b.color;
      ctx.lineWidth = Math.max(1, hull * 0.12);
      ctx.save();
      ctx.scale(0.78, 0.74);
      ctx.beginPath();
      this.path(ctx, b);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#ece6d6";
      ctx.strokeStyle = "#b9b2a0";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(hull * 0.5, 0);
      ctx.lineTo(-hull * 0.5, -hull * 0.3);
      ctx.lineTo(-hull * 0.5, hull * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    },
  },
  {
    id: "swan",
    path(ctx, { hull }) {
      ctx.moveTo(hull * 0.55, 0);
      ctx.bezierCurveTo(hull * 0.5, -hull * 0.6, -hull * 0.9, -hull * 0.6, -hull * 0.95, 0);
      ctx.bezierCurveTo(-hull * 0.9, hull * 0.6, hull * 0.5, hull * 0.6, hull * 0.55, 0);
      ctx.closePath();
    },
    paint(ctx, b) {
      const { hull, tick, motion } = b;
      if (motion) {
        const p = (tick * 0.08 + b.seed * 0.37) % 1;
        ctx.strokeStyle = `rgb(255 255 255 / ${0.55 * (1 - p)})`;
        ctx.lineWidth = 1;
        for (const side of [1, -1]) {
          ctx.beginPath();
          ctx.arc(-hull * 0.1, side * hull * 0.5, hull * (0.15 + p * 0.35), 0, TAU);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "#fbfbf8";
      ctx.strokeStyle = "#6d6a62";
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.path(ctx, b);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgb(150 148 138 / 0.8)";
      ctx.lineWidth = 0.8;
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(hull * 0.25, side * hull * 0.18);
        ctx.quadraticCurveTo(-hull * 0.3, side * hull * 0.45, -hull * 0.8, side * hull * 0.12);
        ctx.stroke();
      }
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hull * 0.4, 0);
      ctx.bezierCurveTo(hull * 0.75, hull * 0.25, hull * 0.7, -hull * 0.3, hull * 1.0, -hull * 0.1);
      ctx.lineWidth = hull * 0.24;
      ctx.strokeStyle = "#6d6a62";
      ctx.stroke();
      ctx.lineWidth = hull * 0.15;
      ctx.strokeStyle = "#fbfbf8";
      ctx.stroke();
      ctx.fillStyle = "#fbfbf8";
      circle(ctx, hull * 1.0, -hull * 0.1, hull * 0.13);
      ctx.fill();
      ctx.fillStyle = "#f28c28";
      ctx.beginPath();
      ctx.moveTo(hull * 1.1, -hull * 0.17);
      ctx.lineTo(hull * 1.32, -hull * 0.08);
      ctx.lineTo(hull * 1.1, -hull * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = b.color;
      circle(ctx, -hull * 0.2, 0, hull * 0.14);
      ctx.fill();
    },
  },
  {
    id: "lantern-junk",
    path(ctx, { hull }) {
      ctx.moveTo(hull, 0);
      ctx.quadraticCurveTo(hull * 0.8, -hull * 0.55, -hull * 0.5, -hull * 0.5);
      ctx.lineTo(-hull * 0.95, -hull * 0.38);
      ctx.lineTo(-hull * 0.95, hull * 0.38);
      ctx.lineTo(-hull * 0.5, hull * 0.5);
      ctx.quadraticCurveTo(hull * 0.8, hull * 0.55, hull, 0);
      ctx.closePath();
    },
    paint(ctx, b) {
      const { hull, tick, motion } = b;
      ctx.fillStyle = "#7a3b1e";
      ctx.strokeStyle = "#2e140a";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      this.path(ctx, b);
      ctx.fill();
      ctx.stroke();
      for (const mx of [hull * 0.38, -hull * 0.32]) {
        ctx.fillStyle = "#e9a33c";
        ctx.strokeStyle = "#7a4a14";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(mx - hull * 0.12, -hull * 0.78);
        ctx.quadraticCurveTo(mx + hull * 0.3, 0, mx - hull * 0.12, hull * 0.78);
        ctx.lineTo(mx - hull * 0.32, hull * 0.72);
        ctx.quadraticCurveTo(mx + hull * 0.05, 0, mx - hull * 0.32, -hull * 0.72);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        for (const ry of [-0.45, 0, 0.45]) {
          ctx.moveTo(mx - hull * 0.28 + Math.abs(ry) * hull * 0.1, hull * ry);
          ctx.lineTo(mx - hull * 0.02 - Math.abs(ry) * hull * 0.25 + hull * 0.12, hull * ry);
        }
        ctx.stroke();
      }
      ctx.fillStyle = b.color;
      ctx.fillRect(-hull * 0.95, -hull * 0.12, hull * 0.2, hull * 0.24);
      const glow = motion ? 0.28 + 0.14 * Math.sin(tick * 0.4 + b.seed) : 0.34;
      ctx.fillStyle = `rgb(255 190 90 / ${glow})`;
      circle(ctx, -hull * 0.82, 0, hull * 0.42);
      ctx.fill();
      ctx.fillStyle = "#ffd27a";
      circle(ctx, -hull * 0.82, 0, hull * 0.13);
      ctx.fill();
    },
  },
  {
    id: "longship",
    path(ctx, { hull }) {
      ctx.moveTo(hull * 1.15, 0);
      ctx.quadraticCurveTo(hull * 0.6, -hull * 0.44, -hull * 0.6, -hull * 0.38);
      ctx.quadraticCurveTo(-hull * 1.15, -hull * 0.26, -hull * 1.12, 0);
      ctx.quadraticCurveTo(-hull * 1.15, hull * 0.26, -hull * 0.6, hull * 0.38);
      ctx.quadraticCurveTo(hull * 0.6, hull * 0.44, hull * 1.15, 0);
      ctx.closePath();
    },
    paint(ctx, b) {
      const { hull } = b;
      ctx.fillStyle = "#8a5a32";
      ctx.strokeStyle = "#3a2414";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      this.path(ctx, b);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgb(58 36 20 / 0.6)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-hull * 0.9, 0);
      ctx.lineTo(hull * 0.9, 0);
      ctx.stroke();
      for (let i = 0; i < 4; i += 1) {
        const sx = -hull * 0.62 + i * hull * 0.36;
        for (const side of [1, -1]) {
          ctx.fillStyle = (i + (side > 0 ? 0 : 1)) % 2 ? b.color : "#f4ece0";
          ctx.strokeStyle = "#3a2414";
          ctx.lineWidth = 0.7;
          circle(ctx, sx, side * hull * 0.31, hull * 0.13);
          ctx.fill();
          ctx.stroke();
        }
      }
      // The striped square sail, seen from above.
      ctx.fillStyle = "#f4ece0";
      ctx.fillRect(-hull * 0.12, -hull * 0.62, hull * 0.26, hull * 1.24);
      ctx.fillStyle = "#c0392b";
      for (const k of [-0.42, -0.06, 0.3]) ctx.fillRect(-hull * 0.12, hull * k, hull * 0.26, hull * 0.16);
      ctx.strokeStyle = "#3a2414";
      ctx.strokeRect(-hull * 0.12, -hull * 0.62, hull * 0.26, hull * 1.24);
      ctx.fillStyle = "#3f8f4a";
      circle(ctx, hull * 1.12, 0, hull * 0.13);
      ctx.fill();
      ctx.stroke();
    },
  },
  {
    id: "sea-turtle",
    path(ctx, { hull }) {
      ctx.ellipse(0, 0, hull * 0.78, hull * 0.62, 0, 0, TAU);
    },
    paint(ctx, b) {
      const { hull, tick, motion } = b;
      const swing = motion ? Math.sin(tick * 0.5 + b.seed) * 0.5 : 0.2;
      ctx.fillStyle = "#6aa36a";
      ctx.strokeStyle = "#23402a";
      ctx.lineWidth = 0.9;
      for (const [fx, fy, size, phase] of [
        [0.42, 0.55, 0.36, 1],
        [0.42, -0.55, 0.36, -1],
        [-0.5, 0.45, 0.24, -1],
        [-0.5, -0.45, 0.24, 1],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(hull * fx, hull * fy, hull * size, hull * size * 0.42, (fy > 0 ? 0.6 : -0.6) + swing * phase, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = "#7bb377";
      circle(ctx, hull * 0.9, 0, hull * 0.22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#1d3b25";
      for (const side of [1, -1]) {
        circle(ctx, hull * 0.98, side * hull * 0.09, hull * 0.04);
        ctx.fill();
      }
      ctx.fillStyle = "#3e7d4f";
      ctx.strokeStyle = "#1d3b25";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      this.path(ctx, b);
      ctx.fill();
      ctx.stroke();
      const r = hull * 0.28;
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = "rgb(20 50 30 / 0.75)";
      ctx.fillStyle = b.color;
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * TAU;
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.85);
        ctx.lineTo(Math.cos(a) * hull * 0.74, Math.sin(a) * hull * 0.58);
      }
      ctx.stroke();
    },
  },
  {
    id: "submarine",
    path(ctx, { hull }) {
      ctx.ellipse(0, 0, hull * 1.05, hull * 0.3, 0, 0, TAU);
    },
    paint(ctx, b) {
      const { hull, tick, motion } = b;
      if (motion) {
        for (let k = 0; k < 3; k += 1) {
          const p = (tick * 0.1 + k / 3 + b.seed * 0.13) % 1;
          ctx.strokeStyle = `rgb(220 240 255 / ${0.7 * (1 - p)})`;
          ctx.lineWidth = 0.9;
          circle(ctx, -hull * (1.15 + p * 0.9), Math.sin(k * 2.1 + b.seed) * hull * 0.18, hull * (0.07 + p * 0.06));
          ctx.stroke();
        }
      }
      ctx.fillStyle = "#3c4a55";
      ctx.strokeStyle = "#141a1f";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      this.path(ctx, b);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgb(255 255 255 / 0.25)";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(-hull * 0.7, -hull * 0.13);
      ctx.lineTo(hull * 0.6, -hull * 0.13);
      ctx.stroke();
      ctx.fillStyle = "#56656f";
      ctx.strokeStyle = "#141a1f";
      ctx.beginPath();
      ctx.roundRect(-hull * 0.25, -hull * 0.17, hull * 0.46, hull * 0.34, hull * 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = b.color;
      circle(ctx, hull * 0.02, 0, hull * 0.08);
      ctx.fill();
      ctx.strokeStyle = "rgb(220 240 255 / 0.75)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(hull * 1.12, -hull * 0.4);
      ctx.quadraticCurveTo(hull * 0.82, 0, hull * 1.12, hull * 0.4);
      ctx.stroke();
    },
  },
  {
    id: "zeppelin",
    path(ctx, b) {
      ctx.ellipse(0, -zeppelinLift(b), b.hull * 1.05, b.hull * 0.42, 0, 0, TAU);
    },
    paint(ctx, b) {
      const { hull } = b;
      const lift = zeppelinLift(b);
      // Its shadow on the water, always cast down and to the right of the screen.
      const sx = hull * 0.35 + lift * 0.6;
      const sy = hull * 0.55 + lift;
      const cos = Math.cos(-b.angle);
      const sin = Math.sin(-b.angle);
      ctx.fillStyle = "rgb(0 0 0 / 0.3)";
      ctx.beginPath();
      ctx.ellipse(sx * cos - sy * sin, sx * sin + sy * cos, hull * 0.95, hull * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#8f9aa6";
      ctx.strokeStyle = "#4a525c";
      ctx.lineWidth = 0.9;
      for (const side of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(-hull * 0.7, side * hull * 0.2 - lift);
        ctx.lineTo(-hull * 1.12, side * hull * 0.55 - lift);
        ctx.lineTo(-hull * 1.02, side * hull * 0.1 - lift);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      const silver = ctx.createLinearGradient(0, -hull * 0.42 - lift, 0, hull * 0.42 - lift);
      silver.addColorStop(0, "#eef2f6");
      silver.addColorStop(1, "#8f9aa6");
      ctx.fillStyle = silver;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      this.path(ctx, b);
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = b.color;
      ctx.fillRect(-hull * 0.18, -hull * 0.5 - lift, hull * 0.24, hull);
      ctx.strokeStyle = "rgb(74 82 92 / 0.45)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const k of [-0.6, 0.4, 0.75]) {
        ctx.moveTo(hull * k, -hull * 0.5 - lift);
        ctx.lineTo(hull * k, hull * 0.5 - lift);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#4a525c";
      ctx.beginPath();
      this.path(ctx, b);
      ctx.stroke();
    },
  },
];

function zeppelinLift(b: BoatDraw) {
  return b.motion ? (Math.sin(b.tick * 0.12 + b.seed) + 1) * b.hull * 0.08 : b.hull * 0.08;
}

/* =============================================================================================== Theme */

export type FrontWarsTheme = {
  map: MapStyleDef;
  pattern: PatternDef | null;
  building: BuildingSkinDef | null;
  attack: AttackFxDef;
  boat: BoatSkinDef | null;
  style: ArtStyleDef;
};

const byId = <T extends { id: string }>(list: T[]) => Object.fromEntries(list.map((entry) => [entry.id, entry])) as Record<string, T>;
const BUILDINGS = byId(BUILDING_SKINS);
const ATTACKS = byId(ATTACK_FX);
const BOATS = byId(BOAT_SKINS);

/** Every slug that draws something, per category; it must match the shop's catalog in GAME_SHOPS["front-wars"]. */
export const FRONT_WARS_SLUGS = {
  map: Object.keys(MAP_STYLES),
  pattern: Object.keys(PATTERNS),
  building: Object.keys(BUILDINGS),
  attack: Object.keys(ATTACKS),
  boat: Object.keys(BOATS),
  style: Object.keys(ART_STYLES),
};

export function frontWarsTheme(look: GameLook): FrontWarsTheme {
  return {
    map: MAP_STYLES[look.map ?? ""] ?? COMMAND_MAP,
    pattern: PATTERNS[look.pattern ?? ""] ?? null,
    building: BUILDINGS[look.building ?? ""] ?? null,
    attack: ATTACKS[look.attack ?? ""] ?? DEFAULT_ATTACK,
    boat: BOATS[look.boat ?? ""] ?? null,
    style: ART_STYLES[look.style ?? ""] ?? COMMAND_DISPLAY,
  };
}

export const DEFAULT_THEME = frontWarsTheme({});
