"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useMotionLevel } from "@/components/showcase/motion";

/** The Flashy hero's frame: feeds pointer position to CSS (`--mx`/`--my`, -1..1) for parallax when full motion is on. */
export function FlashyStage({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const motion = useMotionLevel();

  useEffect(() => {
    const stage = ref.current;
    if (!stage || motion !== "full" || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      stage.style.setProperty("--mx", x.toFixed(3));
      stage.style.setProperty("--my", y.toFixed(3));
    };
    const onMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
      y = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      x = 0;
      y = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    stage.addEventListener("pointermove", onMove);
    stage.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      stage.style.removeProperty("--mx");
      stage.style.removeProperty("--my");
    };
  }, [motion]);

  return (
    <div ref={ref} className={className} data-parallax={motion === "full" || undefined}>
      {children}
    </div>
  );
}

const REACTIVE = '.home-section :is(.poster-card, [class~="group/collection"])';

/**
 * Home's wrapper. In Flashy mode with full motion, the card under the pointer gets `--tx`/`--ty`
 * (-1..1) for its tilt and `--gx`/`--gy` (px) for its light; one listener serves every section.
 */
export function FlashyScope({ flashy, style, children }: { flashy: boolean; style: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const motion = useMotionLevel();

  useEffect(() => {
    const root = ref.current;
    if (!root || !flashy || motion !== "full" || !window.matchMedia("(pointer: fine)").matches) return;
    let active: HTMLElement | null = null;
    let frame = 0;
    let point = { x: 0, y: 0 };
    const release = () => {
      if (!active) return;
      for (const name of ["--tx", "--ty", "--gx", "--gy"]) active.style.removeProperty(name);
      delete active.dataset.spot;
      active = null;
    };
    const apply = () => {
      frame = 0;
      if (!active) return;
      // The rect includes the current tilt, which is small enough not to matter.
      const rect = active.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (point.x - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (point.y - rect.top) / rect.height));
      active.style.setProperty("--tx", (x * 2 - 1).toFixed(3));
      active.style.setProperty("--ty", (y * 2 - 1).toFixed(3));
      active.style.setProperty("--gx", `${(x * rect.width).toFixed(1)}px`);
      active.style.setProperty("--gy", `${(y * rect.height).toFixed(1)}px`);
    };
    const onMove = (event: PointerEvent) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>(REACTIVE) : null;
      if (card !== active) {
        release();
        active = card;
        if (active) active.dataset.spot = "";
      }
      point = { x: event.clientX, y: event.clientY };
      if (active && !frame) frame = requestAnimationFrame(apply);
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", release);
    return () => {
      cancelAnimationFrame(frame);
      release();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", release);
    };
  }, [flashy, motion]);

  return (
    <div ref={ref} className={flashy ? "flashy-home" : undefined} data-home-style={style}>
      {children}
    </div>
  );
}
