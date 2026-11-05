import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Curve,
  ExtrudeGeometry,
  LatheGeometry,
  Path,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  Vector2,
  Vector3,
} from "three";
import { MONTH_LABELS, formatDay, type ChronoCommit } from "./chrono-timing";

/** Painters, geometry and shaders for the Version History chronometer. */

export const TAU = Math.PI * 2;
export type Fonts = { display: string; mono: string; ui: string };

function canvas2d(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return { canvas, ctx };
}

function texture(canvas: HTMLCanvasElement, anisotropy = 8) {
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = anisotropy;
  return map;
}

/** Deterministic noise so every visit paints the same metal. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Text cut into metal: a light lip below, the dark groove on top. */
function engrave(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, groove: string, lip: string) {
  ctx.fillStyle = lip;
  ctx.fillText(text, x, y + 2);
  ctx.fillStyle = groove;
  ctx.fillText(text, x, y);
}

function brushed(ctx: CanvasRenderingContext2D, width: number, height: number, seed: number, light: string, dark: string) {
  const rand = random(seed);
  for (let i = 0; i < height * 1.6; i++) {
    ctx.fillStyle = rand() < 0.5 ? light : dark;
    ctx.globalAlpha = 0.04 + rand() * 0.09;
    ctx.fillRect(0, rand() * height, width, 1 + rand());
  }
  ctx.globalAlpha = 1;
}

type BandStyle = { top: string; mid: string; bottom: string; groove: string; lip: string };
const BRASS_BAND: BandStyle = { top: "#8a6a32", mid: "#e2c27e", bottom: "#7a5b28", groove: "rgba(48,30,8,0.92)", lip: "rgba(255,238,190,0.55)" };
const STEEL_BAND: BandStyle = { top: "#7c858b", mid: "#e4e9ec", bottom: "#6e777d", groove: "rgba(22,28,34,0.9)", lip: "rgba(255,255,255,0.6)" };

function bandBase(ctx: CanvasRenderingContext2D, width: number, height: number, style: BandStyle, seed: number) {
  const fill = ctx.createLinearGradient(0, 0, 0, height);
  fill.addColorStop(0, style.top);
  fill.addColorStop(0.18, style.mid);
  fill.addColorStop(0.62, style.mid);
  fill.addColorStop(1, style.bottom);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  brushed(ctx, width, height, seed, "#ffffff", "#000000");
  ctx.fillStyle = style.groove;
  ctx.fillRect(0, 4, width, 2);
  ctx.fillRect(0, height - 7, width, 2);
}

/** The month ring: twelve engraved sectors, u clockwise from twelve o'clock, outer edge at the top. */
export function paintMonths(fonts: Fonts) {
  const { canvas, ctx } = canvas2d(4096, 160);
  bandBase(ctx, 4096, 160, BRASS_BAND, 11);
  const sector = 4096 / 12;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 74px ${fonts.display}`;
  for (let i = 0; i < 12; i++) {
    const x = i * sector;
    ctx.fillStyle = BRASS_BAND.groove;
    ctx.fillRect(x - 2, 10, 4, 140);
    for (let k = 1; k < 6; k++) ctx.fillRect(x + (k * sector) / 6 - 1.5, 10, 3, k === 3 ? 30 : 18);
    engrave(ctx, MONTH_LABELS[i], x + sector / 2, 92, BRASS_BAND.groove, BRASS_BAND.lip);
  }
  return texture(canvas);
}

/** The day ring: 31 engraved numerals on silvered steel. */
export function paintDays(fonts: Fonts) {
  const { canvas, ctx } = canvas2d(4096, 128);
  bandBase(ctx, 4096, 128, STEEL_BAND, 23);
  const sector = 4096 / 31;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 58px ${fonts.display}`;
  for (let i = 0; i < 31; i++) {
    const x = i * sector;
    ctx.fillStyle = STEEL_BAND.groove;
    ctx.fillRect(x - 1.5, 10, 3, 24);
    ctx.fillRect(x - 1.5, 96, 3, 22);
    engrave(ctx, String(i + 1), x + sector / 2, 68, STEEL_BAND.groove, STEEL_BAND.lip);
  }
  return texture(canvas);
}

/** The commit index: blued steel with a brass-filled tick per catalog commit (oldest first, clockwise). */
export function paintIndex(commits: ChronoCommit[], fonts: Fonts) {
  const { canvas, ctx } = canvas2d(4096, 128);
  const fill = ctx.createLinearGradient(0, 0, 0, 128);
  fill.addColorStop(0, "#0e1724");
  fill.addColorStop(0.35, "#2b4566");
  fill.addColorStop(0.7, "#1d3150");
  fill.addColorStop(1, "#0b1320");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 4096, 128);
  brushed(ctx, 4096, 128, 37, "#9fc4ff", "#000000");
  const count = Math.max(1, commits.length);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 30px ${fonts.display}`;
  commits.forEach((commit, index) => {
    const x = ((index + 0.5) / count) * 4096;
    const long = commit.available || Boolean(commit.milestone);
    ctx.fillStyle = "rgba(4,8,14,0.9)";
    ctx.fillRect(x - 3, 6, 6, long ? 44 : 26);
    ctx.fillStyle = commit.available ? "#f1d58f" : "#c39a52";
    ctx.fillRect(x - 2, 6, 4, long ? 42 : 24);
    if ((index + 1) % 10 === 0) engrave(ctx, String(index + 1), x, 102, "#e6c88a", "rgba(0,0,0,0.65)");
  });
  return texture(canvas);
}

/** Blackened iron for the case front: mottled, scratched, with engraved legends around the dial. */
export function paintCase(fonts: Fonts, half: number) {
  const size = 1024;
  const { canvas, ctx } = canvas2d(size, size);
  const rand = random(5);
  ctx.fillStyle = "#1e2124";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const r = 2 + rand() * 18;
    ctx.fillStyle = rand() < 0.55 ? "rgba(0,0,0,0.18)" : rand() < 0.5 ? "rgba(120,96,70,0.07)" : "rgba(170,180,186,0.05)";
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, r, 0, TAU);
    ctx.fill();
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 340; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const a = rand() * TAU;
    const l = 6 + rand() * 40;
    ctx.strokeStyle = `rgba(210,215,220,${0.03 + rand() * 0.06})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const scale = size / (half * 2);
  const c = size / 2;
  for (const radius of [3.02, 3.16]) {
    ctx.strokeStyle = "rgba(0,0,0,0.65)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c, c, radius * scale, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(220,190,130,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(c, c + 1.5, radius * scale, 0, TAU);
    ctx.stroke();
  }
  const arcText = (text: string, radius: number, center: number, bottom: boolean) => {
    ctx.font = `600 22px ${fonts.display}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const spacing = 0.034;
    const start = center - ((text.length - 1) * spacing) / 2;
    [...text].forEach((char, index) => {
      const a = start + index * spacing;
      ctx.save();
      ctx.translate(c + Math.sin(a) * radius * scale, c - Math.cos(a) * radius * scale);
      ctx.rotate(bottom ? a + Math.PI : a);
      engrave(ctx, char, 0, 0, "rgba(0,0,0,0.85)", "rgba(226,196,136,0.35)");
      ctx.restore();
    });
  };
  arcText("AMETHYST ARCHIVES", 3.09, 0, false);
  const bottom = "CHRONOMETRIC INDEX";
  arcText([...bottom].reverse().join(""), 3.09, Math.PI, true);
  const map = texture(canvas);
  map.repeat.set(1 / (half * 2), 1 / (half * 2));
  map.offset.set(0.5, 0.5);
  return map;
}

/** Enamel dial for the pressure gauge. */
export function paintGauge(fonts: Fonts) {
  const size = 512;
  const { canvas, ctx } = canvas2d(size, size);
  const c = size / 2;
  const face = ctx.createRadialGradient(c, c * 0.9, 20, c, c, c);
  face.addColorStop(0, "#f3ead3");
  face.addColorStop(0.8, "#ddd0ae");
  face.addColorStop(1, "#a8976f");
  ctx.fillStyle = face;
  ctx.fillRect(0, 0, size, size);
  const from = -0.75 * Math.PI;
  const sweep = 1.5 * Math.PI;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#b8321f";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.arc(c, c, 196, from + sweep * 0.8 - Math.PI / 2, from + sweep - Math.PI / 2);
  ctx.stroke();
  ctx.strokeStyle = "#1b1712";
  for (let i = 0; i <= 50; i++) {
    const a = from + (i / 50) * sweep;
    const major = i % 5 === 0;
    ctx.lineWidth = major ? 5 : 2;
    const inner = major ? 168 : 184;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * inner, c - Math.cos(a) * inner);
    ctx.lineTo(c + Math.sin(a) * 208, c - Math.cos(a) * 208);
    ctx.stroke();
  }
  ctx.fillStyle = "#1b1712";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 34px ${fonts.display}`;
  for (let i = 0; i <= 10; i += 2) {
    const a = from + (i / 10) * sweep;
    ctx.fillText(String(i), c + Math.sin(a) * 136, c - Math.cos(a) * 136);
  }
  ctx.font = `600 30px ${fonts.display}`;
  ctx.fillText("AETHER", c, c - 62);
  ctx.font = `500 22px ${fonts.mono}`;
  ctx.fillText("× 10 PSI", c, c + 96);
  return texture(canvas);
}

/** Riveted iron wall panels, tiled behind the machine. */
export function paintWall() {
  const size = 512;
  const { canvas, ctx } = canvas2d(size, size);
  const rand = random(91);
  ctx.fillStyle = "#24272a";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() < 0.6 ? "rgba(0,0,0,0.12)" : "rgba(150,120,90,0.05)";
    ctx.beginPath();
    ctx.arc(rand() * size, rand() * size, 3 + rand() * 26, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 40; i++) {
    const x = rand() * size;
    const streak = ctx.createLinearGradient(x, 0, x, size);
    streak.addColorStop(0, "rgba(0,0,0,0)");
    streak.addColorStop(0.5, "rgba(0,0,0,0.16)");
    streak.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = streak;
    ctx.fillRect(x, 0, 2 + rand() * 6, size);
  }
  const seam = (x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fillRect(x + (w > h ? 0 : 3), y + (w > h ? 3 : 0), w > h ? w : 1, w > h ? 1 : h);
  };
  seam(0, 0, size, 3);
  seam(0, 0, 3, size);
  seam(size / 2, 0, 3, size / 2);
  seam(0, size / 2, size, 3);
  const rivet = (x: number, y: number) => {
    const g = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, 7);
    g.addColorStop(0, "#8c8f91");
    g.addColorStop(0.5, "#3a3d40");
    g.addColorStop(1, "rgba(0,0,0,0.7)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    ctx.fill();
  };
  for (let x = 16; x < size; x += 32) {
    rivet(x, 14);
    rivet(x, size / 2 + 14);
  }
  for (let y = 46; y < size; y += 32) {
    rivet(14, y);
    if (y < size / 2) rivet(size / 2 + 14, y);
  }
  const map = texture(canvas, 4);
  map.wrapS = map.wrapT = RepeatWrapping;
  return map;
}

function chamferPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x + cut, y + h);
  ctx.lineTo(x, y + h - cut);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function fit(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, lines: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      out.push(line);
      line = word;
      if (out.length === lines) break;
    }
  }
  if (out.length < lines && line) out.push(line);
  if (out.length === lines && out.join(" ").length < text.length) out[lines - 1] = fit(ctx, `${out[lines - 1]} …`, width);
  return out.slice(0, lines);
}

function plateFace(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean) {
  const cut = h * 0.14;
  chamferPath(ctx, x + 4, y + 4, w - 8, h - 8, cut);
  const body = ctx.createLinearGradient(x, y, x, y + h);
  body.addColorStop(0, "#23282c");
  body.addColorStop(1, "#111417");
  ctx.fillStyle = body;
  ctx.fill();
  const rim = ctx.createLinearGradient(x, y, x + w, y + h);
  rim.addColorStop(0, "#f2d796");
  rim.addColorStop(0.5, "#a77a36");
  rim.addColorStop(1, "#e7c27a");
  ctx.strokeStyle = rim;
  ctx.lineWidth = 6;
  ctx.stroke();
  chamferPath(ctx, x + 16, y + 16, w - 32, h - 32, cut * 0.7);
  ctx.strokeStyle = lit ? "rgba(127,240,214,0.45)" : "rgba(226,190,120,0.3)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

export const PLATE_COLUMNS = 4;
export const PLATE_ROWS = 8;
const CELL_W = 512;
const CELL_H = 256;

/** Paints passing commit plates into one atlas (row-major cells, 4 × 8). */
export function paintPlates(canvas: HTMLCanvasElement, commits: ChronoCommit[], fonts: Fonts) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  commits.slice(0, PLATE_COLUMNS * PLATE_ROWS).forEach((commit, index) => {
    const x = (index % PLATE_COLUMNS) * CELL_W;
    const y = Math.floor(index / PLATE_COLUMNS) * CELL_H;
    plateFace(ctx, x, y, CELL_W, CELL_H, commit.available);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 54px ${fonts.display}`;
    ctx.fillStyle = "#f0d18e";
    ctx.fillText(formatDay(commit.day).toUpperCase(), x + 36, y + 90);
    ctx.font = `600 40px ${fonts.mono}`;
    ctx.fillStyle = commit.available ? "#8ff3da" : "#d8cfbd";
    ctx.fillText(commit.shortSha, x + 36, y + 150);
    ctx.font = `600 25px ${fonts.ui}`;
    ctx.fillStyle = "#b9ae99";
    ctx.fillText(fit(ctx, commit.milestone ?? commit.title, CELL_W - 72), x + 36, y + 206);
    ctx.beginPath();
    ctx.arc(x + CELL_W - 52, y + 62, 12, 0, TAU);
    ctx.fillStyle = commit.available ? "#7ff0d8" : "#3a3f43";
    ctx.fill();
  });
}

export function plateCell(index: number): [number, number] {
  const column = index % PLATE_COLUMNS;
  const row = Math.floor(index / PLATE_COLUMNS);
  // CanvasTexture flips Y: row 0 sits at the top of the atlas, i.e. v near 1.
  return [column / PLATE_COLUMNS, 1 - (row + 1) / PLATE_ROWS];
}

/** The destination plate (1024 × 512). */
export function paintDestination(canvas: HTMLCanvasElement, commit: ChronoCommit, fonts: Fonts) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  plateFace(ctx, 0, 0, w, h, true);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `600 30px ${fonts.display}`;
  ctx.fillStyle = "#7ff0d8";
  ctx.fillText(fit(ctx, (commit.milestone ?? "Destination").toUpperCase(), w - 150), 64, 92);
  ctx.font = `600 96px ${fonts.display}`;
  ctx.fillStyle = "#f6dc9c";
  ctx.fillText(formatDay(commit.day).toUpperCase(), 60, 206);
  ctx.font = `600 50px ${fonts.mono}`;
  ctx.fillStyle = "#e9e2d2";
  ctx.fillText(commit.shortSha, 64, 282);
  ctx.font = `600 34px ${fonts.ui}`;
  ctx.fillStyle = "#cfc5b1";
  wrap(ctx, commit.title, w - 128, 2).forEach((line, index) => ctx.fillText(line, 64, 362 + index * 46));
  ctx.beginPath();
  ctx.arc(w - 82, 78, 18, 0, TAU);
  ctx.fillStyle = "#7ff0d8";
  ctx.fill();
}

/* Geometry ---------------------------------------------------------------- */

/** A flat ring facing +z: u runs clockwise from twelve o'clock, v from the inner to the outer edge. */
export function annulus(inner: number, outer: number, segments = 192) {
  const positions = new Float32Array((segments + 1) * 6);
  const normals = new Float32Array((segments + 1) * 6);
  const uvs = new Float32Array((segments + 1) * 4);
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    const s = Math.sin(a);
    const c = Math.cos(a);
    positions.set([s * inner, c * inner, 0, s * outer, c * outer, 0], i * 6);
    normals.set([0, 0, 1, 0, 0, 1], i * 6);
    uvs.set([i / segments, 0, i / segments, 1], i * 4);
    if (i < segments) {
      const k = i * 2;
      index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/** Revolves an (radius, depth) cross-section, traced counter-clockwise, into a ring facing +z. */
export function lathe(profile: [number, number][], segments = 160) {
  return new LatheGeometry(
    profile.map(([r, z]) => new Vector2(r, z)),
    segments,
  ).rotateX(Math.PI / 2);
}

/** A spur gear with spoke windows, centred on the origin and `depth` thick. */
export function gear(teeth: number, module: number, depth: number, spokes = 5) {
  const pitch = (teeth * module) / 2;
  const tip = pitch + module;
  const root = pitch - 1.25 * module;
  const step = TAU / teeth;
  const shape = new Shape();
  const at = (r: number, a: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const points = [at(root, a), at(root, a + step * 0.08), at(tip, a + step * 0.24), at(tip, a + step * 0.44), at(root, a + step * 0.6)];
    points.forEach(([x, y], k) => (i === 0 && k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  }
  shape.closePath();
  const axle = new Path();
  axle.absarc(0, 0, Math.max(0.035, pitch * 0.1), 0, TAU, true);
  shape.holes.push(axle);
  if (spokes > 0 && pitch > 0.3) {
    const hub = pitch * 0.3;
    const rim = root - Math.max(0.06, pitch * 0.14);
    const gap = Math.max(0.05, pitch * 0.09) / pitch;
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * TAU + gap;
      const a1 = ((i + 1) / spokes) * TAU - gap;
      const opening = new Path();
      opening.absarc(0, 0, rim, a0, a1, false);
      opening.absarc(0, 0, hub, a1 - (gap * pitch) / hub, a0 + (gap * pitch) / hub, true);
      opening.closePath();
      shape.holes.push(opening);
    }
  }
  const bevel = Math.min(0.02, module * 0.25);
  return new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 8 }).translate(0, 0, -depth / 2);
}

function octagonPoints(half: number, cut: number): [number, number][] {
  return [
    [-half + cut, -half],
    [half - cut, -half],
    [half, -half + cut],
    [half, half - cut],
    [half - cut, half],
    [-half + cut, half],
    [-half, half - cut],
    [-half, -half + cut],
  ];
}

export function octagon(half: number, cut: number) {
  const shape = new Shape();
  octagonPoints(half, cut).forEach(([x, y], k) => (k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  return shape;
}

export function octagonPath(half: number, cut: number) {
  const path = new Path();
  octagonPoints(half, cut).forEach(([x, y], k) => (k === 0 ? path.moveTo(x, y) : path.lineTo(x, y)));
  path.closePath();
  return path;
}

export function octagonCorners(half: number, cut: number) {
  return octagonPoints(half, cut);
}

/** A coiled filament along x. */
export class Coil extends Curve<Vector3> {
  length: number;
  radius: number;
  turns: number;
  constructor(length: number, radius: number, turns: number) {
    super();
    this.length = length;
    this.radius = radius;
    this.turns = turns;
  }
  override getPoint(t: number, target = new Vector3()) {
    const a = t * TAU * this.turns;
    return target.set((t - 0.5) * this.length, Math.sin(a) * this.radius, Math.cos(a) * this.radius);
  }
}

/** A flat spiral (the balance wheel's hairspring). */
export class Spiral extends Curve<Vector3> {
  inner: number;
  outer: number;
  turns: number;
  constructor(inner: number, outer: number, turns: number) {
    super();
    this.inner = inner;
    this.outer = outer;
    this.turns = turns;
  }
  override getPoint(t: number, target = new Vector3()) {
    const a = t * TAU * this.turns;
    const r = this.inner + (this.outer - this.inner) * t;
    return target.set(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
}

/* Shaders ------------------------------------------------------------------ */

export const GLASS_VERTEX = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const GLASS_FRAGMENT = /* glsl */ `
uniform vec3 uTint;
uniform float uGlow;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec3 n = normalize(vNormal);
  float facing = clamp(dot(n, normalize(vView)), 0.0, 1.0);
  float rim = pow(max(1.0 - facing, 0.0), 2.4);
  float spec = pow(max(dot(n, normalize(vec3(-0.5, 0.62, 0.62))), 0.0), 48.0);
  float spec2 = pow(max(dot(n, normalize(vec3(0.62, -0.2, 0.75))), 0.0), 18.0);
  vec3 color = uTint * (rim * 0.8 + uGlow * 0.16 * facing) + vec3(1.0, 0.94, 0.84) * (spec * 1.6 + spec2 * 0.18);
  gl_FragColor = vec4(color * uOpacity, 1.0);
}`;

export const STEAM_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uLevel;
uniform float uPixel;
uniform vec3 uEmit0;
uniform vec3 uEmit1;
uniform vec3 uDir0;
uniform vec3 uDir1;
varying float vAlpha;
void main() {
  float life = fract(uTime * (0.32 + aSeed.y * 0.3) + aSeed.x);
  bool left = aSeed.w < 0.5;
  vec3 dir = left ? uDir0 : uDir1;
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
  vec3 p = (left ? uEmit0 : uEmit1)
    + dir * life * (1.2 + aSeed.y * 1.4)
    + side * (aSeed.z - 0.5) * life * 1.1
    + vec3(sin(uTime * 1.3 + aSeed.x * 31.0) * 0.18 * life, life * life * 0.9, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.18 + life * 1.05) * (0.7 + aSeed.z * 0.6) * uPixel / max(-mv.z, 0.2);
  float on = smoothstep(aSeed.y - 0.12, aSeed.y, uLevel);
  vAlpha = on * smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.45, 1.0, life)) * 0.3;
}`;

export const STEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float soft = 1.0 - smoothstep(0.1, 0.5, d);
  gl_FragColor = vec4(uColor, soft * vAlpha);
}`;

export const DUST_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uPixel;
uniform vec3 uBox;
varying float vAlpha;
void main() {
  vec3 p = (aSeed.xyz - 0.5) * uBox;
  p.y = mod(p.y + uTime * (0.05 + aSeed.w * 0.08) + uBox.y * 0.5, uBox.y) - uBox.y * 0.5;
  p.x += sin(uTime * 0.21 + aSeed.w * 19.0) * 0.35;
  p.z += cos(uTime * 0.17 + aSeed.x * 23.0) * 0.3;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.025 + aSeed.w * 0.035) * uPixel / max(-mv.z, 0.5);
  vAlpha = (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.6 + aSeed.y) + aSeed.z * 40.0))) * 0.45;
}`;

export const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColor * (1.0 - smoothstep(0.15, 0.5, d)) * vAlpha, 1.0);
}`;

export const TUNNEL_VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const TUNNEL_FRAGMENT = /* glsl */ `
uniform float uTravel;
uniform float uSpeed;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uBrass;
uniform vec3 uPatina;
varying vec2 vUv;
varying float vDepth;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float lanes = 64.0;
  float lane = floor(vUv.x * lanes);
  float h = hash(vec2(lane, 7.0));
  float along = vUv.y * 90.0 - uTravel * (0.9 + h * 0.6) + h * 40.0;
  float cell = 1.0 - fract(along * 0.12);
  float len = 0.06 + 0.3 * clamp(uSpeed, 0.0, 1.5);
  float streak = smoothstep(0.0, 0.04, cell) * (1.0 - smoothstep(0.04, 0.04 + len, cell));
  float laneMask = smoothstep(0.0, 0.25, fract(vUv.x * lanes)) * (1.0 - smoothstep(0.55, 0.9, fract(vUv.x * lanes)));
  streak *= laneMask * step(0.55, h);
  float ribs = pow(max(0.5 + 0.5 * sin(along * 1.6), 0.0), 18.0) * 0.3;
  vec3 tone = mix(uBrass, uPatina, step(0.8, h));
  float fade = smoothstep(0.6, 3.5, vDepth) * (1.0 - smoothstep(26.0, 62.0, vDepth));
  vec3 color = tone * (streak * (0.35 + uSpeed) + ribs * (0.12 + 0.4 * uSpeed)) + vec3(0.014, 0.018, 0.022);
  gl_FragColor = vec4(color * fade * uOpacity, 1.0);
}`;

export const PLATE_VERTEX = /* glsl */ `
attribute vec2 aCell;
attribute float aGlow;
uniform vec2 uCellSize;
varying vec2 vUv;
varying float vGlow;
varying float vDepth;
void main() {
  vUv = aCell + uv * uCellSize;
  vGlow = aGlow;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

export const PLATE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
varying vec2 vUv;
varying float vGlow;
varying float vDepth;
void main() {
  vec4 tex = texture2D(uMap, vUv);
  float fade = smoothstep(0.35, 1.6, vDepth) * (1.0 - smoothstep(30.0, 52.0, vDepth));
  gl_FragColor = vec4(tex.rgb * (1.0 + 0.7 * vGlow), tex.a * fade * uOpacity);
}`;

export const FINISH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: [1, 1] },
    uTime: { value: 0 },
    uVignette: { value: 0.85 },
    uGrain: { value: 0.035 },
    uFlash: { value: 0 },
    uFlashColor: { value: [1, 0.93, 0.8] },
    uWarp: { value: 0 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uWarp;
uniform float uFade;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 toCenter = vUv - 0.5;
  vec3 color;
  if (uWarp > 0.002) {
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 10; i++) {
      float t = float(i) / 9.0;
      vec2 o = toCenter * t * 0.11 * uWarp;
      sum.r += texture2D(tDiffuse, vUv - o * 1.2).r;
      sum.g += texture2D(tDiffuse, vUv - o).g;
      sum.b += texture2D(tDiffuse, vUv - o * 0.8).b;
    }
    color = sum / 10.0;
  } else {
    color = texture2D(tDiffuse, vUv).rgb;
  }
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float d = length(toCenter * aspect) / max(length(0.5 * aspect), 0.001);
  color *= 1.0 - smoothstep(0.35, 1.05, d) * uVignette;
  color += (hash(vUv * uResolution + fract(uTime) * 91.0) - 0.5) * uGrain;
  color = mix(color, uFlashColor, clamp(uFlash, 0.0, 1.0));
  color *= 1.0 - clamp(uFade, 0.0, 1.0);
  gl_FragColor = vec4(max(color, 0.0), 1.0);
}`,
};
