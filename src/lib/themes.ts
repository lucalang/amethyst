import type { HeadingLevel } from "@/lib/preferences";

/**
 * App themes. The colors, fonts and shapes live in `globals.css` (one block per theme,
 * keyed by `data-app-theme` on the app shell and `data-theme-preview` for previews);
 * this file holds what the app needs in TypeScript: names, descriptions and the
 * heading palette used when the account has not picked its own heading colors.
 */
export const THEME_IDS = ["amethyst", "rose-noir", "paper", "terminal", "arcade", "ocean", "crimson", "sakura", "oled", "mint"] as const;
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
};
