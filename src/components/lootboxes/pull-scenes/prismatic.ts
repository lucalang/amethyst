import { type RGB, type Scene, type Spark, TAU, WHITE, drawSparks, easeBack, easeOut, emitSparks, flashOver, glow, rand, rgba, ring, span } from "./kit";

const SPECTRUM: RGB[] = [
  [255, 59, 92],
  [255, 149, 0],
  [255, 230, 0],
  [52, 230, 120],
  [34, 211, 238],
  [70, 110, 255],
  [190, 90, 255],
];
const SECTORS = 12;

type Tri = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; size: number; hue: number; life: number };
type Tile = { r: number; a: number; size: number; rot: number; hue: number };
type Twinkle = { x: number; y: number; life: number; size: number; hue: number };

const triangle = (c: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) => {
  c.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = rot + (k / 3) * TAU - Math.PI / 2;
    c[k ? "lineTo" : "moveTo"](x + Math.cos(a) * size, y + Math.sin(a) * size);
  }
  c.closePath();
};

const star = (c: CanvasRenderingContext2D, x: number, y: number, size: number) => {
  c.beginPath();
  c.moveTo(x, y - size);
  c.quadraticCurveTo(x, y, x + size, y);
  c.quadraticCurveTo(x, y, x, y + size);
  c.quadraticCurveTo(x, y, x - size, y);
  c.quadraticCurveTo(x, y, x, y - size);
};

/** Prismatic: white light splits through a spinning prism, then shatters into a rainbow kaleidoscope. */
export const prismaticScene: Scene = () => {
  const shards: Tri[] = [];
  const sparks: Spark[] = [];
  const twinkles: Twinkle[] = [];
  const tiles: Tile[] = Array.from({ length: 20 }, () => ({ r: rand(0.05, 1), a: rand(0, TAU / SECTORS), size: rand(0.015, 0.06), rot: rand(0, TAU), hue: Math.floor(rand(0, 7)) }));
  let burst = false;

  return (f) => {
    const { c, t, after, dt, w, h, m, p } = f;
    const cx = w / 2;
    const cy = h * 0.46;
    const reach = Math.hypot(w, h);
    const shift = Math.max(0, after) / 160;
    const hueAt = (i: number) => SPECTRUM[Math.floor(i + shift) % SPECTRUM.length];

    c.fillStyle = "#040208";
    c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = "lighter";

    // Afterglow aurora ribbons in screen space.
    const aurora = span(after, 150, 1200);
    if (aurora > 0) {
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        for (let x = -20; x <= w + 20; x += 14) {
          const y = h * (0.16 + 0.34 * k) + Math.sin(x * 0.005 + after * 0.0013 + k * 2) * m * 0.07 + Math.sin(x * 0.013 - after * 0.002) * m * 0.02;
          c[x === -20 ? "moveTo" : "lineTo"](x, y);
        }
        const col = hueAt(k * 2 + after / 400);
        c.lineWidth = m * 0.07;
        c.strokeStyle = rgba(col, 0.06 * aurora);
        c.stroke();
        c.lineWidth = 2;
        c.strokeStyle = rgba(col, 0.35 * aurora);
        c.stroke();
      }
    }

    // Twinkling sparkles across the field.
    if (Math.random() < 0.08 + p * 0.35 + (after > 0 ? 0.4 : 0)) twinkles.push({ x: rand(0, w), y: rand(0, h), life: 1, size: rand(2, 7), hue: Math.floor(rand(0, 7)) });
    for (let i = twinkles.length - 1; i >= 0; i--) {
      const s = twinkles[i];
      s.life -= 0.02 * dt;
      if (s.life <= 0) {
        twinkles.splice(i, 1);
        continue;
      }
      star(c, s.x, s.y, s.size * Math.sin(s.life * Math.PI));
      c.fillStyle = rgba(SPECTRUM[s.hue], 0.8 * s.life);
      c.fill();
    }

    c.translate(cx, cy);

    if (!burst) {
      const size = m * 0.09 * easeBack(span(p, 0.05, 0.3));
      const rot = t * 0.0006 + p * p * p * 9;
      // Incoming white beam from the left.
      const beam = easeOut(span(p, 0, 0.22));
      const wobble = Math.sin(t * 0.004) * m * 0.004;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-cx - 20, wobble);
      c.lineTo((-cx - 20) * (1 - beam), 0);
      c.lineWidth = 12;
      c.strokeStyle = rgba(WHITE, 0.12);
      c.stroke();
      c.lineWidth = 2.5;
      c.strokeStyle = rgba(WHITE, 0.9);
      c.stroke();
      // Rainbow fans that multiply as the prism spins up.
      const fanIn = easeOut(span(p, 0.2, 0.45));
      if (fanIn > 0) {
        const fans = 1 + span(p, 0.5, 0.95) * 5;
        const spread = 0.05 + 0.3 * fanIn;
        for (let k = 0; k < Math.ceil(fans); k++) {
          const strength = Math.min(1, fans - k);
          const aim = k === 0 ? Math.sin(t * 0.0021) * 0.3 : rot * 0.35 + (k / Math.ceil(fans)) * TAU;
          SPECTRUM.forEach((col, j) => {
            const a = aim + (j / 6 - 0.5) * spread;
            const half = 0.008 + spread / 16;
            c.beginPath();
            c.moveTo(0, 0);
            c.lineTo(Math.cos(a - half) * reach * fanIn, Math.sin(a - half) * reach * fanIn);
            c.lineTo(Math.cos(a + half) * reach * fanIn, Math.sin(a + half) * reach * fanIn);
            c.closePath();
            c.fillStyle = rgba(col, 0.22 * strength);
            c.fill();
          });
        }
      }
      glow(c, 0, 0, m * (0.08 + 0.22 * p), WHITE, 0.2 + 0.5 * p * p);
      // The glass prism.
      if (size > 0) {
        c.globalCompositeOperation = "source-over";
        triangle(c, 0, 0, size, rot);
        const glass = c.createLinearGradient(-size, -size, size, size);
        glass.addColorStop(0, "rgba(255,255,255,0.22)");
        glass.addColorStop(0.5, "rgba(190,170,255,0.08)");
        glass.addColorStop(1, "rgba(255,255,255,0.3)");
        c.fillStyle = glass;
        c.fill();
        c.lineWidth = 1.6;
        c.strokeStyle = rgba(WHITE, 0.85);
        c.stroke();
        c.globalCompositeOperation = "lighter";
        triangle(c, 0, 0, size * 0.55, -rot * 1.5);
        c.lineWidth = 1;
        c.strokeStyle = rgba(hueAt(t / 120), 0.5 * span(p, 0.4, 0.8));
        c.stroke();
      }
    }

    if (after >= 0 && !burst) {
      burst = true;
      for (let i = 0; i < 70; i++) {
        const a = rand(0, TAU);
        const v = m * rand(0.004, 0.03);
        shards.push({ x: 0, y: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, TAU), vr: rand(-0.15, 0.15), size: m * rand(0.008, 0.03), hue: i % 7, life: 1 });
      }
      emitSparks(sparks, 160, m * 0.035, SPECTRUM);
    }

    if (burst) {
      const open = easeOut(span(after, 0, 900));
      // Mirrored kaleidoscope sectors.
      const fade = 0.25 + 0.65 * (1 - span(after, 300, 1600));
      c.save();
      c.rotate(after * 0.00018);
      for (let k = 0; k < SECTORS; k++) {
        c.save();
        c.rotate((k / SECTORS) * TAU);
        if (k % 2) c.scale(1, -1);
        tiles.forEach((tile, i) => {
          const radius = tile.r * m * 0.95 * open;
          const pulse = 1 + 0.25 * Math.sin(after * 0.004 + i);
          triangle(c, Math.cos(tile.a) * radius, Math.sin(tile.a) * radius, tile.size * m * pulse * open, tile.rot + after * 0.001);
          c.fillStyle = rgba(hueAt(tile.hue), 0.22 * fade);
          c.fill();
          c.lineWidth = 1;
          c.strokeStyle = rgba(hueAt(tile.hue + 1), 0.6 * fade);
          c.stroke();
        });
        c.restore();
      }
      c.restore();
      SPECTRUM.forEach((col, j) => {
        const local = span(after, j * 60, j * 60 + 1100);
        ring(c, m * (0.05 + easeOut(local) * 1.3), 2, col, 1 - local);
      });
      glow(c, 0, 0, m * (0.3 + 0.05 * Math.sin(after * 0.005)), hueAt(after / 300), 0.25 + 0.5 * (1 - open));
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.975 ** dt;
        s.vy *= 0.975 ** dt;
        s.rot += s.vr * dt;
        s.life -= 0.008 * dt;
        if (s.life <= 0) {
          shards.splice(i, 1);
          continue;
        }
        triangle(c, s.x, s.y, s.size, s.rot);
        c.fillStyle = rgba(SPECTRUM[s.hue], 0.55 * s.life);
        c.fill();
        c.strokeStyle = rgba(WHITE, 0.7 * s.life);
        c.stroke();
      }
    }

    drawSparks(c, sparks, dt);
    c.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
    flashOver(f, burst ? (1 - span(after, 0, 420)) * 0.9 : 0);
  };
};
