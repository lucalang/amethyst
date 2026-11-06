import type { Metadata } from "next";
import { LazyZip } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Zip · Arcade" };

export default async function ZipPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  // "" is the practice record; recent daily puzzles keep their own.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "zip") bests[""] = score;
    else if (key.startsWith("zip:") && isRecentDailyVariant(key.slice(4))) bests[key.slice(4)] = score;
  }
  return <LazyZip records={bests} />;
}
