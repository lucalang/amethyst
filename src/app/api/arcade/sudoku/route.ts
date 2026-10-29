import { generate, getUniqueSolution, type Board, type Difficulty } from "sudoku-core";
import { sudokuSaveSchema, sudokuStartSchema, SUDOKU_CELLS, SUDOKU_DAILY_DIFFICULTY, toRunReward, type SudokuDailyResult, type SudokuDifficulty } from "@/lib/arcade";
import { dailyDate, seedFrom } from "@/lib/arcade-daily";
import { loadSudoku, loadSudokuDailyResult, SUDOKU_COLUMNS, toSudokuSave } from "@/lib/data/arcade";
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
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const slot = new URL(request.url).searchParams.get("slot") === "daily" ? "daily" : "regular";
  try {
    return jsonResponse({ game: await loadSudoku(ctx, slot) });
  } catch {
    return apiError(500, "load_failed", "Could not load your puzzle.");
  }
}

/** Daily puzzles are the same for everyone: generated from the date, cached per server instance. */
const dailyCache = new Map<string, { puzzle: string; solution: string }>();

function dailyPuzzle(date: string) {
  const cached = dailyCache.get(date);
  if (cached) return cached;
  const seed = seedFrom(`sudoku:${date}`);
  for (const level of LEVELS[SUDOKU_DAILY_DIFFICULTY]) {
    try {
      const puzzle = generate(level, { seed });
      const solution = getUniqueSolution(puzzle);
      if (puzzle.length === SUDOKU_CELLS && solution) {
        const generated = { puzzle: toDigits(puzzle), solution: toDigits(solution) };
        dailyCache.set(date, generated);
        if (dailyCache.size > 4) dailyCache.delete(dailyCache.keys().next().value!);
        return generated;
      }
    } catch {
      // No puzzle at this level for this seed; the next level is just as deterministic.
    }
  }
  return null;
}

/**
 * Start a new regular puzzle (the client confirms before replacing unfinished work), or open today's
 * daily puzzle. An unfinished daily puzzle from an earlier day is only replaced when `replace` says so.
 */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, sudokuStartSchema);
  if ("response" in parsed) return parsed.response;

  let slot: "regular" | "daily" = "regular";
  let date: string | null = null;
  let difficulty: SudokuDifficulty;
  let generated: { puzzle: string; solution: string } | null;
  if ("daily" in parsed.data) {
    slot = "daily";
    date = dailyDate();
    difficulty = SUDOKU_DAILY_DIFFICULTY;
    let existing;
    try {
      existing = await loadSudoku(ctx, "daily");
    } catch {
      return apiError(500, "load_failed", "Could not load your daily puzzle.");
    }
    if (existing?.puzzleDate === date) return jsonResponse({ game: existing });
    if (existing && !existing.completed && !parsed.data.replace) {
      return apiError(409, "unfinished_daily", "You still have an unfinished daily puzzle from an earlier day.");
    }
    generated = dailyPuzzle(date);
  } else {
    difficulty = parsed.data.difficulty;
    generated = newPuzzle(difficulty);
  }
  if (!generated) return apiError(503, "busy", "Could not create a puzzle right now. Try again.");

  const { data, error } = await ctx.supabase
    .from("sudoku_games")
    .upsert(
      {
        id: crypto.randomUUID(),
        slot,
        puzzle_date: date,
        difficulty,
        puzzle: generated.puzzle,
        solution: generated.solution,
        entries: "0".repeat(SUDOKU_CELLS),
        notes: Array<number>(SUDOKU_CELLS).fill(0),
        elapsed_ms: 0,
        completed_at: null,
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id,slot" },
    )
    .select(SUDOKU_COLUMNS)
    .single();
  if (error) return dbError(error, "Could not save the new puzzle.");
  return jsonResponse({ game: toSudokuSave(data) });
}

/**
 * Save progress on a puzzle, or finish it (verified against the stored solution). Fastest times only
 * count regular puzzles solved without hints; daily results are written by the database on completion.
 */
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
    .select("difficulty, puzzle, solution, slot, puzzle_date, hints")
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
  const assisted = current.hints > 0;
  const seconds = Math.max(1, Math.round(elapsedMs / 1000));

  let best: number | null = null;
  let improved = false;
  if (current.slot === "regular" && !assisted) {
    const { data: record, error: recordError } = await ctx.supabase.rpc("record_arcade_score", {
      p_game: "sudoku",
      p_variant: current.difficulty,
      p_score: seconds,
    });
    if (recordError) return dbError(recordError, "Puzzle saved, but the time could not be recorded.");
    best = record?.[0]?.best ?? seconds;
    improved = record?.[0]?.improved ?? false;
  }
  let daily: SudokuDailyResult | null = null;
  if (current.slot === "daily" && current.puzzle_date) {
    daily = await loadSudokuDailyResult(ctx, current.puzzle_date).catch(() => null);
  }
  const achievementUnlocks = await recordVerifiedSudokuCompletion(ctx, current.difficulty);
  return jsonResponse({ saved: true, best, improved, assisted, hints: current.hints, daily, reward, achievementUnlocks });
}
