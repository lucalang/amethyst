import type { Metadata } from "next";
import { LazyGuessThe } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { GUESS_THE_MODES } from "@/lib/minigames/guess-the";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Guess The ... · Arcade" };

/** Guess The ...: pick a mode. Each mode keeps its own personal record (no coin runs). */
export default async function GuessThePage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  const bests: Record<string, number> = {};
  for (const mode of GUESS_THE_MODES) {
    const best = records[`guess-the:${mode.id}`];
    if (best !== undefined) bests[mode.id] = best;
  }
  return <LazyGuessThe records={bests} />;
}
