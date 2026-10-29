"use client";

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dailyDate, dailyVariant, isRecentDailyVariant, seedFrom } from "@/lib/arcade-daily";
import { cn } from "@/lib/utils";
import { swipeDirection } from "./engine";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { DailyCountdown, formatDailyDate, useDailyDate } from "./daily";
import { GameOverlay, GameShell, Stat, keyDirection, sendAchievementEvent, useArcade, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import { GOAL, fromSaved, hasMoves, highestTile, newBoard, slide, toSaved, type Board, type BoardSize, type Direction, type RoundPhase } from "./logic-2048";

type Mode = "3x3" | "4x4" | "5x5" | "daily";

const MODES: readonly { id: Mode; label: string; title: string }[] = [
  { id: "3x3", label: "3×3", title: "Small board" },
  { id: "4x4", label: "4×4", title: "Classic board" },
  { id: "5x5", label: "5×5", title: "Large board" },
  { id: "daily", label: "Daily", title: "Daily challenge: the same 4×4 board for everyone, new every day at 00:00 UTC" },
];

const isMode = (value: unknown): value is Mode => MODES.some((mode) => mode.id === value);
const sizeOf = (mode: Mode): BoardSize => (mode === "3x3" ? 3 : mode === "5x5" ? 5 : 4);

/** Tiles slide for this long (matches the CSS transition); queued moves wait for it. */
const MOVE_MS = 100;
/** The last merge and new tile finish animating before a round's result appears. */
const SETTLE_MS = 340;
/** Result buttons ignore input briefly, so a stray tap or key can't dismiss or restart at once. */
const ARM_MS = 450;
const MAX_QUEUED = 3;

type Round = { mode: Mode; board: Board; phase: RoundPhase; celebrated: boolean; date: string | null; maxTile: number };
type Overlay = "hidden" | "shown" | "armed";
/** `beat` alternates so the same CSS animation restarts on every move. */
type MoveFx = { dir: Direction; beat: number };
type Pulse = { kind: "thump" | "shake"; dir: Direction; strength: number; beat: number };

const AXIS: Record<Direction, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** Record per setup: the classic 4×4 keeps the original record (""). */
const variantOf = (round: Round) => (round.mode === "daily" ? dailyVariant(round.date ?? "") : round.mode === "4x4" ? "" : round.mode);
const metricsOf = (round: Round) => ({ maxTile: round.maxTile, cells: round.board.size * round.board.size });

const storageKey = (userId: string, mode: Mode) => `archive:arcade:2048:${userId}:${mode}`;
const modeKey = (userId: string) => `archive:arcade:2048:${userId}:mode`;

function freshRound(mode: Mode): Round {
  const date = mode === "daily" ? dailyDate() : null;
  const board = newBoard(sizeOf(mode), date ? seedFrom(`2048:${date}`) : null);
  return { mode, board, phase: "playing", celebrated: false, date, maxTile: highestTile(board) };
}

/**
 * The saved round for a mode, or a new one when there is none or it no longer fits (damaged, an
 * older format, or a past daily challenge). Yesterday's unfinished challenge can still be finished.
 */
function loadRound(userId: string, mode: Mode): Round {
  try {
    const raw = window.localStorage.getItem(storageKey(userId, mode));
    if (raw) {
      const saved = fromSaved(JSON.parse(raw));
      if (saved && saved.board.size === sizeOf(mode)) {
        const fits =
          mode === "daily"
            ? saved.board.rng !== null && saved.date !== null && (saved.date === dailyDate() || (saved.phase === "playing" && isRecentDailyVariant(dailyVariant(saved.date))))
            : saved.date === null && saved.board.rng === null;
        if (fits) return { mode, ...saved, maxTile: highestTile(saved.board) };
      }
      window.localStorage.removeItem(storageKey(userId, mode));
    }
  } catch {
    // Storage blocked or unreadable: start a new round.
  }
  return freshRound(mode);
}

function lastMode(userId: string): Mode {
  try {
    const value = window.localStorage.getItem(modeKey(userId));
    return isMode(value) ? value : "4x4";
  } catch {
    return "4x4";
  }
}

/** Palette step: 1 for a 2 up to 11 for 2048; 12 for anything beyond (styled in globals.css). */
const tileStep = (value: number) => Math.min(12, Math.log2(value));
const fontScale = (value: number) => {
  const digits = String(value).length;
  return digits <= 2 ? 0.46 : digits === 3 ? 0.38 : digits === 4 ? 0.3 : 0.24;
};

export default function Game2048({ records: initialRecords, userId }: { records: Record<string, number>; userId: string }) {
  const { play, effects, look } = useArcade();
  const { records, submit } = useRecords("2048", initialRecords);
  const [round, setRound] = useState<Round>(() => loadRound(userId, lastMode(userId)));
  const roundRef = useRef(round);
  // Coins count only points scored since this round last paid: a win, or leaving and coming back.
  const baseline = useRef(round.board.score);
  const [overlay, setOverlay] = useState<Overlay>(round.phase === "playing" ? "hidden" : "armed");
  const [gain, setGain] = useState<{ key: number; value: number } | null>(null);
  const [moveFx, setMoveFx] = useState<MoveFx | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const { begin: beginRun, finish: finishRun, coins } = useArcadeRun("2048");
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const queue = useRef<Direction[]>([]);
  const moveTimer = useRef<number | null>(null);
  const endTimers = useRef<number[]>([]);
  const today = useDailyDate();

  useGameAchievementTracking("2048", round.phase);

  // Every change is saved at once, so a refresh or a later visit resumes exactly here.
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(userId, round.mode), JSON.stringify(toSaved(round.board, round.phase, round.celebrated, round.date)));
    } catch {
      // Storage full or blocked: the round still plays, it just won't resume.
    }
  }, [round, userId]);

  // Leaving mid-game still keeps a new best (and counts the run's coins).
  useEffect(() => {
    const current = roundRef;
    const from = baseline;
    const moving = moveTimer;
    const timers = endTimers;
    return () => {
      if (moving.current !== null) window.clearTimeout(moving.current);
      for (const id of timers.current) window.clearTimeout(id);
      const last = current.current;
      submit(last.board.score, { keepalive: true, variant: variantOf(last) });
      finishRun(last.board.score - from.current, metricsOf(last), { keepalive: true });
      if (last.maxTile > 2) sendAchievementEvent({ type: "run_progress", game: "2048", maxTile: last.maxTile });
    };
  }, [submit, finishRun]);

  // A finished round scrolls its result into view; once the buttons accept input they take focus.
  useEffect(() => {
    if (overlay === "shown" && round.phase === "over") resultRef.current?.scrollIntoView({ block: "nearest", behavior: effects === "off" ? "auto" : "smooth" });
    if (overlay === "armed" && round.phase !== "playing") primaryRef.current?.focus({ preventScroll: true });
  }, [overlay, round.phase, effects]);

  function commit(next: Round) {
    roundRef.current = next;
    setRound(next);
  }

  function clearTimers() {
    queue.current = [];
    if (moveTimer.current !== null) window.clearTimeout(moveTimer.current);
    moveTimer.current = null;
    for (const id of endTimers.current) window.clearTimeout(id);
    endTimers.current = [];
  }

  function settle(target: Round, options?: { announce?: boolean }) {
    finishRun(target.board.score - baseline.current, metricsOf(target), options);
  }

  /** Shows the result after the final animations, then accepts input on it a moment later. */
  function reveal(phase: "won" | "over") {
    setOverlay("hidden");
    const wait = effects === "off" ? 0 : SETTLE_MS;
    endTimers.current.push(
      window.setTimeout(() => {
        setOverlay("shown");
        play(phase === "won" ? "win" : "over");
      }, wait),
      window.setTimeout(() => setOverlay("armed"), wait + ARM_MS),
    );
  }

  /** Applies one move to the latest board; false when nothing moved. */
  function applyMove(direction: Direction) {
    const current = roundRef.current;
    if (current.phase !== "playing") return false;
    const result = slide(current.board, direction);
    if (!result.moved) return false;
    beginRun();
    const maxTile = Math.max(current.maxTile, result.largestMerge);
    let phase: RoundPhase = "playing";
    let celebrated = current.celebrated;
    if (!celebrated && result.largestMerge >= GOAL) {
      phase = "won";
      celebrated = true;
    } else if (!hasMoves(result.board)) {
      phase = "over";
    }
    const next: Round = { ...current, board: result.board, phase, celebrated, maxTile };
    commit(next);
    if (effects === "full") setMoveFx((fx) => ({ dir: direction, beat: (fx?.beat ?? 0) + 1 }));
    if (result.gained) {
      setGain({ key: result.board.score, value: result.gained });
      play("merge", Math.min(1.8, 0.85 + Math.log2(result.largestMerge) / 14));
      if (effects === "full") {
        const strength = result.largestMerge >= 512 ? 1.6 : result.largestMerge >= 128 ? 1.1 : 0.6;
        setPulse((last) => ({ kind: "thump", dir: direction, strength, beat: (last?.beat ?? 0) + 1 }));
      }
      if (effects !== "off" && "vibrate" in navigator) navigator.vibrate(Math.min(30, 6 + Math.log2(result.largestMerge)));
    } else {
      play("move");
    }
    if (phase !== "playing") {
      queue.current = [];
      submit(next.board.score, { variant: variantOf(next) });
      settle(next);
      sendAchievementEvent({ type: "run_finished", game: "2048", maxTile });
      reveal(phase);
    }
    return true;
  }

  /** Runs queued moves one at a time, each after the previous slide has finished. */
  function pump() {
    while (moveTimer.current === null && queue.current.length) {
      const direction = queue.current.shift() as Direction;
      if (applyMove(direction)) {
        if (effects === "off") continue;
        moveTimer.current = window.setTimeout(() => {
          moveTimer.current = null;
          pump();
        }, MOVE_MS);
      } else if (effects === "full" && roundRef.current.phase === "playing") {
        // A move that changes nothing nudges the board, so the key press still feels answered.
        setPulse((last) => ({ kind: "shake", dir: direction, strength: 1, beat: (last?.beat ?? 0) + 1 }));
      }
    }
  }

  function requestMove(direction: Direction) {
    if (roundRef.current.phase !== "playing" || queue.current.length >= MAX_QUEUED) return;
    queue.current.push(direction);
    pump();
  }

  function restart() {
    const current = roundRef.current;
    clearTimers();
    if (current.phase === "playing" && current.maxTile > 2) sendAchievementEvent({ type: "run_finished", game: "2048", maxTile: current.maxTile });
    submit(current.board.score, { variant: variantOf(current) });
    settle(current, { announce: true });
    baseline.current = 0;
    commit(freshRound(current.mode));
    setOverlay("hidden");
    setGain(null);
    boardRef.current?.focus({ preventScroll: true });
  }

  function keepPlaying() {
    const current = roundRef.current;
    if (current.phase !== "won") return;
    clearTimers();
    // The win already paid; coins from here count only the new points.
    baseline.current = current.board.score;
    if (!hasMoves(current.board)) {
      commit({ ...current, phase: "over" });
      setOverlay("armed");
      return;
    }
    commit({ ...current, phase: "playing" });
    setOverlay("hidden");
    boardRef.current?.focus({ preventScroll: true });
  }

  /** Each mode keeps its own saved round; switching leaves the current one where it is. */
  function switchMode(mode: Mode) {
    const current = roundRef.current;
    if (mode === current.mode) return;
    clearTimers();
    submit(current.board.score, { variant: variantOf(current) });
    settle(current, { announce: true });
    if (current.phase === "playing" && current.maxTile > 2) sendAchievementEvent({ type: "run_progress", game: "2048", maxTile: current.maxTile });
    const next = loadRound(userId, mode);
    baseline.current = next.board.score;
    commit(next);
    setOverlay(next.phase === "playing" ? "hidden" : "armed");
    setGain(null);
    try {
      window.localStorage.setItem(modeKey(userId), mode);
    } catch {
      // Not remembered for next time; nothing else depends on it.
    }
    boardRef.current?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    const direction = keyDirection(event);
    if (!direction) return false;
    requestMove(direction);
    return true;
  });

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.id !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y, 24);
    if (direction) requestMove(direction);
  }

  const { board, phase, mode } = round;
  const size = board.size;
  const score = board.score;
  const best = records[variantOf(round)] ?? 0;
  const shownBest = Math.max(best, score);
  const newBest = score > 0 && score >= best;
  const pastDaily = mode === "daily" && round.date !== null && round.date !== today;
  const armed = overlay === "armed";
  const lively = effects === "full";
  const [dx, dy] = pulse ? AXIS[pulse.dir] : [0, 0];
  // Id order never changes for tiles already on the board: moving DOM nodes would cancel their slide.
  const tiles = [...board.tiles].sort((a, b) => a.id - b.id);

  return (
    <GameShell
      game="2048"
      title="2048"
      active={phase === "playing"}
      stats={
        <>
          <Stat
            label="Score"
            value={
              <span className="relative">
                <span key={`score-${gain?.key ?? "start"}`} className={cn("inline-block", gain && lively && "g2048-score")}>
                  {score.toLocaleString("en")}
                </span>
                {gain && effects !== "off" ? (
                  <span key={`gain-${gain.key}`} aria-hidden className="g2048-gain">
                    +{gain.value.toLocaleString("en")}
                  </span>
                ) : null}
              </span>
            }
          />
          <Stat label={mode === "daily" ? (pastDaily ? "Daily best" : "Today's best") : "Best"} value={shownBest.toLocaleString("en")} highlight={newBest} />
          <div role="group" aria-label="Board" className="ml-auto flex flex-wrap items-center gap-1 self-center">
            {MODES.map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={option.id === mode ? "default" : "outline"}
                className="h-8 px-2.5"
                aria-pressed={option.id === mode}
                title={option.title}
                onClick={() => switchMode(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </>
      }
      actions={
        <Button variant="outline" size="sm" className="h-8" onClick={restart}>
          <RotateCcw aria-hidden />
          New game
        </Button>
      }
      help="Use the arrow keys (or WASD), or swipe on the board. Matching tiles merge once per move; reach 2048 to win, then keep going if you like. Every board size and the daily challenge keep their own round and best, and unfinished rounds resume where you left them."
    >
      {mode === "daily" && round.date ? (
        <p className="mb-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Daily challenge · {formatDailyDate(round.date)}</span>
          <span>The same start and tiles for everyone; retry as often as you like.</span>
          {pastDaily ? <span>A new challenge is ready: start a new game to play it.</span> : <DailyCountdown />}
        </p>
      ) : null}
      <div className="arcade-stage [--stage-h:min(62dvh,34rem)] [--stage-ratio:1]">
        <div
          ref={boardRef}
          tabIndex={-1}
          role="group"
          aria-label={`2048 board, ${size} by ${size}, score ${score}. Use the arrow keys or swipe to move the tiles.`}
          className="g2048 outline-none"
          data-effects={effects}
          data-tiles={look.tiles}
          data-board={look.board}
          data-font={look.font}
          data-merge={look.merge}
          data-style={look.style}
          data-dir={lively ? moveFx?.dir : undefined}
          data-beat={lively && moveFx ? moveFx.beat % 2 : undefined}
          data-pulse={lively && pulse ? `${pulse.kind}${pulse.beat % 2}` : undefined}
          style={{ "--n": size, "--dx": dx, "--dy": dy, "--thump": `${pulse?.strength ?? 0}cqi` } as CSSProperties}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipe.current = null)}
        >
          {Array.from({ length: size * size }, (_, cell) => (
            <div key={cell} aria-hidden className="g2048-cell" style={{ "--r": Math.floor(cell / size), "--c": cell % size } as CSSProperties} />
          ))}
          {tiles.map((tile) => (
            <div
              key={tile.id}
              data-step={tileStep(tile.value)}
              className={cn(
                "g2048-tile",
                tile.merged && "is-merged",
                tile.merged && tile.value >= 128 && "is-big",
                tile.fresh && "is-fresh",
                tile.consumed && "is-consumed",
                tile.moved && "is-moved",
              )}
              aria-hidden={tile.consumed || undefined}
              style={{ "--r": tile.row, "--c": tile.col, "--fs": fontScale(tile.value) } as CSSProperties}
            >
              <span className="g2048-face">{tile.value}</span>
            </div>
          ))}
        </div>
        {phase === "won" && overlay !== "hidden" ? (
          <GameOverlay
            title="You made 2048!"
            actions={
              <>
                <Button ref={primaryRef} size="sm" onClick={keepPlaying} disabled={!armed}>
                  Continue
                </Button>
                <Button size="sm" variant="outline" onClick={restart} disabled={!armed}>
                  New game
                </Button>
              </>
            }
          >
            Score {score.toLocaleString("en")}
            {newBest ? " · new best" : ""}
            <span className="mt-1 block text-xs">Continue to keep this board and aim for even bigger tiles.</span>
            <CoinReward state={coins} />
          </GameOverlay>
        ) : null}
      </div>
      {phase === "over" && overlay !== "hidden" ? (
        <div
          ref={resultRef}
          role="status"
          className="mx-auto mt-3 flex w-full max-w-md flex-wrap items-center justify-center gap-x-5 gap-y-2 rounded-xl border border-border bg-surface/70 px-4 py-3 text-center"
        >
          <div className="min-w-0">
            <p className="text-base font-bold tracking-tight">No moves left</p>
            <p className="text-sm text-muted-foreground tabular-nums">
              Score {score.toLocaleString("en")} · {newBest ? "new best!" : `best ${shownBest.toLocaleString("en")}`}
            </p>
            <CoinReward state={coins} />
          </div>
          <Button ref={primaryRef} size="sm" onClick={restart} disabled={!armed}>
            <RotateCcw aria-hidden />
            {mode === "daily" && !pastDaily ? "Retry challenge" : "Play again"}
          </Button>
        </div>
      ) : null}
    </GameShell>
  );
}
