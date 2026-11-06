"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { Heart, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { fitWorld, observeCanvas, startLoop, swipeDirection, withAlpha, type CanvasSize } from "./engine";
import { GAME_PALETTES } from "./palettes";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { GameOverlay, GameShell, Stat, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords, keyDirection } from "./game-shell";
import type { SoundName } from "./sound";
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
const SHADE_COLORS = ["#ff5f8f", "#5fe3ff", "#7dff9a", "#ffae4f"];
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

type Hooks = {
  onPhase: (phase: Phase) => void;
  onHud: (hud: { score: number; lives: number; level: number }) => void;
  onOver: (score: number, metrics: { level: number; glimmers: number; shades: number }) => void;
  onStart: () => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
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

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const hud = () => hooks.onHud({ score, lives, level });
  const tile = (x: number, y: number) => (y < 0 || y >= ROWS ? " " : (grid[y]?.[wrapX(x)] ?? " "));
  const solid = (c: string) => c === "#" || c === " ";

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
      addScore(10);
    } else if (c === "o") {
      grid[player.y][player.x] = "_";
      pellets -= 1;
      addScore(50);
      hooks.live().play("power");
      frightLeft = Math.max(2, 7 - (level - 1) * 0.8);
      frightChain = 0;
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
        shade.mode = "eyes";
        shade.frightened = false;
        hooks.live().play("combo", 1 + frightChain * 0.1);
      } else {
        hooks.live().play("hit");
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
    ctx.fillStyle = colors.accent2;
    ctx.shadowColor = colors.accent2;
    ctx.shadowBlur = animate ? 12 : 0;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, open, Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = withAlpha("#ffffff", 0.55);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.75);
    ctx.lineTo(r * 0.25, -r * 0.45);
    ctx.lineTo(-r * 0.35, -r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawShade(shade: Shade, x: number, y: number, r: number, now: number, animate: boolean) {
    if (!ctx) return;
    const flashing = shade.frightened && frightLeft < 2 && animate && Math.floor(now / 180) % 2 === 0;
    if (shade.mode !== "eyes") {
      ctx.fillStyle = shade.frightened ? (flashing ? "#f6f0ff" : "#3d5cff") : SHADE_COLORS[shade.id];
      ctx.beginPath();
      ctx.arc(x, y - r * 0.15, r, Math.PI, 0);
      const feet = 4;
      const wave = animate ? Math.sin(now / 90 + shade.id) * r * 0.12 : 0;
      ctx.lineTo(x + r, y + r);
      for (let i = feet; i >= 0; i -= 1) {
        const fx = x - r + (2 * r * i) / feet;
        ctx.lineTo(fx, y + r - (i % 2 ? r * 0.35 + wave : 0));
      }
      ctx.closePath();
      ctx.fill();
    }
    const look = shade.dir ? VEC[shade.dir] : { x: 0, y: 0 };
    for (const side of [-1, 1]) {
      ctx.fillStyle = shade.frightened ? "#f6f0ff" : "#ffffff";
      ctx.beginPath();
      ctx.ellipse(x + side * r * 0.38, y - r * 0.2, r * 0.27, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      if (!shade.frightened) {
        ctx.fillStyle = "#1a1040";
        ctx.beginPath();
        ctx.arc(x + side * r * 0.38 + look.x * r * 0.12, y - r * 0.2 + look.y * r * 0.14, r * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function draw() {
    if (!ctx || grid.length === 0) return;
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

    // HUD
    ctx.fillStyle = colors.foreground;
    ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(`SCORE ${score}`, 10, HUD / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = colors.muted;
    ctx.fillText(`LEVEL ${level}`, WIDTH / 2, HUD / 2);
    for (let i = 0; i < Math.min(lives, 6); i += 1) {
      ctx.fillStyle = colors.accent2;
      ctx.beginPath();
      ctx.arc(WIDTH - 16 - i * 22, HUD / 2, 7, 0.4, Math.PI * 2 - 0.4);
      ctx.lineTo(WIDTH - 16 - i * 22, HUD / 2);
      ctx.fill();
    }

    ctx.translate(0, HUD);
    const cleared = phase === "cleared" && animate && Math.floor(timer / 0.2) % 2 === 0;
    const wallColor = cleared ? colors.foreground : colors.accent;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const c = grid[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (c === "#") {
          ctx.fillStyle = withAlpha(colors.surface, 0.9);
          ctx.fillRect(px, py, TILE, TILE);
          ctx.strokeStyle = withAlpha(wallColor, 0.85);
          ctx.lineWidth = 2;
          // Outline only the sides that face open floor.
          ctx.beginPath();
          if (!solid(tile(x, y - 1))) {
            ctx.moveTo(px, py + 1);
            ctx.lineTo(px + TILE, py + 1);
          }
          if (!solid(tile(x, y + 1))) {
            ctx.moveTo(px, py + TILE - 1);
            ctx.lineTo(px + TILE, py + TILE - 1);
          }
          if (x > 0 && !solid(tile(x - 1, y))) {
            ctx.moveTo(px + 1, py);
            ctx.lineTo(px + 1, py + TILE);
          }
          if (x < COLS - 1 && !solid(tile(x + 1, y))) {
            ctx.moveTo(px + TILE - 1, py);
            ctx.lineTo(px + TILE - 1, py + TILE);
          }
          ctx.stroke();
        } else if (c === "-") {
          ctx.fillStyle = withAlpha(colors.foreground, 0.5);
          ctx.fillRect(px + 2, py + TILE / 2 - 2, TILE - 4, 4);
        } else if (c === ".") {
          ctx.fillStyle = colors.accent2;
          ctx.beginPath();
          ctx.arc(px + TILE / 2, py + TILE / 2, 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else if (c === "o") {
          const pulse = animate ? 1 + Math.sin(now / 160) * 0.18 : 1;
          ctx.fillStyle = colors.foreground;
          ctx.save();
          ctx.translate(px + TILE / 2, py + TILE / 2);
          ctx.rotate(Math.PI / 4);
          ctx.fillRect(-5 * pulse, -5 * pulse, 10 * pulse, 10 * pulse);
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
        ctx.fillStyle = withAlpha(colors.accent2, 1 - t);
        for (let i = 0; i < 8; i += 1) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(pc.x + Math.cos(a) * t * 22, pc.y + Math.sin(a) * t * 22, 3 * (1 - t) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else drawGem(pc.x, pc.y, TILE * 0.42, now, animate);

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
  const { play, effects, rootRef } = useArcade();
  const { records, submit } = useRecords("gem-chase", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GemChaseGame | null>(null);
  const live = useRef({ play, effects });
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState({ score: 0, lives: 3, level: 1 });
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("gem-chase");

  useGameAchievementTracking("gem-chase", phase);

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
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
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
