"use client";

/** A fixed-step loop: `step` runs `hz` times per simulated second whatever the display rate; `draw` once per frame. */
export function startLoop(step: (ms: number) => void, draw: (alpha: number) => void, hz = 60) {
  const ms = 1000 / hz;
  let raf = 0;
  let last = performance.now();
  let pending = 0;
  const frame = (now: number) => {
    // A long gap (background tab, debugger) is dropped instead of fast-forwarded.
    pending += Math.min(now - last, 250);
    last = now;
    let steps = 0;
    while (pending >= ms && steps < 8) {
      step(ms);
      pending -= ms;
      steps += 1;
    }
    if (steps === 8) pending = 0;
    draw(pending / ms);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export type CanvasSize = { width: number; height: number; dpr: number };

/** Keeps a canvas's pixel buffer matched to its displayed size (capped at 2× density). */
export function observeCanvas(canvas: HTMLCanvasElement, onResize: (size: CanvasSize) => void) {
  const apply = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    onResize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height), dpr });
  };
  const observer = new ResizeObserver(apply);
  observer.observe(canvas);
  apply();
  return () => observer.disconnect();
}

/** Scale and offset that fit a world of the given size inside the canvas, centered. */
export function fitWorld(size: CanvasSize, worldWidth: number, worldHeight: number) {
  const scale = Math.min(size.width / worldWidth, size.height / worldHeight);
  return { scale, x: (size.width - worldWidth * scale) / 2, y: (size.height - worldHeight * scale) / 2 };
}

export type Palette = {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  accent: string;
  accent2: string;
  dark: boolean;
};

/** The active theme's colors, read from the game's element (themes are CSS variables). */
export function readPalette(element: Element): Palette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--background", "#000000"),
    surface: read("--surface", "#09080d"),
    foreground: read("--foreground", "#ece8f4"),
    muted: read("--muted-foreground", "#a5a0b5"),
    accent: read("--amethyst", "#a57cff"),
    accent2: read("--rose", "#f472a8"),
    dark: read("--theme-dark", "1") !== "0",
  };
}

const probe = new Map<string, [number, number, number]>();

/** The theme's palette, re-read about once a second so a theme change shows up mid-game. */
export function livePalette(element: Element) {
  let palette = readPalette(element);
  let readAt = performance.now();
  return () => {
    const now = performance.now();
    if (now - readAt > 1000) {
      palette = readPalette(element);
      readAt = now;
    }
    return palette;
  };
}

/** Any CSS color as RGB (resolved once by the browser, then cached). */
export function toRgb(color: string): [number, number, number] {
  const cached = probe.get(color);
  if (cached) return cached;
  let rgb: [number, number, number] = [128, 128, 128];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const value = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    rgb = [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  } else {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      rgb = [r, g, b];
    }
  }
  probe.set(color, rgb);
  return rgb;
}

/** Blend two colors; `t` = 0 gives `a`, 1 gives `b`. Optional alpha. */
export function mix(a: string, b: string, t: number, alpha = 1) {
  const [ar, ag, ab] = toRgb(a);
  const [br, bg, bb] = toRgb(b);
  const k = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(ar + (br - ar) * k)} ${Math.round(ag + (bg - ag) * k)} ${Math.round(ab + (bb - ab) * k)} / ${alpha})`;
}

export function withAlpha(color: string, alpha: number) {
  const [r, g, b] = toRgb(color);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

/** The direction of a swipe, or null when it was too short to count. */
export function swipeDirection(dx: number, dy: number, threshold = 24): "up" | "down" | "left" | "right" | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

export const random = (min: number, max: number) => min + Math.random() * (max - min);
