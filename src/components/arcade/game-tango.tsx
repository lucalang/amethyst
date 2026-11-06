"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOON, SUN, generateTango, tangoIssues, tangoSolved, type TangoCell, type TangoPuzzle } from "@/lib/minigames/tango";
import { cn } from "@/lib/utils";
import { keyDirection, useArcade, useGameKeys } from "./game-shell";
import { PuzzleFrame, usePuzzleSession, type PuzzleSession } from "./puzzle-shell";

const NAMES = ["empty", "sun", "moon"] as const;
/** New mistakes are only shown once the player stops changing the board for this long. */
const REVEAL_DELAY = 900;

/** Every row and column as cell indexes. */
const lines = (n: number) => [
  ...Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => r * n + c)),
  ...Array.from({ length: n }, (_, c) => Array.from({ length: n }, (_, r) => r * n + c)),
];

function completeLines(cells: TangoCell[], bad: Set<number>, n: number) {
  return lines(n).filter((line) => line.every((cell) => cells[cell] !== 0 && !bad.has(cell)));
}

export function SunIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <g className="stroke-current" strokeWidth="2" strokeLinecap="round">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return <line key={i} x1={12 + Math.cos(a) * 8} y1={12 + Math.sin(a) * 8} x2={12 + Math.cos(a) * 10.5} y2={12 + Math.sin(a) * 10.5} />;
        })}
      </g>
      <circle cx="12" cy="12" r="5.5" className="fill-current" />
    </svg>
  );
}

export function MoonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M15.5 3.2a9 9 0 1 0 5.3 13.2A7.2 7.2 0 0 1 15.5 3.2z" className="fill-current" />
    </svg>
  );
}

function TangoPlay({ session }: { session: PuzzleSession<TangoPuzzle> }) {
  const { play, effects } = useArcade();
  const { puzzle, locked } = session;
  const n = puzzle.size;
  const [cells, setCells] = useState<TangoCell[]>(() => [...puzzle.givens]);
  const [history, setHistory] = useState<TangoCell[][]>([]);
  const [cursor, setCursor] = useState(0);
  const [flash, setFlash] = useState<{ id: number; cells: Set<number> } | null>(null);
  const [shake, setShake] = useState<number | null>(null);
  const [shown, setShown] = useState<TangoCell[]>(cells);
  const [hinted, setHinted] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const real = tangoIssues(cells, puzzle.signs);
  const seen = tangoIssues(shown, puzzle.signs);
  const bad = new Set([...real.bad].filter((cell) => seen.bad.has(cell)));
  const badSigns = new Set([...real.badSigns].filter((index) => seen.badSigns.has(index)));
  const solved = session.phase === "solved";
  const filled = cells.filter(Boolean).length;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function check(next: TangoCell[], changed?: number) {
    window.clearTimeout(timer.current);
    setShake(null);
    const fresh = [...tangoIssues(next, puzzle.signs).bad].filter((cell) => !seen.bad.has(cell));
    if (fresh.length === 0) {
      setShown(next);
      return;
    }
    timer.current = window.setTimeout(() => {
      setShown(next);
      setShake(changed !== undefined && fresh.includes(changed) ? changed : fresh[0]);
      play("invalid");
    }, REVEAL_DELAY);
  }

  function commit(next: TangoCell[], changed?: number) {
    if (locked) return;
    setHistory((previous) => [...previous.slice(-199), cells]);
    setCells(next);
    setHinted(null);
    session.touch();
    check(next, changed);
    if (tangoSolved(next, puzzle.signs)) {
      session.solve({ moves: history.length + 1 });
      return;
    }
    const issues = tangoIssues(next, puzzle.signs);
    const before = new Set(completeLines(cells, real.bad, n).map((line) => line.join()));
    const after = completeLines(next, issues.bad, n);
    const fresh = after.filter((line) => !before.has(line.join()));
    if (fresh.length > 0) {
      play("point", 1 + after.length / (2 * n) / 2);
      setFlash((previous) => ({ id: (previous?.id ?? 0) + 1, cells: new Set(fresh.flat()) }));
    } else if (changed === undefined || next[changed] === 0) play("erase");
    else play("tap", next[changed] === SUN ? 1.15 : 0.85);
  }

  function set(cell: number, value: TangoCell | "cycle") {
    if (puzzle.givens[cell]) return;
    const next = [...cells];
    next[cell] = value === "cycle" ? (((cells[cell] + 1) % 3) as TangoCell) : value;
    if (next[cell] !== cells[cell]) commit(next, cell);
  }

  /** Fixes a wrong symbol if there is one, otherwise fills a random empty cell. */
  function hint() {
    if (locked) return;
    const wrong = cells.findIndex((value, i) => value !== 0 && value !== puzzle.solution[i]);
    const empty = cells.flatMap((value, i) => (value === 0 ? [i] : []));
    const cell = wrong !== -1 ? wrong : empty[Math.floor(Math.random() * empty.length)];
    if (cell === undefined) return;
    session.takeHint();
    const next = [...cells];
    next[cell] = puzzle.solution[cell];
    commit(next, cell);
    setHinted(cell);
  }

  function undo() {
    if (locked || history.length === 0) return;
    setCells(history[history.length - 1]);
    setHistory((previous) => previous.slice(0, -1));
    check(history[history.length - 1]);
    play("erase");
  }

  function clear() {
    if (locked || cells.every((cell, i) => cell === puzzle.givens[i])) return;
    commit([...puzzle.givens]);
  }

  function moveCursor(to: number) {
    setCursor(to);
    buttons.current[to]?.focus({ preventScroll: true });
  }

  useGameKeys((event) => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === "z" || event.key === "Z") {
        undo();
        return true;
      }
      return false;
    }
    const dir = keyDirection(event);
    if (dir) {
      const r = Math.floor(cursor / n);
      const c = cursor % n;
      const next = dir === "up" ? Math.max(0, r - 1) * n + c : dir === "down" ? Math.min(n - 1, r + 1) * n + c : dir === "left" ? r * n + Math.max(0, c - 1) : r * n + Math.min(n - 1, c + 1);
      moveCursor(next);
      return true;
    }
    if (event.key === "1") set(cursor, SUN);
    else if (event.key === "2") set(cursor, MOON);
    else if (event.key === "0" || event.key === "Backspace" || event.key === "Delete") set(cursor, 0);
    else if (event.key === "u" || event.key === "U") undo();
    else return false;
    return true;
  });

  return (
    <PuzzleFrame
      session={session}
      title="Tango"
      onHint={hint}
      rules={[
        "Fill every cell with a sun or a moon. Tap a cell to cycle: sun, moon, empty.",
        "Each row and column holds 3 suns and 3 moons.",
        "No more than 2 of the same symbol may sit next to each other in a row or column.",
        <>Cells joined by <b className="text-foreground">=</b> are the same; cells joined by <b className="text-foreground">×</b> are opposite.</>,
        "Keyboard: arrows move, Space cycles, 1 sun, 2 moon, 0 clears, U undoes.",
      ]}
      tools={
        <>
          <Button variant="outline" size="sm" onClick={undo} disabled={locked || history.length === 0}>
            <Undo2 aria-hidden />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={clear} disabled={locked}>
            <Eraser aria-hidden />
            Clear
          </Button>
        </>
      }
    >
      <div className={cn("puzzle-board relative mx-auto aspect-square w-full", solved && "puzzle-board-solved tango-solved", effects !== "off" && "tango-fx")}>
        <div role="grid" aria-label="Tango grid" className="grid size-full gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}>
          {Array.from({ length: n }, (_, r) => (
            <div key={r} role="row" className="contents">
              {Array.from({ length: n }, (_, c) => {
                const cell = r * n + c;
                const value = cells[cell];
                const given = puzzle.givens[cell] !== 0;
                return (
                  <button
                    key={cell}
                    ref={(element) => {
                      buttons.current[cell] = element;
                    }}
                    type="button"
                    role="gridcell"
                    tabIndex={cell === cursor ? 0 : -1}
                    aria-label={`Row ${r + 1}, column ${c + 1}: ${NAMES[value]}${given ? ", given" : ""}${bad.has(cell) ? ", breaks a rule" : ""}`}
                    aria-disabled={given || locked}
                    onFocus={() => setCursor(cell)}
                    onClick={() => set(cell, "cycle")}
                    className={cn(
                      "puzzle-cell tango-cell relative grid place-items-center overflow-hidden rounded-md",
                      value === SUN && "tango-cell-sun",
                      value === MOON && "tango-cell-moon",
                      given && "puzzle-cell-given",
                      hinted === cell && "puzzle-hinted",
                      bad.has(cell) && "puzzle-cell-bad",
                    )}
                    style={{ "--tango-d": r + c } as CSSProperties}
                  >
                    {flash?.cells.has(cell) ? <span key={flash.id} aria-hidden className="tango-flash" /> : null}
                    {value === 0 && !given && !locked ? <SunIcon className="tango-ghost col-start-1 row-start-1 size-[62%] text-[var(--tango-sun)]" /> : null}
                    {value !== 0 ? (
                      <span key={value} className={cn("tango-mark col-start-1 row-start-1 grid size-full place-items-center", value === SUN ? "tango-mark-sun" : "tango-mark-moon", shake === cell && "tango-shake")}>
                        {value === SUN ? <SunIcon className="size-[62%] text-[var(--tango-sun)]" /> : <MoonIcon className="size-[58%] text-[var(--tango-moon)]" />}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {puzzle.signs.map((sign, index) => {
          const horizontal = sign.b === sign.a + 1;
          const r = Math.floor(sign.a / n);
          const c = sign.a % n;
          return (
            <span
              key={`${sign.a}-${sign.b}`}
              aria-hidden
              className={cn("puzzle-sign", badSigns.has(index) && "puzzle-sign-bad")}
              style={{ left: `${((horizontal ? c + 1 : c + 0.5) / n) * 100}%`, top: `${((horizontal ? r + 0.5 : r + 1) / n) * 100}%` }}
            >
              {sign.same ? "=" : "×"}
            </span>
          );
        })}
      </div>
      <div aria-hidden className="tango-progress mx-auto mt-3 w-full max-w-[34rem]">
        <span style={{ width: `${(filled / (n * n)) * 100}%` }} />
      </div>
      <p className="sr-only">
        {puzzle.signs.map((sign) => `Row ${Math.floor(sign.a / n) + 1} column ${(sign.a % n) + 1} ${sign.same ? "equals" : "is opposite to"} row ${Math.floor(sign.b / n) + 1} column ${(sign.b % n) + 1}.`).join(" ")}
      </p>
    </PuzzleFrame>
  );
}

export default function GameTango({ records }: { records: Record<string, number> }) {
  const session = usePuzzleSession("tango", generateTango, records);
  return <TangoPlay key={session.puzzleId} session={session} />;
}
