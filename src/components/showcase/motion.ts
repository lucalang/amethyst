"use client";

import { useSyncExternalStore } from "react";
import { useSettings } from "@/components/layout/settings-context";
import type { MotionLevel } from "@/lib/preferences";

const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** The account's animation level, lowered to "off" while the system asks for reduced motion. */
export function useMotionLevel(): MotionLevel {
  const { motion } = useSettings();
  const reduced = useSyncExternalStore(subscribe, () => window.matchMedia(REDUCED).matches, () => false);
  return reduced ? "off" : motion;
}

let webgl: boolean | undefined;

/** Whether this browser can create a WebGL context (checked once, then the probe context is released). */
export function webglAvailable(): boolean {
  if (webgl !== undefined) return webgl;
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    webgl = Boolean(context);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}
