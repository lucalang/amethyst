import type { CSSProperties } from "react";

/** Lucide icon names are stored in kebab case ("gamepad-2"). */
export const ICON_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "gamepad-2" → "Gamepad2" (the lucide-react export name without its "Lucide" prefix). */
export function pascalIconName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export const ACCENT_SWATCHES = [
  { name: "Amethyst", value: "#a57cff" },
  { name: "Orchid", value: "#e879f9" },
  { name: "Rose", value: "#f472a8" },
  { name: "Coral", value: "#f87171" },
  { name: "Amber", value: "#fbbf24" },
  { name: "Tangerine", value: "#fb923c" },
  { name: "Lime", value: "#a3e635" },
  { name: "Emerald", value: "#34d399" },
  { name: "Teal", value: "#2dd4bf" },
  { name: "Sky", value: "#38bdf8" },
  { name: "Indigo", value: "#818cf8" },
  { name: "Silver", value: "#cbd5e1" },
] as const;

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

const toHex = (rgb: [number, number, number]) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/**
 * The accent lightened (mixed toward white) until it reaches at least 4.5:1 contrast
 * against the pitch-black surfaces, so text, icons and focus rings stay readable.
 */
export function readableAccent(hex: string): string {
  let rgb = channels(hex);
  for (let step = 0; step < 20 && luminance(rgb) < 0.18; step += 1) {
    rgb = rgb.map((c) => c + (255 - c) * 0.12) as [number, number, number];
  }
  return toHex(rgb);
}

export const isAccentColor = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-f]{6}$/.test(value);

/**
 * Scoped CSS variables for one collection's accent. `--ring` is overridden too, so
 * focus outlines inside the scope follow the collection's (contrast-safe) accent.
 */
export function accentStyle(accent: string | null | undefined): CSSProperties | undefined {
  if (!isAccentColor(accent)) return undefined;
  const text = readableAccent(accent);
  const [r, g, b] = channels(text);
  return {
    "--ca": text,
    "--ca-soft": `rgb(${r} ${g} ${b} / 0.12)`,
    "--ca-line": `rgb(${r} ${g} ${b} / 0.35)`,
    "--ca-glow": `rgb(${r} ${g} ${b} / 0.45)`,
    "--ring": text,
  } as CSSProperties;
}
