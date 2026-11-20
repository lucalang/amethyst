"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { observeCanvas, startLoop, toRgb, withAlpha, type CanvasSize } from "./engine";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { useCompetitionLock } from "./competition";
import { focusQuietly, GameOverlay, GameShell, Stat, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import type { SoundName } from "./sound";
import { ARENA, WIN_SHARE, createArena, seededRandom, share, stepArena, type Arena, type DeathReason, type Racer } from "./paper-trails/arena";
import {
  botSkins,
  drawArena,
  drawCaptureFlash,
  drawLabel,
  drawLands,
  drawPiece,
  drawScraps,
  drawTrail,
  landColor,
  maskPath,
  paperTrailsTheme,
  scrapBurst,
  stepScraps,
  territoryPath,
  type Land,
  type PaperTrailsTheme,
  type PieceSkin,
  type Scrap,
} from "./paper-trails/look";
import "./minigames.css";

/**
 * Paper Trails: claim the arena by leaving your land, drawing a trail and closing the loop back home.
 * Every rule (captures, collisions, the wall) lives in ./paper-trails/arena.ts; this file draws, follows your
 * piece with the camera and turns keys, mouse and touch into a heading.
 */

type Phase = "ready" | "playing" | "paused" | "over";
export type PaperTrailsResult = { won: boolean; reason: string; share: number; peak: number; kills: number; seconds: number; score: number };
type Hud = { share: number; peak: number; kills: number; rank: number; score: number };

const KILL_POINTS = 500;
const WIN_POINTS = 2500;

/** Peak land in hundredths of a percent, plus 500 per opponent eliminated and 2,500 for winning. */
export const paperTrailsScore = (peak: number, kills: number, won: boolean) => Math.round(peak * 10_000) + kills * KILL_POINTS + (won ? WIN_POINTS : 0);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

type Hooks = {
  onPhase: (phase: Phase) => void;
  onHud: (hud: Hud) => void;
  onStart: () => void;
  onOver: (result: PaperTrailsResult) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel; theme: PaperTrailsTheme; seed: string | null };
};

function deathText(reason: DeathReason, by: Racer | undefined) {
  const who = by && by.id !== 0 ? `${by.name} (CPU)` : "An opponent";
  switch (reason) {
    case "cut":
      return `${who} crossed your trail.`;
    case "self":
      return "You crossed your own trail.";
    case "head":
      return `Head-on crash with ${who} outside your land.`;
    case "erased":
      return `${who} captured all of your land.`;
  }
}

function createPaperTrails(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let arena: Arena = createArena(Math.random);
  let paths = new Map<number, { path: Path2D; life: number }>();
  let flashes: { path: Path2D; age: number }[] = [];
  let scraps: Scrap[] = [];
  let skins: PieceSkin[] = [];
  let skinKey = "";
  let runTime = 0;
  let peak = 0;
  let won = false;
  let result: PaperTrailsResult | null = null;
  let lastHud = "";
  const cam = { x: ARENA / 2, y: ARENA / 2, zoom: 1, ready: false };
  let lastFrame = performance.now();
  let minimap: HTMLCanvasElement | null = null;
  let minimapStale = true;
  let threatened = 0;

  const you = () => arena.racers[0];

  function skinOf(r: Racer) {
    const theme = hooks.live().theme;
    if (theme.key !== skinKey) {
      skinKey = theme.key;
      const bots = botSkins(theme.skin);
      skins = arena.racers.map((racer, i) => (i === 0 ? theme.skin : bots[(i - 1) % bots.length]));
      minimapStale = true;
    }
    return skins[r.id];
  }

  function setPhase(next: Phase) {
    phase = next;
    hooks.onPhase(next);
  }

  function hud() {
    const r = you();
    const now = share(arena, r);
    const rank = 1 + arena.racers.filter((o) => o.id !== 0 && o.alive && o.land > r.land).length;
    const next: Hud = { share: now, peak, kills: r.kills, rank, score: paperTrailsScore(peak, r.kills, won) };
    const key = `${now.toFixed(3)}|${peak.toFixed(3)}|${next.kills}|${rank}|${next.score}`;
    if (key !== lastHud) {
      lastHud = key;
      hooks.onHud(next);
    }
  }

  function reset() {
    const seed = hooks.live().seed;
    arena = createArena(seed ? seededRandom(`paper-trails:${seed}`) : Math.random);
    paths = new Map();
    flashes = [];
    scraps = [];
    skinKey = "";
    runTime = 0;
    peak = share(arena, you());
    won = false;
    result = null;
    lastHud = "";
    minimapStale = true;
    cam.ready = false;
    hud();
  }

  function begin() {
    if (phase !== "ready") return;
    setPhase("playing");
    hooks.live().play("tap");
    hooks.onStart();
  }

  function finish(win: boolean, reason: string) {
    won = win;
    const r = you();
    result = { won: win, reason, share: share(arena, r), peak, kills: r.kills, seconds: Math.round(runTime), score: paperTrailsScore(peak, r.kills, win) };
    hud();
    setPhase("over");
    hooks.live().play(win ? "win" : "over");
    hooks.onOver(result);
  }

  function handleEvents() {
    const { play, effects } = hooks.live();
    const fx = effects !== "off";
    const many = effects === "full" ? 1 : 0.5;
    for (const event of arena.events) {
      if (event.type === "capture") {
        const owner = arena.racers[event.id];
        const skin = skinOf(owner);
        if (event.id === 0) {
          play("merge", Math.min(1.8, 0.9 + event.cells.length / 300));
          if (fx) {
            const mask = new Uint8Array(arena.size * arena.size);
            for (const c of event.cells) mask[c] = 1;
            flashes.push({ path: maskPath(mask, arena.size, arena.size), age: 0 });
          }
        }
        if (fx && (event.id === 0 || Math.hypot(event.x - you().x, event.y - you().y) < 20)) {
          scraps.push(...scrapBurst(event.x, event.y, [skin.color, skin.light, skin.dark], Math.round(Math.min(28, 6 + event.cells.length / 6) * many), 7));
        }
      } else if (event.type === "eliminated") {
        const victim = arena.racers[event.id];
        const skin = skinOf(victim);
        if (fx) scraps.push(...scrapBurst(event.x, event.y, [skin.dark, skin.color, "#1d1726"], Math.round(18 * many), 6, "blot"));
        paths.delete(event.id);
        if (event.id === 0) {
          const killer = event.by >= 0 && event.by !== 0 ? arena.racers[event.by] : undefined;
          if (phase === "playing") finish(false, deathText(event.reason, killer));
        } else if (event.by === 0 && phase === "playing") {
          play("slice");
        }
      } else if (event.type === "leave" && event.id === 0 && phase === "playing") {
        play("tick", 0.8);
      }
    }
    arena.events = [];
    if (arena.dirty.size) minimapStale = true;
  }

  function step(ms: number) {
    const dt = ms / 1000;
    if (hooks.live().effects !== "off") {
      scraps = stepScraps(scraps, dt);
      for (const flash of flashes) flash.age += dt / 0.7;
      flashes = flashes.filter((flash) => flash.age < 1);
    }
    if (phase === "playing") {
      runTime += dt;
      stepArena(arena, dt);
      handleEvents();
      if (phase !== "playing") return;
      const r = you();
      peak = Math.max(peak, share(arena, r));
      threatened = trailThreat(r);
      if (share(arena, r) >= WIN_SHARE) finish(true, "You claimed half of the arena.");
      else hud();
    } else if (phase === "over" && !won) {
      // The world plays on behind the result.
      stepArena(arena, dt, true);
      handleEvents();
    }
  }

  /** 0–1: how close a rival's head is to your exposed trail (drives the warning edge). */
  function trailThreat(r: Racer) {
    if (!r.trail.length) return 0;
    let closest = Infinity;
    const n = arena.size;
    for (const o of arena.racers) {
      if (!o.alive || o.id === 0) continue;
      for (let i = 0; i < r.trail.length; i += 2) {
        const c = r.trail[i];
        closest = Math.min(closest, Math.hypot((c % n) + 0.5 - o.x, Math.floor(c / n) + 0.5 - o.y));
      }
    }
    return Math.max(0, Math.min(1, (7 - closest) / 5));
  }

  function landsFor(theme: PaperTrailsTheme): Land[] {
    for (const id of arena.dirty) paths.delete(id);
    arena.dirty.clear();
    const lands: Land[] = [];
    // Your land is drawn last, so its outline is never covered.
    for (const r of [...arena.racers.slice(1), arena.racers[0]]) {
      if (!r.alive && r.id !== 0) continue;
      let entry = paths.get(r.id);
      if (!entry || entry.life !== r.life) {
        const path = territoryPath(arena.owner, arena.size, arena.size, r.id);
        if (!path) continue;
        entry = { path, life: r.life };
        paths.set(r.id, entry);
      }
      lands.push({ path: entry.path, skin: skinOf(r), pattern: r.id === 0 ? theme.pattern : "" });
    }
    return lands;
  }

  function scaleFor() {
    const short = Math.min(size.width, size.height);
    const normal = Math.min(32, Math.max(13, short / 22));
    const overview = Math.min(size.width, size.height) / (ARENA + 3);
    return { normal, overview };
  }

  function drawMinimap(theme: PaperTrailsTheme, x: number, y: number, side: number) {
    if (!ctx) return;
    const n = arena.size;
    if (!minimap) {
      minimap = document.createElement("canvas");
      minimap.width = minimap.height = n;
    }
    if (minimapStale) {
      minimapStale = false;
      const g = minimap.getContext("2d");
      if (g) {
        const image = g.createImageData(n, n);
        const paper = toRgb(theme.style.paper);
        const colors = arena.racers.map((r) => toRgb(landColor(theme.style, skinOf(r))));
        for (let c = 0; c < n * n; c += 1) {
          const owner = arena.owner[c];
          const [r, gg, b] = owner >= 0 ? colors[owner] : paper;
          image.data[c * 4] = r;
          image.data[c * 4 + 1] = gg;
          image.data[c * 4 + 2] = b;
          image.data[c * 4 + 3] = 255;
        }
        g.putImageData(image, 0, 0);
      }
    }
    ctx.save();
    ctx.fillStyle = theme.style.label.bg;
    ctx.strokeStyle = withAlpha(theme.style.ink, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - 4, y - 4, side + 8, side + 8, 8);
    ctx.fill();
    ctx.stroke();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(minimap, x, y, side, side);
    const k = side / n;
    for (const r of arena.racers) {
      if (!r.alive) continue;
      const skin = skinOf(r);
      if (r.trail.length) {
        ctx.fillStyle = skin.dark;
        for (const c of r.trail) ctx.fillRect(x + (c % n) * k, y + Math.floor(c / n) * k, Math.max(1, k), Math.max(1, k));
      }
      ctx.fillStyle = r.id === 0 ? theme.style.ink : skin.dark;
      ctx.strokeStyle = r.id === 0 ? "#ffffff" : "transparent";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + r.x * k, y + r.y * k, r.id === 0 ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fill();
      if (r.id === 0) ctx.stroke();
    }
    ctx.restore();
  }

  function drawStandings(theme: PaperTrailsTheme, right: number, top: number, rows: number) {
    if (!ctx) return;
    const ranked = arena.racers.filter((r) => r.alive || r.id === 0).sort((a, b) => b.land - a.land);
    const shown = ranked.slice(0, rows);
    if (!shown.includes(you())) shown[shown.length - 1] = you();
    const width = 132;
    const line = 17;
    const x = right - width;
    ctx.save();
    ctx.fillStyle = theme.style.label.bg;
    ctx.strokeStyle = withAlpha(theme.style.ink, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, top, width, shown.length * line + 10, 8);
    ctx.fill();
    ctx.stroke();
    ctx.font = "600 11.5px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    shown.forEach((r, i) => {
      const y = top + 5 + i * line + line / 2;
      const skin = skinOf(r);
      ctx.fillStyle = skin.color;
      ctx.beginPath();
      ctx.roundRect(x + 7, y - 5, 10, 10, 3);
      ctx.fill();
      ctx.fillStyle = theme.style.label.fg;
      ctx.globalAlpha = r.id === 0 ? 1 : 0.85;
      ctx.font = `${r.id === 0 ? 800 : 600} 11.5px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "left";
      const place = ranked.indexOf(r) + 1;
      ctx.fillText(`${place}. ${r.id === 0 ? "You" : `${r.name}`}`, x + 22, y);
      ctx.textAlign = "right";
      ctx.fillText(percent(share(arena, r)), right - 7, y);
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    const { effects, theme } = hooks.live();
    const animate = effects !== "off";
    const now = performance.now();
    const frame = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const { width, height, dpr } = size;
    const style = theme.style;
    const r = you();
    const scales = scaleFor();
    const overview = phase === "over";
    const targetZoom = overview ? scales.overview : scales.normal;
    const tx = overview ? ARENA / 2 : r.x;
    const ty = overview ? ARENA / 2 : r.y;
    if (!cam.ready) {
      cam.x = tx;
      cam.y = ty;
      cam.zoom = targetZoom;
      cam.ready = true;
    } else {
      const k = animate ? 1 - Math.exp(-frame * (overview ? 2.2 : 9)) : 1;
      cam.x += (tx - cam.x) * k;
      cam.y += (ty - cam.y) * k;
      cam.zoom += (targetZoom - cam.zoom) * k;
    }
    const s = cam.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = style.margin;
    ctx.fillRect(0, 0, width, height);

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (width / 2 - cam.x * s), dpr * (height / 2 - cam.y * s));
    const view = { x0: cam.x - width / 2 / s - 1, y0: cam.y - height / 2 / s - 1, x1: cam.x + width / 2 / s + 1, y1: cam.y + height / 2 / s + 1 };
    drawArena(ctx, style, arena.size, arena.size, view);
    drawLands(ctx, style, landsFor(theme));
    for (const flash of flashes) drawCaptureFlash(ctx, style, flash.path, flash.age);

    const visible = (x: number, y: number, pad: number) => x > view.x0 - pad && x < view.x1 + pad && y > view.y0 - pad && y < view.y1 + pad;
    for (const racer of [...arena.racers.slice(1), arena.racers[0]]) {
      if (!racer.alive || !racer.points.length) continue;
      drawTrail(ctx, style, skinOf(racer), racer.id === 0 ? theme.trail : "", [...racer.points, { x: racer.x, y: racer.y }], now, animate, racer.id * 97 + racer.life * 13);
    }
    if (animate) drawScraps(ctx, style, scraps);
    for (const racer of [...arena.racers.slice(1), arena.racers[0]]) {
      if (!racer.alive || !visible(racer.x, racer.y, 2)) continue;
      drawPiece(ctx, style, skinOf(racer), racer.x, racer.y, racer.angle, now, animate);
    }
    for (const racer of arena.racers) {
      if (!racer.alive || racer.id === 0 || !visible(racer.x, racer.y, 3)) continue;
      drawLabel(ctx, style, skinOf(racer), racer.x, racer.y, racer.name, true);
    }

    // Screen-space HUD: the warning edge, standings and the arena map.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (threatened > 0 && phase === "playing") {
      const pulse = animate ? 0.65 + Math.sin(now / 110) * 0.35 : 1;
      ctx.strokeStyle = withAlpha("#e5484d", 0.55 * threatened * pulse);
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, width, height);
    }
    const compact = width < 420;
    drawStandings(theme, width - 8, 8, compact ? 3 : 5);
    if (!overview) {
      const side = Math.round(Math.min(150, Math.max(64, Math.min(width, height) * 0.22)));
      drawMinimap(theme, width - side - 12, height - side - 12, side);
    }
  }

  reset();
  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    draw();
  });
  const stopLoop = startLoop(step, draw);

  /** Turns the player toward a heading. Keys and pointers all end up here. */
  function steer(angle: number) {
    if (phase === "ready") begin();
    if (phase !== "playing") return;
    you().target = angle;
  }

  return {
    get phase() {
      return phase;
    },
    get score() {
      return paperTrailsScore(peak, you().kills, won);
    },
    get metrics() {
      return { territory: Math.round(peak * 10_000), kills: you().kills, seconds: Math.round(runTime) };
    },
    get result() {
      return result;
    },
    steer,
    /** Steer toward a point on screen (mouse), measured from where your piece is drawn. */
    aimAt(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const px = rect.left + rect.width / 2 + (you().x - cam.x) * cam.zoom;
      const py = rect.top + rect.height / 2 + (you().y - cam.y) * cam.zoom;
      const dx = clientX - px;
      const dy = clientY - py;
      if (Math.hypot(dx, dy) < cam.zoom * 0.8) return;
      steer(Math.atan2(dy, dx));
    },
    press() {
      if (phase === "ready") begin();
      else if (phase === "over") {
        reset();
        setPhase("ready");
        begin();
      }
    },
    pause() {
      if (phase === "playing") setPhase("paused");
    },
    resume() {
      if (phase === "paused") setPhase("playing");
    },
    destroy() {
      stopLoop();
      stopResize();
    },
  };
}

type PaperTrailsGame = ReturnType<typeof createPaperTrails>;
const isActive = (phase: Phase) => phase === "playing" || phase === "paused";

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  w: [0, -1],
  W: [0, -1],
  ArrowDown: [0, 1],
  s: [0, 1],
  S: [0, 1],
  ArrowLeft: [-1, 0],
  a: [-1, 0],
  A: [-1, 0],
  ArrowRight: [1, 0],
  d: [1, 0],
  D: [1, 0],
};

export default function GamePaperTrails({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects, rootRef, look } = useArcade();
  const theme = useMemo(() => paperTrailsTheme(look), [look]);
  const lock = useCompetitionLock("paper-trails");
  const { records, submit } = useRecords("paper-trails", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<PaperTrailsGame | null>(null);
  const live = useRef({ play, effects, theme, seed: lock?.seed ?? null });
  const held = useRef(new Set<string>());
  const touch = useRef<{ x: number; y: number; id: number } | null>(null);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<Hud>({ share: 0, peak: 0, kills: 0, rank: 1, score: 0 });
  const [result, setResult] = useState<PaperTrailsResult | null>(null);
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("paper-trails");

  useGameAchievementTracking("paper-trails", phase);

  useEffect(() => {
    live.current = { play, effects, theme, seed: lock?.seed ?? null };
  });

  const start = useEffectEvent(() => {
    setResult(null);
    beginRun(lock?.board ?? "");
  });
  const finish = useEffectEvent((final: PaperTrailsResult) => {
    setResult(final);
    submit(final.score);
    finishRun(final.score, { territory: Math.round(final.peak * 10_000), kills: final.kills, seconds: final.seconds, won: final.won ? 1 : 0 });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createPaperTrails(canvas, {
      onPhase: setPhase,
      onHud: setHud,
      onStart: () => start(),
      onOver: (final) => finish(final),
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

  useAway(() => {
    held.current.clear();
    gameRef.current?.pause();
  });
  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) gameRef.current?.pause();
    };
    const onKeyUp = (event: KeyboardEvent) => held.current.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key);
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

  function pressAndFocus() {
    gameRef.current?.press();
    canvasRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (ARROWS[event.key]) {
      if (game.phase === "paused") return true;
      held.current.add(event.key.length === 1 ? event.key.toLowerCase() : event.key);
      // Two keys held together steer diagonally.
      let dx = 0;
      let dy = 0;
      for (const key of held.current) {
        const vector = ARROWS[key];
        if (vector) {
          dx += vector[0];
          dy += vector[1];
        }
      }
      if (dx === 0 && dy === 0) [dx, dy] = ARROWS[event.key];
      game.steer(Math.atan2(dy, dx));
      return true;
    }
    if (event.key === " " || event.key === "Enter") {
      if (!event.repeat && (game.phase === "ready" || game.phase === "over")) game.press();
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
    if (game.phase === "paused") return;
    // A tap starts the first run; a finished run restarts only from its button, so its result can't be skipped by accident.
    if (game.phase === "ready") game.press();
    if (event.pointerType === "mouse") {
      game.aimAt(event.clientX, event.clientY);
      return;
    }
    touch.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const game = gameRef.current;
    if (!game) return;
    if (event.pointerType === "mouse") {
      // The mouse steers only while it moves, so arrow keys still work with the pointer resting on the board.
      const last = lastMouse.current;
      if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 4) return;
      lastMouse.current = { x: event.clientX, y: event.clientY };
      if (game.phase === "playing") game.aimAt(event.clientX, event.clientY);
      return;
    }
    // Touch: drag the way you want to go, anywhere on the board (a floating joystick).
    const anchor = touch.current;
    if (!anchor || anchor.id !== event.pointerId) return;
    const dx = event.clientX - anchor.x;
    const dy = event.clientY - anchor.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 10) return;
    game.steer(Math.atan2(dy, dx));
    if (distance > 28) touch.current = { x: event.clientX - (dx / distance) * 28, y: event.clientY - (dy / distance) * 28, id: anchor.id };
  }

  const best = records[""] ?? 0;
  const active = isActive(phase);
  const newBest = result !== null && result.score > 0 && result.score >= best;

  return (
    <GameShell
      game="paper-trails"
      title="Paper Trails"
      active={active}
      leaderboard={lock?.board ?? ""}
      stats={
        <>
          <Stat label="Land" value={percent(hud.share)} highlight={hud.share > 0 && hud.share >= hud.peak && phase === "playing"} />
          <Stat label="Score" value={hud.score.toLocaleString("en")} />
          <Stat label="Best" value={Math.max(best, hud.score).toLocaleString("en")} highlight={hud.score > 0 && hud.score >= best} />
          <Stat label="Rank" value={`#${hud.rank}`} className="hidden sm:flex" />
          <Stat label="Cuts" value={hud.kills} />
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
      <div className="arcade-stage [--stage-ratio:0.8] sm:[--stage-ratio:1.3]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Paper Trails arena. You hold ${percent(hud.share)} of the land, rank ${hud.rank}. Steer with the arrow keys, WASD or the mouse, or drag on touch screens.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (touch.current = null)}
          onPointerCancel={() => (touch.current = null)}
          onContextMenu={(event) => event.preventDefault()}
        />
        {phase === "ready" ? (
          <GameOverlay title="Paper Trails" actions={<Button size="sm" onClick={pressAndFocus}>Start</Button>}>
            Leave your land, draw a trail and loop back home to claim everything inside. Claim {Math.round(WIN_SHARE * 100)}% of the arena to win.
            <span className="mt-1 block text-xs">
              Steer with the arrow keys, WASD or the mouse; on touch, drag the way you want to go. Cross a rival’s trail to knock them out, but if anyone crosses yours, your run ends. The edge is
              safe to slide along. Rivals are computer-controlled.
            </span>
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} ref={focusQuietly}>Resume</Button>}>
            Land {percent(hud.share)} · score {hud.score.toLocaleString("en")}
          </GameOverlay>
        ) : phase === "over" && result ? (
          <GameOverlay title={result.won ? "Half the arena is yours!" : "Run over"} actions={<Button size="sm" onClick={pressAndFocus}>Play again</Button>}>
            {result.reason}
            <span className="mt-1 block">
              Peak land {percent(result.peak)} · {result.kills} {result.kills === 1 ? "rival" : "rivals"} cut
            </span>
            <span className="block font-semibold text-foreground">
              Score {result.score.toLocaleString("en")}
              {newBest ? " · new best!" : ` · best ${Math.max(best, result.score).toLocaleString("en")}`}
            </span>
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
