/**
 * Front Wars: a solo territory-control match against Nations and Bots, on the world or a random continent.
 *
 * The rules follow the genre (FrontWars.io and OpenFront.io, whose mechanics are public): pick a spawn, troops
 * grow fastest well below the cap and the cap grows with land and Cities, you send your attack ratio of troops at
 * unclaimed land or a neighbor and the attack eats your whole shared border, losses depend on terrain and on the
 * defender's troop density, Defense Posts make nearby land far costlier and slower, boats carry attacks over
 * water, surrounded Bots are annexed, retreating costs 25% of an attack, and holding 72% of the land wins.
 * The implementation is our own.
 *
 * Pure simulation, no DOM. Nations and Bots act only through `launchAttack` and `build` (the calls the player
 * uses) and read only what every player can see: the map, each player's land and troops, and their own gold.
 */

import { WORLD_H, WORLD_LAND, WORLD_NORTH, WORLD_W } from "./world-map";
import { WORLD_NATIONS } from "./nations";

export type MapKind = "world" | "continent";
export type Difficulty = "easy" | "normal" | "hard";
export type Kind = "human" | "nation" | "bot";
export type Building = "city" | "post";
export type Settings = { map: MapKind; bots: number; nations: boolean; difficulty: Difficulty };

export const MAPS: Record<MapKind, { label: string; hint: string }> = {
  world: { label: "World", hint: "Earth's real coastlines: cross oceans by boat. Real countries play as Nations." },
  continent: { label: "Random continent", hint: "One freshly generated landmass, a tighter fight." },
};
export const BOT_COUNTS = [0, 100, 200, 400] as const;
export const DIFFICULTIES: Record<Difficulty, { label: string; hint: string; cap: number; growth: number; start: number; think: number }> = {
  easy: { label: "Easy", hint: "Nations grow slower, hold fewer troops and react slowly.", cap: 0.5, growth: 0.9, start: 12_500, think: 2.2 },
  normal: { label: "Normal", hint: "Nations grow steadily and pick sensible fights.", cap: 0.75, growth: 0.95, start: 18_750, think: 1.4 },
  hard: { label: "Hard", hint: "Nations match your strength and strike quickly.", cap: 1, growth: 1, start: 25_000, think: 0.8 },
};

/** Win by holding this share of all land (FrontWars.io). */
export const WIN_SHARE = 0.72;
/** Retreating returns an attack's troops minus this share. */
export const RETREAT_COST = 0.25;
export const TICK_SECONDS = 0.1;
/** The spawn phase: pick your start (10 s), then a short protection for everyone (5 s). */
export const SPAWN_TICKS = 100;
export const IMMUNITY_TICKS = 50;
export const MAX_BOATS = 3;
export const BOAT_SPEED = 2;

export const WATER = 0;
export const PLAINS = 1;
export const HIGHLAND = 2;
export const MOUNTAIN = 3;
export const TERRAIN_LABEL = ["Water", "Plains", "Highland", "Mountains"];
/** Per tile: how hard a tile is to take (troops) and how slow (time). */
const MAGNITUDE = [0, 80, 100, 120];
const TILE_COST = [0, 16.5, 20, 25];
/**
 * Our tiles are coarse (the world is ~240k land tiles), so each stands for this much ground at the genre's
 * usual scale: per-tile losses and slowness, and the land in the troop cap, are multiplied by it.
 */
const AREA = 6;

export const CITY_TROOPS = 250_000;
export const POST_RADIUS = 30;
export const cityCost = (cities: number) => Math.min(1_000_000, 125_000 * 2 ** cities);
export const postCost = (posts: number) => Math.min(250_000, 50_000 * (posts + 1));

export type Nation = {
  id: number;
  name: string;
  color: string;
  kind: Kind;
  troops: number;
  gold: number;
  tiles: number;
  cities: number;
  posts: number[];
  alive: boolean;
  spawned: boolean;
  /** Best share of the land ever held. */
  peak: number;
  /** Running sums of tile positions, for the label at the territory's center. */
  sx: number;
  sy: number;
  /** Owned tiles that touch land owned by someone else (or nobody). */
  border: Set<number>;
  nextThink: number;
  /** Where a Nation wants to start (world map), or -1. */
  home: number;
};

export type Attack = {
  id: number;
  from: number;
  /** 0 = unclaimed land. */
  to: number;
  troops: number;
  /** Target tiles on the shared border, bucketed by how many of the attacker's tiles touch them (1–4). */
  buckets: number[][];
  front: Set<number>;
};

export type Boat = { id: number; from: number; troops: number; path: number[]; index: number; landing: number };

export type GameEvent =
  | { kind: "eliminated"; nation: number; by: number }
  | { kind: "annexed"; nation: number; by: number }
  | { kind: "landed"; boat: number; from: number; to: number }
  | { kind: "captured-building"; from: number; to: number; building: Building };

export type Outcome = { winner: number | null; reason: "share" | "conquered" };

export type Game = {
  w: number;
  h: number;
  settings: Settings;
  terrain: Uint8Array;
  owner: Uint16Array;
  /** 0 none, 1 city, 2 defense post. */
  building: Uint8Array;
  landTiles: number;
  nations: Nation[];
  attacks: Attack[];
  boats: Boat[];
  nextId: number;
  tick: number;
  /** Seconds of battle (the spawn phase doesn't count). */
  time: number;
  phase: "spawn" | "battle";
  immuneUntil: number;
  dirty: number[];
  events: GameEvent[];
  outcome: Outcome | null;
  rng: () => number;
};

/* ------------------------------------------------------------------------------------------- Helpers */

export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The up-to-four orthogonal neighbors of a tile (a fresh array: safe to hold while calling other helpers). */
export function neighbors(t: number, w: number, h: number) {
  const x = t % w;
  const list: number[] = [];
  if (x > 0) list.push(t - 1);
  if (x < w - 1) list.push(t + 1);
  if (t >= w) list.push(t - w);
  if (t < w * (h - 1)) list.push(t + w);
  return list;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Smooth value noise: random values on a coarse grid, blended with smoothstep. */
function valueNoise(rng: () => number, cells: number, w: number, h: number) {
  const gw = cells + 1;
  const gh = Math.ceil((cells * h) / w) + 2;
  const grid = Float32Array.from({ length: gw * gh }, () => rng());
  return (x: number, y: number) => {
    const fx = (x / w) * cells;
    const fy = (y / w) * cells;
    const x0 = Math.min(gw - 2, Math.floor(fx));
    const y0 = Math.min(gh - 2, Math.floor(fy));
    const sx = fx - x0;
    const sy = fy - y0;
    const u = sx * sx * (3 - 2 * sx);
    const v = sy * sy * (3 - 2 * sy);
    const a = grid[y0 * gw + x0];
    const b = grid[y0 * gw + x0 + 1];
    const c = grid[(y0 + 1) * gw + x0];
    const d = grid[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/* ------------------------------------------------------------------------------------------- Maps */

function decodeWorld() {
  const land = new Uint8Array(WORLD_W * WORLD_H);
  WORLD_LAND.split(";").forEach((row, y) => {
    let x = 0;
    let value = 0;
    for (const run of row.split(".")) {
      const length = parseInt(run, 36);
      if (value) land.fill(1, y * WORLD_W + x, y * WORLD_W + x + length);
      x += length;
      value ^= 1;
    }
  });
  return land;
}

/** Highland and mountains from noise over the land (the coastlines are real, the relief is invented). */
function addRelief(land: Uint8Array, w: number, h: number, rng: () => number) {
  const ridges = [valueNoise(rng, 18, w, h), valueNoise(rng, 45, w, h), valueNoise(rng, 110, w, h)];
  const terrain = new Uint8Array(w * h);
  for (let t = 0; t < w * h; t += 1) {
    if (!land[t]) continue;
    const x = t % w;
    const y = (t / w) | 0;
    const height = ridges[0](x, y) * 0.55 + ridges[1](x, y) * 0.3 + ridges[2](x, y) * 0.15;
    terrain[t] = height > 0.72 ? MOUNTAIN : height > 0.6 ? HIGHLAND : PLAINS;
  }
  return terrain;
}

/** One landmass in a sea, every land tile reachable over land. */
function generateContinent(w: number, h: number, rng: () => number) {
  const octaves = [valueNoise(rng, 4, w, h), valueNoise(rng, 9, w, h), valueNoise(rng, 20, w, h), valueNoise(rng, 44, w, h)];
  const size = w * h;
  const shape = new Float32Array(size);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const noise = octaves[0](x, y) * 0.5 + octaves[1](x, y) * 0.25 + octaves[2](x, y) * 0.15 + octaves[3](x, y) * 0.1;
      const dx = (x / (w - 1)) * 2 - 1;
      const dy = (y / (h - 1)) * 2 - 1;
      shape[y * w + x] = noise * 0.55 + (1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) * 0.92)) * 0.75;
    }
  }
  const level = Float32Array.from(shape).sort()[Math.floor(size * 0.45)];
  const land = new Uint8Array(size);
  for (let t = 0; t < size; t += 1) {
    const x = t % w;
    const y = (t / w) | 0;
    if (shape[t] >= level && x > 0 && y > 0 && x < w - 1 && y < h - 1) land[t] = 1;
  }
  // Keep only the largest landmass.
  const label = new Int32Array(size).fill(-1);
  let best = -1;
  let bestSize = 0;
  for (let start = 0, id = 0; start < size; start += 1) {
    if (!land[start] || label[start] !== -1) continue;
    const stack = [start];
    label[start] = id;
    let count = 0;
    while (stack.length) {
      const t = stack.pop()!;
      count += 1;
      for (const n of neighbors(t, w, h)) {
        if (land[n] && label[n] === -1) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    if (count > bestSize) {
      bestSize = count;
      best = id;
    }
    id += 1;
  }
  for (let t = 0; t < size; t += 1) if (land[t] && label[t] !== best) land[t] = 0;
  return land;
}

/* ------------------------------------------------------------------------------------------- Setup */

const PLAYER_COLOR = "#3f7bff";
const SYLLABLES = ["ka", "ro", "vel", "mor", "tan", "li", "sa", "dor", "en", "ia", "quo", "bar", "zin", "eth", "ul", "on", "ra", "gor", "fen", "is", "ny", "ost", "ar", "ce", "lum", "pa", "dru", "vey", "hal", "mi"];
const CONTINENT_NATIONS = ["Vael", "Korrin", "Sable March", "Ostra", "Thane", "Myrr", "Cindral", "Aurest", "Brannoch", "Elsmere", "Quillon", "Tarrow"];

function hsl(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))) * 255);
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function botName(rng: () => number) {
  const parts = 2 + (rng() < 0.3 ? 1 : 0);
  let name = "";
  for (let i = 0; i < parts; i += 1) name += SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
  return name[0].toUpperCase() + name.slice(1);
}

function newNation(id: number, name: string, kind: Kind, color: string, troops: number, home = -1): Nation {
  return { id, name, color, kind, troops, gold: 0, tiles: 0, cities: 0, posts: [], alive: true, spawned: false, peak: 0, sx: 0, sy: 0, border: new Set(), nextThink: 0, home };
}

export function createGame(settings: Settings, seed: number): Game {
  const rng = seededRandom(seed);
  let w: number;
  let h: number;
  let land: Uint8Array;
  if (settings.map === "world") {
    w = WORLD_W;
    h = WORLD_H;
    land = decodeWorld();
  } else {
    w = 520;
    h = 320;
    land = generateContinent(w, h, rng);
  }
  const terrain = addRelief(land, w, h, rng);
  let landTiles = 0;
  for (let t = 0; t < w * h; t += 1) if (terrain[t]) landTiles += 1;

  const difficulty = DIFFICULTIES[settings.difficulty];
  const nations: Nation[] = [newNation(0, "Unclaimed land", "bot", "#000000", 0)];
  nations[0].alive = false;
  const player = newNation(1, "You", "human", PLAYER_COLOR, 25_000);
  player.gold = 0;
  nations.push(player);

  if (settings.nations) {
    const list =
      settings.map === "world"
        ? WORLD_NATIONS.map(([name, lat, lon]) => ({ name, home: Math.floor((WORLD_NORTH - lat) * 4) * w + Math.floor((lon + 180) * 4) }))
        : CONTINENT_NATIONS.map((name) => ({ name, home: -1 }));
    list.forEach((entry, i) => {
      const hue = (i * 137.508 + 20) % 360;
      nations.push(newNation(nations.length, entry.name, "nation", hsl(hue, 62, 52), difficulty.start, entry.home));
    });
  }
  for (let i = 0; i < settings.bots; i += 1) {
    const hue = (i * 97.3 + 200) % 360;
    nations.push(newNation(nations.length, botName(rng), "bot", hsl(hue, 22 + rng() * 14, 40 + rng() * 14), 10_000));
  }

  const game: Game = {
    w,
    h,
    settings,
    terrain,
    owner: new Uint16Array(w * h),
    building: new Uint8Array(w * h),
    landTiles,
    nations,
    attacks: [],
    boats: [],
    nextId: 1,
    tick: 0,
    time: 0,
    phase: "spawn",
    immuneUntil: 0,
    dirty: [],
    events: [],
    outcome: null,
    rng,
  };

  // Nations and Bots take their places right away; the player picks theirs during the spawn phase.
  for (const nation of nations) {
    if (nation.kind === "nation") spawnNear(game, nation, nation.home >= 0 ? nation.home : randomLand(game), 4);
    else if (nation.kind === "bot") spawnNear(game, nation, randomLand(game), 2);
  }
  return game;
}

function randomLand(game: Game) {
  for (let tries = 0; tries < 2000; tries += 1) {
    const t = Math.floor(game.rng() * game.terrain.length);
    if (game.terrain[t] !== WATER && game.owner[t] === 0) return t;
  }
  return -1;
}

/** The nearest unclaimed land to a tile, searching outward. */
function nearestFree(game: Game, t: number, radius: number) {
  const { w, h } = game;
  const x0 = t % w;
  const y0 = (t / w) | 0;
  for (let r = 0; r <= radius; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const n = y * w + x;
        if (game.terrain[n] !== WATER && game.owner[n] === 0) return n;
      }
    }
  }
  return -1;
}

function spawnNear(game: Game, nation: Nation, target: number, radius: number) {
  const center = target < 0 ? -1 : nearestFree(game, target, 40);
  if (center < 0) {
    nation.alive = false;
    return;
  }
  claimDisc(game, nation.id, center, radius);
  nation.spawned = true;
  nation.nextThink = SPAWN_TICKS * TICK_SECONDS + game.rng() * 3;
}

function claimDisc(game: Game, id: number, center: number, radius: number) {
  const { w, h } = game;
  const x = center % w;
  const y = (center / w) | 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy > radius * radius + 1) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const t = ny * w + nx;
      if (game.terrain[t] !== WATER && game.owner[t] === 0) setOwner(game, t, id);
    }
  }
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/** During the spawn phase: start (or move your start) here. */
export function chooseSpawn(game: Game, tile: number): ActionResult {
  if (game.phase !== "spawn") return { ok: false, message: "The spawn phase is over." };
  if (tile < 0 || game.terrain[tile] === WATER) return { ok: false, message: "Pick a spot on land." };
  if (game.owner[tile] !== 0 && game.owner[tile] !== 1) return { ok: false, message: `${game.nations[game.owner[tile]].name} already starts there. Pick open land.` };
  const player = game.nations[1];
  // Moving: give back the old start first.
  if (player.spawned) {
    for (let t = 0; t < game.owner.length; t += 1) if (game.owner[t] === 1) setOwner(game, t, 0);
  }
  claimDisc(game, 1, tile, 4);
  player.spawned = true;
  return { ok: true, message: "Your start is set. Tap elsewhere to move it before the countdown ends." };
}

/* ------------------------------------------------------------------------------------------- Rules */

export function maxTroops(game: Game, nation: Nation) {
  const base = 2 * (Math.pow(nation.tiles * AREA, 0.6) * 1000 + 50_000) + nation.cities * CITY_TROOPS;
  if (nation.kind === "bot") return base / 3;
  if (nation.kind === "nation") return base * DIFFICULTIES[game.settings.difficulty].cap;
  return base;
}

/** Troops gained per tick: fastest well below the cap, nothing at it. */
export function troopGrowth(game: Game, nation: Nation) {
  const cap = maxTroops(game, nation);
  const raw = (10 + Math.pow(Math.max(0, nation.troops), 0.73) / 4) * (1 - nation.troops / cap);
  const multiplier = nation.kind === "bot" ? 0.5 : nation.kind === "nation" ? DIFFICULTIES[game.settings.difficulty].growth : 1;
  return Math.max(0, raw * multiplier);
}

export const goldPerTick = (nation: Nation) => (nation.kind === "bot" ? 50 : 100);
export const share = (game: Game, nation: Nation) => nation.tiles / game.landTiles;
export const troopsAttacking = (game: Game, id: number) =>
  game.attacks.reduce((sum, attack) => (attack.from === id ? sum + attack.troops : sum), 0) + game.boats.reduce((sum, boat) => (boat.from === id ? sum + boat.troops : sum), 0);
export const immune = (game: Game) => game.phase === "spawn" || game.tick < game.immuneUntil;

function landNeighborNotOwnedBy(game: Game, t: number, id: number) {
  for (const n of neighbors(t, game.w, game.h)) if (game.terrain[n] !== WATER && game.owner[n] !== id) return true;
  return false;
}

function ownNeighbors(game: Game, t: number, id: number) {
  let count = 0;
  for (const n of neighbors(t, game.w, game.h)) if (game.owner[n] === id && game.terrain[n] !== WATER) count += 1;
  return count;
}

/** The one place ownership changes: keeps tile counts, borders, label centers and buildings in step. */
function setOwner(game: Game, t: number, id: number) {
  const before = game.owner[t];
  if (before === id) return;
  const { nations, w } = game;
  const x = t % w;
  const y = (t / w) | 0;
  game.owner[t] = id;
  if (before) {
    const loser = nations[before];
    loser.tiles -= 1;
    loser.sx -= x;
    loser.sy -= y;
    loser.border.delete(t);
    if (game.building[t] === 1) loser.cities -= 1;
    if (game.building[t] === 2) loser.posts = loser.posts.filter((post) => post !== t);
    for (const n of neighbors(t, w, game.h)) if (game.owner[n] === before) loser.border.add(n);
  }
  if (id) {
    const gainer = nations[id];
    gainer.tiles += 1;
    gainer.sx += x;
    gainer.sy += y;
    if (game.building[t] === 1) gainer.cities += 1;
    if (game.building[t] === 2) gainer.posts.push(t);
    if (before && game.building[t]) game.events.push({ kind: "captured-building", from: before, to: id, building: game.building[t] === 1 ? "city" : "post" });
    if (landNeighborNotOwnedBy(game, t, id)) gainer.border.add(t);
    for (const n of neighbors(t, w, game.h)) if (game.owner[n] === id && !landNeighborNotOwnedBy(game, n, id)) gainer.border.delete(n);
  } else if (game.building[t]) {
    game.building[t] = 0;
  }
  game.dirty.push(t);
}

function defended(game: Game, t: number) {
  const owner = game.owner[t];
  if (!owner) return false;
  const posts = game.nations[owner].posts;
  if (!posts.length) return false;
  const x = t % game.w;
  const y = (t / game.w) | 0;
  for (const post of posts) {
    const dx = (post % game.w) - x;
    const dy = ((post / game.w) | 0) - y;
    if (dx * dx + dy * dy <= POST_RADIUS * POST_RADIUS) return true;
  }
  return false;
}

/* ------------------------------------------------------------------------------------------- Attacks */

function addFront(game: Game, attack: Attack, t: number) {
  const count = ownNeighbors(game, t, attack.from);
  if (!count) return;
  attack.buckets[count].push(t);
  attack.front.add(t);
}

/** The next tile to take: the most enclosed first (smooth, round growth), at random among equals. */
function takeFront(game: Game, attack: Attack) {
  for (let restarts = 0; restarts < 8; restarts += 1) {
    let raised = false;
    for (let count = 4; count >= 1 && !raised; count -= 1) {
      const bucket = attack.buckets[count];
      while (bucket.length) {
        const i = Math.floor(game.rng() * bucket.length);
        const t = bucket[i];
        bucket[i] = bucket[bucket.length - 1];
        bucket.pop();
        if (game.owner[t] !== attack.to || game.terrain[t] === WATER) {
          attack.front.delete(t);
          continue;
        }
        const now = ownNeighbors(game, t, attack.from);
        if (!now) {
          attack.front.delete(t);
          continue;
        }
        if (now > count) {
          // More enclosed than when it was queued: it belongs in a higher bucket.
          attack.buckets[now].push(t);
          raised = true;
          break;
        }
        attack.front.delete(t);
        return t;
      }
    }
    if (!raised) return -1;
  }
  return -1;
}

function newAttack(game: Game, from: number, to: number, troops: number): Attack {
  const attack: Attack = { id: game.nextId++, from, to, troops, buckets: [[], [], [], [], []], front: new Set() };
  game.attacks.push(attack);
  return attack;
}

/** Queue every target tile touching the attacker's border. */
function seedFront(game: Game, attack: Attack) {
  for (const b of game.nations[attack.from].border) {
    for (const n of neighbors(b, game.w, game.h)) {
      if (game.owner[n] === attack.to && game.terrain[n] !== WATER && !attack.front.has(n)) addFront(game, attack, n);
    }
  }
}

function touches(game: Game, from: number, to: number) {
  for (const b of game.nations[from].border) {
    for (const n of neighbors(b, game.w, game.h)) if (game.owner[n] === to && game.terrain[n] !== WATER) return true;
  }
  return false;
}

/**
 * Send `ratio` of a player's troops at whoever owns `target` (or at unclaimed land). Bordering land: the attack
 * takes your whole shared border. Across water: a boat sails to the nearest shore and attacks from there.
 */
export function launchAttack(game: Game, from: number, target: number, ratio: number): ActionResult {
  const attacker = game.nations[from];
  if (game.outcome || !attacker.alive) return { ok: false, message: "The match is over." };
  if (game.phase === "spawn") return { ok: false, message: "Wait for the spawn phase to end." };
  if (target < 0 || game.terrain[target] === WATER) return { ok: false, message: "That's water. Aim at land." };
  const to = game.owner[target];
  if (to === from) return { ok: false, message: "That's your land. Aim beyond your border." };
  if (to && immune(game)) return { ok: false, message: "Everyone is protected for a few more seconds. Claim open land first." };
  const troops = Math.floor(attacker.troops * clamp(ratio, 0, 1));
  if (troops < 1) return { ok: false, message: "Not enough troops. Wait for them to grow." };
  const name = to ? game.nations[to].name : "unclaimed land";

  if (!touches(game, from, to)) return sendBoat(game, from, target, troops);

  attacker.troops -= troops;
  let force = troops;
  // Attacks between the same two players meet and cancel out.
  const opposing = to ? game.attacks.find((attack) => attack.from === to && attack.to === from) : undefined;
  if (opposing) {
    const clash = Math.min(opposing.troops, force);
    opposing.troops -= clash;
    force -= clash;
    if (opposing.troops <= 0) endAttack(game, opposing, 0);
    if (force <= 0) return { ok: true, message: `Your troops met ${name}'s attack and stopped it.` };
  }
  const existing = game.attacks.find((attack) => attack.from === from && attack.to === to);
  if (existing) {
    existing.troops += force;
    seedFront(game, existing);
    return { ok: true, message: `Reinforced: ${compactNumber(force)} more troops against ${name}.` };
  }
  const attack = newAttack(game, from, to, force);
  seedFront(game, attack);
  return { ok: true, message: to ? `Attacking ${name} with ${compactNumber(force)} troops.` : `Expanding with ${compactNumber(force)} troops.` };
}

export function retreat(game: Game, attackId: number, from: number): ActionResult {
  const attack = game.attacks.find((entry) => entry.id === attackId && entry.from === from);
  if (!attack) return { ok: false, message: "That attack has already ended." };
  const returned = Math.floor(attack.troops * (1 - RETREAT_COST));
  endAttack(game, attack, returned);
  return { ok: true, message: `Retreated: ${compactNumber(returned)} troops came home (25% were lost).` };
}

function endAttack(game: Game, attack: Attack, returned: number) {
  game.attacks = game.attacks.filter((entry) => entry !== attack);
  const nation = game.nations[attack.from];
  if (nation.alive && returned > 0) nation.troops += returned;
}

/** One tick of an attack: take tiles until this tick's time is used up or the troops run out. */
function advanceAttack(game: Game, attack: Attack) {
  const attacker = game.nations[attack.from];
  const defender = attack.to ? game.nations[attack.to] : null;
  let time = 1;
  for (let guard = 0; guard < 5000 && time > 0; guard += 1) {
    const t = takeFront(game, attack);
    if (t < 0) {
      endAttack(game, attack, attack.troops);
      return;
    }
    const terrain = game.terrain[t];
    const border = Math.max(1, attack.front.size + 1);
    let loss: number;
    let cost: number;
    let defenderLoss = 0;
    if (!defender) {
      loss = (MAGNITUDE[terrain] / (attacker.kind === "bot" ? 10 : 5)) * AREA;
      cost = (clamp((2000 * TILE_COST[terrain] * AREA) / Math.max(1, attack.troops), 5, 100) / (2 * border)) * AREA;
    } else {
      const fortified = defended(game, t);
      const ratio = defender.troops / Math.max(1, attack.troops);
      // Troops per tile at the genre's scale (each of our tiles is AREA of theirs); the defender loses ours.
      const density = defender.troops / Math.max(1, defender.tiles);
      loss = MAGNITUDE[terrain] * AREA * (fortified ? 5 : 1) * clamp(ratio, 0.6, 2) * (0.463 + (0.0039 * density) / AREA) * (defender.kind === "bot" && attacker.kind !== "bot" ? 0.7 : 1);
      cost = (((clamp(ratio, 0.82, 7.5) * clamp(ratio / 20, 1, 50)) / 8.55) * TILE_COST[terrain] * (fortified ? 3 : 1) * AREA) / border;
      defenderLoss = density;
    }
    if (attack.troops < loss) {
      // Spent: the last troops fall at the border.
      endAttack(game, attack, 0);
      return;
    }
    attack.troops -= loss;
    if (defender) defender.troops = Math.max(0, defender.troops - defenderLoss);
    setOwner(game, t, attack.from);
    for (const n of neighbors(t, game.w, game.h)) if (game.owner[n] === attack.to && game.terrain[n] !== WATER) addFront(game, attack, n);
    time -= cost;
    if (defender && defender.tiles === 0) {
      eliminate(game, defender, attack.from);
      return;
    }
  }
}

function eliminate(game: Game, nation: Nation, by: number) {
  if (!nation.alive) return;
  nation.alive = false;
  nation.troops = 0;
  // Its gold goes to whoever finished it.
  if (by) game.nations[by].gold += nation.gold;
  nation.gold = 0;
  game.boats = game.boats.filter((boat) => boat.from !== nation.id);
  for (const attack of [...game.attacks]) {
    if (attack.from === nation.id) game.attacks = game.attacks.filter((entry) => entry !== attack);
    else if (attack.to === nation.id) endAttack(game, attack, attack.troops);
  }
  game.events.push({ kind: "eliminated", nation: nation.id, by });
}

/* ------------------------------------------------------------------------------------------- Boats */

let searchStamp = new Uint32Array(0);
let searchPrev = new Int32Array(0);
let stamp = 0;

/** A coastal tile of the target's land near `tile` (where a boat can land), or -1. */
function landingNear(game: Game, tile: number) {
  const owner = game.owner[tile];
  const { w, h } = game;
  const x0 = tile % w;
  const y0 = (tile / w) | 0;
  for (let r = 0; r <= 30; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx;
        const y = y0 + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const t = y * w + x;
        if (game.terrain[t] === WATER || game.owner[t] !== owner) continue;
        for (const n of neighbors(t, w, h)) if (game.terrain[n] === WATER) return t;
      }
    }
  }
  return -1;
}

/** Shortest water route from the attacker's coast to the landing (breadth-first, bounded), or null. */
function boatRoute(game: Game, from: number, landing: number, limit = 350_000): number[] | null {
  const { w, h, terrain, owner } = game;
  const size = w * h;
  if (searchStamp.length !== size) {
    searchStamp = new Uint32Array(size);
    searchPrev = new Int32Array(size);
    stamp = 0;
  }
  stamp += 1;
  const queue: number[] = [];
  for (const n of neighbors(landing, w, h)) {
    if (terrain[n] === WATER) {
      searchStamp[n] = stamp;
      searchPrev[n] = -1;
      queue.push(n);
    }
  }
  for (let head = 0; head < queue.length && head < limit; head += 1) {
    const t = queue[head];
    for (const n of neighbors(t, w, h)) {
      if (terrain[n] !== WATER) {
        if (owner[n] === from) {
          // Reached our coast: the route runs from here back to the landing.
          const path: number[] = [];
          for (let step = t; step !== -1; step = searchPrev[step]) path.push(step);
          path.push(landing);
          return path;
        }
        continue;
      }
      if (searchStamp[n] === stamp) continue;
      searchStamp[n] = stamp;
      searchPrev[n] = t;
      queue.push(n);
    }
  }
  return null;
}

function sendBoat(game: Game, from: number, target: number, troops: number): ActionResult {
  const attacker = game.nations[from];
  const name = game.owner[target] ? game.nations[game.owner[target]].name : "unclaimed land";
  if (game.boats.filter((boat) => boat.from === from).length >= MAX_BOATS) return { ok: false, message: `You already have ${MAX_BOATS} boats at sea.` };
  const landing = landingNear(game, target);
  if (landing < 0) return { ok: false, message: `You don't border ${name}, and there's no coast near there to land on.` };
  const path = boatRoute(game, from, landing);
  if (!path) return { ok: false, message: `You don't border ${name}, and no boat route reaches it from your coast.` };
  attacker.troops -= troops;
  game.boats.push({ id: game.nextId++, from, troops, path, index: 0, landing });
  return { ok: true, message: `A boat with ${compactNumber(troops)} troops sails for ${name}.` };
}

function advanceBoat(game: Game, boat: Boat) {
  boat.index += BOAT_SPEED;
  if (boat.index < boat.path.length - 1) return;
  game.boats = game.boats.filter((entry) => entry !== boat);
  const attacker = game.nations[boat.from];
  if (!attacker.alive) return;
  const to = game.owner[boat.landing];
  if (to === boat.from) {
    attacker.troops += boat.troops;
    return;
  }
  if (to && (immune(game) || !game.nations[to].alive)) {
    attacker.troops += boat.troops;
    return;
  }
  // Storm the beach, then fight inland from it.
  setOwner(game, boat.landing, boat.from);
  game.events.push({ kind: "landed", boat: boat.id, from: boat.from, to });
  const existing = game.attacks.find((attack) => attack.from === boat.from && attack.to === to);
  const attack = existing ?? newAttack(game, boat.from, to, 0);
  attack.troops += boat.troops;
  for (const n of neighbors(boat.landing, game.w, game.h)) if (game.owner[n] === to && game.terrain[n] !== WATER) addFront(game, attack, n);
}

/* ------------------------------------------------------------------------------------------- Buildings */

export function build(game: Game, id: number, t: number, kind: Building): ActionResult {
  const nation = game.nations[id];
  if (game.outcome) return { ok: false, message: "The match is over." };
  if (game.phase === "spawn") return { ok: false, message: "Build once the spawn phase ends." };
  if (game.owner[t] !== id) return { ok: false, message: "Build on your own land." };
  if (game.building[t]) return { ok: false, message: "There's already a building there." };
  const cost = kind === "city" ? cityCost(nation.cities) : postCost(nation.posts.length);
  if (nation.gold < cost) return { ok: false, message: `Not enough gold: ${kind === "city" ? "a City" : "a Defense Post"} costs ${compactNumber(cost)}.` };
  nation.gold -= cost;
  game.building[t] = kind === "city" ? 1 : 2;
  if (kind === "city") nation.cities += 1;
  else nation.posts.push(t);
  game.dirty.push(t);
  return { ok: true, message: kind === "city" ? `City built: +${compactNumber(CITY_TROOPS)} troop cap.` : "Defense Post built: attacks on land within its reach cost far more and slow to a crawl." };
}

/* ------------------------------------------------------------------------------------------- Simulation */

export function step(game: Game) {
  if (game.outcome) return;
  game.tick += 1;
  game.events.length = Math.min(game.events.length, 200);

  if (game.phase === "spawn") {
    if (game.tick >= SPAWN_TICKS) {
      const player = game.nations[1];
      if (!player.spawned) spawnNear(game, player, randomLand(game), 4);
      game.phase = "battle";
      game.immuneUntil = game.tick + IMMUNITY_TICKS;
    }
    return;
  }

  game.time += TICK_SECONDS;
  for (const nation of game.nations) {
    if (!nation.alive) continue;
    nation.troops = Math.min(maxTroops(game, nation), nation.troops + troopGrowth(game, nation));
    nation.gold += goldPerTick(nation);
  }

  for (const attack of [...game.attacks]) if (game.attacks.includes(attack)) advanceAttack(game, attack);
  for (const boat of [...game.boats]) advanceBoat(game, boat);

  for (const nation of game.nations) {
    if (!nation.alive || nation.kind === "human" || game.time < nation.nextThink) continue;
    if (nation.kind === "bot") {
      nation.nextThink = game.time + 1.5 + game.rng() * 3;
      thinkBot(game, nation);
    } else {
      nation.nextThink = game.time + DIFFICULTIES[game.settings.difficulty].think * (0.7 + game.rng() * 0.6);
      thinkNation(game, nation);
    }
  }

  if (game.tick % 10 === 0) annexSurrounded(game);
  checkOutcome(game);
}

/** A Bot whose land touches only one other player (no coast, no unclaimed land) joins that player. */
function annexSurrounded(game: Game) {
  for (const bot of game.nations) {
    if (!bot.alive || bot.kind !== "bot" || bot.tiles > 4000) continue;
    let surrounder = -1;
    let enclosed = true;
    for (const b of bot.border) {
      for (const n of neighbors(b, game.w, game.h)) {
        if (game.terrain[n] === WATER) continue;
        const o = game.owner[n];
        if (o === bot.id) continue;
        if (o === 0 || (surrounder !== -1 && o !== surrounder)) enclosed = false;
        surrounder = o;
      }
      if (!enclosed) break;
    }
    if (!enclosed || surrounder <= 0) continue;
    // Flood the Bot's land: any coast or map edge means it isn't enclosed.
    const start = bot.border.values().next().value;
    if (start === undefined) continue;
    const tiles: number[] = [start];
    const seen = new Set(tiles);
    let open = false;
    for (let i = 0; i < tiles.length && !open; i += 1) {
      const t = tiles[i];
      const x = t % game.w;
      if (x === 0 || x === game.w - 1 || t < game.w || t >= game.w * (game.h - 1)) open = true;
      for (const n of neighbors(t, game.w, game.h)) {
        if (game.terrain[n] === WATER) open = true;
        else if (game.owner[n] === bot.id && !seen.has(n)) {
          seen.add(n);
          tiles.push(n);
        }
      }
    }
    if (open || tiles.length !== bot.tiles) continue;
    for (const t of tiles) setOwner(game, t, surrounder);
    eliminate(game, bot, surrounder);
    game.events.pop();
    game.events.push({ kind: "annexed", nation: bot.id, by: surrounder });
  }
}

function checkOutcome(game: Game) {
  for (const nation of game.nations) {
    if (!nation.alive) continue;
    const held = share(game, nation);
    if (held > nation.peak) nation.peak = held;
    if (held >= WIN_SHARE) {
      game.outcome = { winner: nation.id, reason: "share" };
      return;
    }
  }
  if (!game.nations[1].alive || (game.nations[1].spawned && game.nations[1].tiles === 0)) {
    game.nations[1].alive = false;
    game.outcome = { winner: null, reason: "conquered" };
  }
}

/* ------------------------------------------------------------------------------------------- AI */

/** What a player sees along its border: neighbors by land (with one tile of theirs to aim at). */
function survey(game: Game, nation: Nation, samples: number) {
  const seen = new Map<number, number>();
  const size = nation.border.size;
  if (!size) return seen;
  const stride = Math.max(1, Math.floor(size / samples));
  let i = Math.floor(game.rng() * stride);
  let index = 0;
  for (const b of nation.border) {
    if (index++ !== i) continue;
    i += stride;
    for (const n of neighbors(b, game.w, game.h)) {
      if (game.terrain[n] === WATER) continue;
      const o = game.owner[n];
      if (o !== nation.id && !seen.has(o)) seen.set(o, n);
    }
  }
  return seen;
}

/** Bots: grow, take open land in small bites, and pick on much weaker neighbors. */
function thinkBot(game: Game, bot: Nation) {
  if (bot.troops < maxTroops(game, bot) * 0.3) return;
  const around = survey(game, bot, 12);
  const open = around.get(0);
  if (open !== undefined) {
    launchAttack(game, bot.id, open, 0.05);
    return;
  }
  if (immune(game)) return;
  for (const [o, tile] of around) {
    const other = game.nations[o];
    if (other.troops < bot.troops * 0.5 && game.rng() < 0.5) {
      launchAttack(game, bot.id, tile, 0.05);
      return;
    }
  }
}

/** A tile deep in a player's land, for a City out of harm's way. */
function interiorTile(game: Game, id: number) {
  for (let tries = 0; tries < 400; tries += 1) {
    const t = Math.floor(game.rng() * game.owner.length);
    if (game.owner[t] !== id || game.building[t]) continue;
    if (!landNeighborNotOwnedBy(game, t, id) && !game.nations[id].border.has(t)) return t;
  }
  return -1;
}

/** Nations: expand while there's open land, then go after the weakest neighbor; build, fortify and sail. */
function thinkNation(game: Game, nation: Nation) {
  const difficulty = game.settings.difficulty;
  const cap = maxTroops(game, nation);
  const fill = nation.troops / cap;
  const threatened = game.attacks.some((attack) => attack.to === nation.id);

  if (nation.gold >= cityCost(nation.cities) && fill > 0.75) {
    const spot = interiorTile(game, nation.id);
    if (spot >= 0) build(game, nation.id, spot, "city");
  }
  if (threatened && nation.gold >= postCost(nation.posts.length) && nation.posts.length < 1 + nation.tiles / 5000) {
    const attacker = game.attacks.find((attack) => attack.to === nation.id)!.from;
    for (const b of nation.border) {
      if (game.building[b]) continue;
      if (neighbors(b, game.w, game.h).some((n) => game.owner[n] === attacker)) {
        build(game, nation.id, b, "post");
        break;
      }
    }
  }

  const threshold = { easy: 0.6, normal: 0.45, hard: 0.35 }[difficulty];
  if (fill < threshold || game.attacks.filter((attack) => attack.from === nation.id).length >= 3) return;

  const around = survey(game, nation, 40);
  const open = around.get(0);
  if (open !== undefined) {
    launchAttack(game, nation.id, open, { easy: 0.15, normal: 0.22, hard: 0.3 }[difficulty]);
    return;
  }
  if (immune(game)) return;
  // The weakest neighbor by troops per tile; Bots are easy pickings, and on Hard the player gets no slack.
  let target = -1;
  let tile = -1;
  let weakest = Infinity;
  for (const [o, t] of around) {
    if (o === 0) continue;
    const other = game.nations[o];
    const density = other.troops / Math.max(1, other.tiles) / (other.kind === "bot" ? 2 : 1);
    const winnable = other.troops < nation.troops * (difficulty === "hard" ? 1.1 : 0.8);
    if (winnable && density < weakest) {
      weakest = density;
      target = o;
      tile = t;
    }
  }
  if (target >= 0) {
    launchAttack(game, nation.id, tile, { easy: 0.2, normal: 0.28, hard: 0.35 }[difficulty]);
    return;
  }
  // Nothing to take by land: look across the water now and then.
  if (game.rng() < 0.15 && game.boats.every((boat) => boat.from !== nation.id)) {
    const destination = overseasTarget(game, nation);
    if (destination >= 0) launchAttack(game, nation.id, destination, 0.25);
  }
}

/** Some unclaimed or weaker land a short sail from this Nation's coast, or -1. */
function overseasTarget(game: Game, nation: Nation) {
  const { w } = game;
  for (let tries = 0; tries < 40; tries += 1) {
    const t = Math.floor(game.rng() * game.owner.length);
    if (game.terrain[t] === WATER) continue;
    const o = game.owner[t];
    if (o === nation.id || (o && game.nations[o].troops > nation.troops * 0.8)) continue;
    // Close enough: within 120 tiles of the Nation's center.
    const dx = (t % w) - nation.sx / Math.max(1, nation.tiles);
    const dy = ((t / w) | 0) - nation.sy / Math.max(1, nation.tiles);
    if (dx * dx + dy * dy > 120 * 120) continue;
    return t;
  }
  return -1;
}

/* ------------------------------------------------------------------------------------------- Score */

export const compactNumber = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}K` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;

/**
 * The record: a victory scores by difficulty, map, opponents and pace; a defeat scores the best share of the
 * land you held (so any victory beats any defeat).
 */
export function matchScore(game: Game) {
  const player = game.nations[1];
  if (game.outcome?.winner !== 1) return Math.round(player.peak * 1000);
  const { difficulty, map, bots, nations } = game.settings;
  const base = 2000 * { easy: 1, normal: 1.6, hard: 2.4 }[difficulty] * (map === "world" ? 1.4 : 1) * (0.7 + (bots / 400) * 0.5 + (nations ? 0.5 : 0));
  const pace = Math.max(0.5, 1.6 - game.time / 1800);
  return Math.round(base * pace);
}
