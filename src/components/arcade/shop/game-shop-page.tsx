import Link from "next/link";
import { Gamepad2, ShoppingBag, Store } from "lucide-react";
import type { CSSProperties } from "react";
import { ARCADE_CABINETS, ArcadeCover } from "@/components/arcade/previews";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { loadGameShop } from "@/lib/data/shop";
import { measureServer } from "@/lib/data/timing";
import { GAME_SHOPS, SHOP_GAMES, shopHref, type ShopGame } from "@/lib/game-cosmetics";
import { requireUser } from "@/lib/supabase/auth";
import { GameShop } from "./game-shop";

/** A game's dedicated shop as its own page, reachable from the Arcade Shop. */
export async function GameShopPage({ game }: { game: ShopGame }) {
  const ctx = await measureServer("game-shop.auth", requireUser);
  const data = await measureServer("game-shop.data", () => loadGameShop(ctx, game));
  const shop = GAME_SHOPS[game];
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title={`${shop.title} shop`}
          icon={ShoppingBag}
          tone={ARCADE_CABINETS[game].hue}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" className="h-9 px-3.5">
                <Link href={shop.href}>
                  <Gamepad2 aria-hidden />
                  Play {shop.title}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/shop/cosmetics#game-cosmetics">
                  <Store aria-hidden />
                  All game cosmetics
                </Link>
              </Button>
            </div>
          }
        />
        <section aria-label={`${shop.title} cosmetics`} className="ui-panel mb-6 grid overflow-hidden sm:grid-cols-[minmax(0,15rem)_1fr]" style={{ "--tone": ARCADE_CABINETS[game].hue } as CSSProperties}>
          <span className="block aspect-[16/9] border-b border-border sm:aspect-auto sm:min-h-36 sm:border-r sm:border-b-0">
            <ArcadeCover game={game} />
          </span>
          <div className="grid content-center gap-1 p-4">
            <p className="text-sm text-pretty text-muted-foreground">{shop.blurb}</p>
            <p className="text-xs text-muted-foreground">
              {shop.categories.reduce((sum, category) => sum + category.items.length, 0)} items in {shop.categories.length} categories: {shop.categories.map((category) => category.label).join(", ")}
            </p>
          </div>
        </section>
        <nav aria-label="Game cosmetic shops" className="-mx-1 mb-6 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {SHOP_GAMES.map((other) => (
            <Link
              key={other}
              href={shopHref(other)}
              aria-current={other === game ? "page" : undefined}
              className="ui-pill h-8 shrink-0 px-3 text-xs transition-colors hover:text-foreground aria-[current=page]:border-(--tone) aria-[current=page]:bg-(--tone)/15 aria-[current=page]:text-foreground"
              style={{ "--tone": ARCADE_CABINETS[other].hue } as CSSProperties}
            >
              {GAME_SHOPS[other].title}
            </Link>
          ))}
        </nav>
        <GameShop data={data} />
      </PageContainer>
    </EntranceScope>
  );
}
