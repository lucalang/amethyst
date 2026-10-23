"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EDITOR_FONT_STACKS, EDITOR_WIDTH_VALUES } from "@/lib/appearance";
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_RANGE,
  HEADING_LEVELS,
  LINE_SPACING_RANGE,
  type ChecklistMode,
  type EditorFont,
  type EditorWidth,
  type HeadingLevel,
  type Settings,
} from "@/lib/preferences";
import { ChoiceCards, ChoiceSetting, RangeInput, useSetting, type Choice } from "./setting-controls";
import { SettingRow } from "./settings-ui";

type EditorSettings = Pick<Settings, "editorFont" | "editorFontSize" | "editorLineSpacing" | "editorWidth" | "headingColors">;

const FONT_LABELS: Record<EditorFont, { title: string; description: string }> = {
  sans: { title: "Sans", description: "Manrope, clean and modern." },
  serif: { title: "Serif", description: "Literata, made for long reading." },
  mono: { title: "Mono", description: "JetBrains Mono, even columns." },
  system: { title: "System", description: "Your device’s own interface font." },
};

const FONT_OPTIONS: Choice<EditorFont>[] = (Object.keys(FONT_LABELS) as EditorFont[]).map((font) => ({
  value: font,
  ...FONT_LABELS[font],
  preview: (
    <span className="text-2xl text-foreground" style={{ fontFamily: EDITOR_FONT_STACKS[font] }}>
      Aa
    </span>
  ),
}));

const WIDTH_OPTIONS: Choice<EditorWidth>[] = [
  { value: "narrow", title: "Narrow", description: "Short lines, easy to follow." },
  { value: "medium", title: "Medium", description: "A comfortable default." },
  { value: "wide", title: "Wide", description: "More words per line." },
  { value: "full", title: "Full", description: "Use all the space available." },
].map((option) => ({
  ...option,
  value: option.value as EditorWidth,
  preview: (
    <span className="flex h-10 w-full items-center justify-center rounded-sm border border-dashed border-white/10">
      <span
        className="flex h-full flex-col justify-center gap-1 px-1"
        style={{ width: { narrow: "45%", medium: "60%", wide: "80%", full: "100%" }[option.value] }}
      >
        <span className="h-1 rounded-full bg-white/45" />
        <span className="h-1 rounded-full bg-white/25" />
        <span className="h-1 w-2/3 rounded-full bg-white/25" />
      </span>
    </span>
  ),
}));

const HEADING_SIZES: Record<HeadingLevel, string> = { h1: "1.6em", h2: "1.35em", h3: "1.18em", h4: "1.05em", h5: "1em", h6: "0.95em" };

/** Writing font, size, spacing, width and heading colors, with a live preview. */
export function EditorAppearanceSettings({ settings }: { settings: EditorSettings }) {
  const [font, setFont] = useSetting("editorFont", settings.editorFont);
  const [size, setSize] = useSetting("editorFontSize", settings.editorFontSize, 400);
  const [spacing, setSpacing] = useSetting("editorLineSpacing", settings.editorLineSpacing, 400);
  const [width, setWidth] = useSetting("editorWidth", settings.editorWidth);
  const [colors, setColors] = useSetting("headingColors", settings.headingColors, 500);
  const colorsAreDefault = HEADING_LEVELS.every((level) => colors[level] === DEFAULT_SETTINGS.headingColors[level]);

  return (
    <div className="space-y-8">
      <SettingRow labelId="editor-font-label" label="Writing font" description="The typeface for notes and headings.">
        <ChoiceCards name="editorFont" labelId="editor-font-label" value={font} options={FONT_OPTIONS} onChange={setFont} className="grid-cols-2 sm:grid-cols-4" />
      </SettingRow>

      <SettingRow labelId="editor-size-label" label="Text size">
        <RangeInput id="editor-size" labelId="editor-size-label" value={size} min={FONT_SIZE_RANGE.min} max={FONT_SIZE_RANGE.max} format={(px) => `${px}px`} onChange={setSize} marks={["Smaller", "Larger"]} />
      </SettingRow>

      <SettingRow labelId="editor-spacing-label" label="Line spacing">
        <RangeInput
          id="editor-spacing"
          labelId="editor-spacing-label"
          value={spacing}
          min={LINE_SPACING_RANGE.min}
          max={LINE_SPACING_RANGE.max}
          step={LINE_SPACING_RANGE.step}
          format={(value) => (value / 100).toFixed(2)}
          onChange={setSpacing}
          marks={["Tight", "Airy"]}
        />
      </SettingRow>

      <SettingRow labelId="editor-width-label" label="Document width" description="The maximum width of a line of text.">
        <ChoiceCards name="editorWidth" labelId="editor-width-label" value={width} options={WIDTH_OPTIONS} onChange={setWidth} className="grid-cols-2 sm:grid-cols-4" />
      </SettingRow>

      <SettingRow labelId="heading-colors-label" label="Heading colors" description="Each heading level keeps its own color, independent of the app theme.">
        <div className="space-y-3">
          <div role="group" aria-labelledby="heading-colors-label" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {HEADING_LEVELS.map((level) => (
              <label
                key={level}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-white/[0.09] bg-white/[0.02] px-3 py-2 transition-colors hover:border-amethyst/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  type="color"
                  value={colors[level]}
                  onChange={(event) => setColors({ ...colors, [level]: event.target.value.toLowerCase() })}
                  aria-label={`Heading ${level.slice(1)} color`}
                  className="size-7 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0 [&::-moz-color-swatch]:rounded [&::-moz-color-swatch]:border-white/20 [&::-webkit-color-swatch]:rounded [&::-webkit-color-swatch]:border-white/20 [&::-webkit-color-swatch-wrapper]:p-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: colors[level] }}>
                    Heading {level.slice(1)}
                  </span>
                  <span className="block font-mono text-[11px] text-muted-foreground uppercase">{colors[level]}</span>
                </span>
              </label>
            ))}
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={colorsAreDefault} onClick={() => setColors({ ...DEFAULT_SETTINGS.headingColors })}>
            <RotateCcw aria-hidden /> Reset colors
          </Button>
        </div>
      </SettingRow>

      <SettingRow label="Preview" description="How a note will look with these choices.">
        <div className="overflow-hidden rounded-lg border border-white/[0.08] bg-black/50 px-5 py-6">
          <div
            className="mx-auto transition-[max-width] duration-300"
            style={{
              fontFamily: EDITOR_FONT_STACKS[font],
              fontSize: `${size}px`,
              lineHeight: spacing / 100,
              maxWidth: EDITOR_WIDTH_VALUES[width],
            }}
          >
            {HEADING_LEVELS.slice(0, 3).map((level) => (
              <p key={level} className="font-bold" style={{ color: colors[level], fontSize: HEADING_SIZES[level], fontFamily: font === "sans" ? "var(--font-heading)" : undefined }}>
                {level === "h1" ? "Chapter notes" : level === "h2" ? "First impressions" : "Characters"}
              </p>
            ))}
            <p className="mt-1 text-foreground/90">
              The opening pages set a quiet, careful tone. Small details return later in ways that feel earned, and the pacing leaves room to think between scenes.
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 text-[0.85em]">
              {HEADING_LEVELS.slice(3).map((level) => (
                <span key={level} className="font-semibold" style={{ color: colors[level], fontSize: HEADING_SIZES[level] }}>
                  Heading {level.slice(1)}
                </span>
              ))}
            </p>
          </div>
        </div>
      </SettingRow>
    </div>
  );
}

const CHECKLIST_OPTIONS: Choice<ChecklistMode>[] = [
  { value: "bottom", title: "Move to bottom", description: "Completed tasks slide into a Done section below." },
  { value: "collapse", title: "Collapse completed", description: "Completed tasks move below and start folded away." },
  { value: "keep", title: "Keep in place", description: "Tasks stay exactly where they are when checked." },
];

export function ChecklistModeSetting({ value, labelId }: { value: ChecklistMode; labelId: string }) {
  return <ChoiceSetting settingKey="checklistMode" value={value} labelId={labelId} options={CHECKLIST_OPTIONS} />;
}
