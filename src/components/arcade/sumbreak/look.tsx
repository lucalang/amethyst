"use client";

import type { CSSProperties, ReactElement } from "react";
import type { GameLook } from "@/lib/game-cosmetics";

/**
 * Sumbreak's cosmetics. Most of each look is CSS keyed on the `data-look-<category>` attributes that PuzzleFrame
 * spreads around the board (see cosmetics.css); this file holds the markup some looks need: merge bursts, board
 * scenery and the art-style overlay. Visual only: numbers, tile colours (one per doubling), rules and scoring never
 * change.
 */

export const SUMBREAK_LOOKS = {
  tile: [
    "toy-blocks",
    "porcelain",
    "gummy",
    "cloisonne",
    "stained-glass",
    "neon-sign",
    "gemstone",
  ],
  board: [
    "zen-garden",
    "scholars-desk",
    "koi-pond",
    "circuit-board",
    "aurora-floe",
    "volcanic-forge",
    "observatory",
  ],
  number: [
    "typewriter",
    "letterpress",
    "bubble-letters",
    "brush-ink",
    "digital-clock",
    "marquee",
    "luminous",
  ],
  merge: [
    "soap-bubbles",
    "petal-whirl",
    "pixel-shatter",
    "ink-splash",
    "lightning",
    "firework-peony",
    "supernova",
  ],
  style: ["woodcut", "watercolour", "bauhaus", "crt-arcade"],
} as const;

type Looks = typeof SUMBREAK_LOOKS;
export type SumbreakLook = { [K in keyof Looks]: Looks[K][number] | undefined };

/** The equipped slugs this renderer knows; anything else falls back to the default. */
export function sumbreakLook(look: GameLook): SumbreakLook {
  const pick = <K extends keyof Looks>(key: K) =>
    (SUMBREAK_LOOKS[key] as readonly string[]).includes(look[key] ?? "")
      ? (look[key] as Looks[K][number])
      : undefined;
  return {
    tile: pick("tile"),
    board: pick("board"),
    number: pick("number"),
    merge: pick("merge"),
    style: pick("style"),
  };
}

const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
/** Particles per merge burst: enough to read as a burst, few enough to stay cheap on big boards. */
const PARTICLES = 10;

/**
 * What bursts out of a freshly merged tile: the default ring and sparks, or the equipped merge effect. `seed`
 * (the merge's id) turns each burst a little so back-to-back merges don't look identical.
 */
export function MergeFx({
  kind,
  seed,
}: {
  kind: SumbreakLook["merge"];
  seed: number;
}) {
  if (!kind) {
    return (
      <>
        <span className="sumbreak-ring" />
        {SPARK_ANGLES.map((angle) => (
          <span
            key={angle}
            className="sumbreak-spark"
            style={{ "--a": `${angle + (seed % 4) * 11}deg` } as CSSProperties}
          />
        ))}
      </>
    );
  }
  const turn = (seed % 5) * 13;
  return (
    <span className="sbm" data-merge={kind}>
      <i className="sbm-core" />
      <i className="sbm-wave" />
      {Array.from({ length: PARTICLES }, (_, k) => {
        const angle = (k * 360) / PARTICLES + turn;
        const radians = (angle * Math.PI) / 180;
        // A repeatable 0–1 spread per particle, so sizes and distances vary without randomness during render.
        const jitter = ((k * 7 + seed * 3) % 10) / 10;
        return (
          <i
            key={k}
            className="sbm-p"
            style={
              {
                "--a": `${angle}deg`,
                "--x": Math.sin(radians).toFixed(3),
                "--y": (-Math.cos(radians)).toFixed(3),
                "--k": jitter.toFixed(2),
                "--i": k,
              } as CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

/* ---------------------------------------------------------------------------------------------
 * Board scenery: drawn behind the grid, so it shows between tiles and through emptied cells.
 * ------------------------------------------------------------------------------------------- */

const STARS = Array.from({ length: 36 }, (_, k) => ({
  x: (k * 37 + 11) % 100,
  y: (k * 59 + 23) % 100,
  r: 0.25 + ((k * 13) % 5) * 0.12,
}));

function Observatory() {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className="sbd-svg"
    >
      <g className="sbd-sky">
        {STARS.map((star, k) => (
          <circle
            key={k}
            cx={star.x}
            cy={star.y}
            r={star.r}
            className={k % 4 ? undefined : "sbd-twinkle"}
            style={{ animationDelay: `${-(k % 7) * 0.6}s` }}
          />
        ))}
        <polyline
          points="14,22 22,18 31,24 36,15 44,19"
          className="sbd-constellation"
        />
        <polyline
          points="62,70 70,62 78,66 86,58 80,80"
          className="sbd-constellation"
        />
        <polyline
          points="20,76 28,84 34,74 42,82"
          className="sbd-constellation"
        />
      </g>
      <g className="sbd-astrolabe">
        <circle cx="50" cy="50" r="46" />
        <circle cx="50" cy="50" r="41" strokeDasharray="0.6 2.2" />
        <circle cx="50" cy="50" r="28" />
        <ellipse cx="50" cy="50" rx="46" ry="18" />
        <path d="M50 2 V98 M2 50 H98" />
        <path d="M17 17 L83 83 M83 17 L17 83" strokeDasharray="1 3" />
      </g>
    </svg>
  );
}

function KoiPond() {
  return (
    <>
      <span className="sbd-ripples" />
      <span className="sbd-koi-orbit">
        {[0, 1, 2].map((k) => (
          <svg key={k} viewBox="0 0 40 16" className="sbd-koi" data-koi={k}>
            <path d="M2 8 Q10 1 24 4 Q31 5 34 8 Q31 11 24 12 Q10 15 2 8 Z" />
            <path d="M33 8 L40 3 L38 8 L40 13 Z" />
            <circle cx="12" cy="6.5" r="2" className="sbd-koi-spot" />
            <circle cx="20" cy="9" r="2.6" className="sbd-koi-spot" />
          </svg>
        ))}
      </span>
    </>
  );
}

const TRACES = [
  "M0 18 H22 L30 26 H52",
  "M100 34 H78 L70 42 V62",
  "M14 100 V78 L22 70 H40",
  "M60 0 V14 L68 22 H100",
  "M0 60 H12 L20 52 V40",
  "M100 86 H84 L76 94 V100",
  "M44 100 V88 L52 80 H70",
];
const LEDS = [
  { x: 52, y: 26, c: "#7dff8a" },
  { x: 70, y: 62, c: "#ffcf4a" },
  { x: 40, y: 70, c: "#ff6b6b" },
  { x: 20, y: 40, c: "#5ad7ff" },
  { x: 70, y: 80, c: "#7dff8a" },
];

function CircuitBoard() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sbd-svg">
      {TRACES.map((d, k) => (
        <path key={k} d={d} className="sbd-trace" />
      ))}
      {TRACES.map((d, k) => (
        <path
          key={`pulse-${k}`}
          d={d}
          className="sbd-trace-pulse"
          pathLength={100}
          style={{ animationDelay: `${-k * 0.9}s` }}
        />
      ))}
      {LEDS.map((led, k) => (
        <circle
          key={k}
          cx={led.x}
          cy={led.y}
          r="1.6"
          fill={led.c}
          className="sbd-led"
          style={{ animationDelay: `${-k * 0.7}s`, color: led.c }}
        />
      ))}
    </svg>
  );
}

const CRACKS = [
  "M0 30 L18 34 L26 46 L44 50 L52 64 L70 66 L82 80 L100 84",
  "M60 0 L56 14 L64 26 L58 40",
  "M8 100 L14 84 L28 78 L34 64",
  "M100 22 L86 30 L84 44 L92 56",
];

function VolcanicForge() {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sbd-svg">
      {CRACKS.map((d, k) => (
        <g key={k}>
          <path
            d={d}
            className="sbd-lava-glow"
            style={{ animationDelay: `${-k * 1.3}s` }}
          />
          <path d={d} className="sbd-lava" />
        </g>
      ))}
    </svg>
  );
}

function AuroraFloe() {
  return (
    <>
      <span className="sbd-aurora" />
      <span className="sbd-aurora" data-band="2" />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sbd-svg">
        <path
          d="M0 40 L20 46 L34 38 L50 48 L72 42 L100 52"
          className="sbd-ice-crack"
        />
        <path d="M30 100 L36 76 L50 70 L56 52" className="sbd-ice-crack" />
        <path d="M80 0 L76 20 L88 30" className="sbd-ice-crack" />
      </svg>
    </>
  );
}

function ZenGarden() {
  return (
    <>
      <span
        className="sbd-stone"
        style={{ left: "12%", top: "16%", width: "14%" }}
      />
      <span
        className="sbd-stone"
        style={{ left: "70%", top: "64%", width: "18%" }}
      />
      <span
        className="sbd-stone"
        style={{ left: "78%", top: "10%", width: "9%" }}
      />
    </>
  );
}

function ScholarsDesk() {
  return (
    <>
      <span className="sbd-tooling" />
      <span className="sbd-blot" />
      <span className="sbd-seal" />
    </>
  );
}

const SCENES: Partial<
  Record<NonNullable<SumbreakLook["board"]>, () => ReactElement>
> = {
  observatory: Observatory,
  "koi-pond": KoiPond,
  "circuit-board": CircuitBoard,
  "volcanic-forge": VolcanicForge,
  "aurora-floe": AuroraFloe,
  "zen-garden": ZenGarden,
  "scholars-desk": ScholarsDesk,
};

/** Scenery behind the grid for the equipped board, and the art style's overlay in front of it. */
export function BoardLayers({ look }: { look: SumbreakLook }) {
  const Scene = look.board ? SCENES[look.board] : undefined;
  return (
    <>
      {Scene ? (
        <span aria-hidden className="sumbreak-deco">
          <Scene />
        </span>
      ) : null}
      {look.style ? <span aria-hidden className="sumbreak-art" /> : null}
    </>
  );
}
