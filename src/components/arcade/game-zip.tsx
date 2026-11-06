"use client";

import { useRef, useState, type PointerEvent } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { edgeKey, generateZip, zipNeighbours, zipSolved, type ZipPuzzle } from "@/lib/minigames/zip";
import { cn } from "@/lib/utils";
import { keyDirection, useArcade, useGameKeys } from "./game-shell";
import { PuzzleFrame, usePuzzleSession, type PuzzleSession } from "./puzzle-shell";

function ZipPlay({ session }: { session: PuzzleSession<ZipPuzzle> }) {
  const { play, effects } = useArcade();
  const { puzzle, locked } = session;
  const n = puzzle.size;
  const start = puzzle.numbers.indexOf(1);
  const walls = new Set(puzzle.walls);
  const [path, setPathState] = useState<number[]>([start]);
  const [history, setHistory] = useState<number[][]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const drag = useRef<{ pointer: number; before: number[] } | null>(null);
  const flashTimer = useRef(0);
  // Pointer events can outpace renders, so moves read the latest path from here.
  const pathRef = useRef<number[]>(path);
  const setPath = (next: number[]) => {
    pathRef.current = next;
    setPathState(next);
  };

  /** Highest number reached along a path. */
  const reached = (cells: number[]) => cells.reduce((top, cell) => Math.max(top, puzzle.numbers[cell]), 0);

  /** The path after moving onto `cell`, or null if that move isn't allowed. */
  function stepTo(current: number[], cell: number): number[] | null {
    const at = current.indexOf(cell);
    if (at !== -1) return current.slice(0, at + 1);
    const end = current[current.length - 1];
    if (!zipNeighbours(end, n).includes(cell) || walls.has(edgeKey(end, cell))) return null;
    if (puzzle.numbers[end] === puzzle.last) return null;
    const number = puzzle.numbers[cell];
    if (number && number !== reached(current) + 1) return null;
    return [...current, cell];
  }

  function reject(cell: number) {
    if (flash === cell) return;
    setFlash(cell);
    play("invalid");
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 380);
  }

  function apply(next: number[], before: number[] | null) {
    if (locked) return;
    const previous = pathRef.current;
    if (before) setHistory((entries) => [...entries.slice(-199), before]);
    setPath(next);
    session.touch();
    if (next.length > previous.length) play("tap", 0.9 + next.length / (n * n) / 2);
    if (zipSolved(puzzle, next)) {
      drag.current = null;
      session.solve({ moves: history.length + 1 });
    }
  }

  /** Returns whether the move happened. */
  function moveTo(cell: number, before: number[] | null) {
    const current = pathRef.current;
    const next = stepTo(current, cell);
    if (!next) reject(cell);
    else if (next.length !== current.length) apply(next, before);
    return next !== null;
  }

  function undo() {
    if (locked || history.length === 0) return;
    setPath(history[history.length - 1]);
    setHistory((previous) => previous.slice(0, -1));
    play("erase");
  }

  useGameKeys((event) => {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === "z" || event.key === "Z") {
        undo();
        return true;
      }
      return false;
    }
    if (locked) return false;
    const dir = keyDirection(event);
    if (dir) {
      const end = path[path.length - 1];
      const r = Math.floor(end / n);
      const c = end % n;
      const target = dir === "up" ? (r > 0 ? end - n : -1) : dir === "down" ? (r < n - 1 ? end + n : -1) : dir === "left" ? (c > 0 ? end - 1 : -1) : c < n - 1 ? end + 1 : -1;
      if (target === -1) return true;
      // Stepping back onto the previous cell retracts the path.
      if (path.length > 1 && path[path.length - 2] === target) apply(path.slice(0, -1), path);
      else if (path.includes(target)) reject(target);
      else moveTo(target, path);
      return true;
    }
    if (event.key === "Backspace" && path.length > 1) apply(path.slice(0, -1), path);
    else if (event.key === "u" || event.key === "U") undo();
    else return false;
    return true;
  });

  function cellFrom(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const c = Math.floor(((event.clientX - rect.left) / rect.width) * n);
    const r = Math.floor(((event.clientY - rect.top) / rect.height) * n);
    if (r < 0 || c < 0 || r >= n || c >= n) return null;
    return r * n + c;
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || locked) return;
    const cell = cellFrom(event);
    if (cell === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, before: path };
    if (path.includes(cell)) {
      if (cell !== path[path.length - 1]) apply(path.slice(0, path.indexOf(cell) + 1), path);
    } else if (!moveTo(cell, path)) drag.current = null;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId || locked) return;
    const cell = cellFrom(event);
    if (cell === null) return;
    // A fast stroke can skip cells: walk toward the pointer one cell at a time.
    for (let guard = 0; guard < n * 2; guard += 1) {
      const now = pathRef.current;
      const end = now[now.length - 1];
      if (cell === end) return;
      // One history entry per stroke: the path as it was when the stroke began.
      const before = now === current.before ? current.before : null;
      const dr = Math.floor(cell / n) - Math.floor(end / n);
      const dc = (cell % n) - (end % n);
      const near = now.includes(cell) || Math.abs(dr) + Math.abs(dc) === 1;
      const step = near ? cell : Math.abs(dr) >= Math.abs(dc) ? end + Math.sign(dr) * n : end + Math.sign(dc);
      if (!moveTo(step, before) || near) return;
    }
  }

  const point = (cell: number) => `${(cell % n) + 0.5},${Math.floor(cell / n) + 0.5}`;
  const visited = new Set(path);
  const top = reached(path);

  return (
    <PuzzleFrame
      session={session}
      title="Zip"
      rules={[
        "Draw one path from 1 that visits every cell exactly once.",
        "Pass the numbers in order (1, 2, 3 …) and finish on the highest number.",
        "The path can't cross itself or pass through a thick wall.",
        "Drag from the end of your path to extend it; drag back over it to retrace. Undo restores your last stroke.",
        "Keyboard: arrows extend or step back, Backspace removes the last cell, U undoes.",
      ]}
      tools={
        <>
          <Button variant="outline" size="sm" onClick={undo} disabled={locked || history.length === 0}>
            <Undo2 aria-hidden />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={() => path.length > 1 && apply([start], path)} disabled={locked}>
            <Eraser aria-hidden />
            Clear
          </Button>
        </>
      }
    >
      <div
        role="application"
        aria-label={`Zip board, ${n} by ${n}. Path covers ${path.length} of ${n * n} cells, last number reached ${top} of ${puzzle.last}.`}
        className={cn("puzzle-board zip-board relative mx-auto aspect-square w-full touch-none select-none", session.phase === "solved" && "puzzle-board-solved")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div aria-hidden className="grid size-full" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {Array.from({ length: n * n }, (_, cell) => (
            <div key={cell} className={cn("zip-cell", visited.has(cell) && "zip-cell-on", flash === cell && "zip-cell-flash", flash === cell && effects !== "off" && "zip-cell-shake")} />
          ))}
        </div>
        <svg aria-hidden viewBox={`0 0 ${n} ${n}`} className="pointer-events-none absolute inset-0 size-full">
          {path.length > 1 ? <polyline points={path.map(point).join(" ")} className="zip-path" /> : null}
          {puzzle.walls.map((key) => {
            const [a, b] = key.split("-").map(Number);
            const r = Math.floor(a / n);
            const c = a % n;
            return b === a + 1 ? <line key={key} x1={c + 1} y1={r} x2={c + 1} y2={r + 1} className="zip-wall" /> : <line key={key} x1={c} y1={r + 1} x2={c + 1} y2={r + 1} className="zip-wall" />;
          })}
          {puzzle.numbers.map((number, cell) =>
            number ? (
              <g key={cell} transform={`translate(${(cell % n) + 0.5} ${Math.floor(cell / n) + 0.5})`}>
                <circle r="0.3" className={number <= top ? "zip-dot zip-dot-on" : "zip-dot"} />
                <text y="0.11" textAnchor="middle" className="zip-number">{number}</text>
              </g>
            ) : null,
          )}
        </svg>
      </div>
    </PuzzleFrame>
  );
}

const generate = (random: () => number, mode: string) => generateZip(random, mode === "daily" ? 7 : 6);

export default function GameZip({ records }: { records: Record<string, number> }) {
  const session = usePuzzleSession("zip", generate, records);
  return <ZipPlay key={session.puzzleId} session={session} />;
}
