"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateQueens, queensConflicts, queensSolved, type QueensPuzzle } from "@/lib/minigames/queens";
import { cn } from "@/lib/utils";
import { keyDirection, useArcade, useGameKeys } from "./game-shell";
import { PuzzleFrame, usePuzzleSession, type PuzzleSession } from "./puzzle-shell";
import { CELEBRATIONS, QueensCrown, QueensDefs, queensRegionColors } from "./puzzle-looks";

/** 0 empty, 1 marked as "no crown", 2 crown. */
type Mark = 0 | 1 | 2;

/** Region names in palette order (every region palette keeps this hue order). */
const REGION_NAMES = ["violet", "coral", "mint", "yellow", "sky", "pink", "sand", "aqua", "lilac", "olive"];
const randomIndex = (length: number) => Math.floor(Math.random() * length);
/** New conflicts are only shown once the player stops changing the board for this long. */
const REVEAL_DELAY = 900;
const crownsOf = (marks: Mark[]) => marks.flatMap((mark, cell) => (mark === 2 ? [cell] : []));

function QueensPlay({ session }: { session: PuzzleSession<QueensPuzzle> }) {
  const { play, effects, look } = useArcade();
  const regionColors = queensRegionColors(look);
  const { puzzle, locked } = session;
  const { size: n, regions } = puzzle;
  const [marks, setMarks] = useState<Mark[]>(() => new Array<Mark>(n * n).fill(0));
  const [history, setHistory] = useState<Mark[][]>([]);
  const [cursor, setCursor] = useState(0);
  const [hinted, setHinted] = useState<number | null>(null);
  const [shown, setShown] = useState<number[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  // A drag from an empty cell marks every empty cell it passes; a drag from a mark erases marks.
  const drag = useRef<{ pointer: number; start: number; moved: boolean; erase: boolean } | null>(null);
  const suppressClick = useRef(false);
  const crowns = crownsOf(marks);
  const real = queensConflicts(n, regions, crowns);
  const seen = queensConflicts(n, regions, shown);
  const bad = new Set([...real].filter((cell) => seen.has(cell)));
  const solved = session.phase === "solved";

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Shows fixed conflicts right away and new ones only after a pause. */
  function check(nextCrowns: number[]) {
    window.clearTimeout(timer.current);
    const fresh = [...queensConflicts(n, regions, nextCrowns)].filter((cell) => !seen.has(cell));
    if (fresh.length === 0) {
      setShown(nextCrowns);
      return;
    }
    timer.current = window.setTimeout(() => {
      setShown(nextCrowns);
      play("invalid");
    }, REVEAL_DELAY);
  }

  function commit(next: Mark[], sound = true) {
    if (locked) return;
    setHistory((previous) => [...previous.slice(-199), marks]);
    setMarks(next);
    setHinted(null);
    session.touch();
    const nextCrowns = crownsOf(next);
    check(nextCrowns);
    if (queensSolved(n, regions, nextCrowns)) {
      session.solve({ moves: history.length + 1 });
      return;
    }
    if (!sound) return;
    if (nextCrowns.length > crowns.length) play("place", 0.9 + nextCrowns.length * 0.06);
    else if (next.filter(Boolean).length < marks.filter(Boolean).length) play("erase");
    else play("tap");
  }

  function set(cell: number, value: Mark | "cycle") {
    const next = [...marks];
    next[cell] = value === "cycle" ? (((marks[cell] + 1) % 3) as Mark) : value;
    if (next[cell] !== marks[cell]) commit(next);
  }

  /** Removes a misplaced crown if there is one, otherwise places a missing one. */
  function hint() {
    if (locked) return;
    const answer = puzzle.solution.map((c, r) => r * n + c);
    const wrong = crowns.find((cell) => !answer.includes(cell));
    const missing = answer.filter((cell) => marks[cell] !== 2);
    const cell = wrong ?? missing[randomIndex(missing.length)];
    if (cell === undefined) return;
    session.takeHint();
    const next = [...marks];
    next[cell] = wrong === undefined ? 2 : 0;
    commit(next);
    setHinted(cell);
  }

  function undo() {
    if (locked || history.length === 0) return;
    setMarks(history[history.length - 1]);
    setHistory((previous) => previous.slice(0, -1));
    check(crownsOf(history[history.length - 1]));
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
      onHint={hint}
      celebrate={CELEBRATIONS[look.effect ?? ""]}
      rules={[
        "Place exactly one crown in every row, every column and every color region.",
        "Crowns may not touch each other, not even diagonally.",
        "Tap a cell once to mark it ×, twice for a crown, three times to clear. Drag across empty cells to mark several ×, or start a drag on a × to erase marks.",
        "Crowns that break a rule turn red after a moment.",
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
        className={cn("puzzle-board queens-board mx-auto grid aspect-square w-full touch-none overflow-hidden rounded-xl", solved && "puzzle-board-solved queens-solved", effects !== "off" && "queens-fx")}
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${n}, minmax(0, 1fr))` }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointer !== event.pointerId || locked) return;
          const cell = cellAt(event.clientX, event.clientY);
          if (cell === null || (cell === current.start && !current.moved)) return;
          const [from, to]: Mark[] = current.erase ? [1, 0] : [0, 1];
          const next = [...marks];
          if (!current.moved) {
            setHistory((previous) => [...previous.slice(-199), marks]);
            setHinted(null);
            if (next[current.start] === from) next[current.start] = to;
          }
          current.moved = true;
          if (next[cell] === from) next[cell] = to;
          if (next.some((mark, i) => mark !== marks[i])) {
            setMarks(next);
            session.touch();
            play(current.erase ? "erase" : "tick");
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
                    drag.current = marks[cell] === 2 ? null : { pointer: event.pointerId, start: cell, moved: false, erase: marks[cell] === 1 };
                  }}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    set(cell, "cycle");
                  }}
                  className={cn("queens-cell relative grid place-items-center", `queens-region-${region % 5}`, bad.has(cell) && mark === 2 && "queens-cell-bad", hinted === cell && "puzzle-hinted")}
                  style={
                    {
                      backgroundColor: regionColors[region % regionColors.length],
                      borderTopWidth: edge(r > 0 ? cell - n : null) ? 2 : 0.5,
                      borderLeftWidth: edge(c > 0 ? cell - 1 : null) ? 2 : 0.5,
                      borderRightWidth: edge(c < n - 1 ? cell + 1 : null) ? 2 : 0.5,
                      borderBottomWidth: edge(r < n - 1 ? cell + n : null) ? 2 : 0.5,
                      "--queens-d": r + c,
                    } as CSSProperties
                  }
                >
                  {mark === 2 ? (
                    <QueensCrown design={look.crown} className="queens-crown size-[64%]" />
                  ) : mark === 1 ? (
                    <svg viewBox="0 0 10 10" aria-hidden className="queens-x size-[26%]">
                      <path d="M2 2l6 6M8 2l-6 6" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <QueensDefs />
      <div aria-hidden className="mt-3 flex justify-center gap-1.5">
        {Array.from({ length: n }, (_, i) => (
          <QueensCrown key={i} design={look.crown} className={cn("queens-pip size-5", i < crowns.length && "queens-pip-on", i < crowns.length && bad.size > 0 && "queens-pip-bad")} />
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
