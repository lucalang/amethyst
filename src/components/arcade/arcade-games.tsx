"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import { Flame, Gamepad2, Layers, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { DailyCountdown } from "@/components/arcade/daily";
import { ARCADE_CABINETS, ArcadePreview } from "@/components/arcade/previews";
import { RecoverStreakDialog, RestoreAllDialog, StreakLine, StreakRestorePanel, useArcadeStreaks } from "@/components/arcade/streaks";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { Button } from "@/components/ui/button";
import {
  ARCADE_CATEGORIES,
  ARCADE_GAMES,
  SUDOKU_DIFFICULTIES,
  SUDOKU_LABELS,
  arcadeGamesIn,
  formatDuration,
  isPuzzleGame,
  isRankedGame,
  levelRecordKey,
  PUZZLE_DIFFICULTIES,
  type ArcadeCategoryId,
  type ArcadeGame,
  type ArcadeRecords,
  type RankedGameId,
} from "@/lib/arcade";
import type { ArcadeStreak, ArcadeStreaks } from "@/lib/arcade-streaks";
import { catalogMatcher } from "@/lib/catalog-search";
import { GUESS_THE_MODES } from "@/lib/minigames/guess-the";
import { SUDOKU_CONFIG, SUDOKU_SIZES, sudokuVariant } from "@/lib/sudoku";

function RecordLine({ game, records }: { game: ArcadeGame; records: ArcadeRecords }) {
  // Head-to-head games keep no record.
  if (game.id === "who-am-i") return <p>{game.recordLabel}</p>;
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
  // The logic puzzles keep their highest level apart from the old score-based records.
  if (isPuzzleGame(game.id)) {
    const puzzle = game.id;
    return (
      <div>
        <p>{game.recordLabel}</p>
      <dl className="flex flex-wrap gap-x-3 gap-y-1">
        {PUZZLE_DIFFICULTIES[puzzle].map((option) => {
          const level = records[levelRecordKey(puzzle, option.id)];
          if (option.id !== "medium" && !level) return null;
          return (
            <div key={option.id} className="flex gap-1">
              <dt>{option.label}</dt>
              <dd className="font-semibold text-foreground tabular-nums">{level ? `Level ${level.toLocaleString("en")}` : "—"}</dd>
            </div>
          );
        })}
      </dl>
      </div>
    );
  }
  // Guess The ... keeps one record per mode.
  if (game.id === "guess-the") {
    return (
      <dl className="flex flex-wrap gap-x-3 gap-y-1">
        {GUESS_THE_MODES.map((mode) => {
          const best = records[`guess-the:${mode.id}`];
          return (
            <div key={mode.id} className="flex gap-1">
              <dt>{mode.title}</dt>
              <dd className="font-semibold text-foreground tabular-nums">{best === undefined ? "—" : `${best}/100`}</dd>
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

/** The cabinet's screen: the game's static preview (decorative; the Play button is the keyboard target). */
function CabinetScreen({ game }: { game: ArcadeGame }) {
  return (
    <Link href={game.href} prefetch={false} tabIndex={-1} aria-hidden className="arcade-cab-screen">
      <span className="arcade-cab-art">
        <ArcadePreview game={game.id} />
      </span>
      <span className="arcade-cab-glass" />
    </Link>
  );
}

/** Blurb, streak, record and Play: the same on both shelves. */
function CabinetBody({ game, records, streak, onRecover, children }: { game: ArcadeGame; records: ArcadeRecords; streak?: ArcadeStreak; onRecover: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pt-1 pb-4">
      <p className="text-sm text-pretty text-muted-foreground">{game.blurb}</p>
      {children}
      {streak ? <StreakLine streak={streak} onRecover={onRecover} /> : null}
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
  );
}

const SHELF_ICON: Record<ArcadeCategoryId, typeof Gamepad2> = { full: Layers, minigames: Gamepad2 };
/** The tab the hub opens on: the many quick games. */
const DEFAULT_SHELF: ArcadeCategoryId = "minigames";

const isShelf = (value: string | undefined): value is ArcadeCategoryId => ARCADE_CATEGORIES.some((category) => category.id === value);

/**
 * The Arcade's games on two tabs, Minigames and Full Games, so only one shelf is on screen at a time. The open tab
 * lives in the URL (?shelf=full), so it can be linked and survives Back. Search counts matches on both tabs.
 */
export function ArcadeGames({
  records,
  streaks: initialStreaks,
  initialShelf,
}: {
  records: ArcadeRecords;
  streaks: { date: string; streaks: ArcadeStreaks } | null;
  initialShelf?: string;
}) {
  const [query, setQuery] = useState("");
  const [shelf, setShelf] = useState<ArcadeCategoryId>(isShelf(initialShelf) ? initialShelf : DEFAULT_SHELF);
  const { streaks, replace, refresh } = useArcadeStreaks(initialStreaks, () => false);
  // Every game with a lost streak that can still be restored today, whatever shelf or search is showing.
  const restorable = ARCADE_GAMES.flatMap((game) => {
    const streak = isRankedGame(game.id) ? streaks?.[game.id] : undefined;
    return streak?.recovery ? [{ game, streak }] : [];
  });
  const [recovering, setRecovering] = useState<RankedGameId | null>(null);
  const [restoringAll, setRestoringAll] = useState(false);
  // Restore all covers the offers that are ready (today's round played); the rest wait for a round first.
  const readyNow = restorable.filter(({ streak }) => streak.recovery?.ready).map(({ streak }) => streak);
  const match = catalogMatcher(query);
  const games = match ? ARCADE_GAMES.filter((game) => match(game.title, ARCADE_CABINETS[game.id].genre, game.blurb, ...(game.features ?? []))) : ARCADE_GAMES;
  const counts = Object.fromEntries(ARCADE_CATEGORIES.map((category) => [category.id, arcadeGamesIn(category.id, games).length])) as Record<ArcadeCategoryId, number>;
  // Tabs in the order a visitor reaches for them: the many quick games first, then the bigger ones.
  const tabs = [...ARCADE_CATEGORIES].sort((a, b) => (a.id === DEFAULT_SHELF ? -1 : b.id === DEFAULT_SHELF ? 1 : 0));

  function choose(next: string) {
    if (!isShelf(next)) return;
    setShelf(next);
    const url = new URL(window.location.href);
    if (next === DEFAULT_SHELF) url.searchParams.delete("shelf");
    else url.searchParams.set("shelf", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <TabsPrimitive.Root value={shelf} onValueChange={choose} className="arcade-shelves">
      <div className="arcade-shelves-bar">
        <TabsPrimitive.List aria-label="Game categories" className="arcade-tabs">
          {tabs.map((category) => {
            const Icon = SHELF_ICON[category.id];
            return (
              <TabsPrimitive.Trigger key={category.id} value={category.id} className="arcade-tab" data-shelf={category.id}>
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{category.title}</span>
                <span className="arcade-tab-count">
                  {counts[category.id]}
                  <span className="sr-only"> {counts[category.id] === 1 ? "game" : "games"}</span>
                </span>
              </TabsPrimitive.Trigger>
            );
          })}
        </TabsPrimitive.List>
        <CatalogSearch value={query} onChange={setQuery} label="Search games" placeholder="Search games" className="arcade-shelves-search" />
      </div>
      <p className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flame aria-hidden className="size-3.5 shrink-0" />
        <span>
          Play a game once per UTC day to grow its streak. <DailyCountdown label="Next reset in" title="Streak days reset at 00:00 UTC" />
        </span>
      </p>
      {restorable.length > 0 ? (
        <section aria-labelledby="arcade-restore-heading" className="mb-5 grid gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="arcade-restore-heading" className="text-sm font-semibold">
              {restorable.length === 1 ? "A streak you can restore today" : `${restorable.length} streaks you can restore today`}
            </h2>
            {readyNow.length > 1 ? (
              <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => setRestoringAll(true)}>
                <RotateCcw aria-hidden />
                Restore all · <span className="tabular-nums">{readyNow.length}</span>
              </Button>
            ) : null}
          </div>
          <div className="grid gap-2.5 md:grid-cols-2">
            {restorable.map(({ game, streak }) => (
              <StreakRestorePanel key={game.id} streak={streak} playHref={game.href} onRestore={() => setRecovering(streak.game)} />
            ))}
          </div>
        </section>
      ) : null}
      {games.length === 0 ? <CatalogEmpty query={query} onReset={() => setQuery("")} /> : null}
      {ARCADE_CATEGORIES.map((category) => {
        const full = category.id === "full";
        const list = arcadeGamesIn(category.id, games);
        const other = ARCADE_CATEGORIES.find((entry) => entry.id !== category.id && counts[entry.id] > 0);
        return (
          <TabsPrimitive.Content key={category.id} value={category.id} className="arcade-shelf" data-shelf={category.id}>
            <p className="arcade-shelf-desc">{category.description}</p>
            {list.length === 0 && games.length > 0 && other ? (
              <p className="arcade-shelf-elsewhere">
                No {category.title} match “{query.trim()}”.{" "}
                <button type="button" onClick={() => choose(other.id)}>
                  Show {counts[other.id]} in {other.title}
                </button>
              </p>
            ) : null}
            <ul aria-label={category.title} className={full ? "grid grid-cols-1 gap-5" : "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"}>
              {list.map((game, index) => {
                const cabinet = ARCADE_CABINETS[game.id];
                const streak = isRankedGame(game.id) ? streaks?.[game.id] : undefined;
                return (
                  <li key={game.id} className="enter enter-card min-w-0" style={{ "--enter-index": index + 1, "--cab": cabinet.hue } as CSSProperties}>
                    {full ? (
                      <article className="arcade-cab" data-tier="full">
                        <header className="arcade-cab-marquee">
                          <h3 className="arcade-cab-title">{game.title}</h3>
                          <span className="flex flex-none items-center gap-1.5">
                            <span className="arcade-cab-tier">
                              <Sparkles aria-hidden className="size-3" />
                              Full Game
                            </span>
                            <span className="arcade-cab-genre">{cabinet.genre}</span>
                          </span>
                        </header>
                        <div className="arcade-cab-feature">
                          <CabinetScreen game={game} />
                          <CabinetBody game={game} records={records} streak={streak} onRecover={() => streak && setRecovering(streak.game)}>
                            {game.features?.length ? (
                              <ul aria-label={`${game.title} features`} className="arcade-cab-tags">
                                {game.features.map((feature) => (
                                  <li key={feature}>{feature}</li>
                                ))}
                              </ul>
                            ) : null}
                          </CabinetBody>
                        </div>
                      </article>
                    ) : (
                      <article className="arcade-cab">
                        <header className="arcade-cab-marquee">
                          <h3 className="arcade-cab-title">{game.title}</h3>
                          <span className="arcade-cab-genre">{cabinet.genre}</span>
                        </header>
                        <CabinetScreen game={game} />
                        <span aria-hidden className="arcade-cab-deck">
                          <i className="arcade-cab-stick" />
                          <i className="arcade-cab-button" />
                          <i className="arcade-cab-button" />
                        </span>
                        <CabinetBody game={game} records={records} streak={streak} onRecover={() => streak && setRecovering(streak.game)} />
                      </article>
                    )}
                  </li>
                );
              })}
            </ul>
          </TabsPrimitive.Content>
        );
      })}
      <RestoreAllDialog
        streaks={readyNow}
        waiting={restorable.length - readyNow.length}
        open={restoringAll}
        onOpenChange={setRestoringAll}
        onRestored={(next) => (next ? replace(next) : refresh())}
      />
      {streaks && recovering ? (
        <RecoverStreakDialog
          streak={streaks[recovering]}
          open
          onOpenChange={(open) => !open && setRecovering(null)}
          onRecovered={(next) => (next ? replace(next) : refresh())}
        />
      ) : null}
    </TabsPrimitive.Root>
  );
}
