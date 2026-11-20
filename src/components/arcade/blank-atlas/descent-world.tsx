"use client";

import type { CSSProperties } from "react";
import { DIVES, METRES_PER_POINT, MAX_SCORE, diveOf, hash, type Dive, type Round } from "@/lib/minigames/blank-atlas";

/*
 * The Descent's world: one tall column the camera travels down. At the top, the Sanctum floats above the gray fog;
 * the fog's surface is 0 m. Every point sinks the lantern 10 m, so a perfect round reaches 7,000 m, the Nameless
 * Floor. Landmarks and zones line the way; each answer leaves a marker where it landed.
 */

export const DIVE_COLOR: Record<Dive, string> = {
  familiar: "#d5d9e0",
  uncommon: "#3fd0b8",
  rare: "#4f8dff",
  exceptional: "#a46bff",
  extraordinary: "#e0263f",
};

const SURF = 620; // px from the world's top to the fog's surface (0 m)
const PX = 0.85; // px per metre
const BOTTOM = MAX_SCORE * METRES_PER_POINT;
const WORLD_H = SURF + BOTTOM * PX + 520;
export const yOf = (metres: number) => SURF + metres * PX;

/** The water darkens with depth, with a crimson stain near the floor. */
const SHADES: [number, string][] = [
  [0, "#4b4d55"],
  [400, "#34353c"],
  [1200, "#25242a"],
  [2400, "#19161c"],
  [4200, "#100c12"],
  [6000, "#12070b"],
  [7000, "#070407"],
];

/** Original landmarks: small sights on the way, and the four zones in larger type. */
const LANDMARKS: { m: number; text: string; zone?: boolean }[] = [
  { m: 60, text: "the gaslight above begins to fade" },
  { m: 220, text: "church bells can no longer be heard" },
  { m: 380, text: "a drowned hansom cab drifts past, lamps still lit" },
  { m: 560, text: "every pocket watch stops here" },
  { m: 800, text: "The Twilight Veil", zone: true },
  { m: 1050, text: "tarot cards float by, all face down" },
  { m: 1350, text: "whispers in a language older than ink" },
  { m: 1700, text: "a lighthouse that shines darkness" },
  { m: 2100, text: "The Silent Archive", zone: true },
  { m: 2500, text: "letters addressed to no one, sealed in red wax" },
  { m: 3000, text: "the fog turns warm, like breath" },
  { m: 3600, text: "a staircase descending into itself" },
  { m: 4200, text: "The Lampless Deep", zone: true },
  { m: 4800, text: "a cathedral, hanging upside down" },
  { m: 5500, text: "voices you have never heard call your name" },
  { m: 6200, text: "The Nameless Floor", zone: true },
  { m: 7000, text: "the bottom of the fog: a perfect descent ends here", zone: true },
];

const unit = (seed: number, salt: number) => (hash(`${seed}:${salt}`) % 10_000) / 10_000;
const BANKS = Array.from({ length: 26 }, (_, k) => ({ y: SURF + 120 + k * 230 + unit(3, k) * 80, x: unit(5, k) * 100, w: 50 + unit(9, k) * 50 }));
const MOTES = Array.from({ length: 36 }, (_, k) => ({ x: unit(41, k) * 100, y: unit(43, k) * 100, d: unit(47, k) * 8, s: 0.6 + unit(53, k) * 1.4 }));

export type Plunge = { from: number; to: number; dive: Dive | null; ms: number; key: number };

/** How long the lantern takes to sink, by dive: gentle for familiar answers, a long plunge for the rarest. */
export const PLUNGE_MS: Record<Dive | "miss", number> = { miss: 500, familiar: 900, uncommon: 1250, rare: 1500, exceptional: 1800, extraordinary: 2200 };

export function DescentWorld({ round, shown, depth, plunge, final }: { round: Round; shown: number; depth: number; plunge: Plunge | null; final: boolean }) {
  const y = yOf(depth);
  const gradient = `linear-gradient(180deg, ${SHADES.map(([m, color]) => `${color} ${Math.round(yOf(m))}px`).join(", ")})`;

  // Each answered round: where it started and landed, for the trail and its marker.
  const marks = round.stops.slice(0, shown).map((stop, i, all) => {
    const from = all.slice(0, i).reduce((sum, earlier) => sum + earlier.points * METRES_PER_POINT, 0);
    const dive = diveOf(stop.question, stop.answer, stop.tier);
    return { i, from, to: from + stop.points * METRES_PER_POINT, dive, stop, side: hash(`${stop.question}:${i}`) % 2 === 0 ? -1 : 1 };
  });

  const style = {
    "--cam": `${y}px`,
    "--dur": `${plunge?.ms ?? 0}ms`,
    "--dv": plunge?.dive ? DIVE_COLOR[plunge.dive] : "#c9ccd2",
  } as CSSProperties;

  return (
    <div className="dw" data-plunge={plunge?.dive ?? undefined} data-final={final || undefined} style={style}>
      <div className="dw-world" style={{ height: WORLD_H, background: gradient }}>
        <Sanctum round={round} shown={shown} final={final} />

        {BANKS.map((bank, k) => (
          <span key={k} aria-hidden className="dw-bank" style={{ top: bank.y, left: `${bank.x - bank.w / 2}%`, width: `${bank.w + 30}%` }} />
        ))}

        <div aria-hidden className="dw-gauge">
          {Array.from({ length: BOTTOM / 500 + 1 }, (_, k) => (
            <span key={k} style={{ top: yOf(k * 500) }}>
              {(k * 500).toLocaleString("en")} m
            </span>
          ))}
        </div>

        {LANDMARKS.map((mark, k) => (
          <p key={mark.m} aria-hidden className="dw-landmark" data-zone={mark.zone || undefined} data-side={k % 2 ? "r" : "l"} style={{ top: yOf(mark.m) }}>
            {mark.text}
          </p>
        ))}

        {/* The trail: one coloured stretch per dive, from where it started to where it landed. */}
        {marks.map((mark) =>
          mark.to > mark.from && mark.dive ? (
            <span
              key={`trail-${mark.i}`}
              aria-hidden
              className="dw-trail"
              data-dive={mark.dive}
              style={{ top: yOf(mark.from), height: (mark.to - mark.from) * PX, "--dv": DIVE_COLOR[mark.dive] } as CSSProperties}
            />
          ) : null,
        )}

        {marks.map((mark) => (
          <div
            key={`mark-${mark.i}`}
            className="dw-mark"
            data-fresh={(plunge && mark.i === marks.length - 1) || undefined}
            data-dive={mark.dive ?? "miss"}
            data-side={mark.side > 0 ? "r" : "l"}
            style={{ top: yOf(mark.to) + (mark.to === mark.from ? 18 * (mark.i % 3) : 0), "--dv": mark.dive ? DIVE_COLOR[mark.dive] : "#7d808a" } as CSSProperties}
          >
            <span aria-hidden className="dw-mark-dot">
              {mark.i + 1}
            </span>
            <span className="dw-mark-text">
              <strong>{mark.stop.answer ?? (mark.stop.timedOut ? "Out of time" : "Lost in the fog")}</strong>
              <span>{mark.dive ? `${DIVES[mark.dive].name} · +${mark.stop.points}` : "+0"}</span>
            </span>
          </div>
        ))}

        <div aria-hidden className="dw-lantern">
          {/* Keyed per plunge so its streak replays; the lantern itself stays mounted and glides. */}
          <span key={plunge?.key ?? "still"} className="dw-lantern-trail" />
          <svg viewBox="-20 -34 40 60" className="dw-lantern-body">
            <path d="M0 -34 V-24" className="dw-chain" />
            <path d="M-9 -24 H9 L7 -19 H-7 Z" className="dw-brass" />
            <path d="M-8 -19 H8 L10 12 H-10 Z" className="dw-glass" />
            <path d="M-12 12 H12 L9 18 H-9 Z" className="dw-brass" />
            <ellipse cx="0" cy="-2" rx="4.5" ry="7" className="dw-flame" />
          </svg>
        </div>
      </div>

      {/* Fixed to the view: drifting motes that streak past while plunging, then a vignette. */}
      <div aria-hidden className="dw-motes">
        {MOTES.map((mote, k) => (
          <i key={k} style={{ left: `${mote.x}%`, top: `${mote.y}%`, animationDelay: `${-mote.d}s`, scale: String(mote.s) }} />
        ))}
      </div>
      {plunge?.dive && DIVES[plunge.dive].level >= 4 ? <div key={`flash-${plunge.key}`} aria-hidden className="dw-flash" /> : null}
      <div aria-hidden className="dw-vignette" />
    </div>
  );
}

/** The hall above the fog: crimson moon, pillars, the bronze table with seven chairs lit by the round's answers. */
function Sanctum({ round, shown, final }: { round: Round; shown: number; final: boolean }) {
  const CHAIRS = [
    { x: 262, y: 366, s: 1.15 },
    { x: 538, y: 366, s: 1.15 },
    { x: 302, y: 318, s: 0.9 },
    { x: 498, y: 318, s: 0.9 },
    { x: 336, y: 278, s: 0.7 },
    { x: 464, y: 278, s: 0.7 },
    { x: 400, y: 392, s: 1.25 },
  ];
  const stars = Array.from({ length: 30 }, (_, k) => ({ x: unit(7, k) * 800, y: 10 + unit(11, k) * 190, r: 0.8 + unit(13, k) * 1.6, d: unit(17, k) * 6 }));
  return (
    <svg className="dw-sanctum" viewBox="0 0 800 470" preserveAspectRatio="xMidYMax slice" aria-hidden style={{ height: SURF }}>
      <defs>
        <linearGradient id="dw-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#120c10" />
          <stop offset="60%" stopColor="#2b2226" />
          <stop offset="100%" stopColor="#4a4a52" />
        </linearGradient>
        <linearGradient id="dw-stone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1b1a1e" />
          <stop offset="45%" stopColor="#3a383d" />
          <stop offset="100%" stopColor="#141317" />
        </linearGradient>
        <linearGradient id="dw-bronze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a3a24" />
          <stop offset="60%" stopColor="#7a5a32" />
          <stop offset="100%" stopColor="#3a2a17" />
        </linearGradient>
        <radialGradient id="dw-moon">
          <stop offset="0%" stopColor="#ff4a5c" />
          <stop offset="60%" stopColor="#a3102a" />
          <stop offset="100%" stopColor="#5a0716" />
        </radialGradient>
        <radialGradient id="dw-moonglow">
          <stop offset="0%" stopColor="#e0263f" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#e0263f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dw-throneglow">
          <stop offset="0%" stopColor="#f2c14e" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f2c14e" stopOpacity="0" />
        </radialGradient>
        <filter id="dw-soft" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      <rect width="800" height="470" fill="url(#dw-sky)" />
      {stars.map((star, k) => (
        <circle key={k} className="dw-star" cx={star.x} cy={star.y} r={star.r} style={{ animationDelay: `${-star.d}s` }} />
      ))}
      <path d="M150 400 V150 Q150 40 400 28 Q650 40 650 150 V400 Z" fill="#141216" />
      <path d="M300 250 V140 Q300 78 400 70 Q500 78 500 140 V250 Z" fill="#231a20" />
      <circle cx="400" cy="140" r="90" fill="url(#dw-moonglow)" className="dw-moonglow" />
      <circle cx="400" cy="140" r="40" fill="url(#dw-moon)" className="dw-moon" />
      <path d="M300 250 V140 Q300 78 400 70 Q500 78 500 140 V250 M400 70 V250 M300 160 H500" fill="none" stroke="#3b3036" strokeWidth="4" />
      {[
        [0, 92],
        [96, 52],
        [158, 32],
      ].map(([x, w]) => (
        <g key={x}>
          <rect x={x} y="0" width={w} height="400" fill="url(#dw-stone)" />
          <rect x={x - 6} y="370" width={w + 12} height="14" fill="#2c2a30" />
          <rect x={x - 6} y="34" width={w + 12} height="12" fill="#2c2a30" />
          <rect x={800 - x - w} y="0" width={w} height="400" fill="url(#dw-stone)" />
          <rect x={800 - x - w - 6} y="370" width={w + 12} height="14" fill="#2c2a30" />
          <rect x={800 - x - w - 6} y="34" width={w + 12} height="12" fill="#2c2a30" />
        </g>
      ))}
      <path d="M0 400 L240 252 H560 L800 400 Z" fill="#26242a" />
      <ellipse cx="400" cy="232" rx="70" ry="40" fill="url(#dw-throneglow)" className="dw-throneglow" />
      <path d="M376 258 V190 Q376 168 400 160 Q424 168 424 190 V258 Z M366 258 H434 V264 H366 Z" className="dw-throne" />
      <path d="M400 168 L404 178 L414 178 L406 184 L409 194 L400 188 L391 194 L394 184 L386 178 L396 178 Z" className="dw-throne-star" />
      <path d="M368 262 L432 262 L520 378 L280 378 Z" fill="url(#dw-bronze)" stroke="#9a7444" strokeWidth="1.5" />
      {CHAIRS.map((chair, i) => {
        const stop = i < shown ? round.stops[i] : null;
        const dive = stop ? diveOf(stop.question, stop.answer, stop.tier) : null;
        return (
          <g
            key={i}
            className="dw-chair"
            data-lit={stop ? (dive ?? "miss") : undefined}
            transform={`translate(${chair.x} ${chair.y}) scale(${chair.s})`}
            style={{ "--dv": dive ? DIVE_COLOR[dive] : "#6b6e76" } as CSSProperties}
          >
            <path d="M-11 6 V-34 Q-11 -44 0 -47 Q11 -44 11 -34 V6 Z M-14 6 H14 V11 H-14 Z" className="dw-chair-back" />
            <path transform="translate(0 -62)" d="M0 -8 L2.4 -2.4 L8 -2.4 L3.6 1.2 L5.2 7 L0 3.6 L-5.2 7 L-3.6 1.2 L-8 -2.4 L-2.4 -2.4 Z" className="dw-chair-star" />
          </g>
        );
      })}
      <path d="M0 400 L80 410 L150 404 L230 416 L330 406 L420 418 L520 405 L610 414 L700 403 L800 412 V396 H0 Z" fill="#2a282e" />
      <g filter="url(#dw-soft)">
        <path className="dw-wave dw-wave-a" d={wave(408, 16, 0)} />
        <path className="dw-wave dw-wave-b" d={wave(432, 22, 1)} />
        <path className="dw-wave dw-wave-c" d={wave(458, 18, 2)} />
      </g>
      {final ? <circle cx="400" cy="232" r="2" className="dw-final-spark" /> : null}
    </svg>
  );
}

function wave(top: number, height: number, variant: number) {
  const step = 100;
  let d = `M-800 ${top}`;
  for (let x = -800; x < 1200; x += step) {
    const lift = ((Math.floor(x / step) + variant) % 2 === 0 ? -1 : 1) * height * 0.5;
    d += ` Q${x + step / 2} ${top + lift} ${x + step} ${top}`;
  }
  return `${d} V${top + 140} H-800 Z`;
}
