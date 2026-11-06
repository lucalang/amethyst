import Link from "next/link";
import { Gamepad2, ShoppingBag, Store } from "lucide-react";
import { ARCADE_CABINETS } from "@/components/arcade/previews";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { loadGameShop } from "@/lib/data/shop";
import { measureServer } from "@/lib/data/timing";
import { GAME_SHOPS, type ShopGame } from "@/lib/game-cosmetics";
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
                <Link href="/shop/cosmetics">
                  <Store aria-hidden />
                  Shop
                </Link>
              </Button>
            </div>
          }
        />
        <GameShop data={data} />
      </PageContainer>
    </EntranceScope>
  );
}
