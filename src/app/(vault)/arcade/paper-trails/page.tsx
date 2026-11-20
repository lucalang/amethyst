import type { Metadata } from "next";
import { LazyPaperTrails } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Paper Trails · Arcade" };

export default async function PaperTrailsPage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "paper-trails")]);
  const best = records["paper-trails"];
  return <LazyPaperTrails records={best === undefined ? {} : { "": best }} look={look} />;
}
