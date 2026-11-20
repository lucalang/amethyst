/*
 * The scenery of The Descent: original artwork for the five zones of the fog, from the drowned Gaslit City at the top
 * to the Nameless Floor at 7,000 m. Each piece sits at a depth (metres), on one side, at a width in container units,
 * and on the near layer or the slower far (parallax) layer. Animations are CSS classes in descent.css (`wa-*`), and
 * all of them stop with reduced motion.
 */

import type { ReactNode } from "react";

export type Scene = { m: number; side: "l" | "r" | "c"; width: number; layer: "near" | "far"; art: ReactNode; inset?: number; /** Art that reaches past its box (a beam), so it isn't faded at the edges. */ bleed?: boolean };

// ---- The Gaslit City (0–800 m) -------------------------------------------------------------------------------

const Skyline = (
  <svg viewBox="0 0 800 260" preserveAspectRatio="xMidYMax meet">
    <defs>
      <linearGradient id="wa-roof" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#2a2326" />
        <stop offset="100%" stopColor="#151214" />
      </linearGradient>
    </defs>
    <path
      d="M0 260 V170 H40 V140 H58 V120 H66 V140 H90 V160 H130 V110 L150 90 L170 110 V150 H210 V130 H230 V100 H238 V130 H260 V170 H300 V120 H320 V60 L330 30 L340 60 V120 H360 V150 H410 V100 H450 V140 H490 V90 H500 V70 H508 V90 H520 V150 H560 V120 L590 96 L620 120 V160 H660 V130 H690 V110 H698 V130 H720 V170 H760 V150 H800 V260 Z"
      fill="url(#wa-roof)"
    />
    {[
      [20, 190], [46, 160], [104, 180], [140, 130], [158, 170], [196, 175], [244, 150], [276, 190], [310, 140], [330, 100], [372, 170], [424, 120], [436, 160], [466, 165], [530, 170], [574, 140], [600, 180], [640, 175], [676, 150], [704, 190], [740, 180], [780, 175],
    ].map(([x, y], k) => (
      <rect key={k} x={x} y={y} width="6" height="9" rx="1" className="wa-window" style={{ animationDelay: `${-(k % 7) * 1.3}s` }} />
    ))}
    {[62, 234, 504, 694].map((x, k) => (
      <path key={x} d={`M${x} 60 q-12 -20 4 -36 q14 -14 -2 -30`} className="wa-smoke" style={{ animationDelay: `${-k * 2}s` }} />
    ))}
  </svg>
);

const ClockTower = (
  <svg viewBox="0 0 120 340">
    <path d="M30 340 V110 L60 40 L90 110 V340 Z" fill="#1d1a1d" stroke="#3b3236" strokeWidth="2" />
    <path d="M56 40 V10 H64 V40" fill="#1d1a1d" />
    <circle cx="60" cy="140" r="22" fill="#e9d9a8" opacity="0.9" />
    <circle cx="60" cy="140" r="22" fill="none" stroke="#6e5a3a" strokeWidth="3" />
    {Array.from({ length: 12 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      return <path key={k} d={`M${60 + Math.sin(a) * 16} ${140 - Math.cos(a) * 16} L${60 + Math.sin(a) * 19} ${140 - Math.cos(a) * 19}`} stroke="#3a2c18" strokeWidth="1.5" />;
    })}
    {/* Stopped at midnight. */}
    <path d="M60 140 V124 M60 140 V127" stroke="#2a1d0e" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M60 162 V230" stroke="#6e5a3a" strokeWidth="1.5" />
    <circle cx="60" cy="236" r="8" fill="#b08a48" className="wa-pendulum" />
    {[190, 270, 300].map((y) => (
      <rect key={y} x="54" y={y} width="12" height="16" rx="6" className="wa-window" />
    ))}
  </svg>
);

const GasLamp = (
  <svg viewBox="0 0 80 260">
    <circle cx="40" cy="44" r="40" className="wa-lampglow" />
    <path d="M37 260 V70 H43 V260 Z M28 258 H52 V262 H28 Z" fill="#262327" />
    <path d="M40 70 V60 M24 60 H56 L50 30 H30 Z" fill="#2a2629" stroke="#5a4c32" strokeWidth="1.5" />
    <path d="M31 33 H49 L53 58 H27 Z" fill="#ffd27a" opacity="0.85" className="wa-flame" />
    <path d="M34 22 H46 L40 12 Z" fill="#2a2629" />
  </svg>
);

const Cab = (
  <svg viewBox="0 0 200 140" className="wa-bob">
    <path d="M40 40 H140 Q150 40 150 52 V96 H30 V52 Q30 40 40 40 Z" fill="#221d20" stroke="#4a3e2c" strokeWidth="2" />
    <rect x="48" y="52" width="34" height="26" rx="3" fill="#ffcf7a" opacity="0.75" className="wa-window" />
    <rect x="96" y="52" width="40" height="26" rx="3" fill="#ffcf7a" opacity="0.55" className="wa-window" />
    <path d="M150 70 H186" stroke="#3a3034" strokeWidth="4" />
    <circle cx="58" cy="104" r="22" fill="none" stroke="#4a3e2c" strokeWidth="4" />
    <circle cx="132" cy="104" r="22" fill="none" stroke="#4a3e2c" strokeWidth="4" />
    {Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI;
      return (
        <g key={k}>
          <path d={`M${58 - Math.cos(a) * 22} ${104 - Math.sin(a) * 22} L${58 + Math.cos(a) * 22} ${104 + Math.sin(a) * 22}`} stroke="#4a3e2c" strokeWidth="2" />
          <path d={`M${132 - Math.cos(a) * 22} ${104 - Math.sin(a) * 22} L${132 + Math.cos(a) * 22} ${104 + Math.sin(a) * 22}`} stroke="#4a3e2c" strokeWidth="2" />
        </g>
      );
    })}
    <circle cx="28" cy="58" r="6" fill="#ffd27a" className="wa-flame" />
    <circle cx="28" cy="58" r="14" className="wa-lampglow" />
  </svg>
);

const Viaduct = (
  <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid meet">
    <path d="M0 90 H800 V110 H0 Z" fill="#221c1f" />
    {Array.from({ length: 8 }, (_, k) => (
      <path key={k} d={`M${k * 100} 110 H${k * 100 + 100} V220 H${k * 100 + 84} V160 Q${k * 100 + 50} 120 ${k * 100 + 16} 160 V220 H${k * 100} Z`} fill="#1b1619" />
    ))}
    <path d="M250 90 V60 Q250 52 258 52 H420 Q430 52 430 62 V90 Z M430 90 V66 H560 V90 Z M560 90 V66 H690 V90 Z" fill="#2a2326" />
    {[270, 300, 330, 360, 390, 450, 480, 510, 580, 610, 640].map((x) => (
      <rect key={x} x={x} y="62" width="16" height="12" rx="2" className="wa-window" />
    ))}
    <path d="M262 52 q-6 -18 6 -30 q10 -10 0 -22" className="wa-smoke" />
  </svg>
);

const Cathedral = (
  <svg viewBox="0 0 220 320">
    <path d="M20 320 V140 L50 70 L80 140 V320 Z M140 320 V140 L170 70 L200 140 V320 Z" fill="#1a1619" stroke="#33292d" strokeWidth="2" />
    <path d="M70 320 V160 L110 96 L150 160 V320 Z" fill="#211b1f" stroke="#33292d" strokeWidth="2" />
    <circle cx="110" cy="190" r="28" className="wa-rose" />
    {Array.from({ length: 8 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      return <path key={k} d={`M110 190 L${110 + Math.cos(a) * 28} ${190 + Math.sin(a) * 28}`} stroke="#33292d" strokeWidth="2.5" />;
    })}
    <circle cx="110" cy="190" r="28" fill="none" stroke="#33292d" strokeWidth="3" />
    <path d="M96 320 V262 Q110 244 124 262 V320 Z" fill="#0d0b0d" />
    <path d="M50 70 V40 M45 50 H55 M170 70 V40 M165 50 H175" stroke="#33292d" strokeWidth="3" />
    <path d="M40 150 h20 v34 h-20 Z M160 150 h20 v34 h-20 Z" className="wa-window" />
  </svg>
);

// ---- The Spirit Tide (800–2,100 m) ---------------------------------------------------------------------------

const Aurora = (
  <svg viewBox="0 0 800 300" preserveAspectRatio="none">
    <path d="M0 120 C160 40 320 200 480 100 S720 60 800 130 V170 C700 110 560 240 420 150 S120 90 0 170 Z" className="wa-aurora wa-aurora-a" />
    <path d="M0 190 C140 120 300 250 460 170 S700 140 800 200 V230 C680 180 540 290 400 220 S140 170 0 240 Z" className="wa-aurora wa-aurora-b" />
  </svg>
);

const card = (x: number, y: number, rotate: number, face: ReactNode, k: number) => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <g className="wa-card" style={{ animationDelay: `${-k * 1.1}s` }}>
      <rect x="-26" y="-42" width="52" height="84" rx="5" fill="#16121c" stroke="#c9a86a" strokeWidth="2" />
      <rect x="-21" y="-37" width="42" height="74" rx="3" fill="none" stroke="#c9a86a" strokeOpacity="0.4" />
      {face}
    </g>
  </g>
);
const CARD_BACK = <path d="M0 -14 L10 0 L0 14 L-10 0 Z M0 -6 L4 0 L0 6 L-4 0 Z" fill="none" stroke="#c9a86a" strokeOpacity="0.7" />;
const CARD_FACE = (
  <g>
    <path d="M-14 0 Q0 -12 14 0 Q0 12 -14 0 Z" fill="#f3e6c4" />
    <circle r="5" fill="#a3102a" />
    <path d="M0 -26 L2 -20 L8 -20 L3 -16 L5 -10 L0 -14 L-5 -10 L-3 -16 L-8 -20 L-2 -20 Z" fill="#c9a86a" />
  </g>
);
const Tarot = (
  <svg viewBox="0 0 320 200">
    {card(60, 110, -14, CARD_BACK, 0)}
    {card(130, 92, -5, CARD_BACK, 1)}
    {card(200, 100, 8, CARD_FACE, 2)}
    {card(266, 120, 16, CARD_BACK, 3)}
  </svg>
);

const Mirror = (
  <svg viewBox="0 0 160 240">
    <ellipse cx="80" cy="110" rx="58" ry="84" fill="#1b2230" stroke="#b08a48" strokeWidth="7" />
    <ellipse cx="80" cy="110" rx="50" ry="76" fill="url(#wa-mirror)" />
    <defs>
      <linearGradient id="wa-mirror" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#5d6f8a" />
        <stop offset="100%" stopColor="#1b2230" />
      </linearGradient>
    </defs>
    {/* Someone else's reflection. */}
    <path d="M80 70 a14 16 0 1 1 0.1 0 Z M56 170 Q60 112 80 106 Q100 112 104 170 Z" fill="#0c0f16" className="wa-figure" />
    <path d="M40 46 Q80 10 120 46 M66 22 Q80 8 94 22" fill="none" stroke="#b08a48" strokeWidth="4" />
    <path d="M80 194 V226 M60 226 H100" stroke="#b08a48" strokeWidth="5" />
    <path d="M50 60 L64 46" stroke="#fff" strokeOpacity="0.35" strokeWidth="4" strokeLinecap="round" />
  </svg>
);

const Puppet = (
  <svg viewBox="0 0 160 280" className="wa-dangle">
    <path d="M30 0 V70 M80 0 V40 M130 0 V70 M55 0 V150 M105 0 V150" stroke="#cfd6e4" strokeOpacity="0.45" strokeWidth="1" />
    <circle cx="80" cy="60" r="18" fill="#e7dccb" />
    <path d="M72 58 h4 M84 58 h4 M74 68 q6 4 12 0" stroke="#1a1418" strokeWidth="2" fill="none" />
    <path d="M62 44 H98 L92 30 H68 Z" fill="#1a1418" />
    <path d="M64 80 H96 L102 150 H58 Z" fill="#3a1a24" stroke="#c9a86a" strokeWidth="1.5" />
    <path d="M64 86 L30 70 M96 86 L130 70" stroke="#e7dccb" strokeWidth="6" strokeLinecap="round" />
    <path d="M68 150 L55 220 M92 150 L105 220" stroke="#1a1418" strokeWidth="8" strokeLinecap="round" />
  </svg>
);

const Ritual = (
  <svg viewBox="0 0 300 160">
    <ellipse cx="150" cy="90" rx="130" ry="44" fill="none" stroke="#c4b5fd" strokeOpacity="0.5" strokeWidth="2" />
    <g className="wa-spin-slow" style={{ transformOrigin: "150px 90px" }}>
      <ellipse cx="150" cy="90" rx="100" ry="33" fill="none" stroke="#a46bff" strokeOpacity="0.6" strokeWidth="1.5" strokeDasharray="6 10" />
    </g>
    <path d="M150 58 L178 112 L118 76 H182 L122 112 Z" fill="none" stroke="#a46bff" strokeOpacity="0.7" strokeWidth="1.5" />
    {Array.from({ length: 9 }, (_, k) => {
      const a = (k / 9) * Math.PI * 2;
      const x = 150 + Math.cos(a) * 130;
      const y = 90 + Math.sin(a) * 44;
      return (
        <g key={k}>
          <rect x={x - 4} y={y - 18} width="8" height="18" rx="2" fill="#efe6d2" />
          <ellipse cx={x} cy={y - 22} rx="3" ry="6" fill="#ffd27a" className="wa-flame" style={{ animationDelay: `${-k * 0.3}s` }} />
        </g>
      );
    })}
  </svg>
);

const gear = (cx: number, cy: number, r: number, teeth: number, cls: string) => {
  const points: string[] = [];
  for (let k = 0; k < teeth * 2; k++) {
    const a = (k / (teeth * 2)) * Math.PI * 2;
    const rr = k % 2 === 0 ? r : r * 0.82;
    points.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return (
    <g className={cls} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <polygon points={points.join(" ")} fill="#8a6a36" stroke="#5a4422" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={r * 0.35} fill="#2a2016" stroke="#b08a48" strokeWidth="2" />
    </g>
  );
};
const Clockwork = (
  <svg viewBox="0 0 220 200">
    {gear(80, 90, 60, 14, "wa-gear")}
    {gear(168, 60, 34, 9, "wa-gear-rev")}
    {gear(160, 150, 26, 7, "wa-gear-rev")}
  </svg>
);

// ---- The Drowned Sea (2,100–4,200 m) -------------------------------------------------------------------------

const Lighthouse = (
  <svg viewBox="0 0 260 340" overflow="visible">
    <path d="M110 70 L-260 0 L-260 160 Z" className="wa-beam" style={{ transformOrigin: "110px 70px" }} />
    <path d="M86 340 L96 100 H124 L134 340 Z" fill="#1c2a2e" stroke="#2f4549" strokeWidth="2" />
    <path d="M90 180 H130 M88 250 H132" stroke="#3a1a1f" strokeWidth="10" />
    <rect x="94" y="66" width="32" height="34" fill="#0a1214" stroke="#2f4549" strokeWidth="2" />
    <circle cx="110" cy="82" r="9" fill="#05080a" stroke="#4fd1c5" strokeWidth="1.5" />
    <path d="M90 66 L110 44 L130 66 Z" fill="#1c2a2e" />
  </svg>
);

const Galleon = (
  <svg viewBox="0 0 320 260" className="wa-list">
    <path d="M30 170 Q160 230 290 170 L270 210 Q160 250 50 210 Z" fill="#1c1a17" stroke="#3b3326" strokeWidth="2" />
    <path d="M40 170 H280" stroke="#3b3326" strokeWidth="3" />
    {[110, 170, 230].map((x) => (
      <path key={x} d={`M${x} 172 V${x === 170 ? 20 : 50}`} stroke="#2e281e" strokeWidth="5" />
    ))}
    <path d="M112 60 Q150 80 112 120 Z M172 34 Q220 60 172 110 Z M232 64 Q262 84 232 118 Z" fill="#a9a493" opacity="0.35" />
    <path d="M128 70 l14 40 M188 44 l18 50" stroke="#0e1314" strokeWidth="3" />
    {[80, 120, 160, 200, 240].map((x) => (
      <circle key={x} cx={x} cy="190" r="5" fill="#4fd1c5" opacity="0.5" className="wa-window" />
    ))}
  </svg>
);

const jelly = (x: number, y: number, s: number, k: number) => (
  <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
    <g className="wa-jelly" style={{ animationDelay: `${-k * 0.9}s` }}>
      <path d="M-24 0 Q-24 -30 0 -30 Q24 -30 24 0 Q12 6 0 0 Q-12 6 -24 0 Z" fill="#3fd0b8" opacity="0.5" />
      <path d="M-14 2 q4 20 -2 40 M-4 4 q-4 24 2 48 M6 4 q5 22 -1 44 M16 2 q-3 18 3 36" stroke="#7ff3e0" strokeOpacity="0.55" strokeWidth="1.5" fill="none" />
      <circle cx="0" cy="-14" r="20" fill="#3fd0b8" opacity="0.18" />
    </g>
  </g>
);
const Jellies = (
  <svg viewBox="0 0 300 220">
    {jelly(60, 70, 1, 0)}
    {jelly(150, 40, 0.7, 1)}
    {jelly(230, 110, 1.2, 2)}
    {jelly(110, 150, 0.6, 3)}
  </svg>
);

const Tentacle = (
  <svg viewBox="0 0 260 320" className="wa-curl">
    <path d="M40 320 C40 220 140 230 150 150 C160 70 80 60 90 30 C96 10 120 14 118 34" fill="none" stroke="#3a2030" strokeWidth="34" strokeLinecap="round" />
    <path d="M40 320 C40 220 140 230 150 150 C160 70 80 60 90 30" fill="none" stroke="#5a2e44" strokeWidth="14" strokeLinecap="round" strokeDasharray="1 22" />
  </svg>
);

const Eye = (
  <svg viewBox="0 0 600 300">
    <ellipse cx="300" cy="150" rx="280" ry="120" fill="#06100f" />
    <g className="wa-blink" style={{ transformOrigin: "300px 150px" }}>
      <path d="M40 150 Q300 -10 560 150 Q300 310 40 150 Z" fill="#0d2a26" />
      <circle cx="300" cy="150" r="86" fill="url(#wa-iris)" />
      <ellipse cx="300" cy="150" rx="14" ry="72" fill="#020504" />
      <circle cx="268" cy="118" r="10" fill="#fff" opacity="0.25" />
    </g>
    <defs>
      <radialGradient id="wa-iris">
        <stop offset="0%" stopColor="#c9f7ee" />
        <stop offset="45%" stopColor="#2fb5a0" />
        <stop offset="100%" stopColor="#0a3a33" />
      </radialGradient>
    </defs>
  </svg>
);

const Anchor = (
  <svg viewBox="0 0 160 320">
    {Array.from({ length: 9 }, (_, k) => (
      <ellipse key={k} cx="80" cy={k * 18 + 6} rx="7" ry="11" fill="none" stroke="#4a5a5c" strokeWidth="4" transform={k % 2 ? `rotate(90 80 ${k * 18 + 6})` : undefined} />
    ))}
    <circle cx="80" cy="176" r="12" fill="none" stroke="#5a6a6c" strokeWidth="6" />
    <path d="M80 188 V300 M50 214 H110 M30 270 Q80 330 130 270 M30 270 L20 252 M130 270 L140 252" fill="none" stroke="#5a6a6c" strokeWidth="10" strokeLinecap="round" />
  </svg>
);

// ---- The Fallen Kingdom (4,200–6,200 m) ----------------------------------------------------------------------

const StoneHead = (
  <svg viewBox="0 0 300 320">
    <path d="M60 300 Q30 150 80 80 Q150 10 220 80 Q270 150 240 300 Z" fill="#2c2628" stroke="#4a3f40" strokeWidth="2" />
    <path d="M70 90 L100 30 L130 70 L150 20 L170 70 L200 30 L230 90 Z" fill="#6b5530" stroke="#c9a86a" strokeWidth="2" />
    <path d="M100 150 Q120 140 140 150 M160 150 Q180 140 200 150" stroke="#14100f" strokeWidth="5" fill="none" />
    <path d="M150 160 V210 L140 216" stroke="#1d1718" strokeWidth="4" fill="none" />
    <path d="M120 240 Q150 252 180 240" stroke="#14100f" strokeWidth="5" fill="none" />
    <path d="M230 100 L190 170 L210 220 L180 300" stroke="#0e0b0b" strokeWidth="3" fill="none" />
    <path d="M100 150 v12 M200 150 v12" stroke="#e0263f" strokeOpacity="0.5" strokeWidth="2" className="wa-tear" />
  </svg>
);

const Colonnade = (
  <svg viewBox="0 0 800 260" preserveAspectRatio="xMidYMid meet">
    <path d="M40 60 H760 V80 H40 Z" fill="#2a2224" />
    <path d="M300 60 L400 10 L500 60 Z" fill="#2a2224" />
    {[60, 160, 260, 360, 460, 560, 660].map((x, k) => (
      <g key={x}>
        <rect x={x} y={k === 2 ? 130 : 80} width="40" height={k === 2 ? 130 : 180} fill="#241d1f" />
        <rect x={x - 6} y={k === 2 ? 126 : 80} width="52" height="10" fill="#2e2527" />
      </g>
    ))}
    <path d="M260 120 l20 10 l-8 14 l16 -4" stroke="#140f10" strokeWidth="3" fill="none" />
  </svg>
);

const Hand = (
  <svg viewBox="0 0 260 300">
    <circle cx="130" cy="80" r="46" className="wa-orb" />
    <circle cx="130" cy="80" r="26" fill="#f2c14e" opacity="0.5" />
    <path d="M40 300 L60 170 Q50 130 70 120 L80 150 L84 90 Q90 74 102 80 L104 140 L110 70 Q118 58 128 66 L128 140 L140 74 Q150 62 158 72 L154 146 L170 100 Q182 90 188 102 L176 180 Q200 160 214 170 Q190 210 170 230 L190 300 Z" fill="#2e2729" stroke="#4a3f40" strokeWidth="2" />
    <path d="M110 200 L120 240 L104 280" stroke="#140f10" strokeWidth="3" fill="none" />
  </svg>
);

const Sealed = (
  <svg viewBox="0 0 280 300" className="wa-strain">
    <path d="M0 40 L110 120 M280 30 L170 120 M0 260 L110 190 M280 280 L170 190" stroke="#5a5254" strokeWidth="6" strokeDasharray="10 6" />
    <rect x="96" y="96" width="88" height="110" rx="6" fill="#1a1012" stroke="#c9a86a" strokeWidth="3" />
    <circle cx="140" cy="151" r="26" fill="none" stroke="#e0263f" strokeWidth="2.5" className="wa-runeglow" />
    <path d="M140 128 L160 164 H120 Z" fill="none" stroke="#e0263f" strokeWidth="2" className="wa-runeglow" />
  </svg>
);

const Runes = (
  <svg viewBox="0 0 220 220">
    <g className="wa-spin-slow" style={{ transformOrigin: "110px 110px" }}>
      <circle cx="110" cy="110" r="96" fill="none" stroke="#e0263f" strokeOpacity="0.6" strokeWidth="2" />
      {Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        const x = 110 + Math.cos(a) * 82;
        const y = 110 + Math.sin(a) * 82;
        return <path key={k} d={`M${x - 5} ${y - 6} L${x + 5} ${y} L${x - 4} ${y + 6} ${k % 2 ? `M${x} ${y - 7} V${y + 7}` : ""}`} stroke="#ff6b7d" strokeWidth="2" fill="none" />;
      })}
    </g>
    <g className="wa-spin-rev" style={{ transformOrigin: "110px 110px" }}>
      <circle cx="110" cy="110" r="60" fill="none" stroke="#f2c14e" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 8" />
      <path d="M110 58 L156 140 H64 Z M110 162 L64 80 H156 Z" fill="none" stroke="#f2c14e" strokeOpacity="0.55" strokeWidth="1.5" />
    </g>
  </svg>
);

// ---- The Nameless Floor (6,200–7,000 m) ----------------------------------------------------------------------

const Door = (
  <svg viewBox="0 0 400 420">
    <path d="M60 420 V150 Q60 30 200 20 Q340 30 340 150 V420 Z" fill="#140a0c" stroke="#5a2a30" strokeWidth="6" />
    <path d="M200 26 V420" stroke="#5a2a30" strokeWidth="4" />
    <path d="M196 30 V420 H204 V30 Z" className="wa-leak" />
    <path d="M120 200 Q200 140 280 200 Q200 260 120 200 Z" fill="#2a0c12" stroke="#c9a86a" strokeWidth="3" />
    <circle cx="200" cy="200" r="22" fill="#e0263f" className="wa-runeglow" />
    <circle cx="200" cy="200" r="8" fill="#14070a" />
    {[
      [60, 120, 340, 300],
      [340, 120, 60, 300],
    ].map(([x1, y1, x2, y2], k) => (
      <path key={k} d={`M${x1} ${y1} L${x2} ${y2}`} stroke="#6b6264" strokeWidth="8" strokeDasharray="14 6" className="wa-strain" />
    ))}
  </svg>
);

const Floor = (
  <svg viewBox="0 0 800 160" preserveAspectRatio="none">
    <path d="M0 60 Q100 30 200 54 T400 50 T600 58 T800 44 V160 H0 Z" fill="#0b0405" />
    <path d="M0 60 Q100 30 200 54 T400 50 T600 58 T800 44" fill="none" stroke="#5a1520" strokeWidth="2" />
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

/** One side of one zone's wall, `height` px tall, drawn in a 100-unit-wide box (the right side is mirrored in CSS). */
export function Wall({ kind, height, side }: { kind: WallKind; height: number; side: "l" | "r" }) {
  const r = seeded(`${kind}:${side}`);
  const parts: ReactNode[] = [];
  let k = 0;

  if (kind === "city") {
    // Tenement façades with chimneys, lit windows and dark alleys between them.
    let y = 0;
    while (y < height) {
      const h = 70 + r(k) * 110;
      const reach = 34 + r(k + 1) * 50;
      parts.push(<rect key={`b${k}`} x="0" y={y} width={reach} height={h} fill={k % 2 ? "#1f1a1d" : "#1a1619"} />);
      parts.push(<rect key={`c${k}`} x="0" y={y} width={reach + 5} height="5" fill="#2e272a" />);
      if (r(k + 2) > 0.5) parts.push(<rect key={`ch${k}`} x={reach - 12} y={y - 18} width="7" height="18" fill="#1f1a1d" />);
      for (let row = 0; row < Math.floor((h - 14) / 24); row++) {
        for (let col = 0; col < Math.floor((reach - 6) / 14); col++) {
          const lit = r(k * 97 + row * 13 + col);
          if (lit > 0.62) {
            parts.push(
              <rect key={`w${k}-${row}-${col}`} x={6 + col * 14} y={y + 14 + row * 24} width="6" height="10" className={lit > 0.93 ? "wa-window" : "wa-window-still"} />,
            );
          }
        }
      }
      y += h + (r(k + 3) > 0.72 ? 26 : 0);
      k += 5;
    }
  } else if (kind === "spirit") {
    // Translucent curtains that ripple like breath.
    for (let layer = 0; layer < 3; layer++) {
      let d = `M0 0`;
      for (let y = 0; y <= height; y += 60) d += ` L${(22 + layer * 16 + Math.sin(y / 90 + layer * 2) * 14 + r(y + layer) * 8).toFixed(1)} ${y}`;
      d += ` L0 ${height} Z`;
      parts.push(<path key={`s${layer}`} d={d} className={`wa-curtain wa-curtain-${layer}`} />);
    }
  } else if (kind === "sea") {
    // Jagged rock, with kelp swaying off its ledges.
    let d = "M0 0";
    const ledges: [number, number][] = [];
    for (let y = 0; y <= height; y += 34) {
      const x = 18 + r(y) * 42;
      d += ` L${x.toFixed(1)} ${y}`;
      if (r(y + 7) > 0.78) ledges.push([x, y]);
    }
    d += ` L0 ${height} Z`;
    parts.push(<path key="rock" d={d} fill="#0d1d22" stroke="#1f3a40" strokeWidth="1.5" />);
    ledges.forEach(([x, y], i) =>
      parts.push(
        <path key={`kelp${i}`} d={`M${x} ${y} q12 -30 0 -60 q-12 -30 4 -70`} className="wa-kelp" style={{ animationDelay: `${-i * 0.7}s`, transformOrigin: `${x}px ${y}px` }} />,
      ),
    );
  } else if (kind === "kingdom") {
    // Broken masonry: offset stone courses, with pillar stumps jutting into the shaft.
    let y = 0;
    while (y < height) {
      const h = 28 + r(k) * 20;
      const reach = 26 + r(k + 1) * 34;
      parts.push(<rect key={`st${k}`} x="0" y={y} width={reach} height={h - 2} fill={k % 3 ? "#241c1e" : "#2b2224"} stroke="#3a2f31" strokeWidth="1" />);
      if (r(k + 2) > 0.86) {
        parts.push(<rect key={`p${k}`} x={reach} y={y - 6} width={20 + r(k + 3) * 18} height={h + 10} fill="#2e2527" stroke="#4a3f40" strokeWidth="1" />);
      }
      y += h;
      k += 4;
    }
  } else {
    // The floor's walls: dark rock split by glowing crimson cracks.
    let d = "M0 0";
    for (let y = 0; y <= height; y += 40) d += ` L${(26 + r(y) * 36).toFixed(1)} ${y}`;
    d += ` L0 ${height} Z`;
    parts.push(<path key="rock" d={d} fill="#120709" stroke="#3a1015" strokeWidth="1.5" />);
    for (let i = 0; i < Math.floor(height / 110); i++) {
      const y = i * 110 + r(i + 50) * 60;
      parts.push(<path key={`crack${i}`} d={`M2 ${y} l${10 + r(i) * 10} 8 l-6 12 l${14 + r(i + 1) * 8} 10`} className="wa-crack" />);
    }
  }

  return (
    <svg viewBox={`0 0 100 ${Math.max(1, Math.round(height))}`} preserveAspectRatio="none" style={{ height }}>
      {parts}
    </svg>
  );
}
