"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { Play, Trophy } from "lucide-react";
import { ARCADE_CABINETS, ArcadePreview } from "@/components/arcade/previews";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { Button } from "@/components/ui/button";
import { ARCADE_GAMES, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, formatDuration, type ArcadeGame, type ArcadeRecords } from "@/lib/arcade";
import { catalogMatcher } from "@/lib/catalog-search";

function RecordLine({ game, records }: { game: ArcadeGame; records: ArcadeRecords }) {
  if (game.id === "sudoku") {
    return (
      <dl className="flex flex-wrap gap-x-3 gap-y-1">
        {SUDOKU_DIFFICULTIES.map((difficulty) => {
          const time = records[`sudoku:${difficulty}`];
          return (
            <div key={difficulty} className="flex gap-1">
              <dt>{SUDOKU_LABELS[difficulty]}</dt>
              <dd className="font-semibold text-foreground tabular-nums">{time ? formatDuration(time) : "—"}</dd>
            </div>
          );
        })}
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

export function ArcadeGames({ records }: { records: ArcadeRecords }) {
  const [query, setQuery] = useState("");
  const match = catalogMatcher(query);
  const games = match ? ARCADE_GAMES.filter((game) => match(game.title, ARCADE_CABINETS[game.id].genre, game.blurb)) : ARCADE_GAMES;

  return (
    <>
      <CatalogSearch value={query} onChange={setQuery} label="Search games" placeholder="Search games" className="mb-4" />
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
    </>
  );
}
