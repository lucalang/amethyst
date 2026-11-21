"use client";

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SUMBREAK_DAILY_SIZE,
  applyMerge,
  canMerge,
  generateSumbreak,
  legalMerges,
  solveSumbreak,
  sumbreakLevelSize,
  sumbreakNeighbours,
  sumbreakSolved,
  tilesLeft,
  type SumbreakBoard,
  type SumbreakMove,
  type SumbreakPuzzle,
} from "@/lib/minigames/sumbreak";
import { sumbreakLevelBoard } from "@/lib/minigames/levels";
import { cn } from "@/lib/utils";
import { keyDirection, useArcade, useGameKeys } from "./game-shell";
import { PuzzleFrame, usePuzzleSession, type PuzzleSession, type PuzzleSpec } from "./puzzle-shell";
import { CELEBRATIONS } from "./puzzle-looks";
import { BoardLayers, MergeFx, sumbreakLook } from "./sumbreak/look";
import "./sumbreak/cosmetics.css";

/** One step of play: the board before it and the merge (null = the board was reset to the start). */
type Step = { before: SumbreakBoard; move: SumbreakMove | null };
type Drag = { from: number; pointer: number; x: number; y: number; moved: boolean };
/** The latest merge, for its effects: `from` slides onto `cell`; `chain` counts merges made in quick succession. */
type Pop = { id: number; cell: number; from: number; fromValue: number; chain: number };

/** Merges this close together (ms) build a chain. */
const CHAIN_MS = 1600;

/** The merges since the last reset, in order: what the server replays. */
function movesOf(history: Step[]) {
  const moves: SumbreakMove[] = [];
  for (const step of history) {
    if (step.move) moves.push(step.move);
    else moves.length = 0;
  }
  return moves;
}

function SumbreakPlay({ session }: { session: PuzzleSession<SumbreakPuzzle> }) {
  const { play, effects, look: equipped } = useArcade();
  const look = useMemo(() => sumbreakLook(equipped), [equipped]);
  const { puzzle, locked } = session;
  const n = puzzle.size;
  const [cells, setCells] = useState<SumbreakBoard>(() => [...puzzle.cells]);
  const [history, setHistory] = useState<Step[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [cursor, setCursor] = useState(0);
  const [pop, setPop] = useState<Pop | null>(null);
  const lastMerge = useRef({ at: 0, chain: 0 });
  const [shake, setShake] = useState<{ id: number; cell: number } | null>(null);
  const [hinted, setHinted] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const drag = useRef<Drag | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const undos = useRef(0);

  const solved = session.phase === "solved";
  const left = tilesLeft(cells);
  const stuck = !solved && left > 1 && legalMerges(cells, n).length === 0;
  const partners = selected === null ? [] : sumbreakNeighbours(selected, n).filter((cell) => canMerge(cells, n, selected, cell));
  // Shades follow each number's doubling from the board's smallest one (every number is that times a power of 2).
  const smallest = Math.min(...puzzle.cells.filter(Boolean));
  const tier = (value: number) => Math.max(0, Math.round(Math.log2(value / smallest)));

  function shakeAt(cell: number) {
    setShake((previous) => ({ id: (previous?.id ?? 0) + 1, cell }));
    play("invalid");
  }

  function merge(from: number, to: number) {
    if (locked) return false;
    if (!canMerge(cells, n, from, to)) {
      shakeAt(to);
      setMessage(cells[from] && cells[to] && sumbreakNeighbours(from, n).includes(to) ? `${cells[from]} and ${cells[to]} don't match.` : "Only neighbours above, below, left or right can merge.");
      return false;
    }
    session.touch();
    const next = applyMerge(cells, { from, to });
    const nextHistory = [...history, { before: cells, move: { from, to } }];
    setHistory(nextHistory);
    setCells(next);
    setSelected(null);
    setCursor(to);
    setHinted(null);
    const now = performance.now();
    const chain = now - lastMerge.current.at < CHAIN_MS ? lastMerge.current.chain + 1 : 1;
    lastMerge.current = { at: now, chain };
    setPop((previous) => ({ id: (previous?.id ?? 0) + 1, cell: to, from, fromValue: cells[from], chain }));
    // A little buzz on phones: firmer for big numbers.
    if (effects !== "off") navigator.vibrate?.(tier(next[to]) >= 5 ? [14, 40, 18] : 12);
    const remaining = tilesLeft(next);
    setMessage(`${cells[from]} + ${cells[to]} = ${next[to]}. ${remaining === 1 ? "One tile left: solved!" : `${remaining} tiles left.`}`);
    if (sumbreakSolved(next)) {
      const moves = movesOf(nextHistory);
      session.solve({ moves: moves.length, undos: undos.current }, { seed: puzzle.seed, size: n, candidates: puzzle.candidates, moves: moves.flatMap((move) => [move.from, move.to]) });
      return true;
    }
    if (legalMerges(next, n).length === 0) {
      play("miss");
      setMessage(`No merges left with ${remaining} tiles. Undo or restart.`);
    } else {
      play("merge", 0.8 + Math.min(0.8, tier(next[to]) * 0.1) + Math.min(0.3, (chain - 1) * 0.06));
      if (chain >= 3) play("combo", 1 + Math.min(0.6, (chain - 3) * 0.1));
    }
    return true;
  }

  /** Tap or Enter on a tile: pick it, merge the picked tile onto it, or switch to it. */
  function tap(cell: number) {
    if (locked) return;
    setCursor(cell);
    if (!cells[cell]) {
      setSelected(null);
      return;
    }
    if (selected === cell) {
      setSelected(null);
      return;
    }
    if (selected !== null && canMerge(cells, n, selected, cell)) {
      merge(selected, cell);
      return;
    }
    if (selected !== null && sumbreakNeighbours(selected, n).includes(cell)) shakeAt(cell);
    setSelected(cell);
    const count = sumbreakNeighbours(cell, n).filter((other) => canMerge(cells, n, cell, other)).length;
    setMessage(count ? `${cells[cell]} picked: ${count} matching neighbour${count === 1 ? "" : "s"}.` : `${cells[cell]} has no matching neighbour right now.`);
    play("tap", 1.1);
  }

  function undo() {
    if (locked || history.length === 0) return;
    const last = history[history.length - 1];
    setCells(last.before);
    setHistory(history.slice(0, -1));
    setSelected(null);
    setHinted(null);
    undos.current += 1;
    setMessage("Undone.");
    play("erase");
  }

  function restart() {
    if (locked || history.length === 0 || cells.every((value, i) => value === puzzle.cells[i])) return;
    setHistory([...history, { before: cells, move: null }]);
    setCells([...puzzle.cells]);
    setSelected(null);
    setHinted(null);
    setMessage("Back to the start. Undo brings your merges back.");
    play("erase");
  }

  /**
   * Shows the next good merge. If the board can no longer be solved, it first steps back to your latest
   * position that still can (as far as the start, which always can).
   */
  function hint() {
    if (locked || solved) return;
    let base = cells;
    let keep = history.length;
    let plan = solveSumbreak(cells, n);
    if (!plan?.length) {
      plan = null;
      for (let i = history.length - 1; i >= 0 && !plan; i -= 1) {
        const found = solveSumbreak(history[i].before, n, 20_000);
        if (found?.length) {
          plan = found;
          base = history[i].before;
          keep = i;
        }
      }
      if (!plan) {
        plan = puzzle.solution;
        base = [...puzzle.cells];
        keep = history.length;
      }
    }
    session.takeHint();
    const move = plan[0];
    const steppedBack = base.some((value, i) => value !== cells[i]);
    const kept = steppedBack && keep === history.length ? [...history, { before: cells, move: null }] : history.slice(0, keep);
    const next = applyMerge(base, move);
    const nextHistory = [...kept, { before: base, move }];
    setHistory(nextHistory);
    setCells(next);
    setSelected(null);
    setCursor(move.to);
    setHinted(move.to);
    setPop((previous) => ({ id: (previous?.id ?? 0) + 1, cell: move.to, from: move.from, fromValue: base[move.from], chain: 1 }));
    setMessage(`${steppedBack ? "Stepped back to a position that can still be solved. " : ""}Hint: ${base[move.from]} + ${base[move.to]} = ${next[move.to]}.`);
    if (sumbreakSolved(next)) {
      const moves = movesOf(nextHistory);
      session.solve({ moves: moves.length, undos: undos.current }, { seed: puzzle.seed, size: n, candidates: puzzle.candidates, moves: moves.flatMap((entry) => [entry.from, entry.to]) });
    }
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
      const from = selected ?? cursor;
      const r = Math.floor(from / n);
      const c = from % n;
      const target = dir === "up" ? (r > 0 ? from - n : -1) : dir === "down" ? (r < n - 1 ? from + n : -1) : dir === "left" ? (c > 0 ? from - 1 : -1) : c < n - 1 ? from + 1 : -1;
      // With a tile picked, an arrow merges it that way; otherwise it moves the focus.
      if (selected !== null) {
        if (target >= 0 && merge(selected, target)) buttons.current[target]?.focus({ preventScroll: true });
        else if (target < 0) shakeAt(selected);
      } else if (target >= 0) moveCursor(target);
      return true;
    }
    if (event.key === "Escape" && selected !== null) setSelected(null);
    else if (event.key === "u" || event.key === "U") undo();
    else return false;
    return true;
  });

  /* Pointer: drag a tile onto a neighbour, or tap one tile and then another. */
  const cellAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return element ? Number(element.dataset.cell) : null;
  };

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>, cell: number) {
    if (locked || !cells[cell] || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { from: cell, pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) > 8) {
      current.moved = true;
      setSelected(current.from);
    }
    if (current.moved) {
      const target = cellAt(event.clientX, event.clientY);
      setOver(target !== null && target !== current.from ? target : null);
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId) return;
    drag.current = null;
    setOver(null);
    if (!current.moved) {
      tap(current.from);
      return;
    }
    const target = cellAt(event.clientX, event.clientY);
    if (target === null || target === current.from) setSelected(null);
    else if (!merge(current.from, target)) setSelected(null);
  }

  return (
    <PuzzleFrame
      session={session}
      title="Sumbreak"
      onHint={hint}
      celebrate={CELEBRATIONS[equipped.finish ?? ""]}
      rules={[
        "Drag a number onto a neighbour above, below, left or right that holds the same number, or tap one and then the other.",
        "The two merge into their sum, which lands on the tile you moved onto. The tile you moved from stays empty: nothing slides, and nothing merges across a gap or diagonally.",
        "Keep merging until a single tile is left. Order matters: a number with no matching neighbour left can never merge.",
        "Keyboard: arrows move, Space or Enter picks a tile, then an arrow merges it that way. Esc cancels, U undoes.",
      ]}
      tools={
        <>
          <Button variant="outline" size="sm" onClick={undo} disabled={locked || history.length === 0}>
            <Undo2 aria-hidden />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={restart} disabled={locked || cells.every((value, i) => value === puzzle.cells[i])}>
            <RotateCcw aria-hidden />
            Restart
          </Button>
        </>
      }
    >
      <div
        data-fx={effects}
        className={cn(
          "puzzle-board sumbreak-board relative mx-auto aspect-square w-full",
          solved && "puzzle-board-solved",
          stuck && "sumbreak-stuck",
          effects !== "off" && "sumbreak-fx",
          // Big merges give the whole board a small thump (two names so back-to-back ones both play).
          pop && tier(cells[pop.cell] || 1) >= 4 && (pop.id % 2 ? "sumbreak-thump-a" : "sumbreak-thump-b"),
        )}
      >
        <BoardLayers look={look} />
        {pop && pop.chain >= 2 && effects !== "off" ? (
          <span key={`chain-${pop.id}`} aria-hidden className="sumbreak-chain">
            Chain ×{pop.chain}
          </span>
        ) : null}
        <div
          role="grid"
          aria-label={`Sumbreak board, ${n} by ${n}, ${left} tile${left === 1 ? "" : "s"} left`}
          className="sumbreak-grid grid size-full"
          style={
            {
              "--sb-gap": "clamp(0.25rem, 1.6cqi, 0.6rem)",
              gap: "var(--sb-gap)",
              padding: "var(--sb-gap)",
              gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${n}, minmax(0, 1fr))`,
            } as CSSProperties
          }
        >
          {Array.from({ length: n }, (_, r) => (
            <div key={r} role="row" className="contents">
              {Array.from({ length: n }, (_, c) => {
                const cell = r * n + c;
                const value = cells[cell];
                const isPartner = partners.includes(cell);
                const matches = value ? sumbreakNeighbours(cell, n).filter((other) => cells[other] === value).length : 0;
                const merged = pop?.cell === cell && Boolean(value);
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
                    aria-label={
                      value
                        ? `Row ${r + 1}, column ${c + 1}: ${value}${selected === cell ? ", picked" : ""}${isPartner ? ", can merge with the picked tile" : ""}${selected === null ? `, ${matches} matching neighbour${matches === 1 ? "" : "s"}` : ""}`
                        : `Row ${r + 1}, column ${c + 1}: empty`
                    }
                    aria-selected={selected === cell}
                    aria-disabled={locked || !value}
                    onFocus={() => setCursor(cell)}
                    onClick={(event) => {
                      // Pointer taps are handled on release; this is Enter or Space.
                      if (event.detail === 0) tap(cell);
                    }}
                    onPointerDown={(event) => onPointerDown(event, cell)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => {
                      drag.current = null;
                      setOver(null);
                    }}
                    className={cn(
                      "sumbreak-cell relative grid touch-none place-items-center rounded-[22%] select-none",
                      value ? "sumbreak-tile" : "sumbreak-gap",
                      value && tier(value) >= 7 && "sumbreak-hot",
                      merged && "sumbreak-merged",
                      solved && value && "sumbreak-final",
                      selected === cell && "sumbreak-selected",
                      isPartner && "sumbreak-partner",
                      over === cell && (isPartner ? "sumbreak-over" : "sumbreak-over-bad"),
                      hinted === cell && "puzzle-hinted",
                    )}
                    style={{ "--sb-tier": value ? tier(value) : 0 } as CSSProperties}
                  >
                    {merged && pop && effects !== "off" ? (
                      <span key={`fx-${pop.id}`} aria-hidden className="contents">
                        <span
                          className="sumbreak-ghost sumbreak-value"
                          style={
                            {
                              "--sb-tier": tier(pop.fromValue),
                              "--dx": (pop.from % n) - c,
                              "--dy": Math.floor(pop.from / n) - r,
                              fontSize: `clamp(0.9rem, ${(pop.fromValue >= 100 ? 26 : pop.fromValue >= 10 ? 32 : 38) / n}cqi, 2.6rem)`,
                            } as CSSProperties
                          }
                        >
                          {pop.fromValue}
                        </span>
                        <MergeFx kind={look.merge} seed={pop.id} />
                      </span>
                    ) : null}
                    {value ? (
                      <span
                        key={`${pop?.cell === cell ? pop.id : 0}-${shake?.cell === cell ? shake.id : 0}`}
                        className={cn("sumbreak-value", pop?.cell === cell && "sumbreak-pop", shake?.cell === cell && "sumbreak-shake")}
                        style={{ fontSize: `clamp(0.9rem, ${(value >= 100 ? 26 : value >= 10 ? 32 : 38) / n}cqi, 2.6rem)` }}
                      >
                        {value}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className={cn("min-h-5 text-center text-sm", stuck ? "font-semibold text-rose" : "text-muted-foreground")} aria-live="polite">
        {stuck ? `Stuck: no matching neighbours left with ${left} tiles. Undo, restart or take a hint.` : message || `${left} tiles left. Merge until one remains.`}
      </p>
    </PuzzleFrame>
  );
}

/** Levels grow the board and pick the trickiest of more candidates; Wager matches use their board's size. */
const generate = (random: () => number, spec: PuzzleSpec) => {
  if (spec.kind === "level") {
    const { size, candidates } = sumbreakLevelBoard(spec.level, spec.difficulty);
    return generateSumbreak(random, size, candidates);
  }
  return generateSumbreak(random, spec.kind === "daily" ? SUMBREAK_DAILY_SIZE : sumbreakLevelSize(spec.board));
};

export default function GameSumbreak({ records, userId }: { records: Record<string, number>; userId: string }) {
  const session = usePuzzleSession("sumbreak", generate, records, userId);
  return <SumbreakPlay key={session.puzzleId} session={session} />;
}
