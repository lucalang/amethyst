import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, Coins } from "lucide-react";

const LETTERS = ["A", "R", "C", "A", "D", "E"];

/** Home's way into the Arcade: a small self-lit marquee sign (styles: `.arcade-marquee` in globals.css). */
export function ArcadeMarquee({ balance }: { balance: number | null }) {
  const coins = balance === null ? null : `${balance.toLocaleString("en")} coin${balance === 1 ? "" : "s"}`;
  return (
    <Link href="/arcade" prefetch={false} className="arcade-marquee" aria-label={coins ? `Arcade: six quick games. You have ${coins}.` : "Arcade: six quick games"}>
      <span aria-hidden className="arcade-marquee-bulbs" />
      <span aria-hidden className="arcade-marquee-art">
        <MarqueeArt />
      </span>
      <span aria-hidden className="min-w-0 flex-1">
        <span className="arcade-marquee-title">
          {LETTERS.map((letter, index) => (
            <span key={index} style={{ "--i": index } as CSSProperties}>
              {letter}
            </span>
          ))}
        </span>
        <span className="arcade-marquee-sub">
          <span className="truncate">Six games</span>
          {coins ? (
            <span className="arcade-marquee-coins">
              <Coins className="size-3" />
              {coins}
            </span>
          ) : null}
        </span>
      </span>
      <ArrowRight aria-hidden className="arcade-marquee-arrow" />
      <span aria-hidden className="arcade-marquee-sweep" />
    </Link>
  );
}

const SNAKE: [number, number][] = [
  [4, 34],
  [8, 34],
  [12, 34],
  [16, 34],
  [16, 30],
  [20, 30],
];

/** A tiny attract-mode screen: a coin, a pixel snake, a gem-bird and a crystal pillar. */
export function MarqueeArt() {
  return (
    <svg viewBox="0 0 64 44" className="size-full">
      <g fill="#fff" opacity="0.45">
        <rect x="27" y="6" width="1" height="1" />
        <rect x="44" y="4" width="1" height="1" />
        <rect x="6" y="22" width="1" height="1" />
        <rect x="33" y="38" width="1" height="1" />
      </g>
      <g className="arcade-marquee-pillar">
        <path d="M49 0 V11 L53.5 15 L58 11 V0 Z" />
        <path d="M49 44 V33 L53.5 29 L58 33 V44 Z" />
      </g>
      <g transform="translate(37 21) rotate(-10)">
        <ellipse rx="4.6" ry="3.8" fill="#ff6fb5" />
        <ellipse cx="-2.2" cy="0.8" rx="2.6" ry="1.5" fill="#ffd1e8" opacity="0.8" />
        <circle cx="1.8" cy="-1.2" r="1.2" fill="#fff" />
        <circle cx="2.2" cy="-1.2" r="0.55" fill="#1a0d24" />
        <path d="M4.2 -0.6 L7 0.5 L4.2 1.6 Z" fill="#ffd36b" />
      </g>
      <g fill="#4ff0a0">
        {SNAKE.map(([x, y], index) => (
          <rect key={index} x={x} y={y} width="3.4" height="3.4" rx="0.6" opacity={0.55 + index * 0.09} />
        ))}
      </g>
      <rect x="28" y="30" width="3.4" height="3.4" rx="1.4" fill="#ff5a5a" />
      <g transform="translate(14 14)">
        <circle r="6" fill="#ffd36b" />
        <circle r="4.3" fill="none" stroke="#b67a12" strokeWidth="1" />
        <path d="M-0.7 -2.4 h1.4 v4.8 h-1.4 Z" fill="#b67a12" />
        <path d="M-3.6 -3 A4.6 4.6 0 0 1 0.6 -4.6" stroke="#fff6d6" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
