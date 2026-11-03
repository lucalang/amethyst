import type { HeadingLevel } from "@/lib/preferences";

/**
 * App themes. The colors, fonts and shapes live in `globals.css` (one block per theme,
 * keyed by `data-app-theme` on the app shell and `data-theme-preview` for previews);
 * this file holds what the app needs in TypeScript: names, descriptions and the
 * heading palette used when the account has not picked its own heading colors.
 */
export const THEME_IDS = ["amethyst", "rose-noir", "paper", "terminal", "arcade", "ocean", "crimson", "sakura", "oled", "mint", "higanbana", "koi-bridge", "petal-diary", "spring-sonata", "sabbath-neon", "chrome-runner", "menacing-gold", "hell-butterfly", "quintet-bloom", "snow-glam"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeInfo = {
  name: string;
  description: string;
  mode: "dark" | "light";
  headings: Record<HeadingLevel, string>;
};

export const THEMES: Record<ThemeId, ThemeInfo> = {
  amethyst: {
    name: "Amethyst",
    description: "The original: pitch black, amethyst accents and a touch of rose.",
    mode: "dark",
    headings: { h1: "#dccfff", h2: "#b36dff", h3: "#e24fd9", h4: "#ff7fae", h5: "#c6b9e8", h6: "#a39bbd" },
  },
  "rose-noir": {
    name: "Rose Noir",
    description: "Velvet darkness with rose and champagne gold, and elegant serif headings.",
    mode: "dark",
    headings: { h1: "#ffe1e8", h2: "#f0789a", h3: "#e6b673", h4: "#ff9fb5", h5: "#d9c2c8", h6: "#a8939a" },
  },
  paper: {
    name: "Paper & Ink",
    description: "A light, warm paper page with deep ink-blue accents and bookish headings.",
    mode: "light",
    headings: { h1: "#1c1712", h2: "#2f4f8f", h3: "#9a3b26", h4: "#4f6b3a", h5: "#5f5649", h6: "#6f6455" },
  },
  terminal: {
    name: "Retro Terminal",
    description: "Phosphor green on a dark CRT, monospaced text, square corners and faint scanlines.",
    mode: "dark",
    headings: { h1: "#eafff0", h2: "#4dff8f", h3: "#ffb000", h4: "#7fffd4", h5: "#a8d8b5", h6: "#7fa98b" },
  },
  arcade: {
    name: "Neon Arcade",
    description: "Midnight grid, hot magenta and cyan neon, and pixel-font headings.",
    mode: "dark",
    headings: { h1: "#fff6c2", h2: "#ff3fd2", h3: "#22e5ff", h4: "#ffe14d", h5: "#c7bfff", h6: "#9a92c8" },
  },
  ocean: {
    name: "Ocean Glass",
    description: "Deep-sea navy, frosted glass surfaces, aqua light and a warm coral highlight.",
    mode: "dark",
    headings: { h1: "#e2f8fc", h2: "#4fd6ec", h3: "#ff9a85", h4: "#8be8c9", h5: "#a9c6d2", h6: "#7d9aa6" },
  },
  crimson: {
    name: "Crimson Night",
    description: "Near-black with a red glow, vivid crimson accents and cool steel highlights.",
    mode: "dark",
    headings: { h1: "#ffe9ea", h2: "#ff5a67", h3: "#b9c4d9", h4: "#ff9f7a", h5: "#d2c2c4", h6: "#9e8f91" },
  },
  sakura: {
    name: "Soft Sakura",
    description: "A pale blossom-pink page, cherry accents, a leafy green and graceful serif headings.",
    mode: "light",
    headings: { h1: "#3a1a26", h2: "#b8336a", h3: "#4d7a45", h4: "#8e4fb0", h5: "#6b5560", h6: "#7d6a72" },
  },
  oled: {
    name: "Monochrome OLED",
    description: "True black, crisp white and quiet greys. No color, maximum contrast.",
    mode: "dark",
    headings: { h1: "#ffffff", h2: "#e6e6e6", h3: "#c4c4c4", h4: "#a8a8a8", h5: "#959595", h6: "#808080" },
  },
  mint: {
    name: "Mint Paper",
    description: "Cool mint paper, deep green ink and a plum accent, fresh and calm.",
    mode: "light",
    headings: { h1: "#10261e", h2: "#1d6b52", h3: "#8a3f6b", h4: "#2d5f8a", h5: "#4e5f58", h6: "#64736c" },
  },
  higanbana: {
    name: "Higanbana",
    description: "Charcoal night, spider-lily red, bone-white stitching and literary serif headings.",
    mode: "dark",
    headings: { h1: "#f6ebe6", h2: "#f0414e", h3: "#ddd3c9", h4: "#ff8f86", h5: "#c9b8b3", h6: "#988a86" },
  },
  "koi-bridge": {
    name: "Koi Bridge",
    description: "Pale river water, koi orange and slate ink, with ripples and a koi drifting by.",
    mode: "light",
    headings: { h1: "#1b2a33", h2: "#c4501f", h3: "#1f6f78", h4: "#8a5a2e", h5: "#4a5d63", h6: "#66777c" },
  },
  "petal-diary": {
    name: "Petal Diary",
    description: "Warm diary paper with faint ruled lines, cherry-red ink, sky blue and handwritten headings.",
    mode: "light",
    headings: { h1: "#341e1c", h2: "#b3263e", h3: "#2f6fa8", h4: "#c25b74", h5: "#6b5650", h6: "#85706a" },
  },
  "spring-sonata": {
    name: "Spring Sonata",
    description: "Ivory and piano black, sky-blue accents, blossom pink and a faint music staff.",
    mode: "light",
    headings: { h1: "#161820", h2: "#2b6cb0", h3: "#c2477a", h4: "#3f7d5a", h5: "#575a66", h6: "#707380" },
  },
  "sabbath-neon": {
    name: "Sabbath Neon",
    description: "Black-violet night, hot pink and acid teal, blood red and rough brush headings.",
    mode: "dark",
    headings: { h1: "#fbeefe", h2: "#ff2e88", h3: "#19e3c8", h4: "#ff4d4d", h5: "#c9b6d4", h6: "#9a88a6" },
  },
  "chrome-runner": {
    name: "Chrome Runner",
    description: "Blue-black city night, signal yellow, cyan and magenta, with bold block headings.",
    mode: "dark",
    headings: { h1: "#f4fbff", h2: "#f5e112", h3: "#22d3ee", h4: "#ff4fd8", h5: "#a9bccf", h6: "#7d8ea3" },
  },
  "menacing-gold": {
    name: "Menacing Gold",
    description: "Royal purple, Art Deco gold rays and teal, with dramatic serif headings.",
    mode: "dark",
    headings: { h1: "#fff6dc", h2: "#e5b53a", h3: "#2ec4b6", h4: "#e07be0", h5: "#c9b8dc", h6: "#9a88b0" },
  },
  "hell-butterfly": {
    name: "Hell Butterfly",
    description: "Ink black and paper white with flame orange and a dark butterfly in the corner.",
    mode: "dark",
    headings: { h1: "#ffffff", h2: "#ff7a1a", h3: "#e9e4da", h4: "#ffb067", h5: "#bdb7ae", h6: "#8f8a83" },
  },
  "quintet-bloom": {
    name: "Quintet Bloom",
    description: "Blush white with five sweet accent colors and soft rounded headings.",
    mode: "light",
    headings: { h1: "#3a2030", h2: "#c2386f", h3: "#2f7f8f", h4: "#3d72b8", h5: "#3d8a4f", h6: "#9a6410" },
  },
  "snow-glam": {
    name: "Snow Glam",
    description: "Ice white and glacier blue with hot pink, lavender and drifting snowflakes.",
    mode: "light",
    headings: { h1: "#1a243a", h2: "#d81b72", h3: "#2f78b7", h4: "#6a4fc4", h5: "#4f5d75", h6: "#6a778c" },
  },
};
