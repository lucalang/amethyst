import type { Metadata } from "next";
import { LazyFruit } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Fruit Slice · Arcade" };

export default async function FruitSlicePage() {
  const records = await loadArcadeRecords(await requireUser());
  // "" is Classic; Arcade, Zen and recent daily challenges keep their own records.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "fruit-slice") bests[""] = score;
    else if (key === "fruit-slice:arcade" || key === "fruit-slice:zen") bests[key.slice(12)] = score;
    else if (key.startsWith("fruit-slice:") && isRecentDailyVariant(key.slice(12))) bests[key.slice(12)] = score;
  }
  return <LazyFruit records={bests} />;
}
