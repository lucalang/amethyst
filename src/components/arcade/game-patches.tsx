"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Eraser, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generatePatches, patchValid, patchesSolved, rectContains, type PatchShape, type PatchesPuzzle, type Rect } from "@/lib/minigames/patches";
import { cn } from "@/lib/utils";
import { keyDirection, useArcade, useGameKeys } from "./game-shell";
import { PuzzleFrame, usePuzzleSession, type PuzzleSession } from "./puzzle-shell";

const PATCH_COLORS = ["#b48cff", "#ff9a8b", "#6fd6a6", "#ffcf5c", "#7cc4ff", "#ff9ed1", "#c7b27a", "#7ee0d8", "#d39bff", "#a9cf6a"];
const SHAPE_LABEL: Record<PatchShape, string> = { square: "square", wide: "wider than tall", tall: "taller than wide", any: "any shape" };

function ShapeIcon({ shape }: { shape: PatchShape }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className="size-[34%] max-w-4">
      {shape === "square" ? <rect x="3" y="3" width="10" height="10" rx="1.5" className="fill-none stroke-current" strokeWidth="1.8" /> : null}
      {shape === "wide" ? <rect x="1.5" y="5" width="13" height="6" rx="1.5" className="fill-none stroke-current" strokeWidth="1.8" /> : null}
      {shape === "tall" ? <rect x="5" y="1.5" width="6" height="13" rx="1.5" className="fill-none stroke-current" strokeWidth="1.8" /> : null}
      {shape === "any" ? <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" className="fill-none stroke-current" strokeWidth="1.6" strokeDasharray="2.4 2" /> : null}
    </svg>
  );
}

const boundingRect = (a: number, b: number, n: number): Rect => {
  const r = Math.min(Math.floor(a / n), Math.floor(b / n));
  const c = Math.min(a % n, b % n);
  return { r, c, h: Math.abs(Math.floor(a / n) - Math.floor(b / n)) + 1, w: Math.abs((a % n) - (b % n)) + 1 };
};

const overlaps = (a: Rect, b: Rect) => a.r < b.r + b.h && b.r < a.r + a.h && a.c < b.c + b.w && b.c < a.c + a.w;

function PatchesPlay({ session }: { session: PuzzleSession<PatchesPuzzle> }) {
  const { play } = useArcade();
  const { puzzle, locked } = session;
  const n = puzzle.size;
  const [patches, setPatches] = useState<Rect[]>([]);
  const [history, setHistory] = useState<Rect[][]>([]);
  const [cursor, setCursor] = useState(0);
  const [selection, setSelection] = useState<{ anchor: number; to: number; pointer: number | null } | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const clueAt = new Map(puzzle.clues.map((clue, index) => [clue.cell, index]));

  function commit(next: Rect[], sound: "place" | "erase" | "invalid" = "place") {
    if (locked) return;
    setHistory((previous) => [...previous.slice(-199), patches]);
    setPatches(next);
    session.touch();
    play(sound);
    if (patchesSolved(next, puzzle)) session.solve({ moves: history.length + 1 });
  }

  function draw(rect: Rect) {
    const next = [...patches.filter((patch) => !overlaps(patch, rect)), rect];
    commit(next, patchValid(rect, puzzle) ? "place" : "invalid");
  }

  function removeAt(cell: number) {
    const next = patches.filter((patch) => !rectContains(patch, cell, n));
    if (next.length !== patches.length) commit(next, "erase");
  }

  function finishSelection(anchor: number, to: number) {
    setSelection(null);
    if (anchor === to && patches.some((patch) => rectContains(patch, anchor, n))) removeAt(anchor);
    else draw(boundingRect(anchor, to, n));
  }

  function undo() {
    if (locked || history.length === 0) return;
    setPatches(history[history.length - 1]);
    setHistory((previous) => previous.slice(0, -1));
    play("erase");
  }

  function moveCursor(to: number) {
    setCursor(to);
    if (selection && selection.pointer === null) setSelection({ ...selection, to });
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
    if (event.key === "Escape" && selection) setSelection(null);
    else if (event.key === "Backspace" || event.key === "Delete") removeAt(cursor);
    else if (event.key === "u" || event.key === "U") undo();
    else return false;
    return true;
  });

  function cellAt(x: number, y: number) {
    const element = document.elementFromPoint(x, y);
    const value = element instanceof HTMLElement ? element.closest<HTMLElement>("[data-cell]")?.dataset.cell : undefined;
    return value === undefined ? null : Number(value);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!selection || selection.pointer !== event.pointerId) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (cell !== null && cell !== selection.to) setSelection({ ...selection, to: cell });
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!selection || selection.pointer !== event.pointerId) return;
    const cell = cellAt(event.clientX, event.clientY) ?? selection.to;
    finishSelection(selection.anchor, cell);
  }

  const preview = selection ? boundingRect(selection.anchor, selection.to, n) : null;
  const pct = (value: number) => `${(value / n) * 100}%`;

  return (
    <PuzzleFrame
      session={session}
      title="Patches"
      rules={[
        "Split the whole grid into rectangles (patches). Every cell belongs to exactly one patch.",
        "Each patch contains exactly one clue. The number is the patch's size in cells.",
        "The clue's icon gives the shape: a square, wider than tall, taller than wide, or a dashed icon for any shape.",
        "Drag from corner to corner to draw a patch; drawing over patches replaces them. Tap a patch to remove it. Patches that don't fit their clue are striped.",
        "Keyboard: arrows move, Space starts and ends a patch, Esc cancels, Delete removes, U undoes.",
      ]}
      tools={
        <>
          <Button variant="outline" size="sm" onClick={undo} disabled={locked || history.length === 0}>
            <Undo2 aria-hidden />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={() => patches.length && commit([], "erase")} disabled={locked}>
            <Eraser aria-hidden />
            Clear
          </Button>
        </>
      }
    >
      <div
        className={cn("puzzle-board relative mx-auto aspect-square w-full touch-none select-none", session.phase === "solved" && "puzzle-board-solved")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setSelection(null)}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {patches.map((patch) => {
            const valid = patchValid(patch, puzzle);
            const clue = puzzle.clues.findIndex((entry) => rectContains(patch, entry.cell, n));
            const color = valid ? PATCH_COLORS[clue % PATCH_COLORS.length] : undefined;
            return (
              <span
                key={`${patch.r}-${patch.c}-${patch.h}-${patch.w}`}
                className={cn("patch", !valid && "patch-bad")}
                style={{ left: pct(patch.c), top: pct(patch.r), width: pct(patch.w), height: pct(patch.h), ...(color ? { "--patch": color } : {}) } as CSSProperties}
              />
            );
          })}
          {preview ? <span className="patch patch-preview" style={{ left: pct(preview.c), top: pct(preview.r), width: pct(preview.w), height: pct(preview.h) }} /> : null}
        </div>
        <div role="grid" aria-label="Patches grid" className="relative grid size-full" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {Array.from({ length: n }, (_, r) => (
            <div key={r} role="row" className="contents">
              {Array.from({ length: n }, (_, c) => {
                const cell = r * n + c;
                const clueIndex = clueAt.get(cell);
                const clue = clueIndex === undefined ? null : puzzle.clues[clueIndex];
                const covered = patches.find((patch) => rectContains(patch, cell, n));
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
                    aria-label={`Row ${r + 1}, column ${c + 1}${clue ? `, clue ${clue.area}, ${SHAPE_LABEL[clue.shape]}` : ""}${covered ? `, in a ${covered.w} by ${covered.h} patch${patchValid(covered, puzzle) ? "" : " that doesn't fit"}` : ", not in a patch"}`}
                    aria-disabled={locked}
                    onFocus={() => setCursor(cell)}
                    onPointerDown={(event) => {
                      if (event.button !== 0 || locked) return;
                      event.currentTarget.closest<HTMLElement>(".puzzle-board")?.setPointerCapture(event.pointerId);
                      setSelection({ anchor: cell, to: cell, pointer: event.pointerId });
                    }}
                    onClick={(event) => {
                      // Keyboard activation (Space/Enter) starts or ends a patch at the cursor.
                      if (event.detail !== 0 || locked) return;
                      if (selection && selection.pointer === null) finishSelection(selection.anchor, cell);
                      else setSelection({ anchor: cell, to: cell, pointer: null });
                    }}
                    className="patches-cell grid place-items-center"
                  >
                    {clue ? (
                      <span className="patches-clue flex flex-col items-center justify-center leading-none">
                        <span className="text-[clamp(0.9rem,4.5cqi,1.6rem)] font-bold tabular-nums">{clue.area}</span>
                        <ShapeIcon shape={clue.shape} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </PuzzleFrame>
  );
}

const generate = (random: () => number) => generatePatches(random, 6);

export default function GamePatches({ records }: { records: Record<string, number> }) {
  const session = usePuzzleSession("patches", generate, records);
  return <PatchesPlay key={session.puzzleId} session={session} />;
}
