"use client";

import type { MotionLevel } from "@/lib/preferences";
import { HIGHLAND, MOUNTAIN, PLAINS, WARSHIP_HP, WATER, type Attack, type Boat, type Game, type Nation, type Warship } from "./engine";
import { valueNoise, type FrontWarsTheme } from "./look";
import { MapRenderer, drawFrame } from "./render";

/**
 * The shop preview: a small staged battle drawn by the real renderer. Your land (with your pattern and buildings)
 * pushes into a rival's, a troop boat crosses the bay toward an island while a Warship patrols, all on the chosen
 * map and art style. The scene loops every six seconds; with motion off it's a single frame mid-attack.
 */

export const SHOWCASE_W = 48;
export const SHOWCASE_H = 30;
const W = SHOWCASE_W;
const H = SHOWCASE_H;
/** Ticks per loop, when the attack starts, and how often it takes a column. */
const LOOP = 60;
const START = 5;
const STEP = 7;
const COLUMNS = 6;
const FRONT_X = 22;

const tileOf = (x: number, y: number) => y * W + x;

function stage() {
  const n = W * H;
  const terrain = new Uint8Array(n);
  const owner = new Uint16Array(n);
  const building = new Uint8Array(n);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const t = tileOf(x, y);
      const coast = 20 + Math.floor(valueNoise(x / 3, 0.5, 4) * 2.2);
      const island = x >= 35 + Math.floor(valueNoise(0.5, y / 3, 5) * 2) && y >= 19 && y <= 28;
      if (y >= coast && x < 46 && !island) {
        terrain[t] = WATER;
        continue;
      }
      const height = valueNoise(x / 6, y / 6, 6);
      terrain[t] = height > 0.74 ? MOUNTAIN : height > 0.6 ? HIGHLAND : PLAINS;
      if (island) owner[t] = 3;
      else if (x >= 1 && x < FRONT_X && y >= 1) owner[t] = 1;
      else if (x >= FRONT_X && x <= 44 && y >= 2 && y <= 15) owner[t] = 2;
    }
  }
  // Every kind of building of yours, and a couple of the rival's (plain markers).
  const place = (x: number, y: number, code: number) => {
    let t = tileOf(x, y);
    if (terrain[t] === WATER) t -= W;
    building[t] = code;
  };
  place(6, 6, 1);
  place(19, 9, 2);
  place(14, 19, 3);
  place(5, 14, 4);
  place(12, 4, 5);
  place(15, 13, 6);
  place(36, 6, 1);
  place(32, 12, 2);
  return { terrain, owner, building };
}

function nation(id: number, name: string, color: string, troops: number): Nation {
  return { id, name, color, troops, alive: true, tiles: 0, sx: 0, sy: 0, rails: [], kind: id === 1 ? "human" : "nation" } as unknown as Nation;
}

/** Builds the scene once; the returned painter draws it at any moment (`now` in ms). */
export function createFrontWarsShowcase(theme: FrontWarsTheme, effects: MotionLevel) {
  const animate = effects !== "off";
  const { terrain, owner: base, building } = stage();
  const owner = Uint16Array.from(base);
  const nations = [nation(0, "Unclaimed land", "#000000", 0), nation(1, "You", "#3f7bff", 41_000), nation(2, "Vermilion", "#d1503f", 28_000), nation(3, "Saffron Isles", "#d8a23a", 9_000)];

  const water = (x: number, y: number) => terrain[tileOf(x, y)] === WATER;
  // The boat's route: off your coast, across the bay, to the island.
  const route: number[] = [];
  for (let x = 13; x <= 34; x += 1) {
    const y = x < 17 ? 21 + Math.min(3, x - 13) : 24;
    if (water(x, y)) route.push(tileOf(x, y));
  }
  let landing = tileOf(37, 24);
  for (let x = 34; x < 46; x += 1) {
    if (!water(x, 24)) {
      landing = tileOf(x, 24);
      break;
    }
  }
  const patrol: number[] = [];
  for (let x = 16; x <= 27; x += 1) if (water(x, 27)) patrol.push(tileOf(x, 27));

  const trail = new Int32Array(64).fill(-1);
  const trailTick = new Int32Array(64);
  const attack = {
    id: 1,
    from: 1,
    to: 2,
    troops: 8_200,
    front: new Set<number>(),
    started: START,
    reinforcedAt: -1000,
    reinforcedBy: 0,
    clashAt: -1000,
    landedAt: -1000,
    landing: -1,
    rate: 30,
    stalling: false,
    cells: [] as Attack["cells"],
    ax: FRONT_X,
    ay: 9,
    dx: 1,
    dy: 0,
    near: [] as number[],
    trail,
    trailTick,
  } as unknown as Attack;
  const boat: Boat = { id: 1, from: 1, to: 3, troops: 3_200, path: route, index: 0, landing, reason: null };
  const ship = { id: 2, owner: 1, at: patrol[0] ?? route[0], hp: WARSHIP_HP, path: patrol, step: 0 } as unknown as Warship;

  const game = {
    w: W,
    h: H,
    settings: { map: "continent", bots: 0, nations: true, difficulty: "normal" },
    terrain,
    owner,
    building,
    fallout: new Int32Array(W * H),
    readyAt: new Int32Array(W * H),
    nations,
    attacks: [attack],
    ended: [],
    boats: [boat],
    traders: [],
    ships: [ship],
    nukes: [],
    effects: [],
    conquests: [],
    dirty: [] as number[],
    tick: 0,
  } as unknown as Game;

  const renderer = new MapRenderer(game, theme);
  let taken = -1;

  /** Applies the columns taken by `count`, marking changed tiles for the renderer and recounting land. */
  function capture(count: number) {
    if (count === taken) return;
    taken = count;
    for (let i = 0; i < owner.length; i += 1) {
      const x = i % W;
      const want = base[i] === 2 && x >= FRONT_X && x < FRONT_X + count ? 1 : base[i];
      if (owner[i] !== want) {
        owner[i] = want;
        game.dirty.push(i);
      }
    }
    for (const entry of nations) {
      entry.tiles = 0;
      entry.sx = 0;
      entry.sy = 0;
    }
    for (let i = 0; i < owner.length; i += 1) {
      if (!owner[i]) continue;
      const entry = nations[owner[i]];
      entry.tiles += 1;
      entry.sx += i % W;
      entry.sy += (i / W) | 0;
    }
  }

  return (ctx: CanvasRenderingContext2D, size: { width: number; height: number; dpr: number }, now: number) => {
    const clock = animate ? now / 100 : 22.4;
    const loop = Math.floor(clock / LOOP);
    const tick = clock - loop * LOOP;
    const offset = loop * LOOP;
    const count = Math.max(0, Math.min(COLUMNS, Math.floor((tick - START) / STEP) + 1));
    capture(tick < START ? 0 : count);
    game.tick = Math.floor(clock);

    // The attack: its front one column past what it has taken, and the flashes of the last columns taken.
    const frontX = FRONT_X + taken;
    attack.started = offset + START;
    attack.troops = Math.round(8_200 - taken * 900);
    attack.ax = frontX;
    attack.cells = [
      { x: frontX, y: 4.5, n: 8, dx: 1, dy: 0 },
      { x: frontX, y: 13.5, n: 8, dx: 1, dy: 0 },
    ];
    attack.front.clear();
    for (let y = 2; y <= 15; y += 1) if (frontX < W && owner[tileOf(frontX, y)] === 2) attack.front.add(tileOf(frontX, y));
    trail.fill(-1);
    let slot = 0;
    for (let k = Math.max(0, taken - 2); k < taken; k += 1) {
      const at = offset + START + k * STEP;
      for (let y = 2; y <= 15 && slot < trail.length; y += 1) {
        trail[slot] = tileOf(FRONT_X + k, y);
        trailTick[slot] = at + (y % 3);
        slot += 1;
      }
    }

    // The boat crosses once per loop; the Warship patrols back and forth.
    boat.index = Math.min(route.length - 1, Math.floor((tick / LOOP) * route.length));
    if (patrol.length > 1) {
      const span = patrol.length - 1;
      const p = Math.floor(tick / 3) % (span * 2);
      const step = p <= span ? p : span * 2 - p;
      ship.step = step;
      ship.at = patrol[step];
      ship.path = p < span ? patrol : [...patrol].reverse();
      if (p >= span) ship.step = span - step;
    }

    renderer.update();
    const scale = Math.min(size.width / W, size.height / H);
    const view = { scale, x: (size.width - W * scale) / 2, y: (size.height - H * scale) / 2 };
    drawFrame(ctx, renderer, game, view, size, {
      hover: -1,
      tool: "attack",
      pings: [],
      now,
      spawn: false,
      selected: -1,
      tick: offset + tick,
      preview: [],
      effects,
    });
  };
}
