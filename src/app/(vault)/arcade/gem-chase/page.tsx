import type { Metadata } from "next";
import { LazyGemChase } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Gem Chase · Arcade" };

export default async function GemChasePage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "gem-chase")]);
  const best = records["gem-chase"];
  return <LazyGemChase records={best === undefined ? {} : { "": best }} look={look} />;
}
