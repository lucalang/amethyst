import { sudokuHintSchema } from "@/lib/arcade";
import { apiError, dbError, jsonResponse, parseJson, rejectCrossOrigin, requireApiUser } from "@/lib/http";

/** Save the board, then reveal one cell. The database counts the hint, which marks the solve as assisted. */
export async function POST(request: Request) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = await parseJson(request, sudokuHintSchema);
  if ("response" in parsed) return parsed.response;
  const { id, cell, entries, notes, elapsedMs } = parsed.data;

  const { data: saved, error: saveError } = await ctx.supabase
    .from("sudoku_games")
    .update({ entries, notes, elapsed_ms: elapsedMs })
    .eq("user_id", ctx.userId)
    .eq("id", id)
    .is("completed_at", null)
    .select("id")
    .maybeSingle();
  if (saveError) return dbError(saveError, "Could not save your progress.");
  if (!saved) return apiError(409, "replaced", "This puzzle was finished or replaced in another window.");

  const { data: digit, error } = await ctx.supabase.rpc("sudoku_hint", { p_game: id, p_cell: cell });
  if (error) return dbError(error, "Could not reveal that cell.");
  const { data: row } = await ctx.supabase.from("sudoku_games").select("hints").eq("user_id", ctx.userId).eq("id", id).maybeSingle();
  return jsonResponse({ digit, hints: row?.hints ?? null });
}
