import { generate, getUniqueSolution, type Board, type Difficulty } from "sudoku-core";
import { sudokuSaveSchema, sudokuStartSchema, SUDOKU_CELLS, toRunReward, type SudokuDifficulty } from "@/lib/arcade";
import { loadSudoku, SUDOKU_COLUMNS, toSudokuSave } from "@/lib/data/arcade";
import { recordVerifiedSudokuCompletion } from "@/lib/data/achievements";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** sudoku-core levels to try, first choice first (a lower level is the fallback if generation runs out of time). */
const LEVELS: Record<SudokuDifficulty, Difficulty[]> = {
  easy: ["L2", "L1"],
  medium: ["L4", "L3"],
  hard: ["L6", "L5"],
};

const toDigits = (board: Board | number[]) => board.map((cell) => cell ?? 0).join("");

/** A fresh puzzle with exactly one solution, rated at the requested difficulty by sudoku-core. */
function newPuzzle(difficulty: SudokuDifficulty) {
  for (const level of LEVELS[difficulty]) {
    try {
      const puzzle = generate(level, { timeoutMs: 8_000 });
      const solution = getUniqueSolution(puzzle);
      if (puzzle.length === SUDOKU_CELLS && solution) return { puzzle: toDigits(puzzle), solution: toDigits(solution) };
    } catch {
      // Out of time for this level; try the next one.
    }
  }
  return null;
}

/** The current puzzle (used to catch up after another window replaced or finished it). */
export async function GET() {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  try {
    return jsonResponse({ game: await loadSudoku(ctx) });
  } catch {
    return apiError(500, "load_failed", "Could not load your puzzle.");
  }
}

/** Start a new puzzle, replacing the saved one (the client confirms before replacing unfinished work). */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, sudokuStartSchema);
  if ("response" in parsed) return parsed.response;

  const generated = newPuzzle(parsed.data.difficulty);
  if (!generated) return apiError(503, "busy", "Could not create a puzzle right now. Try again.");

  const { data, error } = await ctx.supabase
    .from("sudoku_games")
    .upsert(
      {
        id: crypto.randomUUID(),
        difficulty: parsed.data.difficulty,
        puzzle: generated.puzzle,
        solution: generated.solution,
        entries: "0".repeat(SUDOKU_CELLS),
        notes: Array<number>(SUDOKU_CELLS).fill(0),
        elapsed_ms: 0,
        completed_at: null,
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select(SUDOKU_COLUMNS)
    .single();
  if (error) return dbError(error, "Could not save the new puzzle.");
  return jsonResponse({ game: toSudokuSave(data) });
}

/** Save progress on the current puzzle, or finish it (verified against the stored solution). */
export async function PATCH(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, sudokuSaveSchema);
  if ("response" in parsed) return parsed.response;
  const { id, entries, notes, elapsedMs, complete } = parsed.data;

  const { data: current, error: readError } = await ctx.supabase
    .from("sudoku_games")
    .select("difficulty, puzzle, solution")
    .eq("user_id", ctx.userId)
    .eq("id", id)
    .is("completed_at", null)
    .maybeSingle();
  if (readError) return dbError(readError);
  if (!current) return apiError(409, "replaced", "This puzzle was finished or replaced in another window.");

  let solved = false;
  if (complete) {
    const merged = [...current.puzzle].map((clue, index) => (clue !== "0" ? clue : entries[index])).join("");
    if (merged !== current.solution) return apiError(422, "unsolved", "That grid is not the solution yet.");
    solved = true;
  }

  const { data: saved, error } = await ctx.supabase
    .from("sudoku_games")
    .update({ entries, notes, elapsed_ms: elapsedMs, ...(solved ? { completed_at: new Date().toISOString() } : {}) })
    .eq("user_id", ctx.userId)
    .eq("id", id)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();
  if (error) return dbError(error, "Could not save your progress.");
  if (!saved) return apiError(409, "replaced", "This puzzle was finished or replaced in another window.");
  if (!solved) return jsonResponse({ saved: true });

  // Coins first, so a failure recording the time can't cost the reward (the claim is idempotent).
  const { data: claimed, error: claimError } = await ctx.supabase.rpc("claim_sudoku_reward", { p_game: id });
  if (claimError) console.error("sudoku reward", claimError.code);
  const reward = claimError ? null : toRunReward(claimed);

  const seconds = Math.max(1, Math.round(elapsedMs / 1000));
  const { data: record, error: recordError } = await ctx.supabase.rpc("record_arcade_score", {
    p_game: "sudoku",
    p_variant: current.difficulty,
    p_score: seconds,
  });
  if (recordError) return dbError(recordError, "Puzzle saved, but the time could not be recorded.");
  const achievementUnlocks = await recordVerifiedSudokuCompletion(ctx, current.difficulty);
  return jsonResponse({ saved: true, best: record?.[0]?.best ?? seconds, improved: record?.[0]?.improved ?? false, reward, achievementUnlocks });
}
