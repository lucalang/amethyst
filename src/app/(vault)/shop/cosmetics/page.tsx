import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2, Package, Palette, Store } from "lucide-react";
import { GameCosmeticsDirectory } from "@/components/arcade/shop/game-cosmetics-directory";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { loadPreferences } from "@/lib/data/preferences";
import { loadShop, toAvatarDecoration } from "@/lib/data/shop";
import { measureServer } from "@/lib/data/timing";
import { gameCosmetic, type ShopGame } from "@/lib/game-cosmetics";
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
  const [preferences, { data: profile }, { data: covers }, shop, { data: ownedRows }] = await Promise.all([
    preferenceRead,
    profileRead,
    // The account's own covers to try frames on (row-level security keeps this to the account).
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
    measureServer("shop.data", () => loadShop(ctx, equipped)),
    // What the account owns of each game's cosmetics, for the Game Cosmetics directory.
    ctx.supabase.from("user_cosmetics").select("item_id").eq("user_id", ctx.userId),
  ]);
  const ownedPerGame: Partial<Record<ShopGame, number>> = {};
  for (const row of ownedRows ?? []) {
    const game = gameCosmetic(row.item_id)?.game;
    if (game) ownedPerGame[game] = (ownedPerGame[game] ?? 0) + 1;
  }
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
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="h-9 px-3">
                <a href="#game-cosmetics">
                  <Gamepad2 aria-hidden />
                  Game Cosmetics
                </a>
              </Button>
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
        <ShopView
          shop={shop}
          frame={preferences.artworkFrame}
          decoration={decoration}
          banner={toProfileBanner(profile?.profile_banner)}
          profileFrame={toProfileFrame(profile?.profile_frame)}
          profile={{ name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null }}
          samples={{ portrait: sample("portrait"), square: sample("square") }}
        />
        <section id="game-cosmetics" aria-labelledby="game-cosmetics-heading" className="mt-12 scroll-mt-24 border-t border-border pt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="game-cosmetics-heading" className="text-xl font-bold tracking-tight">
                Game Cosmetics
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">Skins, boards and effects for each Arcade game, each in its own shop with a live preview.</p>
            </div>
          </div>
          <GameCosmeticsDirectory owned={ownedPerGame} />
        </section>
      </PageContainer>
    </EntranceScope>
  );
}
