import Link from "next/link";
import { Gamepad2, Store } from "lucide-react";
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
          description={`${shop.blurb} Cosmetics only change how the game looks, never how it plays.`}
          actions={
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href={shop.href}>
                  <Gamepad2 aria-hidden />
                  Play {shop.title}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/arcade/shop">
                  <Store aria-hidden />
                  Arcade Shop
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
