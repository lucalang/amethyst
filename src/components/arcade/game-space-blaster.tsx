"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { Bot, ChevronsUp, Crosshair, Flame, Gauge, Hexagon, Layers, Pause, Play, Rocket, Shield, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { fitWorld, observeCanvas, startLoop, withAlpha, type CanvasSize } from "./engine";
import { GAME_PALETTES } from "./palettes";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { focusQuietly, GameOverlay, GameShell, Stat, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import type { SoundName } from "./sound";
import "./minigames.css";

/**
 * Space Blaster: a wave-based roguelite shooter. Clear a wave, pick one of three upgrades, and
 * face the next, tougher wave. Every fifth wave is a Mothership boss.
 */
const WIDTH = 480;
const HEIGHT = 640;
const SHIP_Y = 570;
/** The ship's hitbox: a circle well inside the drawn hull, so near misses stay misses. */
const SHIP_HIT = 7;
const TOP_BAND = 330;
const COUNT_STEPS = 30;
const MAX_PARTICLES = 700;
const BOSS_EVERY = 5;

type Phase = "ready" | "playing" | "upgrade" | "paused" | "countdown" | "dying" | "over";
type WaveState = "intro" | "spawning" | "clearing" | "cleared";

/* Upgrades: a registry, so new ones only need an entry here (and an icon below). */
const SHIELD_RECHARGE = [0, 18, 13, 9];
const MISSILE_DELAY = [0, 1.6, 1.15, 0.8];
export type UpgradeId = "rate" | "barrels" | "damage" | "pierce" | "engines" | "hull" | "shield" | "missiles" | "drones" | "repair";
type UpgradeInfo = { name: string; max: number; color: string; weight: number; text: (next: number) => string };
export const UPGRADES: Record<UpgradeId, UpgradeInfo> = {
  rate: { name: "Rapid Cyclers", max: 6, color: "#ffd84a", weight: 10, text: () => "Lasers fire 19% faster." },
  barrels: { name: "Extra Laser", max: 4, color: "#4fd8ff", weight: 9, text: (n) => `Fire ${n + 1} lasers at once.` },
  damage: { name: "Focused Beams", max: 5, color: "#ff7ad9", weight: 9, text: () => "Every laser hits 50% harder (of base)." },
  pierce: { name: "Piercing Rounds", max: 3, color: "#c9a2ff", weight: 6, text: (n) => `Lasers punch through ${n} more ${n === 1 ? "target" : "targets"}.` },
  engines: { name: "Afterburners", max: 3, color: "#7dff9a", weight: 5, text: () => "Fly 12% faster." },
  hull: { name: "Reinforced Hull", max: 3, color: "#ff9f6b", weight: 6, text: () => "+1 max hull, and repairs 1." },
  shield: {
    name: "Deflector",
    max: 3,
    color: "#8fe9ff",
    weight: 5,
    text: (n) => (n === 1 ? `A shield blocks one hit and recharges every ${SHIELD_RECHARGE[1]}s.` : `Shield recharges every ${SHIELD_RECHARGE[n]}s.`),
  },
  missiles: {
    name: "Seeker Missiles",
    max: 3,
    color: "#ff6b6b",
    weight: 6,
    text: (n) => (n === 1 ? `Launch a homing missile every ${MISSILE_DELAY[1]}s.` : `Missiles every ${MISSILE_DELAY[n]}s.`),
  },
  drones: { name: "Wingman Drone", max: 2, color: "#b6ff5c", weight: 5, text: (n) => (n === 1 ? "A drone flies beside you and fires too." : "A second drone joins the first.") },
  repair: { name: "Field Repair", max: Infinity, color: "#ff6b8a", weight: 0, text: () => "Restore 2 hull." },
};
const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];
const UPGRADE_ICONS: Record<UpgradeId, LucideIcon> = {
  rate: Gauge,
  barrels: Layers,
  damage: Flame,
  pierce: Crosshair,
  engines: ChevronsUp,
  hull: Hexagon,
  shield: Shield,
  missiles: Rocket,
  drones: Bot,
  repair: Wrench,
};
type Levels = Record<UpgradeId, number>;
const emptyLevels = () => Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])) as Levels;

/** Laser layouts by barrel count: [x offset, angle]. */
const PATTERNS: [number, number][][] = [
  [[0, 0]],
  [[-7, 0], [7, 0]],
  [[-11, -0.05], [0, 0], [11, 0.05]],
  [[-14, -0.09], [-5, -0.02], [5, 0.02], [14, 0.09]],
  [[-17, -0.16], [-8, -0.06], [0, 0], [8, 0.06], [17, 0.16]],
];

const ROCK_TIERS = [
  { r: 28, hp: 4, points: 30 },
  { r: 18, hp: 2, points: 20 },
  { r: 11, hp: 1, points: 10 },
] as const;

type EnemyKind = "rock" | "raider" | "diver" | "gunship" | "boss";
type Enemy = {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  points: number;
  flash: number;
  age: number;
  tier: 0 | 1 | 2;
  angle: number;
  spin: number;
  shape: number[];
  craters: { a: number; d: number; r: number }[];
  molten: boolean;
  baseX: number;
  fireIn: number;
  mode: number;
  aimX: number;
  aimY: number;
  stopY: number;
  attack: number;
};
type Shot = { x: number; y: number; vx: number; vy: number; dmg: number; pierce: number; hits: Enemy[]; dead: boolean; drone: boolean };
type Missile = { x: number; y: number; vx: number; vy: number; target: Enemy | null; life: number; dmg: number; dead: boolean };
type EnemyShot = { x: number; y: number; vx: number; vy: number; r: number; color: string; dead: boolean };
type PickupKind = "repair" | "overdrive";
type Pickup = { kind: PickupKind; x: number; y: number; age: number };
type Particle = { kind: "spark" | "glow" | "smoke" | "ring" | "debris"; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; angle: number; spin: number };
type Popup = { x: number; y: number; text: string; life: number; color: string };

const PICKUPS: Record<PickupKind, { color: string; label: string }> = {
  repair: { color: "#ff6b8a", label: "+" },
  overdrive: { color: "#ffd84a", label: "O" },
};

export type BlasterHud = { score: number; wave: number; hull: number; maxHull: number; shield: boolean; levels: Levels };

type Hooks = {
  onPhase: (phase: Phase) => void;
  onHud: (hud: BlasterHud) => void;
  onChoices: (choices: UpgradeId[]) => void;
  onStart: () => void;
  onOver: (score: number, metrics: { seconds: number; kills: number; wave: number }) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** The scrolling backdrop, painted once: soft nebula clouds and faint dust, tiling vertically. */
function paintNebula() {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * 2;
  canvas.height = HEIGHT * 2;
  const g = canvas.getContext("2d");
  if (!g) return canvas;
  g.scale(2, 2);
  g.fillStyle = "#060920";
  g.fillRect(0, 0, WIDTH, HEIGHT);
  const tints = ["#5b2bb5", "#1b6fb8", "#b02a7a", "#1f8fa8", "#3a2a9a"];
  for (let i = 0; i < 10; i += 1) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * HEIGHT;
    const r = 90 + Math.random() * 170;
    const tint = tints[i % tints.length];
    for (const oy of [-HEIGHT, 0, HEIGHT]) {
      const grad = g.createRadialGradient(x, y + oy, 0, x, y + oy, r);
      grad.addColorStop(0, withAlpha(tint, 0.2));
      grad.addColorStop(0.5, withAlpha(tint, 0.07));
      grad.addColorStop(1, withAlpha(tint, 0));
      g.fillStyle = grad;
      g.fillRect(x - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 280; i += 1) {
    g.fillStyle = withAlpha("#cfe0ff", Math.random() * 0.35);
    g.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, 0.8, 0.8);
  }
  return canvas;
}

function createBlaster(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const colors = GAME_PALETTES["space-blaster"];
  const nebula = paintNebula();
  const glowSprites = new Map<string, HTMLCanvasElement>();
  const stars = [0.25, 0.6, 1.15].flatMap((z, layer) =>
    Array.from({ length: [46, 28, 14][layer] }, () => ({ x: rand(0, WIDTH), y: rand(0, HEIGHT), z, seed: rand(0, 10) })),
  );
  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let ship = freshShip();
  let levels = emptyLevels();
  let input = { left: false, right: false, up: false, down: false };
  let pointer: { x: number; y: number } | null = null;
  let enemies: Enemy[] = [];
  let shots: Shot[] = [];
  let missiles: Missile[] = [];
  let enemyShots: EnemyShot[] = [];
  let pickups: Pickup[] = [];
  let particles: Particle[] = [];
  let popups: Popup[] = [];
  let blasts: { x: number; y: number; scale: number; delay: number }[] = [];
  let time = 0;
  let score = 0;
  let kills = 0;
  let fireIn = 0;
  let droneIn = 0;
  let missileIn = 1;
  let missileSide = 1;
  let laserSound = 0;
  let chipSound = 0;
  let wave = 1;
  let waveState: WaveState = "intro";
  let waveTimer = 0;
  let budget = 0;
  let totalBudget = 1;
  let spawnIn = 0;
  let hurtThisWave = false;
  let banner = { title: "", sub: "", t: 0, warn: false };
  let choices: UpgradeId[] = [];
  let countdown = 0;
  let dyingFor = 0;
  let diedAt = 0;
  let scroll = 0;
  let warp = 0;
  let trauma = 0;
  let hurtFlash = 0;

  function freshShip() {
    return { x: WIDTH / 2, y: SHIP_Y, bank: 0, hull: 3, invuln: 0, shield: false, shieldIn: 0, overdrive: 0 };
  }

  const fx = () => hooks.live().effects;
  const play = (name: SoundName, pitch?: number) => hooks.live().play(name, pitch);
  const isBossWave = () => wave % BOSS_EVERY === 0;
  const hpScale = () => Math.pow(1.16, wave - 1);
  const speedScale = () => 1 + Math.min(0.5, (wave - 1) * 0.035);
  const bulletSpeed = () => Math.min(300, 170 + wave * 7);
  const fireDelay = () => 0.24 * Math.pow(0.84, levels.rate) * (ship.overdrive > 0 ? 0.6 : 1);
  const laserDamage = () => 1 + levels.damage * 0.5;
  const maxHull = () => 3 + levels.hull;
  const moveSpeed = () => 300 * (1 + levels.engines * 0.12);

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const hud = () => hooks.onHud({ score, wave, hull: ship.hull, maxHull: maxHull(), shield: ship.shield, levels: { ...levels } });

  function reset() {
    ship = freshShip();
    levels = emptyLevels();
    enemies = [];
    shots = [];
    missiles = [];
    enemyShots = [];
    pickups = [];
    particles = [];
    popups = [];
    blasts = [];
    time = 0;
    score = 0;
    kills = 0;
    fireIn = 0;
    droneIn = 0;
    missileIn = 1;
    wave = 1;
    trauma = 0;
    hurtFlash = 0;
    choices = [];
    prepareWave();
    banner.t = 0;
    hud();
    setPhase("ready");
  }

  function waveSubtitle() {
    const intro: Record<number, string> = {
      1: "Clear the rocks",
      2: "Raiders now return fire",
      3: "Divers incoming",
      4: "Gunships sighted",
      6: "Molten rocks ahead",
    };
    return intro[wave] ?? `Enemy armor +${Math.round((hpScale() - 1) * 100)}%`;
  }

  function prepareWave() {
    waveState = "intro";
    waveTimer = 0;
    hurtThisWave = false;
    totalBudget = budget = isBossWave() ? 6 + wave : 16 + wave * 6;
    spawnIn = 0;
    banner = isBossWave()
      ? { title: "WARNING", sub: `Wave ${wave} · Mothership approaching`, t: 2.6, warn: true }
      : { title: `WAVE ${wave}`, sub: waveSubtitle(), t: 2.1, warn: false };
    warp = 1;
  }

  function start() {
    hooks.onStart();
    prepareWave();
    play("power");
    setPhase("playing");
  }

  /* ---------- effects ---------- */

  function particle(kind: Particle["kind"], x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, spin = 0) {
    if (fx() === "off" || particles.length >= MAX_PARTICLES) return;
    particles.push({ kind, x, y, vx, vy, life, max: life, size, color, angle: rand(0, 6.28), spin });
  }

  function explode(x: number, y: number, scale: number, color: string) {
    const level = fx();
    if (level === "off") return;
    const k = level === "subtle" ? 0.5 : 1;
    particle("ring", x, y, 0, 0, 0.3 + scale * 0.12, 26 * scale + 10, color);
    particle("glow", x, y, 0, 0, 0.22 + scale * 0.05, 34 * scale + 14, "#fff3c4");
    for (let i = 0; i < Math.round((8 + 14 * scale) * k); i += 1) {
      const a = rand(0, Math.PI * 2);
      const s = rand(70, 280) * Math.sqrt(scale);
      particle("spark", x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.25, 0.6), 2, i % 3 === 0 ? "#ffe6a8" : color);
    }
    for (let i = 0; i < Math.round(4 * scale * k); i += 1) {
      particle("glow", x + rand(-8, 8) * scale, y + rand(-8, 8) * scale, rand(-40, 40), rand(-40, 40), rand(0.3, 0.6), rand(5, 10) * scale, color);
    }
    for (let i = 0; i < Math.round(4 * scale * k); i += 1) {
      particle("smoke", x + rand(-6, 6), y + rand(-6, 6), rand(-25, 25), rand(-25, 15), rand(0.6, 1.2), rand(7, 13) * scale, "#262b48");
    }
  }

  function shake(amount: number) {
    trauma = Math.min(1, trauma + amount);
  }

  function popup(x: number, y: number, text: string, color = "#ffffff") {
    if (popups.length < 24) popups.push({ x, y, text, life: 0.9, color });
  }

  function addScore(points: number) {
    score += points;
    hud();
  }

  /* ---------- spawning ---------- */

  function makeEnemy(kind: EnemyKind, x: number, y: number, extra: Partial<Enemy>): Enemy {
    return {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 14,
      hp: 1,
      maxHp: 1,
      points: 10,
      flash: 0,
      age: 0,
      tier: 0,
      angle: 0,
      spin: 0,
      shape: [],
      craters: [],
      molten: false,
      baseX: x,
      fireIn: 1,
      mode: 0,
      aimX: 0,
      aimY: 0,
      stopY: 0,
      attack: 0,
      ...extra,
    };
  }

  function spawnRock(tier: 0 | 1 | 2, x: number, y: number, vx: number, vy: number, molten: boolean) {
    const info = ROCK_TIERS[tier];
    const hp = info.hp * hpScale() * (molten ? 1.5 : 1);
    enemies.push(
      makeEnemy("rock", x, y, {
        tier,
        vx,
        vy,
        r: info.r,
        hp,
        maxHp: hp,
        points: Math.round(info.points * (molten ? 1.5 : 1)),
        angle: rand(0, 6.28),
        spin: rand(-1.4, 1.4),
        shape: Array.from({ length: 11 }, () => rand(0.78, 1.05)),
        craters: Array.from({ length: tier === 2 ? 1 : 3 }, () => ({ a: rand(0, 6.28), d: rand(0.1, 0.5), r: rand(0.14, 0.26) })),
        molten,
      }),
    );
  }

  function spawnRaider(x: number, y = -24) {
    const hp = 3 * hpScale();
    const baseX = Math.min(WIDTH - 70, Math.max(70, x));
    enemies.push(makeEnemy("raider", baseX, y, { r: 15, hp, maxHp: hp, points: 50, baseX, vy: 85 * speedScale(), fireIn: rand(1, 2.2), age: rand(0, 3) }));
  }

  function spawnDiver(x: number) {
    const hp = 2.5 * hpScale();
    enemies.push(makeEnemy("diver", x, -24, { r: 13, hp, maxHp: hp, points: 60, vy: 170, stopY: rand(70, 210) }));
  }

  function spawnGunship() {
    const hp = 16 * hpScale();
    enemies.push(
      makeEnemy("gunship", rand(100, WIDTH - 100), -40, { r: 26, hp, maxHp: hp, points: 150, vy: 70, vx: Math.random() < 0.5 ? 55 : -55, stopY: rand(90, 170), fireIn: 1.5 }),
    );
  }

  function spawnBoss() {
    const hp = 110 * hpScale();
    enemies.push(makeEnemy("boss", WIDTH / 2, -90, { r: 52, hp, maxHp: hp, points: 600 + 200 * (wave / BOSS_EVERY), vy: 60, stopY: 125, fireIn: 2.2 }));
    play("bomb", 0.6);
    shake(0.5);
  }

  function spawnFromBudget() {
    const x = () => rand(40, WIDTH - 40);
    const molten = () => wave >= 6 && Math.random() < Math.min(0.5, (wave - 5) * 0.08);
    const rockV = () => rand(65, 115) * speedScale();
    const options: { cost: number; weight: number; spawn: () => void }[] = [
      { cost: 3, weight: 4, spawn: () => spawnRock(0, x(), -36, rand(-30, 30), rockV(), molten()) },
      { cost: 2, weight: 3, spawn: () => spawnRock(1, x(), -24, rand(-45, 45), rockV() * 1.1, molten()) },
    ];
    if (!isBossWave()) {
      options.push({ cost: 3, weight: wave === 1 ? 1.2 : 3, spawn: () => spawnRaider(x()) });
      if (wave >= 2) {
        options.push({
          cost: 8,
          weight: 1.2,
          spawn: () => {
            const cx = rand(120, WIDTH - 120);
            for (const o of [-1, 0, 1]) spawnRaider(cx + o * 46, -24 - Math.abs(o) * 30);
          },
        });
      }
      if (wave >= 3) options.push({ cost: 3, weight: 2.2, spawn: () => spawnDiver(x()) });
      const gunships = enemies.filter((e) => e.kind === "gunship").length;
      if (wave >= 4 && gunships < (wave >= 9 ? 2 : 1)) options.push({ cost: 8, weight: 1.3, spawn: spawnGunship });
    }
    const affordable = options.filter((o) => o.cost <= budget);
    if (affordable.length === 0) {
      budget = 0;
      return;
    }
    let roll = Math.random() * affordable.reduce((sum, o) => sum + o.weight, 0);
    const pick = affordable.find((o) => (roll -= o.weight) <= 0) ?? affordable[0];
    budget -= pick.cost;
    pick.spawn();
  }

  /* ---------- enemy fire ---------- */

  function bullet(x: number, y: number, angle: number, speed: number, color: string, r = 4.5) {
    enemyShots.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, color, dead: false });
  }

  function fan(x: number, y: number, center: number, count: number, spread: number, speed: number, color: string) {
    for (let i = 0; i < count; i += 1) bullet(x, y, center + (i - (count - 1) / 2) * spread, speed, color);
  }

  const aimFrom = (x: number, y: number) => Math.atan2(ship.y - y, ship.x - x);

  /* ---------- enemy behaviour ---------- */

  function updateEnemy(e: Enemy, dt: number) {
    e.age += dt;
    e.flash = Math.max(0, e.flash - dt);
    switch (e.kind) {
      case "rock":
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        e.angle += e.spin * dt;
        if ((e.x < e.r && e.vx < 0) || (e.x > WIDTH - e.r && e.vx > 0)) e.vx = -e.vx;
        break;
      case "raider":
        e.y += e.vy * dt;
        e.x = e.baseX + Math.sin(e.age * 2.1) * 60;
        if (wave >= 2 && phase === "playing") {
          e.fireIn -= dt;
          if (e.fireIn <= 0 && e.y > 20 && e.y < ship.y - 140) {
            e.fireIn = Math.max(1, 2.6 - wave * 0.08) * rand(0.8, 1.2);
            bullet(e.x, e.y + 12, aimFrom(e.x, e.y), bulletSpeed(), "#ff6b6b");
          }
        }
        break;
      case "diver":
        if (e.mode === 0) {
          e.y += e.vy * dt;
          if (e.y >= e.stopY) {
            e.mode = 1;
            e.fireIn = 0.85;
          }
        } else if (e.mode === 1) {
          e.fireIn -= dt;
          e.aimX = ship.x;
          e.aimY = ship.y;
          e.x += Math.sign(ship.x - e.x) * Math.min(Math.abs(ship.x - e.x), 40 * dt);
          if (e.fireIn <= 0) {
            e.mode = 2;
            const a = Math.atan2(e.aimY - e.y, e.aimX - e.x);
            const s = 430 * speedScale();
            e.vx = Math.cos(a) * s;
            e.vy = Math.sin(a) * s;
            play("swoosh", 1.3);
          }
        } else {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (Math.random() < 0.6) particle("glow", e.x - e.vx * 0.03, e.y - e.vy * 0.03, 0, 0, 0.25, 6, "#c77dff");
        }
        break;
      case "gunship": {
        const leaving = e.age >= 16;
        if (leaving) e.y += 80 * dt;
        else if (e.y < e.stopY) e.y += e.vy * dt;
        e.x += e.vx * dt;
        if ((e.x < 50 && e.vx < 0) || (e.x > WIDTH - 50 && e.vx > 0)) e.vx = -e.vx;
        e.fireIn -= dt;
        if (e.fireIn <= 0 && e.y > 30 && !leaving && phase === "playing") {
          e.fireIn = Math.max(1.5, 2.6 - wave * 0.06);
          fan(e.x, e.y + 20, aimFrom(e.x, e.y), wave >= 8 ? 5 : 3, 0.22, bulletSpeed() * 0.9, "#ffb347");
        }
        break;
      }
      case "boss":
        updateBoss(e, dt);
        break;
    }
  }

  function updateBoss(e: Enemy, dt: number) {
    if (e.y < e.stopY) {
      e.y += e.vy * dt;
      return;
    }
    e.x = WIDTH / 2 + Math.sin((e.age - 1) * 0.55) * 140;
    if (phase !== "playing") return;
    const enraged = e.hp < e.maxHp * 0.5;
    const tier = wave / BOSS_EVERY;
    if (e.mode > 0) {
      // A spiral volley is under way.
      e.mode -= dt;
      e.aimX -= dt;
      if (e.aimX <= 0) {
        e.aimX = enraged ? 0.07 : 0.1;
        const a = e.age * 4.2;
        bullet(e.x, e.y + 20, a, 150, "#ff7ad9");
        bullet(e.x, e.y + 20, a + Math.PI, 150, "#ff7ad9");
      }
      return;
    }
    e.fireIn -= dt;
    if (e.fireIn > 0) return;
    const pattern = e.attack % 4;
    e.attack += 1;
    e.fireIn = enraged ? 1.15 : 1.8;
    if (pattern === 0) {
      const n = 14 + tier * 2 + (enraged ? 4 : 0);
      const offset = rand(0, 1);
      for (let i = 0; i < n; i += 1) bullet(e.x, e.y + 10, offset + (i / n) * Math.PI * 2, 140, "#ffb347", 5);
      play("boom", 0.6);
    } else if (pattern === 1) {
      fan(e.x, e.y + 30, aimFrom(e.x, e.y + 30), enraged ? 7 : 5, 0.14, bulletSpeed(), "#ff6b6b");
      play("laser", 0.5);
    } else if (pattern === 2) {
      e.mode = enraged ? 2.6 : 2.0;
      e.aimX = 0;
    } else {
      spawnRaider(e.x - 70, e.y + 10);
      spawnRaider(e.x + 70, e.y + 10);
      if (enraged) spawnDiver(e.x);
    }
  }

  /* ---------- damage ---------- */

  function damage(e: Enemy, amount: number, hx: number, hy: number) {
    if (e.hp <= 0) return;
    e.hp -= amount;
    e.flash = 0.07;
    for (let i = 0; i < 2; i += 1) particle("spark", hx, hy, rand(-120, 120), rand(-160, 20), rand(0.12, 0.25), 1.5, "#ffffff");
    if (e.hp <= 0) kill(e);
    else if (chipSound <= 0) {
      chipSound = 0.06;
      play("chip", e.kind === "rock" ? 1 : 1.4);
    }
  }

  function kill(e: Enemy) {
    kills += 1;
    addScore(e.points);
    if (e.points >= 50) popup(e.x, e.y, `+${e.points}`, e.kind === "boss" ? "#ffd84a" : "#ffffff");
    if (e.kind === "boss") {
      for (let i = 0; i < 9; i += 1) blasts.push({ x: e.x + rand(-60, 60), y: e.y + rand(-30, 30), scale: rand(1, 1.8), delay: i * 0.12 });
      blasts.push({ x: e.x, y: e.y, scale: 3.2, delay: 1.15 });
      enemyShots = [];
      pickups.push({ kind: "repair", x: e.x - 20, y: e.y, age: 0 }, { kind: "overdrive", x: e.x + 20, y: e.y, age: 0 });
      return;
    }
    if (e.kind === "rock") {
      const color = e.molten ? "#ff8a3d" : "#9b96bd";
      explode(e.x, e.y, 0.5 + (2 - e.tier) * 0.35, color);
      for (let i = 0; i < 4 + (2 - e.tier) * 2; i += 1) {
        const a = rand(0, Math.PI * 2);
        const s = rand(40, 160);
        particle("debris", e.x, e.y, Math.cos(a) * s + e.vx, Math.sin(a) * s + e.vy, rand(0.5, 0.9), rand(2, 4.5) * (1.4 - e.tier * 0.3), e.molten ? "#6a3a2a" : "#6d6a8c", rand(-8, 8));
      }
      play("boom", 1 + e.tier * 0.25);
      shake(0.06 + (2 - e.tier) * 0.04);
      if (e.tier < 2) {
        const tier = (e.tier + 1) as 1 | 2;
        for (const side of [-1, 1]) spawnRock(tier, e.x + side * 6, e.y, e.vx + side * rand(40, 80), e.vy * 0.9, e.molten);
      }
      if (e.tier === 0 && Math.random() < 0.02) dropPickup(e.x, e.y);
      return;
    }
    const color = e.kind === "gunship" ? "#ffb347" : e.kind === "diver" ? "#c77dff" : colors.accent2;
    explode(e.x, e.y, e.kind === "gunship" ? 1.6 : 0.9, color);
    play("boom", e.kind === "gunship" ? 0.6 : 0.85);
    shake(e.kind === "gunship" ? 0.3 : 0.12);
    const chance = e.kind === "gunship" ? 0.6 : 0.1;
    if (Math.random() < chance) dropPickup(e.x, e.y);
  }

  function dropPickup(x: number, y: number) {
    const repair = ship.hull < maxHull() ? 0.45 : 0.15;
    pickups.push({ kind: Math.random() < repair ? "repair" : "overdrive", x, y, age: 0 });
  }

  function hurt() {
    if (ship.shield) {
      ship.shield = false;
      ship.shieldIn = SHIELD_RECHARGE[levels.shield];
      ship.invuln = 0.7;
      particle("ring", ship.x, ship.y, 0, 0, 0.45, 60, "#8fe9ff");
      play("chip", 0.6);
      shake(0.3);
      clearShotsNear(70);
      hud();
      return;
    }
    ship.hull -= 1;
    hurtThisWave = true;
    ship.invuln = 1.6;
    hurtFlash = 1;
    shake(0.7);
    explode(ship.x, ship.y, 0.6, colors.accent2);
    play("hit");
    clearShotsNear(90);
    hud();
    if (ship.hull <= 0) die();
  }

  function clearShotsNear(radius: number) {
    for (const s of enemyShots) {
      if (Math.hypot(s.x - ship.x, s.y - ship.y) < radius) {
        s.dead = true;
        particle("glow", s.x, s.y, 0, 0, 0.2, 8, s.color);
      }
    }
  }

  function die() {
    diedAt = performance.now();
    dyingFor = 1.3;
    explode(ship.x, ship.y, 2.4, colors.accent);
    explode(ship.x, ship.y, 1.4, "#ffffff");
    shake(1);
    play("bomb");
    setPhase("dying");
  }

  /* ---------- waves and upgrades ---------- */

  function updateWave(dt: number) {
    waveTimer += dt;
    if (waveState === "intro") {
      if (waveTimer >= (isBossWave() ? 2.4 : 1.8)) {
        waveState = "spawning";
        waveTimer = 0;
        if (isBossWave()) spawnBoss();
      }
    } else if (waveState === "spawning") {
      spawnIn -= dt;
      if (spawnIn <= 0 && budget > 0) {
        spawnFromBudget();
        const gap = Math.max(0.3, 1.05 - wave * 0.045) * (isBossWave() ? 2.4 : 1);
        spawnIn = gap * rand(0.7, 1.3);
      }
      if (budget <= 0) {
        waveState = "clearing";
        waveTimer = 0;
      }
    } else if (waveState === "clearing") {
      const boss = enemies.some((e) => e.kind === "boss");
      const alive = boss || enemies.some((e) => e.y > -60);
      if ((!alive && blasts.length === 0) || (!boss && waveTimer > 30)) clearWave();
    } else if (waveTimer >= 1.6) {
      offerUpgrades();
    }
  }

  function clearWave() {
    waveState = "cleared";
    waveTimer = 0;
    const bonus = 50 * wave + (hurtThisWave ? 0 : 25 * wave);
    addScore(bonus);
    banner = { title: "WAVE CLEAR", sub: hurtThisWave ? `Bonus +${bonus}` : `Flawless · bonus +${bonus}`, t: 1.6, warn: false };
    for (const s of enemyShots) particle("glow", s.x, s.y, 0, 0, 0.3, 9, s.color);
    enemyShots = [];
    play("win");
  }

  function offerUpgrades() {
    const pool = UPGRADE_IDS.filter((id) => id !== "repair" && levels[id] < UPGRADES[id].max);
    const picked: UpgradeId[] = [];
    while (picked.length < 3 && pool.length > 0) {
      let roll = Math.random() * pool.reduce((sum, id) => sum + UPGRADES[id].weight, 0);
      const index = Math.max(0, pool.findIndex((id) => (roll -= UPGRADES[id].weight) <= 0));
      picked.push(pool[index]);
      pool.splice(index, 1);
    }
    const missing = maxHull() - ship.hull;
    if (missing > 0 && (missing * 2 >= maxHull() || Math.random() < 0.4 || picked.length < 3)) {
      if (picked.length >= 3) picked.pop();
      picked.unshift("repair");
    }
    for (const p of pickups) collect(p);
    pickups = [];
    input = { left: false, right: false, up: false, down: false };
    pointer = null;
    if (picked.length === 0) {
      nextWave();
      return;
    }
    choices = picked;
    hooks.onChoices(choices);
    setPhase("upgrade");
  }

  function nextWave() {
    wave += 1;
    prepareWave();
    hud();
  }

  function choose(index: number) {
    const id = choices[index];
    if (phase !== "upgrade" || !id) return;
    if (id === "repair") ship.hull = Math.min(maxHull(), ship.hull + 2);
    else {
      levels[id] += 1;
      if (id === "hull") ship.hull += 1;
      if (id === "shield") {
        if (levels.shield === 1) ship.shield = true;
        else ship.shieldIn = Math.min(ship.shieldIn, SHIELD_RECHARGE[levels.shield]);
      }
    }
    play("power", 1.15);
    particle("ring", ship.x, ship.y, 0, 0, 0.5, 70, UPGRADES[id].color);
    particle("glow", ship.x, ship.y, 0, 0, 0.4, 50, UPGRADES[id].color);
    choices = [];
    nextWave();
    setPhase("playing");
  }

  function collect(p: Pickup) {
    if (p.kind === "repair") {
      if (ship.hull < maxHull()) {
        ship.hull += 1;
        popup(ship.x, ship.y - 30, "+1 hull", PICKUPS.repair.color);
      } else {
        score += 40;
        popup(ship.x, ship.y - 30, "+40", PICKUPS.repair.color);
      }
    } else {
      ship.overdrive = 7;
      popup(ship.x, ship.y - 30, "Overdrive!", PICKUPS.overdrive.color);
    }
    particle("ring", ship.x, ship.y, 0, 0, 0.35, 40, PICKUPS[p.kind].color);
    play("power", 1.3);
    hud();
  }

  /* ---------- simulation ---------- */

  function updateShip(dt: number) {
    const speed = moveSpeed();
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (pointer) {
      const tx = pointer.x - ship.x;
      const ty = pointer.y - ship.y;
      const dist = Math.hypot(tx, ty);
      if (dist <= speed * dt) {
        ship.x = pointer.x;
        ship.y = pointer.y;
        dx = 0;
        dy = 0;
      } else {
        dx = tx / dist;
        dy = ty / dist;
      }
    } else if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    ship.x = Math.min(WIDTH - 20, Math.max(20, ship.x + dx * speed * dt));
    ship.y = Math.min(HEIGHT - 28, Math.max(TOP_BAND, ship.y + dy * speed * dt));
    ship.bank += (dx - ship.bank) * Math.min(1, dt * 10);
    ship.invuln = Math.max(0, ship.invuln - dt);
    ship.overdrive = Math.max(0, ship.overdrive - dt);
    if (levels.shield > 0 && !ship.shield) {
      ship.shieldIn -= dt;
      if (ship.shieldIn <= 0) {
        ship.shield = true;
        particle("ring", ship.x, ship.y, 0, 0, 0.4, 36, "#8fe9ff");
        play("power", 1.6);
        hud();
      }
    }
    if (fx() !== "off") {
      for (const side of [-6, 6]) particle("glow", ship.x + side + rand(-1, 1), ship.y + 18, rand(-10, 10), rand(140, 200), rand(0.12, 0.2), rand(3, 5), ship.overdrive > 0 ? "#ffd84a" : "#ff9a4a");
    }
  }

  function dronePositions(now: number) {
    const list: { x: number; y: number }[] = [];
    for (let i = 0; i < levels.drones; i += 1) {
      const side = i === 0 ? -1 : 1;
      list.push({ x: ship.x + side * 36, y: ship.y + 12 + Math.sin(now / 300 + i * 2) * 4 });
    }
    return list;
  }

  function nearestEnemy(x: number, y: number) {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of enemies) {
      if (e.hp <= 0 || e.y < 0) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function weapons(dt: number) {
    fireIn -= dt;
    if (fireIn <= 0) {
      fireIn = Math.max(fireIn + fireDelay(), fireDelay() * 0.5);
      for (const [ox, a] of PATTERNS[levels.barrels]) {
        shots.push({ x: ship.x + ox, y: ship.y - 20, vx: Math.sin(a) * 720, vy: -Math.cos(a) * 720, dmg: laserDamage(), pierce: levels.pierce, hits: [], dead: false, drone: false });
      }
      particle("glow", ship.x, ship.y - 22, 0, 0, 0.06, 12, shotColor());
      if (laserSound <= 0) {
        laserSound = 0.085;
        play("laser", rand(0.95, 1.08));
      }
    }
    if (levels.drones > 0) {
      droneIn -= dt;
      if (droneIn <= 0) {
        droneIn = 0.42 * Math.pow(0.92, levels.rate);
        for (const d of dronePositions(performance.now())) {
          shots.push({ x: d.x, y: d.y - 8, vx: 0, vy: -680, dmg: laserDamage() * 0.6, pierce: 0, hits: [], dead: false, drone: true });
        }
      }
    }
    if (levels.missiles > 0) {
      missileIn -= dt;
      if (missileIn <= 0) {
        const target = nearestEnemy(ship.x, ship.y);
        if (target) {
          missileIn = MISSILE_DELAY[levels.missiles];
          missileSide = -missileSide;
          missiles.push({ x: ship.x + missileSide * 12, y: ship.y, vx: missileSide * 120, vy: -180, target, life: 3, dmg: 2.5 + levels.damage * 0.75, dead: false });
          play("swoosh", 0.8);
        } else missileIn = 0.2;
      }
    }
  }

  function shotColor() {
    if (ship.overdrive > 0) return "#ffe27a";
    return levels.damage >= 4 ? "#ffd84a" : levels.damage >= 2 ? "#c49bff" : colors.accent;
  }

  function world(dt: number) {
    for (const e of enemies) updateEnemy(e, dt);
    for (const s of shots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    for (const m of missiles) {
      m.life -= dt;
      if (!m.target || m.target.hp <= 0) m.target = nearestEnemy(m.x, m.y);
      const speed = Math.min(560, Math.hypot(m.vx, m.vy) + 600 * dt);
      let heading = Math.atan2(m.vy, m.vx);
      if (m.target) {
        const want = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        let diff = want - heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        heading += Math.max(-7 * dt, Math.min(7 * dt, diff));
      }
      m.vx = Math.cos(heading) * speed;
      m.vy = Math.sin(heading) * speed;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (Math.random() < 0.8) particle("smoke", m.x, m.y, rand(-10, 10), rand(-10, 10), 0.4, 3.5, "#3a3f60");
    }
    for (const s of enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    for (const p of pickups) {
      p.age += dt;
      const d = Math.hypot(ship.x - p.x, ship.y - p.y);
      if (phase === "playing" && d < 90) {
        p.x += ((ship.x - p.x) / d) * 380 * dt;
        p.y += ((ship.y - p.y) / d) * 380 * dt;
      } else p.y += 70 * dt;
    }

    // Lasers and missiles against enemies.
    for (const s of shots) {
      if (s.dead) continue;
      for (const e of enemies) {
        if (e.hp <= 0 || s.hits.includes(e)) continue;
        const reach = e.r + 4;
        if ((s.x - e.x) ** 2 + (s.y - e.y) ** 2 > reach * reach) continue;
        s.hits.push(e);
        damage(e, s.dmg, s.x, s.y);
        if (s.pierce <= 0) {
          s.dead = true;
          break;
        }
        s.pierce -= 1;
      }
    }
    for (const m of missiles) {
      if (m.dead) continue;
      for (const e of enemies) {
        if (e.hp <= 0 || Math.hypot(m.x - e.x, m.y - e.y) > e.r + 6) continue;
        m.dead = true;
        explode(m.x, m.y, 0.45, "#ff8a5c");
        damage(e, m.dmg, m.x, m.y);
        break;
      }
      if (m.life <= 0 && !m.dead) {
        m.dead = true;
        explode(m.x, m.y, 0.3, "#ff8a5c");
      }
    }

    shots = shots.filter((s) => !s.dead && s.y > -30 && s.x > -30 && s.x < WIDTH + 30);
    missiles = missiles.filter((m) => !m.dead && m.y > -40 && m.y < HEIGHT + 40 && m.x > -40 && m.x < WIDTH + 40);
    enemyShots = enemyShots.filter((s) => !s.dead && s.y < HEIGHT + 12 && s.y > -40 && s.x > -12 && s.x < WIDTH + 12);
    enemies = enemies.filter((e) => e.hp > 0 && e.y < HEIGHT + 60 && e.x > -80 && e.x < WIDTH + 80);
    pickups = pickups.filter((p) => p.y < HEIGHT + 20);
  }

  function shipCollisions() {
    pickups = pickups.filter((p) => {
      if (Math.hypot(p.x - ship.x, p.y - ship.y) > 24) return true;
      collect(p);
      return false;
    });
    if (ship.invuln > 0) return;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (Math.hypot(e.x - ship.x, e.y - ship.y) >= e.r * 0.8 + SHIP_HIT) continue;
      if (e.kind !== "boss") damage(e, e.kind === "gunship" ? 6 : 9999, e.x, e.y);
      hurt();
      return;
    }
    for (const s of enemyShots) {
      if (s.dead || Math.hypot(s.x - ship.x, s.y - ship.y) >= s.r + SHIP_HIT) continue;
      s.dead = true;
      hurt();
      return;
    }
  }

  function updateEffects(dt: number) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.spin * dt;
      if (p.kind === "spark" || p.kind === "debris") {
        p.vx *= 1 - Math.min(1, 2.2 * dt);
        p.vy *= 1 - Math.min(1, 2.2 * dt);
      }
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) {
      p.y -= 40 * dt;
      p.life -= dt;
    }
    popups = popups.filter((p) => p.life > 0);
    for (const b of blasts) {
      b.delay -= dt;
      if (b.delay <= 0) {
        explode(b.x, b.y, b.scale, b.scale > 2 ? "#ffd84a" : "#ff7ad9");
        shake(b.scale > 2 ? 0.9 : 0.25);
        play(b.scale > 2 ? "bomb" : "boom", rand(0.7, 1));
      }
    }
    blasts = blasts.filter((b) => b.delay > 0);
  }

  function step(ms: number) {
    const real = ms / 1000;
    const animate = fx() !== "off";
    if (animate) scroll += real * (phase === "playing" || phase === "dying" ? 40 + warp * 420 : 18);
    warp = Math.max(0, warp - real * 0.8);
    trauma = Math.max(0, trauma - real * 1.6);
    hurtFlash = Math.max(0, hurtFlash - real * 2.5);
    laserSound -= real;
    chipSound -= real;
    if (phase === "countdown") {
      countdown -= 1;
      if (countdown > 0 && countdown % COUNT_STEPS === 0) play("tick");
      if (countdown <= 0) setPhase("playing");
      return;
    }
    if (phase === "dying") {
      // The world keeps drifting in slow motion while the ship breaks apart.
      const dt = real * 0.35;
      updateEffects(dt);
      world(dt);
      dyingFor -= real;
      if (dyingFor <= 0) {
        setPhase("over");
        play("over");
        hooks.onOver(score, { seconds: Math.floor(time), kills, wave });
      }
      return;
    }
    if (phase === "ready" || phase === "over") updateEffects(real);
    if (phase !== "playing") return;
    time += real;
    banner.t = Math.max(0, banner.t - real);
    updateEffects(real);
    updateWave(real);
    updateShip(real);
    weapons(real);
    world(real);
    shipCollisions();
  }

  /* ---------- drawing ---------- */

  function glowSprite(color: string) {
    let sprite = glowSprites.get(color);
    if (!sprite) {
      sprite = document.createElement("canvas");
      sprite.width = 64;
      sprite.height = 64;
      const g = sprite.getContext("2d");
      if (g) {
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, withAlpha(color, 1));
        grad.addColorStop(0.22, withAlpha(color, 0.55));
        grad.addColorStop(0.55, withAlpha(color, 0.14));
        grad.addColorStop(1, withAlpha(color, 0));
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
      }
      glowSprites.set(color, sprite);
    }
    return sprite;
  }

  function glow(c: CanvasRenderingContext2D, x: number, y: number, rx: number, color: string, alpha = 1, ry = rx) {
    c.globalAlpha = Math.max(0, Math.min(1, alpha));
    c.drawImage(glowSprite(color), x - rx, y - ry, rx * 2, ry * 2);
    c.globalAlpha = 1;
  }

  function drawBackground(c: CanvasRenderingContext2D, now: number, animate: boolean) {
    const offset = (scroll * 0.12) % HEIGHT;
    c.drawImage(nebula, 0, offset - HEIGHT, WIDTH, HEIGHT);
    c.drawImage(nebula, 0, offset, WIDTH, HEIGHT);
    const streak = animate ? warp * 30 : 0;
    for (const star of stars) {
      const y = (star.y + scroll * star.z) % HEIGHT;
      const twinkle = animate ? 0.75 + Math.sin(now / 500 + star.seed * 7) * 0.25 : 1;
      const alpha = (0.2 + star.z * 0.45) * twinkle;
      if (streak > 1) {
        c.strokeStyle = withAlpha("#cfe6ff", alpha);
        c.lineWidth = star.z * 1.6;
        c.beginPath();
        c.moveTo(star.x, y);
        c.lineTo(star.x, y - streak * star.z);
        c.stroke();
      } else {
        c.fillStyle = withAlpha(star.z > 1 ? "#ffffff" : "#bcd4ff", alpha);
        const s = star.z * 1.7;
        c.fillRect(star.x - s / 2, y - s / 2, s, s);
      }
    }
  }

  function rockPath(c: CanvasRenderingContext2D, rock: Enemy) {
    c.beginPath();
    const n = rock.shape.length;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * rock.r * rock.shape[i];
      const y = Math.sin(a) * rock.r * rock.shape[i];
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
  }

  function drawRock(c: CanvasRenderingContext2D, rock: Enemy, now: number) {
    c.save();
    c.translate(rock.x, rock.y);
    c.rotate(rock.angle);
    // Light always comes from the top left, whatever the rock's spin.
    const la = -2.36 - rock.angle;
    const lx = Math.cos(la) * rock.r;
    const ly = Math.sin(la) * rock.r;
    const grad = c.createLinearGradient(lx, ly, -lx, -ly);
    if (rock.molten) {
      grad.addColorStop(0, "#8a5a4a");
      grad.addColorStop(0.55, "#4a2c26");
      grad.addColorStop(1, "#22141a");
    } else {
      grad.addColorStop(0, "#b4afd4");
      grad.addColorStop(0.5, "#6f6a92");
      grad.addColorStop(1, "#2c2946");
    }
    rockPath(c, rock);
    c.fillStyle = grad;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgb(10 8 24 / 0.6)";
    c.stroke();
    for (const crater of rock.craters) {
      const cx = Math.cos(crater.a) * rock.r * crater.d;
      const cy = Math.sin(crater.a) * rock.r * crater.d;
      const cr = rock.r * crater.r;
      c.fillStyle = rock.molten ? "rgb(255 120 40 / 0.85)" : "rgb(20 16 40 / 0.45)";
      c.beginPath();
      c.arc(cx, cy, cr, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = rock.molten ? "rgb(255 200 120 / 0.5)" : "rgb(220 215 255 / 0.25)";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(cx, cy, cr, la + Math.PI - 1, la + Math.PI + 1);
      c.stroke();
    }
    if (rock.molten) {
      c.globalCompositeOperation = "lighter";
      glow(c, 0, 0, rock.r * 1.3, "#ff6a1f", 0.25 + Math.sin(now / 200 + rock.shape[0] * 9) * 0.08);
      c.globalCompositeOperation = "source-over";
    }
    if (rock.flash > 0) {
      rockPath(c, rock);
      c.fillStyle = `rgb(255 255 255 / ${rock.flash * 9})`;
      c.fill();
    }
    c.restore();
  }

  function flashFill(c: CanvasRenderingContext2D, e: Enemy, base: string | CanvasGradient) {
    c.fillStyle = e.flash > 0 ? "#ffffff" : base;
  }

  function drawRaider(c: CanvasRenderingContext2D, e: Enemy) {
    c.save();
    c.translate(e.x, e.y);
    c.globalCompositeOperation = "lighter";
    glow(c, 0, -12, 10, colors.accent2, 0.8);
    c.globalCompositeOperation = "source-over";
    const grad = c.createLinearGradient(0, -14, 0, 16);
    grad.addColorStop(0, "#ff9a7a");
    grad.addColorStop(1, "#a3242f");
    flashFill(c, e, grad);
    c.beginPath();
    c.moveTo(0, 17);
    c.lineTo(18, -6);
    c.lineTo(15, -11);
    c.lineTo(6, -6);
    c.lineTo(0, -13);
    c.lineTo(-6, -6);
    c.lineTo(-15, -11);
    c.lineTo(-18, -6);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgb(40 0 10 / 0.6)";
    c.lineWidth = 1.2;
    c.stroke();
    c.fillStyle = "#fff3c4";
    c.beginPath();
    c.ellipse(0, 2, 3, 5, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawDiver(c: CanvasRenderingContext2D, e: Enemy, now: number) {
    if (e.mode === 1) {
      const pulse = 0.25 + Math.sin(now / 50) * 0.15;
      c.save();
      c.setLineDash([6, 6]);
      c.lineDashOffset = -now / 20;
      c.strokeStyle = `rgb(255 80 120 / ${pulse})`;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(e.x, e.y);
      c.lineTo(e.aimX, e.aimY);
      c.stroke();
      c.restore();
    }
    c.save();
    c.translate(e.x, e.y);
    if (e.mode === 2) c.rotate(Math.atan2(e.vy, e.vx) - Math.PI / 2);
    c.globalCompositeOperation = "lighter";
    glow(c, 0, 0, 20, "#c77dff", e.mode === 1 ? 0.9 : 0.5);
    c.globalCompositeOperation = "source-over";
    const grad = c.createLinearGradient(-12, 0, 12, 0);
    grad.addColorStop(0, "#5a2a9a");
    grad.addColorStop(0.5, "#d6a8ff");
    grad.addColorStop(1, "#5a2a9a");
    flashFill(c, e, grad);
    c.beginPath();
    c.moveTo(0, 18);
    c.lineTo(11, -8);
    c.lineTo(4, -4);
    c.lineTo(0, -14);
    c.lineTo(-4, -4);
    c.lineTo(-11, -8);
    c.closePath();
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(0, 2, 2.5, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function drawGunship(c: CanvasRenderingContext2D, e: Enemy) {
    c.save();
    c.translate(e.x, e.y);
    c.globalCompositeOperation = "lighter";
    glow(c, -14, -22, 9, "#ffb347", 0.8);
    glow(c, 14, -22, 9, "#ffb347", 0.8);
    c.globalCompositeOperation = "source-over";
    const grad = c.createLinearGradient(0, -24, 0, 24);
    grad.addColorStop(0, "#8a92b8");
    grad.addColorStop(0.5, "#4a5078");
    grad.addColorStop(1, "#23263f");
    flashFill(c, e, grad);
    c.beginPath();
    c.moveTo(-34, -6);
    c.lineTo(-20, -20);
    c.lineTo(20, -20);
    c.lineTo(34, -6);
    c.lineTo(26, 14);
    c.lineTo(10, 24);
    c.lineTo(-10, 24);
    c.lineTo(-26, 14);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgb(255 180 71 / 0.5)";
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = e.flash > 0 ? "#ffffff" : "#2a1a10";
    for (const side of [-1, 1]) {
      c.beginPath();
      c.arc(side * 18, 6, 6, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#ffb347";
    c.beginPath();
    c.arc(0, 4, 5, 0, Math.PI * 2);
    c.fill();
    c.restore();
    if (e.hp < e.maxHp) healthBar(c, e.x - 24, e.y - 34, 48, e.hp / e.maxHp, "#ffb347");
  }

  function drawBoss(c: CanvasRenderingContext2D, e: Enemy, now: number) {
    const enraged = e.hp < e.maxHp * 0.5;
    const core = enraged ? "#ff4d6d" : "#ff7ad9";
    c.save();
    c.translate(e.x, e.y);
    c.globalCompositeOperation = "lighter";
    glow(c, 0, 0, 90, core, 0.25 + Math.sin(now / 160) * 0.08);
    for (const side of [-1, 1]) glow(c, side * 40, -38, 14, "#ffb347", 0.8);
    c.globalCompositeOperation = "source-over";
    const hull = c.createLinearGradient(0, -50, 0, 50);
    hull.addColorStop(0, "#9aa2cc");
    hull.addColorStop(0.45, "#4a4f7c");
    hull.addColorStop(1, "#1b1d33");
    flashFill(c, e, hull);
    c.beginPath();
    c.moveTo(-86, -10);
    c.lineTo(-60, -40);
    c.lineTo(-22, -46);
    c.lineTo(22, -46);
    c.lineTo(60, -40);
    c.lineTo(86, -10);
    c.lineTo(70, 22);
    c.lineTo(36, 30);
    c.lineTo(20, 48);
    c.lineTo(-20, 48);
    c.lineTo(-36, 30);
    c.lineTo(-70, 22);
    c.closePath();
    c.fill();
    c.strokeStyle = withAlpha(core, 0.6);
    c.lineWidth = 2;
    c.stroke();
    c.strokeStyle = "rgb(10 10 30 / 0.5)";
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-60, -10);
    c.lineTo(-30, 10);
    c.moveTo(60, -10);
    c.lineTo(30, 10);
    c.moveTo(-22, -46);
    c.lineTo(-14, -16);
    c.moveTo(22, -46);
    c.lineTo(14, -16);
    c.stroke();
    for (const side of [-1, 1]) {
      c.fillStyle = e.flash > 0 ? "#ffffff" : "#2a2440";
      c.beginPath();
      c.arc(side * 54, 8, 9, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = core;
      c.beginPath();
      c.arc(side * 54, 10, 3, 0, Math.PI * 2);
      c.fill();
    }
    const pulse = 1 + Math.sin(now / 120) * 0.12;
    const coreGrad = c.createRadialGradient(0, 6, 0, 0, 6, 16 * pulse);
    coreGrad.addColorStop(0, "#ffffff");
    coreGrad.addColorStop(0.4, core);
    coreGrad.addColorStop(1, withAlpha(core, 0));
    c.fillStyle = coreGrad;
    c.beginPath();
    c.arc(0, 6, 16 * pulse, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function healthBar(c: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, color: string) {
    c.fillStyle = "rgb(0 0 0 / 0.55)";
    c.fillRect(x - 1, y - 1, w + 2, 6);
    c.fillStyle = color;
    c.fillRect(x, y, w * Math.max(0, frac), 4);
  }

  function drawShip(c: CanvasRenderingContext2D, now: number, animate: boolean) {
    const blink = ship.invuln > 0 && Math.floor(now / 70) % 2 === 0;
    c.save();
    c.translate(ship.x, ship.y);
    c.globalCompositeOperation = "lighter";
    const flicker = animate ? 1 + Math.sin(now / 30) * 0.15 : 1;
    const flame = ship.overdrive > 0 ? "#ffd84a" : "#ff9a4a";
    glow(c, -6, 18, 7 * flicker, flame, 0.95, 12 * flicker);
    glow(c, 6, 18, 7 * flicker, flame, 0.95, 12 * flicker);
    glow(c, 0, 4, 36, colors.accent, 0.18);
    c.globalCompositeOperation = "source-over";
    if (blink) c.globalAlpha = 0.35;
    c.scale(1 - Math.abs(ship.bank) * 0.16, 1);
    const wing = c.createLinearGradient(-24, 0, 24, 0);
    wing.addColorStop(0, "#26346a");
    wing.addColorStop(0.5 - ship.bank * 0.25, "#7f9de0");
    wing.addColorStop(1, "#26346a");
    c.fillStyle = wing;
    c.beginPath();
    c.moveTo(0, -8);
    c.lineTo(23, 11);
    c.lineTo(21, 18);
    c.lineTo(8, 14);
    c.lineTo(-8, 14);
    c.lineTo(-21, 18);
    c.lineTo(-23, 11);
    c.closePath();
    c.fill();
    c.strokeStyle = withAlpha(colors.accent, 0.8);
    c.lineWidth = 1.2;
    c.stroke();
    const body = c.createLinearGradient(-8, 0, 8, 0);
    body.addColorStop(0, "#8ea2d8");
    body.addColorStop(0.45 - ship.bank * 0.2, "#f2f7ff");
    body.addColorStop(1, "#5a6ca8");
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(0, -25);
    c.bezierCurveTo(6, -15, 8, 0, 7, 15);
    c.lineTo(-7, 15);
    c.bezierCurveTo(-8, 0, -6, -15, 0, -25);
    c.fill();
    c.fillStyle = colors.accent;
    c.fillRect(-1, -2, 2, 14);
    const glass = c.createLinearGradient(0, -14, 0, 0);
    glass.addColorStop(0, "#e9fbff");
    glass.addColorStop(1, "#1a6f9a");
    c.fillStyle = glass;
    c.beginPath();
    c.ellipse(0, -8, 3.4, 7, 0, 0, Math.PI * 2);
    c.fill();
    const on = !animate || Math.floor(now / 400) % 2 === 0;
    c.fillStyle = on ? "#ff5d5d" : "#5a2030";
    c.fillRect(-22, 11, 2.5, 2.5);
    c.fillStyle = on ? "#7dff9a" : "#205a30";
    c.fillRect(19.5, 11, 2.5, 2.5);
    c.restore();
    c.globalAlpha = 1;

    for (const d of dronePositions(now)) {
      c.globalCompositeOperation = "lighter";
      glow(c, d.x, d.y, 14, "#b6ff5c", 0.5);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "#1e3a10";
      c.strokeStyle = "#b6ff5c";
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + now / 600;
        if (i === 0) c.moveTo(d.x + Math.cos(a) * 7, d.y + Math.sin(a) * 7);
        else c.lineTo(d.x + Math.cos(a) * 7, d.y + Math.sin(a) * 7);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }

    if (ship.shield) {
      const pulse = animate ? Math.sin(now / 180) * 0.1 : 0;
      c.globalCompositeOperation = "lighter";
      glow(c, ship.x, ship.y, 34, "#8fe9ff", 0.18 + pulse * 0.5);
      c.globalCompositeOperation = "source-over";
      c.strokeStyle = `rgb(143 233 255 / ${0.55 + pulse})`;
      c.lineWidth = 1.6;
      c.beginPath();
      c.arc(ship.x, ship.y, 29, 0, Math.PI * 2);
      c.stroke();
    }
  }

  function drawParticles(c: CanvasRenderingContext2D, additive: boolean) {
    for (const p of particles) {
      const t = p.life / p.max;
      if (!additive) {
        if (p.kind === "smoke") {
          c.fillStyle = withAlpha(p.color, 0.45 * t);
          c.beginPath();
          c.arc(p.x, p.y, p.size * (1 + (1 - t) * 1.6), 0, Math.PI * 2);
          c.fill();
        } else if (p.kind === "debris") {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.angle);
          c.fillStyle = withAlpha(p.color, Math.min(1, t * 2));
          c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          c.restore();
        }
        continue;
      }
      if (p.kind === "spark") {
        c.strokeStyle = withAlpha(p.color, t);
        c.lineWidth = p.size;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
        c.stroke();
      } else if (p.kind === "glow") {
        glow(c, p.x, p.y, p.size * (0.5 + t * 0.5), p.color, t);
      } else if (p.kind === "ring") {
        c.strokeStyle = withAlpha(p.color, t * 0.9);
        c.lineWidth = 1 + t * 4;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (1 - t * t) + 2, 0, Math.PI * 2);
        c.stroke();
      }
    }
  }

  function drawHud(c: CanvasRenderingContext2D, now: number) {
    c.textBaseline = "middle";
    c.textAlign = "center";
    c.font = "800 24px ui-sans-serif, system-ui, sans-serif";
    c.fillStyle = "rgb(0 0 0 / 0.4)";
    c.fillText(String(score), WIDTH / 2 + 1, 30);
    c.fillStyle = "#ffffff";
    c.fillText(String(score), WIDTH / 2, 29);

    // Hull cells.
    const cells = maxHull();
    for (let i = 0; i < cells; i += 1) {
      const x = 16 + i * 16;
      c.fillStyle = i < ship.hull ? (ship.hull === 1 ? "#ff4d6d" : "#ff8aa0") : "rgb(255 255 255 / 0.12)";
      c.beginPath();
      c.moveTo(x, 22);
      c.lineTo(x + 6, 16);
      c.lineTo(x + 12, 22);
      c.lineTo(x + 6, 28);
      c.closePath();
      c.fill();
    }
    if (levels.shield > 0) {
      const x = 22 + cells * 16;
      c.strokeStyle = ship.shield ? "#8fe9ff" : "rgb(143 233 255 / 0.25)";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(x, 22, 6, 0, Math.PI * 2);
      c.stroke();
      if (!ship.shield) {
        const frac = 1 - Math.max(0, ship.shieldIn) / SHIELD_RECHARGE[levels.shield];
        c.strokeStyle = "#8fe9ff";
        c.beginPath();
        c.arc(x, 22, 6, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        c.stroke();
      }
    }

    // Wave and progress.
    c.textAlign = "right";
    c.font = "700 12px ui-sans-serif, system-ui, sans-serif";
    c.fillStyle = withAlpha(colors.muted, 1);
    c.fillText(isBossWave() ? `WAVE ${wave} · BOSS` : `WAVE ${wave}`, WIDTH - 14, 18);
    const progress = waveState === "intro" ? 0 : waveState === "spawning" ? 1 - budget / totalBudget : 1;
    c.fillStyle = "rgb(255 255 255 / 0.12)";
    c.fillRect(WIDTH - 94, 27, 80, 3);
    c.fillStyle = colors.accent;
    c.fillRect(WIDTH - 94, 27, 80 * progress, 3);

    if (ship.overdrive > 0) {
      c.textAlign = "left";
      c.fillStyle = PICKUPS.overdrive.color;
      c.fillText(`OVERDRIVE ${ship.overdrive.toFixed(1)}s`, 14, 44);
    }

    const boss = enemies.find((e) => e.kind === "boss");
    if (boss) {
      c.textAlign = "center";
      c.font = "800 11px ui-sans-serif, system-ui, sans-serif";
      c.fillStyle = "#ffb3c8";
      c.fillText("MOTHERSHIP", WIDTH / 2, 52);
      healthBar(c, WIDTH / 2 - 130, 60, 260, boss.hp / boss.maxHp, boss.hp < boss.maxHp * 0.5 ? "#ff4d6d" : "#ff7ad9");
    }

    if (banner.t > 0 && (phase === "playing" || phase === "upgrade")) {
      const a = Math.min(1, banner.t * 2);
      c.textAlign = "center";
      if (banner.warn) {
        const stripe = Math.floor(now / 250) % 2 === 0 ? 0.35 : 0.2;
        c.fillStyle = `rgb(255 60 90 / ${stripe * a})`;
        c.fillRect(0, HEIGHT / 2 - 110, WIDTH, 70);
      }
      c.font = "900 38px ui-sans-serif, system-ui, sans-serif";
      c.fillStyle = withAlpha(banner.warn ? "#ff4d6d" : colors.accent, a);
      c.fillText(banner.title, WIDTH / 2, HEIGHT / 2 - 80);
      c.font = "600 14px ui-sans-serif, system-ui, sans-serif";
      c.fillStyle = withAlpha("#eaf6ff", a * 0.85);
      c.fillText(banner.sub, WIDTH / 2, HEIGHT / 2 - 50);
    }
  }

  function draw() {
    if (!ctx) return;
    const c = ctx;
    const effects = fx();
    const animate = effects !== "off";
    const now = performance.now();
    const { width, height, dpr } = size;
    const view = fitWorld(size, WIDTH, HEIGHT);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = colors.background;
    c.fillRect(0, 0, width, height);
    c.save();
    c.translate(view.x, view.y);
    c.scale(view.scale, view.scale);
    c.beginPath();
    c.rect(0, 0, WIDTH, HEIGHT);
    c.clip();

    const shakeSize = trauma * trauma * (effects === "full" ? 10 : effects === "subtle" ? 4 : 0);
    c.save();
    if (shakeSize > 0) c.translate(rand(-1, 1) * shakeSize, rand(-1, 1) * shakeSize);

    drawBackground(c, now, animate);
    drawParticles(c, false);

    for (const p of pickups) {
      const info = PICKUPS[p.kind];
      const bob = animate ? Math.sin(p.age * 6) * 2 : 0;
      c.globalCompositeOperation = "lighter";
      glow(c, p.x, p.y + bob, 22, info.color, 0.6);
      c.globalCompositeOperation = "source-over";
      c.fillStyle = "rgb(10 12 30 / 0.85)";
      c.strokeStyle = info.color;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(p.x, p.y + bob, 10, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = info.color;
      c.font = "900 13px ui-sans-serif, system-ui, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(info.label, p.x, p.y + bob + 1);
    }

    for (const e of enemies) {
      if (e.kind === "rock") drawRock(c, e, now);
      else if (e.kind === "raider") drawRaider(c, e);
      else if (e.kind === "diver") drawDiver(c, e, now);
      else if (e.kind === "gunship") drawGunship(c, e);
      else drawBoss(c, e, now);
    }

    c.globalCompositeOperation = "lighter";
    const laser = shotColor();
    for (const s of shots) {
      const color = s.drone ? "#b6ff5c" : laser;
      glow(c, s.x, s.y, 6, color, 0.9, 16);
      c.fillStyle = "#ffffff";
      c.fillRect(s.x - 1, s.y - 8, 2, 13);
    }
    for (const m of missiles) {
      glow(c, m.x, m.y, 10, "#ff8a5c", 0.9);
    }
    for (const s of enemyShots) {
      glow(c, s.x, s.y, s.r * 3, s.color, 0.85);
    }
    c.globalCompositeOperation = "source-over";
    for (const m of missiles) {
      c.save();
      c.translate(m.x, m.y);
      c.rotate(Math.atan2(m.vy, m.vx));
      c.fillStyle = "#e8ecff";
      c.fillRect(-6, -2, 10, 4);
      c.fillStyle = "#ff6b6b";
      c.fillRect(4, -2, 3, 4);
      c.restore();
    }
    c.fillStyle = "#ffffff";
    for (const s of enemyShots) {
      c.beginPath();
      c.arc(s.x, s.y, s.r * 0.55, 0, Math.PI * 2);
      c.fill();
    }

    if (phase !== "dying" && phase !== "over") drawShip(c, now, animate);

    c.globalCompositeOperation = "lighter";
    drawParticles(c, true);
    c.globalCompositeOperation = "source-over";

    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "800 14px ui-sans-serif, system-ui, sans-serif";
    for (const p of popups) {
      c.fillStyle = withAlpha(p.color, Math.min(1, p.life * 2));
      c.fillText(p.text, p.x, p.y);
    }
    c.restore();

    // Screen-space layers: damage vignette, HUD, countdown.
    const danger = ship.hull === 1 && phase === "playing" ? 0.25 + (animate ? Math.sin(now / 220) * 0.12 : 0) : 0;
    const vignette = Math.max(danger, hurtFlash * 0.55);
    if (vignette > 0) {
      const grad = c.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.3, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.75);
      grad.addColorStop(0, "rgb(255 40 70 / 0)");
      grad.addColorStop(1, `rgb(255 40 70 / ${vignette})`);
      c.fillStyle = grad;
      c.fillRect(0, 0, WIDTH, HEIGHT);
    }
    const shade = c.createLinearGradient(0, 0, 0, 70);
    shade.addColorStop(0, "rgb(3 5 18 / 0.7)");
    shade.addColorStop(1, "rgb(3 5 18 / 0)");
    c.fillStyle = shade;
    c.fillRect(0, 0, WIDTH, 70);
    drawHud(c, now);

    if (phase === "countdown") {
      c.textAlign = "center";
      c.font = "900 96px ui-sans-serif, system-ui, sans-serif";
      c.fillStyle = "#ffffff";
      c.fillText(String(Math.ceil(countdown / COUNT_STEPS)), WIDTH / 2, HEIGHT / 2 - 40);
    }
    if ((phase === "dying" || phase === "over") && animate) {
      const flash = Math.max(0, 1 - (now - diedAt) / 350);
      if (flash > 0) {
        c.fillStyle = withAlpha("#ffffff", flash * (effects === "full" ? 0.45 : 0.18));
        c.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }
    c.restore();
  }

  reset();
  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    draw();
  });
  const stopLoop = startLoop(step, draw);

  /** Pointer position in world units. */
  function toWorld(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const view = fitWorld({ width: rect.width, height: rect.height, dpr: 1 }, WIDTH, HEIGHT);
    return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
  }

  return {
    get score() {
      return score;
    },
    get phase() {
      return phase;
    },
    get metrics() {
      return { seconds: Math.floor(time), kills, wave };
    },
    press() {
      if (phase === "ready") start();
      else if (phase === "over" && performance.now() - diedAt > 900) {
        reset();
        start();
      }
    },
    choose,
    setKey(key: keyof typeof input, down: boolean) {
      if (phase === "upgrade" && down) return;
      input = { ...input, [key]: down };
      if (down) pointer = null;
    },
    /** Touch or mouse steering: the ship flies toward the point, offset above the finger. */
    point(clientX: number, clientY: number, touch: boolean) {
      if (phase === "upgrade") return;
      const at = toWorld(clientX, clientY);
      pointer = { x: at.x, y: Math.max(TOP_BAND, Math.min(HEIGHT - 28, at.y - (touch ? 60 : 0))) };
    },
    release() {
      pointer = null;
    },
    pause() {
      if (phase !== "playing" && phase !== "countdown") return;
      input = { left: false, right: false, up: false, down: false };
      pointer = null;
      setPhase("paused");
    },
    resume() {
      if (phase !== "paused") return;
      countdown = COUNT_STEPS * 3;
      setPhase("countdown");
    },
    destroy() {
      stopLoop();
      stopResize();
    },
  };
}

type BlasterGame = ReturnType<typeof createBlaster>;
const isActive = (phase: Phase) => phase !== "ready" && phase !== "over";
const KEYS: Record<string, "left" | "right" | "up" | "down"> = {
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
};

export default function GameSpaceBlaster({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects, rootRef } = useArcade();
  const { records, submit } = useRecords("space-blaster", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<BlasterGame | null>(null);
  const live = useRef({ play, effects });
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<BlasterHud>({ score: 0, wave: 1, hull: 3, maxHull: 3, shield: false, levels: emptyLevels() });
  const [choices, setChoices] = useState<UpgradeId[]>([]);
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("space-blaster");

  useGameAchievementTracking("space-blaster", phase);

  useEffect(() => {
    live.current = { play, effects };
  });

  const start = useEffectEvent(() => beginRun(""));
  const finish = useEffectEvent((final: number, metrics: Record<string, number>) => {
    submit(final);
    finishRun(final, metrics);
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createBlaster(canvas, {
      onPhase: setPhase,
      onHud: setHud,
      onChoices: setChoices,
      onStart: () => start(),
      onOver: (final, metrics) => finish(final, metrics),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      if (isActive(game.phase)) {
        submit(game.score, { keepalive: true });
        finishRun(game.score, game.metrics, { keepalive: true });
      }
      game.destroy();
      gameRef.current = null;
    };
  }, [submit, finishRun]);

  useAway(() => gameRef.current?.pause());
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) gameRef.current?.pause();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = KEYS[event.key];
      if (key) gameRef.current?.setKey(key, false);
    };
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [rootRef]);

  function focusCanvas() {
    canvasRef.current?.focus({ preventScroll: true });
  }

  function togglePause() {
    const game = gameRef.current;
    if (!game) return;
    if (game.phase === "paused") game.resume();
    else game.pause();
    focusCanvas();
  }

  function pick(index: number) {
    gameRef.current?.choose(index);
    focusCanvas();
  }

  function pressAndFocus() {
    gameRef.current?.press();
    focusCanvas();
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (game.phase === "upgrade" && ["1", "2", "3"].includes(event.key)) {
      if (!event.repeat) pick(Number(event.key) - 1);
      return true;
    }
    const key = KEYS[event.key];
    if (key) {
      game.setKey(key, true);
      if (game.phase === "ready" && !event.repeat) game.press();
      return true;
    }
    if ((event.key === " " || event.key === "Enter") && game.phase !== "upgrade") {
      if (!event.repeat) game.press();
      return true;
    }
    if ((event.key === "p" || event.key === "P" || event.key === "Escape") && isActive(game.phase)) {
      if (!event.repeat) togglePause();
      return true;
    }
    return false;
  });

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    focusCanvas();
    const game = gameRef.current;
    if (!game) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (game.phase === "ready" || game.phase === "over") game.press();
    game.point(event.clientX, event.clientY, event.pointerType === "touch");
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    // Mouse steering follows the cursor while a button is held; touch follows the finger.
    if (event.buttons === 0 && event.pointerType === "mouse") return;
    gameRef.current?.point(event.clientX, event.clientY, event.pointerType === "touch");
  }

  const best = records[""] ?? 0;
  const active = isActive(phase);
  const owned = UPGRADE_IDS.filter((id) => hud.levels[id] > 0);

  return (
    <GameShell
      game="space-blaster"
      title="Space Blaster"
      active={active}
      stats={
        <>
          <Stat label="Score" value={hud.score} />
          <Stat label="Best" value={Math.max(best, hud.score)} highlight={hud.score > 0 && hud.score >= best} />
          <Stat label="Wave" value={hud.wave} />
          <Stat label="Hull" value={`${hud.hull}/${hud.maxHull}${hud.shield ? " +S" : ""}`} />
          <div className="flex min-w-[8rem] flex-col justify-center rounded-lg border border-border bg-surface/60 px-3 py-1.5">
            <span className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">Loadout</span>
            <span className="flex flex-wrap gap-1 text-xs font-semibold">
              {owned.length === 0 ? (
                <span className="text-muted-foreground">Stock ship</span>
              ) : (
                owned.map((id) => {
                  const Icon = UPGRADE_ICONS[id];
                  return (
                    <span key={id} title={UPGRADES[id].name} className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[#05081a]" style={{ background: UPGRADES[id].color }}>
                      <Icon className="size-3" aria-hidden />
                      <span className="sr-only">{UPGRADES[id].name} level</span>
                      {hud.levels[id]}
                    </span>
                  );
                })
              )}
            </span>
          </div>
        </>
      }
      actions={
        active && phase !== "upgrade" && phase !== "dying" ? (
          <Button variant="outline" size="sm" className="h-8" onClick={togglePause}>
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            {phase === "paused" ? "Resume" : "Pause"}
          </Button>
        ) : null
      }
    >
      <div className="arcade-stage [--stage-ratio:0.75]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Space Blaster playfield, score ${hud.score}, wave ${hud.wave}, hull ${hud.hull} of ${hud.maxHull}. Move with the arrow keys or drag; the ship fires on its own.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => gameRef.current?.release()}
          onPointerCancel={() => gameRef.current?.release()}
        />
        {phase === "upgrade" ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-[#030512]/70 p-3 backdrop-blur-[2px]" role="dialog" aria-label="Choose an upgrade">
            <p className="text-center text-sm font-bold tracking-[0.2em] text-[#eaf6ff] uppercase">Choose an upgrade</p>
            <div className="flex w-full max-w-md flex-col gap-2">
              {choices.map((id, index) => {
                const info = UPGRADES[id];
                const Icon = UPGRADE_ICONS[id];
                const level = hud.levels[id];
                return (
                  <button
                    key={id}
                    type="button"
                    ref={index === 0 ? focusQuietly : undefined}
                    onClick={() => pick(index)}
                    className="group flex items-center gap-3 rounded-xl border bg-[#0b1030]/90 px-3 py-2.5 text-left text-[#eaf6ff] transition-[transform,background-color,box-shadow] duration-150 outline-none hover:-translate-y-0.5 hover:bg-[#121a48] focus-visible:-translate-y-0.5 focus-visible:bg-[#121a48] focus-visible:ring-2"
                    style={{ borderColor: `${info.color}66`, ["--tw-ring-color" as string]: info.color, boxShadow: `0 0 24px -12px ${info.color}` }}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg text-[#05081a]" style={{ background: info.color }}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="font-semibold">{info.name}</span>
                        {id !== "repair" ? (
                          <span className="text-xs text-[#7f93c4] tabular-nums">
                            Lv {level} → {level + 1}
                            {Number.isFinite(info.max) ? ` / ${info.max}` : ""}
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-[#a9b8de]">{info.text(level + 1)}</span>
                    </span>
                    <kbd className="hidden rounded border border-[#7f93c4]/40 px-1.5 text-xs text-[#7f93c4] sm:inline">{index + 1}</kbd>
                  </button>
                );
              })}
            </div>
          </div>
        ) : phase === "ready" ? (
          <GameOverlay title="Space Blaster" actions={<Button size="sm" onClick={pressAndFocus}>Launch</Button>}>
            Move with the arrow keys or WASD, or drag on the playfield. Your ship fires on its own.
            <span className="mt-1 block text-xs">
              Clear each wave, then pick one of three upgrades: faster fire, more lasers, missiles, drones, shields and more. Enemies get tougher every wave, and a Mothership attacks every fifth. Your hull takes three hits.
            </span>
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} ref={focusQuietly}>Resume</Button>}>
            Score {hud.score} · wave {hud.wave}
            <span className="mt-1 block text-xs">A short countdown runs before play resumes.</span>
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title="Ship down" actions={<Button size="sm" onClick={pressAndFocus}>Fly again</Button>}>
            Score {hud.score} · reached wave {hud.wave}
            {hud.score > 0 && hud.score >= best ? " · new best!" : ` · best ${Math.max(best, hud.score)}`}
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
