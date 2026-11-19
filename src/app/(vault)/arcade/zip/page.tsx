import type { Metadata } from "next";
import { LazyZip } from "@/components/arcade/lazy";
import { puzzleBests } from "@/lib/arcade";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Zip · Arcade" };

export default async function ZipPage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "zip")]);
  // The highest level and recent daily scores; the older practice scores aren't levels and stay out.
  const bests = puzzleBests("zip", records);
  return <LazyZip records={bests} look={look} userId={ctx.userId} />;
}
