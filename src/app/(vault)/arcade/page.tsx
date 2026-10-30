import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Award, Coins, House, Store } from "lucide-react";
import { ArcadeGames } from "@/components/arcade/arcade-games";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadCoinBalance } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Arcade" };

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
        <ArcadeGames records={records} />
      </PageContainer>
    </EntranceScope>
  );
}
