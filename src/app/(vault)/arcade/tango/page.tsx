import type { Metadata } from "next";
import { LazyTango } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Tango · Arcade" };

export default async function TangoPage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "tango")]);
  // "" is the practice record; recent daily puzzles keep their own.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "tango") bests[""] = score;
    else if (key.startsWith("tango:") && isRecentDailyVariant(key.slice(6))) bests[key.slice(6)] = score;
  }
  return <LazyTango records={bests} look={look} />;
}
