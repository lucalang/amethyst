"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { follow, radialTexture, spring, studioEnvironment, type Spring } from "@/components/showcase/three-kit";
import type { MotionLevel } from "@/lib/preferences";
import { SUMMON, UNLOCK, type SummonKind } from "./timing";
import { GLYPHS } from "./vault-seal";

/**
 * The Vault as a real object: a thick, machined seal standing in an open dark space, summoned once per visit.
 * Everything here is decoration. The code field, buttons and rewards stay in the DOM above the canvas.
 */

export type ScenePhase = "idle" | "verifying" | "granted" | "already" | "invalid" | "unavailable" | "locked" | "lost";
export type VaultSceneHandle = { summon: (kind: SummonKind | "none") => void; skip: () => void };

const RED = 0xff1f3d;
const DEEP = 0xa10a1f;
const PALE = 0xffd9de;
const ASH = 0x8c7f82;
const TAU = Math.PI * 2;
const FOV = 30;
/** World radius kept inside the anchor element; the aura, rays and floor spill past it on purpose. */
const FIT_RADIUS = 1.62;
/** Half the width of the engraving texture in world units. */
const R_TEX = 1.42;
const TEETH = 24;
const SEGMENTS = 12;
const EMBERS = 96;
/** Idle drift of the outer ring, the rune ring and the star plate (radians per second). */
const DRIFT = [0.07, -0.12, 0.2];
/** Each ring locks on its own symmetry. */
const SYMMETRY = [TAU / 12, TAU / 30, TAU / 8];

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (e: number, from: number, to: number) => clamp01((e - from) / (to - from));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeBack = (t: number) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
/** A lub-dub every 1.6 seconds for the lockdown. */
const heartbeat = (now: number) => {
  const p = (now % 1600) / 1600;
  return Math.exp(-((p - 0.06) ** 2) / 0.0012) + 0.6 * Math.exp(-((p - 0.22) ** 2) / 0.0012);
};

/* ----------------------------------------------------------------------------
 * Painted textures
 * ------------------------------------------------------------------------- */

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, color: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  if (color) texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Strokes twice, a wide faint pass for the glow and then the line itself, so engravings read as lit from inside. */
function glowStroke(ctx: CanvasRenderingContext2D, width: number, alpha: number, path?: Path2D) {
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

/** Every ring's engravings on one texture, laid out in polar coordinates (clockwise from twelve o'clock). */
function engrave(ctx: CanvasRenderingContext2D) {
  const size = ctx.canvas.width;
  const px = size / 2 / R_TEX;
  ctx.translate(size / 2, size / 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ctx.fillStyle = "#fff";
  const ring = (r: number, width: number, alpha = 1) => {
    ctx.beginPath();
    ctx.arc(0, 0, r * px, 0, TAU);
    glowStroke(ctx, width, alpha);
  };
  const spoke = (angle: number, r0: number, r1: number, width: number, alpha = 1) => {
    ctx.beginPath();
    ctx.moveTo(Math.sin(angle) * r0 * px, -Math.cos(angle) * r0 * px);
    ctx.lineTo(Math.sin(angle) * r1 * px, -Math.cos(angle) * r1 * px);
    glowStroke(ctx, width, alpha);
  };
  const glyphs = GLYPHS.map((d) => new Path2D(d));

  // Outer ring: a double rule and a dial, longer every 30°.
  ring(1.338, 2.2, 0.85);
  ring(1.152, 1.4, 0.5);
  for (let i = 0; i < 72; i++) spoke((i / 72) * TAU, i % 6 ? 1.25 : 1.19, 1.31, i % 6 ? 1.6 : 3, i % 6 ? 0.45 : 1);
  // Rune ring: runes between two rules and a key mark at twelve.
  ring(0.962, 2, 0.75);
  ring(0.823, 2, 0.75);
  for (let i = 1; i < 30; i++) rune(ctx, glyphs[(i * 5 + ((i * i) % 4)) % glyphs.length], (i / 30) * TAU, 0.892 * px, 0.075 * px, 2.2);
  ctx.beginPath();
  ctx.moveTo(0, -0.95 * px);
  ctx.lineTo(-0.03 * px, -0.87 * px);
  ctx.lineTo(0.03 * px, -0.87 * px);
  ctx.closePath();
  glowStroke(ctx, 2.4, 1);
  // Star plate: an inner rule and a stud on each point.
  ring(0.64, 1.6, 0.7);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.arc(Math.sin(a) * 0.72 * px, -Math.cos(a) * 0.72 * px, 0.012 * px, 0, TAU);
    glowStroke(ctx, 2, 1);
  }
  // The doors: rules, broken spokes and four diamonds, clear of the keyhole and the split.
  ring(0.548, 2, 0.8);
  ring(0.525, 1.2, 0.45);
  ring(0.3, 1.6, 0.6);
  for (let i = 0; i < 16; i++) spoke(((i + 0.5) / 16) * TAU, 0.33, i % 2 ? 0.43 : 0.49, 1.6, 0.6);
  for (let i = 0; i < 4; i++) {
    const a = ((i + 0.5) / 4) * TAU;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -0.41 * px);
    ctx.beginPath();
    ctx.moveTo(0, -0.03 * px);
    ctx.lineTo(0.018 * px, 0);
    ctx.lineTo(0, 0.03 * px);
    ctx.lineTo(-0.018 * px, 0);
    ctx.closePath();
    glowStroke(ctx, 1.8, 0.9);
    ctx.restore();
  }
}

/** The summoning circle on the floor. */
function sigil(ctx: CanvasRenderingContext2D) {
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
  // Two squares make an eight-pointed star between the rings.
  for (const offset of [0, Math.PI / 4]) {
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const a = offset + (k / 4) * TAU;
      const x = Math.sin(a) * 0.66 * u;
      const y = -Math.cos(a) * 0.66 * u;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    glowStroke(ctx, 2, 0.5);
  }
  const glyphs = GLYPHS.map((d) => new Path2D(d));
  for (let i = 0; i < 24; i++) rune(ctx, glyphs[(i * 3 + 1) % glyphs.length], ((i + 0.5) / 24) * TAU, 0.81 * u, 0.07 * u, 3, 0.85);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * 0.38 * u, -Math.cos(a) * 0.38 * u);
    ctx.lineTo(Math.sin(a) * (i % 4 ? 0.42 : 0.47) * u, -Math.cos(a) * (i % 4 ? 0.42 : 0.47) * u);
    glowStroke(ctx, 1.6, 0.5);
  }
}

/** Fine lathe marks for the roughness map. */
function grain(ctx: CanvasRenderingContext2D) {
  const size = ctx.canvas.width;
  for (let y = 0; y < size; y++) {
    const g = Math.round(150 + (hash(y) - 0.5) * 70 + (hash(Math.floor(y / 8) + 500) - 0.5) * 40);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(0, y, size, 1);
  }
}

/** A shaft of light: bright at its root, soft at the sides. */
function shaft(ctx: CanvasRenderingContext2D) {
  const { width, height } = ctx.canvas;
  for (let x = 0; x < width; x++) {
    const across = Math.exp(-(((x + 0.5) / width - 0.5) ** 2) / 0.03);
    const along = ctx.createLinearGradient(0, height, 0, 0);
    along.addColorStop(0, `rgba(255,255,255,${across})`);
    along.addColorStop(0.35, `rgba(255,255,255,${across * 0.45})`);
    along.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = along;
    ctx.fillRect(x, 0, 1, height);
  }
}

/* ----------------------------------------------------------------------------
 * Geometry
 * ------------------------------------------------------------------------- */

/** Turns a profile of [radius, depth] points on a lathe and stands it up to face the viewer; corners stay crisp. */
function lathe(profile: [number, number][], segments: number) {
  const points: Vector2[] = [];
  profile.forEach(([radius, depth], index) => {
    points.push(new Vector2(radius, depth));
    if (index > 0 && index < profile.length - 1) points.push(new Vector2(radius, depth));
  });
  const geometry = new LatheGeometry(points, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

const ringProfile = (inner: number, outer: number, back: number, front: number, bevel: number): [number, number][] => [
  [inner, back],
  [outer, back],
  [outer, front - bevel],
  [outer - bevel, front],
  [inner + bevel, front],
  [inner, front - bevel],
  [inner, back],
];

/** A flat band that samples the shared engraving texture at its true radius. */
function inlayGeometry(inner: number, outer: number, thetaStart = 0, thetaLength = TAU) {
  const geometry = new RingGeometry(inner, outer, 160, 1, thetaStart, thetaLength);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / (2 * R_TEX) + 0.5, position.getY(i) / (2 * R_TEX) + 0.5);
  return geometry;
}

function starShape() {
  const shape = new Shape();
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * TAU;
    const r = k % 2 ? 0.668 : 0.765;
    if (k) shape.lineTo(Math.sin(a) * r, Math.cos(a) * r);
    else shape.moveTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  const hole = new Path();
  hole.absarc(0, 0, 0.618, 0, TAU, false);
  shape.holes.push(hole);
  return shape;
}

/** One half of the door (-1 left, 1 right); the notches in their meeting edges make the keyhole. */
function doorShape(side: 1 | -1) {
  const r = 0.6;
  const shape = new Shape();
  shape.moveTo(0, r);
  shape.absarc(0, 0, r, Math.PI / 2, -Math.PI / 2, side === 1);
  const notch: [number, number][] = [
    [0, -0.25],
    [0.078, -0.25],
    [0.047, 0.02],
    [0.083, 0.05],
    [0.104, 0.1],
    [0.088, 0.158],
    [0.047, 0.194],
    [0, 0.205],
  ];
  for (const [x, y] of notch) shape.lineTo(side * x, y);
  shape.lineTo(0, r);
  return shape;
}

/* ----------------------------------------------------------------------------
 * Shaders
 * ------------------------------------------------------------------------- */

const FLOOR_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FLOOR_FRAGMENT = /* glsl */ `
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
  float ink = texture2D(uMap, vUv).r;
  float fade = smoothstep(1.0, 0.7, r);
  float pulse = 0.82 + 0.18 * sin(uTime * 1.4 - r * 7.0);
  gl_FragColor = vec4(uColor * ink * traced * fade * pulse * uGlow, 1.0);
}`;

const EMBER_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uAlpha;
attribute vec4 aSeed;
attribute float aSize;
varying float vAlpha;
varying float vHeat;
void main() {
  float height = 5.6;
  float y = mod(aSeed.w * height + uTime * aSeed.z, height);
  vec3 p = vec3(
    aSeed.x + sin(uTime * 0.6 + aSeed.w * 12.0) * 0.22,
    y - 2.3,
    aSeed.y + cos(uTime * 0.45 + aSeed.w * 9.0) * 0.18
  );
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float life = y / height;
  vAlpha = uAlpha * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.6, 1.0, life));
  vHeat = aSeed.w;
  gl_PointSize = aSize * uPixel / -mv.z;
}`;

const EMBER_FRAGMENT = /* glsl */ `
varying float vAlpha;
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  vec3 color = mix(vec3(1.0, 0.1, 0.2), vec3(1.0, 0.78, 0.66), a * a * (0.3 + vHeat * 0.7));
  gl_FragColor = vec4(color * a * vAlpha, 1.0);
}`;

/* ----------------------------------------------------------------------------
 * Timeline
 * ------------------------------------------------------------------------- */

type Levels = { core: number; aura: number; inlay: number; rays: number; gate: number; teeth: number; dim: number; pale: number; push: number; floor: number };
const LEVEL_KEYS = ["core", "aura", "inlay", "rays", "gate", "teeth", "dim", "pale", "push", "floor"] as const;
/** Smoothing times (seconds) of each level. */
const LEVEL_TIMES: Levels = { core: 0.16, aura: 0.45, inlay: 0.2, rays: 0.3, gate: 0.42, teeth: 0.13, dim: 0.6, pale: 0.4, push: 0.75, floor: 0.5 };

/** What each answer does to the vault, `e` milliseconds after it arrived (Infinity when motion is off). */
function levelsFor(phase: ScenePhase, e: number, charge: number, now: number, still: boolean): Levels {
  switch (phase) {
    case "verifying":
      return { core: 0.62 + (still ? 0 : 0.2 * Math.sin(e / 90)), aura: 0.85, inlay: 0.95, rays: 0, gate: 0, teeth: 0.12, dim: 0, pale: 0, push: 0.32, floor: 0.75 };
    case "granted": {
      const open = e >= UNLOCK.open;
      const settled = e >= UNLOCK.settle;
      return {
        core: open ? (settled ? 1.15 : 2) : 0.75,
        aura: open ? 1.15 : 0.85,
        inlay: 1,
        rays: open ? (settled ? 0.55 : 1) : 0,
        gate: open ? 1 : 0,
        teeth: e >= UNLOCK.retract ? 1 : 0.15,
        dim: 0,
        pale: open ? 0.35 : 0,
        push: open ? (settled ? 0.42 : 0.7) : 0.4,
        floor: open ? 1 : 0.8,
      };
    }
    case "already":
      return { core: 0.45, aura: 0.5, inlay: 0.6, rays: e > 350 ? 0.18 : 0, gate: e > 350 ? 0.1 : 0, teeth: 0.4, dim: 0, pale: 1, push: 0.18, floor: 0.45 };
    case "invalid": {
      const flash = e < 640 ? (Math.floor(e / 160) % 2 ? 0.08 : 1.3) : 0.4;
      return { core: e < 640 ? 0.03 : 0.2, aura: 0.32, inlay: flash, rays: 0, gate: 0, teeth: e < 320 ? -0.35 : 0, dim: 0, pale: 0, push: 0, floor: 0.3 };
    }
    case "unavailable":
      return { core: 0.03, aura: 0.1, inlay: 0.1, rays: 0, gate: 0, teeth: 0, dim: 1, pale: 0, push: -0.08, floor: 0.1 };
    case "locked": {
      const beat = still ? 0.4 : heartbeat(now);
      return { core: 0.05 + beat * 0.15, aura: 0.22 + beat * 0.2, inlay: 0.22 + beat * 0.45, rays: 0, gate: 0, teeth: -1, dim: 0.3, pale: 0, push: -0.12, floor: 0.22 + beat * 0.15 };
    }
    case "lost": {
      const signal = still ? 0.6 : e < 800 ? (hash(Math.floor(e / 50)) > 0.5 ? 1 : 0.1) : 0.55 + 0.25 * Math.sin(now / 700);
      return { core: 0.1 * signal, aura: 0.16, inlay: 0.3 * signal, rays: 0, gate: 0, teeth: 0, dim: 0.75, pale: 0, push: -0.06, floor: 0.12 };
    }
    default:
      return { core: 0.22 + charge * 0.25, aura: 0.42 + charge * 0.38, inlay: 0.34 + charge * 0.5, rays: 0, gate: 0, teeth: 0, dim: 0, pale: 0, push: charge * 0.06, floor: 0.38 + charge * 0.22 };
  }
}

type Intro = { kind: SummonKind; start: number };
type Stage = {
  e: number;
  embers: number;
  trace: number;
  gather: number;
  ripple: number;
  rise: number;
  lights: number;
  cam: number;
  seams: [number, number, number, number];
  spin: number;
  from: { y: number; tilt: number; twist: number; camX: number; camY: number; camZ: number; lookY: number };
};
const AT_REST: Stage = {
  e: Infinity,
  embers: 1,
  trace: 1,
  gather: 1,
  ripple: 1,
  rise: 1,
  lights: 1,
  cam: 1,
  seams: [1, 1, 1, 1],
  spin: 0,
  from: { y: 0, tilt: 0, twist: 0, camX: 0, camY: 0, camZ: 1, lookY: 0 },
};
const FULL_FROM = { y: -3.4, tilt: 0.95, twist: -0.45, camX: 0.9, camY: 3.6, camZ: 1.2, lookY: -1.7 };
const SHORT_FROM = { y: -0.7, tilt: 0.22, twist: -0.1, camX: 0, camY: 0.7, camZ: 1.12, lookY: -0.3 };

/** Where the summon is: darkness, then embers and the floor sigil, the aura gathering, the rise, the seams lighting. */
function stageAt(intro: Intro | null, now: number): Stage {
  if (!intro) return AT_REST;
  const e = now - intro.start;
  if (intro.kind === "full") {
    const s = SUMMON.full;
    return {
      e,
      embers: span(e, 0, 1100),
      trace: easeInOut(span(e, 150, 1500)),
      gather: easeInOut(span(e, 450, 1900)),
      ripple: span(e, 600, 1500),
      rise: span(e, s.rise, 2450),
      lights: span(e, 900, 2300),
      cam: easeInOut(span(e, 0, 2700)),
      seams: [span(e, 1850, 2100), span(e, 2000, 2250), span(e, 2150, 2400), span(e, 2300, 2600)],
      spin: e < s.settle ? span(e, s.rise, s.rise + 500) : 0,
      from: FULL_FROM,
    };
  }
  const s = SUMMON.short;
  return {
    e,
    embers: span(e, 0, 400),
    trace: easeOut(span(e, 0, 500)),
    gather: easeOut(span(e, 0, 600)),
    ripple: 1,
    rise: span(e, s.rise, 700),
    lights: span(e, 0, 600),
    cam: easeInOut(span(e, 0, 900)),
    seams: [span(e, 300, 450), span(e, 380, 530), span(e, 460, 610), span(e, 540, 700)],
    spin: e < s.settle ? 1 - span(e, 500, s.settle) : 0,
    from: SHORT_FROM,
  };
}

/* ----------------------------------------------------------------------------
 * Engine
 * ------------------------------------------------------------------------- */

type Engine = {
  setPhase: (phase: ScenePhase, round: number, instant?: boolean) => void;
  setCharge: (charge: number) => void;
  setMotion: (motion: MotionLevel) => void;
  pulse: () => void;
  summon: (kind: SummonKind | "none") => void;
  skip: () => void;
  dispose: () => void;
};

function createVaultEngine(
  host: HTMLElement,
  anchor: HTMLElement,
  start: { phase: ScenePhase; round: number; charge: number; motion: MotionLevel },
  cb: { ready: () => void; fail: () => void },
): Engine {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const compact = Math.min(window.innerWidth, window.innerHeight) < 640;
  const modest = compact || (navigator.hardwareConcurrency || 4) <= 4;
  const maxDpr = Math.min(window.devicePixelRatio || 1, modest ? 1.5 : 1.75);
  let dpr = maxDpr;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  host.appendChild(canvas);

  const owned: { dispose: () => void }[] = [];
  const own = <T extends { dispose: () => void }>(item: T): T => {
    owned.push(item);
    return item;
  };

  /* Textures and materials, made once and shared. */
  const engraving = own(canvasTexture(1024, 1024, engrave, true));
  engraving.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const lathed = own(canvasTexture(256, 256, grain, false));
  lathed.wrapS = lathed.wrapT = RepeatWrapping;
  const sigilMap = own(canvasTexture(1024, 1024, sigil, false));
  const rayMap = own(canvasTexture(64, 256, shaft, true));
  const glowMap = own(
    radialTexture([
      [0, "rgba(255,255,255,1)"],
      [0.22, "rgba(255,255,255,0.5)"],
      [0.55, "rgba(255,255,255,0.12)"],
      [1, "rgba(255,255,255,0)"],
    ]),
  );
  glowMap.colorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.environment = own(studioEnvironment(renderer, new Color(RED), new Color(DEEP), true, 0.35));
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);

  const metal = new MeshStandardMaterial({ color: 0x4a3539, metalness: 0.92, roughness: 0.68, roughnessMap: lathed, envMapIntensity: 0.85 });
  const polished = new MeshStandardMaterial({ color: 0x5a3c42, metalness: 0.95, roughness: 0.46, roughnessMap: lathed, envMapIntensity: 1 });
  const blackened = new MeshStandardMaterial({ color: 0x120a0c, metalness: 0.7, roughness: 0.82, envMapIntensity: 0.5 });
  const hollow = new MeshStandardMaterial({ color: 0x2a080d, metalness: 0.3, roughness: 0.72, emissive: new Color(0x5a0012), emissiveIntensity: 0 });
  const metals = [metal, polished, blackened, hollow];
  const ENV = metals.map((material) => material.envMapIntensity);

  const glow = (map: Texture | null, color = RED) =>
    new MeshBasicMaterial({ map, color, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

  /* The vault: a housing, a toothed outer ring, a channel of charge lights, the rune ring, the star plate and the doors. */
  const vault = new Group();
  scene.add(vault);
  vault.add(new Mesh(lathe([[0, -0.44], [1.3, -0.44], [1.345, -0.395], [1.345, -0.11], [1.31, -0.07], [0, -0.07]], 128), blackened));

  const outer = new Group();
  const outerInlay = glow(engraving);
  outer.add(new Mesh(lathe(ringProfile(1.12, 1.365, -0.16, 0.12, 0.03), 160), metal));
  const outerFace = new Mesh(inlayGeometry(1.13, 1.355), outerInlay);
  outerFace.position.z = 0.1215;
  outer.add(outerFace);
  const teeth = new InstancedMesh(new BoxGeometry(0.085, 0.14, 0.2), polished, TEETH);
  outer.add(teeth);
  vault.add(outer);

  const segmentGeometry = new RingGeometry(1.012, 1.098, 10, 1, Math.PI / 2 - (13 * Math.PI) / 180, (26 * Math.PI) / 180);
  const segmentMaterials = Array.from({ length: SEGMENTS }, () => glow(null));
  segmentMaterials.forEach((material, i) => {
    const segment = new Mesh(segmentGeometry, material);
    segment.rotation.z = -((i + 0.5) / SEGMENTS) * TAU;
    segment.position.z = -0.064;
    vault.add(segment);
  });

  const mid = new Group();
  const midInlay = glow(engraving);
  mid.add(new Mesh(lathe(ringProfile(0.8, 0.985, -0.12, 0.075, 0.02), 128), metal));
  const midFace = new Mesh(inlayGeometry(0.806, 0.98), midInlay);
  midFace.position.z = 0.0765;
  mid.add(midFace);
  vault.add(mid);

  const star = new Group();
  const starInlay = glow(engraving);
  const plate = new Mesh(
    new ExtrudeGeometry(starShape(), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 1, curveSegments: 64 }),
    polished,
  );
  plate.position.z = -0.05;
  star.add(plate);
  const starFace = new Mesh(inlayGeometry(0.62, 0.77), starInlay);
  starFace.position.z = -0.002;
  star.add(starFace);
  vault.add(star);

  // The chamber behind the doors, its core and the light inside.
  vault.add(new Mesh(lathe([[0.62, 0.02], [0.6, -0.06], [0.52, -0.2], [0.3, -0.28], [0, -0.3]], 96), hollow));
  const coreMaterial = new MeshBasicMaterial({ color: PALE, toneMapped: false });
  const core = new Mesh(new SphereGeometry(0.09, 24, 16), coreMaterial);
  core.position.z = -0.16;
  vault.add(core);
  const plane = new PlaneGeometry(1, 1);
  const coreGlowMaterial = glow(glowMap);
  const coreGlow = new Mesh(plane, coreGlowMaterial);
  coreGlow.position.z = -0.08;
  vault.add(coreGlow);
  const coreLight = new PointLight(RED, 0, 3.2, 2);
  coreLight.position.z = -0.04;
  vault.add(coreLight);

  const doorInlay = glow(engraving);
  const doors = ([-1, 1] as const).map((side) => {
    const pivot = new Group();
    pivot.position.x = side * 0.642;
    const door = new Group();
    door.position.x = -side * 0.62;
    door.add(
      new Mesh(
        new ExtrudeGeometry(doorShape(side), { depth: 0.08, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 40 }),
        polished,
      ),
    );
    const face = new Mesh(inlayGeometry(0.21, 0.575, side === 1 ? -Math.PI / 2 : Math.PI / 2, Math.PI), doorInlay);
    face.position.z = 0.107;
    door.add(face);
    pivot.add(door);
    vault.add(pivot);
    return { pivot, side };
  });

  // Light leaking through the seams.
  const seamMaterials = [1.118, 0.797, 0.617, 1.37].map((radius, i) => {
    const material = glow(null);
    const seam = new Mesh(new TorusGeometry(radius, i === 3 ? 0.006 : 0.008, 6, 192), material);
    seam.position.z = i === 2 ? 0.01 : i === 3 ? -0.09 : 0.0;
    vault.add(seam);
    return material;
  });
  const splitMaterial = glow(null);
  const split = new Mesh(new PlaneGeometry(0.016, 1.2), splitMaterial);
  split.position.z = 0.109;
  vault.add(split);

  // Light from inside once it opens: a spill in front, shafts and a pressure ring.
  const spillMaterial = glow(glowMap);
  const spill = new Mesh(plane, spillMaterial);
  spill.position.z = 0.45;
  vault.add(spill);
  const spillLight = new PointLight(0xff3350, 0, 5, 2);
  spillLight.position.z = 1.1;
  vault.add(spillLight);
  const rays = new Group();
  rays.position.z = 0.2;
  const rayGeometry = new PlaneGeometry(1, 1);
  rayGeometry.translate(0, 0.5, 0);
  const rayMaterial = glow(rayMap);
  const RAY_SHAPES = Array.from({ length: 11 }, (_, i) => ({ angle: (i / 11) * TAU + hash(i + 40) * 0.35, length: 1.5 + hash(i + 60) * 1.7, width: 0.12 + hash(i + 80) * 0.22 }));
  const rayMeshes = RAY_SHAPES.map(({ angle, width }) => {
    const ray = new Mesh(rayGeometry, rayMaterial);
    ray.rotation.z = angle;
    ray.scale.set(width, 1, 1);
    rays.add(ray);
    return ray;
  });
  vault.add(rays);
  const ringGeometry = new RingGeometry(0.96, 1, 128);
  const shockMaterial = glow(null);
  const shock = new Mesh(ringGeometry, shockMaterial);
  shock.position.z = 0.25;
  vault.add(shock);
  const auraMaterial = glow(glowMap, DEEP);
  const aura = new Mesh(plane, auraMaterial);
  aura.position.z = -0.8;
  vault.add(aura);

  // The space around it: the floor sigil, a contracting ripple while the aura gathers, and drifting embers.
  const floorMaterial = new ShaderMaterial({
    uniforms: { uMap: { value: sigilMap }, uTrace: { value: 0 }, uGlow: { value: 0 }, uTime: { value: 0 }, uColor: { value: new Color(RED) } },
    vertexShader: FLOOR_VERTEX,
    fragmentShader: FLOOR_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const floor = new Mesh(plane, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.8;
  floor.scale.setScalar(8);
  scene.add(floor);
  const rippleMaterial = glow(null, PALE);
  const ripple = new Mesh(ringGeometry, rippleMaterial);
  ripple.position.z = -0.3;
  scene.add(ripple);

  const emberGeometry = new BufferGeometry();
  const seeds = new Float32Array(EMBERS * 4);
  const sizes = new Float32Array(EMBERS);
  for (let i = 0; i < EMBERS; i++) {
    seeds.set([(hash(i * 5) - 0.5) * 7.5, -2.8 + hash(i * 5 + 1) * 4, 0.16 + hash(i * 5 + 2) * 0.34, hash(i * 5 + 3)], i * 4);
    sizes[i] = 0.022 + hash(i * 5 + 4) * 0.05;
  }
  emberGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(EMBERS * 3), 3));
  emberGeometry.setAttribute("aSeed", new Float32BufferAttribute(seeds, 4));
  emberGeometry.setAttribute("aSize", new Float32BufferAttribute(sizes, 1));
  const emberMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPixel: { value: 600 }, uAlpha: { value: 0 } },
    vertexShader: EMBER_VERTEX,
    fragmentShader: EMBER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const embers = new Points(emberGeometry, emberMaterial);
  embers.frustumCulled = false;
  scene.add(embers);

  // A cool key from above left, red rims behind, a dim fill.
  const hemi = new HemisphereLight(0x5a2a33, 0x050203, 0);
  const key = new DirectionalLight(0xfff0f0, 0);
  key.position.set(-3, 4, 5);
  const rimA = new PointLight(RED, 0, 10, 2);
  rimA.position.set(3.4, 1.4, -1.2);
  const rimB = new PointLight(DEEP, 0, 10, 2);
  rimB.position.set(-3.2, -1.2, -0.8);
  scene.add(hemi, key, rimA, rimB);

  /* State. */
  const state = {
    phase: start.phase,
    round: start.round,
    phaseAt: -Infinity,
    charge: start.charge,
    motion: start.motion,
    intro: (start.motion === "off" ? null : { kind: "full", start: Infinity }) as Intro | null,
    settled: false,
    burst: false,
    alignUntil: 0,
    keyAt: -Infinity,
    shake: 0,
    flare: 0,
    shockAt: -Infinity,
    shockStrength: 0,
    fitDistance: 10,
  };
  const levels = Object.fromEntries(LEVEL_KEYS.map((key) => [key, spring()])) as Record<keyof Levels, Spring>;
  const lean = { x: spring(), y: spring() };
  const pointer = { x: 0, y: 0 };
  const emberRise = spring(1);
  let emberClock = 0;
  const angle = [0, 0.4, 0.2];
  const speed = [0, 0, 0];
  const align: (Spring | null)[] = [null, null, null];
  const segmentLevels = new Array<number>(SEGMENTS).fill(0);
  const accent = new Color();
  const tint = new Color();
  const RED_C = new Color(RED);
  const PALE_C = new Color(PALE);
  const ASH_C = new Color(ASH);
  const DEEP_C = new Color(DEEP);
  const dummy = new Object3D();
  let teethDrawn = NaN;

  const lockRings = () => {
    for (let i = 0; i < 3; i++) {
      const step = SYMMETRY[i];
      const direction = speed[i] < 0 ? -1 : 1;
      const target = direction > 0 ? Math.ceil(angle[i] / step + 0.3) * step : Math.floor(angle[i] / step - 0.3) * step;
      align[i] = { value: angle[i], target, velocity: speed[i] };
    }
  };

  const placeTeeth = (t: number) => {
    if (Math.abs(t - teethDrawn) < 1e-4) return;
    teethDrawn = t;
    const out = Math.max(0, t);
    const clampIn = Math.max(0, -t);
    const radius = 1.43 + out * 0.11 - clampIn * 0.07;
    for (let i = 0; i < TEETH; i++) {
      const a = (i / TEETH) * TAU;
      dummy.position.set(Math.sin(a) * radius, Math.cos(a) * radius, -0.02 + out * 0.04 + clampIn * 0.1);
      dummy.rotation.set(0, 0, -a);
      dummy.scale.set(1, 1 - out * 0.25, 1);
      dummy.updateMatrix();
      teeth.setMatrixAt(i, dummy.matrix);
    }
    teeth.instanceMatrix.needsUpdate = true;
  };

  const emberCount = () => (state.motion === "off" ? 0 : state.motion === "subtle" ? 36 : compact ? 48 : EMBERS);
  emberGeometry.setDrawRange(0, emberCount());

  /* Framing: the vault's centre sits on the anchor element, whatever the layout does. */
  const fit = () => {
    const box = host.getBoundingClientRect();
    const target = anchor.getBoundingClientRect();
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    const size = Math.max(48, Math.min(target.width, target.height));
    const cx = target.left + target.width / 2 - box.left;
    const cy = target.top + target.height / 2 - box.top;
    camera.setViewOffset(width, height, width / 2 - cx, height / 2 - cy, width, height);
    const tan = Math.tan((FOV * Math.PI) / 360);
    state.fitDistance = (FIT_RADIUS * height) / (size * tan);
    camera.updateProjectionMatrix();
    emberMaterial.uniforms.uPixel.value = (height * dpr) / (2 * tan);
  };

  const step = (now: number, dt: number) => {
    const off = state.motion === "off";
    const amp = off ? 0 : state.motion === "subtle" ? 0.45 : 1;
    const stage = stageAt(state.intro, now);
    if (state.intro && Number.isFinite(stage.e)) {
      if (!state.settled && stage.e >= SUMMON[state.intro.kind].settle) {
        // The lock-in: rings snap to their marks, teeth clack, the core flares and the embers lift.
        state.settled = true;
        lockRings();
        state.alignUntil = now + 600;
        state.shake = Math.max(state.shake, 0.55 * amp);
        state.flare = 1;
        levels.teeth.value = 0.45;
        levels.core.value += 0.8;
        emberRise.value = 3;
        state.shockAt = now;
        state.shockStrength = 0.5;
      }
      if (stage.e >= SUMMON[state.intro.kind].total + 300) state.intro = null;
    }

    const e = off ? Infinity : now - state.phaseAt;
    const goal = levelsFor(state.phase, e, state.charge, now, off);
    for (const name of LEVEL_KEYS) {
      const s = levels[name];
      s.target = goal[name];
      if (off) {
        s.value = s.target;
        s.velocity = 0;
      } else follow(s, name === "inlay" && state.phase === "invalid" && e < 700 ? 0.035 : LEVEL_TIMES[name], dt);
    }
    if (state.phase === "granted" && !state.burst && e >= UNLOCK.burst) {
      state.burst = true;
      if (!off) {
        state.shockAt = now;
        state.shockStrength = 1;
        state.shake = Math.max(state.shake, 0.3 * amp);
        state.flare = 1;
        emberRise.value = 2.6;
      }
    }
    const lv = (name: keyof Levels) => levels[name].value;

    // Lean toward the pointer on desktop; a slow, small drift on touch.
    if (fine) {
      lean.x.target = pointer.x;
      lean.y.target = pointer.y;
    } else {
      lean.x.target = Math.sin(now / 4700) * 0.3;
      lean.y.target = Math.sin(now / 6100) * 0.2;
    }
    follow(lean.x, 0.6, dt);
    follow(lean.y, 0.6, dt);

    // Rings: drift, spin while verifying, coast to a stop when dormant, lock on their marks when it opens.
    const aligned = state.phase === "granted" || state.phase === "already" || now < state.alignUntil;
    const still = state.phase === "unavailable" || state.phase === "locked";
    for (let i = 0; i < 3; i++) {
      const lock = align[i];
      if (aligned && lock) {
        if (off) lock.value = lock.target;
        else follow(lock, state.phase === "granted" ? 0.13 : 0.2, dt);
        angle[i] = lock.value;
        speed[i] = 0;
        continue;
      }
      align[i] = null;
      if (off) continue;
      let target = DRIFT[i] * amp * (0.6 + state.charge * 0.8);
      if (state.phase === "verifying") target = DRIFT[i] * 11 * Math.max(amp, 0.5);
      else if (still) target = 0;
      else if (state.phase === "lost") target *= 0.3;
      if (stage.spin > 0) target = DRIFT[i] * 5 * stage.spin;
      speed[i] += (target - speed[i]) * (1 - Math.exp(-dt * (still ? 6 : 2.2)));
      angle[i] += speed[i] * dt;
    }
    const teethValue = lv("teeth");
    outer.rotation.z = -angle[0];
    mid.rotation.z = -angle[1];
    star.rotation.z = -angle[2] - Math.max(0, teethValue) * (Math.PI / 8);
    star.position.z = -Math.max(0, teethValue) * 0.04;
    placeTeeth(teethValue);

    // Doors swing out from hinges at their outer edges.
    const gate = lv("gate");
    for (const { pivot, side } of doors) {
      pivot.rotation.y = side * gate * 1.05;
      pivot.position.x = side * (0.642 + gate * 0.2);
      pivot.position.z = gate * 0.14;
    }

    // Colour: red, paler for an echo, ash when dormant or out of reach.
    accent.copy(RED_C).lerp(PALE_C, lv("pale") * 0.85).lerp(ASH_C, lv("dim"));
    state.flare *= Math.exp(-dt * 3);
    state.shake *= Math.exp(-dt * 5.5);
    const lights = stage.lights;
    const inlay = lv("inlay");
    const keyFlash = off ? 0 : Math.max(0, 1 - (now - state.keyAt) / 260);
    outerInlay.color.copy(accent).multiplyScalar((inlay + state.flare * 0.5) * stage.seams[0]);
    midInlay.color.copy(accent).multiplyScalar((inlay + keyFlash * 0.25 + state.flare * 0.5) * stage.seams[1]);
    starInlay.color.copy(accent).multiplyScalar((inlay * 0.8 + state.flare * 0.4) * stage.seams[2]);
    doorInlay.color.copy(accent).multiplyScalar((inlay * 0.7 + state.flare * 0.4) * stage.seams[3] * (1 - lv("gate") * 0.5));
    seamMaterials.forEach((material, i) => material.color.copy(accent).multiplyScalar((0.3 + inlay * 0.9 + state.flare) * stage.seams[i]));
    splitMaterial.color.copy(accent).multiplyScalar((0.25 + lv("core") * 0.9 + state.flare) * stage.seams[3] * Math.max(0, 1 - gate * 4));

    const lit = Math.round(state.charge * SEGMENTS);
    for (let i = 0; i < SEGMENTS; i++) {
      let target: number;
      switch (state.phase) {
        case "verifying": {
          const behind = (((now / 70) % SEGMENTS) - i + SEGMENTS) % SEGMENTS;
          target = off ? 0.9 : behind < 4 ? 1.4 - behind * 0.32 : 0.12;
          break;
        }
        case "granted":
          target = 1.25;
          break;
        case "already":
          target = 0.7;
          break;
        case "invalid":
          target = inlay;
          break;
        case "unavailable":
          target = 0.03;
          break;
        case "locked":
          target = 0.12 + inlay * 0.6;
          break;
        case "lost":
          target = off ? 0.1 : hash(i * 13 + Math.floor(now / 160)) > 0.72 ? 0.5 : 0.04;
          break;
        default:
          target = (i < lit ? 0.85 : 0.08) + (i === lit - 1 ? keyFlash * 0.8 : 0);
      }
      segmentLevels[i] = off ? target : segmentLevels[i] + (target - segmentLevels[i]) * (1 - Math.exp(-dt * 14));
      segmentMaterials[i].color.copy(accent).multiplyScalar(segmentLevels[i] * stage.seams[0]);
    }

    // The core and what escapes from it.
    const coreLevel = lv("core");
    core.scale.setScalar(0.55 + Math.min(2, coreLevel) * 0.6);
    coreMaterial.color.copy(PALE_C).multiplyScalar(Math.min(1.4, 0.15 + coreLevel) * lights);
    coreGlowMaterial.color.copy(accent).multiplyScalar(coreLevel * 0.9 * lights);
    coreGlow.scale.setScalar(1.1 + coreLevel * 0.5);
    coreLight.intensity = coreLevel * 14 * lights;
    hollow.emissiveIntensity = coreLevel * 1.4 * lights;
    spillMaterial.color.copy(accent).multiplyScalar(gate * coreLevel * 0.42);
    spill.scale.setScalar(2.2 + coreLevel * 0.6);
    spill.visible = gate > 0.01;
    spillLight.intensity = gate * coreLevel * 20;
    const rayLevel = lv("rays");
    rays.visible = rayLevel > 0.01;
    if (rays.visible) {
      if (!off) rays.rotation.z += dt * 0.05 * amp;
      rayMaterial.color.copy(tint.copy(accent).lerp(PALE_C, 0.35)).multiplyScalar(rayLevel * 0.55);
      rayMeshes.forEach((ray, i) => ray.scale.setY(RAY_SHAPES[i].length * (0.35 + rayLevel * 0.65) * (off ? 1 : 0.9 + 0.1 * Math.sin(now / 300 + i * 2))));
    }
    const shockAge = (now - state.shockAt) / 700;
    shock.visible = shockAge >= 0 && shockAge < 1;
    if (shock.visible) {
      shock.scale.setScalar(0.7 + easeOut(shockAge) * 3.2);
      shockMaterial.color.copy(tint.copy(accent).lerp(PALE_C, 0.5)).multiplyScalar((1 - shockAge) ** 2 * state.shockStrength);
    }
    auraMaterial.color.copy(tint.copy(DEEP_C).lerp(accent, 0.35)).multiplyScalar(lv("aura") * 0.55 * stage.gather);
    aura.scale.setScalar(6.8 * (1 + (1 - stage.gather) * 1.4) * (1 + Math.min(1, coreLevel) * 0.06));
    ripple.visible = stage.ripple > 0 && stage.ripple < 1;
    if (ripple.visible) {
      ripple.scale.setScalar(3.6 - 2.7 * easeInOut(stage.ripple));
      rippleMaterial.color.copy(PALE_C).multiplyScalar(Math.sin(Math.PI * stage.ripple) * 0.35);
    }

    // The floor sigil traces itself during the summon and answers the vault after.
    floorMaterial.uniforms.uTrace.value = stage.trace;
    floorMaterial.uniforms.uGlow.value = (lv("floor") * 0.7 + (1 - stage.rise) * stage.trace * 0.6 + state.flare * 0.3) * (1 - lv("dim") * 0.5);
    floorMaterial.uniforms.uTime.value = off ? 0 : now / 1000;
    (floorMaterial.uniforms.uColor.value as Color).copy(accent);

    emberRise.target = state.phase === "verifying" ? 1.7 : 1;
    follow(emberRise, 0.8, dt);
    emberClock += off ? 0 : dt * emberRise.value;
    emberMaterial.uniforms.uTime.value = emberClock;
    emberMaterial.uniforms.uAlpha.value = stage.embers * (0.85 - lv("dim") * 0.45);

    // Lights come up with the rise; reflections with them.
    const dim = lv("dim");
    hemi.intensity = 0.7 * lights;
    key.intensity = 2.3 * lights * (1 - dim * 0.3);
    rimA.intensity = 34 * lights * (1 - dim * 0.55);
    rimA.color.copy(accent);
    rimB.intensity = 24 * lights * (1 - dim * 0.55);
    rimB.color.copy(DEEP_C).lerp(ASH_C, dim);
    metals.forEach((material, i) => (material.envMapIntensity = ENV[i] * (0.15 + lights * 0.85)));

    // Pose: rise out of the floor with a slight overshoot, then hover and lean.
    const rise = stage.rise;
    const from = stage.from;
    vault.position.y = lerp(from.y, 0, easeBack(rise)) + (off ? 0 : Math.sin(now / 1300) * 0.018 * amp);
    vault.rotation.x = lerp(from.tilt, 0, easeOut(rise)) - lean.y.value * 0.07 * amp;
    vault.rotation.y = lean.x.value * 0.11 * amp;
    vault.rotation.z = lerp(from.twist, 0, easeOut(rise));
    vault.scale.setScalar(lerp(0.92, 1, easeOut(rise)));

    // Camera: down from above the sigil to face the vault, then lean, push in on an unlock and shake on impacts.
    const d = state.fitDistance;
    const c = stage.cam;
    const shakeX = state.shake * 0.05 * (Math.sin(now * 0.071) * 0.7 + Math.sin(now * 0.133) * 0.3);
    const shakeY = state.shake * 0.05 * (Math.sin(now * 0.063 + 1) * 0.7 + Math.sin(now * 0.117) * 0.3);
    camera.position.set(
      lerp(from.camX, lean.x.value * 0.34 * amp, c) + shakeX,
      lerp(from.camY, 0.2 + lean.y.value * 0.18 * amp, c) + shakeY,
      lerp(d * from.camZ, d * (1 - lv("push") * 0.13), c),
    );
    camera.lookAt(0, lerp(from.lookY, 0, c), 0);
  };

  /* Loop: runs while visible and moving; with motion off it draws once per change. */
  let raf = 0;
  let last = 0;
  let visible = true;
  let ready = false;
  let disposed = false;
  let sample = { at: 0, frames: 0, slow: 0 };
  const createdAt = performance.now();

  const loop = (time: number) => {
    raf = 0;
    if (disposed) return;
    const dt = last ? Math.min(0.05, (time - last) / 1000) : 1 / 60;
    last = time;
    step(time, dt);
    renderer.render(scene, camera);
    // Adaptive resolution: step down when frames keep running long.
    if (state.motion !== "off" && time - createdAt > 2500) {
      if (!sample.at) sample = { at: time, frames: 0, slow: 0 };
      sample.frames++;
      if (dt > 1 / 42) sample.slow++;
      if (time - sample.at > 2000) {
        if (sample.frames > 20 && sample.slow / sample.frames > 0.3 && dpr > 0.75) {
          dpr = Math.max(0.75, dpr - 0.25);
          fit();
        }
        sample = { at: time, frames: 0, slow: 0 };
      }
    }
    if (state.motion !== "off" && visible && !document.hidden) raf = requestAnimationFrame(loop);
    else last = 0;
  };
  const wake = () => {
    if (!raf && ready && !disposed && visible && !document.hidden) raf = requestAnimationFrame(loop);
  };

  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const box = host.getBoundingClientRect();
    pointer.x = Math.max(-1, Math.min(1, (event.clientX - box.left - box.width / 2) / (box.width / 2)));
    pointer.y = Math.max(-1, Math.min(1, -(event.clientY - box.top - box.height / 2) / (box.height / 2)));
  };
  const onLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
  };
  const onVisibility = () => wake();
  const onLost = (event: Event) => {
    event.preventDefault();
    cb.fail();
  };
  if (fine) {
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
  }
  document.addEventListener("visibilitychange", onVisibility);
  canvas.addEventListener("webglcontextlost", onLost);
  const resize = new ResizeObserver(() => {
    fit();
    wake();
  });
  resize.observe(host);
  resize.observe(anchor);
  if (anchor.parentElement) resize.observe(anchor.parentElement);
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  });
  seen.observe(host);

  if (start.phase !== "idle") {
    state.phaseAt = -Infinity;
    if (start.phase === "granted" || start.phase === "already") lockRings();
  }
  fit();
  step(performance.now(), 1 / 60);
  // Compile every shader before saying ready, so the summon never stutters on its first frames.
  renderer
    .compileAsync(scene, camera)
    .catch(() => undefined)
    .then(() => {
      if (disposed) return;
      ready = true;
      cb.ready();
      wake();
    });

  return {
    setPhase(phase, round) {
      if (phase === state.phase && round === state.round) return;
      const now = performance.now();
      state.phase = phase;
      state.round = round;
      state.phaseAt = now;
      state.burst = false;
      const amp = state.motion === "full" ? 1 : state.motion === "subtle" ? 0.45 : 0;
      if (phase === "granted" || phase === "already") lockRings();
      if (phase === "invalid") {
        state.shake = Math.max(state.shake, 0.9 * amp);
        for (let i = 0; i < 3; i++) speed[i] = -Math.sign(DRIFT[i]) * 1.6 * amp;
      }
      if (phase === "locked") state.shake = Math.max(state.shake, 0.7 * amp);
      wake();
    },
    setCharge(charge) {
      state.charge = charge;
      wake();
    },
    setMotion(motion) {
      state.motion = motion;
      if (motion === "off") state.intro = null;
      emberGeometry.setDrawRange(0, emberCount());
      wake();
    },
    pulse() {
      if (state.motion === "off" || state.phase !== "idle") return;
      state.keyAt = performance.now();
      speed[1] += 0.45 * (state.motion === "full" ? 1 : 0.5);
      wake();
    },
    summon(kind) {
      state.intro = kind === "none" || state.motion === "off" ? null : { kind, start: performance.now() };
      state.settled = false;
      wake();
    },
    skip() {
      if (state.intro) {
        state.intro = null;
        lockRings();
        state.alignUntil = performance.now() + 400;
        state.flare = 0.6;
      }
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      scene.traverse((object) => {
        const mesh = object as Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as Material | Material[] | undefined;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material?.dispose();
      });
      for (const item of owned) item.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

/* ----------------------------------------------------------------------------
 * React
 * ------------------------------------------------------------------------- */

type Props = {
  /** The element the vault is framed on; the canvas itself covers its parent stage. */
  anchor: RefObject<HTMLElement | null>;
  phase: ScenePhase;
  /** Changes on every answer, so the same answer twice still reacts. */
  round: number;
  /** 0–1: how much of a code has been typed. */
  charge: number;
  /** Increments on each keystroke. */
  pulse: number;
  motion: MotionLevel;
  ref?: Ref<VaultSceneHandle>;
  onReady: () => void;
  onFail: () => void;
};

export default function VaultScene({ anchor, phase, round, charge, pulse, motion, ref, onReady, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ready = useEffectEvent(() => onReady());
  const fail = useEffectEvent(() => onFail());
  const initial = useEffectEvent(() => ({ phase, round, charge, motion }));

  useImperativeHandle(
    ref,
    () => ({
      summon: (kind) => engineRef.current?.summon(kind),
      skip: () => engineRef.current?.skip(),
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    const target = anchor.current;
    if (!host || !target) return;
    let engine: Engine;
    try {
      engine = createVaultEngine(host, target, initial(), { ready, fail });
    } catch {
      // No WebGL context or 2D canvas: the page keeps its drawn seal.
      fail();
      return;
    }
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, [anchor]);

  useEffect(() => engineRef.current?.setPhase(phase, round), [phase, round]);
  useEffect(() => engineRef.current?.setCharge(charge), [charge]);
  useEffect(() => engineRef.current?.setMotion(motion), [motion]);
  useEffect(() => {
    if (pulse) engineRef.current?.pulse();
  }, [pulse]);

  return <div ref={hostRef} className="vx-scene" aria-hidden="true" />;
}
