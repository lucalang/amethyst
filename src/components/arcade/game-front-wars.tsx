"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Anchor, Building2, Crosshair, Flag, LocateFixed, MapPin, Pause, Play, RotateCcw, ScrollText, Shield, ShieldAlert, Swords, Trophy, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameOverlay, GameShell, Stat, useAway, useArcade, useGameAchievementTracking, useGameKeys, useRecord } from "./game-shell";
import { observeCanvas, startLoop, type CanvasSize } from "./engine";
import {
  BOAT_SPEED,
  BOT_COUNTS,
  CITY_TROOPS,
  DIFFICULTIES,
  MAPS,
  MAX_BOATS,
  PERSONALITIES,
  RETREAT_COST,
  SPAWN_TICKS,
  TERRAIN_LABEL,
  TICK_SECONDS,
  WATER,
  WIN_SHARE,
  attackState,
  build,
  chooseSpawn,
  cityCost,
  compactNumber as compact,
  createGame,
  goldPerTick,
  immune,
  launchAttack,
  matchScore,
  maxTroops,
  postCost,
  retreat,
  share,
  step,
  troopsAttacking,
  type Attack,
  type AttackReason,
  type Difficulty,
  type FrontState,
  type Game,
  type GameEvent,
  type Kind,
  type MapKind,
  type Nation,
  type Personality,
  type Settings,
} from "./front-wars/engine";
import { MapRenderer, drawFrame, type Ping, type View } from "./front-wars/render";
import "./front-wars/front-wars.css";

type Phase = "setup" | "playing" | "paused" | "over";
type Mode = "attack" | "city" | "post";
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
type Hud = {
  stage: "spawn" | "battle";
  spawnLeft: number;
  protectedNow: boolean;
  spawned: boolean;
  troops: number;
  cap: number;
  attacking: number;
  gold: number;
  income: number;
  share: number;
  time: number;
  cityCost: number;
  postCost: number;
  rank: number;
  alive: number;
  leaders: { id: number; name: string; color: string; kind: Kind; personality: Personality | null; share: number; troops: number }[];
  outgoing: Front[];
  incoming: Front[];
  selected: Detail | null;
  feed: FeedEntry[];
};
type Result = { won: boolean; score: number; best: boolean; time: number; peak: number; message: string };

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
const buildingName = (building: "city" | "post") => (building === "city" ? "City" : "Defense Post");

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
  const buildings = near.filter((spot) => game.owner[spot] === 1).map((spot) => (game.building[spot] === 1 ? "City" : "Post"));
  const close = buildings.includes("City") ? " · near your City" : buildings.length ? " · near your Post" : "";
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
  if (near) signals.push(nearCity ? "at your City" : "at your Post");
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
    attacking: troopsAttacking(game, 1),
    gold: player.gold,
    income: goldPerTick(player) / TICK_SECONDS,
    share: share(game, player),
    time: game.time,
    cityCost: cityCost(player.cities),
    postCost: postCost(player.posts.length),
    rank: alive.findIndex((nation) => nation.id === 1) + 1,
    alive: alive.length,
    leaders: alive.slice(0, 10).map((nation) => ({ id: nation.id, name: nation.name, color: nation.color, kind: nation.kind, personality: nation.personality, share: share(game, nation), troops: nation.troops })),
    outgoing,
    incoming,
    selected: detail,
    feed: feed.slice(0, 8),
  };
}

/** A match event as a line in the battle log (and whether it deserves a toast and a sound), or null. */
function describe(game: Game, event: GameEvent): { tone: Tone; text: string; tile: number; toast?: boolean } | null {
  const name = (id: number) => (id ? game.nations[id].name : "open land");
  switch (event.kind) {
    case "attack":
      if (event.to !== 1) return null;
      return {
        tone: "bad",
        text: `${name(event.from)} attacks you with ${compact(event.troops)}${event.reason ? `: ${REASON_TEXT[event.reason]}` : ""}.`,
        tile: event.tile,
        toast: event.troops >= game.nations[1].troops * 0.2,
      };
    case "sailing":
      if (event.to !== 1) return null;
      return { tone: "warn", text: `${name(event.from)}'s boat (${compact(event.troops)}) is sailing for your coast.`, tile: event.tile, toast: true };
    case "landed":
      if (event.from === 1) return { tone: "good", text: `Your boat landed ${compact(event.troops)} troops${event.to ? ` on ${name(event.to)}'s shore` : ""}.`, tile: event.tile };
      if (event.to === 1) return { tone: "bad", text: `${name(event.from)} landed ${compact(event.troops)} troops on your shore!`, tile: event.tile, toast: true };
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
      if (event.reason === "spent") return { tone: "good", text: `You held off ${name(event.from)} (lost ${tiles}).`, tile: event.tile };
      if (event.reason === "retreat") return { tone: "good", text: `${name(event.from)} pulled back (you lost ${tiles}).`, tile: event.tile };
      if (event.reason === "clash") return { tone: "good", text: `Your counterattack stopped ${name(event.from)}.`, tile: event.tile };
      if (event.reason === "complete") return { tone: "bad", text: `${name(event.from)} broke through (you lost ${tiles}).`, tile: event.tile };
      return null;
    }
    case "stalling":
      if (event.from === 1) return { tone: "warn", text: `Your attack on ${name(event.to)} is stalling: ${compact(event.troops)} troops left. Reinforce or retreat.`, tile: event.tile, toast: true };
      return { tone: "good", text: `${name(event.from)}'s attack on you is faltering.`, tile: event.tile };
    case "threatened":
      return { tone: "bad", text: `${name(event.from)}'s front reached your ${buildingName(event.building)}.`, tile: event.tile, toast: true };
    case "clash":
      if (event.b === 1) return { tone: "warn", text: `${name(event.a)} met your attack head-on: ${compact(event.troops)} troops fell on each side.`, tile: event.tile };
      return null;
    case "captured-building":
      if (event.to === 1) return { tone: "good", text: `You captured ${name(event.from)}'s ${buildingName(event.building)}.`, tile: event.tile, toast: true };
      if (event.from === 1) return { tone: "bad", text: `You lost a ${buildingName(event.building)} to ${name(event.to)}.`, tile: event.tile, toast: true };
      return null;
    case "eliminated": {
      if (event.nation === 1) return null;
      const fallen = game.nations[event.nation];
      if (event.by === 1) return { tone: "good", text: `You conquered ${fallen.name}.`, tile: -1, toast: true };
      if (fallen.kind === "nation") return { tone: "info", text: `${fallen.name} fell to ${event.by ? name(event.by) : "a rival"}.`, tile: -1 };
      return null;
    }
    case "annexed":
      if (event.by === 1) return { tone: "good", text: `${game.nations[event.nation].name} was surrounded and joined you.`, tile: -1, toast: true };
      return null;
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
  const { play } = useArcade();
  const { best, submit } = useRecord("front-wars", records[""] ?? null);
  // The last match's setup (this component only renders in the browser: it's loaded with ssr: false).
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [phase, setPhase] = useState<Phase>("setup");
  const [hud, setHud] = useState<Hud | null>(null);
  const [ratio, setRatio] = useState(0.2);
  const [mode, setMode] = useState<Mode>("attack");
  const [notice, setNotice] = useState<{ text: string; ok: boolean; id: number } | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const sizeRef = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  const hoverRef = useRef(-1);
  const pingsRef = useRef<Ping[]>([]);
  const ratioRef = useRef(ratio);
  const modeRef = useRef(mode);
  const phaseRef = useRef(phase);
  const drawRequest = useRef(0);
  const alphaRef = useRef(0);
  /** The attack picked in the panel (or with T): outlined on the map, its numbers in the Battle card. */
  const selectedRef = useRef(-1);
  const feedRef = useRef<FeedEntry[]>([]);
  const feedId = useRef(0);
  useEffect(() => {
    ratioRef.current = ratio;
    modeRef.current = mode;
    phaseRef.current = phase;
  }, [ratio, mode, phase]);

  useGameAchievementTracking("front-wars", phase);

  const say = useCallback((text: string, ok: boolean) => setNotice({ text, ok, id: Date.now() }), []);
  const refresh = useCallback((game: Game) => {
    if (selectedRef.current >= 0 && !game.attacks.some((attack) => attack.id === selectedRef.current)) selectedRef.current = -1;
    setHud(snapshot(game, selectedRef.current, feedRef.current));
  }, []);

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
    drawFrame(ctx, renderer, game, viewRef.current, sizeRef.current, {
      hover: hoverRef.current,
      mode: modeRef.current,
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
      const won = game.outcome?.winner === 1;
      const score = matchScore(game);
      const improved = submit(score);
      const winner = game.outcome?.winner ? game.nations[game.outcome.winner] : null;
      const message = won
        ? `You hold ${percent(share(game, game.nations[1]))} of the land.`
        : game.outcome?.reason === "conquered"
          ? "Your last land fell."
          : `${winner?.name ?? "A rival"} took ${percent(winner ? share(game, winner) : WIN_SHARE)} of the land first.`;
      selectedRef.current = -1;
      setResult({ won, score, best: improved, time: game.time, peak: game.nations[1].peak, message });
      refresh(game);
      setPhase("over");
      setMode("attack");
      play(won ? "win" : "over");
    },
    [play, submit, refresh],
  );

  const start = useCallback(
    (next: Settings) => {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Not saved; it still plays.
      }
      const game = createGame(next, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
      gameRef.current = game;
      rendererRef.current = new MapRenderer(game);
      pingsRef.current = [];
      hoverRef.current = -1;
      selectedRef.current = -1;
      feedRef.current = [];
      setSettings(next);
      setResult(null);
      setMode("attack");
      refresh(game);
      setPhase("playing");
      fit();
      say("Choose where to start: tap any unclaimed land.", true);
      play("tap");
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
          play("power");
          centerOnHome();
        }
        let toast: { tone: Tone; text: string } | null = null;
        for (const event of game.events) {
          const line = describe(game, event);
          if (!line) continue;
          log(game, line);
          if (line.toast && (!toast || (line.tone === "bad" && toast.tone !== "bad"))) toast = line;
        }
        if (toast) {
          say(toast.text, toast.tone === "good" || toast.tone === "info");
          play(toast.tone === "good" ? "crack" : toast.tone === "bad" ? "penalty" : "tick");
        }
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
  }, [phase, draw, requestDraw, finish, say, play, centerOnHome, refresh, log]);

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

  const act = useCallback(
    (tile: number) => {
      const game = gameRef.current;
      if (!game || tile < 0 || phaseRef.current !== "playing") return;
      const current = modeRef.current;
      const outcome =
        game.phase === "spawn" ? chooseSpawn(game, tile) : current === "attack" ? launchAttack(game, 1, tile, ratioRef.current) : build(game, 1, tile, current);
      pingsRef.current.push({ tile, at: performance.now(), ok: outcome.ok });
      say(outcome.message, outcome.ok);
      play(outcome.ok ? (game.phase === "spawn" ? "place" : current === "attack" ? "swoosh" : "place") : "invalid");
      if (outcome.ok && current !== "attack") setMode("attack");
      refresh(game);
      requestDraw();
    },
    [say, play, requestDraw, refresh],
  );

  const retreatFrom = useCallback(
    (id: number) => {
      const game = gameRef.current;
      if (!game) return;
      const outcome = retreat(game, id, 1);
      say(outcome.message, outcome.ok);
      play(outcome.ok ? "erase" : "invalid");
      refresh(game);
      requestDraw();
    },
    [say, play, refresh, requestDraw],
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
      play(outcome.ok ? "swoosh" : "invalid");
      refresh(game);
      requestDraw();
    },
    [say, play, refresh, requestDraw],
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
      case "c":
        setMode((current) => (current === "city" ? "attack" : "city"));
        return true;
      case "f":
        setMode((current) => (current === "post" ? "attack" : "post"));
        return true;
      case "t":
        cycleFronts();
        return true;
      case "escape":
        setMode("attack");
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

  // Redraw when the placement mode changes (the hover outline and a Post's reach follow it).
  useEffect(() => {
    requestDraw();
  }, [mode, requestDraw]);

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
    if (terrain === WATER) return setInspect("Water");
    const owner = game.owner[tile];
    let text = "Unclaimed land";
    if (owner) {
      const nation = game.nations[owner];
      if (owner === 1) text = nation.name;
      else {
        const traits = [KIND_LABEL[nation.kind], nation.personality ? PERSONALITIES[nation.personality].label : ""].filter(Boolean).join(" · ");
        const plan = nation.plan ? ` · ${nation.plan.replace(/\bYou\b/, "you")}` : "";
        text = `${nation.name} (${traits}) · ${compact(nation.troops)} troops${plan}`;
      }
    }
    const building = game.building[tile] === 1 ? " · City" : game.building[tile] === 2 ? " · Defense Post" : "";
    setInspect(`${TERRAIN_LABEL[terrain]} · ${text}${building}`);
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

  return (
    <GameShell
      game="front-wars"
      title="Front Wars"
      active={phase === "playing"}
      stats={
        inMatch && player ? (
          <>
            <Stat label="Land" value={`${percent(player.share)} / ${percent(WIN_SHARE)}`} highlight={player.share >= 0.4} />
            <Stat label="Troops" value={`${compact(player.troops)} / ${compact(player.cap)}`} />
            <Stat label="Gold" value={compact(player.gold)} />
            <Stat label="Attack" value={`${Math.round(ratio * 100)}%`} />
            <Stat label="Rank" value={player.rank ? `#${player.rank} of ${player.alive}` : "—"} className="hidden sm:flex" />
            <Stat label="Time" value={clock(player.time)} className="hidden md:flex" />
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
      <div className="fw-layout" data-phase={phase}>
        <div className="fw-stage">
          <canvas
            ref={canvasRef}
            className="fw-canvas"
            aria-label="Front Wars map. Click or tap land to expand or attack; drag to pan, scroll or pinch to zoom. Your attacks show white troop counts on their fronts, attacks on you red ones."
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
              <div className="fw-mapbar">
                <span className="fw-mode" data-mode={spawning ? "spawn" : mode}>
                  {spawning ? <MapPin aria-hidden className="size-3.5" /> : mode === "attack" ? <Crosshair aria-hidden className="size-3.5" /> : mode === "city" ? <Building2 aria-hidden className="size-3.5" /> : <Shield aria-hidden className="size-3.5" />}
                  {spawning
                    ? `${player.spawned ? "Move your start" : "Pick your start"} · ${Math.ceil(player.spawnLeft)}s`
                    : mode === "attack"
                      ? `Attack · ${Math.round(ratio * 100)}%${player.protectedNow ? " · protected" : ""}`
                      : mode === "city"
                        ? "Place a City"
                        : "Place a Defense Post"}
                </span>
                {inspect ? <span className="fw-inspect">{inspect}</span> : null}
              </div>
              {player.incoming.length && phase !== "over" ? (
                <div className="fw-threats" role="group" aria-label="Attacks on you">
                  {player.incoming.slice(0, 3).map((front) => (
                    <button key={front.key} type="button" data-level={front.level} onClick={() => focusFront(front)} title={`Show this front on the map${front.area ? ` (${front.area})` : ""}`}>
                      <ShieldAlert aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{front.other.name}</span>
                      <span className="tabular-nums">{compact(front.troops)}</span>
                      <span className="fw-threat-level">{front.state === "sailing" ? `boat · ${Math.ceil(front.eta)}s` : LEVEL_LABEL[front.level]}</span>
                    </button>
                  ))}
                  {player.incoming.length > 3 ? <span className="fw-threats-more">+{player.incoming.length - 3} more</span> : null}
                </div>
              ) : null}
              <div className="fw-zoom">
                <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1.3, sizeRef.current.width / 2, sizeRef.current.height / 2)} aria-label="Zoom in">
                  +
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1 / 1.3, sizeRef.current.width / 2, sizeRef.current.height / 2)} aria-label="Zoom out">
                  −
                </Button>
                <Button variant="outline" size="icon-sm" onClick={centerOnHome} aria-label="Center on your land" title="Center on your land (H)">
                  <Flag aria-hidden />
                </Button>
              </div>
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
              The match is frozen: troops, gold and every rival wait for you.
            </GameOverlay>
          ) : null}
          {phase === "over" && result ? (
            <GameOverlay
              title={result.won ? "Victory" : "Defeat"}
              actions={
                <>
                  <Button size="sm" onClick={() => start(settings)}>
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
            </GameOverlay>
          ) : null}
        </div>

        {inMatch && player ? (
          <aside className="fw-panel" aria-label="Command">
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
                Attack
              </h2>
              <label className="fw-ratio">
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  Attack ratio
                  <span className="font-semibold text-foreground tabular-nums">
                    {Math.round(ratio * 100)}% · {compact(player.troops * ratio)} troops
                  </span>
                </span>
                <input type="range" min={1} max={100} step={1} value={Math.round(ratio * 100)} onChange={(event) => setRatio(Number(event.target.value) / 100)} />
              </label>
              <p className="text-xs text-muted-foreground">
                {spawning
                  ? "Tap the map to choose where you start."
                  : live
                    ? "Tap unclaimed land to expand, or a neighbor to attack. Across water, a boat sails."
                    : "Resume to give orders."}{" "}
                Keys: 1 / 2 ratio, T next front, X retreat.
              </p>
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
              ) : null}
            </section>

            <section className="fw-card">
              <h2 className="fw-card-title">
                <Building2 aria-hidden className="size-4" />
                Build
                <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">+{compact(player.income)} gold/s</span>
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={mode === "city" ? "default" : "outline"}
                  aria-pressed={mode === "city"}
                  disabled={!live || spawning}
                  onClick={() => setMode((current) => (current === "city" ? "attack" : "city"))}
                  title={`+${compact(CITY_TROOPS)} troop cap (C)`}
                >
                  <Building2 aria-hidden />
                  City · {compact(player.cityCost)}
                </Button>
                <Button
                  size="sm"
                  variant={mode === "post" ? "default" : "outline"}
                  aria-pressed={mode === "post"}
                  disabled={!live || spawning}
                  onClick={() => setMode((current) => (current === "post" ? "attack" : "post"))}
                  title="Attacks on land in its reach lose far more troops and slow to a crawl (F)"
                >
                  <Shield aria-hidden />
                  Post · {compact(player.postCost)}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "attack" ? `Cities add ${compact(CITY_TROOPS)} troop cap; Defense Posts guard the land around them.` : "Tap your own land to place it. Esc cancels."}
              </p>
            </section>

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
                <p className="text-xs text-muted-foreground">Battles, landings, lost and captured buildings and fallen rivals show up here.</p>
              )}
            </section>

            <section className="fw-card">
              <h2 className="fw-card-title">
                <Trophy aria-hidden className="size-4" />
                Leaderboard
                <span className="ml-auto text-xs font-medium text-muted-foreground">Goal {percent(WIN_SHARE)}</span>
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
                        <span style={{ width: `${Math.min(100, (nation.share / WIN_SHARE) * 100)}%`, background: nation.color }} />
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
              <p className="text-xs text-muted-foreground">{player.alive.toLocaleString("en")} players still standing. Hover a rival&apos;s land to see its personality and plan.</p>
            </section>
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
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Solo match</p>
          <h2 className="text-2xl font-bold tracking-tight">Set up your conquest</h2>
          <p className="text-sm text-muted-foreground">Choose the map, your rivals and how sharp they play. Every combination works.</p>
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
              <fieldset className="fw-options">
                <legend>Map</legend>
                <div role="radiogroup" aria-label="Map" className="fw-segment">
                  {(Object.keys(MAPS) as MapKind[]).map((map) => (
                    <button key={map} type="button" role="radio" aria-checked={settings.map === map} onClick={() => edit({ ...settings, map })}>
                      {MAPS[map].label}
                    </button>
                  ))}
                </div>
                <p>{MAPS[settings.map].hint}</p>
              </fieldset>

              <fieldset className="fw-options">
                <legend>Difficulty</legend>
                <div role="radiogroup" aria-label="Difficulty" className="fw-segment">
                  {(Object.keys(DIFFICULTIES) as Difficulty[]).map((difficulty) => (
                    <button key={difficulty} type="button" role="radio" aria-checked={settings.difficulty === difficulty} onClick={() => edit({ ...settings, difficulty })}>
                      {DIFFICULTIES[difficulty].label}
                    </button>
                  ))}
                </div>
                <p>{DIFFICULTIES[settings.difficulty].hint} It applies to Bots and Nations alike; nobody sees more than you or gets hidden bonuses.</p>
              </fieldset>

              <fieldset className="fw-options">
                <legend>Bots</legend>
                <div role="radiogroup" aria-label="Bots" className="fw-segment">
                  {BOT_COUNTS.map((count) => (
                    <button key={count} type="button" role="radio" aria-checked={settings.bots === count} onClick={() => edit({ ...settings, bots: count })}>
                      {count}
                    </button>
                  ))}
                </div>
                <p>Small tribes with a third of your troop cap and half your growth, annexed when one player surrounds them. {BOT_HINTS[settings.bots]}</p>
              </fieldset>

              <fieldset className="fw-options">
                <legend>Nations</legend>
                <div role="radiogroup" aria-label="Nations" className="fw-segment">
                  {[true, false].map((on) => (
                    <button key={String(on)} type="button" role="radio" aria-checked={settings.nations === on} onClick={() => edit({ ...settings, nations: on })}>
                      {on ? "On" : "Off"}
                    </button>
                  ))}
                </div>
                <p>
                  {settings.map === "world" ? "84 real countries start in their homelands" : "12 rival realms"}: the strong rivals. They expand, build Cities and Defense Posts, sail, and
                  pick their wars. Off: only Bots, a gentler, more open match.
                </p>
              </fieldset>
            </div>
          </div>

          <aside className="fw-summary" aria-label="Your match">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Your match</p>
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
              <strong>Win</strong> by holding {percent(WIN_SHARE)} of all land. You lose if your last land falls or a rival reaches {percent(WIN_SHARE)} first.
            </li>
            <li>
              <strong>Start:</strong> for 10 seconds, tap anywhere to choose your spawn. Then everyone is protected for 5 seconds.
            </li>
            <li>
              <strong>Expand and attack</strong> by tapping unclaimed land or a neighbor: you send your attack ratio of troops and they push your whole shared border forward until they run out.
            </li>
            <li>
              <strong>Fronts:</strong> your attacks show white troop counts on the map, attacks on you red ones. The Threats list keeps every attack on you, most urgent first; Focus jumps to it, Counter meets it head-on.
            </li>
            <li>
              <strong>Troops</strong> grow fastest well below your cap; more land and Cities raise the cap. Hills and mountains cost more, and land near a Defense Post costs far more.
            </li>
            <li>
              <strong>Rivals</strong> are Expansionist, Defensive, Opportunist or Warlike: hover their land to see which, and what they&apos;re doing.
            </li>
            <li>
              <strong>Boats:</strong> tap land across the water to sail troops there (up to {MAX_BOATS} at sea). <strong>Retreat</strong> costs {RETREAT_COST * 100}% of an attack.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">Controls: tap or click to act · drag to pan · scroll or pinch to zoom · 1 / 2 ratio · C City · F Post · T next front · X retreat · H home · M whole map · Space pause.</p>
        </details>
      </div>
    </div>
  );
}
