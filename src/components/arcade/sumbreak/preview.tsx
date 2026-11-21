"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { GameLook } from "@/lib/game-cosmetics";
import type { MotionLevel } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { lookAttributes } from "../puzzle-looks";
import { BoardLayers, MergeFx, sumbreakLook } from "./look";
import "./cosmetics.css";

/**
 * Sumbreak's shop preview: a small board built from the game's own classes. Every other beat a tile is picked
 * (with its matching neighbour lit), then merged, so tile materials, number styles, board themes (and the holes
 * merges leave), merge effects and art styles all show as they do in play. Eight doublings are on the board, so
 * every material shows several colours, and the 256 tile shimmers.
 */

const N = 4;
const START = [2, 2, 4, 8, 4, 0, 4, 16, 2, 2, 8, 0, 0, 32, 64, 256];
const MOVES = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
  { from: 3, to: 7 },
  { from: 8, to: 9 },
];
/** Beats the finished board holds before starting over. */
const HOLD = 3;
const CYCLE = MOVES.length * 2 + HOLD;
/** With effects off the preview holds on a picked tile and its partner. */
const STILL_STEP = 4;
const SMALLEST = Math.min(...START.filter(Boolean));
const tier = (value: number) =>
  Math.max(0, Math.round(Math.log2(value / SMALLEST)));
const fontSize = (value: number) =>
  `clamp(0.9rem, ${(value >= 100 ? 26 : value >= 10 ? 32 : 38) / N}cqi, 2.6rem)`;

function boardAfter(merges: number) {
  const cells = [...START];
  for (const { from, to } of MOVES.slice(0, merges)) {
    cells[to] += cells[from];
    cells[from] = 0;
  }
  return cells;
}

export function SumbreakPreview({
  look: equipped,
  effects,
}: {
  look: GameLook;
  effects: MotionLevel;
}) {
  const look = sumbreakLook(equipped);
  const still = effects === "off";
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setBeat((b) => (b + 1) % CYCLE), 950);
    return () => window.clearInterval(id);
  }, [still]);

  const step = still ? STILL_STEP : beat;
  const playing = step < MOVES.length * 2;
  const move = playing ? MOVES[Math.floor(step / 2)] : null;
  const merging = playing && step % 2 === 1;
  const cells = boardAfter(Math.min(MOVES.length, Math.ceil(step / 2)));
  const before = merging ? boardAfter(Math.floor(step / 2)) : cells;
  const fromValue = move ? before[move.from] : 0;
  const equippedLook: GameLook = {};
  for (const [category, slug] of Object.entries(look))
    if (slug) equippedLook[category] = slug;
  const attributes = lookAttributes(equippedLook);

  return (
    <div
      data-game-skin="sumbreak"
      className="sbp rounded-xl p-4"
      data-still={still || undefined}
    >
      <div {...attributes} className="relative mx-auto w-full max-w-[17rem]">
        <div
          role="img"
          aria-label="Sumbreak board preview with the selected look"
          data-fx={effects}
          className={cn(
            "puzzle-board sumbreak-board relative aspect-square w-full",
            !still && "sumbreak-fx",
            merging &&
              move &&
              tier(cells[move.to]) >= 4 &&
              (step % 4 === 1 ? "sumbreak-thump-a" : "sumbreak-thump-b"),
          )}
        >
          <BoardLayers look={look} />
          <div
            aria-hidden
            className="sumbreak-grid grid size-full"
            style={
              {
                "--sb-gap": "clamp(0.25rem, 1.6cqi, 0.6rem)",
                gap: "var(--sb-gap)",
                padding: "var(--sb-gap)",
                gridTemplateColumns: `repeat(${N}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${N}, minmax(0, 1fr))`,
              } as CSSProperties
            }
          >
            {cells.map((value, cell) => {
              const merged = merging && move?.to === cell;
              return (
                <div
                  key={cell}
                  className={cn(
                    "sumbreak-cell relative grid place-items-center rounded-[22%] select-none",
                    value ? "sumbreak-tile" : "sumbreak-gap",
                    value && tier(value) >= 7 && "sumbreak-hot",
                    merged && "sumbreak-merged",
                    !merging && move?.from === cell && "sumbreak-selected",
                    !merging && move?.to === cell && "sumbreak-partner",
                  )}
                  style={
                    { "--sb-tier": value ? tier(value) : 0 } as CSSProperties
                  }
                >
                  {merged && move && !still ? (
                    <span key={`fx-${step}`} className="contents">
                      <span
                        className="sumbreak-ghost sumbreak-value"
                        style={
                          {
                            "--sb-tier": tier(fromValue),
                            "--dx": (move.from % N) - (cell % N),
                            "--dy":
                              Math.floor(move.from / N) - Math.floor(cell / N),
                            fontSize: fontSize(fromValue),
                          } as CSSProperties
                        }
                      >
                        {fromValue}
                      </span>
                      <MergeFx kind={look.merge} seed={step} />
                    </span>
                  ) : null}
                  {value ? (
                    <span
                      key={merged ? step : 0}
                      className={cn("sumbreak-value", merged && "sumbreak-pop")}
                      style={{ fontSize: fontSize(value) }}
                    >
                      {value}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
