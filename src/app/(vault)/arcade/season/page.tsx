import type { Metadata } from "next";
import { SeasonPass } from "@/components/arcade/season-pass";
import { PageContainer } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { artworkSrc } from "@/lib/attachments";
import { loadSeasonState } from "@/lib/data/season-pass";
import { requireUser } from "@/lib/supabase/auth";
import type { FrameSample } from "../../settings/frame-settings";

export const metadata: Metadata = { title: "Season Pass" };

export default async function SeasonPassPage({ searchParams }: { searchParams: Promise<{ season?: string | string[]; tab?: string | string[] }> }) {
  const ctx = await requireUser();
  const params = await searchParams;
  const season = typeof params.season === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(params.season) ? params.season : null;
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
        <SeasonPass
          state={state}
          tab={params.tab === "quests" ? "quests" : "pass"}
          profile={{ name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null }}
          samples={{ portrait: sample("portrait"), square: sample("square") }}
        />
      </PageContainer>
    </EntranceScope>
  );
}
