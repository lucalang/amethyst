"use client";

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ghost, Layers, Pause, Play, RotateCcw, Settings2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { formatDuration } from "@/lib/arcade";
import { SNAKE_SIZES, snakeVariant, type SnakeSetup } from "@/lib/snake";
import { swipeDirection } from "./engine";
import { GameOverlay, GameShell, Stat, keyDirection, sendAchievementEvent, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { LAYER_HUES, START_LENGTH, createSnake, sameSetup, type Direction, type OverReason, type Phase, type SnakeGame, type SnakeStatus } from "./snake-engine";
import { ModeIcon, SnakeSetupPanel, describeSetup, setupTitle } from "./snake-setup";
import { snakeTheme } from "./snake-look";

const OVER_TITLES: Record<OverReason, string> = { crash: "Game over", time: "Time's up!", cleared: "Board cleared!", boom: "Kaboom!" };
const ARROWS: Record<Direction, typeof ArrowUp> = { up: ArrowUp, right: ArrowRight, down: ArrowDown, left: ArrowLeft };
const NO_STATUS: SnakeStatus = { layer: null, scrambled: null, ghost: null };

export default function GameSnake({ records: initialRecords }: { records: Record<string, number> }) {
  const { play, effects, look } = useArcade();
  const theme = useMemo(() => snakeTheme(look), [look]);
  const settings = useSettings();
  const router = useRouter();
  const { records, submit } = useRecords("snake", initialRecords);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SnakeGame | null>(null);
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const live = useRef({ play, effects, theme });
  const [setup, setSetup] = useState<SnakeSetup>(settings.arcadeSnake);
  const initialSetup = useRef(setup);
  const pendingSave = useRef<{ timer: number; setup: SnakeSetup } | null>(null);
  const [round, setRound] = useState<SnakeSetup>(setup);
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [status, setStatus] = useState<SnakeStatus>(NO_STATUS);
  const [reason, setReason] = useState<OverReason>("crash");
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("snake");

  useGameAchievementTracking("snake", phase);

  useEffect(() => {
    if (phase === "playing") beginRun();
  }, [phase, beginRun]);

  useEffect(() => {
    live.current = { play, effects, theme };
  });

  const finish = useEffectEvent((final: number, why: OverReason) => {
    setReason(why);
    submit(final, { variant: snakeVariant(round) });
    finishRun(final, { length: final + START_LENGTH });
    sendAchievementEvent({ type: "run_finished", game: "snake", length: final + START_LENGTH });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = createSnake(canvas, initialSetup.current, {
      onPhase: setPhase,
      onScore: setScore,
      onTime: setSeconds,
      onRound: setRound,
      onStatus: setStatus,
      onOver: (final, why) => finish(final, why),
      live: () => live.current,
    });
    gameRef.current = game;
    return () => {
      submit(game.score, { keepalive: true, variant: snakeVariant(game.setup) });
      finishRun(game.score, { length: game.score + START_LENGTH }, { keepalive: true });
      if (game.score > 0) sendAchievementEvent({ type: "run_progress", game: "snake", length: game.score + START_LENGTH });
      game.destroy();
      gameRef.current = null;
    };
  }, [submit, finishRun]);

  useEffect(() => {
    gameRef.current?.configure(setup);
  }, [setup]);

  // A setup change made just before leaving is still saved.
  useEffect(() => {
    return () => {
      const pending = pendingSave.current;
      if (!pending) return;
      window.clearTimeout(pending.timer);
      void apiFetch("/api/preferences", { method: "PATCH", json: { settings: { arcadeSnake: pending.setup } }, keepalive: true }).catch(() => {});
    };
  }, []);

  useAway(() => gameRef.current?.pause());

  // Stable, so the memoized setup panel doesn't re-render with every score or timer tick.
  const changeSetup = useCallback(
    (next: SnakeSetup) => {
      setSetup(next);
      if (pendingSave.current) window.clearTimeout(pendingSave.current.timer);
      const timer = window.setTimeout(() => {
        pendingSave.current = null;
        apiFetch("/api/preferences", { method: "PATCH", json: { settings: { arcadeSnake: next } } })
          .then(() => router.refresh())
          .catch(() => toast.error("Could not save your Snake setup. It applies until you leave this page."));
      }, 600);
      pendingSave.current = { timer, setup: next };
    },
    [router],
  );

  function restart() {
    const game = gameRef.current;
    if (!game) return;
    if (game.phase === "playing" || game.phase === "paused") {
      // A round abandoned by restarting still counts toward records and coins.
      const final = game.score;
      submit(final, { variant: snakeVariant(game.setup) });
      finishRun(final, { length: final + START_LENGTH }, { announce: true });
      if (final > 0) sendAchievementEvent({ type: "run_progress", game: "snake", length: final + START_LENGTH });
    }
    game.restart();
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
    if ((event.key === "r" || event.key === "R") && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (game.phase === "paused" || game.canRestart()) {
        restart();
        return true;
      }
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

  const dpad = (direction: Direction, label: string, area: string) => {
    const Icon = ARROWS[direction];
    return (
      <button
        type="button"
        aria-label={label}
        className={`${area} grid size-14 place-items-center rounded-2xl border-2 border-white/[0.12] bg-surface/70 text-foreground shadow-[0_3px_0_rgb(0_0_0/0.35)] active:translate-y-0.5 active:bg-amethyst/25 active:shadow-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
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
  };

  const title = setupTitle(round);
  const best = records[snakeVariant(round)] ?? 0;
  const shownBest = Math.max(best, score);
  const inRound = phase === "playing" || phase === "paused";
  const changed = !sameSetup(setup, round);
  // The result card waits for the crash animation before appearing.
  const overlayMotion = effects === "off" ? undefined : { animationDelay: phase === "over" ? "260ms" : "0ms", animationFillMode: "both" as const };
  const chip = "inline-flex h-7 items-center gap-1.5 rounded-full border-2 px-2.5 text-xs font-semibold tabular-nums";

  return (
    <GameShell
      game="snake"
      title="Snake"
      active={inRound}
      stats={
        <>
          <Stat label="Score" value={score} />
          <Stat label="Best" value={shownBest} highlight={score > 0 && score >= best} />
          {seconds !== null ? <Stat label="Time" value={formatDuration(seconds)} highlight={inRound && seconds <= 10} /> : null}
          <Stat
            label="Mode"
            className="min-w-0"
            value={
              <span className="flex min-w-0 items-center gap-1.5">
                <ModeIcon mode={round.mode} className="size-4 shrink-0" />
                <span className="truncate">{title}</span>
              </span>
            }
          />
        </>
      }
      actions={
        inRound ? (
          <Button variant="outline" size="sm" className="h-8" onClick={togglePause}>
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            {phase === "paused" ? "Resume" : "Pause"}
          </Button>
        ) : null
      }
      help="Arrows/WASD or swipe to steer · Space/P pause · R restart"
    >
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col items-center gap-3">
          {status.layer !== null || status.scrambled || status.ghost ? (
            <div className="flex min-h-7 flex-wrap justify-center gap-2" aria-live="polite">
              {status.layer !== null ? (
                <span className={chip} style={{ borderColor: LAYER_HUES[status.layer], color: LAYER_HUES[status.layer] }}>
                  <Layers aria-hidden className="size-3.5" />
                  Layer {status.layer === 0 ? "A" : "B"}
                </span>
              ) : null}
              {status.scrambled ? (
                <span className={`${chip} border-[#9a6bff] text-[#b58cff]`} aria-label={`Controls scrambled for ${status.scrambled.seconds} seconds`}>
                  <Shuffle aria-hidden className="size-3.5" />
                  {status.scrambled.seconds}s
                  <span aria-hidden className="ml-0.5 flex items-center gap-1 text-foreground/80">
                    {(Object.keys(ARROWS) as Direction[]).map((key) => {
                      const From = ARROWS[key];
                      const To = ARROWS[status.scrambled?.map[key] ?? key];
                      return (
                        <span key={key} className="flex items-center rounded bg-white/[0.08] px-0.5">
                          <From className="size-3" />
                          <To className="size-3 text-[#b58cff]" />
                        </span>
                      );
                    })}
                  </span>
                </span>
              ) : null}
              {status.ghost ? (
                <span className={`${chip} border-sky-300/70 text-sky-200`}>
                  <Ghost aria-hidden className="size-3.5" />
                  {status.ghost}s
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="arcade-stage [--stage-ratio:1]">
            <canvas
              ref={canvasRef}
              tabIndex={-1}
              aria-label={`Snake board, ${title}, ${SNAKE_SIZES[round.size].grid} by ${SNAKE_SIZES[round.size].grid}, score ${score}`}
              className="absolute inset-0 size-full touch-none rounded-xl outline-none select-none"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {phase !== "playing" ? (
              <div key={phase} className="pointer-events-none absolute inset-0 z-10 animate-in duration-300 fade-in-0 zoom-in-95" style={overlayMotion}>
                {phase === "ready" ? (
                  <GameOverlay
                    tone="quiet"
                    title={
                      <span className="inline-flex items-center gap-2">
                        <ModeIcon mode={round.mode} className="size-5" />
                        {title}
                      </span>
                    }
                    actions={
                      <>
                        <Button size="sm" onClick={() => gameRef.current?.start()}>
                          <Play aria-hidden />
                          Start
                        </Button>
                        <Button size="sm" variant="outline" className="lg:hidden" onClick={() => panelRef.current?.scrollIntoView({ behavior: effects === "off" ? "auto" : "smooth", block: "start" })}>
                          <Settings2 aria-hidden />
                          Setup
                        </Button>
                      </>
                    }
                  />
                ) : phase === "paused" ? (
                  <GameOverlay
                    title="Paused"
                    actions={
                      <>
                        <Button size="sm" onClick={togglePause} autoFocus>
                          <Play aria-hidden />
                          Resume
                        </Button>
                        <Button size="sm" variant="outline" onClick={restart}>
                          <RotateCcw aria-hidden />
                          Restart
                        </Button>
                      </>
                    }
                  >
                    Score {score}
                    {seconds !== null ? ` · ${formatDuration(seconds)} left` : ""}
                  </GameOverlay>
                ) : (
                  <GameOverlay
                    title={OVER_TITLES[reason]}
                    actions={
                      <Button size="sm" onClick={restart}>
                        <RotateCcw aria-hidden />
                        Play again
                      </Button>
                    }
                  >
                    Score {score}
                    {score > 0 && score >= best ? " · new best!" : ` · best ${shownBest}`}
                    {changed ? <span className="mt-1 block">Next: {describeSetup(setup)}</span> : null}
                    <CoinReward state={coins} />
                  </GameOverlay>
                )}
              </div>
            ) : null}
          </div>
          <div className="hidden grid-cols-3 grid-rows-2 gap-2 pointer-coarse:grid" role="group" aria-label="Direction pad">
            {dpad("up", "Up", "col-start-2")}
            {dpad("left", "Left", "col-start-1 row-start-2")}
            {dpad("down", "Down", "col-start-2 row-start-2")}
            {dpad("right", "Right", "col-start-3 row-start-2")}
          </div>
        </div>
        <div ref={panelRef} className="scroll-mt-4">
          <SnakeSetupPanel setup={setup} onChange={changeSetup} locked={inRound} waiting={phase === "over"} records={records} />
        </div>
      </div>
    </GameShell>
  );
}
