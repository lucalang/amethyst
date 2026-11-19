"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lightbulb, Pause, Play, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { puzzleScore, type PuzzleGame } from "@/lib/arcade";
import { dailyDate, dailyVariant, seedFrom, seededRandom } from "@/lib/arcade-daily";
import { HINTS_PER_LEVEL, MAX_PUZZLE_LEVEL, PUZZLE_DIFFICULTIES, levelInfo, levelsBoard, type PuzzleDifficulty } from "@/lib/minigames/levels";
import { cn } from "@/lib/utils";
import { CoinReward, useArcadeRun } from "./coin-reward";
import { useCompetitionLock } from "./competition";
import { DailyCountdown, formatDailyDate, useDailyDate } from "./daily";
import { GameOverlay, GameShell, Stat, focusQuietly, useArcade, useAway, useGameAchievementTracking, useGameKeys, useRecords } from "./game-shell";
import { lookAttributes, PuzzleCelebration, type Celebration } from "./puzzle-looks";
import "./minigames.css";

/** Levels: an endless ladder of generated puzzles. Daily: today's shared puzzle, scored by solve speed. */
export type PuzzleMode = "levels" | "daily";
/** What a game should generate: a level's puzzle, the daily puzzle, or one seeded Wager/Tournament puzzle on a board. */
export type PuzzleSpec = { kind: "level"; level: number; difficulty: PuzzleDifficulty } | { kind: "daily" } | { kind: "match"; board: string };
type PuzzlePhase = "ready" | "playing" | "paused" | "solved";
type Generated<P> = { puzzle: P; date: string | null; id: number; spec: PuzzleSpec; level: number; board: string };
type Generate<P> = (random: () => number, spec: PuzzleSpec) => P;

/** A run of levels: its seed (every level's puzzle is derived from it) and the level to play next. */
type LevelRun = { seed: number; level: number };

/** Medium keeps the original key, so a run saved before difficulties existed carries on as Medium. */
const runKey = (userId: string, game: string, difficulty: PuzzleDifficulty) => `archive:arcade:levels:${userId}:${game}${difficulty === "medium" ? "" : `:${difficulty}`}`;
const difficultyKey = (userId: string, game: string) => `archive:arcade:levels:${userId}:${game}:difficulty`;

function loadDifficulty(userId: string, game: PuzzleGame): PuzzleDifficulty {
  try {
    const saved = window.localStorage.getItem(difficultyKey(userId, game));
    if (PUZZLE_DIFFICULTIES[game].some((option) => option.id === saved)) return saved as PuzzleDifficulty;
  } catch {
    // Unreadable: Medium.
  }
  return "medium";
}
const newRun = (): LevelRun => ({ seed: Math.floor(Math.random() * 2 ** 32) >>> 0, level: 1 });

function saveRun(userId: string, game: string, difficulty: PuzzleDifficulty, run: LevelRun) {
  try {
    window.localStorage.setItem(runKey(userId, game, difficulty), JSON.stringify(run));
  } catch {
    // Private mode or full storage: the run still plays, it just won't survive a reload.
  }
}

/** The saved run of this account on this device, or a new run at Level 1 (saved at once, so a reload keeps its puzzle). */
function loadRun(userId: string, game: string, difficulty: PuzzleDifficulty): LevelRun {
  try {
    const saved = JSON.parse(window.localStorage.getItem(runKey(userId, game, difficulty)) ?? "null") as Partial<LevelRun> | null;
    if (saved && Number.isInteger(saved.seed) && Number.isInteger(saved.level) && saved.seed! >= 0 && saved.seed! < 2 ** 32 && saved.level! >= 1 && saved.level! <= MAX_PUZZLE_LEVEL) {
      return { seed: saved.seed!, level: saved.level! };
    }
  } catch {
    // Unreadable save: start over.
  }
  const run = newRun();
  saveRun(userId, game, difficulty, run);
  return run;
}

function make<P>(game: PuzzleGame, generate: Generate<P>, spec: PuzzleSpec, id: number, run: LevelRun, matchSeed?: string): Generated<P> {
  const date = spec.kind === "daily" ? dailyDate() : null;
  // Each level's puzzle is a fixed function of the run's seed and the level, so reloading never rerolls it.
  const random =
    spec.kind === "level" ? seededRandom(seedFrom(`${game}:level:${spec.difficulty}:${run.seed}:${spec.level}`)) : matchSeed ? seededRandom(seedFrom(`${game}:${matchSeed}`)) : date ? seededRandom(seedFrom(`${game}:${date}`)) : Math.random;
  const board = spec.kind === "level" ? levelsBoard(spec.difficulty) : date ? dailyVariant(date) : spec.kind === "match" ? spec.board : "";
  return { puzzle: generate(random, spec), date, id, spec, level: spec.kind === "level" ? spec.level : 0, board };
}

/** How long a solved level stays on screen before the next one starts. */
const AUTO_NEXT_MS = 1600;

export const formatClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Seconds added to the clock for each hint. */
export const HINT_PENALTY = 15;

/**
 * One logic puzzle at a time, in one of two modes. Levels is an endless ladder: Level 1 first, a new generated
 * puzzle for every level, and solving one opens the next. The run (its seed and level) is saved per account on
 * this device, so a reload brings back the same puzzle, and the personal best is the highest level completed.
 * The Daily puzzle is the same for everyone (new at 00:00 UTC) and still scores solve speed. The clock starts
 * with the first move and pauses when the player leaves. In Wagers and Tournaments one seeded puzzle is played
 * on the locked board, scored as before.
 */
export function usePuzzleSession<P>(game: PuzzleGame, generate: Generate<P>, initialRecords: Record<string, number>, userId: string) {
  const { play } = useArcade();
  const { records, submit } = useRecords(game, initialRecords);
  const { begin, finish, coins } = useArcadeRun(game);
  const lock = useCompetitionLock(game);
  const [mode, setMode] = useState<PuzzleMode>("levels");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>(() => (lock ? "medium" : loadDifficulty(userId, game)));
  const [run, setRunState] = useState<LevelRun>(() => (lock ? newRun() : loadRun(userId, game, difficulty)));
  const runRef = useRef(run);
  const [current, setCurrent] = useState(() => make(game, generate, lock ? { kind: "match", board: lock.board } : { kind: "level", level: run.level, difficulty }, 0, run, lock?.seed));
  const [phase, setPhaseState] = useState<PuzzlePhase>("ready");
  const [seconds, setSeconds] = useState(0);
  const [score, setScore] = useState(0);
  const [hints, setHints] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const hintCount = useRef(0);
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

  const view = current.spec.kind === "level" ? "level" : current.spec.kind === "daily" ? "daily" : "match";
  const variant = current.board;
  const hintsLeft = view === "level" ? Math.max(0, HINTS_PER_LEVEL - hints) : Infinity;

  /** Call on every move: the first one starts the clock and the run. */
  function touch() {
    if (phaseRef.current === "paused") resume();
    if (phaseRef.current !== "ready") return;
    begin(variant);
    clock.current = { spent: 0, since: performance.now() };
    setPhase("playing");
  }

  /** Call when a hint is applied, before committing its move: starts the clock (Daily and match hints also cost time). */
  function takeHint() {
    if (phaseRef.current === "solved") return;
    touch();
    if (view !== "level") clock.current = { ...clock.current, spent: clock.current.spent + HINT_PENALTY * 1000 };
    setSeconds(Math.floor(elapsed() / 1000));
    hintCount.current += 1;
    setHints(hintCount.current);
    play("power");
  }

  /** The saved run moves to `next` (kept in a ref too, so the puzzle generated right after reads it). */
  function commitRun(next: LevelRun, forDifficulty = difficulty) {
    runRef.current = next;
    setRunState(next);
    saveRun(userId, game, forDifficulty, next);
  }

  /** `proof` goes to the server with the result, for games whose solves it checks (Sumbreak). */
  function solve(metrics: Record<string, number> = {}, proof?: unknown) {
    if (phaseRef.current !== "playing") return;
    const ms = elapsed();
    clock.current = { spent: ms, since: 0 };
    setSeconds(Math.floor(ms / 1000));
    setPhase("solved");
    const report = { seconds: Math.round(ms / 1000), hints: hintCount.current, ...metrics };
    if (current.spec.kind === "level") {
      // The record is the highest level completed; the next level is saved now, so a reload after solving moves on.
      const done = current.spec.level;
      setNewBest(submit(done, { variant, proof }));
      finish(done, report, { proof });
      commitRun({ seed: runRef.current.seed, level: Math.min(done + 1, MAX_PUZZLE_LEVEL) });
    } else {
      const final = puzzleScore(ms / 1000);
      setScore(final);
      submit(final, { variant, proof });
      finish(final, report, { proof });
    }
    play("win");
  }

  function fresh(nextMode: PuzzleMode, nextDifficulty = difficulty) {
    finish(0, {}, { keepalive: true });
    clock.current = { spent: 0, since: 0 };
    setSeconds(0);
    setScore(0);
    setHints(0);
    setNewBest(false);
    hintCount.current = 0;
    const spec: PuzzleSpec = lock ? { kind: "match", board: lock.board } : nextMode === "daily" ? { kind: "daily" } : { kind: "level", level: runRef.current.level, difficulty: nextDifficulty };
    setCurrent((previous) => make(game, generate, spec, previous.id + 1, runRef.current, lock?.seed));
    setPhase("ready");
  }

  function chooseMode(next: PuzzleMode) {
    if (next === mode) return;
    setMode(next);
    fresh(next);
  }

  /** A new run at Level 1 on this difficulty; the personal best is kept. */
  function restartRun() {
    commitRun(newRun());
    setMode("levels");
    fresh("levels");
  }

  /** Each difficulty keeps its own run and record; switching picks up where that one left off. */
  function chooseDifficulty(next: PuzzleDifficulty) {
    if (lock || (next === difficulty && mode === "levels")) return;
    try {
      window.localStorage.setItem(difficultyKey(userId, game), next);
    } catch {
      // Not remembered across visits.
    }
    const saved = loadRun(userId, game, next);
    runRef.current = saved;
    setRunState(saved);
    setDifficulty(next);
    setMode("levels");
    fresh("levels", next);
  }

  // A solved level moves on by itself after a short beat (the Next level button on the board skips the wait).
  useEffect(() => {
    if (phase !== "solved" || view !== "level" || lock) return;
    const id = window.setTimeout(() => fresh("levels"), AUTO_NEXT_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, view, current.id]);

  useGameKeys((event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return false;
    if (event.key !== "p" && event.key !== "P") return false;
    if (phaseRef.current === "playing") pause();
    else if (phaseRef.current === "paused") resume();
    else return false;
    return true;
  });

  return {
    game,
    competing: lock !== null,
    mode,
    view,
    difficulty,
    /** The level on the board (Levels mode); 0 otherwise. */
    level: current.level,
    variant,
    puzzle: current.puzzle,
    puzzleId: current.id,
    date: current.date,
    phase,
    seconds,
    /** Daily and match puzzles: the solve-speed score. Levels have none. */
    score,
    hints,
    hintsLeft,
    /** Levels mode: the highest level completed (0 if none yet); otherwise the best score of this board. */
    best: records[variant] ?? 0,
    newBest,
    coins,
    /** Board input is ignored while paused or after solving. */
    locked: phase === "paused" || phase === "solved",
    touch,
    takeHint,
    solve,
    pause,
    resume,
    chooseMode,
    restartRun,
    chooseDifficulty,
    again: () => fresh(mode),
  };
}

export type PuzzleSession<P> = ReturnType<typeof usePuzzleSession<P>>;

/** The shared frame for puzzle games: clock, level or best, mode switch, board, tools, result and rules. */
export function PuzzleFrame<P>({
  session,
  title,
  rules,
  tools,
  onHint,
  celebrate,
  children,
}: {
  session: PuzzleSession<P>;
  title: string;
  rules: ReactNode[];
  tools?: ReactNode;
  /** Applies one hint step (calling `session.takeHint()` if it changes anything). */
  onHint?: () => void;
  /** Overlay played once when solved (from the equipped cosmetic). */
  celebrate?: Celebration;
  children: ReactNode;
}) {
  const today = useDailyDate();
  const { look, effects } = useArcade();
  const { phase, mode, view, date, seconds, score, best, level } = session;
  const [confirming, setConfirming] = useState(false);
  const active = phase === "playing" || phase === "paused";
  const daily = date !== null;
  const levels = view === "level";
  const info = levels ? levelInfo(session.game, level, session.difficulty) : null;
  const hintLabel = levels ? `${session.hintsLeft} left` : `+${HINT_PENALTY}s`;

  return (
    <GameShell
      game={session.game}
      title={title}
      active={active}
      leaderboard={session.variant}
      stats={
        <>
          {levels ? (
            <>
              <Stat label="Level" value={level} highlight />
              <Stat label="Highest level" value={best || "—"} />
            </>
          ) : null}
          <Stat label="Time" value={formatClock(seconds)} />
          {levels ? null : <Stat label={daily ? (date === today ? "Today's best" : "Daily best") : "Best"} value={best} highlight={phase === "solved" && score >= best} />}
          <div role="group" aria-label="Puzzle" hidden={session.competing} className="ml-auto flex items-center gap-1 self-center">
            {([
              ["levels", "Levels", "Endless levels, each a new puzzle that gets a little harder"],
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
        {levels && !session.competing ? (
          <div role="group" aria-label="Difficulty" className="flex flex-wrap justify-center gap-1">
            {PUZZLE_DIFFICULTIES[session.game].map((option) => (
              <Button
                key={option.id}
                size="sm"
                variant={session.difficulty === option.id ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                aria-pressed={session.difficulty === option.id}
                title={option.hint}
                onClick={() => session.chooseDifficulty(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        ) : null}
        <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-center text-xs text-muted-foreground">
          {levels && info ? (
            <>
              <span className="font-semibold text-foreground">{PUZZLE_DIFFICULTIES[session.game].find((option) => option.id === session.difficulty)?.label} · Level {level}</span>
              <span>{info.detail}</span>
              {info.next ? <span>Next: {info.next}</span> : null}
            </>
          ) : daily ? (
            <>
              <span className="font-semibold text-foreground">Daily puzzle · {formatDailyDate(date)}</span>
              {date === today ? <DailyCountdown label="Next puzzle in" /> : <span>This puzzle still counts for {formatDailyDate(date)}.</span>}
            </>
          ) : (
            <span className="font-semibold text-foreground">Match puzzle</span>
          )}
          <span>{phase === "ready" ? "The clock starts with your first move." : "Press P to pause."}</span>
        </p>
        <div className="relative">
          <div className={cn("transition-[filter] duration-200", phase === "paused" && "pointer-events-none blur-md select-none")} aria-hidden={phase === "paused"} {...lookAttributes(look)}>
            {children}
          </div>
          {phase === "solved" && celebrate && effects !== "off" ? <PuzzleCelebration kind={celebrate} /> : null}
          {phase === "solved" && levels && !session.competing ? (
            <GameOverlay title={`Level ${level} complete`} actions={<Button size="sm" onClick={session.again} ref={focusQuietly}><Play aria-hidden />Next level</Button>}>
              Next level starting…
            </GameOverlay>
          ) : null}
          {phase === "paused" ? (
            <GameOverlay title="Paused" actions={<Button size="sm" onClick={session.resume} ref={focusQuietly}>Resume</Button>}>
              The clock is stopped at {formatClock(seconds)}.
            </GameOverlay>
          ) : null}
        </div>
        {phase === "solved" ? (
          <div role="status" className="puzzle-solved flex flex-col items-center gap-2 rounded-xl border border-amethyst/40 bg-amethyst/10 px-4 py-3 text-center">
            <p className="flex items-center gap-2 text-base font-bold">
              <Sparkles aria-hidden className="size-4 text-amethyst" />
              {levels ? `Level ${level} complete` : `Solved in ${formatClock(seconds)}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {levels ? (
                <>
                  Solved in {formatClock(seconds)}
                  {session.newBest ? " · new highest level!" : ` · highest level ${best}`}
                </>
              ) : (
                <>
                  Score {score}
                  {score >= best ? " · new best!" : ` · best ${best}`}
                </>
              )}
              {session.hints > 0 ? ` · ${session.hints} hint${session.hints === 1 ? "" : "s"}` : ""}
            </p>
            <CoinReward state={session.coins} className="text-sm" />
            {session.competing ? null : (
              <Button size="sm" onClick={session.again} ref={focusQuietly}>
                {levels ? <Play aria-hidden /> : <RefreshCw aria-hidden />}
                {levels ? "Next level" : "Play again"}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {tools}
            {onHint ? (
              <Button variant="outline" size="sm" onClick={onHint} disabled={phase === "paused" || session.hintsLeft === 0} title={levels ? `Reveal one step (${HINTS_PER_LEVEL} per level)` : `Reveal one step (+${HINT_PENALTY} seconds)`}>
                <Lightbulb aria-hidden />
                Hint
                <span className="text-xs text-muted-foreground">{hintLabel}</span>
              </Button>
            ) : null}
          </div>
        )}
        {levels ? (
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            {confirming ? (
              <>
                <span>Start over at Level 1 on {PUZZLE_DIFFICULTIES[session.game].find((option) => option.id === session.difficulty)?.label}? Your highest level ({best || "none yet"}) is kept.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setConfirming(false);
                    session.restartRun();
                  }}
                >
                  Start over
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setConfirming(false)}>
                  Keep going
                </Button>
              </>
            ) : level > 1 || phase === "solved" ? (
              <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setConfirming(true)}>
                <RotateCcw aria-hidden />
                New run from Level 1
              </Button>
            ) : null}
          </div>
        ) : null}
        <section aria-label="How to play" className="rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm">
          <h2 className="mb-1 font-semibold">How to play</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {rules.map((rule, index) => (
              <li key={index}>{rule}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {levels
              ? `Solve a puzzle to reach the next level; every level is a new puzzle and a little harder. Each difficulty has its own level and highest level. Your progress is saved, and your highest level is kept when you start a new run. You get ${HINTS_PER_LEVEL} hints per level.`
              : `Faster solves score more: 1,000 points minus 4 per second, at least 100. Each hint adds ${HINT_PENALTY} seconds.`}
          </p>
        </section>
      </div>
    </GameShell>
  );
}
