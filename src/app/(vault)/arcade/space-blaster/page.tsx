import type { Metadata } from "next";
import { LazySpaceBlaster } from "@/components/arcade/lazy";
import { loadArcadeRecords } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Space Blaster · Arcade" };

export default async function SpaceBlasterPage() {
  const ctx = await requireUser();
  const [records, look] = await Promise.all([loadArcadeRecords(ctx), loadGameLoadout(ctx, "space-blaster")]);
  const best = records["space-blaster"];
  return <LazySpaceBlaster records={best === undefined ? {} : { "": best }} look={look} />;
}
