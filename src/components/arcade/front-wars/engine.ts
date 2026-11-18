/**
 * Front Wars: a solo territory-control match against bot nations, modelled on the FrontWars.io core rules:
 * troops grow over time up to a cap set by your land, you send a share of them (the attack ratio) to take
 * adjacent neutral land or an enemy's border, retreating costs a quarter of the attacking troops, Cities raise
 * the cap and Defense Posts make nearby land costlier and slower to take. Hold 72% of the land to win.
 *
 * Pure simulation (no DOM): the component runs `step` ten times a second and draws from the state. Bots act
 * only through `launchAttack` and `build`, the same calls the player uses, and read only what every player
 * can see: the map, each nation's land and troop totals, and their own gold.
 */

export type MapSize = "small" | "medium" | "large";
export type Difficulty = "easy" | "normal" | "hard";
export type Personality = "settler" | "raider" | "warden" | "rival";
export type Building = "city" | "post";
export type Settings = { size: MapSize; bots: number; difficulty: Difficulty };

export const MAP_SIZES: Record<MapSize, { w: number; h: number; label: string; hint: string }> = {
  small: { w: 120, h: 80, label: "Small", hint: "A quick match, about 5–10 minutes" },
  medium: { w: 170, h: 112, label: "Medium", hint: "Room to maneuver, about 10–15 minutes" },
  large: { w: 230, h: 150, label: "Large", hint: "A long campaign, 15 minutes or more" },
};
export const BOT_COUNTS = [2, 3, 4, 5, 6, 7] as const;
export const DIFFICULTIES: Record<Difficulty, { label: string; hint: string; think: number }> = {
  easy: { label: "Easy", hint: "Bots react slowly and attack with small forces.", think: 2.6 },
  normal: { label: "Normal", hint: "Bots react steadily and pick sensible fights.", think: 1.5 },
  hard: { label: "Hard", hint: "Bots react fast and time attacks to keep their troops growing.", think: 0.85 },
};
export const PERSONALITIES: Record<Personality, { label: string; hint: string }> = {
  settler: { label: "Settler", hint: "Claims open land first and fights mostly for its borders." },
  raider: { label: "Raider", hint: "Hunts its weakest neighbor as soon as it has the troops." },
  warden: { label: "Warden", hint: "Fortifies with Defense Posts and Cities, then strikes at full strength." },
  rival: { label: "Rival", hint: "Goes after whoever leads the map, which is often you." },
};

/** The verified win condition: hold this share of the land. */
export const WIN_SHARE = 0.72;
/** Retreating returns the attack's troops minus this share. */
export const RETREAT_COST = 0.25;
export const TICK_SECONDS = 0.1;
export const MIN_ATTACK = 40;

export const WATER = 0;
export const PLAINS = 1;
export const HILLS = 2;
export const MOUNTAINS = 3;
/** Troops per tile and slowness, by terrain. */
export const TERRAIN_COST = [0, 1, 1.6, 2.4];
export const TERRAIN_LABEL = ["Water", "Plains", "Hills", "Mountains"];

export const CITY_TROOPS = 6000;
export const POST_RADIUS = 7;
export const POST_DEFENSE = 1.8;
export const cityCost = (cities: number) => Math.round(3000 * 1.6 ** cities);
export const postCost = (posts: number) => Math.round(1800 * 1.4 ** posts);

const COLORS = ["#5b8cff", "#ff6b4a", "#2fcf8f", "#f5c542", "#e05cff", "#36d6e7", "#ff8fb8", "#9be15d"];
const BOT_NAMES = ["Vael Dominion", "Korrin Reach", "Sable March", "Ostra League", "Thane Holds", "Myrr Expanse", "Cindral Pact"];
const PERSONALITY_ORDER: Personality[] = ["settler", "raider", "rival", "warden", "raider", "settler", "rival"];

export type Nation = {
  id: number;
  name: string;
  color: string;
  human: boolean;
  personality: Personality | null;
  troops: number;
  gold: number;
  tiles: number;
  cities: number;
  posts: number;
  alive: boolean;
  /** Best share of the land ever held. */
  peak: number;
  /** Label position (territory centroid), refreshed once a second. */
  cx: number;
  cy: number;
  nextThink: number;
};

export type Attack = {
  id: number;
  from: number;
  /** 0 = neutral land. */
  to: number;
  troops: number;
  /** Target tiles on the shared border, in the order they'll be taken (nearest the aimed point first). */
  frontier: number[];
  queued: Set<number>;
  head: number;
  /** Where it was aimed, for the arrow. */
  aim: number;
};

export type GameEvent =
  | { kind: "eliminated"; nation: number; by: number }
  | { kind: "attack-ended"; attack: number; from: number; to: number; returned: number }
  | { kind: "captured-building"; from: number; to: number; building: Building };

export type Outcome = { winner: number | null; reason: "share" | "conquered" };

export type Game = {
  w: number;
  h: number;
  settings: Settings;
  terrain: Uint8Array;
  owner: Uint8Array;
  /** 0 none, 1 city, 2 defense post. */
  building: Uint8Array;
  landTiles: number;
  nations: Nation[];
  attacks: Attack[];
  nextAttackId: number;
  time: number;
  /** Tiles whose look changed since the renderer last took them. */
  dirty: number[];
  events: GameEvent[];
  outcome: Outcome | null;
  rng: () => number;
};

/* ------------------------------------------------------------------------------------------- Random */

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

/** Smooth value noise: random values on a coarse grid, blended with smoothstep. */
function valueNoise(rng: () => number, cells: number, w: number, h: number) {
  const gw = cells + 1;
  const gh = Math.ceil((cells * h) / w) + 1;
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

/* ------------------------------------------------------------------------------------------- Map */

/** One continent of plains, hills and mountains in a sea; every land tile is reachable over land. */
function generateMap(w: number, h: number, rng: () => number) {
  const octaves = [valueNoise(rng, 4, w, h), valueNoise(rng, 8, w, h), valueNoise(rng, 16, w, h), valueNoise(rng, 32, w, h)];
  const relief = [valueNoise(rng, 6, w, h), valueNoise(rng, 14, w, h)];
  const size = w * h;
  const shape = new Float32Array(size);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const noise = octaves[0](x, y) * 0.5 + octaves[1](x, y) * 0.25 + octaves[2](x, y) * 0.15 + octaves[3](x, y) * 0.1;
      const dx = (x / (w - 1)) * 2 - 1;
      const dy = (y / (h - 1)) * 2 - 1;
      const falloff = 1 - Math.min(1, Math.sqrt(dx * dx * 0.85 + dy * dy * 0.85));
      shape[y * w + x] = noise * 0.55 + falloff * 0.75;
    }
  }
  // Land is the top 58% of the shape (before trimming islands), so every map has a similar amount.
  const sorted = Float32Array.from(shape).sort();
  const level = sorted[Math.floor(size * 0.42)];
  const terrain = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = i % w;
    const y = (i / w) | 0;
    if (shape[i] < level || x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
    const height = relief[0](x, y) * 0.65 + relief[1](x, y) * 0.35 + (shape[i] - level) * 0.6;
    terrain[i] = height > 0.78 ? MOUNTAINS : height > 0.62 ? HILLS : PLAINS;
  }
  // Keep only the largest landmass (no boats in this game, so islands would be unreachable).
  const component = new Int32Array(size).fill(-1);
  let best = -1;
  let bestSize = 0;
  const stack: number[] = [];
  let label = 0;
  for (let i = 0; i < size; i += 1) {
    if (terrain[i] === WATER || component[i] !== -1) continue;
    let count = 0;
    component[i] = label;
    stack.push(i);
    while (stack.length) {
      const t = stack.pop()!;
      count += 1;
      for (const n of neighbors(t, w, h)) {
        if (terrain[n] !== WATER && component[n] === -1) {
          component[n] = label;
          stack.push(n);
        }
      }
    }
    if (count > bestSize) {
      bestSize = count;
      best = label;
    }
    label += 1;
  }
  for (let i = 0; i < size; i += 1) if (terrain[i] !== WATER && component[i] !== best) terrain[i] = WATER;
  return { terrain, land: bestSize };
}

const NEIGHBOR_BUFFER = [0, 0, 0, 0];
/** The up-to-four orthogonal neighbors of a tile (reuses one array: copy it if you keep it). */
export function neighbors(t: number, w: number, h: number) {
  const x = t % w;
  let n = 0;
  if (x > 0) NEIGHBOR_BUFFER[n++] = t - 1;
  if (x < w - 1) NEIGHBOR_BUFFER[n++] = t + 1;
  if (t >= w) NEIGHBOR_BUFFER[n++] = t - w;
  if (t < w * (h - 1)) NEIGHBOR_BUFFER[n++] = t + w;
  NEIGHBOR_BUFFER.length = n;
  return NEIGHBOR_BUFFER;
}

/* ------------------------------------------------------------------------------------------- Setup */

export function createGame(settings: Settings, seed: number): Game {
  const { w, h } = MAP_SIZES[settings.size];
  const rng = seededRandom(seed);
  const { terrain, land } = generateMap(w, h, rng);
  const nations: Nation[] = [
    // Index 0 is "nobody": neutral land.
    { id: 0, name: "Neutral land", color: "#000", human: false, personality: null, troops: 0, gold: 0, tiles: 0, cities: 0, posts: 0, alive: false, peak: 0, cx: 0, cy: 0, nextThink: 0 },
  ];
  const count = settings.bots + 1;
  for (let id = 1; id <= count; id += 1) {
    const human = id === 1;
    nations.push({
      id,
      name: human ? "You" : BOT_NAMES[id - 2],
      color: COLORS[id - 1],
      human,
      personality: human ? null : PERSONALITY_ORDER[id - 2],
      troops: 2500,
      gold: 800,
      tiles: 0,
      cities: 0,
      posts: 0,
      alive: true,
      peak: 0,
      cx: 0,
      cy: 0,
      nextThink: 2 + rng() * 2,
    });
  }
  const game: Game = {
    w,
    h,
    settings,
    terrain,
    owner: new Uint8Array(w * h),
    building: new Uint8Array(w * h),
    landTiles: land,
    nations,
    attacks: [],
    nextAttackId: 1,
    time: 0,
    dirty: [],
    events: [],
    outcome: null,
    rng,
  };
  placeSpawns(game);
  refreshCentroids(game);
  return game;
}

/** Spread the starting territories: each spawn is the land tile farthest from those already placed. */
function placeSpawns(game: Game) {
  const { w, h, terrain } = game;
  const land: number[] = [];
  for (let i = 0; i < w * h; i += 1) if (terrain[i] === PLAINS && !nearWater(game, i, 3)) land.push(i);
  const pool = land.length ? land : Array.from({ length: w * h }, (_, i) => i).filter((i) => terrain[i] !== WATER);
  const spawns: number[] = [pool[Math.floor(game.rng() * pool.length)]];
  while (spawns.length < game.nations.length - 1) {
    let best = pool[0];
    let bestDistance = -1;
    // Sample for speed on large maps; plenty for a good spread.
    for (let s = 0; s < 400; s += 1) {
      const candidate = pool[Math.floor(game.rng() * pool.length)];
      const cx = candidate % w;
      const cy = (candidate / w) | 0;
      let nearest = Infinity;
      for (const spawn of spawns) nearest = Math.min(nearest, (cx - (spawn % w)) ** 2 + (cy - ((spawn / w) | 0)) ** 2);
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
    }
    spawns.push(best);
  }
  // The player's start is a random one of the spread spots, so it isn't always in the same place.
  spawns.forEach((spawn, index) => claimDisc(game, index + 1, spawn, 3));
}

function nearWater(game: Game, t: number, radius: number) {
  const { w, h, terrain } = game;
  const x = t % w;
  const y = (t / w) | 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || terrain[ny * w + nx] === WATER) return true;
    }
  }
  return false;
}

function claimDisc(game: Game, nation: number, center: number, radius: number) {
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
      if (game.terrain[t] !== WATER && game.owner[t] === 0) setOwner(game, t, nation);
    }
  }
}

/* ------------------------------------------------------------------------------------------- Rules */

export const maxTroops = (nation: Nation) => 1500 + nation.tiles * 45 + nation.cities * CITY_TROOPS;
export const goldPerSecond = (nation: Nation) => 8 + nation.tiles * 0.35;
export const share = (game: Game, nation: Nation) => nation.tiles / game.landTiles;
/** Troops committed to this nation's running attacks. */
export const troopsAttacking = (game: Game, nation: number) => game.attacks.reduce((sum, attack) => (attack.from === nation ? sum + attack.troops : sum), 0);

function setOwner(game: Game, t: number, nation: number) {
  const before = game.owner[t];
  if (before === nation) return;
  const nations = game.nations;
  if (before) {
    nations[before].tiles -= 1;
    if (game.building[t] === 1) nations[before].cities -= 1;
    if (game.building[t] === 2) nations[before].posts -= 1;
  }
  game.owner[t] = nation;
  if (nation) {
    nations[nation].tiles += 1;
    // Buildings change hands with the land.
    if (game.building[t] === 1) nations[nation].cities += 1;
    if (game.building[t] === 2) nations[nation].posts += 1;
    if (before && game.building[t]) game.events.push({ kind: "captured-building", from: before, to: nation, building: game.building[t] === 1 ? "city" : "post" });
  }
  game.dirty.push(t);
}

/** Whether a Defense Post of the tile's owner covers it. */
function defended(game: Game, t: number) {
  const owner = game.owner[t];
  if (!owner || game.nations[owner].posts === 0) return false;
  const { w, h } = game;
  const x = t % w;
  const y = (t / w) | 0;
  for (let dy = -POST_RADIUS; dy <= POST_RADIUS; dy += 1) {
    const ny = y + dy;
    if (ny < 0 || ny >= h) continue;
    for (let dx = -POST_RADIUS; dx <= POST_RADIUS; dx += 1) {
      const nx = x + dx;
      if (nx < 0 || nx >= w || dx * dx + dy * dy > POST_RADIUS * POST_RADIUS) continue;
      const n = ny * w + nx;
      if (game.building[n] === 2 && game.owner[n] === owner) return true;
    }
  }
  return false;
}

function bordersNation(game: Game, t: number, nation: number) {
  for (const n of neighbors(t, game.w, game.h)) if (game.owner[n] === nation) return true;
  return false;
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Send `ratio` of a nation's troops at the region owning `target` (neutral land or another nation). The attack
 * takes border tiles nearest the aimed point first. Joining an attack you already have adds to it; attacking a
 * nation that is attacking you first cancels the two forces against each other.
 */
export function launchAttack(game: Game, from: number, target: number, ratio: number): ActionResult {
  const attacker = game.nations[from];
  if (!attacker.alive || game.outcome) return { ok: false, message: "The match is over." };
  if (game.terrain[target] === WATER) return { ok: false, message: "That's water. Aim at land." };
  const to = game.owner[target];
  if (to === from) return { ok: false, message: "That's already your land. Aim beyond your border." };
  const troops = Math.floor(attacker.troops * Math.min(1, Math.max(0, ratio)));
  if (troops < MIN_ATTACK) return { ok: false, message: "Not enough troops. Wait for them to grow, or raise the attack ratio." };

  // Every tile of the target that touches our land, nearest the aim first.
  const { w, owner } = game;
  const ax = target % w;
  const ay = (target / w) | 0;
  const front: number[] = [];
  for (let t = 0; t < owner.length; t += 1) {
    if (owner[t] === to && game.terrain[t] !== WATER && bordersNation(game, t, from)) front.push(t);
  }
  if (!front.length) return { ok: false, message: `You don't border ${to ? game.nations[to].name : "that land"}. Expand toward it first.` };
  const distance = (t: number) => ((t % w) - ax) ** 2 + (((t / w) | 0) - ay) ** 2;
  front.sort((a, b) => distance(a) - distance(b));

  attacker.troops -= troops;
  let force = troops;

  // Two nations attacking each other: the forces meet and the smaller is spent.
  const opposing = to ? game.attacks.find((attack) => attack.from === to && attack.to === from) : undefined;
  if (opposing) {
    const clash = Math.min(opposing.troops, force);
    opposing.troops -= clash;
    force -= clash;
    if (opposing.troops <= 0) endAttack(game, opposing, 0);
    if (force <= 0) return { ok: true, message: `Your ${troops.toLocaleString("en")} troops met ${game.nations[to].name}'s attack and stopped it.` };
  }

  const existing = game.attacks.find((attack) => attack.from === from && attack.to === to);
  const name = to ? game.nations[to].name : "neutral land";
  if (existing) {
    existing.troops += force;
    existing.aim = target;
    // Re-aim: the new border tiles go first.
    const fresh = front.filter((t) => !existing.queued.has(t));
    for (const t of fresh) existing.queued.add(t);
    existing.frontier = [...fresh, ...existing.frontier.slice(existing.head)];
    existing.head = 0;
    return { ok: true, message: `Reinforced your attack on ${name} with ${force.toLocaleString("en")} troops.` };
  }
  game.attacks.push({ id: game.nextAttackId++, from, to, troops: force, frontier: front, queued: new Set(front), head: 0, aim: target });
  return { ok: true, message: `Attacking ${name} with ${force.toLocaleString("en")} troops.` };
}

/** Call an attack back: its troops come home, minus the retreat cost. */
export function retreat(game: Game, attackId: number, from: number): ActionResult {
  const attack = game.attacks.find((entry) => entry.id === attackId && entry.from === from);
  if (!attack) return { ok: false, message: "That attack has already ended." };
  const returned = Math.floor(attack.troops * (1 - RETREAT_COST));
  endAttack(game, attack, returned);
  return { ok: true, message: `Retreated: ${returned.toLocaleString("en")} troops came home (25% were lost).` };
}

function endAttack(game: Game, attack: Attack, returned: number) {
  game.attacks = game.attacks.filter((entry) => entry !== attack);
  const nation = game.nations[attack.from];
  if (nation.alive && returned > 0) nation.troops += returned;
  game.events.push({ kind: "attack-ended", attack: attack.id, from: attack.from, to: attack.to, returned });
}

export function build(game: Game, nation: number, t: number, kind: Building): ActionResult {
  const owner = game.nations[nation];
  if (game.outcome) return { ok: false, message: "The match is over." };
  if (game.owner[t] !== nation) return { ok: false, message: "Build on your own land." };
  if (game.building[t]) return { ok: false, message: "There's already a building there." };
  const cost = kind === "city" ? cityCost(owner.cities) : postCost(owner.posts);
  if (owner.gold < cost) return { ok: false, message: `Not enough gold: ${kind === "city" ? "a City" : "a Defense Post"} costs ${cost.toLocaleString("en")}.` };
  owner.gold -= cost;
  game.building[t] = kind === "city" ? 1 : 2;
  if (kind === "city") owner.cities += 1;
  else owner.posts += 1;
  game.dirty.push(t);
  return { ok: true, message: kind === "city" ? `City built: your troop cap rose by ${CITY_TROOPS.toLocaleString("en")}.` : "Defense Post built: nearby land is now costlier and slower to take." };
}

/* ------------------------------------------------------------------------------------------- Simulation */

/** One tick (0.1 s): economy, every attack's progress, bots, then the win and elimination checks. */
export function step(game: Game) {
  if (game.outcome) return;
  const dt = TICK_SECONDS;
  game.time += dt;

  for (const nation of game.nations) {
    if (!nation.alive) continue;
    const cap = maxTroops(nation);
    if (nation.troops < cap) {
      // Growth is fastest around 40% of the cap and slows to nothing at the cap.
      const fill = nation.troops / cap;
      nation.troops = Math.min(cap, nation.troops + cap * 0.065 * (0.15 + fill) * (1 - fill) * dt);
    } else {
      nation.troops -= (nation.troops - cap) * 0.1 * dt;
    }
    nation.gold += goldPerSecond(nation) * dt;
  }

  // Iterate a copy, skipping attacks another attack ended this tick (e.g. by eliminating their target),
  // so no attack is advanced, or refunded, after it ended.
  for (const attack of [...game.attacks]) if (game.attacks.includes(attack)) advanceAttack(game, attack);

  for (const nation of game.nations) {
    if (!nation.alive || nation.human || game.time < nation.nextThink) continue;
    nation.nextThink = game.time + DIFFICULTIES[game.settings.difficulty].think * (0.8 + game.rng() * 0.4);
    think(game, nation);
  }

  if (Math.round(game.time * 10) % 10 === 0) refreshCentroids(game);
  checkOutcome(game);
}

function advanceAttack(game: Game, attack: Attack) {
  const defender = attack.to ? game.nations[attack.to] : null;
  // Bigger forces cover more of the front per tick; fighting a nation is slower than claiming open land.
  let budget = defender ? Math.min(8, 1 + attack.troops / 1500) : Math.min(14, 1 + attack.troops / 600);
  while (budget > 0) {
    let t = -1;
    while (attack.head < attack.frontier.length) {
      const candidate = attack.frontier[attack.head++];
      attack.queued.delete(candidate);
      if (game.owner[candidate] === attack.to && bordersNation(game, candidate, attack.from)) {
        t = candidate;
        break;
      }
    }
    if (t === -1) {
      endAttack(game, attack, attack.troops);
      return;
    }
    const terrain = TERRAIN_COST[game.terrain[t]];
    const fortified = defender ? defended(game, t) : false;
    let cost: number;
    if (defender) {
      const density = defender.troops / Math.max(1, defender.tiles);
      cost = terrain * (25 + density * 1.2) * (fortified ? POST_DEFENSE : 1);
    } else {
      cost = 18 * terrain;
    }
    if (attack.troops < cost) {
      // Out of strength: this tile goes back on the front for a later attack, the rest come home.
      endAttack(game, attack, attack.troops);
      return;
    }
    attack.troops -= cost;
    if (defender) defender.troops = Math.max(0, defender.troops - (defender.troops / Math.max(1, defender.tiles)) * 0.9);
    setOwner(game, t, attack.from);
    for (const n of neighbors(t, game.w, game.h)) {
      if (game.owner[n] === attack.to && game.terrain[n] !== WATER && !attack.queued.has(n)) {
        attack.queued.add(n);
        attack.frontier.push(n);
      }
    }
    // Keep the queue from growing without bound on long attacks.
    if (attack.head > 4096) {
      attack.frontier = attack.frontier.slice(attack.head);
      attack.head = 0;
    }
    budget -= terrain * (fortified ? 2 : 1);
    if (defender && defender.tiles === 0) eliminate(game, defender, attack.from);
  }
}

function eliminate(game: Game, nation: Nation, by: number) {
  if (!nation.alive) return;
  nation.alive = false;
  nation.troops = 0;
  // Its attacks die with it, and attacks aimed at it have nothing left to take.
  for (const attack of [...game.attacks]) {
    if (attack.from === nation.id) game.attacks = game.attacks.filter((entry) => entry !== attack);
    else if (attack.to === nation.id) endAttack(game, attack, attack.troops);
  }
  game.events.push({ kind: "eliminated", nation: nation.id, by });
}

function checkOutcome(game: Game) {
  for (const nation of game.nations) {
    if (!nation.alive) continue;
    const held = share(game, nation);
    nation.peak = Math.max(nation.peak, held);
    if (held >= WIN_SHARE) {
      game.outcome = { winner: nation.id, reason: "share" };
      return;
    }
  }
  if (!game.nations[1].alive) game.outcome = { winner: null, reason: "conquered" };
}

function refreshCentroids(game: Game) {
  const sums = game.nations.map(() => [0, 0, 0]);
  const { w, owner } = game;
  for (let t = 0; t < owner.length; t += 1) {
    const o = owner[t];
    if (!o) continue;
    sums[o][0] += t % w;
    sums[o][1] += (t / w) | 0;
    sums[o][2] += 1;
  }
  for (const nation of game.nations) {
    const [x, y, count] = sums[nation.id];
    if (count) {
      nation.cx = x / count;
      nation.cy = y / count;
    }
  }
}

/* ------------------------------------------------------------------------------------------- Bots */

type Contacts = { count: Int32Array; sample: Int32Array; size: number; border: Int32Array };

/** Who touches whom, from one pass over the map: border lengths and one target tile per pair. */
function readContacts(game: Game): Contacts {
  const size = game.nations.length;
  const count = new Int32Array(size * size);
  const sample = new Int32Array(size * size).fill(-1);
  const border = new Int32Array(size).fill(-1);
  const { w, h, owner, terrain } = game;
  for (let t = 0; t < owner.length; t += 1) {
    if (terrain[t] === WATER) continue;
    const a = owner[t];
    const x = t % w;
    const pairs = [x < w - 1 ? t + 1 : -1, t < w * (h - 1) ? t + w : -1];
    for (const n of pairs) {
      if (n < 0 || terrain[n] === WATER) continue;
      const b = owner[n];
      if (a === b) continue;
      // a's land touches b at n, and b's land touches a at t.
      if (a) {
        count[a * size + b] += 1;
        if (sample[a * size + b] === -1 || game.rng() < 0.05) sample[a * size + b] = n;
        if (border[a] === -1 || game.rng() < 0.02) border[a] = t;
      }
      if (b) {
        count[b * size + a] += 1;
        if (sample[b * size + a] === -1 || game.rng() < 0.05) sample[b * size + a] = t;
        if (border[b] === -1 || game.rng() < 0.02) border[b] = n;
      }
    }
  }
  return { count, sample, size, border };
}

let contactCache: { time: number; game: Game; contacts: Contacts } | null = null;
function contactsFor(game: Game) {
  if (!contactCache || contactCache.game !== game || contactCache.time !== game.time) contactCache = { time: game.time, game, contacts: readContacts(game) };
  return contactCache.contacts;
}

/** A tile of the nation's land with no border, for a City out of harm's way. */
function interiorTile(game: Game, nation: number) {
  const { owner, building } = game;
  for (let tries = 0; tries < 300; tries += 1) {
    const t = Math.floor(game.rng() * owner.length);
    if (owner[t] !== nation || building[t]) continue;
    let inside = true;
    for (const n of neighbors(t, game.w, game.h)) if (owner[n] !== nation) inside = false;
    if (inside) return t;
  }
  return -1;
}

/** A bot's turn: the same economy, attacks and buildings the player has, chosen by its personality. */
function think(game: Game, nation: Nation) {
  const difficulty = game.settings.difficulty;
  const contacts = contactsFor(game);
  const { count, sample, size } = contacts;
  const me = nation.id;
  const cap = maxTroops(nation);
  const fill = nation.troops / cap;
  const personality = nation.personality ?? "settler";

  // Easy bots sometimes just sit a turn out.
  if (difficulty === "easy" && game.rng() < 0.3) return;

  // Buildings: Wardens fortify first; everyone builds Cities once their troops are pressing the cap.
  const threatened = game.attacks.some((attack) => attack.to === me);
  if (personality === "warden" || threatened) {
    const facing = strongestNeighbor(game, contacts, me);
    if (facing && nation.gold >= postCost(nation.posts) && nation.posts < 1 + nation.tiles / 400) {
      const spot = sample[facing * size + me];
      if (spot >= 0 && game.owner[spot] === me && !game.building[spot]) build(game, me, spot, "post");
    }
  }
  if (nation.gold >= cityCost(nation.cities) * (personality === "warden" ? 1 : 1.25) && fill > 0.7) {
    const spot = interiorTile(game, me);
    if (spot >= 0) build(game, me, spot, "city");
  }

  // Attacks: wait until the troops are worth sending, then pick a target.
  const ownAttacks = game.attacks.filter((attack) => attack.from === me).length;
  const threshold = { easy: 0.75, normal: 0.6, hard: 0.52 }[difficulty] + (personality === "warden" ? 0.25 : 0) - (personality === "raider" ? 0.08 : 0);
  if (ownAttacks >= (difficulty === "hard" ? 3 : 2) || fill < Math.min(0.95, threshold)) return;

  const openLand = count[me * size + 0] > 0;
  const neighborsList: Nation[] = [];
  for (const other of game.nations) if (other.alive && other.id !== me && count[me * size + other.id] > 0) neighborsList.push(other);
  const density = (other: Nation) => other.troops / Math.max(1, other.tiles);

  let target = 0;
  if (personality === "settler") {
    target = openLand ? 0 : weakest(neighborsList, density);
  } else if (personality === "raider") {
    const prey = weakest(neighborsList, density);
    target = prey && (nation.troops * 0.5 > game.nations[prey].troops * 0.45 || !openLand) ? prey : 0;
  } else if (personality === "rival") {
    const leader = game.nations.filter((other) => other.alive && other.id !== me).sort((a, b) => b.tiles - a.tiles)[0];
    const leading = leader && neighborsList.includes(leader) && leader.tiles > nation.tiles * 0.9;
    target = leading ? leader.id : openLand ? 0 : weakest(neighborsList, density);
  } else {
    // Warden: open land first; a neighbor only at full strength and with an edge in troops.
    const prey = weakest(neighborsList, density);
    target = openLand ? 0 : prey && fill > 0.9 && nation.troops > game.nations[prey].troops * 1.2 ? prey : 0;
    if (!openLand && !target) return;
  }
  if (target === 0 && !openLand) target = weakest(neighborsList, density);
  if (target === 0 && !openLand) return;

  const aim = sample[me * size + target];
  if (aim < 0) return;
  // Hard bots spend down to about 40% of the cap, where growth is fastest; easier bots send fixed shares.
  const ratio =
    difficulty === "hard"
      ? Math.min(0.65, Math.max(0.2, (fill - 0.4) / fill))
      : difficulty === "normal"
        ? 0.35 + (personality === "raider" ? 0.1 : 0)
        : 0.25;
  launchAttack(game, me, aim, ratio);
}

function weakest(list: Nation[], density: (nation: Nation) => number) {
  let best = 0;
  let bestValue = Infinity;
  for (const other of list) {
    const value = density(other);
    if (value < bestValue) {
      bestValue = value;
      best = other.id;
    }
  }
  return best;
}

function strongestNeighbor(game: Game, contacts: Contacts, me: number) {
  let best = 0;
  let bestTroops = -1;
  for (const other of game.nations) {
    if (!other.alive || other.id === me || contacts.count[me * contacts.size + other.id] === 0) continue;
    if (other.troops > bestTroops) {
      bestTroops = other.troops;
      best = other.id;
    }
  }
  return best;
}

/* ------------------------------------------------------------------------------------------- Score */

/**
 * The record: a victory scores by difficulty, map size and bot count, more for a faster win; a defeat scores
 * the best share of the land you held (so any victory beats any defeat).
 */
export function matchScore(game: Game) {
  const player = game.nations[1];
  if (game.outcome?.winner !== 1) return Math.round(player.peak * 1000);
  const { difficulty, size, bots } = game.settings;
  const base = 2000 * { easy: 1, normal: 1.6, hard: 2.4 }[difficulty] * { small: 1, medium: 1.2, large: 1.4 }[size] * (0.7 + bots * 0.15);
  const pace = Math.max(0.5, 1.5 - game.time / 1200);
  return Math.round(base * pace);
}
