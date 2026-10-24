import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { loadPreferences } from "@/lib/data/preferences";
import { loadShop, toAvatarDecoration } from "@/lib/data/shop";
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
