import type { Metadata } from "next";
import { InventoryView } from "@/components/inventory/inventory-view";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { CaseShelf } from "@/components/lootboxes/case-shelf";
import { artworkSrc } from "@/lib/attachments";
import { loadInventory, loadLootState } from "@/lib/data/inventory";
import { requireUser } from "@/lib/supabase/auth";
import type { FrameSample } from "../settings/frame-settings";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage() {
  const ctx = await requireUser();
  const [items, loot, { data: profile }, { data: covers }] = await Promise.all([
    loadInventory(ctx).catch(() => null),
    loadLootState(ctx).catch(() => null),
    ctx.supabase.from("users").select("display_name, avatar_url").eq("id", ctx.userId).maybeSingle(),
    // The account's own covers to show frames on (row-level security keeps this to the account).
    ctx.supabase.from("entries").select("title, cover_url, cover_shape").not("cover_url", "is", null).order("updated_at", { ascending: false }).limit(40),
  ]);
  const sample = (shape: "portrait" | "square"): FrameSample | null => {
    const row = (covers ?? []).find((cover) => cover.cover_shape === shape && artworkSrc(cover.cover_url));
    return row?.cover_url ? { title: row.title, coverUrl: row.cover_url } : null;
  };
  const artProfile = { name: profile?.display_name?.trim() || null, avatarUrl: profile?.avatar_url ?? null };
  const samples = { portrait: sample("portrait"), square: sample("square") };
  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader title="Inventory" description="Everything you’ve bought, earned or unlocked, in one place." />
        <CaseShelf state={loot} profile={artProfile} samples={samples} />
        <InventoryView items={items} profile={artProfile} samples={samples} />
      </PageContainer>
    </EntranceScope>
  );
}
