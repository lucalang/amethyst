import type { Metadata } from "next";
import { LazyGuessTheChart } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Guess the Chart · Arcade" };

/** Guess the Chart. Charts are dealt and scored by /api/arcade/guess-the/chart, so the hidden years never ship early. */
export default async function GuessTheChartPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  return <LazyGuessTheChart best={records["guess-the:chart"] ?? null} />;
}
