"use client";

import { HILLS, MOUNTAINS, POST_RADIUS, WATER, neighbors, type Game } from "./engine";

/**
 * Front Wars drawing. The map is one pixel per tile on an offscreen canvas, repainted only where tiles changed;
 * each frame scales it up (crisp, no smoothing) and draws buildings, attack arrows and nation labels on top.
 */

/** Screen position of tile (0, 0) and the size of one tile, in CSS pixels. */
export type View = { scale: number; x: number; y: number };

type Rgb = [number, number, number];
const WATER_RGB: Rgb = [14, 38, 62];
const COAST_RGB: Rgb = [30, 70, 102];
const TERRAIN_RGB: Rgb[] = [WATER_RGB, [84, 104, 62], [118, 108, 74], [146, 140, 128]];

const hexRgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const compact = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}K` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly shade: Float32Array;
  private readonly colors: Rgb[];
  readonly buildings = new Set<number>();

  constructor(private readonly game: Game) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = game.w;
    this.canvas.height = game.h;
    this.context = this.canvas.getContext("2d")!;
    this.image = this.context.createImageData(game.w, game.h);
    this.colors = game.nations.map((nation) => hexRgb(nation.color));
    // A fixed per-tile grain so land doesn't read as flat blocks.
    this.shade = Float32Array.from({ length: game.w * game.h }, (_, t) => {
      const hash = Math.sin(t * 12.9898 + 78.233) * 43758.5453;
      return 0.93 + (hash - Math.floor(hash)) * 0.14;
    });
    for (let t = 0; t < game.w * game.h; t += 1) this.paint(t);
    this.context.putImageData(this.image, 0, 0);
    game.dirty.length = 0;
  }

  private paint(t: number) {
    const { game } = this;
    const terrain = game.terrain[t];
    const owner = game.owner[t];
    let rgb: Rgb;
    if (terrain === WATER) {
      let coast = false;
      for (const n of neighbors(t, game.w, game.h)) if (game.terrain[n] !== WATER) coast = true;
      rgb = coast ? COAST_RGB : WATER_RGB;
    } else if (!owner) {
      rgb = TERRAIN_RGB[terrain];
    } else {
      // Owned land: the nation's color over the terrain, with a bright edge where it meets other land.
      const nation = this.colors[owner];
      let edge = false;
      for (const n of neighbors(t, game.w, game.h)) if (game.terrain[n] !== WATER && game.owner[n] !== owner) edge = true;
      const relief = terrain === MOUNTAINS ? 0.42 : terrain === HILLS ? 0.32 : 0.22;
      rgb = edge ? mixRgb(nation, [255, 255, 255], 0.38) : mixRgb(nation, TERRAIN_RGB[terrain], relief);
    }
    const s = this.shade[t];
    const i = t * 4;
    const data = this.image.data;
    data[i] = rgb[0] * s;
    data[i + 1] = rgb[1] * s;
    data[i + 2] = rgb[2] * s;
    data[i + 3] = 255;
    if (game.building[t]) this.buildings.add(t);
    else this.buildings.delete(t);
  }

  /** Repaint the tiles the simulation changed (and their neighbors, whose edges may have moved). */
  update() {
    const { game } = this;
    if (!game.dirty.length) return;
    let x0 = game.w;
    let y0 = game.h;
    let x1 = -1;
    let y1 = -1;
    const seen = new Set<number>();
    for (const t of game.dirty) {
      const around = [t, ...neighbors(t, game.w, game.h)];
      for (const n of around) {
        if (seen.has(n)) continue;
        seen.add(n);
        this.paint(n);
        const x = n % game.w;
        const y = (n / game.w) | 0;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    game.dirty.length = 0;
    this.context.putImageData(this.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
}

export type Ping = { tile: number; at: number; ok: boolean };
export type Overlay = {
  hover: number;
  mode: "attack" | "city" | "post";
  pings: Ping[];
  now: number;
};

/** One frame: the map, buildings, attacks, labels and the pointer's feedback. */
export function drawFrame(ctx: CanvasRenderingContext2D, renderer: MapRenderer, game: Game, view: View, size: { width: number; height: number; dpr: number }, overlay: Overlay) {
  const { scale } = view;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.fillStyle = `rgb(${WATER_RGB.join(" ")})`;
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(renderer.canvas, view.x, view.y, game.w * scale, game.h * scale);

  const at = (t: number) => [view.x + ((t % game.w) + 0.5) * scale, view.y + (((t / game.w) | 0) + 0.5) * scale] as const;
  const visible = (x: number, y: number, margin = 40) => x > -margin && y > -margin && x < size.width + margin && y < size.height + margin;

  // Buildings: a City is a little house, a Defense Post a shield; the hover over a Post shows its reach.
  const glyph = Math.max(7, Math.min(18, scale * 2.2));
  for (const t of renderer.buildings) {
    const [x, y] = at(t);
    if (!visible(x, y)) continue;
    const color = game.nations[game.owner[t]]?.color ?? "#fff";
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgb(8 6 14 / 0.85)";
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    if (game.building[t] === 1) {
      ctx.moveTo(x - glyph / 2, y + glyph / 2);
      ctx.lineTo(x - glyph / 2, y - glyph / 8);
      ctx.lineTo(x, y - glyph / 2);
      ctx.lineTo(x + glyph / 2, y - glyph / 8);
      ctx.lineTo(x + glyph / 2, y + glyph / 2);
    } else {
      ctx.moveTo(x, y - glyph / 2);
      ctx.lineTo(x + glyph / 2, y - glyph / 4);
      ctx.quadraticCurveTo(x + glyph / 2, y + glyph / 3, x, y + glyph / 2);
      ctx.quadraticCurveTo(x - glyph / 2, y + glyph / 3, x - glyph / 2, y - glyph / 4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y + glyph / 8, glyph / 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Attacks: an arrow from the attacker's heartland to where it's aimed, with the troops still in it.
  for (const attack of game.attacks) {
    const from = game.nations[attack.from];
    const [fx, fy] = [view.x + (from.cx + 0.5) * scale, view.y + (from.cy + 0.5) * scale];
    const [tx, ty] = at(attack.aim);
    const mine = attack.from === 1;
    const angle = Math.atan2(ty - fy, tx - fx);
    const length = Math.hypot(tx - fx, ty - fy);
    if (length < 6) continue;
    ctx.save();
    ctx.globalAlpha = mine ? 0.95 : 0.55;
    ctx.strokeStyle = mine ? "#fff" : from.color;
    ctx.lineWidth = mine ? 3 : 2;
    ctx.setLineDash(mine ? [8, 6] : [5, 5]);
    ctx.lineDashOffset = -overlay.now / 40;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx - Math.cos(angle) * 8, ty - Math.sin(angle) * 8);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - Math.cos(angle - 0.45) * 12, ty - Math.sin(angle - 0.45) * 12);
    ctx.lineTo(tx - Math.cos(angle + 0.45) * 12, ty - Math.sin(angle + 0.45) * 12);
    ctx.closePath();
    ctx.fill();
    if (mine || scale > 4) {
      label(ctx, compact(attack.troops), (fx + tx) / 2, (fy + ty) / 2 - 8, mine ? 12 : 10, "#fff");
    }
    ctx.restore();
  }

  // Nation names and troops, sized to their land.
  for (const nation of game.nations) {
    if (!nation.alive || !nation.tiles) continue;
    const x = view.x + (nation.cx + 0.5) * scale;
    const y = view.y + (nation.cy + 0.5) * scale;
    if (!visible(x, y, 120)) continue;
    const font = Math.max(10, Math.min(24, Math.sqrt(nation.tiles) * scale * 0.18));
    if (font < 10.5 && !nation.human) continue;
    label(ctx, nation.name, x, y - font * 0.55, font, "#fff", 700);
    label(ctx, compact(nation.troops), x, y + font * 0.55, font * 0.82, "#fff", 600);
  }

  // Pointer feedback: the hovered tile, a Post's reach while placing one, and a ring where you clicked.
  if (overlay.hover >= 0) {
    const [x, y] = at(overlay.hover);
    ctx.lineWidth = 2;
    ctx.strokeStyle = overlay.mode === "attack" ? "rgb(255 255 255 / 0.9)" : "rgb(255 214 107 / 0.95)";
    ctx.strokeRect(x - scale / 2 - 1, y - scale / 2 - 1, scale + 2, scale + 2);
    if (overlay.mode === "post") {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, POST_RADIUS * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const ping of overlay.pings) {
    const age = (overlay.now - ping.at) / 600;
    if (age > 1) continue;
    const [x, y] = at(ping.tile);
    ctx.strokeStyle = ping.ok ? `rgb(255 255 255 / ${1 - age})` : `rgb(255 92 92 / ${1 - age})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 6 + age * 22, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 700) {
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.5, size / 4);
  ctx.strokeStyle = "rgb(8 6 14 / 0.8)";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
