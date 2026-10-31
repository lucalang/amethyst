"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Quaternion,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D,
} from "three";
import { follow, spring, type Spring } from "@/components/showcase/three-kit";
import { clamp01, easeIn, easeInOut, easeOut, EMBER_VERTEX, hash, lerp, POINT_FRAGMENT, span, TAU } from "@/components/vault/vault-forge";
import type { MotionLevel } from "@/lib/preferences";
import { CLOSE, CLOSE_SPLIT, FOLD, OPEN, PUBLISH, type OpenKind, type RevealKind } from "./admin-timing";

/**
 * The System window in the Vault's dark: a dark translucent surface with a faint circuit texture,
 * an angular crimson frame with stepped side rails, an echo contour and corner pieces in front of
 * it, a ghost contour and a glow behind it, and two detached bars floating furthest forward. Embers
 * drift through the crimson haze like in the Vault.
 *
 * The page surface is mapped onto the window every frame, so the real controls sit exactly on it.
 * The camera is an off-axis eye with a lens shift that keeps the page plane fixed on screen: moving
 * the eye parallaxes every other layer while the page stays crisp. With a pointer the eye follows it
 * and the window tilts strongly around the point under it; without one (touch) the eye rests at an
 * oblique angle so the depth still shows. Tilt freezes while pressing and settles flat while typing,
 * scrolling, in dialogs or once the pointer rests, then resumes.
 *
 * Reveals open the window from a luminous line into a strip that expands vertically with a brief
 * horizontal distortion; folding and closing run it in reverse. Rendering stops when idle, hidden or
 * off screen.
 */

export type ConsoleSignal = "pending" | "settle" | "publish" | "draft" | "error";
export type AdminSceneHandle = {
  reveal: (kind: RevealKind) => void;
  skip: () => void;
  signal: (signal: ConsoleSignal) => void;
};

const FOV = 34;
const TAN = Math.tan((FOV * Math.PI) / 360);
const DIST = 14;
const TILT_Y = 0.24;
const TILT_X = 0.17;
/** How far (CSS px) the window comes forward while the pointer is over it. */
const APPROACH = 16;
/** How far the eye travels off-axis with the pointer, as fractions of the stage. */
const EYE = { x: 0.22, y: 0.16 };
/** Where the eye rests without a pointer: below and to the left, so the layers keep their depth. */
const EYE_REST = { wide: { x: -0.1, y: 0.07 }, compact: { x: -0.3, y: 0.1 } };
/** Layer depths in CSS px: in front of (+) or behind (−) the surface the page sits on. */
const Z = { bars: 70, flare: 60, corners: 42, rails: 28, echo: 22, frame: 12, ring: 10, tears: 6, surface: -0.5, halo: -34, ghost: -90 };
const EMBERS = { wide: 120, compact: 60 };
/** The window's height while it is a line and a strip, as a fraction of its full height. */
const LINE_H = 0.004;
const STRIP_H = 0.06;
const TEARS = 6;
const HALO_PAD = 120;

const RED = new Color(0xff1f3d);
const DEEP = new Color(0x9e0a1e);
const PALE = new Color(0xffe2e7);
const ALERT = new Color(0xff9a5c);

type Geo = { m: number; gap: number; ext: number; step: number; c: number; rail: number; arm: number };
const WIDE: Geo = { m: 18, gap: 16, ext: 44, step: 8, c: 16, rail: 6, arm: 46 };
const COMPACT: Geo = { m: 10, gap: 10, ext: 14, step: 5, c: 10, rail: 4, arm: 26 };

/* ----------------------------------------------------------------------------
 * Shaders
 * ------------------------------------------------------------------------- */

const SDF = /* glsl */ `
float cut(vec2 p, vec2 b, float c) {
  vec2 q = abs(p) - b;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  return max(d, (abs(p.x) + abs(p.y) - b.x - b.y + c) * 0.70710678);
}
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`;

const VOID_VERTEX = /* glsl */ `
varying vec2 vScreen;
void main() {
  vScreen = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}`;

/** The Vault's dark, in screen space so it reads as infinitely far: crimson haze, smoke and a glow behind the window. */
const VOID_FRAGMENT = /* glsl */ `
${SDF}
uniform float uTime;
uniform float uLevel;
uniform float uAspect;
uniform vec2 uShift;
uniform vec2 uCentre;
uniform vec2 uGlow;
uniform float uBeam;
varying vec2 vScreen;
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y);
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
  vec3 col = mix(vec3(0.0016, 0.0006, 0.0009), vec3(0.0034, 0.0011, 0.0017), smoothstep(-0.6, 0.6, uv.y));
  float haze = fbm(p * 1.6 + vec2(uTime * 0.01, -uTime * 0.012));
  col += vec3(0.02, 0.0022, 0.0045) * haze * haze * 1.6;
  float wisp = fbm(p * vec2(1.2, 3.2) + vec2(-uTime * 0.016, uTime * 0.007) + 4.0);
  col += vec3(0.045, 0.0035, 0.009) * pow(wisp, 3.0) * smoothstep(0.8, 0.0, abs(uv.y + 0.05));
  vec2 c = (uv - uCentre) / max(uGlow, vec2(0.04));
  col += vec3(0.06, 0.005, 0.012) * exp(-dot(c, c) * 1.4) * uBeam;
  col *= 1.0 - smoothstep(0.4, 1.15, length(uv * vec2(0.75, 1.1)));
  gl_FragColor = vec4(col * uLevel, 1.0);
  #include <colorspace_fragment>
}`;

const UV_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * The surface right behind the page content: dark translucent glass that keeps text legible, a
 * faint circuit texture toward the edges, light under the pointer and a sheen that turns with the
 * tilt. Rows tear sideways while the window distorts; a bright line runs through the middle while it forms.
 */
const SURFACE_FRAGMENT = /* glsl */ `
${SDF}
uniform vec2 uSize;
uniform float uCut;
uniform float uAlpha;
uniform float uLevel;
uniform float uScan;
uniform float uGlitch;
uniform float uSeed;
uniform float uCharge;
uniform float uSurge;
uniform float uAlert;
uniform float uTime;
uniform vec2 uPointer;
uniform float uPointerOn;
uniform vec3 uSheen;
uniform vec3 uColor;
uniform vec3 uPale;
uniform vec3 uAlertColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float row = floor(p.y / 7.0);
  float torn = step(0.7, hash2(vec2(row, uSeed)));
  p.x += (hash2(vec2(row * 1.7, uSeed + 3.1)) - 0.5) * 60.0 * uGlitch * torn;
  float d = cut(p, uSize * 0.5, uCut);
  float aa = fwidth(d) + 0.001;
  float inside = 1.0 - smoothstep(-aa, aa, d);
  vec3 tint = mix(uColor, uAlertColor, uAlert);
  float edge = exp(d / 26.0);
  vec3 col = vec3(0.0045, 0.0012, 0.0018) + tint * edge * 0.035;
  vec2 g = p / 24.0;
  vec2 f = fract(g) - 0.5;
  float h = hash2(floor(g));
  float trace = h > 0.6 ? (1.0 - smoothstep(0.0, 0.05, abs(f.y))) * step(f.x, h - 0.5)
    : h < 0.22 ? (1.0 - smoothstep(0.0, 0.05, abs(f.x))) * step(-f.y, h * 2.0 - 0.1) : 0.0;
  float node = (1.0 - smoothstep(0.07, 0.13, length(f))) * step(0.9, h);
  float fade = 0.25 + 0.75 * smoothstep(-220.0, -10.0, d);
  col += tint * (trace * 0.4 + node) * 0.03 * fade;
  col *= 0.92 + 0.08 * step(0.5, fract(p.y / 3.0));
  vec2 lp = p - uPointer;
  col += tint * exp(-dot(lp, lp) / 30000.0) * 0.06 * uPointerOn;
  float s = dot(p / uSize - uSheen.xy, vec2(0.6, 0.8));
  col += uPale * exp(-s * s * 36.0) * 0.022 * uSheen.z;
  col += tint * uCharge * (0.02 + 0.018 * sin(uTime * 5.0 - p.y / 30.0));
  col += mix(tint, uPale, 0.35) * uSurge * (0.04 + 0.12 * edge);
  float line = exp(-abs(p.y) / 1.4) + 0.4 * exp(-abs(p.y) / 16.0);
  col += mix(tint, uPale, 0.7) * line * uScan;
  float alpha = min(1.0, (uAlpha + uSurge * 0.04) + line * uScan * 0.6) * inside;
  gl_FragColor = vec4(col, alpha * uLevel);
  #include <colorspace_fragment>
}`;

/** The glow behind the window, offset away from the light. */
const HALO_FRAGMENT = /* glsl */ `
${SDF}
uniform vec2 uSize;
uniform vec2 uBox;
uniform float uCut;
uniform float uLevel;
uniform vec2 uLight;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = cut(p - uLight, uBox, uCut);
  float glow = exp(-max(d, 0.0) / 44.0) * (d > 0.0 ? 1.0 : 0.3);
  float fall = 1.0 - smoothstep(0.6, 1.0, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0);
  gl_FragColor = vec4(uColor * glow * fall * uLevel, 1.0);
  #include <colorspace_fragment>
}`;

/** A horizontal tear of light while the window distorts. */
const TEAR_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying vec2 vUv;
void main() {
  float a = smoothstep(0.0, 0.25, vUv.x) * (1.0 - smoothstep(0.55, 1.0, vUv.x));
  float y = 1.0 - abs(vUv.y - 0.5) * 2.0;
  gl_FragColor = vec4(uColor * a * y * uLevel, 1.0);
  #include <colorspace_fragment>
}`;

/** The flare at the centre of the line the window opens from: a hot core and a long horizontal streak. */
const FLARE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uPale;
uniform float uLevel;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float core = exp(-(p.x * p.x * 16.0 + p.y * p.y * 30.0));
  float streak = exp(-abs(p.y) * 30.0) * (1.0 - smoothstep(0.0, 1.0, abs(p.x)));
  float glow = exp(-dot(p, p) * 5.0) * 0.25;
  gl_FragColor = vec4(mix(uColor, uPale, core) * (core * 1.4 + streak * 0.8 + glow) * uLevel, 1.0);
  #include <colorspace_fragment>
}`;

/** Light lines: a bright core with a soft glow, drawn along `aT` up to `uDraw`, brighter on the side facing the light, with an optional running highlight. */
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
uniform vec3 uHot;
uniform vec3 uAlertColor;
uniform float uAlert;
uniform float uLevel;
uniform float uDraw;
uniform float uCore;
uniform float uDash;
uniform float uShine;
uniform float uHeat;
uniform float uRun;
uniform float uRunLevel;
varying float vT;
varying float vSide;
varying float vLit;
void main() {
  if (vT > uDraw || uLevel <= 0.0) discard;
  if (uDash > 0.0 && fract(vT * uDash) > 0.45) discard;
  float x = abs(vSide);
  float core = 1.0 - smoothstep(uCore * 0.5, uCore, x);
  float glow = exp(-x * x * 7.0) * 0.36 * (1.0 - core);
  float run = uRunLevel > 0.0 ? exp(-abs(fract(vT - uRun + 0.5) - 0.5) * 24.0) * uRunLevel : 0.0;
  float shine = 1.0 + uShine * clamp(vLit, -0.6, 1.0);
  float a = (core + glow) * uLevel * shine * (1.0 + run * 2.0);
  vec3 col = mix(uColor, uHot, clamp(core * uHeat + run * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(mix(col, uAlertColor, uAlert) * a, 1.0);
  #include <colorspace_fragment>
}`;

/* ----------------------------------------------------------------------------
 * Geometry
 * ------------------------------------------------------------------------- */

type Pt = [number, number];

/** Splits every corner by a hair so a strip keeps its width around it (open lines keep their ends). */
function split(points: Pt[], closed: boolean) {
  const n = points.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i];
    if (!closed && (i === 0 || i === n - 1)) {
      out.push([x, y]);
      continue;
    }
    const [ax, ay] = points[(i - 1 + n) % n];
    const [bx, by] = points[(i + 1) % n];
    const a = Math.hypot(x - ax, y - ay) || 1;
    const b = Math.hypot(bx - x, by - y) || 1;
    out.push([x - ((x - ax) / a) * 0.6, y - ((y - ay) / a) * 0.6], [x + ((bx - x) / b) * 0.6, y + ((by - y) / b) * 0.6]);
  }
  return out;
}

/** A flat strip `width` wide along points: position along it, across it, and the normal. */
function strip(source: Pt[], width: number, closed = true) {
  const points = split(source, closed);
  const n = points.length;
  const count = closed ? n + 1 : n;
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
    const prev = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
    const next = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)];
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

const mirror = (points: Pt[], sx: number, sy: number) => points.map(([x, y]): Pt => [x * sx, y * sy]);

/** A rectangle with 45° cut corners, clockwise from the top-left. */
function chamfered(hw: number, hh: number, c: number): Pt[] {
  return [
    [-hw + c, hh],
    [hw - c, hh],
    [hw, hh - c],
    [hw, -hh + c],
    [hw - c, -hh],
    [-hw + c, -hh],
    [-hw, -hh + c],
    [-hw, hh - c],
  ];
}

/** The outer frame: cut corners and, when there is room, a rail stepping outward along the middle of each side. */
function frameShape(X: number, Y: number, c: number, r: number, a: number): Pt[] {
  if (a <= 0) return chamfered(X, Y, c);
  return [
    [-X + c, Y],
    [X - c, Y],
    [X, Y - c],
    [X, a + r],
    [X + r, a],
    [X + r, -a],
    [X, -a - r],
    [X, -Y + c],
    [X - c, -Y],
    [-X + c, -Y],
    [-X, -Y + c],
    [-X, -a - r],
    [-X - r, -a],
    [-X - r, a],
    [-X, a + r],
    [-X, Y - c],
  ];
}

function circle(r: number, segments: number): Pt[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = Math.PI / 2 - (i / segments) * TAU;
    return [Math.cos(a) * r, Math.sin(a) * r] as Pt;
  });
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

/**
 * One moment of a reveal. `w`/`h`: the window's width and height (fractions); `ui`: the page's
 * opacity; `bars`, `frame`, `surface`: layer power; `flare`, `scan`, `glitch`: the opening effects;
 * `draw`: how much of the contours is drawn; `spread`: how far the bars still have to travel in.
 */
type Pose = { w: number; h: number; ui: number; bars: number; flare: number; scan: number; glitch: number; frame: number; surface: number; draw: number; spread: number; level: number };
const REST: Pose = { w: 1, h: 1, ui: 1, bars: 1, flare: 0, scan: 0, glitch: 0, frame: 1, surface: 1, draw: 1, spread: 0, level: 1 };
const DARK: Pose = { w: 0, h: LINE_H, ui: 0, bars: 0, flare: 0, scan: 0, glitch: 0, frame: 0, surface: 0, draw: 1, spread: 0, level: 0.6 };

type Kind = RevealKind | "pending";
const isOpen = (kind: Kind): kind is OpenKind => kind === "full" || kind === "short" || kind === "unfold" || kind === "late";
const revealTotal = (kind: Kind) => (kind === "fold" ? FOLD : kind === "close" ? CLOSE : isOpen(kind) ? OPEN[kind].total : 0);

function revealPose(kind: Kind, e: number): Pose {
  if (kind === "none") return REST;
  if (kind === "pending") return DARK;
  if (kind === "fold") {
    const p = easeIn(span(e, 0, FOLD));
    return { ...REST, h: lerp(1, STRIP_H, p), glitch: Math.sin(Math.PI * span(e, 0, FOLD * 0.8)) * 0.8, scan: span(e, FOLD * 0.4, FOLD), bars: 1 + 0.8 * p, frame: 1 + 0.4 * p };
  }
  if (kind === "close") {
    const cut = CLOSE * CLOSE_SPLIT;
    const p = easeIn(span(e, 0, cut));
    const q = easeIn(span(e, cut, CLOSE));
    return {
      w: 1 - q,
      h: lerp(lerp(1, STRIP_H, p), LINE_H, q),
      ui: 1 - span(e, cut * 0.7, CLOSE * 0.9),
      bars: (1 + 0.8 * p) * (1 - q),
      flare: pulse(e, cut, cut + 60, CLOSE),
      scan: p * (1 - q),
      glitch: Math.sin(Math.PI * span(e, 0, cut)) * 0.9,
      frame: (1 + 0.3 * p) * (1 - q),
      surface: 1 - q,
      draw: 1,
      spread: 0,
      level: 1 - 0.4 * q,
    };
  }
  const t = OPEN[kind];
  if (kind === "late") {
    return { ...REST, draw: easeOut(span(e, ...t.frame)), spread: 1 - easeOut(span(e, 0, 500)), frame: 1 + 1.2 * pulse(e, 300, 450, 760), bars: span(e, 0, 400) };
  }
  const unfold = kind === "unfold";
  const line = easeOut(span(e, ...t.line));
  const strip = easeOut(span(e, ...t.strip));
  const expand = easeOut(span(e, ...t.expand));
  const flash = pulse(e, t.frame[0], t.frame[0] + (t.frame[1] - t.frame[0]) * 0.25, t.frame[1]);
  return {
    w: unfold ? 1 : lerp(0.02, 1, line),
    h: unfold || e >= t.expand[0] ? lerp(STRIP_H, 1, expand) : lerp(LINE_H, STRIP_H, strip),
    ui: unfold ? 1 : span(e, t.strip[0], t.strip[1]),
    bars: unfold ? 1 + 0.8 * (1 - expand) : line * (1 + 1.2 * (1 - expand)),
    flare: unfold ? 0 : pulse(e, t.line[0], (t.line[0] + t.line[1]) / 2, t.strip[1] + 80),
    scan: (unfold ? 1 : span(e, t.line[0], t.strip[1])) * (1 - span(e, t.expand[0] + (t.expand[1] - t.expand[0]) * 0.3, t.expand[1])),
    glitch: Math.sin(Math.PI * span(e, ...t.distort)) * (unfold ? 0.7 : 1),
    frame: (unfold ? 1 : 0.3 + 0.7 * strip) + 1.3 * flash,
    surface: unfold ? 1 : strip,
    draw: 1,
    spread: 0,
    level: unfold ? 1 : 0.55 + 0.45 * span(e, 0, t.expand[1]),
  };
}

type Box = { x: number; y: number; w: number; h: number };

/** Layout position relative to the stage (offsets, since the element itself carries a transform). */
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

function createAdminEngine(host: HTMLDivElement, panelRef: RefObject<HTMLElement | null>, initialMotion: MotionLevel, cb: { ready: () => void; fail: () => void }) {
  const fineQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
  let compact = window.innerWidth < 768;
  const maxDpr = () => Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
  let dpr = maxDpr();

  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x030203, 1);
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, DIST);

  /* ---------------------------------------------------------------- the dark */
  const clockU = { value: 0 };
  const voidU = { uTime: clockU, uLevel: { value: 0.6 }, uAspect: { value: 1 }, uShift: { value: [0, 0] }, uCentre: { value: [0, 0] }, uGlow: { value: [0.3, 0.3] }, uBeam: { value: 0 } };
  const backdropGeo = new BufferGeometry();
  backdropGeo.setAttribute("position", new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const backdrop = new Mesh(backdropGeo, new ShaderMaterial({ uniforms: voidU, vertexShader: VOID_VERTEX, fragmentShader: VOID_FRAGMENT, depthWrite: false, depthTest: false }));
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  const emberCount = EMBERS.wide;
  const emberGeo = new BufferGeometry();
  const emberSeeds = new Float32Array(emberCount * 4);
  for (let i = 0; i < emberCount; i++) emberSeeds.set([hash(i * 1.3 + 7), hash(i * 2.1 + 3), hash(i * 3.7 + 1), hash(i * 5.3 + 9)], i * 4);
  emberGeo.setAttribute("position", new Float32BufferAttribute(new Float32Array(emberCount * 3), 3));
  emberGeo.setAttribute("aSeed", new Float32BufferAttribute(emberSeeds, 4));
  const emberMat = new ShaderMaterial({
    uniforms: {
      uTime: clockU,
      uPixel: { value: 1 },
      uAlpha: { value: 0 },
      uSize: { value: 0.045 },
      uPull: { value: 0 },
      uCenter: { value: new Vector3() },
      uBox: { value: new Vector3(7, 4.5, 2.5) },
      uColor: { value: RED.clone() },
      uHot: { value: PALE.clone() },
    },
    vertexShader: EMBER_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const embers = new Points(emberGeo, emberMat);
  embers.position.z = -2.5;
  embers.frustumCulled = false;
  embers.renderOrder = -5;
  scene.add(embers);

  /* ---------------------------------------------------------------- the window */
  const con = new Group();
  /** Built in CSS px; the page is mapped onto it. Squashed by the reveal. */
  const px = new Group();
  /** The detached bars and the flare: px too, but never squashed vertically. */
  const lift = new Group();
  con.add(px, lift);
  scene.add(con);

  const alertU = { value: 0 };
  const lightU = { value: [0, 0] };
  type RibbonOptions = { core: number; level: number; color?: Color; heat?: number; dash?: number; shine?: number };
  const ribbonMaterial = (o: RibbonOptions) =>
    new ShaderMaterial({
      uniforms: {
        uColor: { value: (o.color ?? RED).clone() },
        uHot: { value: PALE.clone() },
        uAlertColor: { value: ALERT.clone() },
        uAlert: alertU,
        uLevel: { value: o.level },
        uDraw: { value: 1 },
        uCore: { value: o.core },
        uDash: { value: o.dash ?? 0 },
        uShine: { value: o.shine ?? 0 },
        uLight: o.shine ? lightU : { value: [0, 0] },
        uHeat: { value: o.heat ?? 0 },
        uRun: { value: 0 },
        uRunLevel: { value: 0 },
      },
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
  const glowMaterial = (fragmentShader: string, uniforms: Record<string, { value: unknown }>) =>
    new ShaderMaterial({ uniforms, vertexShader: UV_VERTEX, fragmentShader, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

  const surfaceMat = new ShaderMaterial({
    uniforms: {
      uSize: { value: [1, 1] },
      uCut: { value: 16 },
      uAlpha: { value: 0.86 },
      uLevel: { value: 0 },
      uScan: { value: 0 },
      uGlitch: { value: 0 },
      uSeed: { value: 0 },
      uCharge: { value: 0 },
      uSurge: { value: 0 },
      uAlert: alertU,
      uTime: clockU,
      uPointer: { value: [0, 0] },
      uPointerOn: { value: 0 },
      uSheen: { value: [0, 0, 0] },
      uColor: { value: RED.clone() },
      uPale: { value: PALE.clone() },
      uAlertColor: { value: ALERT.clone() },
    },
    vertexShader: UV_VERTEX,
    fragmentShader: SURFACE_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const haloMat = glowMaterial(HALO_FRAGMENT, { uSize: { value: [1, 1] }, uBox: { value: [1, 1] }, uCut: { value: 16 }, uLevel: { value: 0 }, uLight: { value: [0, 0] }, uColor: { value: DEEP.clone().lerp(RED, 0.4) } });
  const flareMat = glowMaterial(FLARE_FRAGMENT, { uColor: { value: RED.clone() }, uPale: { value: PALE.clone() }, uLevel: { value: 0 } });

  const frameMat = ribbonMaterial({ core: 0.22, level: 1, heat: 0.3, shine: 0.8 });
  const echoMat = ribbonMaterial({ core: 0.25, level: 0.3, color: RED.clone().lerp(PALE, 0.25), shine: 0.5 });
  const ghostMat = ribbonMaterial({ core: 0.3, level: 0.16, color: DEEP, dash: 90 });
  const innerMat = ribbonMaterial({ core: 0.3, level: 0.42, color: PALE.clone().lerp(RED, 0.35), shine: 0.4 });
  const railMat = ribbonMaterial({ core: 0.45, level: 1.1, heat: 0.45, shine: 0.6 });
  const cornerMat = ribbonMaterial({ core: 0.3, level: 0.9, heat: 0.3, color: RED.clone().lerp(PALE, 0.15), shine: 0.7 });
  const barMat = ribbonMaterial({ core: 0.3, level: 0.95, heat: 0.2 });
  const slabMat = ribbonMaterial({ core: 0.6, level: 1.1, heat: 0.45 });
  const ringMat = ribbonMaterial({ core: 0.35, level: 0, heat: 0.6 });

  const unit = new PlaneGeometry(1, 1);
  const empty = new BufferGeometry();
  const ringGeo = strip(circle(100, 96), 4);
  const shared = new Set<BufferGeometry>([unit, empty, ringGeo]);
  const replace = (mesh: Mesh, geometry: BufferGeometry) => {
    if (!shared.has(mesh.geometry) && mesh.geometry !== geometry) mesh.geometry.dispose();
    mesh.geometry = geometry;
  };
  const place = (mesh: Mesh, parent: Object3D, z: number, order = 0) => {
    mesh.position.z = z;
    mesh.renderOrder = order;
    parent.add(mesh);
    return mesh;
  };

  const ghost = place(new Mesh(empty, ghostMat), px, Z.ghost, -4);
  const halo = place(new Mesh(unit, haloMat), px, Z.halo, -3);
  const surface = place(new Mesh(unit, surfaceMat), px, Z.surface, -2);
  const inner = place(new Mesh(empty, innerMat), px, 0);
  const outline = place(new Mesh(empty, frameMat), px, Z.frame);
  const echo = place(new Mesh(empty, echoMat), px, Z.echo);
  const rails = [place(new Mesh(empty, railMat), px, Z.rails), place(new Mesh(empty, railMat), px, Z.rails)];
  const corners = [0, 1, 2, 3].map(() => place(new Mesh(empty, cornerMat), px, Z.corners));
  const ring = place(new Mesh(ringGeo, ringMat), px, Z.ring);
  ring.visible = false;
  const tears = Array.from({ length: TEARS }, (_, i) => {
    const material = glowMaterial(TEAR_FRAGMENT, { uColor: { value: RED.clone().lerp(PALE, i % 2 ? 0.5 : 0.1) }, uLevel: { value: 0 } });
    const mesh = place(new Mesh(unit, material), px, Z.tears);
    mesh.visible = false;
    return { mesh, material, level: 0.6 + hash(i * 4.1) * 0.8 };
  });
  /** The bars: a thin line with a stepped, thicker section and a cap; the bottom one is the top one turned around. */
  const barGeos = { line: empty, slab: empty, cap: empty };
  const barGroups = [new Group(), new Group()];
  const barMeshes = barGroups.flatMap((group, i) => {
    group.position.z = Z.bars;
    group.rotation.z = i ? Math.PI : 0;
    lift.add(group);
    return [new Mesh(empty, barMat), new Mesh(empty, slabMat), new Mesh(empty, slabMat)].map((mesh) => {
      group.add(mesh);
      return mesh;
    });
  });
  const flare = new Mesh(unit, flareMat);
  flare.position.z = Z.flare;
  flare.visible = false;
  lift.add(flare);

  /* ---------------------------------------------------------------- layout */
  let W = 0;
  let H = 0;
  let f = 1;
  let k = 1;
  let hostLeft = 0;
  let hostTop = 0;
  const panelBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  let geo = WIDE;
  let shapeKey = "";
  let dirty = true;
  const conRest = new Vector3();

  function resize() {
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    f = H / (2 * TAN);
    k = DIST / f;
    voidU.uAspect.value = W / H;
    emberMat.uniforms.uPixel.value = (H * dpr) / (2 * TAN);
    const halfH = (DIST - embers.position.z) * TAN;
    emberMat.uniforms.uBox.value.set(halfH * camera.aspect * 1.05, halfH * 1.05, 2.5);
    emberGeo.setDrawRange(0, compact ? EMBERS.compact : EMBERS.wide);
  }

  function buildWindow() {
    const hw = panelBox.w / 2;
    const hh = panelBox.h / 2;
    geo = compact ? COMPACT : WIDE;
    const { m, c, rail, ext, step, arm } = geo;
    const X = hw + m;
    const Y = hh + m;
    const a = Math.min(Y * 0.3, Y - c - rail - 8);
    surface.scale.set(2 * X, 2 * Y, 1);
    surfaceMat.uniforms.uSize.value = [2 * X, 2 * Y];
    surfaceMat.uniforms.uCut.value = c;
    halo.scale.set(2 * (X + HALO_PAD), 2 * (Y + HALO_PAD), 1);
    haloMat.uniforms.uSize.value = [2 * (X + HALO_PAD), 2 * (Y + HALO_PAD)];
    haloMat.uniforms.uBox.value = [X, Y];
    haloMat.uniforms.uCut.value = c;
    replace(inner, strip(chamfered(hw - 0.5, hh - 0.5, Math.min(6, hh)), 4));
    replace(outline, strip(frameShape(X, Y, c, rail, a), 10));
    replace(echo, strip(frameShape(X + 6, Y + 6, c + 2.5, rail, a), 4));
    replace(ghost, strip(frameShape(X + 14, Y + 14, c + 6, rail, a), 5));
    const rx = X + rail + 7;
    const ra = Math.max(0, a * 0.85);
    const railShape: Pt[] = [
      [rx - 5, ra + 5],
      [rx, ra],
      [rx, -ra],
      [rx - 5, -ra - 5],
    ];
    replace(rails[0], ra > 6 ? strip(railShape, 8, false) : empty);
    replace(rails[1], ra > 6 ? strip(mirror(railShape, -1, 1), 8, false) : empty);
    const cx = X + 8;
    const cy = Y + 8;
    const cc = c + 3;
    const reach = Math.min(arm, cx * 0.4, cy * 0.6);
    const cornerShape: Pt[] = [
      [-cx, cy - cc - reach],
      [-cx, cy - cc],
      [-cx + cc, cy],
      [-cx + cc + reach, cy],
    ];
    [
      [1, 1],
      [-1, 1],
      [-1, -1],
      [1, -1],
    ].forEach(([sx, sy], i) => replace(corners[i], strip(mirror(cornerShape, sx, sy), 6, false)));
    const L = -(X + ext);
    const R = X + ext * 0.35;
    const s = L + (R - L) * 0.32;
    for (const geometry of Object.values(barGeos)) if (!shared.has(geometry)) geometry.dispose();
    barGeos.line = strip(
      [
        [L, 0],
        [s, 0],
        [s + step, step],
        [R, step],
      ],
      5,
      false,
    );
    barGeos.slab = strip(
      [
        [s + step + 8, step],
        [R, step],
      ],
      10,
      false,
    );
    barGeos.cap = strip(
      [
        [L, 0],
        [L + 16, 0],
      ],
      9,
      false,
    );
    barMeshes.forEach((mesh, i) => (mesh.geometry = [barGeos.line, barGeos.slab, barGeos.cap][i % 3]));
  }

  /** Reads the layout: canvas size and where the window sits. */
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
    const shape = `${panelBox.w}x${panelBox.h}:${compact}`;
    if (shape !== shapeKey) {
      shapeKey = shape;
      buildWindow();
    }
  }

  /* ---------------------------------------------------------------- state */
  let motion = initialMotion;
  let kind: Kind = "pending";
  let kindStart = 0;
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
  let celebrateAt = -1e7;
  let draftAt = -1e7;
  let errorAt = -1e7;
  let pending = false;
  let tornAt = 0;
  let jitter = 0;
  let eyeSet = false;
  const pointer = { x: 0, y: 0, seen: false };
  const aim = { x: 0, y: 0, near: 0 };
  const eye = { x: 0, y: 0 };
  const pivotX = spring();
  const pivotY = spring();
  const tiltX = osc();
  const tiltY = osc();
  const approach = osc();
  const shake = osc();
  const eyeX = osc();
  const eyeY = osc();
  const charge = spring();
  const lightOn = spring();
  const euler = new Euler();
  const quat = new Quaternion();
  const pivotV = new Vector3();
  const turned = new Vector3();
  const ray = new Vector3();
  const M = new Matrix4();
  const A = new Matrix4();
  const panelStyle = { transform: "\u0000", opacity: "\u0000", filter: "\u0000" };
  let slowFrames = 0;
  let sampled = 0;

  const elapsed = (now: number) => {
    if (kind === "none") return 1e9;
    if (kind === "pending") return 0;
    const raw = now - kindStart;
    if (skipAt < 0) return raw;
    return lerp(skipFrom, revealTotal(kind), easeOut(span(now - skipAt, 0, 260)));
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
    const total = revealTotal(kind);
    const pose = revealPose(kind, e);
    const revealing = kind !== "pending" && kind !== "none" && e < total;
    const closed = kind === "close" && e >= total;
    const settled = !revealing && !closed && kind !== "pending" && kind !== "fold";
    if (pending || (closed && e < total + 6000)) awakeUntil = Math.max(awakeUntil, now + 600);
    const awake = full ? clamp01((awakeUntil - now) / 1500) : 0;
    const alive = full ? Math.max(awake, revealing ? 1 : 0) : 0;
    clock += dt * alive;

    const hw = panelBox.w / 2;
    const hh = panelBox.h / 2;
    const cx = hostLeft + W / 2;
    const cy = hostTop + H / 2;
    const pcx = hostLeft + panelBox.x + hw;
    const pcy = hostTop + panelBox.y + hh;

    /* pointer: tilt around the point under it, come closer along its ray; the eye follows it */
    const fine = moving && fineQuery.matches;
    const seen = fine && pointer.seen;
    const over = seen && Math.abs(pointer.x - pcx) < hw + geo.m && Math.abs(pointer.y - pcy) < hh + geo.m;
    const flatten = now - typedAt < 1100 || now - scrolledAt < 800 || (seen && now - movedAt > 2400) || inDialog();
    const frozen = pressing || now - releasedAt < 250;
    const reach = full ? 1 : 0.45;
    if (!frozen) {
      if (seen && settled && !flatten) {
        aim.x = soft(((pointer.x - pcx) / hw) * 1.1);
        aim.y = soft(((pointer.y - pcy) / hh) * 1.1);
        aim.near = over ? 1 : 0;
        pivotX.target = clamp(pointer.x, pcx - hw, pcx + hw);
        pivotY.target = clamp(pointer.y, pcy - hh, pcy + hh);
      } else aim.x = aim.y = aim.near = 0;
      if (seen && settled) {
        eye.x = soft(((pointer.x - cx) / (W / 2)) * 1.2) * EYE.x * W * reach;
        eye.y = soft(((pointer.y - cy) / (H / 2)) * 1.2) * EYE.y * H * reach;
      } else if (!seen) {
        const rest = compact ? EYE_REST.compact : EYE_REST.wide;
        const sway = full && !fine ? 1 : 0;
        eye.x = (rest.x + Math.sin(clock * 0.35) * 0.05 * sway) * W;
        eye.y = (rest.y + Math.cos(clock * 0.27) * 0.02 * sway) * H;
      }
    }
    if (!eyeSet || !moving) {
      eyeSet = true;
      eyeX.value = eye.x;
      eyeY.value = eye.y;
      eyeX.velocity = eyeY.velocity = 0;
    } else {
      oscillate(eyeX, eye.x, 0.8, 0.6, dt);
      oscillate(eyeY, eye.y, 0.8, 0.6, dt);
    }
    follow(pivotX, 0.12, dt);
    follow(pivotY, 0.12, dt);
    const damping = flatten ? 0.85 : full ? 0.4 : 0.8;
    oscillate(tiltY, aim.x * TILT_Y * reach, 1.4, damping, dt);
    oscillate(tiltX, aim.y * TILT_X * reach, 1.4, damping, dt);
    oscillate(approach, aim.near * APPROACH * reach, 1.6, 0.55, dt);
    oscillate(shake, 0, 6.5, 0.22, dt);

    /* the publish charge and its confirmation, drafts and errors */
    charge.target = pending ? 1 : 0;
    track(charge, 0.35);
    const since = age(celebrateAt);
    const surge = pulse(since, 0, 140, 1300);
    const ringT = span(since, 40, 1000);
    const pull = pulse(since, 0, 380, 1500);
    const sweep = since >= 0 && since < 900 ? 1 - span(since, 0, 900) * 0.6 : 0;
    const dim = pulse(age(draftAt), 0, 200, 900);
    const alert = pulse(age(errorAt), 0, 60, 650);
    const glitch = Math.max(pose.glitch, pulse(age(errorAt), 0, 40, 280) * 0.55);
    if (glitch > 0.01 && now - tornAt > 45) {
      tornAt = now;
      jitter = Math.random() * 2 - 1;
      surfaceMat.uniforms.uSeed.value = Math.random() * 100;
      for (const { mesh } of tears) {
        mesh.position.set((Math.random() - 0.5) * hw, (Math.random() - 0.5) * 2 * hh, Z.tears);
        mesh.scale.set((0.3 + Math.random() * 0.6) * 2 * (hw + geo.m), 1.5 + Math.random() * 4, 1);
      }
    } else if (glitch <= 0.01) jitter = 0;

    /* window pose */
    euler.set(tiltX.value, tiltY.value, 0);
    quat.setFromEuler(euler);
    pivotV.set((pivotX.value - cx) * k - conRest.x, -(pivotY.value - cy) * k - conRest.y, 0);
    turned.copy(pivotV).applyQuaternion(quat);
    con.position.copy(conRest).add(pivotV).sub(turned);
    ray.set(conRest.x + pivotV.x - eyeX.value * k, conRest.y + pivotV.y + eyeY.value * k, -DIST).normalize();
    con.position.addScaledVector(ray, -approach.value * k);
    con.position.x += (shake.value + jitter * 9 * glitch) * k;
    con.quaternion.copy(quat);
    const h = Math.max(0.002, pose.h);
    const w = Math.max(0.001, pose.w);
    px.scale.set(k * w, k * h, k);
    lift.scale.set(k * w, k, k);
    const barY = (hh + geo.m + geo.gap) * h + pose.spread * 40;
    barGroups[0].position.y = barY;
    barGroups[1].position.y = -barY;

    /* the eye: off-axis, with a lens shift that keeps the page plane exactly in place */
    camera.position.set(eyeX.value * k, -eyeY.value * k, DIST);
    camera.setViewOffset(W, H, -eyeX.value, -eyeY.value, W, H);

    /* the dark and the embers */
    voidU.uLevel.value = pose.level;
    voidU.uShift.value[0] = (-eyeX.value / H) * 0.12;
    voidU.uShift.value[1] = (eyeY.value / H) * 0.12;
    voidU.uCentre.value[0] = ((pcx - hostLeft) / W - 0.5) * (W / H);
    voidU.uCentre.value[1] = 0.5 - (pcy - hostTop) / H;
    voidU.uGlow.value[0] = ((hw + geo.m) / H) * 1.25;
    voidU.uGlow.value[1] = ((hh + geo.m) / H) * Math.max(0.12, h) * 1.3;
    voidU.uBeam.value = (0.35 + 0.65 * pose.surface) * (1 + charge.value * 0.4 + surge * 0.9);
    emberMat.uniforms.uAlpha.value = (0.3 + 0.4 * pose.surface) * (kind === "pending" ? 0.5 : 1);
    emberMat.uniforms.uPull.value = pull * 0.9;
    emberMat.uniforms.uCenter.value.copy(con.position).sub(embers.position);

    /* layers */
    const breath = moving ? 0.5 + 0.5 * Math.sin(now / 160) : 1;
    const power = pose.frame * (1 + surge * 1.6 + charge.value * 0.3 * breath) * (1 - dim * 0.4);
    frameMat.uniforms.uLevel.value = 1.05 * power;
    frameMat.uniforms.uHeat.value = 0.3 + surge * 0.7;
    frameMat.uniforms.uRun.value = pending ? ((now / 1000) * 0.55) % 1 : span(since, 0, 900);
    frameMat.uniforms.uRunLevel.value = Math.max(charge.value * 0.8, sweep);
    echoMat.uniforms.uLevel.value = 0.3 * power;
    railMat.uniforms.uLevel.value = 1.1 * power;
    cornerMat.uniforms.uLevel.value = 0.9 * power;
    for (const material of [frameMat, echoMat, railMat, cornerMat]) material.uniforms.uDraw.value = pose.draw;
    ghostMat.uniforms.uLevel.value = 0.16 * pose.surface * (1 + surge);
    innerMat.uniforms.uLevel.value = 0.42 * pose.surface * (1 + surge * 1.2);
    barMat.uniforms.uLevel.value = 0.95 * pose.bars * (1 + surge);
    slabMat.uniforms.uLevel.value = 1.1 * pose.bars * (1 + surge);
    for (const material of [barMat, slabMat]) {
      material.uniforms.uRun.value = span(since, 0, 700);
      material.uniforms.uRunLevel.value = sweep;
    }
    alertU.value = alert;
    surfaceMat.uniforms.uLevel.value = pose.surface;
    surfaceMat.uniforms.uScan.value = pose.scan * 1.3;
    surfaceMat.uniforms.uGlitch.value = glitch;
    surfaceMat.uniforms.uCharge.value = charge.value;
    surfaceMat.uniforms.uSurge.value = surge;
    for (const tear of tears) {
      tear.mesh.visible = glitch > 0.02;
      tear.material.uniforms.uLevel.value = glitch * tear.level;
    }
    ring.visible = ringT > 0 && ringT < 1;
    ring.scale.setScalar(lerp(0.15, ((Math.max(hw, hh) + geo.m) / 100) * 1.25, easeOut(ringT)));
    ringMat.uniforms.uLevel.value = (1 - ringT) * 1.1;
    const loader = closed && moving ? 0.22 + 0.12 * Math.sin(now / 200) : 0;
    flareMat.uniforms.uLevel.value = pose.flare * 1.5 + loader;
    flare.visible = flareMat.uniforms.uLevel.value > 0.01;
    flare.scale.set(360 / Math.max(w, 0.25), 90, 1);

    /* light: a spot under the pointer, contours and sheen respond to the tilt */
    const tY = tiltY.value / TILT_Y;
    const tX = tiltX.value / TILT_X;
    lightOn.target = seen && settled ? 1 : 0;
    track(lightOn, 0.4);
    lightU.value[0] = tY;
    lightU.value[1] = -tX;
    const tilt = Math.min(1, Math.hypot(tY, tX));
    surfaceMat.uniforms.uPointer.value = [pointer.x - pcx, -(pointer.y - pcy)];
    surfaceMat.uniforms.uPointerOn.value = lightOn.value;
    surfaceMat.uniforms.uSheen.value = [-tY * 0.35, tX * 0.35, tilt];
    haloMat.uniforms.uLight.value = [-tY * 12, tX * 9];
    haloMat.uniforms.uLevel.value = 0.42 * pose.surface * (1 + surge * 1.5 + charge.value * 0.4) + pose.flare * 0.2;

    renderer.render(scene, camera);
    register(pose.ui, full ? glitch : 0);

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
      revealing ||
      Math.abs(tiltX.velocity) + Math.abs(tiltY.velocity) + Math.abs(approach.velocity) + Math.abs(shake.velocity) > 1e-3 ||
      Math.abs(eyeX.velocity) + Math.abs(eyeY.velocity) > 1e-2 ||
      Math.abs(eyeX.value - eye.x) + Math.abs(eyeY.value - eye.y) > 0.05 ||
      Math.abs(pivotX.value - pivotX.target) + Math.abs(pivotY.value - pivotY.target) > 0.05 ||
      Math.abs(charge.value - charge.target) > 1e-3 ||
      Math.abs(lightOn.value - lightOn.target) > 1e-3 ||
      (since > -PUBLISH.accent - 100 && since < 1600) ||
      age(errorAt) < 700 ||
      age(draftAt) < 950
    );
  }

  /** The 3D-to-page mapping for an object built in px: CSS px around the canvas centre, y down, eye at z = f. */
  function mapping(obj: Object3D, centreX: number, centreY: number) {
    M.makeScale(1, -1, 1);
    A.multiplyMatrices(obj.matrixWorld, M).premultiply(camera.matrixWorldInverse);
    M.makeScale(1 / k, -1 / k, 1 / k);
    A.premultiply(M);
    M.makeTranslation(0, 0, f);
    A.premultiply(M);
    return { ax: hostLeft + W / 2 - centreX + eyeX.value, ay: hostTop + H / 2 - centreY + eyeY.value, el: A.elements };
  }
  const css = (ax: number, ay: number, el: ArrayLike<number>) =>
    `translate(${ax.toFixed(2)}px, ${ay.toFixed(2)}px) perspective(${f.toFixed(2)}px) matrix3d(${Array.from(el, (v) => +v.toFixed(6)).join(",")})`;

  function register(ui: number, smear: number) {
    const panel = panelRef.current;
    if (!panel || !panelBox.w) return;
    const write = (transform: string, opacity: string, filter: string) => {
      if (transform !== panelStyle.transform) panel.style.transform = panelStyle.transform = transform;
      if (opacity !== panelStyle.opacity) panel.style.opacity = panelStyle.opacity = opacity;
      if (filter !== panelStyle.filter) panel.style.filter = panelStyle.filter = filter;
    };
    // Until the opening starts the page keeps its own place.
    if (kind === "pending") return write("", "", "");
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const hw = panelBox.w / 2;
    const hh = panelBox.h / 2;
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
    write(worst < 0.25 ? "" : css(ax, ay, el), ui > 0.999 ? "" : ui.toFixed(3), smear > 0.5 ? "url(#ax-smear-strong)" : smear > 0.12 ? "url(#ax-smear)" : "");
  }

  /* ---------------------------------------------------------------- loop & lifecycle */
  let raf = 0;
  let ready = false;
  let visible = true;
  let disposed = false;
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
  for (const el of [stage, panelRef.current]) if (el) resizes.observe(el);

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
    reveal(next: RevealKind) {
      kind = motion === "off" ? "none" : next;
      kindStart = performance.now();
      skipAt = -1;
      dirty = true;
      // Draw at once so the page takes its first pose before the browser paints it.
      if (ready) frame(kindStart);
      poke(revealTotal(kind) + 1500);
    },
    skip() {
      if (!isOpen(kind)) return;
      const now = performance.now();
      const e = elapsed(now);
      if (skipAt < 0 && e < revealTotal(kind)) {
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
        celebrateAt = now + PUBLISH.accent;
      } else if (signal === "error") {
        pending = false;
        errorAt = now;
        if (motion !== "off") shake.velocity += 260;
      } else if (signal === "draft") draftAt = now;
      poke(signal === "publish" ? PUBLISH.accent + 3000 : 2600);
    },
    setMotion(next: MotionLevel) {
      motion = next;
      if (motion === "off" && kind !== "pending") kind = "none";
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
      const panel = panelRef.current;
      if (panel) panel.style.transform = panel.style.opacity = panel.style.filter = "";
      const geometries = new Set<BufferGeometry>(shared);
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof Points) {
          geometries.add(object.geometry);
          for (const material of [object.material].flat() as Material[]) materials.add(material);
        }
      });
      for (const geometry of Object.values(barGeos)) geometries.add(geometry);
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
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
  ref?: Ref<AdminSceneHandle>;
  onReady: () => void;
  onFail: () => void;
};

export default function AdminScene({ panel, motion, ref, onReady, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ready = useEffectEvent(() => onReady());
  const fail = useEffectEvent(() => onFail());
  const initialMotion = useEffectEvent(() => motion);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: Engine;
    try {
      engine = createAdminEngine(host, panel, initialMotion(), { ready: () => ready(), fail: () => fail() });
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
  }, [panel]);

  useEffect(() => engineRef.current?.setMotion(motion), [motion]);
  useImperativeHandle(
    ref,
    () => ({
      reveal: (kind) => engineRef.current?.reveal(kind),
      skip: () => engineRef.current?.skip(),
      signal: (signal) => engineRef.current?.signal(signal),
    }),
    [],
  );

  return <div ref={hostRef} aria-hidden="true" className="ax-scene" />;
}
