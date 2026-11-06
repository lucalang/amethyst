"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { puzzleScore, type PuzzleGame } from "@/lib/arcade";
import { dailyDate, dailyVariant, seedFrom, seededRandom } from "@/lib/arcade-daily";
import { cn } from "@/lib/utils";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { DailyCountdown, formatDailyDate, useDailyDate } from "./daily";
import { GameOverlay, GameShell, Stat, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import "./minigames.css";

export type PuzzleMode = "practice" | "daily";
type PuzzlePhase = "ready" | "playing" | "paused" | "solved";
type Generated<P> = { puzzle: P; date: string | null; id: number };

function make<P>(game: PuzzleGame, generate: (random: () => number, mode: PuzzleMode) => P, mode: PuzzleMode, id: number): Generated<P> {
  const date = mode === "daily" ? dailyDate() : null;
  const random = date ? seededRandom(seedFrom(`${game}:${date}`)) : Math.random;
  return { puzzle: generate(random, mode), date, id };
}

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * One logic puzzle at a time: Practice (a fresh random puzzle) or the Daily puzzle (the same for
 * everyone, new at 00:00 UTC). The clock starts with the first move and pauses when the player
 * leaves; solving reports one run (score from the solve time) and saves the personal best.
 */
export function usePuzzleSession<P>(game: PuzzleGame, generate: (random: () => number, mode: PuzzleMode) => P, initialRecords: Record<string, number>) {
  const { play } = useArcade();
  const { records, submit } = useRecords(game, initialRecords);
  const { begin, finish, coins } = useArcadeRun(game);
  const [mode, setMode] = useState<PuzzleMode>("practice");
  const [current, setCurrent] = useState(() => make(game, generate, "practice", 0));
  const [phase, setPhaseState] = useState<PuzzlePhase>("ready");
  const [seconds, setSeconds] = useState(0);
  const [score, setScore] = useState(0);
  const phaseRef = useRef<PuzzlePhase>("ready");
  const clock = useRef({ spent: 0, since: 0 });

  useGameAchievementTracking(game, phase);

  const setPhase = useCallback((next: PuzzlePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const elapsed = () => clock.current.spent + (clock.current.since ? performance.now() - clock.current.since : 0);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      const { spent, since } = clock.current;
      setSeconds(Math.floor((spent + (since ? performance.now() - since : 0)) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [phase]);

  // Leaving with an unsolved puzzle closes its run without a score.
  useEffect(() => () => finish(0, {}, { keepalive: true }), [finish]);

  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    clock.current = { spent: clock.current.spent + performance.now() - clock.current.since, since: 0 };
    setPhase("paused");
  }, [setPhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    clock.current = { ...clock.current, since: performance.now() };
    setPhase("playing");
  }, [setPhase]);

  useAway(pause);

  /** Call on every move: the first one starts the clock and the run. */
  function touch() {
    if (phaseRef.current === "paused") resume();
    if (phaseRef.current !== "ready") return;
    begin(current.date ? dailyVariant(current.date) : "");
    clock.current = { spent: 0, since: performance.now() };
    setPhase("playing");
  }

  function solve(metrics: Record<string, number> = {}) {
    if (phaseRef.current !== "playing") return;
    const ms = elapsed();
    const final = puzzleScore(ms / 1000);
    clock.current = { spent: ms, since: 0 };
    setSeconds(Math.floor(ms / 1000));
    setScore(final);
    setPhase("solved");
    submit(final, { variant: current.date ? dailyVariant(current.date) : "" });
    finish(final, { seconds: Math.round(ms / 1000), ...metrics });
    play("win");
  }

  function fresh(nextMode: PuzzleMode) {
    finish(0, {}, { keepalive: true });
    clock.current = { spent: 0, since: 0 };
    setSeconds(0);
    setScore(0);
    setCurrent((previous) => make(game, generate, nextMode, previous.id + 1));
    setPhase("ready");
  }

  function chooseMode(next: PuzzleMode) {
    if (next === mode) return;
    setMode(next);
    fresh(next);
  }

  useGameKeys((event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return false;
    if (event.key !== "p" && event.key !== "P") return false;
    if (phaseRef.current === "playing") pause();
    else if (phaseRef.current === "paused") resume();
    else return false;
    return true;
  });

  const variant = current.date ? dailyVariant(current.date) : "";
  return {
    game,
    mode,
    puzzle: current.puzzle,
    puzzleId: current.id,
    date: current.date,
    phase,
    seconds,
    score,
    best: records[variant] ?? 0,
    coins,
    /** Board input is ignored while paused or after solving. */
    locked: phase === "paused" || phase === "solved",
    touch,
    solve,
    pause,
    resume,
    chooseMode,
    again: () => fresh(mode),
  };
}

export type PuzzleSession<P> = ReturnType<typeof usePuzzleSession<P>>;

/** The shared frame for puzzle games: clock, best, mode switch, board, tools, result and rules. */
export function PuzzleFrame<P>({
  session,
  title,
  rules,
  tools,
  children,
}: {
  session: PuzzleSession<P>;
  title: string;
  rules: ReactNode[];
  tools?: ReactNode;
  children: ReactNode;
}) {
  const today = useDailyDate();
  const { phase, mode, date, seconds, score, best } = session;
  const active = phase === "playing" || phase === "paused";
  const daily = date !== null;

  return (
    <GameShell
      game={session.game}
      title={title}
      active={active}
      leaderboard={date ? `daily-${date}` : ""}
      stats={
        <>
          <Stat label="Time" value={formatClock(seconds)} />
          <Stat label={daily ? (date === today ? "Today's best" : "Daily best") : "Best"} value={best} highlight={phase === "solved" && score >= best} />
          <div role="group" aria-label="Puzzle" className="ml-auto flex items-center gap-1 self-center">
            {([
              ["practice", "Practice", "A new random puzzle every time"],
              ["daily", "Daily", "The same puzzle for everyone, new every day at 00:00 UTC"],
            ] as const).map(([id, label, hint]) => (
              <Button key={id} size="sm" variant={mode === id ? "default" : "outline"} className="h-8 px-2.5" aria-pressed={mode === id} title={hint} onClick={() => session.chooseMode(id)}>
                {label}
              </Button>
            ))}
          </div>
        </>
      }
      actions={
        active ? (
          <Button variant="outline" size="sm" className="h-8" onClick={phase === "paused" ? session.resume : session.pause}>
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            {phase === "paused" ? "Resume" : "Pause"}
          </Button>
        ) : null
      }
    >
      <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-3">
        <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          {daily ? (
            <>
              <span className="font-semibold text-foreground">Daily puzzle · {formatDailyDate(date)}</span>
              {date === today ? <DailyCountdown label="Next puzzle in" /> : <span>This puzzle still counts for {formatDailyDate(date)}.</span>}
            </>
          ) : (
            <span className="font-semibold text-foreground">Practice puzzle</span>
          )}
          <span>{phase === "ready" ? "The clock starts with your first move." : "Press P to pause."}</span>
        </p>
        <div className="relative">
          <div className={cn("transition-[filter] duration-200", phase === "paused" && "pointer-events-none blur-md select-none")} aria-hidden={phase === "paused"}>
            {children}
          </div>
          {phase === "paused" ? (
            <GameOverlay title="Paused" actions={<Button size="sm" onClick={session.resume} autoFocus>Resume</Button>}>
              The clock is stopped at {formatClock(seconds)}.
            </GameOverlay>
          ) : null}
        </div>
        {phase === "solved" ? (
          <div role="status" className="puzzle-solved flex flex-col items-center gap-2 rounded-xl border border-amethyst/40 bg-amethyst/10 px-4 py-3 text-center">
            <p className="flex items-center gap-2 text-base font-bold">
              <Sparkles aria-hidden className="size-4 text-amethyst" />
              Solved in {formatClock(seconds)}
            </p>
            <p className="text-sm text-muted-foreground">
              Score {score}
              {score >= best ? " · new best!" : ` · best ${best}`}
            </p>
            <CoinReward state={session.coins} className="text-sm" />
            <Button size="sm" onClick={session.again} autoFocus>
              <RefreshCw aria-hidden />
              {daily ? "Play again" : "New puzzle"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {tools}
            {mode === "practice" ? (
              <Button variant="outline" size="sm" onClick={session.again}>
                <RefreshCw aria-hidden />
                New puzzle
              </Button>
            ) : null}
          </div>
        )}
        <section aria-label="How to play" className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm">
          <h2 className="mb-1 font-semibold">How to play</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {rules.map((rule, index) => (
              <li key={index}>{rule}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Faster solves score more: 1,000 points minus 4 per second, at least 100.</p>
        </section>
      </div>
    </GameShell>
  );
}
