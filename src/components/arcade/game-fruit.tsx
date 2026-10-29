"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/arcade";
import { dailyDate, dailyVariant, seedFrom, seededRandom } from "@/lib/arcade-daily";
import type { MotionLevel } from "@/lib/preferences";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { DailyCountdown, formatDailyDate, useDailyDate } from "./daily";
import { fitWorld, mix, observeCanvas, random, startLoop, withAlpha, type CanvasSize } from "./engine";
import { GameOverlay, GameShell, Stat, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import { GAME_PALETTES } from "./palettes";
import type { SoundName } from "./sound";

const HEIGHT = 600;
/** Fall acceleration in world px/s². */
const GRAVITY = 900;
const MAX_MISSES = 3;
const BOMB_PENALTY = 10;
/** A stroke ends when the pointer lifts or the blade rests this long. */
const STROKE_REST_MS = 300;
const TRAIL_MS = 160;
const BOMB_RADIUS = 28;
/** Extra reach for the blade's own width (the leaf and stem don't count). */
const HIT_SLOP = 4;
const MAX_PARTICLES = 120;
const MAX_SPLATS = 12;
/** No new waves this close to the end of a timed round, so nothing launches that can't be reached. */
const LAST_WAVE_MS = 1500;
const RESTART_LOCK_MS = 500;

type Mode = "classic" | "arcade" | "zen" | "daily";
type Reason = "bomb" | "misses" | "time";
type Phase = "ready" | "playing" | "paused" | "over";

const RULES: Record<Mode, { label: string; duration: number | null; bombs: "end" | "penalty" | "none"; misses: boolean; title: string }> = {
  classic: { label: "Classic", duration: null, bombs: "end", misses: true, title: "Miss 3 fruit and the round ends; a bomb ends it at once" },
  arcade: { label: "Arcade", duration: 60_000, bombs: "penalty", misses: false, title: `60 seconds to score; a bomb costs ${BOMB_PENALTY} points` },
  zen: { label: "Zen", duration: 90_000, bombs: "none", misses: false, title: "90 calm seconds: no bombs, no misses" },
  daily: { label: "Daily", duration: 60_000, bombs: "penalty", misses: false, title: "Today's Arcade run: the same fruit and bombs for everyone, new at 00:00 UTC" },
};

const variantOf = (mode: Mode, runDate: string | null) =>
  mode === "daily" && runDate ? dailyVariant(runDate) : mode === "arcade" || mode === "zen" ? mode : "";

type Kind = { skin: string; flesh: string; radius: number; leaf: boolean };

/** Original fruit designs: skin, cut-face color and size. */
const KINDS: Kind[] = [
  { skin: "#7b3fa0", flesh: "#f3c76b", radius: 30, leaf: true },
  { skin: "#ff8a1f", flesh: "#ffd08a", radius: 32, leaf: true },
  { skin: "#5fb83b", flesh: "#d8f79a", radius: 28, leaf: false },
  { skin: "#ff6f7d", flesh: "#ffd5b8", radius: 30, leaf: true },
  { skin: "#2f9e57", flesh: "#ff5d6c", radius: 38, leaf: false },
  { skin: "#f5c51e", flesh: "#fff1a8", radius: 28, leaf: false },
];

/**
 * A whole fruit or bomb. Horizontal position is a fraction of the playfield width (`u`), so the
 * same launch plays out the same on any screen; `p*` fields are the previous step, for smooth drawing.
 */
type Flyer = { kind: Kind | null; u: number; vu: number; y: number; vy: number; angle: number; spin: number; pu: number; py: number; pangle: number };
type Launch = { at: number; kind: number; bomb: boolean; u: number; vu: number; vy: number; spin: number };
type Half = { kind: Kind; side: 1 | -1; x: number; y: number; vx: number; vy: number; angle: number; spin: number; px: number; py: number; pangle: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Splat = { x: number; y: number; color: string; life: number; blobs: { dx: number; dy: number; r: number }[] };
type Popup = { x: number; y: number; text: string; life: number; color: string; size: number };
type Point = { x: number; y: number; t: number };

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number, misses: number, fruitsSliced: number, maxCombo: number) => void;
  onTime: (secondsLeft: number | null) => void;
  onStart: (runDate: string | null) => void;
  onOver: (score: number, reason: Reason, fruitsSliced: number, maxCombo: number, variant: string) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

function createFruit(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const colors = GAME_PALETTES["fruit-slice"];

  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let width = 800;
  let phase: Phase = "ready";
  let mode: Mode = "classic";
  let runDate: string | null = null;
  // Launches come from their own generator (seeded for the daily run); nothing cosmetic draws from it,
  // and it depends only on the round's clock, so the sequence is the same at any frame rate or size.
  let course: () => number = Math.random;
  let flyers: Flyer[] = [];
  let queue: Launch[] = [];
  let halves: Half[] = [];
  let particles: Particle[] = [];
  let splats: Splat[] = [];
  let popups: Popup[] = [];
  let trail: Point[] = [];
  let score = 0;
  let misses = 0;
  let scheduledFruit = 0;
  let fruitsSliced = 0;
  let maxCombo = 0;
  let time = 0;
  let nextWave = 600;
  let lastSecond: number | null = null;
  let stroke = { count: 0, lastMove: 0, x: 0, y: 0 };
  let lastSample = { t: 0, x: 0, y: 0 };
  let lastSwoosh = 0;
  let overAt = 0;
  let drawAlpha = 1;
  let flashAt = -1000;
  let flashColor = "#ffffff";
  let flashStrength = 0;

  const rules = () => RULES[mode];
  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const report = () => hooks.onScore(score, misses, fruitsSliced, maxCombo);
  const secondsLeft = () => {
    const duration = rules().duration;
    return duration === null ? null : Math.max(0, Math.ceil((duration - time) / 1000));
  };

  function reset() {
    flyers = [];
    queue = [];
    halves = [];
    particles = [];
    splats = [];
    popups = [];
    trail = [];
    score = 0;
    misses = 0;
    scheduledFruit = 0;
    fruitsSliced = 0;
    maxCombo = 0;
    time = 0;
    nextWave = 600;
    runDate = null;
    stroke = { count: 0, lastMove: 0, x: 0, y: 0 };
    lastSecond = secondsLeft();
    report();
    hooks.onTime(lastSecond);
  }

  /** Every round starts the same way; a daily run fixes its date (and launch sequence) now. */
  function start() {
    runDate = mode === "daily" ? dailyDate() : null;
    course = seededRandom(runDate ? seedFrom(`fruit-slice:${runDate}`) : Math.floor(Math.random() * 2 ** 32));
    hooks.onStart(runDate);
    setPhase("playing");
  }

  /** Plans the next wave from the round clock alone (never from the score or the player). */
  function scheduleWave() {
    const r = rules();
    const ramp = Math.min(1, time / (r.duration ?? 120_000));
    const most = mode === "zen" ? 3 + Math.round(ramp * 2) : 1 + Math.round(ramp * 3);
    const count = 1 + Math.floor(course() * most);
    const wave: Launch[] = [];
    for (let i = 0; i < count; i += 1) {
      // Always draw the same numbers per launch, so one choice never shifts the rest of the sequence.
      const roll = course();
      const pick = course();
      const u = 0.14 + course() * 0.72;
      const drift = course();
      const lift = course();
      const spin = course();
      const chance = r.bombs === "none" || scheduledFruit < 5 ? 0 : r.bombs === "end" ? 0.1 + 0.08 * ramp : 0.16 + 0.1 * ramp;
      const bomb = roll < chance && (i < count - 1 || wave.some((item) => !item.bomb));
      if (!bomb) scheduledFruit += 1;
      const radius = bomb ? BOMB_RADIUS : KINDS[Math.floor(pick * KINDS.length)].radius;
      // Peak between 12% and 45% from the top: about a second up and a second down.
      const rise = HEIGHT + radius + 10 - HEIGHT * (0.12 + lift * 0.33);
      wave.push({
        at: time + i * 150,
        kind: Math.floor(pick * KINDS.length),
        bomb,
        u,
        vu: (0.5 - u) * (bomb ? 0.15 + drift * 0.25 : 0.25 + drift * 0.5),
        vy: -Math.sqrt(2 * GRAVITY * rise),
        spin: (spin - 0.5) * 5,
      });
    }
    // Bombs launch well apart from the fruit beside them.
    for (const item of wave) {
      if (!item.bomb) continue;
      for (let tries = 0; tries < 3 && wave.some((other) => !other.bomb && Math.abs(other.u - item.u) < 0.2); tries += 1) {
        item.u = 0.14 + ((item.u - 0.14 + 0.36) % 0.72);
        item.vu = (0.5 - item.u) * 0.25;
      }
    }
    queue.push(...wave);
    const interval = mode === "classic" ? 1700 - 700 * ramp : mode === "zen" ? 1500 - 400 * ramp : 1400 - 550 * ramp;
    nextWave = time + interval + count * 150;
  }

  function launch(item: Launch) {
    const kind = item.bomb ? null : KINDS[item.kind];
    const radius = kind?.radius ?? BOMB_RADIUS;
    const y = HEIGHT + radius + 10;
    flyers.push({ kind, u: item.u, vu: item.vu, y, vy: item.vy, angle: 0, spin: item.spin, pu: item.u, py: y, pangle: 0 });
    hooks.live().play("tap", item.bomb ? 0.55 : 0.8);
  }

  /** Where a flyer is on screen right now (as last drawn), in world px. */
  const drawn = (flyer: Flyer) => ({
    x: (flyer.pu + (flyer.u - flyer.pu) * drawAlpha) * width,
    y: flyer.py + (flyer.y - flyer.py) * drawAlpha,
  });

  function burst(x: number, y: number, color: string, count: number, speed: number) {
    const room = MAX_PARTICLES - particles.length;
    for (let i = 0; i < Math.min(count, room); i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = random(speed * 0.4, speed);
      particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 90, life: 1, color, size: random(2, 4.2) });
    }
  }

  function flash(color: string, strength: number) {
    flashAt = performance.now();
    flashColor = color;
    flashStrength = strength;
  }

  function over(reason: Reason) {
    if (phase !== "playing") return;
    overAt = performance.now();
    setPhase("over");
    trail = [];
    hooks.onOver(score, reason, fruitsSliced, maxCombo, variantOf(mode, runDate));
    if (reason !== "bomb") window.setTimeout(() => hooks.live().play("over"), 200);
  }

  /** Ends the current stroke; three or more fruit in it pay a one-time combo bonus. */
  function endStroke() {
    const count = stroke.count;
    stroke = { ...stroke, count: 0 };
    if (count < 3 || phase !== "playing") return;
    score += count;
    popups.push({
      x: Math.min(width - 90, Math.max(90, stroke.x)),
      y: Math.max(70, stroke.y - 34),
      text: `${count} fruit combo +${count}`,
      life: 1,
      color: colors.accent,
      size: 20,
    });
    hooks.live().play("combo", 1 + Math.min(count, 8) * 0.05);
    report();
  }

  function cut(flyer: Flyer, angle: number) {
    const effects = hooks.live().effects;
    const { x, y } = drawn(flyer);
    flyers = flyers.filter((item) => item !== flyer);
    const kind = flyer.kind;
    if (!kind) {
      if (effects !== "off") burst(x, y, "#ffb347", effects === "full" ? 22 : 8, 420);
      if (rules().bombs === "end") {
        flash("#ffffff", effects === "full" ? 0.55 : 0.2);
        hooks.live().play("bomb");
        over("bomb");
        return;
      }
      // Arcade rules: a clear penalty, and the stroke's combo is lost.
      score = Math.max(0, score - BOMB_PENALTY);
      stroke = { ...stroke, count: 0 };
      flash("#ff3b3b", effects === "full" ? 0.22 : 0.1);
      popups.push({ x: Math.min(width - 50, Math.max(50, x)), y: Math.max(60, y - 30), text: `Bomb −${BOMB_PENALTY}`, life: 1, color: "#ff6b6b", size: 24 });
      hooks.live().play("penalty");
      report();
      return;
    }
    // Two halves split along the blade, pushed apart and carried on by the swipe.
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    const along = { x: Math.cos(angle), y: Math.sin(angle) };
    const vx = flyer.vu * width;
    for (const side of [1, -1] as const) {
      const push = random(90, 140);
      halves.push({
        kind,
        side,
        x: x + normal.x * side * 3,
        y: y + normal.y * side * 3,
        vx: vx + normal.x * side * push + along.x * 70,
        vy: flyer.vy * 0.6 + normal.y * side * push + along.y * 70,
        angle,
        spin: side * random(1.2, 3.2),
        px: x,
        py: y,
        pangle: angle,
      });
    }
    if (effects !== "off") {
      burst(x, y, kind.flesh, effects === "full" ? 10 : 4, 260);
      splats.push({
        x,
        y,
        color: kind.flesh,
        life: 1,
        blobs: Array.from({ length: 5 }, () => ({ dx: random(-1, 1) * kind.radius * 0.9, dy: random(-1, 1) * kind.radius * 0.6, r: random(0.25, 0.55) * kind.radius })),
      });
      if (splats.length > MAX_SPLATS) splats.shift();
    }
    score += 1;
    fruitsSliced += 1;
    stroke = { ...stroke, count: stroke.count + 1, x, y };
    maxCombo = Math.max(maxCombo, stroke.count);
    hooks.live().play("squish", 0.92 + Math.min(stroke.count, 6) * 0.06);
    report();
  }

  function step(ms: number) {
    if (phase === "paused" || phase === "ready") return;
    const dt = ms / 1000;
    for (const f of flyers) {
      f.pu = f.u;
      f.py = f.y;
      f.pangle = f.angle;
      f.vy += GRAVITY * dt;
      f.y += f.vy * dt;
      f.u += f.vu * dt;
      f.angle += f.spin * dt;
    }
    for (const h of halves) {
      h.px = h.x;
      h.py = h.y;
      h.pangle = h.angle;
      h.vy += GRAVITY * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.angle += h.spin * dt;
    }
    halves = halves.filter((h) => h.y < HEIGHT + 120);
    for (const p of particles) {
      p.vy += GRAVITY * 0.7 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt / 0.6;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const s of splats) s.life -= dt / 1.4;
    splats = splats.filter((s) => s.life > 0);
    for (const popup of popups) popup.life -= dt / 0.9;
    popups = popups.filter((popup) => popup.life > 0);
    if (phase !== "playing") {
      flyers = flyers.filter((f) => f.y < HEIGHT + 140);
      return;
    }

    time += ms;
    const left = secondsLeft();
    if (left !== lastSecond) {
      lastSecond = left;
      hooks.onTime(left);
      if (left !== null && left > 0 && left <= 5) hooks.live().play("tick", left === 1 ? 1.3 : 1);
    }
    if (left === 0) {
      endStroke();
      return over("time");
    }
    if (stroke.count > 0 && performance.now() - stroke.lastMove > STROKE_REST_MS) endStroke();

    for (const f of [...flyers]) {
      const radius = f.kind?.radius ?? BOMB_RADIUS;
      if (f.vy <= 0 || f.y < HEIGHT + radius + 20) continue;
      flyers = flyers.filter((item) => item !== f);
      if (!f.kind || !rules().misses) continue;
      misses += 1;
      hooks.live().play("miss");
      popups.push({ x: Math.min(width - 50, Math.max(50, f.u * width)), y: HEIGHT - 40, text: "Missed!", life: 1, color: "#ff6b6b", size: 22 });
      report();
      if (misses >= MAX_MISSES) {
        endStroke();
        return over("misses");
      }
    }

    const duration = rules().duration;
    if (time >= nextWave && (duration === null || time < duration - LAST_WAVE_MS)) scheduleWave();
    if (queue.length) {
      const due = queue.filter((item) => item.at <= time);
      queue = queue.filter((item) => item.at > time);
      for (const item of due) launch(item);
    }
  }

  function drawFruit(c: CanvasRenderingContext2D, kind: Kind) {
    const r = kind.radius;
    c.fillStyle = kind.skin;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = withAlpha("#000000", 0.16);
    c.beginPath();
    c.arc(r * 0.18, r * 0.22, r * 0.82, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = kind.skin;
    c.beginPath();
    c.arc(-r * 0.06, -r * 0.06, r * 0.8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = withAlpha("#ffffff", 0.4);
    c.beginPath();
    c.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
    c.fill();
    if (kind.leaf) {
      c.fillStyle = "#4caf50";
      c.beginPath();
      c.ellipse(r * 0.25, -r * 1.02, r * 0.32, r * 0.13, -0.5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#5a3b22";
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(0, -r * 0.82);
      c.lineTo(r * 0.06, -r * 1.12);
      c.stroke();
    }
  }

  function drawHalf(c: CanvasRenderingContext2D, half: Half) {
    const r = half.kind.radius;
    const from = half.side === 1 ? 0 : Math.PI;
    c.fillStyle = half.kind.skin;
    c.beginPath();
    c.arc(0, 0, r, from, from + Math.PI);
    c.closePath();
    c.fill();
    c.fillStyle = half.kind.flesh;
    c.beginPath();
    c.arc(0, 0, r * 0.84, from, from + Math.PI);
    c.closePath();
    c.fill();
    // A lighter rim along the fresh cut.
    c.strokeStyle = withAlpha("#ffffff", 0.45);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-r * 0.84, 0);
    c.lineTo(r * 0.84, 0);
    c.stroke();
  }

  function drawBomb(c: CanvasRenderingContext2D, now: number, effects: MotionLevel) {
    const r = BOMB_RADIUS;
    if (effects !== "off") {
      c.fillStyle = withAlpha("#ff3b3b", 0.22 + Math.sin(now / 120) * 0.08);
      c.beginPath();
      c.arc(0, 0, r + 9, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#231c2b";
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#ff4d4d";
    c.lineWidth = 3;
    c.stroke();
    // A clear warning cross on the casing.
    c.strokeStyle = "#ff6b6b";
    c.lineWidth = 5;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(-9, -9);
    c.lineTo(9, 9);
    c.moveTo(9, -9);
    c.lineTo(-9, 9);
    c.stroke();
    c.fillStyle = "#5b4e66";
    c.fillRect(-6, -r - 6, 12, 8);
    c.strokeStyle = "#c9b48a";
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(0, -r - 6);
    c.quadraticCurveTo(8, -r - 18, 14, -r - 14);
    c.stroke();
    c.fillStyle = Math.floor(now / 90) % 2 ? "#ffd166" : colors.accent2;
    c.beginPath();
    c.arc(14, -r - 14, 4.5, 0, Math.PI * 2);
    c.fill();
  }

  /** The blade: a smooth ribbon that tapers toward its tail and fades within a fraction of a second. */
  function drawTrail(c: CanvasRenderingContext2D, now: number) {
    trail = trail.filter((point) => now - point.t < TRAIL_MS);
    const n = trail.length;
    if (n < 2) return;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i < n; i += 1) {
      const a = trail[Math.max(0, i - 1)];
      const b = trail[Math.min(n - 1, i + 1)];
      let nx = -(b.y - a.y);
      let ny = b.x - a.x;
      const length = Math.hypot(nx, ny) || 1;
      nx /= length;
      ny /= length;
      const fade = 1 - (now - trail[i].t) / TRAIL_MS;
      const w = 0.6 + 5.5 * fade * (i / (n - 1));
      left.push([trail[i].x + nx * w, trail[i].y + ny * w]);
      right.push([trail[i].x - nx * w, trail[i].y - ny * w]);
    }
    c.fillStyle = withAlpha(colors.accent2, 0.5);
    c.beginPath();
    c.moveTo(left[0][0], left[0][1]);
    for (let i = 1; i < n; i += 1) c.lineTo(left[i][0], left[i][1]);
    for (let i = n - 1; i >= 0; i -= 1) c.lineTo(right[i][0], right[i][1]);
    c.closePath();
    c.fill();
    // A bright core, smoothed through the midpoints of the samples.
    c.strokeStyle = withAlpha("#ffffff", 0.9);
    c.lineWidth = 1.6;
    c.lineCap = "round";
    c.lineJoin = "round";
    c.beginPath();
    c.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < n - 1; i += 1) {
      c.quadraticCurveTo(trail[i].x, trail[i].y, (trail[i].x + trail[i + 1].x) / 2, (trail[i].y + trail[i + 1].y) / 2);
    }
    c.lineTo(trail[n - 1].x, trail[n - 1].y);
    c.stroke();
  }

  function draw(alpha: number) {
    if (!ctx) return;
    drawAlpha = phase === "playing" || phase === "over" ? alpha : 1;
    const a = drawAlpha;
    const effects = hooks.live().effects;
    const now = performance.now();
    const { width: cw, height: ch, dpr } = size;
    const view = fitWorld(size, width, HEIGHT);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, cw, ch);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath();
    ctx.rect(0, 0, width, HEIGHT);
    ctx.clip();

    const bg = ctx.createRadialGradient(width / 2, HEIGHT * 0.45, 40, width / 2, HEIGHT * 0.5, Math.max(width, HEIGHT) * 0.75);
    bg.addColorStop(0, mix(colors.surface, colors.accent, colors.dark ? 0.14 : 0.08));
    bg.addColorStop(1, mix(colors.background, colors.surface, 0.5));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, HEIGHT);
    // Faint wooden-board grain.
    ctx.strokeStyle = withAlpha(colors.foreground, 0.035);
    ctx.lineWidth = 2;
    for (let y = 40; y < HEIGHT; y += 70) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(width * 0.3, y + 10, width * 0.6, y - 10, width, y + 4);
      ctx.stroke();
    }

    // Juice on the board, faint and short-lived so it never hides what's flying.
    for (const s of splats) {
      ctx.fillStyle = withAlpha(s.color, 0.16 * s.life);
      for (const blob of s.blobs) {
        ctx.beginPath();
        ctx.arc(s.x + blob.dx, s.y + blob.dy, blob.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const half of halves) {
      ctx.save();
      ctx.translate(half.px + (half.x - half.px) * a, half.py + (half.y - half.py) * a);
      ctx.rotate(half.pangle + (half.angle - half.pangle) * a);
      drawHalf(ctx, half);
      ctx.restore();
    }

    for (const p of particles) {
      ctx.fillStyle = withAlpha(p.color, Math.max(0, p.life) * 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * Math.max(0.2, p.life), 0, Math.PI * 2);
      ctx.fill();
    }

    // Whole fruit and bombs above every effect, so hazards stay readable.
    for (const flyer of flyers) {
      const { x, y } = drawn(flyer);
      ctx.save();
      ctx.translate(x, y);
      if (flyer.kind) {
        ctx.rotate(flyer.pangle + (flyer.angle - flyer.pangle) * a);
        drawFruit(ctx, flyer.kind);
      } else {
        drawBomb(ctx, now, effects);
      }
      ctx.restore();
    }

    drawTrail(ctx, now);

    ctx.textAlign = "center";
    for (const popup of popups) {
      ctx.font = `700 ${popup.size}px ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = withAlpha(popup.color, Math.min(1, popup.life * 1.6));
      ctx.fillText(popup.text, popup.x, popup.y - (effects === "off" ? 0 : (1 - popup.life) * 26));
    }

    const r = rules();
    if (r.misses) {
      for (let i = 0; i < MAX_MISSES; i += 1) {
        const x = width - 28 - (MAX_MISSES - 1 - i) * 30;
        ctx.strokeStyle = i < misses ? "#ff5a5a" : withAlpha(colors.foreground, 0.22);
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - 9, 20);
        ctx.lineTo(x + 9, 38);
        ctx.moveTo(x + 9, 20);
        ctx.lineTo(x - 9, 38);
        ctx.stroke();
      }
    } else if (r.duration !== null) {
      // Time left as a slim bar along the top edge; it warms up in the last ten seconds.
      const left = Math.max(0, 1 - time / r.duration);
      ctx.fillStyle = withAlpha(colors.foreground, 0.12);
      ctx.fillRect(16, 12, width - 32, 5);
      ctx.fillStyle = r.duration - time < 10_000 ? colors.accent2 : colors.accent;
      ctx.fillRect(16, 12, (width - 32) * left, 5);
    }

    const fade = Math.max(0, 1 - (now - flashAt) / 380);
    if (fade > 0 && effects !== "off") {
      ctx.fillStyle = withAlpha(flashColor, fade * flashStrength);
      ctx.fillRect(0, 0, width, HEIGHT);
    }
    ctx.restore();
  }

  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    width = Math.min(1000, Math.max(400, (next.width / next.height) * HEIGHT));
    draw(drawAlpha);
  });
  reset();
  const stopLoop = startLoop(step, draw);

  return {
    get score() {
      return score;
    },
    get phase() {
      return phase;
    },
    get variant() {
      return variantOf(mode, runDate);
    },
    get metrics() {
      return { fruitsSliced, maxCombo };
    },
    /** Client coordinates → world coordinates. */
    toWorld(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const view = fitWorld(size, width, HEIGHT);
      return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
    },
    /** The blade touches down: a new stroke starts (and a waiting round begins). */
    press(point: { x: number; y: number }) {
      if (phase === "ready") start();
      endStroke();
      const now = performance.now();
      stroke = { count: 0, lastMove: now, x: point.x, y: point.y };
      lastSample = { t: now, ...point };
      trail = [{ ...point, t: now }];
    },
    /**
     * One swipe segment between two pointer samples. Everything the segment crosses is cut, in the
     * order the blade reaches it, against the positions on screen; a cut item is gone, so it can't
     * be hit twice.
     */
    swipe(from: { x: number; y: number }, to: { x: number; y: number }) {
      const now = performance.now();
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length2 = dx * dx + dy * dy;
      if (length2 < 1) return;
      trail.push({ ...to, t: now });
      if (trail.length > 48) trail.shift();
      if (phase !== "playing") return;
      if (now - stroke.lastMove > STROKE_REST_MS) endStroke();
      stroke.lastMove = now;
      const speed = Math.hypot(to.x - lastSample.x, to.y - lastSample.y) / Math.max(1, now - lastSample.t);
      lastSample = { t: now, ...to };
      if (speed > 1.4 && now - lastSwoosh > 280 && hooks.live().effects !== "off") {
        lastSwoosh = now;
        hooks.live().play("swoosh", random(0.9, 1.1));
      }
      const angle = Math.atan2(dy, dx);
      const hits: { flyer: Flyer; t: number }[] = [];
      for (const flyer of flyers) {
        const c = drawn(flyer);
        const reach = flyer.kind ? flyer.kind.radius + HIT_SLOP : BOMB_RADIUS;
        const t = Math.max(0, Math.min(1, ((c.x - from.x) * dx + (c.y - from.y) * dy) / length2));
        const ex = from.x + dx * t - c.x;
        const ey = from.y + dy * t - c.y;
        if (ex * ex + ey * ey <= reach * reach) hits.push({ flyer, t });
      }
      hits.sort((p, q) => p.t - q.t);
      for (const { flyer } of hits) {
        if (phase !== "playing") break;
        cut(flyer, angle);
      }
    },
    /** The blade lifts: the stroke is over. */
    release() {
      endStroke();
    },
    pause() {
      if (phase !== "playing") return;
      endStroke();
      trail = [];
      setPhase("paused");
    },
    resume() {
      if (phase !== "paused") return;
      // A combo can't straddle a pause.
      stroke = { ...stroke, count: 0, lastMove: performance.now() };
      setPhase("playing");
    },
    begin() {
      if (phase === "ready") start();
    },
    /** A fresh round, never straight from the input that ended the last one. */
    restart() {
      if (phase === "over" && performance.now() - overAt < RESTART_LOCK_MS) return;
      if (phase !== "over" && phase !== "ready") return;
      reset();
      start();
    },
    /** Classic, Arcade, Zen or the daily run; only between rounds. */
    setMode(next: Mode) {
      if (phase !== "ready" && phase !== "over") return;
      mode = next;
      reset();
      setPhase("ready");
    },
    destroy() {
      stopLoop();
      stopResize();
    },
  };
}

type FruitGame = ReturnType<typeof createFruit>;

const isActive = (phase: Phase) => phase === "playing" || phase === "paused";

export default function GameFruit({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects } = useArcade();
  const { records, submit } = useRecords("fruit-slice", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FruitGame | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const live = useRef({ play, effects });
  const [phase, setPhase] = useState<Phase>("ready");
  const [mode, setMode] = useState<Mode>("classic");
  const [runDate, setRunDate] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [reason, setReason] = useState<Reason>("misses");
  const today = useDailyDate();
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("fruit-slice");

  useGameAchievementTracking("fruit-slice", phase);

  useEffect(() => {
    if (phase === "playing") beginRun();
  }, [phase, beginRun]);

  useEffect(() => {
    live.current = { play, effects };
  });

  const finish = useEffectEvent((final: number, why: Reason, sliced: number, combo: number, variant: string) => {
    setReason(why);
    submit(final, { variant });
    finishRun(final, { fruitsSliced: sliced, maxCombo: combo });
    sendAchievementEvent({ type: "run_finished", game: "fruit-slice", fruitsSliced: sliced, maxCombo: Math.min(100, combo), reason: why });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createFruit(canvas, {
      onPhase: setPhase,
      onScore: (next, missed) => {
        setScore(next);
        setMisses(missed);
      },
      onTime: setTimeLeft,
      onStart: setRunDate,
      onOver: (final, why, sliced, combo, variant) => finish(final, why, sliced, combo, variant),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      const metrics = game.metrics;
      submit(game.score, { keepalive: true, variant: game.variant });
      finishRun(game.score, { ...metrics }, { keepalive: true });
      if (game.phase !== "over" && metrics.fruitsSliced > 0) {
        sendAchievementEvent({ type: "run_progress", game: "fruit-slice", fruitsSliced: metrics.fruitsSliced, maxCombo: Math.min(100, metrics.maxCombo) });
      }
      game.destroy();
      gameRef.current = null;
    };
  }, [submit, finishRun]);

  useAway(() => gameRef.current?.pause());

  function togglePause() {
    const game = gameRef.current;
    if (game?.phase === "playing") game.pause();
    else if (game?.phase === "paused") game.resume();
    canvasRef.current?.focus({ preventScroll: true });
  }

  function restart() {
    gameRef.current?.restart();
    canvasRef.current?.focus({ preventScroll: true });
  }

  function chooseMode(next: Mode) {
    const game = gameRef.current;
    if (!game || isActive(game.phase)) return;
    game.setMode(next);
    setMode(next);
    setRunDate(null);
    canvasRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === " " || event.key === "Enter") {
      if (event.repeat) return true;
      if (game.phase === "over" || game.phase === "ready") restart();
      else togglePause();
      return true;
    }
    if ((event.key === "p" || event.key === "P" || event.key === "Escape") && isActive(game.phase)) {
      if (!event.repeat) togglePause();
      return true;
    }
    return false;
  });

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const game = gameRef.current;
    if (!game || event.button !== 0 || game.phase === "paused" || game.phase === "over") return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasRef.current?.focus({ preventScroll: true });
    const point = game.toWorld(event.clientX, event.clientY);
    pointer.current = { id: event.pointerId, ...point };
    game.press(point);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const game = gameRef.current;
    const last = pointer.current;
    if (!game || !last || last.id !== event.pointerId) return;
    event.preventDefault();
    // Every sample since the last event, so a fast swipe is one continuous path.
    const samples = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [];
    let from = { x: last.x, y: last.y };
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      const to = game.toWorld(sample.clientX, sample.clientY);
      game.swipe(from, to);
      from = to;
    }
    pointer.current = { id: event.pointerId, ...from };
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current?.id !== event.pointerId) return;
    pointer.current = null;
    gameRef.current?.release();
  }

  const rules = RULES[mode];
  const shownDate = phase !== "ready" && runDate ? runDate : today;
  const daily = mode === "daily";
  const variant = daily ? dailyVariant(shownDate) : variantOf(mode, null);
  const best = records[variant] ?? 0;
  const shownBest = Math.max(best, score);
  const active = isActive(phase);
  const overTitle = reason === "bomb" ? "Boom! You hit a bomb" : reason === "misses" ? `${MAX_MISSES} fruit missed` : "Time's up!";

  return (
    <GameShell
      game="fruit-slice"
      title="Fruit Slice"
      active={active}
      stats={
        <>
          <Stat label="Score" value={score} />
          <Stat label={daily ? (shownDate === today ? "Today's best" : "Daily best") : `${rules.label} best`} value={shownBest} highlight={score > 0 && score >= best} />
          {rules.misses ? (
            <Stat label="Missed" value={`${misses} / ${MAX_MISSES}`} className={misses === MAX_MISSES - 1 ? "border-destructive/50" : undefined} />
          ) : (
            <Stat label="Time" value={formatDuration(timeLeft ?? 0)} className={timeLeft !== null && timeLeft <= 10 && active ? "border-destructive/50" : undefined} />
          )}
          <div role="group" aria-label="Mode" className="ml-auto flex flex-wrap items-center gap-1 self-center">
            {(Object.keys(RULES) as Mode[]).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={mode === id ? "default" : "outline"}
                className="h-8 px-2.5"
                aria-pressed={mode === id}
                title={active ? "Finish or end this round to switch" : RULES[id].title}
                disabled={active}
                onClick={() => chooseMode(id)}
              >
                {RULES[id].label}
              </Button>
            ))}
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
      help={`Press and drag (mouse or finger) through fruit to slice it. A stroke lasts until you lift or hold still for a moment; 3 or more fruit in one stroke pays a combo bonus. Classic: 3 misses or a bomb ends the round. Arcade and Daily: 60 seconds, bombs cost ${BOMB_PENALTY} points. Zen: 90 seconds, no bombs. P pauses.`}
    >
      {daily ? (
        <p className="mb-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Daily run · {formatDailyDate(shownDate)}</span>
          <span>Arcade rules, the same fruit and bombs for everyone; retry as often as you like.</span>
          {shownDate === today ? <DailyCountdown /> : <span>This run still counts for {formatDailyDate(shownDate)}.</span>}
        </p>
      ) : null}
      <div className="arcade-stage overscroll-contain [--stage-ratio:0.8] md:[--stage-ratio:1.6]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Fruit Slice playfield (${rules.label}), score ${score}${rules.misses ? `, ${misses} of ${MAX_MISSES} fruit missed` : `, ${timeLeft ?? 0} seconds left`}.`}
          className="absolute inset-0 size-full cursor-crosshair touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(event) => event.preventDefault()}
        />
        {phase === "ready" ? (
          <GameOverlay tone="quiet" title={daily ? "Today's run" : "Swipe to start"} actions={<Button size="sm" onClick={() => gameRef.current?.begin()}>Start</Button>}>
            {mode === "classic"
              ? `Slice fruit before it falls. Missing ${MAX_MISSES} fruit ends the round; slicing a bomb ends it at once.`
              : mode === "zen"
                ? "90 seconds of fruit and nothing else. No bombs, no misses."
                : `60 seconds to score. A bomb doesn't end the round, but costs ${BOMB_PENALTY} points.`}
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
            Score {score}
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title={overTitle} actions={<Button size="sm" onClick={restart}>{daily ? "Retry run" : "Play again"}</Button>}>
            Score {score}
            {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest}`}
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
