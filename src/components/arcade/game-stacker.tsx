"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dailyDate, dailyVariant, seedFrom, seededRandom } from "@/lib/arcade-daily";
import { STACKER_CLASSIC } from "@/lib/arcade";
import type { MotionLevel } from "@/lib/preferences";
import { mix, observeCanvas, startLoop, withAlpha, type CanvasSize } from "./engine";
import { drawBlock, drawPerfect, drawScenery, pedestalColor, perfectDuration, sceneryInk, stackerTheme, type StackerTheme } from "./stacker-look";
import { DailyCountdown, formatDailyDate, useDailyDate } from "./daily";
import { GameOverlay, GameShell, Stat, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import { CoinReward, useArcadeRun } from "./coin-reward";
import type { SoundName } from "./sound";

/** Footprint of a fresh block, in world units. */
const BOX = 100;
/** Height of one slab. */
const SLAB = 14;
const PEDESTAL = 700;
/** The slider ping-pongs this far either side of the tower's center. */
const RANGE = 130;
/** Same tolerance for every mode: a drop this close to the block below lands flush. */
const PERFECT = 4;
/** Casual only: from the third perfect in a row, each one widens the block again by this much. */
const REGROW = 6;
const MIN_OVERLAP = 0.5;
const GRAVITY = 0.0016;
const DROP_GUARD_MS = 80;
const RESTART_LOCK_MS = 500;
const VIEW_W = 440;
const VIEW_H = 560;
const ISO = Math.cos(Math.PI / 6);
const MAX_DEBRIS = 24;

type Phase = "ready" | "playing" | "paused" | "over";
type Mode = "classic" | "casual" | "daily";
type Axis = "x" | "z";
type Block = { cx: number; cz: number; w: number; d: number; level: number; at: number; perfect: boolean };
type Mover = { axis: Axis; sign: 1 | -1; t0: number; speed: number };
type Debris = { cx: number; cz: number; w: number; d: number; y: number; vx: number; vz: number; vy: number; level: number; age: number };
type Ring = { cx: number; cz: number; w: number; d: number; y: number; at: number; delay: number; reach: number };

const RULES: Record<Mode, { label: string; title: string; regrow: boolean }> = {
  classic: { label: "Classic", title: "Strict rules: every trim is permanent", regrow: false },
  casual: { label: "Casual", title: "Perfect streaks of 3+ widen the block again", regrow: true },
  daily: { label: "Daily", title: "Today's seeded tower, classic rules", regrow: false },
};

const variantOf = (mode: Mode, runDate: string | null) =>
  mode === "daily" ? dailyVariant(runDate ?? dailyDate()) : mode === "classic" ? STACKER_CLASSIC : "";

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number, streak: number, bestStreak: number) => void;
  onStart: (runDate: string | null) => void;
  onOver: (score: number, perfectStreak: number, variant: string) => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel; theme: StackerTheme };
};

/** Distance travelled → offset that bounces between -RANGE and +RANGE. */
function pingPong(distance: number) {
  const u = ((distance % (RANGE * 4)) + RANGE * 4) % (RANGE * 4);
  return u < RANGE * 2 ? -RANGE + u : RANGE * 3 - u;
}

function createStacker(canvas: HTMLCanvasElement, hooks: Hooks, initialMode: Mode) {
  const ctx = canvas.getContext("2d");

  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let mode = initialMode;
  let runDate: string | null = null;
  let phase: Phase = "ready";
  let course = seededRandom(1);
  let tower: Block[] = [];
  let mover: Mover = { axis: "x", sign: 1, t0: 0, speed: 0.15 };
  let debris: Debris[] = [];
  let rings: Ring[] = [];
  let popup: { text: string; at: number; level: number } | null = null;
  let streak = 0;
  let bestStreak = 0;
  // Game clock: real time minus pauses, so the slider can be evaluated at any input timestamp.
  let clockOffset = 0;
  let frozenAt = 0;
  let lastDrop = -Infinity;
  let overAt = 0;
  let cam = 0;
  let prevCam = 0;
  let zoom = 1;
  let prevZoom = 1;

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const gameNow = () => (phase === "playing" ? performance.now() - clockOffset : frozenAt);
  const height = () => tower.length - 1;
  const top = () => tower[tower.length - 1];

  function makeMover(t0: number): Mover {
    const level = tower.length;
    // Two draws per level whatever happens, so a seeded tower is the same for everyone.
    const side = course();
    const jitter = course();
    const base = Math.min(0.28, 0.15 + height() * 0.0035);
    return { axis: level % 2 ? "x" : "z", sign: side < 0.5 ? 1 : -1, t0, speed: base * (0.94 + jitter * 0.12) };
  }

  function moverAt(t: number) {
    const below = top();
    const offset = mover.sign * pingPong(mover.speed * Math.max(0, t - mover.t0));
    return mover.axis === "x" ? { cx: below.cx + offset, cz: below.cz, offset } : { cx: below.cx, cz: below.cz + offset, offset };
  }

  function seedCourse() {
    const date = mode === "daily" ? (runDate ?? dailyDate()) : null;
    course = seededRandom(date ? seedFrom(`stacker:${date}`) : Math.floor(Math.random() * 2 ** 32));
  }

  const camTarget = () => (phase === "over" ? height() * SLAB * 0.5 + 30 : height() * SLAB);
  const zoomTarget = () => (phase === "over" ? Math.min(1, (VIEW_H * 0.5) / (height() * SLAB + 160)) : 1);

  function reset() {
    tower = [{ cx: 0, cz: 0, w: BOX, d: BOX, level: 0, at: 0, perfect: false }];
    debris = [];
    rings = [];
    popup = null;
    streak = 0;
    bestStreak = 0;
    frozenAt = 0;
    lastDrop = -Infinity;
    runDate = null;
    seedCourse();
    mover = makeMover(0);
    cam = prevCam = camTarget();
    zoom = prevZoom = 1;
    hooks.onScore(0, 0, 0);
  }

  function start() {
    runDate = mode === "daily" ? dailyDate() : null;
    seedCourse();
    tower = [tower[0]];
    mover = makeMover(0);
    frozenAt = 0;
    clockOffset = performance.now();
    hooks.onStart(runDate);
    setPhase("playing");
  }

  function addDebris(piece: Omit<Debris, "vy" | "age" | "y">, level: number) {
    debris.push({ ...piece, y: (level - 1) * SLAB, vy: 0, age: 0 });
    if (debris.length > MAX_DEBRIS) debris.shift();
  }

  /** Resolves a drop at game time `t` (the moment of the input, not the next frame). */
  function place(t: number) {
    const below = top();
    const level = tower.length;
    const live = hooks.live();
    const { cx, cz, offset } = moverAt(t);
    const span = mover.axis === "x" ? below.w : below.d;
    const now = performance.now();

    if (Math.abs(offset) <= PERFECT) {
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      let { w, d } = below;
      if (RULES[mode].regrow && streak >= 3) {
        if (mover.axis === "x") w = Math.min(BOX, w + REGROW);
        else d = Math.min(BOX, d + REGROW);
      }
      tower.push({ cx: below.cx, cz: below.cz, w, d, level, at: now, perfect: true });
      const count = live.effects === "full" ? Math.min(4, 1 + Math.floor(streak / 2)) : 1;
      for (let i = 0; i < count; i++) {
        rings.push({ cx: below.cx, cz: below.cz, w, d, y: level * SLAB, at: now, delay: i * 90, reach: 14 + Math.min(streak, 8) * 3 + i * 6 });
      }
      if (rings.length > 12) rings.splice(0, rings.length - 12);
      popup = { text: streak >= 2 ? `Perfect ×${streak}` : "Perfect", at: now, level };
      live.play("perfect", 1 + Math.min(streak - 1, 12) * 0.06);
      if (streak >= 3 && streak % 3 === 0) live.play("combo", 1 + Math.min(streak, 15) * 0.03);
    } else {
      streak = 0;
      const overlap = span - Math.abs(offset);
      const outward = Math.sign(offset) * 0.05;
      if (overlap < MIN_OVERLAP) {
        addDebris({ cx, cz, w: below.w, d: below.d, vx: mover.axis === "x" ? outward : 0, vz: mover.axis === "z" ? outward : 0, level }, level);
        frozenAt = gameNow();
        overAt = now;
        popup = null;
        setPhase("over");
        live.play("over");
        hooks.onOver(height(), bestStreak, variantOf(mode, runDate));
        return;
      }
      // What overlaps stays; the overhang breaks off on the side it stuck out.
      const keptCenter = offset / 2;
      const cutCenter = Math.sign(offset) * (span / 2 + Math.abs(offset) / 2);
      if (mover.axis === "x") {
        tower.push({ cx: below.cx + keptCenter, cz: below.cz, w: overlap, d: below.d, level, at: now, perfect: false });
        addDebris({ cx: below.cx + cutCenter, cz: below.cz, w: Math.abs(offset), d: below.d, vx: outward, vz: 0, level }, level);
      } else {
        tower.push({ cx: below.cx, cz: below.cz + keptCenter, w: below.w, d: overlap, level, at: now, perfect: false });
        addDebris({ cx: below.cx, cz: below.cz + cutCenter, w: below.w, d: Math.abs(offset), vx: 0, vz: outward, level }, level);
      }
      popup = null;
      live.play("thud", 0.9 + Math.min(height(), 40) * 0.008);
      live.play("chip", 0.9 + Math.random() * 0.2);
    }
    mover = makeMover(t);
    if (live.effects === "off") cam = prevCam = camTarget();
    hooks.onScore(height(), streak, bestStreak);
  }

  function step(ms: number) {
    prevCam = cam;
    prevZoom = zoom;
    if (phase === "paused") return;
    const effects = hooks.live().effects;
    const ease = (tau: number) => (effects === "off" ? 1 : 1 - Math.exp(-ms / tau));
    cam += (camTarget() - cam) * ease(phase === "over" ? 260 : 140);
    zoom += (zoomTarget() - zoom) * ease(320);
    for (const piece of debris) {
      piece.age += ms;
      if (effects === "off") continue;
      piece.vy -= GRAVITY * ms;
      piece.y += piece.vy * ms;
      piece.cx += piece.vx * ms;
      piece.cz += piece.vz * ms;
    }
    debris = debris.filter((piece) => piece.age < (effects === "off" ? 400 : 2400) && piece.y > cam - 900);
  }

  // ---- Drawing -----------------------------------------------------------------------------

  function face(points: [number, number, number][], fill: string) {
    if (!ctx) return;
    ctx.beginPath();
    points.forEach(([x, y, z], i) => {
      const sx = (x - z) * ISO;
      const sy = (x + z) * 0.5 - y;
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function box(cx: number, cz: number, w: number, d: number, y0: number, y1: number, color: string) {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    face([[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], mix(color, "#000000", 0.12));
    face([[x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [x1, y0, z0]], mix(color, "#000000", 0.32));
    face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], mix(color, "#ffffff", 0.2));
  }

  function outline(cx: number, cz: number, w: number, d: number, y: number) {
    if (!ctx) return;
    const pts: [number, number][] = [
      [cx - w / 2, cz - d / 2],
      [cx + w / 2, cz - d / 2],
      [cx + w / 2, cz + d / 2],
      [cx - w / 2, cz + d / 2],
    ];
    ctx.beginPath();
    pts.forEach(([x, z], i) => {
      const sx = (x - z) * ISO;
      const sy = (x + z) * 0.5 - y;
      if (i) ctx.lineTo(sx, sy);
      else ctx.moveTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();
  }

  function drawDebris(piece: Debris, theme: StackerTheme, scale: number) {
    if (!ctx) return;
    const fade = Math.max(0, 1 - Math.max(0, piece.age - 1400) / 1000);
    drawBlock(ctx, theme, { cx: piece.cx, cz: piece.cz, w: piece.w, d: piece.d, y0: piece.y, y1: piece.y + SLAB, level: piece.level, flash: 0, alpha: fade * 0.9, top: false }, scale);
  }

  function draw(alpha: number) {
    if (!ctx) return;
    const { effects, theme } = hooks.live();
    const now = performance.now();
    const { width: cw, height: ch, dpr } = size;
    const camera = prevCam + (cam - prevCam) * alpha;
    const scale = Math.min(cw / VIEW_W, ch / VIEW_H) * (prevZoom + (zoom - prevZoom) * alpha);
    const anchor = ch * 0.44;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawScenery(ctx, theme, cw, ch, camera, now, effects !== "off");

    ctx.save();
    ctx.translate(cw / 2, anchor);
    ctx.scale(scale, scale);
    ctx.translate(0, camera);
    ctx.lineJoin = "round";

    const below = top();
    const depth = below.cx + below.cz;
    const visible = (y: number) => {
      const screen = anchor + (camera - y) * scale;
      return screen > -BOX * scale && screen < ch + BOX * scale * 1.2;
    };

    // Pieces falling away behind the tower go first, those in front last.
    for (const piece of debris) if (piece.cx + piece.cz < depth) drawDebris(piece, theme, scale);

    // A soft floor shadow, then the pedestal and the tower bottom-up.
    if (visible(0)) {
      ctx.fillStyle = withAlpha("#000000", 0.18);
      ctx.beginPath();
      ctx.ellipse(0, 70, 150, 60, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    box(0, 0, BOX, BOX, -PEDESTAL, 0, pedestalColor(theme));
    for (let i = 1; i < tower.length; i++) {
      const block = tower[i];
      const y1 = block.level * SLAB;
      if (!visible(y1)) continue;
      const flash = block.perfect && effects !== "off" ? Math.max(0, 1 - (now - block.at) / 260) * 0.75 : 0;
      drawBlock(ctx, theme, { cx: block.cx, cz: block.cz, w: block.w, d: block.d, y0: y1 - SLAB, y1, level: block.level, flash, alpha: 1, top: i === tower.length - 1 }, scale);
    }

    // The top edge of the tower reads better with a thin highlight.
    ctx.lineWidth = 1.2 / scale;
    ctx.strokeStyle = withAlpha("#ffffff", 0.22);
    outline(below.cx, below.cz, below.w, below.d, below.level * SLAB);

    const duration = perfectDuration(theme);
    for (const ring of rings) {
      if (effects === "off") break;
      const t = (now - ring.at - ring.delay) / duration;
      if (t < 0 || t >= 1) continue;
      drawPerfect(ctx, theme, ring, t, effects === "full", scale);
    }

    if (phase !== "over") {
      const { cx, cz } = moverAt(gameNow());
      const level = tower.length;
      drawBlock(ctx, theme, { cx, cz, w: below.w, d: below.d, y0: (level - 1) * SLAB, y1: level * SLAB, level, flash: 0, alpha: 1, top: true }, scale);
    }

    for (const piece of debris) if (piece.cx + piece.cz >= depth) drawDebris(piece, theme, scale);

    if (popup && now - popup.at < 900) {
      const t = (now - popup.at) / 900;
      const rise = effects === "off" ? 0 : t * 22;
      ctx.font = `700 ${Math.round(17 / Math.max(0.6, zoom))}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = withAlpha(sceneryInk(theme), 1 - t);
      ctx.fillText(popup.text, (below.cx - below.cz) * ISO, (below.cx + below.cz) * 0.5 - popup.level * SLAB - 64 - rise);
    }
    ctx.restore();

    if (rings.length && now - rings[rings.length - 1].at > 2000) rings = [];
  }

  function pause() {
    if (phase !== "playing") return;
    frozenAt = gameNow();
    setPhase("paused");
  }

  function resume() {
    if (phase !== "paused") return;
    clockOffset = performance.now() - frozenAt;
    setPhase("playing");
  }

  /** A fresh tower, never from the same input that toppled the last one. */
  function restart() {
    if (phase === "over" && performance.now() - overAt < RESTART_LOCK_MS) return;
    if (phase !== "over" && phase !== "ready") return;
    reset();
    start();
  }

  reset();
  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
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
    get variant() {
      return variantOf(mode, runDate);
    },
    get bestStreak() {
      return bestStreak;
    },
    /** Space, tap or click. `timeStamp` is the input event's, so the drop lands where the block was then. */
    press(timeStamp?: number) {
      const realNow = performance.now();
      if (phase === "ready") return start();
      if (phase === "paused") return resume();
      if (phase === "over") return restart();
      if (realNow - lastDrop < DROP_GUARD_MS) return;
      lastDrop = realNow;
      const now = gameNow();
      const at = timeStamp && timeStamp > 0 && timeStamp <= realNow ? timeStamp - clockOffset : now;
      place(Math.min(now, Math.max(mover.t0, at)));
    },
    pause,
    resume,
    restart,
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

type StackerGame = ReturnType<typeof createStacker>;

const isActive = (phase: Phase) => phase === "playing" || phase === "paused";

export default function GameStacker({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects, look } = useArcade();
  const theme = useMemo(() => stackerTheme(look), [look]);
  const { records, submit } = useRecords("stacker", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<StackerGame | null>(null);
  const live = useRef({ play, effects, theme });
  const [phase, setPhase] = useState<Phase>("ready");
  const [mode, setMode] = useState<Mode>("classic");
  const [runDate, setRunDate] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const today = useDailyDate();
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("stacker");

  useGameAchievementTracking("stacker", phase);

  useEffect(() => {
    if (phase === "playing") beginRun();
  }, [phase, beginRun]);

  useEffect(() => {
    live.current = { play, effects, theme };
  });

  const finish = useEffectEvent((final: number, perfectStreak: number, variant: string) => {
    submit(final, { variant });
    finishRun(final, { height: final, perfectStreak });
    sendAchievementEvent({ type: "run_finished", game: "stacker", height: final, perfectStreak });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createStacker(
      canvas,
      {
        onPhase: setPhase,
        onScore: (next, run) => {
          setScore(next);
          setStreak(run);
        },
        onStart: setRunDate,
        onOver: (final, perfectStreak, variant) => finish(final, perfectStreak, variant),
        live: () => live.current,
      },
      "classic",
    );
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true, variant: game.variant });
      finishRun(game.score, { height: game.score, perfectStreak: game.bestStreak }, { keepalive: true });
      if (game.phase !== "over" && game.score > 0) {
        sendAchievementEvent({ type: "run_progress", game: "stacker", height: game.score, perfectStreak: game.bestStreak });
      }
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
    if (event.key === " " || event.key === "Enter" || event.key === "ArrowDown") {
      if (!event.repeat) game.press(event.timeStamp);
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
    gameRef.current?.press(event.timeStamp);
  }

  const daily = mode === "daily";
  const shownDate = phase !== "ready" && runDate ? runDate : today;
  const variant = daily ? dailyVariant(shownDate) : variantOf(mode, null);
  const best = records[variant] ?? 0;
  const shownBest = Math.max(best, score);
  const active = isActive(phase);

  return (
    <GameShell
      game="stacker"
      title="Tower Stacker"
      active={active}
      stats={
        <>
          <Stat label="Height" value={score} />
          <Stat label={daily ? (shownDate === today ? "Today's best" : "Daily best") : `${RULES[mode].label} best`} value={shownBest} highlight={score > 0 && score >= best} />
          <Stat label="Perfect streak" value={streak} highlight={streak >= 3} />
          <div role="group" aria-label="Mode" className="ml-auto flex flex-wrap items-center gap-1 self-center">
            {(Object.keys(RULES) as Mode[]).map((id) => (
              <Button
                key={id}
                size="sm"
                variant={mode === id ? "default" : "outline"}
                className="h-8 px-2.5"
                aria-pressed={mode === id}
                title={active ? "Finish or end this tower to switch" : RULES[id].title}
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
      help={`Click, tap or press Space to drop the sliding block; it lands where it was at the moment of your input. Only the part over the block below stays, and the overhang falls away. Land within ${PERFECT / BOX * 100}% of the block below for a perfect, which keeps the full width. Classic and Daily never give width back; Casual (its own records) widens the block again from three perfects in a row. Missing the tower ends the run. P pauses.`}
    >
      {daily ? (
        <p className="mb-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Daily tower · {formatDailyDate(shownDate)}</span>
          <span>Classic rules, the same slider sequence for everyone; retry as often as you like.</span>
          {shownDate === today ? <DailyCountdown /> : <span>This tower still counts for {formatDailyDate(shownDate)}.</span>}
        </p>
      ) : null}
      <div className="arcade-stage overscroll-contain [--stage-ratio:0.75]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Tower Stacker playfield (${RULES[mode].label}), height ${score}. Tap or press Space to drop the block.`}
          className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
          onContextMenu={(event) => event.preventDefault()}
        />
        {phase === "ready" ? (
          <GameOverlay tone="quiet" title={daily ? "Today's tower" : "Build up"}>
            Tap, click or press Space to start, then again to drop each block.
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
            Height {score}
          </GameOverlay>
        ) : phase === "over" ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
            <div role="status" className="w-full max-w-xs rounded-xl border border-border bg-background/80 px-4 py-3 text-center shadow-lg backdrop-blur-md">
              <p className="text-base font-bold tracking-tight">Height {score}</p>
              <p className="text-sm text-muted-foreground">
                {score > 0 && score >= best ? "New best!" : `Best ${shownBest}`}
                {` · ${RULES[mode].label}`}
              </p>
              <CoinReward state={coins} />
              <div className="pointer-events-auto mt-2 flex justify-center">
                <Button size="sm" onClick={restart}>
                  {daily ? "Retry tower" : "Play again"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </GameShell>
  );
}
