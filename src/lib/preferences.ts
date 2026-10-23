import { z } from "zod";
import { ARTWORK_FRAME_IDS, DEFAULT_ARTWORK_FRAME, type ArtworkFrameId } from "@/lib/frames";
import { THEME_IDS, type ThemeId } from "@/lib/themes";
import { artworkUrl } from "@/lib/validation/entries";

/** How pinned/progress details are shown on cover artwork. */
export const PIN_STYLES = ["current", "clean"] as const;
export type PinStyle = (typeof PIN_STYLES)[number];
export const DEFAULT_PIN_STYLE: PinStyle = "current";

export const isPinStyle = (value: unknown): value is PinStyle => PIN_STYLES.includes(value as PinStyle);

export const MOTION_LEVELS = ["off", "subtle", "full"] as const;
export const EDITOR_FONTS = ["sans", "serif", "mono", "system"] as const;
export const EDITOR_WIDTHS = ["narrow", "medium", "wide", "full"] as const;
export const LIBRARY_DENSITIES = ["comfortable", "compact", "large"] as const;
export const CHECKLIST_MODES = ["bottom", "collapse", "keep"] as const;
export const STARTUP_DESTINATIONS = ["home", "collection", "last"] as const;
export const HEADING_LEVELS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;
export const SHORTCUT_ACTIONS = ["search", "newEntry", "newFile", "newChecklist", "newFolder", "toggleExplorer"] as const;
/** How often the opening animation plays on a fresh load of the app. */
export const INTRO_FREQUENCIES = ["every", "daily", "weekly", "never"] as const;
export const MAX_FAN_COLLECTIONS = 200;

export type MotionLevel = (typeof MOTION_LEVELS)[number];
export type EditorFont = (typeof EDITOR_FONTS)[number];
export type EditorWidth = (typeof EDITOR_WIDTHS)[number];
export type LibraryDensity = (typeof LIBRARY_DENSITIES)[number];
export type ChecklistMode = (typeof CHECKLIST_MODES)[number];
export type StartupDestination = (typeof STARTUP_DESTINATIONS)[number];
export type HeadingLevel = (typeof HEADING_LEVELS)[number];
export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type IntroFrequency = (typeof INTRO_FREQUENCIES)[number];

export const HOVER_SCALE_RANGE = { min: 0, max: 12 } as const;
export const FONT_SIZE_RANGE = { min: 14, max: 22 } as const;
/** Line spacing in hundredths (175 = 1.75). */
export const LINE_SPACING_RANGE = { min: 130, max: 230, step: 5 } as const;

/** Modifiers in a fixed order, then one key; "" turns the shortcut off. */
export const SHORTCUT_PATTERN = /^(?:Mod\+)?(?:Alt\+)?(?:Shift\+)?(?:[A-Z0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Space|Enter|Backspace|Delete|Tab|Escape|Home|End|PageUp|PageDown|Insert|Plus|[^\s+A-Za-z0-9])$/u;

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Use a hex color like #b36dff.").transform((value) => value.toLowerCase());
const shortcut = z.string().max(40).refine((value) => value === "" || SHORTCUT_PATTERN.test(value), "Unsupported shortcut.");
const hasControls = (value: string) => [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

/** Home sections below the welcome header, in their default order. */
export const HOME_SECTION_IDS = ["featured", "pinned", "recent", "collections", "tasks", "glance"] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];
export type HomeSection = { id: HomeSectionId; hidden: boolean };
export const MAX_GREETING_LENGTH = 80;
export const MAX_FEATURED_CAPTION_LENGTH = 120;

export type HomeFeatured = { kind: "entry"; entryId: string } | { kind: "image"; url: string; caption: string } | null;

/** Known sections once each, in the saved order; sections added later are appended. */
function normalizeHomeSections(list: { id: string; hidden: boolean }[]): HomeSection[] {
  const seen = new Set<string>();
  const sections: HomeSection[] = [];
  for (const item of list) {
    if (seen.has(item.id) || !HOME_SECTION_IDS.includes(item.id as HomeSectionId)) continue;
    seen.add(item.id);
    sections.push({ id: item.id as HomeSectionId, hidden: item.hidden });
  }
  for (const id of HOME_SECTION_IDS) if (!seen.has(id)) sections.push({ id, hidden: false });
  return sections;
}

export const DEFAULT_SETTINGS = {
  theme: "amethyst" as ThemeId,
  motion: "full" as MotionLevel,
  introFrequency: "daily" as IntroFrequency,
  cardShine: true,
  hoverScale: 5,
  editorFont: "sans" as EditorFont,
  editorFontSize: 16,
  editorLineSpacing: 175,
  editorWidth: "medium" as EditorWidth,
  headingColors: { h1: "#dccfff", h2: "#b36dff", h3: "#e24fd9", h4: "#ff7fae", h5: "#c6b9e8", h6: "#a39bbd" } as Record<HeadingLevel, string>,
  libraryDensity: "comfortable" as LibraryDensity,
  checklistMode: "bottom" as ChecklistMode,
  startup: "home" as StartupDestination,
  startupCollectionId: null as string | null,
  shortcuts: {
    search: "/",
    newEntry: "Alt+Shift+N",
    newFile: "Alt+N",
    newChecklist: "Alt+C",
    newFolder: "Alt+Shift+F",
    toggleExplorer: "Alt+E",
  } as Record<ShortcutAction, string>,
  /** Library card details (separate from the pinned-entry presentation, which is `pinStyle`). */
  cardTitle: true,
  cardLabels: false,
  cardProgress: true,
  homeSections: HOME_SECTION_IDS.map((id) => ({ id, hidden: false })) as HomeSection[],
  /** "" keeps the built-in welcome. */
  homeGreeting: "",
  homeFeatured: null as HomeFeatured,
  /** Collections whose covers may appear in the Home cover fan; null = every collection (including new ones), [] = no fan. */
  homeFanCollections: null as string[] | null,
  /** Decoration around artwork in Showcase and the artwork viewer (independent of the theme). */
  artworkFrame: DEFAULT_ARTWORK_FRAME as ArtworkFrameId,
  /** Sound effects in Arcade games (audio only starts after the player interacts). */
  arcadeSound: true,
};
export type Settings = typeof DEFAULT_SETTINGS;

/**
 * Saved shortcuts, with actions added after they were saved filled in from the defaults.
 * A new default that is already taken by another action starts unassigned instead.
 */
function completeShortcuts(saved: Partial<Record<ShortcutAction, string>>): Record<ShortcutAction, string> {
  const used = new Set(Object.values(saved).filter(Boolean));
  const complete = {} as Record<ShortcutAction, string>;
  for (const action of SHORTCUT_ACTIONS) {
    const value = saved[action];
    if (value !== undefined) complete[action] = value;
    else {
      const fallback = DEFAULT_SETTINGS.shortcuts[action];
      complete[action] = used.has(fallback) ? "" : fallback;
      if (complete[action]) used.add(fallback);
    }
  }
  return complete;
}

const settingFields = {
  theme: z.enum(THEME_IDS),
  motion: z.enum(MOTION_LEVELS),
  introFrequency: z.enum(INTRO_FREQUENCIES),
  cardShine: z.boolean(),
  hoverScale: z.number().int().min(HOVER_SCALE_RANGE.min).max(HOVER_SCALE_RANGE.max),
  editorFont: z.enum(EDITOR_FONTS),
  editorFontSize: z.number().int().min(FONT_SIZE_RANGE.min).max(FONT_SIZE_RANGE.max),
  editorLineSpacing: z.number().int().min(LINE_SPACING_RANGE.min).max(LINE_SPACING_RANGE.max),
  editorWidth: z.enum(EDITOR_WIDTHS),
  headingColors: z.object(Object.fromEntries(HEADING_LEVELS.map((level) => [level, hexColor])) as Record<HeadingLevel, typeof hexColor>).strict(),
  libraryDensity: z.enum(LIBRARY_DENSITIES),
  checklistMode: z.enum(CHECKLIST_MODES),
  startup: z.enum(STARTUP_DESTINATIONS),
  startupCollectionId: z.uuid().nullable(),
  shortcuts: z
    .object(Object.fromEntries(SHORTCUT_ACTIONS.map((action) => [action, shortcut.optional()])) as Record<ShortcutAction, z.ZodOptional<typeof shortcut>>)
    .strict()
    .transform(completeShortcuts)
    .refine((value) => {
      const used = Object.values(value).filter(Boolean);
      return new Set(used).size === used.length;
    }, "Two actions cannot share a shortcut."),
  cardTitle: z.boolean(),
  cardLabels: z.boolean(),
  cardProgress: z.boolean(),
  homeSections: z
    .array(z.object({ id: z.string().max(40), hidden: z.boolean() }).strict())
    .max(40)
    .transform(normalizeHomeSections),
  homeGreeting: z
    .string()
    .trim()
    .max(MAX_GREETING_LENGTH, `Greetings can be at most ${MAX_GREETING_LENGTH} characters.`)
    .refine((value) => !hasControls(value), "Greetings cannot contain line breaks or control characters."),
  homeFeatured: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("entry"), entryId: z.uuid() }).strict(),
      z
        .object({
          kind: z.literal("image"),
          url: artworkUrl.pipe(z.string({ error: "Add an image link or upload an image." })),
          caption: z
            .string()
            .trim()
            .max(MAX_FEATURED_CAPTION_LENGTH, `Captions can be at most ${MAX_FEATURED_CAPTION_LENGTH} characters.`)
            .refine((value) => !hasControls(value), "Captions cannot contain line breaks or control characters."),
        })
        .strict(),
    ])
    .nullable(),
  homeFanCollections: z
    .array(z.uuid())
    .max(MAX_FAN_COLLECTIONS)
    .transform((ids) => [...new Set(ids)])
    .nullable(),
  artworkFrame: z.enum(ARTWORK_FRAME_IDS),
  arcadeSound: z.boolean(),
} satisfies { [K in keyof Settings]: z.ZodType };

/** Any subset of settings; nested groups (heading colors, shortcuts) are replaced whole. */
export const settingsPatchSchema = z.object(settingFields).partial().strict();
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Stored settings with each invalid or missing field falling back to its default. */
export function readSettings(raw: unknown): Settings {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const settings = structuredClone(DEFAULT_SETTINGS);
  for (const key of Object.keys(settingFields) as (keyof Settings)[]) {
    const parsed = settingFields[key].safeParse(source[key]);
    if (parsed.success) (settings as Record<string, unknown>)[key] = parsed.data;
  }
  return settings;
}

/** Account-level preferences: pin style and intro date are columns, everything else lives in `settings`. */
export const preferencesSchema = z
  .object({
    pinStyle: z.enum(PIN_STYLES).optional(),
    introSeenOn: z.iso.date().optional(),
    settings: settingsPatchSchema.refine((value) => Object.keys(value).length > 0, "Nothing to update.").optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update.");

export type Preferences = Settings & { pinStyle: PinStyle };

export const DEFAULT_PREFERENCES: Preferences = { ...DEFAULT_SETTINGS, pinStyle: DEFAULT_PIN_STYLE };
export type PreferenceKey = keyof Preferences;

/** Whether a preference still has its default value (deep comparison for nested settings). */
export function isDefaultPreference(preferences: Preferences, key: PreferenceKey): boolean {
  return JSON.stringify(preferences[key]) === JSON.stringify(DEFAULT_PREFERENCES[key]);
}

/** The request body that puts the given preferences back to their defaults. */
export function resetBody(keys: readonly PreferenceKey[]) {
  const settings: Record<string, unknown> = {};
  for (const key of keys) if (key !== "pinStyle") settings[key] = structuredClone(DEFAULT_SETTINGS[key]);
  return {
    ...(keys.includes("pinStyle") ? { pinStyle: DEFAULT_PIN_STYLE } : {}),
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
  };
}
