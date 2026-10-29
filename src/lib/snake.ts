import { z } from "zod";

/** Snake setup registries. Ids are stored in settings and record keys: never rename them. */

export const SNAKE_MODE_IDS = ["classic", "wrap", "obstacles", "timed"] as const;
export type SnakeMode = (typeof SNAKE_MODE_IDS)[number];

export type SnakeModeInfo = {
  label: string;
  /** One line for the setup picker. */
  blurb: string;
  /** The active rules, shown before and during a round. */
  rules: string;
  wrap: boolean;
  obstacles: boolean;
  /** Round length for timed modes. */
  seconds: number | null;
};

export const SNAKE_MODES: Record<SnakeMode, SnakeModeInfo> = {
  classic: {
    label: "Classic",
    blurb: "The original. Grow as long as you can.",
    rules: "Walls and your own body end the run.",
    wrap: false,
    obstacles: false,
    seconds: null,
  },
  wrap: {
    label: "Wrap",
    blurb: "No walls: leave one edge, return on the other.",
    rules: "Edges wrap around. Only your own body ends the run.",
    wrap: true,
    obstacles: false,
    seconds: null,
  },
  obstacles: {
    label: "Obstacles",
    blurb: "Stone blocks turn the board into a maze.",
    rules: "Walls, stone blocks and your own body end the run.",
    wrap: false,
    obstacles: true,
    seconds: null,
  },
  timed: {
    label: "Timed",
    blurb: "Eat as much fruit as you can in 60 seconds.",
    rules: "60 seconds on the clock. Walls and your body still end the run early.",
    wrap: false,
    obstacles: false,
    seconds: 60,
  },
};

export const SNAKE_SIZE_IDS = ["small", "medium", "large"] as const;
export type SnakeSize = (typeof SNAKE_SIZE_IDS)[number];
export const SNAKE_SIZES: Record<SnakeSize, { label: string; grid: number }> = {
  small: { label: "Small", grid: 14 },
  medium: { label: "Medium", grid: 20 },
  large: { label: "Large", grid: 26 },
};

export const SNAKE_FRUIT_IDS = ["apple", "cherry", "orange", "strawberry", "grapes", "banana", "watermelon", "salad"] as const;
export type SnakeFruitChoice = (typeof SNAKE_FRUIT_IDS)[number];
export type SnakeFruit = Exclude<SnakeFruitChoice, "salad">;
export const SNAKE_FRUIT_LABELS: Record<SnakeFruitChoice, string> = {
  apple: "Apple",
  cherry: "Cherries",
  orange: "Orange",
  strawberry: "Strawberry",
  grapes: "Grapes",
  banana: "Banana",
  watermelon: "Watermelon",
  salad: "Fruit Salad",
};
export const SALAD_FRUITS = SNAKE_FRUIT_IDS.filter((id): id is SnakeFruit => id !== "salad");

export const FRUIT_COUNT = { min: 1, max: 12, presets: [1, 3, 5, 10] } as const;

export const snakeSetupSchema = z
  .object({
    mode: z.enum(SNAKE_MODE_IDS),
    fruit: z.enum(SNAKE_FRUIT_IDS),
    fruitCount: z.number().int().min(FRUIT_COUNT.min).max(FRUIT_COUNT.max),
    size: z.enum(SNAKE_SIZE_IDS),
  })
  .strict();
export type SnakeSetup = z.infer<typeof snakeSetupSchema>;

export const DEFAULT_SNAKE_SETUP: SnakeSetup = { mode: "classic", fruit: "apple", fruitCount: 1, size: "medium" };

/**
 * The record a setup's scores count toward. Fruit type doesn't change play, so it isn't part of it.
 * The original game (Classic, Medium, one fruit) keeps the unnamed record from before modes existed.
 */
export function snakeVariant(setup: SnakeSetup): string {
  if (setup.mode === "classic" && setup.size === "medium" && setup.fruitCount === 1) return "";
  return `${setup.mode}-${setup.size}-${setup.fruitCount}`;
}

export function isSnakeVariant(value: string): boolean {
  if (value === "") return true;
  const [mode, size, count, ...rest] = value.split("-");
  if (rest.length || !/^\d{1,2}$/.test(count ?? "")) return false;
  const setup = snakeSetupSchema.safeParse({ mode, size, fruit: "apple", fruitCount: Number(count) });
  return setup.success && snakeVariant(setup.data) === value;
}
