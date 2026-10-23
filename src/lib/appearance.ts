import { DEFAULT_SETTINGS, HEADING_LEVELS, type EditorFont, type EditorWidth, type HeadingLevel, type Settings } from "@/lib/preferences";
import { THEMES } from "@/lib/themes";

export const EDITOR_FONT_STACKS: Record<EditorFont, string> = {
  sans: "var(--font-manrope), ui-sans-serif, system-ui, sans-serif",
  serif: "var(--font-literata), ui-serif, Georgia, serif",
  mono: "var(--font-jetbrains), ui-monospace, SFMono-Regular, Menlo, monospace",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

export const EDITOR_WIDTH_VALUES: Record<EditorWidth, string> = {
  narrow: "38rem",
  medium: "46rem",
  wide: "60rem",
  full: "none",
};

/** True while the account has not chosen its own heading colors, so they follow the theme. */
export function headingsFollowTheme(settings: Pick<Settings, "headingColors">): boolean {
  return HEADING_LEVELS.every((level) => settings.headingColors[level] === DEFAULT_SETTINGS.headingColors[level]);
}

/** The heading colors in effect: the account's own, or the active theme's palette. */
export function effectiveHeadingColors(settings: Pick<Settings, "headingColors" | "theme">): Record<HeadingLevel, string> {
  return headingsFollowTheme(settings) ? THEMES[settings.theme].headings : settings.headingColors;
}

/** CSS custom properties for the account's settings. Every value comes from a validated enum, number or hex color. */
export function settingsStyle(settings: Settings): string {
  const vars: Record<string, string> = {
    "--card-hover-scale": String(1 + settings.hoverScale / 100),
    "--editor-font": EDITOR_FONT_STACKS[settings.editorFont],
    "--editor-font-size": `${settings.editorFontSize}px`,
    "--editor-line-height": String(settings.editorLineSpacing / 100),
    "--editor-width": EDITOR_WIDTH_VALUES[settings.editorWidth],
  };
  const headings = effectiveHeadingColors(settings);
  for (const level of HEADING_LEVELS) vars[`--md-${level}`] = headings[level];
  return `:root:root{${Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(";")}}`;
}
