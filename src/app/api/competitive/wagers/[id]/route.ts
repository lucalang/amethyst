import { z } from "zod";
import type { SudokuDifficulty } from "@/lib/arcade";
import { GAME_SETTINGS, isWagerBoard, wagerActionSchema } from "@/lib/competitive";
import { SUDOKU_COLUMNS, toSudokuSave } from "@/lib/data/arcade";
import { loadWagerState } from "@/lib/data/competitive";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";
import { SUDOKU_CONFIG, type SudokuSize } from "@/lib/sudoku";
import { newPuzzle } from "@/lib/sudoku-puzzles";
import type { AuthContext } from "@/lib/supabase/auth";

type Params = { params: Promise<{ id: string }> };
const wagerId = z.uuid();
const notFound = () => apiError(404, "wager_not_found", "That challenge was not found.");

export async function GET(_request: Request, { params }: Params) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!wagerId.safeParse(id).success) return notFound();
  try {
    const state = await loadWagerState(ctx, id);
    return state ? jsonResponse(state) : notFound();
  } catch (error) {
    return dbError(error as { message: string }, "The match couldn’t be loaded.");
  }
}

/** Accept (escrows the stake), cancel (host, before acceptance) or start this round's single attempt. */
export async function POST(request: Request, { params }: Params) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const { id } = await params;
  if (!wagerId.safeParse(id).success) return notFound();
  const parsed = await parseJson(request, wagerActionSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  if (body.action === "attempt" && body.game === "sudoku") return startSudokuAttempt(ctx, id, body.round, body.board);
  if (body.action === "attempt") {
    const { data, error } = await ctx.supabase.rpc("start_wager_attempt", { p_wager: id, p_round: body.round, p_game: body.game, p_board: body.board });
    if (error) return dbError(error, "The round couldn’t start.");
    return jsonResponse({ runId: data });
  }
  const { data, error } =
    body.action === "accept"
      ? await ctx.supabase.rpc("accept_wager", { p_wager: id, p_expected_stake: body.expectedStake })
      : await ctx.supabase.rpc("cancel_wager", { p_wager: id });
  if (error) return dbError(error, body.action === "accept" ? "The challenge couldn’t be accepted, and no Coins were taken." : "The challenge couldn’t be cancelled.");
  return jsonResponse({ wager: data });
}

/**
 * A Sudoku round: both players get the round's stored puzzle (the first to start stores a fresh one),
 * then the attempt starts and the puzzle opens in the "wager" slot under the run's id.
 */
async function startSudokuAttempt(ctx: AuthContext, id: string, round: number, board: string) {
  if (!isWagerBoard("sudoku", board)) return apiError(422, "invalid_board", "That isn’t this round’s game.");
  const { size, difficulty } = GAME_SETTINGS.sudoku.values(board) as { size: SudokuSize; difficulty: SudokuDifficulty };
  let stored = await ctx.supabase.rpc("wager_sudoku_puzzle", { p_wager: id, p_round: round, p_puzzle: "", p_solution: "" });
  if (stored.error?.code === "22023") {
    const generated = newPuzzle(difficulty, size);
    if (!generated) return apiError(503, "busy", "Could not create the puzzle right now. Try again.");
    stored = await ctx.supabase.rpc("wager_sudoku_puzzle", { p_wager: id, p_round: round, p_puzzle: generated.puzzle, p_solution: generated.solution });
  }
  if (stored.error) return dbError(stored.error, "The round couldn’t start.");
  const puzzle = stored.data as { puzzle: string; solution: string };

  const { data: runId, error } = await ctx.supabase.rpc("start_wager_attempt", { p_wager: id, p_round: round, p_game: "sudoku", p_board: board });
  if (error) return dbError(error, "The round couldn’t start.");
  const { data, error: saveError } = await ctx.supabase
    .from("sudoku_games")
    .upsert(
      {
        id: runId,
        slot: "wager",
        size,
        puzzle_date: null,
        difficulty,
        puzzle: puzzle.puzzle,
        solution: puzzle.solution,
        entries: "0".repeat(SUDOKU_CONFIG[size].cells),
        notes: Array<number>(SUDOKU_CONFIG[size].cells).fill(0),
        elapsed_ms: 0,
        completed_at: null,
        started_at: new Date().toISOString(),
      },
      { onConflict: "user_id,slot,size" },
    )
    .select(SUDOKU_COLUMNS)
    .single();
  if (saveError) return dbError(saveError, "The round started, but its puzzle couldn’t be saved.");
  return jsonResponse({ runId, sudoku: toSudokuSave(data) });
}
