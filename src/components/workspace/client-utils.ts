"use client";

import { useSyncExternalStore } from "react";

export const nodeQueryKey = (id: string) => ["workspace-node", id] as const;

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong. Check your connection and try again.";
}

export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage can be full or disabled; persistence here is best effort.
  }
}

/** Hydration-safe read of a localStorage value (null during SSR and hydration). */
export function useLocalStorageValue(key: string): string | null {
  return useSyncExternalStore(
    (onChange) => {
      const handler = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", handler);
      return () => window.removeEventListener("storage", handler);
    },
    () => readLocal(key),
    () => null,
  );
}

const noopSubscribe = () => () => undefined;

/** False during SSR and hydration, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
