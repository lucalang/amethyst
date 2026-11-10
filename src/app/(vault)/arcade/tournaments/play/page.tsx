import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CompetitivePlay } from "@/components/arcade/competitive-play";
import { isCompetitiveGame } from "@/lib/competitive";
import { loadCompetitivePlay, loadTournamentState } from "@/lib/data/competitive";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Daily Tournament · Arcade" };

export default async function TournamentPlayPage() {
  const ctx = await requireUser();
  const state = await loadTournamentState(ctx, null).catch(() => null);
  const t = state?.tournament;
  if (!t || t.status !== "active" || !isCompetitiveGame(t.game)) redirect("/arcade/tournaments");
  const { records, look } = await loadCompetitivePlay(ctx, t.game);
  return (
    <CompetitivePlay
      target={{ kind: "tournament", tournament: t.id }}
      game={t.game}
      board={t.board}
      records={records}
      look={look}
      userId={ctx.userId}
      detail="Your best run counts until 24:00 UTC"
    />
  );
}
