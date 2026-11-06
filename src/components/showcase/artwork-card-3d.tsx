"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  AdditiveBlending,
  AmbientLight,
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  OrthographicCamera,
  Path,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  ShadowMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type MeshPhysicalMaterialParameters,
} from "three";
import { isUploadedImagePath } from "@/lib/attachments";
import type { FrameLookId } from "@/lib/frames";
import type { MotionLevel } from "@/lib/preferences";
import { CLASSIC_VIEWER_LOOK, type ViewerLighting, type ViewerLook } from "@/lib/viewer-looks";
import { ORNAMENTS } from "./frame-ornaments";
import { follow, radialTexture, spring, studioEnvironment, type Spring } from "./three-kit";

const MAX_YAW = 0.85;
const MAX_PITCH = 0.5;
const DRAG_SPEED = 0.0075;
/** How much of the look's hover tilt applies at each motion level. */
const HOVER_SCALE: Record<MotionLevel, number> = { full: 1, subtle: 0.43, off: 0 };
/** Smoothing times (seconds) of the critically damped follow: lower is snappier. */
const FOLLOW = { release: 0.22, drag: 0.05, settle: 0.14, view: 0.11 };

/** Light rigs for each lighting style (intensities before the look's own intensity). */
const LIGHTING: Record<
  ViewerLighting,
  { key: number; rimA: number; rimB: number; ambient: number; tint: number; env: "themed" | "neutral"; keyAt: [number, number, number] }
> = {
  studio: { key: 1.35, rimA: 2.2, rimB: 1.6, ambient: 0.2, tint: 1, env: "themed", keyAt: [-2.2, 2.8, 4] },
  neutral: { key: 1.25, rimA: 1.3, rimB: 1, ambient: 0.35, tint: 0.15, env: "neutral", keyAt: [-2.2, 2.8, 4] },
  dramatic: { key: 1.9, rimA: 3.2, rimB: 2.3, ambient: 0.04, tint: 1, env: "themed", keyAt: [-3.4, 2.2, 2.2] },
  soft: { key: 0.85, rimA: 0.9, rimB: 0.7, ambient: 0.6, tint: 0.35, env: "neutral", keyAt: [-1.2, 2, 5] },
};
const DEPTH = 0.03;
const BEVEL = 0.006;
const LIP = 0.0012;
/** Direction of the softbox whose reflection drifts across the art as the card turns. */
const SOFTBOX = new Vector3(-0.45, 0.55, 1).normalize();

/** Band overlay effects (see FX_FRAGMENT). */
const FX = { gilt: 1, amethyst: 2, holo: 3, aurora: 4 } as const;

type BandBox = { width: number; height: number; margin: number };
type Glint = [x: number, y: number, phase: number];

/** One glint per corner jewel, each catching the light at its own angle. */
const cornerGlints = ({ width, height, margin }: BandBox, phases: (number | null)[]): Glint[] =>
  [[-1, 1], [1, 1], [1, -1], [-1, -1]].flatMap(([sx, sy], i): Glint[] => {
    const phase = phases[i];
    return phase == null ? [] : [[sx * (width / 2 - margin / 2), sy * (height / 2 - margin / 2), phase]];
  });

type FrameSpec = {
  /** Visible band width as a fraction of the art's short side (0 = unframed). */
  margin: number;
  /** How far the band stands proud of the card face, so the art sits recessed. */
  relief: number;
  band: MeshPhysicalMaterialParameters;
  edge: MeshPhysicalMaterialParameters;
  /** Colours mixed into the theme's accent (rim a) and secondary (rim b) lights, and how strongly. */
  light: { a: number; b: number; mix: number } | null;
  /** The band's light overlay and its two colours. */
  fx: { kind: (typeof FX)[keyof typeof FX]; a: number; b: number } | null;
  /** Jewels and crests that flash at particular angles (at most five). */
  glints: (band: BandBox) => Glint[];
};

/** The 3D build of each frame. New frames need an entry here, a painter in paintBand and optionally ORNAMENTS. */
const SPECS: Record<FrameLookId, FrameSpec> = {
  none: {
    margin: 0,
    relief: 0,
    band: {},
    edge: { color: 0x1a1820, metalness: 0.6, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.18 },
    light: null,
    fx: null,
    glints: () => [],
  },
  gilt: {
    margin: 0.034,
    relief: 0.004,
    band: { metalness: 0.92, roughness: 0.26, clearcoat: 0.35, clearcoatRoughness: 0.2 },
    edge: { color: 0xd4ab62, metalness: 1, roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.2 },
    light: { a: 0xffd59a, b: 0xfff1d6, mix: 0.65 },
    fx: { kind: FX.gilt, a: 0xffe2a8, b: 0xfff6e0 },
    glints: (band) => cornerGlints(band, [1.1, 2.5, 3.8, 5.1]),
  },
  amethyst: {
    margin: 0.052,
    relief: 0.006,
    band: { metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 },
    edge: { color: 0x5b21b6, metalness: 0.7, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.12 },
    light: { a: 0xa77bff, b: 0xf0abfc, mix: 0.5 },
    fx: { kind: FX.amethyst, a: 0xd8b4fe, b: 0xfdf4ff },
    glints: (band) => cornerGlints(band, [1.3, 2.9, 4.4, 5.4]),
  },
  holo: {
    margin: 0.03,
    relief: 0.003,
    band: { metalness: 0.3, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 820] },
    edge: { color: 0xe6e0ff, metalness: 0.75, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.5, iridescenceThicknessRange: [200, 700] },
    light: { a: 0x8be9ff, b: 0xff9fd6, mix: 0.55 },
    fx: { kind: FX.holo, a: 0xf5f3ff, b: 0xc4f1ff },
    glints: (band) => cornerGlints(band, [2.0, null, 5.0]),
  },
  aurora: {
    margin: 0.026,
    relief: 0.0035,
    band: { metalness: 0.5, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 },
    edge: { color: 0x1d2a4f, metalness: 0.6, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 1, sheenColor: 0x6ee7b7, sheenRoughness: 0.4 },
    light: { a: 0x6ee7b7, b: 0xc4a5ff, mix: 0.6 },
    fx: { kind: FX.aurora, a: 0x6ee7b7, b: 0xf0abfc },
    glints: () => [],
  },
  "pixel-quest": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.1, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4 },
    edge: { color: 0x2a1650, metalness: 0.3, roughness: 0.5 },
    light: { a: 0xa78bfa, b: 0xfbbf24, mix: 0.5 },
    fx: { kind: FX.gilt, a: 0xc4b5fd, b: 0xfde68a },
    glints: (band) => [[0, band.height / 2 - band.margin / 2, 2.6]],
  },
  "neon-marquee": {
    margin: 0.06,
    relief: 0.007,
    band: { metalness: 0.2, roughness: 0.4, clearcoat: 0.9, clearcoatRoughness: 0.15 },
    edge: { color: 0x14081f, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 },
    light: { a: 0xf472b6, b: 0x67e8f9, mix: 0.6 },
    fx: { kind: FX.amethyst, a: 0xf9a8d4, b: 0xfef3c7 },
    glints: () => [],
  },
  constellation: {
    margin: 0.042,
    relief: 0.005,
    band: { metalness: 0.35, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 },
    edge: { color: 0xc9a85a, metalness: 1, roughness: 0.26, clearcoat: 0.4, clearcoatRoughness: 0.2 },
    light: { a: 0x818cf8, b: 0xfde68a, mix: 0.55 },
    fx: { kind: FX.amethyst, a: 0xc7d2fe, b: 0xfef3c7 },
    glints: (band) => cornerGlints(band, [1.6, 3.1, 4.6, 5.8]),
  },
  "obsidian-relic": {
    margin: 0.048,
    relief: 0.006,
    band: { metalness: 0.72, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.1 },
    edge: { color: 0xd9a845, metalness: 0.95, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.16 },
    light: { a: 0xfbbf24, b: 0xa855f7, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xfde68a, b: 0xd8b4fe },
    glints: (band) => [...cornerGlints(band, [1.2, 2.7, 4.1, 5.5]), [0, band.height / 2 - band.margin / 2, 3.2]],
  },
  "celestial-prism": {
    margin: 0.038,
    relief: 0.0045,
    band: { metalness: 0.45, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.9, iridescenceIOR: 1.5, iridescenceThicknessRange: [220, 760] },
    edge: { color: 0x7dd3fc, metalness: 0.8, roughness: 0.2, clearcoat: 0.9, clearcoatRoughness: 0.12 },
    light: { a: 0x7dd3fc, b: 0xc4b5fd, mix: 0.6 },
    fx: { kind: FX.aurora, a: 0x7dd3fc, b: 0xe9d5ff },
    glints: (band) => cornerGlints(band, [1.5, 3.0, 4.5, 6.0]),
  },
  "seraph-wings": {
    margin: 0.04,
    relief: 0.005,
    band: { metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 },
    edge: { color: 0xe3bd72, metalness: 1, roughness: 0.24, clearcoat: 0.5, clearcoatRoughness: 0.18 },
    light: { a: 0xffe2a8, b: 0xfff4e0, mix: 0.55 },
    fx: { kind: FX.gilt, a: 0xfff1c9, b: 0xffffff },
    glints: () => [],
  },
  "spider-lily": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.12 },
    edge: { color: 0x120709, metalness: 0.4, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.1 },
    light: { a: 0xff3b4a, b: 0xf2e6dc, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xb3202e, b: 0xfff1ea },
    glints: () => [],
  },
  "koi-rail": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08 },
    edge: { color: 0x7a4b2a, metalness: 0.1, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    light: { a: 0x8ad8dc, b: 0xffb07a, mix: 0.55 },
    fx: { kind: FX.gilt, a: 0xd9fbff, b: 0xffffff },
    glints: () => [],
  },
  "pressed-diary": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.7, sheen: 1, sheenColor: 0xfff4e0, sheenRoughness: 0.6 },
    edge: { color: 0x7d1427, metalness: 0.1, roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.3 },
    light: { a: 0xf2a5b8, b: 0xfff1d6, mix: 0.5 },
    fx: { kind: FX.gilt, a: 0xffe8c8, b: 0xffffff },
    glints: () => [],
  },
  "sonata-keys": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 },
    edge: { color: 0x141418, metalness: 0.3, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 },
    light: { a: 0x8bbcf0, b: 0xffd6e4, mix: 0.5 },
    fx: { kind: FX.gilt, a: 0xfff4d8, b: 0xffffff },
    glints: () => [],
  },
  "demon-wing": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.2, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },
    edge: { color: 0x0b0710, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 1, sheenColor: 0x19e3c8, sheenRoughness: 0.4 },
    light: { a: 0xff2e88, b: 0x19e3c8, mix: 0.65 },
    fx: { kind: FX.amethyst, a: 0xff7ab8, b: 0x9ffff0 },
    glints: () => [],
  },
  moonshot: {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.95, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.1 },
    edge: { color: 0xc9d1dc, metalness: 1, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.1 },
    light: { a: 0x22d3ee, b: 0xff3fd2, mix: 0.6 },
    fx: { kind: FX.holo, a: 0xbaf6ff, b: 0xffd0f4 },
    glints: () => [],
  },
  "golden-arrow": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.5, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 },
    edge: { color: 0xe5b53a, metalness: 1, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.16 },
    light: { a: 0xe5b53a, b: 0xc77ae0, mix: 0.6 },
    fx: { kind: FX.amethyst, a: 0xffe08a, b: 0xf0c4ff },
    glints: (band) => cornerGlints(band, [1.4, 2.8, 4.2, 5.6]),
  },
  "tsuba-guard": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.6, sheen: 1, sheenColor: 0xfff1d6, sheenRoughness: 0.5 },
    edge: { color: 0x0d0d0f, metalness: 0.6, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.2 },
    light: { a: 0xff7a1a, b: 0xefe4cc, mix: 0.55 },
    fx: { kind: FX.gilt, a: 0xffc48a, b: 0xfff4e0 },
    glints: () => [],
  },
  "five-ribbons": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.45, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.2 },
    edge: { color: 0xe8638f, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },
    light: { a: 0xf5bfd0, b: 0xf6c344, mix: 0.5 },
    fx: { kind: FX.amethyst, a: 0xffd6e4, b: 0xfff6e0 },
    glints: () => [],
  },
  "frost-glam": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.3, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.5, iridescenceIOR: 1.4, iridescenceThicknessRange: [200, 600] },
    edge: { color: 0xff2e8a, metalness: 0.4, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 },
    light: { a: 0x9fd3f5, b: 0xff8cc4, mix: 0.55 },
    fx: { kind: FX.amethyst, a: 0xe6f6ff, b: 0xffd6ea },
    glints: (band) => cornerGlints(band, [1.2, 2.6, 4.0, 5.4]),
  },
  "hollow-fang": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.1, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06 },
    edge: { color: 0x050506, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },
    light: { a: 0xdc1432, b: 0xefe6d6, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xff6070, b: 0xfff4ea },
    glints: () => [],
  },
  "summer-fireworks": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.2, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 },
    edge: { color: 0x1a1440, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },
    light: { a: 0xffb03a, b: 0xff8ac4, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xffe9a8, b: 0xffb03a },
    glints: (band) => cornerGlints(band, [1.2, 3.1, 5.0]),
  },
  "sakura-storm": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.5, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.25 },
    edge: { color: 0x3e2418, metalness: 0.1, roughness: 0.6 },
    light: { a: 0xf08db0, b: 0xffe5ec, mix: 0.5 },
    fx: { kind: FX.amethyst, a: 0xffe5ec, b: 0xfff6e0 },
    glints: () => [],
  },
  "kagune-coil": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 },
    edge: { color: 0x9e0018, metalness: 0.4, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 },
    light: { a: 0xd81d35, b: 0x2a0a0e, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xff5a64, b: 0xffd0d4 },
    glints: () => [],
  },
  "stained-prelude": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.4, iridescenceIOR: 1.4, iridescenceThicknessRange: [200, 600] },
    edge: { color: 0x16161c, metalness: 0.7, roughness: 0.3 },
    light: { a: 0x7fb2f0, b: 0xf59ac0, mix: 0.55 },
    fx: { kind: FX.amethyst, a: 0xbfe3ff, b: 0xffd1e3 },
    glints: () => [],
  },
  "fallen-halo": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.4, sheen: 1, sheenColor: 0xfff1b8, sheenRoughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.2 },
    edge: { color: 0xc48a1c, metalness: 0.9, roughness: 0.25 },
    light: { a: 0xfff1b8, b: 0xffffff, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xfff1b8, b: 0xffffff },
    glints: (band) => cornerGlints(band, [1.4, 3.6]),
  },
  afterimage: {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 },
    edge: { color: 0x5d6878, metalness: 0.9, roughness: 0.2 },
    light: { a: 0x7dff6a, b: 0xff3fd2, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xd8ffd0, b: 0x7dff6a },
    glints: () => [],
  },
  "zipper-rush": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.6, sheen: 0.6, sheenColor: 0xd9a6ff, sheenRoughness: 0.5 },
    edge: { color: 0xc48a1c, metalness: 0.9, roughness: 0.25 },
    light: { a: 0x8a2cdf, b: 0xe5b53a, mix: 0.6 },
    fx: { kind: FX.gilt, a: 0xfff1b8, b: 0xf0c4ff },
    glints: (band) => cornerGlints(band, [1.2, 2.8, 4.4]),
  },
  "bridal-bouquet": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.4, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.15 },
    edge: { color: 0xb8786a, metalness: 0.8, roughness: 0.25 },
    light: { a: 0xfff4d6, b: 0xe8638f, mix: 0.5 },
    fx: { kind: FX.amethyst, a: 0xffffff, b: 0xffe4ec },
    glints: (band) => cornerGlints(band, [1.2, 2.6, 4.0]),
  },
  "lavender-north": {
    margin: 0.05,
    relief: 0.006,
    band: { metalness: 0, roughness: 0.45, sheen: 1, sheenColor: 0xffffff, sheenRoughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.2 },
    edge: { color: 0x6a4fc4, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 },
    light: { a: 0xa58bf0, b: 0xff9a4a, mix: 0.5 },
    fx: { kind: FX.amethyst, a: 0xe8e0ff, b: 0xffffff },
    glints: () => [],
  },
};

const PLANE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The artwork itself: drawn exactly as the image, then lit in display space with a screen blend
 * (a soft softbox reflection, a narrow streak that slides with the angle and the reveal sweep),
 * capped so highlights never wash the picture out.
 */
const ART_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform vec2 uArt;
  uniform vec2 uCard;
  uniform vec2 uSpot;
  uniform float uLight;
  uniform float uGloss;
  uniform float uInset;
  uniform vec3 uTint;
  uniform float uSweep;
  uniform float uSweepStrength;
  void main() {
    gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);
    #include <colorspace_fragment>
    vec2 p = (vUv - 0.5) * uArt;
    vec2 e = uArt * 0.5 - abs(p);
    gl_FragColor.rgb *= 1.0 - uInset * exp(-min(e.x, e.y) / uCard.y * 160.0);
    vec2 d = (p - uSpot) / uCard.y;
    float spot = exp(-dot(d, d) * 7.0) * 0.75 + exp(-dot(d, d) * 70.0) * 0.25;
    float s = 0.5 + dot(p, vec2(0.8, 0.6)) / dot(uCard, vec2(0.8, 0.6));
    float streak = exp(-pow((s - uLight) * 7.0, 2.0)) * 0.6 + exp(-pow((s - uLight - 0.06) * 30.0, 2.0)) * 0.4;
    vec3 glow = (vec3(spot) + uTint * streak * 0.6) * uGloss;
    float x = s - mix(-0.25, 1.25, uSweep);
    glow += vec3(exp(-x * x * 300.0) * 0.75 + exp(-x * x * 20.0) * 0.1) * uSweepStrength;
    gl_FragColor.rgb = 1.0 - (1.0 - gl_FragColor.rgb) * (1.0 - min(glow, vec3(0.6)));
  }
`;

/** Additive light over a frame band: each frame's own sheen, its glints and the reveal sweep. */
const FX_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uKind;
  uniform float uTime;
  uniform vec2 uCard;
  uniform vec2 uHole;
  uniform float uMargin;
  uniform vec2 uTilt;
  uniform float uLight;
  uniform vec3 uFxA;
  uniform vec3 uFxB;
  uniform float uSweep;
  uniform float uSweepStrength;
  uniform vec3 uGlints[5];
  uniform int uGlintCount;
  uniform float uGlintStrength;
  uniform float uFxStrength;
  const float TAU = 6.2831853;

  float star(vec2 d, float size) {
    d /= size;
    float core = exp(-dot(d, d) * 16.0);
    float rays = exp(-abs(d.x) * 30.0 - d.y * d.y * 1.6) + exp(-abs(d.y) * 30.0 - d.x * d.x * 1.6);
    return core + rays * 0.5;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 p = (vUv - 0.5) * uCard;
    vec2 q = abs(p);
    float w = max(uMargin, 1e-4);
    float dOut = min(uCard.x * 0.5 - q.x, uCard.y * 0.5 - q.y);
    float dIn = max(q.x - uHole.x * 0.5, q.y - uHole.y * 0.5);
    float inner = exp(-pow(dIn / (w * 0.1), 2.0));
    float outer = exp(-pow(dOut / (w * 0.08), 2.0));
    float s = 0.5 + dot(p, vec2(0.8, 0.6)) / dot(uCard, vec2(0.8, 0.6));
    float streak = exp(-pow((s - uLight) * 5.5, 2.0));
    float a = uTilt.x * 5.7 + uTilt.y * 4.1;
    float tilt = min(1.0, length(uTilt));
    vec3 color;

    if (uKind < 1.5) {
      // Gilt: a broad metallic sheen with bright beaded edges.
      float sheen = streak * 0.3 + exp(-pow((s - uLight - 0.05) * 18.0, 2.0)) * 0.2;
      color = uFxA * (sheen + (inner * 0.35 + outer * 0.28) * (0.3 + streak));
    } else if (uKind < 2.5) {
      // Amethyst: lavender rim light and a scatter of facets that each catch the light at their own angle.
      float cellSize = w * 0.45;
      vec2 cell = floor(p / cellSize);
      vec2 local = (fract(p / cellSize) - 0.5) * cellSize;
      float flash = pow(max(0.0, cos(a * 1.3 + hash(cell) * TAU)), 40.0) * step(0.72, hash(cell + 17.0));
      color = uFxA * ((inner * 0.42 + outer * 0.2) * (0.35 + streak) + streak * 0.1)
        + uFxB * star(local, cellSize * 0.35) * flash * 0.5 * uGlintStrength;
    } else if (uKind < 3.5) {
      // Holographic: a thin-film rainbow whose hues slide with the angle, over fine diffraction lines.
      float hue = fract(s * 1.3 + uTilt.x * 0.35 - uTilt.y * 0.25 + dIn / w * 0.12);
      vec3 film = 0.5 + 0.5 * cos(TAU * (hue + vec3(0.0, 0.33, 0.67)));
      float lines = 0.85 + 0.15 * sin(dot(p, vec2(1.0, -1.0)) * 520.0);
      color = film * (0.08 + 0.22 * streak + 0.08 * tilt) * lines + uFxA * (inner * 0.22 + outer * 0.18) * (0.4 + streak);
    } else {
      // Aurora: one slow thread of light around the edge, and a curtain that shifts colour with the angle.
      float angle = atan(p.y, p.x);
      float head = mod(uTime * 0.57, TAU) - 3.1415927;
      float diff = mod(angle - head + 3.1415927, TAU) - 3.1415927;
      float glow = diff < 0.0 ? exp(diff * 2.4) : exp(-diff * 28.0);
      vec3 thread = mix(uFxA, uFxB, smoothstep(-1.4, 0.0, diff));
      vec3 curtain = mix(uFxA, uFxB, clamp(s + uTilt.x * 0.4, 0.0, 1.0));
      color = thread * glow * 0.8 + curtain * inner * (0.2 + 0.35 * streak);
    }

    for (int i = 0; i < 5; i++) {
      if (i >= uGlintCount) break;
      vec3 g = uGlints[i];
      float on = pow(max(0.0, cos(a + g.z)), 30.0);
      color += mix(vec3(1.0), uFxB, 0.3) * star(p - g.xy, w * 0.7) * on * 0.85 * uGlintStrength;
    }

    float x = s - mix(-0.25, 1.25, uSweep);
    color += mix(vec3(1.0), uFxA, 0.4) * exp(-x * x * 300.0) * uSweepStrength * 0.9;
    gl_FragColor = vec4(color * uFxStrength, 1.0);
  }
`;

function roundedRect<T extends Path>(target: T, width: number, height: number, radius: number): T {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  target.moveTo(x + r, y);
  target.lineTo(x + width - r, y);
  target.quadraticCurveTo(x + width, y, x + width, y + r);
  target.lineTo(x + width, y + height - r);
  target.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  target.lineTo(x + r, y + height);
  target.quadraticCurveTo(x, y + height, x, y + height - r);
  target.lineTo(x, y + r);
  target.quadraticCurveTo(x, y, x + r, y);
  return target;
}

/** Points every vertex's UV at its x/y position across a width × height box. */
function spanUv<T extends BufferGeometry>(geometry: T, width: number, height: number): T {
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / height + 0.5);
  uv.needsUpdate = true;
  return geometry;
}

/** A flat rounded rectangle (optionally with a rounded hole) whose UVs span its full extent. */
function panel(width: number, height: number, radius: number, hole?: { width: number; height: number; radius: number }) {
  const shape = roundedRect(new Shape(), width, height, radius);
  if (hole) shape.holes.push(roundedRect(new Path(), hole.width, hole.height, hole.radius));
  return spanUv(new ShapeGeometry(shape, 14), width, height);
}

type Layout = { cw: number; ch: number; aw: number; ah: number; m: number; r: number; ra: number };

/** Paints the frame band (the art area is cut out of the geometry, so only the edges show). */
type Paint = CanvasRenderingContext2D;
/** Parallel lines across the whole band; slope 1 runs bottom-left to top-right, -1 the other way. */
function stripes(ctx: Paint, W: number, H: number, step: number, width: number, colour: string, slope: number) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  for (let x = -H; x < W + H; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H * slope, 0);
    ctx.stroke();
  }
}
function dots(ctx: Paint, W: number, H: number, step: number, radius: number, colour: string) {
  ctx.fillStyle = colour;
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function pool(ctx: Paint, W: number, H: number, x: number, y: number, colour: string) {
  const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.4);
  glow.addColorStop(0, colour);
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
}

/** Bands of the illustrated frames, matching their `.art-frame` CSS; their motifs come from frame-motifs.ts. */
const BANDS: Partial<Record<FrameLookId, { base: readonly string[]; outer: string; inner: string; pattern?: (ctx: Paint, W: number, H: number, M: number) => void }>> = {
  "koi-rail": {
    base: ["#8ad8dc", "#3c9bb0", "#6cc3cc"],
    outer: "#7a4b2a",
    inner: "#fffaf2",
    pattern: (ctx, W, H, M) => {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = Math.max(1, M * 0.05);
      for (let y = M * 0.35, row = 0; y < H; y += M * 0.28, row++) {
        for (let x = (row % 2) * M * 0.26; x < W; x += M * 0.52) {
          ctx.beginPath();
          ctx.ellipse(x, y, M * 0.16, M * 0.06, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    },
  },
  "pressed-diary": {
    base: ["#f8efdd", "#f1e4cb", "#f8efdd"],
    outer: "#7d1427",
    inner: "#c9a04a",
    pattern: (ctx, W, H) => {
      stripes(ctx, W, H, 4, 1, "rgba(120, 90, 60, 0.08)", 0);
      ctx.fillStyle = "rgba(120, 90, 60, 0.08)";
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    },
  },
  "sonata-keys": { base: ["#fffdf6", "#ece2cc", "#fffaf0", "#e7dcc3"], outer: "#141418", inner: "#141418" },
  "demon-wing": {
    base: ["#120a18", "#0b0710", "#140812"],
    outer: "#19e3c8",
    inner: "#ff2e88",
    pattern: (ctx, W, H, M) => {
      pool(ctx, W, H, W * 0.12, H * 0.2, "rgba(255, 46, 136, 0.55)");
      pool(ctx, W, H, W * 0.88, H * 0.82, "rgba(25, 227, 200, 0.45)");
      stripes(ctx, W, H, M * 2.2, Math.max(1.5, M * 0.1), "rgba(209, 16, 47, 0.55)", 0.55);
    },
  },
  moonshot: {
    base: ["#f4f7fb", "#8a96a8", "#e8edf4", "#5d6878", "#d3dae4"],
    outer: "#ff3fd2",
    inner: "#f5e112",
    pattern: (ctx, W, H, M) => {
      ctx.fillStyle = "rgba(34, 211, 238, 0.7)";
      for (let x = M * 0.45; x < W; x += M * 0.45) ctx.fillRect(x, 0, Math.max(1, M * 0.05), H);
      for (let y = M * 0.45; y < H; y += M * 0.45) ctx.fillRect(0, y, W, Math.max(1, M * 0.05));
    },
  },
  "golden-arrow": {
    base: ["#5a1f78", "#2a0a3e", "#4a1868"],
    outer: "#e5b53a",
    inner: "#e5b53a",
    pattern: (ctx, W, H, M) => {
      stripes(ctx, W, H, M * 0.5, Math.max(1, M * 0.06), "rgba(229, 181, 58, 0.6)", 1);
      stripes(ctx, W, H, M * 0.5, Math.max(1, M * 0.06), "rgba(229, 181, 58, 0.6)", -1);
    },
  },
  "tsuba-guard": {
    base: ["#f4ead4", "#d9c9a6", "#efe4cc"],
    outer: "#0d0d0f",
    inner: "#ff7a1a",
    pattern: (ctx, W, H, M) => dots(ctx, W, H, M * 0.12, Math.max(0.6, M * 0.025), "rgba(255, 255, 255, 0.7)"),
  },
  "five-ribbons": {
    base: ["#ffe4ec", "#f5bfd0", "#ffe9f0"],
    outer: "#e8638f",
    inner: "#c98a7a",
    pattern: (ctx, W, H, M) => dots(ctx, W, H, M * 0.3, Math.max(0.8, M * 0.05), "rgba(255, 255, 255, 0.9)"),
  },
  "frost-glam": {
    base: ["#eaf7ff", "#b8dcf5", "#f2f9ff", "#cfe6fb"],
    outer: "#ff2e8a",
    inner: "#a58bf0",
    pattern: (ctx, W, H, M) => dots(ctx, W, H, M * 0.42, Math.max(1, M * 0.08), "rgba(255, 255, 255, 0.95)"),
  },
  "hollow-fang": {
    base: ["#1b1b20", "#050506", "#16161a"],
    outer: "#050506",
    inner: "#050506",
    pattern: (ctx, W, H) => {
      pool(ctx, W, H, W, 0, "rgba(190, 0, 30, 0.55)");
      pool(ctx, W, H, 0, H, "rgba(190, 0, 30, 0.55)");
    },
  },
  "summer-fireworks": {
    base: ["#2a1f63", "#120c33", "#3a1f5a"],
    outer: "#1a1440",
    inner: "#ffb03a",
    pattern: (ctx, W, H, M) => dots(ctx, W, H, M * 0.3, Math.max(0.8, M * 0.04), "rgba(255, 233, 168, 0.8)"),
  },
  "sakura-storm": {
    base: ["#ffe5ec", "#f6b8cb", "#ffdbe5"],
    outer: "#3e2418",
    inner: "#e88aa6",
    pattern: (ctx, W, H) => pool(ctx, W, H, W * 0.2, H * 0.3, "rgba(255, 255, 255, 0.55)"),
  },
  "kagune-coil": {
    base: ["#1a0a0e", "#050203", "#160608"],
    outer: "#000000",
    inner: "#9e0018",
    pattern: (ctx, W, H) => {
      pool(ctx, W, H, 0, 0, "rgba(158, 0, 24, 0.5)");
      pool(ctx, W, H, W, H, "rgba(158, 0, 24, 0.5)");
    },
  },
  "stained-prelude": { base: ["#bfe3ff", "#ffd1e3", "#fff2b8", "#c9f0dc", "#bfe3ff"], outer: "#16161c", inner: "#c48a1c" },
  "fallen-halo": {
    base: ["#fffaf0", "#e9dfcc", "#fbf5ea"],
    outer: "#c48a1c",
    inner: "#fffaf0",
    pattern: (ctx, W, H) => pool(ctx, W, H, W / 2, 0, "rgba(255, 241, 184, 0.8)"),
  },
  afterimage: { base: ["#2a3446", "#0b0f17", "#222a38"], outer: "#5d6878", inner: "#7dff6a" },
  "zipper-rush": {
    base: ["#5a1f78", "#2e0a44", "#4a1868"],
    outer: "#c48a1c",
    inner: "#c48a1c",
    pattern: (ctx, W, H, M) => stripes(ctx, W, H, M * 0.12, Math.max(0.6, M * 0.03), "rgba(255, 255, 255, 0.07)", 1),
  },
  "bridal-bouquet": { base: ["#fffdf8", "#f1e8da", "#fffaf2"], outer: "#d8cbb8", inner: "#b8786a" },
  "lavender-north": {
    base: ["#e8e0ff", "#c3b0f5", "#9b84e0"],
    outer: "#6a4fc4",
    inner: "#ffffff",
    pattern: (ctx, W, H, M) => dots(ctx, W, H, M * 0.24, Math.max(0.8, M * 0.04), "rgba(255, 255, 255, 0.85)"),
  },
};

function paintBand(frame: FrameLookId, { cw, ch, m, r, ra }: Layout): HTMLCanvasElement | null {
  if (frame === "none") return null;
  const scale = 1400 / Math.max(cw, ch);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const W = canvas.width;
  const H = canvas.height;
  const M = m * scale;
  const art = { x: M, y: M, w: W - 2 * M, h: H - 2 * M, r: ra * scale };
  const line = (inset: number, width: number, style: string | CanvasGradient, radius: number) => {
    ctx.beginPath();
    ctx.roundRect(inset, inset, W - inset * 2, H - inset * 2, Math.max(0, radius));
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.stroke();
  };
  const corners = (draw: () => void) => {
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
      ctx.save();
      ctx.translate(sx === 1 ? 0 : W, sy === 1 ? 0 : H);
      ctx.scale(sx, sy);
      draw();
      ctx.restore();
    }
  };
  const illustrated = BANDS[frame];

  if (frame === "gilt") {
    const gold = ctx.createLinearGradient(0, 0, W, H);
    for (const [stop, color] of [[0, "#fff3d4"], [0.16, "#c9a259"], [0.34, "#f7e3a9"], [0.52, "#8c6529"], [0.7, "#e3c47f"], [0.86, "#9c7432"], [1, "#f4dfaa"]] as const) gold.addColorStop(stop, color);
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, W, H);
    // Brushed grain.
    for (let y = 0; y < H; y += 3) {
      ctx.fillStyle = `rgba(255, 248, 225, ${0.035 + 0.035 * Math.sin(y * 0.37)})`;
      ctx.fillRect(0, y, W, 1);
    }
    line(M * 0.32, Math.max(1.5, M * 0.06), "rgba(255, 244, 214, 0.75)", r * scale - M * 0.32);
    line(art.x - 1, Math.max(2, M * 0.08), "rgba(46, 30, 8, 0.65)", art.r + 1);
    corners(() => {
      const s = M * 0.36;
      ctx.save();
      ctx.translate(M / 2, M / 2);
      ctx.rotate(Math.PI / 4);
      const stud = ctx.createLinearGradient(-s, -s, s, s);
      stud.addColorStop(0, "#fff6dc");
      stud.addColorStop(0.45, "#d4ad62");
      stud.addColorStop(1, "#7d5a22");
      ctx.fillStyle = stud;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.lineWidth = Math.max(1, M * 0.04);
      ctx.strokeStyle = "rgba(52, 36, 10, 0.7)";
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    });
  } else if (frame === "amethyst") {
    const violet = ctx.createLinearGradient(0, 0, W * 0.35, H);
    for (const [stop, color] of [[0, "#4c1d95"], [0.3, "#6d28d9"], [0.55, "#2e1065"], [0.8, "#7c3aed"], [1, "#3b0764"]] as const) violet.addColorStop(stop, color);
    ctx.fillStyle = violet;
    ctx.fillRect(0, 0, W, H);
    const lavender = ctx.createLinearGradient(0, 0, W, H);
    lavender.addColorStop(0, "#f3e8ff");
    lavender.addColorStop(0.3, "#c084fc");
    lavender.addColorStop(0.6, "#e9d5ff");
    lavender.addColorStop(1, "#a855f7");
    line(M * 0.28, Math.max(1.5, M * 0.05), "rgba(233, 213, 255, 0.55)", r * scale - M * 0.28);
    line(art.x - M * 0.06, Math.max(2, M * 0.11), lavender, art.r + M * 0.06);
  } else if (frame === "seraph-wings") {
    const ivory = ctx.createLinearGradient(0, 0, W * 0.4, H);
    for (const [stop, color] of [[0, "#fffaf0"], [0.35, "#efe2c8"], [0.6, "#fff7e8"], [1, "#e2cfa6"]] as const) ivory.addColorStop(stop, color);
    ctx.fillStyle = ivory;
    ctx.fillRect(0, 0, W, H);
    line(M * 0.24, Math.max(1.5, M * 0.07), "#d9b25e", r * scale - M * 0.24);
    line(art.x - M * 0.06, Math.max(2, M * 0.1), "#c99a3f", art.r + M * 0.06);
  } else if (frame === "spider-lily") {
    // Black lacquer with red veins pooling at the bloom corners, a bone-thread seam and a red inner lip.
    const lacquer = ctx.createLinearGradient(0, 0, W, H);
    lacquer.addColorStop(0, "#241014");
    lacquer.addColorStop(0.45, "#070405");
    lacquer.addColorStop(1, "#1a0a0d");
    ctx.fillStyle = lacquer;
    ctx.fillRect(0, 0, W, H);
    for (const [x, y] of [[0, 0], [W, H]]) {
      const pool = ctx.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.45);
      pool.addColorStop(0, "rgba(200, 16, 46, 0.6)");
      pool.addColorStop(1, "rgba(200, 16, 46, 0)");
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.strokeStyle = "rgba(160, 12, 36, 0.28)";
    ctx.lineWidth = Math.max(1, M * 0.05);
    for (let x = -H; x < W; x += M * 1.6) {
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x + H * 0.47, 0);
      ctx.stroke();
    }
    ctx.save();
    ctx.setLineDash([M * 0.32, M * 0.22]);
    ctx.lineCap = "round";
    line(M / 2, Math.max(1.5, M * 0.08), "rgba(239, 230, 220, 0.8)", r * scale - M / 2);
    ctx.restore();
    line(art.x - M * 0.05, Math.max(2, M * 0.08), "#c8102e", art.r + M * 0.05);
    line(Math.max(1, M * 0.03), Math.max(1.5, M * 0.06), "rgba(0, 0, 0, 0.7)", r * scale);
  } else if (illustrated) {
    // Illustrated frames: a base gradient, the frame's pattern, then the outer and inner lines (motifs are 3D ornaments).
    const band = illustrated;
    const base = ctx.createLinearGradient(0, 0, W * 0.4, H);
    band.base.forEach((colour, i) => base.addColorStop(i / (band.base.length - 1), colour));
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    band.pattern?.(ctx, W, H, M);
    const width = Math.max(2, M * 0.16);
    line(width / 2, width, band.outer, r * scale - width / 2);
    line(art.x - width / 2, width, band.inner, art.r + width / 2);
  } else if (frame === "holo") {
    const colors = ["#ff9fd6", "#ffd29f", "#fff6a3", "#a6ffd0", "#9fe1ff", "#b9a6ff", "#ff9fd6"];
    const holo = ctx.createConicGradient(-Math.PI / 3, W / 2, H / 2);
    colors.forEach((color, i) => holo.addColorStop(i / (colors.length - 1), color));
    ctx.fillStyle = holo;
    ctx.fillRect(0, 0, W, H);
    const sheen = ctx.createLinearGradient(0, 0, W, H);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0.35)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
    line(art.x - 1, Math.max(1.5, M * 0.06), "rgba(30, 20, 60, 0.35)", art.r + 1);
  } else if (frame === "aurora") {
    const night = ctx.createLinearGradient(0, 0, W, H);
    night.addColorStop(0, "#111a35");
    night.addColorStop(1, "#0a0f22");
    ctx.fillStyle = night;
    ctx.fillRect(0, 0, W, H);
    line(M * 0.3, Math.max(1, M * 0.05), "rgba(196, 214, 255, 0.2)", r * scale - M * 0.3);
    line(art.x - 1, Math.max(1.5, M * 0.07), "rgba(196, 214, 255, 0.38)", art.r + 1);
  } else if (frame === "pixel-quest") {
    // Chunky two-tone pixel checker, a gold pixel bracket in each corner and a pixel coin on top.
    const px = Math.max(2, Math.round(M / 4));
    for (let y = 0; y < H; y += px) {
      for (let x = 0; x < W; x += px) {
        ctx.fillStyle = ((x / px + y / px) & 1) === 0 ? "#6d28d9" : "#a78bfa";
        ctx.fillRect(x, y, px, px);
      }
    }
    ctx.fillStyle = "#1e1037";
    ctx.fillRect(0, 0, W, px * 0.6);
    ctx.fillRect(0, H - px * 0.6, W, px * 0.6);
    ctx.fillRect(0, 0, px * 0.6, H);
    ctx.fillRect(W - px * 0.6, 0, px * 0.6, H);
    line(art.x - px * 0.3, px * 0.6, "#1e1037", art.r + px * 0.3);
    corners(() => {
      ctx.fillStyle = "#fbbf24";
      for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [0, 2]]) ctx.fillRect(px * (x + 0.6), px * (y + 0.6), px, px);
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(px * 0.6, px * 0.6, px, px);
    });
    const coin = ["..###..", ".#####.", "##+####", "##+####", "#######", ".#####.", "..###.."];
    const unit = M / 9;
    const ox = W / 2 - unit * 3.5;
    const oy = M / 2 - unit * 3.5;
    coin.forEach((row, y) =>
      [...row].forEach((cell, x) => {
        if (cell === ".") return;
        ctx.fillStyle = cell === "+" ? "#fffbeb" : "#f59e0b";
        ctx.fillRect(ox + x * unit, oy + y * unit, unit + 0.5, unit + 0.5);
      }),
    );
  } else if (frame === "neon-marquee") {
    // A dark marquee band set with warm bulbs, between a pink outer tube and a cyan inner tube.
    ctx.fillStyle = "#170b22";
    ctx.fillRect(0, 0, W, H);
    const spacing = M * 0.9;
    const bulb = (x: number, y: number) => {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, M * 0.26);
      glow.addColorStop(0, "#fffbeb");
      glow.addColorStop(0.45, "#fcd34d");
      glow.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, M * 0.26, 0, Math.PI * 2);
      ctx.fill();
    };
    const c = M / 2;
    for (let x = c; x <= W - c + 0.5; x += (W - 2 * c) / Math.max(1, Math.round((W - 2 * c) / spacing))) {
      bulb(x, c);
      bulb(x, H - c);
    }
    const stepY = (H - 2 * c) / Math.max(1, Math.round((H - 2 * c) / spacing));
    for (let y = c + stepY; y < H - c - 0.5; y += stepY) {
      bulb(c, y);
      bulb(W - c, y);
    }
    ctx.save();
    ctx.shadowBlur = M * 0.35;
    ctx.shadowColor = "#f472b6";
    line(M * 0.1, Math.max(2, M * 0.08), "#f9a8d4", r * scale - M * 0.1);
    ctx.shadowColor = "#67e8f9";
    line(art.x - M * 0.08, Math.max(2, M * 0.08), "#a5f3fc", art.r + M * 0.08);
    ctx.restore();
  } else if (frame === "constellation") {
    // A night-sky rim scattered with stars, a gold hairline each side and a four-point star in each corner.
    const sky = ctx.createLinearGradient(0, 0, W, H);
    sky.addColorStop(0, "#1e1b4b");
    sky.addColorStop(0.5, "#0b1026");
    sky.addColorStop(1, "#24205a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const count = Math.min(4000, Math.round((W * H) / (M * M * 0.6)));
    for (let i = 0; i < count; i++) {
      const x = random() * W;
      const y = random() * H;
      if (x > M * 1.05 && x < W - M * 1.05 && y > M * 1.05 && y < H - M * 1.05) continue;
      ctx.fillStyle = random() > 0.8 ? "rgba(253, 230, 138, 0.9)" : `rgba(224, 231, 255, ${0.35 + random() * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.6, M * (0.025 + random() * 0.04)), 0, Math.PI * 2);
      ctx.fill();
    }
    line(M * 0.2, Math.max(1, M * 0.035), "rgba(240, 214, 140, 0.85)", r * scale - M * 0.2);
    line(art.x - M * 0.05, Math.max(1, M * 0.04), "rgba(240, 214, 140, 0.9)", art.r + M * 0.05);
    corners(() => {
      const s = M * 0.62;
      ctx.save();
      ctx.translate(M / 2, M / 2);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const d = k % 2 === 0 ? s : s * 0.22;
        ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      }
      ctx.closePath();
      ctx.fillStyle = "#fde68a";
      ctx.fill();
      ctx.restore();
    });
  } else if (frame === "obsidian-relic") {
    const obsidian = ctx.createLinearGradient(0, 0, W, H);
    obsidian.addColorStop(0, "#14101f");
    obsidian.addColorStop(0.5, "#09070e");
    obsidian.addColorStop(1, "#1e1533");
    ctx.fillStyle = obsidian;
    ctx.fillRect(0, 0, W, H);
    line(M * 0.22, Math.max(1.5, M * 0.06), "#e8b84a", r * scale - M * 0.22);
    line(art.x - M * 0.06, Math.max(2, M * 0.09), "#d9a845", art.r + M * 0.06);
    corners(() => {
      const s = M * 0.42;
      ctx.save();
      ctx.translate(M / 2, M / 2);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = "#9333ea";
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = "#fde68a";
      ctx.lineWidth = Math.max(1, M * 0.05);
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    });
  } else if (frame === "celestial-prism") {
    const prism = ctx.createLinearGradient(0, 0, W, H);
    prism.addColorStop(0, "#162447");
    prism.addColorStop(0.5, "#1f1d47");
    prism.addColorStop(1, "#0f2942");
    ctx.fillStyle = prism;
    ctx.fillRect(0, 0, W, H);
    line(M * 0.24, Math.max(1.2, M * 0.05), "rgba(186, 230, 253, 0.75)", r * scale - M * 0.24);
    line(art.x - M * 0.05, Math.max(1.5, M * 0.07), "rgba(221, 214, 254, 0.85)", art.r + M * 0.05);
  }
  return canvas;
}

function sharedUniforms() {
  return {
    uTilt: { value: new Vector2() },
    uLight: { value: 0.5 },
    uCard: { value: new Vector2(1, 1) },
    uSweep: { value: 0 },
    uSweepStrength: { value: 0 },
  };
}

function fxUniformsFor(shared: ReturnType<typeof sharedUniforms>) {
  return {
    ...shared,
    uKind: { value: 0 },
    uTime: { value: 0 },
    uHole: { value: new Vector2() },
    uMargin: { value: 0.02 },
    uFxA: { value: new Vector3() },
    uFxB: { value: new Vector3() },
    uGlints: { value: Array.from({ length: 5 }, () => new Vector3()) },
    uGlintCount: { value: 0 },
    uGlintStrength: { value: 1 },
    uFxStrength: { value: 1 },
  };
}

type Track = <T extends BufferGeometry | Material | Texture>(item: T) => T;

/**
 * The frame around art of aw × ah: body, raised band, light overlay and ornaments. `open` cuts the
 * art area out of the body as well. cw/ch is the extent including ornaments.
 */
function frameGroup(frame: FrameLookId, aw: number, ah: number, fxUniforms: ReturnType<typeof fxUniformsFor>, anisotropy: number, track: Track, open = false) {
  const spec = SPECS[frame];
  const framed = spec.margin > 0;
  const m = spec.margin * Math.min(aw, ah);
  // The face (band or art) covers the body's front cap; the body's bevel forms the card's rim.
  const bw = aw + m * 2;
  const bh = ah + m * 2;
  let cw = bw + BEVEL * 2;
  let ch = bh + BEVEL * 2;
  const r = 0.045 * Math.min(cw, ch);
  const rb = Math.max(0.002, r - BEVEL);
  const ra = framed ? Math.min(rb, Math.max(0.006, rb - m * 0.6)) : rb;

  const group = new Group();
  const front = DEPTH / 2 + BEVEL;

  const bodyShape = roundedRect(new Shape(), bw, bh, rb);
  if (open) bodyShape.holes.push(roundedRect(new Path(), aw, ah, ra));
  const body = track(new ExtrudeGeometry(bodyShape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 5, curveSegments: 16 }));
  body.translate(0, 0, -DEPTH / 2);
  const bodyMesh = new Mesh(body, track(new MeshPhysicalMaterial(spec.edge)));
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);
  fxUniforms.uCard.value.set(bw, bh);

  if (framed && spec.fx) {
    // A raised band with bevelled inner and outer edges, so the art sits recessed inside it.
    const shape = roundedRect(new Shape(), bw, bh, rb);
    shape.holes.push(roundedRect(new Path(), aw, ah, ra));
    const lip = LIP;
    const bandGeometry = track(
      spanUv(new ExtrudeGeometry(shape, { depth: spec.relief, bevelEnabled: true, bevelThickness: lip, bevelSize: Math.min(0.002, m * 0.1), bevelSegments: 3, curveSegments: 14 }), bw, bh),
    );
    bandGeometry.translate(0, 0, front + lip);
    const map = paintBand(frame, { cw: bw, ch: bh, aw, ah, m, r: rb, ra });
    const bandMap = map ? track(new CanvasTexture(map)) : null;
    if (bandMap) {
      bandMap.colorSpace = SRGBColorSpace;
      bandMap.anisotropy = anisotropy;
    }
    const bandMesh = new Mesh(bandGeometry, track(new MeshPhysicalMaterial({ ...spec.band, map: bandMap })));
    bandMesh.receiveShadow = true;
    group.add(bandMesh);

    fxUniforms.uKind.value = spec.fx.kind;
    fxUniforms.uHole.value.set(aw, ah);
    fxUniforms.uMargin.value = m;
    display(new Color(spec.fx.a), fxUniforms.uFxA.value);
    display(new Color(spec.fx.b), fxUniforms.uFxB.value);
    const glints = spec.glints({ width: bw, height: bh, margin: m }).slice(0, 5);
    glints.forEach(([x, y, phase], i) => fxUniforms.uGlints.value[i].set(x, y, phase));
    fxUniforms.uGlintCount.value = glints.length;
    const fx = new Mesh(
      track(panel(bw, bh, rb, { width: aw, height: ah, radius: ra })),
      track(new ShaderMaterial({ uniforms: fxUniforms, vertexShader: PLANE_VERTEX, fragmentShader: FX_FRAGMENT, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })),
    );
    fx.position.z = front + spec.relief + lip * 2 + 0.0004;
    group.add(fx);
  }

  const ornament = ORNAMENTS[frame]?.({ bw, bh, m, r: rb, s: Math.min(aw, ah), z: front + spec.relief + LIP * 2, floor: front }, track) ?? null;
  if (ornament) {
    ornament.traverse((part) => {
      part.castShadow = true;
      part.receiveShadow = true;
    });
    group.add(ornament);
    // Fit the camera to the ornaments too, so crests and wings stay on screen.
    const bounds = new Box3().setFromObject(ornament);
    cw = Math.max(cw, 2 * Math.max(-bounds.min.x, bounds.max.x));
    ch = Math.max(ch, 2 * Math.max(-bounds.min.y, bounds.max.y));
  }
  return { group, ornament, framed, front, ra, cw, ch };
}

/**
 * Renders frames (with their ornaments, art area left clear) under the viewer's studio light, for
 * scenes that show them flat. Sizes are relative to the art. Dispose once everything is baked.
 */
export function createFrameBaker(accent: Color, secondary: Color) {
  let renderer: WebGLRenderer | null = null;
  let environment: Texture | null = null;
  return {
    bake(frame: FrameLookId, aspect: number, resolution = 1024): { canvas: HTMLCanvasElement; width: number; height: number } | null {
      const spec = SPECS[frame];
      if (spec.margin <= 0) return null;
      if (!renderer) {
        renderer = new WebGLRenderer({ antialias: true, alpha: true });
        renderer.outputColorSpace = SRGBColorSpace;
        renderer.toneMapping = NeutralToneMapping;
        renderer.setClearColor(0x000000, 0);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = PCFShadowMap;
      }
      environment ??= studioEnvironment(renderer, accent, secondary, true);

      const disposables: { dispose: () => void }[] = [];
      const track: Track = (item) => {
        disposables.push(item);
        return item;
      };
      const ah = aspect >= 1 ? 1 / aspect : 1;
      const aw = ah * aspect;
      const fx = fxUniformsFor(sharedUniforms());
      const { group, cw, ch } = frameGroup(frame, aw, ah, fx, renderer.capabilities.getMaxAnisotropy(), track, true);

      const rig = LIGHTING.studio;
      const tintA = accent.clone();
      const tintB = secondary.clone();
      if (spec.light) {
        tintA.lerp(new Color(spec.light.a), spec.light.mix);
        tintB.lerp(new Color(spec.light.b), spec.light.mix);
      }
      const key = new DirectionalLight(0xfff6ec, rig.key);
      key.position.set(...rig.keyAt);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.0015;
      const reach = Math.hypot(cw, ch) * 0.6;
      Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 12 });
      key.shadow.camera.updateProjectionMatrix();
      const rimA = new DirectionalLight(tintA, rig.rimA);
      rimA.position.set(3.2, 0.6, -1.6);
      const rimB = new DirectionalLight(tintB, rig.rimB);
      rimB.position.set(-3.2, -0.8, -1.4);
      const scene = new Scene();
      scene.environment = environment;
      scene.add(key, rimA, rimB, new AmbientLight(0xffffff, rig.ambient), group);

      const camera = new OrthographicCamera(-cw / 2, cw / 2, ch / 2, -ch / 2, 0.1, 10);
      camera.position.set(0, 0, 4);
      const scale = resolution / Math.max(cw, ch);
      const width = Math.max(1, Math.round(cw * scale));
      const height = Math.max(1, Math.round(ch * scale));
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      renderer.render(scene, camera);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
      key.dispose();
      for (const item of disposables) item.dispose();
      return { canvas, width: cw / aw, height: ch / ah };
    },
    dispose() {
      environment?.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      environment = null;
      renderer = null;
    },
  };
}

/** A theme colour channel triple (e.g. `--accent-rgb: 165 124 255`) as a three.js colour. */
function cssColor(styles: CSSStyleDeclaration, name: string, fallback: string): Color {
  const parts = styles.getPropertyValue(name).trim().split(/[\s,]+/).map(Number);
  return parts.length >= 3 && parts.every((part) => Number.isFinite(part)) ? new Color().setRGB(parts[0] / 255, parts[1] / 255, parts[2] / 255, SRGBColorSpace) : new Color(fallback);
}

/** Writes a colour into a shader vector in display (sRGB) values, for overlays that add light on screen. */
function display(color: Color, target: Vector3) {
  const rgb = { r: 0, g: 0, b: 0 };
  color.getRGB(rgb, SRGBColorSpace);
  return target.set(rgb.r, rgb.g, rgb.b);
}

const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

/** An offset layered over the user's view for entrances and exits, so it never blocks input. */
type Pose = { x: number; y: number; z: number; yaw: number; pitch: number };
const REST: Pose = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
const POSE_KEYS = ["x", "y", "z", "yaw", "pitch"] as const;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;

type Callbacks = {
  zoom: (zoom: number) => void;
  ready: (src: string) => void;
  fail: (src: string) => void;
  manualRotate: () => void;
  inspect: (active: boolean) => void;
};

function createEngine(host: HTMLElement, cb: Callbacks) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  // Lighting follows the active theme; each frame then tints it (see FrameSpec.light).
  const styles = getComputedStyle(host);
  const accent = cssColor(styles, "--accent-rgb", "#a57cff");
  const secondary = cssColor(styles, "--rose-rgb", "#f472a8");
  const dark = styles.getPropertyValue("--theme-dark").trim() !== "0";
  const shadowAlpha = Number.parseFloat(styles.getPropertyValue("--shadow-alpha")) || 1;

  const scene = new Scene();
  const environment = studioEnvironment(renderer, accent, secondary, dark);
  // A colour-neutral studio for the neutral and soft rigs, built the first time it's needed.
  let neutralEnvironment: Texture | null = null;
  scene.environment = environment;

  const camera = new PerspectiveCamera(30, 1, 0.05, 60);
  const key = new DirectionalLight(0xfff6ec, 1.35);
  key.position.set(-2.2, 2.8, 4);
  // Only the key light casts shadows: ornaments onto the band, the art and each other.
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.0015;
  key.shadow.radius = 3;
  // Two rims from behind light the card's edges as they turn toward the viewer.
  const rimA = new DirectionalLight(accent, 2.2);
  rimA.position.set(3.2, 0.6, -1.6);
  const rimB = new DirectionalLight(secondary, 1.6);
  rimB.position.set(-3.2, -0.8, -1.4);
  const ambient = new AmbientLight(0xffffff, 0.2);
  scene.add(key, rimA, rimB, ambient);

  const quad = new PlaneGeometry(1, 1);
  const shadowTexture = radialTexture([
    [0, `rgba(0,0,0,${0.6 * shadowAlpha})`],
    [0.55, `rgba(0,0,0,${0.22 * shadowAlpha})`],
    [1, "rgba(0,0,0,0)"],
  ]);
  const glowTexture = radialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.4, "rgba(255,255,255,0.35)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false });
  const glowMaterial = new MeshBasicMaterial({ map: glowTexture, color: accent, transparent: true, depthWrite: false, toneMapped: false, blending: AdditiveBlending, opacity: dark ? 0.2 : 0.1 });
  const shadow = new Mesh(quad, shadowMaterial);
  const glow = new Mesh(quad, glowMaterial);
  scene.add(glow, shadow);

  const pivot = new Group();
  scene.add(pivot);

  const shared = sharedUniforms();
  const artUniforms = {
    ...shared,
    uMap: { value: null as Texture | null },
    uArt: { value: new Vector2(1, 1) },
    uSpot: { value: new Vector2() },
    uGloss: { value: 0.1 },
    uInset: { value: 0 },
    uTint: { value: new Vector3(1, 1, 1) },
  };
  const fxUniforms = fxUniformsFor(shared);

  const turn = { yaw: spring(), pitch: spring() };
  const hover = { yaw: spring(), pitch: spring() };
  const view = { zoom: spring(1), panX: spring(), panY: spring() };
  // Idle sway: a slow drift that fades in while nobody is touching the card (when the look asks for it).
  const idle = spring();
  let idleTime = 0;
  let look: ViewerLook = CLASSIC_VIEWER_LOOK;
  const state = {
    maxZoom: 3,
    motion: "full" as MotionLevel,
    width: 1,
    height: 1,
    cw: 1,
    ch: 1.5,
    animated: false,
    dirty: true,
    disposed: false,
    hovering: false,
    leaving: false,
    turnTime: FOLLOW.settle,
  };
  let pose: Pose = { ...REST };
  let tween: { from: Pose; to: Pose; start: number; duration: number; ease: (t: number) => number } | null = null;
  let sweep: { start: number; duration: number; strength: number } | null = null;
  // After a drag the mouse tilts relative to where it let go, so the card doesn't jump.
  let anchor: { x: number; y: number } | null = null;
  // The hover tilt folded into the turn when a press began (handed back if the press wasn't a drag).
  let folded = { yaw: 0, pitch: 0 };

  let card: { group: Group; dispose: () => void } | null = null;
  let image: HTMLImageElement | null = null;
  let src = "";
  let shown = "";
  let frame: FrameLookId = "none";
  let direction = 1;
  let loadToken = 0;
  let builds = 0;

  /** Lights, reflections and glow from the look, tinted by the frame. Cheap: nothing is rebuilt. */
  function applyLighting() {
    const spec = SPECS[frame];
    const rig = LIGHTING[look.lighting];
    const k = look.lightIntensity / 100;
    const tintA = accent.clone();
    const tintB = secondary.clone();
    if (spec.light) {
      tintA.lerp(new Color(spec.light.a), spec.light.mix);
      tintB.lerp(new Color(spec.light.b), spec.light.mix);
    }
    rimA.color.set(0xffffff).lerp(tintA, rig.tint);
    rimB.color.set(0xffffff).lerp(tintB, rig.tint);
    key.intensity = rig.key * k;
    key.position.set(...rig.keyAt);
    rimA.intensity = rig.rimA * k;
    rimB.intensity = rig.rimB * k;
    ambient.intensity = rig.ambient * k;
    if (rig.env === "neutral") neutralEnvironment ??= studioEnvironment(renderer, new Color(0xd9d9de), new Color(0xbfbfc4), dark);
    scene.environment = rig.env === "neutral" ? neutralEnvironment : environment;
    scene.environmentIntensity = look.reflections / 100;
    const glowLevel = look.glow / 100;
    glowMaterial.color.copy(tintA);
    glowMaterial.opacity = (dark ? 0.2 : 0.1) * glowLevel;
    glow.visible = glowLevel > 0;
    fxUniforms.uFxStrength.value = glowLevel;
    display(new Color(0xffffff).lerp(tintA, 0.35 * rig.tint), artUniforms.uTint.value);
    wake();
  }

  function build() {
    if (!image) return;
    card?.dispose();
    const disposables: { dispose: () => void }[] = [];
    const track = <T extends BufferGeometry | Material | Texture>(item: T): T => {
      disposables.push(item);
      return item;
    };

    const aspect = image.naturalWidth / image.naturalHeight || 2 / 3;
    const ah = aspect >= 1 ? 1 / aspect : 1;
    const aw = ah * aspect;
    // Theme light, tinted by the frame.
    applyLighting();
    const { group, ornament, framed, front, ra, cw, ch } = frameGroup(frame, aw, ah, fxUniforms, renderer.capabilities.getMaxAnisotropy(), track);
    state.cw = cw;
    state.ch = ch;
    state.animated = SPECS[frame].fx?.kind === FX.aurora;

    const texture = track(new Texture(image));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    artUniforms.uMap.value = texture;
    artUniforms.uArt.value.set(aw, ah);
    artUniforms.uInset.value = framed ? 0.16 : 0;
    const art = new Mesh(track(panel(aw, ah, ra)), track(new ShaderMaterial({ uniforms: artUniforms, vertexShader: PLANE_VERTEX, fragmentShader: ART_FRAGMENT, toneMapped: false })));
    art.position.z = front + 0.0006;
    group.add(art);
    if (ornament) {
      // The art is unlit, so ornament shadows land on a clear catcher just above it.
      const catcher = new Mesh(art.geometry, track(new ShadowMaterial({ opacity: 0.6 })));
      catcher.position.z = front + 0.001;
      catcher.receiveShadow = true;
      group.add(catcher);
    }
    const reach = Math.hypot(state.cw, state.ch) * 0.6;
    Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 12 });
    key.shadow.camera.updateProjectionMatrix();

    pivot.add(group);
    card = {
      group,
      dispose: () => {
        pivot.remove(group);
        for (const item of disposables) item.dispose();
      },
    };
    builds += 1;
    wake();
  }

  function animatePose(to: Pose, seconds: number, ease: (t: number) => number) {
    tween = { from: { ...pose }, to, start: performance.now(), duration: seconds * 1000, ease };
    wake();
  }

  /** The card glides in (from deeper in the scene on open, from the side when browsing), then a light sweep crosses it. */
  function entrance(kind: "open" | "next") {
    sweep = null;
    if (state.motion === "off") {
      pose = { ...REST };
      tween = null;
      return;
    }
    const subtle = state.motion === "subtle";
    const d = direction;
    const from: Pose =
      kind === "open"
        ? subtle
          ? { x: 0, y: 0, z: -0.3, yaw: -0.1, pitch: 0.04 }
          : { x: 0, y: -0.05, z: -1.1, yaw: -0.48, pitch: 0.18 }
        : subtle
          ? { x: d * 0.12, y: 0, z: -0.15, yaw: -d * 0.08, pitch: 0 }
          : { x: d * 0.45, y: 0, z: -0.5, yaw: -d * 0.42, pitch: 0.06 };
    const seconds = subtle ? 0.38 : kind === "open" ? 0.56 : 0.46;
    const now = performance.now();
    pose = { ...from };
    tween = { from, to: REST, start: now, duration: seconds * 1000, ease: easeOut };
    sweep = { start: now + seconds * 450, duration: subtle ? 380 : 440, strength: subtle ? 0.4 : 0.8 };
    wake();
  }

  function load(nextSrc: string) {
    const token = ++loadToken;
    src = nextSrc;
    // The current card steps aside while the next one loads.
    if (card && state.motion !== "off") animatePose({ x: -direction * 0.3, y: 0, z: -0.45, yaw: direction * 0.3, pitch: 0 }, 0.2, easeIn);
    const next = new Image();
    next.crossOrigin = "anonymous";
    next.decoding = "async";
    // Uploaded images redirect to storage; the CORS variant never reuses a cached non-CORS copy.
    next.src = isUploadedImagePath(nextSrc) ? `${nextSrc}?cors` : nextSrc;
    next
      .decode()
      .then(() => {
        if (token !== loadToken || state.disposed) return;
        if (!next.naturalWidth || !next.naturalHeight) throw new Error("Artwork has no size");
        // WebGL can only use artwork the image host shares with this page; a tainted image throws here.
        const probe = document.createElement("canvas").getContext("2d");
        probe?.drawImage(next, 0, 0, 1, 1);
        probe?.getImageData(0, 0, 1, 1);
        image = next;
        build();
        shown = nextSrc;
        entrance(builds === 1 ? "open" : "next");
        cb.ready(nextSrc);
      })
      .catch(() => {
        if (token === loadToken && !state.disposed) cb.fail(nextSrc);
      });
  }

  function fitDistance() {
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const compact = state.width < 640;
    const usableH = Math.max(0.42, 1 - (compact ? 190 : 230) / state.height);
    const usableW = Math.max(0.5, 1 - (compact ? 32 : 220) / state.width);
    return Math.max(state.ch / 2 / (t * usableH), state.cw / 2 / (t * camera.aspect * usableW)) * 1.05;
  }

  function panLimit(zoom: number) {
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const halfH = (t * fitDistance()) / zoom;
    const halfW = halfH * camera.aspect;
    return { x: Math.max(0, state.cw / 2 - halfW * 0.85), y: Math.max(0, state.ch / 2 - halfH * 0.85) };
  }

  function releaseHover() {
    state.hovering = false;
    hover.yaw.target = hover.pitch.target = 0;
    wake();
  }

  function setZoom(zoom: number, report = false) {
    const next = Math.round(Math.min(state.maxZoom, Math.max(1, zoom)) * 100) / 100;
    view.zoom.target = next;
    const limit = panLimit(next);
    view.panX.target = clamp(view.panX.target, limit.x);
    view.panY.target = clamp(view.panY.target, limit.y);
    // Zoomed in, the card holds still for close inspection.
    if (next > 1.01) releaseHover();
    wake();
    if (report) cb.zoom(next);
  }

  function resize() {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    state.width = width;
    state.height = height;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    wake();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  /** The pointer's offset from the card's centre, in card half-sizes, eased so it saturates gently. */
  function pointerOffset(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const distance = fitDistance();
    const halfY = (state.ch / 2 / (t * distance)) * (rect.height / 2);
    const halfX = (state.cw / 2 / (t * distance * camera.aspect)) * (rect.width / 2);
    const soft = (n: number) => clamp(Math.tanh(n * 1.2) / Math.tanh(1.2), 1);
    return { x: soft((clientX - rect.left - rect.width / 2) / (halfX * 1.1)), y: soft((clientY - rect.top - rect.height / 2) / (halfY * 1.1)) };
  }

  function hoverAt(clientX: number, clientY: number) {
    const yawRange = ((look.hoverTilt * Math.PI) / 180) * HOVER_SCALE[state.motion];
    if (!yawRange || pointers.size || view.zoom.target > 1.01 || state.leaving) return;
    const at = pointerOffset(clientX, clientY);
    hover.yaw.target = clamp(at.x - (anchor?.x ?? 0), 1) * yawRange;
    hover.pitch.target = clamp(at.y - (anchor?.y ?? 0), 1) * yawRange * 0.73;
    state.hovering = true;
    wake();
  }

  // Pointer input: drag turns the card (or moves it when zoomed), two fingers pinch, the mouse tilts it.
  // Only the canvas listens, so the viewer's controls (layered above it) never tilt the card.
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { mode: "turn" | "pan"; x: number; y: number; yaw: number; pitch: number; panX: number; panY: number } | null = null;
  let pinch: { distance: number; zoom: number } | null = null;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const startDrag = (x: number, y: number) => {
    drag = { mode: view.zoom.target > 1.01 ? "pan" : "turn", x, y, yaw: turn.yaw.target, pitch: turn.pitch.target, panX: view.panX.target, panY: view.panY.target };
    state.turnTime = FOLLOW.drag;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      cb.inspect(true);
      // Fold the hover tilt into the turn, so grabbing the card never makes it jump.
      folded = { yaw: hover.yaw.value, pitch: hover.pitch.value };
      for (const axis of ["yaw", "pitch"] as const) {
        turn[axis].value += hover[axis].value;
        turn[axis].velocity += hover[axis].velocity;
        turn[axis].target = clamp(turn[axis].target + hover[axis].value, axis === "yaw" ? MAX_YAW : MAX_PITCH);
        hover[axis].value = hover[axis].target = hover[axis].velocity = 0;
      }
      state.hovering = false;
      anchor = null;
    }
    if (pointers.size === 2) {
      drag = null;
      pinch = { distance: spread(), zoom: view.zoom.target };
    } else if (pointers.size === 1) startDrag(event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType !== "touch" && event.buttons === 0) hoverAt(event.clientX, event.clientY);
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch) {
      if (pinch.distance > 0) setZoom(pinch.zoom * (spread() / pinch.distance), true);
      return;
    }
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (drag.mode === "turn") {
      turn.yaw.target = clamp(drag.yaw + dx * DRAG_SPEED, MAX_YAW);
      turn.pitch.target = clamp(drag.pitch + dy * DRAG_SPEED, MAX_PITCH);
    } else {
      const perPixel = (2 * Math.tan((camera.fov * Math.PI) / 360) * fitDistance()) / view.zoom.target / state.height;
      const limit = panLimit(view.zoom.target);
      view.panX.target = clamp(drag.panX - dx * perPixel, limit.x);
      view.panY.target = clamp(drag.panY + dy * perPixel, limit.y);
    }
    wake();
  };
  const onPointerUp = (event: PointerEvent) => {
    const turned = drag?.mode === "turn" && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 6 && (turn.yaw.target !== drag.yaw || turn.pitch.target !== drag.pitch);
    if (turned) cb.manualRotate();
    if (!pointers.delete(event.pointerId)) return;
    pinch = null;
    const [remaining] = [...pointers.values()];
    if (remaining) {
      startDrag(remaining.x, remaining.y);
      return;
    }
    drag = null;
    state.turnTime = FOLLOW.settle;
    if (event.pointerType !== "touch" && event.type === "pointerup") {
      if (turned) anchor = pointerOffset(event.clientX, event.clientY);
      else {
        // A click, not a drag: hand the folded tilt back to hover so it still eases away on leave.
        for (const axis of ["yaw", "pitch"] as const) {
          turn[axis].target -= folded[axis];
          turn[axis].value -= folded[axis];
          hover[axis].value += folded[axis];
        }
        hoverAt(event.clientX, event.clientY);
      }
    }
    folded = { yaw: 0, pitch: 0 };
    cb.inspect(false);
  };
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === "touch" || pointers.has(event.pointerId)) return;
    anchor = null;
    releaseHover();
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    setZoom(view.zoom.target * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), true);
  };
  const onDoubleClick = () => {
    if (view.zoom.target > 1) {
      view.panX.target = view.panY.target = 0;
      setZoom(1, true);
    } else setZoom(2, true);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    if (!state.disposed) cb.fail(src);
  };
  const onVisibility = () => {
    if (!document.hidden) wake();
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("webglcontextlost", onContextLost);
  document.addEventListener("visibilitychange", onVisibility);

  // Frames are only drawn while something changes; the loop sleeps when the card is still or the tab is hidden.
  let raf = 0;
  let last = 0;
  function wake() {
    state.dirty = true;
    if (raf || state.disposed || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  const softbox = new Vector3();
  const inverse = new Quaternion();
  function render() {
    const sway = idle.value;
    const yaw = clamp(turn.yaw.value + hover.yaw.value, MAX_YAW + 0.1) + pose.yaw + Math.sin(idleTime * 0.55) * 0.14 * sway;
    const pitch = clamp(turn.pitch.value + hover.pitch.value, MAX_PITCH + 0.1) + pose.pitch + Math.sin(idleTime * 0.4 + 1) * 0.05 * sway;
    pivot.position.set(pose.x, pose.y, pose.z);
    pivot.rotation.set(pitch, yaw, 0);

    const tx = clamp(yaw / MAX_YAW, 1);
    const ty = clamp(pitch / MAX_PITCH, 1);
    shared.uTilt.value.set(tx, ty);
    shared.uLight.value = 0.5 - tx * 0.7 + ty * 0.5;
    artUniforms.uGloss.value = (0.1 + 0.08 * Math.min(1, Math.hypot(tx, ty))) * (look.reflections / 100);
    softbox.copy(SOFTBOX).applyQuaternion(inverse.copy(pivot.quaternion).invert());
    const z = Math.max(0.05, softbox.z);
    artUniforms.uSpot.value.set((softbox.x / z) * 1.1, (softbox.y / z) * 1.1);
    fxUniforms.uGlintStrength.value = state.motion === "off" ? 0.5 : 1;

    // A soft shadow that shifts as the card leans, and a faint glow in the frame's light behind it.
    shadow.position.set(pose.x + state.cw * 0.05 + Math.sin(yaw) * 0.12, pose.y - state.ch * 0.06 - Math.sin(pitch) * 0.1, pose.z - 0.55);
    shadow.scale.set(state.cw * 1.32 * (0.82 + 0.18 * Math.cos(yaw)), state.ch * 1.22 * (0.82 + 0.18 * Math.cos(pitch)), 1);
    glow.position.set(pose.x - Math.sin(yaw) * 0.08, pose.y + Math.sin(pitch) * 0.06, pose.z - 0.6);
    glow.scale.set(state.cw * 2.3, state.ch * 1.9, 1);

    camera.position.set(view.panX.value, view.panY.value, fitDistance() / view.zoom.value);
    renderer.render(scene, camera);
  }

  function tick(now: number) {
    raf = 0;
    if (state.disposed || document.hidden) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;
    const instant = state.motion === "off";
    let active = false;
    const step = (s: Spring, time: number) => {
      if (s.value === s.target && s.velocity === 0) return;
      if (instant || (Math.abs(s.value - s.target) < 1e-4 && Math.abs(s.velocity) < 1e-3)) {
        s.value = s.target;
        s.velocity = 0;
        return;
      }
      follow(s, time, dt);
      active = true;
    };
    step(turn.yaw, state.turnTime);
    step(turn.pitch, state.turnTime);
    const hoverFollow = 0.35 * 0.1 ** (look.hoverSpeed / 100) * (state.motion === "subtle" ? 1.43 : 1);
    const hoverTime = state.hovering ? hoverFollow : FOLLOW.release;
    step(hover.yaw, hoverTime);
    step(hover.pitch, hoverTime);
    step(view.zoom, FOLLOW.view);
    step(view.panX, FOLLOW.view);
    step(view.panY, FOLLOW.view);

    const swaying = look.idleMotion && !instant && card !== null && !state.hovering && !pointers.size && view.zoom.target <= 1.01 && !state.leaving;
    idle.target = swaying ? (state.motion === "subtle" ? 0.5 : 1) : 0;
    step(idle, swaying ? 1.1 : 0.2);
    if (swaying || idle.value !== 0) {
      idleTime += dt;
      active = true;
    }

    if (tween) {
      const t = Math.min(1, Math.max(0, (now - tween.start) / tween.duration));
      const eased = tween.ease(t);
      for (const axis of POSE_KEYS) pose[axis] = tween.from[axis] + (tween.to[axis] - tween.from[axis]) * eased;
      if (t >= 1) tween = null;
      active = true;
    }
    shared.uSweepStrength.value = 0;
    if (sweep) {
      const t = (now - sweep.start) / sweep.duration;
      if (t >= 1) sweep = null;
      else if (t >= 0) {
        shared.uSweep.value = t;
        shared.uSweepStrength.value = sweep.strength * Math.sin(Math.PI * t) * Math.min(1.5, look.glow / 100);
      }
      active = true;
    }
    if (state.animated && !instant) {
      fxUniforms.uTime.value += dt * (state.motion === "subtle" ? 0.5 : 1);
      active = true;
    }

    if (active || state.dirty) render();
    state.dirty = false;
    if (active) raf = requestAnimationFrame(tick);
  }

  resize();

  return {
    setArtwork(nextSrc: string, nextFrame: FrameLookId, nextDirection: number) {
      direction = nextDirection < 0 ? -1 : 1;
      const frameChanged = nextFrame !== frame;
      frame = nextFrame;
      if (nextSrc !== src) load(nextSrc);
      else if (frameChanged && image) build();
    },
    setZoom: (zoom: number) => setZoom(zoom),
    setMaxZoom(max: number) {
      state.maxZoom = max;
    },
    /** Live look changes: only lights and uniforms update, the card is never rebuilt. */
    setLook(next: ViewerLook) {
      look = next;
      applyLighting();
    },
    setMotion(motion: MotionLevel) {
      state.motion = motion;
      if (motion === "off") {
        releaseHover();
        tween = null;
        sweep = null;
        pose = { ...REST };
      }
      wake();
    },
    reset() {
      turn.yaw.target = turn.pitch.target = view.panX.target = view.panY.target = 0;
      view.zoom.target = 1;
      state.turnTime = FOLLOW.settle;
      anchor = null;
      releaseHover();
      // A quick sweep acknowledges the reset (not while the next artwork is on its way).
      if (state.motion !== "off" && card && shown === src) sweep = { start: performance.now(), duration: 360, strength: 0.5 };
    },
    leave() {
      state.leaving = true;
      releaseHover();
      if (state.motion !== "off") animatePose({ x: 0, y: -0.03, z: -0.8, yaw: 0.2, pitch: 0.08 }, 0.2, easeIn);
    },
    dispose() {
      state.disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", onDoubleClick);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      document.removeEventListener("visibilitychange", onVisibility);
      card?.dispose();
      quad.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      glowMaterial.dispose();
      glowTexture.dispose();
      environment.dispose();
      neutralEnvironment?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

type Engine = ReturnType<typeof createEngine>;

/** The artwork as a physical card in a Three.js scene. Loaded lazily by the artwork viewer. */
export default function ArtworkCard3D({
  src,
  frame,
  direction,
  zoom,
  maxZoom,
  resetKey,
  motion,
  look,
  leaving,
  onZoom,
  onManualRotate,
  onInspect,
  onReady,
  onFail,
}: {
  src: string;
  frame: FrameLookId;
  /** Which way the visitor browsed (1 = next, -1 = previous), so cards arrive from that side. */
  direction: number;
  zoom: number;
  maxZoom: number;
  resetKey: number;
  motion: MotionLevel;
  /** Lighting, reflections, glow and motion (never the frame or the artwork). */
  look: ViewerLook;
  /** The viewer is closing: the card recedes. */
  leaving: boolean;
  onZoom: (zoom: number) => void;
  onManualRotate: () => void;
  onInspect: (active: boolean) => void;
  onReady: (src: string) => void;
  onFail: (src: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const reportZoom = useEffectEvent((next: number) => onZoom(next));
  const reportManualRotate = useEffectEvent(() => onManualRotate());
  const reportInspect = useEffectEvent((active: boolean) => onInspect(active));
  const reportReady = useEffectEvent((loaded: string) => onReady(loaded));
  const reportFail = useEffectEvent((failed: string) => onFail(failed));
  const initial = useEffectEvent(() => ({ src, frame, direction, motion, maxZoom, look }));
  const showArtwork = useEffectEvent(() => engineRef.current?.setArtwork(src, frame, direction));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start = initial();
    let engine: Engine;
    try {
      engine = createEngine(host, { zoom: reportZoom, ready: reportReady, fail: reportFail, manualRotate: reportManualRotate, inspect: reportInspect });
    } catch {
      reportFail(start.src);
      return;
    }
    engine.setMotion(start.motion);
    engine.setMaxZoom(start.maxZoom);
    engine.setLook(start.look);
    engine.setArtwork(start.src, start.frame, start.direction);
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => showArtwork(), [src, frame]);
  useEffect(() => engineRef.current?.setMotion(motion), [motion]);
  useEffect(() => engineRef.current?.setLook(look), [look]);
  useEffect(() => engineRef.current?.setMaxZoom(maxZoom), [maxZoom]);
  useEffect(() => engineRef.current?.setZoom(zoom), [zoom]);
  useEffect(() => {
    if (resetKey) engineRef.current?.reset();
  }, [resetKey]);
  useEffect(() => {
    if (leaving) engineRef.current?.leave();
  }, [leaving]);

  return <div ref={hostRef} className="absolute inset-0 cursor-grab select-none active:cursor-grabbing" />;
}
