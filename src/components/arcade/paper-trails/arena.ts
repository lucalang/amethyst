/**
 * Paper Trails simulation: no drawing, no DOM. The arena is a square grid of cells; each cell has an owner
 * (or none) and may hold one exposed trail. Pieces move continuously and steer smoothly; the grid decides
 * every rule:
 *
 * - Territory: standing in your own land is safe. Leaving it lays an exposed trail on every cell you cross.
 * - Capture: re-entering your land turns your trail into land, then every cell your land and trail fence off
 *   from the arena's outer edge becomes yours too, including other players' land (overlapping land always
 *   goes to the newest claim). The arena edge never closes a loop on its own.
 * - Trails: crossing anyone's exposed trail eliminates its owner, even inside your own land. Crossing your own
 *   trail eliminates you.
 * - Heads: two pieces meeting head-on outside their land are both eliminated; inside your own land you are safe
 *   and the visitor is eliminated.
 * - Losing all your land eliminates you. Eliminated players' land and trail return to blank paper.
 * - Boundary: the arena edge is a wall you slide along. It never eliminates anyone.
 */

export const ARENA = 64;
export const PLAYER_SPEED = 6.2;
export const BOT_SPEED = 5.7;
export const TURN_RATE = 7.5;
/** The most recent trail cells you can brush past while turning without crossing your own trail. */
const SELF_GRACE = 5;
const SPAWN_RADIUS = 2.6;
export const WIN_SHARE = 0.5;
export const BOT_COUNT = 7;

export type DeathReason = "cut" | "self" | "head" | "erased";

export type Racer = {
  id: number;
  name: string;
  bot: boolean;
  alive: boolean;
  x: number;
  y: number;
  angle: number;
  /** Where the piece wants to face; it turns toward it at TURN_RATE. */
  target: number;
  speed: number;
  cell: number;
  /** Exposed trail cells, oldest first. */
  trail: number[];
  /** The drawn trail: where it left land, then the path since. */
  points: { x: number; y: number }[];
  /** Land cells owned. */
  land: number;
  kills: number;
  respawnAt: number;
  /** Bumped whenever the piece (re)spawns, so effects can tell lives apart. */
  life: number;
  brain: Brain | null;
};

type Brain = {
  mode: "home" | "out" | "back" | "hunt";
  waypoints: { x: number; y: number }[];
  budget: number;
  boldness: number;
  thinkAt: number;
  huntCell: number;
};

export type ArenaEvent =
  | { type: "capture"; id: number; cells: number[]; x: number; y: number }
  | { type: "eliminated"; id: number; by: number; reason: DeathReason; x: number; y: number }
  | { type: "spawn"; id: number }
  | { type: "leave"; id: number };

export type Arena = {
  size: number;
  owner: Int8Array;
  trail: Int8Array;
  racers: Racer[];
  time: number;
  rng: () => number;
  events: ArenaEvent[];
  /** Owners whose land changed since the renderer last looked (-1 never appears). */
  dirty: Set<number>;
  names: string[];
};

const BOT_NAMES = [
  "Doodle",
  "Smudge",
  "Inky",
  "Crumple",
  "Scribble",
  "Quill",
  "Blot",
  "Crayon",
  "Sketch",
  "Stencil",
  "Pulp",
  "Origami",
  "Pencil",
  "Tracer",
  "Confetti",
  "Papier",
  "Margin",
  "Eraser",
  "Glue Stick",
  "Staple",
];

/** A small seeded generator (mulberry32), so Wager rounds give both players the same opponents. */
export function seededRandom(seed: string | number) {
  let h = typeof seed === "number" ? seed >>> 0 : 2166136261;
  if (typeof seed === "string") {
    for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idx = (a: Arena, x: number, y: number) => y * a.size + x;

export function createArena(rng: () => number, bots = BOT_COUNT): Arena {
  const size = ARENA;
  const arena: Arena = {
    size,
    owner: new Int8Array(size * size).fill(-1),
    trail: new Int8Array(size * size).fill(-1),
    racers: [],
    time: 0,
    rng,
    events: [],
    dirty: new Set(),
    names: [...BOT_NAMES].sort(() => rng() - 0.5),
  };
  const you = makeRacer(0, "You", false);
  arena.racers.push(you);
  // You start near the middle, facing a random way.
  const sx = Math.floor(size / 2 + (rng() - 0.5) * size * 0.3);
  const sy = Math.floor(size / 2 + (rng() - 0.5) * size * 0.3);
  spawnAt(arena, you, sx, sy);
  for (let i = 0; i < bots; i += 1) {
    const bot = makeRacer(i + 1, nextName(arena), true);
    arena.racers.push(bot);
    if (!trySpawn(arena, bot)) bot.respawnAt = 1 + rng() * 2;
  }
  arena.events = [];
  return arena;
}

function makeRacer(id: number, name: string, bot: boolean): Racer {
  return {
    id,
    name,
    bot,
    alive: false,
    x: 0,
    y: 0,
    angle: 0,
    target: 0,
    speed: bot ? BOT_SPEED : PLAYER_SPEED,
    cell: -1,
    trail: [],
    points: [],
    land: 0,
    kills: 0,
    respawnAt: 0,
    life: 0,
    brain: bot ? { mode: "home", waypoints: [], budget: 0, boldness: 0, thinkAt: 0, huntCell: -1 } : null,
  };
}

function nextName(a: Arena) {
  const name = a.names.shift() ?? "Doodle";
  a.names.push(name);
  return name;
}

function setOwner(a: Arena, c: number, id: number) {
  const previous = a.owner[c];
  if (previous === id) return;
  if (previous >= 0) {
    a.racers[previous].land -= 1;
    a.dirty.add(previous);
  }
  a.owner[c] = id;
  if (id >= 0) {
    a.racers[id].land += 1;
    a.dirty.add(id);
  }
}

function spawnAt(a: Arena, r: Racer, cx: number, cy: number) {
  const reach = Math.ceil(SPAWN_RADIUS);
  for (let y = cy - reach; y <= cy + reach; y += 1) {
    for (let x = cx - reach; x <= cx + reach; x += 1) {
      if (x < 0 || y < 0 || x >= a.size || y >= a.size) continue;
      if (Math.hypot(x - cx, y - cy) <= SPAWN_RADIUS) setOwner(a, idx(a, x, y), r.id);
    }
  }
  r.alive = true;
  r.x = cx + 0.5;
  r.y = cy + 0.5;
  r.angle = a.rng() * Math.PI * 2;
  r.target = r.angle;
  r.cell = idx(a, cx, cy);
  r.trail = [];
  r.points = [];
  r.life += 1;
  if (r.brain) {
    r.brain.mode = "home";
    r.brain.waypoints = [];
    r.brain.boldness = 0.35 + a.rng() * 0.65;
    r.brain.thinkAt = a.time + 0.4 + a.rng() * 0.6;
    r.brain.huntCell = -1;
  }
  a.events.push({ type: "spawn", id: r.id });
}

/** Finds blank paper for a computer opponent, away from every piece. */
function trySpawn(a: Arena, r: Racer) {
  const reach = Math.ceil(SPAWN_RADIUS);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const cx = reach + 1 + Math.floor(a.rng() * (a.size - 2 * reach - 2));
    const cy = reach + 1 + Math.floor(a.rng() * (a.size - 2 * reach - 2));
    if (a.racers.some((o) => o.alive && o.id !== r.id && Math.hypot(o.x - cx, o.y - cy) < 10)) continue;
    let clear = true;
    for (let y = cy - reach - 1; y <= cy + reach + 1 && clear; y += 1) {
      for (let x = cx - reach - 1; x <= cx + reach + 1; x += 1) {
        const c = idx(a, x, y);
        if (a.owner[c] !== -1 || a.trail[c] !== -1) {
          clear = false;
          break;
        }
      }
    }
    if (!clear) continue;
    spawnAt(a, r, cx, cy);
    return true;
  }
  return false;
}

function eliminate(a: Arena, victim: Racer, by: number, reason: DeathReason) {
  if (!victim.alive) return;
  victim.alive = false;
  for (const c of victim.trail) if (a.trail[c] === victim.id) a.trail[c] = -1;
  victim.trail = [];
  victim.points = [];
  for (let c = 0; c < a.owner.length; c += 1) if (a.owner[c] === victim.id) setOwner(a, c, -1);
  victim.respawnAt = a.time + 2.5 + a.rng() * 2.5;
  if (by >= 0 && by !== victim.id) a.racers[by].kills += 1;
  a.events.push({ type: "eliminated", id: victim.id, by, reason, x: victim.x, y: victim.y });
}

/** Turns the trail into land and claims everything it fences off from the arena's edge. */
function capture(a: Arena, r: Racer) {
  const n = a.size;
  const before = new Int8Array(a.owner);
  for (const c of r.trail) {
    if (a.trail[c] === r.id) a.trail[c] = -1;
    setOwner(a, c, r.id);
  }
  r.trail = [];
  r.points = [];
  // Flood the arena from its edge through every cell that isn't ours: whatever the flood can't reach is enclosed.
  const reached = new Uint8Array(n * n);
  const stack: number[] = [];
  const push = (c: number) => {
    if (reached[c] || a.owner[c] === r.id) return;
    reached[c] = 1;
    stack.push(c);
  };
  for (let i = 0; i < n; i += 1) {
    push(i);
    push((n - 1) * n + i);
    push(i * n);
    push(i * n + n - 1);
  }
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % n;
    if (x > 0) push(c - 1);
    if (x < n - 1) push(c + 1);
    if (c >= n) push(c - n);
    if (c < n * (n - 1)) push(c + n);
  }
  const gained: number[] = [];
  let sx = 0;
  let sy = 0;
  for (let c = 0; c < n * n; c += 1) {
    if (!reached[c] && a.owner[c] !== r.id) setOwner(a, c, r.id);
    if (a.owner[c] === r.id && before[c] !== r.id) {
      gained.push(c);
      sx += c % n;
      sy += Math.floor(c / n);
    }
  }
  if (gained.length) a.events.push({ type: "capture", id: r.id, cells: gained, x: sx / gained.length + 0.5, y: sy / gained.length + 0.5 });
  for (const other of a.racers) {
    if (other.alive && other.id !== r.id && other.land <= 0) eliminate(a, other, r.id, "erased");
  }
}

/** The rules for stepping onto a cell (see the header). */
function enter(a: Arena, r: Racer, c: number) {
  const t = a.trail[c];
  if (t >= 0) {
    if (t === r.id) {
      const at = r.trail.lastIndexOf(c);
      if (at >= 0 && at < r.trail.length - SELF_GRACE) {
        eliminate(a, r, r.id, "self");
        return;
      }
    } else {
      eliminate(a, a.racers[t], r.id, "cut");
    }
  }
  if (a.owner[c] === r.id) {
    if (r.trail.length) capture(a, r);
    return;
  }
  if (r.trail.length === 0) {
    r.points = [{ x: r.x, y: r.y }];
    a.events.push({ type: "leave", id: r.id });
  }
  if (a.trail[c] !== r.id) {
    r.trail.push(c);
    a.trail[c] = r.id;
  }
}

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

function move(a: Arena, r: Racer, dt: number) {
  const diff = wrapAngle(r.target - r.angle);
  const turn = TURN_RATE * dt;
  r.angle = wrapAngle(r.angle + Math.max(-turn, Math.min(turn, diff)));
  const lo = 0.5;
  const hi = a.size - 0.5;
  let nx = r.x + Math.cos(r.angle) * r.speed * dt;
  let ny = r.y + Math.sin(r.angle) * r.speed * dt;
  const hitX = nx < lo || nx > hi;
  const hitY = ny < lo || ny > hi;
  if (hitX || hitY) {
    // Slide along the wall at full speed, turning to follow it.
    const cos = Math.cos(r.angle);
    const sin = Math.sin(r.angle);
    let along: number;
    // In a corner, follow the side wall away from it.
    if (hitX && hitY) along = r.y < a.size / 2 ? Math.PI / 2 : -Math.PI / 2;
    else if (hitX) along = Math.abs(sin) > 0.08 ? (sin > 0 ? Math.PI / 2 : -Math.PI / 2) : r.y < a.size / 2 ? Math.PI / 2 : -Math.PI / 2;
    else along = Math.abs(cos) > 0.08 ? (cos > 0 ? 0 : Math.PI) : r.x < a.size / 2 ? 0 : Math.PI;
    r.angle = along;
    // A steer that keeps pushing into the wall follows it instead.
    const into = hitX ? (nx < lo ? Math.PI : 0) : ny < lo ? -Math.PI / 2 : Math.PI / 2;
    if (Math.cos(wrapAngle(r.target - into)) > 0.5) r.target = along;
    nx = Math.min(hi, Math.max(lo, r.x + Math.cos(along) * r.speed * dt));
    ny = Math.min(hi, Math.max(lo, r.y + Math.sin(along) * r.speed * dt));
  }
  const ox = Math.floor(r.x);
  const oy = Math.floor(r.y);
  r.x = nx;
  r.y = ny;
  const cx = Math.floor(nx);
  const cy = Math.floor(ny);
  if (cx === ox && cy === oy) {
    if (r.points.length) {
      const last = r.points[r.points.length - 1];
      if (Math.hypot(last.x - nx, last.y - ny) > 0.3) r.points.push({ x: nx, y: ny });
    }
    return;
  }
  // Diagonal steps pass through a side cell too, so trails stay unbroken and can't be slipped through.
  if (cx !== ox && cy !== oy) {
    const fx = Math.abs(nx - (cx > ox ? cx : ox));
    const fy = Math.abs(ny - (cy > oy ? cy : oy));
    const side = fx > fy ? idx(a, cx, oy) : idx(a, ox, cy);
    enter(a, r, side);
    if (!r.alive) return;
  }
  r.cell = idx(a, cx, cy);
  enter(a, r, r.cell);
  if (r.alive && r.points.length) r.points.push({ x: nx, y: ny });
}

function headOn(a: Arena) {
  const alive = a.racers.filter((r) => r.alive);
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const p = alive[i];
      const q = alive[j];
      if (!p.alive || !q.alive || Math.hypot(p.x - q.x, p.y - q.y) > 0.75) continue;
      const pHome = a.owner[p.cell] === p.id;
      const qHome = a.owner[q.cell] === q.id;
      if (pHome && !qHome) eliminate(a, q, p.id, "head");
      else if (qHome && !pHome) eliminate(a, p, q.id, "head");
      else if (!pHome && !qHome) {
        eliminate(a, p, q.id, "head");
        eliminate(a, q, p.id, "head");
      }
    }
  }
}

/** One fixed simulation step. `frozen` stops your piece (after a run ends) while the world plays on. */
export function stepArena(a: Arena, dt: number, frozen = false) {
  a.time += dt;
  for (const r of a.racers) {
    if (!r.alive) {
      if (r.bot && a.time >= r.respawnAt && r.respawnAt > 0) {
        r.name = nextName(a);
        if (!trySpawn(a, r)) r.respawnAt = a.time + 1;
      }
      continue;
    }
    if (frozen && !r.bot) continue;
    if (r.brain) think(a, r);
    move(a, r, dt);
  }
  headOn(a);
}

export const share = (a: Arena, r: Racer) => r.land / (a.size * a.size);

// ---------------------------------------------------------------------------------------------
// Computer opponents

function nearestOwn(a: Arena, r: Racer) {
  let best = -1;
  let bestD = Infinity;
  const n = a.size;
  for (let c = 0; c < a.owner.length; c += 1) {
    if (a.owner[c] !== r.id) continue;
    const d = Math.abs((c % n) + 0.5 - r.x) + Math.abs(Math.floor(c / n) + 0.5 - r.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { cell: best, distance: bestD };
}

/** How close any rival's head is to this bot's exposed trail. */
function threat(a: Arena, r: Racer) {
  let closest = Infinity;
  const n = a.size;
  for (const o of a.racers) {
    if (!o.alive || o.id === r.id) continue;
    for (let i = 0; i < r.trail.length; i += 2) {
      const c = r.trail[i];
      const d = Math.hypot((c % n) + 0.5 - o.x, Math.floor(c / n) + 0.5 - o.y);
      if (d < closest) closest = d;
    }
  }
  return closest;
}

/** A rival's trail cell this bot can reach before its owner gets home. */
function prey(a: Arena, r: Racer) {
  const n = a.size;
  let best = -1;
  let bestD = 8 * (r.brain?.boldness ?? 0.5) + 2;
  for (const o of a.racers) {
    if (!o.alive || o.id === r.id || o.trail.length < 3) continue;
    const home = nearestOwn(a, o).distance;
    for (let i = 0; i < o.trail.length; i += 2) {
      const c = o.trail[i];
      const d = Math.hypot((c % n) + 0.5 - r.x, Math.floor(c / n) + 0.5 - r.y);
      if (d < bestD && d * (o.speed / r.speed) < home + 1) {
        bestD = d;
        best = c;
      }
    }
  }
  return best;
}

function safeAhead(a: Arena, r: Racer, angle: number) {
  const n = a.size;
  for (const step of [0.7, 1.4, 2.1]) {
    const x = r.x + Math.cos(angle) * step;
    const y = r.y + Math.sin(angle) * step;
    if (x < 0.3 || y < 0.3 || x > n - 0.3 || y > n - 0.3) return false;
    const c = Math.floor(y) * n + Math.floor(x);
    if (a.trail[c] === r.id) {
      const at = r.trail.lastIndexOf(c);
      if (at >= 0 && at < r.trail.length - SELF_GRACE + 1) return false;
    }
  }
  return true;
}

function steerToward(a: Arena, r: Racer, x: number, y: number) {
  const desired = Math.atan2(y - r.y, x - r.x);
  for (let k = 0; k <= 8; k += 1) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const angle = desired + sign * k * 0.32;
      if (safeAhead(a, r, angle)) {
        r.target = angle;
        return;
      }
    }
  }
  r.target = desired;
}

/**
 * The next point on the shortest way home that never touches this bot's own trail, keeping a cell of room
 * where it can (pieces turn in arcs, not on the grid). Null when the trail has sealed it off.
 */
function wayHome(a: Arena, r: Racer) {
  const n = a.size;
  const total = n * n;
  const hard = new Uint8Array(total);
  const recent = r.trail.length - SELF_GRACE;
  for (let i = 0; i < recent; i += 1) hard[r.trail[i]] = 1;
  const hx = Math.floor(r.x);
  const hy = Math.floor(r.y);
  const roomy = Uint8Array.from(hard);
  for (let i = 0; i < recent; i += 1) {
    const c = r.trail[i];
    const cx = c % n;
    const cy = Math.floor(c / n);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= n || y >= n || Math.max(Math.abs(x - hx), Math.abs(y - hy)) <= 1) continue;
        roomy[y * n + x] = 1;
      }
    }
  }
  const parent = new Int32Array(total);
  for (const blocked of [roomy, hard]) {
    parent.fill(-1);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;
    queue[tail++] = r.cell;
    parent[r.cell] = r.cell;
    let goal = -1;
    while (head < tail) {
      const c = queue[head++];
      if (c !== r.cell && a.owner[c] === r.id) {
        goal = c;
        break;
      }
      const x = c % n;
      const next = [x > 0 ? c - 1 : -1, x < n - 1 ? c + 1 : -1, c >= n ? c - n : -1, c < total - n ? c + n : -1];
      for (const d of next) {
        if (d < 0 || parent[d] !== -1 || blocked[d]) continue;
        parent[d] = c;
        queue[tail++] = d;
      }
    }
    if (goal < 0) continue;
    const path = [goal];
    while (path[path.length - 1] !== r.cell) path.push(parent[path[path.length - 1]]);
    path.reverse();
    const aim = path[Math.min(path.length - 1, 2)];
    return { x: (aim % n) + 0.5, y: Math.floor(aim / n) + 0.5 };
  }
  return null;
}

function planExcursion(a: Arena, r: Racer, brain: Brain) {
  const n = a.size;
  // Head out toward open paper, away from the nearest wall.
  let angle = a.rng() * Math.PI * 2;
  for (let i = 0; i < 6; i += 1) {
    const tx = r.x + Math.cos(angle) * 10;
    const ty = r.y + Math.sin(angle) * 10;
    if (tx > 3 && ty > 3 && tx < n - 3 && ty < n - 3) break;
    angle = a.rng() * Math.PI * 2;
  }
  let edge = 0;
  while (edge < 30) {
    const x = Math.floor(r.x + Math.cos(angle) * edge);
    const y = Math.floor(r.y + Math.sin(angle) * edge);
    if (x < 0 || y < 0 || x >= n || y >= n || a.owner[y * n + x] !== r.id) break;
    edge += 1;
  }
  const out = 3 + brain.boldness * 7 + a.rng() * 3;
  const side = 3 + brain.boldness * 8 + a.rng() * 4;
  const turn = a.rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
  const clamp = (v: number) => Math.min(n - 1.5, Math.max(1.5, v));
  const w1 = { x: clamp(r.x + Math.cos(angle) * (edge + out)), y: clamp(r.y + Math.sin(angle) * (edge + out)) };
  const w2 = { x: clamp(w1.x + Math.cos(angle + turn) * side), y: clamp(w1.y + Math.sin(angle + turn) * side) };
  brain.waypoints = [w1, w2];
  brain.budget = Math.round(10 + brain.boldness * 28);
  brain.mode = "out";
}

function think(a: Arena, r: Racer) {
  const brain = r.brain!;
  if (a.time < brain.thinkAt) return;
  brain.thinkAt = a.time + 0.09 + a.rng() * 0.05;
  const n = a.size;
  const home = a.owner[r.cell] === r.id;

  if (home && r.trail.length === 0 && brain.mode !== "out") {
    planExcursion(a, r, brain);
  }

  if (r.trail.length > 0) {
    const back = nearestOwn(a, r);
    const danger = threat(a, r);
    if (danger < back.distance * 0.8 + 3 || r.trail.length > brain.budget) brain.mode = "back";
    if (brain.mode !== "back" && brain.mode !== "hunt") {
      const target = prey(a, r);
      if (target >= 0) {
        brain.mode = "hunt";
        brain.huntCell = target;
      }
    }
  } else if (brain.mode === "back") {
    brain.mode = "home";
  }

  if (brain.mode === "hunt") {
    if (a.trail[brain.huntCell] < 0 || a.trail[brain.huntCell] === r.id) {
      brain.mode = r.trail.length ? "back" : "home";
    } else {
      steerToward(a, r, (brain.huntCell % n) + 0.5, Math.floor(brain.huntCell / n) + 0.5);
      return;
    }
  }

  if (brain.mode === "out") {
    const next = brain.waypoints[0];
    if (!next) {
      brain.mode = "back";
    } else if (Math.hypot(next.x - r.x, next.y - r.y) < 1.2) {
      brain.waypoints.shift();
      if (!brain.waypoints.length) brain.mode = "back";
    } else {
      steerToward(a, r, next.x, next.y);
      return;
    }
  }

  if (brain.mode === "back") {
    // Heading home is when trails get crossed, so look again sooner.
    brain.thinkAt = a.time + 0.05;
    const way = r.trail.length ? wayHome(a, r) : null;
    if (way) r.target = Math.atan2(way.y - r.y, way.x - r.x);
    else {
      const back = nearestOwn(a, r);
      if (back.cell >= 0) steerToward(a, r, (back.cell % n) + 0.5, Math.floor(back.cell / n) + 0.5);
    }
  }
}
