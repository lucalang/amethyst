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
export type Building = "city" | "post" | "port" | "factory" | "silo" | "sam";
export type Weapon = "atom" | "hydrogen" | "mirv";
/** How each building is stored in `Game.building` (0 = none). */
export const BUILDING_CODE: Record<Building, number> = { city: 1, post: 2, port: 3, factory: 4, silo: 5, sam: 6 };
export const BUILDING_AT: readonly (Building | null)[] = [null, "city", "post", "port", "factory", "silo", "sam"];
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

/*
 * The arsenal. Prices follow the public FrontWars/OpenFront guides where they agree (Port, Missile Silo, Atom Bomb,
 * SAM Launcher, Warship); the Hydrogen Bomb and MIRV are scaled down to this game's smaller economy, and every range
 * is fitted to these maps. Ranges and times are in tiles and ticks.
 */
/** Seconds between a Port's trade ships. */
export const TRADE_TICKS = 250;
/** How far a Factory's railroads reach to your Cities, Ports and other Factories. */
export const RAIL_RANGE = 60;
/** Gold per tick from each Factory, and from each rail link it runs. */
export const FACTORY_GOLD = 40;
export const RAIL_GOLD = 20;
export const SILO_RELOAD = 100;
export const SAM_RANGE = 46;
export const SAM_RELOAD = 75;
export const WARSHIP_RANGE = 20;
export const WARSHIP_HP = 1000;
export const WARSHIP_DAMAGE = 250;
const WARSHIP_SPEED = 0.8;
const TRADE_SPEED = 1.4;
export const FALLOUT_TICKS = 600;
/** New buildings need a moment before they work (Silos and SAMs arm, Ports load their first ship). */
const ARMING_TICKS = 50;

export const WEAPONS: Record<Weapon, { label: string; cost: number; inner: number; outer: number; speed: number; intercept: number }> = {
  atom: { label: "Atom Bomb", cost: 750_000, inner: 8, outer: 16, speed: 3, intercept: 0.75 },
  hydrogen: { label: "Hydrogen Bomb", cost: 2_500_000, inner: 22, outer: 36, speed: 2.5, intercept: 0.5 },
  mirv: { label: "MIRV", cost: 10_000_000, inner: 5, outer: 8, speed: 2, intercept: 0 },
};

/** What the next building (or Warship) of a kind costs this player. */
export function buildingCost(nation: Nation, kind: Building | "warship") {
  switch (kind) {
    case "city":
      return cityCost(nation.cities);
    case "post":
      return postCost(nation.posts.length);
    case "port":
      return Math.min(1_000_000, 125_000 * 2 ** nation.ports.length);
    case "factory":
      return Math.min(1_000_000, 125_000 * 2 ** nation.factories.length);
    case "silo":
      return 1_000_000;
    case "sam":
      return Math.min(3_000_000, 1_500_000 * 2 ** nation.sams.length);
    case "warship":
      return Math.min(1_000_000, 250_000 * 2 ** nation.warships);
  }
}

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
  /** Rivals' pacing: no new war before `frontAt`; after a costly failure, none before `failUntil`. */
  frontAt: number;
  failUntil: number;
  /** Buildings beyond Cities and Defense Posts, by tile. */
  ports: number[];
  factories: number[];
  silos: number[];
  sams: number[];
  warships: number;
  /** Railroads as pairs of station tiles (a Factory and a City, Port or Factory). */
  rails: number[];
  railsDirty: boolean;
  /** Trade gold this second, and a smoothed rate per second. */
  tradeEarned: number;
  tradeRate: number;
  /** Rivals: no new bomb before this (seconds); when this player was last hit by one. */
  nukeAt: number;
  nukedAt: number;
  /** Rivals: no arsenal building before this (seconds). */
  buildAt: number;
  /** The last attempt on each target: when, and how our troops compared with theirs (to retry only if better). */
  tries: Map<number, { at: number; edge: number }>;
};

/** Why a rival started an attack, in words the player can act on. */
export type AttackReason = "expansion" | "weak-border" | "busy" | "retaliation" | "finish" | "counter" | "opportunity" | "overseas";

export type Attack = {
  id: number;
  from: number;
  /** 0 = unclaimed land. */
  to: number;
  troops: number;
  /** Target tiles on the front, as a priority queue (lowest first): see `priority`. */
  heapT: number[];
  heapP: number[];
  front: Set<number>;
  /** Where the attack is aimed (tiles: the clicked stretch, later reinforcements, a landing) and how wide it reaches. */
  foci: number[];
  reach: number;
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

/** A bomb in flight from a Silo (or one of a MIRV's warheads, which fly from where it split). */
export type Nuke = { id: number; from: number; weapon: Weapon; x0: number; y0: number; x1: number; y1: number; target: number; to: number; launched: number; flight: number; warhead: boolean; parent: number; tried: number[] };
export type Warship = { id: number; owner: number; at: number; hp: number; patrol: number; path: number[]; step: number; move: number; target: number; targetKind: "" | "boat" | "ship" | "trade"; fireAt: number; idleAt: number };
export type Trader = { id: number; owner: number; from: number; to: number; path: number[]; index: number; gold: number };
/** Short-lived things to draw: a Warship's shell, a SAM's interceptor, a blast, a sinking, a seized cargo. */
export type Effect = { id: number; kind: "shell" | "intercept" | "miss" | "blast" | "sunk" | "seized"; tick: number; x0: number; y0: number; x1: number; y1: number; owner: number; weapon?: Weapon; value?: number };

export type GameEvent =
  | { kind: "built"; nation: number; building: Building; tile: number }
  | { kind: "launched"; nuke: number; from: number; to: number; weapon: Weapon; tile: number; eta: number }
  | { kind: "intercepted"; nuke: number; from: number; by: number; to: number; weapon: Weapon; tile: number }
  | { kind: "detonated"; nuke: number; parent: number; from: number; weapon: Weapon; tile: number; hit: number[]; playerLost: number; buildings: number }
  | { kind: "sunk"; ship: "warship" | "boat"; owner: number; by: number; tile: number; troops: number }
  | { kind: "seized"; by: number; from: number; gold: number; tile: number }
  | { kind: "eliminated"; nation: number; by: number; gold: number; tiles: number }
  | { kind: "annexed"; nation: number; by: number }
  | { kind: "landed"; boat: number; from: number; to: number; tile: number; troops: number }
  | { kind: "sailing"; from: number; to: number; troops: number; tile: number }
  | { kind: "captured-building"; from: number; to: number; building: Building; tile: number }
  | { kind: "attack"; attack: number; from: number; to: number; troops: number; reason: AttackReason | null; tile: number }
  | { kind: "ended"; attack: number; from: number; to: number; reason: EndReason; troops: number; gained: number; tile: number }
  | { kind: "stalling"; attack: number; from: number; to: number; troops: number; tile: number }
  | { kind: "threatened"; attack: number; from: number; to: number; building: Building; tile: number }
  | { kind: "clash"; a: number; b: number; troops: number; tile: number };

/** "share": the winner held WIN_SHARE; "conquered": the player's last land fell; "total": the player took every tile after choosing to play on. */
export type Outcome = { winner: number | null; reason: "share" | "conquered" | "total" };

/**
 * A whole player conquered: one per elimination by attack (annexations of surrounded Bots are quieter). `tiles`
 * is the land the conqueror took from it recently, nearest the last pocket first, so the ownership wave can
 * sweep the real territory outward from where it fell.
 */
export type Conquest = { id: number; nation: number; by: number; name: string; kind: Kind; tick: number; x: number; y: number; cx: number; cy: number; tiles: Int32Array; final: Int32Array; size: number };

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
  /** A fixed, smooth noise per tile (0–1) that makes fronts advance in irregular, natural shapes. */
  grain: Float32Array;
  /** Who held each tile before its last capture, and when (ticks), for the conquest sequence. */
  formerOwner: Uint16Array;
  takenAt: Int32Array;
  /** Recently completed conquests of whole players, shown for a few seconds. */
  conquests: Conquest[];
  /** Tick until which a tile is irradiated (nuked land: slow and costly to take back). */
  fallout: Int32Array;
  falloutZones: { until: number; tiles: number[] }[];
  /** Per building tile: when a Silo or SAM can fire again, or a Port sends its next trade ship. */
  readyAt: Int32Array;
  nukes: Nuke[];
  ships: Warship[];
  traders: Trader[];
  effects: Effect[];
  /** Pairs of players at war right now (attacking either way, or a fresh grudge): `a * 65536 + b`, both ways. */
  wars: Set<number>;
  /** Sea routes between Ports, found once (an empty route: none). */
  paths: Map<string, number[]>;
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
  /** The player won at WIN_SHARE and chose to play on toward the whole map (see `continueAfterWin`). */
  continued: boolean;
  /** When the player's win happened (game.time), so playing on never lowers the pace part of the score. */
  wonAt: number;
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

/** Two octaves of smooth noise, so captures bulge and curve instead of growing in squares. */
function makeGrain(w: number, h: number, rng: () => number) {
  const coarse = valueNoise(rng, Math.max(8, Math.round(w / 22)), w, h);
  const fine = valueNoise(rng, Math.max(16, Math.round(w / 7)), w, h);
  const grain = new Float32Array(w * h);
  for (let t = 0; t < w * h; t += 1) {
    const x = t % w;
    const y = (t / w) | 0;
    grain[t] = coarse(x, y) * 0.65 + fine(x, y) * 0.35;
  }
  return grain;
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

/** Islands smaller than this many tiles (0.25° each on the world map) are removed: too small to fight over. */
export const MIN_ISLAND_TILES = 30;

/**
 * Removes every landmass under `minTiles`, except those within a few tiles of a `keep` tile (a Nation's home, so a
 * small Nation such as Taiwan always stays). Returns how many tiles were removed.
 */
function dropTinyIslands(land: Uint8Array, w: number, h: number, minTiles: number, keep: readonly number[]) {
  const seen = new Uint8Array(land.length);
  // Each home protects only the one landmass nearest to it (the home point can sit just off the coast).
  const protectedTiles = new Set<number>();
  for (const home of keep) {
    if (home < 0 || home >= land.length) continue;
    const hx = home % w;
    const hy = (home / w) | 0;
    let found = -1;
    for (let r = 0; r <= 8 && found < 0; r += 1) {
      for (let dy = -r; dy <= r && found < 0; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = hx + dx;
          const y = hy + dy;
          if (x >= 0 && y >= 0 && x < w && y < h && land[y * w + x]) {
            found = y * w + x;
            break;
          }
        }
      }
    }
    if (found >= 0) protectedTiles.add(found);
  }
  let removed = 0;
  for (let start = 0; start < land.length; start += 1) {
    if (!land[start] || seen[start]) continue;
    const island = [start];
    seen[start] = 1;
    let kept = false;
    for (let i = 0; i < island.length; i += 1) {
      const t = island[i];
      if (protectedTiles.has(t)) kept = true;
      for (const n of neighbors(t, w, h)) {
        if (land[n] && !seen[n]) {
          seen[n] = 1;
          island.push(n);
        }
      }
    }
    if (island.length >= minTiles || kept) continue;
    for (const t of island) land[t] = 0;
    removed += island.length;
  }
  return removed;
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
    frontAt: 0,
    failUntil: 0,
    ports: [],
    factories: [],
    silos: [],
    sams: [],
    warships: 0,
    rails: [],
    railsDirty: false,
    tradeEarned: 0,
    tradeRate: 0,
    nukeAt: 0,
    nukedAt: -1e9,
    buildAt: 0,
    tries: new Map(),
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
    dropTinyIslands(
      land,
      w,
      h,
      MIN_ISLAND_TILES,
      WORLD_NATIONS.map(([, lat, lon]) => Math.floor((WORLD_NORTH - lat) * 4) * w + Math.floor((lon + 180) * 4)),
    );
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
    grain: makeGrain(w, h, rng),
    formerOwner: new Uint16Array(w * h),
    takenAt: new Int32Array(w * h),
    conquests: [],
    fallout: new Int32Array(w * h),
    falloutZones: [],
    readyAt: new Int32Array(w * h),
    nukes: [],
    ships: [],
    traders: [],
    effects: [],
    paths: new Map(),
    wars: new Set(),
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
    continued: false,
    wonAt: 0,
    rng,
  };

  // Nations and Bots take their places right away; the player picks theirs during the spawn phase.
  for (const nation of nations) {
    if (nation.kind === "nation") spawnNear(game, nation, nation.home >= 0 ? nation.home : randomLand(game), 4);
    else if (nation.kind === "bot") spawnNear(game, nation, roomyLand(game), 2);
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

/** Free land tiles in the square of `radius` around a tile (the map's edge and the sea count as no room). */
function openRoom(game: Game, t: number, radius: number) {
  const { w, h } = game;
  const x0 = t % w;
  const y0 = (t / w) | 0;
  let free = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const x = x0 + dx;
      const y = y0 + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const n = y * w + x;
      if (game.terrain[n] !== WATER && game.owner[n] === 0) free += 1;
    }
  }
  return free;
}

/**
 * Where a Bot starts: the roomiest of a few random spots, so none begins squeezed onto a sliver of coast or a
 * pocket between others (those Bots would hide there for the whole match). Needs half of a 13×13 square free.
 */
function roomyLand(game: Game) {
  let best = -1;
  let bestRoom = -1;
  for (let tries = 0; tries < 30; tries += 1) {
    const t = randomLand(game);
    if (t < 0) break;
    const room = openRoom(game, t, 6);
    if (room > bestRoom) {
      best = t;
      bestRoom = room;
    }
    if (room >= 85) break;
  }
  return best;
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
/** Seconds a rival rests after a failed war (longer on harder settings: better rivals wait for a better moment). */
const failurePause = (game: Game) => ({ easy: 30, normal: 35, hard: 40 })[game.settings.difficulty];

export function lossPerTile(attacker: Nation, defender: Nation, attackTroops: number, terrain: number, fortified: boolean) {
  return MAGNITUDE[terrain] * AREA * (fortified ? 5 : 1) * forceFactor(defender.troops / Math.max(1, attackTroops)) * (0.463 + (0.0039 * (defender.troops / Math.max(1, defender.tiles))) / AREA) * (defender.kind === "bot" && attacker.kind !== "bot" ? 0.7 : 1);
}

/**
 * How much the defender's strength weighs on each tile, from the defender's troops per attacking troop (1 = even).
 * Smooth over the whole range, so every extra troop sent helps: twice the defender's force pays about 60% of an
 * even fight per tile, four times or more about 38%; a fifth of it about 3 times as much.
 */
export const forceFactor = (ratio: number) => clamp(ratio, 0.25, 5) ** 0.7;

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

/** A player's list of buildings of one kind (by `Game.building` code). */
export function spotsOf(nation: Nation, code: number): number[] {
  switch (code) {
    case 1:
      return nation.citySpots;
    case 2:
      return nation.posts;
    case 3:
      return nation.ports;
    case 4:
      return nation.factories;
    case 5:
      return nation.silos;
    default:
      return nation.sams;
  }
}

function dropSpot(list: number[], t: number) {
  const i = list.indexOf(t);
  if (i >= 0) list.splice(i, 1);
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
  if (before && id) {
    game.formerOwner[t] = before;
    game.takenAt[t] = game.tick;
  }
  if (before) {
    const loser = nations[before];
    loser.tiles -= 1;
    loser.sx -= x;
    loser.sy -= y;
    loser.coast -= flag & 1;
    if (flag) loser.exposed -= 1;
    loser.touched = true;
    loser.border.delete(t);
    const code = game.building[t];
    if (code) {
      if (code === 1) loser.cities -= 1;
      dropSpot(spotsOf(loser, code), t);
      if (code === 1 || code === 3 || code === 4) loser.railsDirty = true;
    }
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
    const code = game.building[t];
    if (code) {
      if (code === 1) gainer.cities += 1;
      spotsOf(gainer, code).push(t);
      if (code === 1 || code === 3 || code === 4) gainer.railsDirty = true;
      if (before) game.events.push({ kind: "captured-building", from: before, to: id, building: BUILDING_AT[code]!, tile: t });
    }
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

/*
 * Fronts. Each attack keeps the target tiles touching its land in a priority queue. The next tile taken is the
 * cheapest by `priority`: pockets and inlets first (tiles our land surrounds on several sides), then easy ground
 * before hills and mountains, then close to where the attack is aimed, with a smooth per-tile grain that makes
 * the line bulge and curve. Growth follows the land: it only ever spreads to tiles touching what was just taken.
 */

/** Lower is taken sooner. */
function priority(game: Game, attack: Attack, t: number, enclosed: number) {
  const { w } = game;
  let aim = 0;
  if (attack.foci.length) {
    const x = t % w;
    const y = (t / w) | 0;
    let best = Infinity;
    for (const f of attack.foci) {
      const d = (f % w - x) ** 2 + (((f / w) | 0) - y) ** 2;
      if (d < best) best = d;
    }
    aim = Math.sqrt(best) / Math.max(4, attack.reach);
  }
  const ground = (TILE_COST[game.terrain[t]] - TILE_COST[PLAINS]) / (TILE_COST[MOUNTAIN] - TILE_COST[PLAINS]);
  return -enclosed * 0.55 + ground * 0.9 + game.grain[t] * 1.1 + aim * 1.4 + game.rng() * 0.12;
}

function heapPush(attack: Attack, t: number, p: number) {
  const T = attack.heapT;
  const P = attack.heapP;
  let i = T.length;
  T.push(t);
  P.push(p);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (P[parent] <= p) break;
    T[i] = T[parent];
    P[i] = P[parent];
    i = parent;
  }
  T[i] = t;
  P[i] = p;
}

function heapPop(attack: Attack): number {
  const T = attack.heapT;
  const P = attack.heapP;
  const top = T[0];
  const lastT = T.pop()!;
  const lastP = P.pop()!;
  if (T.length) {
    let i = 0;
    const n = T.length;
    for (;;) {
      const l = 2 * i + 1;
      if (l >= n) break;
      const c = l + 1 < n && P[l + 1] < P[l] ? l + 1 : l;
      if (P[c] >= lastP) break;
      T[i] = T[c];
      P[i] = P[c];
      i = c;
    }
    T[i] = lastT;
    P[i] = lastP;
  }
  return top;
}

function addFront(game: Game, attack: Attack, t: number) {
  const count = ownNeighbors(game, t, attack.from);
  if (!count) return;
  heapPush(attack, t, priority(game, attack, t, count));
  attack.front.add(t);
}

/** The next tile to take, or -1 when the front is used up. */
function takeFront(game: Game, attack: Attack) {
  for (let guard = 0; guard < 20_000 && attack.heapT.length; guard += 1) {
    const queued = attack.heapP[0];
    const t = heapPop(attack);
    if (game.owner[t] !== attack.to || game.terrain[t] === WATER) {
      attack.front.delete(t);
      continue;
    }
    const now = ownNeighbors(game, t, attack.from);
    if (!now) {
      attack.front.delete(t);
      continue;
    }
    // Surrounded further since it was queued: it may now come sooner (a duplicate entry is harmless).
    const fresh = priority(game, attack, t, now);
    if (fresh < queued - 0.3 && attack.heapT.length && fresh > attack.heapP[0]) {
      heapPush(attack, t, fresh);
      continue;
    }
    attack.front.delete(t);
    return t;
  }
  return -1;
}

/** How far along the border an attack with `troops` reaches from where it's aimed, in tiles. */
function reachOf(game: Game, attacker: Nation, defender: Nation | null, troops: number) {
  const perTile = defender ? lossPerTile(attacker, defender, troops, PLAINS, false) : expansionLoss(attacker, PLAINS);
  const affordable = troops / Math.max(1, perTile);
  return clamp(Math.sqrt(affordable) * (defender ? 0.75 : 1.1), defender ? 5 : 8, defender ? 48 : 90);
}

/**
 * The stretch of front an attack aimed at `target` opens: the target's tiles along our border, connected to the
 * point of the border nearest `target` and within reach of it. Nothing else lights up or moves.
 */
export function frontStretch(game: Game, from: number, target: number, troops: number): { tiles: number[]; anchor: number; reach: number } {
  const { w, h, owner, terrain } = game;
  const to = owner[target];
  const attacker = game.nations[from];
  const reach = reachOf(game, attacker, to ? game.nations[to] : null, troops);
  const tx = target % w;
  const ty = (target / w) | 0;
  let anchor = -1;
  let best = Infinity;
  for (const b of attacker.border) {
    for (const n of neighbors(b, w, h)) {
      if (owner[n] !== to || terrain[n] === WATER) continue;
      const d = (n % w - tx) ** 2 + (((n / w) | 0) - ty) ** 2;
      if (d < best) {
        best = d;
        anchor = n;
      }
    }
  }
  if (anchor < 0) return { tiles: [], anchor: -1, reach };
  const ax = anchor % w;
  const ay = (anchor / w) | 0;
  const tiles = [anchor];
  const seen = new Set([anchor]);
  for (let i = 0; i < tiles.length && tiles.length < 4000; i += 1) {
    const t = tiles[i];
    const x = t % w;
    const y = (t / w) | 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen.has(n) || owner[n] !== to || terrain[n] === WATER) continue;
        seen.add(n);
        if ((nx - ax) ** 2 + (ny - ay) ** 2 > reach * reach || !ownNeighbors(game, n, from)) continue;
        tiles.push(n);
      }
    }
  }
  return { tiles, anchor, reach };
}

/** What an attack at `target` with `troops` would open (the stretch the pointer previews), or []. */
export function previewFront(game: Game, from: number, target: number, troops: number) {
  if (target < 0 || game.terrain[target] === WATER || game.owner[target] === from || game.phase !== "battle") return [];
  if (!touches(game, from, game.owner[target])) return [];
  return frontStretch(game, from, target, troops).tiles;
}

const TRAIL = 24;

function newAttack(game: Game, from: number, to: number, troops: number, reason: AttackReason | null, landing = -1): Attack {
  const attack: Attack = {
    id: game.nextId++,
    from,
    to,
    troops,
    heapT: [],
    heapP: [],
    front: new Set(),
    foci: landing >= 0 ? [landing] : [],
    reach: 24,
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

/** Aim an attack at `target`: open the stretch of front there (keeping its earlier aims, at most four). */
function seedFront(game: Game, attack: Attack, target: number) {
  const { tiles, anchor, reach } = frontStretch(game, attack.from, target, attack.troops);
  if (anchor < 0) return;
  attack.foci.push(anchor);
  if (attack.foci.length > 4) attack.foci.shift();
  attack.reach = Math.max(attack.reach * 0.6, reach);
  for (const t of tiles) addFront(game, attack, t);
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
    seedFront(game, existing, target);
    surveyFront(game, existing);
    return { ok: true, message: `Reinforced: ${compactNumber(force)} more troops against ${name}.` };
  }
  const attack = newAttack(game, from, to, force, reason);
  if (opposing) attack.clashAt = game.tick;
  seedFront(game, attack, target);
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
  // A rival whose war failed (ran dry, was cut off or pulled back having spent most of what it sent) stops to
  // recover before starting another, and leaves that defender alone for longer.
  if (attack.to && nation.kind !== "human" && reason !== "complete" && reason !== "gone" && attack.spent > attack.sent * 0.5) {
    nation.avoid = attack.to;
    nation.avoidUntil = game.time + 50;
    nation.failUntil = Math.max(nation.failUntil, game.time + failurePause(game));
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
    // A wider front advances on more tiles at once, but a wedge pushes deep before it spreads: speed grows with
    // the front's size more slowly than one for one.
    const border = 9 * Math.sqrt(attack.front.size + 1);
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
      // Time per tile shrinks with the attacker's edge (a strong push breaks through) and grows behind walls.
      cost = (((clamp(ratio, 0.25, 7.5) ** 0.85 * clamp(ratio / 20, 1, 50)) / 8.55) * TILE_COST[terrain] * (fortified ? 3 : 1) * AREA) / border;
      defenderLoss = density;
    }
    // Irradiated land (after a bomb) is slow and costly to take.
    if (game.fallout[t] > game.tick) {
      loss *= 2;
      cost *= 2.5;
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
      eliminate(game, defender, attack.from, t);
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
    for (const spot of [...defender.citySpots, ...defender.posts, ...defender.ports, ...defender.factories, ...defender.silos, ...defender.sams]) {
      const sx = (spot % w) + 0.5;
      const sy = ((spot / w) | 0) + 0.5;
      for (const cell of attack.cells) {
        if ((cell.x - sx) ** 2 + (cell.y - sy) ** 2 > 14 * 14) continue;
        attack.near.push(spot);
        if (attack.to === 1 && !attack.warned.has(spot)) {
          attack.warned.add(spot);
          game.events.push({ kind: "threatened", attack: attack.id, from: attack.from, to: attack.to, building: BUILDING_AT[game.building[spot]] ?? "city", tile: spot });
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

function eliminate(game: Game, nation: Nation, by: number, lastTile = -1) {
  if (!nation.alive) return;
  const tiles = by && lastTile >= 0 ? recordConquest(game, nation, by, lastTile) : 0;
  nation.alive = false;
  nation.troops = 0;
  // Its gold goes to whoever finished it.
  const gold = by ? nation.gold : 0;
  if (by) game.nations[by].gold += nation.gold;
  nation.gold = 0;
  game.boats = game.boats.filter((boat) => boat.from !== nation.id);
  game.traders = game.traders.filter((trader) => trader.owner !== nation.id);
  for (const ship of game.ships.filter((entry) => entry.owner === nation.id)) removeShip(game, ship, by);
  for (const attack of [...game.attacks]) {
    if (attack.from === nation.id) endAttack(game, attack, 0, "gone");
    else if (attack.to === nation.id) endAttack(game, attack, attack.troops, "complete", true);
  }
  game.events.push({ kind: "eliminated", nation: nation.id, by, gold, tiles });
}

/** The conqueror's recent gains from the fallen player, nearest the last pocket first (at most 60,000 tiles). */
function recordConquest(game: Game, nation: Nation, by: number, lastTile: number) {
  const { w, h, owner, formerOwner, takenAt } = game;
  const since = game.tick - 1800;
  const found: number[] = [];
  for (let t = 0; t < w * h; t += 1) {
    if (formerOwner[t] === nation.id && owner[t] === by && takenAt[t] >= since) found.push(t);
  }
  const taken = found.length;
  if (!found.length) found.push(lastTile);
  const stride = Math.ceil(found.length / 60_000);
  const lx = lastTile % w;
  const ly = (lastTile / w) | 0;
  let cx = 0;
  let cy = 0;
  const kept: number[] = [];
  for (let i = 0; i < found.length; i += stride) {
    kept.push(found[i]);
    cx += found[i] % w;
    cy += (found[i] / w) | 0;
  }
  const distance = new Float64Array(w * h > 0 ? kept.length : 0);
  kept.forEach((t, i) => (distance[i] = (t % w - lx) ** 2 + (((t / w) | 0) - ly) ** 2));
  const order = kept.map((_, i) => i).sort((a, b) => distance[a] - distance[b]);
  // The last stand: what fell in the final three seconds, which collapses first on screen.
  const final: number[] = [];
  for (const t of found) if (takenAt[t] >= game.tick - 30 && final.length < 4000) final.push(t);
  game.conquests.push({
    id: game.nextId++,
    nation: nation.id,
    by,
    name: nation.name,
    kind: nation.kind,
    final: Int32Array.from(final),
    size: found.length,
    tick: game.tick,
    x: lx + 0.5,
    y: ly + 0.5,
    cx: cx / kept.length + 0.5,
    cy: cy / kept.length + 0.5,
    tiles: Int32Array.from(order, (i) => kept[i]),
  });
  if (game.conquests.length > 6) game.conquests.shift();
  return taken;
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
  if (existing) {
    attack.foci.push(boat.landing);
    if (attack.foci.length > 4) attack.foci.shift();
  }
  attack.stalling = false;
  for (const n of neighbors(boat.landing, game.w, game.h)) if (game.owner[n] === to && game.terrain[n] !== WATER) addFront(game, attack, n);
  if (existing) surveyFront(game, attack);
  else announce(game, attack);
}

/* ------------------------------------------------------------------------------------------- Buildings */

/** Why a building can't go on this tile (null: it can), before checking gold. */
export function placeProblem(game: Game, id: number, t: number, kind: Building): string | null {
  if (game.outcome) return "The match is over.";
  if (game.phase === "spawn") return "Build once the spawn phase ends.";
  if (t < 0 || game.terrain[t] === WATER) return "Build on your own land, not water.";
  if (game.owner[t] !== id) return "Build on your own land.";
  if (game.building[t]) return "There's already a building there.";
  if (kind === "port" && !(game.flags[t] & 1)) return "A Port goes on your coast: a tile touching water.";
  if (game.fallout[t] > game.tick) return "That land is irradiated: wait for the fallout to clear.";
  return null;
}

const BUILT_MESSAGE: Record<Building, string> = {
  city: `City built: +${compactNumber(CITY_TROOPS)} troop cap.`,
  post: "Defense Post built: attacks on land within its reach cost far more and slow to a crawl.",
  port: "Port built: trade ships will sail to other players' Ports for gold, and Warships can launch from here.",
  factory: "Factory built: it lays railroads to your Cities, Ports and Factories nearby, and each link earns gold.",
  silo: "Missile Silo built: armed in 5 s. Pick a bomb, then tap a target.",
  sam: "SAM Launcher built: armed in 5 s, it shoots at bombs aimed within its range.",
};

export function build(game: Game, id: number, t: number, kind: Building): ActionResult {
  const nation = game.nations[id];
  const problem = placeProblem(game, id, t, kind);
  if (problem) return { ok: false, message: problem };
  const cost = buildingCost(nation, kind);
  if (nation.gold < cost) return { ok: false, message: `Not enough gold: a ${BUILDING_LABEL[kind]} costs ${compactNumber(cost)}.` };
  nation.gold -= cost;
  const code = BUILDING_CODE[kind];
  game.building[t] = code;
  if (kind === "city") nation.cities += 1;
  spotsOf(nation, code).push(t);
  game.readyAt[t] = game.tick + (kind === "port" ? TRADE_TICKS / 2 : ARMING_TICKS);
  if (kind === "city" || kind === "port" || kind === "factory") updateRails(nation, game.w);
  game.dirty.push(t);
  game.events.push({ kind: "built", nation: id, building: kind, tile: t });
  let message = BUILT_MESSAGE[kind];
  if (kind === "factory") {
    const links = railsOf(nation, t);
    message = links
      ? `Factory built with ${links} rail link${links === 1 ? "" : "s"}: +${compactNumber((FACTORY_GOLD + links * RAIL_GOLD) / TICK_SECONDS)} gold/s.`
      : `Factory built: +${compactNumber(FACTORY_GOLD / TICK_SECONDS)} gold/s. Cities, Ports or Factories within ${RAIL_RANGE} tiles get rail links worth more.`;
  }
  return { ok: true, message };
}

export const BUILDING_LABEL: Record<Building, string> = { city: "City", post: "Defense Post", port: "Port", factory: "Factory", silo: "Missile Silo", sam: "SAM Launcher" };

/* ------------------------------------------------------------------------------------------- Economy */

/** Gold per tick from Factories and their railroads. */
export const factoryIncome = (nation: Nation) => nation.factories.length * FACTORY_GOLD + (nation.rails.length / 2) * RAIL_GOLD;
/** All gold per tick except trade (which arrives with each ship). */
export const income = (nation: Nation) => goldPerTick(nation) + factoryIncome(nation);

/** Lay a player's railroads: each Factory links to its four nearest own stations in range. */
function updateRails(nation: Nation, w: number) {
  nation.railsDirty = false;
  const rails: number[] = [];
  const stations = [...nation.citySpots, ...nation.ports, ...nation.factories];
  const linked = new Set<string>();
  for (const f of nation.factories) {
    const fx = f % w;
    const fy = (f / w) | 0;
    const near = stations
      .filter((s) => s !== f)
      .map((s) => ({ s, d: (s % w - fx) ** 2 + (((s / w) | 0) - fy) ** 2 }))
      .filter((entry) => entry.d <= RAIL_RANGE * RAIL_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    for (const { s } of near) {
      const key = f < s ? `${f}:${s}` : `${s}:${f}`;
      if (linked.has(key)) continue;
      linked.add(key);
      rails.push(f, s);
    }
  }
  nation.rails = rails;
}

/** How many rail links touch a station. */
export function railsOf(nation: Nation, t: number) {
  let links = 0;
  for (let i = 0; i < nation.rails.length; i += 1) if (nation.rails[i] === t) links += 1;
  return links;
}

/** A water tile beside a coastal tile, or -1. */
function waterBeside(game: Game, t: number) {
  for (const n of neighbors(t, game.w, game.h)) if (game.terrain[n] === WATER) return n;
  return -1;
}

/** Shortest route over water between two water tiles (breadth-first, bounded), from `from` to `to`, or null. */
function waterPath(game: Game, from: number, to: number, limit: number): number[] | null {
  const { w, h, terrain } = game;
  if (from === to) return [from];
  const size = w * h;
  if (searchStamp.length !== size) {
    searchStamp = new Uint32Array(size);
    searchPrev = new Int32Array(size);
    stamp = 0;
  }
  stamp += 1;
  const queue = [from];
  searchStamp[from] = stamp;
  searchPrev[from] = -1;
  for (let head = 0; head < queue.length && head < limit; head += 1) {
    const t = queue[head];
    const x = t % w;
    for (let k = 0; k < 4; k += 1) {
      const n = k === 0 ? (x > 0 ? t - 1 : -1) : k === 1 ? (x < w - 1 ? t + 1 : -1) : k === 2 ? t - w : t + w;
      if (n < 0 || n >= size || terrain[n] !== WATER || searchStamp[n] === stamp) continue;
      searchStamp[n] = stamp;
      searchPrev[n] = t;
      if (n === to) {
        const path: number[] = [];
        for (let step = n; step !== -1; step = searchPrev[step]) path.push(step);
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** Ports send trade ships to other players' Ports; both sides earn when one arrives. Pirates: Warships. */
function stepTrade(game: Game) {
  for (const trader of game.traders.slice()) {
    trader.index += TRADE_SPEED;
    if (trader.index < trader.path.length - 1) continue;
    game.traders.splice(game.traders.indexOf(trader), 1);
    const owner = game.nations[trader.owner];
    const host = game.owner[trader.to];
    if (!owner.alive || game.building[trader.to] !== 3 || !host || host === trader.owner || !game.nations[host].alive) continue;
    owner.gold += trader.gold;
    owner.tradeEarned += trader.gold;
    game.nations[host].gold += trader.gold * 0.5;
    game.nations[host].tradeEarned += trader.gold * 0.5;
  }
  if (game.tick % 10) return;
  for (const nation of game.nations) {
    if (!nation.alive) continue;
    nation.tradeRate = nation.tradeRate * 0.95 + nation.tradeEarned * 0.05;
    nation.tradeEarned = 0;
  }
  let all: { tile: number; owner: number }[] | null = null;
  let searches = 1;
  for (const nation of game.nations) {
    if (!nation.alive || !nation.ports.length) continue;
    for (const port of nation.ports) {
      if (game.readyAt[port] > game.tick) continue;
      game.readyAt[port] = game.tick + TRADE_TICKS + Math.floor(game.rng() * 80);
      if (game.traders.length >= 150) continue;
      all ??= game.nations.flatMap((other) => (other.alive ? other.ports.map((tile) => ({ tile, owner: other.id })) : []));
      const px = port % game.w;
      const py = (port / game.w) | 0;
      const partners = all
        .filter((entry) => entry.owner !== nation.id)
        .map((entry) => ({ ...entry, d: (entry.tile % game.w - px) ** 2 + (((entry.tile / game.w) | 0) - py) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);
      if (!partners.length) continue;
      const dest = partners[Math.floor(game.rng() * partners.length)].tile;
      const low = Math.min(port, dest);
      const key = `${low}:${Math.max(port, dest)}`;
      let path = game.paths.get(key);
      if (!path) {
        // Route searches are the costly part: at most one new one per second, the rest wait for their turn.
        if (searches <= 0) {
          game.readyAt[port] = game.tick + 20;
          continue;
        }
        searches -= 1;
        const a = waterBeside(game, low);
        const b = waterBeside(game, Math.max(port, dest));
        path = (a >= 0 && b >= 0 ? waterPath(game, a, b, 160_000) : null) ?? [];
        game.paths.set(key, path);
        if (game.paths.size > 800) game.paths.delete(game.paths.keys().next().value!);
      }
      if (path.length < 2) continue;
      const route = port === low ? path : [...path].reverse();
      game.traders.push({ id: game.nextId++, owner: nation.id, from: port, to: dest, path: route, index: 0, gold: Math.round(clamp(10_000 + route.length * 60, 12_000, 60_000)) });
    }
  }
}

/* ------------------------------------------------------------------------------------------- Missiles */

/** The ready Silo nearest the target, or -1. */
export function readySilo(game: Game, nation: Nation, target: number) {
  let best = -1;
  let bestD = Infinity;
  for (const silo of nation.silos) {
    if (game.readyAt[silo] > game.tick) continue;
    const d = (silo % game.w - (target % game.w)) ** 2 + (((silo / game.w) | 0) - ((target / game.w) | 0)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = silo;
    }
  }
  return best;
}

/** Seconds until the first Silo is ready (0 = now; Infinity without one). */
export function siloWait(game: Game, nation: Nation) {
  if (!nation.silos.length) return Infinity;
  return Math.max(0, Math.min(...nation.silos.map((silo) => game.readyAt[silo])) - game.tick) * TICK_SECONDS;
}

/** Where a bomb at `target` would come down (a MIRV splits above the middle of the target's land). */
export function aimPoint(game: Game, weapon: Weapon, target: number) {
  if (weapon === "mirv") {
    const nation = game.nations[game.owner[target]];
    if (nation?.tiles) return { x: nation.sx / nation.tiles + 0.5, y: nation.sy / nation.tiles + 0.5 };
  }
  return { x: (target % game.w) + 0.5, y: ((target / game.w) | 0) + 0.5 };
}

/** Why a bomb can't be launched at this tile right now (null: it can). */
export function launchProblem(game: Game, from: number, target: number, weapon: Weapon): string | null {
  const nation = game.nations[from];
  const info = WEAPONS[weapon];
  if (game.outcome || !nation.alive) return "The match is over.";
  if (game.phase === "spawn" || immune(game)) return "No launches while everyone is protected.";
  if (!nation.silos.length) return "You need a Missile Silo first.";
  if (target < 0 || game.terrain[target] === WATER) return "Aim at land.";
  const to = game.owner[target];
  if (to === from) return "That's your own land.";
  if (weapon === "mirv" && (!to || !game.nations[to].alive)) return "A MIRV targets a player: aim at a rival's land.";
  if (nation.gold < info.cost) return `Not enough gold: a ${info.label} costs ${compactNumber(info.cost)}.`;
  if (readySilo(game, nation, target) < 0) return `Your Silos are reloading: ready in ${Math.ceil(siloWait(game, nation))}s.`;
  return null;
}

export function launchNuke(game: Game, from: number, target: number, weapon: Weapon): ActionResult {
  const problem = launchProblem(game, from, target, weapon);
  if (problem) return { ok: false, message: problem };
  const nation = game.nations[from];
  const info = WEAPONS[weapon];
  const silo = readySilo(game, nation, target);
  nation.gold -= info.cost;
  game.readyAt[silo] = game.tick + SILO_RELOAD;
  const to = game.owner[target];
  const { x, y } = aimPoint(game, weapon, target);
  const x0 = (silo % game.w) + 0.5;
  const y0 = ((silo / game.w) | 0) + 0.5;
  const flight = Math.max(20, Math.round(Math.hypot(x - x0, y - y0) / info.speed));
  const nuke: Nuke = { id: game.nextId++, from, weapon, x0, y0, x1: x, y1: y, target, to, launched: game.tick, flight, warhead: false, parent: 0, tried: [] };
  nuke.parent = nuke.id;
  game.nukes.push(nuke);
  game.events.push({ kind: "launched", nuke: nuke.id, from, to, weapon, tile: Math.floor(y) * game.w + Math.floor(x), eta: flight * TICK_SECONDS });
  const name = to ? game.nations[to].name : "open land";
  return { ok: true, message: `${info.label} launched at ${name}: impact in ${Math.ceil(flight * TICK_SECONDS)}s.` };
}

/** Where a bomb is now, between its Silo and its target. */
export function nukePosition(nuke: Nuke, tick: number) {
  const p = clamp((tick - nuke.launched) / nuke.flight, 0, 1);
  return { x: nuke.x0 + (nuke.x1 - nuke.x0) * p, y: nuke.y0 + (nuke.y1 - nuke.y0) * p, p };
}

function stepNukes(game: Game) {
  if (!game.nukes.length) return;
  let sams: number[] | null = null;
  for (const nuke of game.nukes.slice()) {
    const { x, y } = nukePosition(nuke, game.tick);
    // SAM Launchers shoot at bombs coming down within their range, once each, as the bomb comes into reach.
    if (!nuke.warhead && WEAPONS[nuke.weapon].intercept > 0) {
      sams ??= game.nations.flatMap((nation) => (nation.alive ? nation.sams : []));
      let downed = false;
      for (const sam of sams) {
        const owner = game.owner[sam];
        if (owner === nuke.from || game.readyAt[sam] > game.tick || nuke.tried.includes(sam)) continue;
        const sx = (sam % game.w) + 0.5;
        const sy = ((sam / game.w) | 0) + 0.5;
        if ((sx - nuke.x1) ** 2 + (sy - nuke.y1) ** 2 > SAM_RANGE * SAM_RANGE) continue;
        if ((sx - x) ** 2 + (sy - y) ** 2 > SAM_RANGE * SAM_RANGE) continue;
        nuke.tried.push(sam);
        game.readyAt[sam] = game.tick + SAM_RELOAD;
        const hit = game.rng() < WEAPONS[nuke.weapon].intercept;
        game.effects.push({ id: game.nextId++, kind: hit ? "intercept" : "miss", tick: game.tick, x0: sx, y0: sy, x1: x, y1: y, owner });
        if (hit) {
          game.nukes.splice(game.nukes.indexOf(nuke), 1);
          game.events.push({ kind: "intercepted", nuke: nuke.id, from: nuke.from, by: owner, to: nuke.to, weapon: nuke.weapon, tile: Math.floor(y) * game.w + Math.floor(x) });
          downed = true;
          break;
        }
      }
      if (downed) continue;
    }
    if (game.tick - nuke.launched < nuke.flight) continue;
    game.nukes.splice(game.nukes.indexOf(nuke), 1);
    if (nuke.weapon === "mirv" && !nuke.warhead) splitMirv(game, nuke);
    else detonate(game, nuke);
  }
}

/** A MIRV over its target splits into warheads spread across that player's land. */
function splitMirv(game: Game, nuke: Nuke) {
  const target = game.nations[nuke.to];
  if (!target?.alive) return;
  const tiles: number[] = [];
  for (let t = 0; t < game.owner.length; t += 1) if (game.owner[t] === nuke.to) tiles.push(t);
  if (!tiles.length) return;
  const count = clamp(Math.round(tiles.length / 140), 14, 110);
  const picked: number[] = [];
  for (let tries = 0; picked.length < count && tries < count * 12; tries += 1) {
    const t = tiles[Math.floor(game.rng() * tiles.length)];
    const x = t % game.w;
    const y = (t / game.w) | 0;
    if (tries < count * 8 && picked.some((p) => (p % game.w - x) ** 2 + (((p / game.w) | 0) - y) ** 2 < 36)) continue;
    picked.push(t);
  }
  for (const t of picked) {
    game.nukes.push({
      id: game.nextId++,
      from: nuke.from,
      weapon: "mirv",
      x0: nuke.x1,
      y0: nuke.y1,
      x1: (t % game.w) + 0.5,
      y1: ((t / game.w) | 0) + 0.5,
      target: t,
      to: nuke.to,
      launched: game.tick,
      flight: 8 + Math.floor(game.rng() * 12),
      warhead: true,
      parent: nuke.id,
      tried: [],
    });
  }
}

/**
 * A bomb comes down. Land within the inner radius is wiped (and irradiated), the outer ring partly; buildings on
 * wiped land are destroyed, players lose the share of their army that held it (and half as much again to the
 * blast), armies fighting there are cut down, and ships within the outer radius sink. A MIRV warhead only hurts
 * the player it was aimed at.
 */
function detonate(game: Game, nuke: Nuke) {
  const info = WEAPONS[nuke.weapon];
  const { w, h, terrain, owner } = game;
  const cx = nuke.x1;
  const cy = nuke.y1;
  const only = nuke.warhead ? nuke.to : -1;
  const lost = new Map<number, number>();
  const zone: number[] = [];
  let buildings = 0;
  const r = info.outer;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y += 1) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x += 1) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > r) continue;
      const t = y * w + x;
      if (terrain[t] === WATER) continue;
      const o = owner[t];
      if (only >= 0 && o !== only) continue;
      if (d > info.inner && game.rng() > ((r - d) / (r - info.inner)) * 0.9) continue;
      game.fallout[t] = game.tick + FALLOUT_TICKS;
      zone.push(t);
      if (game.building[t]) buildings += 1;
      if (o) {
        lost.set(o, (lost.get(o) ?? 0) + 1);
        setOwner(game, t, 0);
      } else game.dirty.push(t);
    }
  }
  if (zone.length) game.falloutZones.push({ until: game.tick + FALLOUT_TICKS, tiles: zone });
  for (const [id, n] of lost) {
    const nation = game.nations[id];
    nation.troops -= nation.troops * Math.min(0.85, (n / (nation.tiles + n)) * 1.5);
    nation.nukedAt = game.time;
    if (id !== nuke.from) {
      nation.grudge = nuke.from;
      nation.grudgeUntil = game.time + 120;
    }
  }
  for (const attack of game.attacks) {
    if (attack.ax < 0 || (only >= 0 && attack.from !== only && attack.to !== only)) continue;
    const d = Math.hypot(attack.ax - cx, attack.ay - cy);
    if (d <= r) attack.troops *= d <= info.inner ? 0.1 : 0.5;
  }
  sinkWithin(game, cx, cy, r, nuke.from);
  game.effects.push({ id: game.nextId++, kind: "blast", tick: game.tick, x0: cx, y0: cy, x1: cx, y1: cy, owner: nuke.from, weapon: nuke.weapon });
  const tile = Math.floor(cy) * w + Math.floor(cx);
  game.events.push({ kind: "detonated", nuke: nuke.id, parent: nuke.parent, from: nuke.from, weapon: nuke.weapon, tile, hit: [...lost.keys()], playerLost: lost.get(1) ?? 0, buildings });
  for (const id of lost.keys()) {
    const nation = game.nations[id];
    if (nation.alive && nation.tiles === 0) eliminate(game, nation, id === nuke.from ? 0 : nuke.from, tile);
  }
}

/** Every boat, Warship and trade ship within `r` of a point goes down. */
function sinkWithin(game: Game, cx: number, cy: number, r: number, by: number) {
  const near = (t: number) => (t % game.w + 0.5 - cx) ** 2 + (((t / game.w) | 0) + 0.5 - cy) ** 2 <= r * r;
  for (const boat of game.boats.slice()) {
    const at = boat.path[Math.min(boat.path.length - 1, boat.index)];
    if (!near(at)) continue;
    game.boats.splice(game.boats.indexOf(boat), 1);
    if (boat.from === 1 || game.owner[boat.landing] === 1) game.events.push({ kind: "sunk", ship: "boat", owner: boat.from, by, tile: at, troops: boat.troops });
  }
  for (const ship of game.ships.slice()) if (near(ship.at)) removeShip(game, ship, by);
  game.traders = game.traders.filter((trader) => !near(trader.path[Math.min(trader.path.length - 1, Math.floor(trader.index))]));
}

/** Irradiated land recovers: repaint it once its fallout ends. */
function stepFallout(game: Game) {
  while (game.falloutZones.length && game.falloutZones[0].until <= game.tick) {
    for (const t of game.falloutZones.shift()!.tiles) if (game.fallout[t] <= game.tick) game.dirty.push(t);
  }
}

/* ------------------------------------------------------------------------------------------- Warships */

export function buildWarship(game: Game, id: number, tile: number): ActionResult {
  const nation = game.nations[id];
  if (game.outcome || !nation.alive) return { ok: false, message: "The match is over." };
  if (game.phase === "spawn") return { ok: false, message: "Build once the spawn phase ends." };
  if (!nation.ports.length) return { ok: false, message: "Warships launch from a Port: build one on your coast first." };
  if (tile < 0 || game.terrain[tile] !== WATER) return { ok: false, message: "Tap the water where the Warship should patrol." };
  const cost = buildingCost(nation, "warship");
  if (nation.gold < cost) return { ok: false, message: `Not enough gold: a Warship costs ${compactNumber(cost)}.` };
  // From the nearest Ports (the route search grows with distance, so a far one is tried last and bounded).
  const ports = [...nation.ports].sort((a, b) => distance2(game, a, tile) - distance2(game, b, tile)).slice(0, 3);
  for (const port of ports) {
    const start = waterBeside(game, port);
    if (start < 0) continue;
    const path = waterPath(game, start, tile, id === 1 ? 300_000 : 80_000);
    if (!path) continue;
    nation.gold -= cost;
    nation.warships += 1;
    game.ships.push({ id: game.nextId++, owner: id, at: start, hp: WARSHIP_HP, patrol: tile, path, step: 0, move: 0, target: -1, targetKind: "", fireAt: 0, idleAt: 0 });
    return { ok: true, message: "Warship launched: it patrols there, sinks boats landing on you, and fights the ships and seizes the trade of anyone you're at war with." };
  }
  return { ok: false, message: "No sea route from your Ports reaches there." };
}

/** Send every one of your Warships to patrol around a new spot. */
export function moveFleet(game: Game, id: number, tile: number): ActionResult {
  if (tile < 0 || game.terrain[tile] !== WATER) return { ok: false, message: "Tap the water where your fleet should patrol." };
  const fleet = game.ships.filter((ship) => ship.owner === id);
  if (!fleet.length) return { ok: false, message: "You have no Warships. Build one from a Port." };
  let moved = 0;
  for (const ship of fleet) {
    const path = waterPath(game, ship.at, tile, 300_000);
    if (!path) continue;
    ship.patrol = tile;
    ship.path = path;
    ship.step = 0;
    ship.target = -1;
    ship.targetKind = "";
    moved += 1;
  }
  if (!moved) return { ok: false, message: "None of your Warships can reach there by sea." };
  return { ok: true, message: moved === fleet.length ? `Fleet underway: ${moved} Warship${moved === 1 ? "" : "s"}.` : `${moved} of ${fleet.length} Warships can reach there; they're underway.` };
}

function declareWar(game: Game, a: number, b: number) {
  game.wars.add(a * 65536 + b);
  game.wars.add(b * 65536 + a);
}

/** Whether two players are at war: what Warships go by (there are no alliances, but no piracy in peacetime). */
export const atWar = (game: Game, a: number, b: number) => game.wars.has(a * 65536 + b);

const distance2 = (game: Game, a: number, b: number) => (a % game.w - (b % game.w)) ** 2 + (((a / game.w) | 0) - ((b / game.w) | 0)) ** 2;

function removeShip(game: Game, ship: Warship, by: number) {
  const i = game.ships.indexOf(ship);
  if (i < 0) return;
  game.ships.splice(i, 1);
  game.nations[ship.owner].warships -= 1;
  game.effects.push({ id: game.nextId++, kind: "sunk", tick: game.tick, x0: (ship.at % game.w) + 0.5, y0: ((ship.at / game.w) | 0) + 0.5, x1: 0, y1: 0, owner: ship.owner });
  if (ship.owner === 1 || by === 1) game.events.push({ kind: "sunk", ship: "warship", owner: ship.owner, by, tile: ship.at, troops: 0 });
}

/** What a Warship is after: boats landing on its owner first, then Warships, other boats, and trade ships. */
function acquire(game: Game, ship: Warship) {
  const reach = (WARSHIP_RANGE * 1.4) ** 2;
  let best = -1;
  let kind: Warship["targetKind"] = "";
  let bestScore = 0;
  const consider = (id: number, at: number, value: number, k: Warship["targetKind"]) => {
    const d = distance2(game, ship.at, at);
    if (d > reach) return;
    const score = value - d / reach;
    if (score > bestScore) {
      bestScore = score;
      best = id;
      kind = k;
    }
  };
  for (const boat of game.boats) {
    if (boat.from === ship.owner) continue;
    const landing = game.owner[boat.landing] === ship.owner;
    if (landing || atWar(game, ship.owner, boat.from)) consider(boat.id, boat.path[Math.min(boat.path.length - 1, boat.index)], landing ? 4 : 2, "boat");
  }
  for (const other of game.ships) if (other.owner !== ship.owner && atWar(game, ship.owner, other.owner)) consider(other.id, other.at, 3, "ship");
  for (const trader of game.traders) if (trader.owner !== ship.owner && atWar(game, ship.owner, trader.owner)) consider(trader.id, trader.path[Math.min(trader.path.length - 1, Math.floor(trader.index))], 1.5, "trade");
  ship.target = best;
  ship.targetKind = kind;
}

/** Where a Warship's target is now, or -1 if it's gone. */
function targetTile(game: Game, ship: Warship) {
  if (ship.targetKind === "boat") {
    const boat = game.boats.find((entry) => entry.id === ship.target);
    return boat ? boat.path[Math.min(boat.path.length - 1, boat.index)] : -1;
  }
  if (ship.targetKind === "ship") return game.ships.find((entry) => entry.id === ship.target)?.at ?? -1;
  if (ship.targetKind === "trade") {
    const trader = game.traders.find((entry) => entry.id === ship.target);
    return trader ? trader.path[Math.min(trader.path.length - 1, Math.floor(trader.index))] : -1;
  }
  return -1;
}

function fire(game: Game, ship: Warship, at: number) {
  ship.fireAt = game.tick + 10;
  const x0 = (ship.at % game.w) + 0.5;
  const y0 = ((ship.at / game.w) | 0) + 0.5;
  const x1 = (at % game.w) + 0.5;
  const y1 = ((at / game.w) | 0) + 0.5;
  game.effects.push({ id: game.nextId++, kind: "shell", tick: game.tick, x0, y0, x1, y1, owner: ship.owner });
  if (ship.targetKind === "boat") {
    const boat = game.boats.find((entry) => entry.id === ship.target);
    if (!boat) return;
    game.boats.splice(game.boats.indexOf(boat), 1);
    game.effects.push({ id: game.nextId++, kind: "sunk", tick: game.tick + 3, x0: x1, y0: y1, x1: 0, y1: 0, owner: boat.from });
    if (boat.from === 1 || ship.owner === 1 || game.owner[boat.landing] === 1) game.events.push({ kind: "sunk", ship: "boat", owner: boat.from, by: ship.owner, tile: at, troops: boat.troops });
  } else if (ship.targetKind === "ship") {
    const other = game.ships.find((entry) => entry.id === ship.target);
    if (!other) return;
    other.hp -= WARSHIP_DAMAGE;
    if (other.hp <= 0) removeShip(game, other, ship.owner);
  } else if (ship.targetKind === "trade") {
    const trader = game.traders.find((entry) => entry.id === ship.target);
    if (!trader) return;
    game.traders.splice(game.traders.indexOf(trader), 1);
    game.nations[ship.owner].gold += trader.gold;
    game.effects.push({ id: game.nextId++, kind: "seized", tick: game.tick + 3, x0: x1, y0: y1, x1: 0, y1: 0, owner: ship.owner, value: trader.gold });
    if (ship.owner === 1 || trader.owner === 1) game.events.push({ kind: "seized", by: ship.owner, from: trader.owner, gold: trader.gold, tile: at });
  }
  ship.target = -1;
  ship.targetKind = "";
}

/** One water step toward a tile (the neighbor that closes the most distance), or stay. */
function stepToward(game: Game, ship: Warship, goal: number) {
  const { w, terrain } = game;
  let best = ship.at;
  let bestD = distance2(game, ship.at, goal);
  const x = ship.at % w;
  for (const n of [x > 0 ? ship.at - 1 : -1, x < w - 1 ? ship.at + 1 : -1, ship.at - w, ship.at + w]) {
    if (n < 0 || n >= terrain.length || terrain[n] !== WATER) continue;
    const d = distance2(game, n, goal);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  ship.at = best;
}

function stepShips(game: Game) {
  for (const ship of game.ships.slice()) {
    if (!game.nations[ship.owner].alive) {
      removeShip(game, ship, 0);
      continue;
    }
    if (!game.ships.includes(ship)) continue;
    const owner = game.nations[ship.owner];
    // Repairs near one of its own Ports.
    if (ship.hp < WARSHIP_HP && game.tick % 5 === 0 && owner.ports.some((port) => distance2(game, port, ship.at) < 144)) ship.hp = Math.min(WARSHIP_HP, ship.hp + 20);
    if ((ship.id + game.tick) % 5 === 0) acquire(game, ship);
    let goal = ship.target >= 0 ? targetTile(game, ship) : -1;
    if (ship.target >= 0 && goal < 0) {
      ship.target = -1;
      ship.targetKind = "";
    }
    // Never chase far from the patrol.
    if (goal >= 0 && distance2(game, goal, ship.patrol) > 45 * 45) {
      goal = -1;
      ship.target = -1;
      ship.targetKind = "";
    }
    if (goal >= 0 && game.tick >= ship.fireAt && distance2(game, ship.at, goal) <= WARSHIP_RANGE * WARSHIP_RANGE) fire(game, ship, goal);
    ship.move += WARSHIP_SPEED;
    while (ship.move >= 1) {
      ship.move -= 1;
      if (goal >= 0) {
        if (distance2(game, ship.at, goal) > 36) stepToward(game, ship, goal);
        ship.path = [];
        ship.step = 0;
      } else if (ship.step < ship.path.length - 1) {
        ship.step += 1;
        ship.at = ship.path[ship.step];
      } else if (game.tick >= ship.idleAt) {
        // Idle: cruise around the patrol spot (or head back to it after a chase).
        ship.idleAt = game.tick + 30;
        const far = distance2(game, ship.at, ship.patrol) > 144;
        let dest = ship.patrol;
        if (!far) {
          for (let tries = 0; tries < 8; tries += 1) {
            const x = (ship.patrol % game.w) + Math.round((game.rng() * 2 - 1) * 9);
            const y = ((ship.patrol / game.w) | 0) + Math.round((game.rng() * 2 - 1) * 9);
            const t = y * game.w + x;
            if (x >= 0 && y >= 0 && x < game.w && y < game.h && game.terrain[t] === WATER) {
              dest = t;
              break;
            }
          }
        }
        ship.path = waterPath(game, ship.at, dest, far ? 120_000 : 4000) ?? [];
        ship.step = 0;
      }
    }
  }
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
    nation.gold += income(nation);
    if (nation.railsDirty && (nation.id + game.tick) % 10 === 0) updateRails(nation, game.w);
  }

  for (const attack of game.attacks.slice()) if (!attack.done) advanceAttack(game, attack);
  // Staggered bookkeeping: each attack measures its pace once a second and remaps its front twice a second.
  for (const attack of game.attacks) {
    if ((attack.id + game.tick) % 10 === 0) measureAttack(game, attack);
    if ((attack.id + game.tick) % 5 === 0) surveyFront(game, attack);
  }
  for (const boat of game.boats.slice()) advanceBoat(game, boat);
  stepNukes(game);
  stepShips(game);
  stepTrade(game);
  if (game.tick % 10 === 0) stepFallout(game);
  if (game.effects.length && game.tick - game.effects[0].tick > 40) game.effects = game.effects.filter((effect) => game.tick - effect.tick <= 40);

  // What every rival can see this tick: troops out in the field, and how many attacks each player is under.
  game.committed.fill(0);
  game.targeted.fill(0);
  game.wars.clear();
  for (const attack of game.attacks) if (attack.to) declareWar(game, attack.from, attack.to);
  for (const boat of game.boats) if (game.owner[boat.landing]) declareWar(game, boat.from, game.owner[boat.landing]);
  for (const nation of game.nations) if (nation.alive && nation.grudge && game.time < nation.grudgeUntil) declareWar(game, nation.id, nation.grudge);
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
  if (game.conquests.length && game.tick - game.conquests[0].tick > 60) game.conquests = game.conquests.filter((entry) => game.tick - entry.tick <= 60);
  if (game.ended.length && game.tick - game.ended[0].tick > 40) game.ended = game.ended.filter((entry) => game.tick - entry.tick <= 40);
  checkOutcome(game);
}

/**
 * A Bot whose land touches only one other player (no coast, no map edge, no unclaimed land) joins that player.
 * Only Bots whose surroundings changed since the last check are looked at, and the coast and edge are counted as
 * tiles change hands, so an unchanged Bot costs nothing.
 */
const TINY_BOT_TILES = 40;

function annexSurrounded(game: Game) {
  for (const bot of game.nations) {
    if (!bot.alive || bot.kind !== "bot" || !bot.touched) continue;
    bot.touched = false;
    // A Bot squeezed down to a pocket (a few tiles) is annexed even when it touches the coast: it can't do
    // anything from there, and hiding in it would keep a match from ever finishing cleanly.
    if (bot.tiles > 4000 || (bot.exposed > 0 && bot.tiles > TINY_BOT_TILES)) continue;
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
  const player = game.nations[1];
  if (game.continued) {
    // The player already won and chose to play on: the match ends when they hold every tile of the map, or
    // when their last land falls (the win stays recorded).
    const held = share(game, player);
    if (held > player.peak) player.peak = held;
    if (player.tiles >= game.landTiles) {
      game.outcome = { winner: 1, reason: "total" };
      return;
    }
  } else {
    for (const nation of game.nations) {
      if (!nation.alive) continue;
      const held = share(game, nation);
      if (held > nation.peak) nation.peak = held;
      if (held >= WIN_SHARE) {
        game.outcome = { winner: nation.id, reason: "share" };
        if (nation.id === 1) game.wonAt = game.time;
        return;
      }
    }
  }
  if (!player.alive || (player.spawned && player.tiles === 0)) {
    player.alive = false;
    game.outcome = { winner: null, reason: "conquered" };
  }
}

/**
 * After a victory by share, the player may play on toward the whole map. Clears the result so the match runs
 * again; it now ends only with every tile taken ("total") or the player's last land falling. Rivals keep
 * fighting, and nobody else can win any more.
 */
export function continueAfterWin(game: Game): boolean {
  if (game.outcome?.winner !== 1 || game.outcome.reason !== "share" || game.continued) return false;
  game.outcome = null;
  game.continued = true;
  return true;
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

export function compactNumber(value: number) {
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M` : value >= 10_000 ? `${Math.round(value / 1000)}K` : value >= 1000 ? `${(value / 1000).toFixed(1)}K` : `${Math.round(value)}`;
}

/**
 * The record: a victory scores by difficulty, map, opponents and pace; a defeat scores the best share of the
 * land you held (so any victory beats any defeat).
 */
export function matchScore(game: Game) {
  const player = game.nations[1];
  // Playing on after a win keeps the win: a later defeat doesn't turn it into a loss.
  const won = game.continued || game.outcome?.winner === 1;
  if (!won) return Math.round(player.peak * 1000);
  const { difficulty, map, bots, nations } = game.settings;
  const base = 2000 * { easy: 1, normal: 1.6, hard: 2.4 }[difficulty] * (map === "world" ? 1.4 : 1) * (0.7 + (bots / 400) * 0.5 + (nations ? 0.5 : 0));
  const pace = Math.max(0.5, 1.6 - (game.continued ? game.wonAt : game.time) / 1800);
  // Taking every last tile after winning is worth a quarter more.
  return Math.round(base * pace * (game.outcome?.reason === "total" ? 1.25 : 1));
}
