import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Award, Coins, House, Play, Store, Trophy } from "lucide-react";
import { ArcadePreview } from "@/components/arcade/previews";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { ARCADE_GAMES, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, formatDuration, type ArcadeGame, type ArcadeGameId, type ArcadeRecords } from "@/lib/arcade";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadCoinBalance } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Arcade" };

/** Each cabinet's own light and genre; layout and controls stay the same for all. */
const CABINETS: Record<ArcadeGameId, { hue: string; genre: string }> = {
  "2048": { hue: "#ffb547", genre: "Puzzle" },
  flutter: { hue: "#ff5fa8", genre: "Reflex" },
  snake: { hue: "#3fe89a", genre: "Classic" },
  sudoku: { hue: "#6aa8ff", genre: "Logic" },
  "fruit-slice": { hue: "#ff7348", genre: "Action" },
  stacker: { hue: "#b48cff", genre: "Timing" },
};

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

export default async function ArcadePage() {
  const ctx = await requireUser();
  const [records, balance] = await Promise.all([loadArcadeRecords(ctx), loadCoinBalance(ctx).catch(() => null)]);

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Arcade"
          description="Six quick games for a break. Your personal records and Sudoku progress are saved to your account."
          actions={
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href="/achievements"><Award aria-hidden />Achievements</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/"><House aria-hidden />Home</Link>
              </Button>
            </div>
          }
        />
        <Link href="/arcade/shop" prefetch={false} className="arcade-counter enter mb-6" style={{ "--enter-index": 1 } as CSSProperties}>
          <span aria-hidden className="arcade-counter-coin">
            <Coins className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {balance === null ? "Prize counter" : <>
                <span className="coin-ink tabular-nums">{balance.toLocaleString("en")}</span> coin{balance === 1 ? "" : "s"} to spend
              </>}
            </span>
            <span className="block text-xs text-pretty text-muted-foreground">Good runs earn coins. Trade them for artwork frames and avatar decorations in the shop.</span>
          </span>
          <span className="arcade-counter-cta">
            <Store aria-hidden className="size-4" />
            <span className="hidden sm:inline">Visit the shop</span>
            <span className="sm:hidden">Shop</span>
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </Link>
        <ul aria-label="Games" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ARCADE_GAMES.map((game, index) => {
            const cabinet = CABINETS[game.id];
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
      </PageContainer>
    </EntranceScope>
  );
}
