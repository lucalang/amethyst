/*
 * The scenery of The Ascent: original artwork for a climb from a cottage garden to a giant's castle in the clouds.
 * Each piece sits at a height (metres), on one side, at a width in container units, on the near layer or the slower
 * far layer. Animations are `aa-*` classes in ascent.css; all stop with reduced motion.
 */

import type { ReactNode } from "react";

export type Scene = { m: number; side: "l" | "r" | "c"; width: number; layer: "near" | "far"; art: ReactNode; inset?: number };

// ---- The ground: where the bean was planted -----------------------------------------------------------------

export function Ground() {
  return (
    <svg viewBox="0 0 800 320" preserveAspectRatio="xMidYMax slice" className="aa-ground">
      <defs>
        <linearGradient id="aa-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fcf62" />
          <stop offset="100%" stopColor="#3f8f3a" />
        </linearGradient>
        <linearGradient id="aa-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a5233" />
          <stop offset="100%" stopColor="#4a2f1c" />
        </linearGradient>
      </defs>
      {/* Far hills. */}
      <path d="M0 170 Q120 110 240 150 T480 140 T800 130 V320 H0 Z" fill="#a6dc8a" />
      <path d="M0 200 Q160 150 320 190 T640 180 T800 190 V320 H0 Z" fill="url(#aa-hill)" />
      {/* The cottage, smoke curling from its chimney. */}
      <g transform="translate(90 120)">
        <path d="M10 70 V36 L52 6 L94 36 V70 Z" fill="#f4e2c4" stroke="#8a6a4a" strokeWidth="2" />
        <path d="M2 40 L52 0 L102 40" fill="none" stroke="#a5452f" strokeWidth="10" strokeLinejoin="round" />
        <rect x="70" y="8" width="10" height="20" fill="#8a6a4a" />
        <rect x="24" y="44" width="16" height="14" fill="#ffd27a" stroke="#8a6a4a" strokeWidth="2" />
        <rect x="60" y="44" width="16" height="26" rx="2" fill="#6b4a2a" />
        <path d="M75 6 q-10 -14 2 -26 q10 -10 -2 -22" className="aa-smoke" />
      </g>
      {/* Picket fence. */}
      {Array.from({ length: 16 }, (_, k) => (
        <path key={k} d={`M${470 + k * 18} 236 V210 L${476 + k * 18} 204 L${482 + k * 18} 210 V236 Z`} fill="#fbf4e4" stroke="#b9a988" strokeWidth="1" />
      ))}
      <path d="M466 216 H762 M466 228 H762" stroke="#fbf4e4" strokeWidth="4" />
      {/* A cow, unimpressed. */}
      <g transform="translate(600 230)" className="aa-graze">
        <ellipse cx="0" cy="0" rx="34" ry="18" fill="#fff" stroke="#3a3a3a" strokeWidth="2" />
        <path d="M-14 -8 q8 -6 14 2 q-6 10 -14 -2 Z M10 6 q10 -4 14 4 q-8 8 -14 -4 Z" fill="#2b2b2b" />
        <ellipse cx="38" cy="-6" rx="14" ry="11" fill="#fff" stroke="#3a3a3a" strokeWidth="2" />
        <ellipse cx="46" cy="-2" rx="6" ry="5" fill="#f4b6b6" />
        <path d="M-24 16 v14 M-10 16 v14 M14 16 v14 M26 16 v14" stroke="#3a3a3a" strokeWidth="4" />
      </g>
      {/* Garden rows and soil, with the planted spot in the middle. */}
      <path d="M0 250 Q400 236 800 250 V320 H0 Z" fill="url(#aa-soil)" />
      {Array.from({ length: 9 }, (_, k) => (
        <g key={k} transform={`translate(${60 + k * 34} 268)`}>
          <circle r="9" fill="#5fae4a" />
          <circle cx="-4" cy="-3" r="5" fill="#86d36a" />
        </g>
      ))}
      {Array.from({ length: 7 }, (_, k) => (
        <path key={k} d={`M${560 + k * 30} 274 q-6 -14 0 -22 q6 8 0 22 Z`} fill="#4f9e3e" />
      ))}
      <ellipse cx="400" cy="262" rx="40" ry="8" fill="#3a2414" />
    </svg>
  );
}

// ---- The Cottage Garden (0–800 m) ----------------------------------------------------------------------------

const AppleTree = (
  <svg viewBox="0 0 220 200">
    <circle cx="110" cy="100" r="80" fill="#4fa64a" />
    <circle cx="70" cy="80" r="50" fill="#5dbb52" />
    <circle cx="150" cy="70" r="46" fill="#69c75c" />
    {[
      [70, 110],
      [120, 60],
      [160, 120],
      [100, 140],
      [140, 96],
      [60, 60],
    ].map(([x, y], k) => (
      <circle key={k} cx={x} cy={y} r="8" fill="#e8463c" stroke="#9e2a22" strokeWidth="1.5" />
    ))}
  </svg>
);

const Windmill = (
  <svg viewBox="0 0 200 260">
    <path d="M70 260 L82 110 H118 L130 260 Z" fill="#f2e6cf" stroke="#a88f6a" strokeWidth="2" />
    <path d="M78 112 L100 80 L122 112 Z" fill="#a5452f" />
    <g className="aa-sails" style={{ transformOrigin: "100px 104px" }}>
      {[0, 90, 180, 270].map((angle) => (
        <g key={angle} transform={`rotate(${angle} 100 104)`}>
          <path d="M100 104 V24" stroke="#7a5a3a" strokeWidth="4" />
          <rect x="102" y="28" width="22" height="70" fill="#fff7e8" stroke="#a88f6a" strokeWidth="1.5" />
        </g>
      ))}
      <circle cx="100" cy="104" r="7" fill="#7a5a3a" />
    </g>
  </svg>
);

const Weathervane = (
  <svg viewBox="0 0 140 200">
    <path d="M70 200 V70" stroke="#5a5048" strokeWidth="4" />
    <path d="M40 110 H100 M70 80 V140" stroke="#5a5048" strokeWidth="2" />
    <text x="104" y="114" fontSize="12" fill="#5a5048">E</text>
    <text x="26" y="114" fontSize="12" fill="#5a5048">W</text>
    <g className="aa-vane" style={{ transformOrigin: "70px 70px" }}>
      <path d="M40 70 L100 70 M88 60 L104 70 L88 80" stroke="#c9922e" strokeWidth="3" fill="none" />
      <path d="M54 46 q10 -12 22 -2 q10 -6 14 6 q-4 10 -16 10 q-6 10 -16 4 q-8 -8 -4 -18 Z" fill="#d8a23a" stroke="#8a5a1a" strokeWidth="1.5" />
    </g>
  </svg>
);

const Kite = (
  <svg viewBox="0 0 200 260" className="aa-flutter">
    <path d="M100 10 L150 80 L100 170 L50 80 Z" fill="#ff6b6b" stroke="#a83a3a" strokeWidth="2" />
    <path d="M100 10 V170 M50 80 H150" stroke="#a83a3a" strokeWidth="1.5" />
    <path d="M100 10 L150 80 L100 80 Z" fill="#ffd166" />
    <path d="M100 170 q-20 20 0 34 q20 14 -4 30 q-18 12 0 26" fill="none" stroke="#5a4a3a" strokeWidth="1.5" />
    {[186, 212, 238].map((y, k) => (
      <path key={y} d={`M${92 + (k % 2) * 10} ${y} l10 -6 l0 12 Z`} fill={["#4ecdc4", "#ff6b6b", "#ffd166"][k]} />
    ))}
  </svg>
);

// ---- The Whispering Canopy (800–2,200 m) ---------------------------------------------------------------------

const Nest = (
  <svg viewBox="0 0 240 160">
    <path d="M0 120 Q120 60 240 110" stroke="#6b4a2a" strokeWidth="12" fill="none" />
    <path d="M30 104 q30 -40 70 -10 l-20 16 Z" fill="#5fae4a" />
    <ellipse cx="140" cy="96" rx="52" ry="22" fill="#8a6236" />
    {Array.from({ length: 10 }, (_, k) => (
      <path key={k} d={`M${92 + k * 10} 92 q6 10 12 0`} stroke="#5a3a1a" strokeWidth="2" fill="none" />
    ))}
    <ellipse cx="124" cy="82" rx="10" ry="13" fill="#bfe3f2" />
    <ellipse cx="144" cy="80" rx="10" ry="13" fill="#d6eef8" />
    <ellipse cx="162" cy="84" rx="9" ry="12" fill="#bfe3f2" className="aa-wobble" />
  </svg>
);

const butterfly = (x: number, y: number, color: string, k: number) => (
  <g key={k} transform={`translate(${x} ${y})`}>
    <g className="aa-butterfly" style={{ animationDelay: `${-k * 0.7}s` }}>
      <path d="M0 0 C-14 -16 -26 -4 -12 6 C-22 14 -8 22 0 6 Z" fill={color} />
      <path d="M0 0 C14 -16 26 -4 12 6 C22 14 8 22 0 6 Z" fill={color} className="aa-wing" />
      <path d="M0 -6 V10" stroke="#2a2a2a" strokeWidth="2" />
    </g>
  </g>
);
const Butterflies = (
  <svg viewBox="0 0 240 200">
    {butterfly(50, 60, "#ffb3c7", 0)}
    {butterfly(140, 40, "#ffd166", 1)}
    {butterfly(190, 120, "#9b8cff", 2)}
    {butterfly(90, 150, "#7ee0c3", 3)}
  </svg>
);

const Owl = (
  <svg viewBox="0 0 220 200">
    <path d="M0 160 H220" stroke="#6b4a2a" strokeWidth="14" />
    <ellipse cx="110" cy="112" rx="40" ry="48" fill="#a07850" />
    <ellipse cx="110" cy="124" rx="26" ry="32" fill="#e6d0a8" />
    <path d="M74 74 L84 92 L96 76 Z M146 74 L136 92 L124 76 Z" fill="#a07850" />
    <g className="aa-blink" style={{ transformOrigin: "110px 98px" }}>
      <circle cx="94" cy="98" r="13" fill="#fff" />
      <circle cx="126" cy="98" r="13" fill="#fff" />
      <circle cx="94" cy="98" r="7" fill="#2a1a0a" />
      <circle cx="126" cy="98" r="7" fill="#2a1a0a" />
    </g>
    <path d="M106 108 L110 118 L114 108 Z" fill="#e8a33a" />
  </svg>
);

const Treehouse = (
  <svg viewBox="0 0 240 220">
    <path d="M0 150 Q120 140 240 160" stroke="#6b4a2a" strokeWidth="14" fill="none" />
    <rect x="70" y="80" width="100" height="66" fill="#c98b4e" stroke="#7a4a22" strokeWidth="2" />
    {Array.from({ length: 5 }, (_, k) => (
      <path key={k} d={`M70 ${92 + k * 12} H170`} stroke="#a86a32" strokeWidth="1.5" />
    ))}
    <path d="M60 84 L120 40 L180 84 Z" fill="#7aa83a" stroke="#4a7022" strokeWidth="2" />
    <rect x="104" y="100" width="22" height="22" fill="#ffd27a" stroke="#7a4a22" strokeWidth="2" />
    <path d="M150 146 V210 M164 146 V210" stroke="#7a4a22" strokeWidth="3" />
    {[160, 176, 192].map((y) => (
      <path key={y} d={`M150 ${y} H164`} stroke="#7a4a22" strokeWidth="3" />
    ))}
    <path d="M120 40 V22 L138 28 L120 34" fill="#ff6b6b" stroke="#7a4a22" strokeWidth="1.5" />
  </svg>
);

// ---- The Cloud Meadows (2,200–4,000 m) ----------------------------------------------------------------------

const cloudPuff = (x: number, y: number, s: number) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-60 20 Q-70 -6 -40 -10 Q-34 -40 -4 -32 Q14 -54 40 -30 Q70 -34 66 0 Q84 14 60 24 Z" fill="#fff" />
    <path d="M-60 20 Q0 34 60 24" fill="none" stroke="#d8e8f8" strokeWidth="4" />
  </g>
);
const sheep = (x: number, y: number, k: number) => (
  <g key={k} transform={`translate(${x} ${y})`}>
    <g className="aa-graze" style={{ animationDelay: `${-k * 1.3}s` }}>
      <path d="M-26 6 Q-34 -12 -16 -16 Q-12 -30 4 -24 Q18 -32 24 -16 Q38 -10 28 8 Q0 16 -26 6 Z" fill="#fff" stroke="#d8e4f0" strokeWidth="2" />
      <ellipse cx="30" cy="-6" rx="9" ry="8" fill="#3a3a44" />
      <circle cx="33" cy="-8" r="1.6" fill="#fff" />
      <path d="M-14 10 v10 M10 10 v10" stroke="#3a3a44" strokeWidth="3" />
    </g>
  </g>
);
const CloudSheep = (
  <svg viewBox="0 0 800 200" preserveAspectRatio="xMidYMid meet">
    {cloudPuff(160, 120, 1.4)}
    {cloudPuff(620, 110, 1.2)}
    {sheep(130, 82, 0)}
    {sheep(200, 90, 1)}
    {sheep(600, 74, 2)}
    {sheep(660, 82, 3)}
  </svg>
);

const Balloon = (
  <svg viewBox="0 0 200 280" className="aa-float">
    <path d="M100 10 C150 10 180 50 176 96 C172 140 126 170 112 196 H88 C74 170 28 140 24 96 C20 50 50 10 100 10 Z" fill="#ff7b54" />
    <path d="M100 10 C124 10 136 60 130 110 C126 150 112 180 108 196 H92 C88 180 74 150 70 110 C64 60 76 10 100 10 Z" fill="#ffd166" />
    <path d="M100 10 C108 10 112 70 110 120 C108 160 104 190 102 196 H98 C96 190 92 160 90 120 C88 70 92 10 100 10 Z" fill="#4ecdc4" />
    <path d="M88 196 L80 226 M112 196 L120 226" stroke="#6b4a2a" strokeWidth="2" />
    <rect x="78" y="226" width="44" height="30" rx="4" fill="#a86a32" stroke="#6b4a2a" strokeWidth="2" />
    <path d="M78 236 H122 M78 246 H122" stroke="#7a4a22" strokeWidth="1.5" />
  </svg>
);

const Rainbow = (
  <svg viewBox="0 0 800 260" preserveAspectRatio="xMidYMid meet">
    {["#ff6b6b", "#ff9f43", "#ffd166", "#6ad18b", "#4ecdc4", "#6c8cff", "#a97cff"].map((color, k) => (
      <path key={color} d={`M${40 + k * 16} 260 A${360 - k * 16} ${230 - k * 14} 0 0 1 ${760 - k * 16} 260`} fill="none" stroke={color} strokeWidth="16" opacity="0.55" />
    ))}
  </svg>
);

const Island = (
  <svg viewBox="0 0 260 260" className="aa-float">
    <path d="M30 140 H230 Q200 220 130 250 Q60 220 30 140 Z" fill="#8a6236" />
    <path d="M30 140 Q130 120 230 140 Q130 158 30 140 Z" fill="#6ad18b" />
    <path d="M130 140 V80" stroke="#6b4a2a" strokeWidth="8" />
    <circle cx="130" cy="64" r="34" fill="#4fa64a" />
    <circle cx="108" cy="80" r="22" fill="#5dbb52" />
    <path d="M70 140 q-4 14 2 24 M190 140 q4 18 -2 28" stroke="#4a7a2a" strokeWidth="3" fill="none" />
    <path d="M150 250 q4 -10 0 -16" stroke="#4ecdc4" strokeWidth="3" className="aa-drip" />
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
      <path key={k} d={`M${x - 14} ${y} q7 -8 14 0 q7 -8 14 0`} stroke="#3a4a5a" strokeWidth="3" fill="none" className="aa-flap" style={{ animationDelay: `${-k * 0.15}s` }} />
    ))}
  </svg>
);

// ---- The High Winds (4,000–5,600 m) --------------------------------------------------------------------------

const Airship = (
  <svg viewBox="0 0 320 200" className="aa-float">
    <ellipse cx="160" cy="70" rx="140" ry="50" fill="#e8d6b8" stroke="#8a6a4a" strokeWidth="2" />
    {[60, 110, 160, 210, 260].map((x) => (
      <path key={x} d={`M${x} 24 Q${x + 6} 70 ${x} 116`} stroke="#c9b08a" strokeWidth="2" fill="none" />
    ))}
    <path d="M290 70 L316 44 L316 96 Z" fill="#a5452f" />
    <path d="M120 116 L130 140 H190 L200 116" stroke="#6b4a2a" strokeWidth="2" fill="none" />
    <rect x="124" y="138" width="72" height="26" rx="6" fill="#6b4a2a" />
    {[134, 154, 174].map((x) => (
      <rect key={x} x={x} y="144" width="12" height="10" rx="2" fill="#ffd27a" />
    ))}
    <g className="aa-prop" style={{ transformOrigin: "110px 151px" }}>
      <path d="M110 136 V166" stroke="#4a3a2a" strokeWidth="4" />
    </g>
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
  </svg>
);

const Moon = (
  <svg viewBox="0 0 200 200">
    <circle cx="100" cy="100" r="70" fill="#f4f7ff" opacity="0.85" />
    <circle cx="74" cy="80" r="12" fill="#dfe6f6" />
    <circle cx="124" cy="120" r="18" fill="#dfe6f6" />
    <circle cx="120" cy="70" r="7" fill="#dfe6f6" />
    {[
      [20, 30],
      [180, 40],
      [30, 170],
      [170, 160],
    ].map(([x, y], k) => (
      <path key={k} d={`M${x} ${y - 6} L${x + 2} ${y - 2} L${x + 6} ${y} L${x + 2} ${y + 2} L${x} ${y + 6} L${x - 2} ${y + 2} L${x - 6} ${y} L${x - 2} ${y - 2} Z`} fill="#fff" className="aa-twinkle" style={{ animationDelay: `${-k * 0.8}s` }} />
    ))}
  </svg>
);

const Cranes = (
  <svg viewBox="0 0 300 140" className="aa-glide">
    {[
      [60, 60],
      [130, 40],
      [210, 70],
    ].map(([x, y], k) => (
      <g key={k} transform={`translate(${x} ${y})`}>
        <path d="M-30 0 Q0 -10 30 0 M0 -4 L-6 -22 M0 -4 L8 -22" stroke="#f4f7ff" strokeWidth="3" fill="none" className="aa-flap" style={{ animationDelay: `${-k * 0.4}s` }} />
      </g>
    ))}
  </svg>
);

// ---- The Giant's Kingdom (5,600–7,000 m) ---------------------------------------------------------------------

const Goose = (
  <svg viewBox="0 0 240 200">
    {cloudPuff(120, 150, 1.3)}
    <g className="aa-wobble" style={{ transformOrigin: "120px 120px" }}>
      <ellipse cx="120" cy="100" rx="44" ry="30" fill="#ffd84a" stroke="#b8861e" strokeWidth="2" />
      <path d="M150 90 Q170 50 160 34 Q152 22 142 34" fill="none" stroke="#ffd84a" strokeWidth="14" strokeLinecap="round" />
      <circle cx="152" cy="34" r="3" fill="#3a2a0a" />
      <path d="M160 34 L176 38 L160 42 Z" fill="#ff9f43" />
      <ellipse cx="80" cy="124" rx="14" ry="18" fill="#ffe680" stroke="#b8861e" strokeWidth="2" className="aa-shine" />
    </g>
  </svg>
);

const Harp = (
  <svg viewBox="0 0 200 260">
    <path d="M40 240 L60 30 Q140 20 170 80 Q150 150 70 240 Z" fill="none" stroke="#ffd84a" strokeWidth="10" strokeLinejoin="round" />
    {Array.from({ length: 9 }, (_, k) => (
      <path key={k} d={`M${66 + k * 10} ${40 + k * 4} L${56 + k * 2} ${226 - k * 10}`} stroke="#fff4c2" strokeWidth="1.5" className="aa-string" style={{ animationDelay: `${-k * 0.2}s` }} />
    ))}
    <path d="M60 30 q-10 -20 6 -26 q14 -4 14 12" fill="none" stroke="#ffd84a" strokeWidth="6" />
    {[
      [176, 60],
      [186, 110],
      [168, 150],
    ].map(([x, y], k) => (
      <text key={k} x={x} y={y} fontSize="18" fill="#fff4c2" className="aa-note" style={{ animationDelay: `${-k * 0.9}s` }}>
        ♪
      </text>
    ))}
  </svg>
);

const Castle = (
  <svg viewBox="0 0 600 340">
    {cloudPuff(130, 300, 2)}
    {cloudPuff(470, 300, 2)}
    {cloudPuff(300, 320, 2.4)}
    <path d="M150 300 V150 H190 V120 H210 V150 H250 V100 H350 V150 H390 V120 H410 V150 H450 V300 Z" fill="#c8b8e8" stroke="#7a6aa8" strokeWidth="3" />
    <path d="M170 150 V60 L195 20 L220 60 V150 M380 150 V60 L405 20 L430 60 V150 M270 100 V40 L300 0 L330 40 V100" fill="#b0a0dc" stroke="#7a6aa8" strokeWidth="3" />
    <path d="M195 20 V0 L214 6 L195 12 M405 20 V0 L424 6 L405 12 M300 0 V-22 L322 -14 L300 -6" fill="#ff6b6b" stroke="#7a6aa8" strokeWidth="2" />
    <path d="M270 300 V230 Q300 200 330 230 V300 Z" fill="#5a4a88" />
    {[
      [190, 90],
      [400, 90],
      [290, 60],
      [210, 200],
      [380, 200],
    ].map(([x, y], k) => (
      <rect key={k} x={x} y={y} width="20" height="26" rx="10" fill="#ffd84a" className="aa-glow" style={{ animationDelay: `${-k * 0.6}s` }} />
    ))}
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
  { m: 500, text: "the weathervane points straight up" },
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
  { m: 4680, text: "the winds have shapes up here" },
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

export function Edge({ kind, height, side }: { kind: EdgeKind; height: number; side: "l" | "r" }) {
  const r = seeded(`${kind}:${side}`);
  const parts: ReactNode[] = [];

  if (kind === "garden") {
    // Hollyhocks and sunflowers growing up the edge.
    for (let i = 0, y = 40; y < height; i++, y += 70 + r(i) * 50) {
      const x = 14 + r(i + 1) * 40;
      const tall = 60 + r(i + 2) * 70;
      const color = ["#ff7eb6", "#ffd166", "#ff9f43", "#c084fc"][i % 4];
      parts.push(<path key={`s${i}`} d={`M${x} ${y + tall} V${y}`} stroke="#4f9e3e" strokeWidth="3" />);
      parts.push(<circle key={`f${i}`} cx={x} cy={y} r={7 + r(i + 3) * 6} fill={color} className="aa-sway" style={{ transformOrigin: `${x}px ${y + tall}px` }} />);
      parts.push(<path key={`l${i}`} d={`M${x} ${y + tall * 0.6} q14 -10 20 4 q-12 6 -20 -4 Z`} fill="#5fae4a" />);
    }
  } else if (kind === "canopy") {
    // Clusters of big leaves, layered light over dark.
    for (let i = 0, y = 0; y < height; i++, y += 46 + r(i) * 34) {
      const x = r(i + 1) * 46;
      const size = 26 + r(i + 2) * 30;
      const fill = ["#2f7a3a", "#3f9a46", "#58b552", "#7fcf62"][Math.floor(r(i + 3) * 4)];
      parts.push(
        <path
          key={`leaf${i}`}
          d={`M${x} ${y} q${size} ${-size * 0.5} ${size * 1.6} ${size * 0.2} q${-size * 0.8} ${size * 0.8} ${-size * 1.6} ${-size * 0.2} Z`}
          fill={fill}
          className={i % 5 === 0 ? "aa-rustle" : undefined}
          style={i % 5 === 0 ? { transformOrigin: `${x}px ${y}px` } : undefined}
        />,
      );
    }
  } else if (kind === "clouds") {
    // Soft cloud banks.
    for (let i = 0, y = 30; y < height; i++, y += 90 + r(i) * 60) {
      const x = -10 + r(i + 1) * 30;
      const s = 0.5 + r(i + 2) * 0.5;
      parts.push(
        <path
          key={`c${i}`}
          transform={`translate(${x} ${y}) scale(${s})`}
          d="M-20 30 Q-30 4 0 0 Q6 -30 36 -22 Q54 -44 80 -20 Q110 -24 106 10 Q124 24 100 34 Z"
          fill="#fff"
          opacity={0.75 + r(i + 3) * 0.2}
        />,
      );
    }
  } else if (kind === "winds") {
    // Streaks of fast air.
    for (let i = 0, y = 20; y < height; i++, y += 44 + r(i) * 40) {
      const len = 40 + r(i + 1) * 50;
      parts.push(<path key={`w${i}`} d={`M0 ${y} q${len / 2} ${-8} ${len} 0`} className="aa-streak" style={{ animationDelay: `${-r(i + 2) * 4}s` }} />);
    }
  } else {
    // Golden-lit cloud ramparts with little turrets.
    for (let i = 0, y = 20; y < height; i++, y += 80 + r(i) * 40) {
      const s = 0.55 + r(i + 1) * 0.4;
      parts.push(
        <path key={`g${i}`} transform={`translate(${r(i + 2) * 20 - 10} ${y}) scale(${s})`} d="M-20 30 Q-30 4 0 0 Q6 -30 36 -22 Q54 -44 80 -20 Q110 -24 106 10 Q124 24 100 34 Z" fill="#fff4d6" />,
      );
      if (r(i + 3) > 0.7) parts.push(<path key={`t${i}`} d={`M24 ${y - 6} V${y - 40} L36 ${y - 56} L48 ${y - 40} V${y - 6} Z`} fill="#d8c8f0" stroke="#9a8ac8" strokeWidth="1.5" />);
    }
  }

  return (
    <svg viewBox={`0 0 100 ${Math.max(1, Math.round(height))}`} preserveAspectRatio="none" style={{ height }}>
      {parts}
    </svg>
  );
}
