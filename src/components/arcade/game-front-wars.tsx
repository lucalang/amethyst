"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  Anchor,
  Atom,
  Building2,
  Castle,
  Coins,
  Crosshair,
  Factory,
  Flag,
  LocateFixed,
  Map as MapIcon,
  Navigation,
  Pause,
  Play,
  Radar,
  Radiation,
  Rocket,
  RotateCcw,
  ScrollText,
  Shield,
  ShieldAlert,
  Ship,
  Split,
  Swords,
  Trophy,
  Undo2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { SoundName } from "./sound";
import { GameOverlay, GameShell, Stat, useAway, useArcade, useGameAchievementTracking, useGameKeys, useRecord } from "./game-shell";
import { observeCanvas, startLoop, type CanvasSize } from "./engine";
import {
  BOAT_SPEED,
  BOT_COUNTS,
  BUILDING_AT,
  BUILDING_LABEL,
  CITY_TROOPS,
  DIFFICULTIES,
  FACTORY_GOLD,
  MAPS,
  MAX_BOATS,
  PERSONALITIES,
  POST_RADIUS,
  RAIL_GOLD,
  RAIL_RANGE,
  RETREAT_COST,
  SAM_RANGE,
  SPAWN_TICKS,
  TERRAIN_LABEL,
  TICK_SECONDS,
  WARSHIP_HP,
  WATER,
  WEAPONS,
  WIN_SHARE,
  attackState,
  build,
  buildWarship,
  buildingCost,
  chooseSpawn,
  compactNumber as compact,
  createGame,
  factoryIncome,
  goldPerTick,
  immune,
  launchAttack,
  launchNuke,
  continueAfterWin,
  matchScore,
  maxTroops,
  moveFleet,
  previewFront,
  troopGrowth,
  retreat,
  share,
  siloWait,
  step,
  troopsAttacking,
  type Attack,
  type AttackReason,
  type Building,
  type Difficulty,
  type FrontState,
  type Game,
  type GameEvent,
  type Kind,
  type MapKind,
  type Nation,
  type Personality,
  type Settings,
  type Weapon,
} from "./front-wars/engine";
import { frontWarsTheme } from "./front-wars/look";
import { MapRenderer, drawFrame, isBuilding, type Ping, type Tool, type View } from "./front-wars/render";
import "./front-wars/front-wars.css";

type Phase = "setup" | "playing" | "paused" | "over";
type Panel = "fronts" | "empire" | "log" | "ranks";
type Level = "critical" | "high" | "watch";
/** One front in the panel: an attack (or a boat at sea) between you and someone else. */
type Front = {
  key: string;
  attack: number;
  boat: number;
  other: { id: number; name: string; color: string; kind: Kind; personality: Personality | null };
  troops: number;
  otherTroops: number;
  state: FrontState | "sailing";
  expansion: boolean;
  gained: number;
  rate: number;
  area: string;
  urgency: number;
  level: Level;
  signals: string[];
  eta: number;
};
type Detail = {
  id: number;
  title: string;
  mine: boolean;
  state: FrontState;
  troops: number;
  sent: number;
  gained: number;
  spent: number;
  killed: number;
  rate: number;
  secondsLeft: number | null;
  defender: number | null;
  frontSize: number;
  reason: AttackReason | null;
};
type Tone = "bad" | "warn" | "good" | "info";
type FeedEntry = { id: number; time: number; tone: Tone; text: string; tile: number; count: number };
type Picker = Exclude<Tool, "attack">;
/** Whether a tool can be used right now, what it costs, and a word on why not. */
type ToolState = { ok: boolean; cost: number | null; note: string };
type Strike = { id: number; weapon: Weapon; eta: number; tile: number; incoming: boolean; label: string };
type Hud = {
  stage: "spawn" | "battle";
  spawnLeft: number;
  protectedNow: boolean;
  spawned: boolean;
  troops: number;
  cap: number;
  /** Troops gained per second at the moment. */
  growth: number;
  attacking: number;
  gold: number;
  /** Gold per second: the base, Factories and their railroads, and trade (smoothed). */
  income: { base: number; factory: number; trade: number; total: number };
  share: number;
  /** The share that ends the match: the win share, or the whole map once you chose to play on. */
  goal: number;
  time: number;
  rank: number;
  alive: number;
  leaders: { id: number; name: string; color: string; kind: Kind; personality: Personality | null; share: number; troops: number }[];
  outgoing: Front[];
  incoming: Front[];
  selected: Detail | null;
  feed: FeedEntry[];
  /** Your buildings and units. */
  arsenal: { cities: number; posts: number; ports: number; factories: number; rails: number; silos: number; silosReady: number; siloWait: number; sams: number; fleet: { id: number; hp: number; at: number }[]; traders: number };
  strikes: Strike[];
  tools: Record<Picker, ToolState>;
};
type Result = { won: boolean; score: number; best: boolean; time: number; peak: number; message: string; /** A fresh victory by share: the player may play on toward the whole map. */ canContinue: boolean };
type Banner = { id: number; count: number; name: string; detail: string; major: boolean };

/** Every tool: what it's called, its key, where it sits in the dock, and what it does (shown in the tool card). */
const TOOLS: Record<Picker, { label: string; key: string; icon: LucideIcon; text: string; tap: string }> = {
  city: { label: "City", key: "C", icon: Building2, text: `+${compact(CITY_TROOPS)} troop cap. A railroad station for nearby Factories.`, tap: "Tap your land to build it." },
  post: { label: "Defense Post", key: "F", icon: Shield, text: `Attacks on your land within ${POST_RADIUS} tiles lose 5× the troops and move 3× slower.`, tap: "Tap your land, ideally a few tiles behind a threatened border." },
  port: {
    label: "Port",
    key: "O",
    icon: Anchor,
    text: "Coast only. Sends trade ships to other players' Ports; on arrival you earn gold and they earn half. Warships launch from Ports.",
    tap: "Tap your coast (a tile touching water).",
  },
  factory: {
    label: "Factory",
    key: "G",
    icon: Factory,
    text: `Earns ${compact(FACTORY_GOLD / TICK_SECONDS)} gold/s, plus ${compact(RAIL_GOLD / TICK_SECONDS)}/s for each railroad to one of your Cities, Ports or Factories within ${RAIL_RANGE} tiles (up to 4).`,
    tap: "Tap your land near your Cities and Ports; the preview shows its links.",
  },
  silo: { label: "Missile Silo", key: "L", icon: Rocket, text: "Launches Atom Bombs, Hydrogen Bombs and MIRVs anywhere on the map. Reloads 10 s after each launch.", tap: "Tap your land, away from the border." },
  sam: {
    label: "SAM Launcher",
    key: "J",
    icon: Radar,
    text: `Fires at bombs aimed within ${SAM_RANGE} tiles: stops ${WEAPONS.atom.intercept * 100}% of Atom Bombs and ${WEAPONS.hydrogen.intercept * 100}% of Hydrogen Bombs; MIRVs can't be stopped. Reloads 7.5 s.`,
    tap: "Tap your land to cover what matters (the ring shows its reach).",
  },
  warship: {
    label: "Warship",
    key: "V",
    icon: Ship,
    text: "Needs a Port. Patrols where you tap: sinks boats landing on you, and fights the Warships and seizes the trade ships of anyone at war with you. Repairs near your Ports.",
    tap: "Tap the water where it should patrol.",
  },
  fleet: { label: "Move fleet", key: "R", icon: Navigation, text: "Sends all your Warships to patrol a new spot.", tap: "Tap the water where your fleet should go." },
  atom: {
    label: "Atom Bomb",
    key: "B",
    icon: Atom,
    text: `Wipes land within ${WEAPONS.atom.inner} tiles (part of it to ${WEAPONS.atom.outer}), destroying buildings, troops and ships there and leaving fallout for a minute.`,
    tap: "Tap a target. Red rings are enemy SAM cover.",
  },
  hydrogen: {
    label: "Hydrogen Bomb",
    key: "N",
    icon: Radiation,
    text: `A far bigger blast: land within ${WEAPONS.hydrogen.inner} tiles is wiped, part of it to ${WEAPONS.hydrogen.outer}. SAMs stop half of them.`,
    tap: "Tap a target. Mind your own land in the outer ring.",
  },
  mirv: {
    label: "MIRV",
    key: "I",
    icon: Split,
    text: "Splits above a rival into warheads spread over all of its land. It can't be shot down and only hurts that rival.",
    tap: "Tap a rival's land.",
  },
};
const GROUPS: { label: string; tools: Picker[] }[] = [
  { label: "Build", tools: ["city", "post", "port", "factory"] },
  { label: "Defend", tools: ["sam", "warship", "fleet"] },
  { label: "Strike", tools: ["silo", "atom", "hydrogen", "mirv"] },
];
const TOOL_KEYS: Record<string, Picker> = Object.fromEntries((Object.keys(TOOLS) as Picker[]).map((tool) => [TOOLS[tool].key.toLowerCase(), tool]));
const RATIO_PRESETS = [0.1, 0.25, 0.5, 1];
/** Event sounds by importance: when several things happen in one tick, the most important one plays. */
const SOUND_RANK: Partial<Record<SoundName, number>> = {
  fwConquest: 10,
  fwImpactBig: 9,
  fwImpact: 8,
  fwSiren: 8,
  fwConquestSmall: 7,
  fwIntercept: 6,
  fwLoss: 5,
  fwAlert: 5,
  fwSink: 4,
  fwCapture: 4,
  fwSeize: 3,
  fwDefend: 3,
  fwRumble: 1,
};

const SETTINGS_KEY = "front-wars:settings:v2";
const DEFAULT_SETTINGS: Settings = { map: "world", bots: 200, nations: true, difficulty: "normal" };
/** Ready-made setups from the same options; "Standard" is the unchanged default. */
const PRESETS: { id: string; label: string; hint: string; settings: Settings }[] = [
  { id: "standard", label: "Standard", hint: "The default: the world, 84 Nations and 200 Bots on Normal.", settings: DEFAULT_SETTINGS },
  { id: "quick", label: "Quick Battle", hint: "One random continent with 12 realms and 100 Bots: everyone is reachable by land, so wars start early and matches run short.", settings: { map: "continent", bots: 100, nations: true, difficulty: "normal" } },
  { id: "crowded", label: "Crowded World", hint: "The world packed with 400 Bots: open land vanishes in seconds, borders are busy and surrounded tribes get annexed.", settings: { map: "world", bots: 400, nations: true, difficulty: "normal" } },
  { id: "rivals", label: "Few Strong Rivals", hint: "No Bots, only the 84 Nations on Hard: more open land early, then fewer, larger wars against sharp opponents.", settings: { map: "world", bots: 0, nations: true, difficulty: "hard" } },
];
const BOT_HINTS: Record<number, string> = {
  0: "No Bots: open land lasts longer and Nations meet each other sooner.",
  100: "A scattering of Bots: some early targets, still room to expand.",
  200: "Bots in most regions: open land goes quickly and small borders are everywhere.",
  400: "Bots everywhere: land fills in seconds, expect many small fights and annexations.",
};
const MAX_SCALE = 30;
const percent = (value: number) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const KIND_LABEL: Record<Kind, string> = { human: "You", nation: "Nation", bot: "Bot" };
const LEVEL_LABEL: Record<Level, string> = { critical: "Critical", high: "High", watch: "Watch" };
const STATE_LABEL: Record<FrontState | "sailing", string> = {
  landing: "Landing",
  clash: "Clash",
  stalling: "Stalling",
  reinforced: "Reinforced",
  starting: "Starting",
  advancing: "Advancing",
  sailing: "At sea",
};
/** Why a rival attacked you, from your side. */
const REASON_TEXT: Record<AttackReason, string> = {
  expansion: "it's grabbing land",
  "weak-border": "your border looks thinly held",
  busy: "your troops are busy on another front",
  retaliation: "payback for your attack",
  finish: "it thinks it can finish you",
  counter: "a counterattack",
  opportunity: "you were its best target nearby",
  overseas: "a landing across the water",
};
const COMPASS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
const who = (nation: Nation) => (nation.id === 1 ? "you" : nation.name);
const buildingName = (building: Building) => BUILDING_LABEL[building];

/** Whether each tool can be used now (and what it costs): the dock's buttons and the tool card read this. */
function toolStates(game: Game): Record<Picker, ToolState> {
  const player = game.nations[1];
  const spawning = game.phase === "spawn";
  const short = (cost: number) => `${compact(cost - player.gold)} short`;
  const out = {} as Record<Picker, ToolState>;
  for (const kind of ["city", "post", "port", "factory", "silo", "sam"] as const) {
    const cost = buildingCost(player, kind);
    const coastless = kind === "port" && player.coast <= 0;
    out[kind] = { cost, ok: !spawning && !coastless && player.gold >= cost, note: spawning ? "After the spawn" : coastless ? "Needs a coast" : player.gold < cost ? short(cost) : "Ready" };
  }
  const shipCost = buildingCost(player, "warship");
  out.warship = { cost: shipCost, ok: !spawning && player.ports.length > 0 && player.gold >= shipCost, note: !player.ports.length ? "Needs a Port" : player.gold < shipCost ? short(shipCost) : "Ready" };
  out.fleet = { cost: null, ok: player.warships > 0, note: player.warships ? `${player.warships} at sea` : "No Warships" };
  const wait = siloWait(game, player);
  for (const weapon of ["atom", "hydrogen", "mirv"] as const) {
    const cost = WEAPONS[weapon].cost;
    const note = !player.silos.length ? "Needs a Silo" : player.gold < cost ? short(cost) : immune(game) ? "Protected" : wait > 0 ? `Reloading ${Math.ceil(wait)}s` : "Ready";
    out[weapon] = { cost, ok: note === "Ready", note };
  }
  return out;
}

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
    if (
      saved &&
      saved.map &&
      saved.map in MAPS &&
      saved.difficulty &&
      saved.difficulty in DIFFICULTIES &&
      typeof saved.nations === "boolean" &&
      BOT_COUNTS.includes(saved.bots as (typeof BOT_COUNTS)[number])
    ) {
      return { map: saved.map, bots: saved.bots!, nations: saved.nations, difficulty: saved.difficulty };
    }
  } catch {
    // Private mode or bad data: the defaults are fine.
  }
  return DEFAULT_SETTINGS;
}

/** Where on your land a front is: the compass side of your territory, and your buildings it's near. */
function areaOf(game: Game, x: number, y: number, near: number[]) {
  const player = game.nations[1];
  if (!player.tiles || x < 0) return "";
  const angle = Math.atan2(y - player.sy / player.tiles, x - player.sx / player.tiles);
  const side = COMPASS[(((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8)];
  const buildings = near.filter((spot) => game.owner[spot] === 1).map((spot) => BUILDING_LABEL[BUILDING_AT[game.building[spot]] ?? "city"]);
  const close = buildings.length ? ` · near your ${buildings.includes("Missile Silo") ? "Missile Silo" : buildings.includes("City") ? "City" : buildings[0]}` : "";
  return `${side} border${close}`;
}

function otherOf(game: Game, id: number): Front["other"] {
  const nation = game.nations[id];
  return id ? { id, name: nation.name, color: nation.color, kind: nation.kind, personality: nation.personality } : { id: 0, name: "Open land", color: "#7c8a6a", kind: "bot", personality: null };
}

/** How urgent an attack on you is: its force against yours, how fast it's taking land, and what it's near. */
function rateThreat(game: Game, attack: Attack): Pick<Front, "urgency" | "level" | "signals"> {
  const player = game.nations[1];
  const force = attack.troops / Math.max(1, player.troops);
  const lossPerMinute = (attack.rate * 60) / Math.max(1, player.tiles);
  const nearCity = attack.near.some((spot) => game.building[spot] === 1 && game.owner[spot] === 1);
  const near = attack.near.some((spot) => game.owner[spot] === 1);
  const state = attackState(game, attack);
  const signals: string[] = [];
  if (force >= 1) signals.push("outnumbers your army");
  else if (force >= 0.35) signals.push(`${Math.round(force * 100)}% of your troops`);
  if (lossPerMinute >= 0.05) signals.push("taking land fast");
  if (near) signals.push(nearCity ? "at your City" : "at your buildings");
  if (attack.stalling) signals.push("faltering");
  const urgency = Math.min(2, force) * 45 + Math.min(1, lossPerMinute) * 120 + (nearCity ? 30 : near ? 15 : 0) + (state === "landing" ? 10 : 0) - (attack.stalling ? 25 : 0);
  return { urgency, level: urgency >= 70 ? "critical" : urgency >= 35 ? "high" : "watch", signals };
}

function snapshot(game: Game, selected: number, feed: FeedEntry[]): Hud {
  const player = game.nations[1];
  const alive = game.nations.filter((nation) => nation.alive && nation.tiles > 0).sort((a, b) => b.tiles - a.tiles);
  const outgoing: Front[] = [];
  const incoming: Front[] = [];
  for (const attack of game.attacks) {
    if (attack.from !== 1 && attack.to !== 1) continue;
    const mine = attack.from === 1;
    const other = otherOf(game, mine ? attack.to : attack.from);
    const front: Front = {
      key: `a${attack.id}`,
      attack: attack.id,
      boat: -1,
      other,
      troops: attack.troops,
      otherTroops: other.id ? game.nations[other.id].troops : 0,
      state: attackState(game, attack),
      expansion: attack.to === 0,
      gained: attack.gained,
      rate: attack.rate,
      area: mine ? "" : areaOf(game, attack.ax, attack.ay, attack.near),
      urgency: 0,
      level: "watch",
      signals: [],
      eta: 0,
    };
    if (mine) outgoing.push(front);
    else incoming.push({ ...front, ...rateThreat(game, attack) });
  }
  for (const boat of game.boats) {
    const target = game.owner[boat.landing];
    const mine = boat.from === 1;
    if (!mine && target !== 1) continue;
    const other = otherOf(game, mine ? target : boat.from);
    const eta = Math.max(0, (boat.path.length - 1 - boat.index) / BOAT_SPEED) * TICK_SECONDS;
    const force = boat.troops / Math.max(1, player.troops);
    const landingAt = Math.floor(boat.landing / game.w);
    const front: Front = {
      key: `b${boat.id}`,
      attack: -1,
      boat: boat.id,
      other,
      troops: boat.troops,
      otherTroops: other.id ? game.nations[other.id].troops : 0,
      state: "sailing",
      expansion: !target,
      gained: 0,
      rate: 0,
      area: mine ? "" : areaOf(game, boat.landing % game.w, landingAt, []).replace(" border", " coast"),
      urgency: Math.min(2, force) * 45 + (eta < 5 ? 15 : 0),
      level: "watch",
      signals: [`lands in ${Math.ceil(eta)}s`],
      eta,
    };
    if (mine) outgoing.push(front);
    else incoming.push({ ...front, level: front.urgency >= 70 ? "critical" : front.urgency >= 35 ? "high" : "watch" });
  }
  incoming.sort((a, b) => b.urgency - a.urgency);
  outgoing.sort((a, b) => b.troops - a.troops);

  let detail: Detail | null = null;
  const chosen = game.attacks.find((attack) => attack.id === selected);
  if (chosen) {
    const from = game.nations[chosen.from];
    const to = chosen.to ? game.nations[chosen.to] : null;
    detail = {
      id: chosen.id,
      title: `${from.id === 1 ? "You" : from.name} → ${to ? who(to) : "open land"}`,
      mine: chosen.from === 1,
      state: attackState(game, chosen),
      troops: chosen.troops,
      sent: chosen.sent,
      gained: chosen.gained,
      spent: chosen.spent,
      killed: chosen.killed,
      rate: chosen.rate,
      secondsLeft: chosen.burn > 0 ? chosen.troops / chosen.burn : null,
      defender: to ? to.troops : null,
      frontSize: chosen.frontSize,
      reason: chosen.reason,
    };
  }

  return {
    stage: game.phase,
    spawnLeft: Math.max(0, (SPAWN_TICKS - game.tick) * TICK_SECONDS),
    protectedNow: immune(game),
    spawned: player.spawned,
    troops: player.troops,
    cap: maxTroops(game, player),
    growth: troopGrowth(game, player) / TICK_SECONDS,
    attacking: troopsAttacking(game, 1),
    gold: player.gold,
    income: {
      base: goldPerTick(player) / TICK_SECONDS,
      factory: factoryIncome(player) / TICK_SECONDS,
      trade: player.tradeRate,
      total: (goldPerTick(player) + factoryIncome(player)) / TICK_SECONDS + player.tradeRate,
    },
    share: share(game, player),
    goal: game.continued ? 1 : WIN_SHARE,
    time: game.time,
    rank: alive.findIndex((nation) => nation.id === 1) + 1,
    alive: alive.length,
    leaders: alive.slice(0, 10).map((nation) => ({ id: nation.id, name: nation.name, color: nation.color, kind: nation.kind, personality: nation.personality, share: share(game, nation), troops: nation.troops })),
    outgoing,
    incoming,
    selected: detail,
    feed: feed.slice(0, 12),
    arsenal: {
      cities: player.cities,
      posts: player.posts.length,
      ports: player.ports.length,
      factories: player.factories.length,
      rails: player.rails.length / 2,
      silos: player.silos.length,
      silosReady: player.silos.filter((silo) => game.readyAt[silo] <= game.tick).length,
      siloWait: siloWait(game, player),
      sams: player.sams.length,
      fleet: game.ships.filter((ship) => ship.owner === 1).map((ship) => ({ id: ship.id, hp: ship.hp / WARSHIP_HP, at: ship.at })),
      traders: game.traders.filter((trader) => trader.owner === 1).length,
    },
    strikes: game.nukes
      .filter((nuke) => !nuke.warhead && (nuke.from === 1 || nuke.to === 1 || game.owner[nuke.target] === 1))
      .map((nuke) => ({
        id: nuke.id,
        weapon: nuke.weapon,
        eta: Math.max(0, nuke.flight - (game.tick - nuke.launched)) * TICK_SECONDS,
        tile: Math.floor(nuke.y1) * game.w + Math.floor(nuke.x1),
        incoming: nuke.from !== 1,
        label: nuke.from === 1 ? `at ${nuke.to ? game.nations[nuke.to].name : "open land"}` : `from ${game.nations[nuke.from].name}`,
      })),
    tools: toolStates(game),
  };
}

type Line = { tone: Tone; text: string; tile: number; toast?: boolean; sound?: SoundName };

/** A match event as a line in the battle log (and whether it deserves a toast, and its sound), or null. */
function describe(game: Game, event: GameEvent): Line | null {
  const name = (id: number) => (id ? game.nations[id].name : "open land");
  switch (event.kind) {
    case "attack":
      if (event.to !== 1) return null;
      return {
        tone: "bad",
        text: `${name(event.from)} attacks you with ${compact(event.troops)}${event.reason ? `: ${REASON_TEXT[event.reason]}` : ""}.`,
        tile: event.tile,
        toast: event.troops >= game.nations[1].troops * 0.2,
        sound: event.troops >= game.nations[1].troops * 0.2 ? "fwAlert" : undefined,
      };
    case "sailing":
      if (event.to !== 1) return null;
      return { tone: "warn", text: `${name(event.from)}'s boat (${compact(event.troops)}) is sailing for your coast.`, tile: event.tile, toast: true, sound: "fwAlert" };
    case "landed":
      if (event.from === 1) return { tone: "good", text: `Your boat landed ${compact(event.troops)} troops${event.to ? ` on ${name(event.to)}'s shore` : ""}.`, tile: event.tile };
      if (event.to === 1) return { tone: "bad", text: `${name(event.from)} landed ${compact(event.troops)} troops on your shore!`, tile: event.tile, toast: true, sound: "fwAlert" };
      return null;
    case "ended": {
      const tiles = `${event.gained.toLocaleString("en")} tiles`;
      if (event.from === 1) {
        if (event.reason === "retreat") return null;
        // A counter that stopped your attack is already logged as the clash.
        if (event.reason === "clash") return null;
        if (!event.to) return event.reason === "complete" ? { tone: "info", text: `No open land left in reach of your expansion (+${tiles}).`, tile: event.tile } : null;
        if (event.reason === "spent") return { tone: "warn", text: `Your attack on ${name(event.to)} ran out of troops (+${tiles}).`, tile: event.tile };
        return { tone: "good", text: `Your attack on ${name(event.to)} took everything in reach (+${tiles}).`, tile: event.tile };
      }
      if (event.reason === "spent") return { tone: "good", text: `You held off ${name(event.from)} (lost ${tiles}).`, tile: event.tile, sound: "fwDefend" };
      if (event.reason === "retreat") return { tone: "good", text: `${name(event.from)} pulled back (you lost ${tiles}).`, tile: event.tile, sound: "fwDefend" };
      if (event.reason === "clash") return { tone: "good", text: `Your counterattack stopped ${name(event.from)}.`, tile: event.tile, sound: "fwDefend" };
      if (event.reason === "complete") return { tone: "bad", text: `${name(event.from)} broke through (you lost ${tiles}).`, tile: event.tile };
      return null;
    }
    case "stalling":
      if (event.from === 1) return { tone: "warn", text: `Your attack on ${name(event.to)} is stalling: ${compact(event.troops)} troops left. Reinforce or retreat.`, tile: event.tile, toast: true };
      return { tone: "good", text: `${name(event.from)}'s attack on you is faltering.`, tile: event.tile };
    case "threatened":
      return { tone: "bad", text: `${name(event.from)}'s front reached your ${buildingName(event.building)}.`, tile: event.tile, toast: true, sound: "fwAlert" };
    case "clash":
      if (event.b === 1) return { tone: "warn", text: `${name(event.a)} met your attack head-on: ${compact(event.troops)} troops fell on each side.`, tile: event.tile };
      return null;
    case "captured-building":
      if (event.to === 1) return { tone: "good", text: `You captured ${name(event.from)}'s ${buildingName(event.building)}.`, tile: event.tile, toast: true, sound: "fwCapture" };
      if (event.from === 1) return { tone: "bad", text: `You lost a ${buildingName(event.building)} to ${name(event.to)}.`, tile: event.tile, toast: true, sound: "fwLoss" };
      return null;
    case "eliminated": {
      if (event.nation === 1) return null;
      const fallen = game.nations[event.nation];
      if (event.by === 1) {
        const spoils = [event.tiles ? `+${event.tiles.toLocaleString("en")} tiles` : "", event.gold >= 1000 ? `+${compact(event.gold)} gold` : ""].filter(Boolean).join(", ");
        return { tone: "good", text: event.tiles ? `You conquered ${fallen.name}${spoils ? `: ${spoils}` : ""}.` : `You wiped out ${fallen.name}${spoils ? `: ${spoils}` : ""}.`, tile: -1, sound: fallen.kind === "nation" ? "fwConquest" : "fwConquestSmall" };
      }
      if (fallen.kind === "nation") return { tone: "info", text: `${fallen.name} fell to ${event.by ? name(event.by) : "a rival"}.`, tile: -1 };
      return null;
    }
    case "annexed":
      if (event.by === 1) return { tone: "good", text: `${game.nations[event.nation].name} was surrounded and joined you.`, tile: -1, toast: true, sound: "fwConquestSmall" };
      return null;
    case "built":
      // Rivals' Silos are public knowledge and worth knowing about.
      if (event.nation !== 1 && event.building === "silo" && game.nations[event.nation].kind === "nation") return { tone: "warn", text: `${name(event.nation)} built a Missile Silo.`, tile: event.tile };
      return null;
    case "launched": {
      const label = WEAPONS[event.weapon].label;
      if (event.from === 1) return null;
      if (event.to === 1) return { tone: "bad", text: `${name(event.from)} launched a ${label} at you: impact in ${Math.ceil(event.eta)}s!`, tile: event.tile, toast: true, sound: "fwSiren" };
      return { tone: "info", text: `${name(event.from)} launched a ${label} at ${name(event.to)}.`, tile: event.tile };
    }
    case "intercepted": {
      const label = WEAPONS[event.weapon].label;
      if (event.by === 1) return { tone: "good", text: `Your SAM shot down ${name(event.from)}'s ${label}.`, tile: event.tile, toast: true, sound: "fwIntercept" };
      if (event.from === 1) return { tone: "warn", text: `${name(event.by)}'s SAM shot down your ${label}.`, tile: event.tile, toast: true, sound: "fwIntercept" };
      if (event.to === 1) return { tone: "good", text: `${name(event.by)}'s SAM shot down the ${label} aimed at you.`, tile: event.tile, sound: "fwIntercept" };
      return null;
    }
    case "detonated": {
      // A MIRV's warheads are reported once, as a whole (see the game loop).
      if (event.nuke !== event.parent) return null;
      const label = WEAPONS[event.weapon].label;
      const big = event.weapon === "atom" ? "fwImpact" : "fwImpactBig";
      if (event.playerLost > 0 && event.from !== 1) return { tone: "bad", text: `${name(event.from)}'s ${label} hit you: ${event.playerLost.toLocaleString("en")} tiles destroyed${event.buildings ? `, ${event.buildings} building${event.buildings === 1 ? "" : "s"}` : ""}.`, tile: event.tile, toast: true, sound: big };
      if (event.from === 1) {
        const hit = event.hit.filter((id) => id !== 1).map((id) => name(id));
        const own = event.playerLost ? ` (${event.playerLost} of your own tiles)` : "";
        return { tone: hit.length ? "good" : "info", text: hit.length ? `Your ${label} hit ${hit.slice(0, 3).join(", ")}${event.buildings ? `, destroying ${event.buildings} building${event.buildings === 1 ? "" : "s"}` : ""}${own}.` : `Your ${label} hit empty land${own}.`, tile: event.tile, toast: true, sound: big };
      }
      return { tone: "info", text: `A ${label} from ${name(event.from)} hit ${event.hit.length ? name(event.hit[0]) : "open land"}.`, tile: event.tile, sound: "fwRumble" };
    }
    case "sunk":
      if (event.ship === "boat") {
        if (event.owner === 1) return { tone: "bad", text: `Your boat (${compact(event.troops)} troops) was sunk${event.by ? ` by ${name(event.by)}` : ""}.`, tile: event.tile, toast: true, sound: "fwSink" };
        if (event.by === 1) return { tone: "good", text: `Your Warship sank ${name(event.owner)}'s boat (${compact(event.troops)} troops).`, tile: event.tile, sound: "fwSink" };
        return { tone: "good", text: `${name(event.by)} sank ${name(event.owner)}'s boat headed for you.`, tile: event.tile };
      }
      if (event.owner === 1) return { tone: "bad", text: `Your Warship was sunk${event.by ? ` by ${name(event.by)}` : ""}.`, tile: event.tile, toast: true, sound: "fwSink" };
      return { tone: "good", text: `You sank ${name(event.owner)}'s Warship.`, tile: event.tile, sound: "fwSink" };
    case "seized":
      if (event.by === 1) return { tone: "good", text: `Your Warship seized ${name(event.from)}'s trade ship: +${compact(event.gold)} gold.`, tile: event.tile, sound: "fwSeize" };
      return { tone: "bad", text: `${name(event.by)}'s Warship seized your trade ship (${compact(event.gold)} gold lost).`, tile: event.tile, sound: "fwLoss" };
  }
}

/** A tile of the attacker's land next to an attack's front (for a counterattack), or -1. */
function attackerTile(game: Game, attack: Attack) {
  const { w, h } = game;
  if (attack.ax >= 0) {
    const x0 = Math.floor(attack.ax);
    const y0 = Math.floor(attack.ay);
    for (let r = 0; r <= 4; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (game.owner[y * w + x] === attack.from && game.terrain[y * w + x] !== WATER) return y * w + x;
        }
      }
    }
  }
  for (const b of game.nations[1].border) {
    for (const n of [b - 1, b + 1, b - w, b + w]) if (n >= 0 && n < w * h && game.owner[n] === attack.from && game.terrain[n] !== WATER) return n;
  }
  return -1;
}

export default function FrontWarsGame({ records }: { records: Record<string, number> }) {
  const { play, effects, look } = useArcade();
  // Decorative motion (the conquest sequence, blasts) follows the account's animation setting and reduced motion.
  const effectsRef = useRef(effects);
  useEffect(() => {
    effectsRef.current = effects;
  }, [effects]);
  // Cosmetics from the Front Wars shop; equipping one mid-match (from the in-game shop) restyles the map at once.
  const theme = useMemo(() => frontWarsTheme(look), [look]);
  const themeRef = useRef(theme);
  const { best, submit } = useRecord("front-wars", records[""] ?? null);
  // The last match's setup (this component only renders in the browser: it's loaded with ssr: false).
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [phase, setPhase] = useState<Phase>("setup");
  const [hud, setHud] = useState<Hud | null>(null);
  const [ratio, setRatio] = useState(0.2);
  const [tool, setTool] = useState<Tool>("attack");
  const [panel, setPanel] = useState<Panel>("fronts");
  const [notice, setNotice] = useState<{ text: string; ok: boolean; id: number } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const sizeRef = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  const hoverRef = useRef(-1);
  const previewRef = useRef<{ key: string; tiles: number[] }>({ key: "", tiles: [] });
  const pingsRef = useRef<Ping[]>([]);
  const ratioRef = useRef(ratio);
  const toolRef = useRef(tool);
  const phaseRef = useRef(phase);
  const drawRequest = useRef(0);
  const alphaRef = useRef(0);
  /** The attack picked in the panel (or with T): outlined on the map, its numbers in the battle card. */
  const selectedRef = useRef(-1);
  const feedRef = useRef<FeedEntry[]>([]);
  const feedId = useRef(0);
  /** MIRVs already reported (their warheads come down over a couple of seconds). */
  const mirvsRef = useRef(new Set<number>());
  const soundAt = useRef(new Map<string, number>());
  useEffect(() => {
    ratioRef.current = ratio;
    toolRef.current = tool;
    phaseRef.current = phase;
  }, [ratio, tool, phase]);

  useGameAchievementTracking("front-wars", phase);

  /**
   * Sounds, rationed: the same sound at most every `gap` ms, and frequent ones nudged in pitch so repeats don't
   * drone. The arcade's sound setting still decides whether anything plays.
   */
  const sfx = useCallback(
    (name: SoundName, gap = 140, pitch = 1) => {
      const now = performance.now();
      if (now - (soundAt.current.get(name) ?? -1e9) < gap) return;
      soundAt.current.set(name, now);
      play(name, pitch);
    },
    [play],
  );

  const say = useCallback((text: string, ok: boolean) => setNotice({ text, ok, id: Date.now() }), []);
  const refresh = useCallback((game: Game) => {
    if (selectedRef.current >= 0 && !game.attacks.some((attack) => attack.id === selectedRef.current)) selectedRef.current = -1;
    setHud(snapshot(game, selectedRef.current, feedRef.current));
  }, []);

  // The conquest banner clears itself; several falls in a row extend and count up the same banner.
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 3800);
    return () => window.clearTimeout(timer);
  }, [banner]);

  /* ----------------------------------------------------------------------------------------- Drawing */

  const draw = useCallback((alpha?: number) => {
    const canvas = canvasRef.current;
    const game = gameRef.current;
    const renderer = rendererRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !game || !renderer || !ctx) return;
    if (alpha !== undefined) alphaRef.current = alpha;
    renderer.update();
    const now = performance.now();
    pingsRef.current = pingsRef.current.filter((ping) => now - ping.at < 600);
    // The stretch an attack at the hovered tile would open, refreshed when the pointer, ratio or border moves.
    let preview: number[] = [];
    if (hoverRef.current >= 0 && toolRef.current === "attack" && game.phase === "battle" && game.nations[1].alive) {
      const key = `${hoverRef.current}:${ratioRef.current}:${(game.tick / 5) | 0}`;
      if (previewRef.current.key !== key) previewRef.current = { key, tiles: previewFront(game, 1, hoverRef.current, game.nations[1].troops * ratioRef.current) };
      preview = previewRef.current.tiles;
    }
    drawFrame(ctx, renderer, game, viewRef.current, sizeRef.current, {
      preview,
      effects: effectsRef.current,
      hover: hoverRef.current,
      tool: toolRef.current,
      pings: pingsRef.current,
      now,
      spawn: game.phase === "spawn",
      selected: selectedRef.current,
      tick: game.tick + (phaseRef.current === "playing" ? alphaRef.current : 0),
    });
  }, []);

  /** Draw once on the next frame (while paused or between matches nothing runs continuously). */
  const requestDraw = useCallback(() => {
    if (drawRequest.current) return;
    drawRequest.current = requestAnimationFrame(() => {
      drawRequest.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => () => cancelAnimationFrame(drawRequest.current), []);

  useEffect(() => {
    themeRef.current = theme;
    if (!rendererRef.current) return;
    rendererRef.current.setTheme(theme);
    requestDraw();
  }, [theme, requestDraw]);

  const fit = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const { width, height } = sizeRef.current;
    const scale = Math.min(width / game.w, height / game.h);
    viewRef.current = { scale, x: (width - game.w * scale) / 2, y: (height - game.h * scale) / 2 };
  }, []);

  const clampView = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const view = viewRef.current;
    const { width, height } = sizeRef.current;
    const mapW = game.w * view.scale;
    const mapH = game.h * view.scale;
    // Keep at least a third of the view on the map.
    view.x = Math.min(width - Math.min(mapW, width) / 3, Math.max(Math.min(mapW, width) / 3 - mapW, view.x));
    view.y = Math.min(height - Math.min(mapH, height) / 3, Math.max(Math.min(mapH, height) / 3 - mapH, view.y));
  }, []);

  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      const game = gameRef.current;
      if (!game) return;
      const view = viewRef.current;
      const { width, height } = sizeRef.current;
      const smallest = Math.min(width / game.w, height / game.h) * 0.9;
      const scale = Math.min(MAX_SCALE, Math.max(smallest, view.scale * factor));
      view.x = sx - ((sx - view.x) / view.scale) * scale;
      view.y = sy - ((sy - view.y) / view.scale) * scale;
      view.scale = scale;
      clampView();
      requestDraw();
    },
    [clampView, requestDraw],
  );

  /** Center the map on a spot (in tiles), zooming in far enough to see the fighting. */
  const lookAt = useCallback(
    (x: number, y: number, zoom: number) => {
      const game = gameRef.current;
      if (!game) return;
      const view = viewRef.current;
      const { width, height } = sizeRef.current;
      view.scale = Math.max(view.scale, Math.min(MAX_SCALE, Math.min(width / game.w, height / game.h) * zoom));
      view.x = width / 2 - x * view.scale;
      view.y = height / 2 - y * view.scale;
      clampView();
      requestDraw();
    },
    [clampView, requestDraw],
  );

  const centerOnHome = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const player = game.nations[1];
    if (!player.tiles) return;
    lookAt(player.sx / player.tiles + 0.5, player.sy / player.tiles + 0.5, 5);
  }, [lookAt]);

  /** Jump to a front from the panel: select an attack (outlined, with details) or follow a boat. */
  const focusFront = useCallback(
    (front: { attack: number; boat: number }) => {
      const game = gameRef.current;
      if (!game) return;
      if (front.attack >= 0) {
        const attack = game.attacks.find((entry) => entry.id === front.attack);
        if (!attack || attack.ax < 0) return;
        selectedRef.current = attack.id;
        lookAt(attack.ax, attack.ay, 8);
      } else {
        const boat = game.boats.find((entry) => entry.id === front.boat);
        if (!boat) return;
        const tile = boat.path[Math.min(boat.path.length - 1, boat.index)];
        lookAt((tile % game.w) + 0.5, Math.floor(tile / game.w) + 0.5, 6);
      }
      refresh(game);
    },
    [lookAt, refresh],
  );

  const focusTile = useCallback(
    (tile: number) => {
      const game = gameRef.current;
      if (!game || tile < 0) return;
      lookAt((tile % game.w) + 0.5, Math.floor(tile / game.w) + 0.5, 8);
    },
    [lookAt],
  );

  const clearSelection = useCallback(() => {
    selectedRef.current = -1;
    const game = gameRef.current;
    if (game) refresh(game);
    requestDraw();
  }, [refresh, requestDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let first = true;
    return observeCanvas(canvas, (size) => {
      sizeRef.current = size;
      if (first) {
        first = false;
        fit();
      } else {
        clampView();
      }
      requestDraw();
    });
  }, [fit, clampView, requestDraw]);

  /* ----------------------------------------------------------------------------------------- Match */

  const finish = useCallback(
    (game: Game) => {
      // Playing on after a victory keeps it: the win was counted when it happened, a later defeat doesn't undo it.
      const won = game.continued || game.outcome?.winner === 1;
      const score = matchScore(game);
      const improved = submit(score);
      // One win per match, counted when it is first reached (a later total conquest isn't a second win).
      if (won && !game.continued) {
        apiFetch("/api/arcade/wins", { method: "POST", json: { game: "front-wars" } }).catch(() => toast.error("Your win could not be added to the leaderboard."));
      }
      const winner = game.outcome?.winner ? game.nations[game.outcome.winner] : null;
      const message =
        game.outcome?.reason === "total"
          ? "You conquered the whole world."
          : game.outcome?.reason === "conquered"
            ? game.continued
              ? "You won, then your last land fell. The win still counts."
              : "Your last land fell."
            : won
              ? `You hold ${percent(share(game, game.nations[1]))} of the land.`
              : `${winner?.name ?? "A rival"} took ${percent(winner ? share(game, winner) : WIN_SHARE)} of the land first.`;
      selectedRef.current = -1;
      setResult({ won, score, best: improved, time: game.time, peak: game.nations[1].peak, message, canContinue: game.outcome?.winner === 1 && game.outcome.reason === "share" && !game.continued });
      refresh(game);
      setPhase("over");
      setTool("attack");
      play(won ? "fwVictory" : "fwDefeat");
    },
    [play, submit, refresh],
  );

  /** After a victory: keep the match going toward every last tile. The popup stays as it was; this just closes it. */
  const continueMatch = useCallback(() => {
    const game = gameRef.current;
    if (!game || !continueAfterWin(game)) return;
    setResult(null);
    say("You won! Playing on: take every last tile to conquer the world.", true);
    refresh(game);
    setPhase("playing");
  }, [say, refresh]);

  const start = useCallback(
    (next: Settings) => {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Not saved; it still plays.
      }
      const game = createGame(next, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
      gameRef.current = game;
      rendererRef.current = new MapRenderer(game, themeRef.current);
      pingsRef.current = [];
      hoverRef.current = -1;
      selectedRef.current = -1;
      feedRef.current = [];
      mirvsRef.current.clear();
      setSettings(next);
      setResult(null);
      setBanner(null);
      setTool("attack");
      setPanel("fronts");
      refresh(game);
      setPhase("playing");
      fit();
      say("Choose where to start: tap any unclaimed land.", true);
      play("fwSelect");
    },
    [fit, say, play, refresh],
  );

  /** Log an event once (a repeat within a few seconds bumps a counter instead of a new line). */
  const log = useCallback((game: Game, entry: { tone: Tone; text: string; tile: number }) => {
    const feed = feedRef.current;
    const last = feed[0];
    if (last && last.text === entry.text && game.time - last.time < 10) {
      last.count += 1;
      last.time = game.time;
      return;
    }
    feedId.current += 1;
    feed.unshift({ ...entry, id: feedId.current, time: game.time, count: 1 });
    if (feed.length > 40) feed.length = 40;
  }, []);

  /** A rival you conquered: the banner (merged when several fall close together). */
  const announceConquest = useCallback((game: Game, event: Extract<GameEvent, { kind: "eliminated" }>) => {
    const fallen = game.nations[event.nation];
    const major = fallen.kind === "nation";
    const nationsLeft = game.nations.filter((nation) => nation.alive && nation.kind === "nation").length;
    const detail = [event.tiles ? `+${event.tiles.toLocaleString("en")} tiles` : "wiped out", event.gold >= 1000 ? `+${compact(event.gold)} gold` : "", major ? `${nationsLeft} Nation${nationsLeft === 1 ? "" : "s"} left` : ""].filter(Boolean).join(" · ");
    setBanner((current) =>
      current && Date.now() - current.id < 3500
        ? { id: Date.now(), count: current.count + 1, name: fallen.name, detail, major: current.major || major }
        : { id: Date.now(), count: 1, name: fallen.name, detail, major },
    );
  }, []);

  // The match runs only while playing: ten simulation ticks a second, a frame per display refresh.
  useEffect(() => {
    if (phase !== "playing") {
      requestDraw();
      return;
    }
    let ticks = 0;
    return startLoop(
      () => {
        const game = gameRef.current;
        if (!game || game.outcome) return;
        const before = game.phase;
        step(game);
        ticks += 1;
        if (before === "spawn" && game.phase === "battle") {
          say("The battle begins! Tap unclaimed land to expand. Everyone is protected for 5 seconds.", true);
          play("fwStart");
          centerOnHome();
        }
        let toast: Line | null = null;
        let sound: SoundName | null = null;
        const hear = (name: SoundName | undefined) => {
          if (name && (!sound || (SOUND_RANK[name] ?? 0) > (SOUND_RANK[sound] ?? 0))) sound = name;
        };
        for (const event of game.events) {
          // A MIRV's warheads: one line (and one sound) when the first comes down.
          if (event.kind === "detonated" && event.nuke !== event.parent) {
            if (mirvsRef.current.has(event.parent)) continue;
            mirvsRef.current.add(event.parent);
            const toYou = event.hit.includes(1) && event.from !== 1;
            if (event.from === 1 || toYou) {
              const line: Line = { tone: toYou ? "bad" : "good", text: toYou ? `${game.nations[event.from].name}'s MIRV warheads are raining on your land!` : "Your MIRV's warheads are coming down.", tile: event.tile, toast: true };
              log(game, line);
              toast = line;
              hear("fwImpactBig");
            } else hear("fwRumble");
            continue;
          }
          const line = describe(game, event);
          if (event.kind === "eliminated" && event.by === 1 && event.nation !== 1) announceConquest(game, event);
          if (!line) continue;
          log(game, line);
          hear(line.sound);
          if (line.toast && (!toast || (line.tone === "bad" && toast.tone !== "bad"))) toast = line;
        }
        if (toast) say(toast.text, toast.tone === "good" || toast.tone === "info");
        // Big moments have their own long gaps so a burst of falls or blasts plays once.
        if (sound) sfx(sound, sound === "fwConquest" || sound === "fwImpactBig" ? 2500 : sound === "fwRumble" ? 6000 : 500);
        game.events.length = 0;
        if (game.outcome) {
          finish(game);
          return;
        }
        if (ticks % 3 === 0) refresh(game);
      },
      (alpha) => draw(alpha),
      10,
    );
  }, [phase, draw, requestDraw, finish, say, play, sfx, centerOnHome, refresh, log, announceConquest]);

  const togglePause = useCallback(() => {
    setPhase((current) => (current === "playing" ? "paused" : current === "paused" ? "playing" : current));
  }, []);

  useAway(() => {
    if (phaseRef.current === "playing") setPhase("paused");
  });

  /* ----------------------------------------------------------------------------------------- Actions */

  const tileAt = useCallback((sx: number, sy: number) => {
    const game = gameRef.current;
    if (!game) return -1;
    const view = viewRef.current;
    const x = Math.floor((sx - view.x) / view.scale);
    const y = Math.floor((sy - view.y) / view.scale);
    if (x < 0 || y < 0 || x >= game.w || y >= game.h) return -1;
    return y * game.w + x;
  }, []);

  /** Pick a tool from the dock or a key (picking it again goes back to attacking). */
  const chooseTool = useCallback(
    (next: Tool) => {
      setTool((current) => (current === next ? "attack" : next));
      sfx("fwSelect", 60);
    },
    [sfx],
  );

  const act = useCallback(
    (tile: number) => {
      const game = gameRef.current;
      if (!game || tile < 0 || phaseRef.current !== "playing") return;
      const current = toolRef.current;
      let outcome;
      let sound: SoundName;
      let pitch = 1;
      if (game.phase === "spawn") {
        outcome = chooseSpawn(game, tile);
        sound = "fwSpawn";
      } else if (current === "attack") {
        const open = game.terrain[tile] !== WATER && !game.owner[tile];
        outcome = launchAttack(game, 1, tile, ratioRef.current);
        sound = outcome.message.startsWith("Reinforced") ? "fwReinforce" : open ? "fwExpand" : "fwAttack";
        // A bigger force sounds heavier; a little variety keeps repeats from droning.
        pitch = (1.1 - ratioRef.current * 0.2) * (0.96 + Math.random() * 0.08);
      } else if (isBuilding(current)) {
        outcome = build(game, 1, tile, current);
        sound = current === "silo" || current === "sam" ? "fwBuildHeavy" : "fwBuild";
      } else if (current === "warship") {
        outcome = buildWarship(game, 1, tile);
        sound = "fwBuildHeavy";
      } else if (current === "fleet") {
        outcome = moveFleet(game, 1, tile);
        sound = "fwSelect";
      } else {
        outcome = launchNuke(game, 1, tile, current);
        sound = "fwLaunch";
      }
      pingsRef.current.push({ tile, at: performance.now(), ok: outcome.ok });
      say(outcome.message, outcome.ok);
      sfx(outcome.ok ? sound : "fwError", 80, pitch);
      // One building or bomb per pick; a fleet order keeps the tool so you can steer again.
      if (outcome.ok && current !== "attack" && current !== "fleet") setTool("attack");
      refresh(game);
      requestDraw();
    },
    [say, sfx, requestDraw, refresh],
  );

  const retreatFrom = useCallback(
    (id: number) => {
      const game = gameRef.current;
      if (!game) return;
      const outcome = retreat(game, id, 1);
      say(outcome.message, outcome.ok);
      sfx(outcome.ok ? "fwRetreat" : "fwError");
      refresh(game);
      requestDraw();
    },
    [say, sfx, refresh, requestDraw],
  );

  /** Meet an attack on you head-on: your attack ratio at the attacker's land beside the front. */
  const counter = useCallback(
    (id: number) => {
      const game = gameRef.current;
      if (!game || phaseRef.current !== "playing") return;
      const attack = game.attacks.find((entry) => entry.id === id && entry.to === 1);
      if (!attack) return say("That attack has already ended.", false);
      const tile = attackerTile(game, attack);
      if (tile < 0) return say(`You don't border ${game.nations[attack.from].name} by land.`, false);
      const outcome = launchAttack(game, 1, tile, ratioRef.current);
      say(outcome.message, outcome.ok);
      sfx(outcome.ok ? "fwAttack" : "fwError");
      refresh(game);
      requestDraw();
    },
    [say, sfx, refresh, requestDraw],
  );

  const changeRatio = useCallback((delta: number) => setRatio((value) => Math.round(Math.min(1, Math.max(0.01, value + delta)) * 100) / 100), []);

  const pan = useCallback(
    (dx: number, dy: number) => {
      viewRef.current.x += dx;
      viewRef.current.y += dy;
      clampView();
      requestDraw();
    },
    [clampView, requestDraw],
  );

  /** T: step through the fronts, the most urgent threats first, then your own attacks. */
  const cycleFronts = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const hudNow = snapshot(game, selectedRef.current, feedRef.current);
    const list = [...hudNow.incoming, ...hudNow.outgoing].filter((front) => front.attack >= 0);
    if (!list.length) return say("No battles on your fronts right now.", true);
    const index = list.findIndex((front) => front.attack === selectedRef.current);
    focusFront(list[(index + 1) % list.length]);
  }, [focusFront, say]);

  useGameKeys((event) => {
    const key = event.key.toLowerCase();
    if (phaseRef.current === "setup") return false;
    if (key === " " || key === "p") {
      togglePause();
      return true;
    }
    if (phaseRef.current === "over") return false;
    const { width, height } = sizeRef.current;
    if (TOOL_KEYS[key] && !event.ctrlKey && !event.metaKey && !event.altKey) {
      chooseTool(TOOL_KEYS[key]);
      return true;
    }
    switch (key) {
      case "1":
        changeRatio(-0.05);
        return true;
      case "2":
        changeRatio(0.05);
        return true;
      case "w":
      case "arrowup":
        pan(0, 80);
        return true;
      case "s":
      case "arrowdown":
        pan(0, -80);
        return true;
      case "a":
      case "arrowleft":
        pan(80, 0);
        return true;
      case "d":
      case "arrowright":
        pan(-80, 0);
        return true;
      case "e":
      case "+":
      case "=":
        zoomAt(1.3, width / 2, height / 2);
        return true;
      case "q":
      case "-":
        zoomAt(1 / 1.3, width / 2, height / 2);
        return true;
      case "h":
        centerOnHome();
        return true;
      case "m":
        fit();
        requestDraw();
        return true;
      case "t":
        cycleFronts();
        return true;
      case "escape":
        setTool("attack");
        if (selectedRef.current >= 0) clearSelection();
        return true;
      case "x": {
        // Retreat the selected attack of yours, or else your latest.
        const mine = gameRef.current?.attacks.filter((attack) => attack.from === 1) ?? [];
        const target = mine.find((attack) => attack.id === selectedRef.current) ?? mine.at(-1);
        if (target) retreatFrom(target.id);
        return true;
      }
      case "enter": {
        // Keyboard: act on the hovered tile, or on the middle of the view.
        act(hoverRef.current >= 0 ? hoverRef.current : tileAt(width / 2, height / 2));
        return true;
      }
      default:
        return false;
    }
  });

  // Redraw when the tool changes (the hover outline, ranges and aim follow it).
  useEffect(() => {
    requestDraw();
  }, [tool, requestDraw]);

  /* ----------------------------------------------------------------------------------------- Pointer */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinch: number }>({ moved: false, startX: 0, startY: 0, pinch: 0 });

  const local = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function describeTile(tile: number) {
    const game = gameRef.current;
    if (!game || tile < 0) return setInspect(null);
    const terrain = game.terrain[tile];
    if (terrain === WATER) {
      const ship = game.ships.find((entry) => entry.at === tile);
      return setInspect(ship ? `Water · ${ship.owner === 1 ? "your" : `${game.nations[ship.owner].name}'s`} Warship (${Math.round((ship.hp / WARSHIP_HP) * 100)}%)` : "Water");
    }
    const owner = game.owner[tile];
    let text = "Unclaimed land";
    if (owner) {
      const nation = game.nations[owner];
      if (owner === 1) text = "Your land";
      else {
        const traits = [KIND_LABEL[nation.kind], nation.personality ? PERSONALITIES[nation.personality].label : ""].filter(Boolean).join(" · ");
        const plan = nation.plan ? ` · ${nation.plan.replace(/\bYou\b/, "you")}` : "";
        text = `${nation.name} (${traits}) · ${compact(nation.troops)} troops${plan}`;
      }
    }
    const code = game.building[tile];
    const building = code ? ` · ${BUILDING_LABEL[BUILDING_AT[code]!]}` : "";
    const fallout = game.fallout[tile] > game.tick ? ` · irradiated ${Math.ceil((game.fallout[tile] - game.tick) * TICK_SECONDS)}s` : "";
    setInspect(`${TERRAIN_LABEL[terrain]} · ${text}${building}${fallout}`);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) gesture.current = { moved: false, startX: point.x, startY: point.y, pinch: 0 };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = local(event);
    const previous = pointers.current.get(event.pointerId);
    if (!previous) {
      const tile = tileAt(point.x, point.y);
      if (tile !== hoverRef.current) {
        hoverRef.current = tile;
        describeTile(tile);
        requestDraw();
      }
      return;
    }
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinch > 0) zoomAt(distance / gesture.current.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current.pinch = distance;
      return;
    }
    if (!gesture.current.moved && Math.hypot(point.x - gesture.current.startX, point.y - gesture.current.startY) > 8) gesture.current.moved = true;
    if (gesture.current.moved) pan(point.x - previous.x, point.y - previous.y);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = local(event);
    const wasTap = pointers.current.size === 1 && !gesture.current.moved;
    pointers.current.delete(event.pointerId);
    if (wasTap && event.button === 0) {
      const tile = tileAt(point.x, point.y);
      if (event.pointerType !== "mouse") {
        hoverRef.current = tile;
        describeTile(tile);
      }
      act(tile);
    }
  }

  // Wheel zoom needs a non-passive listener so the page doesn't scroll; Shift + wheel sets the ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!gameRef.current) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (event.shiftKey) changeRatio(event.deltaY < 0 ? 0.05 : -0.05);
      else zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt, changeRatio]);

  /* ----------------------------------------------------------------------------------------- View */

  const inMatch = phase === "playing" || phase === "paused" || phase === "over";
  const player = hud;
  const spawning = player?.stage === "spawn";
  const live = phase === "playing";
  const alerts = player ? player.incoming.filter((front) => front.level !== "watch").length + player.strikes.filter((strike) => strike.incoming).length : 0;
  const picked = tool === "attack" ? null : TOOLS[tool];
  const pickedState = tool === "attack" || !player ? null : player.tools[tool];

  return (
    <GameShell
      game="front-wars"
      title="Front Wars"
      active={phase === "playing"}
      stats={
        inMatch && player ? (
          <>
            <Stat label="Land" value={`${percent(player.share)} / ${percent(player.goal)}`} highlight={player.share >= 0.4} />
            <Stat label="Rank" value={player.rank ? `#${player.rank} of ${player.alive}` : "—"} />
            <Stat label="Time" value={clock(player.time)} className="hidden sm:flex" />
          </>
        ) : (
          <Stat label="Best" value={best ? best.toLocaleString("en") : "—"} />
        )
      }
      actions={
        inMatch ? (
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={togglePause} disabled={phase === "over"} aria-label={phase === "paused" ? "Resume" : "Pause"}>
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            <span className="hidden sm:inline">{phase === "paused" ? "Resume" : "Pause"}</span>
          </Button>
        ) : null
      }
    >
      <div className="fw-layout" data-phase={phase} data-effects={effects}>
        <div className="fw-stage">
          <div className="fw-viewport">
            <canvas
              ref={canvasRef}
              className="fw-canvas"
              data-tool={tool}
              aria-label="Front Wars map. Click or tap land to expand or attack, or to use the tool picked below the map; drag to pan, scroll or pinch to zoom. Your attacks show white troop counts on their fronts, attacks on you red ones."
              role="img"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
              onPointerLeave={() => {
                if (hoverRef.current !== -1 && !pointers.current.size) {
                  hoverRef.current = -1;
                  setInspect(null);
                  requestDraw();
                }
              }}
              onContextMenu={(event) => event.preventDefault()}
            />
            {inMatch && player ? (
              <>
                <div className="fw-hud" role="group" aria-label="Your empire">
                  <div className="fw-res" title={`${Math.round(player.troops).toLocaleString("en")} troops of a ${Math.round(player.cap).toLocaleString("en")} cap. They grow fastest well below the cap; land and Cities raise it.`}>
                    <Users aria-hidden className="fw-res-icon" />
                    <span className="fw-res-body">
                      <span className="fw-res-label">Troops</span>
                      <span className="fw-res-value">
                        {compact(player.troops)}
                        <span className="fw-res-sub"> / {compact(player.cap)}</span>
                      </span>
                      <span className="fw-meter" aria-hidden>
                        <span style={{ width: `${Math.min(100, (player.troops / Math.max(1, player.cap)) * 100)}%` }} />
                      </span>
                      <span className="fw-res-sub">
                        +{compact(player.growth)}/s{player.attacking >= 1 ? ` · ${compact(player.attacking)} fighting` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="fw-res" data-kind="gold" title={`Gold per second: ${compact(player.income.base)} base, ${compact(player.income.factory)} from Factories, ${compact(player.income.trade)} from trade.`}>
                    <Coins aria-hidden className="fw-res-icon" />
                    <span className="fw-res-body">
                      <span className="fw-res-label">Gold</span>
                      <span className="fw-res-value">{compact(player.gold)}</span>
                      <span className="fw-res-sub">+{compact(player.income.total)}/s</span>
                    </span>
                  </div>
                  <div className="fw-res" data-kind="land" title={player.goal < 1 ? `You hold ${percent(player.share)} of all land; ${percent(player.goal)} wins.` : `You already won. You hold ${percent(player.share)} of all land; take every tile to conquer the world.`}>
                    <Flag aria-hidden className="fw-res-icon" />
                    <span className="fw-res-body">
                      <span className="fw-res-label">Land</span>
                      <span className="fw-res-value">{percent(player.share)}</span>
                      <span className="fw-meter" aria-hidden>
                        <span style={{ width: `${Math.min(100, (player.share / player.goal) * 100)}%` }} />
                      </span>
                      <span className="fw-res-sub">
                        goal {percent(player.goal)} · #{player.rank || "—"}
                      </span>
                    </span>
                  </div>
                </div>
                {inspect ? <p className="fw-inspect">{inspect}</p> : null}

                {phase !== "over" && (player.incoming.length || player.strikes.length) ? (
                  <div className="fw-alerts" role="group" aria-label="Threats and strikes">
                    {player.strikes.map((strike) => (
                      <button key={strike.id} type="button" className="fw-alert" data-kind={strike.incoming ? "strike-in" : "strike-out"} onClick={() => focusTile(strike.tile)} title="Show where it will land">
                        <Radiation aria-hidden className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {WEAPONS[strike.weapon].label} {strike.label}
                        </span>
                        <span className="tabular-nums">{Math.ceil(strike.eta)}s</span>
                      </button>
                    ))}
                    {player.incoming.slice(0, 3).map((front) => (
                      <button key={front.key} type="button" className="fw-alert" data-level={front.level} onClick={() => focusFront(front)} title={`Show this front on the map${front.area ? ` (${front.area})` : ""}`}>
                        <ShieldAlert aria-hidden className="size-3.5 shrink-0" />
                        <span className="truncate">{front.other.name}</span>
                        <span className="tabular-nums">{compact(front.troops)}</span>
                        <span className="fw-alert-tag">{front.state === "sailing" ? `boat · ${Math.ceil(front.eta)}s` : LEVEL_LABEL[front.level]}</span>
                      </button>
                    ))}
                    {player.incoming.length > 3 ? (
                      <button type="button" className="fw-alert" data-level="more" onClick={() => setPanel("fronts")}>
                        +{player.incoming.length - 3} more
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="fw-zoom">
                  <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1.3, sizeRef.current.width / 2, sizeRef.current.height / 2)} aria-label="Zoom in" title="Zoom in (E)">
                    +
                  </Button>
                  <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1 / 1.3, sizeRef.current.width / 2, sizeRef.current.height / 2)} aria-label="Zoom out" title="Zoom out (Q)">
                    −
                  </Button>
                  <Button variant="outline" size="icon-sm" onClick={centerOnHome} aria-label="Center on your land" title="Center on your land (H)">
                    <Flag aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => {
                      fit();
                      requestDraw();
                    }}
                    aria-label="Show the whole map"
                    title="Whole map (M)"
                  >
                    <MapIcon aria-hidden />
                  </Button>
                </div>

                {banner ? (
                  <div key={banner.id} className="fw-banner" data-major={banner.major ? "true" : "false"} role="status">
                    <span className="fw-banner-kicker">{banner.count > 1 ? `${banner.count} rivals conquered` : banner.major ? "Nation conquered" : "Conquered"}</span>
                    <span className="fw-banner-name">{banner.name}</span>
                    <span className="fw-banner-detail">{banner.detail}</span>
                  </div>
                ) : null}
              </>
            ) : null}
            <p className="sr-only" aria-live="polite">
              {notice?.text}
            </p>
            {notice && inMatch ? (
              <p key={notice.id} className="fw-notice" data-ok={notice.ok ? "true" : "false"} aria-hidden>
                {notice.text}
              </p>
            ) : null}

            {phase === "setup" ? <Setup settings={settings} onChange={setSettings} onStart={() => start(settings)} /> : null}
            {phase === "paused" ? (
              <GameOverlay
                title="Paused"
                actions={
                  <>
                    <Button size="sm" onClick={togglePause}>
                      <Play aria-hidden />
                      Resume
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => start(settings)}>
                      <RotateCcw aria-hidden />
                      Restart
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPhase("setup")}>
                      New setup
                    </Button>
                  </>
                }
              >
                The match is frozen: troops, gold, missiles and every rival wait for you.
              </GameOverlay>
            ) : null}
            {phase === "over" && result ? (
              <GameOverlay
                title={result.won ? "Victory" : "Defeat"}
                actions={
                  <>
                    {result.canContinue ? (
                      <Button size="sm" onClick={continueMatch}>
                        <Play aria-hidden />
                        Keep playing
                      </Button>
                    ) : null}
                    <Button size="sm" variant={result.canContinue ? "outline" : "default"} onClick={() => start(settings)}>
                      <RotateCcw aria-hidden />
                      Rematch
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPhase("setup")}>
                      New setup
                    </Button>
                  </>
                }
              >
                <span className="block">{result.message}</span>
                <span className="mt-2 block">
                  Score <strong className="text-foreground tabular-nums">{result.score.toLocaleString("en")}</strong>
                  {result.best ? " · New best!" : ""}
                </span>
                <span className="block text-xs">
                  {clock(result.time)} · peak {percent(result.peak)} of the land
                </span>
                {result.canContinue ? <span className="mt-2 block text-xs">Your win is saved. Keep playing to try to take every last tile.</span> : null}
              </GameOverlay>
            ) : null}
          </div>

          {inMatch && player ? (
            <div className="fw-dock" aria-label="Orders">
              <div className="fw-send" role="group" aria-label="Attack ratio">
                <label className="fw-send-head" htmlFor="fw-ratio">
                  <span>Send</span>
                  <strong className="tabular-nums">{Math.round(ratio * 100)}%</strong>
                  <span className="tabular-nums text-muted-foreground">{Math.floor(player.troops * ratio).toLocaleString("en")} troops</span>
                </label>
                <input id="fw-ratio" type="range" min={1} max={100} step={1} value={Math.round(ratio * 100)} onChange={(event) => setRatio(Number(event.target.value) / 100)} aria-describedby="fw-send-note" />
                <div className="fw-send-presets">
                  {RATIO_PRESETS.map((value) => (
                    <button key={value} type="button" aria-pressed={Math.round(ratio * 100) === value * 100} onClick={() => setRatio(value)}>
                      {value * 100}%
                    </button>
                  ))}
                </div>
                <p id="fw-send-note" className="fw-send-note tabular-nums">
                  Home after: {compact(player.troops * (1 - ratio))} · keys 1 / 2
                </p>
              </div>

              <div className="fw-tools" role="toolbar" aria-label="Build, defend and strike">
                {GROUPS.map((group) => (
                  <div key={group.label} className="fw-tool-group" role="group" aria-label={group.label}>
                    <span className="fw-tool-group-label" aria-hidden>
                      {group.label}
                    </span>
                    <div className="fw-tool-row">
                      {group.tools.map((id) => {
                        const info = TOOLS[id];
                        const state = player.tools[id];
                        const Icon = info.icon;
                        return (
                          <button
                            key={id}
                            type="button"
                            className="fw-tool"
                            aria-pressed={tool === id}
                            data-ready={state.ok ? "true" : "false"}
                            disabled={!live}
                            onClick={() => chooseTool(id)}
                            title={`${info.label} (${info.key}): ${info.text}`}
                            aria-describedby="fw-tool-card"
                          >
                            <Icon aria-hidden className="fw-tool-icon" />
                            <span className="fw-tool-name">{info.label}</span>
                            <span className="fw-tool-cost tabular-nums">{state.ok || state.cost === null ? (state.cost !== null ? compact(state.cost) : state.note) : state.note}</span>
                            <kbd className="fw-key">{info.key}</kbd>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div id="fw-tool-card" className="fw-tool-card" data-state={pickedState ? (pickedState.ok ? "ready" : "locked") : "attack"} aria-live="polite">
                {picked && pickedState ? (
                  <>
                    <picked.icon aria-hidden className="fw-tool-card-icon" />
                    <div className="min-w-0 flex-1">
                      <p className="fw-tool-card-title">
                        {picked.label}
                        {pickedState.cost !== null ? <span className="tabular-nums"> · {compact(pickedState.cost)} gold</span> : null}
                        <span className="fw-chip" data-ok={pickedState.ok ? "true" : "false"}>
                          {pickedState.ok ? "Ready" : pickedState.note}
                        </span>
                      </p>
                      <p className="fw-tool-card-text">
                        {picked.text} <strong>{picked.tap}</strong>
                      </p>
                    </div>
                    <Button size="xs" variant="outline" onClick={() => setTool("attack")} aria-label="Cancel and go back to attacking (Esc)">
                      <X aria-hidden />
                      Esc
                    </Button>
                  </>
                ) : (
                  <>
                    <Swords aria-hidden className="fw-tool-card-icon" />
                    <p className="fw-tool-card-text min-w-0 flex-1">
                      {spawning ? (
                        <>
                          <strong>Pick your start:</strong> tap any unclaimed land ({Math.ceil(player.spawnLeft)}s left).
                        </>
                      ) : (
                        <>
                          <strong>Attack · {Math.round(ratio * 100)}%</strong>
                          {player.protectedNow ? " · everyone is protected for a moment" : ""}. Tap unclaimed land to expand or a neighbor to attack; hover first to see the stretch it opens. Across water a boat sails ({MAX_BOATS} at most). Keys: T next front · X retreat.
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {inMatch && player ? (
          <aside className="fw-panel" aria-label="Command">
            <div className="fw-tabs" role="tablist" aria-label="Command panel">
              {(
                [
                  ["fronts", "Fronts", alerts],
                  ["empire", "Empire", 0],
                  ["log", "Log", 0],
                  ["ranks", "Ranks", 0],
                ] as const
              ).map(([id, label, count]) => (
                <button key={id} type="button" role="tab" id={`fw-tab-${id}`} aria-selected={panel === id} aria-controls="fw-tabpanel" onClick={() => setPanel(id)}>
                  {label}
                  {count ? <span className="fw-tab-count">{count}</span> : null}
                </button>
              ))}
            </div>
            <div id="fw-tabpanel" role="tabpanel" aria-labelledby={`fw-tab-${panel}`} className="fw-tabpanel">
              {panel === "fronts" ? (
                <>
                  <section className="fw-card" data-alert={player.incoming.some((front) => front.level !== "watch") ? "true" : "false"}>
                    <h2 className="fw-card-title">
                      <ShieldAlert aria-hidden className="size-4" />
                      Threats
                      <span className="ml-auto text-xs font-medium text-muted-foreground">{player.incoming.length ? `${player.incoming.length} incoming` : "None"}</span>
                    </h2>
                    {player.incoming.length ? (
                      <ul className="fw-fronts" aria-label="Attacks on you, most urgent first">
                        {player.incoming.map((front) => (
                          <li key={front.key} data-level={front.level}>
                            <div className="fw-front-head">
                              <span aria-hidden className="fw-swatch" style={{ "--swatch": front.other.color } as CSSProperties} />
                              <span className="min-w-0 flex-1 truncate font-semibold">
                                {front.other.name}
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  {KIND_LABEL[front.other.kind]}
                                  {front.other.personality ? ` · ${PERSONALITIES[front.other.personality].label}` : ""}
                                </span>
                              </span>
                              <span className="fw-level" data-level={front.level}>
                                {LEVEL_LABEL[front.level]}
                              </span>
                            </div>
                            <p className="fw-front-meta">
                              <strong className="fw-red tabular-nums">{compact(front.troops)}</strong> vs your <span className="tabular-nums">{compact(player.troops)}</span>
                              {" · "}
                              {front.state === "stalling" ? "Faltering" : STATE_LABEL[front.state]}
                              {front.gained ? <span className="tabular-nums"> · −{front.gained.toLocaleString("en")} tiles</span> : null}
                            </p>
                            {front.area || front.signals.length ? <p className="fw-front-meta">{[front.area, ...front.signals].filter(Boolean).join(" · ")}</p> : null}
                            <div className="fw-front-actions">
                              <Button size="xs" variant="outline" onClick={() => focusFront(front)} title="Show this front on the map (T cycles fronts)">
                                <LocateFixed aria-hidden />
                                Focus
                              </Button>
                              {front.attack >= 0 ? (
                                <Button size="xs" variant="outline" onClick={() => counter(front.attack)} disabled={!live} title={`Send your attack ratio (${Math.round(ratio * 100)}%) at ${front.other.name}: your troops meet theirs head-on`}>
                                  <Swords aria-hidden />
                                  Counter
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No one is attacking you. Rivals&apos; troop counts appear red on your border the moment they do.</p>
                    )}
                  </section>

                  {player.selected ? (
                    <section className="fw-card" aria-label="Selected battle">
                      <h2 className="fw-card-title">
                        <Crosshair aria-hidden className="size-4" />
                        <span className="min-w-0 truncate">{player.selected.title}</span>
                        <Button size="icon-xs" variant="ghost" className="ml-auto" onClick={clearSelection} aria-label="Close battle details">
                          <X aria-hidden />
                        </Button>
                      </h2>
                      <dl className="fw-detail">
                        <dt>State</dt>
                        <dd>{player.selected.state === "stalling" && !player.selected.mine ? "Faltering" : STATE_LABEL[player.selected.state]}</dd>
                        <dt>Troops at the front</dt>
                        <dd className={player.selected.mine ? "" : "fw-red"}>
                          {compact(player.selected.troops)} <span className="text-muted-foreground">of {compact(player.selected.sent)} sent</span>
                        </dd>
                        {player.selected.defender !== null ? (
                          <>
                            <dt>Defender&apos;s troops</dt>
                            <dd>{compact(player.selected.defender)}</dd>
                          </>
                        ) : null}
                        <dt>Land taken</dt>
                        <dd>
                          {player.selected.gained.toLocaleString("en")} tiles · {player.selected.rate.toFixed(1)}/s
                        </dd>
                        <dt>Losses</dt>
                        <dd>
                          {compact(player.selected.spent)} attackers{player.selected.defender !== null ? ` · ${compact(player.selected.killed)} defenders` : ""}
                        </dd>
                        <dt>Front</dt>
                        <dd>
                          {player.selected.frontSize.toLocaleString("en")} tiles wide
                          {player.selected.secondsLeft !== null && player.selected.secondsLeft < 60 ? ` · troops last ~${Math.ceil(player.selected.secondsLeft)}s` : ""}
                        </dd>
                        {!player.selected.mine && player.selected.reason ? (
                          <>
                            <dt>Why</dt>
                            <dd>{REASON_TEXT[player.selected.reason]}</dd>
                          </>
                        ) : null}
                      </dl>
                      {player.selected.mine ? (
                        <Button size="sm" variant="outline" onClick={() => retreatFrom(player.selected!.id)} disabled={!live} title={`Retreat: lose ${RETREAT_COST * 100}% of these troops (X)`}>
                          <Undo2 aria-hidden />
                          Retreat
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => counter(player.selected!.id)} disabled={!live}>
                          <Swords aria-hidden />
                          Counter with {Math.round(ratio * 100)}%
                        </Button>
                      )}
                    </section>
                  ) : null}

                  <section className="fw-card">
                    <h2 className="fw-card-title">
                      <Swords aria-hidden className="size-4" />
                      Your attacks
                      <span className="ml-auto text-xs font-medium text-muted-foreground">{player.outgoing.length || "None"}</span>
                    </h2>
                    {player.outgoing.length ? (
                      <ul className="fw-fronts" aria-label="Your attacks">
                        {player.outgoing.map((front) => (
                          <li key={front.key} data-mine="true" data-selected={front.attack >= 0 && front.attack === player.selected?.id ? "true" : "false"}>
                            <div className="fw-front-head">
                              {front.boat >= 0 ? <Anchor aria-hidden className="size-3.5 shrink-0" /> : <span aria-hidden className="fw-swatch" style={{ "--swatch": front.other.color } as CSSProperties} />}
                              <span className="min-w-0 flex-1 truncate font-semibold">{front.boat >= 0 ? `Boat to ${front.other.name}` : front.other.name}</span>
                              <span className="text-xs font-semibold tabular-nums">{compact(front.troops)}</span>
                            </div>
                            <p className="fw-front-meta">
                              {front.state === "sailing" ? `At sea · lands in ${Math.ceil(front.eta)}s · ${player.outgoing.filter((entry) => entry.boat >= 0).length}/${MAX_BOATS} boats` : STATE_LABEL[front.state]}
                              {front.gained ? <span className="tabular-nums"> · +{front.gained.toLocaleString("en")} tiles</span> : null}
                              {!front.expansion && front.otherTroops ? <span className="tabular-nums"> · they have {compact(front.otherTroops)}</span> : null}
                            </p>
                            <div className="fw-front-actions">
                              <Button size="xs" variant="outline" onClick={() => focusFront(front)} title="Show this front on the map">
                                <LocateFixed aria-hidden />
                                Focus
                              </Button>
                              {front.attack >= 0 ? (
                                <Button size="xs" variant="outline" onClick={() => retreatFrom(front.attack)} disabled={!live} title={`Retreat: lose ${RETREAT_COST * 100}% of these troops`}>
                                  <Undo2 aria-hidden />
                                  Retreat
                                </Button>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Tap land to send {Math.round(ratio * 100)}% of your troops. More troops push deeper and lose fewer per tile.</p>
                    )}
                  </section>
                </>
              ) : null}

              {panel === "empire" ? (
                <>
                  <section className="fw-card">
                    <h2 className="fw-card-title">
                      <Coins aria-hidden className="size-4" />
                      Economy
                      <span className="ml-auto text-xs font-semibold tabular-nums">+{compact(player.income.total)}/s</span>
                    </h2>
                    <dl className="fw-ledger">
                      <div>
                        <dt>Base income</dt>
                        <dd className="tabular-nums">+{compact(player.income.base)}/s</dd>
                      </div>
                      <div>
                        <dt>
                          Factories · {player.arsenal.factories} ({player.arsenal.rails} rail link{player.arsenal.rails === 1 ? "" : "s"})
                        </dt>
                        <dd className="tabular-nums">+{compact(player.income.factory)}/s</dd>
                      </div>
                      <div>
                        <dt>
                          Trade · {player.arsenal.ports} Port{player.arsenal.ports === 1 ? "" : "s"}, {player.arsenal.traders} ship{player.arsenal.traders === 1 ? "" : "s"} at sea
                        </dt>
                        <dd className="tabular-nums">~+{compact(player.income.trade)}/s</dd>
                      </div>
                    </dl>
                    <p className="text-xs text-muted-foreground">
                      Trade ships pay when they reach another player&apos;s Port, and Warships of anyone at war with you can seize them. Factories earn more for each railroad.
                    </p>
                  </section>
                  <section className="fw-card">
                    <h2 className="fw-card-title">
                      <Castle aria-hidden className="size-4" />
                      Buildings
                    </h2>
                    <ul className="fw-inventory">
                      {(
                        [
                          ["city", player.arsenal.cities, `+${compact(CITY_TROOPS * player.arsenal.cities)} cap`],
                          ["post", player.arsenal.posts, ""],
                          ["port", player.arsenal.ports, ""],
                          ["factory", player.arsenal.factories, ""],
                          ["silo", player.arsenal.silos, player.arsenal.silos ? (player.arsenal.silosReady ? `${player.arsenal.silosReady} ready` : `ready in ${Math.ceil(player.arsenal.siloWait)}s`) : ""],
                          ["sam", player.arsenal.sams, ""],
                        ] as const
                      ).map(([id, count, note]) => {
                        const Icon = TOOLS[id].icon;
                        return (
                          <li key={id}>
                            <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate">{TOOLS[id].label}</span>
                            {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
                            <strong className="tabular-nums">{count}</strong>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                  <section className="fw-card">
                    <h2 className="fw-card-title">
                      <Ship aria-hidden className="size-4" />
                      Fleet and strikes
                    </h2>
                    {player.arsenal.fleet.length ? (
                      <ul className="fw-inventory" aria-label="Your Warships">
                        {player.arsenal.fleet.map((ship, index) => (
                          <li key={ship.id}>
                            <Ship aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              Warship {index + 1}
                              <span className="fw-share" aria-hidden>
                                <span style={{ width: `${ship.hp * 100}%`, background: ship.hp > 0.4 ? "#6ee7a0" : "#ff5252" }} />
                              </span>
                            </span>
                            <Button size="xs" variant="ghost" onClick={() => focusTile(ship.at)} aria-label={`Show Warship ${index + 1}`}>
                              <LocateFixed aria-hidden />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No Warships. Build a Port, then pick Warship and tap the water to patrol.</p>
                    )}
                    {player.strikes.length ? (
                      <ul className="fw-inventory" aria-label="Bombs in flight">
                        {player.strikes.map((strike) => (
                          <li key={strike.id} data-incoming={strike.incoming ? "true" : "false"}>
                            <Radiation aria-hidden className="size-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">
                              {WEAPONS[strike.weapon].label} {strike.label}
                            </span>
                            <strong className="tabular-nums">{Math.ceil(strike.eta)}s</strong>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                </>
              ) : null}

              {panel === "log" ? (
                <section className="fw-card">
                  <h2 className="fw-card-title">
                    <ScrollText aria-hidden className="size-4" />
                    Battle log
                  </h2>
                  {player.feed.length ? (
                    <ol className="fw-feed" aria-label="Recent events, newest first">
                      {player.feed.map((entry) => (
                        <li key={entry.id} data-tone={entry.tone}>
                          <span className="fw-feed-time tabular-nums">{clock(entry.time)}</span>
                          {entry.tile >= 0 ? (
                            <button type="button" onClick={() => focusTile(entry.tile)} title="Show where this happened">
                              {entry.text}
                            </button>
                          ) : (
                            <span>{entry.text}</span>
                          )}
                          {entry.count > 1 ? <span className="fw-feed-count tabular-nums">×{entry.count}</span> : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-muted-foreground">Battles, landings, launches, sinkings, lost and captured buildings and fallen rivals show up here.</p>
                  )}
                </section>
              ) : null}

              {panel === "ranks" ? (
                <section className="fw-card">
                  <h2 className="fw-card-title">
                    <Trophy aria-hidden className="size-4" />
                    Leaderboard
                    <span className="ml-auto text-xs font-medium text-muted-foreground">Goal {percent(player.goal)}</span>
                  </h2>
                  <ol className="fw-nations">
                    {player.leaders.map((nation, index) => (
                      <li key={nation.id} data-you={nation.id === 1 ? "true" : "false"} data-alive="true">
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                        <span aria-hidden className="fw-swatch" style={{ "--swatch": nation.color } as CSSProperties} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {nation.name}
                            {nation.kind !== "human" ? (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {KIND_LABEL[nation.kind]}
                                {nation.personality ? ` · ${PERSONALITIES[nation.personality].label}` : ""}
                              </span>
                            ) : null}
                          </span>
                          <span className="fw-share" aria-hidden>
                            <span style={{ width: `${Math.min(100, (nation.share / player.goal) * 100)}%`, background: nation.color }} />
                          </span>
                        </span>
                        <span className="text-right text-xs tabular-nums">
                          <span className="block font-semibold text-foreground">{percent(nation.share)}</span>
                          <span className="block text-muted-foreground">{compact(nation.troops)}</span>
                        </span>
                      </li>
                    ))}
                    {player.rank > 10 ? (
                      <li data-you="true" data-alive="true">
                        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{player.rank}</span>
                        <span aria-hidden className="fw-swatch" style={{ "--swatch": "#3f7bff" } as CSSProperties} />
                        <span className="min-w-0 flex-1 text-sm font-medium">You</span>
                        <span className="text-right text-xs tabular-nums">
                          <span className="block font-semibold text-foreground">{percent(player.share)}</span>
                          <span className="block text-muted-foreground">{compact(player.troops)}</span>
                        </span>
                      </li>
                    ) : null}
                  </ol>
                  <p className="text-xs text-muted-foreground">{player.alive.toLocaleString("en")} players still standing. Hover or tap a rival&apos;s land to see its personality and plan.</p>
                </section>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </GameShell>
  );
}

const sameSettings = (a: Settings, b: Settings) => a.map === b.map && a.bots === b.bots && a.nations === b.nations && a.difficulty === b.difficulty;

/** The player's own setup, kept apart from presets so trying a preset never overwrites it. */
const CUSTOM_KEY = "front-wars:custom:v1";

function loadCustom(fallback: Settings): Settings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CUSTOM_KEY) ?? "null") as Partial<Settings> | null;
    if (saved && saved.map && saved.map in MAPS && saved.difficulty && saved.difficulty in DIFFICULTIES && typeof saved.nations === "boolean" && BOT_COUNTS.includes(saved.bots as (typeof BOT_COUNTS)[number])) {
      return { map: saved.map, bots: saved.bots!, nations: saved.nations, difficulty: saved.difficulty };
    }
  } catch {
    // Private mode or bad data.
  }
  return fallback;
}

const nationCount = (settings: Settings) => (settings.nations ? (settings.map === "world" ? 84 : 12) : 0);

/** One setup option: a titled panel with an icon, a segmented choice and what the current choice means. */
function Option<T extends string | number | boolean>({ icon: Icon, title, choices, value, label, onPick, hint }: { icon: LucideIcon; title: string; choices: readonly T[]; value: T; label: (choice: T) => string; onPick: (choice: T) => void; hint: string }) {
  return (
    <fieldset className="fw-option">
      <legend>
        <Icon aria-hidden className="size-4" />
        {title}
      </legend>
      <div role="radiogroup" aria-label={title} className="fw-segment">
        {choices.map((choice) => (
          <button key={String(choice)} type="button" role="radio" aria-checked={value === choice} onClick={() => onPick(choice)}>
            {label(choice)}
          </button>
        ))}
      </div>
      <p>{hint}</p>
    </fieldset>
  );
}

/**
 * Match setup. Every option is always on screen; presets are shortcuts that fill them in. "My setup" is the
 * player's own combination: it's saved whenever an option is changed by hand and comes back with one click, so
 * picking a preset never loses it.
 */
function Setup({ settings, onChange, onStart }: { settings: Settings; onChange: (next: Settings) => void; onStart: () => void }) {
  const preset = PRESETS.find((entry) => sameSettings(entry.settings, settings));
  // The last match's setup counts as the player's own when it wasn't a preset.
  const [custom, setCustom] = useState<Settings>(() => loadCustom(settings));
  const isCustom = sameSettings(custom, settings);
  const nations = nationCount(settings);
  const rivals = settings.bots + nations;

  function edit(next: Settings) {
    onChange(next);
    setCustom(next);
    try {
      window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; the match still uses it.
    }
  }

  return (
    <div className="fw-setup">
      <div className="fw-setup-card">
        <header className="fw-setup-head">
          <p className="fw-kicker">Solo campaign</p>
          <h2>Set up your conquest</h2>
          <p>Choose the map, your rivals and how sharp they play. Every combination works; nobody gets hidden bonuses.</p>
        </header>

        <div className="fw-setup-body">
          <div className="fw-setup-main">
            <div className="fw-quick">
              <p className="fw-quick-label" id="fw-quick-label">
                Start from
              </p>
              <div role="radiogroup" aria-labelledby="fw-quick-label" className="fw-presets">
                <button type="button" role="radio" aria-checked={isCustom && !preset} onClick={() => onChange(custom)} title="Your own setup, as you last left it">
                  <span className="font-semibold">My setup</span>
                  <span className="text-xs text-muted-foreground">
                    {MAPS[custom.map].label} · {custom.bots} Bots · {custom.nations ? "Nations" : "No Nations"} · {DIFFICULTIES[custom.difficulty].label}
                  </span>
                </button>
                {PRESETS.map((entry) => (
                  <button key={entry.id} type="button" role="radio" aria-checked={preset?.id === entry.id} onClick={() => onChange(entry.settings)} title={entry.hint}>
                    <span className="font-semibold">{entry.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {MAPS[entry.settings.map].label} · {entry.settings.bots} Bots · {DIFFICULTIES[entry.settings.difficulty].label}
                    </span>
                  </button>
                ))}
              </div>
              <p className="fw-quick-hint" aria-live="polite">
                {preset ? `${preset.label}: ${preset.hint} Change any option below to make it your own.` : "Your own setup. Changes are remembered for next time."}
              </p>
            </div>

            <div className="fw-option-grid">
              <Option icon={MapIcon} title="Map" choices={Object.keys(MAPS) as MapKind[]} value={settings.map} label={(map) => MAPS[map].label} onPick={(map) => edit({ ...settings, map })} hint={MAPS[settings.map].hint} />
              <Option
                icon={Swords}
                title="Difficulty"
                choices={Object.keys(DIFFICULTIES) as Difficulty[]}
                value={settings.difficulty}
                label={(difficulty) => DIFFICULTIES[difficulty].label}
                onPick={(difficulty) => edit({ ...settings, difficulty })}
                hint={`${DIFFICULTIES[settings.difficulty].hint} Harder rivals time their wars and bombs better; they don't attack more often.`}
              />
              <Option
                icon={Users}
                title="Bots"
                choices={BOT_COUNTS}
                value={settings.bots as (typeof BOT_COUNTS)[number]}
                label={(count) => String(count)}
                onPick={(bots) => edit({ ...settings, bots })}
                hint={`Small tribes with a third of your troop cap and half your growth, annexed when one player surrounds them. ${BOT_HINTS[settings.bots]}`}
              />
              <Option
                icon={Castle}
                title="Nations"
                choices={[true, false] as const}
                value={settings.nations}
                label={(on) => (on ? "On" : "Off")}
                onPick={(on) => edit({ ...settings, nations: on })}
                hint={`${settings.map === "world" ? "84 real countries start in their homelands" : "12 rival realms"}: the strong rivals. They expand, build economies and arsenals, sail, and pick their wars. Off: only Bots, a gentler, more open match.`}
              />
            </div>
          </div>

          <aside className="fw-summary" aria-label="Your match">
            <p className="fw-kicker">Your match</p>
            <dl>
              <div>
                <dt>Map</dt>
                <dd>{MAPS[settings.map].label}</dd>
              </div>
              <div>
                <dt>Nations</dt>
                <dd>{nations ? nations : "Off"}</dd>
              </div>
              <div>
                <dt>Bots</dt>
                <dd>{settings.bots || "None"}</dd>
              </div>
              <div>
                <dt>Difficulty</dt>
                <dd>{DIFFICULTIES[settings.difficulty].label}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">
              {rivals ? `${rivals.toLocaleString("en")} rivals.` : "No rivals: the land is all yours to take."} Win by holding {percent(WIN_SHARE)} of all land.
            </p>
            <div className="fw-arsenal-strip" aria-label="What you can build">
              {(Object.keys(TOOLS) as Picker[])
                .filter((id) => id !== "fleet")
                .map((id) => {
                  const Icon = TOOLS[id].icon;
                  return (
                    <span key={id} title={`${TOOLS[id].label}: ${TOOLS[id].text}`}>
                      <Icon aria-hidden className="size-4" />
                      <span className="sr-only">{TOOLS[id].label}</span>
                    </span>
                  );
                })}
            </div>
            <Button size="lg" onClick={onStart} className="w-full">
              <Swords aria-hidden />
              Start match
            </Button>
          </aside>
        </div>

        <details className="fw-rules">
          <summary>How to play</summary>
          <ul>
            <li>
              <strong>Win</strong> by holding {percent(WIN_SHARE)} of all land. After winning you can keep playing to conquer the whole map. You lose if your last land falls or a rival reaches {percent(WIN_SHARE)} first.
            </li>
            <li>
              <strong>Start:</strong> for 10 seconds, tap anywhere to choose your spawn. Then everyone is protected for 5 seconds.
            </li>
            <li>
              <strong>Expand and attack</strong> by tapping unclaimed land or a neighbor: your attack ratio of troops opens the stretch of border nearest where you tap (hover to preview it) and pushes on from there until it runs out. A bigger force breaks through faster and loses fewer troops per tile; terrain, Defense Posts and a counterattack still slow it down.
            </li>
            <li>
              <strong>Economy:</strong> gold comes in steadily. Ports (on the coast) trade with other players&apos; Ports; Factories earn more for each railroad to your Cities, Ports and Factories.
            </li>
            <li>
              <strong>Defense:</strong> Cities raise your troop cap, Defense Posts make nearby land costly to take, SAM Launchers shoot at bombs aimed within their range, and Warships (from a Port) sink boats landing on you and fight your enemies at sea.
            </li>
            <li>
              <strong>Strikes:</strong> a Missile Silo launches Atom Bombs, Hydrogen Bombs and MIRVs. Bombs destroy land, buildings, troops and ships, and leave fallout that&apos;s slow to retake. Rivals use the same rules and prices.
            </li>
            <li>
              <strong>Fronts:</strong> your attacks show white troop counts on the map, attacks on you red ones. The Fronts tab lists every attack on you, most urgent first; Focus jumps to it, Counter meets it head-on.
            </li>
            <li>
              <strong>Boats:</strong> tap land across the water to sail troops there (up to {MAX_BOATS} at sea). <strong>Retreat</strong> costs {RETREAT_COST * 100}% of an attack.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Controls: tap or click to act · drag to pan · scroll or pinch to zoom · 1 / 2 ratio · {(Object.keys(TOOLS) as Picker[]).map((id) => `${TOOLS[id].key} ${TOOLS[id].label}`).join(" · ")} · Esc back to attacking · T next front · X retreat · H home · M whole map · Space pause.
          </p>
        </details>
      </div>
    </div>
  );
}
