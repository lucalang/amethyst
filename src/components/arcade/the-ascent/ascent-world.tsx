"use client";

import type { CSSProperties, ReactNode } from "react";
import { GROWTHS, METRES_PER_POINT, MAX_SCORE, ZONES, growthOf, type Growth, type Round } from "@/lib/minigames/the-ascent";
import { EDGE_KINDS, Edge, Ground, SCENERY, SIGHTS, type Scene } from "./ascent-art";

/*
 * The world of The Ascent: one tall column the camera climbs. The ground is at the bottom; every point grows the
 * beanstalk 10 metres, so a perfect round reaches the giant's castle at 7,000 m. Each answer's segment of the stalk
 * is drawn in its own colours, and everything that changes with play (height, segments, markers) comes from the
 * round. The camera keeps the climber at `--cam-at` from the top of the stage.
 */

export const GROWTH_COLOR: Record<Growth, string> = {
  giant: "#ffc93c",
  sprout: "#4ade80",
  vine: "#2dd4bf",
  shoot: "#7cc4ff",
  bud: "#c4b5fd",
};
const LEAF: Record<Growth, { fill: string; edge: string; size: number }> = {
  giant: { fill: "#ffd84a", edge: "#b8861e", size: 34 },
  sprout: { fill: "#5ee06a", edge: "#2f8a3a", size: 30 },
  vine: { fill: "#3fcfa8", edge: "#1f7a64", size: 26 },
  shoot: { fill: "#a4e88e", edge: "#4f9e3e", size: 20 },
  bud: { fill: "#d8ccff", edge: "#8a7ac8", size: 14 },
};

const PX = 0.85; // px per metre
const TOP = 520; // sky above 7,000 m
const GROUND_H = 330;
const CLIMB = MAX_SCORE * METRES_PER_POINT;
const WORLD_H = TOP + CLIMB * PX + GROUND_H;
const ROOT = WORLD_H - 70; // where the bean was planted (0 m)
export const yOf = (metres: number) => ROOT - metres * PX;

/** The stalk's sway: a fixed, gentle curve so the beanstalk winds the same way every time. */
const STALK_W = 320;
const stalkX = (metres: number) => STALK_W / 2 + Math.sin(metres / 300) * 46 + Math.sin(metres / 113) * 12;

const SKY: [number, string][] = [
  [0, "#c6ecff"],
  [800, "#a7deff"],
  [2200, "#93d2ff"],
  [4000, "#64aef8"],
  [5600, "#4b7fe2"],
  [6400, "#8b7ee6"],
  [7000, "#ffc98a"],
  [7600, "#ffe2b4"],
];
const ZONE_LIGHT: { from: number; to: number; color: string }[] = [
  { from: 0, to: 800, color: "rgb(255 236 150 / 0.35)" },
  { from: 800, to: 2200, color: "rgb(80 190 90 / 0.32)" },
  { from: 2200, to: 4000, color: "rgb(255 255 255 / 0.4)" },
  { from: 4000, to: 5600, color: "rgb(170 210 255 / 0.3)" },
  { from: 5600, to: 7400, color: "rgb(255 210 120 / 0.4)" },
];

const unit = (seed: number, salt: number) => {
  let x = Math.imul(seed ^ (salt * 0x9e3779b1), 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const FAR_CLOUDS = Array.from({ length: 22 }, (_, k) => ({ m: 400 + k * 320 + unit(3, k) * 160, x: unit(5, k) * 90 - 5, w: 28 + unit(7, k) * 30 }));
const NEAR_CLOUDS = Array.from({ length: 18 }, (_, k) => ({ m: 1800 + k * 300 + unit(11, k) * 120, x: unit(13, k) * 100 - 20, w: 34 + unit(17, k) * 30, d: unit(19, k) * 20 }));
const SEEDS = Array.from({ length: 30 }, (_, k) => ({ x: unit(23, k) * 100, y: unit(29, k) * 100, d: unit(31, k) * 9, s: 0.6 + unit(37, k) * 1.2 }));
const EDGE_SPANS = ZONES.map((zone, i) => {
  const from = zone.m;
  const to = i + 1 < ZONES.length ? ZONES[i + 1].m : CLIMB + 500;
  return { kind: EDGE_KINDS[i], top: yOf(to), height: (to - from) * PX };
});
const LANDMARKS = [...SIGHTS.map((sight) => ({ ...sight, zone: false })), ...ZONES.filter((zone) => zone.m > 0).map((zone) => ({ m: zone.m, text: zone.name, zone: true }))].sort((a, b) => a.m - b.m);

const FAR = 0.6;
const FORE = 1.3;

export type Climb = { from: number; to: number; growth: Growth | null; ms: number; key: number };

/** How long a segment takes to grow: a quick bud for a rare answer, a long surge for the crowd favourite. */
export const CLIMB_MS: Record<Growth | "miss", number> = { miss: 500, bud: 700, shoot: 1000, vine: 1400, sprout: 1800, giant: 2300 };

function ScenePiece({ scene, top }: { scene: Scene; top: number }) {
  const position: CSSProperties =
    scene.side === "c" ? { left: "50%", translate: "-50% -50%" } : scene.side === "l" ? { left: `${scene.inset ?? 0}cqw`, translate: "0 -50%" } : { right: `${scene.inset ?? 0}cqw`, translate: "0 -50%" };
  return (
    <div aria-hidden className="aw-scene" style={{ top, width: `${scene.width}cqw`, ...position }}>
      {scene.art}
    </div>
  );
}

/** One answer's stretch of beanstalk, with leaves in its own colours. `fresh` grows it in now. */
function Segment({ from, to, growth, fresh, index }: { from: number; to: number; growth: Growth; fresh: boolean; index: number }) {
  const points: string[] = [];
  for (let m = from; m < to; m += 20) points.push(`${stalkX(m).toFixed(1)} ${yOf(m).toFixed(1)}`);
  points.push(`${stalkX(to).toFixed(1)} ${yOf(to).toFixed(1)}`);
  const d = `M${points.join(" L")}`;
  const leaf = LEAF[growth];
  const leaves: ReactNode[] = [];
  const step = 52;
  let k = 0;
  for (let m = from + 26; m < to - 10; m += step, k++) {
    const side = (Math.floor(m / step) + index) % 2 === 0 ? -1 : 1;
    const x = stalkX(m);
    const y = yOf(m);
    const size = leaf.size * (0.85 + unit(index + 101, k) * 0.3);
    const angle = side * (35 + unit(index + 211, k) * 25);
    leaves.push(
      <g key={k} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle.toFixed(1)})`}>
        <g className="aw-leaf" style={{ "--t": `${((m - from) / Math.max(1, to - from)).toFixed(3)}` } as CSSProperties}>
          <path
            d={`M0 0 q${side * size * 0.6} ${-size * 0.7} ${side * size * 1.4} ${-size * 0.1} q${-side * size * 0.6} ${size * 0.55} ${-side * size * 1.4} ${size * 0.1} Z`}
            fill={leaf.fill}
            stroke={leaf.edge}
            strokeWidth="1.5"
          />
          {/* Midrib, side veins and a sheen, so each leaf reads as a leaf. */}
          <path d={`M0 0 Q${side * size * 0.7} ${-size * 0.18} ${side * size * 1.32} ${-size * 0.1}`} stroke={leaf.edge} strokeWidth="1" fill="none" />
          {[0.35, 0.65, 0.95].map((t) => (
            <path
              key={t}
              d={`M${side * size * t} ${-size * 0.14 * t} l${side * size * 0.14} ${-size * 0.16} M${side * size * t} ${-size * 0.14 * t} l${side * size * 0.12} ${size * 0.14}`}
              stroke={leaf.edge}
              strokeOpacity="0.55"
              strokeWidth="0.8"
            />
          ))}
          <path d={`M${side * size * 0.2} ${-size * 0.22} Q${side * size * 0.6} ${-size * 0.48} ${side * size * 1.05} ${-size * 0.28}`} stroke="#fff" strokeOpacity="0.35" strokeWidth="1.4" fill="none" />
        </g>
      </g>,
    );
    // Curling tendrils on longer stretches, and bean pods on the crowd favourite's golden growth.
    if (k % 3 === 2) {
      leaves.push(
        <path
          key={`t${k}`}
          className="aw-tendril"
          style={{ "--t": `${((m - from) / Math.max(1, to - from)).toFixed(3)}` } as CSSProperties}
          d={`M${x.toFixed(1)} ${y.toFixed(1)} q${-side * 18} -6 ${-side * 22} -20 q-4 -12 ${side * 6} -14 q8 2 ${-side * 2} 8`}
        />,
      );
    }
    if (growth === "giant" && k % 2 === 1) {
      leaves.push(
        <g key={`p${k}`} transform={`translate(${(x - side * 10).toFixed(1)} ${(y + 8).toFixed(1)})`}>
          <ellipse className="aw-pod" style={{ "--t": `${((m - from) / Math.max(1, to - from)).toFixed(3)}` } as CSSProperties} rx="6" ry="14" />
        </g>,
      );
    }
  }
  return (
    <g className="aw-seg" data-growth={growth} data-fresh={fresh || undefined} style={{ "--glow": GROWTH_COLOR[growth] } as CSSProperties}>
      <path d={d} className="aw-stalk-out" pathLength={1} />
      <path d={d} className="aw-stalk-in" pathLength={1} />
      <path d={d} className="aw-stalk-hi" pathLength={1} />
      {/* A node at the end of each answer's growth, like the joint on a real stem. */}
      <ellipse className="aw-node" cx={stalkX(to).toFixed(1)} cy={yOf(to).toFixed(1)} rx="14" ry="6" />
      {leaves}
    </g>
  );
}

export function AscentWorld({ round, height, climb, final }: { round: Round; height: number; climb: Climb | null; final: boolean }) {
  const sky = `linear-gradient(0deg, ${SKY.map(([m, color]) => `${color} ${Math.round(WORLD_H - yOf(m))}px`).join(", ")})`;
  const segments = round.stops.map((stop, i, all) => {
    const from = all.slice(0, i).reduce((sum, earlier) => sum + earlier.points * METRES_PER_POINT, 0);
    return { i, from, to: from + stop.points * METRES_PER_POINT, growth: growthOf(stop.question, stop.answer, stop.tier), stop };
  });
  const crossed = climb ? ([...ZONES].reverse().find((zone) => zone.m > 0 && zone.m > climb.from && zone.m <= climb.to) ?? null) : null;
  const tipX = stalkX(height);

  const style = {
    "--cam": `${yOf(height)}px`,
    "--root": `${ROOT}px`,
    "--dur": `${climb?.ms ?? 0}ms`,
    "--gw": climb?.growth ? GROWTH_COLOR[climb.growth] : "#ffffff",
  } as CSSProperties;

  return (
    <div className="aw" data-climb={climb?.growth ?? undefined} data-final={final || undefined} style={style}>
      {/* Back to front: the sky and each zone's light, far clouds and scenery (slower), then the world. */}
      <div aria-hidden className="aw-world" style={{ height: WORLD_H, background: sky }}>
        {ZONE_LIGHT.map((light) => (
          <span key={light.from} className="aw-light" style={{ top: yOf(light.to), height: (light.to - light.from) * PX, "--light": light.color } as CSSProperties} />
        ))}
      </div>
      <div aria-hidden className="aw-far" style={{ height: WORLD_H }}>
        {FAR_CLOUDS.map((cloud, k) => (
          <span key={k} className="aw-cloud" style={{ top: ROOT - (ROOT - yOf(cloud.m)) * FAR, left: `${cloud.x}%`, width: `${cloud.w}%` }} />
        ))}
        {SCENERY.filter((scene) => scene.layer === "far").map((scene) => (
          <ScenePiece key={`far-${scene.m}`} scene={scene} top={ROOT - (ROOT - yOf(scene.m)) * FAR} />
        ))}
      </div>

      <div className="aw-world" style={{ height: WORLD_H }}>
        {EDGE_SPANS.map((span) => (
          <div key={span.kind} aria-hidden className="aw-edges" data-kind={span.kind} style={{ top: span.top, height: span.height }}>
            <div className="aw-edge" data-side="l">
              <Edge kind={span.kind} height={span.height} side="l" />
            </div>
            <div className="aw-edge" data-side="r">
              <Edge kind={span.kind} height={span.height} side="r" />
            </div>
          </div>
        ))}
        {SCENERY.filter((scene) => scene.layer === "near").map((scene) => (
          <ScenePiece key={`near-${scene.m}`} scene={scene} top={yOf(scene.m)} />
        ))}
        {LANDMARKS.map((mark, k) => (
          <p key={mark.m} aria-hidden className="aw-landmark" data-zone={mark.zone || undefined} data-side={k % 2 ? "r" : "l"} style={{ top: yOf(mark.m) }}>
            {mark.text}
          </p>
        ))}
        <div aria-hidden className="aw-gauge">
          {Array.from({ length: CLIMB / 500 + 1 }, (_, k) => (
            <span key={k} style={{ top: yOf(k * 500) }}>
              {(k * 500).toLocaleString("en")} m
            </span>
          ))}
        </div>

        <div aria-hidden className="aw-ground" style={{ height: GROUND_H }}>
          <Ground />
        </div>

        {/* The beanstalk: a seedling at first, then one coloured stretch per answer. */}
        <svg aria-hidden className="aw-stalk" viewBox={`0 0 ${STALK_W} ${WORLD_H}`} style={{ height: WORLD_H, width: STALK_W }}>
          <path d={`M${stalkX(0)} ${ROOT + 6} q-4 -14 0 -26`} className="aw-seedling" />
          {segments.map((segment) =>
            segment.growth && segment.to > segment.from ? (
              <Segment key={segment.i} index={segment.i} from={segment.from} to={segment.to} growth={segment.growth} fresh={climb !== null && segment.i === segments.length - 1} />
            ) : null,
          )}
          <g className="aw-tip" style={{ transform: `translate(${tipX.toFixed(1)}px, ${yOf(height).toFixed(1)}px)` }}>
            <path d="M0 4 q-10 -10 -4 -22 q8 6 4 22 Z M0 4 q10 -10 4 -22 q-8 6 -4 22 Z" />
          </g>
        </svg>

        {segments.map((segment) => (
          <div
            key={`mark-${segment.i}`}
            className="aw-mark"
            data-growth={segment.growth ?? "miss"}
            data-side={segment.i % 2 ? "r" : "l"}
            data-fresh={(climb !== null && segment.i === segments.length - 1) || undefined}
            style={{ top: yOf(segment.to) - (segment.to === segment.from ? 18 * (segment.i % 3) : 0), "--gw": segment.growth ? GROWTH_COLOR[segment.growth] : "#9aa3ad" } as CSSProperties}
          >
            <span aria-hidden className="aw-mark-dot">
              {segment.i + 1}
            </span>
            <span className="aw-mark-text">
              <strong>{segment.stop.answer ?? (segment.stop.timedOut ? "Out of time" : "Wilted")}</strong>
              <span>{segment.growth ? `${GROWTHS[segment.growth].name} · +${segment.stop.points}` : "+0"}</span>
            </span>
          </div>
        ))}

        {/* The climber, riding the tip. */}
        <div aria-hidden className="aw-climber" style={{ left: `calc(50% - ${STALK_W / 2}px + ${tipX}px)` }}>
          <span key={climb?.key ?? "still"} className="aw-climber-trail" />
          <svg viewBox="-20 -40 40 50" className="aw-climber-body">
            <path d="M-8 6 L-12 -8 Q-12 -20 0 -20 Q12 -20 12 -8 L8 6 Z" fill="#e8463c" />
            <rect x="-14" y="-14" width="8" height="14" rx="3" fill="#a86a32" />
            <circle cx="0" cy="-26" r="9" fill="#ffd7b0" />
            <path d="M-10 -28 Q0 -44 10 -28 Q4 -34 0 -32 Q-4 -34 -10 -28 Z" fill="#4f9e3e" />
            <circle cx="-3" cy="-26" r="1.4" fill="#2a1a0a" />
            <circle cx="4" cy="-26" r="1.4" fill="#2a1a0a" />
            <path d="M-12 -8 L-18 -24 M12 -8 L18 -24" stroke="#ffd7b0" strokeWidth="4" strokeLinecap="round" className="aw-arms" />
          </svg>
        </div>
      </div>

      <div aria-hidden className="aw-fore" style={{ height: WORLD_H }}>
        {NEAR_CLOUDS.map((cloud, k) => (
          <span key={k} style={{ top: ROOT - (ROOT - yOf(cloud.m)) * FORE, left: `${cloud.x}%`, width: `${cloud.w}%`, animationDelay: `${-cloud.d}s` }} />
        ))}
      </div>

      <div aria-hidden className="aw-seeds">
        {SEEDS.map((seed, k) => (
          <i key={k} style={{ left: `${seed.x}%`, top: `${seed.y}%`, animationDelay: `${-seed.d}s`, scale: String(seed.s) }} />
        ))}
      </div>
      {climb?.growth && GROWTHS[climb.growth].level >= 4 ? <div key={`flash-${climb.key}`} aria-hidden className="aw-flash" /> : null}
      {crossed ? (
        <div key={`zone-${climb?.key}`} className="aw-zone" style={{ "--delay": `${Math.round((climb?.ms ?? 0) * 0.45)}ms` } as CSSProperties}>
          <span>Rising into</span>
          <strong>{crossed.name}</strong>
        </div>
      ) : null}
    </div>
  );
}
