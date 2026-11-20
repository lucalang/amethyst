/*
 * The scenery of The Ascent: original artwork for a climb from a cottage garden to a giant's castle in the clouds.
 * Each piece sits at a height (metres), on one side, at a width in container units, on the near layer or the slower
 * far layer. Animations are `aa-*` classes in ascent.css; all stop with reduced motion.
 *
 * Pieces are drawn with small helpers (petals, veined leaves, framed windows, textures) so every object has shading,
 * highlights and secondary detail rather than flat shapes.
 */

import type { ReactNode } from "react";

export type Scene = { m: number; side: "l" | "r" | "c"; width: number; layer: "near" | "far"; art: ReactNode; inset?: number };

// ---- Drawing kit ------------------------------------------------------------------------------------------------

/** A ring of petals around a centre: `n` petals of length `len`, rotated evenly, with a lighter inner stroke. */
function petals(n: number, len: number, width: number, fill: string, edge: string, offset = 0) {
  return Array.from({ length: n }, (_, k) => (
    <g key={k} transform={`rotate(${(360 / n) * k + offset})`}>
      <ellipse cy={-len / 2} rx={width} ry={len / 2} fill={fill} stroke={edge} strokeWidth="0.8" />
      <path d={`M0 ${-len * 0.15} V${-len * 0.8}`} stroke={edge} strokeOpacity="0.45" strokeWidth="0.7" />
    </g>
  ));
}

/** A leaf with a midrib and side veins, pointing up from its base at (0,0). */
function leaf(size: number, fill: string, vein: string, key?: string | number) {
  const s = size;
  return (
    <g key={key}>
      <path d={`M0 0 C${-s * 0.55} ${-s * 0.3} ${-s * 0.45} ${-s * 0.85} 0 ${-s} C${s * 0.45} ${-s * 0.85} ${s * 0.55} ${-s * 0.3} 0 0 Z`} fill={fill} stroke={vein} strokeWidth="0.9" />
      <path d={`M0 0 V${-s * 0.92}`} stroke={vein} strokeWidth="0.9" />
      {[0.3, 0.5, 0.7].map((t) => (
        <path key={t} d={`M0 ${-s * t} l${-s * 0.22} ${-s * 0.12} M0 ${-s * t} l${s * 0.22} ${-s * 0.12}`} stroke={vein} strokeOpacity="0.6" strokeWidth="0.6" />
      ))}
      <path d={`M${-s * 0.12} ${-s * 0.25} C${-s * 0.3} ${-s * 0.5} ${-s * 0.2} ${-s * 0.75} ${-s * 0.04} ${-s * 0.85}`} stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2" fill="none" />
    </g>
  );
}

/** A small framed cottage-style window, lit or dark, with mullions and a sill. */
function window4(x: number, y: number, w: number, h: number, lit = true, key?: string | number) {
  return (
    <g key={key} transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx="1.5" fill={lit ? "#ffd98a" : "#5a6a7a"} stroke="#6b4a2a" strokeWidth="1.6" />
      {lit ? <rect x="1.5" y="1.5" width={w - 3} height={h * 0.45} fill="#fff1c4" opacity="0.6" /> : null}
      <path d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`} stroke="#6b4a2a" strokeWidth="1.2" />
      <rect x="-2" y={h} width={w + 4} height="2.5" rx="1" fill="#8a6a4a" />
    </g>
  );
}

/** A fluffy cloud built from overlapping puffs, shaded underneath and rimmed with light on top. */
function cloud(x: number, y: number, s: number, key?: string | number, warm = false) {
  const top = warm ? "#fff8e8" : "#ffffff";
  const under = warm ? "#f2d6a8" : "#d6e6f6";
  const puffs: [number, number, number][] = [
    [-46, 8, 22],
    [-22, -8, 28],
    [8, -18, 32],
    [38, -6, 26],
    [60, 8, 18],
  ];
  return (
    <g key={key} transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="6" cy="22" rx="70" ry="12" fill={under} opacity="0.8" />
      {puffs.map(([px, py, r], k) => (
        <circle key={k} cx={px} cy={py} r={r} fill={top} />
      ))}
      <path d="M-64 18 Q6 34 76 18" fill="none" stroke={under} strokeWidth="6" strokeLinecap="round" />
      {puffs.slice(1, 4).map(([px, py, r], k) => (
        <path key={`rim${k}`} d={`M${px - r * 0.6} ${py - r * 0.55} A${r} ${r} 0 0 1 ${px + r * 0.5} ${py - r * 0.75}`} fill="none" stroke="#fff" strokeWidth="3" strokeOpacity="0.9" />
      ))}
    </g>
  );
}

/** Grass tuft of a few curved blades. */
function tuft(x: number, y: number, h: number, key?: string | number, color = "#4f9e3e") {
  return (
    <path
      key={key}
      d={`M${x} ${y} q-3 ${-h * 0.6} -6 ${-h} M${x} ${y} q1 ${-h * 0.7} 2 ${-h * 1.1} M${x} ${y} q4 ${-h * 0.5} 8 ${-h * 0.85}`}
      stroke={color}
      strokeWidth="1.6"
      fill="none"
      strokeLinecap="round"
    />
  );
}

// ---- The ground: where the bean was planted -----------------------------------------------------------------

export function Ground() {
  return (
    <svg viewBox="0 0 800 320" preserveAspectRatio="xMidYMax slice" className="aa-ground">
      <defs>
        <linearGradient id="aa-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#86d466" />
          <stop offset="100%" stopColor="#3f8f3a" />
        </linearGradient>
        <linearGradient id="aa-farhill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#bfe8a4" />
          <stop offset="100%" stopColor="#8ccf72" />
        </linearGradient>
        <linearGradient id="aa-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a5233" />
          <stop offset="100%" stopColor="#3e2716" />
        </linearGradient>
        <pattern id="aa-tiles" width="10" height="7" patternUnits="userSpaceOnUse">
          <rect width="10" height="7" fill="#b2513a" />
          <path d="M0 6.5 H10 M5 0 V3.5" stroke="#8a3a28" strokeWidth="1" />
          <path d="M0 3.5 H10" stroke="#c96a4e" strokeWidth="0.8" />
        </pattern>
        <pattern id="aa-stone" width="14" height="8" patternUnits="userSpaceOnUse">
          <rect width="14" height="8" fill="#efe1c6" />
          <path d="M0 7.5 H14 M7 0 V4 M0 4 H14 M3 4 V8" stroke="#d2bf9c" strokeWidth="0.8" />
        </pattern>
      </defs>
      {/* Distant hills with little trees and a winding lane. */}
      <path d="M0 170 Q120 110 240 150 T480 140 T800 130 V320 H0 Z" fill="url(#aa-farhill)" />
      {[
        [40, 150],
        [200, 140],
        [330, 150],
        [520, 136],
        [700, 128],
      ].map(([x, y], k) => (
        <g key={k} transform={`translate(${x} ${y})`}>
          <rect x="-1.5" y="-2" width="3" height="10" fill="#6b4a2a" />
          <circle cy="-8" r="9" fill="#5fae4a" />
          <circle cx="-3" cy="-11" r="4" fill="#86d466" />
        </g>
      ))}
      <path d="M0 200 Q160 150 320 190 T640 180 T800 190 V320 H0 Z" fill="url(#aa-hill)" />
      <path d="M150 196 Q240 214 330 230 T420 262" fill="none" stroke="#d9c79a" strokeWidth="14" strokeLinecap="round" opacity="0.8" />
      {Array.from({ length: 22 }, (_, k) => tuft(14 + k * 37, 200 + ((k * 13) % 30), 9 + (k % 4) * 2, `t${k}`))}

      {/* The cottage: tiled roof, stone walls, curtains, a flower box and a smoking brick chimney. */}
      <g transform="translate(90 112)">
        <rect x="10" y="38" width="84" height="40" fill="url(#aa-stone)" stroke="#8a6a4a" strokeWidth="2" />
        <path d="M0 42 L52 4 L104 42 Z" fill="url(#aa-tiles)" stroke="#7a2e1e" strokeWidth="2" strokeLinejoin="round" />
        <path d="M0 42 L52 4 L104 42" fill="none" stroke="#e08a6a" strokeWidth="1.5" strokeOpacity="0.6" />
        <rect x="70" y="2" width="12" height="24" fill="#a5452f" stroke="#6b2a1a" strokeWidth="1.5" />
        <path d="M70 8 H82 M70 14 H82 M70 20 H82 M76 2 V8 M73 8 V14 M79 14 V20" stroke="#6b2a1a" strokeWidth="0.7" />
        <rect x="68" y="0" width="16" height="4" fill="#7a2e1e" />
        <path d="M76 -2 q-10 -14 2 -26 q10 -10 -2 -22" className="aa-smoke" />
        {window4(22, 46, 18, 16, true)}
        <path d="M22 46 q4 10 0 16 M40 46 q-4 10 0 16" stroke="#e86a6a" strokeWidth="2" fill="none" />
        <rect x="20" y="64" width="22" height="6" rx="1" fill="#8a5a32" />
        {[24, 29, 34, 39].map((x, k) => (
          <circle key={x} cx={x} cy="63" r="2.4" fill={["#ff7eb6", "#ffd166", "#c084fc", "#ff9f43"][k]} />
        ))}
        <path d="M58 78 V54 Q66 46 74 54 V78 Z" fill="#6b4a2a" stroke="#4a2f1c" strokeWidth="1.5" />
        <path d="M66 50 V78" stroke="#4a2f1c" strokeWidth="1" />
        <circle cx="70" cy="66" r="1.5" fill="#ffd166" />
        <path d="M56 78 H76" stroke="#8a6a4a" strokeWidth="2" />
        {/* Climbing roses on the wall. */}
        <path d="M12 78 q6 -14 2 -26 q-4 -8 4 -12" stroke="#4f9e3e" strokeWidth="1.5" fill="none" />
        {[
          [14, 70],
          [11, 58],
          [17, 46],
        ].map(([x, y], k) => (
          <circle key={k} cx={x} cy={y} r="3" fill="#e8463c" stroke="#9e2a22" strokeWidth="0.8" />
        ))}
      </g>

      {/* A stone well with a little roof and bucket. */}
      <g transform="translate(250 196)">
        <ellipse cx="0" cy="22" rx="20" ry="6" fill="#5a4a3a" />
        <path d="M-20 22 V8 H20 V22" fill="url(#aa-stone)" stroke="#8a7a6a" strokeWidth="1.5" />
        <path d="M-16 8 V-18 M16 8 V-18" stroke="#6b4a2a" strokeWidth="3" />
        <path d="M-24 -16 L0 -30 L24 -16 Z" fill="url(#aa-tiles)" stroke="#7a2e1e" strokeWidth="1.5" />
        <path d="M-16 -10 H16" stroke="#6b4a2a" strokeWidth="2" />
        <path d="M2 -10 V-2" stroke="#5a4a3a" strokeWidth="1" />
        <path d="M-3 -2 H7 L6 4 H-2 Z" fill="#8a6236" />
      </g>

      {/* Picket fence with a gate, posts and rails. */}
      {Array.from({ length: 16 }, (_, k) => (
        <g key={k}>
          <path d={`M${470 + k * 18} 238 V210 L${476 + k * 18} 203 L${482 + k * 18} 210 V238 Z`} fill="#fbf4e4" stroke="#b9a988" strokeWidth="1" />
          <path d={`M${472 + k * 18} 212 V236`} stroke="#fff" strokeWidth="1" strokeOpacity="0.8" />
        </g>
      ))}
      <path d="M466 216 H762 M466 229 H762" stroke="#f2e8d0" strokeWidth="4" />
      <path d="M466 218 H762 M466 231 H762" stroke="#c9b898" strokeWidth="1" />

      {/* The cow: patches, horns, ears, udder, a swishing tail and a bell. */}
      <g transform="translate(608 232)" className="aa-graze">
        <path d="M-34 -2 q-12 6 -14 20" stroke="#3a3a3a" strokeWidth="2" fill="none" className="aa-tail" />
        <path d="M-48 18 q-2 4 3 5" stroke="#3a3a3a" strokeWidth="3" fill="none" />
        <ellipse cx="0" cy="0" rx="34" ry="18" fill="#fff" stroke="#3a3a3a" strokeWidth="2" />
        <path d="M-18 -10 q10 -8 18 2 q-8 12 -18 -2 Z M8 4 q12 -6 18 4 q-10 10 -18 -4 Z M-22 6 q6 -2 8 4 q-6 4 -8 -4 Z" fill="#2b2b2b" />
        <ellipse cx="-4" cy="16" rx="8" ry="4" fill="#f4b6b6" stroke="#c98a8a" strokeWidth="1" />
        <path d="M-24 16 v15 M-12 16 v15 M14 16 v15 M26 16 v15" stroke="#3a3a3a" strokeWidth="4" strokeLinecap="round" />
        <path d="M-27 31 h6 M-15 31 h6 M11 31 h6 M23 31 h6" stroke="#1a1a1a" strokeWidth="3" />
        <g transform="translate(40 -6)">
          <path d="M-8 -10 q-6 -8 -2 -12 M6 -10 q6 -8 2 -12" stroke="#e8dcc0" strokeWidth="3" strokeLinecap="round" fill="none" />
          <ellipse cx="-10" cy="-6" rx="6" ry="3" fill="#fff" stroke="#3a3a3a" strokeWidth="1.5" transform="rotate(-20 -10 -6)" />
          <ellipse cx="10" cy="-6" rx="6" ry="3" fill="#fff" stroke="#3a3a3a" strokeWidth="1.5" transform="rotate(20 10 -6)" />
          <ellipse cx="0" cy="0" rx="13" ry="12" fill="#fff" stroke="#3a3a3a" strokeWidth="2" />
          <ellipse cx="4" cy="6" rx="8" ry="6" fill="#f4b6b6" stroke="#c98a8a" strokeWidth="1" />
          <circle cx="2" cy="6" r="1.2" fill="#8a4a4a" />
          <circle cx="7" cy="6" r="1.2" fill="#8a4a4a" />
          <circle cx="-4" cy="-3" r="1.8" fill="#1a1a1a" />
          <circle cx="5" cy="-3" r="1.8" fill="#1a1a1a" />
          <path d="M-2 13 L0 20 L2 13" fill="#d8a23a" stroke="#8a5a1a" strokeWidth="1" />
        </g>
      </g>

      {/* Garden rows: cabbages, carrot tops, sunflowers; the planted spot in the middle. */}
      <path d="M0 250 Q400 236 800 250 V320 H0 Z" fill="url(#aa-soil)" />
      {Array.from({ length: 6 }, (_, k) => (
        <path key={`row${k}`} d={`M0 ${258 + k * 10} Q400 ${246 + k * 10} 800 ${258 + k * 10}`} stroke="#5a3a20" strokeWidth="1.5" fill="none" opacity="0.6" />
      ))}
      {Array.from({ length: 9 }, (_, k) => (
        <g key={`cab${k}`} transform={`translate(${60 + k * 34} 268)`}>
          <circle r="10" fill="#4f9e3e" />
          <circle cx="-3" cy="-1" r="7" fill="#6fc054" />
          <circle cx="1" cy="-3" r="4.5" fill="#a2e07e" />
          <path d="M-8 2 q4 -6 8 -2 M8 2 q-4 -6 -8 -2" stroke="#3f7a2e" strokeWidth="0.8" fill="none" />
        </g>
      ))}
      {Array.from({ length: 7 }, (_, k) => (
        <g key={`car${k}`} transform={`translate(${560 + k * 30} 276)`}>
          <path d="M0 0 q-6 -14 -2 -24 M0 0 q0 -14 2 -26 M0 0 q6 -12 6 -22" stroke="#4f9e3e" strokeWidth="2" fill="none" />
          <path d="M-3 0 h6 l-3 8 Z" fill="#ff9f43" />
        </g>
      ))}
      <ellipse cx="400" cy="262" rx="40" ry="8" fill="#3a2414" />
      <ellipse cx="400" cy="260" rx="30" ry="5" fill="#2a180c" />
    </svg>
  );
}

// ---- The Cottage Garden (0–800 m) ----------------------------------------------------------------------------

const AppleTree = (
  <svg viewBox="0 0 220 220">
    <defs>
      <radialGradient id="aa-apple" cx="35%" cy="30%">
        <stop offset="0%" stopColor="#ff8a7a" />
        <stop offset="60%" stopColor="#e8463c" />
        <stop offset="100%" stopColor="#9e2a22" />
      </radialGradient>
      <radialGradient id="aa-foliage" cx="40%" cy="30%">
        <stop offset="0%" stopColor="#86d466" />
        <stop offset="100%" stopColor="#3f8f3a" />
      </radialGradient>
    </defs>
    <path d="M100 220 Q104 170 96 140 Q110 150 122 132 M104 170 Q86 160 72 150" stroke="#6b4a2a" strokeWidth="10" strokeLinecap="round" fill="none" />
    <path d="M100 220 Q104 170 96 140" stroke="#8a6a44" strokeWidth="3" fill="none" />
    {[
      [110, 100, 78],
      [62, 84, 48],
      [156, 76, 46],
      [104, 52, 46],
    ].map(([x, y, r], k) => (
      <circle key={k} cx={x} cy={y} r={r} fill="url(#aa-foliage)" stroke="#2f7a2a" strokeWidth="1.5" />
    ))}
    {Array.from({ length: 22 }, (_, k) => {
      const a = (k / 22) * Math.PI * 2;
      const r = 50 + (k % 3) * 14;
      return <g key={`l${k}`} transform={`translate(${110 + Math.cos(a) * r} ${100 + Math.sin(a) * r * 0.85}) rotate(${(a * 180) / Math.PI + 90})`}>{leaf(12, "#5dbb52", "#2f7a2a")}</g>;
    })}
    {[
      [70, 110],
      [120, 60],
      [160, 120],
      [100, 140],
      [140, 96],
      [60, 60],
      [92, 92],
      [176, 82],
    ].map(([x, y], k) => (
      <g key={k} transform={`translate(${x} ${y})`}>
        <circle r="8.5" fill="url(#aa-apple)" />
        <path d="M0 -8 q1 -5 3 -6" stroke="#5a3a1a" strokeWidth="1.5" fill="none" />
        <path d="M2 -12 q6 -3 8 1 q-5 3 -8 -1 Z" fill="#5dbb52" />
        <ellipse cx="-3" cy="-3" rx="2.2" ry="1.4" fill="#fff" opacity="0.6" />
      </g>
    ))}
  </svg>
);

const Windmill = (
  <svg viewBox="0 0 200 260">
    <defs>
      <pattern id="aa-brick" width="12" height="6" patternUnits="userSpaceOnUse">
        <rect width="12" height="6" fill="#f2e6cf" />
        <path d="M0 5.5 H12 M6 0 V3 M0 3 H12 M2 3 V6" stroke="#d6c4a2" strokeWidth="0.7" />
      </pattern>
    </defs>
    <path d="M70 260 L82 110 H118 L130 260 Z" fill="url(#aa-brick)" stroke="#a88f6a" strokeWidth="2" />
    <path d="M118 110 L130 260 H122 L112 110 Z" fill="#000" opacity="0.08" />
    <path d="M90 260 V232 Q100 222 110 232 V260 Z" fill="#6b4a2a" />
    {window4(93, 150, 14, 16, false)}
    {window4(95, 196, 10, 12, true)}
    <path d="M74 110 L100 76 L126 110 Z" fill="#a5452f" stroke="#6b2a1a" strokeWidth="1.5" />
    <path d="M82 110 L100 86 L118 110" fill="none" stroke="#c96a4e" strokeWidth="1" />
    <g className="aa-sails" style={{ transformOrigin: "100px 104px" }}>
      {[0, 90, 180, 270].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 100 104)`}>
          <path d="M100 104 V20" stroke="#7a5a3a" strokeWidth="4" />
          <rect x="102" y="24" width="24" height="72" fill="#fff7e8" stroke="#a88f6a" strokeWidth="1.5" />
          {[36, 48, 60, 72, 84].map((y) => (
            <path key={y} d={`M102 ${y} H126`} stroke="#c9b08a" strokeWidth="1" />
          ))}
          <path d="M114 24 V96" stroke="#c9b08a" strokeWidth="1" />
        </g>
      ))}
      <circle cx="100" cy="104" r="8" fill="#7a5a3a" stroke="#4a3a2a" strokeWidth="1.5" />
      <circle cx="100" cy="104" r="3" fill="#c9922e" />
    </g>
  </svg>
);

const Weathervane = (
  <svg viewBox="0 0 140 220">
    <path d="M30 220 L70 150 L110 220 Z" fill="#a5452f" stroke="#6b2a1a" strokeWidth="1.5" />
    <path d="M70 150 L70 220" stroke="#6b2a1a" strokeWidth="1" />
    <path d="M70 152 V64" stroke="#5a5048" strokeWidth="4" />
    <circle cx="70" cy="64" r="4" fill="#c9922e" />
    <path d="M40 110 H100 M70 80 V140" stroke="#5a5048" strokeWidth="2" />
    {[
      ["N", 70, 76],
      ["E", 106, 114],
      ["W", 28, 114],
      ["S", 70, 150],
    ].map(([letter, x, y]) => (
      <text key={letter as string} x={x as number} y={y as number} fontSize="11" fontWeight="700" textAnchor="middle" fill="#c9922e" stroke="#5a3a1a" strokeWidth="0.5">
        {letter}
      </text>
    ))}
    <g className="aa-vane" style={{ transformOrigin: "70px 64px" }}>
      <path d="M36 64 L104 64 M92 54 L108 64 L92 74 Z" stroke="#c9922e" strokeWidth="3" fill="#c9922e" />
      {/* A rooster: comb, wattle, tail feathers. */}
      <path d="M48 52 q4 -16 18 -12 q12 -2 14 8 q-2 10 -14 12 q-10 8 -18 2 q-6 -4 0 -10 Z" fill="#d8a23a" stroke="#8a5a1a" strokeWidth="1.5" />
      <path d="M66 40 q2 -6 6 -4 q2 -5 6 -1 q3 -3 4 2" fill="#e8463c" stroke="#9e2a22" strokeWidth="1" />
      <path d="M80 48 l6 2 l-6 2 Z" fill="#ffd166" />
      <path d="M78 54 q2 5 -2 7" fill="#e8463c" />
      <circle cx="74" cy="46" r="1.4" fill="#2a1a0a" />
      <path d="M48 52 q-12 -14 -6 -22 M50 54 q-16 -6 -14 -16 M50 58 q-14 2 -16 -8" stroke="#8a5a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </g>
  </svg>
);

const Kite = (
  <svg viewBox="0 0 200 280" className="aa-flutter">
    <path d="M100 10 L150 80 L100 170 L50 80 Z" fill="#ff6b6b" stroke="#a83a3a" strokeWidth="2" />
    <path d="M100 10 L150 80 L100 80 Z" fill="#ffd166" />
    <path d="M50 80 L100 170 L100 80 Z" fill="#4ecdc4" />
    <path d="M100 10 V170 M50 80 H150" stroke="#7a2a2a" strokeWidth="2" />
    <path d="M100 10 L150 80 L100 170 L50 80 Z" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1" strokeDasharray="3 3" transform="translate(0 0) scale(0.92) translate(8.7 7)" />
    <circle cx="100" cy="80" r="5" fill="#fff" stroke="#7a2a2a" strokeWidth="1.5" />
    <path d="M100 170 q-20 20 0 34 q20 14 -4 30 q-18 12 0 26" fill="none" stroke="#5a4a3a" strokeWidth="1.5" />
    {[186, 212, 238, 262].map((y, k) => (
      <g key={y} transform={`translate(${96 + (k % 2) * 8} ${y}) rotate(${k % 2 ? 20 : -20})`}>
        <path d="M0 0 l-10 -6 l0 12 Z M0 0 l10 -6 l0 12 Z" fill={["#4ecdc4", "#ff6b6b", "#ffd166", "#c084fc"][k]} stroke="#5a4a3a" strokeWidth="0.6" />
        <circle r="1.8" fill="#5a4a3a" />
      </g>
    ))}
  </svg>
);

// ---- The Whispering Canopy (800–2,200 m) ---------------------------------------------------------------------

const Nest = (
  <svg viewBox="0 0 260 180">
    <path d="M0 132 Q120 70 260 120" stroke="#6b4a2a" strokeWidth="14" fill="none" strokeLinecap="round" />
    <path d="M0 128 Q120 66 260 116" stroke="#8a6a44" strokeWidth="3" fill="none" />
    <g transform="translate(36 112) rotate(-60)">{leaf(30, "#5fae4a", "#2f7a2a")}</g>
    <g transform="translate(220 112) rotate(50)">{leaf(26, "#6fc054", "#2f7a2a")}</g>
    <g transform="translate(200 104) rotate(20)">{leaf(22, "#86d466", "#2f7a2a")}</g>
    <ellipse cx="140" cy="102" rx="56" ry="24" fill="#8a6236" />
    {Array.from({ length: 26 }, (_, k) => {
      const x = 88 + (k % 13) * 8.5;
      const y = 92 + Math.floor(k / 13) * 12;
      return <path key={k} d={`M${x} ${y} q8 ${k % 2 ? 8 : -6} 18 ${k % 3 ? 2 : -4}`} stroke={k % 2 ? "#5a3a1a" : "#a87a46"} strokeWidth="2" fill="none" strokeLinecap="round" />;
    })}
    <ellipse cx="140" cy="88" rx="40" ry="10" fill="#5a3a1a" />
    {[
      [122, 82, 0],
      [142, 79, 1],
      [160, 84, 2],
    ].map(([x, y, k]) => (
      <g key={k} transform={`translate(${x} ${y})`} className={k === 2 ? "aa-wobble" : undefined}>
        <ellipse rx="10" ry="13" fill={k === 1 ? "#d6eef8" : "#bfe3f2"} stroke="#8ab8cc" strokeWidth="1" />
        {[
          [-3, -4],
          [3, 2],
          [-2, 5],
          [4, -6],
        ].map(([sx, sy], s) => (
          <circle key={s} cx={sx} cy={sy} r="1.3" fill="#6a8a9a" />
        ))}
        <ellipse cx="-3" cy="-6" rx="3" ry="2" fill="#fff" opacity="0.7" />
      </g>
    ))}
  </svg>
);

/** A butterfly with patterned forewings and hindwings, body and antennae. */
const butterfly = (x: number, y: number, color: string, spot: string, k: number) => (
  <g key={k} transform={`translate(${x} ${y})`}>
    <g className="aa-butterfly" style={{ animationDelay: `${-k * 0.7}s` }}>
      <g>
        <path d="M0 0 C-10 -22 -30 -18 -26 -4 C-24 4 -10 4 0 0 Z" fill={color} stroke="#2a2a2a" strokeWidth="1.2" />
        <path d="M0 2 C-14 6 -22 20 -10 22 C-4 22 -1 12 0 2 Z" fill={color} stroke="#2a2a2a" strokeWidth="1.2" />
        <circle cx="-16" cy="-8" r="4" fill={spot} stroke="#2a2a2a" strokeWidth="0.8" />
        <circle cx="-10" cy="14" r="2.6" fill={spot} />
        <path d="M-6 -2 L-22 -12 M-4 4 L-14 16" stroke="#2a2a2a" strokeOpacity="0.4" strokeWidth="0.7" />
      </g>
      <g className="aa-wing">
        <path d="M0 0 C10 -22 30 -18 26 -4 C24 4 10 4 0 0 Z" fill={color} stroke="#2a2a2a" strokeWidth="1.2" />
        <path d="M0 2 C14 6 22 20 10 22 C4 22 1 12 0 2 Z" fill={color} stroke="#2a2a2a" strokeWidth="1.2" />
        <circle cx="16" cy="-8" r="4" fill={spot} stroke="#2a2a2a" strokeWidth="0.8" />
        <circle cx="10" cy="14" r="2.6" fill={spot} />
      </g>
      <ellipse cx="0" cy="4" rx="2.2" ry="9" fill="#2a2a2a" />
      <path d="M-1 -4 q-4 -8 -8 -10 M1 -4 q4 -8 8 -10" stroke="#2a2a2a" strokeWidth="1" fill="none" />
      <circle cx="-9" cy="-14" r="1.2" fill="#2a2a2a" />
      <circle cx="9" cy="-14" r="1.2" fill="#2a2a2a" />
    </g>
  </g>
);
const Butterflies = (
  <svg viewBox="0 0 260 220">
    {butterfly(50, 60, "#ffb3c7", "#fff3a0", 0)}
    {butterfly(150, 44, "#ffd166", "#ff7b54", 1)}
    {butterfly(208, 130, "#9b8cff", "#ffffff", 2)}
    {butterfly(96, 160, "#7ee0c3", "#2a6a8a", 3)}
  </svg>
);

const Owl = (
  <svg viewBox="0 0 230 210">
    <path d="M0 168 H230" stroke="#6b4a2a" strokeWidth="16" strokeLinecap="round" />
    <path d="M0 164 H230" stroke="#8a6a44" strokeWidth="3" />
    <g transform="translate(200 166) rotate(70)">{leaf(24, "#5fae4a", "#2f7a2a")}</g>
    <g transform="translate(24 166) rotate(-80)">{leaf(22, "#6fc054", "#2f7a2a")}</g>
    <ellipse cx="114" cy="116" rx="42" ry="52" fill="#a07850" stroke="#5a3a1a" strokeWidth="2" />
    <ellipse cx="114" cy="128" rx="28" ry="34" fill="#ecd8b0" />
    {Array.from({ length: 12 }, (_, k) => (
      <path key={k} d={`M${98 + (k % 4) * 10} ${112 + Math.floor(k / 4) * 12} q5 5 10 0`} stroke="#b08a5a" strokeWidth="1.5" fill="none" />
    ))}
    <path d="M76 116 q-10 22 4 46 M152 116 q10 22 -4 46" stroke="#7a5432" strokeWidth="6" fill="none" strokeLinecap="round" />
    <path d="M78 74 L84 54 L98 72 Z M150 74 L144 54 L130 72 Z" fill="#a07850" stroke="#5a3a1a" strokeWidth="1.5" />
    <g className="aa-blink" style={{ transformOrigin: "114px 100px" }}>
      <circle cx="97" cy="100" r="15" fill="#fff6d6" stroke="#7a5432" strokeWidth="2" />
      <circle cx="131" cy="100" r="15" fill="#fff6d6" stroke="#7a5432" strokeWidth="2" />
      <circle cx="97" cy="100" r="9" fill="#ffb02e" />
      <circle cx="131" cy="100" r="9" fill="#ffb02e" />
      <circle cx="97" cy="100" r="5" fill="#1a0e04" />
      <circle cx="131" cy="100" r="5" fill="#1a0e04" />
      <circle cx="95" cy="97" r="1.8" fill="#fff" />
      <circle cx="129" cy="97" r="1.8" fill="#fff" />
    </g>
    <path d="M109 110 L114 122 L119 110 Z" fill="#e8a33a" stroke="#8a5a1a" strokeWidth="1" />
    <path d="M98 166 l-4 6 M104 166 v7 M110 166 l4 6 M120 166 l-4 6 M126 166 v7 M132 166 l4 6" stroke="#e8a33a" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const Treehouse = (
  <svg viewBox="0 0 260 240">
    <defs>
      <pattern id="aa-planks" width="100" height="10" patternUnits="userSpaceOnUse">
        <rect width="100" height="10" fill="#c98b4e" />
        <path d="M0 9.5 H100 M30 0 V10 M72 0 V10" stroke="#9a6a32" strokeWidth="1" />
        <path d="M8 4 q4 2 8 0" stroke="#a87a42" strokeWidth="0.7" fill="none" />
      </pattern>
      <pattern id="aa-shingle" width="10" height="8" patternUnits="userSpaceOnUse">
        <rect width="10" height="8" fill="#7aa83a" />
        <path d="M0 7.5 Q5 4 10 7.5" stroke="#4a7022" strokeWidth="1" fill="none" />
      </pattern>
    </defs>
    <path d="M0 158 Q130 146 260 168" stroke="#6b4a2a" strokeWidth="16" fill="none" strokeLinecap="round" />
    <path d="M70 150 L54 186 M180 150 L198 188" stroke="#6b4a2a" strokeWidth="6" />
    <rect x="66" y="150" width="128" height="8" fill="#8a5a2a" />
    <rect x="76" y="86" width="108" height="66" fill="url(#aa-planks)" stroke="#7a4a22" strokeWidth="2" />
    <path d="M64 90 L130 40 L196 90 Z" fill="url(#aa-shingle)" stroke="#4a7022" strokeWidth="2" strokeLinejoin="round" />
    {window4(90, 104, 22, 20, true)}
    <path d="M142 152 V112 Q152 102 162 112 V152 Z" fill="#6b4a2a" stroke="#4a2f1c" strokeWidth="1.5" />
    <path d="M130 40 V18 L152 24 L130 30" fill="#ff6b6b" stroke="#7a4a22" strokeWidth="1.5" />
    {/* A rope ladder and a little lantern. */}
    <path d="M172 158 Q170 200 174 236 M186 158 Q188 200 184 236" stroke="#c9a46a" strokeWidth="2" fill="none" />
    {[172, 186, 200, 214, 228].map((y) => (
      <path key={y} d={`M${171 + (y - 172) * 0.04} ${y} H${186 - (y - 172) * 0.04}`} stroke="#8a5a2a" strokeWidth="3" />
    ))}
    <path d="M70 120 V132" stroke="#5a4a3a" strokeWidth="1" />
    <rect x="65" y="132" width="10" height="13" rx="2" fill="#ffd27a" stroke="#5a4a3a" strokeWidth="1.5" className="aa-glow" />
  </svg>
);

// ---- The Cloud Meadows (2,200–4,000 m) ----------------------------------------------------------------------

/** A sheep made of cloud: woolly curls, a dark face with ears, little legs. */
const sheep = (x: number, y: number, k: number) => (
  <g key={k} transform={`translate(${x} ${y})`}>
    <g className="aa-graze" style={{ animationDelay: `${-k * 1.3}s` }}>
      <path d="M-14 10 v12 M-4 12 v12 M8 12 v12 M18 10 v12" stroke="#3a3a44" strokeWidth="3.5" strokeLinecap="round" />
      {[
        [-20, 0, 12],
        [-8, -8, 13],
        [6, -8, 13],
        [18, 0, 12],
        [-12, 6, 11],
        [4, 6, 12],
        [14, 6, 10],
      ].map(([cx, cy, r], c) => (
        <circle key={c} cx={cx} cy={cy} r={r} fill="#fff" stroke="#dbe6f2" strokeWidth="1.5" />
      ))}
      {[
        [-10, -6],
        [4, -10],
        [12, 2],
        [-4, 4],
      ].map(([cx, cy], c) => (
        <path key={`c${c}`} d={`M${cx - 3} ${cy} a3 3 0 1 1 3 3`} stroke="#d0dceb" strokeWidth="1.2" fill="none" />
      ))}
      <ellipse cx="30" cy="-4" rx="9" ry="10" fill="#3a3a44" />
      <ellipse cx="22" cy="-10" rx="5" ry="2.6" fill="#3a3a44" transform="rotate(-25 22 -10)" />
      <circle cx="28" cy="-12" r="5" fill="#fff" />
      <circle cx="33" cy="-6" r="1.6" fill="#fff" />
      <circle cx="33.4" cy="-6" r="0.8" fill="#1a1a1a" />
      <ellipse cx="35" cy="2" rx="3" ry="1.6" fill="#55556a" />
    </g>
  </g>
);
const CloudSheep = (
  <svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet">
    {cloud(160, 130, 1.5)}
    {cloud(620, 120, 1.3)}
    {sheep(120, 88, 0)}
    {sheep(196, 96, 1)}
    {sheep(588, 80, 2)}
    {sheep(664, 88, 3)}
    {[
      [140, 110],
      [610, 104],
    ].map(([x, y], k) => (
      <g key={k} transform={`translate(${x} ${y})`}>
        <path d="M0 0 V-10" stroke="#5fae4a" strokeWidth="1.5" />
        <g transform="translate(0 -12)">{petals(6, 6, 2.2, "#fff", "#e0c0d0")}</g>
        <circle cy="-12" r="2" fill="#ffd166" />
      </g>
    ))}
  </svg>
);

const Balloon = (
  <svg viewBox="0 0 200 290" className="aa-float">
    <defs>
      <linearGradient id="aa-envelope" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#000" stopOpacity="0.18" />
        <stop offset="40%" stopColor="#fff" stopOpacity="0.12" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
      </linearGradient>
    </defs>
    <path d="M100 10 C150 10 180 50 176 96 C172 140 126 170 112 196 H88 C74 170 28 140 24 96 C20 50 50 10 100 10 Z" fill="#ff7b54" />
    <path d="M100 10 C128 10 140 60 134 110 C130 150 114 180 108 196 H92 C86 180 70 150 66 110 C60 60 72 10 100 10 Z" fill="#ffd166" />
    <path d="M100 10 C110 10 114 70 112 120 C110 160 104 190 102 196 H98 C96 190 90 160 88 120 C86 70 90 10 100 10 Z" fill="#4ecdc4" />
    <path d="M24 96 C60 104 140 104 176 96 M34 132 C70 140 130 140 166 132" stroke="#c9502e" strokeWidth="2" fill="none" />
    <path d="M100 10 C150 10 180 50 176 96 C172 140 126 170 112 196 H88 C74 170 28 140 24 96 C20 50 50 10 100 10 Z" fill="url(#aa-envelope)" stroke="#a83a20" strokeWidth="1.5" />
    <ellipse cx="66" cy="54" rx="10" ry="22" fill="#fff" opacity="0.35" transform="rotate(20 66 54)" />
    <path d="M88 196 L80 228 M112 196 L120 228 M96 196 L94 228 M104 196 L106 228" stroke="#6b4a2a" strokeWidth="1.5" />
    <path d="M90 214 q10 -8 20 0" stroke="#ff9f43" strokeWidth="3" fill="none" className="aa-glow" />
    <rect x="76" y="228" width="48" height="32" rx="4" fill="#a86a32" stroke="#6b4a2a" strokeWidth="2" />
    {[236, 244, 252].map((y) => (
      <path key={y} d={`M76 ${y} H124`} stroke="#7a4a22" strokeWidth="1.2" />
    ))}
    {[84, 92, 100, 108, 116].map((x) => (
      <path key={x} d={`M${x} 228 V260`} stroke="#8a5a2a" strokeWidth="1" />
    ))}
    <path d="M124 236 q8 4 6 14" stroke="#6b4a2a" strokeWidth="1" fill="none" />
    <ellipse cx="130" cy="252" rx="5" ry="6" fill="#c9a46a" stroke="#6b4a2a" strokeWidth="1" />
    <circle cx="92" cy="222" r="6" fill="#ffd7b0" />
    <path d="M86 220 q6 -8 12 0" fill="#e8463c" />
    <path d="M98 224 l8 -8" stroke="#ffd7b0" strokeWidth="3" strokeLinecap="round" className="aa-wave" />
  </svg>
);

const Rainbow = (
  <svg viewBox="0 0 800 260" preserveAspectRatio="xMidYMid meet">
    {["#ff6b6b", "#ff9f43", "#ffd166", "#6ad18b", "#4ecdc4", "#6c8cff", "#a97cff"].map((color, k) => (
      <path key={color} d={`M${40 + k * 16} 260 A${360 - k * 16} ${230 - k * 14} 0 0 1 ${760 - k * 16} 260`} fill="none" stroke={color} strokeWidth="16" opacity="0.6" />
    ))}
    <path d="M40 260 A360 230 0 0 1 760 260" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" />
    {cloud(70, 250, 0.9)}
    {cloud(730, 250, 0.9)}
    {[
      [400, 50],
      [260, 90],
      [560, 86],
    ].map(([x, y], k) => (
      <path key={k} d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`} fill="#fff" className="aa-twinkle" style={{ animationDelay: `${-k}s` }} />
    ))}
  </svg>
);

const Island = (
  <svg viewBox="0 0 260 300" className="aa-float">
    <defs>
      <linearGradient id="aa-rock" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#9a7046" />
        <stop offset="100%" stopColor="#5a3a1e" />
      </linearGradient>
    </defs>
    <path d="M30 140 H230 Q206 210 160 240 Q140 270 128 290 Q110 250 80 232 Q48 200 30 140 Z" fill="url(#aa-rock)" stroke="#4a2f16" strokeWidth="2" />
    {[
      "M40 160 Q130 172 222 158",
      "M56 190 Q130 200 206 186",
      "M84 220 Q130 228 176 216",
    ].map((d) => (
      <path key={d} d={d} stroke="#4a2f16" strokeOpacity="0.5" strokeWidth="2" fill="none" />
    ))}
    <path d="M70 232 q-8 20 2 34 M180 214 q12 18 2 34" stroke="#6b4a2a" strokeWidth="2.5" fill="none" />
    <path d="M30 140 Q130 118 230 140 Q130 160 30 140 Z" fill="#6ad18b" stroke="#3f8a4a" strokeWidth="1.5" />
    {/* A little waterfall spilling off the edge. */}
    <path d="M200 146 Q206 190 202 260" stroke="#9fe6ff" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.85" />
    <path d="M200 150 Q205 190 201 258" stroke="#fff" strokeWidth="2" fill="none" strokeDasharray="4 6" className="aa-pour" />
    <path d="M130 142 V80" stroke="#6b4a2a" strokeWidth="9" strokeLinecap="round" />
    <circle cx="130" cy="62" r="36" fill="#4fa64a" stroke="#2f7a2a" strokeWidth="1.5" />
    <circle cx="108" cy="80" r="22" fill="#5dbb52" />
    <circle cx="152" cy="74" r="20" fill="#6fc054" />
    <circle cx="120" cy="52" r="10" fill="#86d466" />
    {[
      [60, 136, "#ff7eb6"],
      [84, 132, "#ffd166"],
      [170, 132, "#c084fc"],
      [190, 136, "#ff9f43"],
    ].map(([x, y, color], k) => (
      <g key={k} transform={`translate(${x} ${y})`}>
        <path d="M0 0 V-8" stroke="#3f8a4a" strokeWidth="1.2" />
        <g transform="translate(0 -9)">{petals(5, 5, 2, color as string, "#00000033")}</g>
        <circle cy="-9" r="1.4" fill="#fff4b0" />
      </g>
    ))}
  </svg>
);

const Geese = (
  <svg viewBox="0 0 300 160" className="aa-glide">
    {[
      [150, 40],
      [126, 56],
      [102, 72],
      [78, 88],
      [174, 56],
      [198, 72],
      [222, 88],
    ].map(([x, y], k) => (
      <g key={k} transform={`translate(${x} ${y})`}>
        <ellipse rx="8" ry="3.5" fill="#e8ecf2" stroke="#5a6a7a" strokeWidth="0.8" />
        <path d="M7 -1 q6 -4 9 -2" stroke="#3a4a5a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        <path d="M15 -3 l4 1" stroke="#ff9f43" strokeWidth="1.6" />
        <path d="M-2 -2 q-6 -10 -12 -6 M-2 -2 q6 -10 12 -8" stroke="#5a6a7a" strokeWidth="2.2" fill="none" className="aa-flap" style={{ animationDelay: `${-k * 0.15}s` }} />
      </g>
    ))}
  </svg>
);

// ---- The High Winds (4,000–5,600 m) --------------------------------------------------------------------------

const Airship = (
  <svg viewBox="0 0 340 210" className="aa-float">
    <defs>
      <linearGradient id="aa-hull" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#f6ead4" />
        <stop offset="60%" stopColor="#e2cfac" />
        <stop offset="100%" stopColor="#bfa880" />
      </linearGradient>
    </defs>
    <path d="M300 70 L334 40 L330 72 L334 102 Z" fill="#a5452f" stroke="#6b2a1a" strokeWidth="1.5" />
    <path d="M296 70 L320 60 L320 80 Z" fill="#c96a4e" />
    <ellipse cx="160" cy="70" rx="146" ry="52" fill="url(#aa-hull)" stroke="#8a6a4a" strokeWidth="2" />
    {[50, 90, 130, 170, 210, 250].map((x) => (
      <path key={x} d={`M${x} ${70 - Math.sqrt(Math.max(0, 1 - ((x - 160) / 146) ** 2)) * 52} Q${x + 6} 70 ${x} ${70 + Math.sqrt(Math.max(0, 1 - ((x - 160) / 146) ** 2)) * 52}`} stroke="#c9b08a" strokeWidth="1.5" fill="none" />
    ))}
    <path d="M14 70 H306" stroke="#c9b08a" strokeWidth="1.5" />
    {Array.from({ length: 14 }, (_, k) => (
      <circle key={k} cx={40 + k * 18} cy="72" r="1.4" fill="#8a6a4a" />
    ))}
    <ellipse cx="110" cy="40" rx="60" ry="10" fill="#fff" opacity="0.4" />
    <path d="M60 70 Q160 54 260 70" stroke="#a5452f" strokeWidth="5" fill="none" />
    <text x="160" y="94" fontSize="14" fontWeight="800" textAnchor="middle" fill="#a5452f" fontStyle="italic">
      Beanstalk Express
    </text>
    <path d="M116 118 L128 144 M204 118 L192 144 M140 120 V144 M180 120 V144" stroke="#6b4a2a" strokeWidth="2" />
    <rect x="116" y="142" width="88" height="30" rx="8" fill="#6b4a2a" stroke="#3a2614" strokeWidth="2" />
    {[124, 144, 164, 184].map((x) => (
      <g key={x}>
        <rect x={x} y="149" width="13" height="11" rx="2" fill="#ffd27a" />
        <path d={`M${x + 6.5} 149 V160`} stroke="#6b4a2a" strokeWidth="1" />
      </g>
    ))}
    <path d="M116 166 H204" stroke="#c9922e" strokeWidth="2" />
    <g className="aa-prop" style={{ transformOrigin: "106px 157px" }}>
      <path d="M106 140 V174" stroke="#4a3a2a" strokeWidth="4" strokeLinecap="round" />
    </g>
    <circle cx="106" cy="157" r="3" fill="#c9922e" />
  </svg>
);

const WindSpirits = (
  <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid meet">
    {[
      "M40 120 C140 40 240 200 340 110 S540 60 620 120 q30 22 10 40 q-20 14 -30 -8",
      "M120 170 C220 110 330 210 440 160 S640 120 740 170",
      "M200 70 C280 20 380 100 470 60 q26 -12 34 10 q4 20 -18 22",
    ].map((d, k) => (
      <path key={k} d={d} className="aa-wind" style={{ animationDelay: `${-k * 1.6}s` }} />
    ))}
    {/* Leaves and petals carried on the wind. */}
    {[
      [180, 96, "#5fae4a"],
      [330, 140, "#ff7eb6"],
      [500, 80, "#86d466"],
      [640, 150, "#ffd166"],
    ].map(([x, y, color], k) => (
      <g key={k} transform={`translate(${x} ${y}) rotate(${k * 70})`} className="aa-tumble" style={{ animationDelay: `${-k * 1.2}s` }}>
        {leaf(14, color as string, "#2f7a2a")}
      </g>
    ))}
    {[
      [260, 120],
      [560, 110],
    ].map(([x, y], k) => (
      <g key={`face${k}`} transform={`translate(${x} ${y})`} opacity="0.7">
        <circle cx="-5" cy="0" r="2" fill="#fff" />
        <circle cx="5" cy="0" r="2" fill="#fff" />
        <path d="M-4 6 q4 4 8 0" stroke="#fff" strokeWidth="1.5" fill="none" />
      </g>
    ))}
  </svg>
);

const Moon = (
  <svg viewBox="0 0 220 220">
    <defs>
      <radialGradient id="aa-moon" cx="40%" cy="35%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="70%" stopColor="#e6ecfa" />
        <stop offset="100%" stopColor="#c6d0ea" />
      </radialGradient>
    </defs>
    <circle cx="110" cy="110" r="90" fill="#fff" opacity="0.15" />
    <circle cx="110" cy="110" r="70" fill="url(#aa-moon)" />
    {[
      [84, 90, 12],
      [134, 130, 18],
      [130, 80, 7],
      [96, 140, 9],
      [150, 104, 5],
    ].map(([x, y, r], k) => (
      <g key={k}>
        <circle cx={x} cy={y} r={r} fill="#d6dff2" />
        <path d={`M${x - r * 0.7} ${y - r * 0.4} A${r} ${r} 0 0 1 ${x + r * 0.6} ${y - r * 0.6}`} stroke="#b8c4e0" strokeWidth="1.5" fill="none" />
      </g>
    ))}
    <path d="M80 160 q30 16 62 -2" stroke="#d6dff2" strokeWidth="2" fill="none" />
    {[
      [24, 30],
      [196, 44],
      [30, 190],
      [190, 176],
      [110, 12],
    ].map(([x, y], k) => (
      <path key={k} d={`M${x} ${y - 7} L${x + 2} ${y - 2} L${x + 7} ${y} L${x + 2} ${y + 2} L${x} ${y + 7} L${x - 2} ${y + 2} L${x - 7} ${y} L${x - 2} ${y - 2} Z`} fill="#fff" className="aa-twinkle" style={{ animationDelay: `${-k * 0.8}s` }} />
    ))}
  </svg>
);

const Cranes = (
  <svg viewBox="0 0 300 150" className="aa-glide">
    {[
      [60, 64],
      [134, 42],
      [214, 74],
    ].map(([x, y], k) => (
      <g key={k} transform={`translate(${x} ${y})`}>
        <path d="M-26 2 Q0 -4 26 2" stroke="#f4f7ff" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M24 1 L34 -2" stroke="#2a2a3a" strokeWidth="2" />
        <circle cx="22" cy="0" r="2.4" fill="#e8463c" />
        <path d="M-26 2 L-36 6" stroke="#2a2a3a" strokeWidth="2" />
        <g className="aa-flap" style={{ animationDelay: `${-k * 0.4}s` }}>
          <path d="M-2 0 Q-14 -20 -30 -18 Q-14 -10 -2 0 Z M2 0 Q14 -24 32 -22 Q16 -10 2 0 Z" fill="#f4f7ff" stroke="#c8d2e8" strokeWidth="1" />
          <path d="M-24 -17 l-6 -1 M26 -21 l6 -1" stroke="#2a2a3a" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      </g>
    ))}
  </svg>
);

// ---- The Giant's Kingdom (5,600–7,000 m) ---------------------------------------------------------------------

const Goose = (
  <svg viewBox="0 0 260 220">
    <defs>
      <radialGradient id="aa-gold" cx="35%" cy="30%">
        <stop offset="0%" stopColor="#fff4c2" />
        <stop offset="55%" stopColor="#ffd84a" />
        <stop offset="100%" stopColor="#c98a1e" />
      </radialGradient>
    </defs>
    {cloud(130, 170, 1.4, undefined, true)}
    {/* A straw nest holding golden eggs. */}
    <ellipse cx="96" cy="142" rx="42" ry="12" fill="#d8b46a" />
    {Array.from({ length: 12 }, (_, k) => (
      <path key={k} d={`M${58 + k * 7} ${138 + (k % 2) * 6} l12 ${k % 2 ? -4 : 4}`} stroke="#a8843a" strokeWidth="1.5" />
    ))}
    {[
      [78, 132],
      [100, 128],
    ].map(([x, y], k) => (
      <g key={k} transform={`translate(${x} ${y})`} className="aa-shine">
        <ellipse rx="10" ry="13" fill="url(#aa-gold)" stroke="#a8761e" strokeWidth="1.2" />
        <ellipse cx="-3" cy="-5" rx="3" ry="2" fill="#fff" opacity="0.8" />
      </g>
    ))}
    <g className="aa-wobble" style={{ transformOrigin: "140px 120px" }}>
      <ellipse cx="146" cy="102" rx="46" ry="30" fill="url(#aa-gold)" stroke="#b8861e" strokeWidth="2" />
      {Array.from({ length: 4 }, (_, k) => (
        <path key={k} d={`M${118 + k * 12} ${94 + k * 3} q10 8 20 0`} stroke="#d8a23a" strokeWidth="1.5" fill="none" />
      ))}
      <path d="M118 96 q-18 -10 -26 4 q12 2 26 -4 Z" fill="#ffe680" stroke="#b8861e" strokeWidth="1.5" />
      <path d="M178 92 Q200 52 190 34 Q182 20 170 32" fill="none" stroke="#ffd84a" strokeWidth="15" strokeLinecap="round" />
      <path d="M178 92 Q200 52 190 34" fill="none" stroke="#b8861e" strokeWidth="1.5" />
      <circle cx="181" cy="32" r="3.2" fill="#3a2a0a" />
      <circle cx="182" cy="31" r="1" fill="#fff" />
      <path d="M189 33 L207 36 L189 42 Z" fill="#ff9f43" stroke="#b86a1e" strokeWidth="1" />
      <path d="M134 130 l-4 10 M150 130 l4 10" stroke="#ff9f43" strokeWidth="3" strokeLinecap="round" />
    </g>
  </svg>
);

const Harp = (
  <svg viewBox="0 0 210 270">
    <defs>
      <linearGradient id="aa-harpgold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#fff4c2" />
        <stop offset="50%" stopColor="#ffd84a" />
        <stop offset="100%" stopColor="#b8861e" />
      </linearGradient>
    </defs>
    <path d="M40 246 L60 30 Q140 20 170 80 Q150 150 70 246 Z" fill="none" stroke="url(#aa-harpgold)" strokeWidth="12" strokeLinejoin="round" />
    <path d="M40 246 L60 30 Q140 20 170 80" fill="none" stroke="#fff4c2" strokeWidth="2" strokeOpacity="0.7" />
    {Array.from({ length: 10 }, (_, k) => (
      <path key={k} d={`M${66 + k * 10} ${40 + k * 4} L${54 + k * 2.4} ${232 - k * 11}`} stroke="#fff4c2" strokeWidth="1.5" className="aa-string" style={{ animationDelay: `${-k * 0.2}s` }} />
    ))}
    {Array.from({ length: 10 }, (_, k) => (
      <circle key={`peg${k}`} cx={66 + k * 10} cy={38 + k * 4} r="2.2" fill="#b8861e" />
    ))}
    {/* A carved scroll at the head and a woman's-face figurehead on the pillar. */}
    <path d="M60 30 q-12 -22 6 -28 q16 -4 14 12 q-2 8 -10 6" fill="none" stroke="url(#aa-harpgold)" strokeWidth="7" strokeLinecap="round" />
    <circle cx="48" cy="150" r="9" fill="#ffd84a" stroke="#b8861e" strokeWidth="1.5" />
    <path d="M44 148 h2 M50 148 h2 M45 153 q3 2 6 0" stroke="#8a5a1a" strokeWidth="1" />
    <path d="M30 246 H86" stroke="#b8861e" strokeWidth="6" strokeLinecap="round" />
    {[
      [180, 60],
      [192, 110],
      [172, 152],
      [196, 186],
    ].map(([x, y], k) => (
      <text key={k} x={x} y={y} fontSize="20" fill="#fff4c2" className="aa-note" style={{ animationDelay: `${-k * 0.9}s` }}>
        {k % 2 ? "♫" : "♪"}
      </text>
    ))}
  </svg>
);

const Castle = (
  <svg viewBox="0 0 600 360" overflow="visible">
    <defs>
      <pattern id="aa-castle" width="16" height="10" patternUnits="userSpaceOnUse">
        <rect width="16" height="10" fill="#cfc0ec" />
        <path d="M0 9.5 H16 M8 0 V5 M0 5 H16 M2 5 V10" stroke="#a898d0" strokeWidth="0.8" />
      </pattern>
      <linearGradient id="aa-tower" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.15" />
      </linearGradient>
    </defs>
    {cloud(110, 316, 2.1, "a", true)}
    {cloud(490, 316, 2.1, "b", true)}
    {/* The main keep with crenellations. */}
    <path d="M150 314 V150 H450 V314 Z" fill="url(#aa-castle)" stroke="#7a6aa8" strokeWidth="3" />
    {Array.from({ length: 15 }, (_, k) => (
      <rect key={k} x={150 + k * 20} y="138" width="12" height="14" fill="url(#aa-castle)" stroke="#7a6aa8" strokeWidth="2" />
    ))}
    {/* Towers with conical roofs, slit windows and pennants. */}
    {[
      [160, 60, 48],
      [392, 60, 48],
      [262, 20, 76],
    ].map(([x, top, w], k) => (
      <g key={k}>
        <rect x={x} y={top + 44} width={w} height={314 - top - 44} fill="url(#aa-castle)" stroke="#7a6aa8" strokeWidth="3" />
        <rect x={x} y={top + 44} width={w} height={314 - top - 44} fill="url(#aa-tower)" />
        <path d={`M${x - 6} ${top + 46} L${x + w / 2} ${top - 14} L${x + w + 6} ${top + 46} Z`} fill="#9a7ad8" stroke="#6a5aa8" strokeWidth="3" strokeLinejoin="round" />
        <path d={`M${x + w / 2} ${top - 14} L${x + w + 6} ${top + 46} H${x + w / 2} Z`} fill="#000" opacity="0.12" />
        <path d={`M${x + w / 2} ${top - 14} V${top - 40}`} stroke="#6a5aa8" strokeWidth="2.5" />
        <path d={`M${x + w / 2} ${top - 40} l22 6 l-22 6`} fill={["#ff6b6b", "#4ecdc4", "#ffd84a"][k]} className="aa-pennant" style={{ transformOrigin: `${x + w / 2}px ${top - 34}px` }} />
        {[0, 1].map((r) => (
          <rect key={r} x={x + w / 2 - 4} y={top + 66 + r * 40} width="8" height="20" rx="4" fill="#ffd84a" className="aa-glow" style={{ animationDelay: `${-(k + r) * 0.7}s` }} />
        ))}
      </g>
    ))}
    {/* Gate with portcullis and a cloud-stair leading up to it. */}
    <path d="M266 314 V236 Q300 200 334 236 V314 Z" fill="#4a3a78" stroke="#7a6aa8" strokeWidth="3" />
    {[276, 288, 300, 312, 324].map((x) => (
      <path key={x} d={`M${x} 226 V314`} stroke="#2a2050" strokeWidth="2" />
    ))}
    {[248, 268, 288].map((y) => (
      <path key={y} d={`M268 ${y} H332`} stroke="#2a2050" strokeWidth="2" />
    ))}
    {[
      [200, 200],
      [380, 200],
      [210, 250],
      [370, 250],
    ].map(([x, y], k) => (
      <g key={k}>{window4(x - 9, y, 18, 22, true)}</g>
    ))}
    <path d="M240 196 q60 -30 120 0" stroke="#ffd84a" strokeWidth="4" fill="none" />
    <text x="300" y="186" fontSize="18" textAnchor="middle" fill="#ffd84a">
      ✦
    </text>
    {cloud(300, 334, 2.6, "c", true)}
  </svg>
);

export const SCENERY: Scene[] = [
  // The Cottage Garden
  { m: 150, side: "l", width: 34, layer: "near", art: AppleTree, inset: 2 },
  { m: 320, side: "r", width: 26, layer: "far", art: Windmill, inset: 6 },
  { m: 480, side: "l", width: 18, layer: "near", art: Weathervane, inset: 6 },
  { m: 680, side: "r", width: 22, layer: "near", art: Kite, inset: 4 },
  // The Whispering Canopy
  { m: 1050, side: "l", width: 36, layer: "near", art: Nest, inset: 0 },
  { m: 1380, side: "r", width: 34, layer: "near", art: Butterflies, inset: 2 },
  { m: 1700, side: "l", width: 32, layer: "near", art: Owl, inset: 0 },
  { m: 2020, side: "r", width: 36, layer: "near", art: Treehouse, inset: 0 },
  // The Cloud Meadows
  { m: 2350, side: "c", width: 100, layer: "far", art: CloudSheep },
  { m: 2750, side: "r", width: 26, layer: "near", art: Balloon, inset: 4 },
  { m: 3150, side: "c", width: 100, layer: "far", art: Rainbow },
  { m: 3450, side: "l", width: 34, layer: "near", art: Geese, inset: 2 },
  { m: 3800, side: "l", width: 32, layer: "near", art: Island, inset: 3 },
  // The High Winds
  { m: 4250, side: "r", width: 42, layer: "near", art: Airship, inset: 0 },
  { m: 4650, side: "c", width: 100, layer: "far", art: WindSpirits },
  { m: 5000, side: "l", width: 34, layer: "near", art: Cranes, inset: 2 },
  { m: 5350, side: "r", width: 24, layer: "far", art: Moon, inset: 8 },
  // The Giant's Kingdom
  { m: 5850, side: "l", width: 32, layer: "near", art: Goose, inset: 2 },
  { m: 6250, side: "r", width: 26, layer: "near", art: Harp, inset: 5 },
  { m: 6880, side: "c", width: 74, layer: "near", art: Castle },
];

/** Little notes beside the climb, matching the scenery. */
export const SIGHTS: { m: number; text: string }[] = [
  { m: 60, text: "the cottage chimney puffs approvingly" },
  { m: 180, text: "the apples up here are the size of fists" },
  { m: 340, text: "the windmill turns for no wind at all" },
  { m: 500, text: "the weathervane rooster points straight up" },
  { m: 700, text: "a kite that got away years ago" },
  { m: 1080, text: "three eggs, and one of them wobbling" },
  { m: 1400, text: "butterflies the colour of sweets" },
  { m: 1720, text: "an owl who has seen many climbers" },
  { m: 2040, text: "a treehouse with nobody home" },
  { m: 2380, text: "the sheep up here are made of weather" },
  { m: 2780, text: "a balloonist waves hello" },
  { m: 3180, text: "you are standing on a rainbow, almost" },
  { m: 3480, text: "geese, flying in perfect agreement" },
  { m: 3830, text: "an island that forgot to stay on the ground" },
  { m: 4280, text: "an airship, cruising at beanstalk height" },
  { m: 4680, text: "the winds have faces up here" },
  { m: 5030, text: "white cranes, heading somewhere grand" },
  { m: 5380, text: "the moon is out, even in daylight" },
  { m: 5880, text: "a goose that lays golden eggs, apparently" },
  { m: 6280, text: "a golden harp, playing to itself" },
  { m: 6920, text: "the giant’s castle: a perfect climb ends at its door" },
];

// ---- Zone edges ------------------------------------------------------------------------------------------------
// Each zone frames the beanstalk with its own continuous edge on both sides, from a fixed seed so it never changes.

export type EdgeKind = "garden" | "canopy" | "clouds" | "winds" | "kingdom";
export const EDGE_KINDS: EdgeKind[] = ["garden", "canopy", "clouds", "winds", "kingdom"];

function seeded(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (salt: number) => {
    let x = Math.imul(h ^ (salt * 0x9e3779b1), 0x85ebca6b) >>> 0;
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35) >>> 0;
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
}

/** Garden flowers, each a real species with petals, a centre and leaves. */
function gardenFlower(kind: number, x: number, y: number, stem: number, key: string) {
  const sway = { transformOrigin: `${x}px ${y + stem}px` };
  const leaves = (
    <>
      <g transform={`translate(${x} ${y + stem * 0.62}) rotate(-55)`}>{leaf(12, "#5fae4a", "#2f7a2a")}</g>
      <g transform={`translate(${x} ${y + stem * 0.4}) rotate(60)`}>{leaf(10, "#6fc054", "#2f7a2a")}</g>
    </>
  );
  const stalk = <path d={`M${x} ${y + stem} Q${x - 3} ${y + stem / 2} ${x} ${y}`} stroke="#4f9e3e" strokeWidth="2.2" fill="none" />;
  let head: ReactNode;
  switch (kind % 6) {
    case 0: // sunflower
      head = (
        <g transform={`translate(${x} ${y})`}>
          {petals(16, 11, 2.6, "#ffd43b", "#d89a12")}
          <circle r="6.5" fill="#6b3f12" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <circle key={k} cx={Math.cos(k) * 3} cy={Math.sin(k) * 3} r="0.9" fill="#3a2008" />
          ))}
        </g>
      );
      break;
    case 1: // daisy
      head = (
        <g transform={`translate(${x} ${y})`}>
          {petals(12, 8, 1.8, "#ffffff", "#d8dce8")}
          <circle r="3.4" fill="#ffc93c" stroke="#d89a12" strokeWidth="0.8" />
        </g>
      );
      break;
    case 2: // tulip
      head = (
        <g transform={`translate(${x} ${y})`}>
          <path d="M-7 2 Q-9 -10 -4 -14 L0 -8 L4 -14 Q9 -10 7 2 Q0 8 -7 2 Z" fill="#ff5c7a" stroke="#b82a4a" strokeWidth="1" />
          <path d="M0 -8 V4" stroke="#b82a4a" strokeWidth="0.8" />
          <path d="M-4 -6 Q-5 -10 -3 -12" stroke="#ffb3c2" strokeWidth="1" fill="none" />
        </g>
      );
      break;
    case 3: // poppy
      head = (
        <g transform={`translate(${x} ${y})`}>
          {petals(4, 11, 6, "#ff4a3a", "#a82a1a", 45)}
          <circle r="3" fill="#1a1a1a" />
          {[0, 1, 2, 3, 4, 5, 6].map((k) => (
            <path key={k} d={`M0 0 L${Math.cos(k) * 5} ${Math.sin(k) * 5}`} stroke="#1a1a1a" strokeWidth="0.6" />
          ))}
        </g>
      );
      break;
    case 4: // bluebells, drooping along an arching stem
      head = (
        <g>
          <path d={`M${x} ${y} q8 -6 14 2`} stroke="#4f9e3e" strokeWidth="1.6" fill="none" />
          {[0, 1, 2].map((k) => (
            <g key={k} transform={`translate(${x + 3 + k * 5} ${y + k * 1.5}) rotate(${10 + k * 12})`}>
              <path d="M-3 0 Q-4 6 -4 8 L-2 7 L0 9 L2 7 L4 8 Q4 6 3 0 Z" fill="#7aa8ff" stroke="#3a5ab8" strokeWidth="0.7" />
            </g>
          ))}
        </g>
      );
      break;
    default: // hollyhock, blossoms stacked up the stem
      head = (
        <g>
          {[0, 1, 2, 3].map((k) => (
            <g key={k} transform={`translate(${x + (k % 2 ? 3 : -3)} ${y + k * 9})`}>
              {petals(5, 6, 3, ["#ff7eb6", "#ffa8d0", "#ff7eb6", "#ffc4dc"][k], "#c84a8a")}
              <circle r="1.6" fill="#fff4b0" />
            </g>
          ))}
        </g>
      );
  }
  return (
    <g key={key} className="aa-sway" style={sway}>
      {stalk}
      {leaves}
      {head}
    </g>
  );
}

export function Edge({ kind, height, side }: { kind: EdgeKind; height: number; side: "l" | "r" }) {
  const r = seeded(`${kind}:${side}`);
  const parts: ReactNode[] = [];

  if (kind === "garden") {
    // A flower border: real species of varied heights, grass tufts and the odd ladybird.
    for (let i = 0, y = 40; y < height; i++, y += 52 + r(i) * 36) {
      const x = 12 + r(i + 1) * 46;
      parts.push(gardenFlower(Math.floor(r(i + 2) * 6), x, y, 40 + r(i + 3) * 50, `f${i}`));
      parts.push(tuft(x + 6, y + 60, 10, `g${i}`));
      if (r(i + 4) > 0.85) {
        parts.push(
          <g key={`b${i}`} transform={`translate(${x + 4} ${y + 30})`}>
            <ellipse rx="3.4" ry="2.8" fill="#e8463c" stroke="#1a1a1a" strokeWidth="0.6" />
            <path d="M0 -2.8 V2.8" stroke="#1a1a1a" strokeWidth="0.6" />
            <circle cx="-1.4" cy="0" r="0.7" fill="#1a1a1a" />
            <circle cx="1.4" cy="1" r="0.7" fill="#1a1a1a" />
            <circle cx="0" cy="-3.2" r="1.2" fill="#1a1a1a" />
          </g>,
        );
      }
    }
  } else if (kind === "canopy") {
    // Layered veined leaves on curling vines, with berries here and there.
    for (let i = 0, y = 0; y < height; i += 1, y += 34 + r(i) * 26) {
      const x = r(i + 1) * 48;
      const size = 18 + r(i + 2) * 22;
      const fill = ["#2f7a3a", "#3f9a46", "#58b552", "#7fcf62"][Math.floor(r(i + 3) * 4)];
      parts.push(
        <g key={`leaf${i}`} transform={`translate(${x} ${y}) rotate(${-120 + r(i + 4) * 240})`} className={i % 5 === 0 ? "aa-rustle" : undefined}>
          {leaf(size, fill, "#1f5a2a")}
        </g>,
      );
      if (r(i + 5) > 0.82) {
        parts.push(
          <g key={`berry${i}`} transform={`translate(${x + 8} ${y + 10})`}>
            {[
              [0, 0],
              [4, 3],
              [-3, 4],
            ].map(([bx, by], k) => (
              <g key={k}>
                <circle cx={bx} cy={by} r="2.6" fill="#c0304a" />
                <circle cx={bx - 0.8} cy={by - 0.8} r="0.8" fill="#fff" opacity="0.7" />
              </g>
            ))}
          </g>,
        );
      }
    }
    for (let i = 0, y = 20; y < height; i++, y += 140 + r(i + 90) * 60) {
      parts.push(<path key={`vine${i}`} d={`M0 ${y} q30 20 18 48 q-10 20 14 34`} stroke="#3f7a2e" strokeWidth="2" fill="none" />);
    }
  } else if (kind === "clouds") {
    for (let i = 0, y = 30; y < height; i++, y += 80 + r(i) * 60) {
      parts.push(cloud(10 + r(i + 1) * 30, y, 0.35 + r(i + 2) * 0.35, `c${i}`));
    }
  } else if (kind === "winds") {
    for (let i = 0, y = 20; y < height; i++, y += 40 + r(i) * 36) {
      const len = 40 + r(i + 1) * 50;
      parts.push(<path key={`w${i}`} d={`M0 ${y} q${len / 2} ${-8} ${len} 0 q8 0 8 -6 q0 -6 -6 -4`} className="aa-streak" style={{ animationDelay: `${-r(i + 2) * 4}s` }} />);
      if (r(i + 3) > 0.8) {
        parts.push(
          <g key={`wl${i}`} transform={`translate(${len * 0.6} ${y - 6}) rotate(${r(i + 4) * 360})`} className="aa-tumble" style={{ animationDelay: `${-r(i + 5) * 5}s` }}>
            {leaf(9, "#86d466", "#2f7a2a")}
          </g>,
        );
      }
    }
  } else {
    for (let i = 0, y = 20; y < height; i++, y += 80 + r(i) * 40) {
      parts.push(cloud(r(i + 2) * 20, y, 0.4 + r(i + 1) * 0.3, `g${i}`, true));
      if (r(i + 3) > 0.65) {
        const x = 20 + r(i + 4) * 16;
        parts.push(
          <g key={`t${i}`}>
            <rect x={x} y={y - 46} width="18" height="40" fill="#d8c8f0" stroke="#9a8ac8" strokeWidth="1.5" />
            {[0, 1, 2].map((k) => (
              <rect key={k} x={x + k * 6} y={y - 52} width="4" height="6" fill="#d8c8f0" stroke="#9a8ac8" strokeWidth="1" />
            ))}
            <rect x={x + 6} y={y - 36} width="6" height="10" rx="3" fill="#ffd84a" />
            <path d={`M${x + 9} ${y - 52} V${y - 66} l10 3 l-10 3`} stroke="#9a8ac8" strokeWidth="1.2" fill="#ffd84a" />
          </g>,
        );
      }
    }
  }

  return (
    <svg viewBox={`0 0 100 ${Math.max(1, Math.round(height))}`} preserveAspectRatio="xMinYMin slice" style={{ height }}>
      {parts}
    </svg>
  );
}
