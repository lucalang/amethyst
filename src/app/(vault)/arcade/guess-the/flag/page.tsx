import type { Metadata } from "next";
import { LazyGuessTheFlag } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Guess the Flag · Arcade" };

/** Guess the Flag. Rounds are dealt and scored by /api/arcade/guess-the/flag, so answers never ship before a guess. */
export default async function GuessTheFlagPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  return <LazyGuessTheFlag best={records["guess-the:flag"] ?? null} />;
}
