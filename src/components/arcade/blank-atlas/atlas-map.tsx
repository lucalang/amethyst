"use client";

import { useMemo } from "react";
import { STOPS, TIERS, hash, questionById, type Round, type Tier } from "@/lib/minigames/blank-atlas";

const W = 1000;
const H = 560;
/** How far from the route each tier's discovery lies: rarer answers sit further out, across open water. */
const REACH: Record<Tier, number> = { 1: 40, 2: 70, 3: 122, 4: 176 };

type Point = { x: number; y: number };

/** A deterministic 0–1 value from a seed and a salt. */
const unit = (seed: number, salt: number) => (hash(`${seed}:${salt}`) % 10_000) / 10_000;

/** The route's seven stops: a gentle wave across the map, its phase set by the round. */
function stopPoints(roundId: string): Point[] {
  const phase = (hash(roundId) % 628) / 100;
  return Array.from({ length: STOPS }, (_, i) => ({ x: 92 + (i * (W - 184)) / (STOPS - 1), y: H / 2 + Math.sin(i * 1.1 + phase) * 78 }));
}

/** A smooth path through points (Catmull-Rom as cubic Béziers). */
function smooth(points: Point[]) {
  if (points.length < 2) return "";
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

/** A closed, softly irregular landmass around a centre; its outline comes from the seed (the answer itself). */
function blob(center: Point, radius: number, seed: number, points = 9) {
  const ring = Array.from({ length: points }, (_, k) => {
    const angle = (k / points) * Math.PI * 2;
    const r = radius * (0.72 + 0.4 * unit(seed, k));
    return { x: center.x + Math.cos(angle) * r * 1.25, y: center.y + Math.sin(angle) * r };
  });
  let d = "";
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k];
    const b = ring[(k + 1) % ring.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    d += k === 0 ? `M${mid.x.toFixed(1)} ${mid.y.toFixed(1)}` : "";
    const next = ring[(k + 2) % ring.length];
    const end = { x: (b.x + next.x) / 2, y: (b.y + next.y) / 2 };
    d += ` Q${b.x.toFixed(1)} ${b.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

const clampY = (y: number) => Math.min(H - 70, Math.max(56, y));
const shorten = (text: string, max = 22) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The expedition map. Every mark on it comes from the round: a patch of land for each charted stop, and each
 * discovery placed further from the route the rarer its answer was. Unanswered stops are open, dotted water.
 */
export function AtlasMap({ round, final, label }: { round: Round; final: boolean; label: string }) {
  const points = useMemo(() => stopPoints(round.id), [round.id]);
  const reached = round.stops.length;

  const finds = round.stops.map((stop, i) => {
    const at = points[i];
    if (stop.tier === null || stop.answer === null) return { i, at, spot: at, tier: null, seed: hash(`${round.id}:${i}`), name: null };
    const seed = hash(`${stop.question}:${stop.answer}`);
    const side = seed % 2 === 0 ? -1 : 1;
    // Keep discoveries on the map: flip to the other side when the far side would run off the edge.
    let y = at.y + side * REACH[stop.tier];
    if (y < 56 || y > H - 70) y = at.y - side * REACH[stop.tier];
    const spot = { x: at.x + (unit(seed, 99) - 0.5) * (stop.tier >= 3 ? 60 : 24), y: clampY(y) };
    return { i, at, spot, tier: stop.tier, seed, name: stop.answer };
  });

  const charted = smooth(points.slice(0, Math.max(1, reached)));
  const ahead = smooth(points.slice(Math.max(0, reached - 1)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="ba-map" data-final={final || undefined}>
      <defs>
        <radialGradient id="ba-sea" cx="50%" cy="45%" r="75%">
          <stop offset="0%" stopColor="#13305a" />
          <stop offset="70%" stopColor="#0b1d3a" />
          <stop offset="100%" stopColor="#07132a" />
        </radialGradient>
        <pattern id="ba-grid" width="62.5" height="62.5" patternUnits="userSpaceOnUse">
          <path d="M62.5 0H0V62.5" fill="none" stroke="#9cc9ff" strokeOpacity="0.07" strokeWidth="1" />
        </pattern>
        <filter id="ba-fog" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      <rect width={W} height={H} fill="url(#ba-sea)" />
      <rect width={W} height={H} fill="url(#ba-grid)" />

      {/* Land: one patch per charted stop, so the coast grows with the expedition. */}
      <g className="ba-land">
        {finds.map((find) =>
          find.tier === null ? (
            <circle key={`fog-${find.i}`} className="ba-new" cx={find.at.x} cy={find.at.y} r="46" fill="#b9d4ea" opacity="0.16" filter="url(#ba-fog)" />
          ) : (
            <path key={`land-${find.i}`} className="ba-new" d={blob(find.at, 50, find.seed)} />
          ),
        )}
      </g>

      {/* Islands for rarer discoveries, out across the water. */}
      <g className="ba-isles">
        {finds.map((find) =>
          find.tier !== null && find.tier >= 3 ? (
            <path key={`isle-${find.i}`} className="ba-new" data-tier={find.tier} d={blob(find.spot, find.tier === 4 ? 26 : 32, find.seed + 7, 7)} />
          ) : null,
        )}
      </g>

      {/* The route: charted so far, and the stops still ahead. */}
      {reached < STOPS ? <path d={ahead} className="ba-route-ahead" /> : null}
      {reached > 1 ? <path key={`route-${reached}`} d={charted} className="ba-route" pathLength={1} /> : null}

      {/* Side paths out to each discovery. */}
      {finds.map((find) =>
        find.tier !== null && find.tier >= 2 ? (
          <path
            key={`path-${find.i}`}
            className="ba-side ba-new"
            data-tier={find.tier}
            d={`M${find.at.x} ${find.at.y} Q${(find.at.x + find.spot.x) / 2 + (find.tier === 4 ? 40 : 14)} ${(find.at.y + find.spot.y) / 2} ${find.spot.x} ${find.spot.y}`}
          />
        ) : null,
      )}

      {/* Discoveries. */}
      {finds.map((find) => {
        if (find.tier === null) {
          return (
            <text key={`mark-${find.i}`} x={find.at.x} y={find.at.y + 10} className="ba-fog-mark ba-new" textAnchor="middle">
              ?
            </text>
          );
        }
        const { x, y } = find.spot;
        return (
          <g key={`mark-${find.i}`} className="ba-mark ba-new" data-tier={find.tier} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
            {find.tier === 1 ? (
              <g className="ba-town">
                <path d="M-15 4 L-9 -4 L-3 4 Z M-2 4 L5 -7 L12 4 Z" />
                <rect x="-16" y="4" width="29" height="7" rx="1.5" />
              </g>
            ) : find.tier === 2 ? (
              <g className="ba-hill">
                <path d="M-18 10 Q0 -18 18 10 Z" />
                <path d="M0 -8 V-24 L10 -20 L0 -16" className="ba-flag" />
              </g>
            ) : find.tier === 3 ? (
              <g className="ba-shore">
                <path d="M0 -14 L9 0 L0 14 L-9 0 Z" />
              </g>
            ) : (
              <g className="ba-uncharted">
                <circle r="20" className="ba-halo" />
                <path d="M0 -16 L4.5 -5 L16 -5 L6.5 2 L10 14 L0 6.5 L-10 14 L-6.5 2 L-16 -5 L-4.5 -5 Z" />
              </g>
            )}
            {find.name ? (
              <text y={find.tier === 2 ? 34 : 36} textAnchor="middle" className="ba-label">
                {shorten(find.name)}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Stop numbers along the route; the next stop glows while the expedition is under way. */}
      {points.map((point, i) => (
        <g key={`stop-${i}`} className="ba-stop" data-state={i < reached ? "done" : i === reached && !final ? "next" : "ahead"} transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}>
          <circle r="15" />
          <text y="6" textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}

      {final ? (
        <g className="ba-compass" transform={`translate(${W - 66} ${H - 66})`} aria-hidden>
          <circle r="34" />
          <path d="M0 -30 L6 0 L0 30 L-6 0 Z" />
          <text y="-38" textAnchor="middle">N</text>
        </g>
      ) : null}
    </svg>
  );
}

/** "Strange shore" etc. for a stop's tier, or the unmapped wording. */
export const tierName = (tier: Tier | null) => (tier === null ? "Unmapped" : TIERS[tier].name);
export const placeOf = (questionId: string) => questionById(questionId)?.place ?? "";
