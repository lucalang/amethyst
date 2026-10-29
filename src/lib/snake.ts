import { z } from "zod";

/** Snake setup registries. Ids are stored in settings and record keys: never rename them. */

export const SNAKE_MODE_IDS = [
  "classic",
  "wrap",
  "peace",
  "obstacles",
  "wall",
  "portal",
  "twin",
  "winged",
  "yinyang",
  "cheese",
  "ghost",
  "key",
  "sokoban",
  "poison",
  "statue",
  "light",
  "dimension",
  "minesweeper",
  "timed",
  "blender",
] as const;
export type SnakeMode = (typeof SNAKE_MODE_IDS)[number];

/**
 * Modes that can go into Blender. A mix's record key is a bitmask over this list, so it is
 * append-only: never reorder or remove entries.
 */
export const BLEND_MODE_IDS = [
  "wrap",
  "obstacles",
  "timed",
  "peace",
  "wall",
  "portal",
  "twin",
  "winged",
  "yinyang",
  "cheese",
  "ghost",
  "key",
  "sokoban",
  "poison",
  "statue",
  "light",
  "dimension",
  "minesweeper",
] as const;
export type BlendMode = (typeof BLEND_MODE_IDS)[number];

/** Name and a short tooltip line for each mode. */
export const SNAKE_MODES: Record<SnakeMode, { label: string; tip: string }> = {
  classic: { label: "Classic", tip: "Walls and your body are deadly" },
  wrap: { label: "No Borders", tip: "Edges wrap around" },
  peace: { label: "Peace", tip: "Nothing can end your run" },
  obstacles: { label: "Obstacles", tip: "Rocks scattered around" },
  wall: { label: "Wall", tip: "Each fruit leaves a brick" },
  portal: { label: "Portal", tip: "Fruit opens linked portals" },
  twin: { label: "Two Heads", tip: "Fruit swaps head and tail" },
  winged: { label: "Winged", tip: "Fruit flies around" },
  yinyang: { label: "Yin Yang", tip: "Steer two mirrored snakes" },
  cheese: { label: "Cheese", tip: "Holes in your body are safe" },
  ghost: { label: "Ghost", tip: "Fruit makes your body passable" },
  key: { label: "Key", tip: "Grab keys to unlock fruit" },
  sokoban: { label: "Boxes", tip: "Push crates onto targets" },
  poison: { label: "Poison", tip: "Gray fruit scrambles controls" },
  statue: { label: "Statue", tip: "Your tail turns to stone" },
  light: { label: "Light", tip: "See only around your head" },
  dimension: { label: "Dimension", tip: "Fruit flips between two layers" },
  minesweeper: { label: "Landmines", tip: "Don't linger in danger zones" },
  timed: { label: "Timed", tip: "60 seconds on the clock" },
  blender: { label: "Blender", tip: "Mix several modes" },
};

/** Seconds on the clock when Timed is in play. */
export const TIMED_SECONDS = 60;

/** Pairs that can't share a round, with the reason shown on the unavailable option. */
const CLASHES: [BlendMode, BlendMode, string][] = [
  ["key", "sokoban", "Key and Boxes both lock fruit away"],
  ["winged", "key", "Flying fruit can't sit in a locked box"],
  ["winged", "sokoban", "Flying fruit can't sit in a crate"],
];

/** Why `mode` can't join this mix, or null when it can. */
export function blendClash(blend: readonly BlendMode[], mode: BlendMode): string | null {
  for (const [a, b, reason] of CLASHES) {
    if ((a === mode && blend.includes(b)) || (b === mode && blend.includes(a))) return reason;
  }
  return null;
}

export const SNAKE_SIZE_IDS = ["small", "medium", "large"] as const;
export type SnakeSize = (typeof SNAKE_SIZE_IDS)[number];
export const SNAKE_SIZES: Record<SnakeSize, { label: string; grid: number }> = {
  small: { label: "Small", grid: 14 },
  medium: { label: "Medium", grid: 20 },
  large: { label: "Large", grid: 26 },
};

export const SNAKE_FRUIT_IDS = [
  "apple",
  "cherry",
  "orange",
  "strawberry",
  "grapes",
  "banana",
  "watermelon",
  "lemon",
  "pineapple",
  "pear",
  "peach",
  "kiwi",
  "blueberry",
  "plum",
  "mango",
  "salad",
] as const;
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
  lemon: "Lemon",
  pineapple: "Pineapple",
  pear: "Pear",
  peach: "Peach",
  kiwi: "Kiwi",
  blueberry: "Blueberry",
  plum: "Plum",
  mango: "Mango",
  salad: "Fruit Salad",
};
export const SALAD_FRUITS = SNAKE_FRUIT_IDS.filter((id): id is SnakeFruit => id !== "salad");

export const FRUIT_COUNT = { min: 1, max: 12, presets: [1, 3, 5, 10] } as const;

/** Milliseconds per move at the start and the fastest it gets; each fruit speeds up by an even share. */
export const SNAKE_SPEED_IDS = ["slow", "normal", "fast"] as const;
export type SnakeSpeed = (typeof SNAKE_SPEED_IDS)[number];
export const SNAKE_SPEEDS: Record<SnakeSpeed, { label: string; tip: string; start: number; min: number }> = {
  slow: { label: "Slow", tip: "Relaxed pace", start: 200, min: 115 },
  normal: { label: "Normal", tip: "The classic pace", start: 140, min: 70 },
  fast: { label: "Fast", tip: "Quick reflexes needed", start: 95, min: 50 },
};
/** Fruit eaten before the top speed is reached. */
export const SPEED_RAMP = 35;

const blendSchema = z
  .array(z.enum(BLEND_MODE_IDS))
  .max(BLEND_MODE_IDS.length)
  .refine((blend) => new Set(blend).size === blend.length && blend.every((mode) => !blendClash(blend, mode)), "Those modes can't be mixed.");

export const snakeSetupSchema = z
  .object({
    mode: z.enum(SNAKE_MODE_IDS),
    fruit: z.enum(SNAKE_FRUIT_IDS),
    fruitCount: z.number().int().min(FRUIT_COUNT.min).max(FRUIT_COUNT.max),
    size: z.enum(SNAKE_SIZE_IDS),
    speed: z.enum(SNAKE_SPEED_IDS).default("normal"),
    /** Blender's mix; kept while another mode is picked so switching back restores it. */
    blend: blendSchema.default([]),
  })
  .strict();
export type SnakeSetup = z.infer<typeof snakeSetupSchema>;

export const DEFAULT_SNAKE_SETUP: SnakeSetup = { mode: "classic", fruit: "apple", fruitCount: 1, size: "medium", speed: "normal", blend: [] };

/** The rule set a setup plays with, in registry order (empty = Classic). */
export function activeModes(setup: Pick<SnakeSetup, "mode" | "blend">): BlendMode[] {
  if (setup.mode === "classic") return [];
  if (setup.mode !== "blender") return [setup.mode];
  return BLEND_MODE_IDS.filter((mode) => setup.blend.includes(mode));
}

/**
 * The record a setup's scores count toward. Fruit type doesn't change play, so it isn't part of it.
 * A mix is keyed by its modes (a one-mode mix is that mode), so the order modes were picked in
 * doesn't matter. The original game (Classic, Medium, one fruit) keeps the unnamed record.
 */
export function snakeVariant(setup: SnakeSetup): string {
  const modes = activeModes(setup);
  let key: string;
  if (modes.length === 0) key = "classic";
  else if (modes.length === 1) key = modes[0];
  else key = `x${modes.reduce((mask, mode) => mask | (1 << BLEND_MODE_IDS.indexOf(mode)), 0).toString(36)}`;
  // Normal speed keeps the keys records had before speeds existed.
  const speed = setup.speed === "normal" ? "" : `-${setup.speed}`;
  if (key === "classic" && setup.size === "medium" && setup.fruitCount === 1 && !speed) return "";
  return `${key}-${setup.size}-${setup.fruitCount}${speed}`;
}

export function isSnakeVariant(value: string): boolean {
  if (value === "") return true;
  const parts = value.split("-");
  if ((parts.length !== 3 && parts.length !== 4) || !/^\d{1,2}$/.test(parts[2])) return false;
  const [key, size, count, speed = "normal"] = parts;
  const mixed = /^x[0-9a-z]{1,6}$/.test(key);
  const mask = mixed ? parseInt(key.slice(1), 36) : 0;
  const setup = snakeSetupSchema.safeParse({
    mode: mixed ? "blender" : key,
    size,
    speed,
    fruit: "apple",
    fruitCount: Number(count),
    blend: BLEND_MODE_IDS.filter((_, index) => mask & (1 << index)),
  });
  return setup.success && snakeVariant(setup.data) === value;
}
