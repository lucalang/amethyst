"use client";

import type { CSSProperties } from "react";
import { useMotionLevel } from "@/components/showcase/motion";
import { useViewerAppearance, ViewerCustomizer } from "@/components/showcase/viewer-customizer";
import type { CustomViewerPreset, ViewerLook } from "@/lib/viewer-looks";

const LIGHT_ANGLE: Record<ViewerLook["lighting"], string> = { studio: "135deg", neutral: "160deg", dramatic: "115deg", soft: "180deg" };

/** A still, CSS-only impression of the look (no WebGL, so Settings never runs a second 3D scene). */
function LookPreview({ look }: { look: ViewerLook }) {
  const glow = look.glow / 100;
  const light = look.lightIntensity / 100;
  const gloss = look.reflections / 100;
  return (
    <div
      aria-hidden
      className="relative grid h-56 place-items-center overflow-hidden rounded-lg border border-white/[0.08] sm:h-64"
      style={{
        background:
          look.background === "color"
            ? `radial-gradient(60% 55% at 50% 45%, rgb(var(--accent-rgb) / ${0.17 * glow}), transparent 70%), ${look.backgroundColor}`
            : `radial-gradient(60% 55% at 50% 45%, rgb(var(--accent-rgb) / ${0.17 * glow}), transparent 70%), rgb(var(--paper-rgb))`,
      }}
    >
      <div
        className="relative aspect-[2/3] h-[72%] rounded-md bg-linear-to-br from-amethyst/60 via-surface to-rose/40"
        style={{
          transform: `perspective(700px) rotateY(${-look.hoverTilt * 0.6}deg) rotateX(${look.hoverTilt * 0.25}deg)`,
          filter: `brightness(${0.55 + 0.45 * light})${look.lighting === "dramatic" ? " contrast(1.2)" : look.lighting === "soft" ? " contrast(0.9)" : ""}`,
          boxShadow: `0 24px 50px -20px rgb(0 0 0 / 0.8), 0 0 ${40 * glow}px rgb(var(--accent-rgb) / ${0.35 * glow})`,
        }}
      >
        <span
          className="absolute inset-0 rounded-md"
          style={{ background: `linear-gradient(${LIGHT_ANGLE[look.lighting]}, rgb(255 255 255 / ${0.28 * gloss}), transparent 45%)` } as CSSProperties}
        />
      </div>
      <span className="absolute bottom-2 left-3 text-[11px] text-white/55">Preview · open any artwork in Showcase to see it in 3D</span>
    </div>
  );
}

export function ShowcaseLookSettings({ presets }: { presets: CustomViewerPreset[] }) {
  const appearance = useViewerAppearance(presets);
  const motion = useMotionLevel();
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <ViewerCustomizer appearance={appearance} motion={motion} />
      <div className="order-first lg:sticky lg:top-24 lg:order-none">
        <LookPreview look={appearance.look} />
      </div>
    </div>
  );
}
