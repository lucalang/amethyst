import type { Metadata } from "next";
import { LazyFrontWars } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Front Wars · Arcade" };

/** A solo match against bot nations. Only a personal record is kept: no coin runs, leaderboards or Wagers. */
export default async function FrontWarsPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  const best = records["front-wars"];
  return <LazyFrontWars records={best === undefined ? {} : { "": best }} />;
}
