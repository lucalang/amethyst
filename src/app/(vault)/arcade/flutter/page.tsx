import type { Metadata } from "next";
import { LazyFlutter } from "@/components/arcade/lazy";
import { isRecentDailyVariant } from "@/lib/arcade-daily";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Flutter · Arcade" };

export default async function FlutterPage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "flutter")]);
  // "" is the regular record; recent daily courses keep their own.
  const bests: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "flutter") bests[""] = score;
    else if (key.startsWith("flutter:") && isRecentDailyVariant(key.slice(8))) bests[key.slice(8)] = score;
  }
  return <LazyFlutter records={bests} look={look} />;
}
