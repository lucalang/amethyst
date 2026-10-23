import type { Metadata } from "next";
import { LazySudoku } from "@/components/arcade/lazy";
import { SUDOKU_DIFFICULTIES, type SudokuDifficulty } from "@/lib/arcade";
import { loadArcadeRecords, loadSudoku } from "@/lib/data/arcade";
import { requireUser } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "Sudoku · Arcade" };

export default async function SudokuPage() {
  const ctx = await requireUser();
  const [records, save] = await Promise.all([loadArcadeRecords(ctx), loadSudoku(ctx)]);
  const times: Partial<Record<SudokuDifficulty, number>> = {};
  for (const difficulty of SUDOKU_DIFFICULTIES) {
    const time = records[`sudoku:${difficulty}`];
    if (time !== undefined) times[difficulty] = time;
  }
  return <LazySudoku initial={save} records={times} />;
}
