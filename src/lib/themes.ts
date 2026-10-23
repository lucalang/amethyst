import type { HeadingLevel } from "@/lib/preferences";

/**
 * App themes. The colors, fonts and shapes live in `globals.css` (one block per theme,
 * keyed by `data-app-theme` on the app shell and `data-theme-preview` for previews);
 * this file holds what the app needs in TypeScript: names, descriptions and the
 * heading palette used when the account has not picked its own heading colors.
 */
export const THEME_IDS = ["amethyst", "rose-noir", "paper", "terminal", "arcade"] as const;
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
};
