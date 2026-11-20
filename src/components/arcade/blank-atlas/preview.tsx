"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { GameLook } from "@/lib/game-cosmetics";
import type { MotionLevel } from "@/lib/preferences";
import type { Dive } from "@/lib/minigames/blank-atlas";
import { DIVE_COLOR } from "./descent-world";
import { Lantern, MarkBadge, descentLook, worldAttributes } from "./look";
import { SCENERY } from "./world-art";
import "./descent.css";
import "./cosmetics.css";

/**
 * The Descent's shop preview: a slice of the deep built from the game's own pieces and styles. Three answers
 * have left their trail and markers, the lantern hangs below them among the fog, and every few seconds it plunges
 * again (a rare dive), so lanterns, fog, trails, markers and art styles all show as they do in play.
 */

const STOPS: {
  from: number;
  to: number;
  dive: Dive;
  answer: string;
  points: number;
  side: "l" | "r";
}[] = [
  { from: 0, to: 15, dive: "familiar", answer: "Cat", points: 6, side: "r" },
  {
    from: 15,
    to: 35,
    dive: "uncommon",
    answer: "Lighthouse",
    points: 31,
    side: "l",
  },
  { from: 35, to: 60, dive: "rare", answer: "Narwhal", points: 58, side: "r" },
];
const NAMES: Record<Dive, string> = {
  familiar: "Familiar",
  uncommon: "Uncommon",
  rare: "Rare",
  exceptional: "Exceptional",
  extraordinary: "Hidden gem",
};
const BANKS = [
  { top: 8, left: -10, width: 70 },
  { top: 46, left: 40, width: 80 },
  { top: 78, left: -20, width: 75 },
];
const WISPS = [
  { top: 20, left: 4, width: 40, delay: 0 },
  { top: 62, left: 58, width: 38, delay: 6 },
  { top: 88, left: 22, width: 44, delay: 11 },
];
const MOTES = Array.from({ length: 18 }, (_, k) => ({
  x: (k * 37) % 100,
  y: (k * 53 + 11) % 100,
  d: (k * 0.7) % 8,
}));
const TAROT = SCENERY.find((scene) => scene.m === 1050);
const LAYER: CSSProperties = {
  translate: "none",
  height: "100%",
  transition: "none",
};

export function DescentPreview({
  look: equipped,
  effects,
}: {
  look: GameLook;
  effects: MotionLevel;
}) {
  const look = descentLook(equipped);
  const still = effects === "off";
  const [beat, setBeat] = useState(0);
  const [plunging, setPlunging] = useState(false);
  useEffect(() => {
    if (still) return;
    const start = window.setInterval(() => {
      setBeat((b) => b + 1);
      setPlunging(true);
    }, 4200);
    return () => window.clearInterval(start);
  }, [still]);
  useEffect(() => {
    if (!plunging) return;
    const stop = window.setTimeout(() => setPlunging(false), 1700);
    return () => window.clearTimeout(stop);
  }, [plunging, beat]);

  const style = {
    "--cam": "60%",
    "--cam-at": "60%",
    "--dur": "1500ms",
    "--dv": DIVE_COLOR.rare,
  } as CSSProperties;
  return (
    <div
      className="dv dvp mx-auto w-full max-w-[26rem]"
      data-style={look.style}
      data-still={still || undefined}
    >
      <div
        className="dv-stage aspect-[8/5]"
        style={{ height: "auto" }}
        role="img"
        aria-label="Preview of The Descent with the selected look"
      >
        <div
          className="dw"
          data-plunge={plunging ? "rare" : undefined}
          style={style}
          {...worldAttributes(look)}
        >
          <div
            aria-hidden
            className="dw-world"
            style={{
              ...LAYER,
              background:
                "linear-gradient(180deg, #2a2333, #1f2236 55%, #0f2a2e)",
            }}
          >
            <span
              className="dw-light"
              style={
                {
                  top: "30%",
                  height: "60%",
                  "--light": "rgb(120 90 200 / 0.25)",
                } as CSSProperties
              }
            />
          </div>
          <div aria-hidden className="dw-world" style={LAYER}>
            {TAROT ? (
              <div
                className="dw-scene"
                data-bleed
                style={{
                  top: "70%",
                  left: "-4%",
                  width: "42%",
                  translate: "0 -50%",
                }}
              >
                {TAROT.art}
              </div>
            ) : null}
            {BANKS.map((bank, k) => (
              <span
                key={k}
                className="dw-bank"
                style={{
                  top: `${bank.top}%`,
                  left: `${bank.left}%`,
                  width: `${bank.width}%`,
                }}
              />
            ))}
            <p className="dw-landmark" data-side="r" style={{ top: "84%" }}>
              tarot cards drift by, face down, except one
            </p>
            {STOPS.map((stop) => (
              <span
                key={`t-${stop.from}`}
                className="dw-trail"
                data-dive={stop.dive}
                style={
                  {
                    top: `${stop.from}%`,
                    height: `${stop.to - stop.from}%`,
                    "--dv": DIVE_COLOR[stop.dive],
                  } as CSSProperties
                }
              />
            ))}
            {STOPS.map((stop, i) => (
              <div
                key={`m-${stop.from}`}
                className="dw-mark"
                data-dive={stop.dive}
                data-side={stop.side}
                style={
                  {
                    top: `${stop.to}%`,
                    "--dv": DIVE_COLOR[stop.dive],
                  } as CSSProperties
                }
              >
                <MarkBadge kind={look.marker} number={i + 1} />
                <span className="dw-mark-text">
                  <strong>{stop.answer}</strong>
                  <span>
                    {NAMES[stop.dive]} · +{stop.points}
                  </span>
                </span>
              </div>
            ))}
            <div className="dw-lantern" style={{ transition: "none" }}>
              <span key={beat} className="dw-lantern-trail" />
              <Lantern kind={look.lantern} />
            </div>
          </div>
          <div aria-hidden className="dw-fore" style={LAYER}>
            {WISPS.map((wisp, k) => (
              <span
                key={k}
                style={{
                  top: `${wisp.top}%`,
                  left: `${wisp.left}%`,
                  width: `${wisp.width}%`,
                  animationDelay: `${-wisp.delay}s`,
                }}
              />
            ))}
          </div>
          <div aria-hidden className="dw-dark" />
          <div aria-hidden className="dw-motes">
            {MOTES.map((mote, k) => (
              <i
                key={k}
                style={{
                  left: `${mote.x}%`,
                  top: `${mote.y}%`,
                  animationDelay: `${-mote.d}s`,
                }}
              />
            ))}
          </div>
          <div aria-hidden className="dw-vignette" />
        </div>
        <div aria-hidden className="dv-hud">
          <div className="dv-pod">
            <span>Depth</span>
            <strong>950 m</strong>
          </div>
        </div>
      </div>
    </div>
  );
}
