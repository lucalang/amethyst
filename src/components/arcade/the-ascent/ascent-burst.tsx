"use client";

import type { CSSProperties } from "react";
import { GROWTHS, type Growth } from "@/lib/minigames/the-ascent";
import { GROWTH_COLOR } from "./ascent-world";

/*
 * The celebration after an answer, across the whole stage behind the result card. It grows with commonness, the
 * reverse of The Descent: a rare answer only puffs, a common one sprays leaves, and the crowd favourite erupts in
 * gold ("Giant's Leap!"). Pieces are placed from a fixed seed, so the same result always looks the same.
 * Styles: ascent.css (`ab-*`).
 */

const unit = (salt: number) => {
  let x = Math.imul(0x51ed27 ^ (salt * 0x9e3779b1), 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

export function AscentBurst({ growth }: { growth: Growth }) {
  const level = GROWTHS[growth].level;
  const giant = growth === "giant";
  const count = [0, 6, 10, 14, 26, 40][level];
  const pieces = Array.from({ length: count }, (_, k) => ({
    a: -90 + (unit(k) - 0.5) * (level >= 4 ? 300 : 200),
    d: 14 + unit(k + 300) * (8 + level * 8),
    s: level <= 2 ? 4 + unit(k + 600) * 4 : 10 + unit(k + 600) * 10,
    r: unit(k + 900) * 720 - 360,
    t: unit(k + 1200) * 140,
    kind: giant ? (k % 3 === 0 ? "bean" : k % 3 === 1 ? "gold" : "leaf") : level >= 3 ? "leaf" : "spark",
  }));
  const rings = level >= 5 ? 3 : level >= 4 ? 2 : level >= 2 ? 1 : 0;

  return (
    <div aria-hidden className="ab" data-growth={growth} style={{ "--gw": GROWTH_COLOR[growth] } as CSSProperties}>
      {level >= 4 ? <span className="ab-flash" /> : null}
      {level >= 4 ? <span className="ab-rays" /> : null}
      {Array.from({ length: rings }, (_, k) => (
        <span key={k} className="ab-ring" style={{ "--t": `${k * 150}ms` } as CSSProperties} />
      ))}
      <div className="ab-pieces">
        {pieces.map((piece, k) => (
          <i
            key={k}
            data-kind={piece.kind}
            style={{ "--a": `${piece.a}deg`, "--d": `${piece.d}cqmin`, "--s": `${piece.s}px`, "--r": `${piece.r}deg`, "--t": `${piece.t}ms` } as CSSProperties}
          />
        ))}
      </div>
      {giant ? (
        <>
          <p className="ab-title">Giant’s Leap!</p>
          <div className="ab-rain">
            {Array.from({ length: 24 }, (_, k) => (
              <i key={k} style={{ "--x": `${unit(k + 2000) * 100}%`, "--t": `${unit(k + 2100) * 900}ms`, "--r": `${unit(k + 2200) * 720 - 360}deg` } as CSSProperties} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
