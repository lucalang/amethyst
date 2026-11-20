import * as z from "zod";

/**
 * Spin Wheel: a personal decision tool. Users save named wheels of their own choices and spin them for a fair,
 * uniformly random pick. Nothing here touches Coins, prizes or the reward economy.
 *
 * Limits match the checks on public.spin_wheels.
 */
export const MAX_WHEELS = 100;
export const MAX_CHOICES = 100;
export const MAX_CHOICE_LENGTH = 80;
export const MAX_WHEEL_NAME = 80;
export const MIN_SPIN_CHOICES = 2;

export const PALETTES = {
  amethyst: { label: "Amethyst", colors: ["#6d28d9", "#c084fc", "#9333ea", "#e9d5ff", "#7c3aed", "#f0abfc", "#4c1d95", "#d8b4fe"] },
  sunset: { label: "Sunset", colors: ["#e11d48", "#fb923c", "#f43f5e", "#fde047", "#c2410c", "#fdba74"] },
  ocean: { label: "Ocean", colors: ["#0369a1", "#5eead4", "#1e3a8a", "#38bdf8", "#0f766e", "#a5f3fc"] },
  forest: { label: "Forest", colors: ["#166534", "#bef264", "#3f6212", "#86efac", "#15803d", "#d9f99d"] },
  candy: { label: "Candy", colors: ["#f472b6", "#60a5fa", "#facc15", "#34d399", "#a78bfa", "#fb7185"] },
  bright: { label: "Bright", colors: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"] },
  mono: { label: "Graphite", colors: ["#18181b", "#a1a1aa", "#3f3f46", "#e4e4e7", "#27272a", "#71717a"] },
} as const;
export type PaletteId = keyof typeof PALETTES;
export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];

export const DURATIONS = {
  quick: { label: "Quick", ms: 3000, turns: 4 },
  normal: { label: "Normal", ms: 5200, turns: 6 },
  long: { label: "Long", ms: 8000, turns: 9 },
} as const;
export type DurationId = keyof typeof DURATIONS;

const HEX = /^#[0-9a-f]{6}$/i;

export const choiceSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Invalid choice id."),
    label: z
      .string()
      .trim()
      .min(1, "Choices can't be empty.")
      .max(MAX_CHOICE_LENGTH, `Choices can be at most ${MAX_CHOICE_LENGTH} characters.`)
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Choices can't contain control characters."),
    /** A custom slice color, or null to follow the palette. */
    color: z.string().regex(HEX, "Colors must be hex, like #a855f7.").nullable(),
  })
  .strict();

export const settingsSchema = z
  .object({
    palette: z.enum(PALETTE_IDS as [PaletteId, ...PaletteId[]]),
    duration: z.enum(["quick", "normal", "long"]),
    sound: z.boolean(),
  })
  .strict();

export const wheelNameSchema = z
  .string()
  .trim()
  .min(1, "Give the wheel a name.")
  .max(MAX_WHEEL_NAME, `Names can be at most ${MAX_WHEEL_NAME} characters.`)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Names can't contain control characters.");

const choicesSchema = z.array(choiceSchema).max(MAX_CHOICES, `A wheel can hold at most ${MAX_CHOICES} choices.`);

export const createWheelSchema = z.object({ name: wheelNameSchema, choices: choicesSchema, settings: settingsSchema }).strict();

export const updateWheelSchema = z
  .object({
    name: wheelNameSchema.optional(),
    choices: choicesSchema.optional(),
    settings: settingsSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.choices !== undefined || value.settings !== undefined, "Nothing to update.");

export type WheelChoice = z.infer<typeof choiceSchema>;
export type WheelSettings = z.infer<typeof settingsSchema>;
export type WheelContent = { name: string; choices: WheelChoice[]; settings: WheelSettings };
export type SavedWheel = WheelContent & { id: string; version: number; updatedAt: string };

export const DEFAULT_SETTINGS: WheelSettings = { palette: "amethyst", duration: "normal", sound: true };

/** Parse stored JSON leniently: anything malformed falls back rather than breaking the page. */
export function readChoices(value: unknown): WheelChoice[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = choiceSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, MAX_CHOICES);
}

export function readSettings(value: unknown): WheelSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(value && typeof value === "object" ? value : {}) };
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export function newChoiceId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

/** Lines of pasted or typed text as choice labels: trimmed, empty lines skipped, duplicates kept. */
export function parseChoiceLines(text: string) {
  let shortened = 0;
  const labels = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[\u0000-\u001f\u007f]/g, " ").trim())
    .filter(Boolean)
    .map((line) => {
      if (line.length <= MAX_CHOICE_LENGTH) return line;
      shortened += 1;
      return line.slice(0, MAX_CHOICE_LENGTH).trimEnd();
    });
  return { labels, shortened };
}

/** A uniformly random index in [0, count), without modulo bias (rejection sampling on crypto randomness). */
export function randomIndex(count: number): number {
  if (count <= 1) return 0;
  const limit = Math.floor(0x1_0000_0000 / count) * count;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % count;
  }
}

/** A uniform random number in [0, 1), from crypto randomness. */
export function randomUnit(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 0x1_0000_0000;
}

/** Slice colors: custom colors win; otherwise the palette repeats, never putting the same color side by side. */
export function sliceColors(choices: readonly WheelChoice[], palette: PaletteId): string[] {
  const colors: readonly string[] = PALETTES[palette].colors;
  const result = choices.map((choice, index) => choice.color ?? colors[index % colors.length]);
  const last = result.length - 1;
  if (last > 0 && !choices[last].color && result[last] === result[0]) {
    result[last] = colors.find((color) => color !== result[0] && color !== result[last - 1]) ?? result[last];
  }
  return result;
}

function luminance(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Dark or light label text, whichever contrasts more with the slice. */
export function labelColor(hex: string) {
  const light = luminance(hex);
  const onWhite = 1.05 / (light + 0.05);
  const onDark = (light + 0.05) / (luminance("#111827") + 0.05);
  return onDark >= onWhite ? "#111827" : "#ffffff";
}

export function sameContent(a: WheelContent, b: WheelContent) {
  return a.name === b.name && JSON.stringify(a.choices) === JSON.stringify(b.choices) && JSON.stringify(a.settings) === JSON.stringify(b.settings);
}

export const STARTER_CHOICES = ["Pizza", "Tacos", "Sushi", "Pasta", "Curry", "Burgers"];

export function starterWheel(name = "New wheel"): WheelContent {
  // Fixed ids, so a starter rendered on the server matches the client (ids only need to be unique per wheel).
  return { name, choices: STARTER_CHOICES.map((label, index) => ({ id: `starter-${index}`, label, color: null })), settings: { ...DEFAULT_SETTINGS } };
}
