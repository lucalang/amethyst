import type { Metadata } from "next";
import { LazyWhoAmI } from "@/components/arcade/lazy";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Who Am I? · Arcade" };

/** Who Am I? against the bot. Real opponents play it as a Wager round (see /arcade/wagers). */
export default async function WhoAmIPage() {
  await requireUser();
  return <LazyWhoAmI mode={{ kind: "bot" }} />;
}
