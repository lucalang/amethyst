import type { ReactNode } from "react";
import type { ArcadeGameId } from "@/lib/arcade";

/** Static artwork for the Arcade hub (no game code is loaded until a game opens). */
export function ArcadePreview({ game }: { game: ArcadeGameId }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden className="size-full" preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="100" className="fill-surface" />
      <rect width="160" height="100" className="fill-amethyst/[0.08]" />
      {PREVIEWS[game]}
    </svg>
  );
}

const TILE_2048: [number, number, number][] = [
  [0, 0, 2],
  [1, 0, 4],
  [3, 0, 2],
  [0, 1, 8],
  [1, 1, 16],
  [2, 1, 4],
  [0, 2, 64],
  [1, 2, 128],
  [3, 2, 2],
  [0, 3, 2048],
  [1, 3, 256],
  [2, 3, 32],
];

const SUDOKU_DIGITS: [number, number, number][] = [
  [0, 0, 5], [1, 0, 3], [4, 0, 7], [0, 1, 6], [3, 1, 1], [4, 1, 9], [5, 1, 5], [1, 2, 9], [2, 2, 8], [7, 2, 6],
  [0, 3, 8], [4, 3, 6], [8, 3, 3], [0, 4, 4], [3, 4, 8], [5, 4, 3], [8, 4, 1], [4, 5, 2], [6, 6, 2], [7, 6, 8],
  [3, 7, 4], [4, 7, 1], [5, 7, 9], [8, 7, 5], [4, 8, 8], [7, 8, 7], [8, 8, 9],
];

const PREVIEWS: Record<ArcadeGameId, ReactNode> = {
  "2048": (
    <g transform="translate(46 8)">
      <rect width="68" height="84" rx="5" className="fill-foreground/[0.06]" />
      {Array.from({ length: 16 }, (_, cell) => (
        <rect key={cell} x={4 + (cell % 4) * 16} y={4 + Math.floor(cell / 4) * 20} width="12" height="16" rx="2" className="fill-foreground/[0.05]" />
      ))}
      {TILE_2048.map(([col, row, value]) => {
        const strength = Math.min(1, (Math.log2(value) - 1) / 10);
        return (
          <g key={`${col}-${row}`} transform={`translate(${4 + col * 16} ${4 + row * 20})`}>
            <rect width="12" height="16" rx="2" className={value >= 2048 ? "fill-rose" : "fill-amethyst"} fillOpacity={value >= 2048 ? 1 : 0.15 + strength * 0.85} />
            <text x="6" y="10.5" textAnchor="middle" fontSize={value >= 1000 ? 3.6 : value >= 100 ? 4.4 : 5.5} fontWeight="700" className="fill-foreground">
              {value}
            </text>
          </g>
        );
      })}
    </g>
  ),
  flutter: (
    <g>
      <rect y="84" width="160" height="16" className="fill-amethyst/25" />
      {[
        [34, 30, 58],
        [96, 18, 48],
        [150, 38, 62],
      ].map(([x, top, bottom]) => (
        <g key={x} className="fill-amethyst/70">
          <path d={`M${x - 9} 0 V${top - 5} L${x} ${top} L${x + 9} ${top - 5} V0 Z`} />
          <path d={`M${x - 9} 84 V${bottom + 5} L${x} ${bottom} L${x + 9} ${bottom + 5} V84 Z`} />
        </g>
      ))}
      <g transform="translate(66 42) rotate(-12)">
        <ellipse rx="8" ry="7" className="fill-rose" />
        <ellipse cx="-4" cy="1" rx="5" ry="3" className="fill-foreground/60" />
        <circle cx="3.5" cy="-2.5" r="2.2" className="fill-foreground" />
        <circle cx="4.2" cy="-2.5" r="1" className="fill-background" />
        <path d="M8 -1 L13 1 L8 3 Z" fill="#ffc857" />
      </g>
      <path d="M40 60 Q52 54 58 46" className="stroke-foreground/20" strokeDasharray="2 3" fill="none" strokeWidth="1.2" />
    </g>
  ),
  snake: (
    <g>
      {Array.from({ length: 16 }, (_, x) =>
        Array.from({ length: 10 }, (_, y) =>
          (x + y) % 2 ? null : <rect key={`${x}-${y}`} x={x * 10} y={y * 10} width="10" height="10" className="fill-foreground/[0.03]" />,
        ),
      )}
      <path d="M25 75 H65 V45 H105 V25 H125" className="stroke-amethyst" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="125" cy="25" r="5" className="fill-amethyst" />
      <circle cx="127" cy="23" r="1.2" className="fill-background" />
      <circle cx="127" cy="27" r="1.2" className="fill-background" />
      <circle cx="145" cy="65" r="6" className="fill-rose/25" />
      <circle cx="145" cy="65" r="3.6" className="fill-rose" />
    </g>
  ),
  sudoku: (
    <g transform="translate(35 5)">
      <rect width="90" height="90" rx="3" className="fill-background/40 stroke-foreground/50" strokeWidth="1.2" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} className={i % 3 === 2 ? "stroke-foreground/45" : "stroke-foreground/15"} strokeWidth={i % 3 === 2 ? 1 : 0.5}>
          <line x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="90" />
          <line x1="0" y1={(i + 1) * 10} x2="90" y2={(i + 1) * 10} />
        </g>
      ))}
      <rect x="40" y="40" width="10" height="10" className="fill-amethyst/35" />
      {SUDOKU_DIGITS.map(([col, row, digit], index) => (
        <text
          key={`${col}-${row}`}
          x={col * 10 + 5}
          y={row * 10 + 7.6}
          textAnchor="middle"
          fontSize="6.5"
          fontWeight={index % 4 === 3 ? 500 : 700}
          className={index % 4 === 3 ? "fill-amethyst" : "fill-foreground/85"}
        >
          {digit}
        </text>
      ))}
    </g>
  ),
  "fruit-slice": (
    <g>
      <circle cx="40" cy="62" r="13" fill="#ff8a1f" />
      <circle cx="37" cy="59" r="10" fill="#ff8a1f" />
      <ellipse cx="34" cy="55" rx="3.5" ry="2" fill="#ffffff" fillOpacity="0.4" />
      <g transform="translate(88 40) rotate(-28)">
        <path d="M-13 -2 A13 13 0 0 1 13 -2 Z" fill="#7b3fa0" />
        <path d="M-10.5 -2 A10.5 10.5 0 0 1 10.5 -2 Z" fill="#f3c76b" />
        <path d="M-13 5 A13 13 0 0 0 13 5 Z" fill="#7b3fa0" />
        <path d="M-10.5 5 A10.5 10.5 0 0 0 10.5 5 Z" fill="#f3c76b" />
      </g>
      <circle cx="128" cy="66" r="11" fill="#5fb83b" />
      <g transform="translate(118 26)">
        <circle r="9" fill="#231c2b" stroke="#ff4d4d" strokeWidth="1.2" />
        <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke="#ff6b6b" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="5" cy="-11" r="1.8" fill="#ffd166" />
      </g>
      <path d="M58 70 L78 48 L108 22" className="stroke-rose/70" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M58 70 L78 48 L108 22" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="1" strokeLinecap="round" fill="none" />
      {[
        [84, 46],
        [92, 36],
        [80, 34],
        [96, 46],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#f3c76b" fillOpacity="0.8" />
      ))}
    </g>
  ),
  stacker: (
    <g>
      <rect y="90" width="160" height="10" className="fill-amethyst/20" />
      {[
        [40, 80],
        [42, 76],
        [46, 70],
        [46, 70],
        [52, 62],
        [54, 58],
      ].map(([x, w], level) => (
        <g key={level} transform={`translate(${x} ${82 - level * 9})`}>
          <rect width={w} height="8" className={level % 2 ? "fill-rose/80" : "fill-amethyst/80"} />
          <rect width={w} height="1.5" className="fill-foreground/25" />
        </g>
      ))}
      <g transform="translate(70 19)">
        <rect width="58" height="8" className="fill-amethyst" />
        <rect width="58" height="1.5" className="fill-foreground/25" />
      </g>
      <rect x="54" y="28" width="58" height="8" className="fill-none stroke-foreground/25" strokeDasharray="2 2" />
      <g transform="translate(124 40) rotate(24)">
        <rect width="10" height="8" className="fill-amethyst/60" />
      </g>
    </g>
  ),
};
