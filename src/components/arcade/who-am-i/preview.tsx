"use client";

import { useEffect, useState } from "react";
import { Check, MessageSquareText, Trophy, X } from "lucide-react";
import type { GameLook } from "@/lib/game-cosmetics";
import type { MotionLevel } from "@/lib/preferences";
import { PLAYABLE } from "@/lib/who-am-i";
import { cn } from "@/lib/utils";
import {
  CardBack,
  PortraitReveal,
  QuestionFlourish,
  TableBackdrop,
  VictoryReveal,
  tableAttributes,
  whoAmILook,
} from "./look";
import { Portrait } from "./portrait";
import "./who-am-i.css";
import "./cosmetics.css";

/**
 * Who Am I?'s shop preview: a small table built from the game's own classes. A question is asked (question
 * effect), answered (answer marker), and the round is won (victory reveal), on a mini board with crossed-out cards
 * (markers and frames), your face-down card (card back), the table theme behind it all and the art style on top.
 * With effects off, every part shows at once, still.
 */

const BOARD = PLAYABLE.slice(0, 6);
const CROSSED = new Set([BOARD[1]?.id, BOARD[4]?.id]);
const YOU = BOARD[2];
const RIVAL = PLAYABLE[7] ?? BOARD[5];
/** Beats per loop: question, then the answer, then the win. */
const BEATS = 6;
const BEAT_MS = 1300;

export function WhoAmIPreview({
  look: equipped,
  effects,
}: {
  look: GameLook;
  effects: MotionLevel;
}) {
  const look = whoAmILook(equipped);
  const still = effects === "off";
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => setBeat((b) => b + 1), BEAT_MS);
    return () => window.clearInterval(id);
  }, [still]);

  const loop = Math.floor(beat / BEATS);
  const step = beat % BEATS;
  const answered = still || step >= 2;
  const won = still || step >= 4;

  return (
    <div
      data-game-skin="who-am-i"
      className="waip mx-auto w-full max-w-[26rem] rounded-xl text-foreground"
      data-still={still || undefined}
    >
      <div
        role="img"
        aria-label="Preview of Who Am I? with the selected look"
        className={cn(
          "wai-table grid gap-2 rounded-xl",
          !still && "wai-fx",
          effects === "full" && "wai-fx-full",
        )}
        {...tableAttributes(look)}
      >
        <TableBackdrop kind={look.table} />
        <div aria-hidden className="grid grid-cols-2 gap-2">
          <div
            className={cn(
              "wai-player flex min-w-0 items-center gap-2 rounded-xl border bg-surface/60 p-1.5",
              won ? "border-emerald-400" : "wai-player-active border-amethyst",
            )}
          >
            <div className="wai-portrait relative size-10 shrink-0 overflow-hidden rounded-lg">
              {won && YOU ? (
                <Portrait character={YOU} />
              ) : (
                <CardBack kind={look.card} />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[0.65rem] font-semibold text-muted-foreground">
                You
              </p>
              <p className="truncate text-xs font-bold">
                {won && YOU ? YOU.name : "Who am I?"}
              </p>
            </div>
          </div>
          <div className="wai-player flex min-w-0 items-center gap-2 rounded-xl border border-border bg-surface/60 p-1.5">
            <div className="wai-portrait relative size-10 shrink-0 overflow-hidden rounded-lg">
              {RIVAL ? <Portrait character={RIVAL} /> : null}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[0.65rem] font-semibold text-muted-foreground">
                Prism
              </p>
              <p className="truncate text-xs font-bold">{RIVAL?.name}</p>
            </div>
          </div>
        </div>

        {won ? (
          <section
            key={`won-${loop}`}
            aria-hidden
            className="wai-result wai-result-won relative flex items-center gap-3 overflow-hidden rounded-xl border border-emerald-400/70 bg-emerald-400/10 p-2.5"
          >
            {look.reveal ? <VictoryReveal kind={look.reveal} /> : null}
            {YOU ? (
              <span className="wai-portrait relative size-14 shrink-0 overflow-hidden rounded-lg ring-2 ring-emerald-400 ring-offset-2 ring-offset-background">
                <Portrait character={YOU} />
                <PortraitReveal kind={look.reveal} />
              </span>
            ) : null}
            <p className="relative flex items-center gap-1.5 text-base font-black tracking-tight">
              <Trophy className="size-4 text-emerald-300" />
              You worked it out!
            </p>
          </section>
        ) : null}

        {!won || still ? (
          <section
            key={`ask-${loop}`}
            aria-hidden
            className="wai-stage rounded-xl border border-amethyst/60 bg-amethyst/[0.08] p-2.5"
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <MessageSquareText className="size-3.5 text-amethyst" />
              <h2 className="text-xs font-bold">You asked</h2>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="wai-q min-w-0 flex-1">
                <p className="wai-question text-sm leading-snug font-bold">
                  Am I wearing glasses?
                </p>
                <QuestionFlourish kind={look.question} />
              </div>
              {answered ? (
                <span className="wai-stamp wai-stamp-yes inline-flex items-center gap-1.5 rounded-2xl border-2 px-2.5 py-1">
                  <span className="wai-stamp-icon grid size-6 place-items-center rounded-full">
                    <Check className="size-4" strokeWidth={3} />
                  </span>
                  <span className="wai-stamp-word text-lg leading-none font-black tracking-tight uppercase">
                    Yes
                  </span>
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        <div
          aria-hidden
          className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2"
        >
          <section className="wai-board rounded-xl border border-border bg-surface/40 p-2">
            <h2 className="mb-1 text-[0.65rem] font-bold text-muted-foreground">
              Your board
            </h2>
            <ul className="grid grid-cols-3 gap-1">
              {BOARD.map((character) => {
                const out = CROSSED.has(character.id);
                return (
                  <li
                    key={character.id}
                    className={cn(
                      "wai-tile relative rounded-md p-0.5",
                      out && "wai-tile-out",
                    )}
                  >
                    <span className="wai-portrait relative block aspect-square overflow-hidden rounded-md">
                      <Portrait character={character} />
                      {out ? (
                        <span
                          key={`x-${loop}`}
                          className="wai-cross absolute inset-0 grid place-items-center bg-background/25"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="size-3/5 text-rose-400 drop-shadow"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.2"
                            strokeLinecap="round"
                          >
                            <path d="M5 5 L19 19" />
                            <path d="M19 5 L5 19" />
                          </svg>
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="wai-log rounded-xl border border-border bg-surface/40 p-2">
            <h2 className="mb-1 text-[0.65rem] font-bold text-muted-foreground">
              Log
            </h2>
            <ol className="grid gap-1 text-[0.65rem]">
              <li className="wai-log-item rounded-md border border-border px-1.5 py-1">
                Hat?{" "}
                <span className="wai-mark wai-mark-no inline-flex items-center gap-0.5 rounded-full bg-rose-400/20 px-1.5 font-bold text-rose-300">
                  <X className="size-2.5" strokeWidth={3} />
                  No
                </span>
              </li>
              <li className="wai-log-item rounded-md border border-border px-1.5 py-1">
                Emerald?{" "}
                <span className="wai-mark wai-mark-yes inline-flex items-center gap-0.5 rounded-full bg-emerald-400/20 px-1.5 font-bold text-emerald-300">
                  <Check className="size-2.5" strokeWidth={3} />
                  Yes
                </span>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
