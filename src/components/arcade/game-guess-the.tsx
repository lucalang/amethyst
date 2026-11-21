"use client";

import "./guess-the/guess-the.css";
import Link from "next/link";
import { ArrowRight, Flag, LineChart, Ruler, Tag, Trophy } from "lucide-react";
import { GUESS_THE_MODES, type GuessTheModeId } from "@/lib/minigames/guess-the";
import { GameShell, useArcade } from "./game-shell";

const MODE_ICONS = { chart: LineChart, flag: Flag, size: Ruler, price: Tag } as const;
const MODE_TAGLINES: Record<GuessTheModeId, string> = {
  chart: "Draw the future",
  flag: "Name that flag",
  size: "Scale it right",
  price: "Name your price",
};

/** A small looping illustration of each mode (still when motion is off). */
function ModeArt({ mode }: { mode: GuessTheModeId }) {
  switch (mode) {
    case "chart":
      return (
        <svg viewBox="0 0 200 160" className="gt-mode-art" aria-hidden>
          {[40, 80, 120].map((y) => (
            <line key={y} x1="20" x2="190" y1={y} y2={y} stroke="rgb(255 255 255 / 0.08)" />
          ))}
          <path d="M20 120 L50 104 L75 112 L100 84" stroke="var(--gt-a)" strokeWidth="5" className="gt-art-stroke" />
          <path d="M100 84 L125 62 L150 70 L185 30" stroke="var(--gt-b)" strokeWidth="5" strokeDasharray="1" pathLength={1} className="gt-art-stroke gt-anim gt-anim-draw" />
          <line x1="100" x2="100" y1="20" y2="140" stroke="rgb(255 255 255 / 0.25)" strokeDasharray="4 5" />
          <circle cx="185" cy="30" r="6" fill="var(--gt-b)" className="gt-anim gt-anim-float" />
        </svg>
      );
    case "flag":
      return (
        <svg viewBox="0 0 200 160" className="gt-mode-art" aria-hidden>
          <rect x="48" y="18" width="5" height="132" rx="2.5" fill="#cbd5e1" />
          <circle cx="50.5" cy="16" r="5" fill="#facc15" />
          <g className="gt-anim gt-anim-wave">
            <path d="M53 24 Q90 12 120 24 T185 24 V94 Q155 82 120 94 T53 94 Z" fill="var(--gt-a)" />
            <path d="M53 47 Q90 35 120 47 T185 47 V71 Q155 59 120 71 T53 71 Z" fill="#fff7ed" />
            <circle cx="110" cy="59" r="9" fill="var(--gt-b)" />
          </g>
          <text x="140" y="140" fontSize="34" fontWeight="800" fill="rgb(255 255 255 / 0.85)" fontFamily="var(--font-syne), sans-serif" className="gt-anim gt-anim-float">
            ?
          </text>
        </svg>
      );
    case "size":
      return (
        <svg viewBox="0 0 200 160" className="gt-mode-art" aria-hidden>
          <line x1="20" x2="190" y1="140" y2="140" stroke="rgb(255 255 255 / 0.25)" />
          <rect x="44" y="92" width="34" height="48" rx="6" fill="rgb(255 255 255 / 0.25)" />
          <rect x="104" y="30" width="52" height="110" rx="8" fill="var(--gt-a)" className="gt-anim gt-anim-grow" />
          <path d="M170 30 V140 M164 30 H176 M164 140 H176" stroke="var(--gt-b)" strokeWidth="3" className="gt-art-stroke" />
          <path d="M118 22 L130 10 L142 22" stroke="#fff" strokeWidth="3" className="gt-art-stroke gt-anim gt-anim-float" />
        </svg>
      );
    case "price":
      return (
        <svg viewBox="0 0 200 160" className="gt-mode-art" aria-hidden>
          <path d="M100 4 V30" stroke="rgb(255 255 255 / 0.45)" strokeWidth="2" />
          <g className="gt-anim gt-anim-swing">
            <path d="M100 30 L150 48 V128 Q150 136 142 136 H58 Q50 136 50 128 V48 Z" fill="var(--gt-a)" />
            <circle cx="100" cy="50" r="7" fill="#0a0f22" />
            <text x="100" y="108" textAnchor="middle" fontSize="40" fontWeight="800" fill="#0a0f22" fontFamily="var(--font-syne), sans-serif">
              $?
            </text>
          </g>
          {[
            [28, 120],
            [172, 112],
            [160, 60],
          ].map(([x, y], k) => (
            <g key={k} className="gt-anim gt-anim-float" style={{ animationDelay: `${-k * 0.9}s` }}>
              <circle cx={x} cy={y} r="11" fill="var(--gt-b)" />
              <circle cx={x} cy={y} r="6.5" fill="none" stroke="rgb(0 0 0 / 0.25)" strokeWidth="2" />
            </g>
          ))}
        </svg>
      );
  }
}

/** Guess The ...: the mode picker. Each mode is its own page; new modes only need an entry in GUESS_THE_MODES. */
export default function GameGuessThe({ records }: { records: Record<string, number> }) {
  const { effects } = useArcade();
  const played = GUESS_THE_MODES.filter((mode) => records[mode.id] !== undefined);
  return (
    <GameShell game="guess-the" title="Guess The ..." leaderboard={null}>
      <div data-motion={effects} className="flex flex-col gap-5 py-2 sm:gap-7 sm:py-4">
        <header className="gt-enter flex flex-col gap-3 px-1">
          <p className="gt-kicker">Real-world data · four games</p>
          <h2 className="gt-display text-5xl sm:text-7xl">
            Guess the{" "}
            <span className="gt-hero-word">
              <span className="gt-hero-reel">
                {["Chart", "Flag", "Size", "Price", "Chart"].map((word, k) => (
                  <span key={k} data-gt-mode={["chart", "flag", "size", "price", "chart"][k]} className="gt-gradient-text">
                    {word}
                  </span>
                ))}
              </span>
            </span>
          </h2>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground sm:text-base">Every answer is real and sourced. Pick a game, trust your gut and see how close you get.</p>
          {played.length ? (
            <p className="flex flex-wrap gap-2 text-xs">
              {played.map((mode) => (
                <span key={mode.id} data-gt-mode={mode.id} className="gt-chip gt-chip-accent">
                  <Trophy aria-hidden className="size-3" />
                  {mode.title.replace("Guess the ", "")} {records[mode.id]}
                </span>
              ))}
            </p>
          ) : null}
        </header>

        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {GUESS_THE_MODES.map((mode, i) => {
            const Icon = MODE_ICONS[mode.id];
            const best = records[mode.id];
            return (
              <li key={mode.id} className={i % 2 ? "gt-enter-3" : "gt-enter-2"}>
                <Link href={mode.href} data-gt-mode={mode.id} className="gt-mode-card h-full" aria-label={`${mode.title}. ${mode.blurb} ${best === undefined ? "Not played yet." : `Best ${best} out of 100.`}`}>
                  <span aria-hidden className="gt-num">
                    0{i + 1}
                  </span>
                  <ModeArt mode={mode.id} />
                  <div className="relative mt-auto flex flex-col gap-2 pt-24 sm:pt-28">
                    <p className="gt-kicker flex items-center gap-1.5">
                      <Icon aria-hidden className="size-3.5" />
                      {MODE_TAGLINES[mode.id]}
                    </p>
                    <h3 className="gt-display text-3xl sm:text-4xl">{mode.title}</h3>
                    <p className="max-w-sm text-sm text-pretty text-muted-foreground">{mode.blurb}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="flex items-baseline gap-1.5">
                        <Trophy aria-hidden className="size-3.5 self-center text-muted-foreground" />
                        <span className="text-2xl font-extrabold tabular-nums">{best ?? "—"}</span>
                        <span className="text-xs text-muted-foreground">{best === undefined ? "not played" : `/100 ${mode.recordLabel.toLowerCase()}`}</span>
                      </span>
                      <span className="gt-play" aria-hidden>
                        Play
                        <ArrowRight className="size-4" />
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </GameShell>
  );
}
