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
 * Pure simulation, no DOM. Nations and Bots act only through `launchAttack`, `retreat` and `build` (the calls the
 * player uses) and read only what every player can see: the map, buildings, each player's land and troops, the
 * attacks and boats on the map, and their own gold. Their decisions live in ./ai.ts.
 */

import { WORLD_H, WORLD_LAND, WORLD_NORTH, WORLD_W } from "./world-map";
import { WORLD_NATIONS } from "./nations";
import { think, thinkInterval } from "./ai";

export type MapKind = "world" | "continent";
export type Difficulty = "easy" | "normal" | "hard";
export type Kind = "human" | "nation" | "bot";
export type Building = "city" | "post";
export type Personality = "expansionist" | "defensive" | "opportunist" | "warlike";
export type Settings = { map: MapKind; bots: number; nations: boolean; difficulty: Difficulty };

export const MAPS: Record<MapKind, { label: string; hint: string }> = {
  world: { label: "World", hint: "Earth's real coastlines: oceans split the fronts and boats matter. Real countries play as Nations." },
  continent: { label: "Random continent", hint: "One freshly generated landmass: every rival is reachable by land, so borders close fast." },
};
export const BOT_COUNTS = [0, 100, 200, 400] as const;
/**
 * Difficulty changes how every rival (Bots and Nations) thinks: see AI_LEVELS in ./ai.ts. Nations, the strong
 * rivals, also get a smaller troop cap, slower growth and a smaller start below Hard; Bots' economy is fixed.
 */
export const DIFFICULTIES: Record<Difficulty, { label: string; hint: string; cap: number; growth: number; start: number }> = {
  easy: {
    label: "Easy",
    hint: "Rivals think every ~3 s, treat all land as open plains (so they walk into Defense Posts), keep extra troops idle, fight one war at a time, never retreat and rarely counterattack; only Nations fortify, and only once attacked. Nations also hold half your troop cap and grow 10% slower.",
    cap: 0.5,
    growth: 0.9,
    start: 12_500,
  },
  normal: {
    label: "Normal",
    hint: "Rivals think every ~2 s, read terrain and Defense Posts, size attacks to the target, Nations fortify when attacked (Defensive ones in advance), retreat from clearly lost fights and sometimes counterattack. Nations also hold 75% of your troop cap and grow 5% slower.",
    cap: 0.75,
    growth: 0.95,
    start: 18_750,
  },
  hard: {
    label: "Hard",
    hint: "Rivals react every ~1 s, size every attack precisely, fight on up to three fronts, fortify before they're attacked, often counterattack, Bots build a City (and a Post if Defensive), retreat as soon as a fight turns and look farther across the sea. Nations play with your full troop cap and growth.",
    cap: 1,
    growth: 1,
    start: 25_000,
  },
};
export const PERSONALITIES: Record<Personality, { label: string; hint: string }> = {
  expansionist: { label: "Expansionist", hint: "grabs land and builds Cities, fights only when it's cheap" },
  defensive: { label: "Defensive", hint: "keeps a big reserve, fortifies and strikes back at whoever attacks it" },
  opportunist: { label: "Opportunist", hint: "waits for a neighbor to get weak or busy elsewhere, then pounces" },
  warlike: { label: "Warlike", hint: "picks fights often, but still avoids walls and stronger armies" },
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
export const MAGNITUDE = [0, 80, 100, 120];
const TILE_COST = [0, 16.5, 20, 25];
/**
 * Our tiles are coarse (the world is ~240k land tiles), so each stands for this much ground at the genre's
 * usual scale: per-tile losses and slowness, and the land in the troop cap, are multiplied by it.
 */
export const AREA = 6;

export const CITY_TROOPS = 250_000;
export const POST_RADIUS = 30;
export const cityCost = (cities: number) => Math.min(1_000_000, 125_000 * 2 ** cities);
export const postCost = (posts: number) => Math.min(250_000, 50_000 * (posts + 1));

/** One stretch of a front (a coarse grid cell of it): its center and the direction it advances, in tiles. */
export type FrontCell = { x: number; y: number; n: number; dx: number; dy: number };

/** What a rival knows about its surroundings, rebuilt every few seconds (./ai.ts). */
export type Contact = { id: number; shared: number; tile: number; mx: number; my: number; terrain: number; fortified: number };
export type Intel = { at: number; contacts: Contact[] };

export type Nation = {
  id: number;
  name: string;
  color: string;
  kind: Kind;
  /** Rivals only: what drives their choices. */
  personality: Personality | null;
  troops: number;
  gold: number;
  tiles: number;
  /** The most land ever held, in tiles. */
  peakTiles: number;
  cities: number;
  citySpots: number[];
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
  /** Owned tiles on a coast, and owned tiles on a coast or the map's edge (an enclosed Bot has none). */
  coast: number;
  exposed: number;
  /** Something next to this player's land changed hands since the last annexation check. */
  touched: boolean;
  nextThink: number;
  /** Where a Nation wants to start (world map), or -1. */
  home: number;
  /** Rivals: what they're doing now, in a few words (shown when you hover their land). */
  plan: string;
  intel: Intel | null;
  /** The last player to attack this one, remembered for a while (attacks are public). */
  grudge: number;
  grudgeUntil: number;
  /** A defender this rival recently failed against, left alone for a while. */
  avoid: number;
  avoidUntil: number;
  navalAt: number;
  /** Land at the last loss check, when it was taken, and until when a heavy loss keeps this rival rebuilding. */
  lossCheckTiles: number;
  lossCheckAt: number;
  recoverUntil: number;
};

/** Why a rival started an attack, in words the player can act on. */
export type AttackReason = "expansion" | "weak-border" | "busy" | "retaliation" | "finish" | "counter" | "opportunity" | "overseas";

export type Attack = {
  id: number;
  from: number;
  /** 0 = unclaimed land. */
  to: number;
  troops: number;
  /** Target tiles on the shared border, bucketed by how many of the attacker's tiles touch them (1–4). */
  buckets: number[][];
  front: Set<number>;
  done: boolean;
  reason: AttackReason | null;
  /** Ticks: when it started and when it was last reinforced, clashed or reinforced by a landing (or -1000). */
  started: number;
  reinforcedAt: number;
  reinforcedBy: number;
  clashAt: number;
  landedAt: number;
  landing: number;
  /** Totals: troops sent, tiles taken, attacking troops lost and defending troops killed. */
  sent: number;
  gained: number;
  spent: number;
  killed: number;
  /** Tiles taken and troops lost per second (smoothed), and this second's running counts. */
  rate: number;
  burn: number;
  windowGain: number;
  windowSpent: number;
  /** Running out of troops against a defender: about to stop. */
  stalling: boolean;
  /** The defender (a rival) has decided whether to meet this attack head-on. */
  judged: boolean;
  /** The front: its stretches (largest first), the main one's center and advance direction, and its size. */
  cells: FrontCell[];
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  frontSize: number;
  /** The defender's buildings near the front, and the ones already reported. */
  near: number[];
  warned: Set<number>;
  /** The last captured tiles and when (a ring buffer), for capture flashes. */
  trail: Int32Array;
  trailTick: Int32Array;
  trailHead: number;
};

export type EndReason = "complete" | "spent" | "retreat" | "clash" | "gone";
/** An attack that just ended, kept for a couple of seconds so its end can be shown where it happened. */
export type EndedAttack = { id: number; from: number; to: number; x: number; y: number; dx: number; dy: number; reason: EndReason; tick: number; troops: number; gained: number; eliminated: boolean };

export type Boat = { id: number; from: number; to: number; troops: number; path: number[]; index: number; landing: number; reason: AttackReason | null };

export type GameEvent =
  | { kind: "eliminated"; nation: number; by: number }
  | { kind: "annexed"; nation: number; by: number }
  | { kind: "landed"; boat: number; from: number; to: number; tile: number; troops: number }
  | { kind: "sailing"; from: number; to: number; troops: number; tile: number }
  | { kind: "captured-building"; from: number; to: number; building: Building; tile: number }
  | { kind: "attack"; attack: number; from: number; to: number; troops: number; reason: AttackReason | null; tile: number }
  | { kind: "ended"; attack: number; from: number; to: number; reason: EndReason; troops: number; gained: number; tile: number }
  | { kind: "stalling"; attack: number; from: number; to: number; troops: number; tile: number }
  | { kind: "threatened"; attack: number; from: number; to: number; building: Building; tile: number }
  | { kind: "clash"; a: number; b: number; troops: number; tile: number };

export type Outcome = { winner: number | null; reason: "share" | "conquered" };

export type Game = {
  w: number;
  h: number;
  settings: Settings;
  terrain: Uint8Array;
  /** Per tile: 1 = touches water, 2 = on the map's edge. */
  flags: Uint8Array;
  owner: Uint16Array;
  /** 0 none, 1 city, 2 defense post. */
  building: Uint8Array;
  landTiles: number;
  nations: Nation[];
  attacks: Attack[];
  ended: EndedAttack[];
  boats: Boat[];
  /** Refreshed every tick: troops each player has out in attacks and boats, and attacks aimed at each player. */
  committed: Float64Array;
  targeted: Uint16Array;
  /** The last tick a rival planned a boat route (at most one long route search per tick). */
  navalTick: number;
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

function newNation(id: number, name: string, kind: Kind, color: string, troops: number, home = -1, personality: Personality | null = null): Nation {
  return {
    id,
    name,
    color,
    kind,
    personality,
    troops,
    gold: 0,
    tiles: 0,
    peakTiles: 0,
    cities: 0,
    citySpots: [],
    posts: [],
    alive: true,
    spawned: false,
    peak: 0,
    sx: 0,
    sy: 0,
    border: new Set(),
    coast: 0,
    exposed: 0,
    touched: true,
    nextThink: 0,
    home,
    plan: "",
    intel: null,
    grudge: 0,
    grudgeUntil: 0,
    avoid: 0,
    avoidUntil: 0,
    navalAt: 0,
    lossCheckTiles: 0,
    lossCheckAt: 0,
    recoverUntil: 0,
  };
}

/** A personality by weight: Nations lean bigger and bolder, Bots lean toward growing and holding. */
function pickPersonality(rng: () => number, kind: Kind): Personality {
  const weights: [Personality, number][] =
    kind === "nation"
      ? [
          ["expansionist", 0.3],
          ["defensive", 0.25],
          ["opportunist", 0.25],
          ["warlike", 0.2],
        ]
      : [
          ["expansionist", 0.4],
          ["defensive", 0.3],
          ["opportunist", 0.24],
          ["warlike", 0.06],
        ];
  let roll = rng();
  for (const [personality, weight] of weights) {
    roll -= weight;
    if (roll < 0) return personality;
  }
  return "expansionist";
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
  const flags = new Uint8Array(w * h);
  for (let t = 0; t < w * h; t += 1) {
    if (!terrain[t]) continue;
    landTiles += 1;
    const x = t % w;
    if (x === 0 || x === w - 1 || t < w || t >= w * (h - 1)) flags[t] |= 2;
    for (const n of neighbors(t, w, h)) if (terrain[n] === WATER) flags[t] |= 1;
  }

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
      nations.push(newNation(nations.length, entry.name, "nation", hsl(hue, 62, 52), difficulty.start, entry.home, pickPersonality(rng, "nation")));
    });
  }
  for (let i = 0; i < settings.bots; i += 1) {
    const hue = (i * 97.3 + 200) % 360;
    nations.push(newNation(nations.length, botName(rng), "bot", hsl(hue, 22 + rng() * 14, 40 + rng() * 14), 10_000, -1, pickPersonality(rng, "bot")));
  }

  const game: Game = {
    w,
    h,
    settings,
    terrain,
    flags,
    owner: new Uint16Array(w * h),
    building: new Uint8Array(w * h),
    landTiles,
    nations,
    attacks: [],
    ended: [],
    boats: [],
    committed: new Float64Array(nations.length),
    targeted: new Uint16Array(nations.length),
    navalTick: -1,
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
  nation.nextThink = 0.5 + game.rng() * 2;
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
export function troopGrowth(game: Game, nation: Nation, cap = maxTroops(game, nation)) {
  const raw = (10 + Math.pow(Math.max(0, nation.troops), 0.73) / 4) * (1 - nation.troops / cap);
  const multiplier = nation.kind === "bot" ? 0.5 : nation.kind === "nation" ? DIFFICULTIES[game.settings.difficulty].growth : 1;
  return Math.max(0, raw * multiplier);
}

export const goldPerTick = (nation: Nation) => (nation.kind === "bot" ? 50 : 100);
export const share = (game: Game, nation: Nation) => nation.tiles / game.landTiles;
export const troopsAttacking = (game: Game, id: number) =>
  game.attacks.reduce((sum, attack) => (attack.from === id ? sum + attack.troops : sum), 0) + game.boats.reduce((sum, boat) => (boat.from === id ? sum + boat.troops : sum), 0);
export const immune = (game: Game) => game.phase === "spawn" || game.tick < game.immuneUntil;

/**
 * Troops an attack loses per tile it takes from a player (the public rule every player can work out from what's
 * on the map): terrain, Defense Posts, the defender's troops against the attack's and their troops per tile.
 */
export function lossPerTile(attacker: Nation, defender: Nation, attackTroops: number, terrain: number, fortified: boolean) {
  const ratio = defender.troops / Math.max(1, attackTroops);
  const density = defender.troops / Math.max(1, defender.tiles);
  return MAGNITUDE[terrain] * AREA * (fortified ? 5 : 1) * clamp(ratio, 0.6, 2) * (0.463 + (0.0039 * density) / AREA) * (defender.kind === "bot" && attacker.kind !== "bot" ? 0.7 : 1);
}

/** Troops lost per tile of unclaimed land. */
export const expansionLoss = (attacker: Nation, terrain: number) => (MAGNITUDE[terrain] / (attacker.kind === "bot" ? 10 : 5)) * AREA;

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
  const flag = game.flags[t];
  game.owner[t] = id;
  if (before) {
    const loser = nations[before];
    loser.tiles -= 1;
    loser.sx -= x;
    loser.sy -= y;
    loser.coast -= flag & 1;
    if (flag) loser.exposed -= 1;
    loser.touched = true;
    loser.border.delete(t);
    if (game.building[t] === 1) {
      loser.cities -= 1;
      loser.citySpots = loser.citySpots.filter((spot) => spot !== t);
    }
    if (game.building[t] === 2) loser.posts = loser.posts.filter((post) => post !== t);
    for (const n of neighbors(t, w, game.h)) if (game.owner[n] === before) loser.border.add(n);
  }
  if (id) {
    const gainer = nations[id];
    gainer.tiles += 1;
    if (gainer.tiles > gainer.peakTiles) gainer.peakTiles = gainer.tiles;
    gainer.sx += x;
    gainer.sy += y;
    gainer.coast += flag & 1;
    if (flag) gainer.exposed += 1;
    gainer.touched = true;
    if (game.building[t] === 1) {
      gainer.cities += 1;
      gainer.citySpots.push(t);
    }
    if (game.building[t] === 2) gainer.posts.push(t);
    if (before && game.building[t]) game.events.push({ kind: "captured-building", from: before, to: id, building: game.building[t] === 1 ? "city" : "post", tile: t });
    if (landNeighborNotOwnedBy(game, t, id)) gainer.border.add(t);
    for (const n of neighbors(t, w, game.h)) if (game.owner[n] === id && !landNeighborNotOwnedBy(game, n, id)) gainer.border.delete(n);
  } else if (game.building[t]) {
    game.building[t] = 0;
  }
  // Whoever owns the land around this tile may now be enclosed (see annexSurrounded).
  for (const n of neighbors(t, w, game.h)) {
    const o = game.owner[n];
    if (o) nations[o].touched = true;
  }
  game.dirty.push(t);
}

/** Whether a tile lies within reach of one of its owner's Defense Posts. */
export function defended(game: Game, t: number) {
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

const TRAIL = 24;

function newAttack(game: Game, from: number, to: number, troops: number, reason: AttackReason | null, landing = -1): Attack {
  const attack: Attack = {
    id: game.nextId++,
    from,
    to,
    troops,
    buckets: [[], [], [], [], []],
    front: new Set(),
    done: false,
    reason,
    started: game.tick,
    reinforcedAt: -1000,
    reinforcedBy: 0,
    clashAt: -1000,
    landedAt: landing >= 0 ? game.tick : -1000,
    landing,
    sent: troops,
    gained: 0,
    spent: 0,
    killed: 0,
    rate: 0,
    burn: 0,
    windowGain: 0,
    windowSpent: 0,
    stalling: false,
    judged: false,
    cells: [],
    ax: -1,
    ay: -1,
    dx: 0,
    dy: 0,
    frontSize: 0,
    near: [],
    warned: new Set(),
    trail: new Int32Array(TRAIL).fill(-1),
    trailTick: new Int32Array(TRAIL),
    trailHead: 0,
  };
  game.attacks.push(attack);
  if (to) {
    // Attacks are public: the defender remembers who hit it.
    const defender = game.nations[to];
    defender.grudge = from;
    defender.grudgeUntil = game.time + 45;
  }
  return attack;
}

/** A newly started attack: map its front now (so it shows at once) and report it if it involves the player. */
function announce(game: Game, attack: Attack) {
  surveyFront(game, attack);
  if (attack.from === 1 || attack.to === 1) {
    game.events.push({ kind: "attack", attack: attack.id, from: attack.from, to: attack.to, troops: attack.troops, reason: attack.reason, tile: anchorTile(game, attack) });
  }
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

/** Rivals' extras: why they attack (for the player's log), land only, and how far a boat route may be searched. */
export type LaunchOptions = { reason?: AttackReason; landOnly?: boolean; searchLimit?: number };

/**
 * Send `ratio` of a player's troops at whoever owns `target` (or at unclaimed land). Bordering land: the attack
 * takes your whole shared border. Across water: a boat sails to the nearest shore and attacks from there.
 */
export function launchAttack(game: Game, from: number, target: number, ratio: number, options: LaunchOptions = {}): ActionResult {
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
  const reason = options.reason ?? null;

  if (!touches(game, from, to)) {
    if (options.landOnly) return { ok: false, message: `You don't border ${name}.` };
    return sendBoat(game, from, target, troops, reason, options.searchLimit);
  }

  attacker.troops -= troops;
  let force = troops;
  // Attacks between the same two players meet and cancel out.
  const opposing = to ? game.attacks.find((attack) => attack.from === to && attack.to === from) : undefined;
  if (opposing) {
    const clash = Math.min(opposing.troops, force);
    opposing.troops -= clash;
    opposing.clashAt = game.tick;
    force -= clash;
    if (from === 1 || to === 1) game.events.push({ kind: "clash", a: from, b: to, troops: clash, tile: anchorTile(game, opposing) });
    if (opposing.troops <= 0) endAttack(game, opposing, 0, "clash");
    if (force <= 0) {
      if (opposing.done) return { ok: true, message: `Your troops met ${name}'s attack and stopped it.` };
      return { ok: true, message: `Your troops met ${name}'s attack: ${compactNumber(opposing.troops)} of theirs are still coming.` };
    }
  }
  const existing = game.attacks.find((attack) => attack.from === from && attack.to === to);
  if (existing) {
    existing.troops += force;
    existing.sent += force;
    existing.reinforcedAt = game.tick;
    existing.reinforcedBy = force;
    existing.stalling = false;
    if (opposing) existing.clashAt = game.tick;
    seedFront(game, existing);
    surveyFront(game, existing);
    return { ok: true, message: `Reinforced: ${compactNumber(force)} more troops against ${name}.` };
  }
  const attack = newAttack(game, from, to, force, reason);
  if (opposing) attack.clashAt = game.tick;
  seedFront(game, attack);
  announce(game, attack);
  return { ok: true, message: to ? `Attacking ${name} with ${compactNumber(force)} troops.` : `Expanding with ${compactNumber(force)} troops.` };
}

export function retreat(game: Game, attackId: number, from: number): ActionResult {
  const attack = game.attacks.find((entry) => entry.id === attackId && entry.from === from);
  if (!attack) return { ok: false, message: "That attack has already ended." };
  const returned = Math.floor(attack.troops * (1 - RETREAT_COST));
  endAttack(game, attack, returned, "retreat");
  return { ok: true, message: `Retreated: ${compactNumber(returned)} troops came home (25% were lost).` };
}

function endAttack(game: Game, attack: Attack, returned: number, reason: EndReason, eliminated = false) {
  if (attack.done) return;
  attack.done = true;
  game.attacks = game.attacks.filter((entry) => entry !== attack);
  const nation = game.nations[attack.from];
  if (nation.alive && returned > 0) nation.troops += returned;
  // A rival that ran dry against a defender leaves it alone for a while instead of throwing more at it.
  if (reason === "spent" && attack.to && nation.kind !== "human") {
    nation.avoid = attack.to;
    nation.avoidUntil = game.time + 20;
  }
  if (reason === "gone") return;
  if (attack.ax >= 0) {
    game.ended.push({ id: attack.id, from: attack.from, to: attack.to, x: attack.ax, y: attack.ay, dx: attack.dx, dy: attack.dy, reason, tick: game.tick, troops: attack.troops, gained: attack.gained, eliminated });
    if (game.ended.length > 120) game.ended.splice(0, game.ended.length - 120);
  }
  if (attack.from === 1 || attack.to === 1) {
    game.events.push({ kind: "ended", attack: attack.id, from: attack.from, to: attack.to, reason, troops: attack.troops, gained: attack.gained, tile: anchorTile(game, attack) });
  }
}

/** The tile under an attack's main front (or -1 before it has one). */
export function anchorTile(game: Game, attack: Attack) {
  if (attack.ax < 0) return -1;
  return clamp(Math.floor(attack.ay), 0, game.h - 1) * game.w + clamp(Math.floor(attack.ax), 0, game.w - 1);
}

/** One tick of an attack: take tiles until this tick's time is used up or the troops run out. */
function advanceAttack(game: Game, attack: Attack) {
  const attacker = game.nations[attack.from];
  const defender = attack.to ? game.nations[attack.to] : null;
  let time = 1;
  for (let guard = 0; guard < 5000 && time > 0; guard += 1) {
    const t = takeFront(game, attack);
    if (t < 0) {
      endAttack(game, attack, attack.troops, "complete");
      return;
    }
    const terrain = game.terrain[t];
    const border = Math.max(1, attack.front.size + 1);
    let loss: number;
    let cost: number;
    let defenderLoss = 0;
    if (!defender) {
      loss = expansionLoss(attacker, terrain);
      cost = (clamp((2000 * TILE_COST[terrain] * AREA) / Math.max(1, attack.troops), 5, 100) / (2 * border)) * AREA;
    } else {
      const fortified = defended(game, t);
      const ratio = defender.troops / Math.max(1, attack.troops);
      // Troops per tile at the genre's scale (each of our tiles is AREA of theirs); the defender loses ours.
      const density = defender.troops / Math.max(1, defender.tiles);
      loss = lossPerTile(attacker, defender, attack.troops, terrain, fortified);
      cost = (((clamp(ratio, 0.82, 7.5) * clamp(ratio / 20, 1, 50)) / 8.55) * TILE_COST[terrain] * (fortified ? 3 : 1) * AREA) / border;
      defenderLoss = density;
    }
    if (attack.troops < loss) {
      // Spent: the last troops fall at the border.
      attack.spent += attack.troops;
      attack.windowSpent += attack.troops;
      endAttack(game, attack, 0, "spent");
      return;
    }
    attack.troops -= loss;
    attack.spent += loss;
    attack.windowSpent += loss;
    attack.gained += 1;
    attack.windowGain += 1;
    attack.trail[attack.trailHead] = t;
    attack.trailTick[attack.trailHead] = game.tick;
    attack.trailHead = (attack.trailHead + 1) % TRAIL;
    if (defender) {
      const killed = Math.min(defender.troops, defenderLoss);
      defender.troops -= killed;
      attack.killed += killed;
    }
    setOwner(game, t, attack.from);
    for (const n of neighbors(t, game.w, game.h)) if (game.owner[n] === attack.to && game.terrain[n] !== WATER) addFront(game, attack, n);
    time -= cost;
    if (defender && defender.tiles === 0) {
      eliminate(game, defender, attack.from);
      return;
    }
  }
}

const CELL = 12;

/**
 * Where an attack is fighting: its front tiles grouped into coarse cells, each with the direction the attacker
 * pushes from (its own neighbors). The main cell anchors the troop count; it stays put unless the front moves on.
 */
function surveyFront(game: Game, attack: Attack) {
  const { w, h, owner } = game;
  const cells = new Map<number, FrontCell>();
  let count = 0;
  for (const t of attack.front) {
    if (owner[t] !== attack.to) continue;
    const x = t % w;
    const y = (t / w) | 0;
    let dx = 0;
    let dy = 0;
    let own = 0;
    if (x > 0 && owner[t - 1] === attack.from) {
      dx += 1;
      own += 1;
    }
    if (x < w - 1 && owner[t + 1] === attack.from) {
      dx -= 1;
      own += 1;
    }
    if (t >= w && owner[t - w] === attack.from) {
      dy += 1;
      own += 1;
    }
    if (t < w * (h - 1) && owner[t + w] === attack.from) {
      dy -= 1;
      own += 1;
    }
    if (!own) continue;
    const key = ((y / CELL) | 0) * 4096 + ((x / CELL) | 0);
    let cell = cells.get(key);
    if (!cell) {
      cell = { x: 0, y: 0, n: 0, dx: 0, dy: 0 };
      cells.set(key, cell);
    }
    cell.x += x;
    cell.y += y;
    cell.n += 1;
    cell.dx += dx;
    cell.dy += dy;
    count += 1;
  }
  attack.frontSize = count;
  if (!count) return;
  const list = [...cells.values()];
  let biggest = 0;
  for (const cell of list) {
    cell.x = cell.x / cell.n + 0.5;
    cell.y = cell.y / cell.n + 0.5;
    const length = Math.hypot(cell.dx, cell.dy);
    if (length > 0) {
      cell.dx /= length;
      cell.dy /= length;
    }
    if (cell.n > biggest) biggest = cell.n;
  }
  list.sort((a, b) => b.n - a.n);
  attack.cells = list.slice(0, 16);
  // The anchor: the big stretch nearest the last one, so the troop count doesn't hop along a long front.
  let main = list[0];
  if (attack.ax >= 0) {
    let best = Infinity;
    for (const cell of list) {
      if (cell.n < biggest * 0.5) break;
      const d = (cell.x - attack.ax) ** 2 + (cell.y - attack.ay) ** 2;
      if (d < best) {
        best = d;
        main = cell;
      }
    }
  }
  attack.ax = main.x;
  attack.ay = main.y;
  if (main.dx || main.dy) {
    attack.dx = main.dx;
    attack.dy = main.dy;
  }
  // The defender's buildings within reach of the front: threatened (reported once each to the player).
  attack.near = [];
  if (attack.to) {
    const defender = game.nations[attack.to];
    for (const spot of [...defender.citySpots, ...defender.posts]) {
      const sx = (spot % w) + 0.5;
      const sy = ((spot / w) | 0) + 0.5;
      for (const cell of attack.cells) {
        if ((cell.x - sx) ** 2 + (cell.y - sy) ** 2 > 14 * 14) continue;
        attack.near.push(spot);
        if (attack.to === 1 && !attack.warned.has(spot)) {
          attack.warned.add(spot);
          game.events.push({ kind: "threatened", attack: attack.id, from: attack.from, to: attack.to, building: game.building[spot] === 1 ? "city" : "post", tile: spot });
        }
        break;
      }
    }
  }
}

/** Once a second per attack: smooth its pace and losses, and tell whether it's about to run dry. */
function measureAttack(game: Game, attack: Attack) {
  attack.rate = attack.rate * 0.5 + attack.windowGain * 0.5;
  attack.burn = attack.burn * 0.5 + attack.windowSpent * 0.5;
  attack.windowGain = 0;
  attack.windowSpent = 0;
  const age = game.tick - attack.started;
  const was = attack.stalling;
  attack.stalling = attack.to !== 0 && age >= 20 && game.tick - attack.reinforcedAt >= 20 && attack.burn > 0 && attack.troops / attack.burn < 3;
  if (attack.stalling && !was && (attack.from === 1 || attack.to === 1)) {
    game.events.push({ kind: "stalling", attack: attack.id, from: attack.from, to: attack.to, troops: attack.troops, tile: anchorTile(game, attack) });
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
    if (attack.from === nation.id) endAttack(game, attack, 0, "gone");
    else if (attack.to === nation.id) endAttack(game, attack, attack.troops, "complete", true);
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
        if (game.flags[t] & 1) return t;
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

function sendBoat(game: Game, from: number, target: number, troops: number, reason: AttackReason | null, searchLimit?: number): ActionResult {
  const attacker = game.nations[from];
  const to = game.owner[target];
  const name = to ? game.nations[to].name : "unclaimed land";
  if (game.boats.filter((boat) => boat.from === from).length >= MAX_BOATS) return { ok: false, message: `You already have ${MAX_BOATS} boats at sea.` };
  const landing = landingNear(game, target);
  if (landing < 0) return { ok: false, message: `You don't border ${name}, and there's no coast near there to land on.` };
  const path = boatRoute(game, from, landing, searchLimit);
  if (!path) return { ok: false, message: `You don't border ${name}, and no boat route reaches it from your coast.` };
  attacker.troops -= troops;
  game.boats.push({ id: game.nextId++, from, to, troops, path, index: 0, landing, reason });
  if (from === 1 || to === 1) game.events.push({ kind: "sailing", from, to, troops, tile: landing });
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
  game.events.push({ kind: "landed", boat: boat.id, from: boat.from, to, tile: boat.landing, troops: boat.troops });
  const existing = game.attacks.find((attack) => attack.from === boat.from && attack.to === to);
  const attack = existing ?? newAttack(game, boat.from, to, 0, boat.reason, boat.landing);
  attack.troops += boat.troops;
  attack.sent += boat.troops;
  attack.landedAt = game.tick;
  attack.landing = boat.landing;
  attack.stalling = false;
  for (const n of neighbors(boat.landing, game.w, game.h)) if (game.owner[n] === to && game.terrain[n] !== WATER) addFront(game, attack, n);
  if (existing) surveyFront(game, attack);
  else announce(game, attack);
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
  if (kind === "city") {
    nation.cities += 1;
    nation.citySpots.push(t);
  } else nation.posts.push(t);
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
    const cap = maxTroops(game, nation);
    nation.troops = Math.min(cap, nation.troops + troopGrowth(game, nation, cap));
    nation.gold += goldPerTick(nation);
  }

  for (const attack of game.attacks.slice()) if (!attack.done) advanceAttack(game, attack);
  // Staggered bookkeeping: each attack measures its pace once a second and remaps its front twice a second.
  for (const attack of game.attacks) {
    if ((attack.id + game.tick) % 10 === 0) measureAttack(game, attack);
    if ((attack.id + game.tick) % 5 === 0) surveyFront(game, attack);
  }
  for (const boat of game.boats.slice()) advanceBoat(game, boat);

  // What every rival can see this tick: troops out in the field, and how many attacks each player is under.
  game.committed.fill(0);
  game.targeted.fill(0);
  for (const attack of game.attacks) {
    game.committed[attack.from] += attack.troops;
    if (attack.to) game.targeted[attack.to] += 1;
  }
  for (const boat of game.boats) {
    game.committed[boat.from] += boat.troops;
    const to = game.owner[boat.landing];
    if (to) game.targeted[to] += 1;
  }

  // Rivals think on their own staggered schedules (difficulty sets the pace), never all on one tick.
  for (const nation of game.nations) {
    if (!nation.alive || nation.kind === "human" || game.time < nation.nextThink) continue;
    nation.nextThink = game.time + thinkInterval(game);
    think(game, nation);
  }

  if (game.tick % 10 === 0) annexSurrounded(game);
  if (game.ended.length && game.tick - game.ended[0].tick > 40) game.ended = game.ended.filter((entry) => game.tick - entry.tick <= 40);
  checkOutcome(game);
}

/**
 * A Bot whose land touches only one other player (no coast, no map edge, no unclaimed land) joins that player.
 * Only Bots whose surroundings changed since the last check are looked at, and the coast and edge are counted as
 * tiles change hands, so an unchanged Bot costs nothing.
 */
function annexSurrounded(game: Game) {
  for (const bot of game.nations) {
    if (!bot.alive || bot.kind !== "bot" || !bot.touched) continue;
    bot.touched = false;
    if (bot.tiles > 4000 || bot.exposed > 0) continue;
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
    // Every patch of the Bot's land is walled in by the same player: it all goes to them.
    const tiles: number[] = [];
    const seen = new Set<number>();
    for (const start of bot.border) {
      if (seen.has(start)) continue;
      seen.add(start);
      tiles.push(start);
      for (let i = tiles.length - 1; i < tiles.length; i += 1) {
        for (const n of neighbors(tiles[i], game.w, game.h)) {
          if (game.owner[n] === bot.id && !seen.has(n)) {
            seen.add(n);
            tiles.push(n);
          }
        }
      }
    }
    if (tiles.length !== bot.tiles) continue;
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

/** A tile deep in a player's land (near its middle), for a City out of harm's way, or -1. */
export function interiorTile(game: Game, id: number) {
  const nation = game.nations[id];
  if (!nation.tiles) return -1;
  const { w, h } = game;
  const cx = Math.round(nation.sx / nation.tiles);
  const cy = Math.round(nation.sy / nation.tiles);
  for (let r = 0; r <= 16; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || (dx + dy) % 3) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const t = y * w + x;
        if (game.owner[t] === id && !game.building[t] && !nation.border.has(t)) return t;
      }
    }
  }
  for (let tries = 0; tries < 200; tries += 1) {
    const t = Math.floor(game.rng() * game.owner.length);
    if (game.owner[t] === id && !game.building[t] && !nation.border.has(t)) return t;
  }
  return -1;
}

/** The state an attack is in right now, as the map and the panel show it. */
export type FrontState = "landing" | "clash" | "stalling" | "reinforced" | "starting" | "advancing";
export function attackState(game: Game, attack: Attack): FrontState {
  if (game.tick - attack.landedAt < 15) return "landing";
  if (game.tick - attack.clashAt < 15) return "clash";
  if (attack.stalling) return "stalling";
  if (game.tick - attack.reinforcedAt < 12) return "reinforced";
  if (game.tick - attack.started < 10) return "starting";
  return "advancing";
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
