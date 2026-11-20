"use client";

import type { CSSProperties } from "react";
import { hash, type Dive } from "@/lib/minigames/blank-atlas";
import { DIVE_COLOR } from "./descent-world";

/*
 * The big moment for a rare answer, drawn across the whole stage behind the result card. It grows with the dive:
 *   rare: shockwaves, a spray of sparks and a colour flash;
 *   exceptional: more of both, light pillars and a turning occult sigil;
 *   extraordinary (a question's hidden gem): crimson-gold everything, an opening eye, "Hidden gem", falling gold.
 * Every spark is placed from a fixed seed, so the same dive always bursts the same way. Styles: descent.css (`rb-*`).
 */

const unit = (salt: number) => (hash(`burst:${salt}`) % 10_000) / 10_000;

export function RareBurst({ dive, level }: { dive: Dive; level: number }) {
  const gem = dive === "extraordinary";
  const sparks = Array.from({ length: level * 12 }, (_, k) => ({
    a: unit(k) * 360,
    d: 18 + unit(k + 400) * (level * 9),
    s: 3 + unit(k + 800) * (gem ? 7 : 5),
    t: unit(k + 1200) * 120,
    gold: gem && k % 2 === 0,
  }));
  const rings = Math.max(2, level - 1);
  const style = { "--dv": DIVE_COLOR[dive] } as CSSProperties;

  return (
    <div aria-hidden className="rb" data-dive={dive} style={style}>
      <span className="rb-flash" />
      {level >= 4 ? (
        <div className="rb-pillars">
          {[-34, -12, 12, 34].map((x, k) => (
            <i key={x} style={{ "--x": `${x}cqw`, "--t": `${k * 70}ms` } as CSSProperties} />
          ))}
        </div>
      ) : null}
      {level >= 4 ? (
        <svg className="rb-sigil" viewBox="-100 -100 200 200">
          <circle r="92" />
          <circle r="74" className="rb-thin" />
          <path d="M0 -74 L64 37 L-64 37 Z M0 74 L-64 -37 L64 -37 Z" />
          {Array.from({ length: 12 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2;
            return <path key={k} d={`M${(Math.cos(a) * 80).toFixed(1)} ${(Math.sin(a) * 80).toFixed(1)} l4 -6 l4 6`} className="rb-thin" />;
          })}
          {gem ? (
            <g className="rb-eye">
              <path d="M-46 0 Q0 -34 46 0 Q0 34 -46 0 Z" />
              <circle r="15" className="rb-iris" />
              <circle r="6" className="rb-pupil" />
            </g>
          ) : null}
        </svg>
      ) : null}
      {Array.from({ length: rings }, (_, k) => (
        <span key={k} className="rb-ring" style={{ "--t": `${k * 140}ms` } as CSSProperties} />
      ))}
      <div className="rb-sparks">
        {sparks.map((spark, k) => (
          <i
            key={k}
            data-gold={spark.gold || undefined}
            style={{ "--a": `${spark.a}deg`, "--d": `${spark.d}cqmin`, "--s": `${spark.s}px`, "--t": `${spark.t}ms` } as CSSProperties}
          />
        ))}
      </div>
      {gem ? (
        <>
          <p className="rb-title">Hidden gem</p>
          <div className="rb-rain">
            {Array.from({ length: 26 }, (_, k) => (
              <i key={k} style={{ "--x": `${unit(k + 2000) * 100}%`, "--t": `${unit(k + 2100) * 900}ms`, "--r": `${unit(k + 2200) * 720 - 360}deg` } as CSSProperties} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
