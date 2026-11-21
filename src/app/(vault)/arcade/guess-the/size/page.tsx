import type { Metadata } from "next";
import { LazyGuessTheSize } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Guess the Real Size · Arcade" };

/** Guess the Real Size. Rounds are dealt and scored by /api/arcade/guess-the/size, so answers never ship before a guess. */
export default async function GuessTheSizePage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  return <LazyGuessTheSize best={records["guess-the:size"] ?? null} />;
}
