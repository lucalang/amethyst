"use client";

import { useRef, useState } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateQueens, queensConflicts, queensSolved, type QueensPuzzle } from "@/lib/minigames/queens";
import { cn } from "@/lib/utils";
import { keyDirection, useArcade, useGameKeys } from "./game-shell";
import { PuzzleFrame, usePuzzleSession, type PuzzleSession } from "./puzzle-shell";

/** 0 empty, 1 marked as "no crown", 2 crown. */
type Mark = 0 | 1 | 2;

/** Region colors, readable on light and dark game skins. */
const REGION_COLORS = ["#c9a7ff", "#ffb3a7", "#a8e6b0", "#ffe08a", "#9fd3ff", "#ffb8e0", "#d6c7a1", "#b5f0ec", "#e0b0ff", "#c2d68a"];
const REGION_NAMES = ["violet", "coral", "mint", "yellow", "sky", "pink", "sand", "aqua", "lilac", "olive"];

export function CrownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d="M3 18l1.6-10 4.6 4.4L12 5l2.8 7.4L19.4 8 21 18z" className="fill-current" />
      <rect x="3" y="19" width="18" height="2.4" rx="1" className="fill-current" />
    </svg>
  );
}

function QueensPlay({ session }: { session: PuzzleSession<QueensPuzzle> }) {
  const { play } = useArcade();
  const { puzzle, locked } = session;
  const { size: n, regions } = puzzle;
  const [marks, setMarks] = useState<Mark[]>(() => new Array<Mark>(n * n).fill(0));
  const [history, setHistory] = useState<Mark[][]>([]);
  const [cursor, setCursor] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // A drag that started on an empty cell marks every empty cell it passes.
  const drag = useRef<{ pointer: number; start: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const crowns = marks.flatMap((mark, cell) => (mark === 2 ? [cell] : []));
  const bad = queensConflicts(n, regions, crowns);

  function commit(next: Mark[], sound = true) {
    if (locked) return;
    setHistory((previous) => [...previous.slice(-199), marks]);
    setMarks(next);
    session.touch();
    const nextCrowns = next.flatMap((mark, cell) => (mark === 2 ? [cell] : []));
    const conflicts = queensConflicts(n, regions, nextCrowns);
    if (sound) play(conflicts.size > bad.size ? "invalid" : nextCrowns.length > crowns.length ? "place" : "tap");
    if (queensSolved(n, regions, nextCrowns)) session.solve({ moves: history.length + 1 });
  }

  function set(cell: number, value: Mark | "cycle") {
    const next = [...marks];
    next[cell] = value === "cycle" ? (((marks[cell] + 1) % 3) as Mark) : value;
    if (next[cell] !== marks[cell]) commit(next);
  }

  function undo() {
    if (locked || history.length === 0) return;
    setMarks(history[history.length - 1]);
    setHistory((previous) => previous.slice(0, -1));
    play("erase");
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
      moveCursor(dir === "up" ? Math.max(0, r - 1) * n + c : dir === "down" ? Math.min(n - 1, r + 1) * n + c : dir === "left" ? r * n + Math.max(0, c - 1) : r * n + Math.min(n - 1, c + 1));
      return true;
    }
    if (event.key === "q" || event.key === "Q") set(cursor, marks[cursor] === 2 ? 0 : 2);
    else if (event.key === "x" || event.key === "X") set(cursor, marks[cursor] === 1 ? 0 : 1);
    else if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") set(cursor, 0);
    else if (event.key === "u" || event.key === "U") undo();
    else return false;
    return true;
  });

  function cellAt(x: number, y: number) {
    const element = document.elementFromPoint(x, y);
    const value = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-cell]")?.dataset.cell : undefined;
    return value === undefined ? null : Number(value);
  }

  return (
    <PuzzleFrame
      session={session}
      title="Queens"
      rules={[
        "Place exactly one crown in every row, every column and every color region.",
        "Crowns may not touch each other, not even diagonally.",
        "Tap a cell once to mark it ×, twice for a crown, three times to clear. Drag across empty cells to mark several ×.",
        "Crowns that break a rule turn red.",
        "Keyboard: arrows move, Q places a crown, X marks, 0 clears, U undoes.",
      ]}
      tools={
        <>
          <Button variant="outline" size="sm" onClick={undo} disabled={locked || history.length === 0}>
            <Undo2 aria-hidden />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={() => marks.some(Boolean) && commit(new Array<Mark>(n * n).fill(0))} disabled={locked}>
            <Eraser aria-hidden />
            Clear
          </Button>
        </>
      }
    >
      <div
        role="grid"
        aria-label="Queens grid"
        className={cn("puzzle-board queens-board mx-auto grid aspect-square w-full touch-none overflow-hidden rounded-lg", session.phase === "solved" && "puzzle-board-solved")}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointer !== event.pointerId || locked) return;
          const cell = cellAt(event.clientX, event.clientY);
          if (cell === null || (cell === current.start && !current.moved)) return;
          const next = [...marks];
          if (!current.moved) {
            setHistory((previous) => [...previous.slice(-199), marks]);
            if (next[current.start] === 0) next[current.start] = 1;
          }
          current.moved = true;
          if (next[cell] === 0) next[cell] = 1;
          if (next.some((mark, i) => mark !== marks[i])) {
            setMarks(next);
            session.touch();
          }
        }}
        onPointerUp={() => {
          suppressClick.current = drag.current?.moved === true;
          drag.current = null;
        }}
        onPointerCancel={() => (drag.current = null)}
      >
        {Array.from({ length: n }, (_, r) => (
          <div key={r} role="row" className="contents">
            {Array.from({ length: n }, (_, c) => {
              const cell = r * n + c;
              const region = regions[cell];
              const mark = marks[cell];
              const edge = (other: number | null) => other === null || regions[other] !== region;
              return (
                <button
                  key={cell}
                  ref={(element) => {
                    buttons.current[cell] = element;
                  }}
                  type="button"
                  role="gridcell"
                  data-cell={cell}
                  tabIndex={cell === cursor ? 0 : -1}
                  aria-label={`Row ${r + 1}, column ${c + 1}, ${REGION_NAMES[region % REGION_NAMES.length]} region: ${mark === 2 ? "crown" : mark === 1 ? "marked" : "empty"}${bad.has(cell) ? ", breaks a rule" : ""}`}
                  aria-disabled={locked}
                  onFocus={() => setCursor(cell)}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || locked) return;
                    suppressClick.current = false;
                    drag.current = marks[cell] === 0 ? { pointer: event.pointerId, start: cell, moved: false } : null;
                  }}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    set(cell, "cycle");
                  }}
                  className={cn("queens-cell grid place-items-center", bad.has(cell) && mark === 2 && "queens-cell-bad")}
                  style={{
                    background: REGION_COLORS[region % REGION_COLORS.length],
                    borderTopWidth: edge(r > 0 ? cell - n : null) ? 2 : 0.5,
                    borderLeftWidth: edge(c > 0 ? cell - 1 : null) ? 2 : 0.5,
                    borderRightWidth: edge(c < n - 1 ? cell + 1 : null) ? 2 : 0.5,
                    borderBottomWidth: edge(r < n - 1 ? cell + n : null) ? 2 : 0.5,
                  }}
                >
                  {mark === 2 ? <CrownIcon className="size-[62%]" /> : mark === 1 ? <span aria-hidden className="text-[0.8em] font-bold opacity-50">×</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </PuzzleFrame>
  );
}

const generate = (random: () => number) => generateQueens(random, 8);

export default function GameQueens({ records }: { records: Record<string, number> }) {
  const session = usePuzzleSession("queens", generate, records);
  return <QueensPlay key={session.puzzleId} session={session} />;
}
