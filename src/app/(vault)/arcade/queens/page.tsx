import type { Metadata } from "next";
import { LazyQueens } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Queens · Arcade" };

export default async function QueensPage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "queens")]);
  // "" is the practice record; recent daily puzzles keep their own.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "queens") bests[""] = score;
    else if (key.startsWith("queens:") && isRecentDailyVariant(key.slice(7))) bests[key.slice(7)] = score;
  }
  return <LazyQueens records={bests} look={look} />;
}
