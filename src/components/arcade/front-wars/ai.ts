/**
 * Front Wars rivals: one strategic loop for every Bot and Nation.
 *
 * Each decision runs the same steps in order: look around (a survey of the border, trusted for a few seconds),
 * manage running battles (retreat from lost ones), defend (counterattack or fortify), invest (Cities and Defense
 * Posts), then expand or attack with what's left over a reserve, and only then consider a boat. Targets are
 * weighed by what the attack would cost against what it would gain, using only what the player can see too:
 * the map, buildings, terrain, everyone's land and troops, and the attacks and boats under way. A rival never
 * reads another player's gold and gets no hidden bonuses.
 *
 * Personality changes priorities (how big a reserve, how keen to fight, to fortify, to pounce on a busy
 * neighbor, to sail); difficulty changes judgment (reaction time, how well terrain and walls are read, how
 * attacks are sized, whether to retreat or counterattack).
 */

import {
  PLAINS,
  POST_RADIUS,
  WATER,
  build,
  cityCost,
  defended,
  immune,
  interiorTile,
  launchAttack,
  lossPerTile,
  maxTroops,
  postCost,
  retreat,
  type Attack,
  type AttackReason,
  type Contact,
  type Difficulty,
  type Game,
  type Intel,
  type Nation,
  type Personality,
} from "./engine";

type Level = {
  /** Seconds between decisions (±20%). */
  think: number;
  /** Seconds a survey of the surroundings is trusted before it's redone. */
  intel: number;
  /** How far off the judgment of a target can be (± share). */
  noise: number;
  /** Reads terrain and Defense Posts when sizing up a target (otherwise treats all land as open plains). */
  terrainAware: boolean;
  /** Notices a neighbor's troops tied up in other fights. */
  readsBusy: boolean;
  aggression: number;
  /** Extra reserve kept back, as a share of the troop cap. */
  hoard: number;
  /** Share of the spare troops sent in one attack. */
  spend: number;
  /** 0: always send a fixed share; otherwise send what the target needs, with this margin. */
  sizing: number;
  maxAttacks: number;
  /** 0 never, 1 when an attack is clearly lost, 2 as soon as it turns. */
  retreat: 0 | 1 | 2;
  /** Chance to meet an incoming attack head-on when strong enough. */
  counter: number;
  /** Defense Posts (Nations): only when attacked; also in advance if Defensive; in advance for all. */
  posts: "reactive" | "defensive" | "all";
  /** How far (tiles) a rival looks across the water for a landing. */
  navalRange: number;
  /** Gold kept over a City's price before building one. */
  cityMargin: number;
  /** Bots (small tribes) build: a City once they're established, a Defense Post if Defensive. */
  botBuilds: boolean;
};

export const AI_LEVELS: Record<Difficulty, Level> = {
  easy: { think: 3.2, intel: 8, noise: 0.35, terrainAware: false, readsBusy: false, aggression: 0.85, hoard: 0.15, spend: 0.5, sizing: 0, maxAttacks: 1, retreat: 0, counter: 0.1, posts: "reactive", navalRange: 70, cityMargin: 1.6, botBuilds: false },
  normal: { think: 2, intel: 5, noise: 0.15, terrainAware: true, readsBusy: true, aggression: 1, hoard: 0.05, spend: 0.75, sizing: 1.35, maxAttacks: 2, retreat: 1, counter: 0.25, posts: "defensive", navalRange: 110, cityMargin: 1.15, botBuilds: false },
  hard: { think: 1.1, intel: 3, noise: 0.05, terrainAware: true, readsBusy: true, aggression: 1.1, hoard: 0, spend: 0.9, sizing: 1.15, maxAttacks: 3, retreat: 2, counter: 0.45, posts: "all", navalRange: 150, cityMargin: 1, botBuilds: true },
};

type Persona = {
  /** Troops kept home, as a share of the cap (halved while no strong neighbor is around). */
  reserve: number;
  expand: number;
  aggression: number;
  /** Keenness to hit a neighbor whose troops are busy elsewhere. */
  opportunism: number;
  /** How much other attacks on a target put it off (less dog-piling). */
  crowd: number;
  /** Keenness to hit back at whoever attacked it last. */
  retaliate: number;
  /** How much a strong neighbor raises its reserve. */
  wary: number;
  counter: number;
  city: number;
  post: number;
  /** Chance to look for a landing when there's nothing to do by land. */
  naval: number;
};

const PERSONA: Record<Personality, Persona> = {
  expansionist: { reserve: 0.2, expand: 1.3, aggression: 0.8, opportunism: 1, crowd: 0.8, retaliate: 1.2, wary: 0.8, counter: 0.8, city: 1.4, post: 0.6, naval: 0.6 },
  defensive: { reserve: 0.38, expand: 0.95, aggression: 0.65, opportunism: 0.9, crowd: 1, retaliate: 1.8, wary: 1.3, counter: 1.4, city: 1, post: 1.6, naval: 0.15 },
  opportunist: { reserve: 0.3, expand: 1, aggression: 1, opportunism: 1.8, crowd: 0.3, retaliate: 1, wary: 1, counter: 1, city: 1, post: 0.9, naval: 0.5 },
  warlike: { reserve: 0.24, expand: 0.9, aggression: 1.45, opportunism: 1.2, crowd: 0.7, retaliate: 1.5, wary: 0.9, counter: 1.1, city: 0.8, post: 0.7, naval: 0.45 },
};

/**
 * Scores compare an attack's troops per tile with what a Nation pays for open plains (the same yardstick for
 * everyone), so open land scores about 1 and a fair fight between equals about 0.1–0.3. This is the least worth
 * starting.
 */
const ATTACK_THRESHOLD = 0.2;
const OPEN_LAND = 96;

export function thinkInterval(game: Game) {
  return AI_LEVELS[game.settings.difficulty].think * (0.8 + game.rng() * 0.4);
}

/** Who borders this rival, how long each shared front is, its terrain, and how much of it is fortified. */
function survey(game: Game, nation: Nation): Intel {
  const { w, h, terrain, owner } = game;
  type Tally = Contact & { samples: number; checked: number };
  const found = new Map<number, Tally>();
  const stride = Math.max(1, Math.ceil(nation.border.size / 2500));
  let i = 0;
  for (const b of nation.border) {
    if (i++ % stride) continue;
    const bx = b % w;
    const by = (b / w) | 0;
    let counted = -1;
    const around = [bx > 0 ? b - 1 : -1, bx < w - 1 ? b + 1 : -1, b >= w ? b - w : -1, b < w * (h - 1) ? b + w : -1];
    for (const n of around) {
      if (n < 0 || terrain[n] === WATER) continue;
      const o = owner[n];
      if (o === nation.id || o === counted) continue;
      counted = o;
      let tally = found.get(o);
      if (!tally) {
        tally = { id: o, shared: 0, tile: n, mx: 0, my: 0, terrain: 0, fortified: 0, samples: 0, checked: 0 };
        found.set(o, tally);
      }
      tally.shared += stride;
      tally.mx += bx;
      tally.my += by;
      tally.terrain += [0, 80, 100, 120][terrain[n]];
      tally.samples += 1;
      if (o && tally.samples % 3 === 1) {
        tally.checked += 1;
        if (defended(game, n)) tally.fortified += 1;
      }
      if (game.rng() * tally.samples < 1) tally.tile = n;
    }
  }
  const contacts: Contact[] = [];
  for (const t of found.values()) {
    contacts.push({ id: t.id, shared: t.shared, tile: t.tile, mx: t.mx / t.samples + 0.5, my: t.my / t.samples + 0.5, terrain: t.terrain / t.samples, fortified: t.checked ? t.fortified / t.checked : 0 });
  }
  return { at: game.time, contacts };
}

type Option = { target: number; tile: number; score: number; send: number; min: number; reason: AttackReason; label: string };

/** Weigh an attack on a neighbor: troops it would cost per tile against what open land would cost. */
function weigh(game: Game, nation: Nation, other: Nation, contact: Contact, spare: number, level: Level, persona: Persona, mine: Attack[], pressure: number, cap: number): Option | null {
  const existing = mine.find((attack) => attack.to === other.id);
  // Never feed an attack that's already running dry.
  if (existing?.stalling) return null;
  const magnitude = level.terrainAware ? contact.terrain : 80;
  const fortified = level.terrainAware ? contact.fortified : 0;
  let send = Math.max(0, spare * level.spend);
  const estimate = (troops: number) => lossPerTile(nation, other, troops, PLAINS, false) * (magnitude / 80) * (1 + 4 * fortified);
  let perTile = estimate(send);
  if (level.sizing && send > 0) {
    // Send what the job needs: a small rival whole, a big one a few layers deep along this front. Fewer troops
    // fight worse (the defender outnumbers them), so the estimate is refined once at the smaller size.
    const wanted = Math.min(other.tiles, Math.max(60, contact.shared * 6));
    // And never so few that the defender could simply meet them head-on and cancel the attack.
    const safe = other.troops * 0.75;
    for (let pass = 0; pass < 2; pass += 1) {
      send = Math.min(spare * level.spend, Math.max(perTile * wanted * level.sizing, safe));
      perTile = estimate(send);
    }
  }
  if (existing && existing.troops > send * 0.5) return null;
  // Attacking someone who's attacking us cancels troop for troop first: only worth it if it overwhelms theirs
  // (otherwise meeting them is the defense step's call).
  const theirs = game.attacks.find((attack) => attack.from === other.id && attack.to === nation.id);
  if (theirs && send < theirs.troops * 1.3) return null;
  const tiles = send / Math.max(1, perTile);
  // Troops idling at the cap grow nothing: the fuller a rival is, the more any decent fight is worth.
  let score = (OPEN_LAND / perTile) * persona.aggression * level.aggression * pressure;
  let reason: AttackReason = "opportunity";

  // A stronger neighbor hits back: only worth it if they're tied up.
  if (other.troops > nation.troops) score *= 0.35;
  if (other.troops > nation.troops * 2) score *= 0.3;
  if (level.readsBusy) {
    const out = game.committed[other.id];
    if (out / Math.max(1, other.troops + out) > 0.3) {
      score *= persona.opportunism;
      if (persona.opportunism > 1.1) reason = "busy";
    }
  }
  const density = other.troops / Math.max(1, other.tiles);
  const ours = nation.troops / Math.max(1, nation.tiles);
  if (reason === "opportunity" && density < ours * 0.6) reason = "weak-border";
  if (nation.grudge === other.id && game.time < nation.grudgeUntil) {
    score *= persona.retaliate;
    if (persona.retaliate > 1.1) reason = "retaliation";
  }
  if (tiles >= other.tiles * 0.9) {
    score *= 1.6;
    reason = "finish";
  }
  // An attack the defender could cancel outright is a poor bet (only a careful planner sees this).
  if (level.sizing && send < other.troops * 0.67) score *= 0.5;
  // Short fronts are slow to push; other attackers already on it put a rival off (no dog-piling).
  score *= Math.min(1.3, Math.max(0.5, Math.sqrt(contact.shared) / 5));
  const others = game.targeted[other.id] - (existing ? 1 : 0);
  score /= 1 + Math.max(0, others) * persona.crowd;
  if (nation.avoid === other.id && game.time < nation.avoidUntil) score *= 0.15;
  score *= 1 + (game.rng() * 2 - 1) * level.noise;
  // Big enough to push this whole front a couple of layers: no trickle of tiny assaults.
  const min = Math.max(cap * 0.03, perTile * Math.min(contact.shared, 30) * 1.5);
  return { target: other.id, tile: contact.tile, score, send, min, reason, label: other.name };
}

/** A tile a few steps inside our land from (x, y), toward our middle, not already covered by our own Post. */
function postSpot(game: Game, nation: Nation, x: number, y: number) {
  const { w, h } = game;
  const cx = nation.sx / Math.max(1, nation.tiles);
  const cy = nation.sy / Math.max(1, nation.tiles);
  const length = Math.hypot(cx - x, cy - y) || 1;
  for (const step of [4, 3, 6, 2, 8, 1, 0]) {
    const px = Math.round(x + ((cx - x) / length) * step);
    const py = Math.round(y + ((cy - y) / length) * step);
    if (px < 0 || py < 0 || px >= w || py >= h) continue;
    const t = py * w + px;
    if (game.owner[t] !== nation.id || game.building[t]) continue;
    if (covered(game, nation, px, py)) return -1;
    return t;
  }
  return -1;
}

function covered(game: Game, nation: Nation, x: number, y: number) {
  const reach = POST_RADIUS * 0.6;
  return nation.posts.some((post) => ((post % game.w) - x) ** 2 + (((post / game.w) | 0) - y) ** 2 < reach * reach);
}

/** Some land across the water worth a landing: unclaimed, or a weak player we can't reach by land. */
function overseas(game: Game, nation: Nation, level: Level, persona: Persona, spare: number, reachable: Set<number>) {
  const { w, h } = game;
  const range = level.navalRange * (nation.kind === "bot" ? 0.6 : 1);
  const cx = nation.sx / nation.tiles;
  const cy = nation.sy / nation.tiles;
  let best: { tile: number; value: number; name: string } | null = null;
  for (let k = 0; k < 24; k += 1) {
    const angle = game.rng() * Math.PI * 2;
    const distance = range * (0.25 + 0.75 * game.rng());
    const x = Math.round(cx + Math.cos(angle) * distance);
    const y = Math.round(cy + Math.sin(angle) * distance);
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const t = y * w + x;
    if (game.terrain[t] === WATER) continue;
    const o = game.owner[t];
    if (o === nation.id || reachable.has(o)) continue;
    let value: number;
    if (!o) value = 0.9;
    else {
      const other = game.nations[o];
      if (!other.alive) continue;
      const perTile = lossPerTile(nation, other, spare * 0.6, level.terrainAware ? game.terrain[t] : PLAINS, level.terrainAware && defended(game, t));
      value = (OPEN_LAND / perTile) * persona.aggression;
      if (other.troops > nation.troops * 0.8) value *= 0.3;
    }
    value *= 1 - (distance / range) * 0.4;
    if (!best || value > best.value) best = { tile: t, value, name: o ? game.nations[o].name : "open land" };
  }
  return best && best.value >= 0.3 ? best : null;
}

/** One decision for a Bot or Nation. */
export function think(game: Game, nation: Nation) {
  const level = AI_LEVELS[game.settings.difficulty];
  const persona = PERSONA[nation.personality ?? "expansionist"];
  const bot = nation.kind === "bot";
  const id = nation.id;
  if (!nation.tiles) return;
  if (!nation.intel || game.time - nation.intel.at >= level.intel) nation.intel = survey(game, nation);
  const contacts = nation.intel.contacts.filter((contact) => contact.id === 0 || game.nations[contact.id].alive);
  const cap = maxTroops(game, nation);
  const shielded = immune(game);

  const mine: Attack[] = [];
  const incoming: Attack[] = [];
  let incomingTroops = 0;
  for (const attack of game.attacks) {
    if (attack.from === id) mine.push(attack);
    else if (attack.to === id) {
      incoming.push(attack);
      incomingTroops += attack.troops;
    }
  }
  let boats = 0;
  for (const boat of game.boats) {
    if (boat.from === id) boats += 1;
    else if (game.owner[boat.landing] === id) incomingTroops += boat.troops * 0.8;
  }
  let plan = "";

  // 1. Running battles: pull out of lost fights, or to defend home.
  if (level.retreat) {
    for (const attack of mine) {
      if (!attack.to || attack.troops < cap * 0.03) continue;
      const defender = game.nations[attack.to];
      const lost = attack.stalling && defender.troops > attack.troops * (level.retreat === 2 ? 1.5 : 3);
      const home = incomingTroops > nation.troops * 1.1 && attack.troops > incomingTroops * 0.25;
      if (!lost && !home) continue;
      retreat(game, attack.id, id);
      if (lost) {
        nation.avoid = attack.to;
        nation.avoidUntil = game.time + 30;
      }
      plan = home ? "Pulling troops home to defend" : `Retreating from ${defender.name}`;
    }
  }
  const active = mine.filter((attack) => !attack.done);

  // 2. Defense: meet the biggest incoming attack head-on, or fortify where it's hitting.
  let countered = false;
  const postsAllowed = nation.posts.length < (bot ? 1 : 1 + Math.floor(nation.tiles / 4000));
  if (incoming.length) {
    const main = incoming.reduce((a, b) => (b.troops > a.troops ? b : a));
    const attacker = game.nations[main.from];
    const contact = contacts.find((entry) => entry.id === main.from && game.owner[entry.tile] === main.from);
    // Decided once per attack (not re-rolled every think), only for real threats, and never a counter to a
    // counter (two rivals trading cancellations is just noise).
    const worth = main.reason !== "counter" && main.troops > Math.max(cap * 0.03, nation.troops * 0.15) && game.tick - main.started >= 5;
    const judge = worth && !main.judged;
    if (judge) main.judged = true;
    if (contact && !shielded && judge && game.rng() < level.counter * persona.counter) {
      const send = Math.min(nation.troops * 0.7, main.troops * 1.35);
      if (send >= main.troops * 1.05 && nation.troops - send >= cap * 0.1) {
        countered = launchAttack(game, id, contact.tile, send / nation.troops, { reason: "counter", landOnly: true }).ok;
        if (countered) plan = `Countering ${attacker.name}`;
      }
    }
    const canFortify = bot ? level.botBuilds && nation.personality === "defensive" : true;
    if (!countered && canFortify && postsAllowed && main.troops > nation.troops * (bot ? 0.5 : 0.3) && nation.gold >= postCost(nation.posts.length) && main.ax >= 0) {
      const spot = postSpot(game, nation, main.ax, main.ay);
      if (spot >= 0 && build(game, id, spot, "post").ok) plan = `Fortifying against ${attacker.name}`;
    }
  }

  // 3. Investment: a City deep inside, or a Defense Post facing a strong neighbor before it attacks.
  const fill = nation.troops / cap;
  const wantsCity = (!bot || (level.botBuilds && nation.cities < 1 && nation.tiles > 150)) && nation.gold >= cityCost(nation.cities) * level.cityMargin && (fill > 0.4 || persona.city > 1.2);
  const proactive = bot ? level.botBuilds && nation.personality === "defensive" : level.posts === "all" || (level.posts === "defensive" && nation.personality === "defensive");
  const tryPost = () => {
    if (!proactive || incoming.length || !postsAllowed || nation.gold < postCost(nation.posts.length)) return false;
    for (const contact of contacts) {
      if (!contact.id || contact.shared < 10) continue;
      const other = game.nations[contact.id];
      if ((other.kind === "bot" && !bot) || other.troops < nation.troops * 0.9) continue;
      if (covered(game, nation, contact.mx, contact.my)) continue;
      const spot = postSpot(game, nation, contact.mx, contact.my);
      if (spot >= 0 && build(game, id, spot, "post").ok) {
        plan ||= `Fortifying the ${other.name} border`;
        return true;
      }
    }
    return false;
  };
  const tryCity = () => {
    if (!wantsCity) return false;
    const spot = interiorTile(game, id);
    if (spot >= 0 && build(game, id, spot, "city").ok) {
      plan ||= "Building a City";
      return true;
    }
    return false;
  };
  if (persona.post > persona.city) {
    if (!tryPost()) tryCity();
  } else if (!tryCity()) tryPost();

  // 4. Offense: spend what's left above the reserve on the best-value move.
  let hostile = 0;
  for (const contact of contacts) {
    if (!contact.id) continue;
    const other = game.nations[contact.id];
    if (other.troops < nation.troops * 0.5 || (other.kind === "bot" && !bot)) continue;
    hostile = Math.max(hostile, other.troops * persona.wary * 0.35 * Math.min(1, contact.shared / 20));
  }
  const floor = cap * (persona.reserve + level.hoard) * (hostile > 0 ? 1 : 0.5);
  const reserve = Math.max(floor, Math.min(cap * 0.6, incomingTroops * 1.1 + hostile));
  let spare = nation.troops - reserve;
  // A real recent loss (a fifth of its land within ~10 s): rebuild for a while instead of starting new wars.
  if (game.time - nation.lossCheckAt >= 10) {
    if (nation.tiles < nation.lossCheckTiles * 0.8 && nation.lossCheckTiles > 60) nation.recoverUntil = game.time + 25;
    nation.lossCheckTiles = nation.tiles;
    nation.lossCheckAt = game.time;
  }
  const recovering = game.time < nation.recoverUntil;
  const pressure = 1 + Math.max(0, nation.troops / cap - 0.5) * 4;
  // Bots (small tribes) run at most one war at a time, two on Hard.
  const most = bot ? Math.min(level.maxAttacks, level.maxAttacks >= 3 ? 2 : 1) : level.maxAttacks;
  let slots = most - active.filter((attack) => attack.to !== 0).length - boats;
  if (countered) slots -= 1;

  const options: Option[] = [];
  const open = contacts.find((contact) => contact.id === 0);
  if (open) {
    const existing = active.find((attack) => attack.to === 0);
    const send = Math.max(0, (nation.troops - reserve * 0.8) * level.spend);
    if (!existing || existing.troops < send * 0.6) {
      options.push({ target: 0, tile: open.tile, score: persona.expand, send, min: Math.max(cap * 0.04, nation.troops * 0.12), reason: "expansion", label: "open land" });
    }
  }
  if (!shielded && slots > 0 && spare > 0) {
    for (const contact of contacts) {
      if (!contact.id) continue;
      const option = weigh(game, nation, game.nations[contact.id], contact, spare, level, persona, active, pressure, cap);
      if (!option || option.score < ATTACK_THRESHOLD) continue;
      if (recovering && option.reason !== "finish") continue;
      options.push(option);
    }
  }
  options.sort((a, b) => b.score - a.score);
  let launched = false;
  let massing = "";
  for (const option of options) {
    const expanding = option.target === 0;
    if (!expanding && slots <= 0) continue;
    const send = expanding ? option.send : Math.min(option.send, spare * level.spend);
    if (send < option.min || send < 1) {
      if (!expanding && !massing) massing = option.label;
      continue;
    }
    if (game.owner[option.tile] !== option.target) {
      // Our picture is out of date: look again next time.
      nation.intel = null;
      break;
    }
    const result = launchAttack(game, id, option.tile, send / nation.troops, { reason: option.reason, landOnly: true });
    if (!result.ok) continue;
    launched = true;
    spare -= send;
    if (!expanding) slots -= 1;
    if (!plan) plan = expanding ? "Expanding into open land" : `Attacking ${option.label}`;
    if (spare <= 0) break;
  }

  // 5. Across the water, when there's nothing better by land and a landing is worth it.
  const navalKeen = bot ? persona.naval >= 0.5 : persona.naval > 0;
  if (!launched && !open && !shielded && navalKeen && nation.coast > 0 && slots > 0 && game.time >= nation.navalAt && game.navalTick !== game.tick) {
    if (boats < (bot ? 1 : 2) && spare > cap * 0.12 && game.rng() < persona.naval) {
      game.navalTick = game.tick;
      nation.navalAt = game.time + 20 + game.rng() * 20;
      const reachable = new Set(contacts.map((contact) => contact.id));
      const target = overseas(game, nation, level, persona, spare, reachable);
      if (target) {
        // The route search stays within about the distance it looked (a failed search is the costly part).
        const searchLimit = Math.round((level.navalRange * 2) ** 2);
        const result = launchAttack(game, id, target.tile, (spare * 0.6) / nation.troops, { reason: "overseas", searchLimit });
        if (result.ok) {
          launched = true;
          plan ||= `Sailing for ${target.name}`;
        } else nation.navalAt += 40;
      }
    }
  }

  if (!plan) {
    if (recovering) plan = "Recovering lost ground";
    else if (incoming.length) plan = `Holding against ${game.nations[incoming[0].from].name}`;
    else if (active.length) plan = active[0].to ? `Attacking ${game.nations[active[0].to].name}` : "Expanding into open land";
    else if (massing) plan = `Massing troops to attack ${massing}`;
    else plan = spare > 0 ? "Holding its borders" : "Building up troops";
  }
  nation.plan = plan;
}
