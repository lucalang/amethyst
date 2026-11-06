import type { Metadata } from "next";
import { LazyPatches } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Patches · Arcade" };

export default async function PatchesPage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "patches")]);
  // "" is the practice record; recent daily puzzles keep their own.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "patches") bests[""] = score;
    else if (key.startsWith("patches:") && isRecentDailyVariant(key.slice(8))) bests[key.slice(8)] = score;
  }
  return <LazyPatches records={bests} look={look} />;
}
