"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { SudokuDailyResult, SudokuSave } from "@/lib/arcade";
import type { SudokuSize } from "@/lib/sudoku";
import type { GameLook } from "@/lib/game-cosmetics";
import { ArcadeProvider } from "./game-shell";
import type { WhoAmIMode } from "./game-who-am-i";

function Loading() {
  return (
    <div role="status" className="mx-auto grid min-h-[60dvh] max-w-6xl place-items-center px-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-amethyst" />
        Loading game…
      </span>
    </div>
  );
}

/** Each game (and its engine) is its own chunk, downloaded only when that game's page opens. */
function wrap<P extends object>(Game: ComponentType<P>) {
  return function ArcadeGame({ look, ...props }: P & { look?: GameLook }) {
    return (
      <ArcadeProvider look={look}>
        <Game {...(props as P)} />
      </ArcadeProvider>
    );
  };
}

type RecordProps = { records: Record<string, number> };

export const Lazy2048 = wrap(dynamic<{ records: Record<string, number>; userId: string }>(() => import("./game-2048"), { ssr: false, loading: Loading }));
export const LazyFlutter = wrap(dynamic<{ records: Record<string, number> }>(() => import("./game-flutter"), { ssr: false, loading: Loading }));
export const LazySnake = wrap(dynamic<{ records: Record<string, number> }>(() => import("./game-snake"), { ssr: false, loading: Loading }));
export const LazyFruit = wrap(dynamic<RecordProps>(() => import("./game-fruit"), { ssr: false, loading: Loading }));
export const LazyStacker = wrap(dynamic<RecordProps>(() => import("./game-stacker"), { ssr: false, loading: Loading }));
export const LazyGemChase = wrap(dynamic<RecordProps>(() => import("./game-gem-chase"), { ssr: false, loading: Loading }));
export const LazySpaceBlaster = wrap(dynamic<RecordProps>(() => import("./game-space-blaster"), { ssr: false, loading: Loading }));
export const LazyPaperTrails = wrap(dynamic<RecordProps>(() => import("./game-paper-trails"), { ssr: false, loading: Loading }));
export const LazyFrontWars = wrap(dynamic<RecordProps>(() => import("./game-front-wars"), { ssr: false, loading: Loading }));
export const LazyBlankAtlas = wrap(dynamic<RecordProps>(() => import("./game-blank-atlas"), { ssr: false, loading: Loading }));
export const LazyTheAscent = wrap(dynamic<RecordProps>(() => import("./game-the-ascent"), { ssr: false, loading: Loading }));
export const LazyZip = wrap(dynamic<RecordProps & { userId: string }>(() => import("./game-zip"), { ssr: false, loading: Loading }));
export const LazyPatches = wrap(dynamic<RecordProps & { userId: string }>(() => import("./game-patches"), { ssr: false, loading: Loading }));
export const LazyTango = wrap(dynamic<RecordProps & { userId: string }>(() => import("./game-tango"), { ssr: false, loading: Loading }));
export const LazyQueens = wrap(dynamic<RecordProps & { userId: string }>(() => import("./game-queens"), { ssr: false, loading: Loading }));
export const LazySumbreak = wrap(dynamic<RecordProps & { userId: string }>(() => import("./game-sumbreak"), { ssr: false, loading: Loading }));
export const LazyGuessThe = wrap(dynamic<RecordProps>(() => import("./game-guess-the"), { ssr: false, loading: Loading }));
export const LazyGuessTheChart = wrap(dynamic<{ best: number | null }>(() => import("./guess-the/chart-game"), { ssr: false, loading: Loading }));
export const LazyGuessTheFlag = wrap(dynamic<{ best: number | null }>(() => import("./guess-the/flag-game"), { ssr: false, loading: Loading }));
export const LazyGuessTheSize = wrap(dynamic<{ best: number | null }>(() => import("./guess-the/size-game"), { ssr: false, loading: Loading }));
export const LazyGuessThePrice = wrap(dynamic<{ best: number | null }>(() => import("./guess-the/price-game"), { ssr: false, loading: Loading }));
export const LazyWhoAmI = wrap(dynamic<{ mode: WhoAmIMode }>(() => import("./game-who-am-i"), { ssr: false, loading: Loading }));
export const LazySudoku = wrap(
  dynamic<{
    regular: Partial<Record<SudokuSize, SudokuSave | null>>;
    daily: SudokuSave | null;
    dailyResult: SudokuDailyResult | null;
    records: Partial<Record<string, number>>;
    wager?: SudokuSave | null;
    onSettled?: () => void;
  }>(() => import("./game-sudoku"), {
    ssr: false,
    loading: Loading,
  }),
);
