"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import { ARCADE_CABINETS, ArcadePreview } from "@/components/arcade/previews";
import { CatalogEmpty, CatalogSearch } from "@/components/catalog/catalog-search";
import { catalogMatcher } from "@/lib/catalog-search";
import { GAME_SHOPS, SHOP_GAMES, shopHref, type ShopGame } from "@/lib/game-cosmetics";
import { cn } from "@/lib/utils";

/**
 * Every game's cosmetic shop in one place, under the main cosmetics: a search over game names, item names and
 * categories, and a compact card per game with what you own of it.
 */
export function GameCosmeticsDirectory({ owned, compact = false }: { owned: Partial<Record<ShopGame, number>>; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const match = catalogMatcher(query);
  const games = SHOP_GAMES.filter((game) => {
    if (!match) return true;
    const shop = GAME_SHOPS[game];
    return match(shop.title, shop.blurb, ...shop.categories.flatMap((category) => [category.label, ...category.items.map((item) => item.name)]));
  });

  return (
    <div className="grid gap-4">
      {compact ? null : (
        <CatalogSearch value={query} onChange={setQuery} label="Search game cosmetics" placeholder="Search games or items" />
      )}
      {games.length ? (
        <ul className={cn("grid gap-3", compact ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
          {games.map((game) => {
            const shop = GAME_SHOPS[game];
            const total = shop.categories.reduce((sum, category) => sum + category.items.length, 0);
            const have = owned[game] ?? 0;
            return (
              <li key={game} className="min-w-0">
                <Link href={shopHref(game)} className="ui-card group flex h-full flex-col" style={{ "--tone": ARCADE_CABINETS[game].hue } as CSSProperties}>
                  <span aria-hidden className={cn("ui-stage border-b border-border", compact ? "aspect-[16/9]" : "aspect-[16/7]")}>
                    <span className="block size-full">
                      <ArcadePreview game={game} />
                    </span>
                  </span>
                  <span className="flex flex-1 items-center gap-2 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold transition-colors group-hover:text-(--tone)">{shop.title}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {have ? `${have} of ${total} owned` : `${total} items`}
                      </span>
                    </span>
                    <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-(--tone) motion-reduce:transition-none" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <CatalogEmpty query={query} onReset={() => setQuery("")} />
      )}
    </div>
  );
}
