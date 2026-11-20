"use client";

import { useMemo, type CSSProperties } from "react";
import { DIVES, STOPS, diveOf, hash, type Dive, type Round } from "@/lib/minigames/blank-atlas";

/*
 * The world of The Descent, top to bottom:
 *   the Sanctum, a stone hall floating above the fog, with a crimson moon, pillars, a long bronze table and
 *   seven high-backed chairs (one per question) before an empty throne;
 *   the sea of gray fog that hides everything below the hall's edge;
 *   the descent itself, where each answer dives from the last landing, deeper and brighter the rarer it was.
 * Everything that changes with play comes from the round: lit chairs, dives, depth, colours.
 */

const W = 800;
const H = 1120;
const HALL = 400; // where the hall's floor breaks off into the fog
const SURFACE = 452; // first dive starts here, just under the fog's surface
const FLOOR = 1090;
const CX = W / 2;

const SINK: Record<Dive | "drift", number> = { drift: 16, familiar: 55, uncommon: 95, rare: 135, exceptional: 170, extraordinary: 205 };
const SCALE = (FLOOR - SURFACE) / (STOPS * SINK.extraordinary);
const FATHOM = 100;

export const DIVE_COLOR: Record<Dive, string> = {
  familiar: "#d5d9e0",
  uncommon: "#3fd0b8",
  rare: "#4f8dff",
  exceptional: "#a46bff",
  extraordinary: "#e0263f",
};

type Point = { x: number; y: number };
const unit = (seed: number, salt: number) => (hash(`${seed}:${salt}`) % 10_000) / 10_000;
const shorten = (text: string, max = 20) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function depthOf(round: Round) {
  return round.stops.reduce((sum, stop) => sum + SINK[diveOf(stop.question, stop.answer, stop.tier) ?? "drift"], 0);
}
export const fathoms = (depth: number) => Math.round(depth / 10);

/** The seven chairs along the table, nearest first; the seventh sits at the near end, facing the throne. */
const CHAIRS: { x: number; y: number; s: number; side: -1 | 0 | 1 }[] = [
  { x: 262, y: 366, s: 1.15, side: -1 },
  { x: 538, y: 366, s: 1.15, side: 1 },
  { x: 302, y: 318, s: 0.9, side: -1 },
  { x: 498, y: 318, s: 0.9, side: 1 },
  { x: 336, y: 278, s: 0.7, side: -1 },
  { x: 464, y: 278, s: 0.7, side: 1 },
  { x: 400, y: 392, s: 1.25, side: 0 },
];

/** Stars in the hall's sky and embers drifting up from the fog: fixed positions, so the world is stable. */
const STARS = Array.from({ length: 34 }, (_, k) => ({ x: unit(7, k) * W, y: 12 + unit(11, k) * 190, r: 0.8 + unit(13, k) * 1.8, d: unit(17, k) * 6 }));
const EMBERS = Array.from({ length: 22 }, (_, k) => ({ x: unit(19, k) * W, y: 380 + unit(23, k) * 560, d: unit(29, k) * 9, s: 7 + unit(31, k) * 8 }));

export function DescentShaft({ round, fresh, final, label, hidden = 0 }: { round: Round; fresh: number | null; final: boolean; label: string; hidden?: number }) {
  // `hidden` dives at the end are still being revealed and aren't drawn yet.
  const shown = round.stops.length - hidden;
  const dives = useMemo(() => {
    const out: { i: number; dive: Dive | null; to: Point; path: string; name: string | null; left: boolean }[] = [];
    let from: Point = { x: CX, y: SURFACE };
    let depth = 0;
    for (const [i, stop] of round.stops.slice(0, shown).entries()) {
      const dive = diveOf(stop.question, stop.answer, stop.tier);
      const seed = hash(`${stop.question}:${stop.answer ?? `pass-${i}`}`);
      depth += SINK[dive ?? "drift"];
      const to = { x: Math.min(CX + 170, Math.max(CX - 170, CX + (unit(seed, 1) - 0.5) * 300)), y: SURFACE + depth * SCALE };
      const drop = to.y - from.y;
      const path = `M${from.x.toFixed(1)} ${from.y.toFixed(1)} C${from.x.toFixed(1)} ${(from.y + drop * 0.7).toFixed(1)} ${to.x.toFixed(1)} ${(to.y - drop * 0.55).toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
      out.push({ i, dive, to, path, name: stop.answer, left: to.x > CX });
      from = to;
    }
    return out;
  }, [round.stops, shown]);
  const gauge = Array.from({ length: Math.floor((STOPS * SINK.extraordinary) / FATHOM) + 1 }, (_, k) => k);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="dv-shaft" data-final={final || undefined} preserveAspectRatio="xMidYMin slice">
      <defs>
        <linearGradient id="dv-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#120c10" />
          <stop offset="55%" stopColor="#2b2226" />
          <stop offset="100%" stopColor="#4a4a52" />
        </linearGradient>
        <linearGradient id="dv-abyss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#55575f" />
          <stop offset="18%" stopColor="#2a2b31" />
          <stop offset="100%" stopColor="#08080b" />
        </linearGradient>
        <linearGradient id="dv-stone" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1b1a1e" />
          <stop offset="45%" stopColor="#3a383d" />
          <stop offset="100%" stopColor="#141317" />
        </linearGradient>
        <linearGradient id="dv-bronze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a3a24" />
          <stop offset="60%" stopColor="#7a5a32" />
          <stop offset="100%" stopColor="#3a2a17" />
        </linearGradient>
        <linearGradient id="dv-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1f1d22" />
          <stop offset="100%" stopColor="#38363c" />
        </linearGradient>
        <radialGradient id="dv-moon">
          <stop offset="0%" stopColor="#ff4a5c" />
          <stop offset="60%" stopColor="#a3102a" />
          <stop offset="100%" stopColor="#5a0716" />
        </radialGradient>
        <radialGradient id="dv-moonglow">
          <stop offset="0%" stopColor="#e0263f" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#e0263f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dv-throneglow">
          <stop offset="0%" stopColor="#f2c14e" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f2c14e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dv-part">
          <stop offset="0%" stopColor="#060608" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#060608" stopOpacity="0" />
        </radialGradient>
        <filter id="dv-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
        <filter id="dv-soft" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id="dv-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.8  0 0 0 0 0.8  0 0 0 0 0.85  0 0 0 0.08 0" />
        </filter>
        <filter id="dv-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Below everything: the abyss the dives fall into. */}
      <rect y={HALL - 40} width={W} height={H - HALL + 40} fill="url(#dv-abyss)" />

      {/* ---- The Sanctum ---- */}
      <g className="dv-hall" aria-hidden>
        <rect width={W} height={HALL} fill="url(#dv-sky)" />
        {STARS.map((star, k) => (
          <circle key={k} className="dv-star" cx={star.x} cy={star.y} r={star.r} style={{ animationDelay: `${-star.d}s` }} />
        ))}
        {/* Back wall with a tall arched window and the crimson moon beyond it. */}
        <path d={`M150 ${HALL} V150 Q150 40 400 28 Q650 40 650 150 V${HALL} Z`} fill="#141216" />
        <path d="M300 250 V140 Q300 78 400 70 Q500 78 500 140 V250 Z" fill="#231a20" />
        <circle cx="400" cy="140" r="90" fill="url(#dv-moonglow)" className="dv-moonglow" />
        <circle cx="400" cy="140" r="40" fill="url(#dv-moon)" className="dv-moon" />
        <path d="M300 250 V140 Q300 78 400 70 Q500 78 500 140 V250 M400 70 V250 M300 160 H500" fill="none" stroke="#3b3036" strokeWidth="4" />
        {/* Pillars, receding toward the throne. */}
        {[
          [0, 92],
          [96, 52],
          [158, 32],
        ].map(([x, w]) => (
          <g key={x}>
            <rect x={x} y="0" width={w} height={HALL} fill="url(#dv-stone)" />
            <rect x={x - 6} y={HALL - 30} width={w + 12} height="14" fill="#2c2a30" />
            <rect x={x - 6} y="34" width={w + 12} height="12" fill="#2c2a30" />
            <rect x={W - x - w} y="0" width={w} height={HALL} fill="url(#dv-stone)" />
            <rect x={W - x - w - 6} y={HALL - 30} width={w + 12} height="14" fill="#2c2a30" />
            <rect x={W - x - w - 6} y="34" width={w + 12} height="12" fill="#2c2a30" />
          </g>
        ))}
        {/* Floor, then the throne at the far end and the long bronze table. */}
        <path d={`M0 ${HALL} L240 252 H560 L${W} ${HALL} Z`} fill="url(#dv-floor)" />
        <ellipse cx="400" cy="232" rx="70" ry="40" fill="url(#dv-throneglow)" className="dv-throneglow" />
        <path d="M376 258 V190 Q376 168 400 160 Q424 168 424 190 V258 Z M366 258 H434 V264 H366 Z" className="dv-throne" />
        <path d="M400 168 L404 178 L414 178 L406 184 L409 194 L400 188 L391 194 L394 184 L386 178 L396 178 Z" className="dv-throne-star" />
        <path d="M368 262 L432 262 L520 378 L280 378 Z" fill="url(#dv-bronze)" stroke="#9a7444" strokeWidth="1.5" />
        <path d="M376 270 L424 270 M352 300 L448 300 M328 332 L472 332" stroke="#5c4428" strokeWidth="1" opacity="0.6" />
        {CHAIRS.map((chair, i) => {
          const stop = i < shown ? round.stops[i] : null;
          const dive = stop ? diveOf(stop.question, stop.answer, stop.tier) : null;
          const lit = i < shown;
          const color = dive ? DIVE_COLOR[dive] : "#8a8f98";
          return (
            <g
              key={i}
              className="dv-chair"
              data-lit={lit || undefined}
              data-dive={lit ? (dive ?? "drift") : undefined}
              data-fresh={i === fresh || undefined}
              transform={`translate(${chair.x} ${chair.y}) scale(${chair.s})`}
              style={{ "--dv": color } as CSSProperties}
            >
              <path d="M-11 6 V-34 Q-11 -44 0 -47 Q11 -44 11 -34 V6 Z M-14 6 H14 V11 H-14 Z" className="dv-chair-back" />
              <g transform="translate(0 -62)">
                <circle r="13" className="dv-chair-halo" />
                <path d="M0 -8 L2.4 -2.4 L8 -2.4 L3.6 1.2 L5.2 7 L0 3.6 L-5.2 7 L-3.6 1.2 L-8 -2.4 L-2.4 -2.4 Z" className="dv-chair-star" />
              </g>
            </g>
          );
        })}
        {/* The broken edge of the hall's floor, where the fog takes over. */}
        <path d={`M0 ${HALL} L80 ${HALL + 10} L150 ${HALL + 4} L230 ${HALL + 16} L330 ${HALL + 6} L420 ${HALL + 18} L520 ${HALL + 5} L610 ${HALL + 14} L700 ${HALL + 3} L${W} ${HALL + 12} V${HALL - 4} H0 Z`} fill="#2a282e" />
      </g>

      {/* ---- The sea of gray fog ---- */}
      <g className="dv-sea" aria-hidden>
        <g filter="url(#dv-soft)">
          <path className="dv-wave dv-wave-a" d={wave(HALL + 8, 16, 0)} />
          <path className="dv-wave dv-wave-b" d={wave(HALL + 32, 22, 1)} />
          <path className="dv-wave dv-wave-c" d={wave(HALL + 64, 18, 2)} />
        </g>
        <g filter="url(#dv-blur)">
          <ellipse className="dv-bank dv-bank-a" cx="200" cy="560" rx="260" ry="60" />
          <ellipse className="dv-bank dv-bank-b" cx="620" cy="700" rx="240" ry="55" />
          <ellipse className="dv-bank dv-bank-c" cx="260" cy="860" rx="280" ry="60" />
          <ellipse className="dv-bank dv-bank-a" cx="600" cy="1010" rx="240" ry="50" />
        </g>
        {EMBERS.map((ember, k) => (
          <circle key={k} className="dv-ember" cx={ember.x} cy={ember.y} r="1.6" style={{ animationDelay: `${-ember.d}s`, animationDuration: `${ember.s}s` }} />
        ))}
      </g>

      {/* Fog parted by rare dives and deeper. */}
      {dives.map((d) =>
        d.dive && DIVES[d.dive].level >= 3 ? (
          <ellipse key={`part-${d.i}`} className="dv-part" data-fresh={d.i === fresh || undefined} cx={d.to.x} cy={d.to.y} rx={50 + DIVES[d.dive].level * 18} ry={28 + DIVES[d.dive].level * 8} fill="url(#dv-part)" />
        ) : null,
      )}

      {/* Depth gauge, in fathoms. */}
      <g className="dv-gauge-side" aria-hidden>
        {gauge.map((k) => {
          const y = SURFACE + k * FATHOM * SCALE;
          return (
            <g key={k} transform={`translate(${CX - 236} ${y.toFixed(1)})`}>
              <path d="M0 0 H12" />
              {k % 2 === 0 ? <text x="17" y="4">{k * 10}</text> : null}
            </g>
          );
        })}
      </g>

      {/* The dives. */}
      {dives.map((d) => {
        const style = { "--dv": d.dive ? DIVE_COLOR[d.dive] : "#8a8f98" } as CSSProperties;
        const level = d.dive ? DIVES[d.dive].level : 0;
        return (
          <g key={`dive-${d.i}`} className="dv-dive" data-dive={d.dive ?? "drift"} data-fresh={d.i === fresh || undefined} style={style}>
            {level >= 2 ? <path d={d.path} className="dv-trail-light" pathLength={1} /> : null}
            <path d={d.path} className="dv-trail" pathLength={1} filter={level >= 3 ? "url(#dv-glow)" : undefined} />
            {d.dive === "extraordinary" ? <path d={d.path} className="dv-core" pathLength={1} /> : null}
            <g className="dv-landing" transform={`translate(${d.to.x.toFixed(1)} ${d.to.y.toFixed(1)})`}>
              {level >= 3 ? (
                <>
                  <circle r="16" className="dv-ripple" />
                  <circle r="16" className="dv-ripple dv-ripple-late" />
                </>
              ) : null}
              {d.dive === "extraordinary" ? (
                <g className="dv-rays">
                  {Array.from({ length: 12 }, (_, k) => {
                    const a = (k / 12) * Math.PI * 2;
                    return <path key={k} d={`M${(Math.cos(a) * 16).toFixed(1)} ${(Math.sin(a) * 16).toFixed(1)} L${(Math.cos(a) * 38).toFixed(1)} ${(Math.sin(a) * 38).toFixed(1)}`} />;
                  })}
                </g>
              ) : null}
              <Sigil dive={d.dive} />
              <circle r="11" className="dv-num-ring" />
              <text y="4.5" textAnchor="middle" className="dv-num">
                {d.i + 1}
              </text>
              {d.name ? (
                <text x={d.left ? -24 : 24} y="5" textAnchor={d.left ? "end" : "start"} className="dv-label">
                  {shorten(d.name)}
                </text>
              ) : null}
            </g>
          </g>
        );
      })}

      {!final ? <circle className="dv-next" cx={dives.at(-1)?.to.x ?? CX} cy={dives.at(-1)?.to.y ?? SURFACE} r="7" /> : null}

      <rect width={W} height={H} filter="url(#dv-grain)" className="dv-grain" />
    </svg>
  );
}

/** A band of fog: a wave twice the scene's width, so drifting it sideways loops without a seam. */
function wave(top: number, height: number, variant: number) {
  const step = 100;
  let d = `M${-W} ${top}`;
  for (let x = -W; x < W * 1.5; x += step) {
    const lift = ((Math.floor(x / step) + variant) % 2 === 0 ? -1 : 1) * height * 0.5;
    d += ` Q${x + step / 2} ${top + lift} ${x + step} ${top}`;
  }
  return `${d} V${top + 140} H${-W} Z`;
}

function Sigil({ dive }: { dive: Dive | null }) {
  switch (dive) {
    case "familiar":
      return <circle r="14" className="dv-sigil" />;
    case "uncommon":
      return (
        <g className="dv-sigil">
          <circle r="15" />
          <circle r="20" className="dv-sigil-thin" />
        </g>
      );
    case "rare":
      return (
        <g className="dv-sigil">
          <path d="M0 -21 L18 0 L0 21 L-18 0 Z" />
        </g>
      );
    case "exceptional":
      return (
        <g className="dv-sigil">
          <path d="M0 -24 L6.5 -6.5 L24 0 L6.5 6.5 L0 24 L-6.5 6.5 L-24 0 L-6.5 -6.5 Z" />
        </g>
      );
    case "extraordinary":
      return (
        <g className="dv-sigil">
          <path d="M-27 0 Q0 -22 27 0 Q0 22 -27 0 Z" />
          <circle r="8" className="dv-sigil-gold" />
        </g>
      );
    default:
      return <circle r="12" className="dv-sigil dv-sigil-drift" />;
  }
}
