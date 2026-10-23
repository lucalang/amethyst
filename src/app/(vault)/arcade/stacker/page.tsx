import type { Metadata } from "next";
import { LazyStacker } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Tower Stacker · Arcade" };

export default async function StackerPage() {
  const records = await loadArcadeRecords(await requireUser());
  return <LazyStacker best={records.stacker ?? null} />;
}
