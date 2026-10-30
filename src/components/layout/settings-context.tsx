"use client";

import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { DEFAULT_PIN_STYLE, DEFAULT_SETTINGS, type Preferences } from "@/lib/preferences";

const SettingsContext = createContext<Preferences>({ ...DEFAULT_SETTINGS, pinStyle: DEFAULT_PIN_STYLE });

export function SettingsProvider({ value, children }: { value: Preferences; children: ReactNode }) {
  const { theme, motion } = value;
  // Theme and motion CSS keys off <html> (`:root[data-…]`) rather than `:root:has(…)`, which made
  // every DOM change re-check the whole page. AppShell's inline script sets these before first paint.
  useLayoutEffect(() => {
    const root = document.documentElement.dataset;
    root.appTheme = theme;
    root.motion = motion;
    return () => {
      delete root.appTheme;
      delete root.motion;
    };
  }, [theme, motion]);
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

/** The signed-in account's preferences, refreshed with the layout after every save. */
export function useSettings() {
  return useContext(SettingsContext);
}
