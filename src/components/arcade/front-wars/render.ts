"use client";

import { HIGHLAND, MOUNTAIN, POST_RADIUS, WATER, attackState, compactNumber, type Attack, type EndedAttack, type FrontCell, type Game } from "./engine";
import { WORLD_NORTH } from "./world-map";

/**
 * Front Wars drawing. The map is one pixel per tile on an offscreen canvas, repainted only where tiles changed;
 * each frame scales it (crisp when zoomed in, smoothed when zoomed out) and draws battles, buildings, boats and
 * labels on top.
 *
 * Battles are drawn from the simulation's own state, never decorated after the fact: the tiles on an attack's
 * front, its stretches and the direction each one pushes, the tiles it just took, its troops, and the moment it
 * started, was reinforced, clashed, landed or ended. Yours are white, attacks on you red, everyone else's in
 * their color and only when you zoom in, so a map with hundreds of rivals stays readable.
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
export type Overlay = {
  hover: number;
  mode: "attack" | "city" | "post";
  pings: Ping[];
  now: number;
  spawn: boolean;
  /** The attack picked in the panel (outlined and always labeled), or -1. */
  selected: number;
  /** Simulation time in ticks, with the fraction since the last tick (battle motion follows the game clock). */
  tick: number;
};

type Size = { width: number; height: number; dpr: number };
type Role = "out" | "in" | "other";
type Rect = { x: number; y: number; w: number; h: number };
type Pill = Rect & { text: string; tag: string; tagColor: string; color: string; border: string; pop: number; dx: number; dy: number; selected: boolean };

const OUT = "255 255 255";
const IN = "255 82 82";
const WARN = "255 196 77";
const GOOD = "110 231 160";
const INK = "8 6 14";
const FONT = "ui-sans-serif, system-ui, sans-serif";

const rgbText = (hex: string) => hexRgb(hex).join(" ");
const roleOf = (from: number, to: number): Role => (from === 1 ? "out" : to === 1 ? "in" : "other");
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** One frame: the map, battles, buildings, boats, labels and the pointer's feedback. */
export function drawFrame(ctx: CanvasRenderingContext2D, renderer: MapRenderer, game: Game, view: View, size: Size, overlay: Overlay) {
  const { scale } = view;
  const tick = overlay.tick;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  ctx.fillStyle = `rgb(${DEEP.join(" ")})`;
  ctx.fillRect(0, 0, size.width, size.height);
  // Crisp pixels up close; smoothed when a tile is smaller than a screen pixel, so the map doesn't shimmer.
  ctx.imageSmoothingEnabled = scale < 1.5;
  ctx.drawImage(renderer.canvas, view.x, view.y, game.w * scale, game.h * scale);

  const at = (t: number) => [view.x + ((t % game.w) + 0.5) * scale, view.y + (((t / game.w) | 0) + 0.5) * scale] as const;
  const screen = (x: number, y: number) => [view.x + x * scale, view.y + y * scale] as const;
  const visible = (x: number, y: number, margin = 40) => x > -margin && y > -margin && x < size.width + margin && y < size.height + margin;

  // Which battles to draw: all of yours and the selected one; others only once you're close enough to read them
  // (wars from a moderate zoom, land grabs only up close), so hundreds of Bots expanding don't flood the map.
  const shown: { attack: Attack; role: Role; rgb: string }[] = [];
  for (const attack of game.attacks) {
    const role = roleOf(attack.from, attack.to);
    const selected = attack.id === overlay.selected;
    if (role === "other" && !selected) {
      if (attack.to === 0 ? scale < 5 : scale < 1.6) continue;
      const [x, y] = screen(attack.ax, attack.ay);
      if (attack.ax < 0 || !visible(x, y, 160)) continue;
    }
    shown.push({ attack, role, rgb: role === "out" ? OUT : role === "in" ? IN : rgbText(game.nations[attack.from].color) });
  }

  // 1. Fronts: the land each attack is about to take, pulsing (wars brighter than land grabs).
  const pulse = 0.78 + 0.22 * Math.sin(tick * 0.55);
  for (const { attack, role, rgb } of shown) {
    if (role === "other" && attack.id !== overlay.selected && scale < 2.5) continue;
    const base = attack.to === 0 ? 0.2 : role === "other" ? 0.28 : 0.46;
    drawBand(ctx, game, view, size, attack, rgb, Math.min(0.8, base * pulse * (attack.id === overlay.selected ? 1.5 : 1)));
  }

  // 2. Buildings (once they're big enough to see): a City is a little house, a Defense Post a shield.
  if (scale >= 1.2) {
    const glyph = Math.max(7, Math.min(18, scale * 3));
    for (const t of renderer.buildings) {
      const [x, y] = at(t);
      if (!visible(x, y)) continue;
      const color = game.nations[game.owner[t]]?.color ?? "#fff";
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgb(${INK} / 0.85)`;
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
  // Your buildings an enemy front has reached: a red alarm ring until the attack ends or moves on.
  for (const { attack, role } of shown) {
    if (role !== "in") continue;
    for (const spot of attack.near) {
      const [x, y] = at(spot);
      if (!visible(x, y)) continue;
      const r = Math.max(9, scale * 3.2) * (1 + 0.18 * Math.sin(tick * 0.9));
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgb(${IN} / 0.9)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 3. Motion: troops streaming at each stretch of the front, flashes where tiles just fell, landings, clashes.
  for (const { attack, role, rgb } of shown) {
    const state = attackState(game, attack);
    const selected = attack.id === overlay.selected;
    const stalled = state === "stalling";
    const speed = stalled ? 0 : 0.06 + Math.min(0.1, attack.rate / 400);
    const max = role === "other" && !selected ? (attack.to === 0 ? 1 : 2) : 6;
    if (attack.to !== 0 || role !== "other" || scale >= 5) {
      drawChevrons(ctx, attack.cells, view, stalled ? WARN : rgb, tick, speed, max, scale);
    }
    if (role !== "other" || selected || scale >= 3) drawTrail(ctx, game, view, size, attack, role === "in" ? IN : OUT, tick);
    if (tick - attack.landedAt < 20 && attack.landing >= 0) {
      const [x, y] = at(attack.landing);
      ripple(ctx, x, y, (tick - attack.landedAt) / 20, rgb, Math.max(10, scale * 4));
    }
    if (tick - attack.clashAt < 15 && attack.ax >= 0) {
      const [x, y] = screen(attack.ax, attack.ay);
      sparks(ctx, x, y, (tick - attack.clashAt) / 15, rgb, WARN, Math.max(10, scale * 3));
    }
    if (state === "starting" && attack.ax >= 0 && role !== "other") {
      const [x, y] = screen(attack.ax, attack.ay);
      ripple(ctx, x, y, (tick - attack.started) / 10, rgb, Math.max(14, scale * 5));
    }
  }

  // 4. How battles ended, where they ended, for two seconds: retreats pull back, spent attacks break, held
  // defenses flash green, conquests ring out.
  const endTags: Pill[] = [];
  for (const ended of game.ended) {
    const age = tick - ended.tick;
    if (age < 0 || age > 20) continue;
    // Land grabs end all the time (out of troops or of open land): only fights between players get a marker.
    if (ended.to === 0) continue;
    const role = roleOf(ended.from, ended.to);
    if (role === "other" && scale < 2.5) continue;
    const [x, y] = screen(ended.x, ended.y);
    if (!visible(x, y)) continue;
    const tag = drawEnding(ctx, game, ended, role, x, y, age / 20, scale);
    if (tag) endTags.push(tag);
  }

  // 5. Boats: a hull on its route with the troops aboard; yours and those sailing at you show where they'll land.
  for (const boat of game.boats) {
    const tile = boat.path[Math.min(boat.path.length - 1, boat.index)];
    const next = boat.path[Math.min(boat.path.length - 1, boat.index + 2)];
    const [x, y] = at(tile);
    const mine = boat.from === 1;
    const incoming = !mine && game.owner[boat.landing] === 1;
    if ((mine || incoming) && scale >= 0.6) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -tick * 0.8;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgb(${mine ? OUT : IN} / 0.55)`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let i = boat.index + 6; i < boat.path.length; i += 6) ctx.lineTo(...at(boat.path[i]));
      ctx.lineTo(...at(boat.landing));
      ctx.stroke();
      ctx.restore();
    }
    if (!visible(x, y)) continue;
    const [nx, ny] = at(next);
    const angle = Math.atan2(ny - y, nx - x);
    const hull = Math.max(6, Math.min(14, scale * 3));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = mine ? "#fff" : game.nations[boat.from].color;
    ctx.strokeStyle = incoming ? `rgb(${IN})` : `rgb(${INK} / 0.9)`;
    ctx.lineWidth = incoming ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(hull, 0);
    ctx.lineTo(-hull * 0.7, -hull * 0.55);
    ctx.lineTo(-hull * 0.4, 0);
    ctx.lineTo(-hull * 0.7, hull * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (mine || incoming || scale > 2) label(ctx, compactNumber(boat.troops), x, y - hull - 6, 11, incoming ? `rgb(${IN})` : "#fff", 700);
  }

  // 6. Troop counts on the fronts, laid out before the names so the names can give way.
  const pills: Pill[] = [];
  const offscreen: { x: number; y: number; troops: number; rgb: string }[] = [];
  let others = 0;
  const ordered = [...shown].sort((a, b) => (a.role === "other" ? 1 : 0) - (b.role === "other" ? 1 : 0) || b.attack.troops - a.attack.troops);
  for (const { attack, role, rgb } of ordered) {
    if (attack.ax < 0) continue;
    const selected = attack.id === overlay.selected;
    const [x, y] = screen(attack.ax, attack.ay);
    if (!visible(x, y, 0)) {
      if (role === "in" || selected) offscreen.push({ x, y, troops: attack.troops, rgb: role === "in" ? IN : rgb });
      continue;
    }
    if (role === "other" && !selected && (scale < 3 || others >= 10)) continue;
    const pill = pillFor(ctx, game, attack, role, rgb, x, y, tick, selected);
    if (role === "other" && !selected) {
      if (pills.some((placed) => overlaps(placed, pill))) continue;
      others += 1;
    } else {
      // Yours never hide: nudge up past another count instead.
      for (let tries = 0; tries < 3 && pills.some((placed) => overlaps(placed, pill)); tries += 1) pill.y -= pill.h + 4;
    }
    pills.push(pill);
  }

  // 7. Player names and troops, sized to their land; the largest first, and only those big enough to read.
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
    const textSize = Math.max(nation.id === 1 ? 11 : 9, font);
    if (nation.id !== 1) {
      const box = { x: x - textSize * nation.name.length * 0.3, y: y - textSize * 1.1, w: textSize * nation.name.length * 0.6, h: textSize * 2.2 };
      if (pills.some((pill) => overlaps(pill, box))) continue;
    }
    label(ctx, nation.name, x, y - textSize * 0.55, textSize, "#fff", 700);
    label(ctx, compactNumber(nation.troops), x, y + textSize * 0.55, textSize * 0.82, "#fff", 600);
  }
  for (const pill of pills) drawPill(ctx, pill);
  for (const tag of endTags) drawPill(ctx, tag);
  drawOffscreen(ctx, size, offscreen.slice(0, 5));

  // 8. Pointer feedback: the hovered tile, a Post's reach while placing one, and a ring where you clicked.
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

/** The tiles an attack is about to take, as one tinted path (at most a few thousand rectangles a frame). */
function drawBand(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, attack: Attack, rgb: string, alpha: number) {
  const { w, owner } = game;
  const s = view.scale;
  const box = Math.max(1.5, s);
  const inset = (box - s) / 2;
  ctx.beginPath();
  let drawn = 0;
  for (const t of attack.front) {
    if (owner[t] !== attack.to) continue;
    const x = view.x + (t % w) * s - inset;
    const y = view.y + ((t / w) | 0) * s - inset;
    if (x < -box || y < -box || x > size.width || y > size.height) continue;
    ctx.rect(x, y, box, box);
    if (++drawn > 6000) break;
  }
  if (!drawn) return;
  ctx.fillStyle = `rgb(${rgb} / ${alpha})`;
  ctx.fill();
}

/**
 * Chevrons marching toward the front at its biggest stretches (spaced out on screen), in the direction the
 * attacker pushes; faster when it's taking land quickly, frozen and amber when it's stalling.
 */
function drawChevrons(ctx: CanvasRenderingContext2D, cells: FrontCell[], view: View, rgb: string, tick: number, speed: number, max: number, scale: number) {
  const gap = Math.max(9, Math.min(20, scale * 2.5));
  const half = Math.max(3.5, Math.min(8, scale * 1.5));
  const placed: [number, number][] = [];
  const phase = speed ? (tick * speed) % 1 : 0.5 + 0.2 * Math.sin(tick * 1.4);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const cell of cells) {
    if (placed.length >= max) break;
    if (!cell.dx && !cell.dy) continue;
    const cx = view.x + cell.x * scale;
    const cy = view.y + cell.y * scale;
    if (placed.some(([x, y]) => (x - cx) ** 2 + (y - cy) ** 2 < 70 * 70)) continue;
    placed.push([cx, cy]);
    for (let k = 0; k < 3; k += 1) {
      const along = (k + phase) / 3;
      const offset = -2.6 * gap + (k + phase) * gap;
      const px = cx + cell.dx * offset;
      const py = cy + cell.dy * offset;
      const alpha = Math.sin(Math.PI * along) * 0.95;
      const tipX = px + cell.dx * half;
      const tipY = py + cell.dy * half;
      const backX = px - cell.dx * half;
      const backY = py - cell.dy * half;
      const nx = -cell.dy * half * 1.15;
      const ny = cell.dx * half * 1.15;
      ctx.beginPath();
      ctx.moveTo(backX + nx, backY + ny);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(backX - nx, backY - ny);
      ctx.lineWidth = Math.max(3, half * 0.75);
      ctx.strokeStyle = `rgb(${INK} / ${alpha * 0.55})`;
      ctx.stroke();
      ctx.lineWidth = Math.max(1.6, half * 0.4);
      ctx.strokeStyle = `rgb(${rgb} / ${alpha})`;
      ctx.stroke();
    }
  }
}

/** Flashes where an attack just took tiles: the front visibly eating forward. */
function drawTrail(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, attack: Attack, rgb: string, tick: number) {
  const s = view.scale;
  for (let i = 0; i < attack.trail.length; i += 1) {
    const t = attack.trail[i];
    if (t < 0) continue;
    const age = tick - attack.trailTick[i];
    if (age < 0 || age > 6) continue;
    const x = view.x + ((t % game.w) + 0.5) * s;
    const y = view.y + (((t / game.w) | 0) + 0.5) * s;
    if (x < -10 || y < -10 || x > size.width + 10 || y > size.height + 10) continue;
    const r = (s * 0.5 + 1.5) * (1 + age * 0.3);
    ctx.fillStyle = `rgb(${rgb} / ${(1 - age / 6) * 0.85})`;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function ripple(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number, rgb: string, radius: number) {
  ctx.lineWidth = 2;
  for (const lag of [0, 0.3]) {
    const p = progress - lag;
    if (p < 0 || p > 1) continue;
    ctx.strokeStyle = `rgb(${rgb} / ${(1 - p) * 0.9})`;
    ctx.beginPath();
    ctx.arc(x, y, radius * (0.3 + p), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function sparks(ctx: CanvasRenderingContext2D, x: number, y: number, progress: number, a: string, b: string, radius: number) {
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2 + progress * 1.4;
    const inner = radius * (0.25 + progress * 0.8);
    const outer = inner + radius * 0.45 * (1 - progress);
    ctx.strokeStyle = `rgb(${i % 2 ? a : b} / ${1 - progress})`;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
    ctx.stroke();
  }
}

/** The end of a battle, drawn where it ended; returns the word for it (if it's worth one). */
function drawEnding(ctx: CanvasRenderingContext2D, game: Game, ended: EndedAttack, role: Role, x: number, y: number, progress: number, scale: number): Pill | null {
  const rgb = role === "out" ? OUT : role === "in" ? IN : rgbText(game.nations[ended.from].color);
  const fade = 1 - progress;
  let word = "";
  let color = rgb;
  if (ended.reason === "retreat") {
    // The troops pull back the way they came.
    const gap = Math.max(9, Math.min(20, scale * 2.5));
    const drift = progress * gap * 2;
    ctx.save();
    ctx.globalAlpha = fade;
    drawChevrons(ctx, [{ x: x - ended.dx * drift, y: y - ended.dy * drift, n: 1, dx: -ended.dx, dy: -ended.dy }], { scale: 1, x: 0, y: 0 }, rgb, progress * 10, 0.1, 1, scale);
    ctx.restore();
    word = role === "in" ? "PULLED BACK" : "RETREAT";
    color = role === "in" ? GOOD : WARN;
  } else if (ended.reason === "spent") {
    const r = Math.max(6, scale * 2) * (1 + progress * 0.5);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgb(${role === "in" ? GOOD : rgb} / ${fade})`;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
    word = role === "in" ? "HELD" : role === "out" ? "SPENT" : "";
    color = role === "in" ? GOOD : WARN;
  } else if (ended.reason === "clash") {
    sparks(ctx, x, y, progress, rgb, WARN, Math.max(12, scale * 3.5));
    word = role === "in" ? "REPELLED" : role === "out" ? "CUT OFF" : "";
    color = role === "in" ? GOOD : WARN;
  } else if (ended.reason === "complete") {
    ripple(ctx, x, y, progress, ended.eliminated ? WARN : rgb, Math.max(16, scale * 6));
    word = ended.eliminated ? (role === "out" ? "CONQUERED" : role === "in" ? "" : "FELL") : role === "out" ? "TAKEN" : role === "in" ? "BREACHED" : "";
    color = role === "in" ? IN : role === "out" ? GOOD : rgb;
  }
  if (!word || (role === "other" && scale < 3)) return null;
  ctx.font = `800 10px ${FONT}`;
  const width = ctx.measureText(word).width + 12;
  return { x: x - width / 2, y: y - 32 - progress * 10, w: width, h: 19, text: word, tag: "", tagColor: color, color, border: color, pop: 1, dx: 0, dy: 0, selected: false };
}

/** The troop count for an attack's main front, with a word for its state (incoming, landing, clash...). */
function pillFor(ctx: CanvasRenderingContext2D, game: Game, attack: Attack, role: Role, rgb: string, x: number, y: number, tick: number, selected: boolean): Pill {
  const state = attackState(game, attack);
  let tag = "";
  let tagColor = rgb;
  if (state === "starting" && role !== "other") tag = role === "in" ? "INCOMING" : attack.to ? "ATTACK" : "";
  else if (state === "reinforced") tag = `+${compactNumber(attack.reinforcedBy)}`;
  else if (state === "clash") {
    tag = "CLASH";
    tagColor = WARN;
  } else if (state === "landing") tag = "LANDING";
  else if (state === "stalling") {
    tag = role === "in" ? "FALTERING" : "STALLING";
    tagColor = role === "in" ? GOOD : WARN;
  }
  const age = tick - attack.started;
  const pop = age < 6 ? 1 + 0.35 * (1 - age / 6) : 1;
  const text = compactNumber(attack.troops);
  const font = role === "other" ? 11 : 12.5;
  ctx.font = `800 ${font}px ${FONT}`;
  const width = ctx.measureText(text).width + 24;
  const height = font + 9;
  const color = role === "out" ? "#fff" : role === "in" ? `rgb(${IN})` : `rgb(${rgb})`;
  return { x: x - width / 2, y: y - height / 2, w: width, h: height, text, tag, tagColor: `rgb(${tagColor})`, color, border: role === "other" ? `rgb(${rgb} / 0.7)` : color, pop, dx: attack.dx, dy: attack.dy, selected };
}

function drawPill(ctx: CanvasRenderingContext2D, pill: Pill) {
  const cx = pill.x + pill.w / 2;
  const cy = pill.y + pill.h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pill.pop, pill.pop);
  const x = -pill.w / 2;
  const y = -pill.h / 2;
  if (pill.selected) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(255 255 255 / 0.85)";
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.roundRect(x - 5, y - 5, pill.w + 10, pill.h + 10, pill.h / 2 + 5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const arrow = pill.dx || pill.dy;
  ctx.fillStyle = `rgb(${INK} / 0.84)`;
  ctx.beginPath();
  ctx.roundRect(x, y, pill.w, pill.h, pill.h / 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = pill.border;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${pill.h - 9}px ${FONT}`;
  ctx.fillStyle = pill.color;
  ctx.fillText(pill.text, arrow ? 5 : 0, 0.5);
  if (arrow) {
    // Which way this front is pushing.
    const ax = x + 10;
    ctx.fillStyle = pill.color;
    ctx.beginPath();
    ctx.moveTo(ax + pill.dx * 4.5, pill.dy * 4.5);
    ctx.lineTo(ax - pill.dx * 3 - pill.dy * 3.5, -pill.dy * 3 + pill.dx * 3.5);
    ctx.lineTo(ax - pill.dx * 3 + pill.dy * 3.5, -pill.dy * 3 - pill.dx * 3.5);
    ctx.closePath();
    ctx.fill();
  }
  if (pill.tag) label(ctx, pill.tag, 0, y - 8, 10, pill.tagColor, 800);
  ctx.restore();
}

/** Attacks on you that are off screen: an arrow at the edge pointing at them, with their troops. */
function drawOffscreen(ctx: CanvasRenderingContext2D, size: Size, list: { x: number; y: number; troops: number; rgb: string }[]) {
  const cx = size.width / 2;
  const cy = size.height / 2;
  const inset = 26;
  for (const item of list) {
    const dx = item.x - cx;
    const dy = item.y - cy;
    const t = Math.min((cx - inset) / Math.max(1e-6, Math.abs(dx)), (cy - inset) / Math.max(1e-6, Math.abs(dy)));
    const x = cx + dx * t;
    const y = cy + dy * t;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgb(${item.rgb})`;
    ctx.strokeStyle = `rgb(${INK} / 0.9)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -8);
    ctx.lineTo(-2, 0);
    ctx.lineTo(-6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    label(ctx, compactNumber(item.troops), x - Math.cos(angle) * 20, y - Math.sin(angle) * 20, 11, `rgb(${item.rgb})`, 800);
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 700) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.5, size / 4);
  ctx.strokeStyle = `rgb(${INK} / 0.8)`;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
