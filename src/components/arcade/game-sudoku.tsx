"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, Loader2, Pause, PencilLine, Play, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SUDOKU_CELLS, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, formatDuration, type RunReward, type SudokuDifficulty, type SudokuSave } from "@/lib/arcade";
import { cn } from "@/lib/utils";
import { CoinReward, type CoinState } from "./coin-reward";
import { GameOverlay, GameShell, Stat, sendAchievementEvent, useArcade, useAway, useGameKeys } from "./game-shell";

type Snapshot = { entries: string; notes: number[] };
type Result = { seconds: number; best: number | null; improved: boolean };
type Records = Partial<Record<SudokuDifficulty, number>>;

const EMPTY_ENTRIES = "0".repeat(SUDOKU_CELLS);
const EMPTY_NOTES: number[] = Array<number>(SUDOKU_CELLS).fill(0);
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const HISTORY_LIMIT = 200;

const rowOf = (cell: number) => Math.floor(cell / 9);
const colOf = (cell: number) => cell % 9;
const boxOf = (cell: number) => Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);

/** The 20 cells sharing a row, column or box with each cell. */
const PEERS: number[][] = Array.from({ length: SUDOKU_CELLS }, (_, cell) =>
  Array.from({ length: SUDOKU_CELLS }, (_, other) => other).filter(
    (other) => other !== cell && (rowOf(other) === rowOf(cell) || colOf(other) === colOf(cell) || boxOf(other) === boxOf(cell)),
  ),
);

/** Pause-aware stopwatch kept outside React state so ticking doesn't re-render more than needed. */
function createClock(initial: number) {
  let base = initial;
  let since: number | null = null;
  return {
    start() {
      since ??= performance.now();
    },
    stop() {
      if (since !== null) base += performance.now() - since;
      since = null;
    },
    read() {
      return base + (since === null ? 0 : performance.now() - since);
    },
    set(value: number) {
      base = value;
      if (since !== null) since = performance.now();
    },
  };
}

const firstEmpty = (save: SudokuSave | null) => {
  if (!save) return 40;
  const index = [...save.puzzle].findIndex((clue, cell) => clue === "0" && save.entries[cell] === "0");
  return index === -1 ? 0 : index;
};

const digitAt = (puzzle: string, entries: string, cell: number) => Number(puzzle[cell] !== "0" ? puzzle[cell] : entries[cell]);

export default function GameSudoku({ initial, records: initialRecords }: { initial: SudokuSave | null; records: Records }) {
  const { play } = useArcade();
  const [game, setGame] = useState<SudokuSave | null>(initial);
  const [entries, setEntries] = useState(initial?.entries ?? EMPTY_ENTRIES);
  const [notes, setNotes] = useState<number[]>(initial?.notes ?? EMPTY_NOTES);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState(() => firstEmpty(initial));
  const [noteMode, setNoteMode] = useState(false);
  // A resumed puzzle waits for the player before its clock runs again.
  const [paused, setPaused] = useState(Boolean(initial && !initial.completed && initial.elapsedMs > 0));
  const [view, setView] = useState<"board" | "picker">(initial && !initial.completed ? "board" : "picker");
  const [records, setRecords] = useState<Records>(initialRecords);
  const [result, setResult] = useState<Result | null>(null);
  const [coins, setCoins] = useState<CoinState>({ status: "idle" });
  const [creating, setCreating] = useState<SudokuDifficulty | null>(null);
  const [confirming, setConfirming] = useState<SudokuDifficulty | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [clock] = useState(() => createClock(initial?.elapsedMs ?? 0));
  const [elapsed, setElapsed] = useState(initial?.elapsedMs ?? 0);
  const latest = useRef({ game, entries, notes });
  const dirty = useRef(false);
  const warned = useRef(false);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const startedGame = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { game, entries, notes };
  });

  const unfinished = game !== null && !game.completed;
  const running = view === "board" && unfinished && !paused && !finishing;

  useEffect(() => {
    if (!running || !game || startedGame.current === game.id) return;
    startedGame.current = game.id;
    sendAchievementEvent({ type: "game_started", game: "sudoku" });
  }, [game, running]);

  useEffect(() => {
    if (!running) return;
    clock.start();
    const id = window.setInterval(() => setElapsed(clock.read()), 250);
    return () => {
      window.clearInterval(id);
      clock.stop();
    };
  }, [running, clock]);

  const load = useCallback(
    (save: SudokuSave | null) => {
      setGame(save);
      setEntries(save?.entries ?? EMPTY_ENTRIES);
      setNotes(save?.notes ?? EMPTY_NOTES);
      setHistory([]);
      setSelected(firstEmpty(save));
      setResult(null);
      setCoins({ status: "idle" });
      setPaused(false);
      setView(save && !save.completed ? "board" : "picker");
      clock.stop();
      clock.set(save?.elapsedMs ?? 0);
      setElapsed(save?.elapsedMs ?? 0);
      dirty.current = false;
    },
    [clock],
  );

  /** Saves values, notes and time. Failures never interrupt play; the next change retries. */
  const persist = useCallback(async () => {
    const { game: current, entries: values, notes: marks } = latest.current;
    if (!current || current.completed || !dirty.current) return;
    dirty.current = false;
    try {
      await apiFetch("/api/arcade/sudoku", {
        method: "PATCH",
        json: { id: current.id, entries: values, notes: marks, elapsedMs: Math.round(clock.read()) },
        keepalive: true,
      });
      warned.current = false;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.message("This puzzle was finished or replaced in another window. Showing the latest one.");
        try {
          load((await apiFetch<{ game: SudokuSave | null }>("/api/arcade/sudoku")).game);
        } catch {
          // Keep the local board; the next save tries again.
        }
        return;
      }
      dirty.current = true;
      if (!warned.current) {
        warned.current = true;
        toast.error("Could not save your Sudoku progress. It will retry with your next move.");
      }
    }
  }, [clock, load]);

  // Debounced save after changes.
  useEffect(() => {
    if (!dirty.current) return;
    const id = window.setTimeout(() => void persist(), 1200);
    return () => window.clearTimeout(id);
  }, [entries, notes, persist]);

  // Leaving the page keeps the latest progress and time.
  useEffect(() => {
    return () => {
      dirty.current = true;
      void persist();
    };
  }, [persist]);

  function pause() {
    if (!running) return;
    clock.stop();
    setElapsed(clock.read());
    setPaused(true);
    dirty.current = true;
    void persist();
  }

  function resume() {
    setPaused(false);
    cellRefs.current[selected]?.focus({ preventScroll: true });
  }

  useAway(pause);

  const conflicts = useMemo(() => {
    const set = new Set<number>();
    if (!game) return set;
    for (let cell = 0; cell < SUDOKU_CELLS; cell += 1) {
      const digit = digitAt(game.puzzle, entries, cell);
      if (digit && PEERS[cell].some((peer) => digitAt(game.puzzle, entries, peer) === digit)) set.add(cell);
    }
    return set;
  }, [game, entries]);

  const counts = useMemo(() => {
    const placed = Array<number>(10).fill(0);
    if (game) for (let cell = 0; cell < SUDOKU_CELLS; cell += 1) placed[digitAt(game.puzzle, entries, cell)] += 1;
    return placed;
  }, [game, entries]);

  const editable = running && game !== null;

  function commit(nextEntries: string, nextNotes: number[]) {
    setHistory((past) => [...past.slice(-(HISTORY_LIMIT - 1)), { entries, notes }]);
    setEntries(nextEntries);
    setNotes(nextNotes);
    dirty.current = true;
    if (game && [...game.puzzle].every((clue, cell) => clue !== "0" || nextEntries[cell] !== "0")) {
      const filled = (cell: number) => digitAt(game.puzzle, nextEntries, cell);
      const valid = Array.from({ length: SUDOKU_CELLS }, (_, cell) => cell).every((cell) => PEERS[cell].every((peer) => filled(peer) !== filled(cell)));
      if (valid) void finish(nextEntries, nextNotes);
    }
  }

  function input(digit: number, asNote = noteMode) {
    if (!editable || !game || game.puzzle[selected] !== "0") return;
    const cell = selected;
    if (asNote) {
      if (entries[cell] !== "0") return;
      const nextNotes = [...notes];
      nextNotes[cell] ^= 1 << (digit - 1);
      play("chip", 0.9 + digit / 30);
      commit(entries, nextNotes);
      return;
    }
    const value = entries[cell] === String(digit) ? "0" : String(digit);
    const nextEntries = entries.slice(0, cell) + value + entries.slice(cell + 1);
    const nextNotes = [...notes];
    if (value !== "0") {
      nextNotes[cell] = 0;
      for (const peer of PEERS[cell]) nextNotes[peer] &= ~(1 << (digit - 1));
    }
    play(value === "0" ? "erase" : "tap", 0.9 + digit / 30);
    commit(nextEntries, nextNotes);
  }

  function erase() {
    if (!editable || !game || game.puzzle[selected] !== "0") return;
    if (entries[selected] === "0" && notes[selected] === 0) return;
    const nextNotes = [...notes];
    if (entries[selected] === "0") nextNotes[selected] = 0;
    play("erase");
    commit(entries.slice(0, selected) + "0" + entries.slice(selected + 1), nextNotes);
  }

  function undo() {
    if (!editable || !history.length) return;
    const last = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setEntries(last.entries);
    setNotes(last.notes);
    dirty.current = true;
    play("erase", 0.8);
  }

  async function finish(finalEntries: string, finalNotes: number[]) {
    if (!game) return;
    clock.stop();
    const ms = Math.round(clock.read());
    setElapsed(ms);
    setFinishing(true);
    dirty.current = false;
    play("win");
    const seconds = Math.max(1, Math.round(ms / 1000));
    setCoins({ status: "pending" });
    try {
      const response = await apiFetch<{ best: number; improved: boolean; reward: RunReward | null }>("/api/arcade/sudoku", {
        method: "PATCH",
        json: { id: game.id, entries: finalEntries, notes: finalNotes, elapsedMs: ms, complete: true },
      });
      setRecords((current) => ({ ...current, [game.difficulty]: response.best }));
      setResult({ seconds, best: response.best, improved: response.improved });
      // The solve is saved; if counting its coins hiccuped, ask once more (it can only pay once).
      const reward =
        response.reward ??
        (await apiFetch<{ reward: RunReward }>("/api/arcade/sudoku/reward", { method: "POST", json: { id: game.id } }).then(
          (body) => body.reward,
          () => null,
        ));
      setCoins(reward ? { status: "done", reward } : { status: "error" });
      if (reward?.status === "paid") window.dispatchEvent(new CustomEvent("archive:coins", { detail: reward.balance }));
    } catch {
      toast.error("Solved! But the time could not be saved.");
      setResult({ seconds, best: records[game.difficulty] ?? null, improved: false });
      setCoins({ status: "error" });
    }
    setGame({ ...game, entries: finalEntries, notes: finalNotes, elapsedMs: ms, completed: true });
    setFinishing(false);
  }

  async function create(difficulty: SudokuDifficulty) {
    setConfirming(null);
    setCreating(difficulty);
    try {
      const response = await apiFetch<{ game: SudokuSave }>("/api/arcade/sudoku", { method: "POST", json: { difficulty } });
      load(response.game);
      play("place");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a puzzle.");
    } finally {
      setCreating(null);
    }
  }

  function choose(difficulty: SudokuDifficulty) {
    if (unfinished) setConfirming(difficulty);
    else void create(difficulty);
  }

  function select(cell: number) {
    setSelected(cell);
    cellRefs.current[cell]?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    if (view !== "board" || !game) return false;
    if ((event.key === "p" || event.key === "P") && !event.ctrlKey && !event.metaKey) {
      if (paused) resume();
      else pause();
      return true;
    }
    if (!editable) return false;
    if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z")) {
      undo();
      return true;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1];
    if (digit) {
      input(Number(digit), noteMode !== event.shiftKey);
      return true;
    }
    if (event.key === "0" || event.key === "Backspace" || event.key === "Delete") {
      erase();
      return true;
    }
    if (event.key === "n" || event.key === "N") {
      setNoteMode((on) => !on);
      return true;
    }
    const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (move === undefined) return false;
    const row = rowOf(selected);
    const col = colOf(selected);
    if (move === -1) select(row * 9 + ((col + 8) % 9));
    else if (move === 1) select(row * 9 + ((col + 1) % 9));
    else select((selected + move + SUDOKU_CELLS) % SUDOKU_CELLS);
    return true;
  });

  const selectedDigit = game ? digitAt(game.puzzle, entries, selected) : 0;
  const best = game ? records[game.difficulty] : undefined;
  const hidden = paused && unfinished;

  const picker = (
    <div className="mx-auto w-full max-w-md rounded-xl border border-white/[0.08] bg-surface/60 p-5">
      {game?.completed && result ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Solved {SUDOKU_LABELS[game.difficulty]} in <span className="font-semibold text-foreground">{formatDuration(result.seconds)}</span>
          {result.improved ? " — a new best!" : ""}
          <CoinReward state={coins} />
        </p>
      ) : null}
      <h2 className="text-base font-semibold">New puzzle</h2>
      <p className="mt-1 text-sm text-muted-foreground">Every puzzle has exactly one solution. Your progress is saved as you play.</p>
      <div className="mt-4 grid gap-2">
        {SUDOKU_DIFFICULTIES.map((difficulty) => (
          <Button
            key={difficulty}
            variant="outline"
            className="h-12 justify-between"
            disabled={creating !== null}
            onClick={() => choose(difficulty)}
          >
            <span className="flex items-center gap-2 font-semibold">
              {creating === difficulty ? <Loader2 aria-hidden className="animate-spin" /> : null}
              {SUDOKU_LABELS[difficulty]}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {creating === difficulty ? "Generating…" : records[difficulty] ? `Best ${formatDuration(records[difficulty])}` : "No time yet"}
            </span>
          </Button>
        ))}
      </div>
      {unfinished ? (
        <Button variant="ghost" className="mt-3 w-full" onClick={() => setView("board")} disabled={creating !== null}>
          Back to your {SUDOKU_LABELS[game.difficulty].toLowerCase()} puzzle
        </Button>
      ) : null}
    </div>
  );

  return (
    <GameShell
      title="Sudoku"
      active={view === "board" && unfinished}
      stats={
        view === "board" && game ? (
          <>
            <Stat label="Level" value={SUDOKU_LABELS[game.difficulty]} />
            <Stat label="Time" value={formatDuration(elapsed / 1000)} />
            <Stat label="Best" value={best ? formatDuration(best) : "—"} highlight={Boolean(result?.improved)} />
          </>
        ) : null
      }
      actions={
        view === "board" ? (
          <>
            {unfinished ? (
              <Button variant="outline" size="sm" className="h-8" onClick={paused ? resume : pause} disabled={finishing}>
                {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
                {paused ? "Resume" : "Pause"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                pause();
                setPaused(false);
                setView("picker");
              }}
              disabled={finishing}
            >
              <Plus aria-hidden />
              New
            </Button>
          </>
        ) : null
      }
      help="Select a cell, then type 1–9 or use the pad. Shift+digit or Notes mode adds pencil marks. 0/Backspace erases, Ctrl+Z undoes, arrows move, P pauses."
    >
      {view === "picker" || !game ? (
        picker
      ) : (
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:justify-center">
          <div className="arcade-stage [--stage-h:min(64dvh,36rem)] [--stage-ratio:1] md:mx-0">
            <div
              role="group"
              aria-label={`${SUDOKU_LABELS[game.difficulty]} Sudoku`}
              className="absolute inset-0 grid touch-manipulation grid-cols-9 grid-rows-9 overflow-hidden rounded-xl border-2 border-foreground/45 bg-surface/70 select-none"
            >
              {Array.from({ length: SUDOKU_CELLS }, (_, cell) => {
                const clue = game.puzzle[cell] !== "0";
                const digit = digitAt(game.puzzle, entries, cell);
                const row = rowOf(cell);
                const col = colOf(cell);
                const isSelected = cell === selected;
                const peer = !isSelected && (row === rowOf(selected) || col === colOf(selected) || boxOf(cell) === boxOf(selected));
                const same = !isSelected && digit !== 0 && digit === selectedDigit;
                const conflict = conflicts.has(cell);
                const marks = notes[cell];
                const markList = DIGITS.filter((d) => marks & (1 << (d - 1)));
                return (
                  <button
                    key={cell}
                    ref={(node) => {
                      cellRefs.current[cell] = node;
                    }}
                    type="button"
                    tabIndex={isSelected ? 0 : -1}
                    aria-current={isSelected || undefined}
                    aria-label={`Row ${row + 1}, column ${col + 1}: ${hidden ? "hidden" : digit ? `${digit}${clue ? ", given" : ""}${conflict ? ", conflicts" : ""}` : markList.length ? `notes ${markList.join(" ")}` : "empty"}`}
                    onClick={() => select(cell)}
                    className={cn(
                      "relative grid place-items-center border-foreground/20 text-[5cqi] leading-none tabular-nums outline-none transition-colors",
                      col < 8 && (col % 3 === 2 ? "border-r-2 border-r-foreground/50" : "border-r"),
                      row < 8 && (row % 3 === 2 ? "border-b-2 border-b-foreground/50" : "border-b"),
                      clue ? "font-bold text-foreground" : "font-medium text-amethyst",
                      peer && "bg-amethyst/10",
                      same && "bg-amethyst/20",
                      // Wavy underline: conflicts don't rely on color alone.
                      conflict && "bg-destructive/15 text-destructive underline decoration-wavy decoration-[0.35cqi] underline-offset-[0.7cqi]",
                      isSelected && "bg-amethyst/30 ring-2 ring-amethyst ring-inset",
                    )}
                  >
                    {hidden ? null : digit ? (
                      digit
                    ) : markList.length ? (
                      <span aria-hidden className="grid size-full grid-cols-3 grid-rows-3 p-[0.4cqi] text-[1.65cqi] font-medium text-muted-foreground">
                        {DIGITS.map((d) => (
                          <span key={d} className={cn("grid place-items-center", d === selectedDigit && "font-bold text-amethyst")}>
                            {marks & (1 << (d - 1)) ? d : ""}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {hidden ? (
              <GameOverlay title="Paused" actions={<Button size="sm" onClick={resume} autoFocus>Resume</Button>}>
                The timer is stopped at {formatDuration(elapsed / 1000)}.
              </GameOverlay>
            ) : game.completed && result ? (
              <GameOverlay
                title="Solved!"
                actions={
                  <Button size="sm" onClick={() => setView("picker")} autoFocus>
                    New puzzle
                  </Button>
                }
              >
                {SUDOKU_LABELS[game.difficulty]} in {formatDuration(result.seconds)}
                {result.improved ? " · new best!" : result.best ? ` · best ${formatDuration(result.best)}` : ""}
                <CoinReward state={coins} />
              </GameOverlay>
            ) : null}
          </div>

          <div className="flex w-full max-w-md flex-col gap-2 md:w-56">
            <div className="grid grid-cols-9 gap-1 md:grid-cols-3 md:gap-2" role="group" aria-label="Numbers">
              {DIGITS.map((digit) => {
                const left = 9 - counts[digit];
                return (
                  <button
                    key={digit}
                    type="button"
                    disabled={!editable}
                    onClick={() => input(digit)}
                    aria-label={`${noteMode ? "Note" : "Enter"} ${digit}, ${Math.max(0, left)} left`}
                    className={cn(
                      "flex aspect-[3/4] flex-col items-center justify-center rounded-lg border border-white/[0.1] bg-surface/70 transition-colors hover:bg-amethyst/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 md:aspect-square",
                      left <= 0 && "opacity-45",
                      digit === selectedDigit && "border-amethyst/60",
                    )}
                  >
                    <span className={cn("text-lg leading-none font-semibold md:text-2xl", noteMode && "text-base text-muted-foreground md:text-lg")}>{digit}</span>
                    <span className="mt-0.5 text-[0.6rem] leading-none text-muted-foreground tabular-nums">{Math.max(0, left)}</span>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-1 md:gap-2">
              <Button variant="outline" size="sm" onClick={undo} disabled={!editable || !history.length}>
                <Undo2 aria-hidden />
                Undo
              </Button>
              <Button variant="outline" size="sm" onClick={erase} disabled={!editable}>
                <Eraser aria-hidden />
                Erase
              </Button>
              <Button
                variant={noteMode ? "default" : "outline"}
                size="sm"
                onClick={() => setNoteMode((on) => !on)}
                aria-pressed={noteMode}
                disabled={!editable}
              >
                <PencilLine aria-hidden />
                Notes
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your unfinished puzzle?</AlertDialogTitle>
            <AlertDialogDescription>
              Starting a new {confirming ? SUDOKU_LABELS[confirming].toLowerCase() : ""} puzzle discards your current
              {game ? ` ${SUDOKU_LABELS[game.difficulty].toLowerCase()}` : ""} puzzle and its progress.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing it</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirming && void create(confirming)}>Start new puzzle</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GameShell>
  );
}
