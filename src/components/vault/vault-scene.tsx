"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, type Ref, type RefObject } from "react";
import { createFrameGovernor, renderPixelRatio } from "@/lib/render-budget";
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
  HalfFloatType,
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
  WebGLRenderTarget,
  type Material,
  type Texture,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SHARD_VERTEX } from "@/components/admin/admin-shaders";
import { follow, radialTexture, spring, studioEnvironment } from "@/components/showcase/three-kit";
import type { MotionLevel } from "@/lib/preferences";
import type { VaultLookId } from "@/lib/vault-looks";
import { LATE_ASSEMBLY, PACE, SUMMON, TRANSMIT, UNLOCK, type SummonKind } from "./timing";
import {
  BACKDROP_FRAGMENT,
  BEAM_FRAGMENT,
  BEAM_VERTEX,
  CONE_FRAGMENT,
  CONE_VERTEX,
  DOOR_SPAN,
  EMBER_VERTEX,
  FINISH_FRAGMENT,
  POINT_FRAGMENT,
  SCREEN_FRAGMENT,
  SIGIL_FRAGMENT,
  SMOKE_FRAGMENT,
  SPARK_VERTEX,
  TAU,
  UV_VERTEX,
  VAPOR_FRAGMENT,
  VAPOR_VERTEX,
  band,
  chamberWall,
  chamfer,
  clamp01,
  doorFace,
  easeBack,
  easeIn,
  easeInOut,
  easeOut,
  engravedSigil,
  grain,
  hash,
  heartbeat,
  lathe,
  lerp,
  paint,
  plate,
  runeStrip,
  seams,
  shardPlane,
  smoke,
  softRect,
  span,
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
type Init = { phase: ScenePhase; round: number; charge: number; motion: MotionLevel; revealing: boolean; intro: SceneIntro; look: VaultLookId };

const RED = new Color(0xff1f3d);
const DEEP = new Color(0x9e0a1e);
const PALE = new Color(0xffe2e7);
const ASH = new Color(0x857a7d);
/** Cool steel for rims, haze and the light on the metal; red stays an accent and the core's light. */
const STEEL = new Color(0xb9c0cb);
const HAZE = new Color(0x8f97a3);
/** The console glass's rim and frame line, as on the Admin panels. */
const EDGE = new Color(0xeb2d48);

type SchemeColor = "air" | "haze" | "rim" | "ember" | "hemi" | "key" | "edge" | "metal" | "iron" | "trim" | "glassLo" | "glassHi" | "glare";
type SchemeLevel = "wall" | "smoke" | "bloom" | "edgeGain";
/** Per look: the chamber's air and haze, the light on the metal, the console's glass and how hot it all runs. */
type Scheme = Record<SchemeColor, Color> & Record<SchemeLevel, number> & { env: [accent: number, fill: number] };
const SCHEME_COLORS: SchemeColor[] = ["air", "haze", "rim", "ember", "hemi", "key", "edge", "metal", "iron", "trim", "glassLo", "glassHi", "glare"];
const SCHEME_LEVELS: SchemeLevel[] = ["wall", "smoke", "bloom", "edgeGain"];
const SCHEMES: Record<VaultLookId, Scheme> = {
  obsidian: {
    air: new Color(0x030304),
    haze: HAZE,
    rim: STEEL,
    ember: RED.clone().lerp(ASH, 0.5),
    hemi: new Color(0x5a5f69),
    key: new Color(0xeef2f8),
    edge: new Color(0xe8eef6),
    metal: new Color(0x9a9da3),
    iron: new Color(0x26272a),
    trim: new Color(0x8a8f97),
    glassLo: new Color(0.007, 0.008, 0.01),
    glassHi: new Color(0.018, 0.019, 0.023),
    glare: new Color(0.86, 0.9, 1),
    wall: 1,
    smoke: 1,
    bloom: 1,
    edgeGain: 0.6,
    env: [0.16, 0x2b2f36],
  },
  // The Admin panel's palette: crimson-black air, red-black metal, pale-rose key light and its exact glass.
  crimson: {
    air: new Color(0x0b0205),
    haze: new Color(0xb3142f),
    rim: new Color(0xff3c5a),
    ember: new Color(0xff1f3d),
    hemi: new Color(0x3a0d16),
    key: new Color(0xffd0d8),
    edge: new Color(0xffb3bf),
    metal: new Color(0x6e3540),
    iron: new Color(0x1d0d11),
    trim: new Color(0x8c4a57),
    glassLo: new Color(0.016, 0.005, 0.008),
    glassHi: new Color(0.04, 0.011, 0.018),
    glare: new Color(1, 0.72, 0.78),
    wall: 1.8,
    smoke: 1.6,
    bloom: 1.3,
    edgeGain: 1,
    env: [0.6, 0x3a0d16],
  },
};
const FOV = 30;
const TAN = Math.tan((FOV * Math.PI) / 360);
/** Camera distance to the console plane; there one CSS pixel is one canvas pixel. */
const DIST = 14;
/** The vault floats this far behind the console. */
const Z_ART = -3.2;
/** Housing radius as a share of half the artifact box (the rings and shards spill past it on purpose). */
const ART_FILL = { compact: 0.74, wide: 0.72 };
/** The chamber's back wall. */
const BACK_Z = -20;
const SEGMENTS = 8;
const BOLTS = 24;
const SHARDS = 12;
/** The console in CSS px, as an Admin panel: corner cut, slab depth and overhang, hover lift, link port offset. */
const CON = { cut: 18, slab: 14, grow: 8, lift: 40, port: 22 };
/** How far the console leans toward the pointer (radians at its edge); above Admin's, as the vault's camera is narrower. */
const MAX_TILT = 0.09;

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

type LevelKey = "seam" | "core" | "pale" | "ash" | "dim" | "spin" | "tilt" | "teeth" | "halo" | "screen" | "scan" | "noise" | "beam" | "push" | "pull" | "shafts" | "surge";
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
  surge: 0.3,
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
  /** The console's rim flaring, then a wave (0–1, −1 off) running inward through the seal's engravings. */
  flare: number;
  wave: number;
  /** A sent code: the packet striking the seal, charge rings (0–1, −1 off), the link port lighting, the seal's rejection. */
  impact: number;
  ring: number;
  port: number;
  reject: number;
  /** The unlock: each ring's lock (0–1, outer, inner, dial) with a light pulse as it seats, each bolt's retraction,
   * the hub's key turn, pressure leaking through the seams, vapor age (s, −1 off) and a card leaving the core. */
  locks: number[];
  pulses: number[];
  bolts: number[];
  key: number;
  leak: number;
  vent: number;
  emit: number;
};
type ShotLists = "locks" | "pulses" | "bolts";

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
    surge: 0,
  } satisfies Levels);
  Object.assign(shot, { open: null, align: 0, flash: 0, burst: -1, shock: -1, disengage: 0, head: -1, back: -1, flow: 0, jolt: 0, shake: 0, retract: 0, sag: 0, flare: 0, wave: -1, impact: 0, ring: -1, port: 0, reject: 0, key: 0, leak: 0, vent: -1, emit: 0 } satisfies Omit<Shots, ShotLists>);
  shot.locks.fill(0);
  shot.pulses.fill(0);
  shot.bolts.fill(0);
  const wave = pe >= at(60) && pe < at(700) ? span(pe, at(60), at(640)) : -1;
  const shakes = pace === 1;
  switch (phase) {
    case "verifying": {
      // The code leaves the console as a packet, runs the link and strikes the seal; the mechanism spins up and
      // charges, then holds, breathing with a ring per beat, until the answer comes.
      const depart = at(TRANSMIT.depart);
      const impact = at(TRANSMIT.impact);
      const charged = easeOut(span(pe, impact, at(TRANSMIT.charged)));
      const since = pe - impact;
      const beat = since >= 0 && pe < 1e8 ? 0.5 + 0.5 * Math.cos((TAU * since) / TRANSMIT.breath) : 0;
      out.seam = 0.6 + 0.45 * charged + 0.15 * beat * charged;
      out.core = 0.35 + 0.75 * charged + 0.15 * beat * charged;
      out.spin = 1.5 + 4.5 * charged;
      out.halo = 0.4 + 0.3 * charged;
      out.screen = 1.1;
      out.scan = 1;
      out.beam = pe >= depart ? 1 : 0;
      out.surge = charged * (0.8 + 0.2 * beat);
      out.push = 0.12 * charged;
      out.pull = 0.3 + 0.6 * charged;
      shot.port = 0.7 * span(pe, at(60), depart) * (pe < depart ? 1 : Math.exp(-(pe - depart) / at(260))) + Math.exp(-(((pe - depart) / at(100)) ** 2));
      shot.head = pe >= depart && pe < impact ? easeIn(span(pe, depart, impact)) : -1;
      shot.flow = charged;
      shot.impact = since >= 0 ? Math.exp(-since / at(220)) : 0;
      shot.ring = since >= 0 && pe < 1e8 ? (since % TRANSMIT.breath) / TRANSMIT.breath : -1;
      shot.flare = 0.35 * Math.exp(-(((pe - depart) / at(140)) ** 2));
      break;
    }
    case "granted": {
      // Accepted: the core flashes, the console answers and the key turns. The rings and the dial lock one after
      // another, the bolts retract in turn, pressure vents through the seams, then the iris swings open with weight
      // and the light breaks out. The console steps aside and the cards leave the core.
      const gauss = (t: number, width: number) => Math.exp(-((t / width) ** 2));
      UNLOCK.locks.forEach((start, i) => {
        shot.locks[i] = span(pe, at(start), at(start + UNLOCK.lockTime));
        shot.pulses[i] = gauss(pe - at(start + UNLOCK.lockTime * 0.6), at(110));
      });
      let retracted = 0;
      for (let i = 0; i < SEGMENTS; i++) {
        const from = UNLOCK.retract + i * UNLOCK.retractStep;
        shot.bolts[i] = easeInOut(span(pe, at(from), at(from + UNLOCK.retractTime)));
        retracted += shot.bolts[i] / SEGMENTS;
      }
      const seated = shot.pulses[0] + shot.pulses[1] + shot.pulses[2];
      const vent = at(UNLOCK.vent);
      const burst = at(UNLOCK.burst);
      const swing = span(pe, at(UNLOCK.open), at(UNLOCK.open + UNLOCK.openTime));
      const crack = 0.06 * easeOut(span(pe, vent, vent + at(180)));
      // Heavy: slow to get going, a touch past fully open, then it settles.
      const open = crack + (1 - crack) * (easeInOut(swing) + 0.05 * Math.sin(Math.PI * span(swing, 0.62, 1)));
      shot.align = easeBack(shot.locks[2]);
      shot.open = open;
      shot.key = easeBack(span(pe, at(80), at(380)));
      shot.leak = span(pe, vent, vent + at(120)) * (1 - span(pe, at(UNLOCK.open), burst));
      shot.vent = pe >= vent && pe < 1e8 ? (pe - vent) / 1000 : -1;
      out.pale = 0.35 + 0.65 * easeInOut(span(pe, 0, vent));
      out.seam = 1.05 + 0.2 * seated + 0.9 * shot.leak;
      out.core = 0.95 + 1.6 * easeIn(span(pe, vent, burst)) - 1.3 * easeInOut(span(pe, burst + at(200), burst + at(1500)));
      out.spin = lerp(3, 0.35, span(pe, 0, at(UNLOCK.locks[1])));
      out.tilt = 1;
      out.teeth = retracted;
      out.halo = 0.42;
      out.beam = 1 - span(pe, at(150), at(600));
      out.shafts = easeOut(span(pe, burst - at(120), burst + at(500))) * (1 - 0.55 * span(pe, burst + at(900), burst + at(2000)));
      // A slow push toward the door as it gives, carried on while the cards come out.
      out.push = revealing ? lerp(0.3, 1, easeInOut(span(sinceReveal, 0, at(1500)))) : pe < at(UNLOCK.handoff + 800) ? 0.3 * easeInOut(span(pe, vent, burst + at(300))) : 0;
      shot.impact = gauss(pe - at(70), at(150));
      shot.flash = 0.45 * gauss(pe - at(60), at(170)) + 0.9 * gauss(pe - burst - at(40), at(230));
      shot.flare = gauss(pe - at(40), at(240)) + 0.35 * seated;
      shot.burst = pe >= burst ? (pe - burst) / 1000 : -1;
      shot.shock = pe >= burst ? span(pe, burst, burst + at(900)) : -1;
      shot.disengage = easeOut(span(pe, burst, burst + at(1150)));
      shot.shake = shakes ? 0.18 * seated + 0.3 * Math.max(0, 1 - Math.abs(pe - vent) / 200) * (pe >= vent ? 1 : 0) + (pe >= burst ? Math.max(0, 1 - (pe - burst) / 420) : 0) : 0;
      shot.retract = revealing ? easeInOut(span(sinceReveal, at(250), at(1000))) : 0;
      shot.emit = revealing ? gauss(sinceReveal - at(UNLOCK.reveal - UNLOCK.handoff), at(160)) : 0;
      shot.wave = wave;
      break;
    }
    case "already": {
      // Recognised but spent: the link pales and hands the packet back, the rings align, the door lifts and settles.
      const align = easeInOut(span(pe, 0, at(600)));
      out.beam = 1 - span(pe, 0, at(700));
      out.surge = 0.6 * (1 - span(pe, 0, at(900)));
      shot.back = pe < at(700) ? 1 - easeInOut(pe / at(700)) : -1;
      shot.ring = pe < at(800) ? span(pe, 0, at(800)) : -1;
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
      shot.flare = 0.6 * Math.exp(-(((pe - at(40)) / at(260)) ** 2));
      shot.wave = wave;
      break;
    }
    case "invalid": {
      // The seal flashes and throws the packet back down the link; it strikes the console, which recoils, and the
      // seams pulse red twice while the link fizzles out.
      const recoil = at(TRANSMIT.recoil);
      const hit = pe - recoil;
      const pulses = hit >= 0 && hit < at(1400) ? Math.max(0, Math.sin((Math.PI * hit) / at(700))) : 0;
      out.seam = 0.4 + 0.8 * pulses;
      out.core = 0.12;
      out.spin = 0.3;
      out.dim = 0.1;
      out.halo = 0.25 + 0.3 * pulses;
      out.teeth = -0.05 * Math.exp(-pe / 260);
      out.beam = (1 - span(pe, 0, recoil + at(240))) * (0.7 + 0.3 * Math.cos((TAU * pe) / 170));
      shot.back = pe < recoil ? 1 - easeIn(pe / recoil) : -1;
      shot.reject = Math.exp(-pe / at(260));
      shot.port = hit >= 0 ? 1.6 * Math.exp(-hit / at(200)) : 0;
      shot.jolt = hit >= 0 ? (shakes ? 1 : 0.35) * Math.exp(-hit / at(170)) * Math.sin((TAU * hit) / at(105)) : 0;
      shot.shake = shakes && hit >= 0 ? 0.35 * Math.exp(-hit / 220) : 0;
      shot.flare = 0.7 * pulses;
      break;
    }
    case "unavailable":
      // Dormant: the charge gutters out down an ash-grey link and the vault sags a little in the dark.
      Object.assign(out, { seam: 0.12, core: 0.04, ash: 1, dim: 0.55, spin: 0.06, tilt: 1.2, halo: 0.08, screen: 0.55 });
      out.beam = (1 - span(pe, 0, at(900))) * (0.55 + 0.45 * Math.cos((TAU * pe) / 190));
      shot.sag = easeOut(span(pe, 0, at(1400)));
      break;
    case "locked": {
      // Lockdown: the link is cut at the port, the teeth slam in, the rings stop and the seams keep a slow heartbeat.
      const beat = heartbeat(pe);
      shot.reject = Math.exp(-pe / at(200));
      shot.port = 1.4 * Math.exp(-pe / at(160));
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

type Pose = { light: number; seams: number; art: number; trace: number; gather: number; boost: number; flash: number; shock: number; con: number; glass: number; act: number; cam: number };
const SETTLED: Pose = { light: 1, seams: 1, art: 1, trace: 1, gather: 1, boost: 0, flash: 0, shock: -1, con: 1, glass: 1, act: 1, cam: 0 };
const INTRO_TOTAL: Record<IntroKind, number> = { full: SUMMON.full.total, short: SUMMON.short.total, late: LATE_ASSEMBLY, none: 0, pending: 0 };

/**
 * The entrance, `e` ms in, as the Admin panel's ignition: in the dark the sigil traces itself, the rings spin
 * up, the core flares, the camera pulls back from the door and the console's glass flies together. Times
 * follow `SUMMON` so the page and the sound stay in step.
 */
function pose(kind: IntroKind, e: number): Pose {
  if (kind === "pending") return { ...SETTLED, light: 0, seams: 0, art: 0, trace: 0, gather: 0, glass: 0, act: 0, cam: 1 };
  if (kind === "none" || e >= INTRO_TOTAL[kind]) return SETTLED;
  if (kind === "late") {
    return { light: easeOut(span(e, 0, 700)), seams: easeOut(span(e, 0, 500)), art: easeOut(span(e, 0, 700)), trace: span(e, 0, 700), gather: 1, boost: 0, flash: 0, shock: -1, con: 1, glass: span(e, 0, 650), act: span(e, 450, 850), cam: 0 };
  }
  const t = SUMMON[kind];
  const lit = e >= t.flash;
  return {
    light: Math.max(span(e, t.trace[0], t.trace[1]) * 0.4, lit ? 1 : span(e, t.spin[0], t.flash) * 0.75),
    seams: Math.max(easeOut(span(e, t.trace[0], t.trace[1])) * 0.5, lit ? 1 : 0),
    art: easeOut(span(e, t.flash - 120, t.assemble[1])),
    trace: span(e, t.trace[0], t.trace[1]),
    gather: span(e, t.spin[0] - 250, t.flash),
    boost: easeIn(span(e, t.spin[0], t.spin[1])) * (1 - span(e, t.flash, t.flash + 1500)) * 22,
    flash: lit ? Math.exp(-(e - t.flash) / 200) : 0,
    shock: lit && e < t.flash + 900 ? span(e, t.flash, t.flash + 900) : -1,
    con: 1,
    glass: span(e, t.assemble[0], t.assemble[1]),
    act: span(e, t.decode[0] - 150, t.decode[0] + 350),
    cam: 1 - easeInOut(span(e, t.spin[0] - 150, t.assemble[1])),
  };
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
  const cores = navigator.hardwareConcurrency || 8;
  const tier = cores <= 4 ? 1 : 0;
  let dpr = renderPixelRatio(host.clientWidth, host.clientHeight, window.devicePixelRatio || 1, [1.75, 1.5][tier]);

  // Opaque: the chamber, its haze and the bloom are all drawn here, then finished like a lens.
  const renderer = new WebGLRenderer({ antialias: false, stencil: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(SCHEMES[init.look].air, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const fog = new FogExp2(SCHEMES[init.look].air.getHex(), 0.018);
  scene.fog = fog;
  const camera = new PerspectiveCamera(FOV, 1, 0.5, 90);
  const owned: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T): T => {
    owned.push(item);
    return item;
  };
  // Reflections in the look's tint; the red stays mostly in the light the core gives off. Built once per look.
  const environments: Partial<Record<VaultLookId, Texture>> = {};
  const environmentFor = (id: VaultLookId) =>
    (environments[id] ??= own(studioEnvironment(renderer, RED.clone().multiplyScalar(SCHEMES[id].env[0]), new Color(SCHEMES[id].env[1]), true, 0.35)));
  let environmentLook = init.look;
  scene.environment = environmentFor(init.look);

  const composer = new EffectComposer(renderer, new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: [4, 2, 0][tier] }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.8, 0.18, 0.65);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uResolution: { value: new Vector2(1, 1) },
      uLight: { value: new Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uRays: { value: 0 },
      uFlash: { value: 0 },
      uShock: { value: -1 },
      uAberration: { value: 0.002 },
      uGlitch: { value: 0 },
      uGrain: { value: 0.018 },
      uVignette: { value: 0.55 },
      uHot: { value: PALE.clone() },
    },
    vertexShader: UV_VERTEX,
    fragmentShader: FINISH_FRAGMENT,
    defines: { RAYS: [28, 16, 0][tier] },
  });
  composer.addPass(finish);
  const fx = finish.uniforms;

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
  const sigilTex = own(paint(1024, 1024, engravedSigil));
  const smokeTex = own(paint(128, 128, smoke));
  smokeTex.wrapS = smokeTex.wrapT = RepeatWrapping;
  const haloTex = own(paint(256, 256, softRect));

  /* Materials */
  // The look's colours as they are now; they ease toward a newly chosen look.
  const hue = Object.fromEntries(SCHEME_COLORS.map((name) => [name, SCHEMES[init.look][name].clone()])) as Record<SchemeColor, Color>;
  const amount = Object.fromEntries(SCHEME_LEVELS.map((name) => [name, SCHEMES[init.look][name]])) as Record<SchemeLevel, number>;
  const iron = new MeshStandardMaterial({ color: hue.iron.clone(), metalness: 0.92, roughness: 0.4, roughnessMap: grainTex, envMapIntensity: 1.1 });
  const steel = new MeshStandardMaterial({ color: hue.metal.clone(), metalness: 1, roughness: 0.2, roughnessMap: grainTex, envMapIntensity: 1.5 });
  const blade = new MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.88, roughness: 0.4, envMapIntensity: 1, emissive: RED.clone(), emissiveMap: doorTex, emissiveIntensity: 0 });
  const bladeSide = new MeshStandardMaterial({ color: 0x151416, metalness: 0.85, roughness: 0.5, envMapIntensity: 0.8, emissive: RED.clone(), emissiveIntensity: 0 });
  const chamberMat = new MeshStandardMaterial({ color: 0x160a0d, metalness: 0.6, roughness: 0.6, side: BackSide, emissive: DEEP.clone(), emissiveMap: wallTex, emissiveIntensity: 0 });
  const bedMat = new MeshStandardMaterial({ color: 0x0d0607, metalness: 0.4, roughness: 0.7, emissive: RED.clone(), emissiveMap: sigilTex, emissiveIntensity: 0 });
  const obsidian = new MeshStandardMaterial({ color: 0x0a0a0c, metalness: 0.35, roughness: 0.12, envMapIntensity: 1.6 });
  const trimMat = new MeshStandardMaterial({ color: hue.trim.clone(), metalness: 1, roughness: 0.2, envMapIntensity: 1.5 });
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
  // The keyhole: a crystal set in the hub, lit from inside; it sinks away with the hub.
  const keystoneMat = new MeshBasicMaterial({ color: PALE.clone() });
  const keystone = new Mesh(new OctahedronGeometry(0.046, 0), keystoneMat);
  keystone.scale.set(1, 1.4, 0.6);
  keystone.position.z = 0.085;
  const keyGlowMat = glow(glowTex, RED);
  const keyGlow = new Mesh(new PlaneGeometry(0.6, 0.6), keyGlowMat);
  keyGlow.position.z = 0.1;
  hub.add(keystone, keyGlow);
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
    // On the unlock each ring seats on a notch of its rune pattern (`lockFrom` → `lockTo`) and swings flat.
    return { ...spec, index, mount, spin, inlayMat, angle: index * 1.3, lockFrom: null as number | null, lockTo: 0, flat: spring() };
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
    uniforms: { uMap: { value: sigilTex }, uTrace: { value: 0 }, uGlow: { value: 0 }, uTime: { value: 0 }, uColor: { value: RED.clone() }, uHot: { value: PALE.clone() } },
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
  const chargeRingMat = glow(null, PALE);
  const chargeRing = new Mesh(new RingGeometry(0.94, 1, 128), chargeRingMat);
  chargeRing.position.z = 0.14;
  body.add(cone, shock, chargeRing);

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

  // Pressure venting through the door's seams (two in three puffs) and around its rim as the bolts let go.
  const vaporCount = compact ? 110 : 220;
  const vaporGeometry = new BufferGeometry();
  const vaporDirs = new Float32Array(vaporCount * 3);
  const vaporSeeds = new Float32Array(vaporCount * 4);
  for (let i = 0; i < vaporCount; i++) {
    const onSeam = i % 3 !== 0;
    const a = onSeam ? ((Math.floor(hash(i * 2.3) * SEGMENTS) + 0.5) / SEGMENTS) * TAU : hash(i * 3.1) * TAU;
    vaporDirs.set([Math.sin(a), Math.cos(a), onSeam ? 0.14 + hash(i * 4.7) * 0.54 : 0.7], i * 3);
    vaporSeeds.set([hash(i * 5.9), hash(i * 7.1), hash(i * 8.9), hash(i * 10.3)], i * 4);
  }
  vaporGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(vaporCount * 3), 3));
  vaporGeometry.setAttribute("aDir", new Float32BufferAttribute(vaporDirs, 3));
  vaporGeometry.setAttribute("aSeed", new Float32BufferAttribute(vaporSeeds, 4));
  const vaporMat = new ShaderMaterial({
    uniforms: { uAge: { value: -1 }, uPixel: { value: 1 }, uSize: { value: 0.06 }, uAlpha: { value: 1 }, uColor: { value: hue.rim.clone() }, uHot: { value: PALE.clone() } },
    vertexShader: VAPOR_VERTEX,
    fragmentShader: VAPOR_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const vapor = new Points(vaporGeometry, vaporMat);
  vapor.frustumCulled = false;
  vapor.position.z = 0.06;
  body.add(vapor);

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
      uColor: { value: RED.clone().lerp(ASH, 0.5) },
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

  const backdropMat = new ShaderMaterial({
    uniforms: {
      uCenter: { value: new Vector2(0.5, 0.5) },
      uAspect: { value: 1 },
      uLevel: { value: 0 },
      uHeat: { value: 0 },
      uColor: { value: HAZE.clone() },
      uHot: { value: RED.clone() },
    },
    vertexShader: UV_VERTEX,
    fragmentShader: BACKDROP_FRAGMENT,
    depthWrite: false,
  });
  const backdrop = new Mesh(new PlaneGeometry(1, 1), backdropMat);
  backdrop.position.z = BACK_Z;
  backdrop.renderOrder = -20;
  scene.add(backdrop);

  const smokeLayers = [-7, -11, -15].slice(0, compact ? 2 : 3).map((z, i) => {
    const material = new ShaderMaterial({
      uniforms: {
        uMap: { value: smokeTex },
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uColor: { value: HAZE.clone() },
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
  const hemi = new HemisphereLight(hue.hemi.clone(), 0x050506, 0);
  const key = new DirectionalLight(hue.key.clone(), 0);
  key.castShadow = true;
  key.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  // Red from behind on one side, the look's cool (or rose) light on the other.
  const rimLeft = new PointLight(RED, 0, 10, 0);
  const rimRight = new PointLight(hue.rim, 0, 10, 0);
  const conLight = new PointLight(hue.rim, 0, 10, 0);
  // A pale light from behind and above picks out the metal's edges.
  const edge = new DirectionalLight(hue.edge.clone(), 0);
  scene.add(hemi, key, key.target, rimLeft, rimRight, conLight, edge, edge.target);

  /* ------------------------------------------------------------------ the console */
  const con = new Group();
  scene.add(con);
  // An Admin panel: glass over a dark slab, both cut into the same shards, sized in CSS px (the meshes scale by k).
  const glassUniforms = {
    uSize: { value: new Vector2(1, 1) },
    uCut: { value: CON.cut },
    uAssemble: { value: 1 },
    uOrigin: { value: new Vector2(0.5, 0.5) },
    uTime: { value: 0 },
    uHover: { value: 0 },
    uPointer: { value: new Vector2(0.5, 0.5) },
    uPress: { value: 0 },
    uRipple: { value: new Vector4(0, 0, -10, 0) },
    uTone: { value: EDGE.clone() },
    uFocus: { value: 0 },
    uLevel: { value: 1 },
    uScan: { value: 0 },
    uNoise: { value: 0 },
    uFlash: { value: 0 },
    uFlare: { value: 0 },
    uColor: { value: RED.clone() },
    uHot: { value: PALE.clone() },
    uGlare: { value: hue.glare.clone() },
    uGlassLo: { value: hue.glassLo.clone() },
    uGlassHi: { value: hue.glassHi.clone() },
  };
  const glassShards = shardPlane(12, 9);
  const screenMat = new ShaderMaterial({
    uniforms: { ...glassUniforms, uLayer: { value: 1 }, uZ: { value: -1 }, uGrow: { value: 0 } },
    vertexShader: SHARD_VERTEX,
    fragmentShader: SCREEN_FRAGMENT,
    transparent: true,
    depthWrite: false,
  });
  const backingMat = new ShaderMaterial({
    uniforms: { ...glassUniforms, uLayer: { value: 0 }, uZ: { value: -CON.slab }, uGrow: { value: CON.grow } },
    vertexShader: SHARD_VERTEX,
    fragmentShader: SCREEN_FRAGMENT,
    transparent: true,
  });
  const screen = new Mesh(glassShards, screenMat);
  const backing = new Mesh(glassShards, backingMat);
  screen.renderOrder = 3;
  backing.renderOrder = 2;
  screen.frustumCulled = backing.frustumCulled = false;
  const conHaloMat = glow(haloTex, RED);
  const portGlowMat = glow(glowTex, RED);
  const unitPlane = new PlaneGeometry(1, 1);
  const conHalo = new Mesh(unitPlane, conHaloMat);
  con.add(backing, screen, conHalo);
  const port = new Group();
  const portNode = new Mesh(new OctahedronGeometry(1, 0), trimMat);
  const portGlow = new Mesh(unitPlane, portGlowMat);
  port.add(portNode, portGlow);
  con.add(port);

  const beamMat = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uFlow: { value: 0 }, uHead: { value: -1 }, uBack: { value: -1 }, uColor: { value: RED.clone() }, uHot: { value: PALE.clone() } },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const beam = new Mesh(new BufferGeometry(), beamMat);
  beam.frustumCulled = false;
  const packetMat = glow(glowTex, RED);
  const packetCoreMat = glow(glowTex, PALE);
  const packet = new Mesh(unitPlane, packetMat);
  const packetCore = new Mesh(unitPlane, packetCoreMat);
  scene.add(beam, packet, packetCore);

  /* ------------------------------------------------------------------ layout */
  let W = 0;
  let H = 0;
  let composerDpr = dpr;
  const governor = createFrameGovernor(() => {
    if (W > 0 && H > 0) resize();
  });
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
  let beamCurve: QuadraticBezierCurve3 | null = null;
  const artBox = { x: 0, y: 0, r: 1 };
  let layoutDirty = true;
  /** Port of the link on the console, in console space. */
  const portAt = new Vector3();
  let laidOut = false;

  const swap = (mesh: Mesh, geometry: BufferGeometry) => {
    mesh.geometry.dispose();
    mesh.geometry = geometry;
  };

  function buildConsole() {
    const u = k;
    screen.scale.setScalar(u);
    backing.scale.setScalar(u);
    glassUniforms.uSize.value.set(panelW, panelH);
    conHalo.scale.set((panelW + 40) * u * 1.7, (panelH + 40) * u * 1.7, 1);
    conHalo.position.z = -(CON.slab + 30) * u;
    portNode.scale.set(4 * u, 6 * u, 4 * u);
    portGlow.scale.setScalar(46 * u);
    portGlow.position.z = 2 * u;
  }

  /** Places the console's link port on the side facing the vault and runs the link to the vault's face. */
  function buildBeam() {
    const u = k;
    const dx = artRest.x - conRest.x;
    const dy = artRest.y - conRest.y;
    if (Math.abs(dx) > Math.abs(dy)) portAt.set(Math.sign(dx) * (panelW / 2 + CON.port) * u, 0, -CON.slab * 0.5 * u);
    else portAt.set(0, Math.sign(dy) * (panelH / 2 + CON.port) * u, -CON.slab * 0.5 * u);
    port.position.copy(portAt);
    const keyed = `${(portAt.x + conRest.x).toFixed(3)},${(portAt.y + conRest.y).toFixed(3)},${artRest.x.toFixed(3)},${artRest.y.toFixed(3)},${artScale.toFixed(3)},${k.toFixed(6)}`;
    if (keyed === beamKey) return;
    beamKey = keyed;
    const start = portAt.clone().add(conRest);
    const end = new Vector3(artRest.x, artRest.y, Z_ART + 0.15 * artScale);
    const mid = start.clone().lerp(end, 0.5);
    mid.y += Math.abs(end.x - start.x) * 0.12 + 0.3;
    mid.z += 1.6;
    beamCurve = new QuadraticBezierCurve3(start, mid, end);
    swap(beam, new TubeGeometry(beamCurve, 72, 2.2 * k, 6, false));
  }

  function resize() {
    dpr = renderPixelRatio(W, H, window.devicePixelRatio || 1, [1.75, 1.5][tier]) * governor.scale;
    if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    if (composerDpr !== dpr) {
      composer.setPixelRatio(dpr);
      composerDpr = dpr;
    }
    composer.setSize(W, H);
    fx.uResolution.value.set(W * dpr, H * dpr);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    f = H / (2 * TAN);
    k = DIST / f;
    const pixel = (H * dpr) / (2 * TAN);
    for (const material of [sparks.material, gather.material, emberMat, vaporMat] as ShaderMaterial[]) material.uniforms.uPixel.value = pixel;
    for (const { layer, z } of smokeLayers) {
      const height = 2 * (DIST - z) * TAN * 1.3;
      layer.scale.set(height * camera.aspect, height, 1);
    }
    const backHeight = 2 * (DIST - BACK_Z) * TAN * 1.3;
    backdrop.scale.set(backHeight * camera.aspect, backHeight, 1);
    backdropMat.uniforms.uAspect.value = camera.aspect;
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
    const lowest = Math.max(a.bottom - s.top, panelY + panelH / 2 + 12) + Math.max(96, window.innerHeight * 0.14);
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
    artScale = (Math.min(a.width, a.height) / 2) * kA * ART_FILL[compact ? "compact" : "wide"];
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
      buildBeam();
    }
    laidOut = true;
    layoutDirty = false;
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
  let lookId = init.look;
  let lookAt = -1e7;
  let introKind: IntroKind = "pending";
  let introStart = 0;
  let skipAt = -1;
  let skipFrom = 0;
  let keyAt = -1e7;
  let typedAt = -1e7;
  let pressing = false;
  // A finger held on the glass (not on a control) tilts the console like a hovering mouse.
  let dragging = false;
  let releasedAt = -1e7;
  const pointer = { x: 0, y: 0, seen: false };

  const target = {} as Levels;
  const shot = { locks: [0, 0, 0], pulses: [0, 0, 0], bolts: Array<number>(SEGMENTS).fill(0) } as Shots;
  const level = Object.fromEntries(LEVEL_KEYS.map((name) => [name, spring(name === "spin" || name === "tilt" || name === "screen" ? 1 : 0)])) as Record<LevelKey, ReturnType<typeof spring>>;
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
  const focusS = spring();
  // Admin panel springs: tilt and lift overshoot a little; hover and press follow the pointer.
  const tiltXO: Osc = { value: 0, velocity: 0 };
  const tiltYO: Osc = { value: 0, velocity: 0 };
  const lift: Osc = { value: 0, velocity: 0 };
  const press: Osc = { value: 0, velocity: 0 };
  let hover = 0;
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
  const close = new Vector3();
  const look = new Vector3();
  const corePos = new Vector3();
  const ndc = new Vector3();
  const A = new Matrix4();
  const M = new Matrix4();
  let lastTransform = "";
  let lastOpacity = "";
  let last = 0;

  function frame(now: number) {
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const still = motion === "off";
    const time = now / 1000;
    if (layoutDirty) measure();
    if (!laidOut || !W || !H) return;

    const ie = introElapsed(now);
    const I = pose(introKind, ie);
    const pace = motion === "subtle" ? PACE.subtle : 1;
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

    // A new look: the glass breaks away, the colours turn while it is gone, then it rebuilds behind a wave of light.
    const sw = still ? 1e9 : (now - lookAt) / pace;
    const blend = still ? 1 : sw < 180 ? 0 : 1 - Math.exp(-dt * 6);
    if (blend > 0) {
      for (const name of SCHEME_COLORS) hue[name].lerp(SCHEMES[lookId][name], blend);
      for (const name of SCHEME_LEVELS) amount[name] = lerp(amount[name], SCHEMES[lookId][name], blend);
      if (environmentLook !== lookId) {
        environmentLook = lookId;
        scene.environment = environmentFor(lookId);
      }
    }
    const bold = motion === "full";
    const lookGlass = !bold ? 1 : sw < 220 ? 1 - easeOut(sw / 220) : span(sw, 320, 1250);
    const lookShock = bold && sw >= 200 && sw < 1100 ? span(sw, 200, 1100) : -1;
    const lookWave = sw >= 240 && sw < 1000 ? span(sw, 240, 1000) : -1;
    const lookFlash = sw < 1e8 ? Math.exp(-(((sw - 220) / 150) ** 2)) : 0;
    renderer.setClearColor(hue.air, 1);
    fog.color.copy(hue.air);
    hemi.color.copy(hue.hemi);
    key.color.copy(hue.key);
    edge.color.copy(hue.edge);
    iron.color.copy(hue.iron);
    steel.color.copy(hue.metal);
    trimMat.color.copy(hue.trim);
    vaporMat.uniforms.uColor.value.copy(hue.rim);
    // Pointer: as on an Admin panel, the console tilts toward the pointer over it, lifts and catches its glare;
    // the camera drifts with the pointer and the vault watches it. A finger counts as a pointer too.
    const stable = phase === "verifying" || now - typedAt < 1200 || (pressing && !dragging) || (!dragging && now - releasedAt < 300);
    const scale = motion === "subtle" ? 0.5 : 1;
    let over = false;
    let pu = 0.5;
    let pv = 0.5;
    let px = 0;
    let py = 0;
    let lx = 0;
    let ly = 0;
    if (pointer.seen && !still) {
      const inside = pointer.x >= hostLeft && pointer.x <= hostLeft + W && pointer.y >= hostTop && pointer.y <= hostTop + H;
      if (inside) {
        px = soft((pointer.x - (hostLeft + W / 2)) / (W / 2)) * scale;
        py = soft((pointer.y - (hostTop + H / 2)) / (H / 2)) * scale;
      }
      const halfW = Math.max(1, panelW / 2);
      const halfH = Math.max(1, panelH / 2);
      over = !revealing && I.glass >= 1 && Math.abs(pointer.x - panelCX) < halfW + 24 && Math.abs(pointer.y - panelCY) < halfH + 24;
      pu = clamp01((pointer.x - panelCX) / (2 * halfW) + 0.5);
      pv = clamp01(0.5 - (pointer.y - panelCY) / (2 * halfH));
      lx = soft((pointer.x - artBox.x) / (artBox.r * 2));
      ly = soft((pointer.y - artBox.y) / (artBox.r * 2));
    }
    const tilting = over && !stable;
    if (!pressing) {
      parX.target = stable ? 0 : px;
      parY.target = stable ? 0 : py;
    }
    lookX.target = lx;
    lookY.target = ly;
    // The idle drift stops under the pointer, so the controls hold still to be clicked.
    idle.target = fine && motion === "full" && !stable && !over ? 1 : 0;
    settle(parX, 0.6);
    settle(parY, 0.6);
    settle(lookX, 0.5);
    settle(lookY, 0.5);
    settle(idle, 0.8);
    shake.target = shot.shake;
    settle(shake, 0.05);
    hover = still ? 0 : hover + ((over ? 1 : 0) - hover) * (1 - Math.exp(-dt * 12));
    if (over) glassUniforms.uPointer.value.set(pu, pv);
    if (still) {
      for (const s of [tiltXO, tiltYO, lift, press, retract]) s.value = s.velocity = 0;
      if (shot.retract) retract.value = shot.retract;
    } else {
      oscillate(tiltXO, tilting ? -(pv - 0.5) * 2 * MAX_TILT * scale : 0, 2.07, 0.575, dt);
      oscillate(tiltYO, tilting ? (pu - 0.5) * 2 * MAX_TILT * scale : 0, 2.07, 0.575, dt);
      oscillate(lift, over ? scale : 0, 1.88, 0.59, dt);
      oscillate(press, pressing && over ? 1 : 0, 2.85, 0.67, dt);
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
    art.position.set(artX.value, artY.value - 0.06 * S * shot.sag, Z_ART);
    art.scale.setScalar(S);
    const sway = still ? 0 : 1;
    body.rotation.set(
      lookY.value * 0.1 + sway * 0.035 * Math.sin(time * 0.17 + 1) + 0.05 * shot.sag,
      lookX.value * 0.15 + sway * 0.06 * Math.sin(time * 0.21),
      0,
    );
    body.position.y = sway * 0.025 * Math.sin(time * 0.5);

    // The dial drifts, ratchets while checking, jams on a wrong code and lines up on a right one.
    if (phase === "verifying") {
      dialS.target = dialMark + (Math.floor(pe / (420 * pace)) + 1) * (TAU / 36);
      settle(dialS, 0.07);
    } else if (phase === "granted" || phase === "already") {
      dialS.target = lerp(dialMark, dialAlign, shot.align);
      settle(dialS, phase === "granted" ? 0.05 : 0.1);
    } else if (phase === "locked" || phase === "unavailable") settle(dialS, 0.25);
    else {
      dialS.target += dt * 0.05 * (level.spin.value + I.boost) * sway;
      settle(dialS, 0.3);
    }
    const jam = phase === "invalid" && !still ? Math.exp(-pe / 200) : 0;
    dial.rotation.z = -(dialS.value + 0.21 * jam * Math.sin(pe / 38));

    const granted = phase === "granted";
    for (let i = 0; i < SEGMENTS; i++) {
      const a = ((i + 0.5) / SEGMENTS) * TAU;
      // On an unlock each bolt draws back on its own beat.
      const teethAt = 0.735 + 0.17 * (granted ? shot.bolts[i] : level.teeth.value);
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
    hub.rotation.z = (-shot.key * Math.PI) / 2;

    disS.target = shot.disengage;
    settle(disS, 0.4);
    const dis = disS.value;
    for (const g of gyros) {
      const lock = granted ? shot.locks[g.index] : 0;
      if (lock > 0) {
        if (g.lockFrom === null) {
          const notch = TAU / g.repeat;
          g.lockFrom = g.angle;
          g.lockTo = g.speed > 0 ? Math.ceil(g.angle / notch + 0.35) * notch : Math.floor(g.angle / notch - 0.35) * notch;
        }
        g.angle = lerp(g.lockFrom, g.lockTo, easeBack(lock));
      } else {
        if (!granted) g.lockFrom = null;
        g.angle += dt * g.speed * (level.spin.value + I.boost) * sway;
      }
      g.flat.target = easeInOut(lock);
      settle(g.flat, granted ? 0.06 : 0.6);
      g.spin.rotation.z = g.angle;
      const tl = level.tilt.value * (1 - g.flat.value);
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
    const surge = level.surge.value + 1.5 * shot.impact + 2.5 * I.flash;
    tint.copy(RED).lerp(PALE, level.pale.value * 0.85).lerp(ASH, ash);
    coreTint.copy(RED).lerp(PALE, Math.min(1, level.pale.value * 0.7 + open * 0.5)).lerp(ASH, ash);
    const glowSeams = I.seams;
    // Engravings run hot enough to bloom; the unlock's wave (or a new look's) lights them outside-in.
    const wv = shot.wave >= 0 ? shot.wave : lookWave;
    const swell = (at: number) => (wv < 0 ? 0 : Math.exp(-(((wv - at) / 0.14) ** 2)) * 2.5);
    seamMat.color.copy(tint).multiplyScalar(seam * glowSeams * (1 - open) * (3 + swell(0.85) + 4 * shot.leak));
    blade.emissive.copy(tint);
    blade.emissiveIntensity = (0.2 + 0.6 * seam + swell(0.8)) * glowSeams * (1 + 0.6 * open);
    bladeSide.emissive.copy(coreTint);
    bladeSide.emissiveIntensity = (open * coreLevel * 0.3 + 1.2 * shot.leak) * glowSeams;
    housingRunesMat.color.copy(tint).multiplyScalar((0.18 + 0.42 * seam + swell(0.45)) * glowSeams);
    dialRunesMat.color.copy(tint).multiplyScalar((0.5 + 1.0 * seam + 1.2 * kp + swell(0.65) + 2.5 * shot.pulses[2]) * glowSeams);
    for (const g of gyros) g.inlayMat.color.copy(tint).multiplyScalar((0.1 + 0.38 * seam + swell(0.1 + g.index * 0.15) + 3 * shot.pulses[g.index]) * glowSeams * (1 - 0.5 * dis));
    chamberMat.emissive.copy(coreTint);
    chamberMat.emissiveIntensity = coreLevel * (0.25 + 0.9 * open) * glowSeams;
    bedMat.emissive.copy(coreTint);
    bedMat.emissiveIntensity = coreLevel * (0.2 + open) * glowSeams;
    crystalMat.color.copy(coreTint).multiplyScalar(0.5 + coreLevel);
    keystoneMat.color
      .copy(coreTint)
      .lerp(PALE, 0.55 * (1 - shot.reject))
      .multiplyScalar((1.6 + 2.2 * seam + swell(0.95) + 2 * kp + 3 * shot.impact + 2.5 * shot.reject) * glowSeams);
    keyGlowMat.color.copy(tint).multiplyScalar((0.5 + 0.7 * seam + 0.6 * kp + 0.4 * swell(0.95) + 1.6 * shot.impact + 1.2 * shot.reject) * glowSeams);
    coreGlowMat.color.copy(coreTint).multiplyScalar((coreLevel * (0.25 + 0.9 * open + 0.6 * surge) + 0.9 * shot.emit) * glowSeams);
    coreLight.color.copy(coreTint);
    coreLight.intensity = (coreLevel * (0.8 + 3 * open + 1.5 * surge) + 2 * shot.emit) * glowSeams;
    coreLight.distance = 2.6 * S;
    flood.color.copy(coreTint);
    flood.intensity = open * coreLevel * 2.2;
    flood.distance = 3.2 * S;
    sigilMat.uniforms.uTrace.value = I.trace;
    sigilMat.uniforms.uGlow.value = (0.03 + 0.06 * seam + 0.45 * open + swell(0.3)) * glowSeams * (1 - 0.5 * dim);
    sigilMat.uniforms.uTime.value = time * sway;
    sigilMat.uniforms.uColor.value.copy(tint);
    backSigil.rotation.z = -time * 0.02 * sway;
    haloMat.color.copy(DEEP).lerp(ASH, ash).multiplyScalar((0.02 + 0.2 * coreLevel * open) * I.light * (1 - 0.5 * dim));
    coneMat.uniforms.uLevel.value = level.shafts.value * open * 1.2;
    coneMat.uniforms.uTime.value = time;
    coneMat.uniforms.uColor.value.copy(coreTint).lerp(PALE, 0.5);
    const unlockShock = shot.shock >= 0 && shot.shock < 1;
    const shockAt = unlockShock ? shot.shock : I.shock >= 0 ? I.shock : lookShock;
    shock.visible = shockAt >= 0 && shockAt < 1;
    if (shock.visible) {
      shock.scale.setScalar(0.8 + 2.6 * easeOut(shockAt));
      shockMat.color.copy(unlockShock || I.shock >= 0 ? PALE : hue.rim).multiplyScalar(1.5 * (1 - shockAt) ** 2 * (motion === "subtle" ? 0.4 : 1));
    }
    chargeRing.visible = shot.ring >= 0 && !still;
    if (chargeRing.visible) {
      chargeRing.scale.setScalar(0.2 + easeOut(shot.ring));
      chargeRingMat.color
        .copy(coreTint)
        .lerp(PALE, 0.4)
        .multiplyScalar(1.2 * (1 - shot.ring) ** 2 * Math.min(1, level.surge.value + shot.impact) * (motion === "subtle" ? 0.5 : 1));
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
    vapor.visible = shot.vent >= 0 && shot.vent < 2.4 && !still;
    vaporMat.uniforms.uAge.value = shot.vent;
    vaporMat.uniforms.uSize.value = 0.06 * S;
    vaporMat.uniforms.uAlpha.value = (motion === "subtle" ? 0.5 : 1) * glowSeams;
    vaporMat.uniforms.uHot.value.copy(coreTint).lerp(PALE, 0.7);

    core.getWorldPosition(corePos);
    emberMat.uniforms.uTime.value = time;
    emberMat.uniforms.uAlpha.value = 0.7 * span(ie, 100, 900) * (introKind === "pending" ? 0 : 1) * (1 - 0.6 * dim) * (1 - 0.4 * ash) * (still ? 0.5 : 1);
    emberMat.uniforms.uPull.value = level.pull.value;
    emberMat.uniforms.uCenter.value.copy(corePos).sub(embers.position);
    emberMat.uniforms.uColor.value.copy(hue.ember).lerp(ASH, ash);
    for (const { material } of smokeLayers) {
      material.uniforms.uTime.value = time;
      material.uniforms.uLevel.value = 0.04 * amount.smoke * I.light * (0.6 + 0.4 * Math.min(1, coreLevel)) * (1 - 0.5 * dim);
      material.uniforms.uColor.value.copy(hue.haze).lerp(coreTint, 0.15).lerp(ASH, ash * 0.6);
    }
    const lit = I.light * (1 - 0.35 * dim);
    hemi.intensity = 0.55 * lit;
    key.intensity = 2.3 * lit;
    rimLeft.color.copy(RED).lerp(ASH, ash);
    rimRight.color.copy(hue.rim).lerp(ASH, ash);
    rimLeft.intensity = 3 * I.light * (1 - 0.5 * dim);
    rimRight.intensity = 1.4 * I.light * (1 - 0.5 * dim);
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
    edge.intensity = 3.2 * lit;
    edge.position.set(art.position.x + 3, art.position.y + 4, art.position.z - 4);
    edge.target.position.copy(art.position);
    scene.environmentIntensity = 0.15 + 0.85 * I.light;

    /* The console */
    const u = k;
    // For the rewards the console sinks back into the dark, leaving its place to the cards.
    const r = retract.value;
    con.visible = I.con > 0 && r < 0.98;
    con.position.set(
      conRest.x + 8 * u * shot.jolt,
      conRest.y - (panelH * u * 1.3 + 1.2) * r + idle.value * 1.5 * u * Math.sin(time * 0.5),
      -2 * r + (lift.value * CON.lift - press.value * 6) * u,
    );
    con.rotation.set(-0.55 * r + tiltXO.value + idle.value * 0.008 * Math.sin(time * 0.29 + 1), tiltYO.value + idle.value * 0.012 * Math.sin(time * 0.37), 0);
    const act = I.act;
    const conGlow = act * (1 - 0.65 * r);
    const flare = shot.flare;
    conHaloMat.color.copy(tint).multiplyScalar(level.halo.value * conGlow * 0.07);
    const beamLevel = level.beam.value;
    port.scale.setScalar(Math.max(0.001, easeOut(span(I.glass, 0.6, 1))));
    portGlowMat.color.copy(tint).multiplyScalar((0.18 + 1.4 * beamLevel + 0.3 * kp + 2.5 * shot.port) * act);
    const su = glassUniforms;
    su.uLevel.value = level.screen.value * (0.4 + 0.6 * act);
    su.uScan.value = level.scan.value;
    su.uNoise.value = level.noise.value;
    su.uFlash.value = shot.flash;
    su.uFlare.value = flare;
    su.uTime.value = time;
    su.uColor.value.copy(tint);
    su.uHot.value.copy(tint).lerp(PALE, 0.7);
    su.uTone.value.copy(EDGE).lerp(ASH, ash).multiplyScalar(amount.edgeGain);
    su.uHover.value = hover;
    su.uPress.value = Math.max(0, press.value);
    su.uGlare.value.copy(hue.glare);
    su.uGlassLo.value.copy(hue.glassLo);
    su.uGlassHi.value.copy(hue.glassHi);
    // The glass assembles from the side facing the vault; for a new look it rebuilds from the middle.
    su.uAssemble.value = Math.min(I.glass, lookGlass);
    if (lookGlass < 1) su.uOrigin.value.set(0.5, 0.5);
    else {
      const dx = artRest.x - conRest.x;
      const dy = artRest.y - conRest.y;
      const m = Math.max(Math.abs(dx), Math.abs(dy), 1e-6);
      su.uOrigin.value.set(0.5 + (0.5 * dx) / m, 0.5 + (0.5 * dy) / m);
    }
    // The rim brightens while the console is in use.
    const active = document.activeElement;
    focusS.target = active && active !== document.body && refs.panel.current?.contains(active) ? 1 : 0;
    settle(focusS, 0.16);
    su.uFocus.value = focusS.value;
    conLight.position.set(conRest.x - panelW * u * 0.6, conRest.y + panelH * u * 0.7, 3);
    conLight.intensity = 0.8 * act * (1 - 0.5 * dim);
    conLight.color.copy(hue.rim).lerp(tint, 0.3).lerp(ASH, ash);

    beam.visible = beamKey !== "" && (beamLevel > 0.01 || shot.head >= 0 || shot.back >= 0);
    const bu = beamMat.uniforms;
    bu.uLevel.value = beamLevel;
    bu.uFlow.value = shot.flow;
    bu.uHead.value = shot.head;
    bu.uBack.value = shot.back;
    bu.uTime.value = time;
    bu.uColor.value.copy(tint).multiplyScalar(1.4);
    bu.uHot.value.copy(tint).lerp(PALE, 0.75);
    const packetAt = shot.head >= 0 ? shot.head : shot.back;
    packet.visible = packetCore.visible = beamCurve !== null && packetAt >= 0 && !still;
    if (beamCurve && packet.visible) {
      beamCurve.getPointAt(Math.min(1, packetAt), packet.position);
      packetCore.position.copy(packet.position);
      packet.quaternion.copy(camera.quaternion);
      packetCore.quaternion.copy(camera.quaternion);
      packet.scale.setScalar(70 * u);
      packetCore.scale.setScalar(20 * u);
      packetMat.color.copy(tint).multiplyScalar(1.5);
      packetCoreMat.color.copy(tint).lerp(PALE, 0.8).multiplyScalar(2.2);
    }

    /* Camera: the opening starts close on the door, rolled, and pulls back to rest as the glass assembles. */
    const ca = I.cam;
    const push = level.push.value;
    const jitter = shake.value;
    camPos.set(artRest.x * 0.25 * push + parX.value * 0.35, artRest.y * 0.25 * push - parY.value * 0.22, DIST - 2.1 * push);
    look.set(artRest.x * 0.5 * push, artRest.y * 0.5 * push, Z_ART * 0.15 * push);
    if (ca > 0) {
      camPos.lerp(close.set(art.position.x + 0.6 * S, art.position.y - 0.4 * S, art.position.z + 3.6 * S), ca);
      look.lerp(art.position, ca);
    }
    camPos.x += jitter * 0.05 * wobble(time * 24, 1);
    camPos.y += jitter * 0.04 * wobble(time * 21, 4);
    camera.position.copy(camPos);
    camera.lookAt(look);
    if (ca) camera.rotateZ(0.05 * ca);
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();

    register(1 - easeInOut(span(r, 0.12, 0.6)));

    // The chamber and the lens.
    const reachBack = (DIST - BACK_Z) / (DIST - art.position.z);
    const backHeight = backdrop.scale.y;
    const wall = backdropMat.uniforms;
    wall.uCenter.value.set(0.5 + (art.position.x * reachBack) / (backHeight * camera.aspect), 0.5 + (art.position.y * reachBack) / backHeight);
    wall.uLevel.value = 0.25 * amount.wall * I.light * (1 - 0.5 * dim) * (0.85 + 0.3 * charge);
    wall.uHeat.value = coreLevel * (0.4 + 1.6 * open + 0.5 * surge) * glowSeams;
    wall.uColor.value.copy(hue.haze).lerp(ASH, ash * 0.7);
    wall.uHot.value.copy(coreTint);
    ndc.copy(corePos).project(camera);
    const calm = motion === "subtle" ? 0.4 : still ? 0 : 1;
    const glitch = phase === "invalid" ? Math.abs(shot.jolt) : level.noise.value * 0.4 * (0.5 + 0.5 * Math.sin(time * 23));
    fx.uLight.value.set(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5);
    fx.uTime.value = time;
    fx.uRays.value = 0.3 * level.shafts.value * open * glowSeams;
    fx.uFlash.value = (shot.flash + 0.2 * lookFlash + 0.6 * I.flash) * (motion === "subtle" ? 0.5 : 1);
    fx.uShock.value = calm && shockAt >= 0 && shockAt < 1 ? shockAt : -1;
    fx.uGlitch.value = glitch * calm;
    fx.uVignette.value = 0.7 + 0.2 * dim;
    fx.uHot.value.copy(coreTint).lerp(PALE, 0.6);
    // The open door is already bright, so the bloom backs off once it has swung wide.
    bloom.strength =
      ((0.4 + 0.4 * charge + 1.1 * shot.flash + 0.35 * level.surge.value + 0.7 * shot.impact + 0.35 * shot.emit) * (1 - 0.6 * open) * (0.3 + 0.7 * I.light) * (1 - 0.4 * ash) + (0.8 * lookFlash + 1.5 * I.flash) * calm) *
      amount.bloom;
    composer.render(dt);

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
  const drawable = () => !disposed && ready && visible && !document.hidden;
  const running = () => drawable() && motion !== "off";
  const loop = (now: number) => {
    raf = 0;
    if (!drawable()) {
      last = 0;
      return;
    }
    governor.tick(now);
    frame(now);
    if (running()) raf = requestAnimationFrame(loop);
  };
  /** Restarts the loop, or draws one still frame when motion is off. */
  const wake = () => {
    if (!drawable() || raf) return;
    if (running()) raf = requestAnimationFrame(loop);
    else if (motion === "off" && visible)
      raf = requestAnimationFrame((now) => {
        raf = 0;
        if (drawable()) frame(now);
      });
  };

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse" && !event.buttons) return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
  };
  const onTouchDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse") return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.seen = true;
    dragging = !(event.target instanceof Element && event.target.closest("button, a, input, textarea, select, label, [role=button], [contenteditable]"));
    wake();
  };
  const onLeave = () => {
    pointer.seen = false;
  };
  const onKey = () => {
    typedAt = performance.now();
  };
  const onDown = (event: PointerEvent) => {
    pressing = true;
    if (motion === "off" || !panelW) return;
    // A ring of light runs out across the glass from the press, as on the Admin panels.
    const u = clamp01((event.clientX - panelCX) / panelW + 0.5);
    const v = clamp01(0.5 - (event.clientY - panelCY) / panelH);
    glassUniforms.uRipple.value.set(u, v, performance.now() / 1000, 0);
    wake();
  };
  const onUp = () => {
    dragging = false;
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
  window.addEventListener("pointerdown", onTouchDown, { passive: true, capture: true });
  document.documentElement.addEventListener("mouseleave", onLeave);
  panelEl?.addEventListener("keydown", onKey);
  panelEl?.addEventListener("pointerdown", onDown);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  document.addEventListener("visibilitychange", onVisibility);
  renderer.domElement.addEventListener("webglcontextlost", onLost);
  const sight = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    layoutDirty = true;
    wake();
  });
  sight.observe(host);
  const invalidateLayout = () => {
    layoutDirty = true;
    wake();
  };
  const resizes = new ResizeObserver(invalidateLayout);
  for (const el of [refs.artifact.current, panelEl]) if (el) resizes.observe(el);
  for (let el = host.parentElement; el; el = el.parentElement) resizes.observe(el);
  const stageEl = host.parentElement;
  if (stageEl) {
    for (const el of stageEl.querySelectorAll(".vx-inner, .vx-hud, .vx-main")) resizes.observe(el);
  }
  const mutations = new MutationObserver(invalidateLayout);
  if (stageEl) mutations.observe(stageEl, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "hidden", "data-phase", "data-intro", "data-scene", "data-motion", "data-look"],
  });
  window.addEventListener("resize", invalidateLayout, { passive: true });
  window.addEventListener("scroll", invalidateLayout, { capture: true, passive: true });
  window.visualViewport?.addEventListener("resize", invalidateLayout);
  window.visualViewport?.addEventListener("scroll", invalidateLayout);
  document.fonts.addEventListener("loadingdone", invalidateLayout);

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
      if (next === "verifying" && phase !== "verifying") lift.velocity -= 2.2;
      const notch = TAU / SEGMENTS;
      dialMark = dialS.value;
      dialAlign = Math.ceil(dialS.value / notch + 0.25) * notch;
      for (const g of gyros) g.lockFrom = null;
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
    setLook(next: VaultLookId) {
      if (next === lookId) return;
      lookId = next;
      lookAt = performance.now();
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
      measure();
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
      mutations.disconnect();
      window.removeEventListener("resize", invalidateLayout);
      window.removeEventListener("scroll", invalidateLayout, { capture: true });
      window.visualViewport?.removeEventListener("resize", invalidateLayout);
      window.visualViewport?.removeEventListener("scroll", invalidateLayout);
      document.fonts.removeEventListener("loadingdone", invalidateLayout);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onTouchDown, { capture: true });
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
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
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
  look: VaultLookId;
  introKind: SummonKind;
  introAt: number;
  introDone: boolean;
  ref?: Ref<VaultSceneHandle>;
  onReady: () => void;
  onFail: () => void;
};

export default function VaultScene({ artifact, panel, phase, round, charge, pulse, motion, revealing, look, introKind, introAt, introDone, ref, onReady, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const ready = useEffectEvent(() => onReady());
  const fail = useEffectEvent(() => onFail());
  const initial = useEffectEvent((): Init => ({ phase, round, charge, motion, revealing, look, intro: { kind: introKind, at: introAt, done: introDone } }));

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
  useEffect(() => engineRef.current?.setLook(look), [look]);
  useEffect(() => engineRef.current?.setIntro({ kind: introKind, at: introAt, done: introDone }), [introKind, introAt, introDone]);
  useEffect(() => {
    if (pulse) engineRef.current?.pulse();
  }, [pulse]);
  useImperativeHandle(ref, () => ({ skip: () => engineRef.current?.skip(), origin: () => engineRef.current?.origin() ?? null }), []);

  return <div ref={hostRef} aria-hidden="true" className="vx-scene" />;
}
