import type { Metadata } from "next";
import { LazyGemChase } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Gem Chase · Arcade" };

export default async function GemChasePage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  const best = records["gem-chase"];
  return <LazyGemChase records={best === undefined ? {} : { "": best }} />;
}
