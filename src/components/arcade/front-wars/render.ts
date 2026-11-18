"use client";

import { HIGHLAND, MOUNTAIN, POST_RADIUS, WATER, compactNumber, type Game } from "./engine";
import { WORLD_NORTH } from "./world-map";

/**
 * Front Wars drawing. The map is one pixel per tile on an offscreen canvas, repainted only where tiles changed;
 * each frame scales it (crisp when zoomed in, smoothed when zoomed out) and draws buildings, boats and labels.
 */

/** Screen position of tile (0, 0) and the size of one tile, in CSS pixels. */
export type View = { scale: number; x: number; y: number };

type Rgb = [number, number, number];
const DEEP: Rgb = [12, 30, 52];
const COAST: Rgb = [26, 62, 92];
const PLAINS_RGB: Rgb = [88, 112, 66];
const HIGHLAND_RGB: Rgb = [126, 116, 80];
const MOUNTAIN_RGB: Rgb = [150, 144, 132];
const TUNDRA_RGB: Rgb = [128, 138, 126];
const ICE_RGB: Rgb = [214, 224, 232];

const hexRgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const compact = compactNumber;

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly ground: Uint8ClampedArray;
  private readonly colors: Rgb[];
  readonly buildings = new Set<number>();

  constructor(private readonly game: Game) {
    const { w, h } = game;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w;
    this.canvas.height = h;
    this.context = this.canvas.getContext("2d")!;
    this.image = this.context.createImageData(w, h);
    this.colors = game.nations.map((nation) => hexRgb(nation.color));
    // Unclaimed ground, precomputed once: terrain, latitude (on the world) and a fixed grain.
    this.ground = new Uint8ClampedArray(w * h * 3);
    const world = game.settings.map === "world";
    for (let t = 0; t < w * h; t += 1) {
      const y = (t / w) | 0;
      const hash = Math.sin(t * 12.9898 + 78.233) * 43758.5453;
      const grain = 0.93 + (hash - Math.floor(hash)) * 0.14;
      let rgb: Rgb;
      const terrain = game.terrain[t];
      if (terrain === WATER) {
        rgb = this.coastal(t) ? COAST : DEEP;
      } else {
        rgb = terrain === MOUNTAIN ? MOUNTAIN_RGB : terrain === HIGHLAND ? HIGHLAND_RGB : PLAINS_RGB;
        if (world) {
          const lat = Math.abs(WORLD_NORTH - (y + 0.5) / 4);
          if (lat > 66) rgb = mix(rgb, ICE_RGB, Math.min(1, (lat - 66) / 8));
          else if (lat > 55) rgb = mix(rgb, TUNDRA_RGB, (lat - 55) / 11);
        }
      }
      this.ground[t * 3] = rgb[0] * grain;
      this.ground[t * 3 + 1] = rgb[1] * grain;
      this.ground[t * 3 + 2] = rgb[2] * grain;
    }
    for (let t = 0; t < w * h; t += 1) this.paint(t);
    this.context.putImageData(this.image, 0, 0);
    game.dirty.length = 0;
  }

  private coastal(t: number) {
    const { w, h, terrain } = this.game;
    const x = t % w;
    return (x > 0 && terrain[t - 1] !== WATER) || (x < w - 1 && terrain[t + 1] !== WATER) || (t >= w && terrain[t - w] !== WATER) || (t < w * (h - 1) && terrain[t + w] !== WATER);
  }

  private paint(t: number) {
    const { game } = this;
    const owner = game.owner[t];
    const data = this.image.data;
    const i = t * 4;
    const g = t * 3;
    if (!owner || game.terrain[t] === WATER) {
      data[i] = this.ground[g];
      data[i + 1] = this.ground[g + 1];
      data[i + 2] = this.ground[g + 2];
    } else {
      // Owned land: the player's color over the ground; a bright edge where it meets other land.
      const { w, h, terrain } = game;
      const x = t % w;
      const edge =
        (x > 0 && terrain[t - 1] !== WATER && game.owner[t - 1] !== owner) ||
        (x < w - 1 && terrain[t + 1] !== WATER && game.owner[t + 1] !== owner) ||
        (t >= w && terrain[t - w] !== WATER && game.owner[t - w] !== owner) ||
        (t < w * (h - 1) && terrain[t + w] !== WATER && game.owner[t + w] !== owner);
      const color = this.colors[owner];
      if (edge) {
        const light = owner === 1 ? 0.75 : 0.32;
        data[i] = color[0] + (255 - color[0]) * light;
        data[i + 1] = color[1] + (255 - color[1]) * light;
        data[i + 2] = color[2] + (255 - color[2]) * light;
      } else {
        data[i] = color[0] * 0.74 + this.ground[g] * 0.26;
        data[i + 1] = color[1] * 0.74 + this.ground[g + 1] * 0.26;
        data[i + 2] = color[2] * 0.74 + this.ground[g + 2] * 0.26;
      }
    }
    data[i + 3] = 255;
    if (game.building[t]) this.buildings.add(t);
    else this.buildings.delete(t);
  }

  /** Repaint the tiles the simulation changed, and their neighbors (whose edges may have moved). */
  update() {
    const { game } = this;
    if (!game.dirty.length) return;
    const { w, h } = game;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (const t of game.dirty) {
      const x = t % w;
      const y = (t / w) | 0;
      this.paint(t);
      if (x > 0) this.paint(t - 1);
      if (x < w - 1) this.paint(t + 1);
      if (y > 0) this.paint(t - w);
      if (y < h - 1) this.paint(t + w);
      if (x - 1 < x0) x0 = Math.max(0, x - 1);
      if (y - 1 < y0) y0 = Math.max(0, y - 1);
      if (x + 1 > x1) x1 = Math.min(w - 1, x + 1);
      if (y + 1 > y1) y1 = Math.min(h - 1, y + 1);
    }
    game.dirty.length = 0;
    this.context.putImageData(this.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }
}

export type Ping = { tile: number; at: number; ok: boolean };
export type Overlay = { hover: number; mode: "attack" | "city" | "post"; pings: Ping[]; now: number; spawn: boolean };

/** One frame: the map, buildings, boats, labels and the pointer's feedback. */
export function drawFrame(ctx: CanvasRenderingContext2D, renderer: MapRenderer, game: Game, view: View, size: { width: number; height: number; dpr: number }, overlay: Overlay) {
  const { scale } = view;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.fillStyle = `rgb(${DEEP.join(" ")})`;
  ctx.fillRect(0, 0, size.width, size.height);
  // Crisp pixels up close; smoothed when a tile is smaller than a screen pixel, so the map doesn't shimmer.
  ctx.imageSmoothingEnabled = scale < 1.5;
  ctx.drawImage(renderer.canvas, view.x, view.y, game.w * scale, game.h * scale);

  const at = (t: number) => [view.x + ((t % game.w) + 0.5) * scale, view.y + (((t / game.w) | 0) + 0.5) * scale] as const;
  const visible = (x: number, y: number, margin = 40) => x > -margin && y > -margin && x < size.width + margin && y < size.height + margin;

  // Buildings (once they're big enough to see): a City is a little house, a Defense Post a shield.
  if (scale >= 1.2) {
    const glyph = Math.max(7, Math.min(18, scale * 3));
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
  }

  // Boats: a hull on its route, with the troops aboard.
  for (const boat of game.boats) {
    const tile = boat.path[Math.min(boat.path.length - 1, boat.index)];
    const next = boat.path[Math.min(boat.path.length - 1, boat.index + 2)];
    const [x, y] = at(tile);
    if (!visible(x, y)) continue;
    const [nx, ny] = at(next);
    const angle = Math.atan2(ny - y, nx - x);
    const size = Math.max(6, Math.min(14, scale * 3));
    const mine = boat.from === 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = mine ? "#fff" : game.nations[boat.from].color;
    ctx.strokeStyle = "rgb(8 6 14 / 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, -size * 0.55);
    ctx.lineTo(-size * 0.4, 0);
    ctx.lineTo(-size * 0.7, size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (mine || scale > 2) label(ctx, compactNumber(boat.troops), x, y - size - 6, 11, "#fff", 700);
  }

  // Player names and troops, sized to their land; the largest first, and only those big enough to read.
  const labels = game.nations
    .filter((nation) => nation.alive && nation.tiles > 0)
    .map((nation) => ({ nation, font: Math.min(26, Math.sqrt(nation.tiles) * scale * 0.32) }))
    .filter((entry) => entry.font >= 9 || entry.nation.id === 1)
    .sort((a, b) => b.font - a.font)
    .slice(0, 90);
  for (const { nation, font } of labels) {
    const x = view.x + (nation.sx / nation.tiles + 0.5) * scale;
    const y = view.y + (nation.sy / nation.tiles + 0.5) * scale;
    if (!visible(x, y, 120)) continue;
    const size = Math.max(nation.id === 1 ? 11 : 9, font);
    label(ctx, nation.name, x, y - size * 0.55, size, "#fff", 700);
    label(ctx, compactNumber(nation.troops), x, y + size * 0.55, size * 0.82, "#fff", 600);
  }

  // Pointer feedback: the hovered tile, a Post's reach while placing one, and a ring where you clicked.
  if (overlay.hover >= 0) {
    const [x, y] = at(overlay.hover);
    ctx.lineWidth = 2;
    ctx.strokeStyle = overlay.mode === "attack" ? "rgb(255 255 255 / 0.9)" : "rgb(255 214 107 / 0.95)";
    const box = Math.max(6, scale + 2);
    ctx.strokeRect(x - box / 2, y - box / 2, box, box);
    if (overlay.mode === "post") {
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, POST_RADIUS * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (overlay.spawn) {
      ctx.strokeStyle = "rgb(255 255 255 / 0.7)";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(12, 4.5 * scale), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  for (const ping of overlay.pings) {
    const age = (overlay.now - ping.at) / 600;
    if (age > 1) continue;
    const [x, y] = at(ping.tile);
    ctx.strokeStyle = ping.ok ? `rgb(255 255 255 / ${1 - age})` : `rgb(255 92 92 / ${1 - age})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 6 + age * 26, 0, Math.PI * 2);
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
