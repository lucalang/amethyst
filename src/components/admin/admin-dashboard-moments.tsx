"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { SLOT_SYMBOLS, SlotSymbol } from "@/components/arcade/slots/symbols";
import type { GeodeMomentSound } from "@/components/vault/vault-audio";
import "./admin-dashboard-moments.css";

/**
 * Geode's moments: the celebration a confirmed action earns in the Flashy dashboard, one per kind of action.
 * Coins rain (or drain into a vortex), a crown lands, a gem rises and bursts, energy surges, slot reels spin to
 * the queued line, a key sigil assembles, or the glass fractures. All decoration (aria-hidden): the toast still
 * says what happened. Also here: the cave's living motes and the prism ripple under every press.
 */

export type GeodeMoment =
  | { kind: "coins"; amount: number }
  | { kind: "crown" | "surge" | "key" | "fracture"; title: string; kicker: string }
  | { kind: "gift"; title: string; kicker: string; color: string }
  | { kind: "reels"; symbols: string[]; title: string; kicker: string };

/** The sound each moment plays (in step with its animation). */
export function momentSound(moment: GeodeMoment): GeodeMomentSound {
  if (moment.kind === "coins") return moment.amount < 0 ? "drain" : "coins";
  if (moment.kind === "reels") return "reels";
  return moment.kind;
}

/** Moments that hit hard enough to shake the stage. */
export const momentShakes = (moment: GeodeMoment | undefined) => moment?.kind === "fracture" || moment?.kind === "crown";

/** Stable pseudo-random numbers, so a moment renders the same on every pass. */
const rnd = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const vars = (values: Record<string, string | number>) => values as CSSProperties;

function Caption({ kicker, title, tone }: { kicker: string; title: string; tone?: string }) {
  return (
    <span className="gm-caption" data-tone={tone}>
      <span className="gm-caption-kicker">{kicker}</span>
      <span className="gm-caption-title">{title}</span>
    </span>
  );
}

function Shards({ count, color, gravity = false }: { count: number; color?: string; gravity?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="gm-shard"
          data-gravity={gravity || undefined}
          style={vars({
            "--a": `${(i / count) * 360 + rnd(i, 1) * 18}deg`,
            "--d": `${140 + rnd(i, 2) * 180}px`,
            "--r": `${rnd(i, 3) * 540 - 270}deg`,
            "--s": `${0.6 + rnd(i, 4) * 0.9}`,
            "--delay": `${rnd(i, 5) * 80}ms`,
            ...(color ? { "--shard": color } : {}),
          })}
        />
      ))}
    </>
  );
}

function Coins({ amount }: { amount: number }) {
  const take = amount < 0;
  const count = Math.round(Math.min(26, 10 + Math.log10(Math.abs(amount) + 1) * 4));
  return (
    <>
      <span className="gm-glow" data-tone="gold" />
      {Array.from({ length: count }, (_, i) => {
        const angle = rnd(i, 7) * Math.PI * 2;
        const radius = 42 + rnd(i, 8) * 14;
        return (
          <span
            key={i}
            className="gm-coin"
            data-take={take || undefined}
            style={vars({
              "--x": `${4 + rnd(i, 1) * 92}%`,
              "--fall": `${55 + rnd(i, 2) * 30}vh`,
              "--sx": `${Math.cos(angle) * radius}vmin`,
              "--sy": `${Math.sin(angle) * radius}vmin`,
              "--delay": `${rnd(i, 3) * (take ? 260 : 520)}ms`,
              "--dur": `${900 + rnd(i, 4) * 500}ms`,
              "--size": `${20 + rnd(i, 5) * 16}px`,
              "--flip": `${380 + rnd(i, 6) * 300}ms`,
            })}
          >
            <span className="gm-coin-face" />
          </span>
        );
      })}
      {take ? <span className="gm-vortex" /> : null}
      <Caption kicker={take ? "Coins taken" : "Coins given"} title={`${take ? "−" : "+"}${Math.abs(amount).toLocaleString("en")}`} tone={take ? "silver" : "gold"} />
    </>
  );
}

function Crown({ title, kicker }: { title: string; kicker: string }) {
  return (
    <>
      <span className="gm-rays" />
      <span className="gm-glow" data-tone="gold" />
      <span className="gm-crown">
        <span className="gm-crown-shine" />
      </span>
      {Array.from({ length: 12 }, (_, i) => (
        <span
          key={i}
          className="gm-spark"
          style={vars({
            "--x": `${Math.cos((i / 12) * Math.PI * 2) * (90 + rnd(i, 1) * 90)}px`,
            "--y": `${Math.sin((i / 12) * Math.PI * 2) * (70 + rnd(i, 2) * 70) - 30}px`,
            "--delay": `${500 + rnd(i, 3) * 500}ms`,
            "--size": `${8 + rnd(i, 4) * 12}px`,
          })}
        />
      ))}
      <Caption kicker={kicker} title={title} tone="gold" />
    </>
  );
}

function Gift({ title, kicker, color }: { title: string; kicker: string; color: string }) {
  return (
    <span className="gm-group" style={vars({ "--rc": color })}>
      <span className="gm-glow" data-tone="rarity" />
      <span className="gm-gem-stage">
        <span className="gm-gem">
          <span className="gm-gem-table" />
        </span>
      </span>
      <span className="gm-ring" />
      <span className="gm-ring" data-late />
      <Shards count={18} color={color} />
      <Caption kicker={kicker} title={title} tone="rarity" />
    </span>
  );
}

const BOLTS = ["M50 0 L38 38 L56 42 L30 100", "M50 0 L60 30 L44 36 L66 100", "M50 0 L42 26 L58 34 L40 64 L54 70 L46 100"];

function Surge({ title, kicker }: { title: string; kicker: string }) {
  return (
    <>
      <span className="gm-flicker" />
      {[0, 1, 2].map((i) => (
        <span key={i} className="gm-pulse" style={vars({ "--delay": `${200 + i * 160}ms` })} />
      ))}
      {BOLTS.map((d, i) => (
        <svg key={i} className="gm-bolt" viewBox="0 0 100 100" preserveAspectRatio="none" style={vars({ "--x": `${[-28, 30, 2][i]}vmin`, "--delay": `${120 + i * 130}ms`, "--tilt": `${[-12, 10, 0][i]}deg` })}>
          <path d={d} pathLength={1} />
        </svg>
      ))}
      <Caption kicker={kicker} title={title} />
    </>
  );
}

/** Three reels spin and stop, one after another, on the queued line (stops at 0.75 s, 0.95 s and 1.15 s). */
function Reels({ symbols, title, kicker }: { symbols: string[]; title: string; kicker: string }) {
  const pool = Object.keys(SLOT_SYMBOLS);
  return (
    <>
      <span className="gm-glow" />
      <span className="gm-machine">
        {symbols.map((target, reel) => {
          const strip = Array.from({ length: 11 }, (_, i) => pool[Math.floor(rnd(i + reel * 11, 9) * pool.length)] ?? target);
          return (
            <span key={reel} className="gm-window" style={vars({ "--stop": `${750 + reel * 200}ms` })}>
              <span className="gm-strip">
                {[...strip, target].map((symbol, i) => (
                  <span key={i} className="gm-cell">
                    <SlotSymbol id={symbol} className="size-12" />
                  </span>
                ))}
              </span>
            </span>
          );
        })}
        <span className="gm-payline" />
      </span>
      <Caption kicker={kicker} title={title} />
    </>
  );
}

/** Six shards fly in and seat as a hexagon, the hexagon turns and a keyhole lights. */
function Key({ title, kicker }: { title: string; kicker: string }) {
  return (
    <>
      <span className="gm-glow" />
      <span className="gm-hex">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="gm-hex-piece" style={vars({ "--rot": `${i * 60}deg`, "--delay": `${180 + i * 70}ms` })} />
        ))}
        <span className="gm-keyhole" />
      </span>
      <span className="gm-ring" data-late />
      <Caption kicker={kicker} title={title} />
    </>
  );
}

/* Cracks from the centre: jagged polylines, each drawn in from the impact. */
const CRACKS = Array.from({ length: 9 }, (_, i) => {
  const base = (i / 9) * Math.PI * 2 + rnd(i, 1) * 0.4;
  let x = 50;
  let y = 50;
  const points = [`${x},${y}`];
  for (let step = 1; step <= 5; step += 1) {
    const angle = base + (rnd(i, step + 2) - 0.5) * 0.7;
    const length = 5 + rnd(i, step + 9) * 7;
    x += Math.cos(angle) * length;
    y += Math.sin(angle) * length;
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
});

function Fracture({ title, kicker }: { title: string; kicker: string }) {
  return (
    <>
      <span className="gm-shade" />
      <svg className="gm-cracks" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        {CRACKS.map((points, i) => (
          <polyline key={i} points={points} pathLength={1} style={vars({ "--delay": `${i * 25}ms` })} />
        ))}
      </svg>
      <Shards count={16} gravity />
      <Caption kicker={kicker} title={title} tone="silver" />
    </>
  );
}

/** The overlay for one moment (keyed by its count, so every confirmed action plays afresh). */
export function MomentOverlay({ moment }: { moment: GeodeMoment | undefined }) {
  return (
    <span aria-hidden className="gm" data-kind={moment?.kind ?? "burst"}>
      {!moment ? (
        <>
          <span className="gm-glow" />
          <Shards count={14} />
        </>
      ) : moment.kind === "coins" ? (
        <Coins amount={moment.amount} />
      ) : moment.kind === "crown" ? (
        <Crown title={moment.title} kicker={moment.kicker} />
      ) : moment.kind === "gift" ? (
        <Gift title={moment.title} kicker={moment.kicker} color={moment.color} />
      ) : moment.kind === "surge" ? (
        <Surge title={moment.title} kicker={moment.kicker} />
      ) : moment.kind === "reels" ? (
        <Reels symbols={moment.symbols} title={moment.title} kicker={moment.kicker} />
      ) : moment.kind === "key" ? (
        <Key title={moment.title} kicker={moment.kicker} />
      ) : (
        <Fracture title={moment.title} kicker={moment.kicker} />
      )}
    </span>
  );
}

/**
 * The cave's motes: a canvas of glowing specks in the gem's colours drifting upward, joined by faint lattice
 * lines when close and pushed aside by the pointer. Only with full motion; paused while the tab is hidden.
 */
export function Motes({ colors, active }: { colors: readonly string[]; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const palette = colors.join(" ");

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !active) return;
    const hues = palette.split(" ");
    let width = 0;
    let height = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Soft glowing specks don't need retina pixels: 1× keeps the full-screen redraw cheap.
      const dpr = 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const count = Math.round(Math.min(56, Math.max(24, (width * height) / 24_000)));
    const motes = Array.from({ length: count }, (_, i) => {
      const drift = 0.08 + Math.random() * 0.22;
      return { x: Math.random() * width, y: Math.random() * height, vx: 0, vy: -drift, base: -drift, r: 0.6 + Math.random() * 1.7, color: hues[i % hues.length], phase: Math.random() * Math.PI * 2 };
    });
    let px = -1e4;
    let py = -1e4;
    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      px = event.clientX - rect.left;
      py = event.clientY - rect.top;
    };
    window.addEventListener("pointermove", move, { passive: true });

    let frame = 0;
    let last = performance.now();
    const LINK = 120;
    const PUSH = 150;
    const tick = (now: number) => {
      const step = Math.min(3, (now - last) / 16.67);
      last = now;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = "lighter";
      for (const m of motes) {
        const dx = m.x - px;
        const dy = m.y - py;
        const distance = Math.hypot(dx, dy);
        if (distance < PUSH && distance > 0.1) {
          const force = (1 - distance / PUSH) * 0.35;
          m.vx += (dx / distance) * force;
          m.vy += (dy / distance) * force;
        }
        m.vx *= 0.94;
        m.vy += (m.base - m.vy) * 0.04;
        m.x += m.vx * step;
        m.y += m.vy * step;
        if (m.y < -10) m.y = height + 10;
        if (m.x < -10) m.x = width + 10;
        if (m.x > width + 10) m.x = -10;
      }
      context.lineWidth = 0.6;
      for (let i = 0; i < motes.length; i += 1) {
        for (let j = i + 1; j < motes.length; j += 1) {
          const a = motes[i];
          const b = motes[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > LINK) continue;
          context.globalAlpha = (1 - distance / LINK) * 0.16;
          context.strokeStyle = a.color;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }
      for (const m of motes) {
        const shine = 0.35 + 0.35 * Math.sin(now / 900 + m.phase);
        context.fillStyle = m.color;
        context.globalAlpha = shine * 0.18;
        context.beginPath();
        context.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = shine;
        context.beginPath();
        context.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "visible") {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
      context.clearRect(0, 0, width, height);
    };
  }, [palette, active]);

  return <canvas ref={ref} aria-hidden className="geo-motes" />;
}

/* What the pointer lights, innermost last: each layer keeps its own lit element, so a panel stays lit while the
   pointer is over a button inside it. */
const LIGHT_LAYERS = [
  { selector: ".geo-counter", tilt: "full" },
  { selector: ".geo-pane, .geo .dash-panel", tilt: "lean" },
  { selector: ".geo-nav-link, .geo-tool, .geo-gem, .geo-row, .geo-feed-item, .geo .dash-row, .geo [data-slot='button']", tilt: null },
] as const;
const LIGHT_PROPS = ["--geo-x", "--geo-y", "--geo-lit", "--geo-rx", "--geo-ry", "--geo-lift"];

/**
 * The pointer as a light source: writes --geo-x/--geo-y (%), --geo-lit (0/1) and, for counters and read-only
 * panels, --geo-rx/--geo-ry/--geo-lift to the hovered element of each layer, at most once a frame. The properties
 * are registered as non-inherited and transition in CSS, so this is cheap however big the panel, and smooth
 * without springs. `tilt` is false with subtle motion (light only, nothing leans).
 */
export function useGeodeLight(rootRef: RefObject<HTMLElement | null>, enabled: boolean, tilt: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    const lit: (HTMLElement | null)[] = LIGHT_LAYERS.map(() => null);
    let target: Element | null = null;
    let x = 0;
    let y = 0;
    let frame = 0;

    const dim = (el: HTMLElement) => {
      el.style.setProperty("--geo-lit", "0");
      el.style.setProperty("--geo-rx", "0deg");
      el.style.setProperty("--geo-ry", "0deg");
      el.style.setProperty("--geo-lift", "0px");
    };
    const apply = () => {
      frame = 0;
      LIGHT_LAYERS.forEach((layer, i) => {
        const el = target?.closest<HTMLElement>(layer.selector) ?? null;
        if (el !== lit[i]) {
          if (lit[i]) dim(lit[i]);
          lit[i] = el;
        }
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const u = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
        const v = Math.min(1, Math.max(0, (y - rect.top) / rect.height));
        el.style.setProperty("--geo-x", `${(u * 100).toFixed(1)}%`);
        el.style.setProperty("--geo-y", `${(v * 100).toFixed(1)}%`);
        el.style.setProperty("--geo-lit", "1");
        const leans = tilt && (layer.tilt === "full" || (layer.tilt === "lean" && el.classList.contains("geo-pane")));
        if (leans) {
          el.style.setProperty("--geo-rx", `${((v - 0.5) * 10).toFixed(2)}deg`);
          el.style.setProperty("--geo-ry", `${(-(u - 0.5) * 10).toFixed(2)}deg`);
          if (layer.tilt === "full") el.style.setProperty("--geo-lift", "14px");
        }
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      target = event.target instanceof Element ? event.target : null;
      schedule();
    };
    // Leaving, or scrolling content out from under a still pointer: let everything go dark.
    const release = () => {
      target = null;
      schedule();
    };
    root.addEventListener("pointermove", move, { passive: true });
    root.addEventListener("pointerleave", release);
    root.addEventListener("scroll", release, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", release);
      root.removeEventListener("scroll", release, { capture: true });
      for (const el of lit) if (el) for (const name of LIGHT_PROPS) el.style.removeProperty(name);
    };
  }, [rootRef, enabled, tilt]);
}

/** A prism ripple under every press of a control (DOM only: no re-render per click). */
export function useRipples(rootRef: RefObject<HTMLElement | null>, layerRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    const layer = layerRef.current;
    if (!root || !layer || !enabled) return;
    const down = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("button, a, label, [role='radio']")) return;
      const rect = root.getBoundingClientRect();
      const ripple = document.createElement("span");
      ripple.className = "geo-ripple";
      ripple.style.left = `${event.clientX - rect.left}px`;
      ripple.style.top = `${event.clientY - rect.top}px`;
      ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
      layer.append(ripple);
      // Never let a burst of clicks pile up.
      while (layer.childElementCount > 6) layer.firstElementChild?.remove();
    };
    root.addEventListener("pointerdown", down, { passive: true });
    return () => {
      root.removeEventListener("pointerdown", down);
      layer.replaceChildren();
    };
  }, [rootRef, layerRef, enabled]);
}
