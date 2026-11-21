"use client";

import type { GameLook } from "@/lib/game-cosmetics";

/**
 * The Descent's cosmetics (see GAME_SHOPS["blank-atlas"]). Fog styles, dive trails and art styles are CSS keyed on
 * data attributes (cosmetics.css); lanterns and answer markers also need their own artwork, drawn here. Nothing here
 * touches questions or scoring, and every look keeps each dive's colour, so answer quality reads the same in all of them.
 */

export const DESCENT_LOOKS = {
  lantern: [
    "crystal",
    "moth",
    "jelly",
    "orrery",
    "bell-jar",
    "watcher",
    "caged-star",
    "hourglass",
    "anglerfish",
    "lotus",
  ],
  fog: ["ink", "tarot", "will-o-wisps", "ash", "silk", "runes", "bubbles", "marine-snow", "kelp", "stardust"],
  trail: [
    "shattered",
    "pearls",
    "chain",
    "twin-spirits",
    "rune-ladder",
    "embers",
    "cross-stitch",
    "vine",
    "morse",
    "zipper",
  ],
  marker: [
    "clockwork",
    "tarot-card",
    "compass",
    "wax-seal",
    "crystal-shard",
    "sigil",
    "bell",
    "lifebuoy",
    "moon-phase",
    "nautilus",
  ],
  style: ["etching", "stained-glass", "shadow-theatre", "cyanotype", "ukiyo-e"],
} as const;

type Category = keyof typeof DESCENT_LOOKS;
export type DescentLook = Partial<Record<Category, string>>;

/** Only slugs this file knows how to draw; anything else falls back to the default. */
export function descentLook(look: GameLook): DescentLook {
  const out: DescentLook = {};
  for (const category of Object.keys(DESCENT_LOOKS) as Category[]) {
    const slug = look[category];
    if (slug && (DESCENT_LOOKS[category] as readonly string[]).includes(slug))
      out[category] = slug;
  }
  return out;
}

/** The world's attributes (everything but the art style, which goes on the whole game). */
export function worldAttributes(look: DescentLook) {
  return {
    "data-lantern": look.lantern,
    "data-fog": look.fog,
    "data-trail": look.trail,
    "data-marker": look.marker,
  };
}

/* ------------------------------------------------------------------------------------------- Lanterns */

/**
 * The lantern the camera follows. Every lantern has one light (`dw-flame`), which takes the dive's colour while it
 * plunges, exactly like the default lamp.
 */
export function Lantern({ kind }: { kind?: string }) {
  switch (kind) {
    case "crystal":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body" data-float>
          <g className="lt-orbit">
            <path
              d="M-17 -4 l2 -3.5 l2 3.5 l-2 3.5z M14 2 l2 -3 l2 3 l-2 3z M-3 -30 l1.5 -2.5 l1.5 2.5 l-1.5 2.5z"
              className="lt-shard"
            />
          </g>
          <path
            d="M0 -26 L9 -10 L6 10 L0 18 L-6 10 L-9 -10 Z"
            className="lt-crystal"
          />
          <ellipse cx="0" cy="-3" rx="3.5" ry="6.5" className="dw-flame" />
          <path
            d="M0 -26 L3 -10 L0 18 M0 -26 L-3 -10 L0 18 M-9 -10 L-3 -10 M3 -10 L9 -10 M-6 10 L6 10"
            className="lt-facet"
          />
        </svg>
      );
    case "moth":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
          <path d="M0 -34 V-22" className="dw-chain" />
          <g className="lt-wings">
            <path
              d="M-6 -8 C-24 -26 -25 0 -8 0 Z M6 -8 C24 -26 25 0 8 0 Z"
              className="lt-wing"
            />
            <path
              d="M-6 2 C-19 6 -15 17 -5 7 Z M6 2 C19 6 15 17 5 7 Z"
              className="lt-wing"
            />
            <circle cx="-15" cy="-11" r="2" className="lt-wing-eye" />
            <circle cx="15" cy="-11" r="2" className="lt-wing-eye" />
          </g>
          <ellipse cx="0" cy="-3" rx="4" ry="6.5" className="dw-flame" />
          <ellipse cx="0" cy="-3" rx="10" ry="16" className="lt-paper" />
          <path
            d="M-9.4 -9 Q0 -7 9.4 -9 M-10 -3 Q0 -1 10 -3 M-9.4 3 Q0 5 9.4 3 M-7.6 9 Q0 11 7.6 9 M-7.6 -14 Q0 -12 7.6 -14"
            className="lt-ribs"
          />
          <rect
            x="-5"
            y="-21"
            width="10"
            height="3"
            rx="1"
            className="dw-brass"
          />
          <rect
            x="-4"
            y="12"
            width="8"
            height="3"
            rx="1"
            className="dw-brass"
          />
          <path d="M0 15 V21" className="lt-tassel" />
        </svg>
      );
    case "jelly":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body" data-float>
          <g className="lt-tentacles">
            <path d="M-8 -4 C-11 5 -4 10 -9 21 M-3 -4 C-5 8 1 12 -3 25 M3 -4 C5 8 -1 12 3 25 M8 -4 C11 5 4 10 9 21" />
          </g>
          <g className="lt-bell-pulse">
            <path
              d="M-13 -4 C-13 -24 13 -24 13 -4 C9 -2 5 -5 0 -3 C-5 -5 -9 -2 -13 -4 Z"
              className="lt-bell"
            />
            <ellipse cx="0" cy="-11" rx="4.5" ry="4.5" className="dw-flame" />
            <path
              d="M-8 -13 Q-6 -19 0 -19.5 M-10 -6 Q0 -9 10 -6"
              className="lt-bell-rim"
            />
          </g>
        </svg>
      );
    case "orrery":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
          <path d="M0 -34 V-17" className="dw-chain" />
          <circle cx="0" cy="-2" r="5" className="dw-flame" />
          <g className="lt-ring lt-ring-a">
            <ellipse cx="0" cy="-2" rx="15" ry="5" className="lt-brass-line" />
          </g>
          <g className="lt-ring lt-ring-b">
            <ellipse cx="0" cy="-2" rx="5" ry="15" className="lt-brass-line" />
          </g>
          <g className="lt-ring lt-ring-c">
            <circle cx="0" cy="-2" r="11" className="lt-brass-line lt-thin" />
            <circle cx="11" cy="-2" r="2" className="lt-planet" />
            <circle cx="-11" cy="-2" r="1.3" className="lt-planet" />
          </g>
          <path d="M0 13 V17 M-7 17 H7 L5 21 H-5 Z" className="dw-brass" />
        </svg>
      );
    case "bell-jar":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
          <path d="M0 -34 V-26" className="dw-chain" />
          <g className="lt-wisp">
            <path
              d="M0 9 C-7 3 4 -1 -1 -8 C-4 -12 2 -15 0 -19 C6 -13 7 -6 3 -2 C6 2 5 6 0 9 Z"
              className="dw-flame"
            />
            <circle cx="-1.6" cy="-6" r="0.9" className="lt-eye-dot" />
            <circle cx="1.8" cy="-6" r="0.9" className="lt-eye-dot" />
          </g>
          <path
            d="M-11 14 V-11 C-11 -26 11 -26 11 -11 V14 Z"
            className="lt-jar"
          />
          <path d="M-7 -13 C-7 -19 -3 -21.5 0 -21.5" className="lt-glint" />
          <circle cx="0" cy="-25" r="2" className="dw-brass" />
          <path d="M-14 14 H14 L12 19 H-12 Z" className="dw-brass" />
        </svg>
      );
    case "watcher":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
          <path d="M0 -34 V-20" className="dw-chain" />
          <path
            d="M0 -20 V-24 M-9 -16 L-11.5 -20 M9 -16 L11.5 -20 M-15 -8 L-19 -10 M15 -8 L19 -10"
            className="lt-rays"
          />
          <path d="M-16 -2 Q0 -24 16 -2 Q0 20 -16 -2 Z" className="dw-brass" />
          <path
            d="M-12.5 -2 Q0 -18 12.5 -2 Q0 14 -12.5 -2 Z"
            className="lt-sclera"
          />
          <circle cx="0" cy="-2" r="6.5" className="lt-iris" />
          <circle cx="0" cy="-2" r="3.2" className="dw-flame" />
          <path
            d="M-12.5 -2 Q0 -18 12.5 -2 Q0 14 -12.5 -2 Z"
            className="lt-lid"
          />
          <path d="M-6 21 L0 14 L6 21 Z" className="dw-brass" />
        </svg>
      );
    case "caged-star":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
          <path d="M0 -34 V-27" className="dw-chain" />
          <path
            d="M0 -10 L2.4 -4.4 L8 -4 L3.6 -0.4 L5 5 L0 2 L-5 5 L-3.6 -0.4 L-8 -4 L-2.4 -4.4 Z"
            className="dw-flame lt-star"
          />
          <path
            d="M-12 14 V-10 C-12 -24 12 -24 12 -10 V14 M-6 14 V-19.5 M0 14 V-22 M6 14 V-19.5 M-12 -4 H12"
            className="lt-cage"
          />
          <circle cx="0" cy="-26" r="2.2" className="dw-brass" />
          <path d="M-14 14 H14 V18 H-14 Z" className="dw-brass" />
        </svg>
      );
    case "hourglass":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
          <path d="M0 -34 V-25" className="dw-chain" />
          <path d="M-11 -25 H11 V-22 H-11 Z M-11 15 H11 V18 H-11 Z" className="dw-brass" />
          <path d="M-9 -22 V15 M9 -22 V15" className="lt-brass-line" />
          <path d="M-7 -22 C-7 -10 -1 -6 -1 -3 C-1 0 -7 4 -7 15 H7 C7 4 1 0 1 -3 C1 -6 7 -10 7 -22 Z" className="lt-jar" />
          <path d="M-5 -19 H5 C5 -12 1 -8 0 -6 C-1 -8 -5 -12 -5 -19 Z" className="dw-flame" />
          <path d="M0 -5 V9" className="lt-sand" />
          <path d="M-6 15 C-5 10 -2 8 0 8 C2 8 5 10 6 15 Z" className="dw-flame lt-sand-pile" />
        </svg>
      );
    case "anglerfish":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body" data-float>
          <path d="M-2 4 C-4 -14 4 -22 10 -24" className="lt-lure-stalk" />
          <circle cx="11" cy="-24" r="4.5" className="dw-flame" />
          <path d="M-18 6 C-14 -8 2 -10 10 2 C6 14 -10 18 -18 6 Z" className="lt-angler" />
          <path d="M-18 6 L-24 0 L-23 13 Z" className="lt-angler" />
          <path d="M8 2 L4 5 L6 1 L2 4 L4 0 L0 3 M8 3 L4 7 L6 4 L2 8 L4 5" className="lt-teeth" />
          <circle cx="-2" cy="-1" r="2.2" className="lt-angler-eye" />
        </svg>
      );
    case "lotus":
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body" data-float>
          <ellipse cx="0" cy="-6" rx="3" ry="6" className="dw-flame" />
          <rect x="-2.5" y="-2" width="5" height="7" rx="1" className="lt-candle" />
          <path d="M-16 6 C-14 -4 -8 -2 -5 4 Z M16 6 C14 -4 8 -2 5 4 Z" className="lt-petal" />
          <path d="M-9 8 C-10 -8 -4 -8 -1 6 Z M9 8 C10 -8 4 -8 1 6 Z" className="lt-petal lt-petal-mid" />
          <path d="M-18 8 C-6 14 6 14 18 8 C10 16 -10 16 -18 8 Z" className="lt-petal" />
        </svg>
      );
    default:
      return (
        <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
          <path d="M0 -34 V-24" className="dw-chain" />
          <path d="M-9 -24 H9 L7 -19 H-7 Z" className="dw-brass" />
          <path d="M-8 -19 H8 L10 12 H-10 Z" className="dw-glass" />
          <path d="M-12 12 H12 L9 18 H-9 Z" className="dw-brass" />
          <ellipse cx="0" cy="-2" rx="4.5" ry="7" className="dw-flame" />
        </svg>
      );
  }
}

/* ------------------------------------------------------------------------------------------- Answer markers */

const gear = (() => {
  const teeth = 12;
  let d = "";
  for (let i = 0; i < teeth * 2; i += 1) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 ? 14.5 : 18;
    d += `${i ? "L" : "M"}${(Math.cos(a0) * r).toFixed(2)} ${(Math.sin(a0) * r).toFixed(2)} L${(Math.cos(a1) * r).toFixed(2)} ${(Math.sin(a1) * r).toFixed(2)} `;
  }
  return `${d}Z`;
})();

const point = (r: number, a: number) =>
  `${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`;
const rose =
  Array.from(
    { length: 16 },
    (_, i) =>
      `${i ? "L" : "M"}${point(i % 4 === 0 ? 19 : i % 2 === 0 ? 13 : 7, (i / 16) * Math.PI * 2 - Math.PI / 2)}`,
  ).join(" ") + " Z";
const hexagon =
  Array.from(
    { length: 6 },
    (_, i) =>
      `${i ? "L" : "M"}${point(17, (i / 6) * Math.PI * 2 - Math.PI / 2)}`,
  ).join(" ") + " Z";
const facets = Array.from(
  { length: 6 },
  (_, i) => `M0 0 L${point(17, (i / 6) * Math.PI * 2 - Math.PI / 2)}`,
).join(" ");
const triangle =
  Array.from(
    { length: 3 },
    (_, i) =>
      `${i ? "L" : "M"}${point(15, (i / 3) * Math.PI * 2 - Math.PI / 2)}`,
  ).join(" ") + " Z";
const ticks = Array.from(
  { length: 12 },
  (_, i) =>
    `M${point(15.5, (i / 12) * Math.PI * 2)} L${point(18.5, (i / 12) * Math.PI * 2)}`,
).join(" ");
const seal =
  Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2;
    const r = 16.5 + (i % 3 === 0 ? 2.2 : i % 2 ? -0.6 : 1);
    return `${i ? "L" : "M"}${point(r, a)}`;
  }).join(" ") + " Z";

/** A marker's artwork behind its number; strokes and fills use the dive's colour (`--dv`). */
function MarkerArt({ kind }: { kind: string }) {
  switch (kind) {
    case "clockwork":
      return (
        <>
          <g className="mk-spin">
            <path d={gear} className="mk-frame" />
          </g>
          <circle r="10.5" className="mk-line" />
          <path
            d="M0 -10.5 V-7 M0 10.5 V7 M-10.5 0 H-7 M10.5 0 H7"
            className="mk-line"
          />
        </>
      );
    case "tarot-card":
      return (
        <>
          <rect
            x="-13"
            y="-19"
            width="26"
            height="38"
            rx="3"
            className="mk-frame"
          />
          <rect
            x="-10"
            y="-16"
            width="20"
            height="32"
            rx="1.5"
            className="mk-line"
          />
          <path
            d="M0 -15 L1.2 -12.4 L4 -12.2 L1.8 -10.4 L2.5 -7.6 L0 -9.1 L-2.5 -7.6 L-1.8 -10.4 L-4 -12.2 L-1.2 -12.4 Z"
            className="mk-fill"
          />
          <path
            d="M-3 13 A4 4 0 1 0 3 13 A3 3 0 1 1 -3 13 Z"
            className="mk-fill"
          />
        </>
      );
    case "compass":
      return (
        <>
          <path d={rose} className="mk-fill mk-soft" />
          <circle r="10.5" className="mk-frame" />
        </>
      );
    case "wax-seal":
      return (
        <>
          <path d={seal} className="mk-wax" />
          <circle r="12" className="mk-emboss" />
        </>
      );
    case "crystal-shard":
      return (
        <>
          <path d={hexagon} className="mk-frame mk-tint" />
          <path d={facets} className="mk-line" />
          <path d="M-9 -9 L-5 -12" className="mk-glint" />
        </>
      );
    case "sigil":
      return (
        <>
          <g className="mk-spin">
            <circle r="17" className="mk-line" />
            <path d={triangle} className="mk-line" />
            <path d={ticks} className="mk-line" />
          </g>
          <circle r="10" className="mk-frame" />
        </>
      );
    case "bell":
      return (
        <>
          <path
            d="M0 -19 V-16 M-11 10 C-11 -4 -9 -15 0 -15 C9 -15 11 -4 11 10 L14 13 H-14 Z"
            className="mk-frame mk-tint"
          />
          <circle cy="16" r="2.6" className="mk-fill" />
        </>
      );
    case "lifebuoy":
      return (
        <g className="mk-bob">
          <circle r="15" className="mk-buoy" />
          <path d="M0 -19 V-11 M0 11 V19 M-19 0 H-11 M11 0 H19" className="mk-buoy-band" />
          <circle r="15" className="mk-line" />
        </g>
      );
    case "moon-phase":
      return (
        <>
          <path d="M6 -16 A17 17 0 1 0 6 16 A13 13 0 1 1 6 -16 Z" className="mk-fill mk-moon" />
          <circle cx="10" cy="-12" r="1.2" className="mk-fill" />
          <circle cx="14" cy="-4" r="0.8" className="mk-fill" />
          <circle r="10" className="mk-frame" />
        </>
      );
    case "nautilus":
      return (
        <>
          <path d="M0 0 m0 -17 a17 17 0 1 1 -14.7 8.5 a13 13 0 0 1 9 -12.5 a9 9 0 0 1 9.5 5 a6 6 0 0 1 -3 7" className="mk-frame mk-tint" />
          <path d="M-14.7 -8.5 L-5.7 -4 M0 -17 L1 -8 M14.5 -9 L7 -3 M15 9 L7 5 M0 17 L0 9" className="mk-line" />
          <circle r="9" className="mk-frame" />
        </>
      );
    default:
      return null;
  }
}

/** The numbered badge where an answer landed: the default ring, or the equipped marker's artwork around the number. */
export function MarkBadge({ kind, number }: { kind?: string; number: number }) {
  if (!kind) {
    return (
      <span aria-hidden className="dw-mark-dot">
        {number}
      </span>
    );
  }
  return (
    <span aria-hidden className="dw-mark-dot" data-art={kind}>
      <svg viewBox="-20 -20 40 40" className="dw-mark-art">
        <MarkerArt kind={kind} />
      </svg>
      <b>{number}</b>
    </span>
  );
}
