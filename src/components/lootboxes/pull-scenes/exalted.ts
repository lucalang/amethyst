import { type RGB, type Scene, type Spark, TAU, WHITE, drawSparks, easeBack, easeIn, easeOut, emitSparks, flashOver, glow, hex, rand, rays, rgba, ring, span } from "./kit";

const DEEP: RGB = [245, 158, 11];
const MAIN_ROW = 11;
const COVERT_ROW = 8;

type Feather = { x: number; y: number; vy: number; rot: number; phase: number; size: number };
type Mote = { x: number; y: number; vy: number; life: number };

const feather = (c: CanvasRenderingContext2D, length: number, fill: string, edge: string) => {
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(length * 0.5, -length * 0.13, length, 0);
  c.quadraticCurveTo(length * 0.5, length * 0.1, 0, 0);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = edge;
  c.stroke();
};

/** Exalted: a heaven beam descends, a halo forms, and golden wings unfurl in an ascension. */
export const exaltedScene: Scene = ({ color }) => {
  const gold = hex(color);
  const sparks: Spark[] = [];
  const feathers: Feather[] = [];
  const motes: Mote[] = [];
  let burst = false;

  const wing = (c: CanvasRenderingContext2D, side: number, unfurl: number, flap: number, m: number, alpha: number) => {
    const shoulder = { x: side * m * 0.03, y: -m * 0.03 };
    const arm = 1.3 + (-0.45 - 1.3) * unfurl + flap;
    const armLen = m * (0.05 + 0.2 * unfurl);
    const rows: [number, number, number, number][] = [
      [MAIN_ROW, 1, 0.3, 0.25],
      [COVERT_ROW, 0.55, 0.45, 0.4],
    ];
    rows.forEach(([count, scale, fillAlpha, lift]) => {
      for (let j = 0; j < count; j++) {
        const k = j / (count - 1);
        const bx = shoulder.x + side * Math.cos(arm) * armLen * (0.1 + 0.9 * k);
        const by = shoulder.y + Math.sin(arm) * armLen * (0.1 + 0.9 * k);
        const a = 1.35 + (arm + 0.3 - lift * 0.3 - 1.35) * k * unfurl + flap * k;
        const length = m * (0.12 + 0.24 * k * k) * scale * (0.35 + 0.65 * unfurl);
        c.save();
        c.translate(bx, by);
        c.rotate(side > 0 ? a : Math.PI - a);
        feather(c, length, rgba(k > 0.6 ? WHITE : gold, fillAlpha * alpha), rgba(WHITE, 0.55 * alpha));
        c.restore();
      }
    });
  };

  return (f) => {
    const { c, t, after, dt, w, h, m, p } = f;
    const cx = w / 2;
    const cy = h * 0.46;
    const ground = m * 0.3;
    const haloY = -m * 0.17;

    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#05040f");
    sky.addColorStop(1, rgba([22 + 20 * p, 12 + 10 * p, 4], 1));
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    c.translate(cx, cy);
    c.globalCompositeOperation = "lighter";

    // Dawn rising on the horizon.
    c.save();
    c.scale(1, 0.14);
    glow(c, 0, ground / 0.14, w * 0.55, DEEP, 0.15 + 0.35 * p + (after > 0 ? 0.25 : 0));
    c.restore();
    c.fillStyle = rgba(gold, 0.3 * p);
    c.fillRect(-cx, ground, w, 1);

    // Ground rune circle.
    const rune = span(p, 0.35, 0.85);
    if (rune > 0) {
      c.save();
      c.translate(0, ground);
      c.setLineDash([m * 0.012, m * 0.008]);
      c.lineDashOffset = -t * 0.03;
      ring(c, m * 0.36 * easeOut(rune), 1.5, gold, 0.6, 0.17);
      c.setLineDash([]);
      ring(c, m * 0.3 * easeOut(rune), 1, gold, 0.35, 0.17);
      c.restore();
    }

    // Embers rising from the ground.
    if (Math.random() < 0.15 + p * 0.5 + (after > 0 ? 0.6 : 0)) motes.push({ x: rand(-w * 0.4, w * 0.4), y: ground, vy: -rand(0.4, 1.6), life: 1 });
    for (let i = motes.length - 1; i >= 0; i--) {
      const s = motes[i];
      s.y += s.vy * dt;
      s.x += Math.sin(t * 0.002 + i) * 0.3 * dt;
      s.life -= 0.006 * dt;
      if (s.life <= 0) {
        motes.splice(i, 1);
        continue;
      }
      c.fillStyle = rgba(i % 3 ? gold : WHITE, s.life * (0.5 + 0.5 * Math.sin(t * 0.01 + i)));
      c.fillRect(s.x, s.y, 2, 2);
    }

    // The heaven beam: a thin thread descending, then widening.
    const descend = easeIn(span(p, 0.08, 0.72));
    const bottom = -cy + (cy + ground) * descend;
    const widen = after > 0 ? 0.06 + 0.3 * (1 - easeOut(span(after, 0, 800))) : 0.004 + 0.05 * span(p, 0.72, 1) ** 2;
    const bw = m * widen * (1 + 0.08 * Math.sin(t * 0.05));
    if (descend > 0) {
      const beam = c.createLinearGradient(0, -cy, 0, bottom);
      beam.addColorStop(0, rgba(gold, 0.15));
      beam.addColorStop(1, rgba(WHITE, 0.85));
      c.fillStyle = rgba(gold, 0.08);
      c.fillRect(-bw * 3, -cy, bw * 6, bottom + cy);
      c.fillStyle = beam;
      c.fillRect(-bw / 2, -cy, bw, bottom + cy);
      glow(c, 0, bottom, m * (0.05 + 0.1 * span(p, 0.6, 1)), gold, 0.7);
    }

    // Sun rays behind everything once the wings open.
    rays(c, 20, m * 1.3, after * 0.00015, [gold, DEEP, WHITE], 0.05 * span(after, 0, 600));

    // Wings.
    if (after >= 0 && !burst) {
      burst = true;
      emitSparks(sparks, 140, m * 0.03, [gold, WHITE, DEEP], { gravity: 0.05 });
      for (let i = 0; i < 16; i++) feathers.push({ x: rand(-m * 0.4, m * 0.4), y: rand(-m * 0.3, m * 0.1), vy: rand(0.3, 0.9), rot: rand(0, TAU), phase: rand(0, TAU), size: m * rand(0.025, 0.05) });
    }
    if (burst) {
      const unfurl = Math.max(0, easeBack(span(after, 0, 900)));
      const flap = Math.sin(after * 0.0028) * 0.06 * span(after, 900, 1400);
      wing(c, 1, unfurl, flap, m, 1);
      wing(c, -1, unfurl, flap, m, 1);
      glow(c, 0, -m * 0.02, m * 0.3, gold, 0.3 + 0.4 * (1 - span(after, 0, 900)));
      c.save();
      c.translate(0, ground);
      const shock = span(after, 0, 1200);
      ring(c, m * (0.1 + easeOut(shock) * 1.4), 3, gold, 1 - shock, 0.15);
      c.restore();
    }

    // The halo.
    const halo = easeOut(span(p, 0.3, 0.7));
    if (halo > 0) {
      c.save();
      c.translate(0, haloY + Math.sin(t * 0.002) * m * 0.004);
      const rx = m * 0.085 * (1 + 0.15 * easeOut(span(after, 0, 500)));
      c.beginPath();
      c.ellipse(0, 0, rx, rx * 0.26, 0, -Math.PI / 2, -Math.PI / 2 + TAU * halo);
      c.lineWidth = 10;
      c.strokeStyle = rgba(gold, 0.15);
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = rgba(WHITE, 0.9);
      c.stroke();
      const run = t * 0.004;
      glow(c, Math.cos(run) * rx, Math.sin(run) * rx * 0.26, m * 0.03, gold, 0.8 * halo);
      c.restore();
    }

    // Falling feathers.
    if (p > 0.25 && Math.random() < 0.04 + (after > 0 ? 0.06 : 0)) feathers.push({ x: rand(-w / 2, w / 2), y: -cy - 20, vy: rand(0.4, 1), rot: rand(0, TAU), phase: rand(0, TAU), size: m * rand(0.025, 0.05) });
    for (let i = feathers.length - 1; i >= 0; i--) {
      const s = feathers[i];
      s.y += s.vy * dt;
      s.x += Math.sin(t * 0.0018 + s.phase) * 0.6 * dt;
      if (s.y > h) {
        feathers.splice(i, 1);
        continue;
      }
      c.save();
      c.translate(s.x, s.y);
      c.rotate(s.rot + Math.sin(t * 0.003 + s.phase) * 0.7);
      feather(c, s.size, rgba(gold, 0.45), rgba(WHITE, 0.6));
      c.restore();
    }

    drawSparks(c, sparks, dt, 0.96);
    c.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
    flashOver(f, burst ? (1 - span(after, 0, 450)) * 0.85 : 0, [255, 244, 214]);
  };
};
