import { z } from "zod";
import { ARCADE_GAMES, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, type ArcadeGameId } from "@/lib/arcade";
import { SUDOKU_CONFIG, SUDOKU_SIZES, sudokuVariant } from "@/lib/sudoku";
import { dailyDate, dailyVariant } from "@/lib/arcade-daily";
import { BLEND_MODE_IDS, SNAKE_MODES, SNAKE_SIZES, SNAKE_SPEEDS, isSnakeLeaderboardVariant, type SnakeMode, type SnakeSize, type SnakeSpeed } from "@/lib/snake";

/**
 * Leaderboards rank only runs the server timed and checked, one best per player and board.
 * Board ids match personal-record variants ("" = a game's main board, `daily-YYYY-MM-DD` = a daily challenge);
 * Sudoku boards are its difficulties.
 */
export type LeaderboardOrder = "high" | "fast";

export type BoardOption = { id: string; label: string };

type LeaderboardGame = {
  order: LeaderboardOrder;
  scoreLabel: string;
  boards: readonly BoardOption[];
  daily: boolean;
  /** Snake: one board per setup, listed from the boards players have ranked on. */
  setups?: boolean;
};

/** Days of daily boards that stay browsable (today first). */
export const DAILY_BOARD_DAYS = 7;
export const LEADERBOARD_LIMIT = 25;

export const LEADERBOARD_GAMES: Record<ArcadeGameId, LeaderboardGame> = {
  "2048": {
    order: "high",
    scoreLabel: "Score",
    boards: [
      { id: "", label: "4×4" },
      { id: "3x3", label: "3×3" },
      { id: "5x5", label: "5×5" },
    ],
    daily: true,
  },
  flutter: { order: "high", scoreLabel: "Pillars", boards: [{ id: "", label: "Classic" }], daily: true },
  snake: { order: "high", scoreLabel: "Score", boards: [{ id: "", label: "Classic" }], daily: true, setups: true },
  sudoku: {
    order: "fast",
    scoreLabel: "Time",
    boards: SUDOKU_SIZES.flatMap(size => SUDOKU_DIFFICULTIES.map(difficulty => ({ id: sudokuVariant(size, difficulty), label: `${SUDOKU_CONFIG[size].label} · ${SUDOKU_LABELS[difficulty]}` }))),
    daily: true,
  },
  "fruit-slice": {
    order: "high",
    scoreLabel: "Score",
    boards: [
      { id: "", label: "Classic" },
      { id: "arcade", label: "Arcade" },
      { id: "zen", label: "Zen" },
    ],
    daily: true,
  },
  stacker: {
    order: "high",
    scoreLabel: "Height",
    boards: [
      { id: "", label: "Casual" },
      { id: "classic", label: "Classic" },
    ],
    daily: true,
  },
  "gem-chase": { order: "high", scoreLabel: "Score", boards: [{ id: "", label: "Classic" }], daily: false },
  "space-blaster": { order: "high", scoreLabel: "Score", boards: [{ id: "", label: "Classic" }], daily: false },
  zip: { order: "high", scoreLabel: "Score", boards: [{ id: "", label: "Practice" }], daily: true },
  patches: { order: "high", scoreLabel: "Score", boards: [{ id: "", label: "Practice" }], daily: true },
  tango: { order: "high", scoreLabel: "Score", boards: [{ id: "", label: "Practice" }], daily: true },
  queens: { order: "high", scoreLabel: "Score", boards: [{ id: "", label: "Practice" }], daily: true },
};

export const LEADERBOARD_GAME_IDS = ARCADE_GAMES.map((game) => game.id);

/** A Snake board id split into its parts (mode key is a mode id or an `x…` mix). */
export type SnakeBoardParts = { key: string; size: SnakeSize; count: number; speed: SnakeSpeed };

export function parseSnakeBoard(board: string): SnakeBoardParts {
  if (board === "") return { key: "classic", size: "medium", count: 1, speed: "normal" };
  const [key, size, count, speed = "normal"] = board.split("-");
  return { key, size: size as SnakeSize, count: Number(count), speed: speed as SnakeSpeed };
}

/** Mirrors `snakeVariant`: the original setup keeps the unnamed board. */
export function snakeBoardOf({ key, size, count, speed }: SnakeBoardParts) {
  if (key === "classic" && size === "medium" && count === 1 && speed === "normal") return "";
  return `${key}-${size}-${count}${speed === "normal" ? "" : `-${speed}`}`;
}

/** "classic-small-3-fast" → "Classic · Small · 3 fruit · Fast"; mixes list their modes. */
export function snakeBoardLabel(board: string) {
  if (board === "") return "Classic · Medium · 1 fruit";
  const [key, size, count, speed] = board.split("-");
  const modes = key.startsWith("x")
    ? BLEND_MODE_IDS.filter((_, index) => parseInt(key.slice(1), 36) & (1 << index)).map((mode) => SNAKE_MODES[mode].label).join(" + ")
    : (SNAKE_MODES[key as SnakeMode]?.label ?? key);
  const parts = [modes, SNAKE_SIZES[size as SnakeSize]?.label ?? size, `${count} fruit`];
  if (speed) parts.push(SNAKE_SPEEDS[speed as SnakeSpeed]?.label ?? speed);
  return parts.join(" · ");
}

export function boardLabel(game: ArcadeGameId, board: string, now = Date.now()) {
  if (board.startsWith("daily-")) return `Daily · ${dailyBoards(now).find((day) => day.id === board)?.label ?? board.slice(6)}`;
  if (game === "snake") return snakeBoardLabel(board);
  return LEADERBOARD_GAMES[game].boards.find((option) => option.id === board)?.label ?? board;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Daily boards still browsable, newest first. */
export function dailyBoards(now = Date.now()): BoardOption[] {
  return Array.from({ length: DAILY_BOARD_DAYS }, (_, day) => {
    const date = dailyDate(now - day * DAY_MS);
    return { id: dailyVariant(date), label: day === 0 ? "Today" : day === 1 ? "Yesterday" : date.slice(5).replace("-", "/") };
  });
}

export function isLeaderboardBoard(game: ArcadeGameId, board: string, now = Date.now()) {
  const entry = LEADERBOARD_GAMES[game];
  if (entry.boards.some((option) => option.id === board)) return true;
  if (entry.setups && game === "snake" && isSnakeLeaderboardVariant(board)) return true;
  return entry.daily && dailyBoards(now).some((option) => option.id === board);
}

export const leaderboardQuerySchema = z
  .object({
    game: z.enum(LEADERBOARD_GAME_IDS as [ArcadeGameId, ...ArcadeGameId[]]),
    board: z.string().max(40).default(""),
    limit: z.coerce.number().int().min(1).max(LEADERBOARD_LIMIT).default(LEADERBOARD_LIMIT),
  })
  .strict()
  .refine((value) => isLeaderboardBoard(value.game, value.board), { message: "Unknown leaderboard.", path: ["board"] });


export type LeaderboardRow = {
  rank: number;
  /** Display name, or an anonymous arcade name without one; never an email. */
  name: string;
  score: number;
  /** Sudoku only: hints used (fewer wins a tie). */
  hints: number | null;
  achievedAt: string;
  you: boolean;
};

export type Leaderboard = {
  game: ArcadeGameId;
  board: string;
  order: LeaderboardOrder;
  players: number;
  top: LeaderboardRow[];
  /** The signed-in player's placement (also when outside the top list), or null without a ranked run. */
  you: LeaderboardRow | null;
  /** Snake only: boards with ranked players, busiest first. */
  boards?: { board: string; players: number }[];
};

export function leaderboardHref(game: ArcadeGameId, board = "") {
  const params = new URLSearchParams({ game });
  if (board) params.set("board", board);
  return `/arcade/leaderboards?${params}`;
}
