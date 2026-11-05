import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeaderboardView } from "@/components/arcade/leaderboard-view";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import type { ArcadeGameId } from "@/lib/arcade";
import { LEADERBOARD_GAMES, LEADERBOARD_GAME_IDS, isLeaderboardBoard } from "@/lib/leaderboards";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Leaderboards" };

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const asked = typeof params.game === "string" ? params.game : "";
  const game: ArcadeGameId = LEADERBOARD_GAME_IDS.find((id) => id === asked) ?? LEADERBOARD_GAME_IDS[0];
  const askedBoard = typeof params.board === "string" ? params.board : "";
  const board = isLeaderboardBoard(game, askedBoard) ? askedBoard : LEADERBOARD_GAMES[game].boards[0].id;

  return (
    <PageContainer>
      <PageHeader
        title="Leaderboards"
        description="The best verified runs in every Arcade game."
        actions={
          <Button asChild variant="outline" size="sm" className="h-9 px-3">
            <Link href="/arcade"><ArrowLeft aria-hidden />Arcade</Link>
          </Button>
        }
      />
      <LeaderboardView key={`${game}|${board}`} game={game} board={board} />
    </PageContainer>
  );
}
