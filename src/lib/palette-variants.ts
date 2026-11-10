import type { CSSProperties } from "react";

/**
 * Colour variants for surfaces designed in red (Admin, Vault). A variant turns every red of the design in
 * oklch: `hue` degrees around (signed, so a switch eases the short way), lighter for bright hues (`lift`),
 * `chroma` scaled. CSS does it with the same formula (`shiftedColor`), the 3D scenes in their last pass
 * (PALETTE_SHIFT_GLSL). Semantic colours (errors, statuses, coins) are outside the turned band or kept literal.
 * Each surface keeps its own registry and saved choice; ids are stored, never rename them.
 */
export type Palette = { hue: number; lift: number; chroma: number; ink: string };
export type PaletteVariant = { id: string; label: string; swatch: string; palette: Palette };

/** The design's own colours. */
export const BASE_PALETTE: Palette = { hue: 0, lift: 0, chroma: 1, ink: "#fff" };

export const PALETTE_VARIANTS = [
  { id: "purple", label: "Purple", swatch: "#b45fff", palette: { hue: -78, lift: 0.05, chroma: 0.95, ink: "#fff" } },
  { id: "blue", label: "Blue", swatch: "#3e83ff", palette: { hue: -121, lift: 0, chroma: 0.85, ink: "#fff" } },
  { id: "orange", label: "Orange", swatch: "#ff7200", palette: { hue: 30, lift: 0.18, chroma: 0.85, ink: "#fff" } },
  { id: "yellow", label: "Yellow", swatch: "#fbce00", palette: { hue: 72, lift: 0.55, chroma: 0.8, ink: "#1b1405" } },
  { id: "light-blue", label: "Light Blue", swatch: "#37bfff", palette: { hue: -147, lift: 0.3, chroma: 0.6, ink: "#04161f" } },
  { id: "rose", label: "Rose", swatch: "#ff5f9d", palette: { hue: -22, lift: 0.2, chroma: 0.85, ink: "#fff" } },
] as const satisfies readonly PaletteVariant[];

/** Custom properties read by every shifted colour below the element. */
export function paletteStyle(palette: Palette): CSSProperties {
  return {
    "--look-hue": String(palette.hue),
    "--look-lift": String(palette.lift),
    "--look-chroma": String(palette.chroma),
    "--look-ink": palette.ink,
  } as CSSProperties;
}

/** A literal design colour, turned like the stylesheets' (for inline SVG paint). */
export const shiftedColor = (color: string) =>
  `oklch(from ${color} min(calc(l * (1 + var(--look-lift, 0) * l)), max(l, 0.98)) calc(c * var(--look-chroma, 1)) calc(h + var(--look-hue, 0)))`;

/** [hue in radians, lift, chroma] for the `uPalette` uniform. */
export const paletteUniform = (palette: Palette): [number, number, number] => [(palette.hue * Math.PI) / 180, palette.lift, palette.chroma];

/**
 * GLSL (sRGB in, sRGB out) for a finish pass: `paletteShift(color)` with `uniform vec3 uPalette`. Only reds and
 * pinks (oklch hue within about ±32°, fading out by ±48°) turn, so gold and ember stay as drawn.
 */
export const PALETTE_SHIFT_GLSL = /* glsl */ `
uniform vec3 uPalette;
vec3 paletteShift(vec3 srgb) {
  if (abs(uPalette.x) < 1e-4 && uPalette.y < 1e-4 && abs(uPalette.z - 1.0) < 1e-4) return srgb;
  vec3 c = clamp(srgb, 0.0, 1.0);
  vec3 lin = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  vec3 lms = vec3(
    dot(lin, vec3(0.4122214708, 0.5363325363, 0.0514459929)),
    dot(lin, vec3(0.2119034982, 0.6806995451, 0.1073969566)),
    dot(lin, vec3(0.0883024619, 0.2817188376, 0.6299787005))
  );
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  float L = dot(lms, vec3(0.2104542553, 0.793617785, -0.0040720468));
  float A = dot(lms, vec3(1.9779984951, -2.428592205, 0.4505937099));
  float B = dot(lms, vec3(0.0259040371, 0.7827717662, -0.808675766));
  float C = length(vec2(A, B));
  float H = atan(B, A);
  float w = (1.0 - smoothstep(0.56, 0.84, abs(H))) * smoothstep(0.01, 0.04, C);
  L = mix(L, min(L * (1.0 + uPalette.y * L), max(L, 0.98)), w);
  C *= mix(1.0, uPalette.z, w);
  H += uPalette.x * w;
  A = C * cos(H);
  B = C * sin(H);
  vec3 q = vec3(L + 0.3963377774 * A + 0.2158037573 * B, L - 0.1055613458 * A - 0.0638541728 * B, L - 0.0894841775 * A - 1.291485548 * B);
  q = q * q * q;
  lin = max(vec3(
    dot(q, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
    dot(q, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
    dot(q, vec3(-0.0041960863, -0.7034186147, 1.707614701))
  ), 0.0);
  return mix(lin * 12.92, 1.055 * pow(lin, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, lin));
}
`;
