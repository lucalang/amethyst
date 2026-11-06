import { CUTSCENE_RARITIES, type CutsceneRarity } from "@/lib/rarities";
import { exaltedScene } from "./pull-scenes/exalted";
import { type Scene, runScene } from "./pull-scenes/kit";
import { prismaticScene } from "./pull-scenes/prismatic";
import { secretScene } from "./pull-scenes/secret";

type RGB = [number, number, number];
type Streak = { x: number; y: number; vx: number; vy: number; life: number; fade: number; c: RGB; w: number };
type Inflow = { a: number; r: number; speed: number; c: RGB; w: number };
type Shard = { x: number; y: number; vx: number; vy: number; rot: number; spin: number; pts: number[]; c: RGB; life: number };
type Ring = { at: number; speed: number; c: RGB; width: number };
type Star = { a: number; r: number; z: number };

export type PullSceneOptions = { rarity: CutsceneRarity; color: string; build: number; duration: number };

const TAU = Math.PI * 2;
const WHITE: RGB = [255, 255, 255];
// Crystal outline (unit size, centred) and the facet hub its faces meet at.
const GEM = [0, -1.25, 0.72, -0.38, 0.56, 0.5, 0, 1.12, -0.56, 0.5, -0.72, -0.38];
const HUB = [0, -0.2];

const hex = (value: string): RGB => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
const clamp = (v: number) => Math.min(1, Math.max(0, v));
const span = (v: number, from: number, to: number) => clamp((v - from) / (to - from));
const easeOut = (v: number) => 1 - (1 - v) ** 3;
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

function crackPaths(): number[][] {
  return Array.from({ length: 8 }, (_, i) => {
    let a = (i / 8) * TAU + rand(-0.3, 0.3);
    let x = HUB[0];
    let y = HUB[1];
    const pts = [x, y];
    for (let step = 0; step < 6; step++) {
      a += rand(-0.6, 0.6);
      x += Math.cos(a) * 0.22;
      y += Math.sin(a) * 0.22;
      pts.push(x, y);
    }
    return pts;
  });
}

// Each cutscene rarity gets its own scene; amethyst keeps the crystal shatter.
const SCENES: Record<Exclude<CutsceneRarity, "amethyst">, Scene> = {
  secret: secretScene,
  prismatic: prismaticScene,
  exalted: exaltedScene,
};

/** Runs the canvas half of a pull cutscene for a rarity. Returns a stop function. */
export function playPullScene(canvas: HTMLCanvasElement, options: PullSceneOptions): () => void {
  if (options.rarity === "amethyst") return playCrystalScene(canvas, options);
  return runScene(canvas, options, SCENES[options.rarity]);
}

/** Crystal scene: black hole, charge, crack, shatter, afterglow. */
function playCrystalScene(canvas: HTMLCanvasElement, { rarity, color, build, duration }: PullSceneOptions): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const level = CUTSCENE_RARITIES.indexOf(rarity) + 1;
  const base = hex(color);
  const tint = (i: number): RGB => (i % 4 ? base : WHITE);

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

  const stars: Star[] = Array.from({ length: 160 }, () => ({ a: rand(0, TAU), r: rand(0.05, 1), z: Math.random() }));
  const cracks = crackPaths();
  const inflow: Inflow[] = [];
  const sparks: Streak[] = [];
  const embers: Streak[] = [];
  const shards: Shard[] = [];
  const rings: Ring[] = [];
  let start = 0;
  let last = 0;
  let burst = false;
  let flash = 0;
  let frame = 0;

  function gemPath(size: number, squash: number) {
    ctx!.beginPath();
    for (let i = 0; i < GEM.length; i += 2) ctx!.lineTo(GEM[i] * size * squash, GEM[i + 1] * size);
    ctx!.closePath();
  }

  function drawGem(size: number, spin: number, t: number, crack: number) {
    const c = ctx!;
    const squash = 0.55 + 0.45 * Math.abs(Math.cos(spin));
    const count = GEM.length / 2;
    c.globalCompositeOperation = "source-over";
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      const light = 0.35 + 0.35 * Math.sin(spin * 2 + i * 1.3);
      c.beginPath();
      c.moveTo(HUB[0] * size, HUB[1] * size);
      c.lineTo(GEM[i * 2] * size * squash, GEM[i * 2 + 1] * size);
      c.lineTo(GEM[j * 2] * size * squash, GEM[j * 2 + 1] * size);
      c.closePath();
      const col = tint(i);
      c.fillStyle = rgba([col[0] * light + 255 * (1 - light) * 0.3, col[1] * light + 255 * (1 - light) * 0.3, col[2] * light + 255 * (1 - light) * 0.3], 0.95);
      c.fill();
    }
    c.globalCompositeOperation = "lighter";
    gemPath(size, squash);
    c.lineWidth = 2;
    c.strokeStyle = rgba(WHITE, 0.85);
    c.stroke();
    // A glint sweeping across the faces.
    const sweep = ((t * 0.0012) % 2) - 0.5;
    const glint = c.createLinearGradient(-size, -size, size, size);
    glint.addColorStop(clamp(sweep - 0.08), "rgba(255,255,255,0)");
    glint.addColorStop(clamp(sweep), "rgba(255,255,255,0.7)");
    glint.addColorStop(clamp(sweep + 0.08), "rgba(255,255,255,0)");
    gemPath(size, squash);
    c.fillStyle = glint;
    c.fill();
    if (crack <= 0) return;
    for (const path of cracks) {
      const n = Math.max(2, Math.floor((path.length / 2) * crack));
      c.beginPath();
      for (let k = 0; k < n; k++) c.lineTo(path[k * 2] * size * squash, path[k * 2 + 1] * size);
      c.lineWidth = 6;
      c.strokeStyle = rgba(base, 0.35);
      c.stroke();
      c.lineWidth = 1.6;
      c.strokeStyle = rgba(WHITE, 0.95);
      c.stroke();
    }
  }

  function explode(t: number, m: number, size: number) {
    burst = true;
    flash = 1;
    for (let i = 0; i < 18 + level * 12; i++) {
      const a = rand(0, TAU);
      const speed = m * rand(0.006, 0.026);
      const s = size * rand(0.12, 0.38);
      shards.push({
        x: Math.cos(a) * size * 0.3,
        y: Math.sin(a) * size * 0.3,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        rot: rand(0, TAU),
        spin: rand(-0.2, 0.2),
        pts: [rand(-s, s), -s, s, rand(-s, s), rand(-s, 0), s],
        c: tint(i),
        life: 1,
      });
    }
    for (let i = 0; i < 70 + level * 60; i++) {
      const a = rand(0, TAU);
      const speed = m * rand(0.004, 0.05);
      sparks.push({ x: 0, y: 0, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 1, fade: rand(0.012, 0.028), c: tint(i), w: rand(1, 2.6) });
    }
    for (let i = 0; i <= level; i++) rings.push({ at: t + i * 110, speed: m * 0.0024 * (1 + i * 0.35), c: i % 2 ? WHITE : tint(i), width: 2 + level });
    if (rarity === "amethyst") rings.push({ at: t + 750, speed: m * 0.0016, c: WHITE, width: 10 });
  }

  function draw(now: number) {
    const c = ctx!;
    if (!start) start = last = now;
    const t = now - start;
    const dt = Math.min(3, (now - last) / 16.67);
    last = now;
    frame++;
    const m = Math.min(w, h);
    const p = clamp(t / build);
    const after = t - build;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.fillStyle = `rgba(3,1,8,${burst ? 0.28 : 0.42})`;
    c.fillRect(0, 0, w, h);

    const shake = burst ? Math.max(0, 1 - after / 800) ** 2 * (5 + level * 7) : p ** 3 * level * 3.5;
    const zoom = burst ? 1 + 0.14 * Math.max(0, 1 - after / 450) ** 2 : 1 + 0.1 * p * p;
    c.translate(w / 2 + rand(-shake, shake), h * 0.46 + rand(-shake, shake));
    c.scale(zoom, zoom);
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";

    // Star field: pulled into the core while charging, pushed out after the burst.
    const reach = Math.hypot(w, h) * 0.6;
    for (const star of stars) {
      const pull = burst ? -0.004 * Math.max(0.15, 1 - after / 1500) : 0.0015 * (0.2 + p * 3);
      star.r -= pull * dt * (0.5 + star.z);
      if (star.r < 0.04) star.r = 1;
      if (star.r > 1) star.r = 0.05;
      const stretch = burst ? 0.02 + 0.25 * Math.max(0, 1 - after / 900) : 0.01 + p * p * 0.18;
      const r0 = star.r * reach;
      const r1 = r0 * (1 + stretch);
      c.beginPath();
      c.moveTo(Math.cos(star.a) * r0, Math.sin(star.a) * r0);
      c.lineTo(Math.cos(star.a) * r1, Math.sin(star.a) * r1);
      c.lineWidth = 0.6 + star.z * 1.4;
      c.strokeStyle = rgba(star.z > 0.8 ? base : WHITE, 0.15 + star.z * 0.45);
      c.stroke();
    }

    const gemIn = rarity === "amethyst" ? easeOut(span(p, 0.5, 0.82)) : easeOut(span(p, 0.08, 0.5));
    const gemSize = m * 0.1 * gemIn * (1 + p * 0.3);
    const spin = t * 0.002 * (1 + p * 5);

    if (!burst) {
      // Light streams spiralling into the core.
      const spawn = (1 + level) * (0.6 + p * 2.5) * dt;
      for (let i = 0; i < spawn; i++)
        inflow.push({ a: rand(0, TAU), r: reach * rand(0.6, 1), speed: m * rand(0.004, 0.009), c: tint(frame + i), w: rand(1, 2.5) });
      const swirl = rarity === "amethyst" ? 0.06 : rarity === "secret" ? 0.01 : 0.025;
      for (let i = inflow.length - 1; i >= 0; i--) {
        const mote = inflow[i];
        const x0 = Math.cos(mote.a) * mote.r;
        const y0 = Math.sin(mote.a) * mote.r;
        mote.r -= mote.speed * dt * (1 + p * 3);
        mote.a += (swirl * dt) / (mote.r / m + 0.15);
        if (mote.r < m * 0.03) {
          inflow.splice(i, 1);
          continue;
        }
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(Math.cos(mote.a) * mote.r, Math.sin(mote.a) * mote.r * (rarity === "amethyst" ? 0.45 : 1));
        c.lineWidth = mote.w;
        c.strokeStyle = rgba(mote.c, 0.8);
        c.stroke();
      }

      if (rarity === "amethyst") {
        const hole = easeOut(span(p, 0, 0.35)) * (1 - span(p, 0.75, 1) * 0.6);
        const radius = m * 0.09 * hole;
        const lens = m * (0.6 - 0.45 * easeOut(span(p, 0, 0.9)));
        c.beginPath();
        c.arc(0, 0, lens, 0, TAU);
        c.lineWidth = 1.5;
        c.strokeStyle = rgba(base, 0.4 * hole);
        c.stroke();
        c.globalCompositeOperation = "source-over";
        c.beginPath();
        c.arc(0, 0, radius, 0, TAU);
        c.fillStyle = "#000";
        c.fill();
        c.globalCompositeOperation = "lighter";
        c.beginPath();
        c.arc(0, 0, radius * 1.08, 0, TAU);
        c.lineWidth = 3 + 3 * Math.sin(t * 0.02);
        c.strokeStyle = rgba([224, 170, 255], 0.9 * hole);
        c.stroke();
      }

      const beat = rarity === "amethyst" ? Math.max(0, Math.sin(t * 0.009 * (1 + p * 2))) ** 8 : 0;
      const core = m * (0.03 + 0.1 * p * p) * (1 + 0.1 * Math.sin(t * 0.015 * (1 + p * 4)) + beat * 0.4);
      const glow = c.createRadialGradient(0, 0, 0, 0, 0, core * 3);
      glow.addColorStop(0, rgba(WHITE, 0.9));
      glow.addColorStop(0.25, rgba(base, 0.6));
      glow.addColorStop(1, rgba(base, 0));
      c.fillStyle = glow;
      c.fillRect(-core * 3, -core * 3, core * 6, core * 6);

      if (gemSize > 1) drawGem(gemSize, spin, t, span(p, 0.68, 1));
      if (t >= build) explode(t, m, m * 0.13);
    } else {
      // God rays and a breathing halo behind the title.
      const rise = easeOut(span(after, 0, 500));
      const rays = 10 + level * 4;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * TAU + t * 0.00025 * (level % 2 ? 1 : -1);
        const width = 0.05 + 0.03 * Math.sin(t * 0.002 + i);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a - width) * reach, Math.sin(a - width) * reach);
        c.lineTo(Math.cos(a + width) * reach, Math.sin(a + width) * reach);
        c.closePath();
        c.fillStyle = rgba(tint(i), 0.07 * rise);
        c.fill();
      }
      const halo = m * (0.3 + 0.03 * Math.sin(t * 0.004));
      const hg = c.createRadialGradient(0, 0, 0, 0, 0, halo);
      hg.addColorStop(0, rgba(base, 0.4 * rise));
      hg.addColorStop(1, rgba(base, 0));
      c.fillStyle = hg;
      c.fillRect(-halo, -halo, halo * 2, halo * 2);

      for (const ring of rings) {
        const radius = (t - ring.at) * ring.speed;
        if (radius <= 0) continue;
        const alpha = 1 - radius / (m * 1.3);
        if (alpha <= 0) continue;
        c.beginPath();
        c.arc(0, 0, radius, 0, TAU);
        c.lineWidth = ring.width * 4;
        c.strokeStyle = rgba(ring.c, alpha * 0.15);
        c.stroke();
        c.lineWidth = ring.width;
        c.strokeStyle = rgba(ring.c, alpha * 0.9);
        c.stroke();
      }

      for (let i = shards.length - 1; i >= 0; i--) {
        const s = shards[i];
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vx *= 0.985 ** dt;
        s.vy = s.vy * 0.985 ** dt + m * 0.00012 * dt;
        s.rot += s.spin * dt;
        s.life -= 0.009 * dt;
        if (s.life <= 0) {
          shards.splice(i, 1);
          continue;
        }
        c.save();
        c.translate(s.x, s.y);
        c.rotate(s.rot);
        c.beginPath();
        c.moveTo(s.pts[0], s.pts[1]);
        c.lineTo(s.pts[2], s.pts[3]);
        c.lineTo(s.pts[4], s.pts[5]);
        c.closePath();
        c.fillStyle = rgba(s.c, s.life * 0.7);
        c.fill();
        c.lineWidth = 1;
        c.strokeStyle = rgba(WHITE, s.life);
        c.stroke();
        c.restore();
      }

      if (Math.random() < 0.6 + level * 0.3)
        embers.push({ x: rand(-w / 2, w / 2), y: h / 2 + 10, vx: rand(-0.3, 0.3), vy: -rand(0.6, 2) * (1 + level * 0.2), life: 1, fade: rand(0.004, 0.009), c: tint(frame), w: rand(1, 3) });
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i];
        if (rarity === "amethyst") {
          const a = Math.atan2(e.y, e.x) + 0.012 * dt;
          const r = Math.hypot(e.x, e.y) * (1 - 0.002 * dt);
          e.x = Math.cos(a) * r;
          e.y = Math.sin(a) * r;
        } else {
          e.x += (e.vx + Math.sin((t + i * 97) * 0.003) * 0.4) * dt;
          e.y += e.vy * dt;
        }
        e.life -= e.fade * dt;
        if (e.life <= 0) {
          embers.splice(i, 1);
          continue;
        }
        c.beginPath();
        c.arc(e.x, e.y, e.w, 0, TAU);
        c.fillStyle = rgba(e.c, e.life * 0.8);
        c.fill();
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      const x0 = s.x;
      const y0 = s.y;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.955 ** dt;
      s.vy *= 0.955 ** dt;
      s.life -= s.fade * dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      c.beginPath();
      c.moveTo(x0 - s.vx * 2, y0 - s.vy * 2);
      c.lineTo(s.x, s.y);
      c.lineWidth = s.w;
      c.strokeStyle = rgba(s.c, s.life);
      c.stroke();
    }

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (flash > 0) {
      c.globalCompositeOperation = "source-over";
      c.fillStyle = rgba(rarity === "amethyst" ? [235, 210, 255] : WHITE, flash);
      c.fillRect(0, 0, w, h);
      flash -= 0.045 * dt;
    }

    if (t < duration) raf = requestAnimationFrame(draw);
  }

  let raf = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
  };
}
