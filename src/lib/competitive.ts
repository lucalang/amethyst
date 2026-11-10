import { z } from "zod";
import { ARCADE_GAMES, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, formatDuration, type ArcadeGameId } from "@/lib/arcade";
import { LEADERBOARD_GAMES, isLeaderboardBoard, parseSnakeBoard, snakeBoardLabel, snakeBoardOf } from "@/lib/leaderboards";
import { SNAKE_MODE_IDS, SNAKE_MODES, SNAKE_SIZE_IDS, SNAKE_SIZES, SNAKE_SPEED_IDS, SNAKE_SPEEDS, type SnakeSize, type SnakeSpeed } from "@/lib/snake";
import { SUDOKU_CONFIG, SUDOKU_SIZES, sudokuVariant, type SudokuSize } from "@/lib/sudoku";

/**
 * Competitive play (Daily Tournaments and Wagers). Wagers take every minigame with any of its ranked
 * settings (a board id, as on the leaderboards); tournaments rotate through the games in the
 * `competitive_boards` table. `_wager_board_direction` in the database checks the same boards.
 */
export type CompetitiveGame = ArcadeGameId;
export const COMPETITIVE_GAME_IDS: readonly CompetitiveGame[] = ARCADE_GAMES.map((game) => game.id);
export const isCompetitiveGame = (value: unknown): value is CompetitiveGame =>
  typeof value === "string" && COMPETITIVE_GAME_IDS.includes(value as CompetitiveGame);

export type SettingOption = { id: string; label: string; hint?: string };
export type GameSetting = { id: string; label: string; options: readonly SettingOption[] };
type SettingsSpec = {
  settings: readonly GameSetting[];
  /** Picked option ids → board id. */
  board: (values: Record<string, string>) => string;
  /** Board id → picked option ids. */
  values: (board: string) => Record<string, string>;
};

const NO_SETTINGS: SettingsSpec = { settings: [], board: () => "", values: () => ({}) };

/** One picker over a game's ranked boards. */
function boardPicker(game: CompetitiveGame, id: string, label: string, hints: Record<string, string> = {}): SettingsSpec {
  return {
    settings: [{ id, label, options: LEADERBOARD_GAMES[game].boards.map((board) => ({ id: board.id, label: board.label, hint: hints[board.id] })) }],
    board: (values) => values[id] ?? "",
    values: (board) => ({ [id]: board }),
  };
}

// Peace never ends a run and Blender mixes aren't ranked, so neither can decide a round.
const WAGER_SNAKE_MODES = SNAKE_MODE_IDS.filter((mode) => mode !== "peace" && mode !== "blender");
const SNAKE_FRUIT_COUNTS = [1, 2, 3, 5, 8, 12];

/** The settings a wager can set for each game; new games only need an entry here. */
export const GAME_SETTINGS: Record<CompetitiveGame, SettingsSpec> = {
  "2048": boardPicker("2048", "size", "Board", { "": "The classic board", "3x3": "Tight and fast", "5x5": "Room for huge tiles" }),
  flutter: NO_SETTINGS,
  snake: {
    settings: [
      { id: "mode", label: "Mode", options: WAGER_SNAKE_MODES.map((mode) => ({ id: mode, label: SNAKE_MODES[mode].label, hint: SNAKE_MODES[mode].tip })) },
      { id: "size", label: "Board size", options: SNAKE_SIZE_IDS.map((size) => ({ id: size, label: SNAKE_SIZES[size].label })) },
      { id: "count", label: "Fruit on the board", options: SNAKE_FRUIT_COUNTS.map((count) => ({ id: String(count), label: String(count) })) },
      { id: "speed", label: "Speed", options: SNAKE_SPEED_IDS.map((speed) => ({ id: speed, label: SNAKE_SPEEDS[speed].label, hint: SNAKE_SPEEDS[speed].tip })) },
    ],
    board: (values) => snakeBoardOf({ key: values.mode, size: values.size as SnakeSize, count: Number(values.count), speed: values.speed as SnakeSpeed }),
    values: (board) => {
      const parts = parseSnakeBoard(board);
      return { mode: parts.key, size: parts.size, count: String(parts.count), speed: parts.speed };
    },
  },
  sudoku: {
    settings: [
      { id: "size", label: "Size", options: SUDOKU_SIZES.map((size) => ({ id: size, label: SUDOKU_CONFIG[size].label, hint: `${SUDOKU_CONFIG[size].side} × ${SUDOKU_CONFIG[size].side}` })) },
      { id: "difficulty", label: "Difficulty", options: SUDOKU_DIFFICULTIES.map((difficulty) => ({ id: difficulty, label: SUDOKU_LABELS[difficulty] })) },
    ],
    board: (values) => sudokuVariant(values.size as SudokuSize, values.difficulty),
    values: (board) => {
      const [first, second] = board.split("-");
      return second ? { size: first, difficulty: second } : { size: "normal", difficulty: first };
    },
  },
  "fruit-slice": boardPicker("fruit-slice", "mode", "Mode", { "": "Three lives; a bomb ends the run", arcade: "A timed rush with bonus fruit", zen: "A calm timed run without bombs" }),
  stacker: boardPicker("stacker", "rules", "Rules", { "": "The original, forgiving rules", classic: "Strict: every miss trims the block" }),
  "gem-chase": NO_SETTINGS,
  "space-blaster": NO_SETTINGS,
  zip: boardPicker("zip", "level", "Difficulty"),
  patches: NO_SETTINGS,
  tango: NO_SETTINGS,
  queens: NO_SETTINGS,
};

/** Whether a wager can use this game and board (mirrors `_wager_board_direction`). */
export function isWagerBoard(game: string, board: string) {
  if (!isCompetitiveGame(game) || board.startsWith("daily-")) return false;
  if (game === "snake" && board.startsWith("peace-")) return false;
  return isLeaderboardBoard(game, board);
}

/** Sudoku is scored by time (lower wins); every other game by points. */
export const lowerWins = (game: string) => game === "sudoku";
export const formatScore = (game: string, score: number) => (lowerWins(game) ? formatDuration(score) : score.toLocaleString("en"));

export function gameTitle(game: string) {
  return ARCADE_GAMES.find((g) => g.id === game)?.title ?? game;
}
/** The chosen settings, e.g. "No Borders · Large · 3 fruit · Fast"; empty for games without settings. */
export function boardLabel(game: string, board: string) {
  if (!isCompetitiveGame(game)) return board;
  if (game === "snake") return snakeBoardLabel(board);
  const spec = GAME_SETTINGS[game];
  const values = spec.values(board);
  return spec.settings.map((setting) => setting.options.find((option) => option.id === values[setting.id])?.label ?? values[setting.id]).join(" · ");
}
export function setupLabel(game: string, board: string) {
  const label = boardLabel(game, board);
  return label ? `${gameTitle(game)} · ${label}` : gameTitle(game);
}

/** 1,250 → "1,250"; 2,500,000 → "2.5M". */
export function compactCoins(value: number) {
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2))}M`;
  if (value >= 100_000) return `${Number((value / 1_000).toFixed(0))}K`;
  return value.toLocaleString("en");
}

/**
 * The board a competitive play page locks in for each game component. `seed` makes generated puzzles
 * the same for both players of a wager round.
 */
export type CompetitionLock = { game: CompetitiveGame; board: string; seed: string };

export const TOURNAMENT_GAMES_NOTE =
  "Tournaments rotate through Flutter, Snake, Fruit Slice and Tower Stacker. Wagers can use every minigame.";

export const TOURNAMENT_RULES = [
  "One tournament a day, 00:00–24:00 UTC. Every eligible game takes a turn before any game repeats.",
  "Joining is free. Runs count once you've joined, if they start and finish inside the day on the day's game and settings.",
  "Your best run is your entry. Equal scores: whoever set it first ranks higher.",
  "Results are final a few minutes after the day ends. Rewards need at least two ranked players.",
];

export const WAGER_RULES_TEXT = (rules: WagerRules) => [
  `Best of five: first to ${rules.winsNeeded} round wins takes the whole pot (both stakes, no fee).`,
  "Each round, both players get one run of the round's game with the host's settings. Higher score wins (in Sudoku, the faster time); equal results tie the round and it doesn't count.",
  "Logic puzzles and Sudoku give both players the same puzzle. Sudoku hints aren't allowed in a wager, and its clock keeps running while paused.",
  `Each round has ${rules.roundHours} hours. If only one player posts a valid result in time, they win the round by forfeit. If neither does, the round is void.`,
  "Leaving a run ends it with the score so far. A run the server rejects, or one that never finishes, counts as no result.",
  `Two void rounds in a row abandon the match and refund both stakes. After ${rules.maxRounds} rounds the leader wins; level is a draw and both stakes are refunded.`,
  `Open challenges expire after ${rules.openHours} hours and refund the host. Once accepted, nobody can cancel.`,
];

// --- Payloads from the database functions ---------------------------------------------------------

export type RewardTier = { from: number; to: number; coins: number; items: string[] };
export type TournamentStatus = "upcoming" | "active" | "finalizing" | "final";

export type TournamentDay = { id: string; day: string; game: string; board: string; startsAt: string; endsAt: string; status: TournamentStatus };

export type Tournament = TournamentDay & {
  direction: "high" | "low";
  rotation: number;
  rewards: RewardTier[];
  minPlayers: number;
  players: number;
  entrants: number;
  leaderboard: { rank: number; name: string; score: number; achievedAt: string; you: boolean; coins: number; items: string[] }[];
  you: {
    joinedAt: string;
    runs: number;
    score: number | null;
    achievedAt: string | null;
    rank: number | null;
    place: number | null;
    coins: number;
    items: string[];
    claimedAt: string | null;
  } | null;
};

export type TournamentState = {
  now: string;
  today: string;
  balance: number;
  schedule: TournamentDay[];
  tournament: Tournament | null;
  history: { id: string; day: string; game: string; score: number | null; place: number | null; coins: number; items: string[]; claimedAt: string | null; final: boolean }[];
  claimable: { id: string; day: string; game: string; place: number; coins: number; items: string[] }[];
};

export type WagerRules = {
  minStake: number;
  maxStake: number;
  openHours: number;
  roundHours: number;
  winsNeeded: number;
  maxRounds: number;
  maxOpen: number;
  maxGames: number;
};

export type WagerStatus = "open" | "cancelled" | "expired" | "active" | "completed" | "drawn" | "abandoned";
export type PlayerState = "waiting" | "playing" | "done";

export type WagerRound = {
  round: number;
  game: string;
  board: string;
  direction: "high" | "low";
  openedAt: string;
  deadline: string;
  outcome: "host" | "opponent" | "tie" | "void" | null;
  reason: "score" | "tie" | "forfeit" | "no_results" | null;
  hostScore: number | null;
  opponentScore: number | null;
  hostState: PlayerState;
  opponentState: PlayerState;
  yourAttempt: "playing" | "scored" | "invalid" | "late" | null;
};

export type Wager = {
  id: string;
  status: WagerStatus;
  stake: number;
  pot: number;
  games: { game: string; board: string }[];
  you: "host" | "opponent" | null;
  host: { name: string };
  opponent: { name: string } | null;
  hostWins: number;
  opponentWins: number;
  winsNeeded: number;
  maxRounds: number;
  roundHours: number;
  currentRound: number;
  winner: "host" | "opponent" | null;
  endReason: "wins" | "round_limit" | "no_results" | "cancelled" | "expired" | null;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
  rounds: WagerRound[];
};

export type WagerState = Wager & { now: string; balance: number };
export type WagerList = { now: string; balance: number; rules: WagerRules; open: Wager[]; mine: Wager[] };

export const WAGER_STATUS_LABELS: Record<WagerStatus, string> = {
  open: "Open",
  cancelled: "Cancelled",
  expired: "Expired",
  active: "In progress",
  completed: "Finished",
  drawn: "Draw",
  abandoned: "Abandoned",
};

/** One-line outcome for the viewer. */
export function wagerOutcome(w: Wager): string {
  if (w.status === "completed") {
    const won = w.winner === w.you;
    const by = w.endReason === "round_limit" ? " on rounds after the round limit" : "";
    if (!w.you) return `${w.winner === "host" ? w.host.name : w.opponent?.name} won${by}.`;
    return won ? `You won the pot of ${w.pot.toLocaleString("en")} Coins${by}.` : `You lost your ${w.stake.toLocaleString("en")}-Coin stake${by}.`;
  }
  if (w.status === "drawn") return "Draw after the round limit. Both stakes were refunded.";
  if (w.status === "abandoned") return "Two rounds in a row had no results, so the match was abandoned and both stakes refunded.";
  if (w.status === "cancelled") return "Cancelled by the host. The stake was refunded.";
  if (w.status === "expired") return "Nobody accepted in time. The stake was refunded.";
  return "";
}

// --- Request bodies -----------------------------------------------------------------------------

export const wagerGamesSchema = z
  .array(z.object({ game: z.string().max(40), board: z.string().max(40) }))
  .min(1, "Pick at least one game.")
  .max(5, "Pick up to five games.")
  .refine((list) => list.every((g) => isWagerBoard(g.game, g.board)), "One of those games or settings can't be used in a wager.")
  .refine((list) => new Set(list.map((g) => `${g.game}:${g.board}`)).size === list.length, "Each game and settings pair can only be picked once.");

export const createWagerSchema = z.object({
  request: z.uuid(),
  stake: z.number().int().positive(),
  games: wagerGamesSchema,
});

export const wagerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), expectedStake: z.number().int().positive() }),
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("attempt"), round: z.number().int().positive(), game: z.string().max(40), board: z.string().max(40) }),
]);

export const tournamentActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join"), tournament: z.uuid() }),
  z.object({ action: z.literal("claim"), tournament: z.uuid() }),
  z.object({ action: z.literal("run"), tournament: z.uuid(), game: z.string().max(40), board: z.string().max(40) }),
]);

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function placeLabel(place: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = place % 100;
  return `${place}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
