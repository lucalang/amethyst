"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, CircleCheck, Crown, Loader2, Play, Swords, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { SudokuSave } from "@/lib/arcade";
import { setupLabel, type CompetitiveGame } from "@/lib/competitive";
import type { GameLook } from "@/lib/game-cosmetics";
import { CompetitionProvider, type Competition } from "./competition";
import {
  Lazy2048,
  LazyFlutter,
  LazyFruit,
  LazyGemChase,
  LazyPatches,
  LazyQueens,
  LazySnake,
  LazySpaceBlaster,
  LazyStacker,
  LazySudoku,
  LazyTango,
  LazyZip,
} from "./lazy";

export type PlayTarget = { kind: "tournament"; tournament: string } | { kind: "wager"; wager: string; round: number };

type GameProps = { records: Record<string, number>; look: GameLook; userId: string };

const GAMES: Record<Exclude<CompetitiveGame, "sudoku">, (props: GameProps) => ReactNode> = {
  "2048": (props) => <Lazy2048 {...props} />,
  flutter: ({ records, look }) => <LazyFlutter records={records} look={look} />,
  snake: ({ records, look }) => <LazySnake records={records} look={look} />,
  "fruit-slice": ({ records, look }) => <LazyFruit records={records} look={look} />,
  stacker: ({ records, look }) => <LazyStacker records={records} look={look} />,
  "gem-chase": ({ records, look }) => <LazyGemChase records={records} look={look} />,
  "space-blaster": ({ records, look }) => <LazySpaceBlaster records={records} look={look} />,
  zip: ({ records, look }) => <LazyZip records={records} look={look} />,
  patches: ({ records, look }) => <LazyPatches records={records} look={look} />,
  tango: ({ records, look }) => <LazyTango records={records} look={look} />,
  queens: ({ records, look }) => <LazyQueens records={records} look={look} />,
};

/** A tournament or wager run: the game locked to one board, with runs started through the competition. */
export function CompetitivePlay({ target, game, board, records, look, detail, userId, sudoku = null }: {
  target: PlayTarget;
  game: CompetitiveGame;
  board: string;
  records: Record<string, number>;
  look: GameLook;
  detail: string;
  userId: string;
  /** A Sudoku wager round already in progress. */
  sudoku?: SudokuSave | null;
}) {
  const [settled, setSettled] = useState(0);
  const tournament = target.kind === "tournament" ? target.tournament : null;
  const wager = target.kind === "wager" ? target.wager : null;
  const round = target.kind === "wager" ? target.round : 0;

  const competition = useMemo<Competition>(() => ({
    lock: { game, board, seed: wager ? `wager:${wager}:${round}` : `tournament:${tournament}` },
    start: async () => {
      try {
        const body = wager
          ? await apiFetch<{ runId: string }>(`/api/competitive/wagers/${wager}`, { method: "POST", json: { action: "attempt", round, game, board } })
          : await apiFetch<{ runId: string }>("/api/competitive/tournaments", { method: "POST", json: { action: "run", tournament, game, board } });
        return body.runId;
      } catch (error) {
        toast.error(error instanceof ApiError ? error.message : "The run couldn’t start.");
        throw error;
      }
    },
    onSettled: () => setSettled((count) => count + 1),
  }), [game, board, wager, round, tournament]);

  const back = wager ? { href: `/arcade/wagers/${wager}`, label: "Back to the match" } : { href: "/arcade/tournaments", label: "Tournament" };

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-3 pt-4 md:px-6">
        <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amethyst/40 bg-amethyst/10 px-3 py-2 text-sm">
          {wager ? <Swords aria-hidden className="size-4 text-amethyst" /> : <Crown aria-hidden className="size-4 text-amethyst" />}
          <span className="font-semibold">{wager ? `Wager · round ${round}` : "Daily Tournament"}</span>
          <span className="text-muted-foreground">{setupLabel(game, board)} · {detail}</span>
          {settled > 0 ? (
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <CircleCheck aria-hidden className="size-4" />
              {wager ? "Your round result is in." : "Run recorded."}
            </span>
          ) : null}
          <Link
            href={back.href}
            className="ml-auto inline-flex items-center gap-1 rounded-sm font-medium text-amethyst outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden className="size-3.5" />
            {back.label}
          </Link>
        </div>
      </div>
      <CompetitionProvider value={competition}>
        {game === "sudoku" ? (
          wager ? <SudokuRound wager={wager} round={round} board={board} initial={sudoku} records={records} look={look} onSettled={competition.onSettled} /> : null
        ) : (
          GAMES[game]({ records, look, userId })
        )}
      </CompetitionProvider>
    </>
  );
}

/** Sudoku rounds start explicitly: the clock runs server-side from the moment the shared puzzle is dealt. */
function SudokuRound({ wager, round, board, initial, records, look, onSettled }: {
  wager: string;
  round: number;
  board: string;
  initial: SudokuSave | null;
  records: Record<string, number>;
  look: GameLook;
  onSettled?: () => void;
}) {
  const [save, setSave] = useState(initial);
  const [starting, setStarting] = useState(false);

  async function begin() {
    setStarting(true);
    try {
      const body = await apiFetch<{ sudoku: SudokuSave }>(`/api/competitive/wagers/${wager}`, {
        method: "POST",
        json: { action: "attempt", round, game: "sudoku", board },
      });
      setSave(body.sudoku);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The round couldn’t start.");
      setStarting(false);
    }
  }

  if (save) return <LazySudoku regular={{}} daily={null} dailyResult={null} records={records} look={look} wager={save} onSettled={onSettled} />;
  return (
    <div className="mx-auto grid min-h-[50dvh] max-w-md place-items-center px-4 py-10 text-center">
      <div className="grid gap-4 rounded-2xl border border-amethyst/30 bg-card/70 p-6 shadow-lg">
        <Timer aria-hidden className="mx-auto size-10 text-amethyst" />
        <h2 className="text-xl font-semibold">{setupLabel("sudoku", board)}</h2>
        <p className="text-sm text-muted-foreground">
          You and your opponent get the same puzzle. The clock starts when you press Start and keeps running until you solve it,
          even if you pause or leave. Hints are off.
        </p>
        <Button size="lg" onClick={begin} disabled={starting} autoFocus>
          {starting ? <Loader2 aria-hidden className="animate-spin" /> : <Play aria-hidden />}
          Start the clock
        </Button>
      </div>
    </div>
  );
}
