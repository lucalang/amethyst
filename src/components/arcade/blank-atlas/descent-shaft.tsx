"use client";

import { useMemo, type CSSProperties } from "react";
import { DIVES, STOPS, diveOf, hash, type Dive, type Round } from "@/lib/minigames/blank-atlas";

const W = 400;
const H = 920;
const SURFACE = 92;
const FLOOR = 872;
/** How far each dive sinks (in depth units); a stop let pass only drifts. The deepest possible round reaches the floor. */
const SINK: Record<Dive | "drift", number> = { drift: 16, familiar: 55, uncommon: 95, rare: 135, exceptional: 170, extraordinary: 205 };
const SCALE = (FLOOR - SURFACE) / (STOPS * SINK.extraordinary);
/** One fathom of the side gauge, in depth units. */
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

/** Depth units reached by the end of a round so far, for the "fathoms" readout. */
export function depthOf(round: Round) {
  return round.stops.reduce((sum, stop) => sum + SINK[diveOf(stop.question, stop.answer, stop.tier) ?? "drift"], 0);
}
export const fathoms = (depth: number) => Math.round(depth / 10);

/**
 * The descent: a shaft through gray fog. Each answer is one dive from the last landing, as deep and as bright as
 * its result (see SINK and DIVE_COLOR); a stop let pass only drifts. Nothing here is decoration from outside the
 * round: depth, sway and colour all come from the seven answers. `fresh` is the dive to animate (just answered).
 */
export function DescentShaft({ round, fresh, final, label }: { round: Round; fresh: number | null; final: boolean; label: string }) {
  const dives = useMemo(() => {
    const out: { i: number; dive: Dive | null; to: Point; path: string; name: string | null; left: boolean }[] = [];
    let from: Point = { x: W / 2, y: SURFACE };
    let depth = 0;
    for (const [i, stop] of round.stops.entries()) {
      const dive = diveOf(stop.question, stop.answer, stop.tier);
      const seed = hash(`${stop.question}:${stop.answer ?? `pass-${i}`}`);
      depth += SINK[dive ?? "drift"];
      const to = { x: Math.min(W - 78, Math.max(78, W / 2 + (unit(seed, 1) - 0.5) * 210)), y: SURFACE + depth * SCALE };
      const drop = to.y - from.y;
      const path = `M${from.x.toFixed(1)} ${from.y.toFixed(1)} C${from.x.toFixed(1)} ${(from.y + drop * 0.7).toFixed(1)} ${to.x.toFixed(1)} ${(to.y - drop * 0.55).toFixed(1)} ${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
      out.push({ i, dive, to, path, name: stop.answer, left: to.x > W / 2 });
      from = to;
    }
    return out;
  }, [round.stops]);

  const gauge = Array.from({ length: Math.floor((STOPS * SINK.extraordinary) / FATHOM) + 1 }, (_, k) => k);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="dv-shaft" data-final={final || undefined} preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="dv-abyss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3d44" />
          <stop offset="35%" stopColor="#202228" />
          <stop offset="100%" stopColor="#0b0b0e" />
        </linearGradient>
        <filter id="dv-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="22" />
        </filter>
        <filter id="dv-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.8  0 0 0 0 0.8  0 0 0 0 0.85  0 0 0 0.09 0" />
        </filter>
        <filter id="dv-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="dv-part">
          <stop offset="0%" stopColor="#0b0b0e" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#0b0b0e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="dv-lamp">
          <stop offset="0%" stopColor="#f6d99a" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f6d99a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width={W} height={H} fill="url(#dv-abyss)" />

      {/* The fog: slow, drifting banks of gray, densest near the surface. */}
      <g className="dv-fog" filter="url(#dv-blur)">
        <ellipse className="dv-bank dv-bank-a" cx="120" cy="190" rx="190" ry="70" />
        <ellipse className="dv-bank dv-bank-b" cx="300" cy="340" rx="170" ry="60" />
        <ellipse className="dv-bank dv-bank-c" cx="140" cy="520" rx="200" ry="70" />
        <ellipse className="dv-bank dv-bank-a" cx="290" cy="690" rx="180" ry="55" />
        <ellipse className="dv-bank dv-bank-b" cx="160" cy="830" rx="170" ry="45" />
      </g>

      {/* Fog parted by rare dives and deeper: darker clearings around their landings. */}
      {dives.map((d) =>
        d.dive && DIVES[d.dive].level >= 3 ? (
          <ellipse key={`part-${d.i}`} className="dv-part" data-fresh={d.i === fresh || undefined} cx={d.to.x} cy={d.to.y} rx={40 + DIVES[d.dive].level * 14} ry={24 + DIVES[d.dive].level * 7} fill="url(#dv-part)" />
        ) : null,
      )}

      {/* The threshold: a gas lamp and a clock over the iron grate where the descent begins. */}
      <g className="dv-surface" aria-hidden>
        <circle cx="200" cy="40" r="70" fill="url(#dv-lamp)" />
        <path d="M60 92 H340" className="dv-grate" />
        {Array.from({ length: 15 }, (_, k) => (
          <path key={k} d={`M${70 + k * 19} 86 V98`} className="dv-grate" />
        ))}
        <g transform="translate(330 44)">
          <circle r="22" className="dv-clock" />
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2;
            return <path key={k} d={`M${(Math.sin(a) * 17).toFixed(1)} ${(-Math.cos(a) * 17).toFixed(1)} L${(Math.sin(a) * 20).toFixed(1)} ${(-Math.cos(a) * 20).toFixed(1)}`} className="dv-clock-tick" />;
          })}
          <path d={`M0 0 L0 -13 M0 0 L${(Math.sin(((round.stops.length / STOPS) * 2 * Math.PI)) * 9).toFixed(1)} ${(-Math.cos((round.stops.length / STOPS) * 2 * Math.PI) * 9).toFixed(1)}`} className="dv-clock-hand" />
        </g>
        <g transform="translate(70 30)" className="dv-lamppost">
          <path d="M0 62 V8 M-6 62 H6" />
          <path d="M-7 8 H7 L5 -4 H-5 Z" />
          <circle cy="2" r="3.5" className="dv-flame" />
        </g>
      </g>

      {/* Depth gauge, in fathoms. */}
      <g className="dv-gauge-side" aria-hidden>
        {gauge.map((k) => {
          const y = SURFACE + k * FATHOM * SCALE;
          return (
            <g key={k} transform={`translate(18 ${y.toFixed(1)})`}>
              <path d="M0 0 H10" />
              {k % 2 === 0 ? <text x="14" y="4">{k * 10}</text> : null}
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
            {d.dive === "uncommon" || level >= 3 ? <path d={d.path} className="dv-trail-light" pathLength={1} /> : null}
            <path d={d.path} className="dv-trail" pathLength={1} filter={level >= 3 ? "url(#dv-glow)" : undefined} />
            {d.dive === "extraordinary" ? <path d={d.path} className="dv-core" pathLength={1} /> : null}
            <g className="dv-landing" transform={`translate(${d.to.x.toFixed(1)} ${d.to.y.toFixed(1)})`}>
              {level >= 4 ? (
                <>
                  <circle r="16" className="dv-ripple" />
                  <circle r="16" className="dv-ripple dv-ripple-late" />
                </>
              ) : null}
              {d.dive === "extraordinary" ? (
                <g className="dv-rays">
                  {Array.from({ length: 8 }, (_, k) => {
                    const a = (k / 8) * Math.PI * 2;
                    return <path key={k} d={`M${(Math.cos(a) * 15).toFixed(1)} ${(Math.sin(a) * 15).toFixed(1)} L${(Math.cos(a) * 30).toFixed(1)} ${(Math.sin(a) * 30).toFixed(1)}`} />;
                  })}
                </g>
              ) : null}
              <Sigil dive={d.dive} />
              <circle r="11" className="dv-num-ring" />
              <text y="4.5" textAnchor="middle" className="dv-num">
                {d.i + 1}
              </text>
              {d.name ? (
                <text x={d.left ? -20 : 20} y="5" textAnchor={d.left ? "end" : "start"} className="dv-label">
                  {shorten(d.name)}
                </text>
              ) : null}
            </g>
          </g>
        );
      })}

      {/* Where the next dive starts. */}
      {!final ? (
        <circle className="dv-next" cx={dives.at(-1)?.to.x ?? W / 2} cy={dives.at(-1)?.to.y ?? SURFACE} r="6" />
      ) : null}

      <rect width={W} height={H} filter="url(#dv-grain)" className="dv-grain" />
    </svg>
  );
}

/** The mark left where a dive lands; plainer for familiar answers, more ornate the rarer the answer. */
function Sigil({ dive }: { dive: Dive | null }) {
  switch (dive) {
    case "familiar":
      return <circle r="14" className="dv-sigil" />;
    case "uncommon":
      return (
        <g className="dv-sigil">
          <circle r="15" />
          <circle r="19" className="dv-sigil-thin" />
        </g>
      );
    case "rare":
      return (
        <g className="dv-sigil">
          <path d="M0 -20 L17 0 L0 20 L-17 0 Z" />
        </g>
      );
    case "exceptional":
      return (
        <g className="dv-sigil">
          <path d="M0 -22 L6 -6 L22 0 L6 6 L0 22 L-6 6 L-22 0 L-6 -6 Z" />
        </g>
      );
    case "extraordinary":
      return (
        <g className="dv-sigil">
          <path d="M-24 0 Q0 -20 24 0 Q0 20 -24 0 Z" />
          <circle r="7" className="dv-sigil-gold" />
        </g>
      );
    default:
      return <circle r="12" className="dv-sigil dv-sigil-drift" />;
  }
}
