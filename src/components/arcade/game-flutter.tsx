"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import Matter from "matter-js";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { fitWorld, mix, observeCanvas, startLoop, withAlpha, type CanvasSize } from "./engine";
import { GAME_PALETTES } from "./palettes";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { GameOverlay, GameShell, Stat, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecord } from "./game-shell";
import type { SoundName } from "./sound";

const WIDTH = 480;
const HEIGHT = 640;
const GROUND = HEIGHT - 70;
const BIRD_X = 130;
const RADIUS = 15;
const FLAP = -7.6;
const MAX_FALL = 11;
const PIPE_W = 70;
const GAP = 165;
const SPACING = 210;
const SPEED = 2.6;

type Phase = "ready" | "playing" | "paused" | "over";
type Pipe = { x: number; prevX: number; gapY: number; top: Matter.Body; bottom: Matter.Body; scored: boolean };

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number) => void;
  onOver: (score: number) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

function createFlutter(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const colors = GAME_PALETTES.flutter;
  // Gravity tuned so the bird gains ~0.42 px of fall speed per 60 Hz step.
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.001512 } });
  const bird = Matter.Bodies.circle(BIRD_X, HEIGHT / 2, RADIUS, { inertia: Infinity, frictionAir: 0, collisionFilter: { mask: 0 } });
  Matter.Composite.add(engine.world, bird);

  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let pipes: Pipe[] = [];
  let score = 0;
  let frame = 0;
  let prevY = bird.position.y;
  let scroll = 0;
  let prevScroll = 0;
  let flapAt = -1000;
  let diedAt = 0;

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };

  function makePipe(x: number, previousGap: number | null): Pipe {
    const min = GAP / 2 + 60;
    const max = GROUND - GAP / 2 - 50;
    const target = min + Math.random() * (max - min);
    const gapY = previousGap === null ? (min + max) / 2 : Math.min(max, Math.max(min, previousGap + Math.max(-180, Math.min(180, target - previousGap))));
    const top = Matter.Bodies.rectangle(x, gapY - GAP / 2 - HEIGHT / 2, PIPE_W, HEIGHT, { isStatic: true });
    const bottom = Matter.Bodies.rectangle(x, gapY + GAP / 2 + HEIGHT / 2, PIPE_W, HEIGHT, { isStatic: true });
    return { x, prevX: x, gapY, top, bottom, scored: false };
  }

  function reset() {
    pipes = [];
    score = 0;
    frame = 0;
    Matter.Body.setPosition(bird, { x: BIRD_X, y: HEIGHT / 2 });
    Matter.Body.setVelocity(bird, { x: 0, y: 0 });
    prevY = bird.position.y;
    hooks.onScore(0);
    setPhase("ready");
  }

  function flap() {
    Matter.Body.setVelocity(bird, { x: 0, y: FLAP });
    flapAt = performance.now();
    hooks.live().play("flap");
  }

  function die() {
    diedAt = performance.now();
    setPhase("over");
    hooks.live().play("hit");
    window.setTimeout(() => hooks.live().play("over"), 260);
    hooks.onOver(score);
  }

  function step() {
    prevScroll = scroll;
    prevY = bird.position.y;
    for (const pipe of pipes) pipe.prevX = pipe.x;
    if (phase === "ready") {
      frame += 1;
      scroll += SPEED;
      Matter.Body.setPosition(bird, { x: BIRD_X, y: HEIGHT / 2 + Math.sin(frame / 14) * 8 });
      return;
    }
    if (phase === "paused") return;
    if (phase === "over") {
      if (bird.position.y + RADIUS < GROUND) Matter.Engine.update(engine, 1000 / 60);
      if (bird.position.y + RADIUS >= GROUND) {
        Matter.Body.setPosition(bird, { x: BIRD_X, y: GROUND - RADIUS });
        Matter.Body.setVelocity(bird, { x: 0, y: 0 });
      }
      return;
    }

    Matter.Engine.update(engine, 1000 / 60);
    if (bird.velocity.y > MAX_FALL) Matter.Body.setVelocity(bird, { x: 0, y: MAX_FALL });
    if (bird.position.y - RADIUS < 0) {
      Matter.Body.setPosition(bird, { x: BIRD_X, y: RADIUS });
      Matter.Body.setVelocity(bird, { x: 0, y: 0 });
    }
    scroll += SPEED;

    for (const pipe of pipes) {
      pipe.x -= SPEED;
      Matter.Body.setPosition(pipe.top, { x: pipe.x, y: pipe.top.position.y });
      Matter.Body.setPosition(pipe.bottom, { x: pipe.x, y: pipe.bottom.position.y });
      if (!pipe.scored && pipe.x + PIPE_W / 2 < BIRD_X - RADIUS) {
        pipe.scored = true;
        score += 1;
        hooks.onScore(score);
        hooks.live().play("point", 1 + Math.min(score, 30) / 60);
      }
    }
    pipes = pipes.filter((pipe) => pipe.x > -PIPE_W);
    const last = pipes[pipes.length - 1];
    if (!last) pipes.push(makePipe(WIDTH + PIPE_W, null));
    else if (last.x <= WIDTH + PIPE_W - SPACING) pipes.push(makePipe(last.x + SPACING, last.gapY));

    if (bird.position.y + RADIUS >= GROUND) {
      Matter.Body.setPosition(bird, { x: BIRD_X, y: GROUND - RADIUS });
      return die();
    }
    const bodies = pipes.flatMap((pipe) => [pipe.top, pipe.bottom]);
    if (Matter.Query.collides(bird, bodies).length) die();
  }

  function drawCrystal(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, up: boolean, fill: string | CanvasGradient) {
    // A tall prism with a faceted point toward the gap.
    const tip = 18;
    c.fillStyle = fill;
    c.beginPath();
    if (up) {
      c.moveTo(x, y + h);
      c.lineTo(x, y + tip);
      c.lineTo(x + w / 2, y);
      c.lineTo(x + w, y + tip);
      c.lineTo(x + w, y + h);
    } else {
      c.moveTo(x, y);
      c.lineTo(x, y + h - tip);
      c.lineTo(x + w / 2, y + h);
      c.lineTo(x + w, y + h - tip);
      c.lineTo(x + w, y);
    }
    c.closePath();
    c.fill();
  }

  function draw(alpha: number) {
    if (!ctx) return;
    const effects = hooks.live().effects;
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

    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, mix(colors.background, colors.accent, colors.dark ? 0.16 : 0.1));
    sky.addColorStop(1, mix(colors.background, colors.surface, 0.6));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const offset = prevScroll + (scroll - prevScroll) * alpha;
    if (effects !== "off") {
      // Distant crystal ridge, slow parallax.
      const ridge = withAlpha(colors.accent, colors.dark ? 0.1 : 0.12);
      const span = 120;
      const shift = (offset * 0.25) % span;
      const first = Math.floor((offset * 0.25) / span);
      for (let i = -1; i < WIDTH / span + 2; i += 1) {
        const x = i * span - shift;
        const h = 60 + ((((i + first) * 37) % 5) + 5) % 5 * 18;
        drawCrystal(ctx, x, GROUND - h, 46, h, true, ridge);
        drawCrystal(ctx, x + 54, GROUND - h * 0.6, 30, h * 0.6, true, ridge);
      }
    }

    const pillar = ctx.createLinearGradient(0, 0, PIPE_W, 0);
    pillar.addColorStop(0, mix(colors.accent, colors.background, 0.15));
    pillar.addColorStop(0.45, mix(colors.accent, "#ffffff", colors.dark ? 0.25 : 0.12));
    pillar.addColorStop(1, mix(colors.accent, colors.background, 0.45));
    for (const pipe of pipes) {
      const x = pipe.prevX + (pipe.x - pipe.prevX) * alpha - PIPE_W / 2;
      ctx.save();
      ctx.translate(x, 0);
      drawCrystal(ctx, 0, -10, PIPE_W, pipe.gapY - GAP / 2 + 10, false, pillar);
      drawCrystal(ctx, 0, pipe.gapY + GAP / 2, PIPE_W, GROUND - (pipe.gapY + GAP / 2), true, pillar);
      ctx.strokeStyle = withAlpha("#ffffff", colors.dark ? 0.22 : 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PIPE_W * 0.32, 0);
      ctx.lineTo(PIPE_W * 0.32, pipe.gapY - GAP / 2 - 14);
      ctx.moveTo(PIPE_W * 0.32, pipe.gapY + GAP / 2 + 14);
      ctx.lineTo(PIPE_W * 0.32, GROUND);
      ctx.stroke();
      ctx.restore();
    }

    // Ground.
    ctx.fillStyle = mix(colors.surface, colors.accent, 0.18);
    ctx.fillRect(0, GROUND, WIDTH, HEIGHT - GROUND);
    ctx.fillStyle = mix(colors.surface, colors.accent, 0.35);
    ctx.fillRect(0, GROUND, WIDTH, 6);
    ctx.fillStyle = withAlpha(colors.foreground, 0.06);
    const stripe = 28;
    const groundShift = offset % stripe;
    for (let x = -stripe; x < WIDTH + stripe; x += stripe) {
      ctx.beginPath();
      ctx.moveTo(x - groundShift, GROUND + 6);
      ctx.lineTo(x - groundShift + 14, GROUND + 6);
      ctx.lineTo(x - groundShift + 4, HEIGHT);
      ctx.lineTo(x - groundShift - 10, HEIGHT);
      ctx.fill();
    }

    // The gem-bird.
    const y = prevY + (bird.position.y - prevY) * alpha;
    const now = performance.now();
    const angle = phase === "ready" ? 0 : Math.max(-0.5, Math.min(1.2, bird.velocity.y * 0.08));
    const wing = effects === "off" ? 0 : phase === "over" ? 0 : Math.sin(Math.min(1, (now - flapAt) / 220) * Math.PI) * 0.9 + (phase === "ready" ? Math.sin(now / 90) * 0.4 : 0);
    ctx.save();
    ctx.translate(BIRD_X, y);
    ctx.rotate(angle);
    ctx.fillStyle = colors.accent2;
    ctx.beginPath();
    ctx.ellipse(0, 0, RADIUS + 3, RADIUS, 0, 0, Math.PI * 2);
    ctx.fill();
    // Facets.
    ctx.fillStyle = withAlpha("#ffffff", 0.35);
    ctx.beginPath();
    ctx.moveTo(-4, -RADIUS + 2);
    ctx.lineTo(6, -6);
    ctx.lineTo(-2, 2);
    ctx.lineTo(-12, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = withAlpha("#000000", 0.14);
    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(4, 12);
    ctx.lineTo(-6, RADIUS - 1);
    ctx.closePath();
    ctx.fill();
    // Wing.
    ctx.save();
    ctx.translate(-5, 2);
    ctx.rotate(-0.3 - wing);
    ctx.fillStyle = mix(colors.accent2, "#ffffff", 0.35);
    ctx.beginPath();
    ctx.ellipse(-6, 0, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Beak and eye.
    ctx.fillStyle = "#ffc857";
    ctx.beginPath();
    ctx.moveTo(RADIUS + 1, -3);
    ctx.lineTo(RADIUS + 11, 1);
    ctx.lineTo(RADIUS + 1, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(7, -5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a1325";
    ctx.beginPath();
    ctx.arc(phase === "over" ? 7 : 8.5, -5, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (phase === "playing" || phase === "paused" || phase === "over") {
      ctx.font = "700 54px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 6;
      ctx.strokeStyle = withAlpha(colors.background, 0.55);
      ctx.strokeText(String(score), WIDTH / 2, 78);
      ctx.fillStyle = withAlpha(colors.foreground, 0.9);
      ctx.fillText(String(score), WIDTH / 2, 78);
    }

    if (phase === "over" && effects !== "off") {
      const flash = Math.max(0, 1 - (now - diedAt) / 260);
      if (flash > 0) {
        ctx.fillStyle = withAlpha("#ffffff", flash * (effects === "full" ? 0.45 : 0.2));
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

  return {
    get score() {
      return score;
    },
    get phase() {
      return phase;
    },
    /** Tap / click / Space: start, flap, resume or restart. */
    press() {
      if (phase === "ready") {
        setPhase("playing");
        flap();
      } else if (phase === "playing") {
        flap();
      } else if (phase === "paused") {
        setPhase("playing");
      } else if (performance.now() - diedAt > 400) {
        reset();
        setPhase("playing");
        flap();
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

type FlutterGame = ReturnType<typeof createFlutter>;

export default function GameFlutter({ best: initialBest }: { best: number | null }) {
  const { play, effects } = useArcade();
  const { best, submit } = useRecord("flutter", initialBest);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FlutterGame | null>(null);
  const live = useRef({ play, effects });
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("flutter");

  useGameAchievementTracking("flutter", phase);

  useEffect(() => {
    if (phase === "playing") beginRun();
  }, [phase, beginRun]);

  useEffect(() => {
    live.current = { play, effects };
  });

  const finish = useEffectEvent((final: number) => {
    submit(final);
    finishRun(final, { obstacles: final });
    sendAchievementEvent({ type: "run_finished", game: "flutter", obstacles: final });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createFlutter(canvas, {
      onPhase: setPhase,
      onScore: setScore,
      onOver: (final) => finish(final),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true });
      finishRun(game.score, { obstacles: game.score }, { keepalive: true });
      if (game.score > 0) sendAchievementEvent({ type: "run_progress", game: "flutter", obstacles: game.score });
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
    if (event.key === " " || event.key === "ArrowUp" || event.key === "w" || event.key === "W" || event.key === "Enter") {
      if (!event.repeat) game.press();
      return true;
    }
    if (event.key === "p" || event.key === "P" || event.key === "Escape") {
      if (game.phase === "playing" || game.phase === "paused") {
        togglePause();
        return true;
      }
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
      game="flutter"
      title="Flutter"
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
      help="Tap, click or press Space to flap. Fly through the gaps between the crystal pillars; touching a pillar or the ground ends the run. P pauses."
    >
      <div className="arcade-stage [--stage-ratio:0.75]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Flutter playfield, score ${score}. Tap or press Space to flap.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
        />
        {phase === "ready" ? (
          <GameOverlay tone="quiet" title="Get ready">
            Tap, click or press Space to flap.
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
            Score {score}
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title="Game over" actions={<Button size="sm" onClick={() => gameRef.current?.press()}>Play again</Button>}>
            Score {score}
            {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest}`}
            <CoinReward state={coins} />
            <span className="mt-1 block text-xs">Tap or press Space to fly again.</span>
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
