import type { Metadata } from "next";
import { LazyBlankAtlas } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Blank Atlas · Arcade" };

/** Seven questions, seven stops. Only a personal record is kept: no coin runs, leaderboards or Wagers. */
export default async function BlankAtlasPage() {
  const ctx = await requireUser();
  const records = await loadArcadeRecords(ctx);
  const best = records["blank-atlas"];
  return <LazyBlankAtlas records={best === undefined ? {} : { "": best }} />;
}
