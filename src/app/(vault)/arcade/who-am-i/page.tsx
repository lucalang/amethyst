import type { Metadata } from "next";
import { LazyWhoAmI } from "@/components/arcade/lazy";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Who Am I? · Arcade" };

/** Who Am I? against the bot. Real opponents play it as a Wager round (see /arcade/wagers). */
export default async function WhoAmIPage() {
  const ctx = await requireUser();
  const look = await loadGameLoadout(ctx, "who-am-i");
  return <LazyWhoAmI mode={{ kind: "bot" }} look={look} />;
}
