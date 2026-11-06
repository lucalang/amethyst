import { type Frame, type RGB, type Scene, type Spark, TAU, WHITE, clamp, drawSparks, easeOut, emitSparks, flashOver, glow, hex, pick, rand, rgba, ring, span } from "./kit";

const GLYPHS = "01アカサタナハマヤラワ#$%&*+<>/=ΣΔΩ".split("");
const RINGS = [
  { radius: 0.09, count: 6, width: 3, dir: 1 },
  { radius: 0.14, count: 10, width: 2, dir: -1 },
  { radius: 0.19, count: 16, width: 1.5, dir: 1 },
];
const CELL = 16;

type Shard = { r: number; a: number; len: number; vr: number; spin: number; width: number; life: number };

/** Secret: a decryption lock. Glyph rain, locking cipher rings, an eye that opens and blows the lock apart. */
export const secretScene: Scene = ({ color }) => {
  const base = hex(color);
  const pale: RGB = [base[0] + (255 - base[0]) * 0.6, base[1] + (255 - base[1]) * 0.6, base[2] + (255 - base[2]) * 0.6];
  const rain = document.createElement("canvas");
  const r = rain.getContext("2d");
  let cols: { y: number; speed: number; cell: number }[] = [];
  const orbit = Array.from({ length: 28 }, () => pick(GLYPHS));
  const locked = RINGS.map(() => false);
  const sparks: Spark[] = [];
  const shards: Shard[] = [];
  let burst = false;

  const glitch = (f: Frame, slices: number, reach: number) => {
    const { c, canvas, w, h, dpr } = f;
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < slices; i++) {
      const y = rand(0, h);
      const sh = rand(3, 28);
      const dx = rand(-reach, reach);
      c.drawImage(canvas, 0, y * dpr, w * dpr, sh * dpr, dx * dpr, y * dpr, w * dpr, sh * dpr);
      c.fillStyle = rgba(i % 2 ? base : [255, 40, 120], 0.08);
      c.fillRect(0, y * dpr, w * dpr, sh * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  return (f) => {
    const { c, t, after, dt, w, h, m, p } = f;
    const cx = w / 2;
    const cy = h * 0.46;

    // Glyph rain lives on its own canvas so its tails fade without smearing the sigil.
    if (r && (rain.width !== Math.round(w) || rain.height !== Math.round(h))) {
      rain.width = Math.round(w);
      rain.height = Math.round(h);
      cols = Array.from({ length: Math.ceil(w / CELL) }, () => ({ y: rand(-h, 0), speed: rand(2, 5), cell: -1 }));
    }
    if (r) {
      r.globalCompositeOperation = "destination-out";
      r.fillStyle = "rgba(0,0,0,0.09)";
      r.fillRect(0, 0, w, h);
      r.globalCompositeOperation = "source-over";
      r.font = `${CELL - 2}px ui-monospace, monospace`;
      r.textAlign = "center";
      const pace = 0.6 + p * 1.6 + (after > 0 ? 1.4 : 0);
      cols.forEach((col, i) => {
        col.y += col.speed * pace * dt;
        if (col.y > h + CELL * 4) col.y = rand(-h * 0.4, 0);
        const cell = Math.floor(col.y / CELL);
        if (cell === col.cell) return;
        col.cell = cell;
        r.fillStyle = rgba(base, 0.75);
        r.fillText(pick(GLYPHS), i * CELL + CELL / 2, (cell - 1) * CELL);
        r.fillStyle = rgba(WHITE, 0.95);
        r.fillText(pick(GLYPHS), i * CELL + CELL / 2, cell * CELL);
      });
    }

    c.fillStyle = "#020306";
    c.fillRect(0, 0, w, h);
    c.globalAlpha = after > 0 ? 0.55 : 0.18 + p * 0.25;
    c.drawImage(rain, 0, 0, w, h);
    c.globalAlpha = 1;
    // Clear a calm well around the lock so it reads against the rain.
    const well = c.createRadialGradient(cx, cy, 0, cx, cy, m * 0.36);
    well.addColorStop(0, "rgba(2,3,6,0.92)");
    well.addColorStop(1, "rgba(2,3,6,0)");
    c.fillStyle = well;
    c.fillRect(0, 0, w, h);

    c.translate(cx, cy);
    c.globalCompositeOperation = "lighter";

    if (!burst) {
      // Radar sweep.
      const sweep = t * 0.002 * (1 + p * 3);
      for (let i = 0; i < 14; i++) {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, m * 0.26, sweep - (i + 1) * 0.05, sweep - i * 0.05);
        c.closePath();
        c.fillStyle = rgba(base, 0.1 * (1 - i / 14) * span(p, 0, 0.2));
        c.fill();
      }
      // Cipher rings that spin, then lock into place one after another.
      RINGS.forEach((ringDef, i) => {
        const appear = easeOut(span(p, i * 0.12, i * 0.12 + 0.25));
        const lock = easeOut(span(p, 0.55 + i * 0.12, 0.63 + i * 0.12));
        if (lock >= 1 && !locked[i]) {
          locked[i] = true;
          for (let s = 0; s < 26; s++) {
            const a = rand(0, TAU);
            emitSparks(sparks, 1, m * 0.012, [s % 2 ? base : WHITE], { x: Math.cos(a) * m * ringDef.radius, y: Math.sin(a) * m * ringDef.radius, from: a - 0.3, to: a + 0.3 });
          }
        }
        const spin = ringDef.dir * t * 0.0014 * (1 + p * 2) * (1 - lock);
        const seg = TAU / ringDef.count;
        const shade: RGB = lock > 0.5 ? pale : base;
        c.lineWidth = ringDef.width * (1 + lock);
        c.strokeStyle = rgba(shade, (0.45 + 0.55 * lock) * appear);
        for (let s = 0; s < ringDef.count; s++) {
          c.beginPath();
          c.arc(0, 0, m * ringDef.radius, spin + s * seg, spin + s * seg + seg * 0.68 * appear);
          c.stroke();
        }
        if (locked[i]) ring(c, m * ringDef.radius, 1, WHITE, 0.25 * (1 - span(p, 0.63 + i * 0.12, 0.8 + i * 0.12)));
      });
      // Orbiting cipher text.
      if (Math.random() < 0.5) orbit[Math.floor(Math.random() * orbit.length)] = pick(GLYPHS);
      c.font = `${Math.max(9, m * 0.018)}px ui-monospace, monospace`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillStyle = rgba(base, 0.45 * span(p, 0.2, 0.45));
      orbit.forEach((g, i) => {
        const a = (i / orbit.length) * TAU - t * 0.0004;
        c.save();
        c.rotate(a);
        c.fillText(g, 0, -m * 0.235);
        c.restore();
      });
      // The eye: a closed slit that opens as the last ring locks.
      const open = easeOut(span(p, 0.84, 1));
      const ew = m * 0.075;
      const eh = m * 0.002 + m * 0.045 * open;
      glow(c, 0, 0, m * (0.06 + 0.12 * open), base, 0.25 + 0.5 * p);
      c.beginPath();
      c.moveTo(-ew, 0);
      c.quadraticCurveTo(0, -eh * 2, ew, 0);
      c.quadraticCurveTo(0, eh * 2, -ew, 0);
      c.fillStyle = rgba(pale, 0.35 + 0.5 * open);
      c.fill();
      if (open > 0.05) {
        c.save();
        c.clip();
        c.beginPath();
        c.arc(0, 0, eh * 0.9, 0, TAU);
        c.fillStyle = rgba(base, 0.9);
        c.fill();
        c.restore();
        c.globalCompositeOperation = "source-over";
        c.beginPath();
        c.ellipse(0, 0, eh * 0.18, eh * 0.75, 0, 0, TAU);
        c.fillStyle = "#020306";
        c.fill();
        c.globalCompositeOperation = "lighter";
      }
    }

    if (after >= 0 && !burst) {
      burst = true;
      // Break every ring segment loose.
      RINGS.forEach((ringDef) => {
        const seg = TAU / ringDef.count;
        for (let s = 0; s < ringDef.count; s++) {
          shards.push({ r: m * ringDef.radius, a: s * seg, len: seg * 0.68, vr: rand(4, 13), spin: rand(-0.04, 0.04), width: ringDef.width * 2, life: 1 });
        }
      });
      emitSparks(sparks, 180, m * 0.035, [base, WHITE, pale]);
    }

    if (burst) {
      const e = easeOut(span(after, 0, 700));
      // The eye opens wide, then its iris becomes a shockwave.
      const eyeFade = 1 - span(after, 100, 900);
      if (eyeFade > 0) {
        const ew = m * 0.075 * (1 + e * 5);
        const eh = m * 0.047 * (1 + e * 3);
        c.beginPath();
        c.moveTo(-ew, 0);
        c.quadraticCurveTo(0, -eh * 2, ew, 0);
        c.quadraticCurveTo(0, eh * 2, -ew, 0);
        c.fillStyle = rgba(pale, 0.5 * eyeFade);
        c.fill();
      }
      ring(c, m * (0.05 + e * 1.1), 3, base, 1 - span(after, 0, 900));
      ring(c, m * (0.03 + easeOut(span(after, 120, 1000)) * 0.8), 1.5, WHITE, 1 - span(after, 120, 1000));
      glow(c, 0, 0, m * (0.25 + 0.15 * Math.sin(after * 0.004)), base, 0.35 + 0.4 * (1 - e));
      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i];
        s.r += s.vr * dt;
        s.vr *= 0.975 ** dt;
        s.a += s.spin * dt;
        s.life -= 0.012 * dt;
        if (s.life <= 0) {
          shards.splice(i, 1);
          continue;
        }
        c.beginPath();
        c.arc(0, 0, s.r, s.a, s.a + s.len * (s.r < m * 0.5 ? 1 : 0.6));
        c.lineWidth = s.width;
        c.strokeStyle = rgba(pale, s.life);
        c.stroke();
      }
      // Afterglow: a slow data halo of dashed rings.
      const settle = span(after, 300, 1300);
      c.setLineDash([m * 0.01, m * 0.02]);
      [0.3, 0.37, 0.45].forEach((radius, i) => {
        c.save();
        c.rotate(after * 0.0003 * (i % 2 ? -1 : 1));
        ring(c, m * radius, 1, base, 0.3 * settle);
        c.restore();
      });
      c.setLineDash([]);
    }

    drawSparks(c, sparks, dt);
    c.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
    c.globalCompositeOperation = "source-over";

    // Scanlines plus a bright scan bar.
    c.fillStyle = "rgba(0,0,0,0.16)";
    for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
    const bar = ((t * 0.4) % (h + 200)) - 100;
    const scan = c.createLinearGradient(0, bar - 60, 0, bar);
    scan.addColorStop(0, rgba(base, 0));
    scan.addColorStop(1, rgba(base, 0.06));
    c.fillStyle = scan;
    c.fillRect(0, bar - 60, w, 60);

    if (burst && after < 450) glitch(f, 7, 50 * (1 - after / 450));
    else if (Math.random() < (burst ? 0.015 : 0.04 * clamp(p - 0.55) * 2)) glitch(f, 3, 18);
    flashOver(f, (1 - span(after, 0, 380)) * 0.85 * (burst ? 1 : 0), pale);
  };
};
