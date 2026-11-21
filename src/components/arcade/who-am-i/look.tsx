"use client";

import type { CSSProperties, ReactNode } from "react";
import type { GameLook } from "@/lib/game-cosmetics";
import { MysteryPortrait } from "./portrait";

/**
 * Who Am I?'s cosmetics. The table carries one `data-wai-<category>` attribute per equipped item (see
 * `tableAttributes` and cosmetics.css); this file holds the artwork that needs markup: table backdrops, card backs,
 * question flourishes and victory reveals.
 *
 * Fair play: every player only ever sees their own cosmetics (in Wagers too), and nothing here depends on who
 * anyone is. Your hidden card shows the same back whatever is on its face, effects never delay a move, and
 * victory reveals only play once the round is over.
 */

export const WHO_AM_I_LOOKS = {
  table: [
    "moonlit-library",
    "green-baize",
    "lantern-garden",
    "noir-office",
    "fortune-tent",
    "sunken-galleon",
    "starship-bridge",
    "alchemy-lab",
    "dining-car",
    "snowed-cabin",
  ],
  card: [
    "stained-glass",
    "gilded-baroque",
    "celestial-almanac",
    "pressed-botanicals",
    "art-deco",
    "woven-tapestry",
    "holo-foil",
    "royal-deck",
    "blue-willow",
    "treasure-map",
  ],
  question: [
    "wax-seal",
    "quill-ink",
    "telegram",
    "spotlight",
    "paper-plane",
    "crystal-mist",
    "comic-burst",
    "megaphone",
    "ransom-note",
    "carrier-pigeon",
  ],
  marker: [
    "rubber-stamp",
    "brass-medallion",
    "chalk-scrawl",
    "neon-script",
    "cross-stitch",
    "die-cut-sticker",
    "ticket-punch",
    "leather-tag",
    "pixel-badge",
    "paint-blot",
  ],
  reveal: [
    "curtain-call",
    "magicians-hat",
    "masquerade",
    "gallery-unveil",
    "fireworks-finale",
    "lantern-release",
    "constellation-crown",
    "butterfly-flight",
    "rainbow-arch",
    "trophy",
  ],
  style: ["illuminated", "comic-panel", "cut-paper", "phosphor-terminal", "art-nouveau"],
} as const;

type Looks = typeof WHO_AM_I_LOOKS;
export type WhoAmILook = { [K in keyof Looks]: Looks[K][number] | undefined };

/** The equipped slugs this renderer knows; anything else falls back to the default. */
export function whoAmILook(look: GameLook): WhoAmILook {
  const pick = <K extends keyof Looks>(key: K) =>
    (WHO_AM_I_LOOKS[key] as readonly string[]).includes(look[key] ?? "")
      ? (look[key] as Looks[K][number])
      : undefined;
  return {
    table: pick("table"),
    card: pick("card"),
    question: pick("question"),
    marker: pick("marker"),
    reveal: pick("reveal"),
    style: pick("style"),
  };
}

/** `data-wai-<category>` for every equipped item, spread on the table root. */
export function tableAttributes(look: WhoAmILook) {
  const attributes: Record<string, string> = {};
  for (const [category, slug] of Object.entries(look))
    if (slug) attributes[`data-wai-${category}`] = slug;
  return attributes;
}

/* ---------------------------------------------------------------------------------------------
 * Table backdrops: scenery behind the panels (which are translucent, so it shows through).
 * ------------------------------------------------------------------------------------------- */

const MOTES = Array.from({ length: 10 }, (_, k) => ({
  x: (k * 37 + 7) % 100,
  y: (k * 53 + 19) % 90,
  d: (k * 1.3) % 9,
}));
const LANTERNS = [8, 22, 37, 52, 67, 82, 94];
const RAIN = Array.from({ length: 14 }, (_, k) => ({
  x: (k * 29 + 5) % 100,
  d: (k * 0.37) % 1.4,
  h: 6 + ((k * 7) % 8),
}));
const BUBBLES = Array.from({ length: 9 }, (_, k) => ({
  x: (k * 41 + 9) % 100,
  d: (k * 1.7) % 11,
  s: 0.35 + ((k * 3) % 4) * 0.15,
}));
const HANGING_STARS = [12, 30, 48, 70, 88];

const dots = (
  items: { x: number; y?: number; d: number }[],
  className: string,
  extra?: (item: { x: number; y?: number; d: number }) => CSSProperties,
) =>
  items.map((item, k) => (
    <i
      key={k}
      className={className}
      style={{
        left: `${item.x}%`,
        top: item.y === undefined ? undefined : `${item.y}%`,
        animationDelay: `${-item.d}s`,
        ...extra?.(item),
      }}
    />
  ));

export function TableBackdrop({ kind }: { kind: WhoAmILook["table"] }) {
  if (!kind) return null;
  let scene: ReactNode = null;
  if (kind === "moonlit-library") {
    scene = (
      <>
        <i className="wtb-shelves" />
        <i className="wtb-moon" />
        {dots(MOTES, "wtb-mote")}
      </>
    );
  } else if (kind === "green-baize") {
    scene = (
      <>
        <i className="wtb-lamp" />
        <i className="wtb-rail" />
      </>
    );
  } else if (kind === "lantern-garden") {
    scene = (
      <>
        <i className="wtb-bamboo" />
        <i className="wtb-string" />
        {LANTERNS.map((x, k) => (
          <i
            key={k}
            className="wtb-lantern"
            style={{
              left: `${x}%`,
              top: `${2 + (k % 3) * 2.2}%`,
              animationDelay: `${-k * 0.7}s`,
            }}
          />
        ))}
      </>
    );
  } else if (kind === "noir-office") {
    scene = (
      <>
        <i className="wtb-blinds" />
        <i className="wtb-desk-lamp" />
        {dots(RAIN, "wtb-rain", (item) => ({
          height: `${(item as (typeof RAIN)[number]).h}%`,
        }))}
      </>
    );
  } else if (kind === "fortune-tent") {
    scene = (
      <>
        <i className="wtb-tent" />
        <i className="wtb-crystal" />
        {HANGING_STARS.map((x, k) => (
          <i
            key={k}
            className="wtb-star"
            style={{
              left: `${x}%`,
              height: `${8 + (k % 3) * 5}%`,
              animationDelay: `${-k * 0.9}s`,
            }}
          />
        ))}
      </>
    );
  } else if (kind === "sunken-galleon") {
    scene = (
      <>
        <i className="wtb-caustics" />
        <i className="wtb-porthole" />
        {dots(BUBBLES, "wtb-bubble", (item) => ({
          scale: String((item as (typeof BUBBLES)[number]).s),
        }))}
      </>
    );
  } else if (kind === "alchemy-lab") {
    scene = (
      <>
        <i className="wtb-lab-shelf" />
        <i className="wtb-cauldron" />
        {dots(BUBBLES, "wtb-fume", (item) => ({
          scale: String((item as (typeof BUBBLES)[number]).s),
        }))}
      </>
    );
  } else if (kind === "dining-car") {
    scene = (
      <>
        <i className="wtb-panelling" />
        <i className="wtb-train-window">
          <i className="wtb-hills" />
        </i>
        <i className="wtb-brass-lamp" />
      </>
    );
  } else if (kind === "snowed-cabin") {
    scene = (
      <>
        <i className="wtb-logs" />
        <i className="wtb-fireplace" />
        <i className="wtb-frost-window" />
        {dots(MOTES, "wtb-snow")}
      </>
    );
  } else {
    scene = (
      <>
        <i className="wtb-stars" />
        <i className="wtb-viewport" />
        <i className="wtb-scan" />
      </>
    );
  }
  return (
    <div aria-hidden className="wai-backdrop" data-scene={kind}>
      {scene}
    </div>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Card backs: the face-down card you hold. One fixed design per back, never anything about the face.
 * ------------------------------------------------------------------------------------------- */

const QUESTION_MARK = (
  fill: string,
  font = "ui-sans-serif, system-ui",
  size = 30,
  y = 61,
) => (
  <text
    x="50"
    y={y}
    textAnchor="middle"
    fontSize={size}
    fontWeight="800"
    fill={fill}
    fontFamily={font}
  >
    ?
  </text>
);

function StainedGlassBack() {
  const panes = [
    "#b384ff",
    "#34d399",
    "#4c8dff",
    "#ff4d6d",
    "#ffb63b",
    "#5fd0ff",
    "#ff8fbf",
    "#7ee0a0",
  ];
  return (
    <>
      <rect width="100" height="100" rx="10" fill="#18141f" />
      {panes.map((color, k) => {
        const a = (k * Math.PI) / 4;
        const b = ((k + 1) * Math.PI) / 4;
        return (
          <path
            key={k}
            d={`M50 50 L${50 + 46 * Math.cos(a)} ${50 + 46 * Math.sin(a)} A46 46 0 0 1 ${50 + 46 * Math.cos(b)} ${50 + 46 * Math.sin(b)} Z`}
            fill={color}
            opacity="0.85"
            stroke="#18141f"
            strokeWidth="2.6"
          />
        );
      })}
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="none"
        stroke="#18141f"
        strokeWidth="3"
      />
      <circle
        cx="50"
        cy="50"
        r="19"
        fill="#fbf3dc"
        stroke="#18141f"
        strokeWidth="3"
      />
      {QUESTION_MARK("#2a1d3a", "ui-serif, Georgia, serif", 26, 59)}
    </>
  );
}

function GildedBaroqueBack() {
  return (
    <>
      <rect width="100" height="100" rx="10" fill="#6d0f22" />
      <rect width="100" height="100" rx="10" fill="url(#wai-cb-velvet)" />
      <rect
        x="6"
        y="6"
        width="88"
        height="88"
        rx="6"
        fill="none"
        stroke="#e8c15a"
        strokeWidth="2.4"
      />
      <rect
        x="10"
        y="10"
        width="80"
        height="80"
        rx="4"
        fill="none"
        stroke="#e8c15a"
        strokeWidth="0.9"
      />
      {[
        [10, 10, 1, 1],
        [90, 10, -1, 1],
        [10, 90, 1, -1],
        [90, 90, -1, -1],
      ].map(([x, y, sx, sy], k) => (
        <path
          key={k}
          d={`M${x} ${y} q${12 * sx} ${2 * sy} ${14 * sx} ${14 * sy} q${-6 * sx} ${-4 * sy} ${-14 * sx} ${-14 * sy} M${x + 4 * sx} ${y} c${6 * sx} ${-1 * sy} ${8 * sx} ${6 * sy} ${3 * sx} ${8 * sy}`}
          fill="#e8c15a"
          stroke="#e8c15a"
          strokeWidth="0.8"
        />
      ))}
      <ellipse
        cx="50"
        cy="50"
        rx="19"
        ry="24"
        fill="#4a0815"
        stroke="#e8c15a"
        strokeWidth="2"
      />
      {QUESTION_MARK("#f4d77a", "ui-serif, Georgia, serif", 30, 61)}
    </>
  );
}

function CelestialBack() {
  return (
    <>
      <rect width="100" height="100" rx="10" fill="#101a3f" />
      {[18, 34, 50, 66, 82].map((x, k) => (
        <g key={x}>
          <circle cx={x} cy="14" r="5" fill="#e7ecff" />
          <circle
            cx={x + [-6, -3, 0, 3, 6][k]}
            cy="14"
            r="5"
            fill="#101a3f"
            opacity={k === 2 ? 0 : 1}
          />
        </g>
      ))}
      {[
        [14, 40],
        [86, 44],
        [22, 78],
        [80, 82],
        [64, 30],
        [34, 30],
      ].map(([x, y], k) => (
        <path
          key={k}
          d={`M${x} ${y - 3} L${x + 1} ${y - 1} L${x + 3} ${y} L${x + 1} ${y + 1} L${x} ${y + 3} L${x - 1} ${y + 1} L${x - 3} ${y} L${x - 1} ${y - 1} Z`}
          fill="#cfd7ff"
        />
      ))}
      <path d="M62 34 A22 22 0 1 0 62 78 A17 17 0 1 1 62 34 Z" fill="#d7dcf5" />
      {QUESTION_MARK("#101a3f", "ui-serif, Georgia, serif", 24, 64)}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="8"
        fill="none"
        stroke="#aab4e0"
        strokeWidth="1"
        strokeDasharray="1 2.5"
      />
    </>
  );
}

function BotanicalBack() {
  const leaf = (x: number, y: number, r: number, color: string) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M0 0 Q8 -10 0 -24 Q-8 -10 0 0 Z" fill={color} opacity="0.85" />
      <path d="M0 0 V-22" stroke="#4d5e2d" strokeWidth="0.7" />
    </g>
  );
  return (
    <>
      <rect width="100" height="100" rx="10" fill="#efe5cc" />
      {leaf(20, 34, -30, "#7d9a4a")}
      {leaf(80, 30, 35, "#a3b665")}
      {leaf(24, 90, -150, "#a3b665")}
      {leaf(78, 92, 150, "#7d9a4a")}
      <path
        d="M50 96 C46 80 54 70 50 56"
        stroke="#5c6e33"
        strokeWidth="1.4"
        fill="none"
      />
      {[0, 1, 2, 3].map((k) => (
        <path
          key={k}
          d={`M50 ${90 - k * 9} q${k % 2 ? 9 : -9} -3 ${k % 2 ? 13 : -13} -9`}
          stroke="#6f8640"
          strokeWidth="1.2"
          fill="none"
        />
      ))}
      <circle
        cx="50"
        cy="40"
        r="18"
        fill="#f7efd9"
        stroke="#8c7a52"
        strokeWidth="1.2"
      />
      {QUESTION_MARK("#4b3a22", "ui-serif, Georgia, serif", 26, 49)}
    </>
  );
}

function ArtDecoBack() {
  return (
    <>
      <rect width="100" height="100" rx="10" fill="#111014" />
      {Array.from({ length: 13 }, (_, k) => {
        const a = Math.PI + (k * Math.PI) / 12;
        return (
          <line
            key={k}
            x1="50"
            y1="88"
            x2={50 + 60 * Math.cos(a)}
            y2={88 + 60 * Math.sin(a)}
            stroke="#d6b25e"
            strokeWidth="0.9"
            opacity="0.7"
          />
        );
      })}
      <path
        d="M8 8 H92 V92 H8 Z M14 14 H86 V86 H14 Z"
        fill="none"
        stroke="#d6b25e"
        strokeWidth="1.6"
      />
      <path
        d="M8 22 H14 M8 78 H14 M86 22 H92 M86 78 H92 M22 8 V14 M78 8 V14 M22 86 V92 M78 86 V92"
        stroke="#d6b25e"
        strokeWidth="1.6"
      />
      <path
        d="M50 26 L68 50 L50 74 L32 50 Z"
        fill="#111014"
        stroke="#d6b25e"
        strokeWidth="2"
      />
      {QUESTION_MARK("#f0d68a", "ui-serif, Georgia, serif", 24, 59)}
    </>
  );
}

function TapestryBack() {
  return (
    <>
      <defs>
        <pattern
          id="wai-cb-weave"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <rect width="8" height="8" fill="#2f4d6b" />
          <rect width="4" height="4" fill="#c2553b" />
          <rect x="4" y="4" width="4" height="4" fill="#c2553b" />
          <path
            d="M0 2 H8 M0 6 H8"
            stroke="#e8c47a"
            strokeWidth="0.6"
            opacity="0.5"
          />
        </pattern>
      </defs>
      <rect width="100" height="100" rx="10" fill="url(#wai-cb-weave)" />
      <rect
        x="5"
        y="5"
        width="90"
        height="90"
        rx="7"
        fill="none"
        stroke="#f1e4c3"
        strokeWidth="1.6"
        strokeDasharray="3 2"
      />
      <path
        d="M50 22 L76 50 L50 78 L24 50 Z"
        fill="#f1e4c3"
        stroke="#2f4d6b"
        strokeWidth="2"
      />
      <path
        d="M50 30 L68 50 L50 70 L32 50 Z"
        fill="none"
        stroke="#c2553b"
        strokeWidth="1.4"
        strokeDasharray="2 1.6"
      />
      {QUESTION_MARK("#2f4d6b", "ui-serif, Georgia, serif", 24, 59)}
    </>
  );
}

function HoloBack() {
  return (
    <>
      <defs>
        <linearGradient id="wai-cb-holo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9cf6ff" />
          <stop offset="22%" stopColor="#c7a6ff" />
          <stop offset="44%" stopColor="#ffb3e1" />
          <stop offset="66%" stopColor="#fff2a6" />
          <stop offset="88%" stopColor="#a6ffcb" />
          <stop offset="100%" stopColor="#9cf6ff" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="10" fill="url(#wai-cb-holo)" />
      {Array.from({ length: 9 }, (_, k) => (
        <circle
          key={k}
          cx="50"
          cy="50"
          r={8 + k * 6}
          fill="none"
          stroke="#ffffff"
          strokeWidth="0.6"
          opacity="0.45"
        />
      ))}
      <rect
        className="wai-holo-shine"
        x="-60"
        y="-10"
        width="30"
        height="120"
        fill="#ffffff"
        opacity="0.4"
        transform="rotate(20 50 50)"
      />
      <circle cx="50" cy="50" r="17" fill="#ffffff" opacity="0.75" />
      {QUESTION_MARK("#5a3fa0", "ui-sans-serif, system-ui", 26, 59)}
    </>
  );
}

function RoyalDeckBack() {
  return (
    <>
      <defs>
        <pattern id="wai-cb-lattice" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#b3202c" />
          <path d="M0 0 H8 M0 0 V8" stroke="#f4ecd8" strokeWidth="1.4" />
          <circle cx="4" cy="4" r="1" fill="#f4ecd8" />
        </pattern>
      </defs>
      <rect width="100" height="100" fill="#f4ecd8" />
      <rect x="7" y="7" width="86" height="86" rx="6" fill="url(#wai-cb-lattice)" stroke="#7a1018" strokeWidth="2" />
      <circle cx="50" cy="50" r="16" fill="#f4ecd8" stroke="#7a1018" strokeWidth="2" />
      {QUESTION_MARK("#b3202c", "ui-serif, Georgia, serif", 26, 59)}
    </>
  );
}

function BlueWillowBack() {
  return (
    <>
      <rect width="100" height="100" fill="#f6f8fc" />
      <rect x="5" y="5" width="90" height="90" rx="8" fill="none" stroke="#1f4aa0" strokeWidth="3" />
      <rect x="10" y="10" width="80" height="80" rx="5" fill="none" stroke="#1f4aa0" strokeWidth="1" strokeDasharray="2 2" />
      {/* A willow tree, a little bridge and two birds. */}
      <path d="M22 70 Q24 50 30 40 M30 40 Q20 46 16 60 M30 40 Q36 48 38 62 M30 40 Q28 30 34 24" stroke="#1f4aa0" strokeWidth="2" fill="none" />
      <path d="M44 74 Q56 62 68 74" stroke="#1f4aa0" strokeWidth="2.5" fill="none" />
      <path d="M46 74 H66" stroke="#1f4aa0" strokeWidth="1.5" />
      <path d="M62 30 q4 -4 8 0 q4 -4 8 0 M70 40 q3 -3 6 0 q3 -3 6 0" stroke="#1f4aa0" strokeWidth="1.5" fill="none" />
      <path d="M14 84 Q50 78 86 84" stroke="#1f4aa0" strokeWidth="1.5" fill="none" />
      {QUESTION_MARK("#1f4aa0", "ui-serif, Georgia, serif", 22, 60)}
    </>
  );
}

function TreasureMapBack() {
  return (
    <>
      <rect width="100" height="100" fill="#e9d6a8" />
      <path d="M4 6 Q50 2 96 6 Q98 50 94 94 Q50 98 6 94 Q2 50 4 6 Z" fill="#efdeb4" stroke="#8a6a3a" strokeWidth="1.5" />
      <path d="M18 30 Q30 18 44 26 Q52 36 40 44 Q28 52 36 62" fill="none" stroke="#8a6a3a" strokeWidth="1.2" />
      <path d="M20 78 Q34 72 46 76 Q58 80 68 70 Q74 62 80 58" fill="none" stroke="#6a3a1a" strokeWidth="1.6" strokeDasharray="3 3" />
      <path d="M76 52 L84 60 M84 52 L76 60" stroke="#b3202c" strokeWidth="3" strokeLinecap="round" />
      <g transform="translate(78 22)" stroke="#6a3a1a" strokeWidth="1" fill="none">
        <circle r="8" />
        <path d="M0 -11 L2 0 L0 11 L-2 0 Z" fill="#6a3a1a" />
      </g>
      {QUESTION_MARK("#6a3a1a", "ui-serif, Georgia, serif", 22, 50)}
    </>
  );
}

const BACKS: Record<NonNullable<WhoAmILook["card"]>, () => ReactNode> = {
  "stained-glass": StainedGlassBack,
  "gilded-baroque": () => (
    <>
      <defs>
        <pattern
          id="wai-cb-velvet"
          width="6"
          height="100"
          patternUnits="userSpaceOnUse"
        >
          <rect width="3" height="100" fill="#000" opacity="0.14" />
        </pattern>
      </defs>
      <GildedBaroqueBack />
    </>
  ),
  "celestial-almanac": CelestialBack,
  "pressed-botanicals": BotanicalBack,
  "art-deco": ArtDecoBack,
  "woven-tapestry": TapestryBack,
  "holo-foil": HoloBack,
  "royal-deck": RoyalDeckBack,
  "blue-willow": BlueWillowBack,
  "treasure-map": TreasureMapBack,
};

/** A face-down card: your own hidden card, or one not dealt yet. */
export function CardBack({
  kind,
  className,
}: {
  kind: WhoAmILook["card"];
  className?: string;
}) {
  if (!kind) return <MysteryPortrait className={className} />;
  const Back = BACKS[kind];
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={`wai-card-back block size-full ${className ?? ""}`}
      data-back={kind}
    >
      <Back />
    </svg>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Question flourishes: dressing around a question as it's asked. Purely decorative.
 * ------------------------------------------------------------------------------------------- */

export function QuestionFlourish({ kind }: { kind: WhoAmILook["question"] }) {
  if (!kind) return null;
  if (kind === "wax-seal") {
    return (
      <span aria-hidden className="wqf wqf-seal">
        <svg viewBox="0 0 40 40">
          <path
            d="M20 2 C26 2 27 6 31 7 C36 9 34 13 37 17 C39 21 35 24 36 28 C36 33 31 33 28 36 C24 39 21 36 17 37 C12 38 11 33 7 31 C3 29 5 24 3 20 C2 15 6 13 6 9 C7 4 12 5 15 3 Z"
            fill="#b3202c"
          />
          <circle
            cx="20"
            cy="20"
            r="11"
            fill="none"
            stroke="#7d121b"
            strokeWidth="1.6"
          />
          <text
            x="20"
            y="25.5"
            textAnchor="middle"
            fontSize="15"
            fontWeight="800"
            fill="#7d121b"
            fontFamily="ui-serif, Georgia, serif"
          >
            ?
          </text>
        </svg>
      </span>
    );
  }
  if (kind === "quill-ink") {
    return (
      <span aria-hidden className="wqf wqf-quill">
        <svg
          viewBox="0 0 200 12"
          preserveAspectRatio="none"
          className="wqf-underline"
        >
          <path d="M2 8 C40 3 70 11 110 6 S170 4 198 7" pathLength={100} />
        </svg>
        <svg viewBox="0 0 24 24" className="wqf-feather">
          <path
            d="M20 2 C10 4 5 11 4 20 L6 20 C7 15 9 12 12 10 C10 13 9 15 8.5 18 C14 16 18 10 20 2 Z"
            fill="#efe7d6"
            stroke="#5a4a34"
            strokeWidth="0.8"
          />
          <path d="M4 20 L2 22" stroke="#1d1530" strokeWidth="1.4" />
        </svg>
      </span>
    );
  }
  if (kind === "telegram") {
    return (
      <span aria-hidden className="wqf wqf-telegram">
        STOP
      </span>
    );
  }
  if (kind === "spotlight")
    return <span aria-hidden className="wqf wqf-spotlight" />;
  if (kind === "paper-plane") {
    return (
      <span aria-hidden className="wqf wqf-plane">
        <svg viewBox="0 0 32 20">
          <path
            d="M1 10 L31 1 L20 19 L15 12 Z"
            fill="#f4f1ea"
            stroke="#3b3466"
            strokeWidth="1"
          />
          <path
            d="M31 1 L15 12 L14 17 Z"
            fill="#d9d3c4"
            stroke="#3b3466"
            strokeWidth="1"
          />
        </svg>
      </span>
    );
  }
  if (kind === "crystal-mist") {
    return (
      <span aria-hidden className="wqf wqf-mist">
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (kind === "megaphone") {
    return (
      <span aria-hidden className="wqf wqf-megaphone">
        <svg viewBox="0 0 40 24">
          <path d="M4 9 H10 L28 2 V22 L10 15 H4 Z" fill="#ffcf3a" stroke="#3a2a0a" strokeWidth="1.4" strokeLinejoin="round" />
          <rect x="6" y="15" width="4" height="6" rx="1" fill="#3a2a0a" />
          <path d="M32 6 Q36 12 32 18 M35 3 Q41 12 35 21" stroke="#3a2a0a" strokeWidth="1.4" fill="none" strokeLinecap="round" className="wqf-waves" />
        </svg>
      </span>
    );
  }
  if (kind === "ransom-note") {
    return (
      <span aria-hidden className="wqf wqf-ransom">
        <svg viewBox="0 0 24 24">
          <path d="M5 4 L19 20 M19 4 L5 20" stroke="#3a3a44" strokeWidth="2" strokeLinecap="round" />
          <circle cx="6" cy="20" r="3" fill="none" stroke="#c0283a" strokeWidth="2" />
          <circle cx="18" cy="20" r="3" fill="none" stroke="#c0283a" strokeWidth="2" />
        </svg>
      </span>
    );
  }
  if (kind === "carrier-pigeon") {
    return (
      <span aria-hidden className="wqf wqf-pigeon">
        <svg viewBox="0 0 40 28">
          <path d="M6 16 Q10 8 20 10 Q28 10 32 6 L36 8 L32 12 Q30 20 20 20 Q12 21 6 16 Z" fill="#c8ccd8" stroke="#4a4e5a" strokeWidth="1.2" />
          <path d="M14 12 Q18 2 26 4 Q22 10 18 14 Z" fill="#a8acb8" stroke="#4a4e5a" strokeWidth="1" className="wqf-wing" />
          <circle cx="31" cy="8" r="1" fill="#1a1a20" />
          <path d="M36 8 L39 9 L36 10" fill="#e8a02a" />
          <rect x="16" y="20" width="8" height="5" rx="2" fill="#f4ecd8" stroke="#8a6a3a" strokeWidth="0.8" />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden className="wqf wqf-burst">
      ?!
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Victory reveals: played over the result banner and its portrait when you win. Each one ends
 * in a still "after" state, which is also all that shows with effects off or reduced motion.
 * ------------------------------------------------------------------------------------------- */

const ROSES = [18, 34, 52, 68, 84];
const FIREWORKS = [
  { x: 22, y: 30, c: "#ffd84a" },
  { x: 76, y: 24, c: "#ff6f91" },
  { x: 54, y: 62, c: "#5fd0ff" },
];
const RISING = [12, 28, 46, 63, 80, 92];
const CROWN_STARS: [number, number][] = [
  [6, 34],
  [14, 10],
  [26, 26],
  [40, 4],
  [54, 26],
  [66, 10],
  [74, 34],
];

/** The banner-wide part of a reveal. */
export function VictoryReveal({ kind }: { kind: WhoAmILook["reveal"] }) {
  if (!kind) return null;
  let body: ReactNode = null;
  if (kind === "curtain-call") {
    body = (
      <>
        <i className="wvr-curtain" data-side="l" />
        <i className="wvr-curtain" data-side="r" />
        <i className="wvr-valance" />
        {ROSES.map((x, k) => (
          <i
            key={k}
            className="wvr-rose"
            style={{ left: `${x}%`, animationDelay: `${1 + k * 0.12}s` }}
          />
        ))}
      </>
    );
  } else if (kind === "fireworks-finale") {
    body = FIREWORKS.map((burst, k) => (
      <i
        key={k}
        className="wvr-firework"
        style={{
          left: `${burst.x}%`,
          top: `${burst.y}%`,
          color: burst.c,
          animationDelay: `${k * 0.45}s`,
        }}
      >
        {Array.from({ length: 10 }, (_, s) => (
          <b key={s} style={{ "--a": `${s * 36}deg` } as CSSProperties} />
        ))}
      </i>
    ));
  } else if (kind === "lantern-release") {
    body = RISING.map((x, k) => (
      <i
        key={k}
        className="wvr-lantern"
        style={
          {
            left: `${x}%`,
            animationDelay: `${k * 0.22}s`,
            "--sway": `${k % 2 ? 10 : -10}px`,
          } as CSSProperties
        }
      />
    ));
  } else if (kind === "magicians-hat") {
    body = (
      <>
        {[0, 1, 2, 3].map((k) => (
          <i
            key={k}
            className="wvr-card"
            style={{ "--k": k } as CSSProperties}
          />
        ))}
      </>
    );
  } else if (kind === "butterfly-flight") {
    body = RISING.map((x, k) => (
      <i
        key={k}
        className="wvr-butterfly"
        style={
          {
            left: `${x}%`,
            animationDelay: `${k * 0.15}s`,
            "--sway": `${k % 2 ? 18 : -18}px`,
            filter: `hue-rotate(${k * 55}deg)`,
          } as CSSProperties
        }
      />
    ));
  } else if (kind === "rainbow-arch") {
    body = (
      <>
        <i className="wvr-rainbow" />
        <i className="wvr-cloud" data-side="l" />
        <i className="wvr-cloud" data-side="r" />
      </>
    );
  } else {
    body = <i className="wvr-glitter" />;
  }
  return (
    <span aria-hidden className="wai-reveal" data-reveal={kind}>
      {body}
    </span>
  );
}

/** The part of a reveal that sits on the winner's portrait. */
export function PortraitReveal({ kind }: { kind: WhoAmILook["reveal"] }) {
  if (!kind) return null;
  if (kind === "masquerade") {
    return (
      <span aria-hidden className="wvr-on-portrait" data-reveal={kind}>
        <svg viewBox="0 0 60 26" className="wvr-mask">
          <path
            d="M2 6 C10 2 22 4 30 10 C38 4 50 2 58 6 C58 16 50 24 40 22 C34 21 32 16 30 14 C28 16 26 21 20 22 C10 24 2 16 2 6 Z"
            fill="#2b1650"
            stroke="#e8c15a"
            strokeWidth="1.4"
          />
          <ellipse cx="18" cy="12" rx="6" ry="4" fill="#120a24" />
          <ellipse cx="42" cy="12" rx="6" ry="4" fill="#120a24" />
          <path
            d="M56 6 C62 0 64 -2 66 -6"
            stroke="#ff6f91"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </span>
    );
  }
  if (kind === "gallery-unveil") {
    return (
      <span aria-hidden className="wvr-on-portrait" data-reveal={kind}>
        <i className="wvr-frame" />
        <i className="wvr-sheet" />
      </span>
    );
  }
  if (kind === "magicians-hat") {
    return (
      <span aria-hidden className="wvr-on-portrait" data-reveal={kind}>
        <i className="wvr-smoke" />
        <svg viewBox="0 0 30 24" className="wvr-hat">
          <ellipse cx="15" cy="20" rx="14" ry="3.4" fill="#16121f" />
          <path d="M6 20 V5 Q15 1 24 5 V20 Z" fill="#221b30" />
          <rect x="6" y="14" width="18" height="3" fill="#b3202c" />
        </svg>
      </span>
    );
  }
  if (kind === "constellation-crown") {
    return (
      <span aria-hidden className="wvr-on-portrait" data-reveal={kind}>
        <svg viewBox="0 0 80 40" className="wvr-crown">
          <polyline
            points={CROWN_STARS.map(([x, y]) => `${x},${y}`).join(" ")}
            pathLength={100}
          />
          <line x1="6" y1="34" x2="74" y2="34" pathLength={100} />
          {CROWN_STARS.map(([x, y], k) => (
            <circle
              key={k}
              cx={x}
              cy={y}
              r="2.4"
              style={{ animationDelay: `${k * 0.12}s` }}
            />
          ))}
        </svg>
      </span>
    );
  }
  if (kind === "curtain-call") {
    return (
      <span aria-hidden className="wvr-on-portrait" data-reveal={kind}>
        <i className="wvr-spot" />
      </span>
    );
  }
  if (kind === "trophy") {
    return (
      <span aria-hidden className="wvr-on-portrait" data-reveal={kind}>
        <svg viewBox="0 0 40 40" className="wvr-trophy">
          <path d="M12 4 H28 V14 Q28 24 20 26 Q12 24 12 14 Z" fill="#f2c230" stroke="#8a6410" strokeWidth="1.4" />
          <path d="M12 7 H6 Q6 16 13 17 M28 7 H34 Q34 16 27 17" fill="none" stroke="#8a6410" strokeWidth="1.6" />
          <rect x="17" y="26" width="6" height="6" fill="#d8a420" stroke="#8a6410" strokeWidth="1" />
          <rect x="11" y="32" width="18" height="5" rx="1" fill="#6a4a1a" stroke="#3a2a0a" strokeWidth="1" />
          <path d="M16 8 Q15 16 18 21" stroke="#fff6c8" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
        <i className="wvr-gleam" />
      </span>
    );
  }
  return null;
}
