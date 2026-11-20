"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { GameLook } from "@/lib/game-cosmetics";
import type { MotionLevel } from "@/lib/preferences";
import {
  GROWTHS,
  METRES_PER_POINT,
  type Growth,
} from "@/lib/minigames/the-ascent";
import {
  GROWTH_COLOR,
  ROOT,
  STALK_W,
  Segment,
  stalkX,
  yOf,
} from "./ascent-world";
import {
  Climber,
  Garden,
  GrowthBurst,
  ascentLook,
  worldAttributes,
} from "./look";
import "./ascent.css";
import "./cosmetics.css";

/**
 * The Ascent's shop preview: the bottom of the climb, built from the game's own pieces and styles. Three answers
 * have grown the beanstalk out of the starting garden, the climber rides its tip among the clouds, and every few
 * seconds a new stretch grows (a common answer), so every category shows as it does in play.
 */

/** The preview is laid out at this size, then scaled to fit. */
const W = 480;
const H = 300;
const GROUND = 150;
/** Where the planted spot lands in the garden (the art is 800 × 320 with the bean at y = 260, scaled to cover). */
const GARDEN_SCALE = Math.max(W / 800, GROUND / 320);
const ROOT_Y = H - 60 * GARDEN_SCALE;
/** How the stalk's world coordinates map onto the preview. */
const K = 0.62;
const STOPS: { to: number; growth: Growth; answer: string; side: "l" | "r" }[] =
  [
    { to: 70, growth: "shoot", answer: "Teapot", side: "l" },
    { to: 190, growth: "sprout", answer: "Dog", side: "r" },
    { to: 330, growth: "vine", answer: "Rainbow", side: "l" },
  ];
const TOP_M = 400;
const CLOUDS = [
  { x: 8, y: 22, w: 34 },
  { x: 62, y: 12, w: 30 },
  { x: 70, y: 46, w: 26 },
];
const SEEDS = Array.from({ length: 14 }, (_, k) => ({
  x: (k * 41) % 100,
  y: (k * 29 + 7) % 90,
  d: (k * 0.9) % 8,
}));

export function AscentPreview({
  look: equipped,
  effects,
}: {
  look: GameLook;
  effects: MotionLevel;
}) {
  const look = ascentLook(equipped);
  const still = effects === "off";
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  const [beat, setBeat] = useState(0);
  const [growing, setGrowing] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / W),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (still) return;
    const id = window.setInterval(() => {
      setBeat((b) => b + 1);
      setGrowing(true);
    }, 4200);
    return () => window.clearInterval(id);
  }, [still]);
  useEffect(() => {
    if (!growing) return;
    const id = window.setTimeout(() => setGrowing(false), 2600);
    return () => window.clearTimeout(id);
  }, [growing, beat]);

  // The stalk's slice of the world, placed so the bean sits on the garden's planted spot.
  const yTop = yOf(TOP_M);
  const svgLeft = W / 2 - (STALK_W / 2) * K;
  const svgTop = ROOT_Y - (ROOT - yTop) * K;
  const height = STOPS[STOPS.length - 1].to;
  const tipX = svgLeft + stalkX(height) * K;
  const tipY = svgTop + (yOf(height) - yTop) * K;
  const point = (m: number) => ({
    x: svgLeft + stalkX(m) * K,
    y: svgTop + (yOf(m) - yTop) * K,
  });
  const ms = 1400;
  const style = {
    "--dur": `${ms}ms`,
    "--gw": GROWTH_COLOR.vine,
    "--cam": `${tipY}px`,
  } as CSSProperties;

  return (
    <div
      ref={box}
      className="as asp mx-auto w-full max-w-[26rem]"
      data-style={look.style}
      data-still={still || undefined}
    >
      <div
        className="as-stage"
        style={{ height: H * scale }}
        role="img"
        aria-label="Preview of The Ascent with the selected look"
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            scale: String(scale),
            transformOrigin: "0 0",
          }}
        >
          <div
            className="aw"
            data-climb={growing ? "vine" : undefined}
            style={style}
            {...worldAttributes(look)}
          >
            <div
              aria-hidden
              className="aw-world"
              style={{
                translate: "none",
                height: H,
                background:
                  "linear-gradient(0deg, #c6ecff, #a7deff 60%, #93d2ff)",
              }}
            >
              <span
                className="aw-light"
                style={
                  {
                    top: H * 0.35,
                    height: H * 0.6,
                    "--light": "rgb(255 236 150 / 0.35)",
                  } as CSSProperties
                }
              />
            </div>
            <div
              aria-hidden
              className="aw-far"
              style={{ translate: "none", height: H }}
            >
              {CLOUDS.map((cloud, k) => (
                <span
                  key={k}
                  className="aw-cloud"
                  style={{
                    top: `${cloud.y}%`,
                    left: `${cloud.x}%`,
                    width: `${cloud.w}%`,
                  }}
                />
              ))}
            </div>
            <div
              className="aw-world"
              style={{ translate: "none", height: H, transition: "none" }}
            >
              <div aria-hidden className="aw-ground" style={{ height: GROUND }}>
                <Garden kind={look.garden} />
              </div>
              <svg
                aria-hidden
                className="aw-stalk"
                viewBox={`0 ${yTop} ${STALK_W} ${ROOT + 10 - yTop}`}
                style={{
                  left: svgLeft,
                  top: svgTop,
                  translate: "none",
                  width: STALK_W * K,
                  height: (ROOT + 10 - yTop) * K,
                }}
              >
                {STOPS.map((stop, i) => (
                  <Segment
                    key={`${i}-${i === STOPS.length - 1 ? beat : 0}`}
                    index={i}
                    from={i ? STOPS[i - 1].to : 0}
                    to={stop.to}
                    growth={stop.growth}
                    fresh={growing && i === STOPS.length - 1}
                    stalk={look.stalk}
                  />
                ))}
                <g
                  className="aw-tip"
                  style={{
                    transform: `translate(${stalkX(height).toFixed(1)}px, ${yOf(height).toFixed(1)}px)`,
                  }}
                >
                  <path d="M0 4 q-10 -10 -4 -22 q8 6 4 22 Z M0 4 q10 -10 4 -22 q-8 6 -4 22 Z" />
                </g>
              </svg>
              {STOPS.map((stop, i) => {
                const at = point(stop.to);
                const gw = GROWTH_COLOR[stop.growth];
                return (
                  <div
                    key={stop.to}
                    className="aw-mark"
                    data-growth={stop.growth}
                    data-side={stop.side}
                    style={
                      {
                        top: at.y,
                        left: at.x,
                        translate:
                          stop.side === "l"
                            ? "calc(-100% - 1.6rem) -50%"
                            : "1.6rem -50%",
                        scale: "0.85",
                        "--gw": gw,
                      } as CSSProperties
                    }
                  >
                    <span aria-hidden className="aw-mark-dot">
                      {i + 1}
                    </span>
                    <span className="aw-mark-text">
                      <strong>{stop.answer}</strong>
                      <span>
                        {GROWTHS[stop.growth].name} · +
                        {(stop.to - (i ? STOPS[i - 1].to : 0)) /
                          METRES_PER_POINT}
                      </span>
                    </span>
                  </div>
                );
              })}
              <div
                aria-hidden
                className="aw-climber"
                style={{ left: tipX, top: tipY, transition: "none" }}
              >
                <span key={beat} className="aw-climber-trail" />
                {look.growth ? <GrowthBurst key={`burst-${beat}`} /> : null}
                <Climber kind={look.climber} />
              </div>
            </div>
            <div
              aria-hidden
              className="aw-fore"
              style={{ translate: "none", height: H }}
            >
              <span style={{ top: "70%", left: "-12%", width: "40%" }} />
              <span
                style={{
                  top: "30%",
                  left: "70%",
                  width: "36%",
                  animationDelay: "-8s",
                }}
              />
            </div>
            <div aria-hidden className="aw-seeds">
              {SEEDS.map((seed, k) => (
                <i
                  key={k}
                  style={{
                    left: `${seed.x}%`,
                    top: `${seed.y}%`,
                    animationDelay: `${-seed.d}s`,
                  }}
                />
              ))}
            </div>
          </div>
          <div aria-hidden className="as-hud">
            <div className="as-pod">
              <span>Height</span>
              <strong>{height.toLocaleString("en")} m</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
