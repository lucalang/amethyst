import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Backpack, Clover, Coins, Gamepad2, Palette } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { CaseArt } from "@/components/lootboxes/parts";
import { Button } from "@/components/ui/button";
import { loadLootState } from "@/lib/data/inventory";
import { loadCoinBalance } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Shop" };

const CARD =
  "group flex h-full flex-col gap-4 rounded-2xl border border-border bg-surface/40 p-5 transition-[border-color,background-color,translate] duration-200 outline-none hover:-translate-y-0.5 hover:border-amethyst/50 hover:bg-surface/65 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** Shop home: where Coins are spent, split into Cosmetics, Cases and Boosters. */
export default async function ShopPage() {
  const ctx = await requireUser();
  const [balance, loot] = await Promise.all([loadCoinBalance(ctx).catch(() => null), loadLootState(ctx).catch(() => null)]);
  const owned = loot ? loot.cases.reduce((sum, lootCase) => sum + lootCase.quantity, 0) : 0;
  const onSale = loot?.cases.filter((lootCase) => lootCase.available) ?? [];

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Shop"
          description="Spend the Coins you earn in the Arcade on cosmetics and cases."
          actions={
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/inventory">
                  <Backpack aria-hidden />
                  Inventory
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/arcade">
                  <Gamepad2 aria-hidden />
                  Earn Coins
                </Link>
              </Button>
            </div>
          }
        />
        <section aria-label="Coin balance" className="arcade-counter enter mb-6" style={{ "--enter-index": 1 } as CSSProperties}>
          <span aria-hidden className="arcade-counter-coin">
            <Coins className="size-5" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {balance === null ? (
              "Your balance couldn’t be loaded"
            ) : (
              <>
                <span className="coin-ink tabular-nums">{balance.toLocaleString("en")}</span> coin{balance === 1 ? "" : "s"} to spend
              </>
            )}
          </span>
        </section>

        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <li className="enter" style={{ "--enter-index": 2 } as CSSProperties}>
            <Link href="/shop/cosmetics" className={CARD}>
              <span className="flex items-center gap-3">
                <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-amethyst/15 text-amethyst">
                  <Palette className="size-5" />
                </span>
                <span className="text-lg font-semibold">Cosmetics</span>
              </span>
              <span className="text-sm leading-6 text-pretty text-muted-foreground">
                Profile and artwork cosmetics, plus each game’s own shop of looks. Preview items before you buy.
              </span>
              <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-amethyst">
                Browse cosmetics
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </span>
            </Link>
          </li>
          <li className="enter" style={{ "--enter-index": 3 } as CSSProperties}>
            <Link href="/shop/cases" className={CARD}>
              <span className="flex items-center gap-3">
                <CaseArt id={onSale[0]?.id ?? "release"} size="2.75rem" />
                <span className="text-lg font-semibold">Cases</span>
              </span>
              <span className="text-sm leading-6 text-pretty text-muted-foreground">
                Buy cases and open them in your Inventory for a random cosmetic. Exact odds and duplicate refunds are listed for every case.
              </span>
              <span className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1 font-medium text-amethyst">
                  Browse cases
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </span>
                <span className="text-xs text-muted-foreground">
                  {onSale.length} on sale{owned ? ` · ${owned.toLocaleString("en")} owned` : ""}
                </span>
              </span>
            </Link>
          </li>
          <li className="enter" style={{ "--enter-index": 4 } as CSSProperties}>
            <Link href="/shop/boosters" className={CARD}>
              <span className="flex items-center gap-3">
                <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-emerald-500/15 text-emerald-500">
                  <Clover className="size-5" />
                </span>
                <span className="text-lg font-semibold">Boosters</span>
              </span>
              <span className="text-sm leading-6 text-pretty text-muted-foreground">
                Premium 2x, 5x and 10x Luck charges that raise the chance of rarer rarities in your next case openings. They never guarantee a reward.
              </span>
              <span className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="inline-flex items-center gap-1 font-medium text-amethyst">
                  Browse boosters
                  <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </span>
                {loot && loot.boost.luck > 1 ? <span className="text-xs text-muted-foreground">{loot.boost.luck}x luck active</span> : null}
              </span>
            </Link>
          </li>
        </ul>
      </PageContainer>
    </EntranceScope>
  );
}
