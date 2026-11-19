"use client";

import type { ReactNode } from "react";
import { slimHides } from "@/lib/slim";
import { useSettings } from "./settings-context";

/** Whether Slim Amethyst is on for this account. */
export const useSlimMode = () => useSettings().slimMode;

/**
 * Renders its children unless Slim Amethyst is on and `href` points into a hidden area (then `fallback`).
 * Interface only: the routes themselves stay protected by their own checks.
 */
export function HideInSlim({ href, children, fallback = null }: { href: string; children: ReactNode; fallback?: ReactNode }) {
  return useSlimMode() && slimHides(href) ? fallback : children;
}
