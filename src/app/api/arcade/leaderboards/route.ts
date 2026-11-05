import { LEADERBOARD_GAMES, leaderboardQuerySchema, type Leaderboard, type LeaderboardRow } from "@/lib/leaderboards";
import { apiError, dbError, jsonResponse, requireApiUser } from "@/lib/http";
import { dailyPuzzle } from "@/lib/sudoku-puzzles";

type Ranked = { players?: number; top?: LeaderboardRow[]; you?: LeaderboardRow | null };

/** One board's top players and the caller's own placement (anonymous names only). */
export async function GET(request: Request) {
  const ctx = await requireApiUser();
  if (ctx instanceof Response) return ctx;
  const parsed = leaderboardQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiError(400, "invalid_request", "Unknown leaderboard.");
  const { game, board, limit } = parsed.data;

  // A daily Sudoku board ranks only the shared puzzle of that day.
  let puzzle: string | null = null;
  if (game === "sudoku" && board.startsWith("daily-")) {
    puzzle = dailyPuzzle(board.slice(6))?.puzzle ?? null;
    if (!puzzle) return apiError(503, "unavailable", "This daily board is unavailable right now.");
  }

  const [ranked, boards] = await Promise.all([
    ctx.supabase.rpc("arcade_leaderboard", { p_game: game, p_board: board, p_limit: limit, p_puzzle: puzzle }),
    LEADERBOARD_GAMES[game].setups ? ctx.supabase.rpc("arcade_leaderboard_boards", { p_game: game }) : null,
  ]);
  if (ranked.error) return dbError(ranked.error, "Could not load the leaderboard.");
  const data = (ranked.data ?? {}) as Ranked;
  const body: Leaderboard = {
    game,
    board,
    order: LEADERBOARD_GAMES[game].order,
    players: data.players ?? 0,
    top: data.top ?? [],
    you: data.you ?? null,
  };
  if (boards && !boards.error) body.boards = boards.data.map((row) => ({ board: row.board, players: Number(row.players) }));
  return jsonResponse(body);
}
