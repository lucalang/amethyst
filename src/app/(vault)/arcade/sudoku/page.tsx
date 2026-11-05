import type { Metadata } from "next";
import { LazySudoku } from "@/components/arcade/lazy";
import { SUDOKU_DIFFICULTIES } from "@/lib/arcade";
import { SUDOKU_SIZES, sudokuVariant } from "@/lib/sudoku";
import { dailyDate } from "@/lib/arcade-daily";
import { loadArcadeRecords, loadSudoku, loadSudokuDailyResult } from "@/lib/data/arcade";
import { loadGameLoadout } from "@/lib/data/shop";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Sudoku · Arcade" };

export default async function SudokuPage() {
  const ctx = await requireUser();
  const [records, regular, daily, dailyResult, look] = await Promise.all([
    loadArcadeRecords(ctx),
    Promise.all(SUDOKU_SIZES.map(size => loadSudoku(ctx, "regular", size))),
    loadSudoku(ctx, "daily"),
    loadSudokuDailyResult(ctx, dailyDate()),
    loadGameLoadout(ctx, "sudoku"),
  ]);
  const times: Record<string, number> = {};
  for (const size of SUDOKU_SIZES) for (const difficulty of SUDOKU_DIFFICULTIES) {
    const variant = sudokuVariant(size, difficulty);
    const time = records[`sudoku:${variant}`];
    if (time !== undefined) times[variant] = time;
  }
  const saves = Object.fromEntries(SUDOKU_SIZES.map((size, index) => [size, regular[index]]));
  return <LazySudoku regular={saves} daily={daily} dailyResult={dailyResult} records={times} look={look} />;
}
