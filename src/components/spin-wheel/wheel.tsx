"use client";

import { memo, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { playSound } from "@/components/arcade/sound";
import { reducedMotion } from "@/components/ui/list-drag";
import { DURATIONS, labelColor, randomUnit, type DurationId, type WheelChoice } from "@/lib/spin-wheel";
import { cn } from "@/lib/utils";

const R = 100;
const LABEL_END = 91;
const HUB = 15;

const point = (degrees: number, radius: number) => {
  const radians = (degrees * Math.PI) / 180;
  return `${(radius * Math.sin(radians)).toFixed(3)} ${(-radius * Math.cos(radians)).toFixed(3)}`;
};

const mod = (value: number, by: number) => ((value % by) + by) % by;

/** The slice under the pointer (top centre) for a wheel turned `rotation` degrees clockwise. */
export const sliceAt = (rotation: number, count: number) => Math.floor(mod(-rotation, 360) / (360 / count)) % count;

/**
 * Plays spins. The caller picks the result first (uniformly at random) and passes its index; the animation only
 * turns the wheel so that slice ends under the pointer, landing at a random spot inside it. With reduced motion
 * the wheel jumps straight there and the result is shown at once.
 */
export function useWheelSpin() {
  const rotorRef = useRef<SVGGElement>(null);
  const pointerRef = useRef<HTMLDivElement>(null);
  const rotation = useRef(0);
  const frame = useRef(0);
  const [spinning, setSpinning] = useState(false);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const apply = (degrees: number) => rotorRef.current?.setAttribute("transform", `rotate(${degrees.toFixed(3)})`);

  const spin = useCallback(
    ({ index, count, duration, sound, onLand }: { index: number; count: number; duration: DurationId; sound: boolean; onLand: () => void }) => {
      const slice = 360 / count;
      // A random spot within the slice, away from its edges, so the result is never ambiguous.
      const within = 0.18 + randomUnit() * 0.64;
      const target = mod(360 - (index + within) * slice, 360);
      const start = rotation.current;
      const { ms, turns } = DURATIONS[duration];
      const end = start + turns * 360 + mod(target - mod(start, 360), 360);

      if (reducedMotion()) {
        rotation.current = end;
        apply(end);
        if (sound) playSound("wheelLand");
        onLand();
        return;
      }

      setSpinning(true);
      const began = performance.now();
      let lastSlice = sliceAt(start, count);
      let lastTick = 0;
      const step = (now: number) => {
        const t = Math.min(1, (now - began) / ms);
        // A small wind-up, then a long, smooth deceleration (ease-out quart).
        const windUp = t < 0.08 ? -5 * Math.sin((Math.PI * t) / 0.08) : 0;
        const eased = 1 - (1 - t) ** 4;
        const current = start + (end - start) * eased + windUp;
        rotation.current = current;
        apply(current);
        const under = sliceAt(current, count);
        if (under !== lastSlice && count > 1) {
          lastSlice = under;
          if (now - lastTick > 32) {
            lastTick = now;
            if (sound) playSound("wheelTick", 0.9 + randomUnit() * 0.2);
            pointerRef.current?.animate([{ rotate: "-24deg" }, { rotate: "0deg" }], { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" });
          }
        }
        if (t < 1) {
          frame.current = requestAnimationFrame(step);
          return;
        }
        rotation.current = end;
        apply(end);
        setSpinning(false);
        if (sound) playSound("wheelLand");
        onLand();
      };
      frame.current = requestAnimationFrame(step);
    },
    [],
  );

  return { rotorRef, pointerRef, spinning, spin };
}

type WheelProps = {
  choices: readonly WheelChoice[];
  colors: readonly string[];
  /** The landed choice to highlight, if the wheel hasn't changed since. */
  winnerId: string | null;
  rotorRef: RefObject<SVGGElement | null>;
  pointerRef: RefObject<HTMLDivElement | null>;
  spinning: boolean;
  onSpin?: () => void;
};

/** The wheel graphic: slices, readable labels, rim pegs, a glossy hub and a fixed pointer at the top. */
export const Wheel = memo(function Wheel({ choices, colors, winnerId, rotorRef, pointerRef, spinning, onSpin }: WheelProps) {
  const count = choices.length;
  const slice = count ? 360 / count : 360;
  // Label size from the slice's width halfway out; tiny slices drop their labels (the list still shows them).
  const width = count > 1 ? 2 * 58 * Math.sin(Math.PI / count) : 90;
  const fontSize = Math.min(11, width * 0.5);
  const showLabels = fontSize >= 3.6;
  const maxChars = Math.max(3, Math.floor((LABEL_END - HUB - 6) / (fontSize * 0.56)));

  return (
    <div className="spin-wheel relative mx-auto aspect-square w-full max-w-[34rem]">
      <div aria-hidden className="spin-wheel-glow" />
      <svg
        viewBox="-112 -112 224 224"
        aria-hidden
        className={cn("relative block size-full select-none", onSpin && count >= 2 && !spinning && "cursor-pointer")}
        onClick={onSpin}
      >
        <defs>
          <radialGradient id="spin-wheel-sheen" cx="35%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
          </radialGradient>
          <radialGradient id="spin-wheel-hub" cx="40%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </radialGradient>
        </defs>

        {/* Rim */}
        <circle r={R + 9} className="fill-[#17131f] stroke-[rgb(var(--accent-rgb)/0.55)]" strokeWidth={1.2} />
        <circle r={R + 4.5} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={6} />

        {/* The angle is set imperatively by useWheelSpin, so re-renders keep it. */}
        <g ref={rotorRef}>
          {count === 0 ? (
            <circle r={R} fill="rgb(255 255 255 / 0.06)" stroke="rgb(255 255 255 / 0.12)" strokeDasharray="4 4" />
          ) : (
            choices.map((choice, index) => {
              const from = index * slice;
              const to = from + slice;
              const dim = winnerId !== null && !spinning && choice.id !== winnerId;
              const path =
                count === 1 ? null : `M 0 0 L ${point(from, R)} A ${R} ${R} 0 ${slice > 180 ? 1 : 0} 1 ${point(to, R)} Z`;
              return (
                <g key={choice.id} className="spin-wheel-slice" data-dim={dim || undefined} data-win={(!spinning && choice.id === winnerId) || undefined}>
                  {path ? (
                    <path d={path} fill={colors[index]} stroke="rgb(255 255 255 / 0.35)" strokeWidth={0.5} />
                  ) : (
                    <circle r={R} fill={colors[index]} />
                  )}
                  {showLabels ? (
                    <text
                      transform={`rotate(${from + slice / 2 - 90})`}
                      x={count === 1 ? 0 : LABEL_END}
                      y={0}
                      textAnchor={count === 1 ? "middle" : "end"}
                      dominantBaseline="central"
                      fontSize={count === 1 ? 14 : fontSize}
                      fontWeight={700}
                      fill={labelColor(colors[index])}
                      className="spin-wheel-label"
                      style={{ stroke: labelColor(colors[index]) === "#ffffff" ? "rgb(0 0 0 / 0.35)" : "rgb(255 255 255 / 0.35)" }}
                    >
                      {choice.label.length > maxChars ? `${choice.label.slice(0, maxChars - 1).trimEnd()}…` : choice.label}
                    </text>
                  ) : null}
                </g>
              );
            })
          )}
          {/* Pegs on the rim at each slice boundary */}
          {count > 1 && count <= 72
            ? choices.map((choice, index) => {
                const radians = ((index * slice) * Math.PI) / 180;
                return <circle key={choice.id} cx={(R + 4.5) * Math.sin(radians)} cy={-(R + 4.5) * Math.cos(radians)} r={1.7} className="fill-white/85" />;
              })
            : null}
        </g>

        <circle r={R} fill="url(#spin-wheel-sheen)" pointerEvents="none" />
        {/* Hub */}
        <circle r={HUB + 3} className="fill-[#17131f]" />
        <circle r={HUB} fill="url(#spin-wheel-hub)" />
        <circle r={HUB - 6} className="fill-amethyst" />
      </svg>
      {/* Pointer */}
      <div ref={pointerRef} aria-hidden className="spin-wheel-pointer">
        <svg viewBox="0 0 24 30" className="size-full">
          <path d="M12 29 L2.5 6.5 A10 10 0 1 1 21.5 6.5 Z" className="fill-white stroke-[#17131f]" strokeWidth={1.5} strokeLinejoin="round" />
          <circle cx="12" cy="9" r="3.4" className="fill-amethyst" />
        </svg>
      </div>
    </div>
  );
});
