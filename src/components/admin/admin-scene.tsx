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
  LineSegments,
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
  Points,
  Quaternion,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
  type Texture,
} from "three";
import { follow, spring, studioEnvironment, type Spring } from "@/components/showcase/three-kit";
import { bracket, clamp01, easeBack, easeInOut, easeOut, lerp, span, TAU } from "@/components/vault/vault-forge";
import type { MotionLevel } from "@/lib/preferences";
import { BOOT, PIECE_LANDINGS, type BootKind } from "./admin-timing";

/**
 * The System window, summoned into the dark of the vault: a chamfered amber contour around a
 * smoked-glass slab in a metal rim, corner brackets in front, an engraved mechanism and a lit back
 * plate behind, step sheets stacked further back, and curved system panes, rain and dust drifting
 * in the void. On wide screens a side window and reward satellites hang beside it.
 *
 * Every page surface (the window, the side window, each satellite) is mapped onto its 3D object
 * every frame, so the real controls sit exactly on it; at rest the window's mapping collapses to no
 * transform and its text stays crisp.
 *
 * The window tilts strongly toward the pointer around the point under it (so controls never slide
 * away), with light and reflections following the tilt. It freezes while pressing, settles flat while
 * typing, scrolling, in dialogs or once the pointer rests, then resumes. Rendering stops when idle,
 * hidden or off screen.
 */

export type ConsoleSignal = "forward" | "back" | "page" | "pending" | "settle" | "publish" | "draft" | "error";
export type AdminSceneHandle = {
  start: (kind: BootKind) => void;
  skip: () => void;
  signal: (signal: ConsoleSignal) => void;
  setLayers: (count: number) => void;
  setStep: (step: number) => void;
  setRewards: (count: number) => void;
};
export type SceneState = { layers: number; step: number; rewards: number };

const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360);
const DIST = 14;
const TILT_Y = 0.2;
const TILT_X = 0.14;
/** How far (CSS px) the window comes forward while the pointer is over it. */
const APPROACH = 18;
const SHEETS = 3;
const STEPS = 5;
const MAX_PIPS = 12;
const SIDE_TURN = 0.26;
const SIDE_Z = 30;
const SAT_TURN = -0.34;
const SAT_Z = 40;
const RAIN = { full: 420, compact: 160 };
const DUST = { full: 500, compact: 200 };

const AMBER = new Color(0xffa63d);
const GOLD = new Color(0xffd9a0);
const CORE = new Color(0xfff1d6);
const COLD = new Color(0x8fa7c8);
const INDIGO = new Color(0x1d1838);
const ALERT = new Color(0xff4d5e);

/** System panes in the void: position as fractions of the view at their depth, size in world units. */
type Pane = { x: number; y: number; z: number; w: number; h: number; word: string; rows: number; compact?: boolean };
const PANES: Pane[] = [
  { x: -0.82, y: 0.56, z: -6, w: 3.2, h: 1.9, word: "Status", rows: 4, compact: true },
  { x: -0.9, y: -0.32, z: -4.2, w: 2.4, h: 2.9, word: "Ledger", rows: 6 },
  { x: 0.9, y: 0.6, z: -7.5, w: 3.3, h: 1.5, word: "Signal", rows: 2, compact: true },
  { x: 0.88, y: -0.3, z: -5, w: 2.6, h: 2.5, word: "Access", rows: 5 },
  { x: -0.34, y: 0.92, z: -11, w: 4.4, h: 1.4, word: "Archive", rows: 2 },
  { x: 0.42, y: -0.92, z: -10, w: 3.8, h: 1.3, word: "Seal", rows: 2 },
];

/* ----------------------------------------------------------------------------
 * Shaders
 * ------------------------------------------------------------------------- */

const SDF = /* glsl */ `
float box(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float cut(vec2 p, vec2 b, float c) {
  vec2 q = abs(p) - b;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return max(d, (abs(p.x) + abs(p.y) - b.x - b.y + c) * 0.70710678);
}`;

const VOID_VERTEX = /* glsl */ `
varying vec2 vScreen;
void main() {
  vScreen = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

/** The void, in screen space so it reads as infinitely far: indigo haze, warm wisps and a shaft of light behind the window. */
const VOID_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uAspect;
uniform vec2 uShift;
uniform vec2 uCentre;
uniform float uBeam;
varying vec2 vScreen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return v;
}
void main() {
  vec2 uv = vec2((vScreen.x - 0.5) * uAspect, vScreen.y - 0.5);
  vec2 p = uv + uShift;
  vec3 col = mix(vec3(0.0011, 0.0012, 0.0024), vec3(0.0024, 0.0022, 0.0062), smoothstep(-0.6, 0.6, uv.y));
  float haze = fbm(p * 1.7 + vec2(uTime * 0.012, -uTime * 0.008));
  col += vec3(0.005, 0.0035, 0.013) * haze * haze * 2.0;
  float wisp = fbm(p * vec2(1.1, 3.6) + vec2(-uTime * 0.018, uTime * 0.006) + 4.0);
  col += vec3(0.03, 0.012, 0.0025) * pow(wisp, 3.0) * smoothstep(0.75, 0.0, abs(uv.y + 0.1));
  vec2 c = uv - uCentre;
  col += vec3(0.034, 0.016, 0.004) * exp(-c.x * c.x * 5.0 - c.y * c.y * 3.0) * uBeam;
  col += vec3(0.022, 0.012, 0.004) * exp(-c.x * c.x * 26.0) * smoothstep(-0.2, 0.7, uv.y) * uBeam;
  col *= 1.0 - smoothstep(0.35, 1.1, length(uv * vec2(0.8, 1.1)));
  gl_FragColor = vec4(col * uLevel, 1.0);
  #include <colorspace_fragment>
}`;

const UV_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** A system pane: dark smoked glass with a traced amber border and optional painted contents (premultiplied). */
const PANE_FRAGMENT = /* glsl */ `
${SDF}
uniform sampler2D uMap;
uniform vec4 uRect;
uniform float uHasMap;
uniform vec2 uSize;
uniform float uRadius;
uniform float uLine;
uniform float uDraw;
uniform float uLive;
uniform float uGlow;
uniform float uFade;
uniform float uBody;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = box(p, uSize * 0.5 - uLine * 3.0, uRadius);
  float aa = fwidth(d);
  float around = fract(atan(p.x, p.y) / 6.2831853 + 0.125);
  float drawn = step(around, uDraw);
  float lit = smoothstep(0.0, 0.35, uDraw);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float line = (1.0 - smoothstep(uLine * 0.5, uLine * 0.5 + aa, abs(d))) * drawn;
  float halo = exp(-abs(d) / (uLine * 1.5)) * 0.35 * drawn;
  float text = uHasMap > 0.5 ? texture2D(uMap, uRect.xy + vUv * uRect.zw).a * uLive * inside : 0.0;
  float body = inside * lit;
  vec3 light = uTint * ((line * 1.1 + halo) * (1.0 + uGlow) + text * 0.5 + body * (0.01 + 0.02 * vUv.y + uGlow * 0.05));
  float alpha = body * uBody;
  gl_FragColor = vec4((vec3(0.002, 0.002, 0.004) * alpha + light) * uFade, alpha * uFade);
  #include <colorspace_fragment>
}`;

/** The dark layer right behind the page content: keeps text legible, activates with a scan, carries the step wipe, the charge and a moving sheen. */
const SCREEN_FRAGMENT = /* glsl */ `
${SDF}
uniform vec2 uSize;
uniform float uCut;
uniform float uFill;
uniform float uHead;
uniform float uPulse;
uniform float uAlpha;
uniform float uCharge;
uniform float uAlert;
uniform vec3 uTint;
uniform vec3 uAlertColor;
uniform vec3 uSheen;
uniform float uWipe;
uniform float uWipeDir;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = cut(p, uSize * 0.5, uCut);
  float aa = fwidth(d);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float y = 1.0 - vUv.y;
  float filled = 1.0 - smoothstep(uFill - 0.004, uFill, y);
  float py = y * uSize.y;
  float band = uHead > 0.0 ? 1.0 - smoothstep(uHead - 1.0, uHead + 1.0, py) : 0.0;
  float rule = uHead > 0.0 ? exp(-abs(py - uHead) * 1.2) : 0.0;
  vec3 tint = mix(uTint, uAlertColor, uAlert);
  float lines = 0.5 + 0.5 * sin(py * 1.5708);
  vec3 col = vec3(0.004, 0.0035, 0.006) + tint * (band * 0.022 + 0.008 * (1.0 - y) + exp(d / 22.0) * 0.045 + uPulse * 0.07 + lines * 0.004);
  col += tint * uCharge * (0.02 + 0.016 * sin(uTime * 4.0 - y * 9.0));
  float alpha = uAlpha + band * 0.06;
  float scan = uFill > 0.0 && uFill < 1.0 ? exp(-abs(y - uFill) * uSize.y / 5.0) : 0.0;
  col += tint * (scan * 0.9 + rule * 0.3);
  float s = dot(vUv - 0.5 - uSheen.xy, vec2(0.6, 0.8));
  col += vec3(1.0, 0.84, 0.62) * exp(-s * s * 50.0) * uSheen.z * 0.045;
  float w = uWipeDir > 0.0 ? vUv.x : 1.0 - vUv.x;
  float wipe = uWipe > 0.0 && uWipe < 1.0 ? exp(-abs(w - uWipe) * uSize.x / 10.0) * (1.0 - uWipe * 0.6) : 0.0;
  col += tint * wipe * 0.7;
  alpha = min(1.0, alpha + scan * 0.35 + wipe * 0.12 + uAlert * 0.08);
  gl_FragColor = vec4(col, alpha * inside * filled);
  #include <colorspace_fragment>
}`;

/** Light lines: a bright core with a soft glow, traced along `aT` up to `uDraw`, brighter on the side facing the light. */
const RIBBON_VERTEX = /* glsl */ `
attribute float aT;
attribute float aSide;
attribute vec2 aNormal;
uniform vec2 uLight;
varying float vT;
varying float vSide;
varying float vLit;
void main() {
  vT = aT;
  vSide = aSide;
  vLit = dot(aNormal, uLight);
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
uniform float uDash;
uniform float uShine;
varying float vT;
varying float vSide;
varying float vLit;
void main() {
  float t = fract(vT * uHeads);
  if (t > uDraw || uLevel <= 0.0) discard;
  if (uDash > 0.0 && fract(vT * uDash) > 0.4) discard;
  float x = abs(vSide);
  float core = 1.0 - smoothstep(uCore * 0.5, uCore, x);
  float glow = exp(-x * x * 9.0) * 0.32 * (1.0 - core);
  float head = uDraw < 1.0 ? exp(-(uDraw - t) * 40.0 * uHeads) * 1.4 : 0.0;
  float shine = 1.0 + uShine * clamp(vLit, -0.6, 1.0);
  float a = (core + glow) * uLevel * (1.0 + head) * shine;
  gl_FragColor = vec4(mix(uColor, uAlertColor, uAlert) * a, 1.0);
  #include <colorspace_fragment>
}`;

/** Cold rain streaking down through the void, generated in the shader. */
const RAIN_VERTEX = /* glsl */ `
attribute vec4 aSeed;
attribute float aEnd;
uniform float uTime;
uniform float uAspect;
varying float vA;
void main() {
  float depth = ${DIST.toFixed(1)} - aSeed.z;
  float hh = depth * ${TAN.toFixed(5)} * 1.1;
  float range = hh * 2.0;
  float y = hh - mod(aSeed.y * range + uTime * aSeed.w, range);
  float len = depth * 0.04;
  vec3 p = vec3((aSeed.x - 0.5) * 2.0 * hh * uAspect + (y + aEnd * len) * 0.06, y + aEnd * len, aSeed.z);
  vA = (1.0 - aEnd) * (0.45 + 0.55 * fract(aSeed.x * 31.7)) * mix(1.0, 0.35, clamp((depth - 17.0) / 23.0, 0.0, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const GLOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying float vA;
void main() {
  gl_FragColor = vec4(uColor * vA * uLevel, 1.0);
  #include <colorspace_fragment>
}`;

/** Dust motes drifting upward; during the summoning they gather into the seam. */
const DUST_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uAspect;
uniform float uGather;
uniform vec3 uSeam;
uniform float uSeamW;
uniform float uSize;
varying float vA;
void main() {
  float depth = ${DIST.toFixed(1)} - aSeed.z;
  float hh = depth * ${TAN.toFixed(5)} * 1.1;
  vec3 p = vec3((aSeed.x - 0.5) * 2.0 * hh * uAspect, (fract(aSeed.y + uTime * (0.004 + aSeed.w * 0.006)) - 0.5) * 2.0 * hh, aSeed.z);
  p.x += sin(uTime * 0.13 + aSeed.w * 6.283) * 0.3;
  vec3 seam = uSeam + vec3((aSeed.x - 0.5) * 2.0 * uSeamW, (aSeed.y - 0.5) * 0.06, (aSeed.w - 0.5) * 0.4);
  float g = clamp(uGather * (0.55 + 0.45 * aSeed.w) * 1.25, 0.0, 1.0);
  p = mix(p, seam, g * g * (3.0 - 2.0 * g));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aSeed.w) * clamp(12.0 / -mv.z, 0.25, 2.0) * (1.0 + g);
  vA = (0.25 + 0.75 * fract(aSeed.w * 13.0)) * clamp(1.4 - depth / 40.0, 0.2, 1.0) * (1.0 + g * 2.0);
  gl_Position = projectionMatrix * mv;
}`;

const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 18.0) * vA * uLevel;
  gl_FragColor = vec4(uColor * a, 1.0);
  #include <colorspace_fragment>
}`;

/** A tether between a satellite and the window, with pulses running along it. */
const TETHER_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
uniform float uPhase;
varying vec2 vUv;
void main() {
  float x = abs(vUv.y - 0.5) * 2.0;
  float core = exp(-x * x * 8.0);
  float q = fract(vUv.x - uPhase);
  float travel = exp(-(q - 0.5) * (q - 0.5) * 40.0);
  float ends = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
  gl_FragColor = vec4(uColor * core * uLevel * (0.3 + travel * 1.2) * ends, 1.0);
  #include <colorspace_fragment>
}`;

/* ----------------------------------------------------------------------------
 * Geometry (window parts are built in CSS px; the window group scales them)
 * ------------------------------------------------------------------------- */

/** A rectangle with 45° cut corners. */
function chamfer<T extends Path>(path: T, hw: number, hh: number, c: number): T {
  path.moveTo(-hw + c, -hh);
  path.lineTo(hw - c, -hh);
  path.lineTo(hw, -hh + c);
  path.lineTo(hw, hh - c);
  path.lineTo(hw - c, hh);
  path.lineTo(-hw + c, hh);
  path.lineTo(-hw, hh - c);
  path.lineTo(-hw, -hh + c);
  path.closePath();
  return path;
}

/** Points around a chamfered rectangle, clockwise from the top-left; each corner split so the strip keeps its width. */
function chamferLoop(hw: number, hh: number, c: number): [number, number][] {
  const corners: [number, number][] = [
    [-hw + c, hh],
    [hw - c, hh],
    [hw, hh - c],
    [hw, -hh + c],
    [hw - c, -hh],
    [-hw + c, -hh],
    [-hw, -hh + c],
    [-hw, hh - c],
  ];
  const n = corners.length;
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = corners[i];
    const [ax, ay] = corners[(i - 1 + n) % n];
    const [bx, by] = corners[(i + 1) % n];
    const a = Math.hypot(x - ax, y - ay) || 1;
    const b = Math.hypot(bx - x, by - y) || 1;
    points.push([x - ((x - ax) / a) * 0.6, y - ((y - ay) / a) * 0.6], [x + ((bx - x) / b) * 0.6, y + ((by - y) / b) * 0.6]);
  }
  return points;
}

function circle(r: number, segments: number): [number, number][] {
  return Array.from({ length: segments }, (_, i) => {
    const a = Math.PI / 2 - (i / segments) * TAU;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });
}

/** A flat closed strip `width` wide along clockwise points: position along the loop, across the strip, and the outward normal. */
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
  const normal: number[] = [];
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
      normal.push(-nx, -ny);
    }
    if (i < count - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("aT", new Float32BufferAttribute(along, 1));
  geometry.setAttribute("aSide", new Float32BufferAttribute(side, 1));
  geometry.setAttribute("aNormal", new Float32BufferAttribute(normal, 2));
  geometry.setIndex(index);
  return geometry;
}

/** The seam of light the window opens from: drawn outward from the centre (`aT` = distance from it). */
function seamBar() {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([-1, -0.5, 0, 0, -0.5, 0, 1, -0.5, 0, -1, 0.5, 0, 0, 0.5, 0, 1, 0.5, 0], 3));
  geometry.setAttribute("aT", new Float32BufferAttribute([1, 0, 1, 1, 0, 1], 1));
  geometry.setAttribute("aSide", new Float32BufferAttribute([-1, -1, -1, 1, 1, 1], 1));
  geometry.setAttribute("aNormal", new Float32BufferAttribute(new Array(12).fill(0), 2));
  geometry.setIndex([0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4]);
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

const noise = (n: number) => {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
};

/** Seeds for particles drawn entirely in the shader; `ends` vertices per particle. */
function seeds(count: number, ends: number, depth: [number, number], speed: [number, number]) {
  const position = new Float32Array(count * ends * 3);
  const seed: number[] = [];
  const end: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = [noise(i * 1.31 + 1), noise(i * 2.17 + 7), lerp(depth[0], depth[1], noise(i * 3.71 + 3)), lerp(speed[0], speed[1], noise(i * 5.3 + 11))];
    for (let e = 0; e < ends; e++) {
      seed.push(...s);
      end.push(e);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("aSeed", new Float32BufferAttribute(seed, 4));
  geometry.setAttribute("aEnd", new Float32BufferAttribute(end, 1));
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

/** A faint amber grid for the back plate, lit from inside. */
function paintGrid() {
  const { element, ctx } = canvas(128, 128);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "rgb(255,160,70)";
  ctx.globalAlpha = 0.4;
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
  return { x: (index % 2) * CELL.w, y: Math.floor(index / 2) * CELL.h, w, h };
}

/** Pane contents: a heading with a rule, a close mark and ruled rows (abstract, no data). */
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
    ctx.letterSpacing = `${(size * 0.1).toFixed(1)}px`;
    ctx.fillText(pane.word.toUpperCase(), x + pad, y + pad + size * 0.85);
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x + pad, y + pad + size * 1.2, w - pad * 2, 2);
    const mark = size * 0.62;
    const mx = x + w - pad - mark;
    const my = y + pad + size * 0.1;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + mark, my + mark);
    ctx.moveTo(mx + mark, my);
    ctx.lineTo(mx, my + mark);
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
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Rises to 1 by `peak` and falls back to 0 by `end` (ms). */
const pulse = (t: number, start: number, peak: number, end: number) =>
  t < start || t > end ? 0 : t < peak ? easeOut((t - start) / (peak - start)) : 1 - easeInOut((t - peak) / (end - peak));

type Pose = { seam: number; open: number; arrive: number; pieces: number; glass: number; scan: number; unfold: number; planes: number; gather: number; level: number };
const SETTLED: Pose = { seam: 1, open: 1, arrive: 1, pieces: 1, glass: 1, scan: 1, unfold: 1, planes: 1, gather: 0, level: 1 };
const DARK: Pose = { seam: 0, open: 0, arrive: 0, pieces: 0, glass: 0, scan: 0, unfold: 0, planes: 0, gather: 0, level: 0.35 };
const bootTotal = (kind: BootKind | "pending") => (kind === "none" || kind === "pending" ? 0 : BOOT[kind].total);

function bootPose(kind: BootKind | "pending", e: number): Pose {
  if (kind === "none") return SETTLED;
  if (kind === "pending") return DARK;
  const t = BOOT[kind];
  const late = kind === "late";
  return {
    seam: span(e, ...t.seam),
    open: span(e, ...t.open),
    arrive: span(e, ...t.arrive),
    pieces: span(e, ...t.pieces),
    glass: easeOut(span(e, ...t.glass)),
    scan: span(e, ...t.scan),
    unfold: span(e, ...t.unfold),
    planes: span(e, ...t.planes),
    gather: late ? 0 : easeInOut(span(e, 0, t.seam[1])) * (1 - easeOut(span(e, t.open[0], t.open[1] + 300))),
    level: late ? 1 : 0.35 + 0.65 * easeOut(span(e, t.open[0], t.arrive[1])),
  };
}

type Box = { x: number; y: number; w: number; h: number };

/** Layout position relative to the stage (offsets, since the elements themselves carry transforms). */
function layoutBox(el: HTMLElement, stage: HTMLElement, s: DOMRect): Box {
  let x = el.offsetLeft;
  let y = el.offsetTop;
  const parent = el.offsetParent as HTMLElement | null;
  if (parent && parent !== stage) {
    const p = parent.getBoundingClientRect();
    x += p.left + parent.clientLeft - s.left;
    y += p.top + parent.clientTop - s.top;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/* ----------------------------------------------------------------------------
 * Engine
 * ------------------------------------------------------------------------- */

type Refs = { panel: RefObject<HTMLElement | null>; side: RefObject<HTMLElement | null>; sats: RefObject<HTMLElement | null> };
type Init = SceneState & { motion: MotionLevel };

type Sat = {
  key: string;
  el: HTMLElement | null;
  g: Group;
  plate: Mesh;
  plateMat: ShaderMaterial;
  tether: Mesh;
  tetherMat: ShaderMaterial;
  box: Box;
  order: number;
  born: number;
  gone: number;
  seal: number;
  phase: number;
  transform: string;
  opacity: string;
};

function createAdminEngine(host: HTMLDivElement, refs: Refs, init: Init, cb: { ready: () => void; fail: () => void }) {
  const fineQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  let compact = window.innerWidth < 768;
  const maxDpr = () => Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
  let dpr = maxDpr();

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x030407, 1);
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 140);
  camera.position.set(0, 0, DIST);
  const owned: Texture[] = [];
  const env = studioEnvironment(renderer, AMBER, INDIGO, true, 0.55);
  owned.push(env);
  scene.environment = env;

  scene.add(new AmbientLight(0x1d1a2c, 0.5));
  const key = new DirectionalLight(0xfff0dc, 1.5);
  key.position.set(-5, 7, 9);
  const rim = new DirectionalLight(0xffa64a, 1.3);
  rim.position.set(7, -3, -5);
  const cursor = new PointLight(0xffc27a, 0, 0, 1.6);
  cursor.position.set(0, 0, 2.4);
  scene.add(key, rim, cursor);

  /* ---------------------------------------------------------------- the void */
  const clockU = { value: 0 };
  const voidU = { uTime: clockU, uLevel: { value: 0.35 }, uAspect: { value: 1 }, uShift: { value: [0, 0] }, uCentre: { value: [0, 0] }, uBeam: { value: 0 } };
  const backdropGeo = new BufferGeometry();
  backdropGeo.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const backdrop = new Mesh(backdropGeo, new ShaderMaterial({ uniforms: voidU, vertexShader: VOID_VERTEX, fragmentShader: VOID_FRAGMENT, depthWrite: false, depthTest: false }));
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  const world = new Group();
  scene.add(world);

  const glowMaterial = (vertexShader: string, fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
    new ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, blending: AdditiveBlending, depthWrite: false });

  const rainMat = glowMaterial(RAIN_VERTEX, GLOW_FRAGMENT, { uTime: clockU, uAspect: voidU.uAspect, uColor: { value: COLD.clone() }, uLevel: { value: 0 } });
  const rain = new LineSegments(seeds(RAIN.full, 2, [-30, -3], [5, 10]), rainMat);
  rain.frustumCulled = false;
  world.add(rain);

  const dustU = { uTime: clockU, uAspect: voidU.uAspect, uGather: { value: 0 }, uSeam: { value: new Vector3() }, uSeamW: { value: 3 }, uSize: { value: 2 }, uColor: { value: COLD.clone() }, uLevel: { value: 0.5 } };
  const dust = new Points(seeds(DUST.full, 1, [-36, 4], [0, 1]), glowMaterial(DUST_VERTEX, DUST_FRAGMENT, dustU));
  dust.frustumCulled = false;
  world.add(dust);

  /* The distant sigil: concentric rings slowly turning far behind the window. */
  const sigil = new Group();
  sigil.position.set(0, 0.6, -46);
  world.add(sigil);

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

  const paneMaterial = (line: number, radius: number, map: { x: number; y: number; w: number; h: number } | null, body = 0.55) =>
    new ShaderMaterial({
      uniforms: {
        uMap: { value: atlas },
        uRect: { value: map ? [map.x / ATLAS, 1 - (map.y + map.h) / ATLAS, map.w / ATLAS, map.h / ATLAS] : [0, 0, 1, 1] },
        uHasMap: { value: map ? 1 : 0 },
        uSize: { value: [1, 1] },
        uRadius: { value: radius },
        uLine: { value: line },
        uDraw: { value: 0 },
        uLive: { value: 0 },
        uGlow: { value: 0 },
        uFade: { value: 1 },
        uBody: { value: body },
        uTint: { value: GOLD.clone().lerp(AMBER, 0.55) },
      },
      vertexShader: UV_VERTEX,
      fragmentShader: PANE_FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    });

  const panes = PANES.map((pane, index) => {
    const material = paneMaterial(0.012, 0.05, atlasRect(index, pane));
    material.uniforms.uSize.value = [pane.w, pane.h];
    const mesh = new Mesh(curved(pane.w, pane.h, pane.w * 0.08), material);
    world.add(mesh);
    return { pane, mesh, material, rest: new Vector3(), order: index, on: true, room: spring(1) };
  });

  /* ---------------------------------------------------------------- the window */
  const con = new Group();
  const px = new Group();
  con.add(px);
  scene.add(con);

  const alertU = { value: 0 };
  const lightU = { value: [0, 0] };
  type RibbonOptions = { heads?: number; dash?: number; shine?: number; alert?: boolean };
  const ribbonMaterial = (color: Color, core: number, level: number, o: RibbonOptions = {}) =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uAlertColor: { value: ALERT },
        uAlert: o.alert === false ? { value: 0 } : alertU,
        uLevel: { value: level },
        uDraw: { value: 1 },
        uCore: { value: core },
        uHeads: { value: o.heads ?? 1 },
        uDash: { value: o.dash ?? 0 },
        uShine: { value: o.shine ?? 0 },
        uLight: o.shine ? lightU : { value: [0, 0] },
      },
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });

  const screenMaterial = (alpha: number) =>
    new ShaderMaterial({
      uniforms: {
        uSize: { value: [1, 1] },
        uCut: { value: 10 },
        uFill: { value: 0 },
        uHead: { value: 0 },
        uPulse: { value: 0 },
        uAlpha: { value: alpha },
        uCharge: { value: 0 },
        uAlert: alertU,
        uTint: { value: AMBER.clone() },
        uAlertColor: { value: ALERT },
        uSheen: { value: [0, 0, 0] },
        uWipe: { value: 0 },
        uWipeDir: { value: 1 },
        uTime: clockU,
      },
      vertexShader: UV_VERTEX,
      fragmentShader: SCREEN_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });

  const sigilMats = [
    ribbonMaterial(AMBER, 0.3, 0.1, { alert: false }),
    ribbonMaterial(GOLD, 0.4, 0.12, { dash: 180, alert: false }),
    ribbonMaterial(AMBER, 0.3, 0.06, { alert: false }),
  ];
  const sigilRings = [ribbon(circle(14, 160), 0.06), ribbon(circle(12.6, 160), 0.45), ribbon(circle(19, 180), 0.05)].map((geometry, index) => {
    const mesh = new Mesh(geometry, sigilMats[index]);
    sigil.add(mesh);
    return mesh;
  });

  const rimMat = new MeshStandardMaterial({ color: 0x100d12, metalness: 0.92, roughness: 0.24, envMapIntensity: 1.25 });
  const glassMat = new MeshPhysicalMaterial({
    color: 0x17131d,
    metalness: 0,
    roughness: 0.12,
    transparent: true,
    opacity: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.1,
    depthWrite: false,
  });
  const grid = paintGrid();
  owned.push(grid);
  const backMat = new MeshStandardMaterial({ color: 0x08070b, metalness: 0.55, roughness: 0.5, emissive: 0xffffff, emissiveMap: grid, emissiveIntensity: 0.32 });
  const screenMat = screenMaterial(0.74);
  const outerMat = ribbonMaterial(AMBER, 0.13, 1, { heads: 2, shine: 0.85 });
  const innerMat = ribbonMaterial(GOLD, 0.16, 0.34, { shine: 0.6 });
  const seamMat = ribbonMaterial(CORE, 0.2, 0);
  const ghostMat = ribbonMaterial(GOLD, 0.12, 0);
  const ringMats = [ribbonMaterial(GOLD, 0.2, 0), ribbonMaterial(AMBER, 0.24, 0, { dash: 90 })];
  const engraveMats = {
    ring: ribbonMaterial(AMBER, 0.3, 0.4, { shine: 0.4 }),
    ticks: ribbonMaterial(AMBER, 0.5, 0.32, { dash: 240 }),
    halo: ribbonMaterial(GOLD, 0.3, 0.16),
    marker: ribbonMaterial(CORE, 0.3, 0.7),
  };
  const notchMats = Array.from({ length: STEPS }, () => ribbonMaterial(GOLD, 0.3, 0.2));
  const pipMat = ribbonMaterial(GOLD, 0.34, 0.9);

  const empty = new BufferGeometry();
  const ringGeo = ribbon(circle(100, 120), 1.2);
  const notchGeo = ribbon(circle(8, 4), 3);
  const markerGeo = ribbon(circle(9, 3), 2.4);
  const pipGeo = ribbon(circle(5.5, 4), 2.6);
  const shared = new Set<BufferGeometry>([empty, ringGeo, notchGeo, markerGeo, pipGeo]);
  const replace = (mesh: Mesh, geometry: BufferGeometry) => {
    if (!shared.has(mesh.geometry) && mesh.geometry !== geometry) mesh.geometry.dispose();
    mesh.geometry = geometry;
  };

  const frame3 = new Group();
  const rimMesh = new Mesh(empty, rimMat);
  const glass = new Mesh(empty, glassMat);
  const outer = new Mesh(empty, outerMat);
  const inner = new Mesh(empty, innerMat);
  outer.position.z = 3;
  inner.position.z = 0.6;
  frame3.add(rimMesh, glass, outer, inner);
  const screen = new Mesh(new PlaneGeometry(1, 1), screenMat);
  screen.position.z = -1;
  const ghost = new Mesh(empty, ghostMat);
  const seam = new Mesh(seamBar(), seamMat);
  seam.position.z = 3;
  const rings = ringMats.map((material) => new Mesh(ringGeo, material));
  const engrave = new Group();
  const ringMesh = new Mesh(empty, engraveMats.ring);
  const tickMesh = new Mesh(empty, engraveMats.ticks);
  const haloMesh = new Mesh(empty, engraveMats.halo);
  const notches = notchMats.map((material) => new Mesh(notchGeo, material));
  engrave.add(ringMesh, tickMesh, haloMesh, ...notches);
  const marker = new Mesh(markerGeo, engraveMats.marker);
  marker.rotation.z = Math.PI;
  const front = new Group();
  const back = new Group();
  const backPlate = new Mesh(empty, backMat);
  back.add(backPlate);
  const pips = Array.from({ length: MAX_PIPS }, () => {
    const mesh = new Mesh(pipGeo, pipMat);
    mesh.visible = false;
    return { mesh, shown: spring(0) };
  });
  px.add(back, engrave, marker, frame3, screen, front, ghost, seam, ...rings, ...pips.map((p) => p.mesh));

  const brackets = [0, 1, 2, 3].map((index) => {
    const material = new MeshStandardMaterial({ color: 0x15100c, metalness: 0.85, roughness: 0.3, emissive: AMBER, emissiveIntensity: 0.3 });
    const mesh = new Mesh(empty, material);
    front.add(mesh);
    // Top-right, top-left, bottom-left, bottom-right.
    const sx = index === 0 || index === 3 ? 1 : -1;
    const sy = index < 2 ? 1 : -1;
    return { mesh, material, sx, sy, angle: [0, Math.PI / 2, Math.PI, -Math.PI / 2][index], rest: new Vector3() };
  });
  const sheets = Array.from({ length: SHEETS }, (_, index) => {
    const material = paneMaterial(1.2, 10, null, 0.4);
    const mesh = new Mesh(new PlaneGeometry(1, 1), material);
    back.add(mesh);
    return { mesh, material, hidden: spring(index < init.layers ? 0 : 1) };
  });

  /* The side window. */
  const sideG = new Group();
  const sideScreenMat = screenMaterial(0.7);
  const sideScreen = new Mesh(new PlaneGeometry(1, 1), sideScreenMat);
  sideScreen.position.z = -1;
  const sideOuterMat = ribbonMaterial(AMBER, 0.14, 0.9, { heads: 2, shine: 0.7 });
  const sideOuter = new Mesh(empty, sideOuterMat);
  sideOuter.position.z = 1;
  const sideInnerMat = ribbonMaterial(GOLD, 0.2, 0.25, { shine: 0.5 });
  const sideInner = new Mesh(empty, sideInnerMat);
  const sideSlab = new Mesh(empty, rimMat);
  sideG.add(sideSlab, sideScreen, sideOuter, sideInner);
  sideG.visible = false;
  px.add(sideG);

  /* Reward satellites. */
  const sats = new Map<string, Sat>();
  const satPlane = new PlaneGeometry(1, 1);
  const tetherGeo = new PlaneGeometry(1, 1);
  tetherGeo.translate(0.5, 0, 0);
  shared.add(satPlane).add(tetherGeo);
  const X_AXIS = new Vector3(1, 0, 0);

  function makeSat(key: string, born: number, order: number): Sat {
    const g = new Group();
    const plateMat = paneMaterial(1.4, 7, null, 0.5);
    const plate = new Mesh(satPlane, plateMat);
    plate.position.z = -2;
    g.add(plate);
    const tetherMat = glowMaterial(UV_VERTEX, TETHER_FRAGMENT, { uColor: { value: AMBER.clone() }, uLevel: { value: 0 }, uPhase: { value: 0 } });
    const tether = new Mesh(tetherGeo, tetherMat);
    g.visible = tether.visible = false;
    px.add(g, tether);
    return { key, el: null, g, plate, plateMat, tether, tetherMat, box: { x: 0, y: 0, w: 0, h: 0 }, order, born, gone: -1, seal: -1, phase: noise(born) * TAU, transform: "\u0000", opacity: "\u0000" };
  }
  function dropSat(sat: Sat) {
    px.remove(sat.g, sat.tether);
    sat.plateMat.dispose();
    sat.tetherMat.dispose();
    if (sat.el) {
      sat.el.style.transform = "";
      sat.el.style.opacity = "";
    }
    sats.delete(sat.key);
  }

  /* ---------------------------------------------------------------- layout */
  let W = 0;
  let H = 0;
  let f = 1;
  let k = 1;
  let hostLeft = 0;
  let hostTop = 0;
  const panelBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  const sideBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  let sideOn = false;
  let shapeKey = "";
  let sideKey = "";
  let dirty = true;
  let glareEl: HTMLElement | null = null;
  const conRest = new Vector3();
  const slot = new Vector3(22, 18, -190);
  const geo = { m: 12, bw: 5, c: 18 };

  function resize() {
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    f = H / (2 * TAN);
    k = DIST / f;
    px.scale.setScalar(k);
    voidU.uAspect.value = W / H;
    dustU.uSize.value = 2.2 * dpr;
    rain.geometry.setDrawRange(0, (compact ? RAIN.compact : RAIN.full) * 2);
    dust.geometry.setDrawRange(0, compact ? DUST.compact : DUST.full);
  }

  function buildConsole() {
    const hw = panelBox.w / 2;
    const hh = panelBox.h / 2;
    const m = (geo.m = compact ? 6 : 12);
    const bw = (geo.bw = compact ? 3 : 5);
    const c = (geo.c = compact ? 12 : 22);
    const gw = hw + m;
    const gh = hh + m;
    const slab = new ExtrudeGeometry(chamfer(new Shape(), gw, gh, c), { depth: 9, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1, bevelSegments: 2 });
    slab.translate(0, 0, -12);
    replace(glass, slab);
    const ring = chamfer(new Shape(), gw + bw, gh + bw, c + bw * 0.42);
    ring.holes.push(chamfer(new Path(), gw, gh, c));
    const rimGeo = new ExtrudeGeometry(ring, { depth: 11, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 0.8, bevelSegments: 2 });
    rimGeo.translate(0, 0, -10);
    replace(rimMesh, rimGeo);
    const outerGeo = ribbon(chamferLoop(gw + bw + 1.5, gh + bw + 1.5, c + bw * 0.42 + 0.6), compact ? 8 : 12);
    if (ghost.geometry === outer.geometry) ghost.geometry = empty;
    replace(outer, outerGeo);
    ghost.geometry = outerGeo;
    const ic = Math.max(4, c - m);
    replace(inner, ribbon(chamferLoop(hw + 1, hh + 1, ic), compact ? 4 : 6));
    screen.scale.set(panelBox.w, panelBox.h, 1);
    screenMat.uniforms.uSize.value = [panelBox.w, panelBox.h];
    screenMat.uniforms.uCut.value = ic;
    const plate = new ExtrudeGeometry(chamfer(new Shape(), gw + (compact ? 10 : 30), gh + (compact ? 10 : 22), c + 8), { depth: 6, bevelEnabled: false });
    plate.translate(0, 0, -6);
    replace(backPlate, plate);
    grid.repeat.set(1 / 44, 1 / 44);
    // The mechanism: a ring with a counter-turning tick ring, step notches and a fixed marker.
    const R = Math.min(hw, hh) * 0.9;
    replace(ringMesh, ribbon(circle(R, 160), 2));
    replace(tickMesh, ribbon(circle(R - 18, 160), 10));
    replace(haloMesh, ribbon(circle(R + 30, 180), 1.4));
    for (const [index, notch] of notches.entries()) {
      const a = Math.PI / 2 - (index / STEPS) * TAU;
      notch.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    }
    marker.position.set(0, R + 16, -46);
    const arm = compact ? 22 : 48;
    const bracketGeo = new ExtrudeGeometry(bracket(arm, compact ? 3 : 5, compact ? 3 : 4), { depth: 3, bevelEnabled: true, bevelThickness: 0.8, bevelSize: 0.6, bevelSegments: 1 });
    const gap = compact ? 4 : 10;
    for (const [index, b] of brackets.entries()) {
      if (index === 0) replace(b.mesh, bracketGeo);
      else b.mesh.geometry = bracketGeo;
      b.rest.set(b.sx * (gw + bw + gap), b.sy * (gh + bw + gap), 24);
    }
    const sw = (gw + bw) * 2;
    const sh = (gh + bw) * 2;
    for (const sheet of sheets) {
      sheet.mesh.scale.set(sw, sh, 1);
      sheet.material.uniforms.uSize.value = [sw, sh];
    }
    if (compact) slot.set(8, 10, -90);
    else slot.set(22, 18, -190);
  }

  function buildSide() {
    const hw = sideBox.w / 2;
    const hh = sideBox.h / 2;
    sideScreen.scale.set(sideBox.w, sideBox.h, 1);
    sideScreenMat.uniforms.uSize.value = [sideBox.w, sideBox.h];
    sideScreenMat.uniforms.uCut.value = 8;
    replace(sideOuter, ribbon(chamferLoop(hw + 7, hh + 7, 14), 9));
    replace(sideInner, ribbon(chamferLoop(hw + 1, hh + 1, 9), 4));
    const slab = new ExtrudeGeometry(chamfer(new Shape(), hw + 6, hh + 6, 13), { depth: 5, bevelEnabled: true, bevelThickness: 1, bevelSize: 0.8, bevelSegments: 1 });
    slab.translate(0, 0, -9);
    replace(sideSlab, slab);
  }

  function syncSats(stage: HTMLElement, s: DOMRect, now: number) {
    const holder = refs.sats.current;
    const els = holder ? Array.from(holder.querySelectorAll<HTMLElement>(".ax-sat")) : [];
    const seen = new Set<string>();
    let fresh = 0;
    for (const [order, el] of els.entries()) {
      const key = el.dataset.sat;
      if (!key) continue;
      const b = layoutBox(el, stage, s);
      if (!b.w || !b.h) continue;
      seen.add(key);
      let sat = sats.get(key);
      if (sat && sat.gone >= 0) {
        dropSat(sat);
        sat = undefined;
      }
      if (!sat) {
        sat = makeSat(key, now + fresh++ * 70, order);
        sats.set(key, sat);
      }
      if (sat.el !== el) {
        sat.el = el;
        sat.transform = sat.opacity = "\u0000";
      }
      sat.order = order;
      if (b.w !== sat.box.w || b.h !== sat.box.h) {
        sat.plate.scale.set(b.w + 16, b.h + 16, 1);
        sat.plateMat.uniforms.uSize.value = [b.w + 16, b.h + 16];
      }
      sat.box = b;
    }
    for (const sat of sats.values())
      if (!seen.has(sat.key) && sat.gone < 0) {
        sat.gone = now;
        sat.el = null;
      }
  }

  function placePanes() {
    const aspect = W / H;
    const liveSats = [...sats.values()].some((sat) => sat.el);
    let shown = 0;
    for (const entry of panes) {
      const { pane, mesh, rest } = entry;
      const on = !compact || pane.compact === true;
      entry.on = mesh.visible = on;
      if (!on) continue;
      // Flank panes make room for the side window (left) and the reward satellites (right).
      const flank = Math.abs(pane.x) > 0.6 && Math.abs(pane.y) < 0.75 && (pane.x < 0 ? sideOn : liveSats);
      entry.room.target = flank ? 0 : 1;
      entry.order = shown++;
      const halfH = (DIST - pane.z) * TAN;
      const halfW = halfH * aspect;
      rest.set(pane.x * halfW, pane.y * halfH, pane.z);
      mesh.scale.setScalar(compact ? Math.min(1, aspect * 1.4) : 1);
      mesh.rotation.set(Math.atan2(rest.y, DIST - rest.z) * 0.85, Math.atan2(-rest.x, DIST - rest.z) * 0.85, 0);
    }
  }

  /** Reads the layout: canvas size and where the window, side window and satellites sit. */
  function measure() {
    const stage = host.parentElement;
    const panel = refs.panel.current;
    if (!stage || !panel) return;
    const s = stage.getBoundingClientRect();
    hostLeft = s.left;
    hostTop = s.top;
    if (Math.abs(s.width - W) > 0.5 || Math.abs(s.height - H) > 0.5) {
      W = s.width;
      H = s.height;
      const wasCompact = compact;
      compact = W < 768;
      if (compact !== wasCompact) dpr = maxDpr();
      if (W > 0 && H > 0) resize();
    }
    if (!W || !H || !panel.offsetWidth || !panel.offsetHeight) return;
    Object.assign(panelBox, layoutBox(panel, stage, s));
    conRest.set((panelBox.x + panelBox.w / 2 - W / 2) * k, -(panelBox.y + panelBox.h / 2 - H / 2) * k, 0);
    if (!pointer.seen) {
      pivotX.value = pivotX.target = hostLeft + panelBox.x + panelBox.w / 2;
      pivotY.value = pivotY.target = hostTop + panelBox.y + panelBox.h / 2;
    }
    screenMat.uniforms.uHead.value = panel.querySelector<HTMLElement>(".ax-console-bar")?.offsetHeight ?? 0;
    glareEl = panel.querySelector<HTMLElement>(".ax-glare > span");
    const shape = `${panelBox.w}x${panelBox.h}:${compact}`;
    if (shape !== shapeKey) {
      shapeKey = shape;
      buildConsole();
    }
    const side = refs.side.current;
    sideOn = !!side && side.childElementCount > 0 && side.offsetWidth > 0 && side.offsetHeight > 0;
    if (side && sideOn) {
      Object.assign(sideBox, layoutBox(side, stage, s));
      const next = `${sideBox.w}x${sideBox.h}`;
      if (next !== sideKey) {
        sideKey = next;
        buildSide();
      }
    } else if (side && sideStyle.opacity !== "\u0000") {
      side.style.transform = side.style.opacity = "";
      sideStyle.transform = sideStyle.opacity = "\u0000";
    }
    syncSats(stage, s, performance.now());
    placePanes();
  }

  /* ---------------------------------------------------------------- state */
  let motion = init.motion;
  let layers = init.layers;
  let step = init.step;
  let rewards = init.rewards;
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
  let wipeAt = -1e7;
  let wipeDir = 1;
  let celebrateAt = -1e7;
  let draftAt = -1e7;
  let errorAt = -1e7;
  let pending = false;
  let sealFound = false;
  let scrollTop = 0;
  const sealAt = new Vector3(0, 0, 10);
  const pointer = { x: 0, y: 0, seen: false };
  const aim = { x: 0, y: 0, near: 0 };
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
  const turn = osc(step >= 0 ? (step * TAU) / STEPS : 0);
  const spin = spring();
  const charge = spring();
  const drift = spring();
  const scrollShift = spring();
  const lightX = spring();
  const lightY = spring();
  const lightOn = spring();
  const euler = new Euler();
  const quat = new Quaternion();
  const pivotV = new Vector3();
  const turned = new Vector3();
  const ray = new Vector3();
  const tetherA = new Vector3();
  const tetherB = new Vector3();
  const M = new Matrix4();
  const A = new Matrix4();
  const panelStyle = { transform: "\u0000" };
  const sideStyle = { transform: "\u0000", opacity: "\u0000" };
  const glareStyle = { transform: "\u0000", opacity: "\u0000" };
  let slowFrames = 0;
  let sampled = 0;

  const elapsed = (now: number) => {
    if (introKind === "none") return 1e9;
    if (introKind === "pending") return 0;
    const raw = now - introStart;
    if (skipAt < 0) return raw;
    return lerp(skipFrom, bootTotal(introKind), easeOut(span(now - skipAt, 0, 380)));
  };
  const inDialog = () => document.activeElement instanceof HTMLElement && document.activeElement.closest("[role='dialog'], [role='alertdialog']") !== null;

  function frame(now: number) {
    if (dirty) {
      dirty = false;
      measure();
    }
    if (!W || !H || !panelBox.w) return false;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;
    const moving = motion !== "off";
    const full = motion === "full";
    // With motion off every transition jumps to its end.
    const age = (at: number) => (moving ? now - at : 1e9);
    const track = (s: Spring, time: number) => {
      if (moving) follow(s, time, dt);
      else {
        s.value = s.target;
        s.velocity = 0;
      }
    };
    const e = elapsed(now);
    const pose = bootPose(introKind, e);
    const booting = introKind !== "pending" && introKind !== "none" && e < bootTotal(introKind);
    const settled = introKind !== "pending" && !booting;
    if (pending) awakeUntil = Math.max(awakeUntil, now + 2000);
    const awake = full ? clamp01((awakeUntil - now) / 1500) : 0;
    const alive = full ? Math.max(awake, booting ? 1 : 0) : 0;
    clock += dt * alive;

    const hw = panelBox.w / 2;
    const hh = panelBox.h / 2;
    const cx = hostLeft + W / 2;
    const cy = hostTop + H / 2;
    const pcx = hostLeft + panelBox.x + hw;
    const pcy = hostTop + panelBox.y + hh;

    /* pointer: tilt around the point under it, come closer along its ray */
    const fine = moving && fineQuery.matches;
    const seen = fine && pointer.seen;
    let left = pcx - hw;
    let top = pcy - hh;
    let right = pcx + hw;
    let bottom = pcy + hh;
    if (sideOn) {
      left = Math.min(left, hostLeft + sideBox.x);
      top = Math.min(top, hostTop + sideBox.y);
      right = Math.max(right, hostLeft + sideBox.x + sideBox.w);
      bottom = Math.max(bottom, hostTop + sideBox.y + sideBox.h);
    }
    const over =
      seen &&
      ((Math.abs(pointer.x - pcx) < hw && Math.abs(pointer.y - pcy) < hh) ||
        (sideOn && pointer.x > hostLeft + sideBox.x && pointer.x < hostLeft + sideBox.x + sideBox.w && pointer.y > hostTop + sideBox.y && pointer.y < hostTop + sideBox.y + sideBox.h));
    const flatten = now - typedAt < 1100 || now - scrolledAt < 800 || (seen && now - movedAt > 2400) || inDialog();
    const frozen = pressing || now - releasedAt < 250;
    const reach = full ? 1 : 0.45;
    if (!frozen) {
      if (seen && settled && !flatten) {
        aim.x = soft(((pointer.x - pcx) / hw) * 1.1);
        aim.y = soft(((pointer.y - pcy) / hh) * 1.1);
        aim.near = over ? 1 : 0;
        pivotX.target = clamp(pointer.x, left, right);
        pivotY.target = clamp(pointer.y, top, bottom);
      } else aim.x = aim.y = aim.near = 0;
    }
    follow(pivotX, 0.12, dt);
    follow(pivotY, 0.12, dt);
    const damping = flatten ? 0.85 : full ? 0.42 : 0.8;
    oscillate(tiltY, aim.x * TILT_Y * reach, 1.5, damping, dt);
    oscillate(tiltX, aim.y * TILT_X * reach, 1.5, damping, dt);
    oscillate(approach, aim.near * APPROACH * reach, 1.6, 0.55, dt);
    oscillate(dip, 0, 2.2, 0.45, dt);
    oscillate(shake, 0, 6.5, 0.22, dt);
    oscillate(stack, 0, 1.6, 0.62, dt);
    const wx = seen && settled ? soft(((pointer.x - cx) / (W / 2)) * 1.2) : 0;
    const wy = seen && settled ? soft(((pointer.y - cy) / (H / 2)) * 1.2) : 0;
    oscillate(layerX, wx, 1.1, 0.5, dt);
    oscillate(layerY, wy, 1.1, 0.5, dt);
    drift.target = full && settled && !flatten && !frozen && !over ? awake : 0;
    follow(drift, 0.9, dt);
    const float = drift.value;
    const layerFloat = alive;

    /* the summoning, the step mechanism and the publish charge */
    charge.target = pending ? 1 : 0;
    track(charge, 0.35);
    if (pending && moving) {
      spin.value += dt * 2.4 * charge.value;
      spin.target = spin.value;
    } else spin.target = Math.ceil(spin.value / TAU - 0.02) * TAU;
    track(spin, 0.6);
    if (moving) oscillate(turn, step >= 0 ? (step * TAU) / STEPS : 0, 0.9, 0.55, dt);
    else turn.value = step >= 0 ? (step * TAU) / STEPS : 0;
    scrollShift.target = clamp(scrollTop * 0.06, 0, 40);
    follow(scrollShift, 0.25, dt);
    const sinceSeal = age(celebrateAt);
    const surge = pulse(sinceSeal, 650, 820, 1800);
    const dim = pulse(age(draftAt), 0, 220, 900);

    /* window pose */
    const swing = 1 - easeBack(pose.arrive);
    euler.set(
      tiltX.value + swing * 0.32 + Math.sin(clock * 0.71) * 0.006 * float,
      tiltY.value - swing * 0.95 + Math.sin(clock * 0.53 + 1.3) * 0.008 * float,
      swing * 0.06,
    );
    quat.setFromEuler(euler);
    pivotV.set((pivotX.value - cx) * k - conRest.x, -(pivotY.value - cy) * k - conRest.y, 0);
    turned.copy(pivotV).applyQuaternion(quat);
    con.position.copy(conRest).add(pivotV).sub(turned);
    ray.set(conRest.x + pivotV.x, conRest.y + pivotV.y, -DIST).normalize();
    con.position.addScaledVector(ray, -(approach.value + dip.value) * k);
    con.position.x += shake.value * k;
    con.position.y += Math.sin(clock * 0.9) * 2.4 * float * k;
    con.position.z -= (1 - easeOut(pose.arrive)) * 5;
    con.quaternion.copy(quat);

    /* camera: from a low oblique angle to frontal; a push when the seal lands */
    const away = 1 - easeInOut(pose.arrive);
    const push = pulse(sinceSeal, 300, 700, 1900) * 0.35;
    camera.position.set(-3.2 * away, -2.4 * away, DIST + 7 * away - push);
    camera.up.set(Math.sin(away * 0.08), Math.cos(away * 0.08), 0);
    camera.lookAt(0, 0.4 * away, 0);

    /* the void and the world behind: parallax opposite the pointer, a slow sway on touch */
    const sway = full && !fine ? Math.sin(clock * 0.21) : 0;
    world.rotation.set(layerY.value * 0.025 + sway * 0.006, layerX.value * 0.035 + sway * 0.018, 0);
    voidU.uLevel.value = pose.level;
    voidU.uShift.value[0] = layerX.value * 0.03;
    voidU.uShift.value[1] = -layerY.value * 0.02;
    voidU.uCentre.value[0] = ((pcx - hostLeft) / W - 0.5) * (W / H);
    voidU.uCentre.value[1] = 0.5 - (pcy - hostTop) / H;
    voidU.uBeam.value = pose.level * (0.7 + charge.value * 0.5 + surge * 0.6) * (1 - pose.gather * 0.5);
    rain.visible = full;
    rainMat.uniforms.uLevel.value = 0.24 * awake * pose.level;
    dustU.uGather.value = pose.gather;
    dustU.uSeam.value.copy(con.position);
    dustU.uSeamW.value = (hw + geo.m) * k;
    dustU.uLevel.value = (0.35 + 0.25 * awake) * pose.level + pose.gather * 0.6;
    dustU.uColor.value.copy(COLD).lerp(AMBER, pose.gather);
    sigil.rotation.z += dt * alive * (0.02 + charge.value * 0.12);
    sigilRings[1].rotation.z -= dt * alive * 0.03;
    for (const [index, material] of sigilMats.entries()) material.uniforms.uLevel.value = [0.1, 0.12, 0.06][index] * pose.level * (1 + charge.value * 0.8 + surge * 2.5);

    /* the seam opens into the contour */
    const open = easeInOut(pose.open);
    seam.visible = pose.seam > 0 && pose.open < 1;
    seam.scale.set(hw + geo.m + geo.bw, compact ? 10 : 16, 1);
    seamMat.uniforms.uDraw.value = easeOut(pose.seam);
    seamMat.uniforms.uLevel.value = 1.6 * (1 - span(pose.open, 0.4, 1));
    frame3.visible = pose.open > 0;
    frame3.scale.y = lerp(0.012, 1, open);

    /* frame pieces lock into place */
    const p = pose.pieces;
    const seat = easeBack(span(p, 0, 0.42));
    rimMesh.position.z = (1 - seat) * -160;
    front.position.set(layerX.value * 7, -layerY.value * 7, 0);
    for (const [index, b] of brackets.entries()) {
      const end = PIECE_LANDINGS[index];
      const t = span(p, end - 0.4, end);
      const r = easeBack(t);
      const bob = Math.sin(clock * 0.8 + index * 1.9) * 1.5 * layerFloat;
      b.mesh.visible = t > 0;
      b.mesh.position.set(b.rest.x + b.sx * (1 - r) * 180, b.rest.y + b.sy * (1 - r) * 180 + bob, b.rest.z + (1 - r) * 240);
      b.mesh.rotation.z = b.angle + (1 - r) * 0.9 * b.sx * b.sy;
      const landed = p - end;
      b.material.emissiveIntensity = 0.3 + charge.value * 0.35 + surge * 0.8 + (settled ? 0 : landed >= 0 ? Math.exp(-landed * 14) * 1.2 : t * t * 0.5);
    }
    backPlate.visible = p > 0.2;
    back.position.set(-layerX.value * 12, layerY.value * 12, 0);
    backPlate.position.z = lerp(-700, -110, easeOut(span(p, 0.2, 0.75)));
    backMat.emissiveIntensity = 0.32 + charge.value * 0.2 + surge * 0.5;

    const engraveIn = easeBack(span(p, 0.3, 0.95));
    engrave.visible = marker.visible = p > 0.3;
    engrave.position.set(-layerX.value * 5, scrollShift.value + layerY.value * 5, -46);
    marker.position.x = engrave.position.x;
    engrave.rotation.z = turn.value + spin.value - (1 - engraveIn) * 1.2;
    tickMesh.rotation.z = -1.6 * (turn.value + spin.value) + (1 - engraveIn) * 2;
    const engraveLevel = span(p, 0.3, 0.8) * (1 + charge.value * 0.9 + surge * 1.5);
    engraveMats.ring.uniforms.uLevel.value = 0.4 * engraveLevel;
    engraveMats.ticks.uniforms.uLevel.value = 0.32 * engraveLevel;
    engraveMats.halo.uniforms.uLevel.value = 0.16 * engraveLevel;
    engraveMats.marker.uniforms.uLevel.value = (step >= 0 ? 0.8 : 0.3) * engraveLevel;
    for (const [index, material] of notchMats.entries())
      material.uniforms.uLevel.value = engraveLevel * (step < 0 ? 0.14 : index < step ? 0.5 : index === step ? 1.2 : 0.16);

    for (const [index, sheet] of sheets.entries()) {
      sheet.hidden.target = index < layers ? 0 : 1;
      track(sheet.hidden, 0.5);
      const s = Math.max(0.35, index + 1 + stack.value);
      const enter = 1 - easeOut(span(pose.unfold, index * 0.12, 0.6 + index * 0.12));
      const gone = sheet.hidden.value;
      const bob = Math.sin(clock * 0.6 + index * 2.1) * 3 * layerFloat;
      sheet.mesh.visible = enter < 1 && gone < 0.995;
      sheet.mesh.position.set(
        slot.x * s * (1 - gone) - layerX.value * (6 + 8 * index),
        slot.y * s * (1 - gone) + layerY.value * (6 + 8 * index) + bob,
        slot.z * s - enter * 600 - gone * 300,
      );
      sheet.material.uniforms.uDraw.value = 1 - enter;
      sheet.material.uniforms.uGlow.value = pulse(sinceSeal, 700 + index * 120, 900 + index * 120, 1900) + charge.value * 0.3;
    }

    /* glass, screen and contours */
    glass.visible = pose.glass > 0;
    glassMat.opacity = 0.42 * pose.glass;
    screen.visible = pose.scan > 0;
    screenMat.uniforms.uFill.value = pose.scan;
    screenMat.uniforms.uPulse.value = surge;
    screenMat.uniforms.uCharge.value = charge.value;
    const wipe = span(age(wipeAt), 0, 520);
    screenMat.uniforms.uWipe.value = wipe > 0 && wipe < 1 ? easeInOut(wipe) : 0;
    screenMat.uniforms.uWipeDir.value = wipeDir;
    const breathe = charge.value * (0.45 + 0.3 * Math.sin(clock * 5.5));
    outerMat.uniforms.uDraw.value = 1;
    outerMat.uniforms.uLevel.value = (1 + (1 - p) * 0.6 + (1 - open) * 1.2) * (1 - dim * 0.45) + breathe + surge * 1.4;
    innerMat.uniforms.uDraw.value = easeInOut(span(p, 0.2, 0.8));
    innerMat.uniforms.uLevel.value = 0.34 + surge * 0.6 + breathe * 0.4 + (1 - pose.scan) * 0.25;
    alertU.value = pulse(age(errorAt), 0, 120, 1100);

    const g = span(age(ghostAt), 0, 560);
    ghost.visible = g > 0 && g < 1 && ghost.geometry !== empty;
    ghost.position.z = 3 + easeOut(g) * 160;
    ghost.scale.setScalar(1 + easeOut(g) * 0.04);
    ghostMat.uniforms.uLevel.value = (1 - g) ** 2 * 0.8;

    /* publish: rings collapse into the seal; while pending they hover around the window */
    if (sinceSeal < 2200 && !sealFound) {
      const emblem = refs.panel.current?.querySelector<HTMLElement>(".ax-emblem");
      if (emblem) {
        const r = emblem.getBoundingClientRect();
        sealAt.set(r.left + r.width / 2 - pcx, -(r.top + r.height / 2 - pcy), 10);
        sealFound = true;
      }
    }
    const ringSize = Math.max(hw, hh) * 1.12;
    for (const [index, ring] of rings.entries()) {
      const rp = span(sinceSeal, index * 120, 760 + index * 120);
      const sealing = rp > 0 && rp < 1;
      const toward = easeInOut(rp);
      const radius = sealing ? lerp(ringSize, 46, toward) : ringSize * (1.02 + 0.02 * Math.sin(clock * 1.3 + index));
      const level = sealing ? Math.sin(Math.PI * rp) * (index ? 0.6 : 1) : charge.value * (index ? 0.2 : 0.3);
      ring.visible = level > 0.005;
      ring.position.set(sealing ? sealAt.x * toward : 0, sealing ? sealAt.y * toward : 0, 8);
      ring.rotation.z = clock * (index ? -0.4 : 0.3) * (1 + charge.value * 2);
      ring.scale.setScalar(radius / 100);
      ringMats[index].uniforms.uLevel.value = level;
    }

    /* reward pips under the window */
    const shownPips = Math.min(rewards, MAX_PIPS);
    for (const [index, pip] of pips.entries()) {
      pip.shown.target = index < shownPips ? 1 : 0;
      track(pip.shown, 0.22);
      const v = pip.shown.value * span(p, 0.6, 1);
      pip.mesh.visible = v > 0.01;
      pip.mesh.position.set((index - (Math.max(shownPips, 1) - 1) / 2) * 20, -(hh + geo.m + geo.bw + 16), 6);
      pip.mesh.scale.setScalar(easeBack(clamp01(v)) * (1 + surge * 0.5));
    }
    pipMat.uniforms.uLevel.value = 0.8 + charge.value * 0.5 + surge;

    /* the side window unfolds from edge-on */
    if (sideOn) {
      const u = pose.unfold;
      const slide = easeOut(span(u, 0, 0.7));
      const rx = sideBox.x + sideBox.w / 2 - (panelBox.x + hw);
      const ry = -(sideBox.y + sideBox.h / 2 - (panelBox.y + hh));
      sideG.visible = u > 0;
      sideG.position.set(lerp(rx * 0.35, rx, slide), ry + Math.sin(clock * 0.5 + 0.7) * 2 * float, lerp(-120, SIDE_Z, slide));
      sideG.rotation.set(0, lerp(1.35, SIDE_TURN, easeBack(span(u, 0.05, 0.85))), 0);
      sideOuterMat.uniforms.uDraw.value = easeInOut(span(u, 0.15, 0.85));
      sideOuterMat.uniforms.uLevel.value = 0.9 * (1 - dim * 0.4) + breathe * 0.5 + surge;
      sideInnerMat.uniforms.uDraw.value = easeInOut(span(u, 0.3, 0.95));
      sideScreenMat.uniforms.uFill.value = span(u, 0.35, 0.95);
      sideScreenMat.uniforms.uCharge.value = charge.value * 0.6;
    } else sideG.visible = false;

    /* reward satellites: spawn from the window edge, retract when removed, converge into the seal */
    const edgeX = hw + geo.m + geo.bw + 2;
    for (const sat of sats.values()) {
      const unfoldGate = span(pose.unfold, 0.25 + sat.order * 0.08, 0.75 + sat.order * 0.08);
      const grow = Math.min(span(age(sat.born), 0, 650), unfoldGate);
      const inT = easeBack(grow);
      const outT = sat.gone >= 0 && sat.seal < 0 ? easeInOut(span(age(sat.gone), 0, 450)) : 0;
      const sealT = sat.seal >= 0 ? easeInOut(span(age(sat.seal), 0, 650)) : 0;
      if (outT >= 1 || (sat.gone >= 0 && sealT >= 1)) {
        dropSat(sat);
        continue;
      }
      const b = sat.box;
      const rx = b.x + b.w / 2 - (panelBox.x + hw);
      const ry = -(b.y + b.h / 2 - (panelBox.y + hh));
      const oy = clamp(ry, -hh + 40, hh - 40);
      let x = lerp(edgeX, rx, inT);
      let y = lerp(oy, ry, inT) + Math.sin(clock * 0.8 + sat.phase) * 4 * layerFloat;
      let z = lerp(0, SAT_Z, inT) + Math.cos(clock * 0.6 + sat.phase) * 5 * layerFloat;
      x = lerp(x, edgeX, outT);
      y = lerp(y, oy, outT);
      z = lerp(z, 0, outT);
      x = lerp(x, sealAt.x, sealT);
      y = lerp(y, sealAt.y, sealT);
      z = lerp(z, sealAt.z, sealT);
      const show = Math.min(span(age(sat.born), 0, 400), unfoldGate) * (1 - outT) * (1 - sealT) * span(p, 0.5, 1);
      sat.g.visible = show > 0.005;
      sat.g.position.set(x, y, z);
      const rotY = lerp(-1.1, SAT_TURN, inT) * (1 - sealT);
      sat.g.rotation.set(0, rotY, 0);
      sat.g.scale.setScalar(lerp(0.4, 1, clamp01(inT)) * (1 - 0.75 * sealT) * (1 - 0.5 * outT));
      sat.plateMat.uniforms.uDraw.value = span(age(sat.born), 100, 600) * (unfoldGate > 0 ? 1 : 0);
      sat.plateMat.uniforms.uFade.value = show;
      sat.plateMat.uniforms.uGlow.value = surge + charge.value * 0.6;
      // The tether runs from the satellite's inner edge to the window's edge.
      const half = (b.w / 2 + 8) * sat.g.scale.x;
      tetherA.set(x - half * Math.cos(rotY), y, z + half * Math.sin(rotY));
      tetherB.set(edgeX, oy, 0);
      const length = tetherA.distanceTo(tetherB);
      sat.tether.visible = show > 0.02 && length > 4;
      if (sat.tether.visible) {
        sat.tether.position.copy(tetherA);
        sat.tether.quaternion.setFromUnitVectors(X_AXIS, tetherB.sub(tetherA).normalize());
        sat.tether.scale.set(length, 3, 1);
        sat.tetherMat.uniforms.uLevel.value = show * (0.45 + charge.value * 0.5);
        sat.tetherMat.uniforms.uPhase.value = clock * (0.5 + charge.value * 1.5) + sat.phase;
      }
    }

    /* the system panes: draw in, ignite, drift */
    for (const { mesh, material, rest, order, on, room } of panes) {
      if (!on) continue;
      track(room, 0.35);
      mesh.visible = room.value > 0.01;
      if (!mesh.visible) continue;
      material.uniforms.uFade.value = room.value;
      const draw = span(pose.planes, order * 0.08, 0.5 + order * 0.08);
      material.uniforms.uDraw.value = draw;
      material.uniforms.uLive.value = span(pose.planes, 0.4 + order * 0.08, 0.8 + order * 0.08);
      material.uniforms.uGlow.value = pulse(sinceSeal, 700 + order * 90, 950 + order * 90, 2000) * 0.9 + charge.value * 0.25;
      mesh.position.set(
        rest.x + Math.sin(clock * 0.4 + order * 1.7) * 0.05 * layerFloat,
        rest.y + Math.cos(clock * 0.33 + order) * 0.04 * layerFloat,
        rest.z - (1 - easeOut(draw)) * 3,
      );
    }

    /* light: follows the pointer across metal and glass; contours and sheen respond to the tilt */
    const tY = tiltY.value / TILT_Y;
    const tX = tiltX.value / TILT_X;
    const sweep = booting ? pulse(e, 0, 400, bootTotal(introKind)) : 0;
    if (seen) {
      lightX.target = (pointer.x - cx) * k;
      lightY.target = -(pointer.y - cy) * k;
    }
    lightOn.target = seen && settled ? 1 : 0;
    follow(lightX, 0.15, dt);
    follow(lightY, 0.15, dt);
    follow(lightOn, 0.4, dt);
    const sweepX = lerp(-W / 2, W / 2, pose.scan) * k;
    cursor.position.set(lerp(lightX.value, sweepX, sweep), lerp(lightY.value, (H / 4) * k, sweep), 2.4);
    cursor.intensity = 7 * Math.max(lightOn.value, sweep);
    lightU.value[0] = tY;
    lightU.value[1] = -tX;
    const tilt = Math.min(1, Math.hypot(tY, tX));
    screenMat.uniforms.uSheen.value = [-tY * 0.35, tX * 0.35, tilt];
    sideScreenMat.uniforms.uSheen.value = [-tY * 0.35, tX * 0.35, tilt * 0.8];

    renderer.render(scene, camera);
    register(now, lightOn.value * tilt);

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
    // Keep running while anything still moves toward rest.
    return (
      Math.abs(tiltX.velocity) + Math.abs(tiltY.velocity) + Math.abs(approach.velocity) + Math.abs(dip.velocity) + Math.abs(stack.velocity) > 1e-3 ||
      drift.value > 1e-3 ||
      Math.abs(spin.value - spin.target) > 1e-3 ||
      Math.abs(turn.velocity) > 1e-3 ||
      panes.some(({ room }) => Math.abs(room.value - room.target) > 1e-3) ||
      [...sats.values()].some((sat) => sat.gone >= 0 || age(sat.born) < 700 || (sat.seal >= 0 && age(sat.seal) < 700))
    );
  }

  /** The 3D-to-page mapping for an object built in px: CSS px around the canvas centre, y down, camera at z = f. */
  function mapping(obj: Object3D, centreX: number, centreY: number) {
    M.makeScale(1, -1, 1);
    A.multiplyMatrices(obj.matrixWorld, M).premultiply(camera.matrixWorldInverse);
    M.makeScale(1 / k, -1 / k, 1 / k);
    A.premultiply(M);
    M.makeTranslation(0, 0, f);
    A.premultiply(M);
    return { ax: hostLeft + W / 2 - centreX, ay: hostTop + H / 2 - centreY, el: A.elements };
  }
  const css = (ax: number, ay: number, el: ArrayLike<number>) =>
    `translate(${ax.toFixed(2)}px, ${ay.toFixed(2)}px) perspective(${f.toFixed(2)}px) matrix3d(${Array.from(el, (v) => +v.toFixed(6)).join(",")})`;
  const write = (el: HTMLElement, cache: { transform: string; opacity?: string }, transform: string, opacity?: string) => {
    if (transform !== cache.transform) el.style.transform = cache.transform = transform;
    if (opacity !== undefined && opacity !== cache.opacity) el.style.opacity = cache.opacity = opacity;
  };

  function register(now: number, glare: number) {
    const panel = refs.panel.current;
    if (!panel || !panelBox.w) return;
    // Until the summoning starts the page keeps its own place.
    if (introKind === "pending") {
      write(panel, panelStyle, "");
      return;
    }
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const hw = panelBox.w / 2;
    const hh = panelBox.h / 2;
    {
      const { ax, ay, el } = mapping(px, hostLeft + panelBox.x + hw, hostTop + panelBox.y + hh);
      let worst = 0;
      for (const [ux, uy] of [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ]) {
        const z = el[2] * ux + el[6] * uy + el[14];
        const scale = f / Math.max(1, f - z);
        worst = Math.max(worst, Math.abs((el[0] * ux + el[4] * uy + el[12]) * scale + ax - ux), Math.abs((el[1] * ux + el[5] * uy + el[13]) * scale + ay - uy));
      }
      // At rest the transform collapses to none, so text stays crisp.
      write(panel, panelStyle, worst < 0.25 ? "" : css(ax, ay, el));
    }
    if (glareEl) {
      const gx = clamp(pointer.x - (hostLeft + panelBox.x + hw), -hw, hw);
      const gy = clamp(pointer.y - (hostTop + panelBox.y + hh), -hh, hh);
      write(glareEl, glareStyle, `translate(${gx.toFixed(1)}px, ${gy.toFixed(1)}px)`, glare > 0.02 ? (glare * 0.9).toFixed(3) : "0");
    }
    const side = refs.side.current;
    if (side && sideOn) {
      const { ax, ay, el } = mapping(sideG, hostLeft + sideBox.x + sideBox.w / 2, hostTop + sideBox.y + sideBox.h / 2);
      write(side, sideStyle, css(ax, ay, el), span(bootPose(introKind, elapsed(now)).unfold, 0.55, 1).toFixed(3));
    }
    for (const sat of sats.values()) {
      if (!sat.el) continue;
      const b = sat.box;
      const { ax, ay, el } = mapping(sat.g, hostLeft + b.x + b.w / 2, hostTop + b.y + b.h / 2);
      write(sat.el, sat, sat.g.visible ? css(ax, ay, el) : sat.transform, (sat.g.visible ? sat.plateMat.uniforms.uFade.value : 0).toFixed(3));
    }
  }

  /* ---------------------------------------------------------------- loop & lifecycle */
  let raf = 0;
  let ready = false;
  let visible = true;
  const canRun = () => ready && visible && !document.hidden;
  const loop = (now: number) => {
    raf = 0;
    const restless = frame(now);
    if (canRun() && motion !== "off" && (now < awakeUntil || restless)) raf = requestAnimationFrame(loop);
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

  const stage = host.parentElement;
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
  const onScroll = (event: Event) => {
    scrolledAt = performance.now();
    const target = event.target;
    if (target instanceof HTMLElement && refs.panel.current?.contains(target)) scrollTop = target.scrollTop;
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
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("mouseleave", onLeave);
  window.addEventListener("keydown", onKey, true);
  stage?.addEventListener("pointerdown", onDown);
  stage?.addEventListener("scroll", onScroll, { capture: true, passive: true });
  stage?.addEventListener("wheel", onScroll, { passive: true });
  stage?.addEventListener("focusin", onFocus);
  stage?.addEventListener("focusout", onFocus);
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
  for (const el of [stage, refs.panel.current, refs.side.current, refs.sats.current]) if (el) resizes.observe(el);
  const changes = new MutationObserver(onLayout);
  for (const el of [refs.side.current, refs.sats.current]) if (el) changes.observe(el, { childList: true, subtree: true });

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
      if (signal === "pending") pending = true;
      else if (signal === "settle") pending = false;
      else if (signal === "publish") {
        pending = false;
        celebrateAt = now;
        sealFound = false;
        let index = 0;
        for (const sat of sats.values()) if (sat.gone < 0) sat.seal = now + index++ * 70;
      } else if (signal === "error") {
        pending = false;
        errorAt = now;
        if (motion !== "off") shake.velocity += 260;
      } else if (signal === "draft") {
        draftAt = now;
        if (motion !== "off") stack.value -= 1;
      } else if (motion !== "off") {
        wipeAt = now;
        wipeDir = signal === "back" ? -1 : 1;
        if (signal === "back") {
          stack.value -= 1;
          dip.value = 22;
        } else {
          ghostAt = now;
          stack.value += 1;
          dip.value = signal === "page" ? -18 : -26;
        }
      }
      if (signal === "page")
        for (const sat of sats.values())
          if (sat.seal >= 0) {
            sat.seal = -1;
            sat.born = now;
          }
      poke(signal === "publish" ? 4000 : 2600);
    },
    setLayers(next: number) {
      layers = next;
      poke(1500);
    },
    setStep(next: number) {
      step = next;
      poke(2000);
    },
    setRewards(next: number) {
      rewards = next;
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
      changes.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("keydown", onKey, true);
      stage?.removeEventListener("pointerdown", onDown);
      stage?.removeEventListener("scroll", onScroll, { capture: true });
      stage?.removeEventListener("wheel", onScroll);
      stage?.removeEventListener("focusin", onFocus);
      stage?.removeEventListener("focusout", onFocus);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("scroll", onLayout);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      const panel = refs.panel.current;
      if (panel) panel.style.transform = "";
      if (glareEl) glareEl.style.transform = glareEl.style.opacity = "";
      const side = refs.side.current;
      if (side) side.style.transform = side.style.opacity = "";
      for (const sat of [...sats.values()]) dropSat(sat);
      const geometries = new Set<BufferGeometry>(shared);
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof Points || object instanceof LineSegments) {
          geometries.add(object.geometry);
          for (const material of [object.material].flat() as Material[]) materials.add(material);
        }
      });
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
  side: RefObject<HTMLElement | null>;
  sats: RefObject<HTMLElement | null>;
  motion: MotionLevel;
  state: RefObject<SceneState>;
  ref?: Ref<AdminSceneHandle>;
  onReady: () => void;
  onFail: () => void;
};

export default function AdminScene({ panel, side, sats, motion, state, ref, onReady, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ready = useEffectEvent(() => onReady());
  const fail = useEffectEvent(() => onFail());
  const initial = useEffectEvent((): Init => ({ motion, ...state.current }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: Engine;
    try {
      engine = createAdminEngine(host, { panel, side, sats }, initial(), { ready: () => ready(), fail: () => fail() });
    } catch {
      // No WebGL context: the drawn window stays.
      fail();
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [panel, side, sats]);

  useEffect(() => engineRef.current?.setMotion(motion), [motion]);
  useImperativeHandle(
    ref,
    () => ({
      start: (kind) => engineRef.current?.start(kind),
      skip: () => engineRef.current?.skip(),
      signal: (signal) => engineRef.current?.signal(signal),
      setLayers: (count) => engineRef.current?.setLayers(count),
      setStep: (next) => engineRef.current?.setStep(next),
      setRewards: (count) => engineRef.current?.setRewards(count),
    }),
    [],
  );

  return <div ref={hostRef} aria-hidden="true" className="ax-scene" />;
}
