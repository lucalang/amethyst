import type { Metadata } from "next";
import { LazySudoku } from "@/components/arcade/lazy";
import { SUDOKU_DIFFICULTIES, type SudokuDifficulty } from "@/lib/arcade";
import { dailyDate } from "@/lib/arcade-daily";
import { loadArcadeRecords, loadSudoku, loadSudokuDailyResult } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Sudoku · Arcade" };

export default async function SudokuPage() {
  const ctx = await requireUser();
  const [records, regular, daily, dailyResult] = await Promise.all([
    loadArcadeRecords(ctx),
    loadSudoku(ctx, "regular"),
    loadSudoku(ctx, "daily"),
    loadSudokuDailyResult(ctx, dailyDate()),
  ]);
  const times: Partial<Record<SudokuDifficulty, number>> = {};
  for (const difficulty of SUDOKU_DIFFICULTIES) {
    const time = records[`sudoku:${difficulty}`];
    if (time !== undefined) times[difficulty] = time;
  }
  return <LazySudoku regular={regular} daily={daily} dailyResult={dailyResult} records={times} />;
}
