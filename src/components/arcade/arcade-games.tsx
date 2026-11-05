"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Flame, Play, Trophy } from "lucide-react";
import { DailyCountdown } from "@/components/arcade/daily";
import { ARCADE_CABINETS, ArcadePreview } from "@/components/arcade/previews";
import { RecoverStreakDialog, StreakLine, useArcadeStreaks } from "@/components/arcade/streaks";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { Button } from "@/components/ui/button";
import { ARCADE_GAMES, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, formatDuration, type ArcadeGame, type ArcadeGameId, type ArcadeRecords } from "@/lib/arcade";
import type { ArcadeStreaks } from "@/lib/arcade-streaks";
import { catalogMatcher } from "@/lib/catalog-search";
import { SUDOKU_CONFIG, SUDOKU_SIZES, sudokuVariant } from "@/lib/sudoku";

function RecordLine({ game, records }: { game: ArcadeGame; records: ArcadeRecords }) {
  if (game.id === "sudoku") {
    return (
      <dl className="flex flex-wrap gap-x-3 gap-y-1">
        {SUDOKU_SIZES.flatMap(size => SUDOKU_DIFFICULTIES.map((difficulty) => {
          const variant = sudokuVariant(size, difficulty);
          const time = records[`sudoku:${variant}`];
          if (size !== "normal" && !time) return null;
          return (
            <div key={variant} className="flex gap-1">
              <dt>{SUDOKU_CONFIG[size].label} {SUDOKU_LABELS[difficulty]}</dt>
              <dd className="font-semibold text-foreground tabular-nums">{time ? formatDuration(time) : "—"}</dd>
            </div>
          );
        }))}
      </dl>
    );
  }
  const best = records[game.id];
  return (
    <p>
      {game.recordLabel}{" "}
      <span className="font-semibold text-foreground tabular-nums">{best ? best.toLocaleString("en") : "—"}</span>
    </p>
  );
}

export function ArcadeGames({ records, streaks: initialStreaks }: { records: ArcadeRecords; streaks: { date: string; streaks: ArcadeStreaks } | null }) {
  const [query, setQuery] = useState("");
  const { streaks, replace } = useArcadeStreaks(initialStreaks, () => false);
  const [recovering, setRecovering] = useState<ArcadeGameId | null>(null);
  const match = catalogMatcher(query);
  const games = match ? ARCADE_GAMES.filter((game) => match(game.title, ARCADE_CABINETS[game.id].genre, game.blurb)) : ARCADE_GAMES;

  return (
    <>
      <CatalogSearch value={query} onChange={setQuery} label="Search games" placeholder="Search games" className="mb-2" />
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flame aria-hidden className="size-3.5 shrink-0" />
        <span>
          Play a game once per UTC day to grow its streak. <DailyCountdown label="Next reset in" title="Streak days reset at 00:00 UTC" />
        </span>
      </p>
      {games.length === 0 ? <CatalogEmpty query={query} onReset={() => setQuery("")} /> : null}
      <ul aria-label="Games" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game, index) => {
          const cabinet = ARCADE_CABINETS[game.id];
          return (
            <li key={game.id} className="enter enter-card min-w-0" style={{ "--enter-index": index + 2, "--cab": cabinet.hue } as CSSProperties}>
              <article className="arcade-cab">
                <header className="arcade-cab-marquee">
                  <h2 className="arcade-cab-title">{game.title}</h2>
                  <span className="arcade-cab-genre">{cabinet.genre}</span>
                </header>
                <Link href={game.href} prefetch={false} tabIndex={-1} aria-hidden className="arcade-cab-screen">
                  <span className="arcade-cab-art">
                    <ArcadePreview game={game.id} />
                  </span>
                  <span className="arcade-cab-glass" />
                </Link>
                <span aria-hidden className="arcade-cab-deck">
                  <i className="arcade-cab-stick" />
                  <i className="arcade-cab-button" />
                  <i className="arcade-cab-button" />
                </span>
                <div className="flex flex-1 flex-col gap-3 px-4 pt-1 pb-4">
                  <p className="text-sm text-pretty text-muted-foreground">{game.blurb}</p>
                  {streaks ? <StreakLine streak={streaks[game.id]} onRecover={() => setRecovering(game.id)} /> : null}
                  <div className="mt-auto flex items-end justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                      <Trophy aria-hidden className="arcade-cab-trophy mt-0.5 size-3.5 shrink-0" />
                      <RecordLine game={game} records={records} />
                    </div>
                    <Button asChild size="sm" className="shrink-0">
                      <Link href={game.href} prefetch={false} aria-label={`Play ${game.title}`}>
                        <Play aria-hidden />
                        Play
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
      {streaks && recovering ? (
        <RecoverStreakDialog
          streak={streaks[recovering]}
          open
          onOpenChange={(open) => !open && setRecovering(null)}
          onRecovered={(next) => next && replace(next)}
        />
      ) : null}
    </>
  );
}
