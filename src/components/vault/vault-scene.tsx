"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  OctahedronGeometry,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  QuadraticBezierCurve3,
  RepeatWrapping,
  RingGeometry,
  Scene,
  ShaderMaterial,
  Shape,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { follow, radialTexture, spring, studioEnvironment } from "@/components/showcase/three-kit";
import type { MotionLevel } from "@/lib/preferences";
import { LATE_ASSEMBLY, SUMMON, UNLOCK, type SummonKind } from "./timing";
import {
  BEAM_FRAGMENT,
  BEAM_VERTEX,
  CONE_FRAGMENT,
  CONE_VERTEX,
  DOOR_SPAN,
  EMBER_VERTEX,
  POINT_FRAGMENT,
  SCREEN_FRAGMENT,
  SIGIL_FRAGMENT,
  SMOKE_FRAGMENT,
  SPARK_VERTEX,
  TAU,
  UV_VERTEX,
  band,
  bracket,
  chamberWall,
  chamfer,
  doorFace,
  easeBack,
  easeIn,
  easeInOut,
  easeOut,
  frame as slabGeometry,
  glyphLine,
  grain,
  hash,
  heartbeat,
  lathe,
  lerp,
  outline,
  paint,
  plate,
  recess,
  runeStrip,
  seams,
  sigil,
  smoke,
  softRect,
  span,
  trapezoid,
  wedge,
  wobble,
} from "./vault-forge";
import type { RevealOrigin } from "./vault-reveal";

/**
 * The Vault as a physical artifact: a black-metal seal with an iris door, rotating rings and a crimson core,
 * floating behind an access console that is real geometry too. The page's code field and buttons stay in the
 * DOM; every frame the console's pose is written onto them as a CSS 3D transform, so they sit exactly on its
 * screen while it rises, leans toward the pointer or steps aside for the rewards.
 */

export type ScenePhase = "idle" | "verifying" | "granted" | "already" | "invalid" | "unavailable" | "locked" | "lost";
export type VaultSceneHandle = { skip: () => void; origin: () => RevealOrigin | null };

type SceneRefs = { artifact: RefObject<HTMLElement | null>; panel: RefObject<HTMLElement | null> };
type SceneIntro = { kind: SummonKind; at: number; done: boolean };
type IntroKind = SummonKind | "late" | "none" | "pending";
type Init = { phase: ScenePhase; round: number; charge: number; motion: MotionLevel; revealing: boolean; intro: SceneIntro };

const RED = new Color(0xff1f3d);
const DEEP = new Color(0x9e0a1e);
const PALE = new Color(0xffe2e7);
const ASH = new Color(0x857a7d);
const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360);
/** Camera distance to the console plane; there one CSS pixel is one canvas pixel. */
const DIST = 14;
/** The vault floats this far behind the console. */
const Z_ART = -3.2;
/** Housing radius as a share of half the artifact box (the rings and shards spill past it on purpose). */
const ART_FILL = 0.84;
const SEGMENTS = 8;
const BOLTS = 24;
const SHARDS = 12;
/** Console measurements in CSS pixels around the page's panel. */
const CON = { margin: 18, cut: 14, inset: 3, holeCut: 7, depth: 34, recess: 10, bevel: 3, back: 12, backDepth: 9, approach: 22 };
/** How far the console leans toward the pointer (radians). */
const MAX_TILT = 0.085;

const ringProfile = (inner: number, outer: number, back: number, front: number, bevel: number): [number, number][] => [
  [inner, back],
  [outer, back],
  [outer, front - bevel],
  [outer - bevel, front],
  [inner + bevel, front],
  [inner, front - bevel],
  [inner, back],
];
/** The housing: a deep drum with a stepped rim, a rune groove and a raised inner lip. */
const HOUSING: [number, number][] = [
  [0.8, -0.2],
  [1, -0.2],
  [1, 0.03],
  [0.975, 0.075],
  [0.928, 0.075],
  [0.918, 0.045],
  [0.866, 0.045],
  [0.856, 0.115],
  [0.826, 0.135],
  [0.8, 0.115],
  [0.8, -0.2],
];
const DIAL = ringProfile(0.705, 0.795, -0.05, 0.062, 0.017);
const HUB: [number, number][] = [
  [0, -0.06],
  [0.088, -0.06],
  [0.082, 0.052],
  [0.06, 0.075],
  [0, 0.075],
];

/* ----------------------------------------------------------------------------
 * Choreography
 * ------------------------------------------------------------------------- */

type LevelKey = "seam" | "core" | "pale" | "ash" | "dim" | "spin" | "tilt" | "teeth" | "halo" | "screen" | "scan" | "noise" | "beam" | "push" | "pull" | "shafts";
type Levels = Record<LevelKey, number>;
/** Smoothing time (seconds) of each continuous level. */
const LEVEL_TIMES: Levels = {
  seam: 0.22,
  core: 0.2,
  pale: 0.4,
  ash: 0.6,
  dim: 0.6,
  spin: 0.5,
  tilt: 0.45,
  teeth: 0.1,
  halo: 0.35,
  screen: 0.3,
  scan: 0.25,
  noise: 0.3,
  beam: 0.14,
  push: 0.7,
  pull: 0.6,
  shafts: 0.3,
};
const LEVEL_KEYS = Object.keys(LEVEL_TIMES) as LevelKey[];

/** One-shot motions, read straight from the timeline. */
type Shots = {
  open: number | null;
  align: number;
  flash: number;
  burst: number;
  shock: number;
  disengage: number;
  head: number;
  back: number;
  flow: number;
  jolt: number;
  shake: number;
  retract: number;
  sag: number;
};

/**
 * What each answer does, `pe` ms after it arrived (a huge number when motion is off, so everything is in its
 * final state). `pace` < 1 compresses the timeline for subtle motion; `sinceReveal` restarts the console's
 * step aside when the rewards are viewed again.
 */
function choreograph(phase: ScenePhase, pe: number, now: number, charge: number, pace: number, revealing: boolean, sinceReveal: number, out: Levels, shot: Shots) {
  const at = (ms: number) => ms * pace;
  const breath = 0.5 + 0.5 * Math.sin(now / 1100);
  Object.assign(out, {
    seam: 0.55 + 0.12 * breath + 0.4 * charge,
    core: 0.25 + 0.25 * charge,
    pale: 0,
    ash: 0,
    dim: 0,
    spin: 1,
    tilt: 1,
    teeth: 0,
    halo: 0.3 + 0.2 * charge,
    screen: 1,
    scan: 0,
    noise: 0,
    beam: 0,
    push: 0,
    pull: 0,
    shafts: 0,
  } satisfies Levels);
  Object.assign(shot, { open: null, align: 0, flash: 0, burst: -1, shock: -1, disengage: 0, head: -1, back: -1, flow: 0, jolt: 0, shake: 0, retract: 0, sag: 0 } satisfies Shots);
  const shakes = pace === 1;
  switch (phase) {
    case "verifying": {
      // The code travels down the link into the seal; the mechanism spins up and the core gathers charge.
      const build = 1 - Math.exp(-pe / 1400);
      out.seam = 0.9 + 0.35 * build + 0.12 * Math.sin(pe / 160);
      out.core = 0.45 + 0.6 * build;
      out.spin = 4 + 2 * build;
      out.halo = 0.5 + 0.2 * build;
      out.screen = 1.1;
      out.scan = 1;
      out.beam = 1;
      out.push = 0.12 * build;
      out.pull = 0.8;
      shot.head = pe < at(480) ? easeInOut(pe / at(480)) : -1;
      shot.flow = span(pe, at(380), at(800));
      break;
    }
    case "granted": {
      // Rings align, teeth retract, the iris swings open, light pours out and the console steps aside.
      const align = easeInOut(span(pe, 0, at(450)));
      const open = easeInOut(span(pe, at(UNLOCK.open), at(UNLOCK.open + 760)));
      const burst = at(UNLOCK.burst);
      shot.align = align;
      shot.open = open;
      out.pale = 1;
      out.seam = 1.15 * (1 - 0.85 * open);
      out.core = 0.9 + 1.5 * easeOut(span(pe, at(540), at(720))) - 1.3 * easeInOut(span(pe, at(800), at(2000)));
      out.spin = lerp(3, 0.35, align);
      out.tilt = 1 - align;
      out.teeth = easeInOut(span(pe, at(UNLOCK.retract), at(UNLOCK.retract + 300)));
      out.halo = 0.42;
      out.beam = 1 - span(pe, at(150), at(600));
      out.shafts = easeOut(span(pe, at(600), at(1250))) * (1 - 0.55 * span(pe, at(1500), at(2600)));
      out.push = revealing ? easeInOut(span(sinceReveal, 0, at(1500))) : 0;
      shot.flash = Math.exp(-(((pe - at(120)) / at(260)) ** 2));
      shot.burst = pe >= burst ? (pe - burst) / 1000 : -1;
      shot.shock = pe >= burst ? span(pe, burst, burst + at(900)) : -1;
      shot.disengage = easeOut(span(pe, burst, burst + at(1150)));
      shot.shake = shakes && pe >= burst ? Math.max(0, 1 - (pe - burst) / 380) : 0;
      shot.retract = revealing ? easeInOut(span(sinceReveal, at(250), at(1000))) : 0;
      break;
    }
    case "already": {
      // Recognised but spent: the rings align pale, the teeth twitch and the door lifts and settles shut.
      const align = easeInOut(span(pe, 0, at(600)));
      shot.align = align;
      out.pale = 1;
      out.seam = 0.7;
      out.core = 0.45;
      out.spin = lerp(1, 0.3, align);
      out.tilt = 1 - align;
      out.teeth = 0.22 * Math.sin(Math.PI * span(pe, at(200), at(950)));
      out.halo = 0.36;
      shot.open = 0.07 * Math.sin(Math.PI * span(pe, at(300), at(1150)));
      shot.flash = 0.5 * Math.exp(-(((pe - at(150)) / at(300)) ** 2));
      break;
    }
    case "invalid": {
      // The dial jams and snaps back, the seams pulse red twice and the rejected code returns down the link.
      const pulses = pe < at(1400) ? Math.max(0, Math.sin((Math.PI * pe) / at(700))) : 0;
      out.seam = 0.4 + 0.8 * pulses;
      out.core = 0.12;
      out.spin = 0.3;
      out.dim = 0.1;
      out.halo = 0.25 + 0.3 * pulses;
      out.teeth = -0.05 * Math.exp(-pe / 260);
      out.beam = 1 - span(pe, at(380), at(700));
      shot.back = pe < at(420) ? 1 - easeIn(pe / at(420)) : -1;
      shot.jolt = (shakes ? 1 : 0.35) * Math.exp(-pe / at(170)) * Math.sin((TAU * pe) / at(105));
      shot.shake = shakes ? 0.35 * Math.exp(-pe / 220) : 0;
      break;
    }
    case "unavailable":
      // Dormant: ash-grey, the rings barely turning, the vault sagging a little in the dark.
      Object.assign(out, { seam: 0.12, core: 0.04, ash: 1, dim: 0.55, spin: 0.06, tilt: 1.2, halo: 0.08, screen: 0.55 });
      shot.sag = easeOut(span(pe, 0, at(1400)));
      break;
    case "locked": {
      // Lockdown: the teeth slam in, the rings stop and the seams keep a slow heartbeat.
      const beat = heartbeat(pe);
      Object.assign(out, { seam: 0.25 + 0.5 * beat, core: 0.06, dim: 0.45, ash: 0.15, spin: 0, halo: 0.12 + 0.2 * beat, screen: 0.75 });
      out.teeth = pe < at(140) ? -0.1 * (pe / at(140)) : -0.1 + 0.06 * span(pe, at(140), at(500));
      shot.shake = shakes ? 0.8 * Math.exp(-pe / 160) : 0;
      break;
    }
    case "lost":
      // The link breaks halfway; the console's glass fills with static.
      Object.assign(out, { seam: 0.3, core: 0.1, ash: 0.6, dim: 0.3, spin: 0.35, halo: 0.12, screen: 0.85, noise: 1 });
      out.beam = (1 - span(pe, 0, at(1100))) * (0.6 + 0.4 * Math.cos((pe / 1000) * TAU * 1.2));
      shot.head = pe < at(420) ? 0.55 * (pe / at(420)) : -1;
      break;
  }
}

type Pose = { light: number; seams: number; art: number; rise: number; trace: number; gather: number; con: number; frame: number; stagger: number; act: number; cam: number };
const SETTLED: Pose = { light: 1, seams: 1, art: 1, rise: 0, trace: 1, gather: 1, con: 1, frame: 1e9, stagger: 0, act: 1, cam: 0 };
const INTRO_TOTAL: Record<IntroKind, number> = { full: SUMMON.full.total, short: SUMMON.short.total, late: LATE_ASSEMBLY, none: 0, pending: 0 };

/** The entrance, `e` ms in. Times follow `SUMMON` so the page and the sound stay in step. */
function pose(kind: IntroKind, e: number): Pose {
  if (kind === "pending") return { ...SETTLED, light: 0, seams: 0, art: 0, rise: 1, trace: 0, gather: 0, con: 0, frame: -1e9, act: 0, cam: 1 };
  if (kind === "none" || e >= INTRO_TOTAL[kind]) return SETTLED;
  if (kind === "full") {
    const t = SUMMON.full;
    return {
      light: easeInOut(span(e, 150, 2000)),
      seams: easeOut(span(e, 80, 1300)),
      art: easeOut(span(e, t.rise, 1900)),
      rise: 1,
      trace: span(e, 250, 1800),
      gather: span(e, 0, 1600),
      con: span(e, t.console, t.console + 1200),
      frame: e - t.assemble,
      stagger: 95,
      act: span(e, t.lock - 20, t.lock + 450),
      cam: 1 - easeInOut(span(e, 0, t.total - 250)),
    };
  }
  if (kind === "short") {
    const t = SUMMON.short;
    return {
      light: easeOut(span(e, 0, 500)),
      seams: easeOut(span(e, 0, 400)),
      art: easeOut(span(e, 0, 700)),
      rise: 0.45,
      trace: span(e, 0, 700),
      gather: span(e, 0, 650),
      con: span(e, t.console, t.console + 700),
      frame: e - t.assemble,
      stagger: 55,
      act: span(e, t.lock - 30, t.lock + 270),
      cam: 0.35 * (1 - easeInOut(span(e, 0, t.total - 100))),
    };
  }
  return { light: easeOut(span(e, 0, 700)), seams: easeOut(span(e, 0, 500)), art: easeOut(span(e, 0, 700)), rise: 0.2, trace: span(e, 0, 700), gather: 1, con: 1, frame: e, stagger: 70, act: span(e, 450, 850), cam: 0 };
}

type Osc = { value: number; velocity: number };
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

/** Soft clamp to −1..1. */
const soft = (v: number) => v / Math.sqrt(1 + v * v);

/* ----------------------------------------------------------------------------
 * Engine
 * ------------------------------------------------------------------------- */

function createVaultEngine(host: HTMLDivElement, refs: SceneRefs, init: Init, cb: { ready: () => void; fail: () => void }) {
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const compact = !fine || window.innerWidth < 720;
  const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4;
  const maxDpr = Math.min(window.devicePixelRatio || 1, compact ? (lowEnd ? 1.25 : 1.5) : lowEnd ? 1.5 : 1.75);
  let dpr = maxDpr;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.fog = new FogExp2(0x030102, 0.018);
  const camera = new PerspectiveCamera(FOV, 1, 0.5, 90);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T): T => {
    owned.push(item);
    return item;
  };
  scene.environment = own(studioEnvironment(renderer, RED, DEEP, true, 0.35));

  /* Textures */
  const glowTex = own(radialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.22, "rgba(255,255,255,0.42)"],
    [1, "rgba(255,255,255,0)"],
  ]));
  const grainTex = own(paint(256, 256, grain));
  grainTex.wrapS = grainTex.wrapT = RepeatWrapping;
  const doorTex = own(paint(1024, 1024, (ctx) => doorFace(ctx, SEGMENTS)));
  doorTex.repeat.set(1 / (2 * DOOR_SPAN), 1 / (2 * DOOR_SPAN));
  doorTex.offset.set(0.5, 0.5);
  const stripTex = own(paint(2048, 96, (ctx) => runeStrip(ctx, 24, 3)));
  stripTex.wrapS = RepeatWrapping;
  const dialTex = own(paint(2048, 96, (ctx) => runeStrip(ctx, 20, 11)));
  dialTex.wrapS = RepeatWrapping;
  const wallTex = own(paint(512, 256, chamberWall));
  wallTex.wrapS = RepeatWrapping;
  wallTex.repeat.set(2, 1);
  const sigilTex = own(paint(1024, 1024, sigil));
  const smokeTex = own(paint(128, 128, smoke));
  smokeTex.wrapS = smokeTex.wrapT = RepeatWrapping;
  const haloTex = own(paint(256, 256, softRect));
  const lineTex = own(paint(1024, 64, glyphLine));

  /* Materials */
  const iron = new MeshStandardMaterial({ color: 0x2a1c1f, metalness: 0.9, roughness: 0.58, roughnessMap: grainTex, envMapIntensity: 0.85 });
  const steel = new MeshStandardMaterial({ color: 0x4a3539, metalness: 1, roughness: 0.3, roughnessMap: grainTex, envMapIntensity: 1.1 });
  const blade = new MeshStandardMaterial({ color: 0x241619, metalness: 0.88, roughness: 0.4, envMapIntensity: 1, emissive: RED.clone(), emissiveMap: doorTex, emissiveIntensity: 0 });
  const bladeSide = new MeshStandardMaterial({ color: 0x1a0f12, metalness: 0.85, roughness: 0.5, envMapIntensity: 0.8, emissive: RED.clone(), emissiveIntensity: 0 });
  const chamberMat = new MeshStandardMaterial({ color: 0x160a0d, metalness: 0.6, roughness: 0.6, side: BackSide, emissive: DEEP.clone(), emissiveMap: wallTex, emissiveIntensity: 0 });
  const bedMat = new MeshStandardMaterial({ color: 0x0d0607, metalness: 0.4, roughness: 0.7, emissive: RED.clone(), emissiveMap: sigilTex, emissiveIntensity: 0 });
  const obsidian = new MeshStandardMaterial({ color: 0x0b0607, metalness: 0.35, roughness: 0.12, envMapIntensity: 1.6 });
  const slabMat = new MeshStandardMaterial({ color: 0x1b1114, metalness: 0.85, roughness: 0.45, envMapIntensity: 0.9 });
  const trimMat = new MeshStandardMaterial({ color: 0x3c282d, metalness: 1, roughness: 0.28, envMapIntensity: 1.15 });
  const socketMat = new MeshStandardMaterial({ color: 0x080405, metalness: 0.5, roughness: 0.55, emissive: RED.clone(), emissiveIntensity: 0 });
  const glow = (map: Texture | null, color: Color) =>
    new MeshBasicMaterial({ map, color: color.clone(), blending: AdditiveBlending, transparent: true, depthWrite: false, side: DoubleSide, fog: false });

  /* ------------------------------------------------------------------ the vault */
  const art = new Group();
  const body = new Group();
  art.add(body);
  scene.add(art);
  const dummy = new Object3D();

  const housing = new Mesh(lathe(HOUSING, 160), iron);
  housing.castShadow = housing.receiveShadow = true;
  const housingRunesMat = glow(stripTex, RED);
  const housingRunes = new Mesh(band(0.868, 0.916, 192, 5), housingRunesMat);
  housingRunes.position.z = 0.0465;
  const boltGeometry = new CylinderGeometry(0.019, 0.023, 0.026, 6);
  boltGeometry.rotateX(Math.PI / 2);
  const bolts = new InstancedMesh(boltGeometry, steel, BOLTS);
  for (let i = 0; i < BOLTS; i++) {
    const a = ((i + 0.5) / BOLTS) * TAU;
    dummy.position.set(Math.sin(a) * 0.952, Math.cos(a) * 0.952, 0.088);
    dummy.rotation.set(0, 0, -a);
    dummy.updateMatrix();
    bolts.setMatrixAt(i, dummy.matrix);
  }
  bolts.castShadow = true;
  body.add(housing, housingRunes, bolts);

  const dial = new Group();
  const dialRing = new Mesh(lathe(DIAL, 160), steel);
  dialRing.castShadow = dialRing.receiveShadow = true;
  const dialRunesMat = glow(dialTex, RED);
  const dialRunes = new Mesh(band(0.722, 0.778, 160, 4), dialRunesMat);
  dialRunes.position.z = 0.0625;
  dial.add(dialRing, dialRunes);
  body.add(dial);

  const teeth = new InstancedMesh(plate(chamfer(new Shape(), 0.026, 0.1, 0.012), 0.05, 0.008), steel, SEGMENTS);
  teeth.position.z = 0.118;
  teeth.castShadow = true;
  body.add(teeth);

  // The iris door: eight leaves hinged on the rim, a hub at the centre and light in every seam.
  const door = new Group();
  body.add(door);
  const leaves = Array.from({ length: SEGMENTS }, (_, i) => {
    const a = (i / SEGMENTS) * TAU;
    const pivot = new Group();
    pivot.position.set(Math.sin(a) * 0.7, Math.cos(a) * 0.7, 0);
    pivot.rotation.z = -a;
    const leaf = new Mesh(wedge(i, SEGMENTS, 0.095, 0.7, 0.014, 0.11, 0.012), [blade, bladeSide]);
    leaf.castShadow = leaf.receiveShadow = true;
    pivot.add(leaf);
    door.add(pivot);
    return leaf;
  });
  const hub = new Mesh(lathe(HUB, 64), steel);
  hub.castShadow = true;
  const seamMat = glow(null, RED);
  door.add(hub, new Mesh(seams(SEGMENTS, 0.1, 0.69, 0.016), seamMat));
  const rimSeam = new Mesh(band(0.697, 0.708, 160, 1), seamMat);
  const hubSeam = new Mesh(band(0.088, 0.1, 64, 1), seamMat);
  hubSeam.position.z = 0.02;
  body.add(rimSeam, hubSeam);

  const chamber = new Mesh(new CylinderGeometry(0.705, 0.62, 0.9, 64, 1, true), chamberMat);
  chamber.rotation.x = Math.PI / 2;
  chamber.position.z = -0.5;
  chamber.receiveShadow = true;
  const bed = new Mesh(new CircleGeometry(0.62, 64), bedMat);
  bed.position.z = -0.95;
  body.add(chamber, bed);

  const core = new Group();
  core.position.z = -0.45;
  const crystalMat = new MeshBasicMaterial({ color: PALE.clone() });
  const crystal = new Mesh(new IcosahedronGeometry(0.1, 0), crystalMat);
  const coreGlowMat = glow(glowTex, RED);
  const coreGlow = new Mesh(new PlaneGeometry(1.3, 1.3), coreGlowMat);
  const coreLight = new PointLight(RED, 0, 3, 0);
  core.add(crystal, coreGlow, coreLight);
  body.add(core);
  const flood = new PointLight(PALE, 0, 4, 0);
  flood.position.z = 0.75;
  body.add(flood);

  // Two gyroscope rings around the vault; they align and disengage when it opens.
  const gyros = [
    { inner: 1.17, outer: 1.235, depth: 0.035, tilt: [1.18, 0.22], speed: 0.22, repeat: 6 },
    { inner: 1.31, outer: 1.35, depth: 0.025, tilt: [0.32, 1.12], speed: -0.15, repeat: 8 },
  ].map((spec, index) => {
    const mount = new Group();
    const spin = new Group();
    const ring = new Mesh(lathe(ringProfile(spec.inner, spec.outer, -spec.depth, spec.depth, spec.depth * 0.35), 192), steel);
    ring.castShadow = ring.receiveShadow = true;
    const inlayMat = glow(stripTex, RED);
    const runes = band(spec.inner + 0.01, spec.outer - 0.01, 192, spec.repeat);
    const front = new Mesh(runes, inlayMat);
    front.position.z = spec.depth + 0.001;
    const rear = new Mesh(runes, inlayMat);
    rear.rotation.y = Math.PI;
    rear.position.z = -spec.depth - 0.001;
    spin.add(ring, front, rear);
    mount.add(spin);
    body.add(mount);
    return { ...spec, index, mount, spin, inlayMat, angle: index * 1.3 };
  });

  const shardGeometry = new OctahedronGeometry(1, 0);
  shardGeometry.scale(0.045, 0.15, 0.045);
  const shards = new InstancedMesh(shardGeometry, obsidian, SHARDS);
  const shardSeeds = Array.from({ length: SHARDS }, (_, i) => ({
    r: 1.55 + hash(i * 3.3) * 0.75,
    angle: (i / SHARDS) * TAU + hash(i) * 0.4,
    speed: 0.05 + hash(i * 5.1) * 0.08,
    z: (hash(i * 7.7) - 0.5) * 1.2,
    tumble: 0.3 + hash(i * 2.2) * 0.8,
    size: 0.7 + hash(i * 9.9) * 0.7,
  }));
  shards.castShadow = true;
  art.add(shards);

  const sigilMat = new ShaderMaterial({
    uniforms: { uMap: { value: sigilTex }, uTrace: { value: 0 }, uGlow: { value: 0 }, uTime: { value: 0 }, uColor: { value: RED.clone() } },
    vertexShader: UV_VERTEX,
    fragmentShader: SIGIL_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const backSigil = new Mesh(new PlaneGeometry(3.6, 3.6), sigilMat);
  backSigil.position.z = -1.15;
  const haloMat = glow(glowTex, DEEP);
  const halo = new Mesh(new PlaneGeometry(5.2, 5.2), haloMat);
  halo.position.z = -1.4;
  art.add(backSigil, halo);

  const coneMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uColor: { value: PALE.clone() }, uLength: { value: 2.2 } },
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const cone = new Mesh(new CylinderGeometry(1.9, 0.62, 2.2, 64, 1, true), coneMat);
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 1.1;
  const shockMat = glow(null, PALE);
  const shock = new Mesh(new RingGeometry(0.97, 1, 128), shockMat);
  shock.position.z = 0.09;
  body.add(cone, shock);

  // Sparks share one buffer: a burst from the core when it opens, and a gathering swarm during the summon.
  const sparkCount = compact ? 140 : 260;
  const sparkGeometry = new BufferGeometry();
  const sparkDirs = new Float32Array(sparkCount * 3);
  const sparkSeeds = new Float32Array(sparkCount * 4);
  for (let i = 0; i < sparkCount; i++) {
    const theta = hash(i * 1.7) * TAU;
    const spread = 0.4 + hash(i * 2.9) * 0.9;
    const forward = 0.2 + hash(i * 4.3) * 1.0;
    const length = Math.hypot(spread, forward);
    sparkDirs.set([(Math.cos(theta) * spread) / length, (Math.sin(theta) * spread) / length, forward / length], i * 3);
    sparkSeeds.set([hash(i * 6.1), hash(i * 8.3), hash(i * 9.7), hash(i * 11.9)], i * 4);
  }
  sparkGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(sparkCount * 3), 3));
  sparkGeometry.setAttribute("aDir", new Float32BufferAttribute(sparkDirs, 3));
  sparkGeometry.setAttribute("aSeed", new Float32BufferAttribute(sparkSeeds, 4));
  const sparkMaterial = (mode: number) =>
    new ShaderMaterial({
      uniforms: {
        uAge: { value: -1 },
        uMode: { value: mode },
        uPixel: { value: 1 },
        uSize: { value: 0.03 },
        uAlpha: { value: 1 },
        uColor: { value: RED.clone() },
        uHot: { value: PALE.clone() },
      },
      vertexShader: SPARK_VERTEX,
      fragmentShader: POINT_FRAGMENT,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
  const sparks = new Points(sparkGeometry, sparkMaterial(0));
  const gather = new Points(sparkGeometry, sparkMaterial(1));
  sparks.frustumCulled = gather.frustumCulled = false;
  core.add(sparks, gather);

  const emberCount = compact ? 90 : 170;
  const emberGeometry = new BufferGeometry();
  const emberSeeds = new Float32Array(emberCount * 4);
  for (let i = 0; i < emberCount; i++) emberSeeds.set([hash(i * 1.3 + 7), hash(i * 2.1 + 3), hash(i * 3.7 + 1), hash(i * 5.3 + 9)], i * 4);
  emberGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(emberCount * 3), 3));
  emberGeometry.setAttribute("aSeed", new Float32BufferAttribute(emberSeeds, 4));
  const emberMat = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixel: { value: 1 },
      uAlpha: { value: 0 },
      uSize: { value: 0.045 },
      uPull: { value: 0 },
      uCenter: { value: new Vector3() },
      uBox: { value: new Vector3(7, 4.5, 3.5) },
      uColor: { value: RED.clone() },
      uHot: { value: PALE.clone() },
    },
    vertexShader: EMBER_VERTEX,
    fragmentShader: POINT_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const embers = new Points(emberGeometry, emberMat);
  embers.position.z = -2.5;
  embers.frustumCulled = false;
  scene.add(embers);

  const smokeLayers = [-7, -11, -15].slice(0, compact ? 2 : 3).map((z, i) => {
    const material = new ShaderMaterial({
      uniforms: {
        uMap: { value: smokeTex },
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uColor: { value: DEEP.clone() },
        uDrift: { value: new Vector2(0.006 * (i % 2 ? 1 : -1), 0.004 + i * 0.002) },
      },
      vertexShader: UV_VERTEX,
      fragmentShader: SMOKE_FRAGMENT,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const layer = new Mesh(new PlaneGeometry(1, 1), material);
    layer.position.z = z;
    layer.renderOrder = -10;
    scene.add(layer);
    return { layer, material, z };
  });

  /* Lights */
  const hemi = new HemisphereLight(0x6a5058, 0x080304, 0);
  const key = new DirectionalLight(0xfff1ec, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  const rimLeft = new PointLight(RED, 0, 10, 0);
  const rimRight = new PointLight(RED, 0, 10, 0);
  const conLight = new PointLight(RED, 0, 10, 0);
  scene.add(hemi, key, key.target, rimLeft, rimRight, conLight);

  /* ------------------------------------------------------------------ the console */
  const con = new Group();
  scene.add(con);
  const screenMat = new ShaderMaterial({
    uniforms: {
      uSize: { value: new Vector2(1, 1) },
      uPower: { value: 0 },
      uLevel: { value: 1 },
      uScan: { value: 0 },
      uNoise: { value: 0 },
      uFlash: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: RED.clone() },
      uSheen: { value: new Vector2() },
      uHoleA: { value: new Vector4(0, 0, -1, -1) },
      uHoleB: { value: new Vector4(0, 0, -1, -1) },
    },
    vertexShader: UV_VERTEX,
    fragmentShader: SCREEN_FRAGMENT,
  });
  const conSeamMat = glow(null, RED);
  const backSeamMat = glow(null, RED);
  const conHaloMat = glow(haloTex, RED);
  const inlayMat = glow(lineTex, RED);
  const portGlowMat = glow(glowTex, RED);
  const unitPlane = new PlaneGeometry(1, 1);
  const slab = new Mesh(new BufferGeometry(), slabMat);
  const screen = new Mesh(unitPlane, screenMat);
  const screenSeam = new Mesh(new BufferGeometry(), conSeamMat);
  const recessGeometry = recess();
  const sockets = [new Mesh(recessGeometry, [slabMat, socketMat]), new Mesh(recessGeometry, [slabMat, socketMat])];
  const conHalo = new Mesh(unitPlane, conHaloMat);
  const inlays = [new Mesh(unitPlane, inlayMat), new Mesh(unitPlane, inlayMat)];
  slab.receiveShadow = true;
  con.add(slab, screen, screenSeam, ...sockets, conHalo, ...inlays);

  // Frame pieces fly in from their own directions (CSS px offsets and turns) and lock around the slab.
  type Piece = { group: Group; home: Vector3; away: [number, number, number]; turn: [number, number, number]; order: number };
  const pieces: Piece[] = [];
  const piece = (order: number, away: [number, number, number], turn: [number, number, number], ...parts: Object3D[]) => {
    const group = new Group();
    group.add(...parts);
    con.add(group);
    const made = { group, home: new Vector3(), away, turn, order };
    pieces.push(made);
    return made;
  };
  const backPlate = new Mesh(new BufferGeometry(), slabMat);
  const backSeam = new Mesh(new BufferGeometry(), backSeamMat);
  const backPiece = piece(0, [0, 0, -220], [0, 0, 0], backPlate, backSeam);
  const rivetGeometry = new CylinderGeometry(1, 1, 1, 8);
  rivetGeometry.rotateX(Math.PI / 2);
  const rails = [-1, 1].map((side, i) => {
    const bar = new Mesh(new BufferGeometry(), trimMat);
    const light = new Mesh(unitPlane, conSeamMat);
    const rivets = [0, 1, 2].map(() => new Mesh(rivetGeometry, trimMat));
    return { side, bar, light, rivets, piece: piece(1 + i * 0.5, [side * 140, 0, 60], [0, side * 0.9, 0], bar, light, ...rivets) };
  });
  const brackets = [0, 1, 2, 3].map((i) => {
    const sx = i % 2 ? 1 : -1;
    const sy = i < 2 ? 1 : -1;
    const mesh = new Mesh(new BufferGeometry(), trimMat);
    mesh.scale.set(sx, sy, 1);
    return { sx, sy, mesh, piece: piece(2 + i * 0.5, [sx * 70, sy * 70, 120], [0, 0, sx * sy * 0.6], mesh) };
  });
  const crestMesh = new Mesh(new BufferGeometry(), trimMat);
  const keelMesh = new Mesh(new BufferGeometry(), trimMat);
  keelMesh.scale.set(0.72, -1, 1);
  const crest = piece(4, [0, 110, 40], [0.8, 0, 0], crestMesh);
  const keel = piece(4.5, [0, -90, 40], [-0.8, 0, 0], keelMesh);
  const port = new Group();
  const portNode = new Mesh(new OctahedronGeometry(1, 0), trimMat);
  const portGlow = new Mesh(unitPlane, portGlowMat);
  port.add(portNode, portGlow);
  con.add(port);

  const beamMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uFlow: { value: 0 }, uHead: { value: -1 }, uBack: { value: -1 }, uColor: { value: RED.clone() } },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const beam = new Mesh(new BufferGeometry(), beamMat);
  beam.frustumCulled = false;
  scene.add(beam);

  /* ------------------------------------------------------------------ layout */
  let W = 0;
  let H = 0;
  let f = 1;
  let k = 0.01;
  let hostHeight = 0;
  let hostLeft = 0;
  let hostTop = 0;
  const artRest = new Vector3(0, 0, Z_ART);
  let artScale = 1;
  const conRest = new Vector3();
  let panelW = 0;
  let panelH = 0;
  let panelCX = 0;
  let panelCY = 0;
  /** The panel's centre relative to the stage, kept while the panel is hidden. */
  let panelX = 0;
  let panelY = 0;
  let consoleKey = "";
  let beamKey = "";
  const artBox = { x: 0, y: 0, r: 1 };
  /** Port of the link on the console, in console space. */
  const portAt = new Vector3();
  let laidOut = false;

  const swap = (mesh: Mesh, geometry: BufferGeometry) => {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  };
  const share = (meshes: Mesh[], geometry: BufferGeometry) => {
    for (const old of new Set(meshes.map((mesh) => mesh.geometry))) old.dispose();
    for (const mesh of meshes) mesh.geometry = geometry;
  };

  function buildConsole() {
    const u = k;
    const hw = (panelW / 2 + CON.margin) * u;
    const hh = (panelH / 2 + CON.margin) * u;
    swap(slab, slabGeometry(hw, hh, CON.cut * u, (panelW / 2 + CON.inset) * u, (panelH / 2 + CON.inset) * u, CON.holeCut * u, CON.depth * u, CON.bevel * u));
    slab.position.z = CON.recess * u;
    const sw = panelW + 2 * CON.inset + 4;
    const sh = panelH + 2 * CON.inset + 4;
    screen.scale.set(sw * u, sh * u, 1);
    screen.position.z = -u;
    screenMat.uniforms.uSize.value.set(sw, sh);
    swap(screenSeam, outline((panelW / 2 + CON.inset) * u, (panelH / 2 + CON.inset) * u, CON.holeCut * u, 1.6 * u));
    screenSeam.position.z = -0.5 * u;

    const backZ = (CON.recess - CON.depth - 6) * u;
    swap(backPlate, plate(chamfer(new Shape(), hw + CON.back * u, hh + CON.back * u, (CON.cut + 6) * u), CON.backDepth * u, 2 * u));
    swap(backSeam, outline(hw + 2 * u, hh + 2 * u, CON.cut * u, 2.2 * u));
    backSeam.position.z = 0.4 * u;
    backPiece.home.set(0, 0, backZ);

    const railLength = Math.max(60, panelH * 0.62) * u;
    share(
      rails.map((rail) => rail.bar),
      plate(chamfer(new Shape(), 4 * u, railLength / 2, 3 * u), 16 * u, 1.5 * u),
    );
    for (const rail of rails) {
      rail.light.scale.set(1.4 * u, railLength * 0.78, 1);
      rail.light.position.z = 0.4 * u;
      rail.rivets.forEach((rivet, i) => {
        rivet.scale.set(2.2 * u, 2.2 * u, 3 * u);
        rivet.position.set(0, (i - 1) * railLength * 0.4, 1 * u);
      });
      rail.piece.home.set(rail.side * (hw + 9 * u), 0, (CON.recess - 6) * u);
    }

    const arm = Math.min(64, panelW * 0.2, panelH * 0.3) * u;
    share(
      brackets.map((b) => b.mesh),
      plate(bracket(arm, 9 * u, 5 * u), 7 * u, 1.2 * u),
    );
    for (const b of brackets) {
      b.piece.home.set(b.sx * (hw - 3 * u), b.sy * (hh - 3 * u), (CON.recess + 7) * u);
    }

    const crestWidth = Math.min(170, panelW * 0.42) * u;
    share([crestMesh, keelMesh], plate(trapezoid(crestWidth, crestWidth * 0.7, 12 * u), 12 * u, 1.5 * u));
    crest.home.set(0, hh - 2 * u, (CON.recess - 2) * u);
    keel.home.set(0, -hh + 2 * u, (CON.recess - 2) * u);

    const inlayWidth = Math.min(300, panelW * 0.6) * u;
    inlays.forEach((inlay, i) => {
      inlay.scale.set(inlayWidth, 9 * u, 1);
      inlay.position.set(0, (i ? -1 : 1) * (panelH / 2 + CON.inset + 7.5) * u, (CON.recess + 0.3) * u);
    });
    conHalo.scale.set((panelW + 2 * CON.margin) * u * 1.7, (panelH + 2 * CON.margin) * u * 1.7, 1);
    conHalo.position.z = backZ - 30 * u;
    portNode.scale.set(4 * u, 6 * u, 4 * u);
    portGlow.scale.setScalar(46 * u);
    portGlow.position.z = 2 * u;
  }

  /** Places the console's link port on the side facing the vault and runs the link to the vault's face. */
  function buildBeam() {
    const u = k;
    const dx = artRest.x - conRest.x;
    const dy = artRest.y - conRest.y;
    const hw = (panelW / 2 + CON.margin) * u;
    const hh = (panelH / 2 + CON.margin) * u;
    if (Math.abs(dx) > Math.abs(dy)) portAt.set(Math.sign(dx) * (hw + 17 * u), 0, CON.recess * u);
    else portAt.set(0, Math.sign(dy) * (hh + 15 * u), (CON.recess - 2) * u);
    port.position.copy(portAt);
    const keyed = `${(portAt.x + conRest.x).toFixed(3)},${(portAt.y + conRest.y).toFixed(3)},${artRest.x.toFixed(3)},${artRest.y.toFixed(3)},${artScale.toFixed(3)},${k.toFixed(6)}`;
    if (keyed === beamKey) return;
    beamKey = keyed;
    const start = portAt.clone().add(conRest);
    const end = new Vector3(artRest.x, artRest.y, Z_ART + 0.15 * artScale);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += Math.abs(end.x - start.x) * 0.12 + 0.3;
    mid.z += 1.6;
    swap(beam, new TubeGeometry(new QuadraticBezierCurve3(start, mid, end), 72, 1.6 * k, 6, false));
  }

  const holes = [screenMat.uniforms.uHoleA.value as Vector4, screenMat.uniforms.uHoleB.value as Vector4];
  /** Offset of an element inside the panel, from layout (not transforms). */
  const within = (el: HTMLElement | null, root: HTMLElement) => {
    if (!el?.offsetWidth) return null;
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = el;
    while (node && node !== root) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return node === root ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
  };
  function socket(index: number, box: { x: number; y: number; w: number; h: number } | null, pad: number, depth: number) {
    const mesh = sockets[index];
    if (!box) {
      mesh.visible = false;
      holes[index].set(0, 0, -1, -1);
      return;
    }
    const cx = box.x + box.w / 2 - panelW / 2;
    const cy = panelH / 2 - (box.y + box.h / 2);
    holes[index].set(cx, cy, box.w / 2 + pad, box.h / 2 + pad);
    mesh.visible = true;
    mesh.position.set(cx * k, cy * k, -k);
    mesh.scale.set((box.w + 2 * pad) * k, (box.h + 2 * pad) * k, depth * k);
  }

  function resize() {
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    f = H / (2 * TAN);
    k = DIST / f;
    const pixel = (H * dpr) / (2 * TAN);
    for (const material of [sparks.material, gather.material, emberMat] as ShaderMaterial[]) material.uniforms.uPixel.value = pixel;
    for (const { layer, z } of smokeLayers) {
      const height = 2 * (DIST - z) * TAN * 1.3;
      layer.scale.set(height * camera.aspect, height, 1);
    }
    const halfH = (DIST + 2.5) * TAN;
    emberMat.uniforms.uBox.value.set(halfH * camera.aspect * 1.05, halfH * 1.05, 3.5);
  }

  /** Reads the page layout: sizes the canvas to the hero and maps the vault and the console onto their elements. */
  function measure() {
    const stage = host.parentElement;
    const artEl = refs.artifact.current;
    const panel = refs.panel.current;
    if (!stage || !artEl || !panel) return;
    const s = stage.getBoundingClientRect();
    const a = artEl.getBoundingClientRect();
    // The panel hides while the rewards show; the console keeps its last place and shape meanwhile.
    // Layout offsets, not its rect: the panel itself carries the console's transform.
    const parent = panel.offsetParent as HTMLElement | null;
    const pw = panel.offsetWidth;
    const ph = panel.offsetHeight;
    if (parent && pw && ph) {
      const p = parent.getBoundingClientRect();
      panelW = pw;
      panelH = ph;
      panelX = p.left + parent.clientLeft + panel.offsetLeft + pw / 2 - s.left;
      panelY = p.top + parent.clientTop + panel.offsetTop + ph / 2 - s.top;
    }
    const firstScreen = window.innerHeight - (s.top + window.scrollY);
    const lowest = Math.max(a.bottom - s.top, panelY + panelH / 2 + CON.margin) + Math.max(96, window.innerHeight * 0.14);
    const height = Math.round(Math.min(s.height, Math.max(firstScreen, lowest)));
    if (Math.abs(height - hostHeight) > 2) {
      hostHeight = height;
      host.style.height = `${height}px`;
    }
    hostLeft = s.left;
    hostTop = s.top;
    if (Math.abs(s.width - W) > 0.5 || hostHeight !== H) {
      W = s.width;
      H = hostHeight;
      if (W > 0 && H > 0) resize();
    }
    if (!W || !H) return;
    const cx = hostLeft + W / 2;
    const cy = hostTop + H / 2;
    const kA = (DIST - Z_ART) / f;
    artRest.set((a.left + a.width / 2 - cx) * kA, -(a.top + a.height / 2 - cy) * kA, Z_ART);
    artScale = (Math.min(a.width, a.height) / 2) * kA * ART_FILL;
    artBox.x = a.left + a.width / 2;
    artBox.y = a.top + a.height / 2;
    artBox.r = Math.max(1, Math.min(a.width, a.height) / 2);

    if (panelW) {
      panelCX = hostLeft + panelX;
      panelCY = hostTop + panelY;
      conRest.set((panelX - W / 2) * k, -(panelY - H / 2) * k, 0);
      const shape = `${Math.round(panelW)}x${Math.round(panelH)}@${k.toFixed(6)}`;
      if (shape !== consoleKey) {
        consoleKey = shape;
        buildConsole();
      }
      if (pw && ph) {
        socket(0, within(panel.querySelector<HTMLElement>(".vx-input"), panel), 3, 8);
        socket(1, within(panel.querySelector<HTMLElement>(".vx-actions"), panel), 8, 5);
      }
      buildBeam();
    }
    laidOut = true;
  }

  /* ------------------------------------------------------------------ state */
  let phase = init.phase;
  let round = init.round;
  let phaseAt = -1e7;
  let charge = init.charge;
  let motion = init.motion;
  let revealing = init.revealing;
  let revealAt = -1e7;
  let intro = init.intro;
  let introKind: IntroKind = "pending";
  let introStart = 0;
  let skipAt = -1;
  let skipFrom = 0;
  let keyAt = -1e7;
  let typedAt = -1e7;
  let pressing = false;
  let releasedAt = -1e7;
  const pointer = { x: 0, y: 0, seen: false };

  const target = {} as Levels;
  const shot = {} as Shots;
  const level = Object.fromEntries(LEVEL_KEYS.map((name) => [name, spring(name === "spin" || name === "tilt" || name === "screen" ? 1 : 0)])) as Record<LevelKey, ReturnType<typeof spring>>;
  const tiltX = spring();
  const tiltY = spring();
  const parX = spring();
  const parY = spring();
  const lookX = spring();
  const lookY = spring();
  const idle = spring();
  const shake = spring();
  const artX = spring();
  const artY = spring();
  const artS = spring(1);
  const dialS = spring();
  const openS = spring();
  const disS = spring();
  const approach: Osc = { value: 0, velocity: 0 };
  const retract: Osc = { value: 0, velocity: 0 };
  let dialMark = 0;
  let dialAlign = 0;

  const introElapsed = (now: number) => {
    if (introKind === "none" || introKind === "pending") return 0;
    const raw = now - introStart;
    if (skipAt < 0) return raw;
    return lerp(skipFrom, INTRO_TOTAL[introKind], easeOut(span(now - skipAt, 0, 380)));
  };
  function decideIntro(now: number) {
    if (motion === "off") introKind = "none";
    else if (!intro.done && intro.at <= 0) introKind = "pending";
    else if (!intro.done && now - intro.at < SUMMON[intro.kind].total - 250) {
      introKind = intro.kind;
      introStart = intro.at;
    } else {
      introKind = "late";
      introStart = now;
    }
  }

  /* ------------------------------------------------------------------ frame */
  const tint = new Color();
  const coreTint = new Color();
  const camPos = new Vector3();
  const look = new Vector3();
  const corePos = new Vector3();
  const A = new Matrix4();
  const M = new Matrix4();
  let lastTransform = "";
  let lastOpacity = "";
  let last = 0;
  let slowFrames = 0;
  let frames = 0;
  let windowStart = 0;

  function frame(now: number) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const still = motion === "off";
    const time = now / 1000;
    measure();
    if (!laidOut || !W || !H) return;

    const ie = introElapsed(now);
    const I = pose(introKind, ie);
    const pace = motion === "subtle" ? 0.45 : 1;
    const pe = still ? 1e9 : now - phaseAt;
    choreograph(phase, pe, now, charge, pace, revealing, still ? 1e9 : now - revealAt, target, shot);
    for (const name of LEVEL_KEYS) {
      const s = level[name];
      s.target = target[name];
      if (still) {
        s.value = s.target;
        s.velocity = 0;
      } else follow(s, LEVEL_TIMES[name], dt);
    }
    const settle = (s: ReturnType<typeof spring>, seconds: number) => {
      if (still) {
        s.value = s.target;
        s.velocity = 0;
      } else follow(s, seconds, dt);
    };

    // Pointer: the console leans toward it, the camera drifts with it, the vault watches it. Mouse only.
    const stable = phase === "verifying" || now - typedAt < 1200 || pressing || now - releasedAt < 300;
    let tx = 0;
    let ty = 0;
    let near = 0;
    let px = 0;
    let py = 0;
    let lx = 0;
    let ly = 0;
    if (fine && pointer.seen && !still) {
      const inside = pointer.x >= hostLeft && pointer.x <= hostLeft + W && pointer.y >= hostTop && pointer.y <= hostTop + H;
      if (inside) {
        const scale = motion === "subtle" ? 0.5 : 1;
        const halfW = Math.max(1, panelW / 2);
        const halfH = Math.max(1, panelH / 2);
        ty = soft(((pointer.x - panelCX) / halfW) * 0.8) * MAX_TILT * scale;
        tx = soft(((pointer.y - panelCY) / halfH) * 0.8) * MAX_TILT * 0.75 * scale;
        const pad = 48;
        near = Math.abs(pointer.x - panelCX) < halfW + pad && Math.abs(pointer.y - panelCY) < halfH + pad ? scale : 0;
        px = soft((pointer.x - (hostLeft + W / 2)) / (W / 2)) * scale;
        py = soft((pointer.y - (hostTop + H / 2)) / (H / 2)) * scale;
      }
      lx = soft((pointer.x - artBox.x) / (artBox.r * 2));
      ly = soft((pointer.y - artBox.y) / (artBox.r * 2));
    }
    if (!pressing) {
      tiltX.target = stable ? 0 : tx;
      tiltY.target = stable ? 0 : ty;
      parX.target = stable ? 0 : px;
      parY.target = stable ? 0 : py;
    }
    lookX.target = lx;
    lookY.target = ly;
    // The idle drift stops under the pointer, so the controls hold still to be clicked.
    idle.target = fine && motion === "full" && !stable && near === 0 ? 1 : 0;
    settle(tiltX, 0.32);
    settle(tiltY, 0.32);
    settle(parX, 0.6);
    settle(parY, 0.6);
    settle(lookX, 0.5);
    settle(lookY, 0.5);
    settle(idle, 0.8);
    shake.target = shot.shake;
    settle(shake, 0.05);
    if (still) {
      approach.value = retract.value = 0;
      approach.velocity = retract.velocity = 0;
      if (shot.retract) retract.value = shot.retract;
    } else {
      oscillate(approach, stable ? 0 : near, 2.2, 0.55, dt);
      oscillate(retract, shot.retract, 1.5, shot.retract > 0.01 ? 1 : 0.62, dt);
    }

    /* The vault */
    const first = artS.value === 1 && artX.value === 0 && artY.value === 0;
    artX.target = artRest.x;
    artY.target = artRest.y;
    artS.target = artScale;
    if (first || still) {
      artX.value = artX.target;
      artY.value = artY.target;
      artS.value = artS.target;
    } else {
      follow(artX, 0.35, dt);
      follow(artY, 0.35, dt);
      follow(artS, 0.35, dt);
    }
    const S = artS.value;
    const rise = (1 - I.art) * I.rise;
    art.position.set(artX.value, artY.value - 1.35 * S * rise - 0.06 * S * shot.sag, Z_ART - 2.4 * S * rise);
    art.scale.setScalar(S);
    const sway = still ? 0 : 1;
    body.rotation.set(
      0.35 * rise + lookY.value * 0.1 + sway * 0.035 * Math.sin(time * 0.17 + 1) + 0.05 * shot.sag,
      -0.9 * rise + lookX.value * 0.15 + sway * 0.06 * Math.sin(time * 0.21),
      0,
    );
    body.position.y = sway * 0.025 * Math.sin(time * 0.5);

    // The dial drifts, ratchets while checking, jams on a wrong code and lines up on a right one.
    if (phase === "verifying") {
      dialS.target = dialMark + (Math.floor(pe / (420 * pace)) + 1) * (TAU / 36);
      settle(dialS, 0.07);
    } else if (phase === "granted" || phase === "already") {
      dialS.target = lerp(dialMark, dialAlign, shot.align);
      settle(dialS, 0.1);
    } else if (phase === "locked" || phase === "unavailable") settle(dialS, 0.25);
    else {
      dialS.target += dt * 0.05 * level.spin.value * sway;
      settle(dialS, 0.3);
    }
    const jam = phase === "invalid" && !still ? Math.exp(-pe / 200) : 0;
    dial.rotation.z = -(dialS.value + 0.21 * jam * Math.sin(pe / 38));

    const teethAt = 0.735 + 0.17 * level.teeth.value;
    for (let i = 0; i < SEGMENTS; i++) {
      const a = ((i + 0.5) / SEGMENTS) * TAU;
      dummy.position.set(Math.sin(a) * teethAt, Math.cos(a) * teethAt, 0);
      dummy.rotation.set(0, 0, -a);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      teeth.setMatrixAt(i, dummy.matrix);
    }
    teeth.instanceMatrix.needsUpdate = true;

    if (shot.open !== null) {
      openS.value = shot.open;
      openS.velocity = 0;
    } else {
      openS.target = 0;
      settle(openS, 0.45);
    }
    const open = openS.value;
    for (const leaf of leaves) leaf.rotation.x = open * 1.5;
    door.rotation.z = -open * 0.35 + 0.012 * jam * Math.sin(pe / 26);
    hub.position.z = -0.32 * open;
    hub.scale.setScalar(Math.max(0.001, 1 - open * 0.95));

    disS.target = shot.disengage;
    settle(disS, 0.4);
    const dis = disS.value;
    for (const g of gyros) {
      g.angle += dt * g.speed * (level.spin.value + 5 * (1 - I.art)) * sway;
      g.spin.rotation.z = g.angle;
      const tl = level.tilt.value;
      g.mount.rotation.set(g.tilt[0] * tl, g.tilt[1] * tl, 0);
      g.mount.scale.setScalar(1 + 0.42 * dis * (1 + g.index * 0.15));
      g.mount.position.z = -0.4 * dis;
    }
    shardSeeds.forEach((seed, i) => {
      seed.angle += dt * seed.speed * (0.4 + 0.6 * level.spin.value) * sway;
      const r = seed.r * (1 + 0.5 * dis) * (1 + 1.4 * (1 - I.art));
      dummy.position.set(Math.sin(seed.angle) * r, Math.cos(seed.angle) * r * 0.85, seed.z + sway * Math.sin(time * 0.4 + i) * 0.08);
      dummy.rotation.set(time * seed.tumble * sway, (time * seed.tumble * 0.7 + i) * sway, seed.angle);
      dummy.scale.setScalar(seed.size * (0.3 + 0.7 * I.art));
      dummy.updateMatrix();
      shards.setMatrixAt(i, dummy.matrix);
    });
    shards.instanceMatrix.needsUpdate = true;
    crystal.rotation.set(time * 0.6 * sway, time * 0.9 * sway, 0);

    // Light and colour.
    const seam = level.seam.value;
    const coreLevel = level.core.value;
    const dim = level.dim.value;
    const ash = level.ash.value;
    const kp = Math.exp(-(now - keyAt) / 180);
    tint.copy(RED).lerp(PALE, level.pale.value * 0.85).lerp(ASH, ash);
    coreTint.copy(RED).lerp(PALE, Math.min(1, level.pale.value * 0.7 + open * 0.5)).lerp(ASH, ash);
    const glowSeams = I.seams;
    seamMat.color.copy(tint).multiplyScalar(seam * glowSeams * (1 - open) * 1.6);
    blade.emissive.copy(tint);
    blade.emissiveIntensity = (0.3 + 0.8 * seam) * glowSeams * (1 + 0.6 * open);
    bladeSide.emissive.copy(coreTint);
    bladeSide.emissiveIntensity = open * coreLevel * 0.3;
    housingRunesMat.color.copy(tint).multiplyScalar((0.35 + 0.65 * seam) * glowSeams);
    dialRunesMat.color.copy(tint).multiplyScalar((0.45 + 0.8 * seam + 0.5 * kp) * glowSeams);
    for (const g of gyros) g.inlayMat.color.copy(tint).multiplyScalar((0.3 + 0.5 * seam) * glowSeams * (1 - 0.5 * dis));
    chamberMat.emissive.copy(coreTint);
    chamberMat.emissiveIntensity = coreLevel * (0.25 + 0.9 * open) * glowSeams;
    bedMat.emissive.copy(coreTint);
    bedMat.emissiveIntensity = coreLevel * (0.2 + open) * glowSeams;
    crystalMat.color.copy(coreTint).multiplyScalar(0.5 + coreLevel);
    coreGlowMat.color.copy(coreTint).multiplyScalar(coreLevel * (0.25 + 0.9 * open) * glowSeams);
    coreLight.color.copy(coreTint);
    coreLight.intensity = coreLevel * (0.8 + 3 * open) * glowSeams;
    coreLight.distance = 2.6 * S;
    flood.color.copy(coreTint);
    flood.intensity = open * coreLevel * 2.2;
    flood.distance = 3.2 * S;
    sigilMat.uniforms.uTrace.value = I.trace;
    sigilMat.uniforms.uGlow.value = (0.35 + 0.5 * seam + 0.4 * open) * glowSeams * (1 - 0.5 * dim);
    sigilMat.uniforms.uTime.value = time * sway;
    sigilMat.uniforms.uColor.value.copy(tint);
    backSigil.rotation.z = -time * 0.02 * sway;
    haloMat.color.copy(DEEP).lerp(ASH, ash).multiplyScalar((0.18 + 0.3 * coreLevel) * I.light * (1 - 0.5 * dim));
    coneMat.uniforms.uLevel.value = level.shafts.value * open * 1.2;
    coneMat.uniforms.uTime.value = time;
    coneMat.uniforms.uColor.value.copy(coreTint).lerp(PALE, 0.5);
    shock.visible = shot.shock >= 0 && shot.shock < 1;
    if (shock.visible) {
      shock.scale.setScalar(0.8 + 2.6 * easeOut(shot.shock));
      shockMat.color.copy(PALE).multiplyScalar(1.5 * (1 - shot.shock) ** 2 * (motion === "subtle" ? 0.4 : 1));
    }
    const sparkMat = sparks.material as ShaderMaterial;
    sparks.visible = shot.burst >= 0 && shot.burst < 2.5 && !still;
    sparkMat.uniforms.uAge.value = shot.burst;
    sparkMat.uniforms.uSize.value = 0.03 * S;
    sparkMat.uniforms.uAlpha.value = motion === "subtle" ? 0.4 : 1;
    const gatherMat = gather.material as ShaderMaterial;
    gather.visible = I.gather > 0 && I.gather < 1 && !still;
    gatherMat.uniforms.uAge.value = I.gather;
    gatherMat.uniforms.uSize.value = 0.026 * S;

    core.getWorldPosition(corePos);
    emberMat.uniforms.uTime.value = time;
    emberMat.uniforms.uAlpha.value = 0.9 * span(ie, 100, 900) * (introKind === "pending" ? 0 : 1) * (1 - 0.6 * dim) * (1 - 0.4 * ash) * (still ? 0.5 : 1);
    emberMat.uniforms.uPull.value = level.pull.value;
    emberMat.uniforms.uCenter.value.copy(corePos).sub(embers.position);
    emberMat.uniforms.uColor.value.copy(RED).lerp(ASH, ash);
    for (const { material } of smokeLayers) {
      material.uniforms.uTime.value = time;
      material.uniforms.uLevel.value = 0.26 * I.light * (0.6 + 0.4 * Math.min(1, coreLevel)) * (1 - 0.5 * dim);
      material.uniforms.uColor.value.copy(DEEP).lerp(ASH, ash * 0.6);
    }
    const lit = I.light * (1 - 0.35 * dim);
    hemi.intensity = 0.55 * lit;
    key.intensity = 2.3 * lit;
    rimLeft.color.copy(RED).lerp(ASH, ash);
    rimRight.color.copy(DEEP).lerp(ASH, ash);
    rimLeft.intensity = 2.6 * I.light * (1 - 0.5 * dim);
    rimRight.intensity = 1.8 * I.light * (1 - 0.5 * dim);
    key.position.set(art.position.x - 4, art.position.y + 5.5, art.position.z + 8);
    key.target.position.copy(art.position);
    const reach = 1.9 * S;
    const shadowCamera = key.shadow.camera;
    if (shadowCamera.right !== reach) {
      Object.assign(shadowCamera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 30 });
      shadowCamera.updateProjectionMatrix();
    }
    rimLeft.position.set(art.position.x - 1.6 * S, art.position.y + 0.9 * S, art.position.z - 1.2 * S);
    rimRight.position.set(art.position.x + 1.7 * S, art.position.y - 0.5 * S, art.position.z - 1 * S);
    rimLeft.distance = rimRight.distance = 4 * S;
    scene.environmentIntensity = 0.15 + 0.85 * I.light;

    /* The console */
    const u = k;
    const conE = I.con >= 1 ? 1 : easeBack(I.con);
    const off = 1 - conE;
    const side = artRest.x <= conRest.x ? 1 : -1;
    // For the rewards the console sinks back into the dark it rose from, leaving its place to the cards.
    const r = retract.value;
    con.visible = I.con > 0 && r < 0.98;
    con.position.set(
      conRest.x + 8 * u * shot.jolt,
      conRest.y - (panelH * u * 1.3 + 1.2) * (off + r) + idle.value * 1.5 * u * Math.sin(time * 0.5),
      -3 * off - 2 * r + approach.value * CON.approach * u,
    );
    con.rotation.set(
      -0.55 * (off + r) + tiltX.value + idle.value * 0.008 * Math.sin(time * 0.29 + 1),
      0.75 * side * off + tiltY.value + idle.value * 0.012 * Math.sin(time * 0.37),
      0.12 * side * off,
    );
    for (const p of pieces) {
      const begin = p.order * I.stagger;
      const q = I.frame >= 1e8 ? 1 : easeBack(span(I.frame, begin, begin + (introKind === "short" ? 300 : 480)));
      p.group.visible = I.frame > begin - 1;
      const away = 1 - q;
      p.group.position.set(p.home.x + p.away[0] * u * away, p.home.y + p.away[1] * u * away, p.home.z + p.away[2] * u * away);
      p.group.rotation.set(p.turn[0] * away, p.turn[1] * away, p.turn[2] * away);
    }
    const act = I.act;
    const conGlow = act * (1 - 0.65 * r);
    conSeamMat.color.copy(tint).multiplyScalar(seam * conGlow * 1.3);
    backSeamMat.color.copy(tint).multiplyScalar((0.4 + 0.6 * seam) * conGlow);
    inlayMat.color.copy(tint).multiplyScalar((0.35 + 0.6 * seam) * conGlow);
    conHaloMat.color.copy(tint).multiplyScalar(level.halo.value * conGlow * 0.9);
    const beamLevel = level.beam.value;
    portGlowMat.color.copy(tint).multiplyScalar((0.25 + 1.4 * beamLevel + 0.3 * kp) * act);
    socketMat.emissive.copy(tint);
    socketMat.emissiveIntensity = (0.12 + 0.6 * charge + 0.8 * kp) * act * level.screen.value;
    const su = screenMat.uniforms;
    su.uPower.value = span(act, 0.12, 0.8);
    su.uLevel.value = level.screen.value * act;
    su.uScan.value = level.scan.value;
    su.uNoise.value = level.noise.value;
    su.uFlash.value = shot.flash;
    su.uTime.value = time;
    su.uColor.value.copy(tint);
    su.uSheen.value.set(tiltY.value / MAX_TILT, tiltX.value / MAX_TILT);
    conLight.position.set(conRest.x - panelW * u * 0.6, conRest.y + panelH * u * 0.7, 3);
    conLight.intensity = 1.3 * act * (1 - 0.5 * dim);
    conLight.color.copy(RED).lerp(ASH, ash);

    beam.visible = beamKey !== "" && (beamLevel > 0.01 || shot.head >= 0 || shot.back >= 0);
    const bu = beamMat.uniforms;
    bu.uLevel.value = beamLevel;
    bu.uFlow.value = shot.flow;
    bu.uHead.value = shot.head;
    bu.uBack.value = shot.back;
    bu.uTime.value = time;
    bu.uColor.value.copy(tint).multiplyScalar(1.4);

    /* Camera */
    const ca = I.cam;
    const push = level.push.value;
    const jitter = shake.value;
    camPos.set(-1.3 * ca + artRest.x * 0.25 * push + parX.value * 0.35, -2.1 * ca + artRest.y * 0.25 * push - parY.value * 0.22, DIST + 4.8 * ca - 2.1 * push);
    camPos.x += jitter * 0.05 * wobble(time * 24, 1);
    camPos.y += jitter * 0.04 * wobble(time * 21, 4);
    look.set(artRest.x * 0.5 * push, -0.8 * ca + artRest.y * 0.5 * push, -2.2 * ca + Z_ART * 0.15 * push);
    camera.position.copy(camPos);
    camera.lookAt(look);
    if (ca) camera.rotateZ(0.06 * ca);
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();

    register(1 - easeInOut(span(r, 0.12, 0.6)));
    renderer.render(scene, camera);

    // Adapt resolution if frames are slow.
    frames += 1;
    if (dt > 0.022) slowFrames += 1;
    if (now - windowStart > 2000) {
      if (frames >= 6 && slowFrames / frames > 0.3 && dpr > 0.75) {
        dpr = Math.max(0.75, dpr - 0.25);
        resize();
      }
      windowStart = now;
      frames = slowFrames = 0;
    }
  }

  /** Writes the console's pose onto the page's panel so the real controls sit on the 3D screen. */
  function register(opacity: number) {
    const panel = refs.panel.current;
    if (!panel || !panelW) return;
    // CSS space: px around the canvas axis, y down, z toward the viewer, camera at z = f.
    M.makeScale(k, -k, k);
    A.multiplyMatrices(con.matrixWorld, M).premultiply(camera.matrixWorldInverse);
    M.makeScale(1 / k, -1 / k, 1 / k);
    A.premultiply(M);
    M.makeTranslation(0, 0, f);
    A.premultiply(M);
    const ax = hostLeft + W / 2 - panelCX;
    const ay = hostTop + H / 2 - panelCY;
    const e = A.elements;
    let worst = 0;
    for (const [ux, uy] of [
      [-panelW / 2, -panelH / 2],
      [panelW / 2, -panelH / 2],
      [panelW / 2, panelH / 2],
      [-panelW / 2, panelH / 2],
    ]) {
      const z = e[2] * ux + e[6] * uy + e[14];
      const scale = f / Math.max(1, f - z);
      worst = Math.max(worst, Math.abs((e[0] * ux + e[4] * uy + e[12]) * scale + ax - ux), Math.abs((e[1] * ux + e[5] * uy + e[13]) * scale + ay - uy));
    }
    // At rest the transform collapses to none, so text stays crisp.
    const transform = worst < 0.25 ? "" : `translate(${ax.toFixed(2)}px, ${ay.toFixed(2)}px) perspective(${f.toFixed(2)}px) matrix3d(${Array.from(e, (v) => +v.toFixed(6)).join(",")})`;
    if (transform !== lastTransform) {
      panel.style.transform = transform;
      lastTransform = transform;
    }
    const fade = opacity >= 0.995 ? "" : opacity.toFixed(3);
    if (fade !== lastOpacity) {
      panel.style.opacity = fade;
      lastOpacity = fade;
    }
  }

  /* ------------------------------------------------------------------ loop & lifecycle */
  let raf = 0;
  let ready = false;
  let disposed = false;
  let visible = true;
  const running = () => ready && visible && !document.hidden && motion !== "off";
  const loop = (now: number) => {
    raf = 0;
    frame(now);
    if (running()) raf = requestAnimationFrame(loop);
  };
  /** Restarts the loop, or draws one still frame when motion is off. */
  const wake = () => {
    if (disposed || !ready || raf) return;
    if (running()) raf = requestAnimationFrame(loop);
    else if (motion === "off" && visible)
      raf = requestAnimationFrame((now) => {
        raf = 0;
        frame(now);
      });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
  };
  const onLeave = () => {
    pointer.seen = false;
  };
  const onKey = () => {
    typedAt = performance.now();
  };
  const onDown = () => {
    pressing = true;
  };
  const onUp = () => {
    if (!pressing) return;
    pressing = false;
    releasedAt = performance.now();
  };
  const onVisibility = () => wake();
  const onLost = (event: Event) => {
    event.preventDefault();
    cb.fail();
  };
  const panelEl = refs.panel.current;
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("mouseleave", onLeave);
  panelEl?.addEventListener("keydown", onKey);
  panelEl?.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  document.addEventListener("visibilitychange", onVisibility);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  const sight = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    wake();
  });
  sight.observe(host);
  const resizes = new ResizeObserver(() => wake());
  for (const el of [host.parentElement, refs.artifact.current, panelEl]) if (el) resizes.observe(el);

  measure();
  renderer
    .compileAsync(scene, camera)
    .then(() => {
      if (disposed) return;
      ready = true;
      decideIntro(performance.now());
      frame(performance.now());
      cb.ready();
      wake();
    })
    .catch(() => {
      if (!disposed) cb.fail();
    });

  return {
    setPhase(next: ScenePhase, nextRound: number) {
      if (next === phase && nextRound === round) return;
      const now = performance.now();
      if (next === "verifying" && phase !== "verifying") approach.velocity -= 2.2;
      const notch = TAU / SEGMENTS;
      dialMark = dialS.value;
      dialAlign = Math.ceil(dialS.value / notch + 0.25) * notch;
      if (next === "granted" && revealing) revealAt = now;
      phase = next;
      round = nextRound;
      phaseAt = now;
      wake();
    },
    setCharge(next: number) {
      charge = next;
      wake();
    },
    setMotion(next: MotionLevel) {
      motion = next;
      if (motion === "off") introKind = "none";
      wake();
    },
    setRevealing(next: boolean) {
      if (next && !revealing) revealAt = performance.now();
      revealing = next;
      wake();
    },
    setIntro(next: SceneIntro) {
      intro = next;
      if (ready && introKind === "pending") decideIntro(performance.now());
    },
    pulse() {
      keyAt = performance.now();
      dialS.target += TAU / 180;
      wake();
    },
    skip() {
      if (introKind === "pending" || introKind === "none") {
        introKind = "none";
        return;
      }
      const now = performance.now();
      const e = introElapsed(now);
      if (skipAt < 0 && e < INTRO_TOTAL[introKind]) {
        skipFrom = e;
        skipAt = now;
      }
    },
    /** Where the core is, in viewport px with CSS depth, so the reward cards can fly out of it. */
    origin(): RevealOrigin | null {
      if (!ready || !W) return null;
      core.getWorldPosition(corePos).applyMatrix4(camera.matrixWorldInverse);
      const axisX = hostLeft + W / 2;
      const axisY = hostTop + H / 2;
      return { x: axisX + corePos.x / k, y: axisY - corePos.y / k, z: corePos.z / k + f, perspective: f, axisX, axisY };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      sight.disconnect();
      resizes.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      panelEl?.removeEventListener("keydown", onKey);
      panelEl?.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      if (panelEl) {
        panelEl.style.transform = "";
        panelEl.style.opacity = "";
      }
      host.style.height = "";
      const geometries = new Set<BufferGeometry>();
      const materials = new Set<Material>();
      scene.traverse((object) => {
        if (object instanceof Mesh || object instanceof Points) {
          geometries.add(object.geometry);
          for (const material of [object.material].flat() as Material[]) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const item of owned) item.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

type Engine = ReturnType<typeof createVaultEngine>;

type Props = {
  artifact: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
  phase: ScenePhase;
  round: number;
  charge: number;
  pulse: number;
  motion: MotionLevel;
  revealing: boolean;
  introKind: SummonKind;
  introAt: number;
  introDone: boolean;
  ref?: Ref<VaultSceneHandle>;
  onReady: () => void;
  onFail: () => void;
};

export default function VaultScene({ artifact, panel, phase, round, charge, pulse, motion, revealing, introKind, introAt, introDone, ref, onReady, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ready = useEffectEvent(() => onReady());
  const fail = useEffectEvent(() => onFail());
  const initial = useEffectEvent((): Init => ({ phase, round, charge, motion, revealing, intro: { kind: introKind, at: introAt, done: introDone } }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: Engine;
    try {
      engine = createVaultEngine(host, { artifact, panel }, initial(), { ready: () => ready(), fail: () => fail() });
    } catch {
      // No WebGL context: the drawn seal stays.
      fail();
      return;
    }
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [artifact, panel]);

  useEffect(() => engineRef.current?.setPhase(phase, round), [phase, round]);
  useEffect(() => engineRef.current?.setCharge(charge), [charge]);
  useEffect(() => engineRef.current?.setMotion(motion), [motion]);
  useEffect(() => engineRef.current?.setRevealing(revealing), [revealing]);
  useEffect(() => engineRef.current?.setIntro({ kind: introKind, at: introAt, done: introDone }), [introKind, introAt, introDone]);
  useEffect(() => {
    if (pulse) engineRef.current?.pulse();
  }, [pulse]);
  useImperativeHandle(ref, () => ({ skip: () => engineRef.current?.skip(), origin: () => engineRef.current?.origin() ?? null }), []);

  return <div ref={hostRef} aria-hidden="true" className="vx-scene" />;
}
