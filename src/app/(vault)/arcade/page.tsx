import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Cherry, ChevronRight, Coins, House, Medal, Store, Trophy } from "lucide-react";
import { ArcadeGames } from "@/components/arcade/arcade-games";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { dailyDate } from "@/lib/arcade-daily";
import { loadArcadeRecords, loadArcadeStreaks } from "@/lib/data/arcade";
import { loadCoinBalance } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Arcade" };

export default async function ArcadePage() {
  const ctx = await requireUser();
  const [records, balance, streaks] = await Promise.all([
    loadArcadeRecords(ctx),
    loadCoinBalance(ctx).catch(() => null),
    loadArcadeStreaks(ctx).catch(() => null),
  ]);

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Arcade"
          description="Quick games and daily puzzles for a break. Your personal records and Sudoku progress are saved to your account."
          actions={
            <div className="flex items-center gap-2">
              <Link href="/achievements" className="arcade-trophy-door">
                <span aria-hidden className="arcade-trophy-door-sweep" />
                <span aria-hidden className="arcade-trophy-door-medal">
                  <Trophy className="size-3" />
                </span>
                Achievements
                <ChevronRight aria-hidden className="arcade-trophy-door-arrow size-3.5" />
              </Link>
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/"><House aria-hidden />Home</Link>
              </Button>
            </div>
          }
        />
        <Link href="/shop" prefetch={false} className="arcade-counter enter mb-6" style={{ "--enter-index": 1 } as CSSProperties}>
          <span aria-hidden className="arcade-counter-coin">
            <Coins className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {balance === null ? "Prize counter" : <>
                <span className="coin-ink tabular-nums">{balance.toLocaleString("en")}</span> coin{balance === 1 ? "" : "s"} to spend
              </>}
            </span>
          </span>
          <span className="arcade-counter-cta">
            <Store aria-hidden className="size-4" />
            <span className="hidden sm:inline">Visit the shop</span>
            <span className="sm:hidden">Shop</span>
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </Link>
        <Link href="/arcade/slots" className="arcade-counter enter mb-6" style={{ "--enter-index": 2 } as CSSProperties}>
          <span aria-hidden className="arcade-counter-coin">
            <Cherry className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Coin Slots</span>
            <span className="block text-xs text-pretty text-muted-foreground">Spin the reels with coins you’ve earned. Exact odds on the machine, small bets and a daily limit.</span>
          </span>
          <span className="arcade-counter-cta">
            Play
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </Link>
        <Link href="/arcade/leaderboards" prefetch={false} className="arcade-counter enter mb-6" style={{ "--enter-index": 3 } as CSSProperties}>
          <span aria-hidden className="arcade-counter-coin">
            <Medal className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Leaderboards</span>
            <span className="block text-xs text-pretty text-muted-foreground">See how your best runs rank against other players in every game.</span>
          </span>
          <span className="arcade-counter-cta">
            View
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </Link>
        <ArcadeGames records={records} streaks={streaks ? { date: dailyDate(), streaks } : null} />
      </PageContainer>
    </EntranceScope>
  );
}
