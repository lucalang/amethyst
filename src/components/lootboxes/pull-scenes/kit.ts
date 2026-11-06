/** Shared canvas loop and particle helpers for the per-rarity pull scenes. */

export type RGB = [number, number, number];
export type Frame = {
  c: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  /** ms since the scene started, and since the burst (negative before it). */
  t: number;
  after: number;
  /** Frame step in 60 fps frames. */
  dt: number;
  w: number;
  h: number;
  m: number;
  dpr: number;
  /** Charge progress 0..1 up to the burst. */
  p: number;
  frame: number;
};
export type SceneOptions = { color: string; build: number; duration: number };
export type Scene = (options: SceneOptions) => (frame: Frame) => void;

export const TAU = Math.PI * 2;
export const WHITE: RGB = [255, 255, 255];

export const hex = (value: string): RGB => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r | 0},${g | 0},${b | 0},${Math.max(0, Math.min(1, a))})`;
export const clamp = (v: number) => Math.min(1, Math.max(0, v));
export const span = (v: number, from: number, to: number) => clamp((v - from) / (to - from));
export const easeOut = (v: number) => 1 - (1 - v) ** 3;
export const easeIn = (v: number) => v * v * v;
export const easeBack = (v: number) => 1 + 2.4 * (v - 1) ** 3 + 1.4 * (v - 1) ** 2;
export const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
export const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** Drives a scene on a canvas until `duration`; returns a stop function. */
export function runScene(canvas: HTMLCanvasElement, options: SceneOptions, scene: Scene): () => void {
  const c = canvas.getContext("2d");
  if (!c) return () => {};
  let w = 0;
  let h = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  };
  resize();
  window.addEventListener("resize", resize);
  const draw = scene(options);
  let start = 0;
  let last = 0;
  let frame = 0;
  let raf = 0;
  const loop = (now: number) => {
    if (!start) start = last = now;
    const t = now - start;
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    frame++;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    draw({ c, canvas, t, after: t - options.build, dt, w, h, m: Math.min(w, h), dpr, p: clamp(t / options.build), frame });
    if (t < options.duration) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}

/** Fades the previous frame towards the backdrop, leaving motion trails. */
export function trail({ c, w, h }: Frame, alpha: number, backdrop: RGB = [3, 1, 8]) {
  c.globalCompositeOperation = "source-over";
  c.fillStyle = rgba(backdrop, alpha);
  c.fillRect(0, 0, w, h);
}

export function flashOver({ c, w, h, dpr }: Frame, alpha: number, color: RGB = WHITE) {
  if (alpha <= 0) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.globalCompositeOperation = "source-over";
  c.fillStyle = rgba(color, alpha);
  c.fillRect(0, 0, w, h);
}

export type Spark = { x: number; y: number; vx: number; vy: number; life: number; fade: number; c: RGB; w: number; g: number };

export function emitSparks(list: Spark[], count: number, speed: number, colors: readonly RGB[], at: { x?: number; y?: number; from?: number; to?: number; gravity?: number } = {}) {
  for (let i = 0; i < count; i++) {
    const a = rand(at.from ?? 0, at.to ?? TAU);
    const v = speed * rand(0.1, 1);
    list.push({ x: at.x ?? 0, y: at.y ?? 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, fade: rand(0.01, 0.026), c: colors[i % colors.length], w: rand(1, 2.6), g: at.gravity ?? 0 });
  }
}

/** Draws sparks as streaks with additive blending (call inside the scene's transform). */
export function drawSparks(c: CanvasRenderingContext2D, list: Spark[], dt: number, drag = 0.955) {
  c.globalCompositeOperation = "lighter";
  c.lineCap = "round";
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const x0 = s.x;
    const y0 = s.y;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= drag ** dt;
    s.vy = s.vy * drag ** dt + s.g * dt;
    s.life -= s.fade * dt;
    if (s.life <= 0) {
      list.splice(i, 1);
      continue;
    }
    c.beginPath();
    c.moveTo(x0 - s.vx * 2, y0 - s.vy * 2);
    c.lineTo(s.x, s.y);
    c.lineWidth = s.w;
    c.strokeStyle = rgba(s.c, s.life);
    c.stroke();
  }
}

export function ring(c: CanvasRenderingContext2D, radius: number, width: number, color: RGB, alpha: number, squash = 1) {
  if (radius <= 0 || alpha <= 0) return;
  c.beginPath();
  c.ellipse(0, 0, radius, radius * squash, 0, 0, TAU);
  c.lineWidth = width * 4;
  c.strokeStyle = rgba(color, alpha * 0.15);
  c.stroke();
  c.lineWidth = width;
  c.strokeStyle = rgba(color, alpha);
  c.stroke();
}

export function glow(c: CanvasRenderingContext2D, x: number, y: number, radius: number, color: RGB, alpha: number) {
  if (radius <= 0 || alpha <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, rgba(WHITE, alpha));
  g.addColorStop(0.2, rgba(color, alpha * 0.7));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

/** Additive god rays around the origin. */
export function rays(c: CanvasRenderingContext2D, count: number, reach: number, turn: number, colors: readonly RGB[], alpha: number) {
  if (alpha <= 0) return;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + turn;
    const width = 0.045 + 0.025 * Math.sin(turn * 7 + i);
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(a - width) * reach, Math.sin(a - width) * reach);
    c.lineTo(Math.cos(a + width) * reach, Math.sin(a + width) * reach);
    c.closePath();
    c.fillStyle = rgba(colors[i % colors.length], alpha);
    c.fill();
  }
}
