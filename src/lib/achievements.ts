import { z } from "zod";
import { ARCADE_GAMES, type ArcadeGameId } from "@/lib/arcade";

export type AchievementGroup = "Arcade" | "Archive" | "Discovery";
export type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  icon: string;
  group: AchievementGroup;
  metric: string;
  target: number;
  unit: string;
  game?: ArcadeGameId;
};

export const ACHIEVEMENTS = [
  { id: "four-figures", name: "Four Figures", description: "Reach the 1024 tile in one 2048 run.", icon: "Grid2X2", group: "Arcade", metric: "four_figures", target: 1024, unit: "tile", game: "2048" },
  { id: "double-trouble", name: "Double Trouble", description: "Reach the 2048 tile in one 2048 run.", icon: "Crown", group: "Arcade", metric: "double_trouble", target: 2048, unit: "tile", game: "2048" },
  { id: "taking-flight", name: "Taking Flight", description: "Pass 10 obstacles in one Flutter run.", icon: "Bird", group: "Arcade", metric: "flutter_obstacles", target: 10, unit: "obstacles", game: "flutter" },
  { id: "thread-the-needle", name: "Thread the Needle", description: "Pass 50 obstacles in one Flutter run.", icon: "Wind", group: "Arcade", metric: "flutter_obstacles", target: 50, unit: "obstacles", game: "flutter" },
  { id: "growing-appetite", name: "Growing Appetite", description: "Reach length 20 in one Snake run.", icon: "Apple", group: "Arcade", metric: "snake_length", target: 20, unit: "segments", game: "snake" },
  { id: "running-out-of-room", name: "Running Out of Room", description: "Reach length 50 in one Snake run.", icon: "Route", group: "Arcade", metric: "snake_length", target: 50, unit: "segments", game: "snake" },
  { id: "first-solution", name: "First Solution", description: "Correctly complete a Sudoku puzzle.", icon: "Grid3X3", group: "Arcade", metric: "sudoku_solved", target: 1, unit: "puzzle", game: "sudoku" },
  { id: "hard-thinking", name: "Hard Thinking", description: "Correctly complete a Hard Sudoku puzzle.", icon: "Brain", group: "Arcade", metric: "sudoku_hard_solved", target: 1, unit: "puzzle", game: "sudoku" },
  { id: "combo-starter", name: "Combo Starter", description: "Slice at least three fruits in one combo.", icon: "Cherry", group: "Arcade", metric: "fruit_combo", target: 3, unit: "fruit combo", game: "fruit-slice" },
  { id: "precision", name: "Precision", description: "Finish a run with at least 25 fruits sliced and no bomb hits.", icon: "Crosshair", group: "Arcade", metric: "fruit_precision", target: 1, unit: "clean run", game: "fruit-slice" },
  { id: "skyward", name: "Skyward", description: "Stack 20 blocks successfully in one Tower Stacker run.", icon: "Castle", group: "Arcade", metric: "stacker_height", target: 20, unit: "blocks", game: "stacker" },
  { id: "perfect-alignment", name: "Perfect Alignment", description: "Make five perfect placements consecutively in one Tower Stacker run.", icon: "Layers", group: "Arcade", metric: "stacker_streak", target: 5, unit: "perfect placements", game: "stacker" },
  { id: "first-chapter", name: "First Chapter", description: "Create and save a non-empty Markdown note.", icon: "Feather", group: "Archive", metric: "first_chapter", target: 1, unit: "saved note" },
  { id: "blueprint", name: "Blueprint", description: "Create a workspace template.", icon: "DraftingCompass", group: "Archive", metric: "blueprint", target: 1, unit: "template" },
  { id: "made-it-mine", name: "Made It Mine", description: "Customize a collection's icon, accent color, or banner.", icon: "Palette", group: "Archive", metric: "made_it_mine", target: 1, unit: "customization" },
  { id: "checked-off", name: "Checked Off", description: "Complete every task in one checklist file containing at least 10 tasks.", icon: "ListChecks", group: "Archive", metric: "checked_off", target: 10, unit: "tasks" },
  { id: "the-collector", name: "The Collector", description: "Complete 100 tasks across files included in cover progress.", icon: "Gem", group: "Archive", metric: "the_collector", target: 100, unit: "included tasks" },
  { id: "collection-complete", name: "Collection Complete", description: "Reach 100% progress on one entry with at least 20 included tasks.", icon: "BadgeCheck", group: "Archive", metric: "collection_complete", target: 100, unit: "%" },
  { id: "arcade-explorer", name: "Arcade Explorer", description: "Start a playable session in each of the six original Arcade games.", icon: "Joystick", group: "Discovery", metric: "arcade_explorer", target: 6, unit: "games" },
  { id: "personal-best", name: "Personal Best", description: "Improve an established record in three different games. First records set a baseline.", icon: "Medal", group: "Discovery", metric: "personal_best", target: 3, unit: "improved games" },
  { id: "gallery-visitor", name: "Gallery Visitor", description: "Open a collection in Showcase.", icon: "Images", group: "Discovery", metric: "gallery_visitor", target: 1, unit: "gallery" },
  { id: "closer-look", name: "Closer Look", description: "Manually rotate artwork in the 3D viewer.", icon: "Rotate3D", group: "Discovery", metric: "closer_look", target: 1, unit: "manual rotation" },
] as const satisfies readonly AchievementDefinition[];

export const ARCADE_GAME_FILTERS = ARCADE_GAMES.map(({ id, title }) => ({ id, title }));

export const ARCADE_EXPLORER_GAME_IDS = ["2048", "flutter", "snake", "sudoku", "fruit-slice", "stacker"] as const;
const gameStarted = z.object({ type: z.literal("game_started"), game: z.enum(ARCADE_EXPLORER_GAME_IDS) }).strict();
const runFinished = z.discriminatedUnion("game", [
  z.object({ type: z.literal("run_finished"), game: z.literal("2048"), maxTile: z.number().int().min(0).max(1_048_576) }).strict(),
  z.object({ type: z.literal("run_finished"), game: z.literal("flutter"), obstacles: z.number().int().min(0).max(100_000) }).strict(),
  z.object({ type: z.literal("run_finished"), game: z.literal("snake"), length: z.number().int().min(3).max(1000) }).strict(),
  z.object({ type: z.literal("run_finished"), game: z.literal("fruit-slice"), fruitsSliced: z.number().int().min(0).max(100_000), maxCombo: z.number().int().min(0).max(100), reason: z.enum(["bomb", "misses"]) }).strict(),
  z.object({ type: z.literal("run_finished"), game: z.literal("stacker"), height: z.number().int().min(0).max(100_000), perfectStreak: z.number().int().min(0).max(100_000) }).strict(),
]);
const runProgress = z.discriminatedUnion("game", [
  z.object({ type: z.literal("run_progress"), game: z.literal("2048"), maxTile: z.number().int().min(0).max(1_048_576) }).strict(),
  z.object({ type: z.literal("run_progress"), game: z.literal("flutter"), obstacles: z.number().int().min(0).max(100_000) }).strict(),
  z.object({ type: z.literal("run_progress"), game: z.literal("snake"), length: z.number().int().min(3).max(1000) }).strict(),
  z.object({ type: z.literal("run_progress"), game: z.literal("fruit-slice"), fruitsSliced: z.number().int().min(0).max(100_000), maxCombo: z.number().int().min(0).max(100) }).strict(),
  z.object({ type: z.literal("run_progress"), game: z.literal("stacker"), height: z.number().int().min(0).max(100_000), perfectStreak: z.number().int().min(0).max(100_000) }).strict(),
]);
export const achievementEventSchema = z.discriminatedUnion("type", [
  gameStarted,
  runFinished,
  runProgress,
  z.object({ type: z.literal("gallery_open") }).strict(),
  z.object({ type: z.literal("manual_rotation") }).strict(),
]);

export type AchievementEvent = z.infer<typeof achievementEventSchema>;
export type AchievementNotice = { id: string; earnedAt: string };

export const achievementDefinition = (id: string) => ACHIEVEMENTS.find((item) => item.id === id);