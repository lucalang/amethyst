import { z } from "zod";

/**
 * How the 3D artwork viewer stages a card: backdrop, lighting, reflections, glow and motion.
 * A look never changes the artwork, its frame or the theme. New controls only need a field here
 * (with a default, so saved looks stay valid) and a use in the viewer.
 */
export const VIEWER_BACKGROUNDS = ["theme", "color"] as const;
export const VIEWER_LIGHTING = ["studio", "neutral", "dramatic", "soft"] as const;
export type ViewerBackground = (typeof VIEWER_BACKGROUNDS)[number];
export type ViewerLighting = (typeof VIEWER_LIGHTING)[number];

export const VIEWER_LIGHTING_INFO: Record<ViewerLighting, { name: string; description: string }> = {
  studio: { name: "Studio", description: "Rim lights in your theme’s colors" },
  neutral: { name: "Neutral", description: "Even, colour-true light" },
  dramatic: { name: "Dramatic", description: "Hard key light and bright rims" },
  soft: { name: "Soft", description: "Low-contrast, diffuse light" },
};

/** Slider ranges (percentages unless noted). */
export const VIEWER_RANGES = {
  lightIntensity: { min: 40, max: 180 },
  reflections: { min: 0, max: 200 },
  glow: { min: 0, max: 200 },
  hoverSpeed: { min: 0, max: 100 },
  /** Degrees the card leans toward the pointer at full motion. */
  hoverTilt: { min: 0, max: 30 },
} as const;

export type ViewerLook = {
  background: ViewerBackground;
  backgroundColor: string;
  lighting: ViewerLighting;
  lightIntensity: number;
  reflections: number;
  glow: number;
  hoverSpeed: number;
  hoverTilt: number;
  idleMotion: boolean;
};

/** The original Showcase look. */
export const CLASSIC_VIEWER_LOOK: ViewerLook = {
  background: "theme",
  backgroundColor: "#0d0b12",
  lighting: "studio",
  lightIntensity: 100,
  reflections: 100,
  glow: 100,
  hoverSpeed: 70,
  hoverTilt: 17,
  idleMotion: false,
};

const int = (range: { min: number; max: number }) => z.number().int().min(range.min).max(range.max);

/** Any saved look: missing fields take the classic value, unknown fields are rejected. */
export const viewerLookSchema = z
  .object({
    background: z.enum(VIEWER_BACKGROUNDS).optional(),
    backgroundColor: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i, "Use a hex color like #0d0b12.")
      .transform((value) => value.toLowerCase())
      .optional(),
    lighting: z.enum(VIEWER_LIGHTING).optional(),
    lightIntensity: int(VIEWER_RANGES.lightIntensity).optional(),
    reflections: int(VIEWER_RANGES.reflections).optional(),
    glow: int(VIEWER_RANGES.glow).optional(),
    hoverSpeed: int(VIEWER_RANGES.hoverSpeed).optional(),
    hoverTilt: int(VIEWER_RANGES.hoverTilt).optional(),
    idleMotion: z.boolean().optional(),
  })
  .strict()
  .transform((value): ViewerLook => ({ ...CLASSIC_VIEWER_LOOK, ...Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) }));

/** Reads a stored look leniently (invalid data falls back to the classic look). */
export function readViewerLook(raw: unknown): ViewerLook {
  const parsed = viewerLookSchema.safeParse(raw);
  return parsed.success ? parsed.data : { ...CLASSIC_VIEWER_LOOK };
}

export const sameLook = (a: ViewerLook, b: ViewerLook) => (Object.keys(CLASSIC_VIEWER_LOOK) as (keyof ViewerLook)[]).every((key) => a[key] === b[key]);

/** Built-in presets. Ids are stable (they are saved in settings); add new ones at the end. */
export const BUILTIN_VIEWER_PRESETS = [
  { id: "classic", name: "Classic", description: "The original Showcase look", look: CLASSIC_VIEWER_LOOK },
  {
    id: "neutral-studio",
    name: "Neutral Studio",
    description: "Even light, a calm grey backdrop and gentle motion",
    look: { ...CLASSIC_VIEWER_LOOK, background: "color", backgroundColor: "#18171c", lighting: "neutral", reflections: 70, glow: 35, hoverSpeed: 60, hoverTilt: 14 },
  },
  {
    id: "dramatic",
    name: "Dramatic Showcase",
    description: "Deep shadows, bright rims, strong glow and a slow idle sway",
    look: { ...CLASSIC_VIEWER_LOOK, background: "color", backgroundColor: "#050307", lighting: "dramatic", lightIntensity: 125, reflections: 150, glow: 170, hoverSpeed: 80, hoverTilt: 22, idleMotion: true },
  },
  {
    id: "minimal",
    name: "Minimal Inspection",
    description: "Soft light, no glow and barely any tilt, for studying details",
    look: { ...CLASSIC_VIEWER_LOOK, background: "color", backgroundColor: "#101012", lighting: "soft", lightIntensity: 95, reflections: 30, glow: 0, hoverSpeed: 35, hoverTilt: 5 },
  },
] as const satisfies readonly { id: string; name: string; description: string; look: ViewerLook }[];

export type BuiltinViewerPresetId = (typeof BUILTIN_VIEWER_PRESETS)[number]["id"];
export const BUILTIN_VIEWER_PRESET_IDS = BUILTIN_VIEWER_PRESETS.map((preset) => preset.id) as [BuiltinViewerPresetId, ...BuiltinViewerPresetId[]];
export const DEFAULT_VIEWER_PRESET: BuiltinViewerPresetId = "classic";
/** A custom preset is saved per account (see the viewer_presets table). */
export type CustomViewerPreset = { id: string; name: string; look: ViewerLook };
export const MAX_VIEWER_PRESETS = 24;
export const MAX_PRESET_NAME = 40;

export const presetNameSchema = z
  .string()
  .trim()
  .min(1, "Name the preset.")
  .max(MAX_PRESET_NAME, `Preset names can be at most ${MAX_PRESET_NAME} characters.`)
  .refine((value) => ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127), "Preset names cannot contain control characters.");

/** The preset a saved id points at; a deleted custom preset falls back to the default. */
export function findViewerPreset(id: string, custom: readonly CustomViewerPreset[]): { id: string; name: string; look: ViewerLook; builtin: boolean } {
  const builtin = BUILTIN_VIEWER_PRESETS.find((preset) => preset.id === id);
  if (builtin) return { id: builtin.id, name: builtin.name, look: builtin.look, builtin: true };
  const saved = custom.find((preset) => preset.id === id);
  if (saved) return { ...saved, builtin: false };
  const fallback = BUILTIN_VIEWER_PRESETS[0];
  return { id: fallback.id, name: fallback.name, look: fallback.look, builtin: true };
}

/** The look in effect: unsaved tweaks on top of the chosen preset win over the preset itself. */
export function resolveViewerLook(presetId: string, tweaks: ViewerLook | null, custom: readonly CustomViewerPreset[]): ViewerLook {
  return tweaks ?? findViewerPreset(presetId, custom).look;
}
