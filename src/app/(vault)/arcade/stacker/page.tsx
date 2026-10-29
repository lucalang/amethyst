import type { Metadata } from "next";
import { LazyStacker } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Tower Stacker · Arcade" };

export default async function StackerPage() {
  const records = await loadArcadeRecords(await requireUser());
  // "" is Casual (the original rules), "classic" the strict rules; recent daily towers keep their own.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "stacker") bests[""] = score;
    else if (key === "stacker:classic") bests.classic = score;
    else if (key.startsWith("stacker:") && isRecentDailyVariant(key.slice(8))) bests[key.slice(8)] = score;
  }
  return <LazyStacker records={bests} />;
}
