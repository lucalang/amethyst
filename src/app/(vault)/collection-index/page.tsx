import type { Metadata } from "next";
import Link from "next/link";
import { Backpack } from "lucide-react";
import { CollectionIndexView } from "@/components/inventory/collection-index";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { artworkSrc } from "@/lib/attachments";
import { loadCollectionIndex } from "@/lib/data/inventory";
import { requireUser } from "@/lib/supabase/auth";
import type { FrameSample } from "../settings/frame-settings";

export const metadata: Metadata = { title: "Index" };

export default async function CollectionIndexPage({ searchParams }: { searchParams: Promise<{ item?: string | string[] }> }) {
  const ctx = await requireUser();
  const [index, { data: profile }, { data: covers }, { item }] = await Promise.all([
    loadCollectionIndex(ctx).catch(() => null),
    ctx.supabase.from("users").select("display_name, avatar_url").eq("id", ctx.userId).maybeSingle(),
    // The account's own covers to show frames on (row-level security keeps this to the account).
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
    searchParams,
  ]);
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Index"
          description="Every collectible in Amethyst: what you own, what you’re missing, and where to find it."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/inventory">
                <Backpack aria-hidden /> Inventory
              </Link>
            </Button>
          }
        />
        <CollectionIndexView
          items={index?.items ?? null}
          oddsLoaded={index?.oddsLoaded ?? true}
          initialItem={typeof item === "string" ? item : null}
          profile={{ name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null }}
          samples={{ portrait: sample("portrait"), square: sample("square") }}
        />
      </PageContainer>
    </EntranceScope>
  );
}
