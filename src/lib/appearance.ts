import { HEADING_LEVELS, type EditorFont, type EditorWidth, type Settings } from "@/lib/preferences";

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

/** CSS custom properties for the account's settings. Every value comes from a validated enum, number or hex color. */
export function settingsStyle(settings: Settings): string {
  const vars: Record<string, string> = {
    "--card-hover-scale": String(1 + settings.hoverScale / 100),
    "--editor-font": EDITOR_FONT_STACKS[settings.editorFont],
    "--editor-font-size": `${settings.editorFontSize}px`,
    "--editor-line-height": String(settings.editorLineSpacing / 100),
    "--editor-width": EDITOR_WIDTH_VALUES[settings.editorWidth],
  };
  for (const level of HEADING_LEVELS) vars[`--md-${level}`] = settings.headingColors[level];
  return `:root:root{${Object.entries(vars).map(([name, value]) => `${name}:${value}`).join(";")}}`;
}
