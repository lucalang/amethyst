"use client";

import type { CSSProperties, ReactNode } from "react";
import type { GameLook } from "@/lib/game-cosmetics";
import { Ground } from "./ascent-art";

/**
 * The Ascent's cosmetics (see GAME_SHOPS["the-ascent"]). Sky styles, growth effects and art styles are CSS keyed on
 * data attributes (cosmetics.css); beanstalk styles, climbers and starting gardens also need their own artwork,
 * drawn here. Nothing here touches questions or scoring, and every look keeps each answer's growth colour on its
 * leaves and marker, so answer quality reads the same in all of them.
 */

export const ASCENT_LOOKS = {
  stalk: [
    "flowering",
    "bamboo",
    "candy-cane",
    "crystal-stem",
    "pennant-rope",
    "starlight",
    "toadstool",
    "sunflower",
    "rope-ladder",
    "pumpkin-vine",
  ],
  climber: [
    "paper-kite",
    "snail",
    "balloon-cat",
    "ladybird",
    "acorn-sprite",
    "tree-frog",
    "tin-gardener",
    "robin",
    "squirrel",
    "astronaut",
  ],
  growth: [
    "fireflies",
    "petals",
    "butterflies",
    "music-box",
    "dandelion",
    "confetti",
    "rainbow-wake",
    "soap-bubbles",
    "autumn-leaves",
    "fairy-dust",
  ],
  sky: [
    "storybook",
    "candyfloss",
    "starry-night",
    "lantern-festival",
    "balloon-regatta",
    "patchwork-sky",
    "origami-flock",
    "golden-sunrise",
    "kite-festival",
    "aurora-night",
  ],
  garden: [
    "enchanted-grove",
    "seaside",
    "rooftop",
    "pumpkin-patch",
    "oasis",
    "moss-temple",
    "winter-greenhouse",
    "tulip-windmill",
    "jungle-ruins",
    "moon-base",
  ],
  style: ["pen-and-ink", "papercraft", "pixel-quest", "chalk-mural", "watercolour"],
} as const;

type Category = keyof typeof ASCENT_LOOKS;
export type AscentLook = Partial<Record<Category, string>>;

/** Only slugs this file knows how to draw; anything else falls back to the default. */
export function ascentLook(look: GameLook): AscentLook {
  const out: AscentLook = {};
  for (const category of Object.keys(ASCENT_LOOKS) as Category[]) {
    const slug = look[category];
    if (slug && (ASCENT_LOOKS[category] as readonly string[]).includes(slug))
      out[category] = slug;
  }
  return out;
}

/** The world's attributes (everything but the art style, which goes on the whole game). */
export function worldAttributes(look: AscentLook) {
  return {
    "data-stalk": look.stalk,
    "data-climber": look.climber,
    "data-growth-fx": look.growth,
    "data-sky": look.sky,
  };
}

/* ============================================================================================ Beanstalk leaves */

/**
 * One leaf in a beanstalk style, drawn from the stalk outward (`side` is -1 or 1). Fill and edge are always the
 * answer's growth colours.
 */
export function leafArt(
  stalk: string | undefined,
  side: number,
  size: number,
  fill: string,
  edge: string,
  k: number,
): ReactNode {
  const s = side;
  const plain = (
    <>
      <path
        d={`M0 0 q${s * size * 0.6} ${-size * 0.7} ${s * size * 1.4} ${-size * 0.1} q${-s * size * 0.6} ${size * 0.55} ${-s * size * 1.4} ${size * 0.1} Z`}
        fill={fill}
        stroke={edge}
        strokeWidth="1.5"
      />
      <path
        d={`M0 0 Q${s * size * 0.7} ${-size * 0.18} ${s * size * 1.32} ${-size * 0.1}`}
        stroke={edge}
        strokeWidth="1"
        fill="none"
      />
      {[0.35, 0.65, 0.95].map((t) => (
        <path
          key={t}
          d={`M${s * size * t} ${-size * 0.14 * t} l${s * size * 0.14} ${-size * 0.16} M${s * size * t} ${-size * 0.14 * t} l${s * size * 0.12} ${size * 0.14}`}
          stroke={edge}
          strokeOpacity="0.55"
          strokeWidth="0.8"
        />
      ))}
      <path
        d={`M${s * size * 0.2} ${-size * 0.22} Q${s * size * 0.6} ${-size * 0.48} ${s * size * 1.05} ${-size * 0.28}`}
        stroke="#fff"
        strokeOpacity="0.35"
        strokeWidth="1.4"
        fill="none"
      />
    </>
  );
  switch (stalk) {
    case "flowering": {
      if (k % 2) return plain;
      const cx = s * size * 0.95;
      const cy = -size * 0.2;
      const r = size * 0.3;
      return (
        <>
          <path
            d={`M0 0 Q${cx * 0.5} ${cy * 0.2} ${cx} ${cy}`}
            stroke="#4f9e3e"
            strokeWidth="2"
            fill="none"
          />
          {Array.from({ length: 5 }, (_, p) => (
            <ellipse
              key={p}
              cx={cx}
              cy={cy - r}
              rx={r * 0.62}
              ry={r}
              fill={fill}
              stroke={edge}
              strokeWidth="1"
              transform={`rotate(${p * 72} ${cx} ${cy})`}
            />
          ))}
          <circle
            cx={cx}
            cy={cy}
            r={r * 0.5}
            fill="#fff6c9"
            stroke={edge}
            strokeWidth="0.8"
          />
        </>
      );
    }
    case "bamboo":
      return (
        <>
          <path
            d={`M0 0 Q${s * size * 0.9} ${-size * 0.3} ${s * size * 1.9} ${-size * 0.04} Q${s * size * 0.9} ${size * 0.1} 0 0 Z`}
            fill={fill}
            stroke={edge}
            strokeWidth="1.2"
          />
          <path
            d={`M0 0 Q${s * size * 0.9} ${-size * 0.1} ${s * size * 1.8} ${-size * 0.04}`}
            stroke={edge}
            strokeOpacity="0.6"
            strokeWidth="0.8"
            fill="none"
          />
        </>
      );
    case "candy-cane": {
      const cx = s * size * 1.05;
      const cy = -size * 0.12;
      const r = size * 0.38;
      return (
        <>
          <path
            d={`M0 0 L${cx} ${cy}`}
            stroke="#fffaf0"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={fill}
            stroke={edge}
            strokeWidth="1.2"
          />
          <path
            d={`M${cx} ${cy} m${-r * 0.15} 0 a${r * 0.15} ${r * 0.15} 0 1 1 ${r * 0.3} 0 a${r * 0.32} ${r * 0.32} 0 1 1 ${-r * 0.62} 0 a${r * 0.5} ${r * 0.5} 0 1 1 ${r * 0.98} 0`}
            stroke="#fff"
            strokeOpacity="0.85"
            strokeWidth="1.3"
            fill="none"
          />
        </>
      );
    }
    case "sunflower": {
      // A little sunflower: petals in the answer's colour round a seed-brown middle.
      const cx = s * size * 1.05;
      const cy = -size * 0.15;
      const r = size * 0.42;
      return (
        <>
          <path d={`M0 0 L${cx} ${cy}`} stroke="#4f8a2a" strokeWidth="2" strokeLinecap="round" />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <ellipse key={i} cx={cx + Math.cos(a) * r * 0.75} cy={cy + Math.sin(a) * r * 0.75} rx={r * 0.42} ry={r * 0.2} transform={`rotate(${(a * 180) / Math.PI} ${cx + Math.cos(a) * r * 0.75} ${cy + Math.sin(a) * r * 0.75})`} fill={fill} stroke={edge} strokeWidth="0.8" />;
          })}
          <circle cx={cx} cy={cy} r={r * 0.45} fill="#6a3f1a" stroke="#3a2010" strokeWidth="0.8" />
        </>
      );
    }
    case "rope-ladder": {
      // A painted tag hanging off the rung by a loop of string.
      const tx = s * size * 0.9;
      return (
        <>
          <path d={`M0 0 Q${s * size * 0.45} ${size * 0.15} ${tx} ${-size * 0.05}`} stroke="#a8844a" strokeWidth="1.2" fill="none" />
          <path
            d={`M${tx} ${-size * 0.32} l${s * size * 0.75} 0 l${s * size * 0.22} ${size * 0.27} l${-s * size * 0.22} ${size * 0.27} l${-s * size * 0.75} 0 Z`}
            fill={fill}
            stroke={edge}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <circle cx={tx + s * size * 0.12} cy={-size * 0.05} r={size * 0.06} fill="#fff" fillOpacity="0.8" />
        </>
      );
    }
    case "pumpkin-vine": {
      const cx = s * size * 1;
      const cy = -size * 0.05;
      const r = size * 0.36;
      return (
        <>
          <path d={`M0 0 C${s * size * 0.3} ${-size * 0.4} ${s * size * 0.6} ${size * 0.2} ${cx} ${cy - r}`} stroke="#5a8a2a" strokeWidth="1.6" fill="none" />
          <path d={`M${cx - s * r * 0.2} ${cy - r * 0.9} q${s * r * 0.4} ${-r * 0.5} ${s * r * 0.7} ${-r * 0.2}`} stroke="#5a8a2a" strokeWidth="1" fill="none" />
          <ellipse cx={cx} cy={cy} rx={r * 1.15} ry={r} fill={fill} stroke={edge} strokeWidth="1.2" />
          <path d={`M${cx} ${cy - r} V${cy + r} M${cx - r * 0.55} ${cy - r * 0.85} Q${cx - r * 0.85} ${cy} ${cx - r * 0.55} ${cy + r * 0.85} M${cx + r * 0.55} ${cy - r * 0.85} Q${cx + r * 0.85} ${cy} ${cx + r * 0.55} ${cy + r * 0.85}`} stroke={edge} strokeOpacity="0.55" strokeWidth="0.8" fill="none" />
          <rect x={cx - r * 0.12} y={cy - r * 1.3} width={r * 0.24} height={r * 0.4} fill="#6a4a1a" />
        </>
      );
    }
    case "crystal-stem":
      return (
        <>
          <path
            d={`M0 0 L${s * size * 0.6} ${-size * 0.4} L${s * size * 1.55} ${-size * 0.12} L${s * size * 0.65} ${size * 0.22} Z`}
            fill={fill}
            fillOpacity="0.85"
            stroke={edge}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d={`M0 0 L${s * size * 1.55} ${-size * 0.12} M${s * size * 0.6} ${-size * 0.4} L${s * size * 0.65} ${size * 0.22}`}
            stroke="#fff"
            strokeOpacity="0.7"
            strokeWidth="0.8"
          />
        </>
      );
    case "pennant-rope":
      return (
        <>
          <path
            d={`M0 0 L${s * size * 1.4} ${-size * 0.12}`}
            stroke="#8a6236"
            strokeWidth="1.2"
          />
          <path
            d={`M${s * size * 0.15} ${-size * 0.02} L${s * size * 1.25} ${-size * 0.11} L${s * size * 0.62} ${size * 0.62} Z`}
            fill={fill}
            stroke={edge}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d={`M${s * size * 0.45} ${size * 0.08} L${s * size * 0.95} ${size * 0.04}`}
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="1.2"
          />
        </>
      );
    case "starlight": {
      const cx = s * size * 0.95;
      const cy = -size * 0.15;
      const outer = size * 0.5;
      const points = Array.from({ length: 10 }, (_, p) => {
        const a = (p / 10) * Math.PI * 2 - Math.PI / 2;
        const r = p % 2 ? outer * 0.45 : outer;
        return `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
      });
      return (
        <>
          <path
            d={`M0 0 L${cx} ${cy}`}
            stroke="#b9b6ff"
            strokeWidth="1.2"
            strokeOpacity="0.8"
          />
          <path
            d={`M${points.join(" L")} Z`}
            fill={fill}
            stroke={edge}
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </>
      );
    }
    case "toadstool": {
      const cx = s * size * 0.95;
      const cy = -size * 0.42;
      return (
        <>
          <path
            d={`M0 0 Q${s * size * 0.5} ${-size * 0.05} ${cx - s * size * 0.08} ${cy + size * 0.05} L${cx + s * size * 0.08} ${cy + size * 0.05} Q${s * size * 0.55} ${size * 0.08} 0 0 Z`}
            fill="#f4ead2"
            stroke="#b9a07a"
            strokeWidth="1"
          />
          <path
            d={`M${cx - size * 0.55} ${cy + size * 0.06} Q${cx} ${cy - size * 0.7} ${cx + size * 0.55} ${cy + size * 0.06} Z`}
            fill={fill}
            stroke={edge}
            strokeWidth="1.2"
          />
          <circle
            cx={cx - size * 0.2}
            cy={cy - size * 0.12}
            r={size * 0.07}
            fill="#fff"
          />
          <circle
            cx={cx + size * 0.18}
            cy={cy - size * 0.2}
            r={size * 0.09}
            fill="#fff"
          />
          <circle
            cx={cx + size * 0.02}
            cy={cy - size * 0.02}
            r={size * 0.05}
            fill="#fff"
          />
        </>
      );
    }
    default:
      return plain;
  }
}

/* ============================================================================================ Climbers */

/** Who rides the tip of the beanstalk. Drawn in a 40 × 50 box with the feet at y = 6. */
export function Climber({ kind }: { kind?: string }) {
  switch (kind) {
    case "paper-kite":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path
            d="M0 6 C-6 12 6 16 0 22 C-6 28 6 32 0 38"
            className="ac-kite-tail"
          />
          <path
            d="M-4 15 l4 2 l-4 2 Z M4 25 l-4 2 l4 2 Z"
            fill="#ff6b8a"
            className="ac-kite-tail"
          />
          <path d="M0 -38 L13 -16 L0 -16 Z" fill="#ffd166" />
          <path d="M0 -38 L-13 -16 L0 -16 Z" fill="#ff6b8a" />
          <path d="M-13 -16 L0 6 L0 -16 Z" fill="#4fc3f7" />
          <path d="M13 -16 L0 6 L0 -16 Z" fill="#7bd389" />
          <path
            d="M0 -38 L13 -16 L0 6 L-13 -16 Z M0 -38 V6 M-13 -16 H13"
            fill="none"
            stroke="#6b4a2a"
            strokeWidth="1"
          />
          <circle cx="-4" cy="-20" r="1.3" fill="#2a1a0a" />
          <circle cx="4" cy="-20" r="1.3" fill="#2a1a0a" />
          <path
            d="M-3 -14 q3 2.5 6 0"
            stroke="#2a1a0a"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      );
    case "robin":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path d="M-12 -8 L-20 -18 L-16 -6 Z" fill="#6a4a32" className="ac-tail" />
          <ellipse cx="0" cy="-10" rx="13" ry="12" fill="#8a6440" stroke="#4a3018" strokeWidth="1.2" />
          <path d="M-2 -16 C8 -16 12 -6 4 2 C-2 4 -6 -4 -2 -16 Z" fill="#e8582a" />
          <circle cx="6" cy="-24" r="8" fill="#8a6440" stroke="#4a3018" strokeWidth="1.2" />
          <path d="M6 -24 C10 -22 12 -18 8 -16 C4 -17 3 -21 6 -24 Z" fill="#e8582a" />
          <path d="M13 -25 L19 -23 L13 -21 Z" fill="#e8b02a" />
          <circle cx="9" cy="-27" r="1.4" fill="#1a1008" />
          <path d="M-6 -10 Q-2 -2 4 -6" stroke="#4a3018" strokeWidth="1" fill="none" />
          <path d="M-2 2 V8 M3 2 V8" stroke="#c87a2a" strokeWidth="1.3" className="ac-legs" />
        </svg>
      );
    case "squirrel":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path d="M-6 2 C-22 0 -24 -22 -12 -32 C-6 -36 -2 -30 -8 -26 C-16 -20 -12 -8 -2 -6 Z" fill="#c4682a" stroke="#6a3010" strokeWidth="1.2" className="ac-tail" />
          <ellipse cx="2" cy="-8" rx="8" ry="11" fill="#d87a3a" stroke="#6a3010" strokeWidth="1.2" />
          <ellipse cx="4" cy="-5" rx="4" ry="6" fill="#f4d4a8" />
          <circle cx="6" cy="-22" r="7" fill="#d87a3a" stroke="#6a3010" strokeWidth="1.2" />
          <path d="M2 -28 L1 -34 L5 -29 M8 -29 L10 -34 L11 -27" fill="#d87a3a" stroke="#6a3010" strokeWidth="1" />
          <circle cx="9" cy="-23" r="1.4" fill="#1a1008" />
          <circle cx="12.5" cy="-20" r="1" fill="#3a1a08" />
          <ellipse cx="9" cy="-10" rx="3.2" ry="3.6" fill="#a8743a" stroke="#5a3a14" strokeWidth="0.8" />
          <path d="M6 -12.5 Q9 -15 12 -12.5" fill="#6a4a1a" stroke="#5a3a14" strokeWidth="0.8" />
        </svg>
      );
    case "astronaut":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path d="M-12 -30 V-6" stroke="#9aa0ac" strokeWidth="1.2" />
          <path d="M-12 -30 L-3 -27 L-12 -24 Z" fill="#e8402a" className="ac-plume" />
          <rect x="-8" y="-14" width="16" height="16" rx="5" fill="#f4f6fa" stroke="#6a7080" strokeWidth="1.2" />
          <rect x="-4" y="-10" width="8" height="5" rx="1.5" fill="#4fc3f7" />
          <rect x="-11" y="-12" width="4" height="10" rx="2" fill="#d8dce4" stroke="#6a7080" strokeWidth="1" />
          <circle cx="0" cy="-22" r="10" fill="#f4f6fa" stroke="#6a7080" strokeWidth="1.2" />
          <circle cx="0" cy="-22" r="7" fill="#1a2a4a" />
          <path d="M-4 -26 Q-1 -28 2 -26" stroke="#9fd8ff" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <circle cx="-2" cy="-21" r="1" fill="#fff" className="ac-eyes" />
          <circle cx="2" cy="-21" r="1" fill="#fff" className="ac-eyes" />
          <path d="M-5 2 V8 M5 2 V8" stroke="#6a7080" strokeWidth="2.5" strokeLinecap="round" className="ac-legs" />
        </svg>
      );
    case "snail":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path
            d="M-14 6 Q-16 -2 -8 -4 L8 -4 Q14 -6 13 -16 L15 -16 Q18 -2 10 6 Z"
            fill="#cde58a"
            stroke="#6f8a2a"
            strokeWidth="1.2"
          />
          <path
            d="M12 -15 L9 -26 M15 -15 L17 -25"
            stroke="#6f8a2a"
            strokeWidth="1.4"
            className="ac-antennae"
          />
          <circle cx="9" cy="-27" r="1.8" fill="#2a1a0a" />
          <circle cx="17" cy="-26" r="1.8" fill="#2a1a0a" />
          <circle
            cx="-2"
            cy="-14"
            r="12"
            fill="#f0a35a"
            stroke="#8a4a1a"
            strokeWidth="1.4"
          />
          <path
            d="M-2 -14 m-2 0 a2 2 0 1 1 4 0 a5 5 0 1 1 -9 0 a8 8 0 1 1 16 0 a10.5 10.5 0 1 1 -21 0"
            stroke="#8a4a1a"
            strokeWidth="1.3"
            fill="none"
          />
          <path
            d="M-9 -22 q3 -4 8 -4"
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      );
    case "balloon-cat":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <g className="ac-balloon">
            <path
              d="M5 -20 Q2 -12 -1 -6"
              stroke="#6b6b6b"
              strokeWidth="0.8"
              fill="none"
            />
            <ellipse
              cx="6"
              cy="-30"
              rx="9"
              ry="10.5"
              fill="#ff5d6c"
              stroke="#b8323f"
              strokeWidth="1"
            />
            <path
              d="M2 -35 q2 -3 5 -3"
              stroke="#fff"
              strokeOpacity="0.7"
              strokeWidth="1.5"
              fill="none"
            />
            <path d="M4 -19.5 L8 -19.5 L6 -17.5 Z" fill="#b8323f" />
          </g>
          <path
            d="M-7 -2 L-9 -11 L-4 -8 Z M3 -2 L5 -11 L0 -8 Z"
            fill="#f2a65a"
            stroke="#8a5a2a"
            strokeWidth="0.8"
          />
          <circle
            cx="-2"
            cy="-2"
            r="7"
            fill="#f2a65a"
            stroke="#8a5a2a"
            strokeWidth="1"
          />
          <path
            d="M-6 0 v8 M2 0 v8"
            stroke="#f2a65a"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M-2 4 q-10 4 -12 -6"
            stroke="#f2a65a"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            className="ac-tail"
          />
          <circle cx="-4.5" cy="-3" r="1.1" fill="#2a1a0a" />
          <circle cx="0.5" cy="-3" r="1.1" fill="#2a1a0a" />
          <path
            d="M-3 0 l1 1 l1 -1"
            stroke="#8a3a2a"
            strokeWidth="0.8"
            fill="none"
          />
          <path
            d="M-1 -6 L-1 -8 M-2 -6 L-3 -8"
            stroke="#8a5a2a"
            strokeWidth="0.6"
          />
        </svg>
      );
    case "ladybird":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path
            d="M-10 4 l-5 4 M10 4 l5 4 M-11 -6 l-6 0 M11 -6 l6 0"
            stroke="#1a1a1a"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="ac-legs"
          />
          <ellipse
            cx="0"
            cy="-4"
            rx="12"
            ry="13"
            fill="#e8343c"
            stroke="#7a1a1e"
            strokeWidth="1.2"
          />
          <path d="M0 -17 V9" stroke="#1a1a1a" strokeWidth="1.4" />
          {[
            [-6, -8, 2.6],
            [6, -8, 2.6],
            [-5, 1, 2.2],
            [5, 1, 2.2],
          ].map(([x, y, r]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="#1a1a1a" />
          ))}
          <circle cx="0" cy="-20" r="6" fill="#1a1a1a" />
          <circle cx="-2.2" cy="-21" r="1.3" fill="#fff" />
          <circle cx="2.2" cy="-21" r="1.3" fill="#fff" />
          <path
            d="M-6 -22 Q0 -31 6 -22 Z"
            fill="#c9ced6"
            stroke="#7a828c"
            strokeWidth="0.8"
          />
          <path
            d="M0 -29 Q6 -38 12 -33 Q6 -33 1 -27"
            fill="#7cc4ff"
            className="ac-plume"
          />
        </svg>
      );
    case "acorn-sprite":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <g className="ac-wings">
            <ellipse
              cx="-11"
              cy="-12"
              rx="8"
              ry="4"
              transform="rotate(-30 -11 -12)"
              fill="#a8e08a"
              fillOpacity="0.85"
              stroke="#4f9e3e"
              strokeWidth="0.8"
            />
            <ellipse
              cx="11"
              cy="-12"
              rx="8"
              ry="4"
              transform="rotate(30 11 -12)"
              fill="#a8e08a"
              fillOpacity="0.85"
              stroke="#4f9e3e"
              strokeWidth="0.8"
            />
          </g>
          <path d="M-6 6 Q-8 -4 0 -6 Q8 -4 6 6 Z" fill="#7bb662" />
          <ellipse
            cx="0"
            cy="-16"
            rx="9"
            ry="10"
            fill="#ffe1bf"
            stroke="#c99a6a"
            strokeWidth="0.8"
          />
          <path
            d="M-11 -20 Q0 -34 11 -20 Q0 -23 -11 -20 Z"
            fill="#9a6232"
            stroke="#5a3a1a"
            strokeWidth="1"
          />
          <path
            d="M-8 -24 l3 3 M-3 -27 l3 3 M2 -27 l3 3 M6 -25 l3 3 M-6 -27 l-2 3 M0 -29 l-2 3 M5 -28 l-2 3"
            stroke="#5a3a1a"
            strokeWidth="0.7"
          />
          <path
            d="M0 -31 V-35"
            stroke="#5a3a1a"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <circle cx="-3" cy="-15" r="1.3" fill="#2a1a0a" />
          <circle cx="3" cy="-15" r="1.3" fill="#2a1a0a" />
          <circle cx="-5.5" cy="-12" r="1.5" fill="#ff9aa8" fillOpacity="0.6" />
          <circle cx="5.5" cy="-12" r="1.5" fill="#ff9aa8" fillOpacity="0.6" />
        </svg>
      );
    case "tree-frog":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path
            d="M-8 -4 L-15 -14 M8 -4 L15 -14 M-7 2 L-14 8 M7 2 L14 8"
            stroke="#3fae4a"
            strokeWidth="3"
            strokeLinecap="round"
            className="ac-legs"
          />
          {[
            [-15, -14],
            [15, -14],
            [-14, 8],
            [14, 8],
          ].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="2.2" fill="#ff9f43" />
          ))}
          <ellipse
            cx="0"
            cy="-4"
            rx="10"
            ry="12"
            fill="#4cc35a"
            stroke="#22762c"
            strokeWidth="1.2"
          />
          <ellipse cx="0" cy="-1" rx="5.5" ry="7" fill="#c8f0a8" />
          <circle
            cx="-6"
            cy="-16"
            r="4.5"
            fill="#4cc35a"
            stroke="#22762c"
            strokeWidth="1"
          />
          <circle
            cx="6"
            cy="-16"
            r="4.5"
            fill="#4cc35a"
            stroke="#22762c"
            strokeWidth="1"
          />
          <circle cx="-6" cy="-16" r="2.6" fill="#ffd166" />
          <circle cx="6" cy="-16" r="2.6" fill="#ffd166" />
          <path
            d="M-6.4 -18 V-14 M5.6 -18 V-14"
            stroke="#1a1a1a"
            strokeWidth="1.4"
          />
          <path
            d="M-4 -9 Q0 -6 4 -9"
            stroke="#22762c"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      );
    case "tin-gardener":
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path
            d="M-6 6 V2 M6 6 V2"
            stroke="#7a828c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <rect
            x="-10"
            y="-14"
            width="20"
            height="16"
            rx="3"
            fill="#a9b4c0"
            stroke="#5a6470"
            strokeWidth="1.2"
          />
          <path
            d="M10 -10 L18 -16 L19 -14 L11 -6"
            fill="#a9b4c0"
            stroke="#5a6470"
            strokeWidth="1"
          />
          <path
            d="M19 -15 l3 -1 M19 -14 l3 1 M18.5 -13 l2.5 2"
            stroke="#7cc4ff"
            strokeWidth="1"
            className="ac-drops"
          />
          <path
            d="M-10 -10 Q-17 -6 -10 -1"
            stroke="#5a6470"
            strokeWidth="1.6"
            fill="none"
          />
          <rect
            x="-8"
            y="-28"
            width="16"
            height="12"
            rx="2.5"
            fill="#c9d2dc"
            stroke="#5a6470"
            strokeWidth="1.2"
          />
          <circle cx="-3.5" cy="-22" r="2" fill="#7cfcff" className="ac-eyes" />
          <circle cx="3.5" cy="-22" r="2" fill="#7cfcff" className="ac-eyes" />
          <path d="M0 -28 V-33" stroke="#5a6470" strokeWidth="1.2" />
          <circle cx="0" cy="-34" r="2" fill="#ffd166" className="ac-bulb" />
          <path d="M-4 -6 h8" stroke="#5a6470" strokeWidth="1" />
        </svg>
      );
    default:
      return (
        <svg viewBox="-20 -40 40 50" className="aw-climber-body">
          <path
            d="M-8 6 L-12 -8 Q-12 -20 0 -20 Q12 -20 12 -8 L8 6 Z"
            fill="#e8463c"
          />
          <rect x="-14" y="-14" width="8" height="14" rx="3" fill="#a86a32" />
          <circle cx="0" cy="-26" r="9" fill="#ffd7b0" />
          <path
            d="M-10 -28 Q0 -44 10 -28 Q4 -34 0 -32 Q-4 -34 -10 -28 Z"
            fill="#4f9e3e"
          />
          <circle cx="-3" cy="-26" r="1.4" fill="#2a1a0a" />
          <circle cx="4" cy="-26" r="1.4" fill="#2a1a0a" />
          <path
            d="M-12 -8 L-18 -24 M12 -8 L18 -24"
            stroke="#ffd7b0"
            strokeWidth="4"
            strokeLinecap="round"
            className="aw-arms"
          />
        </svg>
      );
  }
}

/** The burst of the equipped growth effect around the climber as a stretch of beanstalk grows. */
export function GrowthBurst() {
  return (
    <span className="aw-burst">
      {Array.from({ length: 10 }, (_, k) => (
        <i
          key={k}
          style={
            { "--a": `${k * 36 + (k % 2) * 14}deg`, "--k": k } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

/* ============================================================================================ Starting gardens */

/** Rolling hills, a soil bed and the planted spot (400, 260): what every starting garden shares. */
function Bed({
  far,
  near,
  soil,
  rows,
  children,
  back,
}: {
  far: string;
  near: string;
  soil: string;
  rows: string;
  children?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 800 320"
      preserveAspectRatio="xMidYMax slice"
      className="aa-ground"
    >
      {back}
      <path
        d="M0 170 Q120 110 240 150 T480 140 T800 130 V320 H0 Z"
        fill={far}
      />
      <path
        d="M0 200 Q160 150 320 190 T640 180 T800 190 V320 H0 Z"
        fill={near}
      />
      {children}
      <path d="M0 250 Q400 236 800 250 V320 H0 Z" fill={soil} />
      {Array.from({ length: 5 }, (_, k) => (
        <path
          key={k}
          d={`M0 ${258 + k * 11} Q400 ${246 + k * 11} 800 ${258 + k * 11}`}
          stroke={rows}
          strokeWidth="1.5"
          fill="none"
          opacity="0.6"
        />
      ))}
      <ellipse cx="400" cy="262" rx="40" ry="8" fill="#3a2414" />
      <ellipse cx="400" cy="260" rx="30" ry="5" fill="#2a180c" />
    </svg>
  );
}

const pine = (
  x: number,
  y: number,
  s: number,
  fill: string,
  snow?: boolean,
) => (
  <g key={`p${x}`} transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-2" y="0" width="4" height="10" fill="#6b4a2a" />
    <path d="M0 -40 L14 -8 H-14 Z M0 -28 L18 4 H-18 Z" fill={fill} />
    {snow ? (
      <path
        d="M0 -40 L6 -27 Q0 -30 -6 -27 Z M-8 -14 Q0 -18 8 -14 L12 -8 Q0 -12 -12 -8 Z"
        fill="#fff"
      />
    ) : null}
  </g>
);

/** The ground at the bottom of the climb; the default is the cottage garden. */
export function Garden({ kind }: { kind?: string }) {
  switch (kind) {
    case "tulip-windmill":
      return (
        <Bed far="#8ac4e8" near="#7ab85a" soil="#5a3a22" rows="#3a2414" back={<rect width="800" height="320" fill="#cfe8ff" opacity="0.3" />}>
          {/* A Dutch windmill with turning sails beside bands of tulips. */}
          <g transform="translate(150 60)">
            <path d="M20 160 L34 40 H66 L80 160 Z" fill="#c8b8a0" stroke="#5a4a3a" strokeWidth="2" />
            <path d="M30 40 L50 18 L70 40 Z" fill="#6a4a3a" stroke="#3a2a1a" strokeWidth="2" />
            <rect x="42" y="120" width="16" height="40" rx="8" fill="#4a3a2a" />
            <g transform="translate(50 46)">
              <g className="ag-spin">
                {[0, 90, 180, 270].map((a) => (
                  <g key={a} transform={`rotate(${a})`}>
                    <rect x="-3" y="-70" width="6" height="66" fill="#8a6a4a" />
                    <rect x="3" y="-66" width="16" height="56" fill="#f4eee0" stroke="#8a6a4a" strokeWidth="1.5" />
                  </g>
                ))}
              </g>
              <circle r="5" fill="#3a2a1a" />
            </g>
          </g>
          {[0, 1, 2, 3].map((row) =>
            Array.from({ length: 16 }, (_, k) => {
              const x = 330 + k * 28 + (row % 2) * 14;
              const y = 196 + row * 12;
              const color = ["#e8282a", "#ffd23a", "#ff7ab8", "#ff8a2a"][row];
              return (
                <g key={`t${row}-${k}`} transform={`translate(${x} ${y})`}>
                  <path d="M0 0 V10" stroke="#3f7a2a" strokeWidth="2" />
                  <path d="M-5 0 Q-5 -9 -2 -10 L0 -6 L2 -10 Q5 -9 5 0 Z" fill={color} />
                </g>
              );
            }),
          )}
        </Bed>
      );
    case "jungle-ruins":
      return (
        <Bed far="#2f6a3a" near="#3f8a3a" soil="#4a3220" rows="#2a1a10" back={<rect width="800" height="320" fill="#1f4a2a" opacity="0.3" />}>
          {/* A stepped stone temple wrapped in vines, palms and a parrot on a hanging vine. */}
          <g transform="translate(560 70)">
            {[0, 1, 2, 3].map((k) => (
              <rect key={k} x={20 + k * 18} y={130 - k * 34} width={160 - k * 36} height="36" fill={k % 2 ? "#8a8a72" : "#9a9a80"} stroke="#4a4a3a" strokeWidth="2" />
            ))}
            <rect x="84" y="-6" width="32" height="34" fill="#7a7a62" stroke="#4a4a3a" strokeWidth="2" />
            <rect x="92" y="8" width="16" height="20" fill="#2a2a20" />
            <path d="M40 60 Q60 90 50 130 M150 40 Q130 80 160 120" stroke="#3f8a3a" strokeWidth="5" fill="none" />
          </g>
          {[90, 260].map((x, i) => (
            <g key={x} transform={`translate(${x} 200)`} className="ag-sway">
              <path d="M0 0 Q6 -60 -4 -120" stroke="#6a4a2a" strokeWidth="8" fill="none" />
              {[-60, -20, 20, 60, 100].map((a) => (
                <path key={a} d="M-4 -120 q30 -10 60 20 q-30 -6 -60 -20" fill="#3f9a3a" transform={`rotate(${a + i * 15} -4 -120)`} />
              ))}
            </g>
          ))}
          <path d="M470 0 Q480 60 470 110" stroke="#2f6a2a" strokeWidth="3" fill="none" />
          <g transform="translate(470 112)" className="ag-bob">
            <ellipse cx="0" cy="0" rx="8" ry="12" fill="#e8282a" />
            <path d="M-2 10 L-6 26 L2 12 Z" fill="#2a6ae8" />
            <path d="M4 -6 L12 -4 L6 0 Z" fill="#ffd23a" />
            <circle cx="2" cy="-6" r="1.5" fill="#1a1a1a" />
          </g>
        </Bed>
      );
    case "moon-base":
      return (
        <Bed far="#6a6a78" near="#8a8a96" soil="#5a5a64" rows="#3a3a44" back={<rect width="800" height="320" fill="#0a0e24" />}>
          {/* Earth rising behind craters, a greenhouse dome and a little rover. */}
          <g transform="translate(640 70)">
            <circle r="34" fill="#2a6ad8" />
            <path d="M-20 -14 Q-6 -24 6 -12 Q-2 -2 -16 -4 Z M8 6 Q20 0 24 14 Q12 22 6 14 Z" fill="#4fae5a" />
            <circle r="34" fill="none" stroke="#9fd0ff" strokeWidth="3" opacity="0.6" />
          </g>
          {[[100, 40], [300, 70], [520, 30], [720, 110], [40, 120]].map(([x, y]) => (
            <circle key={`s${x}`} cx={x} cy={y} r="1.6" fill="#fff" className="ag-twinkle" />
          ))}
          {[[140, 214, 30], [600, 222, 22], [700, 206, 16]].map(([x, y, r]) => (
            <g key={`c${x}`}>
              <ellipse cx={x} cy={y} rx={r} ry={r * 0.32} fill="#6a6a74" />
              <ellipse cx={x} cy={y + 2} rx={r * 0.8} ry={r * 0.22} fill="#4a4a54" />
            </g>
          ))}
          <g transform="translate(230 120)">
            <path d="M0 80 A70 70 0 0 1 140 80 Z" fill="rgb(190 230 255 / 0.35)" stroke="#d8ecff" strokeWidth="2" />
            <path d="M70 10 V80 M20 30 Q70 50 120 30" stroke="#d8ecff" strokeWidth="1.2" fill="none" opacity="0.7" />
            {[30, 55, 85, 110].map((x) => (
              <path key={x} d={`M${x} 80 V62 q6 -6 0 -12 q-6 6 0 12`} stroke="#4fae5a" strokeWidth="3" fill="#6fce5a" />
            ))}
          </g>
          <g transform="translate(520 196)" className="ag-bob">
            <rect x="-26" y="-14" width="52" height="16" rx="4" fill="#e8ecf2" stroke="#6a7080" strokeWidth="1.5" />
            <rect x="-10" y="-24" width="18" height="10" rx="2" fill="#4fc3f7" stroke="#6a7080" strokeWidth="1.2" />
            <path d="M14 -14 V-30" stroke="#6a7080" strokeWidth="1.5" />
            <circle cx="14" cy="-31" r="2.5" fill="#ff5a4a" className="ag-glow" />
            {[-18, 0, 18].map((x) => (
              <circle key={x} cx={x} cy="4" r="6" fill="#3a3a44" stroke="#9aa0ac" strokeWidth="1.5" />
            ))}
          </g>
        </Bed>
      );
    case "enchanted-grove":
      return (
        <Bed
          far="#2f5a4a"
          near="#3f7a52"
          soil="#3a2a3a"
          rows="#2a1a2a"
          back={<rect width="800" height="320" fill="#1f3a40" opacity="0.35" />}
        >
          {/* A hollow oak with a round door, a toadstool ring and fairy lights strung between trees. */}
          <g transform="translate(120 70)">
            <path
              d="M30 170 Q40 110 20 60 Q60 80 70 40 Q90 90 110 60 Q96 120 110 170 Z"
              fill="#5a3a26"
              stroke="#2e1d12"
              strokeWidth="2"
            />
            <circle cx="66" cy="20" r="54" fill="#2f7a4a" />
            <circle cx="30" cy="40" r="34" fill="#3f8f5a" />
            <circle cx="104" cy="40" r="36" fill="#3a8452" />
            <path
              d="M56 170 V140 Q70 124 84 140 V170 Z"
              fill="#8a5a32"
              stroke="#2e1d12"
              strokeWidth="2"
            />
            <circle cx="80" cy="156" r="2" fill="#ffd166" />
            <circle cx="70" cy="110" r="7" fill="#ffd27a" className="ag-glow" />
          </g>
          <path
            d="M240 120 Q400 160 560 120 M560 120 Q640 150 720 116"
            stroke="#2a2a2a"
            strokeWidth="1"
            fill="none"
          />
          {[270, 310, 350, 390, 430, 470, 510, 545, 590, 630, 670, 705].map(
            (x, k) => (
              <circle
                key={x}
                cx={x}
                cy={
                  x < 560
                    ? 120 + Math.sin(((x - 240) / 320) * Math.PI) * 20
                    : 120 + Math.sin(((x - 560) / 160) * Math.PI) * 15
                }
                r="3"
                fill={["#ffd166", "#ff8fd8", "#9ff5e6"][k % 3]}
                className="ag-twinkle"
                style={{ animationDelay: `${-k * 0.4}s` }}
              />
            ),
          )}
          {pine(740, 150, 1.6, "#24543e")}
          {Array.from({ length: 8 }, (_, k) => {
            const a = (k / 8) * Math.PI * 2;
            return (
              <g
                key={`m${k}`}
                transform={`translate(${560 + Math.cos(a) * 70} ${226 + Math.sin(a) * 16})`}
              >
                <rect x="-2" y="-6" width="4" height="8" fill="#f4ead2" />
                <path
                  d="M-8 -5 Q0 -16 8 -5 Z"
                  fill={k % 2 ? "#e8343c" : "#c084fc"}
                />
                <circle cx="-2" cy="-8" r="1.2" fill="#fff" />
                <circle cx="3" cy="-9" r="1" fill="#fff" />
              </g>
            );
          })}
          {[180, 300, 470].map((x) => (
            <g key={x} transform={`translate(${x} 236)`}>
              <path d="M0 0 V-10" stroke="#9ff5e6" strokeWidth="2" />
              <ellipse
                cx="0"
                cy="-12"
                rx="7"
                ry="4"
                fill="#9ff5e6"
                className="ag-glow"
              />
            </g>
          ))}
        </Bed>
      );
    case "seaside":
      return (
        <Bed
          far="#f2dca0"
          near="#e8c97a"
          soil="#6a4a2a"
          rows="#4a3018"
          back={
            <>
              <rect y="110" width="800" height="80" fill="#4fb3d9" />
              <path
                d="M0 120 Q100 112 200 120 T400 120 T600 120 T800 120"
                stroke="#fff"
                strokeOpacity="0.7"
                strokeWidth="3"
                fill="none"
                className="ag-waves"
              />
              <path
                d="M0 140 Q100 132 200 140 T400 140 T600 140 T800 140"
                stroke="#fff"
                strokeOpacity="0.5"
                strokeWidth="2"
                fill="none"
                className="ag-waves"
              />
            </>
          }
        >
          {/* Striped beach huts, a lighthouse, a sailboat and a seagull. */}
          <g transform="translate(660 40)">
            <path
              d="M10 140 L18 20 H38 L46 140 Z"
              fill="#fff"
              stroke="#9a8a7a"
              strokeWidth="1.5"
            />
            <path
              d="M14 90 H42 L44 110 H12 Z M16 50 H40 L41 68 H15 Z"
              fill="#e8463c"
            />
            <rect
              x="16"
              y="6"
              width="24"
              height="14"
              fill="#ffd166"
              stroke="#7a5a2a"
              strokeWidth="1.5"
              className="ag-glow"
            />
            <path d="M12 6 L28 -8 L44 6 Z" fill="#e8463c" />
          </g>
          {[90, 150, 210].map((x, k) => (
            <g key={x} transform={`translate(${x} 176)`}>
              <rect x="0" y="0" width="44" height="40" fill="#fff" />
              {[0, 1, 2, 3].map((s) => (
                <rect
                  key={s}
                  x={s * 11}
                  y="0"
                  width="5.5"
                  height="40"
                  fill={["#ff6b8a", "#4fc3f7", "#7bd389"][k]}
                />
              ))}
              <path
                d="M-4 2 L22 -16 L48 2 Z"
                fill="#fff"
                stroke="#9a8a7a"
                strokeWidth="1.5"
              />
              <rect x="16" y="20" width="12" height="20" fill="#7a5a2a" />
            </g>
          ))}
          <g transform="translate(480 120)" className="ag-bob">
            <path d="M-26 0 H26 L18 10 H-18 Z" fill="#8a5a32" />
            <path d="M0 0 V-40 L22 -4 Z" fill="#fff" stroke="#9a8a7a" />
          </g>
          <path
            d="M330 70 q8 -8 16 0 q8 -8 16 0"
            stroke="#3a3a3a"
            strokeWidth="2.5"
            fill="none"
            className="ag-gull"
          />
          {[300, 520, 600].map((x) => (
            <path
              key={x}
              d={`M${x} 230 q4 -14 2 -24 M${x} 230 q-6 -10 -10 -16 M${x} 230 q8 -8 12 -12`}
              stroke="#9aa86a"
              strokeWidth="2"
              fill="none"
            />
          ))}
        </Bed>
      );
    case "rooftop":
      return (
        <Bed
          far="#9aa6b8"
          near="#b9a48a"
          soil="#5a3a26"
          rows="#3a2414"
          back={
            <g fill="#7f8ca0">
              {[0, 60, 110, 180, 230, 300, 520, 580, 640, 700, 750].map(
                (x, k) => (
                  <rect
                    key={x}
                    x={x}
                    y={60 + ((k * 37) % 70)}
                    width="46"
                    height="200"
                  />
                ),
              )}
            </g>
          }
        >
          {/* Tar roof, a wooden water tower, chimneys with pots, raised planter boxes and strung bulbs. */}
          <rect x="0" y="196" width="800" height="60" fill="#6a6f78" />
          <path d="M0 196 H800" stroke="#4a4f58" strokeWidth="4" />
          <g transform="translate(600 70)">
            <path
              d="M0 40 L-6 126 M60 40 L66 126 M30 40 V126 M-4 90 L64 90"
              stroke="#5a4a3a"
              strokeWidth="3"
            />
            <path
              d="M-4 40 Q30 30 64 40 V0 Q30 -8 -4 0 Z"
              fill="#a56a3a"
              stroke="#5a3a1a"
              strokeWidth="2"
            />
            <path
              d="M-4 14 Q30 6 64 14 M-4 28 Q30 20 64 28"
              stroke="#5a3a1a"
              strokeWidth="1.5"
              fill="none"
            />
            <path d="M-8 0 L30 -24 L68 0 Z" fill="#7a4a2a" />
          </g>
          {[120, 220].map((x) => (
            <g key={x} transform={`translate(${x} 150)`}>
              <rect
                x="0"
                y="0"
                width="24"
                height="46"
                fill="#a5452f"
                stroke="#6b2a1a"
                strokeWidth="1.5"
              />
              <rect x="4" y="-8" width="7" height="8" fill="#c9734a" />
              <rect x="13" y="-6" width="7" height="6" fill="#c9734a" />
            </g>
          ))}
          {[300, 470].map((x) => (
            <g key={x} transform={`translate(${x} 210)`}>
              <rect
                x="0"
                y="0"
                width="90"
                height="26"
                fill="#9a6a3a"
                stroke="#5a3a1a"
                strokeWidth="1.5"
              />
              {[12, 32, 52, 72].map((p, k) => (
                <g key={p} transform={`translate(${p} 0)`}>
                  <path d="M0 0 q-4 -10 0 -16 q4 6 0 16" fill="#4f9e3e" />
                  <circle
                    cy="-16"
                    r="4"
                    fill={["#ff6b8a", "#ffd166", "#c084fc", "#ff9f43"][k]}
                  />
                </g>
              ))}
            </g>
          ))}
          <path
            d="M60 120 Q300 160 560 118"
            stroke="#3a3a3a"
            strokeWidth="1"
            fill="none"
          />
          {[100, 160, 220, 280, 340, 400, 460, 520].map((x, k) => (
            <circle
              key={x}
              cx={x}
              cy={120 + Math.sin(((x - 60) / 500) * Math.PI) * 22}
              r="3.5"
              fill="#fff2a8"
              className="ag-twinkle"
              style={{ animationDelay: `${-k * 0.3}s` }}
            />
          ))}
        </Bed>
      );
    case "pumpkin-patch":
      return (
        <Bed far="#e8b464" near="#c9883a" soil="#5a3a1e" rows="#3a2410">
          {/* Autumn trees, a scarecrow, hay bales and a patch of fat pumpkins. */}
          {[
            [60, 140, "#e8743a"],
            [700, 132, "#d9a03a"],
            [760, 150, "#c2410c"],
          ].map(([x, y, c]) => (
            <g key={String(x)} transform={`translate(${x} ${y})`}>
              <rect x="-3" y="0" width="6" height="40" fill="#6b4a2a" />
              <circle cy="-10" r="24" fill={String(c)} />
              <circle cx="-10" cy="-18" r="12" fill="#ffb347" opacity="0.8" />
            </g>
          ))}
          <g transform="translate(230 150)">
            <path d="M0 0 V80 M-30 20 H30" stroke="#6b4a2a" strokeWidth="5" />
            <path
              d="M-14 22 H14 L18 56 H-18 Z"
              fill="#4f7ab8"
              stroke="#2a4a7a"
              strokeWidth="1.5"
            />
            <path d="M-8 30 h6 v6 h-6 Z" fill="#e8463c" />
            <circle
              cy="6"
              r="11"
              fill="#f2d79a"
              stroke="#a88a4a"
              strokeWidth="1.2"
            />
            <path d="M-16 -2 H16 L8 -6 L6 -16 H-6 L-8 -6 Z" fill="#8a6a3a" />
            <path
              d="M-4 4 l2 2 M4 4 l-2 2 M-4 11 q4 3 8 0"
              stroke="#5a3a1a"
              strokeWidth="1.2"
              fill="none"
            />
            <path
              d="M-30 20 l-6 6 M-30 20 l-6 -2 M30 20 l6 6 M30 20 l6 -2"
              stroke="#d9b45a"
              strokeWidth="2"
            />
          </g>
          {[520, 590].map((x) => (
            <g key={x} transform={`translate(${x} 214)`}>
              <rect
                x="0"
                y="0"
                width="56"
                height="28"
                rx="4"
                fill="#e8c35a"
                stroke="#a8863a"
                strokeWidth="1.5"
              />
              <path d="M4 9 H52 M4 19 H52" stroke="#a8863a" strokeWidth="1" />
            </g>
          ))}
          {[110, 170, 300, 470, 640, 700].map((x, k) => (
            <g
              key={x}
              transform={`translate(${x} ${270 + (k % 2) * 12}) scale(${0.8 + (k % 3) * 0.2})`}
            >
              <ellipse cx="-7" cy="0" rx="9" ry="10" fill="#e8742a" />
              <ellipse cx="7" cy="0" rx="9" ry="10" fill="#e8742a" />
              <ellipse
                cx="0"
                cy="0"
                rx="9"
                ry="11"
                fill="#ff8a3a"
                stroke="#b8501a"
                strokeWidth="1"
              />
              <path
                d="M0 -10 q2 -6 6 -7"
                stroke="#4f7a2a"
                strokeWidth="2.5"
                fill="none"
              />
            </g>
          ))}
        </Bed>
      );
    case "oasis":
      return (
        <Bed
          far="#f2c98a"
          near="#e8b064"
          soil="#7a5a32"
          rows="#5a3a1a"
          back={<circle cx="640" cy="80" r="36" fill="#fff2b0" opacity="0.8" />}
        >
          {/* Dunes, palms around a blue pool, cacti and a resting camel. */}
          <ellipse
            cx="560"
            cy="226"
            rx="90"
            ry="16"
            fill="#3fb3c9"
            stroke="#2a8aa0"
            strokeWidth="2"
          />
          <path
            d="M490 226 Q560 218 630 226"
            stroke="#fff"
            strokeOpacity="0.6"
            strokeWidth="2"
            fill="none"
            className="ag-waves"
          />
          {[
            [490, 200, -1],
            [640, 196, 1],
          ].map(([x, y, s]) => (
            <g key={x} transform={`translate(${x} ${y})`}>
              <path
                d={`M0 30 Q${s * 6} -10 ${s * 2} -50`}
                stroke="#8a6236"
                strokeWidth="6"
                fill="none"
              />
              {[-60, -20, 20, 60, 100].map((a) => (
                <path
                  key={a}
                  d="M0 0 q20 -10 40 6 q-20 -4 -40 -6"
                  fill="#3f9e4a"
                  transform={`translate(${s * 2} -50) rotate(${a})`}
                  className="ag-sway"
                />
              ))}
            </g>
          ))}
          {[120, 300].map((x) => (
            <g key={x} transform={`translate(${x} 210)`}>
              <path
                d="M0 30 V-14 Q0 -22 6 -22 Q12 -22 12 -14 V30 Z"
                fill="#5aa04a"
                stroke="#2f6e2a"
                strokeWidth="1.5"
              />
              <path
                d="M12 4 H20 V-8 Q20 -12 24 -12 Q28 -12 28 -8 V8 Q28 12 20 12 H12 M0 10 H-6 V0 Q-6 -4 -9 -4 Q-12 -4 -12 0 V14 Q-12 18 -6 18 H0"
                fill="#5aa04a"
                stroke="#2f6e2a"
                strokeWidth="1.5"
              />
              <circle cx="6" cy="-23" r="3" fill="#ff6b8a" />
            </g>
          ))}
          <g transform="translate(200 236)">
            <path
              d="M-34 0 Q-34 -18 -14 -20 Q-8 -36 2 -22 Q10 -36 18 -20 Q30 -18 32 -4 L40 -18 Q46 -26 52 -20 L50 -12 L42 -4 Q40 4 30 4 H-30 Z"
              fill="#d49a5a"
              stroke="#8a5a2a"
              strokeWidth="1.5"
            />
            <circle cx="47" cy="-20" r="1.2" fill="#2a1a0a" />
          </g>
        </Bed>
      );
    case "moss-temple":
      return (
        <Bed far="#a8c98a" near="#6fa860" soil="#d8ccb0" rows="#a89a7a">
          {/* A raked sand bed with stones, a pagoda, a red maple and a koi pond with an arched bridge. */}
          <g transform="translate(110 70)">
            {[0, 40, 76].map((y, k) => (
              <g key={y} transform={`translate(${k * 6} ${y})`}>
                <path
                  d={`M-30 ${k === 0 ? 10 : 6} Q${36 - k * 6} -4 ${102 - k * 12} ${k === 0 ? 10 : 6} Z`}
                  fill="#4a3a3a"
                />
                <rect
                  x={-14 + k * 0}
                  y="10"
                  width={84 - k * 12}
                  height="26"
                  fill="#c9734a"
                  stroke="#6b2a1a"
                  strokeWidth="1.5"
                />
              </g>
            ))}
            <path d="M36 -12 V-28" stroke="#4a3a3a" strokeWidth="3" />
          </g>
          <g transform="translate(330 160)">
            <path
              d="M0 60 Q4 30 -4 10 M-2 30 Q14 20 24 10"
              stroke="#5a3a26"
              strokeWidth="6"
              fill="none"
            />
            {[
              [-10, 0, 26],
              [24, 2, 22],
              [8, -18, 22],
            ].map(([x, y, r]) => (
              <circle
                key={`${x}${y}`}
                cx={x}
                cy={y}
                r={r}
                fill="#d9343c"
                opacity="0.92"
              />
            ))}
          </g>
          <ellipse
            cx="600"
            cy="226"
            rx="110"
            ry="20"
            fill="#4a8ab0"
            stroke="#3a6a8a"
            strokeWidth="2"
          />
          {[
            [570, 222, "#ff8a3a"],
            [630, 228, "#fff"],
          ].map(([x, y, c]) => (
            <ellipse
              key={String(x)}
              cx={Number(x)}
              cy={Number(y)}
              rx="8"
              ry="3"
              fill={String(c)}
              className="ag-koi"
            />
          ))}
          <path
            d="M520 226 Q600 180 680 226"
            stroke="#c9343c"
            strokeWidth="7"
            fill="none"
          />
          <path
            d="M535 214 V226 M560 200 V226 M600 194 V226 M640 200 V226 M665 214 V226"
            stroke="#a52a2a"
            strokeWidth="2"
          />
          <g transform="translate(440 236)">
            <rect x="-6" y="-26" width="12" height="26" fill="#9a9488" />
            <path d="M-14 -26 H14 L8 -34 H-8 Z" fill="#7a746a" />
            <rect
              x="-5"
              y="-22"
              width="10"
              height="7"
              fill="#ffd27a"
              className="ag-glow"
            />
          </g>
          {[180, 260].map((x) => (
            <ellipse
              key={x}
              cx={x}
              cy="280"
              rx="18"
              ry="9"
              fill="#7a7a72"
              stroke="#5a5a52"
              strokeWidth="1"
            />
          ))}
          {[0, 1, 2].map((k) => (
            <ellipse
              key={k}
              cx="180"
              cy="280"
              rx={30 + k * 10}
              ry={14 + k * 5}
              fill="none"
              stroke="#b8aa8a"
              strokeWidth="1"
            />
          ))}
        </Bed>
      );
    case "winter-greenhouse":
      return (
        <Bed far="#e8f2fa" near="#f6fbff" soil="#5a4636" rows="#3a2a1e">
          {/* Snowy pines, a glass greenhouse full of green, a snowman and falling snow. */}
          {pine(70, 160, 1.4, "#2f6e5a", true)}
          {pine(130, 176, 1.1, "#3a7a64", true)}
          {pine(750, 156, 1.5, "#2f6e5a", true)}
          <g transform="translate(470 110)">
            <path
              d="M0 110 V40 L70 0 L140 40 V110 Z"
              fill="rgb(200 235 245 / 0.45)"
              stroke="#8aa8b8"
              strokeWidth="2.5"
            />
            <path
              d="M35 110 V20 M70 110 V0 M105 110 V20 M0 70 H140"
              stroke="#8aa8b8"
              strokeWidth="1.5"
            />
            {[20, 50, 90, 120].map((x) => (
              <g key={x} transform={`translate(${x} 104)`}>
                <path d="M0 0 q-8 -16 0 -28 q8 12 0 28" fill="#4f9e3e" />
                <circle cy="-28" r="4" fill="#ff6b8a" />
              </g>
            ))}
            <path
              d="M0 40 L70 0 L140 40"
              stroke="#fff"
              strokeWidth="5"
              fill="none"
            />
          </g>
          <g transform="translate(260 226)">
            <circle
              cy="0"
              r="18"
              fill="#fff"
              stroke="#c8d6e0"
              strokeWidth="1.5"
            />
            <circle
              cy="-26"
              r="12"
              fill="#fff"
              stroke="#c8d6e0"
              strokeWidth="1.5"
            />
            <path d="M-2 -26 l10 2 l-10 2 Z" fill="#ff8a3a" />
            <circle cx="-4" cy="-30" r="1.4" fill="#2a2a2a" />
            <circle cx="3" cy="-30" r="1.4" fill="#2a2a2a" />
            <path d="M-12 -18 H12" stroke="#e8463c" strokeWidth="4" />
            <path
              d="M-8 -36 H8 V-48 H-8 Z M-12 -36 H12"
              stroke="#2a2a2a"
              strokeWidth="2"
              fill="#2a2a2a"
            />
          </g>
          {Array.from({ length: 24 }, (_, k) => (
            <circle
              key={`s${k}`}
              cx={(k * 97) % 800}
              cy={(k * 53) % 220}
              r={1.5 + (k % 3)}
              fill="#fff"
              className="ag-snow"
              style={{ animationDelay: `${-k * 0.5}s` }}
            />
          ))}
        </Bed>
      );
    default:
      return <Ground />;
  }
}
