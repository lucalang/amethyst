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
import { CompetitionProvider, ShellNavProvider, type Competition, type ShellNav } from "./competition";
import {
  Lazy2048,
  LazyFlutter,
  LazyFruit,
  LazyGemChase,
  LazyPatches,
  LazyQueens,
  LazySumbreak,
  LazySnake,
  LazySpaceBlaster,
  LazyStacker,
  LazySudoku,
  LazyTango,
  LazyZip,
} from "./lazy";

export type PlayTarget = { kind: "tournament"; tournament: string } | { kind: "wager"; wager: string; round: number };

type GameProps = { records: Record<string, number>; look: GameLook; userId: string };

const GAMES: Record<Exclude<CompetitiveGame, "sudoku" | "who-am-i">, (props: GameProps) => ReactNode> = {
  "2048": (props) => <Lazy2048 {...props} />,
  flutter: ({ records, look }) => <LazyFlutter records={records} look={look} />,
  snake: ({ records, look }) => <LazySnake records={records} look={look} />,
  "fruit-slice": ({ records, look }) => <LazyFruit records={records} look={look} />,
  stacker: ({ records, look }) => <LazyStacker records={records} look={look} />,
  "gem-chase": ({ records, look }) => <LazyGemChase records={records} look={look} />,
  "space-blaster": ({ records, look }) => <LazySpaceBlaster records={records} look={look} />,
  zip: ({ records, look, userId }) => <LazyZip records={records} look={look} userId={userId} />,
  patches: ({ records, look, userId }) => <LazyPatches records={records} look={look} userId={userId} />,
  tango: ({ records, look, userId }) => <LazyTango records={records} look={look} userId={userId} />,
  queens: ({ records, look, userId }) => <LazyQueens records={records} look={look} userId={userId} />,
  sumbreak: ({ records, look, userId }) => <LazySumbreak records={records} look={look} userId={userId} />,
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

  const back = wager
    ? { href: `/arcade/wagers/${wager}`, label: "Back to the match", short: "Match" }
    : { href: "/arcade/tournaments", label: "Back to the tournament", short: "Tournament" };

  // Lives inside the game frame (see GameShell), so it is still there in fullscreen.
  const banner = (
    <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amethyst/35 bg-amethyst/10 px-3 py-1.5 text-sm">
      {wager ? <Swords aria-hidden className="size-4 text-amethyst" /> : <Crown aria-hidden className="size-4 text-amethyst" />}
      <span className="font-semibold">{wager ? `Wager · round ${round}` : "Daily Tournament"}</span>
      <span className="text-muted-foreground">{setupLabel(game, board)} · {detail}</span>
      {settled > 0 ? (
        <span className="inline-flex items-center gap-1 text-emerald-400">
          <CircleCheck aria-hidden className="size-4" />
          {wager ? "Your round result is in." : "Run recorded."}
        </span>
      ) : null}
    </div>
  );
  const nav: ShellNav = { back, banner, done: settled > 0 };

  return (
    <ShellNavProvider value={nav}>
      <CompetitionProvider value={competition}>
        {game === "sudoku" ? (
          wager ? (
            <SudokuRound wager={wager} round={round} board={board} initial={sudoku} records={records} look={look} onSettled={competition.onSettled} back={back} banner={banner} />
          ) : null
        ) : (
          game === "who-am-i" ? null : GAMES[game]({ records, look, userId })
        )}
      </CompetitionProvider>
    </ShellNavProvider>
  );
}

/** Sudoku rounds start explicitly: the clock runs server-side from the moment the shared puzzle is dealt. */
function SudokuRound({ wager, round, board, initial, records, look, onSettled, back, banner }: {
  wager: string;
  round: number;
  board: string;
  initial: SudokuSave | null;
  records: Record<string, number>;
  look: GameLook;
  onSettled?: () => void;
  back: ShellNav["back"];
  banner: ReactNode;
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
    <div className="mx-auto grid min-h-[50dvh] max-w-md place-items-center gap-4 px-4 py-6 text-center">
      <div className="flex w-full flex-wrap items-center gap-2 text-left">
        <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
          <Link href={back.href}>
            <ArrowLeft aria-hidden />
            {back.short}
          </Link>
        </Button>
        <div className="min-w-0 flex-1">{banner}</div>
      </div>
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
