import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Backpack, Clover, Coins, Gamepad2, Palette, Store } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { CaseArt } from "@/components/lootboxes/parts";
import { Button } from "@/components/ui/button";
import { loadLootState } from "@/lib/data/inventory";
import { lootCaseInfo } from "@/lib/lootboxes";
import { boostedOpenings } from "@/lib/boosters";
import { loadCoinBalance } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Shop" };

/** Shop home: where Coins are spent, split into Cosmetics, Cases and Boosters. */
export default async function ShopPage() {
  const ctx = await requireUser();
  const [balance, loot] = await Promise.all([loadCoinBalance(ctx).catch(() => null), loadLootState(ctx).catch(() => null)]);
  const owned = loot ? loot.cases.reduce((sum, lootCase) => sum + lootCase.quantity, 0) : 0;
  const onSale = loot?.cases.filter((lootCase) => lootCase.available) ?? [];
  const boosted = loot ? boostedOpenings(loot.boost) : 0;
  const departments = [
    {
      href: "/shop/cosmetics",
      title: "Cosmetics",
      tagline: "Profile, artwork and game looks.",
      accent: "#a855f7",
      art: <Palette className="size-16 text-(--tone) drop-shadow-[0_0_18px_var(--tone)]" strokeWidth={1.5} />,
      meta: null,
    },
    {
      href: "/shop/cases",
      title: "Cases",
      tagline: "A random cosmetic in every case.",
      accent: lootCaseInfo(onSale[0]?.id ?? "release").glow,
      art: <CaseArt id={onSale[0]?.id ?? "release"} size="6rem" />,
      meta: `${onSale.length} on sale${owned ? ` · ${owned.toLocaleString("en")} owned` : ""}`,
    },
    {
      href: "/shop/boosters",
      title: "Luck Boosters",
      tagline: "Better odds for your next 10 cases.",
      accent: "#22c55e",
      art: <Clover className="size-16 text-(--tone) drop-shadow-[0_0_18px_var(--tone)]" strokeWidth={1.5} />,
      meta: boosted > 0 ? `Next ${boosted.toLocaleString("en")} openings boosted` : null,
    },
  ];

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Shop"
          icon={Store}
          description="Spend the Coins you earn in the Arcade on cosmetics, cases and Luck Boosters."
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

        <ul className="grid gap-4 md:grid-cols-3">
          {departments.map((department, index) => (
            <li key={department.href} className="enter" style={{ "--enter-index": index + 2 } as CSSProperties}>
              <Link href={department.href} className="ui-card group flex h-full flex-col" style={{ "--tone": department.accent } as CSSProperties}>
                <span aria-hidden className="ui-stage h-40 border-b border-border">
                  {department.art}
                </span>
                <span className="flex items-center justify-between gap-3 px-5 pt-4">
                  <span className="text-lg font-semibold transition-colors group-hover:text-(--tone)">{department.title}</span>
                  <span aria-hidden className="ui-icon ui-icon-sm">
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                  </span>
                </span>
                <span className="px-5 pt-1 text-sm text-pretty text-muted-foreground">{department.tagline}</span>
                <span className="flex min-h-12 items-end px-5 pt-3 pb-4">
                  {department.meta ? (
                    <span className="ui-pill" data-tone>
                      <span aria-hidden className="ui-dot" />
                      {department.meta}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PageContainer>
    </EntranceScope>
  );
}
