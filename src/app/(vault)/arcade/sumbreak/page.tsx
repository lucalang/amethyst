import type { Metadata } from "next";
import { LazySumbreak } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { SUMBREAK_LEVEL_VARIANTS } from "@/lib/minigames/sumbreak";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Sumbreak · Arcade" };

export default async function SumbreakPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  // "" is Medium practice; Easy, Hard and recent daily puzzles keep their own records.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "sumbreak") bests[""] = score;
    else if (key.startsWith("sumbreak:")) {
      const variant = key.slice(9);
      if (SUMBREAK_LEVEL_VARIANTS.includes(variant) || isRecentDailyVariant(variant)) bests[variant] = score;
    }
  }
  return <LazySumbreak records={bests} />;
}
