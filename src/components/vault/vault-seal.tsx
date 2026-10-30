"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { MotionLevel } from "@/lib/preferences";

/** idle: rings drift · verifying: they spin up · align: they lock into line under the top marker · still: they coast to a stop. */
export type SealMode = "idle" | "verifying" | "align" | "still";

/** Deterministic 0–1 noise, identical on server and client. */
export const noise = (index: number, salt: number) => (((index + 1) * 9301 + salt * 49297) % 233280) / 233280;
/** A point on a circle, clockwise from 12 o'clock. */
const at = (radius: number, degrees: number) => {
  const rad = (degrees * Math.PI) / 180;
  return `${(radius * Math.sin(rad)).toFixed(2)},${(-radius * Math.cos(rad)).toFixed(2)}`;
};
const arc = (radius: number, from: number, to: number) => `M${at(radius, from)} A${radius},${radius} 0 0 1 ${at(radius, to)}`;

/** Original rune marks engraved on the middle ring (the 3D vault engraves the same ones). */
export const GLYPHS = [
  "M0,-3 V3 M0,-1.1 L2.1,-2.8",
  "M-2,3 L0,-3 L2,3",
  "M0,-3 V3 M0,-0.5 L2,0.9 L0,2.4",
  "M-1.9,-2.7 H1.9 M0,-2.7 V3 M-1.4,0.6 H1.4",
  "M-1.9,-3 L1.9,3 M1.9,-3 L-1.9,3",
  "M0,-3 V3 M-2.1,-1 L0,0.7 L2.1,-1",
  "M-1.7,3 V-3 L1.7,-1 L-1.7,1",
];
const RUNES = Array.from({ length: 29 }, (_, index) => ({
  angle: ((index + 1) * 360) / 30,
  d: GLYPHS[(index * 5 + ((index * index) % 4)) % GLYPHS.length],
}));
const TICKS = Array.from({ length: 72 }, (_, index) => `M${at(index % 6 ? 141 : 136, index * 5)} L${at(146, index * 5)}`).join(" ");
const SEGMENTS = Array.from({ length: 24 }, (_, index) => {
  const from = index * 15 + 1.8;
  const to = (index + 1) * 15 - 1.8;
  return `${arc(132, from, to)} L${at(124, to)} A124,124 0 0 0 ${at(124, from)} Z`;
});
const STAR = [0, 45].map((turn) => `M${[0, 90, 180, 270].map((angle) => at(86, angle + turn)).join(" L")} Z`).join(" ");
const VERTICES = Array.from({ length: 8 }, (_, index) => at(86, index * 45).split(",").map(Number));
const TEETH = Array.from({ length: 8 }, (_, index) => 22.5 + index * 45);
const RAYS = Array.from({ length: 12 }, (_, index) => `M${at(60, index * 30 - 2)} L${at(250, index * 30)} L${at(60, index * 30 + 2)} Z`).join(" ");
const SHARDS = Array.from({ length: 16 }, (_, index) => ({
  "--a": `${Math.round((index * 360) / 16 + noise(index, 7) * 16)}deg`,
  "--r": `${Math.round(120 + noise(index, 8) * 110)}px`,
  "--spin": `${Math.round((noise(index, 9) - 0.5) * 540)}deg`,
  "--delay": `${Math.round(noise(index, 10) * 140)}ms`,
})) as CSSProperties[];
/** Degrees per second while idle; the rings turn against each other. */
const DRIFT = [4, -7, 11];

/**
 * The seal on the Vault door (original artwork). The three rings are turned from script so speed
 * changes stay smooth; the loop sleeps offscreen, in hidden tabs and once the rings have settled.
 */
export function VaultSeal({ mode, level, phase, motion }: { mode: SealMode; level: number; phase: string; motion: MotionLevel }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const ringRefs = useRef<(SVGGElement | null)[]>([]);
  const angles = useRef([0, 0, 0]);
  const speeds = useRef([...DRIFT]);
  const modeRef = useRef(mode);
  const lastLevel = useRef(level);
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    modeRef.current = mode;
    wake.current();
  }, [mode]);

  // Each new character knocks the rings a little.
  useEffect(() => {
    if (level > lastLevel.current && motion !== "off") {
      speeds.current.forEach((value, index, list) => (list[index] = value + (index % 2 ? -10 : 10)));
      wake.current();
    }
    lastLevel.current = level;
  }, [level, motion]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const angle = angles.current;
    const speed = speeds.current;
    const draw = () => ringRefs.current.forEach((ring, index) => ring?.setAttribute("transform", `rotate(${(angle[index] % 360).toFixed(2)})`));
    if (motion === "off") {
      wake.current = () => {
        if (modeRef.current === "align") angle.fill(0);
        draw();
      };
      wake.current();
      return () => {
        wake.current = () => {};
      };
    }
    const scale = motion === "subtle" ? 0.5 : 1;
    const targets: (number | null)[] = [null, null, null];
    let frame = 0;
    let last = 0;
    let onscreen = true;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      let moving = false;
      for (let index = 0; index < 3; index += 1) {
        if (modeRef.current === "align") {
          if (targets[index] === null) {
            targets[index] = speed[index] >= 0 ? Math.ceil((angle[index] + 60) / 360) * 360 : Math.floor((angle[index] - 60) / 360) * 360;
          }
          const target = targets[index]!;
          // Critically damped spring: the rings lock without overshooting the marker.
          speed[index] += (-30 * (angle[index] - target) - 2 * Math.sqrt(30) * speed[index]) * dt;
          angle[index] += speed[index] * dt;
          if (Math.abs(angle[index] - target) < 0.05 && Math.abs(speed[index]) < 1) {
            angle[index] = target;
            speed[index] = 0;
          } else moving = true;
        } else {
          targets[index] = null;
          const verifying = modeRef.current === "verifying";
          const still = modeRef.current === "still";
          const goal = still ? 0 : DRIFT[index] * scale * (verifying ? 14 : 1);
          speed[index] += (goal - speed[index]) * (1 - Math.exp(-dt * (verifying ? 2.5 : 1.2)));
          angle[index] = (angle[index] + speed[index] * dt) % 360;
          if (still && Math.abs(speed[index]) < 0.05) speed[index] = 0;
          else moving = true;
        }
      }
      draw();
      frame = moving && onscreen && !document.hidden ? requestAnimationFrame(tick) : 0;
    };
    const start = () => {
      if (frame || !onscreen || document.hidden) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    wake.current = start;
    const observer = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      if (onscreen) start();
    });
    observer.observe(svg);
    document.addEventListener("visibilitychange", start);
    start();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", start);
      wake.current = () => {};
    };
  }, [motion]);

  const lit = Math.min(SEGMENTS.length, level * 2);

  return (
    <div aria-hidden className="vx-seal">
      <div className="vx-seal-shake">
        <svg ref={svgRef} viewBox="-160 -160 320 320" className="vx-seal-svg">
          <defs>
            <radialGradient id="vx-core-light" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#fff5f6" />
              <stop offset="0.3" stopColor="#ff8a9a" stopOpacity="0.95" />
              <stop offset="0.65" stopColor="#ff1f3d" stopOpacity="0.45" />
              <stop offset="1" stopColor="#a10a1f" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="vx-bloom" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#ff1f3d" stopOpacity="0.3" />
              <stop offset="0.6" stopColor="#a10a1f" stopOpacity="0.1" />
              <stop offset="1" stopColor="#a10a1f" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="vx-plate" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1d0b0f" />
              <stop offset="0.55" stopColor="#0e0607" />
              <stop offset="1" stopColor="#050304" />
            </linearGradient>
            <linearGradient id="vx-trail" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff1f3d" stopOpacity="0" />
              <stop offset="1" stopColor="#ff1f3d" stopOpacity="0.28" />
            </linearGradient>
            <clipPath id="vx-seal-clip">
              <circle r="147" />
            </clipPath>
          </defs>

          <circle r="158" fill="url(#vx-bloom)" className="vx-bloom" />
          <path d={RAYS} className="vx-rays" />
          <path d="M-158,-116 V-158 H-116 M116,-158 H158 V-116 M158,116 V158 H116 M-116,158 H-158 V116" className="vx-brackets" />
          <path d="M0,-149 L-6,-158 H6 Z" className="vx-marker" />

          <g
            ref={(node) => {
              ringRefs.current[0] = node;
            }}
          >
            <circle r="146" className="vx-line" />
            <path d={TICKS} className="vx-ticks" pathLength={1} />
            <path d="M0,-133 L-3.5,-128 L0,-123 L3.5,-128 Z" className="vx-notch" />
          </g>

          <circle r="128" className="vx-seg-glow" />
          {SEGMENTS.map((d, index) => (
            <path key={index} d={d} className="vx-seg" data-on={index < lit || undefined} style={{ "--i": index } as CSSProperties} />
          ))}
          <g className="vx-sweep">
            <path d={arc(128, 300, 360)} className="vx-sweep-tail" />
            <path d={arc(128, 340, 360)} className="vx-sweep-head" />
          </g>

          <g
            ref={(node) => {
              ringRefs.current[1] = node;
            }}
          >
            <circle r="119" className="vx-line" />
            <circle r="103" className="vx-line" />
            <g className="vx-runes">
              {RUNES.map((rune, index) => (
                <path key={index} d={rune.d} transform={`rotate(${rune.angle.toFixed(2)}) translate(0 -111)`} />
              ))}
            </g>
            <path d="M0,-117 L-4,-111 L0,-105 L4,-111 Z" className="vx-notch" />
          </g>

          <circle r="96" className="vx-line vx-dash" />

          <g
            ref={(node) => {
              ringRefs.current[2] = node;
            }}
          >
            <path d={STAR} className="vx-star" />
            <circle r="74" className="vx-line" />
            {VERTICES.map(([x, y], index) => (
              <circle key={index} cx={x} cy={y} r={index ? 2.2 : 4} className={index ? "vx-vertex" : "vx-notch"} />
            ))}
          </g>

          {TEETH.map((angle) => (
            <g key={angle} transform={`rotate(${angle})`}>
              <path d="M-6,-71 L6,-71 L3.5,-61 L-3.5,-61 Z" className="vx-tooth" />
            </g>
          ))}

          <circle r="54" fill="url(#vx-core-light)" className="vx-core" />
          <g className="vx-gate vx-gate-l">
            <path d="M0,-56 A56,56 0 0 0 0,56 Z" fill="url(#vx-plate)" />
            <path d="M-2,-45 A45,45 0 0 0 -2,45" className="vx-line" />
            <path d="M0,-19 L-12,0 L0,19" className="vx-keyhole" />
          </g>
          <g className="vx-gate vx-gate-r">
            <path d="M0,-56 A56,56 0 0 1 0,56 Z" fill="url(#vx-plate)" />
            <path d="M2,-45 A45,45 0 0 1 2,45" className="vx-line" />
            <path d="M0,-19 L12,0 L0,19" className="vx-keyhole" />
          </g>
          <circle r="56" className="vx-rim" />

          <g clipPath="url(#vx-seal-clip)">
            <g className="vx-scan">
              <rect x="-150" y="-30" width="300" height="29" fill="url(#vx-trail)" />
              <rect x="-150" y="-1.5" width="300" height="1.5" className="vx-scan-line" />
            </g>
          </g>
          <circle r="60" className="vx-shock" />
        </svg>
      </div>
      {phase === "granted" && motion === "full" ? (
        <div className="vx-shards">
          {SHARDS.map((style, index) => (
            <span key={index} style={style} />
          ))}
        </div>
      ) : null}
      {phase === "locked" ? (
        <div className="vx-lockdown">
          <span>Access suspended</span>
        </div>
      ) : null}
    </div>
  );
}
