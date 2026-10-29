"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Eraser, Lightbulb, Loader2, Pause, PencilLine, Play, Undo2, LayoutGrid } from "lucide-react";
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
import {
  SUDOKU_CELLS,
  SUDOKU_DAILY_DIFFICULTY,
  SUDOKU_DIFFICULTIES,
  SUDOKU_LABELS,
  formatDuration,
  type RunReward,
  type SudokuDailyResult,
  type SudokuDifficulty,
  type SudokuSave,
} from "@/lib/arcade";
import { cn } from "@/lib/utils";
import { CoinReward, type CoinState } from "./coin-reward";
import { DailyCountdown, formatDailyDate, useDailyDate } from "./daily";
import { GameOverlay, GameShell, Stat, sendAchievementEvent, useArcade, useAway, useGameKeys } from "./game-shell";

type Slot = SudokuSave["slot"];
type Snapshot = { entries: string; notes: number[] };
type Result = { seconds: number; best: number | null; improved: boolean; hints: number };
type Records = Partial<Record<SudokuDifficulty, number>>;
type Confirm = { kind: "replace"; difficulty: SudokuDifficulty } | { kind: "daily" } | { kind: "hint" };

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

// A local copy of each slot's latest board, in case the last save never reached the server
// (closed tab, lost connection). It only wins when it has more play time than the server's copy.
const backupKey = (slot: Slot) => `archive:sudoku:${slot}`;

function readBackup(save: SudokuSave) {
  try {
    const raw = JSON.parse(window.localStorage.getItem(backupKey(save.slot)) ?? "null") as Record<string, unknown> | null;
    if (!raw || raw.id !== save.id) return null;
    const { entries, notes, elapsedMs } = raw;
    if (typeof entries !== "string" || !/^[0-9]{81}$/.test(entries)) return null;
    if (!Array.isArray(notes) || notes.length !== SUDOKU_CELLS || !notes.every((n) => Number.isInteger(n) && n >= 0 && n <= 511)) return null;
    if (typeof elapsedMs !== "number" || !Number.isFinite(elapsedMs) || elapsedMs < 0 || elapsedMs > 2_000_000_000) return null;
    return { entries, notes: notes as number[], elapsedMs: Math.round(elapsedMs) };
  } catch {
    return null;
  }
}

function writeBackup(save: SudokuSave, entries: string, notes: number[], elapsedMs: number) {
  try {
    window.localStorage.setItem(backupKey(save.slot), JSON.stringify({ id: save.id, entries, notes, elapsedMs: Math.round(elapsedMs) }));
  } catch {
    // Storage full or blocked: the server copy is still saved.
  }
}

function clearBackup(slot: Slot) {
  try {
    window.localStorage.removeItem(backupKey(slot));
  } catch {
    // Nothing to clear.
  }
}

/** The save, with a newer local copy of its board applied (clues always come from the puzzle). */
function withBackup(save: SudokuSave | null): { save: SudokuSave | null; restored: boolean } {
  if (!save || save.completed) return { save, restored: false };
  const backup = readBackup(save);
  if (!backup || backup.elapsedMs <= save.elapsedMs) return { save, restored: false };
  const entries = [...backup.entries].map((digit, cell) => (save.puzzle[cell] !== "0" ? "0" : digit)).join("");
  return { save: { ...save, entries, notes: backup.notes, elapsedMs: backup.elapsedMs }, restored: true };
}

const firstEmpty = (save: SudokuSave | null) => {
  if (!save) return 40;
  const index = [...save.puzzle].findIndex((clue, cell) => clue === "0" && save.entries[cell] === "0");
  return index === -1 ? 0 : index;
};

const digitAt = (puzzle: string, entries: string, cell: number) => Number(puzzle[cell] !== "0" ? puzzle[cell] : entries[cell]);

const assistLabel = (hints: number) => (hints > 0 ? `Assisted · ${hints} hint${hints === 1 ? "" : "s"}` : "Unassisted");

export default function GameSudoku({
  regular,
  daily,
  dailyResult: initialDailyResult,
  records: initialRecords,
}: {
  regular: SudokuSave | null;
  daily: SudokuSave | null;
  dailyResult: SudokuDailyResult | null;
  records: Records;
}) {
  const { play, effects, look } = useArcade();
  const today = useDailyDate();
  // Opens on an unfinished puzzle when there is one (regular first), otherwise on the puzzle list.
  const [start] = useState(() => {
    const pick = regular && !regular.completed ? regular : daily && !daily.completed ? daily : regular;
    return withBackup(pick);
  });
  const initial = start.save;
  const [stored, setStored] = useState<Record<Slot, SudokuSave | null>>(() => ({
    regular: initial?.slot === "regular" ? initial : regular,
    daily: initial?.slot === "daily" ? initial : daily,
  }));
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
  const [dailyResult, setDailyResult] = useState<SudokuDailyResult | null>(initialDailyResult);
  const [result, setResult] = useState<Result | null>(null);
  const [coins, setCoins] = useState<CoinState>({ status: "idle" });
  const [creating, setCreating] = useState<SudokuDifficulty | "daily" | null>(null);
  const [confirming, setConfirming] = useState<Confirm | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [hinting, setHinting] = useState(false);
  const [clock] = useState(() => createClock(initial?.elapsedMs ?? 0));
  const [elapsed, setElapsed] = useState(initial?.elapsedMs ?? 0);
  const latest = useRef({ game, entries, notes });
  const dirty = useRef(start.restored);
  const warned = useRef(false);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const startedGame = useRef<string | null>(null);

  useEffect(() => {
    latest.current = { game, entries, notes };
  });

  const unfinished = game !== null && !game.completed;
  const running = view === "board" && unfinished && !paused && !finishing;
  const isDaily = game?.slot === "daily";

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

  // Every change also lands in the local backup right away.
  useEffect(() => {
    if (game && !game.completed && dirty.current) writeBackup(game, entries, notes, clock.read());
  }, [game, entries, notes, clock]);

  const load = useCallback(
    (incoming: SudokuSave | null, slot: Slot) => {
      const { save, restored } = withBackup(incoming);
      setStored((current) => ({ ...current, [slot]: save }));
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
      dirty.current = restored;
    },
    [clock],
  );

  /** Saves values, notes and time. Failures never interrupt play; the next change retries. */
  const persist = useCallback(async () => {
    const { game: current, entries: values, notes: marks } = latest.current;
    if (!current || current.completed || !dirty.current) return;
    dirty.current = false;
    const elapsedMs = Math.round(clock.read());
    writeBackup(current, values, marks, elapsedMs);
    try {
      await apiFetch("/api/arcade/sudoku", {
        method: "PATCH",
        json: { id: current.id, entries: values, notes: marks, elapsedMs },
        keepalive: true,
      });
      warned.current = false;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // Only reload if the board on screen is still the one that went stale.
        if (latest.current.game?.id !== current.id) return;
        toast.message("This puzzle was finished or replaced in another window. Showing the latest one.");
        try {
          load((await apiFetch<{ game: SudokuSave | null }>(`/api/arcade/sudoku?slot=${current.slot}`)).game, current.slot);
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

  /** Stops the open board, saves it and keeps its latest state for the puzzle list. */
  function stash() {
    if (!game) return;
    if (running) clock.stop();
    if (!game.completed) {
      dirty.current = true;
      void persist();
    }
    const snapshot = { ...game, entries, notes, elapsedMs: Math.round(clock.read()) };
    setStored((current) => ({ ...current, [game.slot]: snapshot }));
    setElapsed(clock.read());
  }

  function openPicker() {
    stash();
    setPaused(false);
    setView("picker");
  }

  /** Opens a saved puzzle from the list (the one already on the board just shows again). */
  function open(save: SudokuSave) {
    if (save.id === game?.id) {
      setView("board");
      return;
    }
    stash();
    load(save, save.slot);
    // Coming back to a puzzle with time on it waits for the player, like a resumed page.
    if (save.elapsedMs > 0) setPaused(true);
  }

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

  const editable = running && game !== null && !hinting;

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

  /** Writes a digit into a cell and clears it from the notes of the cell and its peers. */
  function place(cell: number, digit: number) {
    const nextEntries = entries.slice(0, cell) + String(digit) + entries.slice(cell + 1);
    const nextNotes = [...notes];
    nextNotes[cell] = 0;
    for (const peer of PEERS[cell]) nextNotes[peer] &= ~(1 << (digit - 1));
    return { nextEntries, nextNotes };
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
    if (entries[cell] === String(digit)) {
      play("erase", 0.9 + digit / 30);
      commit(entries.slice(0, cell) + "0" + entries.slice(cell + 1), notes);
      return;
    }
    const { nextEntries, nextNotes } = place(cell, digit);
    play("tap", 0.9 + digit / 30);
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

  function askHint() {
    if (!editable || !game || game.puzzle[selected] !== "0") return;
    if (game.hints === 0) setConfirming({ kind: "hint" });
    else void hint();
  }

  /** Reveals the selected cell. The server counts it, so the solve shows as assisted. */
  async function hint() {
    setConfirming(null);
    if (!game || game.completed || game.puzzle[selected] !== "0") return;
    const cell = selected;
    setHinting(true);
    dirty.current = false;
    try {
      const response = await apiFetch<{ digit: number; hints: number | null }>("/api/arcade/sudoku/hint", {
        method: "POST",
        json: { id: game.id, cell, entries, notes, elapsedMs: Math.round(clock.read()) },
      });
      const hints = response.hints ?? game.hints + 1;
      setGame((current) => (current && current.id === game.id ? { ...current, hints } : current));
      setStored((current) => ({ ...current, [game.slot]: { ...game, hints } }));
      const { nextEntries, nextNotes } = place(cell, response.digit);
      play("chip", 1.2);
      commit(nextEntries, nextNotes);
    } catch (error) {
      dirty.current = true;
      if (error instanceof ApiError && error.status === 409) {
        toast.message("This puzzle was finished or replaced in another window.");
        try {
          load((await apiFetch<{ game: SudokuSave | null }>(`/api/arcade/sudoku?slot=${game.slot}`)).game, game.slot);
        } catch {
          // Keep the local board.
        }
      } else {
        toast.error(error instanceof Error ? error.message : "Could not reveal that cell.");
      }
    } finally {
      setHinting(false);
    }
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
    let hints = game.hints;
    try {
      const response = await apiFetch<{
        best: number | null;
        improved: boolean;
        hints: number;
        daily: SudokuDailyResult | null;
        reward: RunReward | null;
      }>("/api/arcade/sudoku", {
        method: "PATCH",
        json: { id: game.id, entries: finalEntries, notes: finalNotes, elapsedMs: ms, complete: true },
      });
      hints = response.hints;
      if (response.best !== null) setRecords((current) => ({ ...current, [game.difficulty]: response.best! }));
      if (response.daily) setDailyResult(response.daily);
      setResult({ seconds, best: response.best ?? (game.slot === "regular" ? (records[game.difficulty] ?? null) : null), improved: response.improved, hints });
      clearBackup(game.slot);
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
      setResult({ seconds, best: game.slot === "regular" ? (records[game.difficulty] ?? null) : null, improved: false, hints });
      setCoins({ status: "error" });
    }
    const done = { ...game, entries: finalEntries, notes: finalNotes, elapsedMs: ms, completed: true, hints };
    setGame(done);
    setStored((current) => ({ ...current, [game.slot]: done }));
    setFinishing(false);
  }

  async function create(difficulty: SudokuDifficulty) {
    setConfirming(null);
    setCreating(difficulty);
    try {
      const response = await apiFetch<{ game: SudokuSave }>("/api/arcade/sudoku", { method: "POST", json: { difficulty } });
      load(response.game, "regular");
      play("place");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a puzzle.");
    } finally {
      setCreating(null);
    }
  }

  function choose(difficulty: SudokuDifficulty) {
    if (stored.regular && !stored.regular.completed) setConfirming({ kind: "replace", difficulty });
    else void create(difficulty);
  }

  /** Opens today's daily puzzle. An unfinished one from an earlier day is only replaced after confirming. */
  async function playDaily(replace = false) {
    setConfirming(null);
    const saved = stored.daily;
    if (saved && saved.puzzleDate === today && !saved.completed) {
      open(saved);
      return;
    }
    if (!replace && saved && !saved.completed) {
      setConfirming({ kind: "daily" });
      return;
    }
    setCreating("daily");
    try {
      const response = await apiFetch<{ game: SudokuSave }>("/api/arcade/sudoku", { method: "POST", json: { daily: true, ...(replace ? { replace } : {}) } });
      if (response.game.completed) {
        setStored((current) => ({ ...current, daily: response.game }));
        toast.message("You already solved today's puzzle.");
      } else {
        load(response.game, "daily");
        play("place");
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConfirming({ kind: "daily" });
      else toast.error(error instanceof Error ? error.message : "Could not open the daily puzzle.");
    } finally {
      setCreating(null);
    }
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
    if (event.key === "h" || event.key === "H") {
      askHint();
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
  const best = game && !isDaily ? records[game.difficulty] : undefined;
  const hidden = paused && unfinished;
  const todayResult = dailyResult?.date === today ? dailyResult : null;
  const savedDaily = stored.daily && !stored.daily.completed ? stored.daily : null;
  const savedRegular = stored.regular && !stored.regular.completed ? stored.regular : null;
  const lastSolved = game?.completed && result ? game : null;

  const picker = (
    <div className="mx-auto grid w-full max-w-md gap-4">
      {lastSolved && result ? (
        <p className="rounded-xl border border-white/[0.08] bg-surface/60 px-4 py-3 text-sm text-muted-foreground">
          Solved {lastSolved.slot === "daily" ? "the daily puzzle" : SUDOKU_LABELS[lastSolved.difficulty]} in{" "}
          <span className="font-semibold text-foreground">{formatDuration(result.seconds)}</span>
          {result.hints > 0 ? ` · ${assistLabel(result.hints).toLowerCase()}` : ""}
          {result.improved ? " — a new best!" : ""}
          <CoinReward state={coins} />
        </p>
      ) : null}

      <section className="rounded-xl border border-white/[0.08] bg-surface/60 p-5" aria-labelledby="sudoku-daily">
        <h2 id="sudoku-daily" className="flex items-center gap-2 text-base font-semibold">
          <CalendarDays aria-hidden className="size-4 text-amethyst" />
          Daily puzzle · {formatDailyDate(today)}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The same {SUDOKU_LABELS[SUDOKU_DAILY_DIFFICULTY].toLowerCase()} puzzle for everyone, with one solution. Its result is kept apart from your fastest times.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <DailyCountdown />
        </p>
        {todayResult ? (
          <p className="mt-3 text-sm">
            Solved in <span className="font-semibold">{formatDuration(todayResult.elapsedMs / 1000)}</span>
            <span className="text-muted-foreground"> · {assistLabel(todayResult.hints)}</span>
          </p>
        ) : null}
        <div className="mt-3 grid gap-2">
          {savedDaily && savedDaily.puzzleDate !== today ? (
            <Button variant="outline" className="h-11 justify-between" disabled={creating !== null} onClick={() => open(savedDaily)}>
              <span className="font-semibold">Continue the {formatDailyDate(savedDaily.puzzleDate ?? today)} puzzle</span>
              <span className="text-xs font-normal text-muted-foreground">{formatDuration(savedDaily.elapsedMs / 1000)}</span>
            </Button>
          ) : null}
          {todayResult ? null : (
            <Button
              variant={savedDaily && savedDaily.puzzleDate !== today ? "ghost" : "outline"}
              className="h-11 justify-between"
              disabled={creating !== null}
              onClick={() => void playDaily()}
            >
              <span className="flex items-center gap-2 font-semibold">
                {creating === "daily" ? <Loader2 aria-hidden className="animate-spin" /> : null}
                {savedDaily?.puzzleDate === today ? "Continue today's puzzle" : "Play today's puzzle"}
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {savedDaily?.puzzleDate === today ? formatDuration(savedDaily.elapsedMs / 1000) : SUDOKU_LABELS[SUDOKU_DAILY_DIFFICULTY]}
              </span>
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-white/[0.08] bg-surface/60 p-5" aria-labelledby="sudoku-new">
        <h2 id="sudoku-new" className="text-base font-semibold">
          New puzzle
        </h2>
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
        {savedRegular ? (
          <Button variant="ghost" className="mt-3 w-full" onClick={() => open(savedRegular)} disabled={creating !== null}>
            Back to your {SUDOKU_LABELS[savedRegular.difficulty].toLowerCase()} puzzle
          </Button>
        ) : null}
      </section>
    </div>
  );

  const confirmText =
    confirming?.kind === "hint"
      ? {
          title: "Reveal this cell?",
          body: isDaily
            ? "A hint fills in the selected cell. Your daily result will be marked as assisted."
            : "A hint fills in the selected cell. Assisted solves are marked as such and don't set fastest times.",
          cancel: "Keep solving",
          action: "Reveal cell",
        }
      : confirming?.kind === "daily"
        ? {
            title: "Start today's puzzle instead?",
            body: `Your unfinished puzzle from ${savedDaily?.puzzleDate ? formatDailyDate(savedDaily.puzzleDate) : "an earlier day"} and its progress will be discarded.`,
            cancel: "Keep it",
            action: "Start today's puzzle",
          }
        : {
            title: "Replace your unfinished puzzle?",
            body: `Starting a new ${confirming?.kind === "replace" ? SUDOKU_LABELS[confirming.difficulty].toLowerCase() : ""} puzzle discards your current${savedRegular ? ` ${SUDOKU_LABELS[savedRegular.difficulty].toLowerCase()}` : ""} puzzle and its progress. Your daily puzzle is not affected.`,
            cancel: "Keep playing it",
            action: "Start new puzzle",
          };

  return (
    <GameShell
      game="sudoku"
      title="Sudoku"
      active={view === "board" && unfinished}
      stats={
        view === "board" && game ? (
          <>
            <Stat label={isDaily ? "Daily" : "Level"} value={isDaily ? formatDailyDate(game.puzzleDate ?? today) : SUDOKU_LABELS[game.difficulty]} />
            <Stat label="Time" value={formatDuration(elapsed / 1000)} />
            {isDaily ? null : <Stat label="Best" value={best ? formatDuration(best) : "—"} highlight={Boolean(result?.improved)} />}
            {game.hints > 0 ? <Stat label="Hints" value={String(game.hints)} /> : null}
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
            <Button variant="outline" size="sm" className="h-8" onClick={openPicker} disabled={finishing}>
              <LayoutGrid aria-hidden />
              Puzzles
            </Button>
          </>
        ) : null
      }
      help="Select a cell, then type 1–9 or use the pad. Shift+digit or Notes mode adds pencil marks. 0/Backspace erases, Ctrl+Z undoes, H reveals a cell (marks the solve as assisted), arrows move, P pauses."
    >
      {view === "picker" || !game ? (
        picker
      ) : (
        <div className="flex flex-col items-center gap-3">
          {isDaily ? (
            <p className="text-center text-xs text-muted-foreground">
              {game.puzzleDate && game.puzzleDate !== today ? (
                <>This puzzle still counts for {formatDailyDate(game.puzzleDate)}.</>
              ) : (
                <>
                  Daily puzzle · same for everyone · <DailyCountdown />
                </>
              )}
              {game.hints > 0 ? <> · {assistLabel(game.hints).toLowerCase()}</> : null}
            </p>
          ) : null}
          <div className="flex w-full flex-col items-center gap-4 md:flex-row md:items-start md:justify-center">
            <div className="arcade-stage [--stage-h:min(64dvh,36rem)] [--stage-ratio:1] md:mx-0">
              <div
                role="group"
                aria-label={isDaily ? "Daily Sudoku" : `${SUDOKU_LABELS[game.difficulty]} Sudoku`}
                className="sdk absolute inset-0 grid touch-manipulation grid-cols-9 grid-rows-9 overflow-hidden select-none"
                data-effects={effects}
                data-theme={look.theme}
                data-font={look.font}
                data-grid={look.grid}
                data-highlight={look.highlight}
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
                      className="sdk-cell relative grid place-items-center leading-none tabular-nums outline-none"
                      data-r={col < 8 ? (col % 3 === 2 ? "box" : "cell") : undefined}
                      data-b={row < 8 ? (row % 3 === 2 ? "box" : "cell") : undefined}
                      data-l={col > 0 && col % 3 === 0 ? "box" : undefined}
                      data-t={row > 0 && row % 3 === 0 ? "box" : undefined}
                      data-bc={col % 3}
                      data-br={row % 3}
                      data-alt={(Math.floor(row / 3) + Math.floor(col / 3)) % 2 || undefined}
                      data-given={clue || undefined}
                      data-peer={peer || undefined}
                      data-same={same || undefined}
                      data-bad={conflict || undefined}
                      data-sel={isSelected || undefined}
                    >
                      {hidden ? null : digit ? (
                        digit
                      ) : markList.length ? (
                        <span aria-hidden className="sdk-notes grid size-full grid-cols-3 grid-rows-3 p-[0.4cqi]">
                          {DIGITS.map((d) => (
                            <span key={d} className="grid place-items-center" data-hit={d === selectedDigit || undefined}>
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
                      {isDaily ? "Back to puzzles" : "New puzzle"}
                    </Button>
                  }
                >
                  {isDaily ? `Daily ${formatDailyDate(game.puzzleDate ?? today)}` : SUDOKU_LABELS[game.difficulty]} in {formatDuration(result.seconds)}
                  {result.hints > 0
                    ? ` · ${assistLabel(result.hints).toLowerCase()}${isDaily ? "" : " (no fastest time)"}`
                    : result.improved
                      ? " · new best!"
                      : result.best
                        ? ` · best ${formatDuration(result.best)}`
                        : ""}
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
              <div className="grid grid-cols-4 gap-1 md:grid-cols-2 md:gap-2">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={askHint}
                  disabled={!editable || game.puzzle[selected] !== "0"}
                  title="Reveal the selected cell (marks the solve as assisted)"
                >
                  {hinting ? <Loader2 aria-hidden className="animate-spin" /> : <Lightbulb aria-hidden />}
                  Hint
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmText.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmText.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{confirmText.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirming?.kind === "hint") void hint();
                else if (confirming?.kind === "daily") void playDaily(true);
                else if (confirming?.kind === "replace") void create(confirming.difficulty);
              }}
            >
              {confirmText.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GameShell>
  );
}
