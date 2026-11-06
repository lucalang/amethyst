"use client";

import "./boosters.css";
import type { CSSProperties } from "react";
import { Clover } from "lucide-react";
import { boosterLook, luckColor, type Booster } from "@/lib/boosters";
import { cn } from "@/lib/utils";

export const luckStyle = (color: string) => ({ "--luck": color }) as CSSProperties;
export const tierStyle = (booster: Pick<Booster, "id" | "multiplier">) => luckStyle(boosterLook(booster.id, booster.multiplier).color);

/** "7x luck" in the color of the highest tier it contains; stacked totals get a second ring. */
export function LuckBadge({ luck, tiers, className }: { luck: number; tiers: readonly Pick<Booster, "id" | "multiplier">[]; className?: string }) {
  const stacked = !tiers.some((tier) => tier.multiplier === luck);
  return (
    <span className={cn("bx-luck", className)} style={luckStyle(luckColor(luck, tiers))} data-stacked={stacked || undefined}>
      <Clover aria-hidden className="size-3.5" />
      {luck}x luck
    </span>
  );
}

const LEAF = "M0 0C-4.5-2.5-6.5-6-4.5-8C-3-9.5-.8-9 0-7C.8-9 3-9.5 4.5-8C6.5-6 4.5-2.5 0 0Z";
const SPOTS = [
  [6, 10, 2.6, -12, 7],
  [22, 64, 1.8, 24, 9],
  [38, 18, 1.5, 40, 8],
  [58, 76, 2.4, -30, 10],
  [72, 12, 2, 8, 7.5],
  [88, 52, 2.8, -6, 9.5],
  [12, 82, 1.6, 52, 8.5],
  [48, 44, 1.3, -48, 11],
  [80, 86, 1.7, 30, 7],
  [94, 22, 1.4, -22, 10.5],
] as const;

/** Decorative four-leaf clovers behind boosted reveals. The parent needs `bx-boosted` and a positioned box. */
export function CloverField({ color }: { color: string }) {
  return (
    <span aria-hidden className="bx-clovers" style={luckStyle(color)}>
      {SPOTS.map(([x, y, size, rotate, duration], index) => (
        <svg key={index} viewBox="-10 -10 20 20" style={{ "--x": `${x}%`, "--y": `${y}%`, "--s": `${size}rem`, "--r": `${rotate}deg`, "--d": `${duration}s` } as CSSProperties}>
          <g fill="currentColor">
            {[45, 135, 225, 315].map((angle) => (
              <path key={angle} d={LEAF} transform={`rotate(${angle})`} />
            ))}
          </g>
          <path d="M0 0q1.5 5 5 8.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ))}
    </span>
  );
}
