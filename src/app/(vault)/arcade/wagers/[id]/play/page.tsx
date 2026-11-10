import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CompetitivePlay } from "@/components/arcade/competitive-play";
import { GAME_SETTINGS, isCompetitiveGame } from "@/lib/competitive";
import { loadSudoku } from "@/lib/data/arcade";
import { loadCompetitivePlay, loadWagerState } from "@/lib/data/competitive";
import type { SudokuSize } from "@/lib/sudoku";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Wager round · Arcade" };

type Props = { params: Promise<{ id: string }> };

export default async function WagerPlayPage({ params }: Props) {
  const ctx = await requireUser();
  const { id } = await params;
  const state = await loadWagerState(ctx, id);
  const round = state?.status === "active" && state.you ? state.rounds.find((r) => r.round === state.currentRound && !r.outcome) : undefined;
  // A Sudoku round in progress can be resumed; every other game is a single run.
  const resumable = round?.game === "sudoku" && round.yourAttempt === "playing";
  if (!state || !round || (round.yourAttempt !== null && !resumable) || !isCompetitiveGame(round.game)) redirect(state ? `/arcade/wagers/${id}` : "/arcade/wagers");
  const sudoku = resumable ? await loadSudoku(ctx, "wager", GAME_SETTINGS.sudoku.values(round.board).size as SudokuSize) : null;
  if (resumable && (!sudoku || sudoku.completed)) redirect(`/arcade/wagers/${id}`);
  const { records, look } = await loadCompetitivePlay(ctx, round.game);
  const due = new Date(round.deadline).toLocaleString("en", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <CompetitivePlay
      target={{ kind: "wager", wager: id, round: round.round }}
      game={round.game}
      board={round.board}
      records={records}
      look={look}
      userId={ctx.userId}
      sudoku={sudoku}
      detail={`One run only · due ${due} UTC`}
    />
  );
}
