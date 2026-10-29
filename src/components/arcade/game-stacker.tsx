"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import Matter from "matter-js";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { mix, observeCanvas, startLoop, withAlpha, type CanvasSize } from "./engine";
import { GAME_PALETTES } from "./palettes";
import { GameOverlay, GameShell, Stat, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecord } from "./game-shell";
import { CoinReward, useArcadeRun } from "./coin-reward";
import type { SoundName } from "./sound";

const WIDTH = 400;
const BLOCK = 26;
const BASE_WIDTH = 240;
const VISIBLE_ROWS = 16;
const PERFECT = 3;
const REGROW = 8;
const KEEP_STATIC = 20;
const MAX_DEBRIS = 30;

type Phase = "ready" | "playing" | "paused" | "over";
type Block = { x: number; w: number; level: number; placedAt: number; perfect: boolean };
type Debris = { body: Matter.Body; level: number };

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number, streak: number, bestStreak: number) => void;
  onOver: (score: number, perfectStreak: number) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

/** Level → y of the block's top edge (ground at 0, up is negative). */
const topOf = (level: number) => -(level + 1) * BLOCK;

function createStacker(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const colors = GAME_PALETTES.stacker;
  const engine = Matter.Engine.create();
  const ground = Matter.Bodies.rectangle(WIDTH / 2, BLOCK * 2, WIDTH * 6, BLOCK * 4, { isStatic: true });

  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let tower: Block[] = [];
  let towerBodies: Matter.Body[] = [];
  let debris: Debris[] = [];
  let moving = { x: 0, prevX: 0, w: BASE_WIDTH, dir: 1 };
  let streak = 0;
  let bestStreak = 0;
  let camera = 0;
  let prevCamera = 0;
  let endedAt = 0;
  let popup: { text: string; at: number; level: number } | null = null;

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const height = () => tower.length - 1;
  const speed = () => Math.min(6, 2.2 + 0.06 * height());
  const viewHeight = () => {
    const scale = Math.min(size.width / WIDTH, size.height / (BLOCK * VISIBLE_ROWS));
    return size.height / scale;
  };
  const cameraTarget = () => Math.min(topOf(tower.length) - viewHeight() * 0.35, 40 - viewHeight());

  function addStatic(block: Block) {
    const body = Matter.Bodies.rectangle(block.x + block.w / 2, topOf(block.level) + BLOCK / 2, block.w, BLOCK, { isStatic: true, friction: 0.6 });
    Matter.Composite.add(engine.world, body);
    towerBodies.push(body);
    if (towerBodies.length > KEEP_STATIC) Matter.Composite.remove(engine.world, towerBodies.shift()!);
  }

  function addDebris(x: number, w: number, level: number, push: number) {
    const body = Matter.Bodies.rectangle(x + w / 2, topOf(level) + BLOCK / 2, w, BLOCK, { friction: 0.5, restitution: 0.05, density: 0.002 });
    Matter.Body.setVelocity(body, { x: push, y: 0 });
    Matter.Body.setAngularVelocity(body, push * 0.01);
    Matter.Composite.add(engine.world, body);
    debris.push({ body, level });
    if (debris.length > MAX_DEBRIS) Matter.Composite.remove(engine.world, debris.shift()!.body);
  }

  function nextMover() {
    const top = tower[tower.length - 1];
    const fromLeft = tower.length % 2 === 0;
    const x = fromLeft ? -top.w / 2 : WIDTH - top.w / 2;
    moving = { x, prevX: x, w: top.w, dir: fromLeft ? 1 : -1 };
  }

  function reset() {
    Matter.Composite.clear(engine.world, false);
    Matter.Composite.add(engine.world, ground);
    tower = [];
    towerBodies = [];
    debris = [];
    streak = 0;
    bestStreak = 0;
    popup = null;
    const base: Block = { x: (WIDTH - BASE_WIDTH) / 2, w: BASE_WIDTH, level: 0, placedAt: 0, perfect: false };
    tower.push(base);
    addStatic(base);
    nextMover();
    camera = prevCamera = cameraTarget();
    hooks.onScore(0, 0, 0);
    setPhase("ready");
  }

  function place() {
    const top = tower[tower.length - 1];
    const level = tower.length;
    const { x, w } = moving;
    const effects = hooks.live().effects;
    const now = performance.now();
    if (Math.abs(x - top.x) <= PERFECT) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      let nextW = top.w;
      let nextX = top.x;
      if (streak >= 3 && nextW < BASE_WIDTH) {
        const grown = Math.min(BASE_WIDTH, nextW + REGROW);
        nextX = Math.max(0, Math.min(WIDTH - grown, nextX - (grown - nextW) / 2));
        nextW = grown;
      }
      const block = { x: nextX, w: nextW, level, placedAt: now, perfect: true };
      tower.push(block);
      addStatic(block);
      popup = { text: streak >= 2 ? `Perfect ×${streak}` : "Perfect!", at: now, level };
      hooks.live().play("place", 1 + Math.min(streak, 10) * 0.07);
      if (streak >= 3) hooks.live().play("combo", 1 + Math.min(streak, 10) * 0.04);
    } else {
      streak = 0;
      const left = Math.max(x, top.x);
      const right = Math.min(x + w, top.x + top.w);
      if (right - left <= 0) {
        addDebris(x, w, level, moving.dir * 1.5);
        endedAt = now;
        setPhase("over");
        hooks.live().play("over");
        hooks.onOver(height(), bestStreak);
        return;
      }
      const block = { x: left, w: right - left, level, placedAt: now, perfect: false };
      tower.push(block);
      addStatic(block);
      // The overhang drops away on whichever side it stuck out.
      if (x < left) addDebris(x, left - x, level, -0.6);
      if (x + w > right) addDebris(right, x + w - right, level, 0.6);
      hooks.live().play("chip", 0.9 + Math.min(height(), 40) * 0.01);
      popup = null;
    }
    if (effects === "off") camera = prevCamera = cameraTarget();
    hooks.onScore(height(), streak, bestStreak);
    nextMover();
  }

  function step() {
    prevCamera = camera;
    moving.prevX = moving.x;
    if (phase === "paused") return;
    Matter.Engine.update(engine, 1000 / 60);
    debris = debris.filter((piece) => {
      if (piece.body.position.y < camera + viewHeight() + 300) return true;
      Matter.Composite.remove(engine.world, piece.body);
      return false;
    });
    const target = cameraTarget();
    camera += (target - camera) * (hooks.live().effects === "off" ? 1 : 0.1);
    if (phase !== "playing") return;
    // The block's center bounces between the two edges of the play area.
    moving.x += moving.dir * speed();
    const center = moving.x + moving.w / 2;
    if (center > WIDTH) {
      moving.x = WIDTH - moving.w / 2;
      moving.dir = -1;
    } else if (center < 0) {
      moving.x = -moving.w / 2;
      moving.dir = 1;
    }
  }

  function draw(alpha: number) {
    if (!ctx) return;
    const effects = hooks.live().effects;
    const now = performance.now();
    const { width: cw, height: ch, dpr } = size;
    const scale = Math.min(cw / WIDTH, ch / (BLOCK * VISIBLE_ROWS));
    const offsetX = (cw - WIDTH * scale) / 2;
    const cam = prevCamera + (camera - prevCamera) * alpha;
    const vh = ch / scale;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lift = Math.min(1, Math.max(0, -cam / 3000));
    const sky = ctx.createLinearGradient(0, 0, 0, ch);
    sky.addColorStop(0, mix(colors.background, colors.accent, (colors.dark ? 0.1 : 0.06) + lift * 0.12));
    sky.addColorStop(1, mix(colors.background, colors.surface, 0.7));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(offsetX, 0);
    ctx.scale(scale, scale);
    ctx.translate(0, -cam);

    // Height markers every 10 levels.
    ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "left";
    for (let level = 10; level < tower.length + 30; level += 10) {
      const y = topOf(level - 1);
      if (y < cam - 20 || y > cam + vh + 20) continue;
      ctx.strokeStyle = withAlpha(colors.foreground, 0.08);
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(WIDTH, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = withAlpha(colors.foreground, 0.3);
      ctx.fillText(String(level), 6, y - 4);
    }

    // Ground.
    ctx.fillStyle = mix(colors.surface, colors.accent, 0.12);
    ctx.fillRect(-WIDTH, 0, WIDTH * 3, 400);
    ctx.fillStyle = mix(colors.surface, colors.accent, 0.3);
    ctx.fillRect(-WIDTH, 0, WIDTH * 3, 4);

    const colorFor = (level: number) => mix(colors.accent, colors.accent2, (Math.sin(level * 0.35) + 1) / 2);
    const drawBlock = (x: number, level: number, w: number, fill: string) => {
      const y = topOf(level);
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, BLOCK);
      ctx.fillStyle = withAlpha("#ffffff", colors.dark ? 0.18 : 0.28);
      ctx.fillRect(x, y, w, 4);
      ctx.fillStyle = withAlpha("#000000", 0.16);
      ctx.fillRect(x, y + BLOCK - 4, w, 4);
    };

    for (const block of tower) {
      const y = topOf(block.level);
      if (y > cam + vh + BLOCK || y < cam - BLOCK * 2) continue;
      drawBlock(block.x, block.level, block.w, colorFor(block.level));
      if (block.perfect && effects !== "off") {
        const t = (now - block.placedAt) / 420;
        if (t < 1) {
          const grow = effects === "full" ? t * 10 : 3;
          ctx.strokeStyle = withAlpha("#ffffff", (1 - t) * 0.8);
          ctx.lineWidth = 2;
          ctx.strokeRect(block.x - grow, y - grow, block.w + grow * 2, BLOCK + grow * 2);
        }
      }
    }

    for (const piece of debris) {
      const { vertices } = piece.body;
      ctx.fillStyle = mix(colorFor(piece.level), colors.background, 0.25);
      ctx.beginPath();
      vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)));
      ctx.closePath();
      ctx.fill();
    }

    if (phase !== "over") {
      const x = moving.prevX + (moving.x - moving.prevX) * alpha;
      const level = tower.length;
      // A faint guide shows where the block below sits.
      const top = tower[tower.length - 1];
      ctx.strokeStyle = withAlpha(colors.foreground, 0.12);
      ctx.setLineDash([3, 5]);
      ctx.strokeRect(top.x, topOf(level), top.w, BLOCK);
      ctx.setLineDash([]);
      drawBlock(x, level, moving.w, colorFor(level));
    }

    if (popup && now - popup.at < 900) {
      const t = (now - popup.at) / 900;
      ctx.font = "700 18px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = withAlpha(colors.foreground, 1 - t);
      ctx.fillText(popup.text, WIDTH / 2, topOf(popup.level) - 12 - (effects === "off" ? 0 : t * 24));
    }
    ctx.restore();
  }

  reset();
  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    camera = prevCamera = cameraTarget();
    draw(1);
  });
  const stopLoop = startLoop(step, draw);

  return {
    get score() {
      return height();
    },
    get phase() {
      return phase;
    },
    press() {
      if (phase === "ready") setPhase("playing");
      else if (phase === "playing") place();
      else if (phase === "paused") setPhase("playing");
      else if (performance.now() - endedAt > 400) {
        reset();
        setPhase("playing");
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
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    },
  };
}

type StackerGame = ReturnType<typeof createStacker>;

export default function GameStacker({ best: initialBest }: { best: number | null }) {
  const { play, effects } = useArcade();
  const { best, submit } = useRecord("stacker", initialBest);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<StackerGame | null>(null);
  const live = useRef({ play, effects });
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const bestStreak = useRef(0);
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("stacker");

  useGameAchievementTracking("stacker", phase);

  useEffect(() => {
    if (phase === "playing") beginRun();
  }, [phase, beginRun]);

  useEffect(() => {
    live.current = { play, effects };
  });

  const finish = useEffectEvent((final: number, perfectStreak: number) => {
    submit(final);
    finishRun(final, { height: final, perfectStreak });
    sendAchievementEvent({ type: "run_finished", game: "stacker", height: final, perfectStreak });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createStacker(canvas, {
      onPhase: setPhase,
      onScore: (next, run, bestRun) => {
        setScore(next);
        setStreak(run);
        bestStreak.current = bestRun;
      },
      onOver: (final, perfectStreak) => finish(final, perfectStreak),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true });
      finishRun(game.score, { height: game.score, perfectStreak: bestStreak.current }, { keepalive: true });
      if (game.score > 0) sendAchievementEvent({ type: "run_progress", game: "stacker", height: game.score, perfectStreak: bestStreak.current });
      game.destroy();
      gameRef.current = null;
    };
  }, [submit, finishRun]);

  useAway(() => gameRef.current?.pause());

  function togglePause() {
    const game = gameRef.current;
    if (game?.phase === "playing") game.pause();
    else game?.resume();
    canvasRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === " " || event.key === "Enter" || event.key === "ArrowDown") {
      if (!event.repeat) game.press();
      return true;
    }
    if ((event.key === "p" || event.key === "P" || event.key === "Escape") && (game.phase === "playing" || game.phase === "paused")) {
      togglePause();
      return true;
    }
    return false;
  });

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    canvasRef.current?.focus({ preventScroll: true });
    gameRef.current?.press();
  }

  const shownBest = Math.max(best, score);

  return (
    <GameShell
      game="stacker"
      title="Tower Stacker"
      active={phase === "playing" || phase === "paused"}
      stats={
        <>
          <Stat label="Height" value={score} />
          <Stat label="Best" value={shownBest} highlight={score > 0 && score >= best} />
          <Stat label="Perfect streak" value={streak} highlight={streak >= 3} />
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
      help="Click, tap or press Space to drop the sliding block. Only the part that overlaps the block below stays. Land it perfectly to keep its full width; from three perfects in a row each one widens the block again. Missing the tower entirely ends the run."
    >
      <div className="arcade-stage [--stage-ratio:0.75]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Tower Stacker playfield, height ${score}. Tap or press Space to drop the block.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
        />
        {phase === "ready" ? (
          <GameOverlay tone="quiet" title="Build up">
            Tap, click or press Space to start, then again to drop each block.
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
            Height {score}
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title="Tower complete" actions={<Button size="sm" onClick={() => gameRef.current?.press()}>Play again</Button>}>
            Height {score}
            {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest}`}
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
