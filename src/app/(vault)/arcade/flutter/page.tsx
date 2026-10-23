import type { Metadata } from "next";
import { LazyFlutter } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Flutter · Arcade" };

export default async function FlutterPage() {
  const records = await loadArcadeRecords(await requireUser());
  return <LazyFlutter best={records.flutter ?? null} />;
}
