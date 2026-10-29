"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import type { SudokuDailyResult, SudokuDifficulty, SudokuSave } from "@/lib/arcade";
import { ArcadeProvider } from "./game-shell";

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
  return function ArcadeGame(props: P) {
    return (
      <ArcadeProvider>
        <Game {...props} />
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
export const LazySudoku = wrap(
  dynamic<{
    regular: SudokuSave | null;
    daily: SudokuSave | null;
    dailyResult: SudokuDailyResult | null;
    records: Partial<Record<SudokuDifficulty, number>>;
  }>(() => import("./game-sudoku"), {
    ssr: false,
    loading: Loading,
  }),
);
