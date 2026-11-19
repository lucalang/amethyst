import type { Metadata } from "next";
import { LazySumbreak } from "@/components/arcade/lazy";
import { puzzleBests } from "@/lib/arcade";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Sumbreak · Arcade" };

export default async function SumbreakPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  // The highest level and recent daily scores; the older practice scores aren't levels and stay out.
  const bests = puzzleBests("sumbreak", records);
  return <LazySumbreak records={bests} userId={ctx.userId} />;
}
