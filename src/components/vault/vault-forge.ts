import {
  BufferGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Path,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Vector2,
} from "three";
import { GLYPHS } from "./vault-seal";

/**
 * The 3D Vault's workshop: painted textures, machined geometry and shaders, loaded only with the scene.
 * Angles run clockwise from twelve o'clock, like the drawn seal.
 */

export const TAU = Math.PI * 2;

export const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const span = (e: number, from: number, to: number) => clamp01((e - from) / (to - from));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeIn = (t: number) => t * t * t;
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** Eases out a little past the target and back, for parts that lock into place. */
export const easeBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
/** A slow, soft lub-dub every 1.6 seconds. */
export const heartbeat = (ms: number) => {
  const p = (((ms % 1600) + 1600) % 1600) / 1600;
  return Math.exp(-((p - 0.08) ** 2) / 0.004) + 0.55 * Math.exp(-((p - 0.3) ** 2) / 0.004);
};
/** Smooth deterministic wobble in −1..1 for shakes and drift. */
export const wobble = (t: number, seed: number) => Math.sin(t * 1.7 + seed) * 0.6 + Math.sin(t * 3.1 + seed * 2.3) * 0.4;

/* ----------------------------------------------------------------------------
 * Painted textures
 * ------------------------------------------------------------------------- */

export function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, color = false) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  if (color) texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Strokes twice, a wide faint pass for the glow and then the line itself, so engravings read as lit from inside. */
export function glowStroke(ctx: CanvasRenderingContext2D, width: number, alpha: number, path?: Path2D) {
  ctx.globalAlpha = alpha * 0.16;
  ctx.lineWidth = width * 4;
  if (path) ctx.stroke(path);
  else ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  if (path) ctx.stroke(path);
  else ctx.stroke();
}

function rune(ctx: CanvasRenderingContext2D, glyph: Path2D, angle: number, radius: number, size: number, width: number, alpha = 1) {
  ctx.save();
  ctx.rotate(angle);
  ctx.translate(0, -radius);
  const scale = size / 6;
  ctx.scale(scale, scale);
  glowStroke(ctx, width / scale, alpha, glyph);
  ctx.restore();
}

const glyphPaths = () => GLYPHS.map((d) => new Path2D(d));

function ink(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = ctx.fillStyle = "#fff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

/** Half the width of the door texture in world units: uv = position / (2 · DOOR_SPAN) + 0.5. */
export const DOOR_SPAN = 0.75;

/** The door's engraving, drawn across all its segments at once so the pattern splits as they swing open. */
export function doorFace(ctx: CanvasRenderingContext2D, segments: number) {
  ink(ctx);
  const size = ctx.canvas.width;
  const px = size / 2 / DOOR_SPAN;
  ctx.translate(size / 2, size / 2);
  const ring = (r: number, width: number, alpha: number) => {
    ctx.beginPath();
    ctx.arc(0, 0, r * px, 0, TAU);
    glowStroke(ctx, width, alpha);
  };
  const spoke = (a: number, r0: number, r1: number, width: number, alpha: number) => {
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * r0 * px, -Math.cos(a) * r0 * px);
    ctx.lineTo(Math.sin(a) * r1 * px, -Math.cos(a) * r1 * px);
    glowStroke(ctx, width, alpha);
  };
  const glyphs = glyphPaths();
  ring(0.655, 2.4, 0.9);
  ring(0.628, 1.2, 0.45);
  ring(0.33, 2, 0.75);
  ring(0.305, 1.1, 0.4);
  for (let i = 0; i < segments; i++) {
    const c = (i / segments) * TAU;
    spoke(c, 0.35, 0.415, 1.8, 0.75);
    spoke(c, 0.515, 0.6, 1.8, 0.75);
    ctx.save();
    ctx.rotate(c);
    ctx.translate(0, -0.465 * px);
    ctx.beginPath();
    ctx.moveTo(0, -0.04 * px);
    ctx.lineTo(0.022 * px, 0);
    ctx.lineTo(0, 0.04 * px);
    ctx.lineTo(-0.022 * px, 0);
    ctx.closePath();
    glowStroke(ctx, 1.8, 0.95);
    ctx.restore();
    for (const side of [-1, 1]) rune(ctx, glyphs[(i * 3 + (side > 0 ? 1 : 2)) % glyphs.length], c + side * 0.19, 0.47 * px, 0.065 * px, 2.2, 0.9);
    for (let j = -4; j <= 4; j++) if (j) spoke(c + j * 0.075, 0.6, j % 2 ? 0.613 : 0.624, 1.2, 0.5);
  }
  // An eight-pointed star around the hub.
  for (const offset of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const a = offset + (k / 4) * TAU;
      if (k) ctx.lineTo(Math.sin(a) * 0.27 * px, -Math.cos(a) * 0.27 * px);
      else ctx.moveTo(Math.sin(a) * 0.27 * px, -Math.cos(a) * 0.27 * px);
    }
    glowStroke(ctx, 1.6, 0.55);
  }
}

/** A strip of runes between two rules, repeated around a ring. */
export function runeStrip(ctx: CanvasRenderingContext2D, count: number, salt: number) {
  ink(ctx);
  const { width, height } = ctx.canvas;
  for (const y of [0.15, 0.85]) {
    ctx.beginPath();
    ctx.moveTo(0, y * height);
    ctx.lineTo(width, y * height);
    glowStroke(ctx, 2, 0.7);
  }
  const glyphs = glyphPaths();
  const step = width / count;
  const size = height * 0.42;
  for (let i = 0; i < count; i++) {
    const x = (i + 0.5) * step;
    ctx.beginPath();
    ctx.moveTo(x + step / 2, height * 0.32);
    ctx.lineTo(x + step / 2, height * 0.68);
    glowStroke(ctx, 1.2, 0.35);
    if (hash(i * 7.3 + salt) < 0.15) {
      ctx.beginPath();
      ctx.arc(x, height / 2, size * 0.09, 0, TAU);
      glowStroke(ctx, 2, 0.9);
      continue;
    }
    ctx.save();
    ctx.translate(x, height / 2);
    ctx.scale(size / 6, size / 6);
    glowStroke(ctx, 2.2 / (size / 6), 0.95, glyphs[Math.floor(hash(i * 3.1 + salt) * glyphs.length)]);
    ctx.restore();
  }
}

/** The chamber's inner wall: columns of runes running back toward the core. */
export function chamberWall(ctx: CanvasRenderingContext2D) {
  ink(ctx);
  const { width, height } = ctx.canvas;
  const glyphs = glyphPaths();
  const columns = 16;
  for (let i = 0; i < columns; i++) {
    const x = ((i + 0.5) / columns) * width;
    ctx.beginPath();
    ctx.moveTo(x, height * 0.08);
    ctx.lineTo(x, height * 0.92);
    glowStroke(ctx, 1.4, 0.4);
    if (i % 2) continue;
    for (let j = 0; j < 3; j++) {
      ctx.save();
      ctx.translate(x + width / columns / 2, height * (0.25 + j * 0.25));
      ctx.scale(2.6, 2.6);
      glowStroke(ctx, 1.6 / 2.6, 0.8, glyphs[(i + j * 3) % glyphs.length]);
      ctx.restore();
    }
  }
}

/** The summoning circle behind the vault. */
export function sigil(ctx: CanvasRenderingContext2D) {
  const size = ctx.canvas.width;
  const u = size / 2;
  ctx.translate(u, u);
  ctx.strokeStyle = "#fff";
  ctx.lineCap = "round";
  const ring = (r: number, width: number, alpha: number) => {
    ctx.beginPath();
    ctx.arc(0, 0, r * u, 0, TAU);
    glowStroke(ctx, width, alpha);
  };
  ring(0.95, 3, 0.9);
  ring(0.91, 1.5, 0.55);
  ring(0.7, 2.6, 0.8);
  ring(0.66, 1.2, 0.45);
  ring(0.38, 2, 0.7);
  for (const offset of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const a = offset + (k / 4) * TAU;
      if (k) ctx.lineTo(Math.sin(a) * 0.66 * u, -Math.cos(a) * 0.66 * u);
      else ctx.moveTo(Math.sin(a) * 0.66 * u, -Math.cos(a) * 0.66 * u);
    }
    glowStroke(ctx, 2, 0.5);
  }
  const glyphs = glyphPaths();
  for (let i = 0; i < 24; i++) rune(ctx, glyphs[(i * 3 + 1) % glyphs.length], ((i + 0.5) / 24) * TAU, 0.81 * u, 0.07 * u, 3, 0.85);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * 0.38 * u, -Math.cos(a) * 0.38 * u);
    ctx.lineTo(Math.sin(a) * (i % 4 ? 0.42 : 0.47) * u, -Math.cos(a) * (i % 4 ? 0.42 : 0.47) * u);
    glowStroke(ctx, 1.6, 0.5);
  }
}

/** Fine lathe marks for roughness maps. */
export function grain(ctx: CanvasRenderingContext2D) {
  const size = ctx.canvas.width;
  for (let y = 0; y < size; y++) {
    const g = Math.round(150 + (hash(y) - 0.5) * 70 + (hash(Math.floor(y / 8) + 500) - 0.5) * 40);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(0, y, size, 1);
  }
}

/** Tileable value-noise clouds for drifting smoke. */
export function smoke(ctx: CanvasRenderingContext2D) {
  const size = ctx.canvas.width;
  const image = ctx.createImageData(size, size);
  const lattice = (x: number, y: number, period: number) => hash((((x % period) + period) % period) * 57 + (((y % period) + period) % period) * 131 + period * 17);
  const value = (x: number, y: number, period: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const top = lerp(lattice(xi, yi, period), lattice(xi + 1, yi, period), sx);
    const bottom = lerp(lattice(xi, yi + 1, period), lattice(xi + 1, yi + 1, period), sx);
    return lerp(top, bottom, sy);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let amplitude = 0.5;
      let total = 0;
      for (let octave = 0; octave < 5; octave++) {
        const period = 4 << octave;
        v += amplitude * value((x / size) * period, (y / size) * period, period);
        total += amplitude;
        amplitude *= 0.5;
      }
      const c = Math.round(clamp01((v / total - 0.32) * 1.9) * 255);
      const i = (y * size + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = c;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** A soft-edged rectangle for the glow behind the console. */
export function softRect(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = width * 0.09;
  ctx.fillStyle = "#fff";
  ctx.fillRect(width * 0.2, height * 0.2, width * 0.6, height * 0.6);
}

/** A line of runes framed by ticks for the console's trim. */
export function glyphLine(ctx: CanvasRenderingContext2D) {
  ink(ctx);
  const { width, height } = ctx.canvas;
  const mid = height / 2;
  const glyphs = glyphPaths();
  const runes = 7;
  const gap = height * 0.8;
  const start = width / 2 - ((runes - 1) * gap) / 2;
  for (let i = 0; i < runes; i++) {
    ctx.save();
    ctx.translate(start + i * gap, mid);
    const scale = (height * 0.46) / 6;
    ctx.scale(scale, scale);
    glowStroke(ctx, 2 / scale, 0.95, glyphs[(i * 5 + 2) % glyphs.length]);
    ctx.restore();
  }
  const clear = ((runes + 1) * gap) / 2;
  for (let x = 8; x < width; x += 14) {
    const off = Math.abs(x - width / 2);
    if (off < clear) continue;
    const long = Math.round(x / 14) % 4 === 0;
    const fade = 1 - off / (width / 2);
    ctx.beginPath();
    ctx.moveTo(x, mid - height * (long ? 0.24 : 0.12));
    ctx.lineTo(x, mid + height * (long ? 0.24 : 0.12));
    glowStroke(ctx, 1.4, (long ? 0.75 : 0.4) * fade);
  }
}

/* ----------------------------------------------------------------------------
 * Machined geometry
 * ------------------------------------------------------------------------- */

/** Turns a profile of [radius, depth] points on a lathe and stands it up to face the viewer; corners stay crisp. */
export function lathe(profile: [number, number][], segments: number) {
  const points: Vector2[] = [];
  profile.forEach(([radius, depth], index) => {
    points.push(new Vector2(radius, depth));
    if (index > 0 && index < profile.length - 1) points.push(new Vector2(radius, depth));
  });
  const geometry = new LatheGeometry(points, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** A flat ring facing the viewer whose texture runs around it (u, repeated) and across it (v). */
export function band(inner: number, outer: number, segments: number, repeat: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    const s = Math.sin(a);
    const c = Math.cos(a);
    positions.push(s * inner, c * inner, 0, s * outer, c * outer, 0);
    normals.push(0, 0, 1, 0, 0, 1);
    uvs.push((i / segments) * repeat, 0, (i / segments) * repeat, 1);
    if (i < segments) index.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

const BEVELLED = (depth: number, bevel: number) => ({
  depth: Math.max(0.0001, depth - 2 * bevel),
  bevelEnabled: true,
  bevelThickness: bevel,
  bevelSize: bevel,
  // Walls stay on the outline; the faces shrink inward, so gaps between parts read as chamfered grooves.
  bevelOffset: -bevel,
  bevelSegments: 2,
  curveSegments: 1,
});

/**
 * One segment of a door split like an iris, hinged on its outer rim. The faces keep their place in the shared
 * door texture; the local origin sits on the rim and the tip points down −y.
 */
export function wedge(index: number, count: number, inner: number, outer: number, gap: number, depth: number, bevel: number) {
  const half = Math.PI / count;
  const centre = (index / count) * TAU;
  const outerA = half - Math.asin(gap / 2 / outer);
  const innerA = half - Math.asin(gap / 2 / inner);
  const point = (a: number, r: number) => new Vector2(Math.sin(a) * r, Math.cos(a) * r);
  const points: Vector2[] = [];
  for (let i = 0; i <= 20; i++) points.push(point(centre - outerA + (2 * outerA * i) / 20, outer));
  for (let i = 0; i <= 4; i++) points.push(point(centre + innerA - (2 * innerA * i) / 4, inner));
  const geometry = new ExtrudeGeometry(new Shape(points), BEVELLED(depth, bevel));
  geometry.translate(0, 0, -(depth - 2 * bevel) / 2);
  geometry.rotateZ(centre);
  geometry.translate(0, -outer, 0);
  return geometry;
}

/** Thin quads in the gaps between door segments, for the light leaking through. */
export function seams(count: number, inner: number, outer: number, width: number) {
  const positions: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * TAU;
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const px = (dy * width) / 2;
    const py = (-dx * width) / 2;
    const b = positions.length / 3;
    positions.push(dx * inner - px, dy * inner - py, 0, dx * inner + px, dy * inner + py, 0, dx * outer + px, dy * outer + py, 0, dx * outer - px, dy * outer - py, 0);
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

/** A rectangle with cut corners. */
export function chamfer<T extends Path>(path: T, hw: number, hh: number, cut: number): T {
  path.moveTo(-hw + cut, -hh);
  path.lineTo(hw - cut, -hh);
  path.lineTo(hw, -hh + cut);
  path.lineTo(hw, hh - cut);
  path.lineTo(hw - cut, hh);
  path.lineTo(-hw + cut, hh);
  path.lineTo(-hw, hh - cut);
  path.lineTo(-hw, -hh + cut);
  return path;
}

/** Extrudes an outline into a bevelled plate whose front face sits at z = 0. */
export function plate(shape: Shape, depth: number, bevel: number) {
  const geometry = new ExtrudeGeometry(shape, BEVELLED(depth, bevel));
  geometry.translate(0, 0, -(depth - bevel));
  return geometry;
}

/** The console slab: a thick chamfered frame around an opening for the screen. */
export function frame(hw: number, hh: number, cut: number, holeW: number, holeH: number, holeCut: number, depth: number, bevel: number) {
  const shape = chamfer(new Shape(), hw, hh, cut);
  shape.holes.push(chamfer(new Path(), holeW, holeH, holeCut));
  return plate(shape, depth, bevel);
}

/** An L-shaped corner bracket; its outer corner is the origin and its arms run along −x and −y. */
export function bracket(arm: number, width: number, cut: number) {
  return new Shape([
    new Vector2(-arm, 0),
    new Vector2(-cut, 0),
    new Vector2(0, -cut),
    new Vector2(0, -arm),
    new Vector2(-width, -arm + width * 0.7),
    new Vector2(-width, -width),
    new Vector2(-arm + width * 0.7, -width),
  ]);
}

/** A trapezoid standing on the x axis. */
export function trapezoid(bottom: number, top: number, height: number) {
  return new Shape([new Vector2(-bottom / 2, 0), new Vector2(bottom / 2, 0), new Vector2(top / 2, height), new Vector2(-top / 2, height)]);
}

/** A unit box, open at the front (z = 0) and one deep, with its faces turned inward. Group 0: walls, 1: floor. */
export function recess() {
  const positions: number[] = [];
  const normals: number[] = [];
  const quad = (corners: number[][], normal: [number, number, number]) => {
    const [a, b, c, d] = corners;
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const facing = (ab[1] * ac[2] - ab[2] * ac[1]) * normal[0] + (ab[2] * ac[0] - ab[0] * ac[2]) * normal[1] + (ab[0] * ac[1] - ab[1] * ac[0]) * normal[2];
    for (const p of facing < 0 ? [a, d, c, a, c, b] : [a, b, c, a, c, d]) {
      positions.push(p[0], p[1], p[2]);
      normals.push(...normal);
    }
  };
  quad([[-0.5, -0.5, 0], [-0.5, -0.5, -1], [-0.5, 0.5, -1], [-0.5, 0.5, 0]], [1, 0, 0]);
  quad([[0.5, -0.5, 0], [0.5, -0.5, -1], [0.5, 0.5, -1], [0.5, 0.5, 0]], [-1, 0, 0]);
  quad([[-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, -0.5, -1], [-0.5, -0.5, -1]], [0, 1, 0]);
  quad([[-0.5, 0.5, 0], [0.5, 0.5, 0], [0.5, 0.5, -1], [-0.5, 0.5, -1]], [0, -1, 0]);
  const walls = positions.length / 3;
  quad([[-0.5, -0.5, -1], [0.5, -0.5, -1], [0.5, 0.5, -1], [-0.5, 0.5, -1]], [0, 0, 1]);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.addGroup(0, walls, 0);
  geometry.addGroup(walls, 6, 1);
  return geometry;
}

/** A flat chamfered outline `width` wide, centred on the given rectangle. */
export function outline(hw: number, hh: number, cut: number, width: number) {
  const shape = chamfer(new Shape(), hw + width / 2, hh + width / 2, cut + width * 0.2);
  shape.holes.push(chamfer(new Path(), hw - width / 2, hh - width / 2, Math.max(0, cut - width * 0.2)));
  return new ShapeGeometry(shape, 1);
}

/* ----------------------------------------------------------------------------
 * Shaders (all additive except the screen, which is opaque glass)
 * ------------------------------------------------------------------------- */

const OUTPUT = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>`;

export const UV_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The summoning circle, traced clockwise by `uTrace` (0–1). */
export const SIGIL_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTrace;
uniform float uGlow;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float angle = fract(atan(p.x, p.y) / 6.2831853 + 1.0);
  float traced = smoothstep(uTrace, uTrace - 0.015, angle) * step(0.001, uTrace);
  float lines = texture2D(uMap, vUv).r;
  float fade = smoothstep(1.0, 0.7, r);
  float pulse = 0.82 + 0.18 * sin(uTime * 1.4 - r * 7.0);
  gl_FragColor = vec4(uColor * lines * traced * fade * pulse * uGlow, 1.0);
  ${OUTPUT}
}`;

export const POINT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
varying float vAlpha;
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  vec3 color = mix(uColor, uHot, a * a * (0.3 + vHeat * 0.7));
  gl_FragColor = vec4(color * a * vAlpha, 1.0);
  ${OUTPUT}
}`;

/** Embers drifting up through a box of air; `uPull` draws them toward `uCenter`. */
export const EMBER_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uAlpha;
uniform float uSize;
uniform float uPull;
uniform vec3 uCenter;
uniform vec3 uBox;
attribute vec4 aSeed;
varying float vAlpha;
varying float vHeat;
void main() {
  float height = uBox.y * 2.0;
  float y = mod(aSeed.y * height + uTime * (0.1 + aSeed.w * 0.22), height);
  vec3 p = vec3(
    (aSeed.x - 0.5) * 2.0 * uBox.x + sin(uTime * 0.5 + aSeed.w * 21.0) * 0.35,
    y - uBox.y,
    (aSeed.z - 0.5) * 2.0 * uBox.z + cos(uTime * 0.4 + aSeed.w * 13.0) * 0.3
  );
  vec3 toward = uCenter - p;
  float reach = smoothstep(9.0, 0.5, length(toward));
  p += toward * uPull * reach * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float life = y / height;
  vAlpha = uAlpha * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.62, 1.0, life));
  vHeat = aSeed.w + uPull * reach;
  gl_PointSize = (0.6 + aSeed.w * 1.6) * uSize * uPixel / -mv.z;
}`;

/** Sparks: `uMode` 0 bursts out along `aDir` (`uAge` in seconds), 1 gathers in from a shell (`uAge` 0–1). */
export const SPARK_VERTEX = /* glsl */ `
uniform float uAge;
uniform float uMode;
uniform float uPixel;
uniform float uSize;
uniform float uAlpha;
attribute vec3 aDir;
attribute vec4 aSeed;
varying float vAlpha;
varying float vHeat;
void main() {
  vec3 p;
  float a;
  if (uMode < 0.5) {
    float t = max(0.0, uAge - aSeed.w * 0.12);
    float speed = 1.2 + aSeed.x * 3.4;
    float life = 0.6 + aSeed.y * 1.2;
    p = aDir * speed * (1.0 - exp(-1.8 * t)) / 1.8 + vec3(0.0, -0.35 * t * t, 0.0);
    a = step(0.0001, t) * (1.0 - smoothstep(life * 0.35, life, t));
  } else {
    float k = clamp(uAge * (1.0 + aSeed.w) - aSeed.w * 0.6, 0.0, 1.0);
    float r = (1.8 + aSeed.x * 2.2) * (1.0 - k * k * (3.0 - 2.0 * k));
    p = aDir * r;
    a = smoothstep(0.0, 0.3, uAge) * smoothstep(0.02, 0.5, r) * step(uAge, 0.999);
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = a * uAlpha;
  vHeat = aSeed.z;
  gl_PointSize = (0.5 + aSeed.z * 1.4) * uSize * uPixel / -mv.z;
}`;

export const BEAM_VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

/** The link from console to vault: a faint body, flowing pulses, an outgoing packet (`uHead`) and a returning one (`uBack`). */
export const BEAM_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uFlow;
uniform float uHead;
uniform float uBack;
uniform vec3 uColor;
varying vec2 vUv;
varying float vFacing;
void main() {
  float s = vUv.x;
  float ends = smoothstep(0.0, 0.04, s) * smoothstep(1.0, 0.94, s);
  float reach = uHead >= 0.0 ? smoothstep(uHead + 0.02, uHead - 0.02, s) : 1.0;
  float head = uHead >= 0.0 ? exp(-pow((s - uHead) * 16.0, 2.0)) : 0.0;
  float back = uBack >= 0.0 ? exp(-pow((s - uBack) * 16.0, 2.0)) : 0.0;
  float flow = pow(0.5 + 0.5 * sin(s * 40.0 - uTime * 9.0), 8.0) * uFlow;
  float a = ((0.22 + flow * 0.8) * uLevel * reach + (head + back) * 1.6) * ends * pow(vFacing, 2.0);
  gl_FragColor = vec4(uColor * a, 1.0);
  ${OUTPUT}
}`;

/** The console's glass: powers on from a line, carries a faint grid, scans while checking, and has holes for the sockets. */
export const SCREEN_FRAGMENT = /* glsl */ `
uniform vec2 uSize;
uniform float uPower;
uniform float uLevel;
uniform float uScan;
uniform float uNoise;
uniform float uFlash;
uniform float uTime;
uniform vec3 uColor;
uniform vec2 uSheen;
uniform vec4 uHoleA;
uniform vec4 uHoleB;
varying vec2 vUv;
float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float outside(vec2 p, vec4 hole) { vec2 d = abs(p - hole.xy) - hole.zw; return max(d.x, d.y); }
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  if (outside(p, uHoleA) < 0.0 || outside(p, uHoleB) < 0.0) discard;
  vec2 inset = uSize * 0.5 - abs(p);
  float edge = min(inset.x, inset.y);
  float open = uPower * (uSize.y * 0.5 + 8.0);
  float lit = smoothstep(open + 1.0, open - 5.0, abs(p.y));
  float line = exp(-pow((abs(p.y) - open) / 2.5, 2.0)) * step(0.001, uPower) * (1.0 - smoothstep(0.8, 1.0, uPower));
  vec3 glass = vec3(0.010, 0.004, 0.006);
  vec3 c = glass + uColor * exp(-edge / 22.0) * 0.22 * uLevel;
  vec2 q = abs(fract(p / 24.0) - 0.5) * 24.0;
  c += uColor * smoothstep(11.2, 12.0, max(q.x, q.y)) * 0.035 * uLevel;
  c *= 0.9 + 0.1 * step(0.5, fract(p.y / 3.0));
  float sy = (0.5 - fract(uTime * 0.6)) * (uSize.y + 160.0);
  c += uColor * (exp(-pow((p.y - sy) / 30.0, 2.0)) + 0.8 * exp(-pow((p.y - sy) / 2.0, 2.0))) * 0.18 * uScan;
  c += vec3(0.9, 0.85, 0.86) * hash2(floor(p / 2.0) + floor(uTime * 8.0) * 7.31) * 0.06 * uNoise;
  c += mix(uColor, vec3(1.0), 0.5) * uFlash * 0.16;
  float sheen = dot(p / uSize, vec2(0.83, 0.55)) - uSheen.x * 0.5 - uSheen.y * 0.3 + 0.15;
  c += vec3(1.0, 0.86, 0.9) * exp(-sheen * sheen / 0.012) * 0.03;
  gl_FragColor = vec4(mix(glass, c, lit) + uColor * line * 0.9, 1.0);
  ${OUTPUT}
}`;

/** Slow smoke: two drifting samples of the noise texture, faded at the plane's edges. */
export const SMOKE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uLevel;
uniform vec3 uColor;
uniform vec2 uDrift;
varying vec2 vUv;
void main() {
  vec2 uv = vUv * 1.6;
  float a = texture2D(uMap, uv + uDrift * uTime).r;
  float b = texture2D(uMap, uv * 1.9 - uDrift.yx * uTime * 0.6 + 0.37).r;
  float s = smoothstep(0.4, 1.0, a * 0.65 + b * 0.55);
  vec2 m = smoothstep(0.0, 0.28, vUv) * smoothstep(1.0, 0.72, vUv);
  gl_FragColor = vec4(uColor * s * m.x * m.y * uLevel, 1.0);
  ${OUTPUT}
}`;

/** A cone of light pouring out of the open vault: bright at the door, streaked, strongest at its silhouette. */
export const CONE_VERTEX = /* glsl */ `
uniform float uLength;
varying vec2 vUv;
varying float vAlong;
varying float vEdge;
void main() {
  vUv = uv;
  vAlong = position.y / uLength + 0.5;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vEdge = 1.0 - abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

export const CONE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlong;
varying float vEdge;
void main() {
  float around = vUv.x * 6.2831853;
  float streak = pow(0.5 + 0.5 * sin(around * 7.0 + uTime * 0.35) * sin(around * 3.0 - uTime * 0.22 + 1.3), 2.0);
  float fall = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.08, vAlong);
  float a = uLevel * fall * (0.2 + 0.8 * streak) * (0.25 + 0.75 * vEdge);
  gl_FragColor = vec4(uColor * a, 1.0);
  ${OUTPUT}
}`;
