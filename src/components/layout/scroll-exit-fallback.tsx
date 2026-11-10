"use client";

import { useEffect } from "react";

const SELECTOR = ".scroll-fade, .header-scroll-exit";
/** Height of the sticky top bar (3.5rem); matches `view(block 3.5rem 0px)` in globals.css. */
const TOP_INSET = 56;

function documentTop(element: HTMLElement): number {
  // offsetTop ignores transforms, so the element's own exit animation never feeds back into the measurement.
  let top = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

/**
 * Emulates the CSS scroll-driven exit animations in browsers without
 * `animation-timeline` support. Passive scroll listener, one rAF per frame,
 * nothing at all when reduced motion is requested.
 */
export function ScrollExitFallback() {
  useEffect(() => {
    if (typeof CSS === "undefined" || CSS.supports("animation-timeline: view()")) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = window.scrollY + TOP_INSET;
      // Measure everything before writing anything: interleaving forces a layout per element.
      const elements = [...document.querySelectorAll<HTMLElement>(SELECTOR)];
      const values = elements.map((element) =>
        Math.min(1, Math.max(0, (line - documentTop(element)) / Math.max(1, element.offsetHeight))).toFixed(3),
      );
      elements.forEach((element, index) => {
        if (element.style.getPropertyValue("--exit-progress") === values[index]) return;
        element.setAttribute("data-exit-fallback", "");
        element.style.setProperty("--exit-progress", values[index]);
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const clear = () => {
      for (const element of document.querySelectorAll<HTMLElement>("[data-exit-fallback]")) {
        element.removeAttribute("data-exit-fallback");
        element.style.removeProperty("--exit-progress");
      }
    };
    const apply = () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (reduce.matches) {
        clear();
        return;
      }
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      schedule();
    };

    apply();
    reduce.addEventListener("change", apply);
    return () => {
      reduce.removeEventListener("change", apply);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
      clear();
    };
  }, []);
  return null;
}
