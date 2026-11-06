import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Package, Palette, Store } from "lucide-react";
import { ARCADE_CABINETS, ArcadePreview } from "@/components/arcade/previews";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { loadPreferences } from "@/lib/data/preferences";
import { loadShop, toAvatarDecoration } from "@/lib/data/shop";
import { measureServer } from "@/lib/data/timing";
import { GAME_SHOPS, SHOP_GAMES, shopHref } from "@/lib/game-cosmetics";
import { toProfileBanner, toProfileFrame } from "@/lib/profile-cosmetics";
import { requireUser } from "@/lib/supabase/auth";
import type { FrameSample } from "../../settings/frame-settings";
import { ShopView } from "./shop-view";

export const metadata: Metadata = { title: "Cosmetics · Shop" };

export default async function CosmeticsShopPage() {
  const ctx = await measureServer("shop.auth", requireUser);
  const preferenceRead = measureServer("shop.preferences", () => loadPreferences(ctx));
  const profileRead = measureServer("shop.profile", () => ctx.supabase.from("users").select("display_name, avatar_url, avatar_decoration, profile_banner, profile_frame").eq("id", ctx.userId).maybeSingle());
  const equipped = Promise.all([preferenceRead, profileRead]).then(([preferences, { data: profile }]) => ({
    frame: preferences.artworkFrame,
    decoration: toAvatarDecoration(profile?.avatar_decoration),
    banner: profile?.profile_banner ?? null,
    profileFrame: profile?.profile_frame ?? null,
  }));
  const [preferences, { data: profile }, { data: covers }, shop] = await Promise.all([
    preferenceRead,
    profileRead,
    // The account's own covers to try frames on (row-level security keeps this to the account).
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
    measureServer("shop.data", () => loadShop(ctx, equipped)),
  ]);
  const decoration = toAvatarDecoration(profile?.avatar_decoration);
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Cosmetics"
          icon={Palette}
          tone="#a855f7"
          actions={
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/shop/cases">
                  <Package aria-hidden />
                  Cases
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <Link href="/shop">
                  <Store aria-hidden />
                  Shop
                </Link>
              </Button>
            </div>
          }
        />
        <section aria-labelledby="game-shops-heading" className="mb-8">
          <h2 id="game-shops-heading" className="flex items-center gap-2.5 text-base font-semibold">
            <span aria-hidden className="ui-icon ui-icon-sm">
              <Store className="size-4" />
            </span>
            Game shops
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SHOP_GAMES.map((game, index) => {
              const shop = GAME_SHOPS[game];
              const count = shop.categories.reduce((sum, category) => sum + category.items.length, 0);
              return (
                <li key={game} className="enter" style={{ "--enter-index": index + 1 } as CSSProperties}>
                  <Link href={shopHref(game)} className="ui-card group flex h-full flex-col" style={{ "--tone": ARCADE_CABINETS[game].hue } as CSSProperties}>
                    <span aria-hidden className="ui-stage aspect-[16/6] border-b border-border">
                      <span className="block size-full">
                        <ArcadePreview game={game} />
                      </span>
                      <span className="absolute inset-0 bg-linear-to-t from-(--tone)/30 via-transparent to-transparent" />
                    </span>
                    <span className="flex flex-1 items-center gap-3 p-3.5">
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground transition-colors group-hover:text-(--tone)">
                          <span aria-hidden className="ui-dot" />
                          {shop.title} shop
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {count} items · {shop.categories.map((category) => category.label).join(", ")}
                        </span>
                      </span>
                      <span className="ui-pill shrink-0 transition-colors group-hover:text-foreground" data-tone>
                        Browse
                        <ArrowRight aria-hidden className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                      </span>
                    </span>
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
          banner={toProfileBanner(profile?.profile_banner)}
          profileFrame={toProfileFrame(profile?.profile_frame)}
          profile={{ name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null }}
          samples={{ portrait: sample("portrait"), square: sample("square") }}
        />
      </PageContainer>
    </EntranceScope>
  );
}
