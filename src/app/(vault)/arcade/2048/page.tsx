import type { Metadata } from "next";
import { Lazy2048 } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "2048 · Arcade" };

export default async function Game2048Page() {
  const records = await loadArcadeRecords(await requireUser());
  return <Lazy2048 best={records["2048"] ?? null} />;
}
