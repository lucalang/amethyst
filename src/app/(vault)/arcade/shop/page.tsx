import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Gamepad2, Store } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { loadPreferences } from "@/lib/data/preferences";
import { loadShop, toAvatarDecoration } from "@/lib/data/shop";
import { GAME_SHOPS, SHOP_GAMES, shopHref } from "@/lib/game-cosmetics";
import { requireUser } from "@/lib/supabase/auth";
import type { FrameSample } from "../../settings/frame-settings";
import { ShopView } from "./shop-view";

export const metadata: Metadata = { title: "Arcade shop" };

export default async function ArcadeShopPage() {
  const ctx = await requireUser();
  const [preferences, { data: profile }, { data: covers }] = await Promise.all([
    loadPreferences(ctx),
    ctx.supabase.from("users").select("display_name, avatar_url, avatar_decoration").eq("id", ctx.userId).maybeSingle(),
    // The account's own covers to try frames on (row-level security keeps this to the account).
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
  ]);
  const decoration = toAvatarDecoration(profile?.avatar_decoration);
  const shop = await loadShop(ctx, { frame: preferences.artworkFrame, decoration });
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Arcade shop"
          description="Cosmetics for your archive, paid for with coins from Arcade games. They change how things look, never how games play, and once bought they’re yours for good."
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/arcade">
                <Gamepad2 aria-hidden />
                Arcade
              </Link>
            </Button>
          }
        />
        <section aria-labelledby="game-shops-heading" className="mb-8">
          <h2 id="game-shops-heading" className="flex items-center gap-2 text-base font-semibold">
            <Store aria-hidden className="size-4 text-amethyst" />
            Game shops
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Skins, themes, effects and art styles for each game, bought with the same coins.</p>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SHOP_GAMES.map((game) => {
              const shop = GAME_SHOPS[game];
              const count = shop.categories.reduce((sum, category) => sum + category.items.length, 0);
              return (
                <li key={game}>
                  <Link
                    href={shopHref(game)}
                    className="group flex h-full items-center gap-3 rounded-xl border border-border bg-surface/40 p-3 transition-colors outline-none hover:border-amethyst/45 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-amethyst/[0.12] text-amethyst">
                      <Store className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{shop.title} shop</span>
                      <span className="block text-xs text-muted-foreground">
                        {count} items · {shop.categories.map((category) => category.label).join(", ")}
                      </span>
                    </span>
                    <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <ShopView
          shop={shop}
          frame={preferences.artworkFrame}
          decoration={decoration}
          profile={{ name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null }}
          samples={{ portrait: sample("portrait"), square: sample("square") }}
        />
      </PageContainer>
    </EntranceScope>
  );
}
