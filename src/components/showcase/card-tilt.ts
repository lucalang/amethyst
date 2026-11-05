"use client";

import { useEffect, type RefObject } from "react";

/* 2D cards: tilt, glare, lift and press as CSS custom properties (--rx, --ry, --lift, --gx, --gy, --glare) driven by springs. */

type Spring = { x: number; v: number };
function step(s: Spring, target: number, dt: number, k = 170, c = 15) {
  const n = Math.max(1, Math.ceil(dt / 0.012));
  for (let i = 0; i < n; i++) {
    s.v += (k * (target - s.x) - c * s.v) * (dt / n);
    s.x += s.v * (dt / n);
  }
}

/** Tilts the `[data-card]` (or `selector`) element under the mouse inside `rootRef`; `data-card="panel"` tilts less. */
export function useCardTilt(rootRef: RefObject<HTMLElement | null>, enabled: boolean, selector = "[data-card]") {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    type Card = { rx: Spring; ry: Spring; lift: Spring; tx: number; ty: number; tl: number };
    const cards = new Map<HTMLElement, Card>();
    let frame = 0;
    let last = 0;
    let steadyUntil = 0;
    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let moving = false;
      for (const [el, card] of cards) {
        const still = now < steadyUntil;
        step(card.rx, still ? 0 : card.tx, dt);
        step(card.ry, still ? 0 : card.ty, dt);
        step(card.lift, card.tl, dt, 140, 14);
        el.style.setProperty("--rx", `${card.rx.x.toFixed(2)}deg`);
        el.style.setProperty("--ry", `${card.ry.x.toFixed(2)}deg`);
        el.style.setProperty("--lift", `${card.lift.x.toFixed(1)}px`);
        const settled = Math.abs(card.rx.x - card.tx) + Math.abs(card.ry.x - card.ty) + Math.abs(card.lift.x - card.tl) < 0.02 && Math.abs(card.rx.v) + Math.abs(card.ry.v) + Math.abs(card.lift.v) < 0.02;
        if (settled && !card.tl && !card.tx && !card.ty) cards.delete(el);
        else if (!settled) moving = true;
      }
      if (moving) frame = requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const cardOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>(selector) : null);
    let current: HTMLElement | null = null;
    const release = (el: HTMLElement | null) => {
      const card = el && cards.get(el);
      if (!card) return;
      card.tx = card.ty = card.tl = 0;
      el.style.setProperty("--glare", "0");
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const el = cardOf(event.target);
      if (el !== current) {
        release(current);
        current = el;
      }
      if (!el) return kick();
      const rect = el.getBoundingClientRect();
      const u = (event.clientX - rect.left) / rect.width;
      const v = (event.clientY - rect.top) / rect.height;
      const card = cards.get(el) ?? { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, lift: { x: 0, v: 0 }, tx: 0, ty: 0, tl: 0 };
      const range = el.dataset.card === "panel" ? 4 : 10;
      card.tx = (v - 0.5) * range;
      card.ty = -(u - 0.5) * range;
      card.tl = el.dataset.card === "panel" ? 4 : 14;
      cards.set(el, card);
      el.style.setProperty("--gx", `${(u * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(v * 100).toFixed(1)}%`);
      el.style.setProperty("--glare", "1");
      kick();
    };
    const onLeave = () => {
      release(current);
      current = null;
      kick();
    };
    const hold = () => {
      steadyUntil = performance.now() + 1200;
      kick();
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("keydown", hold);
    root.addEventListener("scroll", hold, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("keydown", hold);
      root.removeEventListener("scroll", hold, { capture: true });
      for (const el of cards.keys()) for (const name of ["--rx", "--ry", "--lift", "--glare"]) el.style.removeProperty(name);
    };
  }, [rootRef, enabled, selector]);
}
