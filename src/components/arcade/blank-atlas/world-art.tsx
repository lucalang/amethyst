/*
 * The scenery of The Descent: original artwork for the five zones of the fog, from the drowned Gaslit City at the top
 * to the Nameless Floor at 7,000 m. Each piece sits at a depth (metres), on one side, at a width in container units,
 * and on the near layer or the slower far (parallax) layer. Animations are CSS classes in descent.css (`wa-*`), and
 * all of them stop with reduced motion.
 *
 * Pieces are drawn with a small kit (gothic and sash windows, brick and stone textures) so each object has shading,
 * trim and secondary detail rather than flat shapes.
 */

import type { ReactNode } from "react";

export type Scene = { m: number; side: "l" | "r" | "c"; width: number; layer: "near" | "far"; art: ReactNode; inset?: number; /** Art that reaches past its box (a beam), so it isn't faded at the edges. */ bleed?: boolean };

// ---- Drawing kit ------------------------------------------------------------------------------------------------

/** A Victorian sash window: lintel, frame, glazing bars, sill and (when lit) half-drawn curtains. */
function sash(x: number, y: number, w: number, h: number, lit: boolean, key?: string | number, flicker = false) {
  return (
    <g key={key} transform={`translate(${x} ${y})`}>
      <rect x="-2" y="-4" width={w + 4} height="3.5" fill="#3a3236" />
      <rect width={w} height={h} fill={lit ? "#ffcf7a" : "#14121a"} stroke="#4a3e2c" strokeWidth="1.4" className={lit && flicker ? "wa-window" : undefined} />
      {lit ? (
        <>
          <path d={`M0 0 Q${w * 0.3} ${h * 0.5} 0 ${h}`} fill="#8a2a34" opacity="0.75" />
          <path d={`M${w} 0 Q${w * 0.7} ${h * 0.5} ${w} ${h}`} fill="#8a2a34" opacity="0.75" />
          <rect x="1" y="1" width={w - 2} height={h * 0.35} fill="#fff1c4" opacity="0.35" />
        </>
      ) : (
        <path d={`M2 2 L${w * 0.4} ${h * 0.4}`} stroke="#fff" strokeOpacity="0.12" strokeWidth="1.5" />
      )}
      <path d={`M${w / 2} 0 V${h} M0 ${h / 2} H${w}`} stroke="#4a3e2c" strokeWidth="1.1" />
      <rect x="-2.5" y={h} width={w + 5} height="3" fill="#4a4044" />
    </g>
  );
}

/** A gothic lancet window with tracery: pointed arch, mullion, transom and a roundel at the head. */
function lancet(x: number, y: number, w: number, h: number, glass: string, key?: string | number) {
  const r = w / 2;
  return (
    <g key={key} transform={`translate(${x} ${y})`}>
      <path d={`M0 ${h} V${r} Q0 0 ${r} 0 Q${w} 0 ${w} ${r} V${h} Z`} fill={glass} stroke="#2a2226" strokeWidth="2" />
      <path d={`M${r} ${r * 0.9} V${h} M0 ${h * 0.62} H${w}`} stroke="#2a2226" strokeWidth="1.4" />
      <circle cx={r} cy={r * 0.75} r={r * 0.32} fill="none" stroke="#2a2226" strokeWidth="1.2" />
    </g>
  );
}

/** Brick and stone textures, scoped by `prefix` so pieces don't clash. */
function textures(prefix: string, brick = "#2a2326", mortar = "#1a1518") {
  return (
    <defs>
      <pattern id={`${prefix}-brick`} width="14" height="8" patternUnits="userSpaceOnUse">
        <rect width="14" height="8" fill={brick} />
        <path d="M0 7.5 H14 M7 0 V4 M0 4 H14 M2 4 V8" stroke={mortar} strokeWidth="0.9" />
      </pattern>
      <pattern id={`${prefix}-stone`} width="24" height="12" patternUnits="userSpaceOnUse">
        <rect width="24" height="12" fill={brick} />
        <path d="M0 11.5 H24 M12 0 V6 M0 6 H24 M4 6 V12" stroke={mortar} strokeWidth="1" />
        <path d="M3 3 l3 1" stroke="#fff" strokeOpacity="0.05" />
      </pattern>
    </defs>
  );
}

// ---- The Gaslit City (0–800 m) -------------------------------------------------------------------------------

const Skyline = (
  <svg viewBox="0 0 800 260" preserveAspectRatio="xMidYMax meet">
    {textures("sk", "#251f22", "#171316")}
    {/* Back row: spires, domes and towers in silhouette. */}
    <path
      d="M0 260 V190 H30 V150 L44 120 L58 150 V190 H96 V140 Q116 108 136 140 V190 H180 V120 H188 V90 L196 70 L204 90 V120 H212 V190 H260 V160 H300 V100 L316 40 L332 100 V160 H372 V180 H420 V130 Q446 96 472 130 V180 H520 V110 L536 60 L552 110 V180 H600 V150 H660 V100 H670 V80 H680 V100 H690 V170 H760 V140 H800 V260 Z"
      fill="#1a1618"
      opacity="0.8"
    />
    {/* Front row: tenements with chimney stacks, pots and smoke. */}
    <path
      d="M0 260 V200 H70 V176 H120 V196 H180 V170 H236 V200 H300 V180 H350 V206 H420 V182 H470 V198 H540 V174 H590 V196 H650 V178 H700 V204 H760 V186 H800 V260 Z"
      fill="url(#sk-brick)"
      stroke="#3a2f33"
      strokeWidth="1"
    />
    {[
      [84, 176],
      [196, 170],
      [312, 180],
      [432, 182],
      [552, 174],
      [664, 178],
    ].map(([x, y], k) => (
      <g key={k}>
        <rect x={x} y={y - 22} width="18" height="22" fill="url(#sk-brick)" stroke="#3a2f33" strokeWidth="1" />
        {[0, 1, 2].map((p) => (
          <rect key={p} x={x + 1 + p * 6} y={y - 28} width="4" height="7" fill="#3a2a24" />
        ))}
        <path d={`M${x + 9} ${y - 30} q-12 -20 4 -36 q14 -14 -2 -30`} className="wa-smoke" style={{ animationDelay: `${-k * 1.4}s` }} />
      </g>
    ))}
    {Array.from({ length: 40 }, (_, k) => sash(8 + ((k * 97) % 780), 210 + ((k * 31) % 36), 8, 11, k % 3 !== 0, k, k % 7 === 0))}
    <path d="M0 230 H800" stroke="#3a2f33" strokeWidth="2" />
  </svg>
);

const ClockTower = (
  <svg viewBox="0 0 130 360">
    {textures("ct", "#221d20", "#141114")}
    <path d="M30 360 V120 H100 V360 Z" fill="url(#ct-stone)" stroke="#3b3236" strokeWidth="2" />
    {[160, 220, 280].map((y) => (
      <rect key={y} x="26" y={y} width="78" height="5" fill="#2e2629" />
    ))}
    {/* Spire, pinnacles and a lightning rod. */}
    <path d="M24 122 L65 30 L106 122 Z" fill="#1a1618" stroke="#3b3236" strokeWidth="2" />
    <path d="M65 30 L106 122 H65 Z" fill="#000" opacity="0.2" />
    {[24, 106].map((x) => (
      <path key={x} d={`M${x - 6} 124 L${x} 100 L${x + 6} 124 Z`} fill="#2a2326" stroke="#3b3236" strokeWidth="1.5" />
    ))}
    <path d="M65 30 V4 M60 12 H70" stroke="#5a4c32" strokeWidth="2" />
    {/* The clock face: Roman numerals and ornate hands, stopped at midnight. */}
    <circle cx="65" cy="160" r="27" fill="#2a2326" stroke="#5a4c32" strokeWidth="3" />
    <circle cx="65" cy="160" r="23" fill="#e9d9a8" />
    <circle cx="65" cy="160" r="23" fill="none" stroke="#b08a48" strokeWidth="1" />
    {["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"].map((numeral, k) => {
      const a = (k / 12) * Math.PI * 2;
      return (
        <text key={numeral} x={65 + Math.sin(a) * 17} y={162 - Math.cos(a) * 17} fontSize="5" fontWeight="700" textAnchor="middle" fill="#3a2c18" fontFamily="Georgia, serif">
          {numeral}
        </text>
      );
    })}
    <path d="M65 160 V140 M63 146 L65 139 L67 146 M65 160 V144" stroke="#2a1d0e" strokeWidth="2" strokeLinecap="round" />
    <circle cx="65" cy="160" r="2" fill="#2a1d0e" />
    {/* Gargoyles at the corners. */}
    {[
      [30, 196, -1],
      [100, 196, 1],
    ].map(([x, y, s]) => (
      <path key={x} d={`M${x} ${y} l${s * 14} -4 l${s * 4} 4 l${s * -4} 4 Z`} fill="#2a2326" stroke="#3b3236" strokeWidth="1" />
    ))}
    {/* The pendulum, behind a lit balcony arch. */}
    <path d="M44 290 V236 Q65 214 86 236 V290 Z" fill="#ffcf7a" opacity="0.25" />
    <path d="M44 290 V236 Q65 214 86 236 V290" fill="none" stroke="#4a3e2c" strokeWidth="2" />
    <path d="M65 228 V280" stroke="#6e5a3a" strokeWidth="1.5" />
    <circle cx="65" cy="284" r="8" fill="#b08a48" stroke="#5a4422" strokeWidth="1.5" className="wa-pendulum" />
    <path d="M40 292 H90" stroke="#4a4044" strokeWidth="3" />
    {[48, 56, 64, 72, 80].map((x) => (
      <path key={x} d={`M${x} 292 V302`} stroke="#4a4044" strokeWidth="1.5" />
    ))}
    {sash(56, 320, 18, 22, true)}
  </svg>
);

const GasLamp = (
  <svg viewBox="0 0 90 280">
    <circle cx="45" cy="48" r="44" className="wa-lampglow" />
    {/* Fluted iron column on a stepped base, with a ladder bar and a scrollwork bracket. */}
    <path d="M38 270 V84 H52 V270 Z" fill="#262327" />
    {[41, 45, 49].map((x) => (
      <path key={x} d={`M${x} 90 V264`} stroke="#3a363b" strokeWidth="1" />
    ))}
    <path d="M28 268 H62 V278 H28 Z M32 260 H58 V268 H32 Z" fill="#2c292e" stroke="#4a4648" strokeWidth="1" />
    <path d="M30 120 H60" stroke="#3a363b" strokeWidth="3" strokeLinecap="round" />
    <path d="M52 100 q14 -6 10 -18 q-4 -6 -10 0" fill="none" stroke="#3a363b" strokeWidth="2" />
    {/* Lantern head: brass cap, finial and four glass panes. */}
    <path d="M45 84 V72" stroke="#262327" strokeWidth="4" />
    <path d="M28 72 H62 L56 34 H34 Z" fill="#2a2629" stroke="#6e5a3a" strokeWidth="1.5" />
    <path d="M33 37 H57 L60 68 H30 Z" fill="#ffd27a" opacity="0.85" className="wa-flame" />
    <path d="M45 37 V68 M31 52 H59" stroke="#4a3e2c" strokeWidth="1.2" />
    <ellipse cx="45" cy="52" rx="4" ry="7" fill="#fff4c2" />
    <path d="M30 34 H60 L52 22 H38 Z" fill="#2a2629" stroke="#6e5a3a" strokeWidth="1.5" />
    <path d="M45 22 V10 M41 14 H49" stroke="#6e5a3a" strokeWidth="2" />
    <circle cx="45" cy="8" r="2.5" fill="#b08a48" />
  </svg>
);

const Cab = (
  <svg viewBox="0 0 220 150" className="wa-bob">
    <defs>
      <linearGradient id="wa-cab" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2e2428" />
        <stop offset="100%" stopColor="#171316" />
      </linearGradient>
    </defs>
    {/* Body with a curved roof, door panel, brass trim and coach lamps. */}
    <path d="M40 40 H146 Q158 40 158 54 V100 H30 V54 Q30 40 40 40 Z" fill="url(#wa-cab)" stroke="#4a3e2c" strokeWidth="2" />
    <path d="M36 44 H152 M30 88 H158" stroke="#b08a48" strokeWidth="1.5" />
    <rect x="46" y="52" width="36" height="28" rx="3" fill="#ffcf7a" opacity="0.8" className="wa-window" />
    <path d="M46 52 Q60 66 46 80" fill="#5a1a24" opacity="0.8" />
    <rect x="94" y="52" width="46" height="28" rx="3" fill="#ffcf7a" opacity="0.6" />
    <path d="M117 52 V80" stroke="#4a3e2c" strokeWidth="1.5" />
    <circle cx="88" cy="70" r="1.6" fill="#b08a48" />
    <path d="M60 30 H130 L136 40 H54 Z" fill="#1d181b" stroke="#4a3e2c" strokeWidth="1.5" />
    <path d="M60 30 q-4 -6 4 -6 h62 q8 0 4 6" fill="none" stroke="#3a3034" strokeWidth="2" />
    {/* Shafts reaching for a horse that is no longer there. */}
    <path d="M158 74 H204 M158 82 H200" stroke="#3a3034" strokeWidth="3" strokeLinecap="round" />
    {/* Spoked wheels with hubs and iron tyres. */}
    {[58, 132].map((cx) => (
      <g key={cx}>
        <circle cx={cx} cy="108" r="24" fill="none" stroke="#2a2226" strokeWidth="6" />
        <circle cx={cx} cy="108" r="24" fill="none" stroke="#4a3e2c" strokeWidth="2" />
        {Array.from({ length: 8 }, (_, k) => {
          const a = (k / 8) * Math.PI;
          return <path key={k} d={`M${cx - Math.cos(a) * 21} ${108 - Math.sin(a) * 21} L${cx + Math.cos(a) * 21} ${108 + Math.sin(a) * 21}`} stroke="#4a3e2c" strokeWidth="1.8" />;
        })}
        <circle cx={cx} cy="108" r="5" fill="#b08a48" stroke="#5a4422" strokeWidth="1" />
      </g>
    ))}
    {[24, 164].map((x) => (
      <g key={x}>
        <circle cx={x} cy="56" r="16" className="wa-lampglow" />
        <rect x={x - 5} y="49" width="10" height="13" rx="2" fill="#ffd27a" stroke="#6e5a3a" strokeWidth="1.2" className="wa-flame" />
        <path d={`M${x - 6} 48 H${x + 6} L${x} 43 Z`} fill="#2a2629" />
      </g>
    ))}
  </svg>
);

const Viaduct = (
  <svg viewBox="0 0 800 230" preserveAspectRatio="xMidYMid meet">
    {textures("vd", "#211b1e", "#151114")}
    <path d="M0 92 H800 V112 H0 Z" fill="#2a2326" />
    <path d="M0 92 H800" stroke="#4a4044" strokeWidth="2" />
    {Array.from({ length: 8 }, (_, k) => (
      <g key={k}>
        <path d={`M${k * 100} 112 H${k * 100 + 100} V230 H${k * 100 + 84} V164 Q${k * 100 + 50} 122 ${k * 100 + 16} 164 V230 H${k * 100} Z`} fill="url(#vd-brick)" stroke="#3a2f33" strokeWidth="1" />
        <path d={`M${k * 100 + 16} 164 Q${k * 100 + 50} 122 ${k * 100 + 84} 164`} fill="none" stroke="#4a3e40" strokeWidth="3" />
      </g>
    ))}
    {/* A steam engine and three lit carriages, still waiting. */}
    <path d="M232 92 V62 Q232 50 244 50 H286 V92 Z" fill="#1d181b" stroke="#4a3e2c" strokeWidth="1.5" />
    <rect x="240" y="30" width="12" height="20" fill="#1d181b" />
    <path d="M238 30 H254" stroke="#4a3e2c" strokeWidth="3" />
    <circle cx="232" cy="74" r="5" fill="#ffd27a" className="wa-flame" />
    {[300, 430, 560].map((x) => (
      <g key={x}>
        <rect x={x} y="58" width="120" height="34" rx="3" fill="#2a2326" stroke="#4a3e2c" strokeWidth="1.5" />
        <path d={`M${x - 2} 58 Q${x + 60} 48 ${x + 122} 58`} fill="#1d181b" stroke="#4a3e2c" strokeWidth="1.5" />
        {[0, 1, 2, 3, 4].map((w) => sash(x + 8 + w * 22, 64, 14, 12, (x + w) % 3 !== 0, w))}
      </g>
    ))}
    <path d="M246 26 q-12 -20 4 -36 q14 -14 -2 -30" className="wa-smoke" />
  </svg>
);

const Cathedral = (
  <svg viewBox="0 0 240 340">
    {textures("cd", "#1d181b", "#121013")}
    {/* Twin towers with louvred belfries, lancets and spires. */}
    {[20, 160].map((x) => (
      <g key={x}>
        <path d={`M${x} 340 V140 H${x + 60} V340 Z`} fill="url(#cd-stone)" stroke="#33292d" strokeWidth="2" />
        <path d={`M${x - 4} 142 L${x + 30} 50 L${x + 64} 142 Z`} fill="#1a1619" stroke="#33292d" strokeWidth="2" />
        <path d={`M${x + 30} 50 L${x + 64} 142 H${x + 30} Z`} fill="#000" opacity="0.2" />
        <path d={`M${x + 30} 50 V24 M${x + 24} 34 H${x + 36}`} stroke="#5a4c32" strokeWidth="2.5" />
        {lancet(x + 18, 158, 24, 42, "#14121a")}
        {[166, 172, 178, 184, 190].map((y) => (
          <path key={y} d={`M${x + 20} ${y} H${x + 40}`} stroke="#2a2226" strokeWidth="1.2" />
        ))}
        {lancet(x + 20, 240, 20, 40, "#ffcf7a")}
      </g>
    ))}
    {/* The nave front: gable, rose window with tracery, portal with layered arches and statues. */}
    <path d="M76 340 V170 L120 104 L164 170 V340 Z" fill="url(#cd-stone)" stroke="#33292d" strokeWidth="2" />
    <path d="M76 170 L120 104 L164 170" fill="none" stroke="#4a3e40" strokeWidth="3" />
    <circle cx="120" cy="196" r="30" className="wa-rose" />
    {Array.from({ length: 12 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      return <path key={k} d={`M120 196 L${120 + Math.cos(a) * 30} ${196 + Math.sin(a) * 30}`} stroke="#2a2226" strokeWidth="2" />;
    })}
    {Array.from({ length: 12 }, (_, k) => {
      const a = ((k + 0.5) / 12) * Math.PI * 2;
      return <circle key={`p${k}`} cx={120 + Math.cos(a) * 21} cy={196 + Math.sin(a) * 21} r="4" fill="none" stroke="#2a2226" strokeWidth="1.2" />;
    })}
    <circle cx="120" cy="196" r="30" fill="none" stroke="#33292d" strokeWidth="4" />
    <circle cx="120" cy="196" r="7" fill="#c9a8ff" stroke="#2a2226" strokeWidth="1.5" />
    {[0, 1, 2].map((k) => (
      <path key={k} d={`M${98 + k * 4} 340 V${282 + k * 4} Q120 ${252 + k * 6} ${142 - k * 4} ${282 + k * 4} V340`} fill="none" stroke="#33292d" strokeWidth="2.5" />
    ))}
    <path d="M110 340 V292 Q120 280 130 292 V340 Z" fill="#0d0b0d" />
    <path d="M120 286 V340" stroke="#2a2226" strokeWidth="1.5" />
    {[86, 154].map((x) => (
      <g key={x}>
        <rect x={x - 5} y="250" width="10" height="22" rx="4" fill="#2a2326" stroke="#4a3e40" strokeWidth="1" />
        <circle cx={x} cy="246" r="4" fill="#2a2326" stroke="#4a3e40" strokeWidth="1" />
      </g>
    ))}
  </svg>
);

// ---- The Spirit Tide (800–2,100 m) ---------------------------------------------------------------------------

const Aurora = (
  <svg viewBox="0 0 800 300" preserveAspectRatio="none">
    <path d="M0 120 C160 40 320 200 480 100 S720 60 800 130 V170 C700 110 560 240 420 150 S120 90 0 170 Z" className="wa-aurora wa-aurora-a" />
    <path d="M0 190 C140 120 300 250 460 170 S700 140 800 200 V230 C680 180 540 290 400 220 S140 170 0 240 Z" className="wa-aurora wa-aurora-b" />
    <path d="M0 150 C200 90 340 190 520 120 S740 110 800 150" fill="none" stroke="rgb(220 210 255 / 0.25)" strokeWidth="2" />
    {Array.from({ length: 24 }, (_, k) => (
      <circle key={k} cx={(k * 137) % 800} cy={40 + ((k * 53) % 220)} r={0.8 + (k % 3) * 0.5} fill="#e4dcff" className="wa-twinkle" style={{ animationDelay: `${-k * 0.4}s` }} />
    ))}
  </svg>
);

/** A tarot card: gilt border, corner pips and an illustrated face (or an ornate back). */
const card = (x: number, y: number, rotate: number, face: ReactNode, k: number, title?: string) => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <g className="wa-card" style={{ animationDelay: `${-k * 1.1}s` }}>
      <rect x="-28" y="-46" width="56" height="92" rx="5" fill="#16121c" stroke="#c9a86a" strokeWidth="2" />
      <rect x="-23" y="-41" width="46" height="82" rx="3" fill="none" stroke="#c9a86a" strokeOpacity="0.5" />
      {[
        [-19, -37],
        [19, -37],
        [-19, 37],
        [19, 37],
      ].map(([cx, cy], c) => (
        <path key={c} d={`M${cx} ${cy - 3} L${cx + 3} ${cy} L${cx} ${cy + 3} L${cx - 3} ${cy} Z`} fill="#c9a86a" />
      ))}
      {face}
      {title ? (
        <text y="34" fontSize="6" textAnchor="middle" fill="#c9a86a" fontFamily="Georgia, serif">
          {title}
        </text>
      ) : null}
    </g>
  </g>
);
const CARD_BACK = (
  <g fill="none" stroke="#c9a86a" strokeOpacity="0.75">
    <circle r="14" />
    <path d="M0 -24 L12 0 L0 24 L-12 0 Z M0 -8 L5 0 L0 8 L-5 0 Z" />
    <path d="M-14 0 H14 M0 -14 V14" strokeOpacity="0.4" />
  </g>
);
const FACE_EYE = (
  <g>
    <path d="M-16 -4 Q0 -18 16 -4 Q0 10 -16 -4 Z" fill="#f3e6c4" stroke="#c9a86a" />
    <circle cy="-4" r="6" fill="#a3102a" />
    <circle cy="-4" r="2.4" fill="#120a0e" />
    {Array.from({ length: 9 }, (_, k) => {
      const a = Math.PI + (k / 8) * Math.PI;
      return <path key={k} d={`M${Math.cos(a) * 19} ${-4 + Math.sin(a) * 19} L${Math.cos(a) * 25} ${-4 + Math.sin(a) * 25}`} stroke="#c9a86a" strokeWidth="1" />;
    })}
    <path d="M-12 18 Q0 12 12 18" stroke="#c9a86a" fill="none" />
  </g>
);
const FACE_MOON = (
  <g>
    <circle cy="-8" r="13" fill="#e9e3d0" />
    <circle cx="6" cy="-12" r="11" fill="#16121c" />
    {[-14, 14].map((px) => (
      <path key={px} d={`M${px - 4} 24 V10 L${px} 5 L${px + 4} 10 V24 Z`} fill="#3a3046" stroke="#c9a86a" strokeWidth="0.6" />
    ))}
    <path d="M-20 22 Q0 16 20 22" stroke="#6a8ac8" strokeWidth="1.5" fill="none" />
  </g>
);
const FACE_TOWER = (
  <g>
    <path d="M-7 24 V-10 L0 -20 L7 -10 V24 Z" fill="#3a3046" stroke="#c9a86a" strokeWidth="0.8" />
    <rect x="-2.5" y="-6" width="5" height="7" fill="#ffcf7a" />
    <path d="M-14 -24 L-4 -14 L-9 -12 L2 -2" stroke="#ffd84a" strokeWidth="1.5" fill="none" />
    <path d="M-12 24 H12" stroke="#c9a86a" />
  </g>
);
const Tarot = (
  <svg viewBox="0 0 340 210">
    {card(56, 116, -14, CARD_BACK, 0)}
    {card(128, 96, -5, FACE_MOON, 1, "THE MOON")}
    {card(204, 102, 8, FACE_EYE, 2, "THE SEER")}
    {card(278, 124, 16, FACE_TOWER, 3, "THE TOWER")}
  </svg>
);

const Mirror = (
  <svg viewBox="0 0 170 260">
    <defs>
      <linearGradient id="wa-mirror" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#6a7c98" />
        <stop offset="60%" stopColor="#2a3346" />
        <stop offset="100%" stopColor="#141a26" />
      </linearGradient>
      <linearGradient id="wa-gilt" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#e8c27a" />
        <stop offset="50%" stopColor="#b08a48" />
        <stop offset="100%" stopColor="#6e5428" />
      </linearGradient>
    </defs>
    {/* Gilt frame with beading and a scrolled crest. */}
    <ellipse cx="85" cy="118" rx="62" ry="88" fill="url(#wa-gilt)" />
    <ellipse cx="85" cy="118" rx="54" ry="80" fill="url(#wa-mirror)" stroke="#5a4422" strokeWidth="2" />
    {Array.from({ length: 28 }, (_, k) => {
      const a = (k / 28) * Math.PI * 2;
      return <circle key={k} cx={85 + Math.cos(a) * 58} cy={118 + Math.sin(a) * 84} r="1.6" fill="#f3d99a" />;
    })}
    <path d="M44 48 Q85 4 126 48 M66 30 Q85 10 104 30" fill="none" stroke="url(#wa-gilt)" strokeWidth="6" strokeLinecap="round" />
    <path d="M85 14 L90 24 L85 34 L80 24 Z" fill="#e0263f" stroke="#6e5428" />
    <path d="M36 150 q-14 10 -6 24 M134 150 q14 10 6 24" fill="none" stroke="url(#wa-gilt)" strokeWidth="5" strokeLinecap="round" />
    {/* Someone else's reflection, top hat and all. */}
    <g className="wa-figure">
      <path d="M85 64 a14 16 0 1 1 0.1 0 Z" fill="#0c0f16" />
      <path d="M70 66 H100 M74 66 V44 H96 V66" fill="#0c0f16" stroke="#0c0f16" strokeWidth="2" />
      <path d="M58 182 Q62 116 85 110 Q108 116 112 182 Z" fill="#0c0f16" />
      <circle cx="80" cy="80" r="1.4" fill="#e0263f" />
      <circle cx="90" cy="80" r="1.4" fill="#e0263f" />
    </g>
    <path d="M54 62 L70 46 M50 80 L60 70" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />
    <path d="M85 206 V238 M62 240 H108 L100 252 H70 Z" stroke="url(#wa-gilt)" strokeWidth="5" fill="url(#wa-gilt)" />
  </svg>
);

const Puppet = (
  <svg viewBox="0 0 170 290" className="wa-dangle">
    {/* Control bar and strings. */}
    <path d="M25 6 H145 M85 0 V14" stroke="#6e5a3a" strokeWidth="4" strokeLinecap="round" />
    <path d="M30 6 V78 M85 6 V44 M140 6 V78 M58 6 V156 M112 6 V156" stroke="#cfd6e4" strokeOpacity="0.5" strokeWidth="1" />
    {/* A jester-like marionette: painted face, ruff, diamond tunic, jointed limbs. */}
    <circle cx="85" cy="64" r="19" fill="#ece0cc" stroke="#8a7a68" strokeWidth="1" />
    <path d="M76 61 h5 M89 61 h5" stroke="#1a1418" strokeWidth="2" strokeLinecap="round" />
    <path d="M76 72 q9 6 18 0" stroke="#a3102a" strokeWidth="2" fill="none" />
    <circle cx="74" cy="68" r="3" fill="#e8a0a8" opacity="0.6" />
    <circle cx="96" cy="68" r="3" fill="#e8a0a8" opacity="0.6" />
    <path d="M64 48 L72 26 L85 44 L98 26 L106 48 Z" fill="#3a1a24" stroke="#c9a86a" strokeWidth="1" />
    <circle cx="72" cy="26" r="3" fill="#c9a86a" />
    <circle cx="98" cy="26" r="3" fill="#c9a86a" />
    {Array.from({ length: 9 }, (_, k) => (
      <ellipse key={k} cx={68 + k * 4.2} cy="86" rx="4" ry="3" fill="#f3ede2" stroke="#b0a898" strokeWidth="0.6" />
    ))}
    <path d="M68 88 H102 L108 158 H62 Z" fill="#3a1a24" stroke="#c9a86a" strokeWidth="1.5" />
    {[
      [85, 100],
      [76, 120],
      [94, 120],
      [85, 140],
    ].map(([x, y], k) => (
      <path key={k} d={`M${x} ${y - 8} L${x + 7} ${y} L${x} ${y + 8} L${x - 7} ${y} Z`} fill={k % 2 ? "#5a2a3a" : "#7a2a3a"} stroke="#c9a86a" strokeWidth="0.6" />
    ))}
    <path d="M68 94 L46 82 L30 78 M102 94 L124 82 L140 78" stroke="#ece0cc" strokeWidth="6" strokeLinecap="round" />
    <circle cx="46" cy="82" r="3.5" fill="#8a7a68" />
    <circle cx="124" cy="82" r="3.5" fill="#8a7a68" />
    <path d="M74 158 L64 200 L58 236 M96 158 L106 200 L112 236" stroke="#1a1418" strokeWidth="9" strokeLinecap="round" />
    <circle cx="64" cy="200" r="4" fill="#8a7a68" />
    <circle cx="106" cy="200" r="4" fill="#8a7a68" />
    <path d="M50 238 q8 -6 16 0 M104 238 q8 -6 16 0" stroke="#3a1a24" strokeWidth="5" strokeLinecap="round" fill="none" />
  </svg>
);

const Ritual = (
  <svg viewBox="0 0 320 180">
    <ellipse cx="160" cy="100" rx="140" ry="48" fill="rgb(164 107 255 / 0.08)" stroke="#c4b5fd" strokeOpacity="0.55" strokeWidth="2" />
    <ellipse cx="160" cy="100" rx="128" ry="43" fill="none" stroke="#c4b5fd" strokeOpacity="0.3" strokeWidth="1" />
    <g className="wa-spin-slow" style={{ transformOrigin: "160px 100px" }}>
      <ellipse cx="160" cy="100" rx="104" ry="35" fill="none" stroke="#a46bff" strokeOpacity="0.65" strokeWidth="1.5" strokeDasharray="6 10" />
      {Array.from({ length: 8 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        const x = 160 + Math.cos(a) * 116;
        const y = 100 + Math.sin(a) * 39;
        return <path key={k} d={`M${x - 4} ${y - 3} L${x + 4} ${y - 3} L${x} ${y + 4} Z M${x} ${y - 6} V${y + 6}`} stroke="#c4b5fd" strokeWidth="1" fill="none" />;
      })}
    </g>
    {/* A star chalked onto the floor, with a sigil at its heart. */}
    <path d="M160 66 L188 124 L124 86 H196 L132 124 Z" fill="none" stroke="#a46bff" strokeOpacity="0.75" strokeWidth="1.6" />
    <circle cx="160" cy="100" r="9" fill="none" stroke="#e0263f" strokeOpacity="0.8" strokeWidth="1.5" className="wa-runeglow" />
    {/* Candles with drips, wax pools and flickering flames. */}
    {Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2;
      const x = 160 + Math.cos(a) * 140;
      const y = 100 + Math.sin(a) * 48;
      const h = 14 + (k % 3) * 6;
      return (
        <g key={k}>
          <ellipse cx={x} cy={y + 1} rx="7" ry="2.5" fill="#d8cdb6" />
          <rect x={x - 4} y={y - h} width="8" height={h} rx="2" fill="#efe6d2" stroke="#c8bba0" strokeWidth="0.8" />
          <path d={`M${x - 4} ${y - h + 4} q2 4 0 7`} stroke="#d8cdb6" strokeWidth="2" fill="none" />
          <path d={`M${x} ${y - h} V${y - h - 3}`} stroke="#2a2226" strokeWidth="1" />
          <ellipse cx={x} cy={y - h - 7} rx="3.2" ry="6" fill="#ffd27a" className="wa-flame" style={{ animationDelay: `${-k * 0.3}s` }} />
          <ellipse cx={x} cy={y - h - 6} rx="1.4" ry="3" fill="#fff4c2" />
        </g>
      );
    })}
  </svg>
);

const gear = (cx: number, cy: number, r: number, teeth: number, cls: string) => {
  const points: string[] = [];
  for (let k = 0; k < teeth * 2; k++) {
    const a = (k / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 === 0 ? r : r * 0.84;
    points.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  const spokes = Math.max(4, Math.round(teeth / 3));
  return (
    <g className={cls} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <polygon points={points.join(" ")} fill="#8a6a36" stroke="#5a4422" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.7} fill="#6e5428" stroke="#5a4422" strokeWidth="1.5" />
      {Array.from({ length: spokes }, (_, k) => {
        const a = (k / spokes) * Math.PI * 2;
        return <path key={k} d={`M${cx} ${cy} L${cx + Math.cos(a) * r * 0.66} ${cy + Math.sin(a) * r * 0.66}`} stroke="#a8844a" strokeWidth={r * 0.14} strokeLinecap="round" />;
      })}
      <circle cx={cx} cy={cy} r={r * 0.24} fill="#2a2016" stroke="#c9a86a" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.08} fill="#c9a86a" />
      <path d={`M${cx - r * 0.5} ${cy - r * 0.6} A${r * 0.78} ${r * 0.78} 0 0 1 ${cx + r * 0.4} ${cy - r * 0.68}`} stroke="#e8c27a" strokeOpacity="0.5" strokeWidth="2" fill="none" />
    </g>
  );
};
const Clockwork = (
  <svg viewBox="0 0 230 210">
    {gear(82, 96, 62, 15, "wa-gear")}
    {gear(172, 62, 34, 9, "wa-gear-rev")}
    {gear(166, 156, 27, 8, "wa-gear-rev")}
    <path d="M196 30 q16 8 10 24 q-6 14 6 22" stroke="#b08a48" strokeWidth="2" fill="none" />
  </svg>
);

// ---- The Drowned Sea (2,100–4,200 m) -------------------------------------------------------------------------

const Lighthouse = (
  <svg viewBox="0 0 270 360" overflow="visible">
    <path d="M115 76 L-260 0 L-260 170 Z" className="wa-beam" style={{ transformOrigin: "115px 76px" }} />
    {/* Tower with crimson bands, small windows, a door and a barnacled base. */}
    <path d="M88 360 L98 108 H132 L142 360 Z" fill="#1c2a2e" stroke="#2f4549" strokeWidth="2" />
    {[150, 210, 270, 330].map((y) => {
      const w = 18 + ((y - 108) / 252) * 9;
      return <path key={y} d={`M${115 - w} ${y} H${115 + w} L${115 + w + 1} ${y + 22} H${115 - w - 1} Z`} fill="#4a1a22" />;
    })}
    {[180, 240, 300].map((y) => (
      <rect key={y} x="110" y={y} width="10" height="14" rx="5" fill="#0a1214" stroke="#2f4549" strokeWidth="1" />
    ))}
    <path d="M104 360 V336 Q115 326 126 336 V360 Z" fill="#0a1214" stroke="#2f4549" strokeWidth="1.5" />
    {Array.from({ length: 10 }, (_, k) => (
      <path key={k} d={`M${86 + k * 6} 356 l2 -6 l2 6 Z`} fill="#5a6a64" />
    ))}
    {/* Gallery with railing, lens room and domed cap. */}
    <rect x="88" y="104" width="54" height="6" fill="#2f4549" />
    {[90, 98, 106, 114, 122, 130, 138].map((x) => (
      <path key={x} d={`M${x} 104 V94`} stroke="#3f5a5e" strokeWidth="1.5" />
    ))}
    <path d="M88 94 H142" stroke="#3f5a5e" strokeWidth="2" />
    <rect x="98" y="66" width="34" height="38" fill="#0a1214" stroke="#2f4549" strokeWidth="2" />
    <path d="M109 66 V104 M121 66 V104" stroke="#2f4549" strokeWidth="1.5" />
    <circle cx="115" cy="84" r="10" fill="#05080a" stroke="#4fd1c5" strokeWidth="1.5" />
    <circle cx="115" cy="84" r="5" fill="#000" stroke="#4fd1c5" strokeOpacity="0.5" />
    <path d="M94 66 Q115 40 136 66 Z" fill="#1c2a2e" stroke="#2f4549" strokeWidth="2" />
    <path d="M115 44 V34" stroke="#3f5a5e" strokeWidth="2" />
    <circle cx="115" cy="32" r="3" fill="#3f5a5e" />
  </svg>
);

const Galleon = (
  <svg viewBox="0 0 340 280" className="wa-list">
    <defs>
      <pattern id="wa-planks" width="40" height="8" patternUnits="userSpaceOnUse">
        <rect width="40" height="8" fill="#1f1c18" />
        <path d="M0 7.5 H40 M14 0 V8" stroke="#100e0c" strokeWidth="1" />
      </pattern>
    </defs>
    {/* Hull with planking, stern castle, gun ports and a figurehead. */}
    <path d="M28 176 Q170 246 312 176 L292 220 Q170 262 48 220 Z" fill="url(#wa-planks)" stroke="#3b3326" strokeWidth="2" />
    <path d="M260 150 H312 V180 L300 200 H260 Z" fill="url(#wa-planks)" stroke="#3b3326" strokeWidth="2" />
    {sash(270, 158, 10, 10, false)}
    {sash(288, 158, 10, 10, false)}
    <path d="M38 178 H302" stroke="#5a4a32" strokeWidth="3" />
    {[70, 104, 138, 172, 206, 240].map((x) => (
      <rect key={x} x={x} y="190" width="10" height="8" fill="#0a0a0a" stroke="#5a4a32" strokeWidth="1" />
    ))}
    <path d="M28 176 L6 164 Q2 170 10 174 Q14 168 28 176" fill="#5a4a32" />
    <circle cx="10" cy="168" r="4" fill="#6a5a42" />
    {/* Masts, yards, tattered sails, rigging and a crow's nest. */}
    {[
      [120, 30],
      [180, 10],
      [240, 46],
    ].map(([x, top]) => (
      <g key={x}>
        <path d={`M${x} 178 V${top}`} stroke="#2e281e" strokeWidth="5" />
        <path d={`M${x - 34} ${top + 26} H${x + 34} M${x - 28} ${top + 76} H${x + 28}`} stroke="#2e281e" strokeWidth="3" />
        <path d={`M${x - 32} ${top + 28} Q${x} ${top + 44} ${x + 32} ${top + 28} L${x + 28} ${top + 74} Q${x + 10} ${top + 66} ${x + 4} ${top + 78} L${x - 6} ${top + 66} Q${x - 18} ${top + 76} ${x - 28} ${top + 74} Z`} fill="#a9a493" opacity="0.4" />
        <path d={`M${x} ${top} L${x - 40} 176 M${x} ${top} L${x + 40} 176`} stroke="#2e281e" strokeWidth="0.8" opacity="0.7" />
      </g>
    ))}
    <path d="M168 22 H192 V30 H168 Z" fill="#2e281e" />
    <path d="M180 10 V0 l14 4 l-14 4" fill="#4a1a22" />
    {[80, 120, 160, 200, 240].map((x) => (
      <circle key={x} cx={x} cy="210" r="4.5" fill="#4fd1c5" opacity="0.5" className="wa-window" />
    ))}
  </svg>
);

const jelly = (x: number, y: number, s: number, k: number) => (
  <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
    <g className="wa-jelly" style={{ animationDelay: `${-k * 0.9}s` }}>
      <circle cx="0" cy="-14" r="24" fill="#3fd0b8" opacity="0.14" />
      <path d="M-26 0 Q-26 -32 0 -32 Q26 -32 26 0 Q20 5 13 1 Q7 6 0 1 Q-7 6 -13 1 Q-20 5 -26 0 Z" fill="#3fd0b8" opacity="0.5" stroke="#9ff8ea" strokeOpacity="0.6" />
      <path d="M-18 -4 Q-14 -22 0 -24 Q14 -22 18 -4" fill="none" stroke="#c8fff6" strokeOpacity="0.5" strokeWidth="1.2" />
      {[-10, 0, 10].map((cx) => (
        <circle key={cx} cx={cx} cy="-12" r="3.4" fill="#9ff8ea" opacity="0.5" />
      ))}
      <path d="M-8 2 q-2 12 2 20 q-3 8 0 16 M8 2 q2 12 -2 20 q3 8 0 16" stroke="#9ff8ea" strokeOpacity="0.5" strokeWidth="3" fill="none" />
      <path d="M-18 2 q4 20 -2 40 M-6 4 q-4 24 2 50 M4 4 q5 22 -1 46 M16 2 q-3 18 3 36" stroke="#7ff3e0" strokeOpacity="0.55" strokeWidth="1.2" fill="none" />
    </g>
  </g>
);
const Jellies = (
  <svg viewBox="0 0 300 230">
    {jelly(60, 70, 1, 0)}
    {jelly(150, 40, 0.7, 1)}
    {jelly(232, 110, 1.2, 2)}
    {jelly(110, 156, 0.6, 3)}
  </svg>
);

const Tentacle = (
  <svg viewBox="0 0 270 330" className="wa-curl">
    <path d="M40 330 C40 230 140 240 150 160 C160 80 80 70 90 40 C96 18 122 22 120 42" fill="none" stroke="#3a2030" strokeWidth="36" strokeLinecap="round" />
    <path d="M40 330 C40 230 140 240 150 160 C160 80 80 70 90 40" fill="none" stroke="#5a2e44" strokeWidth="20" strokeLinecap="round" />
    <path d="M52 330 C52 240 152 250 162 160 C170 90 96 78 100 46" fill="none" stroke="#7a4058" strokeWidth="2" strokeOpacity="0.6" />
    {/* Suckers along the inner edge. */}
    {Array.from({ length: 12 }, (_, k) => {
      const t = k / 12;
      const x = 34 + Math.sin(t * Math.PI * 1.6) * 60 + t * 40;
      const y = 316 - t * 270;
      const r = 7 - t * 4;
      return (
        <g key={k}>
          <circle cx={x} cy={y} r={r} fill="#c88aa0" stroke="#7a4058" strokeWidth="1" />
          <circle cx={x} cy={y} r={r * 0.45} fill="#7a4058" />
        </g>
      );
    })}
  </svg>
);

const Eye = (
  <svg viewBox="0 0 600 300">
    <defs>
      <radialGradient id="wa-iris">
        <stop offset="0%" stopColor="#c9f7ee" />
        <stop offset="45%" stopColor="#2fb5a0" />
        <stop offset="100%" stopColor="#0a3a33" />
      </radialGradient>
    </defs>
    <ellipse cx="300" cy="150" rx="290" ry="130" fill="#040b0a" />
    {/* Scaled lids around the eye. */}
    {Array.from({ length: 18 }, (_, k) => (
      <path key={k} d={`M${40 + k * 30} ${150 - Math.sin((k / 17) * Math.PI) * 108} q15 -10 30 0`} stroke="#0f2420" strokeWidth="3" fill="none" />
    ))}
    <g className="wa-blink" style={{ transformOrigin: "300px 150px" }}>
      <path d="M40 150 Q300 -10 560 150 Q300 310 40 150 Z" fill="#183c36" />
      {["M60 150 q60 -10 110 -4 q20 2 40 -8", "M540 150 q-60 12 -110 4 q-20 -4 -40 8", "M80 170 q50 10 100 0", "M520 130 q-50 -10 -100 0"].map((d) => (
        <path key={d} d={d} stroke="#7a2a3a" strokeOpacity="0.6" strokeWidth="2" fill="none" />
      ))}
      <circle cx="300" cy="150" r="88" fill="url(#wa-iris)" />
      {Array.from({ length: 24 }, (_, k) => {
        const a = (k / 24) * Math.PI * 2;
        return <path key={k} d={`M${300 + Math.cos(a) * 20} ${150 + Math.sin(a) * 20} L${300 + Math.cos(a) * 82} ${150 + Math.sin(a) * 82}`} stroke="#0a3a33" strokeOpacity="0.5" strokeWidth="2" />;
      })}
      <circle cx="300" cy="150" r="88" fill="none" stroke="#062a24" strokeWidth="6" />
      <ellipse cx="300" cy="150" rx="15" ry="74" fill="#020504" />
      <ellipse cx="266" cy="114" rx="14" ry="9" fill="#fff" opacity="0.3" />
      <circle cx="330" cy="186" r="5" fill="#fff" opacity="0.18" />
    </g>
  </svg>
);

const Anchor = (
  <svg viewBox="0 0 170 330">
    {Array.from({ length: 9 }, (_, k) => (
      <g key={k}>
        <ellipse cx="85" cy={k * 18 + 6} rx="7" ry="11" fill="none" stroke="#4a5a5c" strokeWidth="4.5" transform={k % 2 ? `rotate(90 85 ${k * 18 + 6})` : undefined} />
        <ellipse cx="83" cy={k * 18 + 3} rx="2" ry="3" fill="#6a7a7c" opacity="0.6" />
      </g>
    ))}
    <circle cx="85" cy="176" r="12" fill="none" stroke="#5a6a6c" strokeWidth="6" />
    <path d="M85 188 V306 M52 214 H118 M32 274 Q85 336 138 274 M32 274 L22 254 L40 262 M138 274 L148 254 L130 262" fill="none" stroke="#5a6a6c" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M85 192 V300" stroke="#7a8a8c" strokeWidth="2" strokeOpacity="0.6" />
    {/* Rust, barnacles and a starfish clinging on. */}
    {[
      [70, 290],
      [104, 296],
      [90, 240],
      [48, 214],
    ].map(([x, y], k) => (
      <circle key={k} cx={x} cy={y} r="4" fill="#8a5a3a" opacity="0.7" />
    ))}
    {[
      [60, 284],
      [112, 290],
      [95, 226],
    ].map(([x, y], k) => (
      <path key={`b${k}`} d={`M${x - 4} ${y + 3} L${x} ${y - 4} L${x + 4} ${y + 3} Z`} fill="#c8c0b0" stroke="#7a7466" strokeWidth="0.8" />
    ))}
    <g transform="translate(118 216) rotate(20)">
      {Array.from({ length: 5 }, (_, k) => (
        <ellipse key={k} cy="-6" rx="2.6" ry="7" fill="#e07a4a" transform={`rotate(${k * 72})`} />
      ))}
      <circle r="3" fill="#c85a2a" />
    </g>
  </svg>
);

// ---- The Fallen Kingdom (4,200–6,200 m) ----------------------------------------------------------------------

const StoneHead = (
  <svg viewBox="0 0 300 330">
    <defs>
      <linearGradient id="wa-stonehead" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#1f1a1c" />
        <stop offset="45%" stopColor="#3a3234" />
        <stop offset="100%" stopColor="#1a1517" />
      </linearGradient>
    </defs>
    <path d="M60 310 Q30 150 80 82 Q150 12 220 82 Q270 150 240 310 Z" fill="url(#wa-stonehead)" stroke="#4a3f40" strokeWidth="2" />
    {/* A jewelled crown. */}
    <path d="M70 92 L100 30 L128 72 L150 18 L172 72 L200 30 L230 92 Z" fill="#6b5530" stroke="#c9a86a" strokeWidth="2" />
    <path d="M70 92 H230" stroke="#c9a86a" strokeWidth="4" />
    {(
      [
        [100, 44, "#e0263f"],
        [150, 34, "#4fd1c5"],
        [200, 44, "#e0263f"],
        [150, 82, "#a46bff"],
      ] as const
    ).map(([x, y, color], k) => (
      <circle key={k} cx={x} cy={y} r="5" fill={color} stroke="#3a2a14" strokeWidth="1" />
    ))}
    {/* Closed eyes with lashes, brows, nose, lips. */}
    <path d="M94 142 Q120 128 146 140 M154 140 Q180 128 206 142" stroke="#14100f" strokeWidth="4" fill="none" />
    <path d="M100 156 Q120 146 140 156 M160 156 Q180 146 200 156" stroke="#14100f" strokeWidth="5" fill="none" />
    <path d="M102 158 l-4 4 M112 160 l-2 5 M122 160 v5 M178 160 v5 M188 160 l2 5 M198 158 l4 4" stroke="#14100f" strokeWidth="1.5" />
    <path d="M150 164 V214 Q142 222 136 218 M150 214 Q158 222 164 218" stroke="#1d1718" strokeWidth="3.5" fill="none" />
    <path d="M118 248 Q150 236 182 248 Q150 264 118 248 Z" fill="#241d1f" stroke="#14100f" strokeWidth="2" />
    {/* Cracks, moss and a crimson tear. */}
    <path d="M230 100 L192 170 L212 222 L182 310 M200 190 L224 200" stroke="#0e0b0b" strokeWidth="3" fill="none" />
    <path d="M70 200 L96 230 L86 264" stroke="#0e0b0b" strokeWidth="2" fill="none" />
    {[
      [72, 280, 18],
      [226, 270, 14],
      [100, 104, 10],
    ].map(([x, y, r], k) => (
      <g key={k} opacity="0.75">
        <ellipse cx={x} cy={y} rx={r} ry={r * 0.5} fill="#2e4a2a" />
        <ellipse cx={x - r * 0.3} cy={y - 2} rx={r * 0.5} ry={r * 0.25} fill="#4a6a3a" />
      </g>
    ))}
    <path d="M104 160 q-2 18 2 34" stroke="#e0263f" strokeOpacity="0.6" strokeWidth="3" fill="none" className="wa-tear" />
  </svg>
);

const Colonnade = (
  <svg viewBox="0 0 800 270" preserveAspectRatio="xMidYMid meet">
    {/* Pediment with a roundel, a dentilled entablature and fluted columns, one of them broken. */}
    <path d="M300 64 L400 10 L500 64 Z" fill="#2a2224" stroke="#3a2f31" strokeWidth="2" />
    <circle cx="400" cy="44" r="10" fill="none" stroke="#4a3f40" strokeWidth="2" />
    <path d="M40 64 H760 V86 H40 Z" fill="#2a2224" stroke="#3a2f31" strokeWidth="1.5" />
    {Array.from({ length: 36 }, (_, k) => (
      <rect key={k} x={44 + k * 20} y="70" width="10" height="8" fill="#241d1f" />
    ))}
    {[60, 160, 260, 360, 460, 560, 660].map((x, k) => {
      const broken = k === 2;
      const top = broken ? 136 : 86;
      return (
        <g key={x}>
          <rect x={x} y={top} width="40" height={270 - top} fill="#241d1f" />
          {[8, 16, 24, 32].map((f) => (
            <path key={f} d={`M${x + f} ${top + 10} V262`} stroke="#1a1416" strokeWidth="2" />
          ))}
          <rect x={x - 6} y={top} width="52" height="12" fill="#2e2527" stroke="#3a2f31" strokeWidth="1" />
          <path d={`M${x - 6} ${top + 12} q6 8 0 12 M${x + 46} ${top + 12} q-6 8 0 12`} stroke="#3a2f31" strokeWidth="2" fill="none" />
          {broken ? <path d={`M${x} ${top} L${x + 12} ${top - 14} L${x + 24} ${top - 4} L${x + 40} ${top - 18} V${top}`} fill="#241d1f" /> : null}
        </g>
      );
    })}
    <path d="M230 250 l40 -14 l26 10 l-12 14 Z M300 262 l18 -8 l10 8 Z" fill="#2e2527" />
  </svg>
);

const Hand = (
  <svg viewBox="0 0 270 310">
    <defs>
      <radialGradient id="wa-orbcore">
        <stop offset="0%" stopColor="#fff4c2" />
        <stop offset="60%" stopColor="#f2c14e" />
        <stop offset="100%" stopColor="#b8761e" />
      </radialGradient>
    </defs>
    <circle cx="135" cy="80" r="50" className="wa-orb" />
    <circle cx="135" cy="80" r="27" fill="url(#wa-orbcore)" opacity="0.8" />
    <path d="M118 66 q10 -8 22 -4" stroke="#fff" strokeOpacity="0.6" strokeWidth="3" fill="none" />
    {/* A stone hand with knuckle creases, nails, cracks and moss. */}
    <path
      d="M44 310 L64 176 Q54 134 74 124 L84 154 L88 94 Q94 78 106 84 L108 144 L114 74 Q122 62 132 70 L132 144 L144 78 Q154 66 162 76 L158 150 L174 104 Q186 94 192 106 L180 184 Q204 164 218 174 Q194 214 174 234 L194 310 Z"
      fill="#2e2729"
      stroke="#4a3f40"
      strokeWidth="2"
    />
    {[
      [96, 110],
      [120, 100],
      [146, 104],
      [176, 128],
    ].map(([x, y], k) => (
      <path key={k} d={`M${x - 6} ${y} q6 3 12 0`} stroke="#1d1718" strokeWidth="1.5" fill="none" />
    ))}
    {[
      [93, 88],
      [120, 74],
      [151, 80],
      [184, 108],
    ].map(([x, y], k) => (
      <path key={`n${k}`} d={`M${x - 5} ${y} q5 -4 10 0`} stroke="#4a3f40" strokeWidth="1.5" fill="none" />
    ))}
    <path d="M114 210 L124 250 L108 290 M150 200 l12 18" stroke="#140f10" strokeWidth="3" fill="none" />
    <ellipse cx="72" cy="290" rx="16" ry="6" fill="#2e4a2a" opacity="0.7" />
  </svg>
);

const Sealed = (
  <svg viewBox="0 0 290 310" className="wa-strain">
    {["M0 40 L114 124", "M290 30 L176 124", "M0 270 L114 196", "M290 290 L176 196"].map((d) => (
      <g key={d}>
        <path d={d} stroke="#3a3436" strokeWidth="9" strokeDasharray="12 5" />
        <path d={d} stroke="#6a6264" strokeWidth="3" strokeDasharray="12 5" />
      </g>
    ))}
    {/* An iron-bound reliquary with padlocks, sigils and a pulsing seal. */}
    <rect x="98" y="98" width="94" height="116" rx="6" fill="#1a1012" stroke="#c9a86a" strokeWidth="3" />
    <path d="M98 122 H192 M98 190 H192 M122 98 V214 M168 98 V214" stroke="#6b5530" strokeWidth="4" />
    {[
      [98, 98],
      [192, 98],
      [98, 214],
      [192, 214],
    ].map(([x, y]) => (
      <circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="#c9a86a" stroke="#6b5530" />
    ))}
    <circle cx="145" cy="156" r="26" fill="#120709" stroke="#e0263f" strokeWidth="2.5" className="wa-runeglow" />
    <path d="M145 132 L166 168 H124 Z M145 180 L124 144 H166 Z" fill="none" stroke="#e0263f" strokeWidth="1.6" className="wa-runeglow" />
    <circle cx="145" cy="156" r="5" fill="#e0263f" />
    {[84, 206].map((x) => (
      <g key={x}>
        <path d={`M${x - 6} 132 V124 Q${x} 116 ${x + 6} 124 V132`} fill="none" stroke="#8a8284" strokeWidth="2.5" />
        <rect x={x - 9} y="132" width="18" height="14" rx="2" fill="#5a5254" stroke="#8a8284" />
        <circle cx={x} cy="138" r="2" fill="#1a1012" />
      </g>
    ))}
  </svg>
);

const Runes = (
  <svg viewBox="0 0 230 230">
    <circle cx="115" cy="115" r="108" fill="rgb(224 38 63 / 0.06)" />
    <g className="wa-spin-slow" style={{ transformOrigin: "115px 115px" }}>
      <circle cx="115" cy="115" r="100" fill="none" stroke="#e0263f" strokeOpacity="0.6" strokeWidth="2" />
      <circle cx="115" cy="115" r="92" fill="none" stroke="#e0263f" strokeOpacity="0.35" strokeWidth="1" />
      {Array.from({ length: 18 }, (_, k) => {
        const a = (k / 18) * Math.PI * 2;
        const x = 115 + Math.cos(a) * 82;
        const y = 115 + Math.sin(a) * 82;
        const shapes = [`M${x - 5} ${y - 6} L${x + 5} ${y} L${x - 4} ${y + 6}`, `M${x} ${y - 7} V${y + 7} M${x - 5} ${y - 3} H${x + 5}`, `M${x - 5} ${y + 5} L${x} ${y - 6} L${x + 5} ${y + 5} M${x - 3} ${y + 1} H${x + 3}`];
        return <path key={k} d={shapes[k % 3]} stroke="#ff6b7d" strokeWidth="2" fill="none" strokeLinecap="round" />;
      })}
    </g>
    <g className="wa-spin-rev" style={{ transformOrigin: "115px 115px" }}>
      <circle cx="115" cy="115" r="62" fill="none" stroke="#f2c14e" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 8" />
      <path d="M115 60 L163 145 H67 Z M115 170 L67 85 H163 Z" fill="none" stroke="#f2c14e" strokeOpacity="0.6" strokeWidth="1.5" />
      <circle cx="115" cy="115" r="22" fill="none" stroke="#f2c14e" strokeOpacity="0.6" strokeWidth="1.5" />
    </g>
    <circle cx="115" cy="115" r="6" fill="#e0263f" className="wa-runeglow" />
  </svg>
);

// ---- The Nameless Floor (6,200–7,000 m) ----------------------------------------------------------------------

const Door = (
  <svg viewBox="0 0 400 440">
    <defs>
      <linearGradient id="wa-doorwood" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#1a0c0f" />
        <stop offset="50%" stopColor="#241014" />
        <stop offset="100%" stopColor="#14080b" />
      </linearGradient>
    </defs>
    {/* A stone arch of voussoirs around two carved, riveted doors. */}
    <path d="M36 440 V150 Q36 6 200 0 Q364 6 364 150 V440 H340 V152 Q340 30 200 24 Q60 30 60 152 V440 Z" fill="#241416" stroke="#5a2a30" strokeWidth="2" />
    {Array.from({ length: 15 }, (_, k) => {
      const a = Math.PI + (k / 14) * Math.PI;
      return <path key={k} d={`M${200 + Math.cos(a) * 140} ${152 + Math.sin(a) * 128} L${200 + Math.cos(a) * 164} ${152 + Math.sin(a) * 150}`} stroke="#5a2a30" strokeWidth="2" />;
    })}
    <path d="M60 440 V152 Q60 30 200 24 Q340 30 340 152 V440 Z" fill="url(#wa-doorwood)" stroke="#5a2a30" strokeWidth="5" />
    <path d="M200 26 V440" stroke="#5a2a30" strokeWidth="4" />
    <path d="M196 30 V440 H204 V30 Z" className="wa-leak" />
    {[
      [84, 170],
      [214, 170],
      [84, 320],
      [214, 320],
    ].map(([x, y]) => (
      <g key={`${x}-${y}`}>
        <rect x={x} y={y} width="102" height="110" rx="6" fill="none" stroke="#4a1e24" strokeWidth="3" />
        <rect x={x + 10} y={y + 10} width="82" height="90" rx="4" fill="none" stroke="#3a161b" strokeWidth="1.5" />
      </g>
    ))}
    {Array.from({ length: 20 }, (_, k) => (
      <circle key={k} cx={k < 10 ? 72 : 328} cy={170 + (k % 10) * 28} r="3" fill="#6b4a3a" stroke="#2a1014" strokeWidth="0.8" />
    ))}
    {/* The eye at the heart of the door. */}
    <path d="M110 210 Q200 140 290 210 Q200 280 110 210 Z" fill="#2a0c12" stroke="#c9a86a" strokeWidth="3" />
    <path d="M118 210 Q200 152 282 210" fill="none" stroke="#c9a86a" strokeOpacity="0.4" strokeWidth="1.5" />
    <circle cx="200" cy="210" r="26" fill="#e0263f" className="wa-runeglow" />
    <circle cx="200" cy="210" r="16" fill="#a3102a" />
    <ellipse cx="200" cy="210" rx="5" ry="14" fill="#14070a" />
    {Array.from({ length: 12 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      return <path key={k} d={`M${200 + Math.cos(a) * 40} ${210 + Math.sin(a) * 34} L${200 + Math.cos(a) * 52} ${210 + Math.sin(a) * 44}`} stroke="#c9a86a" strokeOpacity="0.6" strokeWidth="2" />;
    })}
    {/* Chains crossing it, held by a heavy lock. */}
    {[
      [60, 120, 340, 320],
      [340, 120, 60, 320],
    ].map(([x1, y1, x2, y2], k) => (
      <g key={k} className="wa-strain">
        <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#3a3436" strokeWidth="12" strokeDasharray="16 6" />
        <path d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#7a7274" strokeWidth="4" strokeDasharray="16 6" />
      </g>
    ))}
    <rect x="184" y="290" width="32" height="26" rx="4" fill="#5a5254" stroke="#8a8284" strokeWidth="2" />
    <path d="M190 290 V280 Q200 268 210 280 V290" fill="none" stroke="#8a8284" strokeWidth="4" />
    <circle cx="200" cy="302" r="3" fill="#14070a" />
  </svg>
);

const Floor = (
  <svg viewBox="0 0 800 170" preserveAspectRatio="none">
    <path d="M0 60 Q100 30 200 54 T400 50 T600 58 T800 44 V170 H0 Z" fill="#0b0405" />
    <path d="M0 60 Q100 30 200 54 T400 50 T600 58 T800 44" fill="none" stroke="#5a1520" strokeWidth="2" />
    {["M120 50 l20 30 l-10 20 l24 30", "M380 52 l-14 26 l18 24", "M620 56 l12 22 l-8 30"].map((d) => (
      <path key={d} d={d} stroke="#e0263f" strokeWidth="2" fill="none" className="wa-crack" />
    ))}
    {Array.from({ length: 14 }, (_, k) => (
      <path key={k} d={`M${40 + k * 56} ${70 + (k % 3) * 8} l6 -6 l6 6 Z`} fill="#1a0a0c" />
    ))}
  </svg>
);

/** Where each piece of scenery sits on the way down. */
export const SCENERY: Scene[] = [
  // The Gaslit City
  { m: 40, side: "c", width: 100, layer: "far", art: Skyline },
  { m: 150, side: "r", width: 22, layer: "near", art: ClockTower, inset: 4 },
  { m: 260, side: "l", width: 12, layer: "near", art: GasLamp, inset: 8 },
  { m: 380, side: "l", width: 30, layer: "near", art: Cab, inset: 3 },
  { m: 560, side: "c", width: 100, layer: "far", art: Viaduct },
  { m: 700, side: "r", width: 30, layer: "near", art: Cathedral, inset: 3 },
  // The Spirit Tide
  { m: 880, side: "c", width: 100, layer: "far", art: Aurora },
  { m: 1050, side: "l", width: 42, layer: "near", art: Tarot, inset: 2 },
  { m: 1300, side: "r", width: 22, layer: "near", art: Mirror, inset: 6 },
  { m: 1450, side: "c", width: 100, layer: "far", art: Aurora },
  { m: 1550, side: "l", width: 22, layer: "near", art: Puppet, inset: 8 },
  { m: 1800, side: "r", width: 40, layer: "near", art: Ritual, inset: 2 },
  { m: 2000, side: "l", width: 30, layer: "near", art: Clockwork, inset: 4 },
  // The Drowned Sea
  { m: 2300, side: "r", width: 30, layer: "near", art: Lighthouse, inset: 4, bleed: true },
  { m: 2650, side: "l", width: 40, layer: "near", art: Galleon, inset: 2 },
  { m: 3000, side: "r", width: 36, layer: "near", art: Jellies, inset: 2 },
  { m: 3150, side: "l", width: 30, layer: "near", art: Jellies, inset: 6 },
  { m: 3350, side: "l", width: 30, layer: "near", art: Tentacle, inset: 0 },
  { m: 3800, side: "c", width: 90, layer: "far", art: Eye },
  { m: 4050, side: "r", width: 18, layer: "near", art: Anchor, inset: 10 },
  // The Fallen Kingdom
  { m: 4450, side: "l", width: 36, layer: "near", art: StoneHead, inset: 2 },
  { m: 4750, side: "c", width: 100, layer: "far", art: Colonnade },
  { m: 5000, side: "r", width: 30, layer: "near", art: Hand, inset: 4 },
  { m: 5400, side: "l", width: 34, layer: "near", art: Sealed, inset: 3 },
  { m: 5800, side: "r", width: 30, layer: "near", art: Runes, inset: 4 },
  // The Nameless Floor
  { m: 6550, side: "c", width: 60, layer: "near", art: Door },
  { m: 7060, side: "c", width: 100, layer: "near", art: Floor },
];

/** The light of each zone, washed over the water behind the scenery. */
export const ZONE_LIGHT: { from: number; to: number; color: string }[] = [
  { from: 0, to: 800, color: "rgb(232 166 74 / 0.18)" },
  { from: 800, to: 2100, color: "rgb(150 110 255 / 0.2)" },
  { from: 2100, to: 4200, color: "rgb(47 181 160 / 0.16)" },
  { from: 4200, to: 6200, color: "rgb(242 193 78 / 0.12)" },
  { from: 6200, to: 7200, color: "rgb(224 38 63 / 0.22)" },
];

// ---- Zone walls ------------------------------------------------------------------------------------------------
// Each zone frames the shaft with its own continuous silhouette on both sides, so the scenery stands inside a place
// instead of floating in empty water. Built procedurally from a fixed seed, so the walls never change between visits.

export type WallKind = "city" | "spirit" | "sea" | "kingdom" | "floor";
export const WALL_KINDS: WallKind[] = ["city", "spirit", "sea", "kingdom", "floor"];

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

/** One side of one zone's wall, `height` px tall, drawn at true scale (the right side is mirrored in CSS). */
export function Wall({ kind, height, side }: { kind: WallKind; height: number; side: "l" | "r" }) {
  const r = seeded(`${kind}:${side}`);
  const parts: ReactNode[] = [];
  let k = 0;

  if (kind === "city") {
    // Tenement façades: brick, string courses, sash windows, drainpipes, balconies, shop signs and chimney pots.
    const tex = `wl-${side}`;
    parts.push(<g key="tex">{textures(tex, "#1f1a1d", "#141114")}</g>);
    let y = 0;
    while (y < height) {
      const h = 80 + r(k) * 110;
      const reach = 40 + r(k + 1) * 46;
      parts.push(<rect key={`b${k}`} x="0" y={y} width={reach} height={h} fill={`url(#${tex}-brick)`} />);
      parts.push(<rect key={`c${k}`} x="0" y={y} width={reach + 6} height="6" fill="#2e272a" />);
      parts.push(<path key={`sc${k}`} d={`M0 ${y + h * 0.5} H${reach + 2}`} stroke="#2e272a" strokeWidth="3" />);
      if (r(k + 2) > 0.45) {
        const cx = reach - 16;
        parts.push(
          <g key={`ch${k}`}>
            <rect x={cx} y={y - 22} width="12" height="22" fill={`url(#${tex}-brick)`} stroke="#2e272a" strokeWidth="1" />
            <rect x={cx + 1} y={y - 28} width="4" height="7" fill="#3a2a24" />
            <rect x={cx + 7} y={y - 26} width="4" height="5" fill="#3a2a24" />
          </g>,
        );
      }
      parts.push(<path key={`dp${k}`} d={`M${reach - 4} ${y + 6} V${y + h}`} stroke="#3a3236" strokeWidth="2.5" />);
      for (let row = 0; row < Math.floor((h - 20) / 30); row++) {
        for (let col = 0; col < Math.floor((reach - 12) / 17); col++) {
          const lit = r(k * 97 + row * 13 + col);
          parts.push(sash(6 + col * 17, y + 18 + row * 30, 9, 13, lit > 0.6, `w${k}-${row}-${col}`, lit > 0.94));
        }
      }
      if (r(k + 4) > 0.75) {
        const by = y + h * 0.5 - 4;
        const bw = Math.min(reach + 10, 70);
        parts.push(
          <g key={`bal${k}`}>
            <rect x="0" y={by} width={bw} height="4" fill="#2e272a" />
            {Array.from({ length: 8 }, (_, b) => (
              <path key={b} d={`M${4 + b * 8} ${by} V${by - 12}`} stroke="#3a3236" strokeWidth="1.5" />
            ))}
            <path d={`M0 ${by - 12} H${bw}`} stroke="#3a3236" strokeWidth="2" />
          </g>,
        );
      }
      if (r(k + 5) > 0.8) {
        parts.push(
          <g key={`sign${k}`}>
            <path d={`M${reach} ${y + h - 30} H${reach + 14}`} stroke="#3a3236" strokeWidth="2" />
            <rect x={reach + 2} y={y + h - 28} width="20" height="14" rx="2" fill="#4a1a22" stroke="#b08a48" strokeWidth="1" />
          </g>,
        );
      }
      y += h + (r(k + 3) > 0.72 ? 28 : 0);
      k += 7;
    }
  } else if (kind === "spirit") {
    // Translucent curtains that ripple like breath, embroidered with faint sigils and tied with gilt cords.
    for (let layer = 0; layer < 3; layer++) {
      let d = `M0 0`;
      for (let y = 0; y <= height; y += 60) d += ` L${(22 + layer * 16 + Math.sin(y / 90 + layer * 2) * 14 + r(y + layer) * 8).toFixed(1)} ${y}`;
      d += ` L0 ${height} Z`;
      parts.push(<path key={`s${layer}`} d={d} className={`wa-curtain wa-curtain-${layer}`} />);
    }
    for (let y = 30; y < height; y += 90 + r(y) * 40) {
      const x = 12 + r(y + 1) * 20;
      parts.push(
        <g key={`sig${y}`} opacity="0.5">
          <circle cx={x} cy={y} r="7" fill="none" stroke="#c4b5fd" strokeWidth="1" />
          <path d={`M${x} ${y - 7} V${y + 7} M${x - 6} ${y + 3} L${x + 6} ${y - 3}`} stroke="#c4b5fd" strokeWidth="1" />
        </g>,
      );
      if (r(y + 2) > 0.7) parts.push(<path key={`cord${y}`} d={`M0 ${y + 20} q${x + 10} 6 ${x + 14} 18 q2 10 -4 14`} stroke="#c9a86a" strokeWidth="1.5" fill="none" />);
    }
  } else if (kind === "sea") {
    // Jagged rock with strata, barnacles, shells and starfish, and kelp with air bladders swaying off its ledges.
    let d = "M0 0";
    const ledges: [number, number][] = [];
    for (let y = 0; y <= height; y += 34) {
      const x = 22 + r(y) * 42;
      d += ` L${x.toFixed(1)} ${y}`;
      if (r(y + 7) > 0.74) ledges.push([x, y]);
    }
    d += ` L0 ${height} Z`;
    parts.push(<path key="rock" d={d} fill="#0d1d22" stroke="#1f3a40" strokeWidth="1.5" />);
    for (let y = 20; y < height; y += 50) parts.push(<path key={`st${y}`} d={`M0 ${y} q12 -4 ${18 + r(y + 3) * 14} 2`} stroke="#16303a" strokeWidth="1.5" fill="none" />);
    ledges.forEach(([x, y], i) => {
      parts.push(
        <g key={`kelp${i}`} className="wa-kelp" style={{ animationDelay: `${-i * 0.7}s`, transformOrigin: `${x}px ${y}px` }}>
          <path d={`M${x} ${y} q12 -30 0 -60 q-12 -30 4 -70`} stroke="#1f5a4c" strokeWidth="3" fill="none" strokeLinecap="round" />
          {[0.3, 0.55, 0.8].map((t) => {
            const dx = t === 0.55 ? -6 : 7;
            return (
              <g key={t}>
                <ellipse cx={x + dx} cy={y - 130 * t} rx="5" ry="2.4" fill="#2a7a64" transform={`rotate(${dx < 0 ? -30 : 30} ${x} ${y - 130 * t})`} />
                <circle cx={x + dx / 2.5} cy={y - 130 * t} r="2" fill="#4aa58a" />
              </g>
            );
          })}
        </g>,
      );
    });
    for (let i = 0; i < height / 70; i++) {
      const y = i * 70 + r(i + 200) * 40;
      const x = 6 + r(i + 300) * 22;
      const pick = r(i + 400);
      if (pick > 0.7) {
        parts.push(
          <g key={`star${i}`} transform={`translate(${x} ${y}) rotate(${pick * 90})`}>
            {Array.from({ length: 5 }, (_, a) => (
              <ellipse key={a} cy="-4" rx="1.8" ry="4.5" fill="#c85a3a" transform={`rotate(${a * 72})`} />
            ))}
          </g>,
        );
      } else if (pick > 0.4) {
        parts.push(<path key={`sh${i}`} d={`M${x - 5} ${y + 3} Q${x} ${y - 7} ${x + 5} ${y + 3} Z M${x} ${y - 4} V${y + 3}`} fill="#9a8a78" stroke="#5a4a3a" strokeWidth="0.8" />);
      } else {
        parts.push(
          <g key={`bn${i}`}>
            {[0, 5, 9].map((dx) => (
              <path key={dx} d={`M${x + dx - 3} ${y + 2} L${x + dx} ${y - 3} L${x + dx + 3} ${y + 2} Z`} fill="#8a8476" />
            ))}
          </g>,
        );
      }
    }
  } else if (kind === "kingdom") {
    // Broken masonry: offset courses, carved glyphs, moss and pillar stumps jutting into the shaft.
    let y = 0;
    while (y < height) {
      const h = 28 + r(k) * 20;
      const reach = 30 + r(k + 1) * 34;
      parts.push(<rect key={`st${k}`} x="0" y={y} width={reach} height={h - 2} fill={k % 3 ? "#241c1e" : "#2b2224"} stroke="#3a2f31" strokeWidth="1" />);
      parts.push(<path key={`sj${k}`} d={`M${reach * 0.5} ${y} V${y + h - 2}`} stroke="#1a1416" strokeWidth="1" />);
      if (r(k + 6) > 0.8) {
        parts.push(<path key={`gl${k}`} d={`M${reach * 0.25} ${y + 6} l4 8 l4 -8 M${reach * 0.25 + 4} ${y + 14} v6`} stroke="#c9a86a" strokeOpacity="0.45" strokeWidth="1.2" fill="none" />);
      }
      if (r(k + 7) > 0.78) parts.push(<ellipse key={`moss${k}`} cx={reach - 4} cy={y + 2} rx="8" ry="3" fill="#2e4a2a" opacity="0.7" />);
      if (r(k + 2) > 0.86) {
        const w = 20 + r(k + 3) * 18;
        parts.push(
          <g key={`p${k}`}>
            <rect x={reach} y={y - 6} width={w} height={h + 10} fill="#2e2527" stroke="#4a3f40" strokeWidth="1" />
            {[0.3, 0.6].map((t) => (
              <path key={t} d={`M${reach + w * t} ${y - 2} V${y + h + 2}`} stroke="#1a1416" strokeWidth="1.5" />
            ))}
          </g>,
        );
      }
      y += h;
      k += 8;
    }
  } else {
    // The floor's walls: dark rock split by glowing crimson cracks, with embers drifting out of them.
    let d = "M0 0";
    for (let y = 0; y <= height; y += 40) d += ` L${(26 + r(y) * 36).toFixed(1)} ${y}`;
    d += ` L0 ${height} Z`;
    parts.push(<path key="rock" d={d} fill="#120709" stroke="#3a1015" strokeWidth="1.5" />);
    for (let i = 0; i < Math.floor(height / 110); i++) {
      const y = i * 110 + r(i + 50) * 60;
      parts.push(<path key={`crack${i}`} d={`M2 ${y} l${10 + r(i) * 10} 8 l-6 12 l${14 + r(i + 1) * 8} 10 m-8 -6 l6 -10`} className="wa-crack" />);
      parts.push(<circle key={`em${i}`} cx={20 + r(i + 2) * 10} cy={y + 14} r="1.6" fill="#ff9d6b" className="wa-twinkle" style={{ animationDelay: `${-i * 0.6}s` }} />);
    }
  }

  return (
    <svg viewBox={`0 0 100 ${Math.max(1, Math.round(height))}`} preserveAspectRatio="xMinYMin slice" style={{ height }}>
      {parts}
    </svg>
  );
}
