import type { Metadata } from "next";
import { LazySnake } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Snake · Arcade" };

export default async function SnakePage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "snake")]);
  const snake: Record<string, number> = {};
  for (const [key, score] of Object.entries(records)) {
    if (score === undefined) continue;
    if (key === "snake") snake[""] = score;
    else if (key.startsWith("snake:")) snake[key.slice(6)] = score;
  }
  return <LazySnake records={snake} look={look} />;
}
