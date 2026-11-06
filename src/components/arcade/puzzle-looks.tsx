"use client";

import type { CSSProperties } from "react";
import type { GameLook } from "@/lib/game-cosmetics";

/**
 * Cosmetics for the DOM puzzles (Zip, Patches, Tango, Queens). Most looks are CSS keyed on
 * `data-look-<category>` attributes (see `lookAttributes` and minigames.css); this file holds the
 * parts that need markup or color lists. Visual only: cells, clues, regions and rules never change.
 */

/** `data-look-<category>="<slug>"` for every equipped item, spread on a wrapper around the board. */
export function lookAttributes(look: GameLook) {
  return Object.fromEntries(Object.entries(look).map(([category, slug]) => [`data-look-${category}`, slug])) as Record<string, string>;
}

// ---------------------------------------------------------------------------
// Solve celebrations (shared)
// ---------------------------------------------------------------------------

export type Celebration = "confetti" | "stars" | "ripple" | "petals" | "hearts" | "bubbles" | "fireworks" | "snow";

/** Which celebration an equipped finish/effect item plays; unknown or default items play none. */
export const CELEBRATIONS: Record<string, Celebration> = {
  confetti: "confetti",
  stars: "stars",
  sparkle: "stars",
  ripple: "ripple",
  stamp: "ripple",
  petals: "petals",
  hearts: "hearts",
  bubbles: "bubbles",
  fizz: "bubbles",
  fireworks: "fireworks",
  snow: "snow",
};

const CONFETTI = ["#ffd84a", "#ff6f91", "#5fd0ff", "#7ad97a", "#b48cff", "#ff9a4a"];
const COLORS: Partial<Record<Celebration, string[]>> = {
  petals: ["#ffb3d1", "#ff8fbf", "#ffd6e6", "#f7a8c8"],
  hearts: ["#ff4d6d", "#ff8fab", "#e63977", "#ff6f91"],
  bubbles: ["#7cc4ff", "#b48cff", "#7ee0d8", "#ff9ed1"],
  snow: ["#ffffff", "#e3f2ff", "#cfe6ff"],
};
const COUNTS: Partial<Record<Celebration, number>> = { ripple: 3, stars: 16, bubbles: 18, fireworks: 36, snow: 32 };
/** Firework bursts: three launch points that pop one after another. */
const BURSTS = [
  [30, 35],
  [70, 28],
  [52, 62],
];
const frac = (n: number) => n - Math.floor(n);

/** One-shot overlay played when a puzzle is solved. Hidden for reduced motion via CSS. */
export function PuzzleCelebration({ kind }: { kind: Celebration }) {
  const count = COUNTS[kind] ?? 28;
  const colors = COLORS[kind] ?? CONFETTI;
  return (
    <div aria-hidden className={`puzzle-celebrate puzzle-celebrate-${kind}`}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        const reach = 30 + frac(i * 0.37) * 22;
        const burst = BURSTS[i % 3];
        const spark = ((Math.floor(i / 3) / (count / 3)) * Math.PI * 2) + i;
        const style = {
          "--x": `${frac(i * 0.618 + 0.1) * 100}%`,
          "--tx": kind === "fireworks" ? `${burst[0] + Math.cos(spark) * 18}%` : `${50 + Math.cos(a) * reach}%`,
          "--ty": kind === "fireworks" ? `${burst[1] + Math.sin(spark) * 18}%` : `${50 + Math.sin(a) * reach}%`,
          "--ox": `${burst[0]}%`,
          "--oy": `${burst[1]}%`,
          "--s": `${0.45 + frac(i * 0.29) * 0.7}rem`,
          "--r": `${Math.round(frac(i * 0.73) * 720 - 360)}deg`,
          "--d": `${(kind === "ripple" ? i * 0.22 : kind === "fireworks" ? (i % 3) * 0.35 : frac(i * 0.41) * (kind === "snow" ? 1.2 : 0.5)).toFixed(2)}s`,
          "--c": colors[i % colors.length],
        } as CSSProperties;
        return <span key={i} style={style} />;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

const ZIP_TRAILS: Record<string, (t: number) => string> = {
  "": (t) => `hsl(${(382 - t * 50) % 360} 78% ${52 - t * 6}%)`,
  ocean: (t) => `hsl(${188 + t * 42} 72% ${44 - t * 4}%)`,
  berry: (t) => `hsl(${330 - t * 62} 66% ${50 - t * 6}%)`,
  aurora: (t) => `hsl(${150 + t * 130} 64% ${44 + t * 4}%)`,
  rainbow: (t) => `hsl(${t * 300} 78% 50%)`,
  lime: (t) => `hsl(${84 + t * 80} 70% ${42 - t * 4}%)`,
  ember: (t) => `hsl(${46 - t * 46} 90% ${50 - t * 6}%)`,
  candy: (t) => `hsl(${330 - t * 130} 72% ${54 - t * 4}%)`,
};

/** Trail color at `t` (0 = start, 1 = end). */
export const zipTrail = (look: GameLook) => ZIP_TRAILS[look.path ?? ""] ?? ZIP_TRAILS[""];

/** Numbered checkpoint marker drawn at the origin in board units (one cell = 1). */
export function ZipMarker({ shape, number, on }: { shape?: string; number: number; on: boolean }) {
  const className = on ? "zip-dot zip-dot-on" : "zip-dot";
  return (
    <>
      {shape === "tiles" ? (
        <rect x="-0.29" y="-0.29" width="0.58" height="0.58" rx="0.1" className={className} />
      ) : shape === "hexagons" ? (
        <polygon points="0,-0.34 0.295,-0.17 0.295,0.17 0,0.34 -0.295,0.17 -0.295,-0.17" className={className} />
      ) : shape === "diamonds" ? (
        <polygon points="0,-0.37 0.37,0 0,0.37 -0.37,0" className={className} />
      ) : shape === "rings" ? (
        <circle r="0.29" className={`${className} zip-dot-ring`} />
      ) : shape === "octagons" ? (
        <polygon points="0.126,-0.305 0.305,-0.126 0.305,0.126 0.126,0.305 -0.126,0.305 -0.305,0.126 -0.305,-0.126 -0.126,-0.305" className={className} />
      ) : shape === "star-badges" ? (
        <polygon points="0,-0.4 0.147,-0.202 0.38,-0.124 0.238,0.077 0.235,0.324 0,0.25 -0.235,0.324 -0.238,0.077 -0.38,-0.124 -0.147,-0.202" className={className} />
      ) : shape === "shields" ? (
        <path d="M0,-0.36 L0.3,-0.25 L0.28,0.06 Q0.22,0.27 0,0.37 Q-0.22,0.27 -0.28,0.06 L-0.3,-0.25 Z" className={className} />
      ) : (
        <circle r="0.3" className={className} />
      )}
      <text y={shape === "star-badges" ? 0.1 : shape === "shields" ? 0.08 : 0.11} textAnchor="middle" className={shape === "rings" ? "zip-number zip-number-ring" : shape === "star-badges" ? "zip-number zip-number-sm" : "zip-number"}>
        {number}
      </text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Patches
// ---------------------------------------------------------------------------

const PATCH_PALETTES: Record<string, string[]> = {
  "": ["#b48cff", "#ff9a8b", "#6fd6a6", "#ffcf5c", "#7cc4ff", "#ff9ed1", "#c7b27a", "#7ee0d8", "#d39bff", "#a9cf6a"],
  denim: ["#7fa6d9", "#c9b79a", "#5f7fc4", "#a9c4e8", "#8f9fb8", "#6f95cf", "#d6cbb5", "#4f6fae", "#b0c8e0", "#9aa7c7"],
  sunset: ["#ff8a65", "#ffc857", "#ff6f91", "#c9a0ff", "#ffa94d", "#f78fb3", "#ffd166", "#e07a9a", "#ff9e7a", "#b48cff"],
  reef: ["#5fb7ff", "#ffd27a", "#4fd1c5", "#ff9f8a", "#8fa8ff", "#b8e986", "#7fdcff", "#f7b2d9", "#62c3a8", "#c3a6ff"],
};

export const patchColors = (look: GameLook) => PATCH_PALETTES[look.fill ?? ""] ?? PATCH_PALETTES[""];

// ---------------------------------------------------------------------------
// Tango
// ---------------------------------------------------------------------------

function TangoShape({ name }: { name: string }) {
  switch (name) {
    case "star":
      return <polygon points="12 2.5 14.9 8.6 21.5 9.3 16.5 13.8 18 20.4 12 17 6 20.4 7.5 13.8 2.5 9.3 9.1 8.6" className="fill-current" />;
    case "heart":
      return <path d="M12 20.5s-8.5-5-8.5-11A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.5 2.6c0 6-8.5 11-8.5 11z" className="fill-current" />;
    case "flame":
      return <path d="M12 2c.8 3.8 6.5 6.3 6.5 12a6.5 6.5 0 0 1-13 0c0-3.2 1.8-5.2 3.2-6.4.2 2.1 1.1 3.4 2.4 3.8C10.6 8.2 10.3 5 12 2z" className="fill-current" />;
    case "drop":
      return <path d="M12 2.5c3.8 4.8 7 8.6 7 12.1a7 7 0 0 1-14 0c0-3.5 3.2-7.3 7-12.1z" className="fill-current" />;
    case "flower":
      return (
        <g className="fill-current">
          {Array.from({ length: 5 }, (_, i) => {
            const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
            return <circle key={i} cx={12 + Math.cos(a) * 5.4} cy={12 + Math.sin(a) * 5.4} r="4.2" />;
          })}
          <circle cx="12" cy="12" r="3" className="fill-[var(--surface-raised)]" />
        </g>
      );
    case "leaf":
      return (
        <>
          <path d="M4 20C4 10.5 9.5 4.2 20.5 3.5 20.2 14 14.3 20 4 20z" className="fill-current" />
          <path d="M4.5 19.5 14 10" className="stroke-[var(--surface-raised)]" strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    case "bolt":
      return <path d="M13.8 1.5 4.5 13.5h6.2L9.5 22.5l10-12.8h-6.4z" className="fill-current" />;
    case "cloud":
      return <path d="M7 19a5 5 0 0 1-.7-9.9A6.5 6.5 0 0 1 18.4 8.2 5.4 5.4 0 0 1 17.6 19z" className="fill-current" />;
    case "moon":
      return <path d="M15.5 3.2a9 9 0 1 0 5.3 13.2A7.2 7.2 0 0 1 15.5 3.2z" className="fill-current" />;
    case "x":
      return <path d="M5.5 5.5l13 13m0-13-13 13" className="fill-none stroke-current" strokeWidth="4" strokeLinecap="round" />;
    case "o":
      return <circle cx="12" cy="12" r="7" className="fill-none stroke-current" strokeWidth="3.6" />;
    case "spade":
      return <path d="M12 2.5C9 6.5 3.5 9.3 3.5 13.6a4.4 4.4 0 0 0 7.4 3.2L9.6 21.5h4.8l-1.3-4.7a4.4 4.4 0 0 0 7.4-3.2C20.5 9.3 15 6.5 12 2.5z" className="fill-current" />;
    case "diamond":
      return <polygon points="12 2 20 12 12 22 4 12" className="fill-current" />;
    case "coin":
      return (
        <>
          <circle cx="12" cy="12" r="9.5" className="fill-current" />
          <circle cx="12" cy="12" r="6" className="fill-none stroke-[var(--surface-raised)]" strokeWidth="1.6" />
        </>
      );
    case "gem":
      return (
        <>
          <polygon points="7 3.5 17 3.5 21.5 9.5 12 21 2.5 9.5" className="fill-current" />
          <path d="M2.5 9.5h19M9 3.5l3 6 3-6" className="fill-none stroke-[var(--surface-raised)]" strokeWidth="1.3" strokeLinejoin="round" />
        </>
      );
    default:
      return (
        <>
          <g className="stroke-current" strokeWidth="2" strokeLinecap="round">
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4;
              return <line key={i} x1={12 + Math.cos(a) * 8} y1={12 + Math.sin(a) * 8} x2={12 + Math.cos(a) * 10.5} y2={12 + Math.sin(a) * 10.5} />;
            })}
          </g>
          <circle cx="12" cy="12" r="5.5" className="fill-current" />
        </>
      );
  }
}

/** Shape names standing in for [sun, moon]; colors come from --tango-sun / --tango-moon in CSS. */
const TANGO_PAIRS: Record<string, [string, string]> = {
  "": ["sun", "moon"],
  "star-heart": ["star", "heart"],
  "flame-drop": ["flame", "drop"],
  "flower-leaf": ["flower", "leaf"],
  "bolt-cloud": ["bolt", "cloud"],
  "x-o": ["x", "o"],
  "spade-diamond": ["spade", "diamond"],
  "coin-gem": ["coin", "gem"],
};

/** The symbol for one side ("sun" or "moon") in the equipped icon pair. */
export function TangoSymbol({ side, pair, className }: { side: "sun" | "moon"; pair?: string; className?: string }) {
  const names = TANGO_PAIRS[pair ?? ""] ?? TANGO_PAIRS[""];
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <TangoShape name={side === "sun" ? names[0] : names[1]} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Queens
// ---------------------------------------------------------------------------

/** Every palette keeps the same hue order so region names (violet, coral, …) stay accurate. */
const QUEENS_PALETTES: Record<string, string[]> = {
  "": ["#c9a7ff", "#ffb3a7", "#a8e6b0", "#ffe08a", "#9fd3ff", "#ffb8e0", "#d6c7a1", "#b5f0ec", "#e0b0ff", "#c2d68a"],
  jewel: ["#a77bff", "#ff8a78", "#6fd88e", "#ffd24d", "#6ab8ff", "#ff86c8", "#cdb27a", "#6fe3da", "#d48cff", "#b0cc5a"],
  vintage: ["#b9a3d6", "#e3a294", "#9fc9a2", "#e6cf8a", "#94b8d6", "#dba6c4", "#c9b48f", "#9fd0c8", "#c9a3dc", "#aebf84"],
  "stained-glass": ["#9b6bff", "#ff7a66", "#4fd27a", "#ffcc33", "#4aa8ff", "#ff6fbf", "#d9a95a", "#4fdcd0", "#c77dff", "#9cc43c"],
  sorbet: ["#d4b3ff", "#ffa894", "#9df0a8", "#fff07a", "#8fd0ff", "#ff9fd6", "#e8cf9a", "#9ff5ea", "#eab3ff", "#cfe68a"],
};

/** Laurel leaves: [x, y, angle] around the wreath, computed once. */
const LAUREL = [-1, 1].flatMap((side) =>
  Array.from({ length: 5 }, (_, i) => {
    const deg = side < 0 ? 105 + i * 32 : 75 - i * 32;
    const a = (deg * Math.PI) / 180;
    return [12 + Math.cos(a) * 7.6, 11.5 + Math.sin(a) * 7.6, deg + 90 * side] as const;
  }),
);

export const queensRegionColors = (look: GameLook) => QUEENS_PALETTES[look.regions ?? ""] ?? QUEENS_PALETTES[""];

/** Crown shapes by design slug; fills come from the gradients in `QueensDefs` via CSS. */
export function QueensCrown({ design, className }: { design?: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      {design === "tiara" ? (
        <>
          <path d="M3 18.5c1.3-5.2 4.8-7.6 9-13.5 4.2 5.9 7.7 8.3 9 13.5z" className="fill-current" />
          <circle cx="12" cy="12.6" r="2" className="fill-current queens-gem" />
        </>
      ) : design === "chess" ? (
        <>
          <circle cx="12" cy="3.8" r="1.8" className="fill-current" />
          <path d="M8 19.2h8l-1.1-6.2 2.9-5.6-3 2L12 5.8l-2.8 3.6-3-2 2.9 5.6z" className="fill-current" />
        </>
      ) : design === "laurel" ? (
        <>
          {LAUREL.map(([x, y, deg], i) => (
            <ellipse key={i} cx={x.toFixed(2)} cy={y.toFixed(2)} rx="2.9" ry="1.35" transform={`rotate(${deg.toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})`} className="fill-current" />
          ))}
          <circle cx="12" cy="19.6" r="1.7" className="fill-current queens-gem" />
        </>
      ) : (
        <>
          <path d="M3 18l1.6-10 4.6 4.4L12 5l2.8 7.4L19.4 8 21 18z" className="fill-current" />
          {design === "jeweled" || design === "emerald" ? (
            <>
              <circle cx="12" cy="14.6" r="1.7" className="fill-current queens-gem" />
              <circle cx="7.2" cy="15.4" r="1.1" className="fill-current queens-gem" />
              <circle cx="16.8" cy="15.4" r="1.1" className="fill-current queens-gem" />
            </>
          ) : null}
        </>
      )}
      {design === "laurel" ? null : <rect x="3" y="19" width="18" height="2.4" rx="1" className="fill-current" />}
    </svg>
  );
}

/** Gradients referenced by the crown CSS. Render once next to any board that shows crowns. */
export function QueensDefs() {
  return (
    <svg aria-hidden className="absolute size-0">
      <defs>
        <linearGradient id="queens-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe680" />
          <stop offset="0.55" stopColor="#f4b416" />
          <stop offset="1" stopColor="#c97a06" />
        </linearGradient>
        <linearGradient id="queens-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#c9d1e0" />
          <stop offset="1" stopColor="#7d879c" />
        </linearGradient>
        <linearGradient id="queens-ice" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2fcff" />
          <stop offset="0.5" stopColor="#9fe0ff" />
          <stop offset="1" stopColor="#3f8fd6" />
        </linearGradient>
        <linearGradient id="queens-ebony" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a4a6e" />
          <stop offset="0.5" stopColor="#2a1f36" />
          <stop offset="1" stopColor="#120c18" />
        </linearGradient>
        <linearGradient id="queens-rose" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3d8" />
          <stop offset="0.55" stopColor="#e8a08a" />
          <stop offset="1" stopColor="#b4644f" />
        </linearGradient>
        <linearGradient id="queens-laurel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1f59a" />
          <stop offset="0.5" stopColor="#b5c93a" />
          <stop offset="1" stopColor="#5f7d14" />
        </linearGradient>
      </defs>
    </svg>
  );
}
