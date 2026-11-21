import type { Metadata } from "next";
import { LazyGuessThePrice } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Guess the Price · Arcade" };

/** Guess the Price. Rounds are dealt and scored by /api/arcade/guess-the/price, so answers never ship before a guess. */
export default async function GuessThePricePage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  return <LazyGuessThePrice best={records["guess-the:price"] ?? null} />;
}
