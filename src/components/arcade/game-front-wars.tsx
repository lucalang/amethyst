"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { Anchor, Building2, Crosshair, Flag, MapPin, Pause, Play, RotateCcw, Shield, Swords, Trophy, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameOverlay, GameShell, Stat, useAway, useArcade, useGameAchievementTracking, useGameKeys, useRecord } from "./game-shell";
import { observeCanvas, startLoop, type CanvasSize } from "./engine";
import {
  BOT_COUNTS,
  CITY_TROOPS,
  DIFFICULTIES,
  MAPS,
  MAX_BOATS,
  RETREAT_COST,
  SPAWN_TICKS,
  TERRAIN_LABEL,
  TICK_SECONDS,
  WATER,
  WIN_SHARE,
  build,
  chooseSpawn,
  cityCost,
  compactNumber as compact,
  createGame,
  goldPerTick,
  immune,
  launchAttack,
  matchScore,
  maxTroops,
  postCost,
  retreat,
  share,
  step,
  troopsAttacking,
  type Difficulty,
  type Game,
  type Kind,
  type MapKind,
  type Settings,
} from "./front-wars/engine";
import { MapRenderer, drawFrame, type Ping, type View } from "./front-wars/render";
import "./front-wars/front-wars.css";

type Phase = "setup" | "playing" | "paused" | "over";
type Mode = "attack" | "city" | "post";
type Hud = {
  stage: "spawn" | "battle";
  spawnLeft: number;
  protectedNow: boolean;
  spawned: boolean;
  troops: number;
  cap: number;
  attacking: number;
  gold: number;
  income: number;
  share: number;
  time: number;
  cityCost: number;
  postCost: number;
  rank: number;
  alive: number;
  leaders: { id: number; name: string; color: string; kind: Kind; share: number; troops: number }[];
  attacks: { id: number; target: string; troops: number }[];
  boats: { id: number; troops: number }[];
};
type Result = { won: boolean; score: number; best: boolean; time: number; peak: number; message: string };

const SETTINGS_KEY = "front-wars:settings:v2";
const DEFAULT_SETTINGS: Settings = { map: "world", bots: 200, nations: true, difficulty: "normal" };
const MAX_SCALE = 30;
const percent = (value: number) => `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const KIND_LABEL: Record<Kind, string> = { human: "You", nation: "Nation", bot: "Bot" };

function loadSettings(): Settings {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<Settings> | null;
    if (
      saved &&
      saved.map &&
      saved.map in MAPS &&
      saved.difficulty &&
      saved.difficulty in DIFFICULTIES &&
      typeof saved.nations === "boolean" &&
      BOT_COUNTS.includes(saved.bots as (typeof BOT_COUNTS)[number])
    ) {
      return { map: saved.map, bots: saved.bots!, nations: saved.nations, difficulty: saved.difficulty };
    }
  } catch {
    // Private mode or bad data: the defaults are fine.
  }
  return DEFAULT_SETTINGS;
}

function snapshot(game: Game): Hud {
  const player = game.nations[1];
  const alive = game.nations.filter((nation) => nation.alive && nation.tiles > 0).sort((a, b) => b.tiles - a.tiles);
  return {
    stage: game.phase,
    spawnLeft: Math.max(0, (SPAWN_TICKS - game.tick) * TICK_SECONDS),
    protectedNow: immune(game),
    spawned: player.spawned,
    troops: player.troops,
    cap: maxTroops(game, player),
    attacking: troopsAttacking(game, 1),
    gold: player.gold,
    income: goldPerTick(player) / TICK_SECONDS,
    share: share(game, player),
    time: game.time,
    cityCost: cityCost(player.cities),
    postCost: postCost(player.posts.length),
    rank: alive.findIndex((nation) => nation.id === 1) + 1,
    alive: alive.length,
    leaders: alive.slice(0, 10).map((nation) => ({ id: nation.id, name: nation.name, color: nation.color, kind: nation.kind, share: share(game, nation), troops: nation.troops })),
    attacks: game.attacks
      .filter((attack) => attack.from === 1)
      .map((attack) => ({ id: attack.id, target: attack.to ? game.nations[attack.to].name : "Unclaimed land", troops: attack.troops })),
    boats: game.boats.filter((boat) => boat.from === 1).map((boat) => ({ id: boat.id, troops: boat.troops })),
  };
}

export default function FrontWarsGame({ records }: { records: Record<string, number> }) {
  const { play } = useArcade();
  const { best, submit } = useRecord("front-wars", records[""] ?? null);
  // The last match's setup (this component only renders in the browser: it's loaded with ssr: false).
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [phase, setPhase] = useState<Phase>("setup");
  const [hud, setHud] = useState<Hud | null>(null);
  const [ratio, setRatio] = useState(0.2);
  const [mode, setMode] = useState<Mode>("attack");
  const [notice, setNotice] = useState<{ text: string; ok: boolean; id: number } | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const rendererRef = useRef<MapRenderer | null>(null);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const sizeRef = useRef<CanvasSize>({ width: 1, height: 1, dpr: 1 });
  const hoverRef = useRef(-1);
  const pingsRef = useRef<Ping[]>([]);
  const ratioRef = useRef(ratio);
  const modeRef = useRef(mode);
  const phaseRef = useRef(phase);
  const drawRequest = useRef(0);
  useEffect(() => {
    ratioRef.current = ratio;
    modeRef.current = mode;
    phaseRef.current = phase;
  }, [ratio, mode, phase]);

  useGameAchievementTracking("front-wars", phase);

  const say = useCallback((text: string, ok: boolean) => setNotice({ text, ok, id: Date.now() }), []);

  /* ----------------------------------------------------------------------------------------- Drawing */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const game = gameRef.current;
    const renderer = rendererRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !game || !renderer || !ctx) return;
    renderer.update();
    const now = performance.now();
    pingsRef.current = pingsRef.current.filter((ping) => now - ping.at < 600);
    drawFrame(ctx, renderer, game, viewRef.current, sizeRef.current, { hover: hoverRef.current, mode: modeRef.current, pings: pingsRef.current, now, spawn: game.phase === "spawn" });
  }, []);

  /** Draw once on the next frame (while paused or between matches nothing runs continuously). */
  const requestDraw = useCallback(() => {
    if (drawRequest.current) return;
    drawRequest.current = requestAnimationFrame(() => {
      drawRequest.current = 0;
      draw();
    });
  }, [draw]);

  const fit = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const { width, height } = sizeRef.current;
    const scale = Math.min(width / game.w, height / game.h);
    viewRef.current = { scale, x: (width - game.w * scale) / 2, y: (height - game.h * scale) / 2 };
  }, []);

  const clampView = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const view = viewRef.current;
    const { width, height } = sizeRef.current;
    const mapW = game.w * view.scale;
    const mapH = game.h * view.scale;
    // Keep at least a third of the view on the map.
    view.x = Math.min(width - Math.min(mapW, width) / 3, Math.max(Math.min(mapW, width) / 3 - mapW, view.x));
    view.y = Math.min(height - Math.min(mapH, height) / 3, Math.max(Math.min(mapH, height) / 3 - mapH, view.y));
  }, []);

  const zoomAt = useCallback(
    (factor: number, sx: number, sy: number) => {
      const game = gameRef.current;
      if (!game) return;
      const view = viewRef.current;
      const { width, height } = sizeRef.current;
      const smallest = Math.min(width / game.w, height / game.h) * 0.9;
      const scale = Math.min(MAX_SCALE, Math.max(smallest, view.scale * factor));
      view.x = sx - ((sx - view.x) / view.scale) * scale;
      view.y = sy - ((sy - view.y) / view.scale) * scale;
      view.scale = scale;
      clampView();
      requestDraw();
    },
    [clampView, requestDraw],
  );

  const centerOnHome = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    const player = game.nations[1];
    if (!player.tiles) return;
    const view = viewRef.current;
    const { width, height } = sizeRef.current;
    view.scale = Math.max(view.scale, Math.min(MAX_SCALE, Math.min(width / game.w, height / game.h) * 5));
    view.x = width / 2 - (player.sx / player.tiles + 0.5) * view.scale;
    view.y = height / 2 - (player.sy / player.tiles + 0.5) * view.scale;
    clampView();
    requestDraw();
  }, [clampView, requestDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let first = true;
    return observeCanvas(canvas, (size) => {
      sizeRef.current = size;
      if (first) {
        first = false;
        fit();
      } else {
        clampView();
      }
      requestDraw();
    });
  }, [fit, clampView, requestDraw]);

  /* ----------------------------------------------------------------------------------------- Match */

  const finish = useCallback(
    (game: Game) => {
      const won = game.outcome?.winner === 1;
      const score = matchScore(game);
      const improved = submit(score);
      const winner = game.outcome?.winner ? game.nations[game.outcome.winner] : null;
      const message = won
        ? `You hold ${percent(share(game, game.nations[1]))} of the land.`
        : game.outcome?.reason === "conquered"
          ? "Your last land fell."
          : `${winner?.name ?? "A rival"} took ${percent(winner ? share(game, winner) : WIN_SHARE)} of the land first.`;
      setResult({ won, score, best: improved, time: game.time, peak: game.nations[1].peak, message });
      setHud(snapshot(game));
      setPhase("over");
      setMode("attack");
      play(won ? "win" : "over");
    },
    [play, submit],
  );

  const start = useCallback(
    (next: Settings) => {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Not saved; it still plays.
      }
      const game = createGame(next, (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
      gameRef.current = game;
      rendererRef.current = new MapRenderer(game);
      pingsRef.current = [];
      hoverRef.current = -1;
      setSettings(next);
      setResult(null);
      setMode("attack");
      setHud(snapshot(game));
      setPhase("playing");
      fit();
      say("Choose where to start: tap any unclaimed land.", true);
      play("tap");
    },
    [fit, say, play],
  );

  // The match runs only while playing: ten simulation ticks a second, a frame per display refresh.
  useEffect(() => {
    if (phase !== "playing") {
      requestDraw();
      return;
    }
    let ticks = 0;
    return startLoop(
      () => {
        const game = gameRef.current;
        if (!game || game.outcome) return;
        const before = game.phase;
        step(game);
        ticks += 1;
        if (before === "spawn" && game.phase === "battle") {
          say("The battle begins! Tap unclaimed land to expand. Everyone is protected for 5 seconds.", true);
          play("power");
          centerOnHome();
        }
        for (const event of game.events) {
          if (event.kind === "eliminated" || event.kind === "annexed") {
            const fallen = game.nations[event.nation];
            if (event.by === 1) {
              say(event.kind === "annexed" ? `${fallen.name} was surrounded and joined you.` : `You conquered ${fallen.name}.`, true);
              play("crack");
            } else if (fallen.kind === "nation" && event.nation !== 1) {
              say(`${fallen.name} fell to ${game.nations[event.by]?.name ?? "a rival"}.`, true);
            }
          } else if (event.kind === "landed") {
            if (event.from === 1) say(`Your boat landed${event.to ? ` on ${game.nations[event.to].name}'s shore` : ""}.`, true);
            else if (event.to === 1) say(`${game.nations[event.from].name} landed on your shore!`, false);
          } else if (event.kind === "captured-building" && (event.to === 1 || event.from === 1)) {
            say(event.to === 1 ? `You captured a ${event.building === "city" ? "City" : "Defense Post"}.` : `You lost a ${event.building === "city" ? "City" : "Defense Post"}.`, event.to === 1);
          }
        }
        game.events.length = 0;
        if (game.outcome) {
          finish(game);
          return;
        }
        if (ticks % 3 === 0) setHud(snapshot(game));
      },
      () => draw(),
      10,
    );
  }, [phase, draw, requestDraw, finish, say, play, centerOnHome]);

  const togglePause = useCallback(() => {
    setPhase((current) => (current === "playing" ? "paused" : current === "paused" ? "playing" : current));
  }, []);

  useAway(() => {
    if (phaseRef.current === "playing") setPhase("paused");
  });

  /* ----------------------------------------------------------------------------------------- Actions */

  const tileAt = useCallback((sx: number, sy: number) => {
    const game = gameRef.current;
    if (!game) return -1;
    const view = viewRef.current;
    const x = Math.floor((sx - view.x) / view.scale);
    const y = Math.floor((sy - view.y) / view.scale);
    if (x < 0 || y < 0 || x >= game.w || y >= game.h) return -1;
    return y * game.w + x;
  }, []);

  const act = useCallback(
    (tile: number) => {
      const game = gameRef.current;
      if (!game || tile < 0 || phaseRef.current !== "playing") return;
      const current = modeRef.current;
      const outcome =
        game.phase === "spawn" ? chooseSpawn(game, tile) : current === "attack" ? launchAttack(game, 1, tile, ratioRef.current) : build(game, 1, tile, current);
      pingsRef.current.push({ tile, at: performance.now(), ok: outcome.ok });
      say(outcome.message, outcome.ok);
      play(outcome.ok ? (game.phase === "spawn" ? "place" : current === "attack" ? "swoosh" : "place") : "invalid");
      if (outcome.ok && current !== "attack") setMode("attack");
      setHud(snapshot(game));
      requestDraw();
    },
    [say, play, requestDraw],
  );

  const retreatFrom = useCallback(
    (id: number) => {
      const game = gameRef.current;
      if (!game) return;
      const outcome = retreat(game, id, 1);
      say(outcome.message, outcome.ok);
      play(outcome.ok ? "erase" : "invalid");
      setHud(snapshot(game));
    },
    [say, play],
  );

  const changeRatio = useCallback((delta: number) => setRatio((value) => Math.round(Math.min(1, Math.max(0.01, value + delta)) * 100) / 100), []);

  const pan = useCallback(
    (dx: number, dy: number) => {
      viewRef.current.x += dx;
      viewRef.current.y += dy;
      clampView();
      requestDraw();
    },
    [clampView, requestDraw],
  );

  useGameKeys((event) => {
    const key = event.key.toLowerCase();
    if (phaseRef.current === "setup") return false;
    if (key === " " || key === "p") {
      togglePause();
      return true;
    }
    if (phaseRef.current === "over") return false;
    const { width, height } = sizeRef.current;
    switch (key) {
      case "1":
        changeRatio(-0.05);
        return true;
      case "2":
        changeRatio(0.05);
        return true;
      case "w":
      case "arrowup":
        pan(0, 80);
        return true;
      case "s":
      case "arrowdown":
        pan(0, -80);
        return true;
      case "a":
      case "arrowleft":
        pan(80, 0);
        return true;
      case "d":
      case "arrowright":
        pan(-80, 0);
        return true;
      case "e":
      case "+":
      case "=":
        zoomAt(1.3, width / 2, height / 2);
        return true;
      case "q":
      case "-":
        zoomAt(1 / 1.3, width / 2, height / 2);
        return true;
      case "h":
        centerOnHome();
        return true;
      case "m":
        fit();
        requestDraw();
        return true;
      case "c":
        setMode((current) => (current === "city" ? "attack" : "city"));
        return true;
      case "f":
        setMode((current) => (current === "post" ? "attack" : "post"));
        return true;
      case "escape":
        setMode("attack");
        return true;
      case "x": {
        const latest = gameRef.current?.attacks.filter((attack) => attack.from === 1).at(-1);
        if (latest) retreatFrom(latest.id);
        return true;
      }
      case "enter": {
        // Keyboard: act on the hovered tile, or on the middle of the view.
        act(hoverRef.current >= 0 ? hoverRef.current : tileAt(width / 2, height / 2));
        return true;
      }
      default:
        return false;
    }
  });

  // Redraw when the placement mode changes (the hover outline and a Post's reach follow it).
  useEffect(() => {
    requestDraw();
  }, [mode, requestDraw]);

  /* ----------------------------------------------------------------------------------------- Pointer */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; pinch: number }>({ moved: false, startX: 0, startY: 0, pinch: 0 });

  const local = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  function describe(tile: number) {
    const game = gameRef.current;
    if (!game || tile < 0) return setInspect(null);
    const terrain = game.terrain[tile];
    if (terrain === WATER) return setInspect("Water");
    const owner = game.owner[tile];
    const who = owner ? `${game.nations[owner].name}${owner === 1 ? "" : ` (${KIND_LABEL[game.nations[owner].kind]}) · ${compact(game.nations[owner].troops)} troops`}` : "Unclaimed land";
    const building = game.building[tile] === 1 ? " · City" : game.building[tile] === 2 ? " · Defense Post" : "";
    setInspect(`${TERRAIN_LABEL[terrain]} · ${who}${building}`);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = local(event);
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) gesture.current = { moved: false, startX: point.x, startY: point.y, pinch: 0 };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = local(event);
    const previous = pointers.current.get(event.pointerId);
    if (!previous) {
      const tile = tileAt(point.x, point.y);
      if (tile !== hoverRef.current) {
        hoverRef.current = tile;
        describe(tile);
        requestDraw();
      }
      return;
    }
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (gesture.current.pinch > 0) zoomAt(distance / gesture.current.pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture.current.pinch = distance;
      return;
    }
    if (!gesture.current.moved && Math.hypot(point.x - gesture.current.startX, point.y - gesture.current.startY) > 8) gesture.current.moved = true;
    if (gesture.current.moved) pan(point.x - previous.x, point.y - previous.y);
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const point = local(event);
    const wasTap = pointers.current.size === 1 && !gesture.current.moved;
    pointers.current.delete(event.pointerId);
    if (wasTap && event.button === 0) {
      const tile = tileAt(point.x, point.y);
      if (event.pointerType !== "mouse") {
        hoverRef.current = tile;
        describe(tile);
      }
      act(tile);
    }
  }

  // Wheel zoom needs a non-passive listener so the page doesn't scroll; Shift + wheel sets the ratio.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      if (!gameRef.current) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (event.shiftKey) changeRatio(event.deltaY < 0 ? 0.05 : -0.05);
      else zoomAt(event.deltaY < 0 ? 1.18 : 1 / 1.18, event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomAt, changeRatio]);

  /* ----------------------------------------------------------------------------------------- View */

  const inMatch = phase === "playing" || phase === "paused" || phase === "over";
  const player = hud;
  const spawning = player?.stage === "spawn";

  return (
    <GameShell
      game="front-wars"
      title="Front Wars"
      active={phase === "playing"}
      stats={
        inMatch && player ? (
          <>
            <Stat label="Land" value={`${percent(player.share)} / ${percent(WIN_SHARE)}`} highlight={player.share >= 0.4} />
            <Stat label="Troops" value={`${compact(player.troops)} / ${compact(player.cap)}`} />
            <Stat label="Gold" value={compact(player.gold)} />
            <Stat label="Attack" value={`${Math.round(ratio * 100)}%`} />
            <Stat label="Rank" value={player.rank ? `#${player.rank} of ${player.alive}` : "—"} className="hidden sm:flex" />
            <Stat label="Time" value={clock(player.time)} className="hidden md:flex" />
          </>
        ) : (
          <Stat label="Best" value={best ? best.toLocaleString("en") : "—"} />
        )
      }
      actions={
        inMatch ? (
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={togglePause} disabled={phase === "over"} aria-label={phase === "paused" ? "Resume" : "Pause"}>
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            <span className="hidden sm:inline">{phase === "paused" ? "Resume" : "Pause"}</span>
          </Button>
        ) : null
      }
    >
      <div className="fw-layout" data-phase={phase}>
        <div className="fw-stage">
          <canvas
            ref={canvasRef}
            className="fw-canvas"
            aria-label="Front Wars map. Click or tap land to expand or attack; drag to pan, scroll or pinch to zoom."
            role="img"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={(event) => pointers.current.delete(event.pointerId)}
            onPointerLeave={() => {
              if (hoverRef.current !== -1 && !pointers.current.size) {
                hoverRef.current = -1;
                setInspect(null);
                requestDraw();
              }
            }}
            onContextMenu={(event) => event.preventDefault()}
          />
          {inMatch && player ? (
            <>
              <div className="fw-mapbar">
                <span className="fw-mode" data-mode={spawning ? "spawn" : mode}>
                  {spawning ? <MapPin aria-hidden className="size-3.5" /> : mode === "attack" ? <Crosshair aria-hidden className="size-3.5" /> : mode === "city" ? <Building2 aria-hidden className="size-3.5" /> : <Shield aria-hidden className="size-3.5" />}
                  {spawning
                    ? `${player.spawned ? "Move your start" : "Pick your start"} · ${Math.ceil(player.spawnLeft)}s`
                    : mode === "attack"
                      ? `Attack · ${Math.round(ratio * 100)}%${player.protectedNow ? " · protected" : ""}`
                      : mode === "city"
                        ? "Place a City"
                        : "Place a Defense Post"}
                </span>
                {inspect ? <span className="fw-inspect">{inspect}</span> : null}
              </div>
              <div className="fw-zoom">
                <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1.3, sizeRef.current.width / 2, sizeRef.current.height / 2)} aria-label="Zoom in">
                  +
                </Button>
                <Button variant="outline" size="icon-sm" onClick={() => zoomAt(1 / 1.3, sizeRef.current.width / 2, sizeRef.current.height / 2)} aria-label="Zoom out">
                  −
                </Button>
                <Button variant="outline" size="icon-sm" onClick={centerOnHome} aria-label="Center on your land" title="Center on your land (H)">
                  <Flag aria-hidden />
                </Button>
              </div>
            </>
          ) : null}
          <p className="sr-only" aria-live="polite">
            {notice?.text}
          </p>
          {notice && inMatch ? (
            <p key={notice.id} className="fw-notice" data-ok={notice.ok ? "true" : "false"} aria-hidden>
              {notice.text}
            </p>
          ) : null}

          {phase === "setup" ? <Setup settings={settings} onChange={setSettings} onStart={() => start(settings)} /> : null}
          {phase === "paused" ? (
            <GameOverlay
              title="Paused"
              actions={
                <>
                  <Button size="sm" onClick={togglePause}>
                    <Play aria-hidden />
                    Resume
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => start(settings)}>
                    <RotateCcw aria-hidden />
                    Restart
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPhase("setup")}>
                    New setup
                  </Button>
                </>
              }
            >
              The match is frozen: troops, gold and every rival wait for you.
            </GameOverlay>
          ) : null}
          {phase === "over" && result ? (
            <GameOverlay
              title={result.won ? "Victory" : "Defeat"}
              actions={
                <>
                  <Button size="sm" onClick={() => start(settings)}>
                    <RotateCcw aria-hidden />
                    Rematch
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPhase("setup")}>
                    New setup
                  </Button>
                </>
              }
            >
              <span className="block">{result.message}</span>
              <span className="mt-2 block">
                Score <strong className="text-foreground tabular-nums">{result.score.toLocaleString("en")}</strong>
                {result.best ? " · New best!" : ""}
              </span>
              <span className="block text-xs">
                {clock(result.time)} · peak {percent(result.peak)} of the land
              </span>
            </GameOverlay>
          ) : null}
        </div>

        {inMatch && player ? (
          <aside className="fw-panel" aria-label="Command">
            <section className="fw-card">
              <h2 className="fw-card-title">
                <Swords aria-hidden className="size-4" />
                Attack
              </h2>
              <label className="fw-ratio">
                <span className="flex items-center justify-between text-xs text-muted-foreground">
                  Attack ratio
                  <span className="font-semibold text-foreground tabular-nums">
                    {Math.round(ratio * 100)}% · {compact(player.troops * ratio)} troops
                  </span>
                </span>
                <input type="range" min={1} max={100} step={1} value={Math.round(ratio * 100)} onChange={(event) => setRatio(Number(event.target.value) / 100)} />
              </label>
              <p className="text-xs text-muted-foreground">
                {spawning
                  ? "Tap the map to choose where you start."
                  : phase === "playing"
                    ? "Tap unclaimed land to expand, or a neighbor to attack. Across water, a boat sails."
                    : "Resume to give orders."}{" "}
                Keys: 1 / 2 ratio, X retreat.
              </p>
              {player.attacks.length || player.boats.length ? (
                <ul className="fw-attacks" aria-label="Your attacks">
                  {player.attacks.map((attack) => (
                    <li key={attack.id}>
                      <span className="min-w-0 truncate">
                        {attack.target} · <span className="tabular-nums">{compact(attack.troops)}</span>
                      </span>
                      <Button size="xs" variant="outline" onClick={() => retreatFrom(attack.id)} disabled={phase !== "playing"} title={`Retreat: lose ${RETREAT_COST * 100}% of these troops`}>
                        <Undo2 aria-hidden />
                        Retreat
                      </Button>
                    </li>
                  ))}
                  {player.boats.map((boat) => (
                    <li key={`boat-${boat.id}`}>
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <Anchor aria-hidden className="size-3.5 shrink-0" />
                        Boat at sea · <span className="tabular-nums">{compact(boat.troops)}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {player.boats.length}/{MAX_BOATS}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="fw-card">
              <h2 className="fw-card-title">
                <Building2 aria-hidden className="size-4" />
                Build
                <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">+{compact(player.income)} gold/s</span>
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant={mode === "city" ? "default" : "outline"}
                  aria-pressed={mode === "city"}
                  disabled={phase !== "playing" || spawning}
                  onClick={() => setMode((current) => (current === "city" ? "attack" : "city"))}
                  title={`+${compact(CITY_TROOPS)} troop cap (C)`}
                >
                  <Building2 aria-hidden />
                  City · {compact(player.cityCost)}
                </Button>
                <Button
                  size="sm"
                  variant={mode === "post" ? "default" : "outline"}
                  aria-pressed={mode === "post"}
                  disabled={phase !== "playing" || spawning}
                  onClick={() => setMode((current) => (current === "post" ? "attack" : "post"))}
                  title="Attacks on land in its reach lose far more troops and slow to a crawl (F)"
                >
                  <Shield aria-hidden />
                  Post · {compact(player.postCost)}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {mode === "attack" ? `Cities add ${compact(CITY_TROOPS)} troop cap; Defense Posts guard the land around them.` : "Tap your own land to place it. Esc cancels."}
              </p>
            </section>

            <section className="fw-card">
              <h2 className="fw-card-title">
                <Trophy aria-hidden className="size-4" />
                Leaderboard
                <span className="ml-auto text-xs font-medium text-muted-foreground">Goal {percent(WIN_SHARE)}</span>
              </h2>
              <ol className="fw-nations">
                {player.leaders.map((nation, index) => (
                  <li key={nation.id} data-you={nation.id === 1 ? "true" : "false"} data-alive="true">
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    <span aria-hidden className="fw-swatch" style={{ "--swatch": nation.color } as CSSProperties} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {nation.name}
                        {nation.kind !== "human" ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{KIND_LABEL[nation.kind]}</span> : null}
                      </span>
                      <span className="fw-share" aria-hidden>
                        <span style={{ width: `${Math.min(100, (nation.share / WIN_SHARE) * 100)}%`, background: nation.color }} />
                      </span>
                    </span>
                    <span className="text-right text-xs tabular-nums">
                      <span className="block font-semibold text-foreground">{percent(nation.share)}</span>
                      <span className="block text-muted-foreground">{compact(nation.troops)}</span>
                    </span>
                  </li>
                ))}
                {player.rank > 10 ? (
                  <li data-you="true" data-alive="true">
                    <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{player.rank}</span>
                    <span aria-hidden className="fw-swatch" style={{ "--swatch": "#3f7bff" } as CSSProperties} />
                    <span className="min-w-0 flex-1 text-sm font-medium">You</span>
                    <span className="text-right text-xs tabular-nums">
                      <span className="block font-semibold text-foreground">{percent(player.share)}</span>
                      <span className="block text-muted-foreground">{compact(player.troops)}</span>
                    </span>
                  </li>
                ) : null}
              </ol>
              <p className="text-xs text-muted-foreground">{player.alive.toLocaleString("en")} players still standing.</p>
            </section>
          </aside>
        ) : null}
      </div>
    </GameShell>
  );
}

/** Match setup: map, rivals and difficulty, with the rules spelled out before you start. */
function Setup({ settings, onChange, onStart }: { settings: Settings; onChange: (next: Settings) => void; onStart: () => void }) {
  return (
    <div className="fw-setup">
      <div className="fw-setup-card">
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Solo match</p>
          <h2 className="mt-0.5 text-xl font-bold tracking-tight">Plan your conquest</h2>
        </div>

        <fieldset className="fw-options">
          <legend>Map</legend>
          <div role="radiogroup" aria-label="Map" className="fw-segment">
            {(Object.keys(MAPS) as MapKind[]).map((map) => (
              <button key={map} type="button" role="radio" aria-checked={settings.map === map} onClick={() => onChange({ ...settings, map })}>
                {MAPS[map].label}
              </button>
            ))}
          </div>
          <p>{MAPS[settings.map].hint}</p>
        </fieldset>

        <fieldset className="fw-options">
          <legend>Bots</legend>
          <div role="radiogroup" aria-label="Bots" className="fw-segment">
            {BOT_COUNTS.map((count) => (
              <button key={count} type="button" role="radio" aria-checked={settings.bots === count} onClick={() => onChange({ ...settings, bots: count })}>
                {count}
              </button>
            ))}
          </div>
          <p>Small tribes scattered everywhere: weak alone, quick to grab land, and annexed when someone surrounds them.</p>
        </fieldset>

        <fieldset className="fw-options">
          <legend>Nations</legend>
          <div role="radiogroup" aria-label="Nations" className="fw-segment">
            {[true, false].map((on) => (
              <button key={String(on)} type="button" role="radio" aria-checked={settings.nations === on} onClick={() => onChange({ ...settings, nations: on })}>
                {on ? "On" : "Off"}
              </button>
            ))}
          </div>
          <p>{settings.map === "world" ? "84 real countries start in their homelands" : "12 rival realms"}: real opponents that expand, build Cities and Defense Posts, sail, and attack the weak.</p>
        </fieldset>

        <fieldset className="fw-options">
          <legend>Difficulty</legend>
          <div role="radiogroup" aria-label="Difficulty" className="fw-segment">
            {(Object.keys(DIFFICULTIES) as Difficulty[]).map((difficulty) => (
              <button key={difficulty} type="button" role="radio" aria-checked={settings.difficulty === difficulty} onClick={() => onChange({ ...settings, difficulty })}>
                {DIFFICULTIES[difficulty].label}
              </button>
            ))}
          </div>
          <p>{DIFFICULTIES[settings.difficulty].hint} Everyone plays by the same rules.</p>
        </fieldset>

        <div className="fw-rules">
          <h3>Rules</h3>
          <ul>
            <li>
              <strong>Win</strong> by holding {percent(WIN_SHARE)} of all land. You lose if your last land falls or a rival reaches {percent(WIN_SHARE)} first.
            </li>
            <li>
              <strong>Start:</strong> for 10 seconds, tap anywhere to choose your spawn. Then everyone is protected for 5 seconds.
            </li>
            <li>
              <strong>Expand and attack</strong> by tapping unclaimed land or a neighbor: you send your attack ratio of troops and they push your whole shared border forward until they run out.
            </li>
            <li>
              <strong>Troops</strong> grow fastest well below your cap; more land and Cities raise the cap. Hills and mountains cost more, and land near a Defense Post costs far more.
            </li>
            <li>
              <strong>Boats:</strong> tap land across the water to sail troops there (up to {MAX_BOATS} at sea). <strong>Retreat</strong> costs {RETREAT_COST * 100}% of an attack.
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">Controls: tap or click to act · drag to pan · scroll or pinch to zoom · 1 / 2 ratio · C City · F Post · X retreat · H home · M whole map · Space pause.</p>
        </div>

        <Button size="lg" onClick={onStart} className="w-full">
          <Swords aria-hidden />
          Start match
        </Button>
      </div>
    </div>
  );
}
