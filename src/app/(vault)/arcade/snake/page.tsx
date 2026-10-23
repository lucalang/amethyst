import type { Metadata } from "next";
import { LazySnake } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Snake · Arcade" };

export default async function SnakePage() {
  const records = await loadArcadeRecords(await requireUser());
  return <LazySnake best={records.snake ?? null} />;
}
