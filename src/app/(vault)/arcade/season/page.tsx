import type { Metadata } from "next";
import Link from "next/link";
import { Gamepad2 } from "lucide-react";
import { SeasonPass } from "@/components/arcade/season-pass";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { loadSeasonState } from "@/lib/data/season-pass";
import { requireUser } from "@/lib/supabase/auth";
import type { FrameSample } from "../../settings/frame-settings";

export const metadata: Metadata = { title: "Season Pass" };

export default async function SeasonPassPage({ searchParams }: { searchParams: Promise<{ season?: string | string[] }> }) {
  const ctx = await requireUser();
  const requested = (await searchParams).season;
  const season = typeof requested === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(requested) ? requested : null;
  const [state, { data: profile }, { data: covers }] = await Promise.all([
    loadSeasonState(ctx, season).catch(() => null),
    ctx.supabase.from("users").select("display_name, avatar_url").eq("id", ctx.userId).maybeSingle(),
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
  ]);
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Season Pass"
          description="Quests reward Season XP and coins. Season XP climbs the reward track, where every tier unlocks cosmetics."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/arcade">
                <Gamepad2 aria-hidden /> Arcade
              </Link>
            </Button>
          }
        />
        <SeasonPass
          state={state}
          profile={{ name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null }}
          samples={{ portrait: sample("portrait"), square: sample("square") }}
        />
      </PageContainer>
    </EntranceScope>
  );
}
