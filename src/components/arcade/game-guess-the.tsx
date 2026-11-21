"use client";

import "./guess-the/guess-the.css";
import Link from "next/link";
import { ArrowRight, Flag, LineChart, Ruler, Tag, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GUESS_THE_MODES } from "@/lib/minigames/guess-the";
import { GameShell } from "./game-shell";

const MODE_ICONS = { chart: LineChart, flag: Flag, size: Ruler, price: Tag } as const;

/** Guess The ...: the mode picker. Each mode is its own page; new modes only need an entry in GUESS_THE_MODES. */
export default function GameGuessThe({ records }: { records: Record<string, number> }) {
  return (
    <GameShell game="guess-the" title="Guess The ..." leaderboard={null}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-pretty text-muted-foreground">Guessing games built on real-world data. Pick a mode.</p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {GUESS_THE_MODES.map((mode) => {
            const Icon = MODE_ICONS[mode.id];
            const best = records[mode.id];
            return (
              <li key={mode.id} className="gtc-panel flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="grid size-10 place-items-center rounded-lg bg-amethyst/15 text-amethyst">
                    <Icon className="size-5" />
                  </span>
                  <h2 className="text-base font-bold tracking-tight">{mode.title}</h2>
                </div>
                <p className="text-sm text-pretty text-muted-foreground">{mode.blurb}</p>
                <div className="mt-auto flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Trophy aria-hidden className="size-3.5" />
                    {mode.recordLabel} <span className="font-semibold text-foreground tabular-nums">{best === undefined ? "—" : `${best}/100`}</span>
                  </p>
                  <Button asChild size="sm">
                    <Link href={mode.href}>
                      Play
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </GameShell>
  );
}
