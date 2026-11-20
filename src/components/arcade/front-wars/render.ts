"use client";

import {
  POST_RADIUS,
  RAIL_RANGE,
  SAM_RANGE,
  WARSHIP_HP,
  WARSHIP_RANGE,
  WATER,
  WEAPONS,
  aimPoint,
  attackState,
  compactNumber,
  launchProblem,
  placeProblem,
  readySilo,
  type Attack,
  type Building,
  type Conquest,
  type EndedAttack,
  type FrontCell,
  type Game,
  type Weapon,
} from "./engine";
import {
  DEFAULT_THEME,
  EDGE_E,
  EDGE_N,
  EDGE_S,
  EDGE_W,
  PIXEL_INSIDE,
  PIXEL_LAND,
  PIXEL_SEA,
  PIXEL_EDGE,
  drawPlainBuilding,
  rippleRing,
  shadePixel,
  type FrontWarsTheme,
  type GroundTile,
  type Marker,
} from "./look";
import { WORLD_NORTH } from "./world-map";

/**
 * Front Wars drawing. The map is two pixels per tile on an offscreen canvas, repainted only where tiles changed;
 * a tile's corner pixel takes its neighbors' color where both sides (and the diagonal) belong to someone else, so
 * borders and coastlines round off instead of stepping. Each frame scales it (crisp when zoomed in, smoothed
 * when zoomed out) and draws battles, buildings, boats and labels on top.
 *
 * Battles are drawn from the simulation's own state, never decorated after the fact: the tiles on an attack's
 * front, its stretches and the direction each one pushes, the tiles it just took, its troops, and the moment it
 * started, was reinforced, clashed, landed or ended. Yours are white, attacks on you red, everyone else's in
 * their color and only when you zoom in, so a map with hundreds of rivals stays readable.
 */

/** Screen position of tile (0, 0) and the size of one tile, in CSS pixels. */
export type View = { scale: number; x: number; y: number };

/** What a tap does: attack, place a building, launch a Warship, move the fleet, or launch a bomb. */
export type Tool = "attack" | Building | "warship" | "fleet" | Weapon;
export const isWeapon = (tool: Tool): tool is Weapon => tool === "atom" || tool === "hydrogen" || tool === "mirv";
export const isBuilding = (tool: Tool): tool is Building => tool === "city" || tool === "post" || tool === "port" || tool === "factory" || tool === "silo" || tool === "sam";

type Rgb = [number, number, number];
const hexRgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export const compact = compactNumber;

/** Map pixels per tile edge (corners are rounded at this resolution). */
const SUB = 2;
/** How far (in tiles) coast distances are measured for map styles. */
const DIST_CAP = 24;

export class MapRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly ground: Uint8ClampedArray;
  /** Per tile: water, tiles to land; land, tiles to water (capped). */
  private readonly dist: Uint8Array;
  private readonly colors: Rgb[];
  private readonly rgb: Rgb = [0, 0, 0];
  private readonly groundRgb: Rgb = [0, 0, 0];
  /** What the last `color` call drew: a PIXEL_* kind, and whether it's your land. */
  private kind = PIXEL_LAND;
  private mine = false;
  readonly buildings = new Set<number>();

  constructor(
    private readonly game: Game,
    public theme: FrontWarsTheme = DEFAULT_THEME,
  ) {
    const { w, h } = game;
    this.canvas = document.createElement("canvas");
    this.canvas.width = w * SUB;
    this.canvas.height = h * SUB;
    this.context = this.canvas.getContext("2d")!;
    this.image = this.context.createImageData(w * SUB, h * SUB);
    this.colors = game.nations.map((nation) => hexRgb(nation.color));
    this.ground = new Uint8ClampedArray(w * h * 3);
    this.dist = coastDistances(game.terrain, w, h);
    this.build();
  }

  /** Switch cosmetics mid-match: the map image is rebuilt only if its look changed. */
  setTheme(theme: FrontWarsTheme) {
    const before = this.theme;
    this.theme = theme;
    if (before.map !== theme.map || before.style !== theme.style || before.pattern !== theme.pattern) this.build();
  }

  /** Unclaimed ground (map style, then art style), then every tile. */
  private build() {
    const { game } = this;
    const { w, h, terrain } = game;
    const { map, style } = this.theme;
    const world = game.settings.map === "world";
    const tile: GroundTile = { x: 0, y: 0, terrain: 0, dist: 0, lat: null, grain: 0, step: false };
    const out: Rgb = [0, 0, 0];
    for (let t = 0; t < w * h; t += 1) {
      const x = t % w;
      const y = (t / w) | 0;
      const hash = Math.sin(t * 12.9898 + 78.233) * 43758.5453;
      tile.x = x;
      tile.y = y;
      tile.terrain = terrain[t];
      tile.dist = this.dist[t];
      tile.lat = world ? WORLD_NORTH - (y + 0.5) / 4 : null;
      tile.grain = hash - Math.floor(hash);
      tile.step = terrain[t] !== WATER && ((x < w - 1 && terrain[t + 1] !== WATER && terrain[t + 1] !== terrain[t]) || (y < h - 1 && terrain[t + w] !== WATER && terrain[t + w] !== terrain[t]));
      map.ground(tile, out);
      style.groundFilter?.(out, terrain[t] === WATER, x, y);
      this.ground[t * 3] = out[0];
      this.ground[t * 3 + 1] = out[1];
      this.ground[t * 3 + 2] = out[2];
    }
    for (let t = 0; t < w * h; t += 1) this.paint(t);
    this.context.putImageData(this.image, 0, 0);
    game.dirty.length = 0;
  }

  /** Who a tile belongs to for drawing: -1 water, 0 unclaimed land, otherwise its owner. */
  private key(t: number) {
    return this.game.terrain[t] === WATER ? -1 : this.game.owner[t];
  }

  /**
   * A tile's flat color into `this.rgb`: ground, or its owner's color as the art style draws it (by default bright
   * on the edge where it meets other land). Also notes what kind of pixel it is for the per-pixel pass.
   */
  private color(t: number) {
    const { game } = this;
    const { style } = this.theme;
    const owner = game.owner[t];
    const g = t * 3;
    const out = this.rgb;
    const { w, h, terrain } = game;
    const x = t % w;
    if (!owner || terrain[t] === WATER) {
      out[0] = this.ground[g];
      out[1] = this.ground[g + 1];
      out[2] = this.ground[g + 2];
      this.kind = terrain[t] === WATER ? PIXEL_SEA : PIXEL_LAND;
      this.mine = false;
      // Irradiated ground: a sickly, scorched yellow-green until the fallout clears.
      if (terrain[t] !== WATER && game.fallout[t] > game.tick) {
        out[0] = out[0] * 0.45 + 118 * 0.55;
        out[1] = out[1] * 0.45 + 138 * 0.55;
        out[2] = out[2] * 0.45 + 40 * 0.55;
      }
      // Raised land casts a shadow on the open ground and sea south and east of it.
      if (style.castShadow) {
        const north = t >= w && terrain[t - w] !== WATER ? game.owner[t - w] : 0;
        const west = x > 0 && terrain[t - 1] !== WATER ? game.owner[t - 1] : 0;
        if ((north && north !== owner) || (west && west !== owner)) {
          out[0] *= 0.62;
          out[1] *= 0.62;
          out[2] *= 0.62;
        }
      }
      return out;
    }
    let edge = 0;
    if (x > 0 && terrain[t - 1] !== WATER && game.owner[t - 1] !== owner) edge |= EDGE_W;
    if (x < w - 1 && terrain[t + 1] !== WATER && game.owner[t + 1] !== owner) edge |= EDGE_E;
    if (t >= w && terrain[t - w] !== WATER && game.owner[t - w] !== owner) edge |= EDGE_N;
    if (t < w * (h - 1) && terrain[t + w] !== WATER && game.owner[t + w] !== owner) edge |= EDGE_S;
    const ground = this.groundRgb;
    ground[0] = this.ground[g];
    ground[1] = this.ground[g + 1];
    ground[2] = this.ground[g + 2];
    style.territory(out, this.colors[owner], ground, edge, owner === 1, x, (t / w) | 0);
    this.kind = edge ? PIXEL_EDGE : PIXEL_INSIDE;
    this.mine = owner === 1;
    return out;
  }

  private paint(t: number) {
    const { game } = this;
    const { style, pattern } = this.theme;
    const { w, h } = game;
    const data = this.image.data;
    const x = t % w;
    const y = (t / w) | 0;
    const own = this.key(t);
    const [r, g, b] = this.color(t);
    const kind = this.kind;
    const mine = this.mine;
    // Your pattern only ever covers the inside of your own land.
    const patterned = pattern && mine && kind === PIXEL_INSIDE ? pattern : null;
    const row = w * SUB;
    for (let sy = 0; sy < SUB; sy += 1) {
      for (let sx = 0; sx < SUB; sx += 1) {
        const i = ((y * SUB + sy) * row + x * SUB + sx) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
        const gx = x * SUB + sx;
        const gy = y * SUB + sy;
        if (patterned) shadePixel(data, i, patterned.at(gx, gy), patterned.accent);
        style.pixel?.(data, i, gx, gy, kind, mine);
        // A corner whose two sides and diagonal all belong to the same someone else rounds off into them.
        const hx = x + (sx ? 1 : -1);
        const vy = y + (sy ? 1 : -1);
        if (hx < 0 || hx >= w || vy < 0 || vy >= h) continue;
        const side = y * w + hx;
        const other = this.key(side);
        if (other === own || this.key(vy * w + x) !== other || this.key(vy * w + hx) !== other) continue;
        const c = this.color(side);
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
      }
    }
    if (game.building[t]) this.buildings.add(t);
    else this.buildings.delete(t);
  }

  /** Repaint the tiles the simulation changed and their neighbors (whose edges and corners may have moved). */
  update() {
    const { game } = this;
    if (!game.dirty.length) return;
    const { w, h } = game;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    const done = new Set<number>();
    for (const t of game.dirty) {
      const x = t % w;
      const y = (t / w) | 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const n = ny * w + nx;
          if (done.has(n)) continue;
          done.add(n);
          this.paint(n);
        }
      }
      if (x - 1 < x0) x0 = Math.max(0, x - 1);
      if (y - 1 < y0) y0 = Math.max(0, y - 1);
      if (x + 1 > x1) x1 = Math.min(w - 1, x + 1);
      if (y + 1 > y1) y1 = Math.min(h - 1, y + 1);
    }
    game.dirty.length = 0;
    this.context.putImageData(this.image, 0, 0, x0 * SUB, y0 * SUB, (x1 - x0 + 1) * SUB, (y1 - y0 + 1) * SUB);
  }
}

/** Tiles from each water tile to land and from each land tile to water, up to DIST_CAP (a breadth-first search each way). */
function coastDistances(terrain: Uint8Array, w: number, h: number) {
  const n = w * h;
  const dist = new Uint8Array(n).fill(DIST_CAP);
  const queue = new Int32Array(n);
  for (const water of [true, false]) {
    let head = 0;
    let tail = 0;
    // Seeds: tiles of the other kind next to this kind.
    for (let t = 0; t < n; t += 1) {
      if ((terrain[t] === WATER) !== water) continue;
      const x = t % w;
      const touches =
        (x > 0 && (terrain[t - 1] === WATER) !== water) ||
        (x < w - 1 && (terrain[t + 1] === WATER) !== water) ||
        (t >= w && (terrain[t - w] === WATER) !== water) ||
        (t < n - w && (terrain[t + w] === WATER) !== water);
      if (touches) {
        dist[t] = 1;
        queue[tail++] = t;
      }
    }
    while (head < tail) {
      const t = queue[head++];
      const next = dist[t] + 1;
      if (next >= DIST_CAP) continue;
      const x = t % w;
      for (const nb of [x > 0 ? t - 1 : -1, x < w - 1 ? t + 1 : -1, t - w, t + w]) {
        if (nb < 0 || nb >= n || (terrain[nb] === WATER) !== water || dist[nb] <= next) continue;
        dist[nb] = next;
        queue[tail++] = nb;
      }
    }
  }
  return dist;
}

export type Ping = { tile: number; at: number; ok: boolean };
export type Overlay = {
  hover: number;
  tool: Tool;
  pings: Ping[];
  now: number;
  spawn: boolean;
  /** The attack picked in the panel (outlined and always labeled), or -1. */
  selected: number;
  /** Simulation time in ticks, with the fraction since the last tick (battle motion follows the game clock). */
  tick: number;
  /** The stretch an attack at the hovered tile would open (previewed before you tap). */
  preview: number[];
  /** Decorative motion level: "off" skips the conquest wave (reduced motion). */
  effects: "full" | "subtle" | "off";
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
/** The art style's lettering, set at the start of each frame. */
let FONT = "ui-sans-serif, system-ui, sans-serif";

const rgbText = (hex: string) => hexRgb(hex).join(" ");
const roleOf = (from: number, to: number): Role => (from === 1 ? "out" : to === 1 ? "in" : "other");
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** One frame: the map, battles, buildings, boats, labels and the pointer's feedback. */
export function drawFrame(ctx: CanvasRenderingContext2D, renderer: MapRenderer, game: Game, view: View, size: Size, overlay: Overlay) {
  const { scale } = view;
  const tick = overlay.tick;
  const theme = renderer.theme;
  const { style } = theme;
  const motion = overlay.effects !== "off";
  const full = overlay.effects === "full";
  FONT = style.font;
  ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  const backdrop: Rgb = [...theme.map.backdrop];
  style.groundFilter?.(backdrop, true, 0, 0);
  ctx.fillStyle = `rgb(${backdrop.map(Math.round).join(" ")})`;
  ctx.fillRect(0, 0, size.width, size.height);
  // Crisp pixels up close; smoothed when a tile is smaller than a screen pixel, so the map doesn't shimmer (and
  // always for soft art styles).
  ctx.imageSmoothingEnabled = style.smooth || scale < 1.5;
  ctx.drawImage(renderer.canvas, view.x, view.y, game.w * scale, game.h * scale);
  theme.map.decorate?.(ctx, { view, size, w: game.w, h: game.h, world: game.settings.map === "world" });

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

  // 2. Railroads (a Factory's links, with trains running), then buildings once they're big enough to see.
  drawRails(ctx, game, view, size, tick);
  if (scale >= 1.2) {
    const glyph = Math.max(7, Math.min(18, scale * 3));
    for (const t of renderer.buildings) {
      const [x, y] = at(t);
      if (!visible(x, y)) continue;
      // Your building skin on your buildings; everyone else's are plain markers in the art style.
      const piece = { code: game.building[t], x, y, g: glyph, color: game.nations[game.owner[t]]?.color ?? "#fff", tick, motion, style };
      ctx.save();
      if (game.owner[t] === 1 && theme.building) theme.building.draw(ctx, piece);
      else drawPlainBuilding(ctx, piece);
      ctx.restore();
      // Your Silos and SAMs show their reload as a sweep around them.
      if (game.owner[t] === 1 && (game.building[t] === 5 || game.building[t] === 6) && game.readyAt[t] > game.tick) {
        const total = game.building[t] === 5 ? 100 : 75;
        const left = Math.min(1, (game.readyAt[t] - game.tick) / total);
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgb(${WARN} / 0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, glyph * 0.85, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - left));
        ctx.stroke();
      }
    }
  } else {
    // Zoomed out: Silos and SAMs still show as dots (they decide where bombs can go).
    for (const t of renderer.buildings) {
      const code = game.building[t];
      if (code !== 5 && code !== 6) continue;
      const [x, y] = at(t);
      if (!visible(x, y)) continue;
      ctx.fillStyle = code === 5 ? `rgb(${WARN})` : "rgb(140 220 255)";
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
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
    // Your attacks wear your attack effect; everyone else's keep the plain chevrons and flashes.
    const fx = role === "out" ? theme.attack : DEFAULT_THEME.attack;
    if (attack.to !== 0 || role !== "other" || scale >= 5) {
      drawChevrons(ctx, attack.cells, view, stalled ? WARN : rgb, tick, speed, max, scale, fx.marker, motion, full);
    }
    if (role !== "other" || selected || scale >= 3) drawTrail(ctx, game, view, size, attack, role === "in" ? IN : OUT, tick, fx, motion);
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
      ctx.save();
      fx.launch(ctx, x, y, (tick - attack.started) / 10, rgb, Math.max(14, scale * 5), motion, full);
      ctx.restore();
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
    // A fallen player gets the conquest sequence instead (once, not once per attacker).
    if (ended.eliminated) continue;
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
    if (mine && theme.boat) {
      drawSkinnedBoat(ctx, theme, x, y, angle, hull, tick, motion, game.nations[1].color, boat.id, false);
      label(ctx, compactNumber(boat.troops), x, y - hull - 6, 11, "#fff", 700);
      continue;
    }
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

  // 5b. Trade ships, Warships, bombs in flight and what just happened at sea and in the sky.
  drawTraders(ctx, game, view, size);
  drawWarships(ctx, game, view, size, overlay.tool, tick, theme, motion);
  drawEffects(ctx, game, view, size, tick, overlay.effects !== "off");
  drawNukes(ctx, game, view, size, tick);

  // The art style's finish over the map and everything on it (labels and counts stay crisp on top).
  if (style.overlay) {
    ctx.save();
    style.overlay(ctx, size, tick, motion);
    ctx.restore();
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

  // 6b. Conquests: the last pocket falls, a wave of the conqueror's color sweeps back over the land taken, and the
  // fallen name is struck out and fades. One sequence per fall; yours and fallen Nations always, others up close.
  // When several fall at once only the two latest sweep the map; the others just strike out their names.
  let waves = 0;
  for (let i = game.conquests.length - 1; i >= 0; i -= 1) {
    const conquest = game.conquests[i];
    const age = tick - conquest.tick;
    if (age < 0 || age > 40) continue;
    if (conquest.by !== 1 && conquest.kind !== "nation" && scale < 2.5) continue;
    const wave = waves < 2;
    waves += 1;
    drawConquest(ctx, game, view, size, conquest, age, overlay.effects !== "off" && wave, overlay.effects === "full");
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
    const name = style.upper ? nation.name.toUpperCase() : nation.name;
    if (style.nameShadow) {
      // Plaques on the table: the lettering casts a soft shadow.
      ctx.fillStyle = "rgb(0 0 0 / 0.45)";
      ctx.font = `700 ${textSize}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name, x + 1.5, y - textSize * 0.55 + 2);
    }
    label(ctx, name, x, y - textSize * 0.55, textSize, style.nameFill, 700, style.nameHalo);
    label(ctx, compactNumber(nation.troops), x, y + textSize * 0.55, textSize * 0.82, style.nameFill, 600, style.nameHalo);
  }
  for (const pill of pills) drawPill(ctx, pill);
  for (const tag of endTags) drawPill(ctx, tag);
  drawOffscreen(ctx, size, offscreen.slice(0, 5));

  // 8. Pointer feedback: the hovered tile, a Post's reach while placing one, and a ring where you clicked.
  if (overlay.preview.length) {
    const s = scale;
    const box = Math.max(1.5, s);
    ctx.beginPath();
    let drawn = 0;
    for (const t of overlay.preview) {
      const x = view.x + (t % game.w) * s;
      const y = view.y + ((t / game.w) | 0) * s;
      if (x < -box || y < -box || x > size.width || y > size.height) continue;
      ctx.rect(x, y, box, box);
      if (++drawn > 5000) break;
    }
    ctx.fillStyle = "rgb(255 255 255 / 0.32)";
    ctx.fill();
  }
  if (overlay.tool !== "attack" && !overlay.spawn) drawToolRanges(ctx, game, view, size, overlay.tool, tick);
  if (overlay.hover >= 0) {
    const [x, y] = at(overlay.hover);
    const tool = overlay.tool;
    ctx.lineWidth = 2;
    const valid =
      overlay.spawn || tool === "attack"
        ? true
        : isBuilding(tool)
          ? !placeProblem(game, 1, overlay.hover, tool)
          : isWeapon(tool)
            ? !launchProblem(game, 1, overlay.hover, tool)
            : game.terrain[overlay.hover] === WATER;
    ctx.strokeStyle = tool === "attack" || overlay.spawn ? "rgb(255 255 255 / 0.9)" : valid ? `rgb(${GOOD} / 0.95)` : `rgb(${IN} / 0.95)`;
    const box = Math.max(6, scale + 2);
    ctx.strokeRect(x - box / 2, y - box / 2, box, box);
    if (!overlay.spawn && isWeapon(tool)) drawAim(ctx, game, view, overlay.hover, tool, valid, tick);
    if (!overlay.spawn && tool === "sam") ring(ctx, x, y, SAM_RANGE * scale, valid ? GOOD : IN, true, 0.8);
    if (!overlay.spawn && tool === "factory" && valid) drawRailPreview(ctx, game, view, overlay.hover);
    if (tool === "post") {
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
function drawChevrons(
  ctx: CanvasRenderingContext2D,
  cells: FrontCell[],
  view: View,
  rgb: string,
  tick: number,
  speed: number,
  max: number,
  scale: number,
  marker: (ctx: CanvasRenderingContext2D, m: Marker) => void,
  motion: boolean,
  full: boolean,
) {
  const gap = Math.max(9, Math.min(20, scale * 2.5));
  const half = Math.max(3.5, Math.min(8, scale * 1.5));
  const placed: [number, number][] = [];
  const phase = speed ? (tick * speed) % 1 : 0.5 + 0.2 * Math.sin(tick * 1.4);
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
      ctx.save();
      marker(ctx, { x: cx + cell.dx * offset, y: cy + cell.dy * offset, dx: cell.dx, dy: cell.dy, half, alpha: Math.sin(Math.PI * along) * 0.95, rgb, along, tick, motion, full });
      ctx.restore();
    }
  }
}

/** Flashes where an attack just took tiles: the front visibly eating forward. */
function drawTrail(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, attack: Attack, rgb: string, tick: number, fx: FrontWarsTheme["attack"], motion: boolean) {
  const s = view.scale;
  ctx.save();
  for (let i = 0; i < attack.trail.length; i += 1) {
    const t = attack.trail[i];
    if (t < 0) continue;
    const age = tick - attack.trailTick[i];
    if (age < 0 || age > 6) continue;
    const x = view.x + ((t % game.w) + 0.5) * s;
    const y = view.y + (((t / game.w) | 0) + 0.5) * s;
    if (x < -10 || y < -10 || x > size.width + 10 || y > size.height + 10) continue;
    fx.flash(ctx, x, y, s * 0.5 + 1.5, age, rgb, t, tick, motion);
  }
  ctx.restore();
}

/**
 * One conquest, `age` ticks after the fall: the last stand collapses in a flash (~1 s), a shockwave rolls out from
 * the last pocket, a wave of the conqueror's color sweeps back over everything taken (~2.2 s), and the fallen name
 * is struck out and fades by 4 s. Without motion only the struck-out name shows.
 */
function drawConquest(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, conquest: Conquest, age: number, motion: boolean, full: boolean) {
  const s = view.scale;
  const rgb = conquest.by === 1 ? OUT : rgbText(game.nations[conquest.by].color);
  const major = conquest.kind === "nation" || conquest.kind === "human";
  const n = conquest.tiles.length;
  const box = Math.max(1.5, s);
  const tiles = (list: Int32Array, from: number, to: number, fill: string) => {
    ctx.beginPath();
    let drawn = 0;
    for (let i = from; i < to && i < list.length; i += 1) {
      const t = list[i];
      const x = view.x + (t % game.w) * s;
      const y = view.y + ((t / game.w) | 0) * s;
      if (x < -box || y < -box || x > size.width || y > size.height) continue;
      ctx.rect(x, y, box, box);
      if (++drawn > 3000) break;
    }
    ctx.fillStyle = fill;
    ctx.fill();
  };
  if (motion && age <= 12 && conquest.final.length) {
    // The last stand collapses: what fell in the final seconds flashes white and burns into the new color.
    const p = age / 12;
    tiles(conquest.final, 0, conquest.final.length, `rgb(255 255 255 / ${0.85 * (1 - p)})`);
    tiles(conquest.final, 0, conquest.final.length, `rgb(${rgb} / ${0.5 * Math.sin(p * Math.PI)})`);
  }
  if (motion && age <= 26) {
    // The wave front: a band of tiles moving outward through the territory, brightest at its leading edge.
    const front = Math.min(1, age / 22) * n;
    const tail = Math.max(0, front - Math.max(40, n * 0.18));
    const layers = 3;
    for (let k = 0; k < layers; k += 1) {
      const from = Math.floor(tail + ((front - tail) * k) / layers);
      const to = Math.floor(tail + ((front - tail) * (k + 1)) / layers);
      tiles(conquest.tiles, from, to, `rgb(${rgb} / ${(0.18 + 0.32 * ((k + 1) / layers)) * (1 - Math.max(0, age - 20) / 6)})`);
    }
    // Where the last pocket fell: a shockwave, and for a Nation (with full effects) a burst of sparks.
    const [px, py] = [view.x + conquest.x * s, view.y + conquest.y * s];
    const reach = Math.max(major ? 34 : 20, Math.min(260, Math.sqrt(conquest.size) * s * 0.9));
    if (age <= 18) ripple(ctx, px, py, age / 18, rgb, reach);
    if (major && full && age <= 12) sparks(ctx, px, py, age / 12, rgb, conquest.by === 1 ? GOOD : WARN, Math.max(16, reach * 0.45));
  }
  // The fallen name, struck through, then gone.
  const fade = age < 30 ? 1 : 1 - (age - 30) / 10;
  if (fade <= 0) return;
  const x = view.x + conquest.cx * s;
  const y = view.y + conquest.cy * s;
  if (x < -200 || y < -60 || x > size.width + 200 || y > size.height + 60) return;
  const font = Math.max(major ? 14 : 12, Math.min(major ? 30 : 22, Math.sqrt(n) * s * 0.3));
  ctx.save();
  ctx.globalAlpha = fade;
  // A Nation's name settles in from slightly larger; a Bot's just appears.
  const settle = motion && major ? 1 + 0.25 * Math.max(0, 1 - age / 8) : 1;
  label(ctx, conquest.name, x, y, font * settle, "rgb(255 255 255 / 0.92)", 800);
  ctx.font = `800 ${font * settle}px ${FONT}`;
  const width = ctx.measureText(conquest.name).width;
  const strike = motion ? Math.min(1, Math.max(0, (age - 2) / 8)) : 1;
  ctx.lineWidth = Math.max(2, font / 7);
  ctx.lineCap = "round";
  ctx.strokeStyle = `rgb(${conquest.by === 1 ? GOOD : rgb})`;
  ctx.beginPath();
  ctx.moveTo(x - width / 2 - 4, y);
  ctx.lineTo(x - width / 2 - 4 + (width + 8) * strike, y);
  ctx.stroke();
  if (conquest.by === 1) label(ctx, major ? "NATION CONQUERED" : "CONQUERED", x, y + font * 1.0, Math.max(10, font * 0.42), `rgb(${GOOD})`, 800);
  else if (major) label(ctx, `FELL TO ${game.nations[conquest.by].name.toUpperCase()}`, x, y + font * 1.0, Math.max(9, font * 0.38), "rgb(255 255 255 / 0.75)", 700);
  ctx.restore();
}

/* ----------------------------------------------------------------------------------------- Arsenal */

const GOLD = "255 205 90";
const SKY = "140 220 255";

function ring(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgb: string, dashed: boolean, alpha: number, width = 1.5) {
  ctx.save();
  ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([5, 5]);
  ctx.strokeStyle = `rgb(${rgb} / ${alpha})`;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Railroads between a player's stations, with a train running each line back and forth. */
function drawRails(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, tick: number) {
  const s = view.scale;
  if (s < 0.6) return;
  for (const nation of game.nations) {
    if (!nation.alive || !nation.rails.length || (nation.id !== 1 && s < 2)) continue;
    const rgb = nation.id === 1 ? "235 235 245" : rgbText(nation.color);
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.min(3, s * 0.4));
    ctx.strokeStyle = `rgb(${rgb} / 0.55)`;
    ctx.setLineDash([Math.max(2, s), Math.max(2, s * 0.8)]);
    ctx.beginPath();
    for (let i = 0; i < nation.rails.length; i += 2) {
      const a = nation.rails[i];
      const b = nation.rails[i + 1];
      ctx.moveTo(view.x + ((a % game.w) + 0.5) * s, view.y + (((a / game.w) | 0) + 0.5) * s);
      ctx.lineTo(view.x + ((b % game.w) + 0.5) * s, view.y + (((b / game.w) | 0) + 0.5) * s);
    }
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = `rgb(${GOLD})`;
    const car = Math.max(2, Math.min(5, s * 0.8));
    for (let i = 0; i < nation.rails.length; i += 2) {
      const a = nation.rails[i];
      const b = nation.rails[i + 1];
      const ax = (a % game.w) + 0.5;
      const ay = ((a / game.w) | 0) + 0.5;
      const bx = (b % game.w) + 0.5;
      const by = ((b / game.w) | 0) + 0.5;
      const length = Math.hypot(bx - ax, by - ay) || 1;
      const phase = (tick * (0.9 / length) + i * 0.618) % 2;
      const p = phase < 1 ? phase : 2 - phase;
      const x = view.x + (ax + (bx - ax) * p) * s;
      const y = view.y + (ay + (by - ay) * p) * s;
      if (x < -10 || y < -10 || x > size.width + 10 || y > size.height + 10) continue;
      ctx.fillRect(x - car / 2, y - car / 2, car, car);
    }
  }
}

/** Where a Factory placed here would lay its railroads (its nearest Cities, Ports and Factories in range). */
function drawRailPreview(ctx: CanvasRenderingContext2D, game: Game, view: View, tile: number) {
  const s = view.scale;
  const nation = game.nations[1];
  const fx = (tile % game.w) + 0.5;
  const fy = ((tile / game.w) | 0) + 0.5;
  ring(ctx, view.x + fx * s, view.y + fy * s, RAIL_RANGE * s, GOLD, true, 0.6);
  const near = [...nation.citySpots, ...nation.ports, ...nation.factories]
    .map((t) => ({ t, d: (t % game.w + 0.5 - fx) ** 2 + (((t / game.w) | 0) + 0.5 - fy) ** 2 }))
    .filter((entry) => entry.d <= RAIL_RANGE * RAIL_RANGE)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = `rgb(${GOLD} / 0.9)`;
  ctx.beginPath();
  for (const { t } of near) {
    ctx.moveTo(view.x + fx * s, view.y + fy * s);
    ctx.lineTo(view.x + ((t % game.w) + 0.5) * s, view.y + (((t / game.w) | 0) + 0.5) * s);
  }
  ctx.stroke();
  ctx.restore();
  label(ctx, near.length ? `${near.length} rail link${near.length === 1 ? "" : "s"}` : "No stations in range", view.x + fx * s, view.y + fy * s - 18, 11, `rgb(${GOLD})`, 700);
}

/** Ranges that matter for the tool in hand: SAM cover when aiming a bomb or placing a SAM, your fleet's patrols. */
function drawToolRanges(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, tool: Tool, tick: number) {
  const s = view.scale;
  if (isWeapon(tool) || tool === "sam") {
    for (const nation of game.nations) {
      if (!nation.alive) continue;
      const mine = nation.id === 1;
      if (tool === "sam" && !mine) continue;
      for (const sam of nation.sams) {
        const x = view.x + ((sam % game.w) + 0.5) * s;
        const y = view.y + (((sam / game.w) | 0) + 0.5) * s;
        const r = SAM_RANGE * s;
        if (x < -r || y < -r || x > size.width + r || y > size.height + r) continue;
        ctx.fillStyle = mine ? `rgb(${SKY} / 0.06)` : `rgb(${IN} / 0.07)`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ring(ctx, x, y, r, mine ? SKY : IN, !mine, 0.55);
      }
    }
  }
  if (tool === "fleet" || tool === "warship") {
    for (const ship of game.ships) {
      if (ship.owner !== 1) continue;
      const [x, y] = [view.x + ((ship.at % game.w) + 0.5) * s, view.y + (((ship.at / game.w) | 0) + 0.5) * s];
      const [px, py] = [view.x + ((ship.patrol % game.w) + 0.5) * s, view.y + (((ship.patrol / game.w) | 0) + 0.5) * s];
      ring(ctx, x, y, WARSHIP_RANGE * s, OUT, true, 0.4);
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.lineDashOffset = -tick * 0.6;
      ctx.strokeStyle = `rgb(${OUT} / 0.55)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(px, py);
      ctx.stroke();
      ctx.restore();
      ring(ctx, px, py, 6, OUT, false, 0.8);
    }
  }
}

/** Aiming a bomb: its blast rings where it would land, the flight from your ready Silo, and the SAMs in the way. */
function drawAim(ctx: CanvasRenderingContext2D, game: Game, view: View, hover: number, weapon: Weapon, valid: boolean, tick: number) {
  const s = view.scale;
  const info = WEAPONS[weapon];
  const { x: tx, y: ty } = aimPoint(game, weapon, hover);
  const x = view.x + tx * s;
  const y = view.y + ty * s;
  const rgb = valid ? WARN : IN;
  const pulse = 1 + 0.04 * Math.sin(tick * 0.6);
  if (weapon === "mirv") {
    const target = game.nations[game.owner[hover]];
    const spread = Math.sqrt(Math.max(1, target?.tiles ?? 1)) * 0.75 * s;
    ring(ctx, x, y, spread * pulse, rgb, true, 0.85, 2);
    label(ctx, target?.tiles ? `MIRV · ~${Math.min(110, Math.max(14, Math.round(target.tiles / 140)))} warheads on ${target.name}` : "MIRV · aim at a rival", x, y - spread - 12, 12, `rgb(${rgb})`, 800);
  } else {
    ctx.fillStyle = `rgb(${rgb} / 0.12)`;
    ctx.beginPath();
    ctx.arc(x, y, info.outer * s, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, x, y, info.outer * s * pulse, rgb, true, 0.85, 2);
    ring(ctx, x, y, info.inner * s, rgb, false, 0.95, 2);
  }
  // Crosshair.
  ctx.strokeStyle = `rgb(${rgb} / 0.9)`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 8, y);
  ctx.lineTo(x + 8, y);
  ctx.moveTo(x, y - 8);
  ctx.lineTo(x, y + 8);
  ctx.stroke();
  const player = game.nations[1];
  const silo = readySilo(game, player, hover) >= 0 ? readySilo(game, player, hover) : player.silos[0];
  if (silo !== undefined && silo >= 0) {
    const sx = view.x + ((silo % game.w) + 0.5) * s;
    const sy = view.y + (((silo / game.w) | 0) + 0.5) * s;
    const distance = Math.hypot(tx - ((silo % game.w) + 0.5), ty - (((silo / game.w) | 0) + 0.5));
    const lift = Math.min(200, Math.hypot(x - sx, y - sy) * 0.35);
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = -tick;
    ctx.strokeStyle = `rgb(${rgb} / 0.6)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + x) / 2, (sy + y) / 2 - lift * 2, x, y);
    ctx.stroke();
    ctx.restore();
    // Enemy SAMs covering the target: each gets one shot at it.
    let sams = 0;
    if (info.intercept > 0) {
      for (const nation of game.nations) {
        if (!nation.alive || nation.id === 1) continue;
        for (const sam of nation.sams) if ((sam % game.w + 0.5 - tx) ** 2 + (((sam / game.w) | 0) + 0.5 - ty) ** 2 <= SAM_RANGE * SAM_RANGE) sams += 1;
      }
    }
    const eta = Math.max(20, Math.round(distance / info.speed)) / 10;
    const odds = sams ? ` · ${sams} SAM${sams === 1 ? "" : "s"}: ${Math.round((1 - (1 - info.intercept) ** sams) * 100)}% shot down` : "";
    if (weapon !== "mirv") label(ctx, `${info.label} · ${Math.ceil(eta)}s${odds}`, x, y - info.outer * s - 12, 12, `rgb(${sams ? IN : rgb})`, 800);
  }
}

function drawTraders(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size) {
  const s = view.scale;
  for (const trader of game.traders) {
    if (trader.owner !== 1 && s < 1.4) continue;
    const t = trader.path[Math.min(trader.path.length - 1, Math.floor(trader.index))];
    const x = view.x + ((t % game.w) + 0.5) * s;
    const y = view.y + (((t / game.w) | 0) + 0.5) * s;
    if (x < -10 || y < -10 || x > size.width + 10 || y > size.height + 10) continue;
    const r = Math.max(2.5, Math.min(6, s * 1.2));
    ctx.fillStyle = `rgb(${GOLD})`;
    ctx.strokeStyle = trader.owner === 1 ? "#fff" : game.nations[trader.owner].color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawWarships(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, tool: Tool, tick: number, theme: FrontWarsTheme, motion: boolean) {
  const s = view.scale;
  for (const ship of game.ships) {
    const mine = ship.owner === 1;
    if (!mine && s < 0.9) continue;
    const x = view.x + ((ship.at % game.w) + 0.5) * s;
    const y = view.y + (((ship.at / game.w) | 0) + 0.5) * s;
    if (x < -30 || y < -30 || x > size.width + 30 || y > size.height + 30) continue;
    const next = ship.path[Math.min(ship.path.length - 1, ship.step + 2)] ?? ship.at;
    const angle = next !== ship.at ? Math.atan2(((next / game.w) | 0) - ((ship.at / game.w) | 0), (next % game.w) - (ship.at % game.w)) : Math.sin(tick * 0.02 + ship.id) * 0.2;
    const hull = Math.max(7, Math.min(16, s * 3.4));
    if (mine && theme.boat) {
      drawSkinnedBoat(ctx, theme, x, y, angle, hull, tick, motion, game.nations[1].color, ship.id, true);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = mine ? "#fff" : game.nations[ship.owner].color;
      ctx.strokeStyle = `rgb(${INK} / 0.9)`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(hull, 0);
      ctx.lineTo(hull * 0.35, -hull * 0.42);
      ctx.lineTo(-hull * 0.85, -hull * 0.42);
      ctx.lineTo(-hull * 0.85, hull * 0.42);
      ctx.lineTo(hull * 0.35, hull * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mine ? game.nations[1].color : "#fff";
      ctx.fillRect(-hull * 0.35, -hull * 0.18, hull * 0.5, hull * 0.36);
      ctx.restore();
    }
    if (ship.hp < WARSHIP_HP) {
      const w = hull * 1.6;
      ctx.fillStyle = `rgb(${INK} / 0.8)`;
      ctx.fillRect(x - w / 2, y - hull - 6, w, 3);
      ctx.fillStyle = ship.hp > WARSHIP_HP * 0.4 ? `rgb(${GOOD})` : `rgb(${IN})`;
      ctx.fillRect(x - w / 2, y - hull - 6, (w * ship.hp) / WARSHIP_HP, 3);
    }
    if (mine && tool !== "fleet" && tool !== "warship" && s >= 2) ring(ctx, x, y, WARSHIP_RANGE * s, OUT, true, 0.18);
  }
}

/**
 * Your boat or Warship in your boat skin: a white halo around its outline (so it always reads as yours), the skin,
 * a shadow under it in art styles that cast them, and for a Warship a gun turret on deck so it never passes for a
 * troop boat.
 */
function drawSkinnedBoat(ctx: CanvasRenderingContext2D, theme: FrontWarsTheme, x: number, y: number, angle: number, hull: number, tick: number, motion: boolean, color: string, seed: number, warship: boolean) {
  const skin = theme.boat;
  if (!skin) return;
  const size = warship ? hull * 1.08 : hull;
  const piece = { hull: size, tick, motion, color, seed, angle };
  ctx.save();
  if (theme.style.shadows) {
    ctx.fillStyle = "rgb(0 0 0 / 0.3)";
    ctx.beginPath();
    ctx.ellipse(x + size * 0.25, y + size * 0.4, size * 0.95, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineJoin = "round";
  ctx.beginPath();
  skin.path(ctx, piece);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgb(255 255 255 / 0.9)";
  ctx.stroke();
  skin.paint(ctx, piece);
  if (warship) {
    ctx.fillStyle = "#2b2f36";
    ctx.strokeStyle = "#2b2f36";
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, size * 0.12);
    ctx.beginPath();
    ctx.moveTo(size * 0.12, 0);
    ctx.lineTo(size * 0.62, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.12, 0, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size * 0.12, 0, size * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Bombs in flight: an arc from the Silo with a fading trail, and a target marker (red when it's coming at you). */
function drawNukes(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, tick: number) {
  const s = view.scale;
  for (const nuke of game.nukes) {
    const p = Math.min(1, Math.max(0, (tick - nuke.launched) / nuke.flight));
    const toYou = nuke.to === 1 || game.owner[nuke.target] === 1;
    const rgb = nuke.from === 1 ? OUT : toYou ? IN : WARN;
    const x0 = view.x + nuke.x0 * s;
    const y0 = view.y + nuke.y0 * s;
    const x1 = view.x + nuke.x1 * s;
    const y1 = view.y + nuke.y1 * s;
    const lift = nuke.warhead ? 0 : Math.min(220, Math.hypot(x1 - x0, y1 - y0) * 0.35);
    const point = (q: number) => [x0 + (x1 - x0) * q, y0 + (y1 - y0) * q - Math.sin(Math.PI * q) * lift] as const;
    if (!nuke.warhead) {
      // The target, pulsing faster as impact nears.
      const info = WEAPONS[nuke.weapon];
      const r = (nuke.weapon === "mirv" ? Math.sqrt(Math.max(1, game.nations[nuke.to]?.tiles ?? 1)) * 0.75 : info.outer) * s;
      if (x1 > -r && y1 > -r && x1 < size.width + r && y1 < size.height + r) {
        const beat = 0.5 + 0.5 * Math.sin(tick * (0.4 + p * 1.2));
        ctx.fillStyle = `rgb(${rgb} / ${0.06 + 0.08 * beat})`;
        ctx.beginPath();
        ctx.arc(x1, y1, r, 0, Math.PI * 2);
        ctx.fill();
        ring(ctx, x1, y1, r, rgb, true, 0.7 + 0.3 * beat, 2);
        if (nuke.weapon !== "mirv") ring(ctx, x1, y1, info.inner * s, rgb, false, 0.8, 1.5);
        if (nuke.from === 1 || toYou) {
          const left = Math.max(0, (nuke.flight - (tick - nuke.launched)) / 10);
          label(ctx, `${info.label.toUpperCase()} · ${Math.ceil(left)}s`, x1, y1 - r - 12, 12, `rgb(${rgb})`, 800);
        }
      }
    }
    // Trail and head.
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = nuke.warhead ? 1.2 : 2.2;
    const from = Math.max(0, p - (nuke.warhead ? 0.6 : 0.3));
    const steps = 10;
    for (let i = 0; i < steps; i += 1) {
      const a = from + ((p - from) * i) / steps;
      const b = from + ((p - from) * (i + 1)) / steps;
      const [ax, ay] = point(a);
      const [bx, by] = point(b);
      ctx.strokeStyle = `rgb(${rgb} / ${((i + 1) / steps) * 0.8})`;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    const [hx, hy] = point(p);
    ctx.fillStyle = "#fff";
    ctx.shadowColor = `rgb(${rgb})`;
    ctx.shadowBlur = nuke.warhead ? 4 : 10;
    ctx.beginPath();
    ctx.arc(hx, hy, nuke.warhead ? 1.8 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Shells, interceptions, blasts, sinkings and seized cargo, each for a moment where it happened. */
function drawEffects(ctx: CanvasRenderingContext2D, game: Game, view: View, size: Size, tick: number, motion: boolean) {
  const s = view.scale;
  for (const fx of game.effects) {
    const age = tick - fx.tick;
    if (age < 0) continue;
    const x0 = view.x + fx.x0 * s;
    const y0 = view.y + fx.y0 * s;
    const x1 = view.x + fx.x1 * s;
    const y1 = view.y + fx.y1 * s;
    switch (fx.kind) {
      case "shell": {
        if (age > 6 || s < 0.9) break;
        const p = Math.min(1, age / 4);
        ctx.strokeStyle = `rgb(${WARN} / ${1 - age / 6})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x0 + (x1 - x0) * Math.max(0, p - 0.4), y0 + (y1 - y0) * Math.max(0, p - 0.4));
        ctx.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p);
        ctx.stroke();
        if (p >= 1) ring(ctx, x1, y1, 3 + age * 1.5, WARN, false, 1 - age / 6);
        break;
      }
      case "intercept":
      case "miss": {
        if (age > 14) break;
        const p = Math.min(1, age / 5);
        ctx.strokeStyle = `rgb(${SKY} / ${1 - age / 14})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p);
        ctx.stroke();
        if (p >= 1) {
          const q = (age - 5) / 9;
          if (fx.kind === "intercept") {
            ctx.fillStyle = `rgb(255 255 255 / ${0.9 * (1 - q)})`;
            ctx.beginPath();
            ctx.arc(x1, y1, 6 + q * 14, 0, Math.PI * 2);
            ctx.fill();
            ring(ctx, x1, y1, 8 + q * 26, SKY, false, 1 - q, 2);
          } else ring(ctx, x1, y1, 4 + q * 8, "180 180 190", false, 0.8 * (1 - q));
        }
        break;
      }
      case "blast": {
        if (age > 40) break;
        const info = WEAPONS[fx.weapon ?? "atom"];
        const r = Math.max(4, info.outer * s);
        if (x0 < -r * 2 || y0 < -r * 2 || x0 > size.width + r * 2 || y0 > size.height + r * 2) break;
        const q = age / 40;
        if (motion) {
          if (age < 9) {
            // The flash: white core into orange, gone within a second.
            const f = age / 9;
            const glow = ctx.createRadialGradient(x0, y0, 0, x0, y0, r * (0.6 + f * 0.6));
            glow.addColorStop(0, `rgb(255 255 240 / ${1 - f})`);
            glow.addColorStop(0.45, `rgb(255 190 90 / ${0.8 * (1 - f)})`);
            glow.addColorStop(1, "rgb(255 120 40 / 0)");
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x0, y0, r * (0.6 + f * 0.6), 0, Math.PI * 2);
            ctx.fill();
          }
          ring(ctx, x0, y0, r * (0.5 + q * 1.3), "255 214 160", false, 0.85 * (1 - q), 2.5);
          ctx.fillStyle = `rgb(255 120 50 / ${0.2 * (1 - q)})`;
          ctx.beginPath();
          ctx.arc(x0, y0, r * 0.75, 0, Math.PI * 2);
          ctx.fill();
        } else if (age < 20) ring(ctx, x0, y0, r, "255 190 120", false, 0.9 * (1 - age / 20), 2);
        break;
      }
      case "sunk":
        if (age > 15 || s < 0.9) break;
        ring(ctx, x0, y0, 3 + age * 1.2, "200 230 255", false, 1 - age / 15);
        break;
      case "seized":
        if (age > 22 || !fx.value) break;
        label(ctx, `+${compactNumber(fx.value)} gold`, x0, y0 - 8 - (motion ? age * 0.9 : 0), 11, `rgb(${GOLD} / ${1 - age / 22})`, 800);
        break;
    }
  }
}

const ripple = rippleRing;

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
    drawChevrons(ctx, [{ x: x - ended.dx * drift, y: y - ended.dy * drift, n: 1, dx: -ended.dx, dy: -ended.dy }], { scale: 1, x: 0, y: 0 }, rgb, progress * 10, 0.1, 1, scale, DEFAULT_THEME.attack.marker, true, false);
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

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, weight = 700, halo = INK) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(2.5, size / 4);
  ctx.strokeStyle = `rgb(${halo} / 0.8)`;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
