import type { Metadata } from "next";
import { Lazy2048 } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "2048 · Arcade" };

export default async function Game2048Page() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "2048")]);
  // "" is the classic 4×4 record; other sizes and recent daily challenges keep their own.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "2048") bests[""] = score;
    else if (key.startsWith("2048:")) {
      const variant = key.slice(5);
      if (!variant.startsWith("daily-") || isRecentDailyVariant(variant)) bests[variant] = score;
    }
  }
  return <Lazy2048 records={bests} userId={ctx.userId} look={look} />;
}
