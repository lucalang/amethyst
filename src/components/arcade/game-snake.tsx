"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { livePalette, observeCanvas, startLoop, swipeDirection, withAlpha, mix, type CanvasSize } from "./engine";
import { GameOverlay, GameShell, Stat, keyDirection, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecord } from "./game-shell";
import type { SoundName } from "./sound";

const GRID = 20;
const START_INTERVAL = 140;
const MIN_INTERVAL = 70;

type Direction = "up" | "down" | "left" | "right";
type Point = { x: number; y: number };
type Phase = "ready" | "playing" | "paused" | "over";

const VECTORS: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Direction, Direction> = { up: "down", down: "up", left: "right", right: "left" };

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number) => void;
  onOver: (score: number, won: boolean) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

function createSnake(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const palette = livePalette(canvas);
  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let snake: Point[] = [];
  let previous: Point[] = [];
  let direction: Direction = "right";
  let queue: Direction[] = [];
  let food: Point | null = null;
  let interval = START_INTERVAL;
  let elapsed = 0;
  let score = 0;
  let ateAt = -1000;
  let diedAt = 0;

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };

  function placeFood() {
    const taken = new Set(snake.map((p) => p.y * GRID + p.x));
    const empty: number[] = [];
    for (let cell = 0; cell < GRID * GRID; cell += 1) if (!taken.has(cell)) empty.push(cell);
    if (!empty.length) return null;
    const cell = empty[Math.floor(Math.random() * empty.length)];
    return { x: cell % GRID, y: Math.floor(cell / GRID) };
  }

  function reset() {
    snake = [
      { x: 8, y: 10 },
      { x: 7, y: 10 },
      { x: 6, y: 10 },
    ];
    previous = snake.map((p) => ({ ...p }));
    direction = "right";
    queue = [];
    food = placeFood();
    interval = START_INTERVAL;
    elapsed = 0;
    score = 0;
    hooks.onScore(0);
    setPhase("ready");
  }

  function die(won: boolean) {
    diedAt = performance.now();
    setPhase("over");
    hooks.live().play(won ? "win" : "over");
    hooks.onOver(score, won);
  }

  function tick() {
    previous = snake.map((p) => ({ ...p }));
    direction = queue.shift() ?? direction;
    const head = snake[0];
    const next = { x: head.x + VECTORS[direction].x, y: head.y + VECTORS[direction].y };
    const eats = food !== null && next.x === food.x && next.y === food.y;
    if (next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID) return die(false);
    // The tail moves away this tick unless the snake is growing, so the head may follow it.
    const body = eats ? snake : snake.slice(0, -1);
    if (body.some((p) => p.x === next.x && p.y === next.y)) return die(false);
    snake = [next, ...body];
    if (!eats) return;
    score += 1;
    ateAt = performance.now();
    interval = Math.max(MIN_INTERVAL, START_INTERVAL - score * 2);
    hooks.onScore(score);
    hooks.live().play("eat", 1 + Math.min(score, 40) / 80);
    food = placeFood();
    if (!food) die(true);
  }

  function step(ms: number) {
    if (phase !== "playing") return;
    elapsed += ms;
    while (elapsed >= interval && phase === "playing") {
      elapsed -= interval;
      tick();
    }
  }

  function draw() {
    if (!ctx) return;
    const colors = palette();
    const { width, height, dpr } = size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const cell = Math.min(width, height) / GRID;
    const ox = (width - cell * GRID) / 2;
    const oy = (height - cell * GRID) / 2;

    ctx.fillStyle = mix(colors.background, colors.surface, 0.85);
    ctx.fillRect(ox, oy, cell * GRID, cell * GRID);
    ctx.fillStyle = withAlpha(colors.foreground, colors.dark ? 0.025 : 0.04);
    for (let y = 0; y < GRID; y += 1) {
      for (let x = (y % 2); x < GRID; x += 2) ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }

    const now = performance.now();
    const effects = hooks.live().effects;
    if (food) {
      const pulse = effects === "off" ? 0 : Math.sin(now / 220) * 0.06;
      const cx = ox + (food.x + 0.5) * cell;
      const cy = oy + (food.y + 0.5) * cell;
      if (effects !== "off") {
        ctx.fillStyle = withAlpha(colors.accent2, 0.18);
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.62, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = colors.accent2;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * (0.34 + pulse), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = withAlpha("#ffffff", 0.55);
      ctx.beginPath();
      ctx.arc(cx - cell * 0.1, cy - cell * 0.1, cell * 0.08, 0, Math.PI * 2);
      ctx.fill();
    }

    const t = phase === "playing" ? Math.min(1, elapsed / interval) : phase === "over" ? 0 : 1;
    const points = snake.map((p, i) => {
      const from = previous[Math.min(i, previous.length - 1)] ?? p;
      return { x: ox + (from.x + (p.x - from.x) * t + 0.5) * cell, y: oy + (from.y + (p.y - from.y) * t + 0.5) * cell };
    });
    const dead = phase === "over";
    const body = dead ? mix(colors.accent, colors.muted, 0.6) : colors.accent;
    const shake = dead && effects === "full" && now - diedAt < 260 ? Math.sin(now / 18) * cell * 0.08 : 0;
    ctx.save();
    ctx.translate(shake, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = body;
    ctx.lineWidth = cell * 0.7;
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    if (points.length === 1) ctx.lineTo(points[0].x + 0.01, points[0].y);
    ctx.stroke();
    // Lighter spine so the body reads as one rounded tube.
    ctx.strokeStyle = withAlpha("#ffffff", colors.dark ? 0.12 : 0.22);
    ctx.lineWidth = cell * 0.22;
    ctx.stroke();

    const head = points[0];
    if (head) {
      const eat = effects !== "off" ? Math.max(0, 1 - (now - ateAt) / 180) : 0;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(head.x, head.y, cell * (0.42 + eat * 0.1), 0, Math.PI * 2);
      ctx.fill();
      const v = VECTORS[direction];
      const side = { x: -v.y, y: v.x };
      for (const s of [-1, 1]) {
        const ex = head.x + v.x * cell * 0.14 + side.x * s * cell * 0.17;
        const ey = head.y + v.y * cell * 0.14 + side.y * s * cell * 0.17;
        ctx.fillStyle = colors.background;
        ctx.beginPath();
        ctx.arc(ex, ey, cell * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    draw();
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
    turn(next: Direction) {
      if (phase === "over") return;
      if (phase === "ready" || phase === "paused") {
        elapsed = 0;
        setPhase("playing");
      }
      const last = queue[queue.length - 1] ?? direction;
      if (next === last || next === OPPOSITE[last] || queue.length >= 2) return;
      queue.push(next);
    },
    start() {
      if (phase === "ready" || phase === "paused") setPhase("playing");
    },
    pause() {
      if (phase === "playing") setPhase("paused");
    },
    restart() {
      reset();
    },
    /** Ignore restarts right after dying so a held key doesn't skip the result. */
    canRestart() {
      return phase === "over" && performance.now() - diedAt > 400;
    },
    destroy() {
      stopLoop();
      stopResize();
    },
  };
}

type SnakeGame = ReturnType<typeof createSnake>;

export default function GameSnake({ best: initialBest }: { best: number | null }) {
  const { play, effects } = useArcade();
  const { best, submit } = useRecord("snake", initialBest);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const live = useRef({ play, effects });
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);

  useGameAchievementTracking("snake", phase);

  useEffect(() => {
    live.current = { play, effects };
  });

  const finish = useEffectEvent((final: number, didWin: boolean) => {
    setWon(didWin);
    submit(final);
    sendAchievementEvent({ type: "run_finished", game: "snake", length: final + 3 });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createSnake(canvas, {
      onPhase: setPhase,
      onScore: setScore,
      onOver: (final, didWin) => finish(final, didWin),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true });
      if (game.score > 0) sendAchievementEvent({ type: "run_progress", game: "snake", length: game.score + 3 });
      game.destroy();
      gameRef.current = null;
    };
  }, [submit]);

  useAway(() => gameRef.current?.pause());

  function restart() {
    setWon(false);
    gameRef.current?.restart();
    canvasRef.current?.focus({ preventScroll: true });
  }

  function togglePause() {
    const game = gameRef.current;
    if (!game) return;
    if (game.phase === "playing") game.pause();
    else game.start();
    canvasRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game) return false;
    const direction = keyDirection(event);
    if (direction) {
      game.turn(direction);
      return true;
    }
    if (event.key === " " || event.key === "Enter") {
      if (game.phase === "over") {
        if (game.canRestart()) restart();
      } else togglePause();
      return true;
    }
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      if (game.phase === "playing" || game.phase === "paused") togglePause();
      return game.phase !== "over";
    }
    return false;
  });

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  // Swipes are read continuously, so one gesture can turn more than once.
  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, 22);
    if (!direction) return;
    gameRef.current?.turn(direction);
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp() {
    swipe.current = null;
  }

  const dpad = (direction: Direction, label: string, Icon: typeof ArrowUp, area: string) => (
    <button
      type="button"
      aria-label={label}
      className={`${area} grid size-14 place-items-center rounded-xl border border-white/[0.1] bg-surface/70 text-foreground active:bg-amethyst/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
      onPointerDown={(event) => {
        event.preventDefault();
        gameRef.current?.turn(direction);
      }}
      onClick={(event) => {
        // Keyboard activation; pointer presses already turned on pointerdown.
        if (event.detail === 0) gameRef.current?.turn(direction);
      }}
    >
      <Icon aria-hidden className="size-6" />
    </button>
  );

  const shownBest = Math.max(best, score);

  return (
    <GameShell
      title="Snake"
      active={phase === "playing" || phase === "paused"}
      stats={
        <>
          <Stat label="Score" value={score} />
          <Stat label="Best" value={shownBest} highlight={score > 0 && score >= best} />
        </>
      }
      actions={
        phase === "playing" || phase === "paused" ? (
          <Button variant="outline" size="sm" className="h-8" onClick={togglePause}>
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            {phase === "paused" ? "Resume" : "Pause"}
          </Button>
        ) : null
      }
      help="Arrow keys or WASD steer; swipe on the board or use the pad on touch screens. Space or P pauses. You can't reverse straight into yourself; hitting a wall or your own body ends the run."
    >
      <div className="flex flex-col items-center gap-4">
        <div className="arcade-stage [--stage-ratio:1]">
          <canvas
            ref={canvasRef}
            tabIndex={-1}
            aria-label={`Snake board, score ${score}`}
            className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {phase === "ready" ? (
            <GameOverlay
              tone="quiet"
              title="Ready"
              actions={<Button size="sm" onClick={() => gameRef.current?.start()}>Start</Button>}
            >
              Press an arrow key or swipe to start.
            </GameOverlay>
          ) : phase === "paused" ? (
            <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
              Score {score}
            </GameOverlay>
          ) : phase === "over" ? (
            <GameOverlay title={won ? "Board cleared!" : "Game over"} actions={<Button size="sm" onClick={restart}>Play again</Button>}>
              Score {score}
              {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest}`}
            </GameOverlay>
          ) : null}
        </div>
        <div className="hidden grid-cols-3 grid-rows-2 gap-2 pointer-coarse:grid" role="group" aria-label="Direction pad">
          {dpad("up", "Up", ArrowUp, "col-start-2")}
          {dpad("left", "Left", ArrowLeft, "col-start-1 row-start-2")}
          {dpad("down", "Down", ArrowDown, "col-start-2 row-start-2")}
          {dpad("right", "Right", ArrowRight, "col-start-3 row-start-2")}
        </div>
      </div>
    </GameShell>
  );
}
