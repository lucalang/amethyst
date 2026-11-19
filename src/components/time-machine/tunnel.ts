/**
 * The temporal tunnel behind every scene: streaks of light and square "time gates" rushing past a vanishing point.
 * Plain 2D canvas, so it works everywhere and costs little. Speed is the story's pulse: it surges whenever the
 * clock rolls to another date, settles during a scene, and runs in reverse on the way back to the present.
 */

export type Tunnel = {
  /** 0 = drifting, 1 = full rush. */
  setSpeed(speed: number): void;
  /** 1 = travelling back into the past (streaks fly outward), -1 = returning to the present. */
  setDirection(direction: 1 | -1): void;
  start(): void;
  stop(): void;
  /** Draws one still frame (for reduced motion). */
  still(): void;
  resize(): void;
  dispose(): void;
};

type Streak = { angle: number; radius: number; z: number; hue: number };
type Gate = { z: number };

const rgb = (value: string, fallback: string) => {
  const parts = value.trim().split(/[\s,]+/).map(Number);
  return parts.length >= 3 && parts.every(Number.isFinite) ? `${parts[0]}, ${parts[1]}, ${parts[2]}` : fallback;
};

export function createTunnel(canvas: HTMLCanvasElement, options: { coarse: boolean }): Tunnel {
  const ctx = canvas.getContext("2d");
  const styles = getComputedStyle(canvas);
  const accent = rgb(styles.getPropertyValue("--accent-rgb"), "165, 124, 255");
  const rose = rgb(styles.getPropertyValue("--rose-rgb"), "244, 114, 168");
  const count = options.coarse ? 150 : 260;
  const streaks: Streak[] = Array.from({ length: count }, () => ({ angle: Math.random() * Math.PI * 2, radius: 0.08 + Math.random() ** 0.6 * 1.3, z: 0.03 + Math.random() * 0.97, hue: Math.random() }));
  const gates: Gate[] = Array.from({ length: 7 }, (_, i) => ({ z: (i + 0.5) / 7 }));
  let width = 1;
  let height = 1;
  let speed = 0.12;
  let smooth = 0.12;
  let direction: 1 | -1 = 1;
  let raf = 0;
  let last = 0;
  let disposed = false;

  function draw(dt: number) {
    if (!ctx) return;
    smooth += (speed - smooth) * Math.min(1, dt * 5);
    const cx = width / 2;
    const cy = height * 0.48;
    const reach = Math.hypot(width, height) * 0.6;
    ctx.clearRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.9);
    glow.addColorStop(0, `rgba(${accent}, ${0.2 + smooth * 0.22})`);
    glow.addColorStop(0.35, `rgba(${accent}, 0.05)`);
    glow.addColorStop(1, "rgba(5, 4, 10, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    // z runs from 1 (far, at the vanishing point) to 0 (at the viewer). Travelling back means z falls.
    const step = (0.05 + smooth * 1.05) * dt * direction * -1;
    ctx.lineCap = "round";
    for (const streak of streaks) {
      streak.z += step;
      if (streak.z <= 0.02) streak.z = 1;
      else if (streak.z > 1) streak.z = 0.04;
      const near = 1 - streak.z;
      const trail = Math.min(0.3, 0.012 + smooth * 0.17);
      const back = Math.min(1, Math.max(0.02, streak.z + trail * direction));
      const ax = cx + Math.cos(streak.angle) * (streak.radius * reach * 0.5) / Math.max(0.05, streak.z);
      const ay = cy + Math.sin(streak.angle) * (streak.radius * reach * 0.5) / Math.max(0.05, streak.z);
      const bx = cx + Math.cos(streak.angle) * (streak.radius * reach * 0.5) / Math.max(0.05, back);
      const by = cy + Math.sin(streak.angle) * (streak.radius * reach * 0.5) / Math.max(0.05, back);
      ctx.strokeStyle = `rgba(${streak.hue > 0.7 ? rose : accent}, ${Math.min(0.9, 0.12 + near * (0.5 + smooth * 0.4))})`;
      ctx.lineWidth = 0.6 + near * (1.4 + smooth * 1.4);
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ax, ay);
      ctx.stroke();
    }

    // Time gates: square frames that swell as they pass, like markers on the way back.
    for (const gate of gates) {
      gate.z += step * 0.9;
      if (gate.z <= 0.03) gate.z = 1;
      else if (gate.z > 1) gate.z = 0.05;
      const scale = reach * 0.34 / Math.max(0.05, gate.z);
      const alpha = Math.min(0.55, (1 - gate.z) * 0.9) * (gate.z < 0.12 ? gate.z / 0.12 : 1);
      ctx.strokeStyle = `rgba(${accent}, ${alpha})`;
      ctx.lineWidth = 1 + (1 - gate.z) * 2;
      const r = scale * 0.12;
      ctx.beginPath();
      ctx.roundRect(cx - scale, cy - scale * 0.62, scale * 2, scale * 1.24, r);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function frame(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  return {
    setSpeed: (value) => {
      speed = value;
    },
    setDirection: (value) => {
      direction = value;
    },
    start() {
      if (raf || disposed) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    still() {
      smooth = 0.2;
      draw(0);
    },
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, options.coarse ? 1.5 : 1.75);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
    },
  };
}
