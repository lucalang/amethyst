"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_PIN_STYLE, DEFAULT_SETTINGS, type Preferences } from "@/lib/preferences";

const SettingsContext = createContext<Preferences>({ ...DEFAULT_SETTINGS, pinStyle: DEFAULT_PIN_STYLE });

export function SettingsProvider({ value, children }: { value: Preferences; children: ReactNode }) {
  return <SettingsContext value={value}>{children}</SettingsContext>;
}

/** The signed-in account's preferences, refreshed with the layout after every save. */
export function useSettings() {
  return useContext(SettingsContext);
}
