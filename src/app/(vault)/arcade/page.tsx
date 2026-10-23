import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { House, Play, Trophy } from "lucide-react";
import { ArcadePreview } from "@/components/arcade/previews";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { ARCADE_GAMES, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, formatDuration, type ArcadeGame, type ArcadeRecords } from "@/lib/arcade";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Arcade" };

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
  const records = await loadArcadeRecords(await requireUser());

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Arcade"
          description="Six quick games for a break. Your personal records and Sudoku progress are saved to your account."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <House aria-hidden />
                Home
              </Link>
            </Button>
          }
        />
        <ul aria-label="Games" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ARCADE_GAMES.map((game, index) => (
            <li key={game.id} className="enter min-w-0" style={{ "--enter-index": index + 1 } as CSSProperties}>
              <article className="group/tile flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-surface/40 transition-colors hover:border-amethyst/40">
                <Link href={game.href} prefetch={false} tabIndex={-1} aria-hidden className="block aspect-[16/10] overflow-hidden border-b border-white/[0.06]">
                  <span className="block size-full transition-[scale] duration-500 group-hover/tile:scale-[1.03]">
                    <ArcadePreview game={game.id} />
                  </span>
                </Link>
                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight">{game.title}</h2>
                    <p className="mt-1 text-sm text-pretty text-muted-foreground">{game.blurb}</p>
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-1.5 text-xs text-muted-foreground">
                      <Trophy aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amethyst" />
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
          ))}
        </ul>
      </PageContainer>
    </EntranceScope>
  );
}
