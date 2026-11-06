"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent } from "react";
import { Heart, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { fitWorld, observeCanvas, startLoop, swipeDirection, withAlpha, type CanvasSize } from "./engine";
import { GAME_PALETTES } from "./palettes";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { focusQuietly, GameOverlay, GameShell, Stat, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords, keyDirection } from "./game-shell";
import type { SoundName } from "./sound";
import { drawGemBody, drawGlimmer, drawShadeBody, drawSpark, gemChaseTheme, paintMaze, type GemChaseTheme, type SparkShape } from "./gem-chase-look";
import "./minigames.css";

/**
 * Gem Chase: guide the Gem through a crystal maze, collecting every glimmer while four shades
 * hunt it. Prisms make the shades flee for a few seconds, and catching them then scores big.
 * Mazes are original; each one is written as its left half and mirrored.
 * Legend: # wall, (space) outside, . glimmer, o prism, _ open floor, - shade door, H shade house, P start.
 */
const MAZE_HALVES = [
  [
    "##########",
    "#........#",
    "#o##.###.#",
    "#.........",
    "#.##.#.###",
    "#....#...#",
    "####.###_#",
    "   #.#____",
    "   #.#_##-",
    "____.__#HH",
    "   #.#_###",
    "   #.#____",
    "####.#_###",
    "#........#",
    "#.##.###.#",
    "#o.#.....P",
    "##.#.#.###",
    "#....#...#",
    "#.######.#",
    "#.........",
    "##########",
  ],
  [
    "##########",
    "#.....#...",
    "#o###.#.##",
    "#.........",
    "#.#.###.##",
    "#.#...#...",
    "####.###_#",
    "   #.#____",
    "   #.#_##-",
    "____.__#HH",
    "   #.#_###",
    "   #.#____",
    "####.#_###",
    "#........#",
    "#.#.##.#.#",
    "#o#...#..P",
    "#.#.#.#.##",
    "#...#.....",
    "#.###.###.",
    "#.........",
    "##########",
  ],
];
const MAZES = MAZE_HALVES.map((rows) => rows.map((half) => half + [...half.slice(0, 9)].reverse().join("")));
const COLS = 19;
const ROWS = 21;
const TILE = 24;
const HUD = 34;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE + HUD;
const DOOR = { x: 9, y: 8 };
const EXIT = { x: 9, y: 7 };
const HOME = { x: 9, y: 9 };
const SHADE_STARTS = [EXIT, { x: 8, y: 9 }, { x: 9, y: 9 }, { x: 10, y: 9 }];
const SHADE_NAMES = ["Ember", "Frost", "Moss", "Dusk"];
const CORNERS = [
  { x: COLS - 2, y: -2 },
  { x: 1, y: -2 },
  { x: COLS - 1, y: ROWS + 1 },
  { x: 0, y: ROWS + 1 },
];
/** Scatter/chase rhythm in seconds; the last phase lasts forever. */
const SCHEDULE = [7, 20, 7, 20, 5];
const EXTRA_LIFE = 10_000;

type Dir = "up" | "down" | "left" | "right";
const VEC: Record<Dir, { x: number; y: number }> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
const DIRS: Dir[] = ["up", "left", "down", "right"];

type Phase = "ready" | "starting" | "playing" | "paused" | "dying" | "cleared" | "over";
type ShadeMode = "house" | "leaving" | "active" | "eyes";
type Mover = { x: number; y: number; dir: Dir | null; progress: number };
type Shade = Mover & { id: number; mode: ShadeMode; releaseAt: number; frightened: boolean; bob: number };
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: string; shape: SparkShape; spin: number };
const MAX_SPARKS = 240;

type Hooks = {
  onPhase: (phase: Phase) => void;
  onHud: (hud: { score: number; lives: number; level: number }) => void;
  onOver: (score: number, metrics: { level: number; glimmers: number; shades: number }) => void;
  onStart: () => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel; theme: GemChaseTheme };
};

const wrapX = (x: number) => (x + COLS) % COLS;

function createGemChase(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const colors = GAME_PALETTES["gem-chase"];
  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let grid: string[][] = [];
  let pellets = 0;
  let score = 0;
  let lives = 3;
  let level = 1;
  let extraGiven = false;
  let glimmers = 0;
  let shadesEaten = 0;
  let timer = 0;
  let modeTime = 0;
  let modeIndex = 0;
  let frightLeft = 0;
  let frightChain = 0;
  let levelTime = 0;
  let chompPitch = false;
  let wanted: Dir | null = null;
  let player: Mover = { x: 9, y: 15, dir: null, progress: 0 };
  let shades: Shade[] = [];
  let popups: { x: number; y: number; text: string; age: number }[] = [];
  let sparks: Spark[] = [];
  let trailTime = 0;
  let flash = 0;
  let frightTotal = 1;
  let wallCache: Record<string, HTMLCanvasElement> = {};

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const hud = () => hooks.onHud({ score, lives, level });
  const tile = (x: number, y: number) => (y < 0 || y >= ROWS ? " " : (grid[y]?.[wrapX(x)] ?? " "));
  const solid = (c: string) => c === "#" || c === " ";

  /** `collect` bursts wear the equipped collection effect. */
  function burst(x: number, y: number, color: string, count: number, speed: number, life = 0.5, collect = false) {
    const { effects, theme } = hooks.live();
    if (effects === "off") return;
    const n = effects === "subtle" ? Math.ceil(count / 2) : count;
    const shape = collect ? theme.collect.shape : "square";
    const palette = collect ? theme.collect.colors : null;
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      const tint = palette ? palette[Math.floor(Math.random() * palette.length)] : color;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: life * (0.6 + Math.random() * 0.4), size: 1.5 + Math.random() * 1.5, color: tint, shape, spin: a });
    }
    if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
  }

  function playerCan(x: number, y: number, dir: Dir) {
    const c = tile(x + VEC[dir].x, y + VEC[dir].y);
    return !solid(c) && c !== "-" && c !== "H";
  }

  function shadeCan(shade: Shade, dir: Dir) {
    const c = tile(shade.x + VEC[dir].x, shade.y + VEC[dir].y);
    if (solid(c)) return false;
    if (c === "-" || c === "H") return shade.mode === "leaving" || shade.mode === "eyes" || shade.mode === "house";
    return true;
  }

  function loadMaze() {
    const maze = MAZES[(level - 1) % MAZES.length];
    grid = maze.map((row) => [...row]);
    wallCache = {};
    // Only glimmers the Gem can reach count, so every board can be cleared.
    let start = { x: 9, y: 15 };
    grid.forEach((row, y) => row.forEach((c, x) => c === "P" && (start = { x, y })));
    const seen = new Set([`${start.x},${start.y}`]);
    const queue = [start];
    while (queue.length) {
      const at = queue.pop()!;
      for (const dir of DIRS) {
        if (!playerCan(at.x, at.y, dir)) continue;
        const next = { x: wrapX(at.x + VEC[dir].x), y: at.y + VEC[dir].y };
        const key = `${next.x},${next.y}`;
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(next);
        }
      }
    }
    pellets = 0;
    grid.forEach((row, y) =>
      row.forEach((c, x) => {
        if ((c === "." || c === "o") && !seen.has(`${x},${y}`)) row[x] = "_";
        else if (c === "." || c === "o") pellets += 1;
      }),
    );
  }

  function placeActors() {
    let start = { x: 9, y: 15 };
    grid.forEach((row, y) => row.forEach((c, x) => c === "P" && (start = { x, y })));
    player = { ...start, dir: playerCan(start.x, start.y, "left") ? "left" : null, progress: 0 };
    wanted = null;
    const release = Math.max(0.4, 1 - (level - 1) * 0.15);
    shades = SHADE_STARTS.map((at, id) => ({
      ...at,
      id,
      dir: id === 0 ? "left" : null,
      progress: 0,
      mode: id === 0 ? "active" : "house",
      releaseAt: [0, 2, 5, 9][id] * release,
      frightened: false,
      bob: id,
    }));
    timer = 0;
    modeTime = 0;
    modeIndex = 0;
    frightLeft = 0;
    popups = [];
    sparks = [];
    flash = 0;
  }

  function reset() {
    score = 0;
    lives = 3;
    level = 1;
    extraGiven = false;
    glimmers = 0;
    shadesEaten = 0;
    levelTime = 0;
    loadMaze();
    placeActors();
    hud();
    setPhase("ready");
  }

  function begin() {
    hooks.onStart();
    timer = 0;
    setPhase("starting");
  }

  const speed = {
    player: () => Math.min(9, 7.5 + (level - 1) * 0.3),
    shade: () => Math.min(9.4, 6.8 + (level - 1) * 0.45),
  };

  function addScore(points: number) {
    score += points;
    if (!extraGiven && score >= EXTRA_LIFE) {
      extraGiven = true;
      lives += 1;
      hooks.live().play("power", 1.2);
    }
    hud();
  }

  function targetOf(shade: Shade): { x: number; y: number } {
    if (shade.mode === "eyes") return shade.y < DOOR.y ? DOOR : HOME;
    if (shade.mode === "leaving") return shade.y > DOOR.y ? DOOR : EXIT;
    const scatter = modeIndex % 2 === 0 && modeIndex < SCHEDULE.length;
    if (scatter) return CORNERS[shade.id];
    const facing = VEC[player.dir ?? "left"];
    switch (shade.id) {
      case 0:
        return player;
      case 1:
        return { x: player.x + facing.x * 4, y: player.y + facing.y * 4 };
      case 2:
        return Math.hypot(shade.x - player.x, shade.y - player.y) > 8 ? player : CORNERS[2];
      default: {
        const lead = { x: player.x + facing.x * 2, y: player.y + facing.y * 2 };
        return { x: lead.x * 2 - shades[0].x, y: lead.y * 2 - shades[0].y };
      }
    }
  }

  function chooseShadeDir(shade: Shade) {
    const options = DIRS.filter((dir) => shadeCan(shade, dir) && (shade.dir === null || dir !== OPPOSITE[shade.dir]));
    const list = options.length ? options : DIRS.filter((dir) => shadeCan(shade, dir));
    if (list.length === 0) return null;
    if (shade.frightened && shade.mode === "active") return list[Math.floor(Math.random() * list.length)];
    const target = targetOf(shade);
    let best = list[0];
    let bestDistance = Infinity;
    for (const dir of list) {
      const d = Math.hypot(shade.x + VEC[dir].x - target.x, shade.y + VEC[dir].y - target.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = dir;
      }
    }
    return best;
  }

  function stepPlayer(dt: number) {
    if (wanted && player.dir && wanted === OPPOSITE[player.dir] && player.progress > 0) {
      // Turning around mid-corridor is always allowed.
      player.x = wrapX(player.x + VEC[player.dir].x);
      player.y += VEC[player.dir].y;
      player.progress = 1 - player.progress;
      player.dir = wanted;
    }
    if (player.progress === 0) {
      if (wanted && playerCan(player.x, player.y, wanted)) player.dir = wanted;
      else if (player.dir && !playerCan(player.x, player.y, player.dir)) player.dir = null;
    }
    if (!player.dir) return;
    player.progress += speed.player() * dt;
    while (player.progress >= 1 && player.dir) {
      player.progress -= 1;
      player.x = wrapX(player.x + VEC[player.dir].x);
      player.y += VEC[player.dir].y;
      eat();
      if (wanted && playerCan(player.x, player.y, wanted)) player.dir = wanted;
      else if (!playerCan(player.x, player.y, player.dir)) {
        player.dir = null;
        player.progress = 0;
      }
    }
  }

  function eat() {
    const c = grid[player.y][player.x];
    if (c === ".") {
      grid[player.y][player.x] = "_";
      pellets -= 1;
      glimmers += 1;
      chompPitch = !chompPitch;
      hooks.live().play("chomp", chompPitch ? 1 : 1.25);
      burst(player.x * TILE + TILE / 2, player.y * TILE + TILE / 2, hooks.live().theme.maze.glimmer, 4, 60, 0.3, true);
      addScore(10);
    } else if (c === "o") {
      grid[player.y][player.x] = "_";
      pellets -= 1;
      addScore(50);
      hooks.live().play("power");
      frightLeft = Math.max(2, 7 - (level - 1) * 0.8);
      frightTotal = frightLeft;
      frightChain = 0;
      flash = hooks.live().effects === "off" ? 0 : 1;
      burst(player.x * TILE + TILE / 2, player.y * TILE + TILE / 2, colors.foreground, 18, 140, 0.6, true);
      for (const shade of shades) {
        if (shade.mode === "eyes") continue;
        shade.frightened = true;
        if (shade.mode === "active" && shade.dir) shade.dir = OPPOSITE[shade.dir];
      }
    }
    if (pellets === 0) {
      addScore(250 * level);
      hooks.live().play("win");
      timer = 0;
      setPhase("cleared");
    }
  }

  function stepShade(shade: Shade, dt: number) {
    if (shade.mode === "house") {
      shade.bob += dt * 4;
      if (levelTime >= shade.releaseAt) {
        shade.mode = "leaving";
        shade.dir = null;
      }
      return;
    }
    const tunnel = shade.y === 9 && (shade.x < 4 || shade.x > COLS - 5);
    const rate =
      shade.mode === "eyes" ? 14 : shade.mode === "leaving" ? 4 : tunnel ? 4 : shade.frightened ? 4.6 : speed.shade();
    if (shade.dir === null) shade.dir = chooseShadeDir(shade);
    if (!shade.dir) return;
    shade.progress += rate * dt;
    while (shade.progress >= 1 && shade.dir) {
      shade.progress -= 1;
      shade.x = wrapX(shade.x + VEC[shade.dir].x);
      shade.y += VEC[shade.dir].y;
      if (shade.mode === "leaving" && shade.x === EXIT.x && shade.y === EXIT.y) {
        shade.mode = "active";
        shade.dir = "left";
      } else if (shade.mode === "eyes" && shade.x === HOME.x && shade.y === HOME.y) {
        shade.mode = "leaving";
        shade.frightened = false;
      }
      shade.dir = chooseShadeDir(shade);
    }
  }

  const posOf = (m: Mover) => ({ x: m.x + (m.dir ? VEC[m.dir].x * m.progress : 0), y: m.y + (m.dir ? VEC[m.dir].y * m.progress : 0) });

  function collide() {
    const p = posOf(player);
    for (const shade of shades) {
      if (shade.mode !== "active") continue;
      const s = posOf(shade);
      let dx = Math.abs(p.x - s.x);
      if (dx > COLS / 2) dx = COLS - dx;
      if (dx + Math.abs(p.y - s.y) > 0.62) continue;
      if (shade.frightened) {
        frightChain += 1;
        shadesEaten += 1;
        const points = 200 * 2 ** (frightChain - 1);
        addScore(points);
        popups.push({ x: s.x, y: s.y, text: String(points), age: 0 });
        burst(s.x * TILE + TILE / 2, s.y * TILE + TILE / 2, "#7f9bff", 16, 120, 0.55, true);
        shade.mode = "eyes";
        shade.frightened = false;
        hooks.live().play("combo", 1 + frightChain * 0.1);
      } else {
        hooks.live().play("hit");
        burst(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, hooks.live().theme.gem.glow, 24, 110, 1);
        timer = 0;
        setPhase("dying");
        return;
      }
    }
  }

  function step(ms: number) {
    const dt = ms / 1000;
    for (const popup of popups) popup.age += dt;
    popups = popups.filter((popup) => popup.age < 1);
    if (phase !== "paused") {
      for (const s of sparks) {
        s.age += dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.92;
        s.vy *= 0.92;
      }
      sparks = sparks.filter((s) => s.age < s.life);
      flash = Math.max(0, flash - dt * 3);
    }
    if (phase === "ready" || phase === "paused" || phase === "over") return;
    timer += dt;
    if (phase === "starting") {
      if (timer >= 1.6) setPhase("playing");
      return;
    }
    if (phase === "dying") {
      if (timer >= (hooks.live().effects === "off" ? 0.6 : 1.4)) {
        lives -= 1;
        hud();
        if (lives <= 0) {
          setPhase("over");
          hooks.live().play("over");
          hooks.onOver(score, { level, glimmers, shades: shadesEaten });
          return;
        }
        placeActors();
        levelTime = 0;
        timer = 0;
        setPhase("starting");
      }
      return;
    }
    if (phase === "cleared") {
      if (timer >= 1.8) {
        level += 1;
        levelTime = 0;
        loadMaze();
        placeActors();
        hud();
        timer = 0;
        setPhase("starting");
      }
      return;
    }
    levelTime += dt;
    if (frightLeft > 0) {
      frightLeft -= dt;
      if (frightLeft <= 0) for (const shade of shades) shade.frightened = false;
    } else if (modeIndex < SCHEDULE.length) {
      modeTime += dt;
      if (modeTime >= SCHEDULE[modeIndex]) {
        modeTime = 0;
        modeIndex += 1;
        for (const shade of shades) if (shade.mode === "active" && shade.dir) shade.dir = OPPOSITE[shade.dir];
      }
    }
    stepPlayer(dt);
    trailTime += dt;
    if (player.dir && trailTime > 0.05) {
      trailTime = 0;
      const p = posOf(player);
      const back = VEC[player.dir];
      burst(p.x * TILE + TILE / 2 - back.x * 7, p.y * TILE + TILE / 2 - back.y * 7, frightLeft > 0 ? colors.foreground : hooks.live().theme.gem.glow, 1, 12, 0.4);
    }
    if (phase !== "playing") return;
    collide();
    if (phase !== "playing") return;
    for (const shade of shades) stepShade(shade, dt);
    collide();
  }

  function drawGem(x: number, y: number, r: number, now: number, animate: boolean) {
    if (!ctx) return;
    const dir = player.dir ?? "right";
    const angle = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[dir];
    const open = animate && phase === "playing" && player.dir ? (Math.sin(now / 55) + 1) * 0.22 : 0.12;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    drawGemBody(ctx, hooks.live().theme, r, open, now, animate);
    ctx.restore();
  }

  function drawShade(shade: Shade, x: number, y: number, r: number, now: number, animate: boolean) {
    if (!ctx) return;
    const flashing = shade.frightened && frightLeft < 2 && animate && Math.floor(now / 180) % 2 === 0;
    if (shade.mode !== "eyes") {
      const base = shade.frightened ? (flashing ? "#f6f0ff" : "#3d5cff") : hooks.live().theme.shades[shade.id];
      drawShadeBody(ctx, x, y, r, base, animate ? Math.sin(now / 90 + shade.id) * r * 0.12 : 0, animate, hooks.live().theme.style);
      if (shade.frightened) {
        ctx.strokeStyle = flashing ? "#ff5f8f" : "#f6f0ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 6; i += 1) {
          const mx = x - r * 0.55 + (r * 1.1 * i) / 6;
          const my = y + r * 0.3 + (i % 2 ? -r * 0.12 : r * 0.08);
          if (i === 0) ctx.moveTo(mx, my);
          else ctx.lineTo(mx, my);
        }
        ctx.stroke();
      }
    }
    const look = shade.dir ? VEC[shade.dir] : { x: 0, y: 0 };
    for (const side of [-1, 1]) {
      ctx.fillStyle = shade.frightened ? "#f6f0ff" : "#ffffff";
      ctx.beginPath();
      if (shade.frightened) ctx.arc(x + side * r * 0.32, y - r * 0.2, r * 0.12, 0, Math.PI * 2);
      else ctx.ellipse(x + side * r * 0.38, y - r * 0.2, r * 0.27, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!shade.frightened) {
        ctx.fillStyle = "#1a1040";
        ctx.beginPath();
        ctx.arc(x + side * r * 0.38 + look.x * r * 0.12, y - r * 0.2 + look.y * r * 0.14, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function wallLayer(color: string) {
    const { maze, style } = hooks.live().theme;
    const cacheKey = `${color}|${maze.surface}|${maze.floor}|${style}`;
    const cached = wallCache[cacheKey];
    if (cached) return cached;
    const scale = 2;
    const layer = document.createElement("canvas");
    layer.width = WIDTH * scale;
    layer.height = ROWS * TILE * scale;
    wallCache[cacheKey] = layer;
    const g = layer.getContext("2d");
    if (!g) return layer;
    g.scale(scale, scale);
    paintMaze(g, grid, TILE, maze, color, (x, y) => solid(tile(x, y)), style);
    return layer;
  }

  function draw() {
    if (!ctx || grid.length === 0) return;
    const { effects, theme } = hooks.live();
    const maze = theme.maze;
    const animate = effects !== "off";
    const now = performance.now();
    const { width, height, dpr } = size;
    const view = fitWorld(size, WIDTH, HEIGHT);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = maze.background;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);
    ctx.beginPath();
    ctx.rect(0, 0, WIDTH, HEIGHT);
    ctx.clip();
    const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 20, WIDTH / 2, HEIGHT / 2, HEIGHT * 0.7);
    glow.addColorStop(0, withAlpha(maze.wall, 0.12));
    glow.addColorStop(1, withAlpha(maze.wall, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // HUD
    ctx.fillStyle = maze.foreground;
    ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${score}`, 10, HUD / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = colors.muted;
    ctx.fillText(`LEVEL ${level}`, WIDTH / 2, HUD / 2);
    for (let i = 0; i < Math.min(lives, 6); i += 1) {
      const lx = WIDTH - 16 - i * 22;
      ctx.fillStyle = theme.gem.glow;
      ctx.shadowColor = theme.gem.glow;
      ctx.shadowBlur = animate ? 6 : 0;
      ctx.beginPath();
      ctx.arc(lx, HUD / 2, 7, 0.4, Math.PI * 2 - 0.4);
      ctx.lineTo(lx, HUD / 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    if (frightLeft > 0) {
      const w = WIDTH - 20;
      ctx.fillStyle = withAlpha("#3d5cff", 0.25);
      ctx.fillRect(10, HUD - 5, w, 3);
      ctx.fillStyle = frightLeft < 2 && Math.floor(now / 180) % 2 === 0 ? "#f6f0ff" : "#7f9bff";
      ctx.fillRect(10, HUD - 5, w * Math.max(0, frightLeft / frightTotal), 3);
    }

    ctx.translate(0, HUD);
    const cleared = phase === "cleared" && animate && Math.floor(timer / 0.2) % 2 === 0;
    const wallColor = cleared ? maze.foreground : maze.wall;
    ctx.drawImage(wallLayer(wallColor), 0, 0, WIDTH, ROWS * TILE);
    if (frightLeft > 0) {
      ctx.fillStyle = withAlpha("#3d5cff", 0.07 + (animate ? Math.sin(now / 200) * 0.025 : 0));
      ctx.fillRect(0, 0, WIDTH, ROWS * TILE);
    }
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const c = grid[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (c === "-") {
          ctx.fillStyle = withAlpha(maze.foreground, 0.5);
          ctx.fillRect(px + 2, py + TILE / 2 - 2, TILE - 4, 4);
        } else if (c === ".") {
          const s = 2.6 + (animate ? Math.sin(now / 320 + x * 1.7 + y * 2.3) * 0.7 : 0);
          drawGlimmer(ctx, px + TILE / 2, py + TILE / 2, s, maze.glimmer, theme.style);
        } else if (c === "o") {
          const pulse = animate ? 1 + Math.sin(now / 160) * 0.15 : 1;
          const cx = px + TILE / 2;
          const cy = py + TILE / 2;
          const halo = ctx.createRadialGradient(cx, cy, 1, cx, cy, 13 * pulse);
          halo.addColorStop(0, withAlpha(maze.foreground, 0.55));
          halo.addColorStop(1, withAlpha(maze.glimmer, 0));
          ctx.fillStyle = halo;
          ctx.fillRect(px - 4, py - 4, TILE + 8, TILE + 8);
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(animate ? now / 900 : 0);
          const s = 6.5 * pulse;
          const facets: [string, number][] = [
            ["#ffffff", 0],
            [maze.glimmer, 1],
            [maze.wall, 2],
            [maze.foreground, 3],
          ];
          for (const [fill, i] of facets) {
            const a = (i * Math.PI) / 2;
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a - Math.PI / 4) * s, Math.sin(a - Math.PI / 4) * s);
            ctx.lineTo(Math.cos(a + Math.PI / 4) * s, Math.sin(a + Math.PI / 4) * s);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    const center = (m: Mover) => {
      const p = posOf(m);
      return { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 };
    };

    for (const shade of shades) {
      if (phase === "dying" && timer > 0.4) continue;
      const c = center(shade);
      const bob = shade.mode === "house" && animate ? Math.sin(shade.bob) * 3 : 0;
      drawShade(shade, c.x, c.y + bob, TILE * 0.42, now, animate);
    }

    const pc = center(player);
    if (phase === "dying") {
      const t = Math.min(1, timer / 1.2);
      if (animate) {
        ctx.fillStyle = withAlpha(theme.gem.glow, 1 - t);
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(pc.x + Math.cos(a) * t * 22, pc.y + Math.sin(a) * t * 22, 3 * (1 - t) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else drawGem(pc.x, pc.y, TILE * 0.42, now, animate);

    ctx.globalCompositeOperation = "lighter";
    for (const s of sparks) drawSpark(ctx, s.shape, s.x, s.y, s.size, s.color, s.age / s.life, s.spin, theme.style);
    ctx.globalCompositeOperation = "source-over";
    if (flash > 0) {
      ctx.fillStyle = withAlpha("#ffffff", flash * 0.18);
      ctx.fillRect(0, 0, WIDTH, ROWS * TILE);
    }

    ctx.font = "700 13px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    for (const popup of popups) {
      ctx.fillStyle = withAlpha("#ffffff", 1 - popup.age);
      ctx.fillText(popup.text, popup.x * TILE + TILE / 2, popup.y * TILE + TILE / 2 - (animate ? popup.age * 12 : 0));
    }

    if (phase === "starting") {
      ctx.font = "800 20px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = colors.accent2;
      ctx.fillText(level > 1 && lives > 0 ? `LEVEL ${level}` : "READY!", WIDTH / 2, 11.5 * TILE + TILE / 2 + 2);
    }
    ctx.restore();
  }

  reset();
  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    draw();
  });
  const stopLoop = startLoop(step, draw);
  let resumeTo: Phase = "playing";

  return {
    get score() {
      return score;
    },
    get phase() {
      return phase;
    },
    get metrics() {
      return { level, glimmers, shades: shadesEaten };
    },
    steer(dir: Dir) {
      wanted = dir;
      if (phase === "ready") begin();
    },
    press() {
      if (phase === "ready") begin();
      else if (phase === "over") {
        reset();
        begin();
      }
    },
    pause() {
      if (phase === "playing" || phase === "starting" || phase === "dying" || phase === "cleared") {
        resumeTo = phase;
        setPhase("paused");
      }
    },
    resume() {
      if (phase !== "paused") return;
      // Play resumes after the short "ready" beat.
      if (resumeTo === "playing" || resumeTo === "starting") timer = 0;
      setPhase(resumeTo === "playing" ? "starting" : resumeTo);
    },
    destroy() {
      stopLoop();
      stopResize();
    },
  };
}

type GemChaseGame = ReturnType<typeof createGemChase>;
const isActive = (phase: Phase) => phase !== "ready" && phase !== "over";

export default function GameGemChase({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects, rootRef, look } = useArcade();
  const theme = useMemo(() => gemChaseTheme(look), [look]);
  const { records, submit } = useRecords("gem-chase", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GemChaseGame | null>(null);
  const live = useRef({ play, effects, theme });
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1 });
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("gem-chase");

  useGameAchievementTracking("gem-chase", phase);

  useEffect(() => {
    live.current = { play, effects, theme };
  });

  const start = useEffectEvent(() => beginRun(""));
  const finish = useEffectEvent((final: number, metrics: Record<string, number>) => {
    submit(final);
    finishRun(final, metrics);
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createGemChase(canvas, {
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
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
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
    if (!game) return false;
    const dir = keyDirection(event);
    if (dir) {
      if (game.phase !== "paused") game.steer(dir);
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
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    if (gameRef.current?.phase === "over") gameRef.current.press();
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const dir = swipeDirection(event.clientX - start.x, event.clientY - start.y, 18);
    if (!dir) return;
    gameRef.current?.steer(dir);
    swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  const best = records[""] ?? 0;
  const active = isActive(phase);

  return (
    <GameShell
      game="gem-chase"
      title="Gem Chase"
      active={active}
      stats={
        <>
          <Stat label="Score" value={hud.score} />
          <Stat label="Best" value={Math.max(best, hud.score)} highlight={hud.score > 0 && hud.score >= best} />
          <Stat label="Level" value={hud.level} />
          <Stat
            label="Lives"
            value={
              <span className="flex items-center gap-1" aria-label={`${hud.lives} lives`}>
                {Array.from({ length: Math.min(hud.lives, 6) }, (_, i) => (
                  <Heart key={i} aria-hidden className="size-4 fill-current text-amethyst" />
                ))}
              </span>
            }
          />
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
      <div className="arcade-stage [--stage-ratio:0.82]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Gem Chase maze, score ${hud.score}, level ${hud.level}, ${hud.lives} lives. Use the arrow keys or swipe to steer.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (swipe.current = null)}
          onPointerCancel={() => (swipe.current = null)}
        />
        {phase === "ready" ? (
          <GameOverlay
            title="Gem Chase"
            actions={<Button size="sm" onClick={pressAndFocus}>Start</Button>}
          >
            Steer with the arrow keys, WASD or swipes. Collect every glimmer to clear the maze and avoid the four shades ({SHADE_NAMES.join(", ")}).
            <span className="mt-1 block text-xs">A prism makes them flee for a moment: catch them for 200, 400, 800 and 1,600. Three lives; an extra one at 10,000.</span>
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} ref={focusQuietly}>Resume</Button>}>
            Score {hud.score} · level {hud.level}
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title="Game over" actions={<Button size="sm" onClick={pressAndFocus}>Play again</Button>}>
            Score {hud.score} · reached level {hud.level}
            {hud.score > 0 && hud.score >= best ? " · new best!" : ` · best ${Math.max(best, hud.score)}`}
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
