import type { Metadata } from "next";
import { LazyTheAscent } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "The Ascent · Arcade" };

/** The Ascent: give the most common answer, grow the beanstalk. Only a personal record is kept: no coin runs. */
export default async function TheAscentPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  const best = records["the-ascent"];
  return <LazyTheAscent records={best === undefined ? {} : { "": best }} />;
}
