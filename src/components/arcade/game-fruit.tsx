"use client";

import { useEffect, useEffectEvent, useRef, useState, type PointerEvent } from "react";
import Matter from "matter-js";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MotionLevel } from "@/lib/preferences";
import { fitWorld, livePalette, mix, observeCanvas, random, startLoop, withAlpha, type CanvasSize } from "./engine";
import { GameOverlay, GameShell, Stat, useArcade, useAway, useGameKeys, useRecord } from "./game-shell";
import type { SoundName } from "./sound";

const HEIGHT = 600;
const MAX_MISSES = 3;
const COMBO_WINDOW = 200;
const TRAIL_MS = 120;

type Phase = "ready" | "playing" | "paused" | "over";
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

type Fruit = { body: Matter.Body; prev: Matter.Vector; kind: Kind | null; launched: number };
type Half = { body: Matter.Body; prev: Matter.Vector; kind: Kind; side: 1 | -1 };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Popup = { x: number; y: number; text: string; life: number };
type Point = { x: number; y: number; t: number };

type Hooks = {
  onPhase: (phase: Phase) => void;
  onScore: (score: number, misses: number) => void;
  onOver: (score: number, reason: "bomb" | "misses") => void;
  live: () => { play: (name: SoundName, pitch?: number) => void; effects: MotionLevel };
};

function createFruit(canvas: HTMLCanvasElement, hooks: Hooks) {
  const ctx = canvas.getContext("2d");
  const palette = livePalette(canvas);
  // ~0.3 px/step of extra fall speed per 60 Hz step.
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 1, scale: 0.00108 } });
  const options = { collisionFilter: { mask: 0 }, frictionAir: 0 };

  let size: CanvasSize = { width: 1, height: 1, dpr: 1 };
  let width = 800;
  let phase: Phase = "ready";
  let fruits: Fruit[] = [];
  let halves: Half[] = [];
  let particles: Particle[] = [];
  let popups: Popup[] = [];
  let trail: Point[] = [];
  let score = 0;
  let misses = 0;
  let launchedFruit = 0;
  let time = 0;
  let nextWave = 700;
  let queue: { at: number; bomb: boolean }[] = [];
  let combo = { count: 0, last: 0, x: 0, y: 0 };
  let flashAt = -1000;
  let flashColor = "#ffffff";

  const setPhase = (next: Phase) => {
    phase = next;
    hooks.onPhase(next);
  };
  const report = () => hooks.onScore(score, misses);

  function clearBodies() {
    Matter.Composite.clear(engine.world, false);
    fruits = [];
    halves = [];
    particles = [];
    popups = [];
  }

  function reset() {
    clearBodies();
    score = 0;
    misses = 0;
    launchedFruit = 0;
    time = 0;
    nextWave = 500;
    queue = [];
    combo = { count: 0, last: 0, x: 0, y: 0 };
    report();
  }

  function launch(bomb: boolean) {
    const kind = bomb ? null : KINDS[Math.floor(Math.random() * KINDS.length)];
    const radius = kind?.radius ?? 28;
    const x = random(width * 0.15, width * 0.85);
    const body = Matter.Bodies.circle(x, HEIGHT + radius + 10, radius, options);
    // Peak somewhere between 30% and 75% up the screen, drifting toward the middle.
    Matter.Body.setVelocity(body, { x: ((width / 2 - x) / 100) * random(0.3, 1.1), y: -random(13.5, 17) });
    Matter.Body.setAngularVelocity(body, random(-0.08, 0.08));
    Matter.Composite.add(engine.world, body);
    fruits.push({ body, prev: { ...body.position }, kind, launched: time });
    if (!bomb) launchedFruit += 1;
    hooks.live().play("tap", bomb ? 0.6 : 0.8);
  }

  function burst(x: number, y: number, color: string, count: number, speed: number) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const v = random(speed * 0.4, speed);
      particles.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 1.5, life: 1, color, size: random(2, 4.5) });
    }
  }

  function over(reason: "bomb" | "misses") {
    setPhase("over");
    trail = [];
    hooks.onOver(score, reason);
    if (reason === "misses") window.setTimeout(() => hooks.live().play("over"), 200);
  }

  function cut(fruit: Fruit, from: Point, to: Point) {
    const { body, kind } = fruit;
    Matter.Composite.remove(engine.world, body);
    fruits = fruits.filter((item) => item !== fruit);
    const effects = hooks.live().effects;
    if (!kind) {
      flashAt = performance.now();
      flashColor = "#ffffff";
      if (effects !== "off") burst(body.position.x, body.position.y, "#ffb347", effects === "full" ? 26 : 10, 9);
      hooks.live().play("bomb");
      over("bomb");
      return;
    }
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    for (const side of [1, -1] as const) {
      const half = Matter.Bodies.circle(body.position.x + normal.x * side * 4, body.position.y + normal.y * side * 4, kind.radius, options);
      Matter.Body.setAngle(half, angle);
      Matter.Body.setVelocity(half, { x: body.velocity.x + normal.x * side * 2.4, y: body.velocity.y + normal.y * side * 2.4 });
      Matter.Body.setAngularVelocity(half, side * random(0.02, 0.06));
      Matter.Composite.add(engine.world, half);
      halves.push({ body: half, prev: { ...half.position }, kind, side });
    }
    if (effects !== "off") burst(body.position.x, body.position.y, kind.flesh, effects === "full" ? 12 : 5, 5);
    score += 1;
    const now = performance.now();
    combo = now - combo.last <= COMBO_WINDOW ? { count: combo.count + 1, last: now, x: body.position.x, y: body.position.y } : { count: 1, last: now, x: body.position.x, y: body.position.y };
    hooks.live().play("slice", 0.9 + Math.min(combo.count, 6) * 0.08);
    report();
  }

  function step(ms: number) {
    if (phase === "paused" || phase === "ready") return;
    time += ms;
    for (const item of [...fruits, ...halves]) item.prev = { ...item.body.position };
    Matter.Engine.update(engine, 1000 / 60);

    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.life -= ms / 650;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const popup of popups) popup.life -= ms / 900;
    popups = popups.filter((popup) => popup.life > 0);
    halves = halves.filter((half) => {
      if (half.body.position.y < HEIGHT + 120) return true;
      Matter.Composite.remove(engine.world, half.body);
      return false;
    });
    if (phase !== "playing") return;

    if (combo.count >= 3 && performance.now() - combo.last > COMBO_WINDOW) {
      score += combo.count;
      popups.push({ x: combo.x, y: combo.y - 20, text: `${combo.count}× combo +${combo.count}`, life: 1 });
      hooks.live().play("combo", 1 + Math.min(combo.count, 8) * 0.05);
      combo = { ...combo, count: 0 };
      report();
    }

    for (const fruit of [...fruits]) {
      const { body } = fruit;
      if (body.velocity.y <= 0 || body.position.y < HEIGHT + body.circleRadius! + 20) continue;
      Matter.Composite.remove(engine.world, body);
      fruits = fruits.filter((item) => item !== fruit);
      if (!fruit.kind) continue;
      misses += 1;
      hooks.live().play("miss");
      popups.push({ x: Math.min(width - 40, Math.max(40, body.position.x)), y: HEIGHT - 40, text: "Missed!", life: 1 });
      report();
      if (misses >= MAX_MISSES) return over("misses");
    }

    if (time >= nextWave) {
      const most = Math.min(4, 1 + Math.floor(score / 12));
      const count = 1 + Math.floor(Math.random() * most);
      let fruitInWave = false;
      for (let i = 0; i < count; i += 1) {
        const bombChance = launchedFruit >= 5 ? Math.min(0.2, 0.08 + score * 0.002) : 0;
        const bomb: boolean = (i < count - 1 || fruitInWave) && Math.random() < bombChance;
        fruitInWave ||= !bomb;
        queue.push({ at: time + i * 140, bomb });
      }
      nextWave = time + Math.max(750, 1600 - score * 12) + count * 140;
    }
    const due = queue.filter((item) => item.at <= time);
    queue = queue.filter((item) => item.at > time);
    for (const item of due) launch(item.bomb);
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

  function drawBomb(c: CanvasRenderingContext2D, now: number, accent2: string, effects: MotionLevel) {
    const r = 28;
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
    c.fillStyle = Math.floor(now / 90) % 2 ? "#ffd166" : accent2;
    c.beginPath();
    c.arc(14, -r - 14, 4.5, 0, Math.PI * 2);
    c.fill();
  }

  function draw(alpha: number) {
    if (!ctx) return;
    const colors = palette();
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

    const lerp = ({ body, prev }: { body: Matter.Body; prev: Matter.Vector }) => ({
      x: prev.x + (body.position.x - prev.x) * alpha,
      y: prev.y + (body.position.y - prev.y) * alpha,
    });
    const moving = phase === "playing" || phase === "over";

    for (const half of halves) {
      const p = moving ? lerp(half) : half.body.position;
      const r = half.kind.radius;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(half.body.angle);
      const start = half.side === 1 ? 0 : Math.PI;
      ctx.fillStyle = half.kind.skin;
      ctx.beginPath();
      ctx.arc(0, 0, r, start, start + Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = half.kind.flesh;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.82, start, start + Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const fruit of fruits) {
      const p = moving ? lerp(fruit) : fruit.body.position;
      ctx.save();
      ctx.translate(p.x, p.y);
      if (fruit.kind) {
        ctx.rotate(fruit.body.angle);
        drawFruit(ctx, fruit.kind);
      } else {
        drawBomb(ctx, now, colors.accent2, effects);
      }
      ctx.restore();
    }

    for (const p of particles) {
      ctx.fillStyle = withAlpha(p.color, Math.max(0, p.life) * 0.8);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }

    // Swipe trail: thin and short-lived so it never hides fruit.
    trail = trail.filter((point) => now - point.t < TRAIL_MS);
    if (trail.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < trail.length; i += 1) {
        const fade = 1 - (now - trail[i].t) / TRAIL_MS;
        ctx.strokeStyle = withAlpha(colors.accent2, 0.75 * fade);
        ctx.lineWidth = 1 + 5 * fade;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
        ctx.strokeStyle = withAlpha("#ffffff", 0.85 * fade);
        ctx.lineWidth = 0.5 + 1.5 * fade;
        ctx.stroke();
      }
    }

    ctx.textAlign = "center";
    for (const popup of popups) {
      ctx.font = "700 22px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = withAlpha(popup.text === "Missed!" ? "#ff6b6b" : colors.foreground, Math.min(1, popup.life * 1.6));
      ctx.fillText(popup.text, popup.x, popup.y - (effects === "off" ? 0 : (1 - popup.life) * 30));
    }

    // Misses, top right.
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

    const flash = Math.max(0, 1 - (now - flashAt) / 400);
    if (flash > 0 && effects !== "off") {
      ctx.fillStyle = withAlpha(flashColor, flash * (effects === "full" ? 0.6 : 0.25));
      ctx.fillRect(0, 0, width, HEIGHT);
    }
    ctx.restore();
  }

  const stopResize = observeCanvas(canvas, (next) => {
    size = next;
    width = Math.min(1000, Math.max(400, (next.width / next.height) * HEIGHT));
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
    /** Client coordinates → world coordinates. */
    toWorld(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const view = fitWorld(size, width, HEIGHT);
      return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
    },
    /** One swipe segment: every fruit or bomb crossing it is cut. */
    swipe(from: { x: number; y: number }, to: { x: number; y: number }) {
      const now = performance.now();
      trail.push({ ...to, t: now });
      if (trail.length > 40) trail.shift();
      if (phase !== "playing") return;
      if (Math.hypot(to.x - from.x, to.y - from.y) < 2) return;
      const bodies = fruits.map((fruit) => fruit.body);
      const hits = new Set<Matter.Body>();
      for (const collision of Matter.Query.ray(bodies, from, to, 8)) {
        if (bodies.includes(collision.bodyA)) hits.add(collision.bodyA);
        if (bodies.includes(collision.bodyB)) hits.add(collision.bodyB);
      }
      for (const body of hits) {
        const fruit = fruits.find((item) => item.body === body);
        if (!fruit) continue;
        cut(fruit, { ...from, t: now }, { ...to, t: now });
        if (phase !== "playing") break;
      }
    },
    beginTrail(point: { x: number; y: number }) {
      trail = [{ ...point, t: performance.now() }];
    },
    start() {
      if (phase === "ready") setPhase("playing");
      else if (phase === "paused") setPhase("playing");
    },
    pause() {
      if (phase === "playing") {
        setPhase("paused");
        trail = [];
      }
    },
    restart() {
      reset();
      setPhase("playing");
    },
    destroy() {
      stopLoop();
      stopResize();
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    },
  };
}

type FruitGame = ReturnType<typeof createFruit>;

export default function GameFruit({ best: initialBest }: { best: number | null }) {
  const { play, effects } = useArcade();
  const { best, submit } = useRecord("fruit-slice", initialBest);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<FruitGame | null>(null);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const live = useRef({ play, effects });
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [reason, setReason] = useState<"bomb" | "misses">("misses");

  useEffect(() => {
    live.current = { play, effects };
  });

  const finish = useEffectEvent((final: number, why: "bomb" | "misses") => {
    setReason(why);
    submit(final);
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
      onOver: (final, why) => finish(final, why),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true });
      game.destroy();
      gameRef.current = null;
    };
  }, [submit]);

  useAway(() => gameRef.current?.pause());

  function togglePause() {
    const game = gameRef.current;
    if (game?.phase === "playing") game.pause();
    else game?.start();
    canvasRef.current?.focus({ preventScroll: true });
  }

  function restart() {
    gameRef.current?.restart();
    canvasRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const game = gameRef.current;
    if (!game || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === " " || event.key === "Enter") {
      if (event.repeat) return true;
      if (game.phase === "over") restart();
      else togglePause();
      return true;
    }
    if ((event.key === "p" || event.key === "P" || event.key === "Escape") && (game.phase === "playing" || game.phase === "paused")) {
      togglePause();
      return true;
    }
    return false;
  });

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const game = gameRef.current;
    if (!game || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasRef.current?.focus({ preventScroll: true });
    if (game.phase === "ready") game.start();
    const point = game.toWorld(event.clientX, event.clientY);
    pointer.current = { id: event.pointerId, ...point };
    game.beginTrail(point);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const game = gameRef.current;
    const last = pointer.current;
    if (!game || !last || last.id !== event.pointerId) return;
    const samples = typeof event.nativeEvent.getCoalescedEvents === "function" ? event.nativeEvent.getCoalescedEvents() : [];
    let from = { x: last.x, y: last.y };
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      const to = game.toWorld(sample.clientX, sample.clientY);
      game.swipe(from, to);
      from = to;
    }
    pointer.current = { id: event.pointerId, ...from };
  }

  function onPointerUp() {
    pointer.current = null;
  }

  const shownBest = Math.max(best, score);

  return (
    <GameShell
      title="Fruit Slice"
      stats={
        <>
          <Stat label="Score" value={score} />
          <Stat label="Best" value={shownBest} highlight={score > 0 && score >= best} />
          <Stat label="Missed" value={`${misses} / ${MAX_MISSES}`} className={misses === MAX_MISSES - 1 ? "border-destructive/50" : undefined} />
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
      help="Drag the mouse or swipe your finger through fruit to slice it; three or more in one quick swipe is a combo bonus. Missing 3 fruit ends the run, and slicing a bomb (dark, with a red cross) ends it instantly. P pauses."
    >
      <div className="arcade-stage [--stage-ratio:0.8] md:[--stage-ratio:1.6]">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          aria-label={`Fruit Slice playfield, score ${score}, ${misses} of ${MAX_MISSES} fruit missed.`}
          className="absolute inset-0 size-full cursor-crosshair touch-none rounded-xl outline-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        {phase === "ready" ? (
          <GameOverlay tone="quiet" title="Swipe to start" actions={<Button size="sm" onClick={() => gameRef.current?.start()}>Start</Button>}>
            Slice fruit before it falls. Missing {MAX_MISSES} fruit ends the run; slicing a bomb ends it instantly.
          </GameOverlay>
        ) : phase === "paused" ? (
          <GameOverlay title="Paused" actions={<Button size="sm" onClick={togglePause} autoFocus>Resume</Button>}>
            Score {score}
          </GameOverlay>
        ) : phase === "over" ? (
          <GameOverlay title={reason === "bomb" ? "Boom! You hit a bomb" : `${MAX_MISSES} fruit missed`} actions={<Button size="sm" onClick={restart}>Play again</Button>}>
            Score {score}
            {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest}`}
          </GameOverlay>
        ) : null}
      </div>
    </GameShell>
  );
}
