"use client";

import { useEffect, useState, type CSSProperties } from "react";

/** good / mid / bad, for colouring a score out of 100. */
export const toneOf = (score: number) => (score >= 75 ? "good" : score >= 40 ? "mid" : "bad");

/** A number that counts up to `target` (instantly when motion is off). */
export function useCountUp(target: number, animate: boolean, duration = 900) {
  const [value, setValue] = useState(animate ? 0 : target);
  useEffect(() => {
    if (!animate) {
      const id = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, animate, duration]);
  return value;
}

export function CountUp({ value, animate, format = (n) => String(Math.round(n)), duration }: { value: number; animate: boolean; format?: (n: number) => string; duration?: number }) {
  const shown = useCountUp(value, animate, duration);
  return <>{format(shown)}</>;
}

const COLORS = ["#38bdf8", "#fb7185", "#34d399", "#fbbf24", "#a78bfa", "#f472b6"];
const PIECES = Array.from({ length: 36 }, (_, k) => {
  const a = (k / 36) * Math.PI * 2 + (k % 3) * 0.4;
  const reach = 120 + ((k * 53) % 140);
  return {
    x: `${45 + ((k * 37) % 10)}%`,
    dx: `${Math.round(Math.cos(a) * reach)}px`,
    dy: `${Math.round(Math.sin(a) * reach * 0.7 + 120)}px`,
    r: `${(k * 97) % 720}deg`,
    d: `${(k % 6) * 0.03}s`,
    c: COLORS[k % COLORS.length],
  };
});

/** A one-shot confetti burst (full effects only; hidden by CSS otherwise). */
export function Confetti() {
  return (
    <span aria-hidden className="gt-confetti">
      {PIECES.map((piece, k) => (
        <i key={k} style={{ "--x": piece.x, "--dx": piece.dx, "--dy": piece.dy, "--r": piece.r, "--d": piece.d, "--c": piece.c } as CSSProperties} />
      ))}
    </span>
  );
}

/** A short stamp for one prompt's score out of 100. */
export function promptVerdict(share: number) {
  if (share >= 92) return "Bullseye!";
  if (share >= 75) return "So close!";
  if (share >= 50) return "Not bad";
  if (share >= 25) return "Way off";
  return "Wild guess";
}
