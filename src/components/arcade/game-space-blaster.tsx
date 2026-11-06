"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { fitWorld, observeCanvas, startLoop, withAlpha, type CanvasSize } from "./engine";
import { GAME_PALETTES } from "./palettes";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { GameOverlay, GameShell, Stat, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import type { SoundName } from "./sound";
import "./minigames.css";

const WIDTH = 480;
const HEIGHT = 640;
const SHIP_Y = 580;
/** The ship's hitbox: a circle well inside the drawn hull, so near misses stay misses. */
const SHIP_HIT = 8;
const TOP_BAND = 430;
const POWER_SECONDS = 10;
const COUNT_STEPS = 30;

type Phase = "ready" | "playing" | "paused" | "countdown" | "over";
type PowerKind = "rapid" | "spread" | "thrust";
type Rock = { kind: "rock"; x: number; y: number; vx: number; vy: number; r: number; hp: number; tier: 0 | 1 | 2; angle: number; spin: number; points: number; seed: number };
type Raider = { kind: "raider"; x: number; y: number; vx: number; vy: number; r: number; hp: number; baseX: number; age: number; fireIn: number; points: number };
type Enemy = Rock | Raider;
type Shot = { x: number; y: number; vx: number; vy: number };
type Power = { kind: PowerKind; x: number; y: number; age: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };

export const POWER_INFO: Record<PowerKind, { label: string; color: string; letter: string }> = {
  rapid: { label: "Rapid fire", color: "#ffd84a", letter: "R" },
  spread: { label: "Spread shot", color: "#ff7ad9", letter: "S" },
  thrust: { label: "Thrusters", color: "#7dff9a", letter: "T" },
};

const ROCK_TIERS = [
  { r: 26, hp: 3, points: 30 },
  { r: 17, hp: 2, points: 20 },
  { r: 10, hp: 1, points: 10 },
] as const;

type Hooks = {
  onPhase: (phase: Phase) => void;
  onHud: (hud: { score: number; wave: number; powers: Record<PowerKind, number> }) => void;
  onStart: () => void;
  onOver: (score: number, metrics: { seconds: number; kills: number }) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

function createBlaster(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const colors = GAME_PALETTES["space-blaster"];
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, z: 0.3 + Math.random() * 0.7 }));
  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let ship = { x: WIDTH / 2, y: SHIP_Y };
  let input = { left: false, right: false, up: false, down: false };
  let pointer: { x: number; y: number } | null = null;
  let enemies: Enemy[] = [];
  let shots: Shot[] = [];
  let enemyShots: Shot[] = [];
  let powers: Power[] = [];
  let sparks: Spark[] = [];
  let active: Record<PowerKind, number> = { rapid: 0, spread: 0, thrust: 0 };
  let time = 0;
  let score = 0;
  let kills = 0;
  let survivalBank = 0;
  let fireIn = 0;
  let rockIn = 0;
  let raiderIn = 8;
  let powerIn = 14;
  let countdown = 0;
  let wave = 1;
  let waveBanner = 0;
  let diedAt = 0;
  let scroll = 0;

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const hud = () => hooks.onHud({ score, wave, powers: { ...active } });

  function reset() {
    ship = { x: WIDTH / 2, y: SHIP_Y };
    enemies = [];
    shots = [];
    enemyShots = [];
    powers = [];
    sparks = [];
    active = { rapid: 0, spread: 0, thrust: 0 };
    time = 0;
    score = 0;
    kills = 0;
    survivalBank = 0;
    fireIn = 0;
    rockIn = 0.6;
    raiderIn = 18;
    powerIn = 14;
    wave = 1;
    waveBanner = 0;
    hud();
    setPhase("ready");
  }

  function start() {
    hooks.onStart();
    waveBanner = 2;
    setPhase("playing");
  }

  function burst(x: number, y: number, color: string, count: number) {
    if (hooks.live().effects === "off") return;
    const n = hooks.live().effects === "subtle" ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 160;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, color });
    }
  }

  function spawnRock(tier: 0 | 1 | 2, x: number, y: number, vx: number, vy: number) {
    const info = ROCK_TIERS[tier];
    enemies.push({ kind: "rock", tier, x, y, vx, vy, r: info.r, hp: info.hp, points: info.points, angle: Math.random() * 6, spin: (Math.random() - 0.5) * 2, seed: Math.random() });
  }

  function addScore(points: number) {
    score += points;
    hud();
  }

  function destroy(enemy: Enemy) {
    kills += 1;
    addScore(enemy.points);
    burst(enemy.x, enemy.y, enemy.kind === "raider" ? colors.accent2 : colors.muted, enemy.kind === "raider" ? 16 : 10);
    hooks.live().play("boom", enemy.kind === "rock" ? 1 + enemy.tier * 0.25 : 0.8);
    if (enemy.kind === "rock" && enemy.tier < 2) {
      const tier = (enemy.tier + 1) as 1 | 2;
      for (const side of [-1, 1]) spawnRock(tier, enemy.x + side * 6, enemy.y, enemy.vx + side * (40 + Math.random() * 40), enemy.vy * 0.9);
    }
    const chance = enemy.kind === "raider" ? 0.3 : 0.07;
    if (Math.random() < chance) dropPower(enemy.x, enemy.y);
  }

  function dropPower(x: number, y: number) {
    const kinds: PowerKind[] = ["rapid", "spread", "thrust"];
    powers.push({ kind: kinds[Math.floor(Math.random() * kinds.length)], x, y, age: 0 });
  }

  function die() {
    diedAt = performance.now();
    burst(ship.x, ship.y, colors.accent, 40);
    hooks.live().play("bomb");
    window.setTimeout(() => hooks.live().play("over"), 350);
    setPhase("over");
    hooks.onOver(score, { seconds: Math.floor(time), kills });
  }

  function step(ms: number) {
    const dt = ms / 1000;
    const animate = hooks.live().effects !== "off";
    if (animate) scroll += dt * (phase === "playing" ? 60 : 20);
    for (const spark of sparks) {
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.life -= dt;
    }
    sparks = sparks.filter((spark) => spark.life > 0);
    if (phase === "countdown") {
      countdown -= 1;
      if (countdown > 0 && countdown % COUNT_STEPS === 0) hooks.live().play("tick");
      if (countdown <= 0) setPhase("playing");
      return;
    }
    if (phase !== "playing") return;

    time += dt;
    const nextWave = 1 + Math.floor(time / 30);
    if (nextWave !== wave) {
      wave = nextWave;
      waveBanner = 2;
      hud();
    }
    waveBanner = Math.max(0, waveBanner - dt);
    survivalBank += dt;
    if (survivalBank >= 1) {
      survivalBank -= 1;
      addScore(1);
    }
    for (const kind of Object.keys(active) as PowerKind[]) {
      if (active[kind] > 0) {
        active[kind] = Math.max(0, active[kind] - dt);
        if (active[kind] === 0) hud();
      }
    }

    // Ship movement: keys, or follow the pointer, both at the same top speed.
    const speed = active.thrust > 0 ? 470 : 290;
    let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (pointer) {
      const tx = pointer.x - ship.x;
      const ty = pointer.y - ship.y;
      const dist = Math.hypot(tx, ty);
      const reach = speed * dt;
      if (dist <= reach) {
        dx = 0;
        dy = 0;
        ship.x = pointer.x;
        ship.y = pointer.y;
      } else {
        dx = tx / dist;
        dy = ty / dist;
      }
    } else if (dx && dy) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }
    ship.x = Math.min(WIDTH - 18, Math.max(18, ship.x + dx * speed * dt));
    ship.y = Math.min(HEIGHT - 24, Math.max(TOP_BAND, ship.y + dy * speed * dt));

    // Firing is automatic.
    fireIn -= dt;
    if (fireIn <= 0) {
      fireIn = active.rapid > 0 ? 0.1 : 0.2;
      const angles = active.spread > 0 ? [-0.2, 0, 0.2] : [0];
      for (const a of angles) shots.push({ x: ship.x, y: ship.y - 18, vx: Math.sin(a) * 640, vy: -Math.cos(a) * 640 });
      hooks.live().play("laser", active.spread > 0 ? 0.9 : 1);
    }
    for (const shot of shots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
    }
    shots = shots.filter((shot) => shot.y > -20 && shot.x > -20 && shot.x < WIDTH + 20);

    // Spawning ramps up over time.
    const pace = 1 + time / 70;
    rockIn -= dt;
    if (rockIn <= 0) {
      rockIn = Math.max(0.32, 1.25 - time * 0.011) * (0.7 + Math.random() * 0.6);
      const roll = Math.random();
      const tier = roll < 0.25 + Math.min(0.25, time / 240) ? 0 : roll < 0.65 ? 1 : 2;
      spawnRock(tier as 0 | 1 | 2, 30 + Math.random() * (WIDTH - 60), -30, (Math.random() - 0.5) * 60, (70 + Math.random() * 60) * pace);
    }
    raiderIn -= dt;
    if (raiderIn <= 0) {
      raiderIn = Math.max(2.2, 6.5 - time * 0.04) * (0.8 + Math.random() * 0.4);
      const x = 60 + Math.random() * (WIDTH - 120);
      enemies.push({ kind: "raider", x, baseX: x, y: -24, vx: 0, vy: 85 * Math.min(1.8, pace), r: 14, hp: 2, age: 0, fireIn: 1.2 + Math.random(), points: 50 });
    }
    powerIn -= dt;
    if (powerIn <= 0) {
      powerIn = 18 + Math.random() * 8;
      dropPower(40 + Math.random() * (WIDTH - 80), -16);
    }

    for (const enemy of enemies) {
      if (enemy.kind === "rock") {
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        enemy.angle += enemy.spin * dt;
        if (enemy.x < enemy.r || enemy.x > WIDTH - enemy.r) enemy.vx = -enemy.vx;
      } else {
        enemy.age += dt;
        enemy.y += enemy.vy * dt;
        enemy.x = enemy.baseX + Math.sin(enemy.age * 2.2) * 70;
        // Raiders start firing aimed shots once the run is under way.
        if (time > 35) {
          enemy.fireIn -= dt;
          if (enemy.fireIn <= 0 && enemy.y < ship.y - 120) {
            enemy.fireIn = Math.max(1.1, 2.2 - time / 120);
            const a = Math.atan2(ship.y - enemy.y, ship.x - enemy.x);
            const s = 190 + Math.min(80, time);
            enemyShots.push({ x: enemy.x, y: enemy.y + 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
          }
        }
      }
    }
    for (const shot of enemyShots) {
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
    }
    enemyShots = enemyShots.filter((shot) => shot.y < HEIGHT + 10 && shot.y > -10 && shot.x > -10 && shot.x < WIDTH + 10);
    for (const power of powers) {
      power.y += 95 * dt;
      power.age += dt;
    }

    // Hits on enemies.
    for (const shot of shots) {
      for (const enemy of enemies) {
        if (enemy.hp <= 0) continue;
        if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) > enemy.r + 3) continue;
        shot.y = -100;
        enemy.hp -= 1;
        if (enemy.hp <= 0) destroy(enemy);
        else hooks.live().play("chip");
        break;
      }
    }
    shots = shots.filter((shot) => shot.y > -50);
    enemies = enemies.filter((enemy) => enemy.hp > 0 && enemy.y < HEIGHT + 40);

    // Pickups.
    powers = powers.filter((power) => {
      if (Math.hypot(power.x - ship.x, power.y - ship.y) < 24) {
        active[power.kind] = POWER_SECONDS;
        hooks.live().play("power");
        hud();
        return false;
      }
      return power.y < HEIGHT + 20;
    });

    // One hit ends the run.
    for (const enemy of enemies) {
      const reach = enemy.kind === "rock" ? enemy.r * 0.82 : enemy.r * 0.75;
      if (Math.hypot(enemy.x - ship.x, enemy.y - ship.y) < reach + SHIP_HIT) return die();
    }
    for (const shot of enemyShots) {
      if (Math.hypot(shot.x - ship.x, shot.y - ship.y) < 4 + SHIP_HIT) return die();
    }
  }

  function drawShip(now: number, animate: boolean) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    if (animate) {
      const flame = 10 + Math.sin(now / 40) * 4 + (active.thrust > 0 ? 8 : 0);
      ctx.fillStyle = active.thrust > 0 ? "#7dff9a" : colors.accent2;
      ctx.beginPath();
      ctx.moveTo(-6, 14);
      ctx.lineTo(0, 14 + flame);
      ctx.lineTo(6, 14);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = colors.accent;
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = animate ? 14 : 0;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(17, 16);
    ctx.lineTo(0, 9);
    ctx.lineTo(-17, 16);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = colors.background;
    ctx.beginPath();
    ctx.ellipse(0, -2, 4, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawRock(rock: Rock) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.angle);
    ctx.fillStyle = rock.tier === 0 ? "#6d6a8c" : rock.tier === 1 ? "#7f7a9e" : "#948fb5";
    ctx.strokeStyle = withAlpha(colors.foreground, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    const points = 9;
    for (let i = 0; i < points; i += 1) {
      const a = (i / points) * Math.PI * 2;
      const wobble = 0.8 + ((Math.sin(rock.seed * 50 + i * 2.3) + 1) / 2) * 0.3;
      const x = Math.cos(a) * rock.r * wobble;
      const y = Math.sin(a) * rock.r * wobble;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawRaider(raider: Raider) {
    if (!ctx) return;
    ctx.save();
    ctx.translate(raider.x, raider.y);
    ctx.fillStyle = colors.accent2;
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(16, -8);
    ctx.lineTo(6, -4);
    ctx.lineTo(0, -12);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-16, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw(alpha: number) {
    if (!ctx) return;
    void alpha;
    const effects = hooks.live().effects;
    const animate = effects !== "off";
    const now = performance.now();
    const { width, height, dpr } = size;
    const view = fitWorld(size, WIDTH, HEIGHT);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, HEIGHT);
    ctx.clip();

    for (const star of stars) {
      const y = (star.y + scroll * star.z) % HEIGHT;
      ctx.fillStyle = withAlpha(colors.foreground, 0.25 + star.z * 0.5);
      ctx.fillRect(star.x, y, star.z * 2, star.z * 2);
    }

    for (const power of powers) {
      const info = POWER_INFO[power.kind];
      const pulse = animate ? 1 + Math.sin(power.age * 8) * 0.08 : 1;
      ctx.save();
      ctx.translate(power.x, power.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = withAlpha(info.color, 0.25);
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = info.color;
      ctx.font = "800 14px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(info.letter, 0, 1);
      ctx.restore();
    }

    for (const enemy of enemies) {
      if (enemy.kind === "rock") drawRock(enemy);
      else drawRaider(enemy);
    }

    ctx.fillStyle = colors.accent;
    for (const shot of shots) ctx.fillRect(shot.x - 1.5, shot.y - 7, 3, 12);
    ctx.fillStyle = "#ffef8a";
    for (const shot of enemyShots) {
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (phase !== "over" || !animate) {
      if (phase !== "over") drawShip(now, animate);
    }

    for (const spark of sparks) {
      ctx.fillStyle = withAlpha(spark.color, Math.min(1, spark.life * 2));
      ctx.fillRect(spark.x - 1.5, spark.y - 1.5, 3, 3);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 22px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = withAlpha(colors.foreground, 0.9);
    ctx.fillText(String(score), WIDTH / 2, 28);
    if (waveBanner > 0 && phase === "playing") {
      ctx.font = "800 30px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = withAlpha(colors.accent, Math.min(1, waveBanner));
      ctx.fillText(`WAVE ${wave}`, WIDTH / 2, HEIGHT / 2 - 60);
    }
    if (phase === "countdown") {
      ctx.font = "800 96px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(String(Math.ceil(countdown / COUNT_STEPS)), WIDTH / 2, HEIGHT / 2 - 40);
    }
    if (phase === "over" && animate) {
      const flash = Math.max(0, 1 - (now - diedAt) / 300);
      if (flash > 0) {
        ctx.fillStyle = withAlpha("#ffffff", flash * (effects === "full" ? 0.4 : 0.18));
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
    }
    ctx.restore();
  }

  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    draw(1);
  });
  reset();
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
      return { seconds: Math.floor(time), kills };
    },
    press() {
      if (phase === "ready") start();
      else if (phase === "over" && performance.now() - diedAt > 500) {
        reset();
        start();
      }
    },
    setKey(key: keyof typeof input, down: boolean) {
      input = { ...input, [key]: down };
      if (down) pointer = null;
    },
    /** Touch or mouse steering: the ship flies toward the point, offset above the finger. */
    point(clientX: number, clientY: number, touch: boolean) {
      const at = toWorld(clientX, clientY);
      pointer = { x: at.x, y: Math.max(TOP_BAND, Math.min(HEIGHT - 24, at.y - (touch ? 60 : 0))) };
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
const isActive = (phase: Phase) => phase === "playing" || phase === "paused" || phase === "countdown";
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
  const [hud, setHud] = useState<{ score: number; wave: number; powers: Record<PowerKind, number> }>({ score: 0, wave: 1, powers: { rapid: 0, spread: 0, thrust: 0 } });
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

  function togglePause() {
    const game = gameRef.current;
    if (!game) return;
    if (game.phase === "paused") game.resume();
    else game.pause();
    canvasRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game || event.ctrlKey || event.metaKey || event.altKey) return false;
    const key = KEYS[event.key];
    if (key) {
      game.setKey(key, true);
      if (game.phase === "ready" && !event.repeat) game.press();
      return true;
    }
    if (event.key === " " || event.key === "Enter") {
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
    canvasRef.current?.focus({ preventScroll: true });
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
  const powered = (Object.keys(hud.powers) as PowerKind[]).filter((kind) => hud.powers[kind] > 0);

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
          <div className="flex min-w-[8rem] flex-col justify-center rounded-lg border border-border bg-surface/60 px-3 py-1.5" aria-live="polite">
            <span className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">Power-ups</span>
            <span className="flex flex-wrap gap-1 text-xs font-semibold">
              {powered.length === 0 ? <span className="text-muted-foreground">None</span> : powered.map((kind) => (
                <span key={kind} className="rounded px-1.5 py-0.5 text-[#05081a]" style={{ background: POWER_INFO[kind].color }}>
                  {POWER_INFO[kind].label}
                </span>
              ))}
            </span>
          </div>
        </>
      }
      actions={
        active ? (
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
          aria-label={`Space Blaster playfield, score ${hud.score}, wave ${hud.wave}. Move with the arrow keys or drag; the ship fires on its own.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => gameRef.current?.release()}
          onPointerCancel={() => gameRef.current?.release()}
        />
        {phase === "ready" ? (
          <GameOverlay title="Space Blaster" actions={<Button size="sm" onClick={() => gameRef.current?.press()}>Launch</Button>}>
            Move with the arrow keys or WASD, or drag on the playfield. Your ship fires on its own.
            <span className="mt-1 block text-xs">
              Shoot rocks (big ones split) and raiders. Grab power-ups: R rapid fire, S spread shot, T thrusters, 10 seconds each. One hit ends the run, and every 30 seconds a tougher wave arrives.
            </span>
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
            Score {hud.score} · wave {hud.wave}
            <span className="mt-1 block text-xs">A short countdown runs before play resumes.</span>
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title="Ship down" actions={<Button size="sm" onClick={() => gameRef.current?.press()}>Fly again</Button>}>
            Score {hud.score} · wave {hud.wave}
            {hud.score > 0 && hud.score >= best ? " · new best!" : ` · best ${Math.max(best, hud.score)}`}
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
