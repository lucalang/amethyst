import type { Metadata } from "next";
import { LazyFruit } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Fruit Slice · Arcade" };

export default async function FruitSlicePage() {
  const records = await loadArcadeRecords(await requireUser());
  return <LazyFruit best={records["fruit-slice"] ?? null} />;
}
