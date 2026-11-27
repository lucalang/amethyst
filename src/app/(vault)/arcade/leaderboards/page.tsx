import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Medal } from "lucide-react";
import { LeaderboardView } from "@/components/arcade/leaderboard-view";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { EntranceScope } from "@/components/layout/entrance-scope";
import { Button } from "@/components/ui/button";
import { LEADERBOARD_GAMES, LEADERBOARD_GAME_IDS, isLeaderboardBoard } from "@/lib/leaderboards";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Leaderboards" };

export default async function LeaderboardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireUser();
  const params = await searchParams;
  const asked = typeof params.game === "string" ? params.game : "";
  const game = LEADERBOARD_GAME_IDS.find((id) => id === asked) ?? LEADERBOARD_GAME_IDS[0];
  const askedBoard = typeof params.board === "string" ? params.board : "";
  // Single-puzzle boards only exist for Wagers; the page lists the ranked boards.
  const hidden = LEADERBOARD_GAMES[game].matchBoards?.some((option) => option.id === askedBoard) ?? false;
  const board = isLeaderboardBoard(game, askedBoard) && !hidden ? askedBoard : LEADERBOARD_GAMES[game].boards[0].id;

  return (
    <EntranceScope>
      <PageContainer>
        <PageHeader
          title="Leaderboards"
          description="The best verified runs in every Arcade game, plus top scores in The Descent and The Ascent and most wins in Front Wars."
          icon={Medal}
          tone="#38bdf8"
          actions={
            <Button asChild variant="outline" size="sm" className="h-9 px-3">
              <Link href="/arcade"><ArrowLeft aria-hidden />Arcade</Link>
            </Button>
          }
        />
        <LeaderboardView key={`${game}|${board}`} game={game} board={board} />
      </PageContainer>
    </EntranceScope>
  );
}
