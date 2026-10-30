"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { follow, spring, studioEnvironment } from "@/components/showcase/three-kit";
import { bracket, clamp01, easeBack, easeInOut, easeOut, lerp, span, TAU } from "@/components/vault/vault-forge";
import type { MotionLevel } from "@/lib/preferences";
import { BOOT, PIECE_LANDINGS, type BootKind } from "./admin-timing";

/**
 * The admin console in space: a frosted glass slab in a metal bezel with traced contours, corner
 * brackets in front, a back plate and a stack of system planes behind it, and curved system panes
 * hanging in a dark sky. The page's console element is mapped onto the glass every frame, so the
 * real controls sit exactly on it; at rest the mapping collapses to no transform and text stays crisp.
 *
 * The console tilts toward the pointer around the point under it (so controls never slide away),
 * approaches along the pointer's ray, and settles flat while typing, pressing, scrolling, in dialogs
 * or once the pointer rests. Rendering stops when idle, hidden or off screen.
 */

export type ConsoleSignal = "forward" | "back" | "page" | "publish" | "draft" | "error";
export type AdminSceneHandle = { start: (kind: BootKind) => void; skip: () => void; signal: (signal: ConsoleSignal) => void; setLayers: (count: number) => void };

const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360);
const DIST = 14;
const MAX_TILT = 0.055;
/** How far (CSS px) the console comes forward while the pointer is over it. */
const APPROACH = 10;
const SHEETS = 3;

const CYAN = new Color(0x5ad2ff);
const ICE = new Color(0xe2f8ff);
const DEEP = new Color(0x0b2a5e);
const ALERT = new Color(0xffa94d);

/** The system panes around the console: position as fractions of the view at their depth, size in world units. */
type Pane = { x: number; y: number; z: number; w: number; h: number; word: string; rows: number; compact?: boolean };
const PANES: Pane[] = [
  { x: -0.8, y: 0.52, z: -5, w: 3.1, h: 1.9, word: "Status", rows: 4, compact: true },
  { x: -0.86, y: -0.3, z: -3.2, w: 2.3, h: 2.8, word: "Queue", rows: 6 },
  { x: 0.9, y: 0.56, z: -6.5, w: 3.3, h: 1.5, word: "Signal", rows: 2, compact: true },
  { x: 0.88, y: -0.26, z: -4, w: 2.6, h: 2.5, word: "Access", rows: 5 },
  { x: -0.3, y: 0.88, z: -9, w: 4.4, h: 1.4, word: "Archive", rows: 2, compact: true },
  { x: 0.42, y: -0.9, z: -8, w: 3.8, h: 1.3, word: "Log", rows: 2, compact: true },
  { x: 0.02, y: 0.08, z: -12, w: 7.5, h: 4.2, word: "System", rows: 7 },
];

/* ----------------------------------------------------------------------------
 * Shaders
 * ------------------------------------------------------------------------- */

/** The sky, in screen space so it reads as infinitely far; panes sample it to look translucent while staying opaque (and so visible through the glass). */
const SKY = /* glsl */ `
uniform sampler2D uCloud;
uniform float uTime;
uniform float uSky;
uniform float uAspect;
vec3 sky(vec2 s) {
  vec2 uv = vec2((s.x - 0.5) * uAspect, s.y - 0.5);
  float c1 = texture2D(uCloud, uv * 0.6 + vec2(uTime * 0.004, 0.37)).r;
  float c2 = texture2D(uCloud, uv * 1.15 + vec2(-uTime * 0.007, 0.81)).r;
  float clouds = c1 * 0.62 + c2 * 0.38;
  vec3 col = mix(vec3(0.003, 0.006, 0.016), vec3(0.012, 0.03, 0.07), smoothstep(-0.55, 0.55, uv.y));
  col += clouds * clouds * vec3(0.05, 0.1, 0.17) * smoothstep(-0.7, 0.45, uv.y);
  vec2 g = uv - vec2(0.0, 0.04);
  col += vec3(0.016, 0.07, 0.14) * exp(-dot(g, g) * 3.0);
  return col * uSky;
}`;

const BOX = /* glsl */ `
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}`;

const BACKDROP_VERTEX = /* glsl */ `
varying vec2 vScreen;
void main() {
  vScreen = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

const BACKDROP_FRAGMENT = /* glsl */ `
${SKY}
varying vec2 vScreen;
void main() {
  gl_FragColor = vec4(sky(vScreen), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const CLIP_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec4 vClip;
void main() {
  vUv = uv;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vClip = clip;
  gl_Position = clip;
}`;

/** A system pane: translucent-looking glass with a traced, glowing border and optional painted contents. */
const PANE_FRAGMENT = /* glsl */ `
${SKY}
${BOX}
uniform sampler2D uMap;
uniform vec4 uRect;
uniform float uHasMap;
uniform vec2 uSize;
uniform float uRadius;
uniform float uLine;
uniform float uDraw;
uniform float uLive;
uniform float uGlow;
uniform vec3 uTint;
varying vec2 vUv;
varying vec4 vClip;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = box(p, uSize * 0.5 - uLine * 2.0, uRadius);
  float aa = fwidth(d);
  if (d > uLine * 2.0) discard;
  vec3 behind = sky(vClip.xy / vClip.w * 0.5 + 0.5);
  float around = fract(atan(p.x, p.y) / 6.2831853 + 0.125);
  float drawn = step(around, uDraw);
  float lit = smoothstep(0.0, 0.35, uDraw);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float line = (1.0 - smoothstep(uLine * 0.5, uLine * 0.5 + aa, abs(d))) * drawn;
  float halo = exp(-abs(d) / (uLine * 3.0)) * 0.3 * drawn;
  vec3 glass = behind * 0.6 + uTint * (0.03 + 0.035 * vUv.y);
  glass += uTint * exp(d / (uLine * 14.0)) * 0.1;
  vec3 col = mix(behind, glass, inside * lit);
  if (uHasMap > 0.5) col += uTint * texture2D(uMap, uRect.xy + vUv * uRect.zw).a * 0.7 * uLive * inside;
  col += uTint * (line * 1.3 + halo) * (1.0 + uGlow);
  col += uTint * uGlow * 0.06 * inside;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const UV_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The dark layer right behind the page content: keeps text legible, activates with a scan from the top. */
const SCREEN_FRAGMENT = /* glsl */ `
${BOX}
uniform vec2 uSize;
uniform float uRadius;
uniform float uFill;
uniform float uHead;
uniform float uPulse;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = box(p, uSize * 0.5, uRadius);
  float aa = fwidth(d);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float y = 1.0 - vUv.y;
  float filled = 1.0 - smoothstep(uFill - 0.004, uFill, y);
  float py = y * uSize.y;
  float band = 1.0 - smoothstep(uHead - 1.0, uHead + 1.0, py);
  vec3 col = vec3(0.006, 0.016, 0.036) + uTint * (band * 0.05 + 0.022 * (1.0 - y) + exp(d / 26.0) * 0.05 + uPulse * 0.07);
  float alpha = 0.64 - band * 0.1;
  float scan = uFill > 0.0 && uFill < 1.0 ? exp(-abs(y - uFill) * uSize.y / 5.0) : 0.0;
  col += uTint * scan * 0.9;
  alpha = min(1.0, alpha + scan * 0.35);
  gl_FragColor = vec4(col, alpha * inside * filled);
  #include <colorspace_fragment>
}`;

/** Light lines: a bright core with a soft glow, traced along `aT` (0–1 around the loop) up to `uDraw`. */
const RIBBON_VERTEX = /* glsl */ `
attribute float aT;
attribute float aSide;
varying float vT;
varying float vSide;
void main() {
  vT = aT;
  vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const RIBBON_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uAlertColor;
uniform float uAlert;
uniform float uLevel;
uniform float uDraw;
uniform float uCore;
uniform float uHeads;
varying float vT;
varying float vSide;
void main() {
  float t = fract(vT * uHeads);
  if (t > uDraw || uLevel <= 0.0) discard;
  float x = abs(vSide);
  float core = 1.0 - smoothstep(uCore * 0.5, uCore, x);
  float glow = exp(-x * x * 9.0) * 0.32 * (1.0 - core);
  float head = uDraw < 1.0 ? exp(-(uDraw - t) * 40.0 * uHeads) * 1.4 : 0.0;
  float a = (core + glow) * uLevel * (1.0 + head);
  gl_FragColor = vec4(mix(uColor, uAlertColor, uAlert) * a, 1.0);
  #include <colorspace_fragment>
}`;

/* ----------------------------------------------------------------------------
 * Geometry (console parts are built in CSS px; the console group scales them)
 * ------------------------------------------------------------------------- */

function rounded<T extends Path>(path: T, hw: number, hh: number, r: number): T {
  path.moveTo(-hw + r, -hh);
  path.lineTo(hw - r, -hh);
  path.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  path.lineTo(hw, hh - r);
  path.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  path.lineTo(-hw + r, hh);
  path.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-hw, -hh + r);
  path.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

/** Points around a rounded rectangle, clockwise from the top-left corner. */
function outline(hw: number, hh: number, r: number, segments = 10): [number, number][] {
  const points: [number, number][] = [];
  const corners: [number, number, number][] = [
    [-hw + r, hh - r, Math.PI],
    [hw - r, hh - r, Math.PI / 2],
    [hw - r, -hh + r, 0],
    [-hw + r, -hh + r, -Math.PI / 2],
  ];
  for (const [cx, cy, start] of corners)
    for (let i = 0; i <= segments; i++) {
      const a = start - (i / segments) * (Math.PI / 2);
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  // Start where the top-left corner meets the top edge.
  return [...points.slice(segments), ...points.slice(0, segments)];
}

function circle(r: number, segments: number): [number, number][] {
  return Array.from({ length: segments }, (_, i) => {
    const a = Math.PI / 2 - (i / segments) * TAU;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });
}

/** A flat closed strip `width` wide along the points, with its position along the loop and across the strip. */
function ribbon(points: [number, number][], width: number) {
  const n = points.length;
  const count = n + 1;
  const lengths = [0];
  for (let i = 1; i < count; i++) {
    const a = points[(i - 1) % n];
    const b = points[i % n];
    lengths.push(lengths[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[count - 1] || 1;
  const position: number[] = [];
  const along: number[] = [];
  const side: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = points[i % n];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const tx = next[0] - prev[0];
    const ty = next[1] - prev[1];
    const length = Math.hypot(tx, ty) || 1;
    const nx = ty / length;
    const ny = -tx / length;
    for (const s of [-1, 1]) {
      position.push(p[0] + (nx * s * width) / 2, p[1] + (ny * s * width) / 2, 0);
      along.push(lengths[i] / total);
      side.push(s);
    }
    if (i < count - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("aT", new Float32BufferAttribute(along, 1));
  geometry.setAttribute("aSide", new Float32BufferAttribute(side, 1));
  geometry.setIndex(index);
  return geometry;
}

/** A plane bent like a section of a cylinder, its edges toward the viewer. */
function curved(w: number, h: number, bend: number) {
  const geometry = new PlaneGeometry(w, h, 32, 1);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / (w / 2);
    position.setZ(i, bend * x * x);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/* ----------------------------------------------------------------------------
 * Painted textures
 * ------------------------------------------------------------------------- */

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const ctx = element.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return { element, ctx };
}

const noise = (n: number) => {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
};

/** Soft cloud banks, tileable, for the sky. */
function paintClouds() {
  const { element, ctx } = canvas(256, 256);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 256, 256);
  ctx.filter = "blur(6px)";
  for (let i = 0; i < 80; i++) {
    const x = noise(i) * 256;
    const y = noise(i + 100) * 256;
    const r = 12 + noise(i + 200) * 60;
    const a = 0.05 + noise(i + 300) * 0.1;
    for (const dx of [-256, 0, 256])
      for (const dy of [-256, 0, 256]) {
        const fade = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        fade.addColorStop(0, `rgba(255,255,255,${a})`);
        fade.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = fade;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
  }
  const texture = new CanvasTexture(element);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

/** A faint grid for the back plate, lit from inside; the frosted glass blurs it into a glow. */
function paintGrid() {
  const { element, ctx } = canvas(128, 128);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "rgb(60,150,230)";
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, 128, 1);
  ctx.fillRect(0, 0, 1, 128);
  ctx.globalAlpha = 0.9;
  ctx.fillRect(0, 0, 6, 1);
  ctx.fillRect(0, 0, 1, 6);
  const texture = new CanvasTexture(element);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const ATLAS = 1024;
const CELL = { w: 512, h: 256 };

/** Where each pane's contents sit in the atlas, keeping the pane's proportions. */
function atlasRect(index: number, pane: Pane) {
  const aspect = pane.w / pane.h;
  const w = aspect >= CELL.w / CELL.h ? CELL.w : CELL.h * aspect;
  const h = w / aspect;
  const x = (index % 2) * CELL.w;
  const y = Math.floor(index / 2) * CELL.h;
  return { x, y, w, h };
}

/** Pane contents like the reference windows: a heading with a rule, a close mark and ruled rows (abstract, no data). */
function paintPanes(ctx: CanvasRenderingContext2D, family: string) {
  ctx.clearRect(0, 0, ATLAS, ATLAS);
  PANES.forEach((pane, index) => {
    const { x, y, w, h } = atlasRect(index, pane);
    const pad = Math.min(w, h) * 0.09;
    const size = Math.min(h * 0.15, 40);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.globalAlpha = 1;
    ctx.font = `600 ${size}px ${family}`;
    ctx.textBaseline = "alphabetic";
    ctx.letterSpacing = `${(size * 0.08).toFixed(1)}px`;
    ctx.fillText(pane.word.toUpperCase(), x + pad, y + pad + size * 0.85);
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x + pad, y + pad + size * 1.2, w - pad * 2, 2);
    const mark = size * 0.62;
    const mx = x + w - pad - mark;
    const my = y + pad + size * 0.1;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(mx, my, mark, mark);
    ctx.beginPath();
    ctx.moveTo(mx + mark * 0.28, my + mark * 0.28);
    ctx.lineTo(mx + mark * 0.72, my + mark * 0.72);
    ctx.moveTo(mx + mark * 0.72, my + mark * 0.28);
    ctx.lineTo(mx + mark * 0.28, my + mark * 0.72);
    ctx.stroke();
    const top = y + pad + size * 1.65;
    const row = (y + h - pad - top) / pane.rows;
    for (let r = 0; r < pane.rows; r++) {
      const ry = top + r * row;
      ctx.globalAlpha = 0.42;
      ctx.fillRect(x + pad, ry + row * 0.34, (w - pad * 2) * (0.16 + noise(index * 10 + r) * 0.26), Math.max(3, row * 0.26));
      ctx.globalAlpha = 0.7;
      const value = (w - pad * 2) * (0.06 + noise(index * 10 + r + 50) * 0.12);
      ctx.fillRect(x + w - pad - value, ry + row * 0.34, value, Math.max(3, row * 0.26));
      ctx.globalAlpha = 0.16;
      if (r < pane.rows - 1) ctx.fillRect(x + pad, ry + row, w - pad * 2, 1.5);
    }
  });
  ctx.globalAlpha = 1;
}

/* ----------------------------------------------------------------------------
 * Motion helpers
 * ------------------------------------------------------------------------- */

type Osc = { value: number; velocity: number };
const osc = (value = 0): Osc => ({ value, velocity: 0 });
/** An underdamped spring, for motions that should overshoot a touch and settle. */
function oscillate(s: Osc, target: number, hz: number, damping: number, dt: number) {
  const w = TAU * hz;
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.velocity += (-w * w * (s.value - target) - 2 * damping * w * s.velocity) * h;
    s.value += s.velocity * h;
  }
}
const soft = (v: number) => v / Math.sqrt(1 + v * v);
/** Rises to 1 by `peak` and falls back to 0 by `end` (ms). */
const pulse = (t: number, start: number, peak: number, end: number) =>
  t < start || t > end ? 0 : t < peak ? easeOut((t - start) / (peak - start)) : 1 - easeInOut((t - peak) / (end - peak));

type Boot = { trace: number; inner: number; planes: number; pieces: number; arrive: number; glass: number; scan: number; sky: number };
const SETTLED: Boot = { trace: 1, inner: 1, planes: 1, pieces: 1, arrive: 1, glass: 1, scan: 1, sky: 1 };
const DARK: Boot = { trace: 0, inner: 0, planes: 0, pieces: 0, arrive: 0, glass: 0, scan: 0, sky: 0.35 };
const bootTotal = (kind: BootKind | "pending") => (kind === "none" || kind === "pending" ? 0 : BOOT[kind].total);

function bootPose(kind: BootKind | "pending", e: number): Boot {
  if (kind === "none") return SETTLED;
  if (kind === "pending") return DARK;
  const t = BOOT[kind];
  return {
    trace: easeInOut(span(e, ...t.trace)),
    inner: easeInOut(span(e, ...t.inner)),
    planes: span(e, ...t.planes),
    pieces: span(e, ...t.pieces),
    arrive: span(e, ...t.arrive),
    glass: easeOut(span(e, ...t.glass)),
    scan: span(e, ...t.scan),
    sky: kind === "late" ? 1 : 0.35 + 0.65 * easeOut(span(e, 0, t.arrive[1])),
  };
}

const FORM = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable='true']";

/* ----------------------------------------------------------------------------
 * Engine
 * ------------------------------------------------------------------------- */

type Init = { motion: MotionLevel; layers: number };

function createAdminEngine(host: HTMLDivElement, panelRef: RefObject<HTMLElement | null>, init: Init, cb: { ready: () => void; fail: () => void }) {
  const fineQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  let compact = window.innerWidth < 768;
  let dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x02050b, 1);
  renderer.transmissionResolutionScale = 0.5;
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  camera.position.set(0, 0, DIST);
  const owned: Texture[] = [];
  const env = studioEnvironment(renderer, CYAN, DEEP, true, 0.7);
  owned.push(env);
  scene.environment = env;

  scene.add(new AmbientLight(0x22324d, 0.6));
  const key = new DirectionalLight(0xe8f4ff, 1.8);
  key.position.set(-5, 7, 9);
  const rim = new DirectionalLight(0x48c6ff, 1.4);
  rim.position.set(7, -3, -5);
  const cursor = new PointLight(0xa8ecff, 0, 0, 1.6);
  cursor.position.set(0, 0, 2.4);
  scene.add(key, rim, cursor);

  /* ---------------------------------------------------------------- sky */
  const cloud = paintClouds();
  owned.push(cloud);
  const skyU = { uCloud: { value: cloud as Texture }, uTime: { value: 0 }, uSky: { value: 0.35 }, uAspect: { value: 1 } };
  const backdropGeo = new BufferGeometry();
  backdropGeo.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const backdrop = new Mesh(backdropGeo, new ShaderMaterial({ uniforms: skyU, vertexShader: BACKDROP_VERTEX, fragmentShader: BACKDROP_FRAGMENT, depthWrite: false, depthTest: false }));
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  /* ---------------------------------------------------------------- system panes */
  const atlasCanvas = canvas(ATLAS, ATLAS);
  const atlas = new CanvasTexture(atlasCanvas.element);
  atlas.anisotropy = 4;
  owned.push(atlas);
  const family = () => getComputedStyle(host).getPropertyValue("--font-system-display").trim() || "sans-serif";
  paintPanes(atlasCanvas.ctx, family());
  let disposed = false;
  void document.fonts?.ready.then(() => {
    if (disposed) return;
    paintPanes(atlasCanvas.ctx, family());
    atlas.needsUpdate = true;
  });

  const paneMaterial = (size: [number, number], line: number, radius: number, map: { x: number; y: number; w: number; h: number } | null) =>
    new ShaderMaterial({
      uniforms: {
        ...skyU,
        uMap: { value: atlas },
        uRect: { value: map ? [map.x / ATLAS, 1 - (map.y + map.h) / ATLAS, map.w / ATLAS, map.h / ATLAS] : [0, 0, 1, 1] },
        uHasMap: { value: map ? 1 : 0 },
        uSize: { value: size },
        uRadius: { value: radius },
        uLine: { value: line },
        uDraw: { value: 0 },
        uLive: { value: 0 },
        uGlow: { value: 0 },
        uTint: { value: ICE.clone().lerp(CYAN, 0.35) },
      },
      vertexShader: CLIP_VERTEX,
      fragmentShader: PANE_FRAGMENT,
    });

  const world = new Group();
  scene.add(world);
  const panes = PANES.map((pane, index) => {
    const material = paneMaterial([pane.w, pane.h], 0.014, 0.06, atlasRect(index, pane));
    const mesh = new Mesh(curved(pane.w, pane.h, pane.w * 0.08), material);
    world.add(mesh);
    return { pane, mesh, material, rest: new Vector3(), order: index };
  });

  /* ---------------------------------------------------------------- console */
  const con = new Group();
  const px = new Group();
  con.add(px);
  scene.add(con);

  const alertU = { value: 0 };
  const ribbonMaterial = (color: Color, core: number, level: number, heads = 1) =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uAlertColor: { value: ALERT },
        uAlert: alertU,
        uLevel: { value: level },
        uDraw: { value: 1 },
        uCore: { value: core },
        uHeads: { value: heads },
      },
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

  const glassMat = new MeshPhysicalMaterial({
    color: 0xcfe6ff,
    metalness: 0,
    roughness: 0.34,
    transmission: 1,
    thickness: 12,
    ior: 1.42,
    attenuationColor: new Color(0x0d2650),
    attenuationDistance: 0.5,
    specularIntensity: 0.8,
    clearcoat: 0.5,
    clearcoatRoughness: 0.12,
    envMapIntensity: 0.7,
  });
  const bezelMat = new MeshStandardMaterial({ color: 0x0b1424, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.1 });
  const grid = paintGrid();
  owned.push(grid);
  const backMat = new MeshStandardMaterial({ color: 0x03070f, metalness: 0.3, roughness: 0.8, emissive: 0xffffff, emissiveMap: grid, emissiveIntensity: 0.55 });
  const screenMat = new ShaderMaterial({
    uniforms: { uSize: { value: [1, 1] }, uRadius: { value: 10 }, uFill: { value: 0 }, uHead: { value: 0 }, uPulse: { value: 0 }, uTint: { value: CYAN.clone() } },
    vertexShader: UV_VERTEX,
    fragmentShader: SCREEN_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const outerMat = ribbonMaterial(ICE, 0.12, 1, 2);
  const innerMat = ribbonMaterial(CYAN.clone().lerp(ICE, 0.4), 0.16, 0.42);
  const ghostMat = ribbonMaterial(ICE, 0.12, 0);
  const ringMats = [ribbonMaterial(ICE, 0.2, 0), ribbonMaterial(CYAN, 0.2, 0)];

  const empty = new BufferGeometry();
  const glass = new Mesh(empty, glassMat);
  const bezel = new Mesh(empty, bezelMat);
  const outer = new Mesh(empty, outerMat);
  const inner = new Mesh(empty, innerMat);
  const screen = new Mesh(new PlaneGeometry(1, 1), screenMat);
  const backPlate = new Mesh(empty, backMat);
  const ghost = new Mesh(empty, ghostMat);
  const ringGeo = ribbon(circle(100, 96), 12);
  const rings = ringMats.map((material) => new Mesh(ringGeo, material));
  outer.position.z = 2;
  inner.position.z = 0.5;
  screen.position.z = -1;
  const front = new Group();
  const back = new Group();
  px.add(back, glass, screen, bezel, outer, inner, front, ghost, ...rings);
  back.add(backPlate);

  const brackets = [0, 1, 2, 3].map((index) => {
    const material = new MeshStandardMaterial({ color: 0x0e1b30, metalness: 0.85, roughness: 0.3, emissive: CYAN, emissiveIntensity: 0.28 });
    const mesh = new Mesh(empty, material);
    front.add(mesh);
    // Top-right, top-left, bottom-left, bottom-right.
    const sx = index === 0 || index === 3 ? 1 : -1;
    const sy = index < 2 ? 1 : -1;
    return { mesh, material, sx, sy, angle: [0, Math.PI / 2, Math.PI, -Math.PI / 2][index], rest: new Vector3() };
  });
  const sheets = Array.from({ length: SHEETS }, (_, index) => {
    const material = paneMaterial([1, 1], 1.2, 12, null);
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    back.add(mesh);
    return { mesh, material, hidden: spring(index < init.layers ? 0 : 1) };
  });

  /* ---------------------------------------------------------------- layout */
  let W = 0;
  let H = 0;
  let f = 1;
  let k = 1;
  let hostLeft = 0;
  let hostTop = 0;
  let panelW = 0;
  let panelH = 0;
  let panelCX = 0;
  let panelCY = 0;
  let shapeKey = "";
  let dirty = true;
  const conRest = new Vector3();
  const slot = new Vector3(18, 14, -70);

  function resize() {
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    f = H / (2 * TAN);
    k = DIST / f;
    px.scale.setScalar(k);
    skyU.uAspect.value = W / H;
  }

  function buildConsole() {
    const hw = panelW / 2;
    const hh = panelH / 2;
    const m = compact ? 7 : 16;
    const bw = compact ? 4 : 7;
    const r = compact ? 12 : 16;
    const gw = hw + m;
    const gh = hh + m;
    const replace = (mesh: Mesh, geometry: BufferGeometry) => {
      if (mesh.geometry !== empty && mesh.geometry !== ringGeo) mesh.geometry.dispose();
      mesh.geometry = geometry;
    };
    const glassGeo = new ExtrudeGeometry(rounded(new Shape(), gw - 2.5, gh - 2.5, r - 2.5), { depth: 12, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 3, curveSegments: 8 });
    glassGeo.translate(0, 0, -16.5);
    replace(glass, glassGeo);
    const ring = rounded(new Shape(), gw + bw, gh + bw, r + bw);
    ring.holes.push(rounded(new Path(), gw, gh, r));
    const bezelGeo = new ExtrudeGeometry(ring, { depth: 10, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1, bevelSegments: 2, curveSegments: 8 });
    bezelGeo.translate(0, 0, -10);
    replace(bezel, bezelGeo);
    const outerGeo = ribbon(outline(gw + bw + 0.5, gh + bw + 0.5, r + bw, 10), compact ? 9 : 14);
    if (ghost.geometry === outer.geometry) ghost.geometry = empty;
    replace(outer, outerGeo);
    ghost.geometry = outerGeo;
    replace(inner, ribbon(outline(hw + 0.5, hh + 0.5, Math.max(3, r - m * 0.6), 8), compact ? 5 : 7));
    screen.scale.set(panelW, panelH, 1);
    screenMat.uniforms.uSize.value = [panelW, panelH];
    screenMat.uniforms.uRadius.value = Math.max(3, r - m * 0.6);
    const plate = new ExtrudeGeometry(rounded(new Shape(), gw + (compact ? 10 : 26), gh + (compact ? 10 : 20), r + 10), { depth: 4, bevelEnabled: false, curveSegments: 8 });
    plate.translate(0, 0, -4);
    replace(backPlate, plate);
    grid.repeat.set(1 / 40, 1 / 40);
    const arm = compact ? 22 : 46;
    const bracketGeo = new ExtrudeGeometry(bracket(arm, compact ? 3 : 5, compact ? 3 : 4), { depth: 3, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.6, bevelSegments: 1 });
    const gap = compact ? 4 : 9;
    for (const [index, b] of brackets.entries()) {
      if (index === 0) replace(b.mesh, bracketGeo);
      else b.mesh.geometry = bracketGeo;
      b.rest.set(b.sx * (gw + bw + gap), b.sy * (gh + bw + gap), 16);
    }
    const sw = (gw + bw) * 2;
    const sh = (gh + bw) * 2;
    for (const sheet of sheets) {
      sheet.mesh.scale.set(sw, sh, 1);
      sheet.material.uniforms.uSize.value = [sw, sh];
      sheet.material.uniforms.uRadius.value = r + bw;
    }
    if (compact) slot.set(6, 9, -40);
    else slot.set(18, 14, -70);
  }

  function placePanes() {
    const aspect = W / H;
    let shown = 0;
    for (const entry of panes) {
      const { pane, mesh, rest } = entry;
      const on = !compact || pane.compact === true;
      mesh.visible = on;
      if (!on) continue;
      entry.order = shown++;
      const halfH = (DIST - pane.z) * TAN;
      const halfW = halfH * aspect;
      const scale = compact ? Math.min(1, aspect * 1.4) : 1;
      rest.set(pane.x * halfW, pane.y * halfH, pane.z);
      mesh.scale.setScalar(scale);
      mesh.rotation.set(Math.atan2(rest.y, DIST - rest.z) * 0.85, Math.atan2(-rest.x, DIST - rest.z) * 0.85, 0);
    }
  }

  /** Reads the layout: canvas size and where the console element sits (layout offsets, since it carries the transform). */
  function measure() {
    const stage = host.parentElement;
    const panel = panelRef.current;
    if (!stage || !panel) return;
    const s = stage.getBoundingClientRect();
    hostLeft = s.left;
    hostTop = s.top;
    if (Math.abs(s.width - W) > 0.5 || Math.abs(s.height - H) > 0.5) {
      W = s.width;
      H = s.height;
      const wasCompact = compact;
      compact = W < 768;
      if (compact !== wasCompact) dpr = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
      if (W > 0 && H > 0) resize();
    }
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    if (!W || !H || !pw || !ph) return;
    let x = panel.offsetLeft;
    let y = panel.offsetTop;
    const parent = panel.offsetParent as HTMLElement | null;
    if (parent && parent !== stage) {
      const p = parent.getBoundingClientRect();
      x += p.left + parent.clientLeft - s.left;
      y += p.top + parent.clientTop - s.top;
    }
    panelW = pw;
    panelH = ph;
    panelCX = hostLeft + x + pw / 2;
    panelCY = hostTop + y + ph / 2;
    conRest.set((x + pw / 2 - W / 2) * k, -(y + ph / 2 - H / 2) * k, 0);
    if (!pointer.seen) {
      pivotX.value = pivotX.target = panelCX;
      pivotY.value = pivotY.target = panelCY;
    }
    screenMat.uniforms.uHead.value = panel.querySelector<HTMLElement>(".ax-console-bar")?.offsetHeight ?? 0;
    const shape = `${pw}x${ph}:${compact}`;
    if (shape !== shapeKey) {
      shapeKey = shape;
      buildConsole();
    }
    placePanes();
  }

  /* ---------------------------------------------------------------- state */
  let motion = init.motion;
  let layers = init.layers;
  let introKind: BootKind | "pending" = "pending";
  let introStart = 0;
  let skipAt = -1;
  let skipFrom = 0;
  let awakeUntil = 0;
  let lastFrame = performance.now();
  let clock = 0;
  let typedAt = -1e7;
  let scrolledAt = -1e7;
  let movedAt = -1e7;
  let pressing = false;
  let releasedAt = -1e7;
  let ghostAt = -1e7;
  let celebrateAt = -1e7;
  let draftAt = -1e7;
  let errorAt = -1e7;
  const pointer = { x: 0, y: 0, seen: false };
  const pivotX = spring();
  const pivotY = spring();
  const tiltX = osc();
  const tiltY = osc();
  const approach = osc();
  const dip = osc();
  const shake = osc();
  const stack = osc();
  const layerX = osc();
  const layerY = osc();
  const drift = spring();
  const lightX = spring();
  const lightY = spring();
  const lightOn = spring();
  const euler = new Euler();
  const quat = new Quaternion();
  const pivotV = new Vector3();
  const turned = new Vector3();
  const ray = new Vector3();
  const M = new Matrix4();
  const A = new Matrix4();
  let lastTransform = "\u0000";
  let slowFrames = 0;
  let sampled = 0;

  const elapsed = (now: number) => {
    if (introKind === "none") return 1e9;
    if (introKind === "pending") return 0;
    const raw = now - introStart;
    if (skipAt < 0) return raw;
    return lerp(skipFrom, bootTotal(introKind), easeOut(span(now - skipAt, 0, 380)));
  };

  function isStable(now: number) {
    if (pressing || now - releasedAt < 350 || now - typedAt < 1200 || now - scrolledAt < 900) return true;
    const active = document.activeElement;
    return active instanceof HTMLElement && (active.matches(FORM) || active.closest("[role='dialog'], [role='alertdialog']") !== null);
  }

  function frame(now: number) {
    if (dirty) {
      dirty = false;
      measure();
    }
    if (!W || !H || !panelW) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    const moving = motion !== "off";
    const full = motion === "full";
    const e = elapsed(now);
    const pose = bootPose(introKind, e);
    const booting = introKind !== "pending" && introKind !== "none" && e < bootTotal(introKind);
    const settled = introKind !== "pending" && !booting;
    const awake = full ? clamp01((awakeUntil - now) / 1500) : 0;
    clock += dt * (full ? Math.max(awake, booting ? 1 : 0) : 0);
    skyU.uTime.value = clock;
    skyU.uSky.value = pose.sky;

    /* pointer: tilt around the point under it, come closer along its ray */
    const fine = moving && fineQuery.matches;
    const stable = isStable(now);
    const resting = now - movedAt > 1800;
    const over = pointer.seen && Math.abs(pointer.x - panelCX) < panelW / 2 && Math.abs(pointer.y - panelCY) < panelH / 2;
    const follows = fine && pointer.seen && settled && !stable && !resting;
    const nx = fine && pointer.seen ? soft(((pointer.x - panelCX) / (panelW / 2)) * 1.2) : 0;
    const ny = fine && pointer.seen ? soft(((pointer.y - panelCY) / (panelH / 2)) * 1.2) : 0;
    const reach = full ? 1 : 0.5;
    if (follows) {
      pivotX.target = pointer.x;
      pivotY.target = pointer.y;
    }
    follow(pivotX, 0.12, dt);
    follow(pivotY, 0.12, dt);
    oscillate(tiltY, follows ? nx * MAX_TILT * reach : 0, 1.4, 0.62, dt);
    oscillate(tiltX, follows ? ny * MAX_TILT * 0.7 * reach : 0, 1.4, 0.62, dt);
    oscillate(approach, follows && over ? APPROACH * reach : 0, 1.8, 0.5, dt);
    oscillate(dip, 0, 2.2, 0.45, dt);
    oscillate(shake, 0, 6.5, 0.22, dt);
    oscillate(stack, 0, 1.6, 0.62, dt);
    const parallax = fine && pointer.seen && settled;
    oscillate(layerX, parallax ? nx : 0, 1.1, 0.4, dt);
    oscillate(layerY, parallax ? ny : 0, 1.1, 0.4, dt);
    drift.target = full && settled && !stable && !over ? awake : 0;
    follow(drift, 0.9, dt);
    const float = drift.value;
    const layerFloat = full ? Math.max(awake, booting ? 1 : 0) : 0;

    /* console pose */
    const swing = 1 - easeBack(pose.arrive);
    euler.set(
      tiltX.value + swing * 0.24 + Math.sin(clock * 0.71) * 0.004 * float,
      tiltY.value - swing * 0.52 + Math.sin(clock * 0.53 + 1.3) * 0.005 * float,
      swing * 0.05,
    );
    quat.setFromEuler(euler);
    const cx = hostLeft + W / 2;
    const cy = hostTop + H / 2;
    pivotV.set((pivotX.value - cx) * k - conRest.x, -(pivotY.value - cy) * k - conRest.y, 0);
    turned.copy(pivotV).applyQuaternion(quat);
    con.position.copy(conRest).add(pivotV).sub(turned);
    ray.set(conRest.x + pivotV.x, conRest.y + pivotV.y, -DIST).normalize();
    con.position.addScaledVector(ray, -(approach.value + dip.value) * k);
    con.position.x += shake.value * k;
    con.position.y += Math.sin(clock * 0.9) * 2.2 * float * k;
    con.position.z -= (1 - easeOut(pose.arrive)) * 4.5;
    con.quaternion.copy(quat);

    /* camera: from an oblique angle to frontal */
    const away = 1 - easeInOut(pose.arrive);
    const push = pulse(now - celebrateAt, 0, 380, 1500) * 0.16;
    camera.position.set(-2.6 * away, -1.3 * away, DIST + 6.5 * away - push);
    camera.up.set(Math.sin(away * 0.05), Math.cos(away * 0.05), 0);
    camera.lookAt(0, 0, 0);

    /* frame pieces assemble */
    const p = pose.pieces;
    const seat = easeBack(span(p, 0, 0.42));
    bezel.visible = p > 0;
    bezel.position.z = (1 - seat) * -150;
    bezel.scale.setScalar(1 + (1 - seat) * 0.05);
    front.position.set(layerX.value * 5, -layerY.value * 5, 0);
    for (const [index, b] of brackets.entries()) {
      const end = PIECE_LANDINGS[index];
      const t = span(p, end - 0.4, end);
      const r = easeBack(t);
      const bob = Math.sin(clock * 0.8 + index * 1.9) * 1.5 * layerFloat;
      b.mesh.visible = t > 0;
      b.mesh.position.set(b.rest.x + b.sx * (1 - r) * 170, b.rest.y + b.sy * (1 - r) * 170 + bob, b.rest.z + (1 - r) * 220);
      b.mesh.rotation.z = b.angle + (1 - r) * 0.9 * b.sx * b.sy;
      const landed = p - end;
      b.material.emissiveIntensity = 0.28 + (settled ? 0 : landed >= 0 ? Math.exp(-landed * 14) * 1.1 : t * t * 0.5);
    }
    const plateIn = easeOut(span(p, 0.25, 0.75));
    backPlate.visible = p > 0.25;
    back.position.set(-layerX.value * 10, layerY.value * 10, 0);
    backPlate.position.z = lerp(-520, -70, plateIn);
    for (const [index, sheet] of sheets.entries()) {
      sheet.hidden.target = index < layers ? 0 : 1;
      follow(sheet.hidden, 0.5, dt);
      const s = Math.max(0.35, index + 1 + stack.value);
      const enter = 1 - easeOut(span(p, 0.4 + index * 0.12, 0.9 + index * 0.05));
      const gone = sheet.hidden.value;
      const bob = Math.sin(clock * 0.6 + index * 2.1) * 3 * layerFloat;
      sheet.mesh.visible = p > 0.4 && gone < 0.995;
      sheet.mesh.position.set(slot.x * s * (1 - gone) - layerX.value * (4 + 6 * index), slot.y * s * (1 - gone) + layerY.value * (4 + 6 * index) + bob, slot.z * s - enter * 500 - gone * 260);
      sheet.material.uniforms.uDraw.value = 1 - enter;
      sheet.material.uniforms.uGlow.value = pulse(now - celebrateAt, 200 + index * 120, 450 + index * 120, 1400);
    }

    /* glass, screen and contours */
    glass.visible = pose.glass > 0;
    glass.scale.y = Math.max(0.001, pose.glass);
    screen.visible = pose.scan > 0;
    screenMat.uniforms.uFill.value = pose.scan;
    const surge = pulse(now - celebrateAt, 0, 240, 1300);
    const dim = pulse(now - draftAt, 0, 220, 900);
    screenMat.uniforms.uPulse.value = surge;
    outerMat.uniforms.uDraw.value = pose.trace;
    outerMat.uniforms.uLevel.value = (1 + (1 - p) * 0.5) * (1 - dim * 0.45) + surge * 1.3;
    innerMat.uniforms.uDraw.value = pose.inner;
    innerMat.uniforms.uLevel.value = 0.42 + surge * 0.6 + (1 - pose.scan) * 0.25 * pose.inner;
    alertU.value = pulse(now - errorAt, 0, 120, 900);

    const g = span(now - ghostAt, 0, 560);
    ghost.visible = g > 0 && g < 1 && ghost.geometry !== empty;
    ghost.position.z = 2 + easeOut(g) * 150;
    ghost.scale.setScalar(1 + easeOut(g) * 0.04);
    ghostMat.uniforms.uLevel.value = (1 - g) ** 2 * 0.8;

    const ringSize = Math.max(panelW, panelH) * 0.62;
    for (const [index, ring] of rings.entries()) {
      const rp = span(now - celebrateAt, 60 + index * 220, 1250 + index * 220);
      ring.visible = rp > 0 && rp < 1;
      ring.position.z = 6;
      ring.scale.setScalar((lerp(0.3, 1, easeOut(rp)) * ringSize) / 100);
      ringMats[index].uniforms.uLevel.value = (1 - rp) ** 1.6 * (index ? 0.5 : 0.9);
    }

    /* the system panes: draw in, ignite, drift opposite the pointer */
    for (const { mesh, material, rest, order } of panes) {
      if (!mesh.visible) continue;
      const draw = span(pose.planes, order * 0.07, 0.5 + order * 0.07);
      const depth = -rest.z / 6;
      material.uniforms.uDraw.value = draw;
      material.uniforms.uLive.value = span(pose.planes, 0.4 + order * 0.07, 0.8 + order * 0.07);
      material.uniforms.uGlow.value = pulse(now - celebrateAt, 150 + order * 90, 500 + order * 90, 1600) * 0.9;
      mesh.position.set(
        rest.x - layerX.value * 0.2 * depth + Math.sin(clock * 0.4 + order * 1.7) * 0.05 * layerFloat,
        rest.y + layerY.value * 0.14 * depth + Math.cos(clock * 0.33 + order) * 0.04 * layerFloat,
        rest.z - (1 - easeOut(draw)) * 3,
      );
    }

    /* a light that follows the pointer across the metal and glass; sweeps once while booting */
    const sweep = booting ? pulse(e, 0, 400, bootTotal(introKind)) : 0;
    if (fine && pointer.seen) {
      lightX.target = (pointer.x - cx) * k;
      lightY.target = -(pointer.y - cy) * k;
    }
    lightOn.target = fine && pointer.seen && settled ? 1 : 0;
    follow(lightX, 0.15, dt);
    follow(lightY, 0.15, dt);
    follow(lightOn, 0.4, dt);
    const sweepX = lerp(-W / 2, W / 2, pose.scan) * k;
    cursor.position.set(lerp(lightX.value, sweepX, sweep), lerp(lightY.value, (H / 4) * k, sweep), 2.4);
    cursor.intensity = 7 * Math.max(lightOn.value, sweep);

    renderer.render(scene, camera);
    register();

    // Adaptive resolution: drop a step when frames run long.
    if (moving && dt > 0.026) slowFrames++;
    if (++sampled >= 90) {
      if (slowFrames / sampled > 0.3 && dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        resize();
      }
      slowFrames = 0;
      sampled = 0;
    }
  }

  /** Maps the console's pose onto the page element: CSS px around the canvas centre, y down, camera at z = f. */
  function register() {
    const panel = panelRef.current;
    if (!panel || !panelW) return;
    // Until the activation starts the content keeps its own place.
    if (introKind === "pending") {
      if (lastTransform !== "") panel.style.transform = lastTransform = "";
      return;
    }
    con.updateMatrixWorld();
    camera.updateMatrixWorld();
    M.makeScale(k, -k, k);
    A.multiplyMatrices(con.matrixWorld, M).premultiply(camera.matrixWorldInverse);
    M.makeScale(1 / k, -1 / k, 1 / k);
    A.premultiply(M);
    M.makeTranslation(0, 0, f);
    A.premultiply(M);
    const ax = hostLeft + W / 2 - panelCX;
    const ay = hostTop + H / 2 - panelCY;
    const el = A.elements;
    let worst = 0;
    for (const [ux, uy] of [
      [-panelW / 2, -panelH / 2],
      [panelW / 2, -panelH / 2],
      [panelW / 2, panelH / 2],
      [-panelW / 2, panelH / 2],
    ]) {
      const z = el[2] * ux + el[6] * uy + el[14];
      const scale = f / Math.max(1, f - z);
      worst = Math.max(worst, Math.abs((el[0] * ux + el[4] * uy + el[12]) * scale + ax - ux), Math.abs((el[1] * ux + el[5] * uy + el[13]) * scale + ay - uy));
    }
    // At rest the transform collapses to none, so text stays crisp.
    const transform =
      worst < 0.25 ? "" : `translate(${ax.toFixed(2)}px, ${ay.toFixed(2)}px) perspective(${f.toFixed(2)}px) matrix3d(${Array.from(el, (v) => +v.toFixed(6)).join(",")})`;
    if (transform !== lastTransform) {
      panel.style.transform = transform;
      lastTransform = transform;
    }
  }

  /* ---------------------------------------------------------------- loop & lifecycle */
  let raf = 0;
  let ready = false;
  let visible = true;
  const canRun = () => ready && visible && !document.hidden;
  const loop = (now: number) => {
    raf = 0;
    frame(now);
    if (canRun() && motion !== "off" && now < awakeUntil) raf = requestAnimationFrame(loop);
  };
  /** Runs the loop while awake; with motion off it draws one still frame. */
  const wake = () => {
    if (disposed || !ready || raf || !canRun()) return;
    raf = requestAnimationFrame(loop);
  };
  const poke = (ms = 12000) => {
    awakeUntil = Math.max(awakeUntil, performance.now() + ms);
    wake();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
    movedAt = performance.now();
    poke();
  };
  const onLeave = () => {
    pointer.seen = false;
    poke(4000);
  };
  const onKey = () => {
    typedAt = performance.now();
    poke(4000);
  };
  const onDown = () => {
    pressing = true;
    poke(4000);
  };
  const onUp = () => {
    if (!pressing) return;
    pressing = false;
    releasedAt = performance.now();
  };
  const onScroll = () => {
    scrolledAt = performance.now();
    poke(4000);
  };
  const onFocus = () => poke(4000);
  const onLayout = () => {
    dirty = true;
    wake();
    if (!raf && ready) poke(600);
  };
  const onVisibility = () => wake();
  const onLost = (event: Event) => {
    event.preventDefault();
    cb.fail();
  };
  const panelEl = panelRef.current;
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("mouseleave", onLeave);
  window.addEventListener("keydown", onKey, true);
  panelEl?.addEventListener("pointerdown", onDown);
  panelEl?.addEventListener("scroll", onScroll, { capture: true, passive: true });
  panelEl?.addEventListener("wheel", onScroll, { passive: true });
  panelEl?.addEventListener("focusin", onFocus);
  panelEl?.addEventListener("focusout", onFocus);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("scroll", onLayout, { passive: true });
  document.addEventListener("visibilitychange", onVisibility);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  const sight = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  });
  sight.observe(host);
  const resizes = new ResizeObserver(onLayout);
  for (const el of [host.parentElement, panelEl]) if (el) resizes.observe(el);

  measure();
  renderer
    .compileAsync(scene, camera)
    .then(() => {
      if (disposed) return;
      ready = true;
      lastFrame = performance.now();
      frame(lastFrame);
      cb.ready();
      wake();
    })
    .catch(() => {
      if (!disposed) cb.fail();
    });

  return {
    start(kind: BootKind) {
      introKind = motion === "off" ? "none" : kind;
      introStart = performance.now();
      skipAt = -1;
      poke(bootTotal(introKind) + 1500);
    },
    skip() {
      if (introKind === "pending" || introKind === "none") return;
      const now = performance.now();
      const e = elapsed(now);
      if (skipAt < 0 && e < bootTotal(introKind)) {
        skipFrom = e;
        skipAt = now;
        poke(1500);
      }
    },
    signal(signal: ConsoleSignal) {
      const now = performance.now();
      if (signal === "forward" || signal === "page") {
        ghostAt = now;
        stack.value += 1;
        dip.value = signal === "page" ? -18 : -26;
      } else if (signal === "back") {
        stack.value -= 1;
        dip.value = 22;
      } else if (signal === "publish") celebrateAt = now;
      else if (signal === "draft") {
        draftAt = now;
        stack.value -= 1;
      } else if (signal === "error") {
        errorAt = now;
        shake.velocity += 260;
      }
      poke(2600);
    },
    setLayers(next: number) {
      layers = next;
      poke(1500);
    },
    setMotion(next: MotionLevel) {
      motion = next;
      if (motion === "off" && introKind !== "pending") introKind = "none";
      poke(1500);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      sight.disconnect();
      resizes.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("keydown", onKey, true);
      panelEl?.removeEventListener("pointerdown", onDown);
      panelEl?.removeEventListener("scroll", onScroll, { capture: true });
      panelEl?.removeEventListener("wheel", onScroll);
      panelEl?.removeEventListener("focusin", onFocus);
      panelEl?.removeEventListener("focusout", onFocus);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("scroll", onLayout);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      if (panelEl) panelEl.style.transform = "";
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          geometries.add(object.geometry);
          for (const material of [object.material].flat() as Material[]) materials.add(material);
        }
      });
      geometries.add(empty);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const item of owned) item.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

type Engine = ReturnType<typeof createAdminEngine>;

type Props = {
  panel: RefObject<HTMLElement | null>;
  motion: MotionLevel;
  layers: RefObject<number>;
  ref?: Ref<AdminSceneHandle>;
  onReady: () => void;
  onFail: () => void;
};

export default function AdminScene({ panel, motion, layers, ref, onReady, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ready = useEffectEvent(() => onReady());
  const fail = useEffectEvent(() => onFail());
  const initial = useEffectEvent((): Init => ({ motion, layers: layers.current }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: Engine;
    try {
      engine = createAdminEngine(host, panel, initial(), { ready: () => ready(), fail: () => fail() });
    } catch {
      // No WebGL context: the drawn console stays.
      fail();
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [panel]);

  useEffect(() => engineRef.current?.setMotion(motion), [motion]);
  useImperativeHandle(
    ref,
    () => ({
      start: (kind) => engineRef.current?.start(kind),
      skip: () => engineRef.current?.skip(),
      signal: (signal) => engineRef.current?.signal(signal),
      setLayers: (count) => engineRef.current?.setLayers(count),
    }),
    [],
  );

  return <div ref={hostRef} aria-hidden="true" className="ax-scene" />;
}
