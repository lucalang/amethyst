"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dailyDate, dailyVariant, seedFrom, seededRandom } from "@/lib/arcade-daily";
import type { MotionLevel } from "@/lib/preferences";
import { fitWorld, observeCanvas, startLoop, withAlpha, type CanvasSize } from "./engine";
import { GAP, GROUND, HEIGHT, PIPE_W, TIP, WIDTH, drawCharacter, drawGround, drawObstacle, drawSky, drawTrail, flutterTheme, sceneryOf, type FlutterTheme } from "./flutter-look";
import { GAME_PALETTES } from "./palettes";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { DailyCountdown, formatDailyDate, useDailyDate } from "./daily";
import { GameOverlay, GameShell, Stat, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import type { SoundName } from "./sound";

const BIRD_X = 130;
const RADIUS = 15;
/** The bird's hitbox: a circle a little inside the drawn body, so grazes are forgiven. Every character shares it. */
const HIT_RADIUS = 12.5;
/** Fall speed gained per 60 Hz step; everything below advances in fixed steps, whatever the display rate. */
const GRAVITY = 0.42;
const FLAP = -7.6;
const MAX_FALL = 11;
const SPACING = 210;
const SPEED = 2.6;
const GAP_MIN = GAP / 2 + 60;
const GAP_MAX = GROUND - GAP / 2 - 50;
/** Steps per countdown number after resuming (3, 2, 1). */
const COUNT_STEPS = 36;
/** Bird positions remembered for the cosmetic flight trail. */
const TRAIL_LENGTH = 26;

type Mode = "classic" | "daily";
type Phase = "ready" | "playing" | "paused" | "countdown" | "over";
type Pipe = { x: number; prevX: number; gapY: number; scored: boolean };

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number) => void;
  /** A run started; `date` is the daily course it counts for (kept even if midnight passes). */
  onStart: (date: string | null) => void;
  onOver: (score: number, date: string | null) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel; theme: FlutterTheme };
};

/**
 * The next pillar's gap. Neighbouring gaps never differ by more than a reachable climb or drop, and
 * the first pillars ease in, so there are no sudden spikes. `random` is the course's own generator.
 */
function nextGap(random: () => number, previous: number | null, index: number) {
  if (previous === null) return (GAP_MIN + GAP_MAX) / 2;
  const reach = Math.min(130, 70 + index * 15);
  let gap = previous + (random() * 2 - 1) * reach;
  if (gap < GAP_MIN) gap = GAP_MIN + (GAP_MIN - gap);
  if (gap > GAP_MAX) gap = GAP_MAX - (gap - GAP_MAX);
  return Math.min(GAP_MAX, Math.max(GAP_MIN, gap));
}

function distanceToSegmentSq(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const x = ax + t * dx - px;
  const y = ay + t * dy - py;
  return x * x + y * y;
}

/** Whether a circle touches a convex polygon (points in order). */
function circleHitsPolygon(cx: number, cy: number, r: number, points: [number, number][]) {
  let inside = true;
  for (let i = 0; i < points.length; i += 1) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    if (distanceToSegmentSq(cx, cy, ax, ay, bx, by) <= r * r) return true;
    if ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax) < 0) inside = false;
  }
  return inside;
}

/** The pillars' outlines exactly as drawn (prisms with a pointed end toward the gap). */
function pillarShapes(pipe: Pipe): [number, number][][] {
  const left = pipe.x - PIPE_W / 2;
  const right = pipe.x + PIPE_W / 2;
  const top = pipe.gapY - GAP / 2;
  const bottom = pipe.gapY + GAP / 2;
  return [
    [
      [left, -HEIGHT],
      [right, -HEIGHT],
      [right, top - TIP],
      [pipe.x, top],
      [left, top - TIP],
    ],
    [
      [left, bottom + TIP],
      [pipe.x, bottom],
      [right, bottom + TIP],
      [right, HEIGHT * 2],
      [left, HEIGHT * 2],
    ],
  ];
}

function createFlutter(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const colors = GAME_PALETTES.flutter;

  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let phase: Phase = "ready";
  let mode: Mode = "classic";
  let runDate: string | null = null;
  // Obstacles use their own generator (seeded for the daily course); nothing cosmetic draws from it.
  let course: () => number = Math.random;
  let pipesMade = 0;
  let pipes: Pipe[] = [];
  let score = 0;
  let frame = 0;
  let birdY = HEIGHT / 2;
  let velocity = 0;
  let prevY = birdY;
  let flapQueued = false;
  let countdown = 0;
  let scroll = 0;
  let prevScroll = 0;
  let flapAt = -1000;
  let diedAt = 0;
  // Cosmetic only: recent bird heights and the scroll at which each was recorded.
  let trail: { y: number; s: number }[] = [];

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };

  function makePipe(x: number, previousGap: number | null): Pipe {
    const gapY = nextGap(course, previousGap, pipesMade);
    pipesMade += 1;
    return { x, prevX: x, gapY, scored: false };
  }

  function reset() {
    pipes = [];
    pipesMade = 0;
    score = 0;
    frame = 0;
    birdY = HEIGHT / 2;
    velocity = 0;
    prevY = birdY;
    flapQueued = false;
    runDate = null;
    trail = [];
    hooks.onScore(0);
    setPhase("ready");
  }

  /** Every run starts from the same spot; a daily run fixes its date and course now. */
  function start() {
    runDate = mode === "daily" ? dailyDate() : null;
    course = runDate ? seededRandom(seedFrom(`flutter:${runDate}`)) : Math.random;
    birdY = HEIGHT / 2;
    velocity = 0;
    flapQueued = true;
    hooks.onStart(runDate);
    setPhase("playing");
  }

  function die() {
    diedAt = performance.now();
    flapQueued = false;
    setPhase("over");
    hooks.live().play("hit");
    window.setTimeout(() => hooks.live().play("over"), 260);
    hooks.onOver(score, runDate);
  }

  function fall() {
    velocity = Math.min(MAX_FALL, velocity + GRAVITY);
    birdY += velocity;
  }

  function step() {
    prevScroll = scroll;
    prevY = birdY;
    for (const pipe of pipes) pipe.prevX = pipe.x;
    if (phase === "ready" || phase === "playing") {
      trail.unshift({ y: birdY, s: scroll });
      if (trail.length > TRAIL_LENGTH) trail.pop();
    }
    if (phase === "ready") {
      frame += 1;
      scroll += SPEED;
      birdY = HEIGHT / 2 + Math.sin(frame / 14) * 8;
      return;
    }
    // Paused: physics, spawning and timers all stand still.
    if (phase === "paused") return;
    if (phase === "countdown") {
      countdown -= 1;
      if (countdown > 0 && countdown % COUNT_STEPS === 0) hooks.live().play("move");
      if (countdown <= 0) setPhase("playing");
      return;
    }
    if (phase === "over") {
      if (birdY + RADIUS < GROUND) fall();
      if (birdY + RADIUS >= GROUND) {
        birdY = GROUND - RADIUS;
        velocity = 0;
      }
      return;
    }

    // Input is applied at the start of a step, so a flap behaves the same at any frame rate.
    if (flapQueued) {
      flapQueued = false;
      velocity = FLAP;
      flapAt = performance.now();
      hooks.live().play("flap");
    }
    fall();
    if (birdY - RADIUS < 0) {
      birdY = RADIUS;
      velocity = 0;
    }
    scroll += SPEED;

    for (const pipe of pipes) {
      pipe.x -= SPEED;
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

    if (birdY + HIT_RADIUS >= GROUND) {
      birdY = Math.min(birdY, GROUND - RADIUS);
      return die();
    }
    for (const pipe of pipes) {
      if (Math.abs(pipe.x - BIRD_X) > PIPE_W / 2 + HIT_RADIUS) continue;
      if (pillarShapes(pipe).some((shape) => circleHitsPolygon(BIRD_X, birdY, HIT_RADIUS, shape))) return die();
    }
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

    const theme = hooks.live().theme;
    const animate = effects !== "off";
    const now = performance.now();
    const offset = prevScroll + (scroll - prevScroll) * alpha;
    drawSky(ctx, theme, offset, now, animate);

    for (const pipe of pipes) {
      const x = pipe.prevX + (pipe.x - pipe.prevX) * alpha - PIPE_W / 2;
      ctx.save();
      ctx.translate(x, 0);
      drawObstacle(ctx, theme, pipe.gapY, Math.round(pipe.gapY), now, animate);
      ctx.restore();
    }

    drawGround(ctx, theme, offset);

    // Flight trail: purely decorative, recorded from past bird positions.
    if (animate && phase !== "over") {
      const points = trail.map((p) => ({ x: BIRD_X - 6 - (offset - p.s), y: p.y }));
      drawTrail(ctx, theme, points, now, effects === "subtle");
    }

    // The character: drawn around the same point and inside the same circle as the hitbox.
    const y = prevY + (birdY - prevY) * alpha;
    const angle = phase === "ready" ? 0 : Math.max(-0.5, Math.min(1.2, velocity * 0.08));
    const wing = effects === "off" ? 0 : phase === "over" ? 0 : Math.sin(Math.min(1, (now - flapAt) / 220) * Math.PI) * 0.9 + (phase === "ready" ? Math.sin(now / 90) * 0.4 : 0);
    ctx.save();
    ctx.translate(BIRD_X, y);
    ctx.rotate(angle);
    drawCharacter(ctx, theme, wing, phase === "over", now, animate);
    ctx.restore();

    if (phase !== "ready") {
      const scenery = sceneryOf(theme);
      ctx.font = "700 54px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 6;
      ctx.strokeStyle = scenery.outline;
      ctx.strokeText(String(score), WIDTH / 2, 78);
      ctx.fillStyle = withAlpha(scenery.text, 0.9);
      ctx.fillText(String(score), WIDTH / 2, 78);
    }

    if (phase === "countdown") {
      const count = String(Math.ceil(countdown / COUNT_STEPS));
      ctx.fillStyle = withAlpha(colors.background, 0.35);
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.font = "800 120px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 10;
      ctx.strokeStyle = withAlpha(colors.foreground, 0.5);
      ctx.strokeText(count, WIDTH / 2, HEIGHT / 2 - 40);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(count, WIDTH / 2, HEIGHT / 2 - 40);
      ctx.textBaseline = "alphabetic";
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
    get runDate() {
      return runDate;
    },
    /**
     * Tap / click / Space: start, flap or restart. Presses while paused or counting down do
     * nothing, so resuming never flaps; several presses within one step make a single flap.
     */
    press() {
      if (phase === "ready") start();
      else if (phase === "playing") flapQueued = true;
      else if (phase === "over" && performance.now() - diedAt > 400) {
        reset();
        start();
      }
    },
    /** Freezes the run (also during the resume countdown). */
    pause() {
      if (phase !== "playing" && phase !== "countdown") return;
      flapQueued = false;
      setPhase("paused");
    },
    /** Resumes after a short countdown. */
    resume() {
      if (phase !== "paused") return;
      flapQueued = false;
      countdown = COUNT_STEPS * 3;
      setPhase("countdown");
    },
    /** Classic or the daily course; only between runs. */
    setMode(next: Mode) {
      if (phase !== "ready" && phase !== "over") return;
      mode = next;
      reset();
    },
    destroy() {
      stopLoop();
      stopResize();
    },
  };
}

type FlutterGame = ReturnType<typeof createFlutter>;

const isActive = (phase: Phase) => phase === "playing" || phase === "paused" || phase === "countdown";

export default function GameFlutter({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects, rootRef, look } = useArcade();
  const theme = useMemo(() => flutterTheme(look), [look]);
  const { records, submit } = useRecords("flutter", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FlutterGame | null>(null);
  const live = useRef({ play, effects, theme });
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [mode, setMode] = useState<Mode>("classic");
  const [runDate, setRunDate] = useState<string | null>(null);
  const today = useDailyDate();
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("flutter");

  useGameAchievementTracking("flutter", phase);

  useEffect(() => {
    if (phase === "playing") beginRun();
  }, [phase, beginRun]);

  useEffect(() => {
    live.current = { play, effects, theme };
  });

  const finish = useEffectEvent((final: number, date: string | null) => {
    submit(final, { variant: date ? dailyVariant(date) : "" });
    finishRun(final, { obstacles: final });
    sendAchievementEvent({ type: "run_finished", game: "flutter", obstacles: final });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createFlutter(canvas, {
      onPhase: setPhase,
      onScore: setScore,
      onStart: setRunDate,
      onOver: (final, date) => finish(final, date),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true, variant: game.runDate ? dailyVariant(game.runDate) : "" });
      finishRun(game.score, { obstacles: game.score }, { keepalive: true });
      if (game.score > 0) sendAchievementEvent({ type: "run_progress", game: "flutter", obstacles: game.score });
      game.destroy();
      gameRef.current = null;
    };
  }, [submit, finishRun]);

  // Pause at once when the tab is hidden or the window loses focus, or when a menu or dialog takes focus.
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

  function chooseMode(next: Mode) {
    const game = gameRef.current;
    if (!game || isActive(game.phase)) return;
    game.setMode(next);
    setMode(next);
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
      if (isActive(game.phase)) {
        if (!event.repeat) togglePause();
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

  const shownDate = phase !== "ready" && runDate ? runDate : today;
  const daily = phase === "ready" ? mode === "daily" : runDate !== null;
  const best = records[daily ? dailyVariant(shownDate) : ""] ?? 0;
  const shownBest = Math.max(best, score);
  const active = isActive(phase);

  return (
    <GameShell
      game="flutter"
      title="Flutter"
      active={active}
      stats={
        <>
          <Stat label="Score" value={score} />
          <Stat label={daily ? (shownDate === today ? "Today's best" : "Daily best") : "Best"} value={shownBest} highlight={score > 0 && score >= best} />
          <div role="group" aria-label="Course" className="ml-auto flex items-center gap-1 self-center">
            {([
              ["classic", "Classic", "A new course every run"],
              ["daily", "Daily", "Daily course: the same pillars for everyone, new every day at 00:00 UTC"],
            ] as const).map(([id, label, title]) => (
              <Button
                key={id}
                size="sm"
                variant={mode === id ? "default" : "outline"}
                className="h-8 px-2.5"
                aria-pressed={mode === id}
                title={active ? "Finish or end this run to switch" : title}
                disabled={active}
                onClick={() => chooseMode(id)}
              >
                {label}
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
      help="Tap, click or press Space to flap. Fly through the gaps between the crystal pillars; touching a pillar or the ground ends the run. P or Esc pauses, and the game also pauses when you switch away; it resumes only when you choose, after a short countdown."
    >
      {daily ? (
        <p className="mb-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Daily course · {formatDailyDate(shownDate)}</span>
          <span>The same pillars for everyone; retry as often as you like.</span>
          {shownDate === today ? <DailyCountdown /> : <span>This run still counts for {formatDailyDate(shownDate)}.</span>}
        </p>
      ) : null}
      <div className="arcade-stage [--stage-ratio:0.75]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Flutter playfield, score ${score}. Tap or press Space to flap.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
        />
        {phase === "ready" ? (
          <GameOverlay tone="quiet" title={mode === "daily" ? "Today's course" : "Get ready"}>
            Tap, click or press Space to flap.
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
            Score {score}
            <span className="mt-1 block text-xs">A short countdown runs before you fly again.</span>
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title="Game over" actions={<Button size="sm" onClick={() => gameRef.current?.press()}>{daily ? "Retry course" : "Play again"}</Button>}>
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
