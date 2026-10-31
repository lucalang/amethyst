import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DynamicDrawUsage,
  EdgesGeometry,
  Float32BufferAttribute,
  FogExp2,
  Group,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  OctahedronGeometry,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Shape,
  Sprite,
  SpriteMaterial,
  type Texture,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CSS3DObject, CSS3DRenderer } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { radialTexture, studioEnvironment } from "@/components/showcase/three-kit";
import type { SanctumSound } from "@/components/vault/vault-audio";
import { TAU, band, chamfer, clamp01, easeIn, easeInOut, easeOut, hash, heartbeat, lathe, lerp, paint, plate, runeStrip, sigil, smoke, span, wobble } from "@/components/vault/vault-forge";
import { decodeText } from "./admin-decode";
import { HUD_HEIGHT, SLOT_ORDER, STATIONS, layoutSize, stationSlots, type PanelKind, type PanelSpec, type StationId } from "./admin-layout";
import {
  ARC_FRAGMENT,
  ARC_VERTEX,
  BAR_FRAGMENT,
  BAR_VERTEX,
  BURST_VERTEX,
  CROWN_FRAGMENT,
  CROWN_VERTEX,
  DUST_FRAGMENT,
  DUST_VERTEX,
  FINISH_SHADER,
  FLOOR_FRAGMENT,
  FLOOR_VERTEX,
  GLASS_FRAGMENT,
  RUNE_FRAGMENT,
  SHADOW_FRAGMENT,
  SHADOW_VERTEX,
  SHARD_VERTEX,
  SIGIL_FRAGMENT,
  SMOKE_FRAGMENT,
  UV_VERTEX,
  WAVE_FRAGMENT,
} from "./admin-shaders";
import { FLIGHT, INTRO, PUBLISH, type IntroKind } from "./admin-timing";

/**
 * The Crimson Sanctum: one WebGL scene (the vault core, chamber, particles and the bodies of every panel)
 * and one CSS3D layer (the panels' real DOM) rendered with the same camera, so the DOM sits inside the scene.
 * Panels are placed in CSS px on "stations" around the core; the camera flies between them.
 */

type Motion = "off" | "subtle" | "full";

export type SanctumHooks = {
  sound: (name: SanctumSound) => void;
  /** WebGL broke (context lost): the dashboard switches to its 2D layout. */
  fail: () => void;
  introDone: () => void;
  arrived: (station: StationId) => void;
};

export type TokenShape = "coins" | "card" | "medallion";
/** A reward shown as a physical token orbiting the core; `face` is DOM shown on the token (card art, badge). */
export type TokenSpec = { key: string; shape: TokenShape; face: HTMLElement | null };
export type PublishPhase = "idle" | "implode" | "success" | "error";

export type SanctumOptions = {
  viewport: HTMLElement;
  scroller: HTMLElement;
  spacer: HTMLElement;
  station: StationId;
  motion: Motion;
  hooks: SanctumHooks;
};

export type Sanctum = {
  ready: Promise<void>;
  addPanel: (el: HTMLElement, spec: PanelSpec) => void;
  updatePanel: (el: HTMLElement, spec: PanelSpec) => void;
  removePanel: (el: HTMLElement) => void;
  setStation: (station: StationId) => void;
  setMotion: (motion: Motion) => void;
  start: (intro: IntroKind | null) => void;
  skipIntro: () => void;
  setTimeline: (values: number[], hover: number) => void;
  setTokens: (tokens: TokenSpec[]) => void;
  setCharge: (level: number) => void;
  publish: (phase: PublishPhase) => void;
  alert: (el: HTMLElement) => void;
  dispose: () => void;
};

/* ----------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------- */

const FOV = 38;
/** Camera distance to a station's panels: panels in a group scaled by DIST / focal render 1:1 in CSS px. */
const DIST = 9;
const STATION_RADIUS = 7;
const CAMERA_RADIUS = STATION_RADIUS + DIST;
const FLOOR_Y = -4.6;
const STATION_ANGLE: Record<StationId, number> = { overview: 0, codes: -0.95, detail: -1.9, forge: 0.95 };

const hex = (value: number) => new Color(value);
const RED = hex(0xff1f3d);
const DEEP = hex(0x9e0a1e);
const PALE = hex(0xffd9df);

/** Glass looks per code status (index used by the glass shader) and the tone of its light. */
const STATUS_LOOK: Record<string, { index: number; tone: Color }> = {
  active: { index: 0, tone: hex(0xff1f3d) },
  scheduled: { index: 1, tone: hex(0xc2410c).multiplyScalar(0.8) },
  expired: { index: 2, tone: hex(0x8c7f82).multiplyScalar(0.5) },
  "used-up": { index: 3, tone: hex(0xd0102e) },
  disabled: { index: 4, tone: hex(0x5a1a24) },
};

const KIND: Record<PanelKind, { cut: number; tilt: number; lift: number; body: number; shadow: boolean; hover: boolean }> = {
  panel: { cut: 18, tilt: 0.07, lift: 10, body: 0, shadow: false, hover: false },
  timeline: { cut: 18, tilt: 0.07, lift: 10, body: 0, shadow: false, hover: false },
  plate: { cut: 22, tilt: 0.09, lift: 16, body: 20, shadow: true, hover: false },
  counter: { cut: 14, tilt: 0.19, lift: 24, body: 36, shadow: true, hover: true },
  tablet: { cut: 12, tilt: 0.19, lift: 36, body: 14, shadow: true, hover: true },
};

type Tier = { dpr: number; bloom: number; dust: number; reflect: number; rays: number };
const TIERS: Tier[] = [
  { dpr: 1.75, bloom: 1, dust: 7000, reflect: 0.5, rays: 32 },
  { dpr: 1.35, bloom: 0.75, dust: 3600, reflect: 0.33, rays: 16 },
  { dpr: 1, bloom: 0.5, dust: 1400, reflect: 0, rays: 0 },
];
const MAX_DUST = 7000;
const BURST = 1500;

function initialTier(width: number) {
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (memory <= 2 || cores <= 2) return 2;
  if (width < 760 || cores <= 4 || memory <= 4) return 1;
  return 0;
}

/* ----------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */

type Spring = { x: number; v: number };
const spring = (): Spring => ({ x: 0, v: 0 });
/** An under-damped spring (a little overshoot), stepped in small slices for stability. */
function springTo(s: Spring, target: number, dt: number, k = 170, c = 15) {
  const steps = Math.max(1, Math.ceil(dt / 0.012));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.v += (k * (target - s.x) - c * s.v) * h;
    s.x += s.v * h;
  }
}
const settle = (s: Spring, value = 0) => {
  s.x = value;
  s.v = 0;
};
const damp = (x: number, target: number, rate: number, dt: number) => x + (target - x) * (1 - Math.exp(-rate * dt));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Panel bodies: a jittered unit grid split into triangles, each with its own centroid and random seed. */
function shardGeometry(nx: number, ny: number) {
  const grid: [number, number][][] = [];
  for (let j = 0; j <= ny; j++) {
    grid.push([]);
    for (let i = 0; i <= nx; i++) {
      const inner = i > 0 && i < nx && j > 0 && j < ny;
      grid[j].push([
        i / nx + (inner ? ((hash(i * 7.1 + j * 3.3) - 0.5) * 0.7) / nx : 0),
        j / ny + (inner ? ((hash(i * 1.7 + j * 9.1 + 4) - 0.5) * 0.7) / ny : 0),
      ]);
    }
  }
  const position: number[] = [];
  const center: number[] = [];
  const rand: number[] = [];
  const bary: number[] = [];
  const tri = (a: [number, number], b: [number, number], c: [number, number], salt: number) => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const r = [hash(salt), hash(salt + 0.37), hash(salt + 0.71)];
    [a, b, c].forEach((p, k) => {
      position.push(p[0], p[1], 0);
      center.push(cx, cy, 0);
      rand.push(r[0], r[1], r[2]);
      bary.push(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0);
    });
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const salt = (j * nx + i) * 2.13 + 0.5;
      const [a, b, c, d] = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      if (hash(salt) > 0.5) {
        tri(a, b, c, salt);
        tri(a, c, d, salt + 11.3);
      } else {
        tri(a, b, d, salt);
        tri(b, c, d, salt + 11.3);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("aCenter", new Float32BufferAttribute(center, 3));
  geometry.setAttribute("aRand", new Float32BufferAttribute(rand, 3));
  geometry.setAttribute("aBary", new Float32BufferAttribute(bary, 3));
  return geometry;
}

/** Ray quads fanning out of the core (uv.x across a ray, uv.y along it). */
function crownGeometry(count: number, inner: number, outer: number) {
  const position: number[] = [];
  const uv: number[] = [];
  const ray: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + hash(i) * 0.2;
    const length = outer * (0.55 + hash(i + 3.3) * 0.45);
    const width = 0.18 + hash(i + 7.7) * 0.3;
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const b = position.length / 3;
    const px = dy * width;
    const py = -dx * width;
    position.push(dx * inner - px * 0.3, dy * inner - py * 0.3, 0, dx * inner + px * 0.3, dy * inner + py * 0.3, 0);
    position.push(dx * length + px, dy * length + py, 0, dx * length - px, dy * length - py, 0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    ray.push(i / count, i / count, i / count, i / count);
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aRay", new Float32BufferAttribute(ray, 1));
  geometry.setIndex(index);
  return geometry;
}

/** Sum of offsets up to `root` (layout boxes, unaffected by the 3D transforms). */
function offsetWithin(el: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const isTextField = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range"].includes(el.type)) || (el as HTMLElement).isContentEditable);

/* ----------------------------------------------------------------------------
 * The scene
 * ------------------------------------------------------------------------- */

type Pose = { theta: number; radius: number; height: number; look: number; lookHeight: number; fov: number; roll: number };
type Anim = { from: number; to: number; start: number; duration: number };
type GlassUniforms = ReturnType<typeof glassUniforms>;
type Entry = {
  el: HTMLElement;
  spec: PanelSpec;
  key: number;
  root: Group;
  css: CSS3DObject;
  glass: Mesh<BufferGeometry, ShaderMaterial>;
  slab: Mesh<BufferGeometry, ShaderMaterial> | null;
  body: Mesh<BufferGeometry, MeshStandardMaterial> | null;
  shadow: Mesh<PlaneGeometry, ShaderMaterial> | null;
  u: GlassUniforms;
  bodySize: string;
  w: number;
  h: number;
  width: number;
  maxHeight: number | null;
  target: { x: number; y: number; z: number; ry: number; rx: number };
  pose: { x: number; y: number; z: number; ry: number; rx: number };
  placed: boolean;
  tiltX: Spring;
  tiltY: Spring;
  lift: Spring;
  press: Spring;
  hover: number;
  hoverTarget: number;
  pressTarget: number;
  focus: number;
  focusTarget: number;
  alert: number;
  reveal: number;
  shown: number;
  anim: Anim | null;
  decoded: boolean;
  stopDecode: (() => void) | null;
  removing: number | null;
  chart: { x: number; y: number; w: number; h: number } | null;
  bars: InstancedMesh<BufferGeometry, ShaderMaterial> | null;
};

function glassUniforms(time: { value: number }, tone: Color, status: number, cut: number) {
  return {
    uSize: { value: new Vector2(1, 1) },
    uCut: { value: cut },
    uTime: time,
    uHover: { value: 0 },
    uPointer: { value: new Vector2(0.5, 0.5) },
    uPress: { value: 0 },
    uRipple: { value: new Vector4(0.5, 0.5, -10, 0) },
    uTone: { value: tone.clone() },
    uStatus: { value: status },
    uPulse: { value: 0 },
    uFocus: { value: 0 },
    uAlert: { value: 0 },
    uAlpha: { value: 1 },
    uAssemble: { value: 0 },
    uOrigin: { value: new Vector2(0.5, 0.5) },
  };
}

type Token = {
  spec: TokenSpec;
  group: Group;
  face: CSS3DObject | null;
  born: number;
  arrived: boolean;
  leaving: number | null;
  from: Vector3;
  pos: Vector3;
  leaveFrom: Vector3;
  leaveDir: Vector3;
  seed: number;
};

export function createSanctum(options: SanctumOptions): Sanctum {
  const { viewport, scroller, spacer, hooks } = options;
  let motion = options.motion;
  let station = options.station;
  let W = Math.max(1, viewport.clientWidth);
  let H = Math.max(1, viewport.clientHeight);
  let tierIndex = initialTier(W);
  let tier = TIERS[tierIndex];
  let disposed = false;

  /* Renderers ---------------------------------------------------------------- */

  const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x030203, 1);
  renderer.domElement.className = "cs-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  viewport.append(renderer.domElement);

  const css = new CSS3DRenderer();
  css.domElement.className = "cs-layer";
  css.domElement.style.overflow = "clip";
  viewport.append(css.domElement);
  const cameraElement = css.domElement.firstElementChild!.firstElementChild as HTMLElement;

  const scene = new Scene();
  scene.fog = new FogExp2(0x0b0205, 0.03);
  const environment = studioEnvironment(renderer, RED, DEEP, true, 0.4);
  scene.environment = environment;
  const camera = new PerspectiveCamera(FOV, W / H, 0.1, 140);
  camera.layers.enable(1);

  const time = { value: 0 };
  const owned: { dispose: () => void }[] = [environment];
  const keep = <T extends { dispose: () => void }>(item: T) => {
    owned.push(item);
    return item;
  };
  const additive = (uniforms: Record<string, { value: unknown }>, fragmentShader: string, vertexShader = UV_VERTEX) =>
    keep(new ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: AdditiveBlending }));

  scene.add(new AmbientLight(0x3a0d16, 0.6));
  const key = new DirectionalLight(0xffd0d8, 0.7);
  key.position.set(3, 8, 10);
  scene.add(key);

  /* The core: rings, sigil, crown, heart ------------------------------------- */

  const core = new Group();
  scene.add(core);
  const spinner = new Group();
  core.add(spinner);

  const metal = keep(new MeshStandardMaterial({ color: 0x1d0d11, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.3, emissive: hex(0x3a0510), emissiveIntensity: 0.5 }));
  const ringMain = new Mesh(
    keep(lathe([[3.86, 0.2], [4.02, 0.32], [4.46, 0.32], [4.62, 0.2], [4.62, -0.2], [4.46, -0.32], [4.02, -0.32], [3.86, -0.2], [3.86, 0.2]], 192)),
    metal,
  );
  spinner.add(ringMain);

  const runesA = keep(paint(2048, 96, (ctx) => runeStrip(ctx, 48, 3)));
  const runesB = keep(paint(2048, 96, (ctx) => runeStrip(ctx, 40, 9)));
  runesA.wrapS = runesB.wrapS = RepeatWrapping;
  const runeUniforms = (map: Texture, speed: number) => ({ uMap: { value: map }, uTime: time, uLevel: { value: 0 }, uSpeed: { value: speed }, uColor: { value: RED.clone().multiplyScalar(1.6) } });
  const runeFront = runeUniforms(runesA, 0.004);
  const runeBack = runeUniforms(runesA, -0.003);
  const runeInner = runeUniforms(runesB, -0.006);
  const bandA = keep(band(4.04, 4.44, 256, 3));
  const front = new Mesh(bandA, additive(runeFront, RUNE_FRAGMENT));
  front.position.z = 0.33;
  const back = new Mesh(bandA, additive(runeBack, RUNE_FRAGMENT));
  back.position.z = -0.33;
  back.rotation.y = Math.PI;
  ringMain.add(front, back);

  const gimbalB = new Group();
  const gimbalC = new Group();
  spinner.add(gimbalB);
  gimbalB.add(gimbalC);
  const ringB = new Mesh(keep(lathe([[3.36, 0.09], [3.64, 0.09], [3.64, -0.09], [3.36, -0.09], [3.36, 0.09]], 160)), metal);
  const bandB = new Mesh(keep(band(3.38, 3.62, 200, 2)), additive(runeInner, RUNE_FRAGMENT));
  bandB.position.z = 0.1;
  ringB.add(bandB);
  gimbalB.add(ringB);
  const ringC = new Mesh(keep(lathe([[2.78, 0.06], [2.92, 0.06], [2.92, -0.06], [2.78, -0.06], [2.78, 0.06]], 128)), metal);
  gimbalC.add(ringC);
  gimbalB.rotation.x = 0.5;
  gimbalC.rotation.y = 0.8;

  const sigilMap = keep(paint(1024, 1024, sigil));
  const sigilU = { uMap: { value: sigilMap }, uTrace: { value: 0 }, uGlow: { value: 0 }, uTime: time, uColor: { value: RED.clone().multiplyScalar(1.4) } };
  const sigilDisk = new Mesh(keep(new PlaneGeometry(11.2, 11.2)), additive(sigilU, SIGIL_FRAGMENT));
  sigilDisk.position.z = -0.05;
  core.add(sigilDisk);

  const crownU = { uTime: time, uLevel: { value: 0 }, uColor: { value: RED.clone().multiplyScalar(0.9) } };
  const crown = new Mesh(keep(crownGeometry(28, 0.35, 9)), additive(crownU, CROWN_FRAGMENT, CROWN_VERTEX));
  crown.position.z = -0.4;
  core.add(crown);

  const glowMap = keep(radialTexture([[0, "rgba(255,240,242,1)"], [0.14, "rgba(255,90,112,0.85)"], [0.42, "rgba(158,10,30,0.3)"], [1, "rgba(0,0,0,0)"]]));
  const sprite = (scale: number, color: Color) => {
    const material = keep(new SpriteMaterial({ map: glowMap, color, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    const item = new Sprite(material);
    item.scale.setScalar(scale);
    core.add(item);
    return item;
  };
  const halo = sprite(9, RED.clone().multiplyScalar(0.5));
  const heart = sprite(1.8, PALE.clone().multiplyScalar(2));
  const crystalGeometry = keep(new EdgesGeometry(keep(new OctahedronGeometry(0.5))));
  const crystalMaterial = keep(new LineBasicMaterial({ color: RED.clone().multiplyScalar(2.5), transparent: true, blending: AdditiveBlending, depthWrite: false }));
  const crystal = new LineSegments(crystalGeometry, crystalMaterial);
  core.add(crystal);
  const coreLight = new PointLight(RED, 0, 30, 1.6);
  core.add(coreLight);

  /* Chamber: smoke, floor, dust ---------------------------------------------- */

  const smokeMap = keep(paint(128, 128, smoke));
  smokeMap.wrapS = smokeMap.wrapT = RepeatWrapping;
  const smokeLevel = { value: 0 };
  const smokes: Mesh[] = [];
  const smokePlane = keep(new PlaneGeometry(22, 13));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4;
    const u = { uMap: { value: smokeMap }, uTime: time, uLevel: smokeLevel, uColor: { value: DEEP.clone().multiplyScalar(0.55) }, uDrift: { value: new Vector2(0.004 + hash(i) * 0.006, 0.002 + hash(i + 2) * 0.004) } };
    const mesh = new Mesh(smokePlane, additive(u, SMOKE_FRAGMENT));
    mesh.position.set(Math.sin(a) * (6 + hash(i + 5) * 6), -2.6 + hash(i + 9) * 3, Math.cos(a) * (6 + hash(i + 5) * 6) - 3);
    mesh.layers.set(1);
    scene.add(mesh);
    smokes.push(mesh);
  }

  const pools = STATIONS.map((id) => new Vector4(Math.sin(STATION_ANGLE[id]) * STATION_RADIUS, Math.cos(STATION_ANGLE[id]) * STATION_RADIUS, 9, 0.4));
  const floorShader = () => ({
    color: { value: hex(0x4a3e42) },
    tDiffuse: { value: null },
    textureMatrix: { value: new Matrix4() },
    uSigil: { value: sigilMap },
    uTime: time,
    uLevel: { value: 0 },
    uCharge: { value: 0 },
    uRed: { value: RED.clone() },
    uPools: { value: pools },
  });
  const floorGeometry = keep(new PlaneGeometry(90, 90));
  const plainFloorU = floorShader();
  const plainFloor = new Mesh(floorGeometry, keep(new ShaderMaterial({ uniforms: plainFloorU, vertexShader: FLOOR_VERTEX, fragmentShader: FLOOR_FRAGMENT })));
  plainFloor.rotation.x = -Math.PI / 2;
  plainFloor.position.y = FLOOR_Y;
  scene.add(plainFloor);
  let mirror: Reflector | null = null;
  let mirrorU: Record<string, { value: unknown }> | null = null;
  if (tier.reflect > 0) {
    mirror = new Reflector(floorGeometry, {
      color: hex(0x4a3e42),
      textureWidth: Math.round(W * tier.dpr * tier.reflect),
      textureHeight: Math.round(H * tier.dpr * tier.reflect),
      clipBias: 0.003,
      multisample: tierIndex === 0 ? 4 : 0,
      shader: { name: "SanctumFloor", uniforms: floorShader(), vertexShader: FLOOR_VERTEX, fragmentShader: `#define REFLECT\n${FLOOR_FRAGMENT}` },
    });
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.y = FLOOR_Y;
    mirror.getReflectionCamera(camera).layers.set(0);
    mirrorU = (mirror.material as ShaderMaterial).uniforms;
    scene.add(mirror);
    plainFloor.visible = false;
  }

  const dustGeometry = keep(new BufferGeometry());
  const dustSeeds = new Float32Array(MAX_DUST * 4);
  for (let i = 0; i < dustSeeds.length; i++) dustSeeds[i] = Math.random();
  dustGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
  dustGeometry.setAttribute("aSeed", new Float32BufferAttribute(dustSeeds, 4));
  dustGeometry.setDrawRange(0, tier.dust);
  const dustU = {
    uTime: { value: 0 },
    uPixel: { value: 1 },
    uSize: { value: 0.018 },
    uAlpha: { value: 0 },
    uPull: { value: 0 },
    uCore: { value: new Vector3() },
    uColor: { value: hex(0xff2a48).multiplyScalar(1.4) },
    uHot: { value: hex(0xffc9a0).multiplyScalar(2.2) },
    uAsh: { value: hex(0x8c7f82).multiplyScalar(0.5) },
  };
  const dust = new Points(dustGeometry, additive(dustU, DUST_FRAGMENT, DUST_VERTEX));
  dust.frustumCulled = false;
  dust.layers.set(1);
  scene.add(dust);

  /* Publish effects: burst, shockwave ---------------------------------------- */

  const forgeAngle = STATION_ANGLE.forge;
  const forgeNormal = new Vector3(Math.sin(forgeAngle), 0, Math.cos(forgeAngle));
  const forgeRight = new Vector3(Math.cos(forgeAngle), 0, -Math.sin(forgeAngle));
  const UP = new Vector3(0, 1, 0);
  /** Where reward tokens gather: just in front of the core, as seen from the Forge. */
  const forgeCore = forgeNormal.clone().multiplyScalar(2.4);
  const forgeQuaternion = new Quaternion().setFromAxisAngle(UP, forgeAngle);

  const burstGeometry = keep(new BufferGeometry());
  const burstDir = new Float32Array(BURST * 3);
  const burstSeed = new Float32Array(BURST * 4);
  for (let i = 0; i < BURST; i++) {
    const z = Math.random() * 2 - 1;
    const a = Math.random() * TAU;
    const r = Math.sqrt(1 - z * z);
    burstDir.set([Math.cos(a) * r, z * 0.8, Math.sin(a) * r], i * 3);
    for (let k = 0; k < 4; k++) burstSeed[i * 4 + k] = Math.random();
  }
  burstGeometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(BURST * 3), 3));
  burstGeometry.setAttribute("aDir", new Float32BufferAttribute(burstDir, 3));
  burstGeometry.setAttribute("aSeed", new Float32BufferAttribute(burstSeed, 4));
  const burstU = { uAge: { value: 0 }, uPixel: dustU.uPixel, uSize: { value: 0.03 }, uColor: dustU.uColor, uHot: dustU.uHot, uAsh: dustU.uAsh };
  const burst = new Points(burstGeometry, additive(burstU, DUST_FRAGMENT, BURST_VERTEX));
  burst.frustumCulled = false;
  burst.position.copy(forgeCore);
  burst.visible = false;
  burst.layers.set(1);
  scene.add(burst);

  const waveU = { uLife: { value: 0 }, uColor: { value: RED.clone().multiplyScalar(1.5) } };
  const wave = new Mesh(keep(new PlaneGeometry(2, 2)), additive(waveU, WAVE_FRAGMENT));
  wave.position.copy(forgeCore);
  wave.quaternion.copy(forgeQuaternion);
  wave.visible = false;
  scene.add(wave);

  /* Energy arcs along the ring ------------------------------------------------ */

  const ARC_POINTS = 26;
  type Arc = { mesh: Mesh<BufferGeometry, ShaderMaterial>; born: number; life: number; a0: number; a1: number; spoke: boolean; jitter: number };
  const arcs: Arc[] = [];
  for (let k = 0; k < 4; k++) {
    const geometry = keep(new BufferGeometry());
    const side: number[] = [];
    const along: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < ARC_POINTS; i++) {
      side.push(-1, 1);
      along.push(i / (ARC_POINTS - 1), i / (ARC_POINTS - 1));
      if (i < ARC_POINTS - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const positions = new Float32BufferAttribute(new Float32Array(ARC_POINTS * 6), 3);
    positions.setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", positions);
    geometry.setAttribute("aSide", new Float32BufferAttribute(side, 1));
    geometry.setAttribute("aAlong", new Float32BufferAttribute(along, 1));
    geometry.setIndex(index);
    const mesh = new Mesh(geometry, additive({ uLife: { value: 0 }, uTime: time, uColor: { value: RED.clone().multiplyScalar(1.8) } }, ARC_FRAGMENT, ARC_VERTEX));
    mesh.frustumCulled = false;
    mesh.visible = false;
    spinner.add(mesh);
    arcs.push({ mesh, born: 0, life: 0, a0: 0, a1: 0, spoke: false, jitter: 0 });
  }
  let nextArc = 2.5;
  function shapeArc(arc: Arc) {
    const positions = arc.mesh.geometry.getAttribute("position") as Float32BufferAttribute;
    const width = arc.spoke ? 0.05 : 0.07;
    for (let i = 0; i < ARC_POINTS; i++) {
      const t = i / (ARC_POINTS - 1);
      const bend = Math.sin(Math.PI * t);
      const jag = (hash(i * 3.7 + arc.jitter) - 0.5) * 0.34 * bend;
      const lift = (hash(i * 5.3 + arc.jitter + 1) - 0.5) * 0.3 * bend;
      let x: number;
      let y: number;
      let nx: number;
      let ny: number;
      if (arc.spoke) {
        const r = lerp(3.9, 0.35, t);
        nx = Math.cos(arc.a0);
        ny = -Math.sin(arc.a0);
        x = Math.sin(arc.a0) * r + nx * jag;
        y = Math.cos(arc.a0) * r + ny * jag;
      } else {
        const a = lerp(arc.a0, arc.a1, t);
        const r = 4.24 + jag;
        x = Math.sin(a) * r;
        y = Math.cos(a) * r;
        nx = Math.sin(a);
        ny = Math.cos(a);
      }
      positions.setXYZ(i * 2, x - nx * width, y - ny * width, lift);
      positions.setXYZ(i * 2 + 1, x + nx * width, y + ny * width, lift);
    }
    positions.needsUpdate = true;
  }
  function spawnArc(clock: number, spoke: boolean) {
    const arc = arcs.find((item) => !item.mesh.visible);
    if (!arc) return;
    arc.born = clock;
    arc.life = 0.25 + Math.random() * 0.3;
    arc.spoke = spoke;
    arc.a0 = Math.random() * TAU;
    arc.a1 = arc.a0 + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 1.1);
    arc.jitter = Math.random() * 100;
    arc.mesh.visible = true;
    shapeArc(arc);
  }

  /* Post-processing ----------------------------------------------------------- */

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: tierIndex === 0 ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(W, H), 0.9, 0.6, 0.14);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass({ ...FINISH_SHADER, defines: { RAYS: tier.rays } });
  composer.addPass(finish);
  const post = finish.uniforms as unknown as {
    uResolution: { value: number[] };
    uTime: { value: number };
    uDistort: { value: number };
    uGlitch: { value: number };
    uFlash: { value: number };
    uLight: { value: number[] };
    uRays: { value: number };
    uShock: { value: number[] };
    uShockStrength: { value: number };
    uAberration: { value: number };
  };

  /* Sizing and quality -------------------------------------------------------- */

  let s = 1;
  function resize() {
    W = Math.max(1, viewport.clientWidth);
    H = Math.max(1, viewport.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, tier.dpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr);
    composer.setSize(W, H);
    bloom.setSize(Math.round(W * dpr * tier.bloom), Math.round(H * dpr * tier.bloom));
    css.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    s = (DIST * 2 * Math.tan((FOV / 2) * (Math.PI / 180))) / H;
    post.uResolution.value[0] = W * dpr;
    post.uResolution.value[1] = H * dpr;
    dustU.uPixel.value = (H * dpr) / (2 * Math.tan((FOV / 2) * (Math.PI / 180)));
    mirror?.getRenderTarget().setSize(Math.round(W * dpr * tier.reflect), Math.round(H * dpr * tier.reflect));
    layoutDirty = true;
    invalidate();
  }

  function setTier(index: number) {
    tierIndex = index;
    tier = TIERS[index];
    dustGeometry.setDrawRange(0, tier.dust);
    finish.material.defines.RAYS = tier.rays;
    finish.material.needsUpdate = true;
    if (mirror && tier.reflect === 0) {
      mirror.visible = false;
      plainFloor.visible = true;
    }
    resize();
  }

  /* Panels -------------------------------------------------------------------- */

  const entries = new Map<HTMLElement, Entry>();
  const shards = keep(shardGeometry(9, 6));
  const shadowPlane = keep(new PlaneGeometry(1, 1));
  let layoutDirty = true;
  let contentHeight = H;
  const stationHeights: Partial<Record<StationId, number>> = {};

  const sortKey = (spec: PanelSpec) => STATIONS.indexOf(spec.station) * 1e6 + Math.max(0, SLOT_ORDER[spec.station].indexOf(spec.slot)) * 1e4 + spec.order;

  function placeInDom(entry: Entry) {
    let before: HTMLElement | null = null;
    let beforeKey = Infinity;
    for (const other of entries.values()) {
      if (other === entry || other.el.parentNode !== cameraElement) continue;
      if (other.key > entry.key && other.key < beforeKey) {
        before = other.el;
        beforeKey = other.key;
      }
    }
    if (entry.el.parentNode === cameraElement && entry.el.nextElementSibling === before) return;
    cameraElement.insertBefore(entry.el, before);
  }

  function styleFor(entry: Entry) {
    const look = entry.spec.kind === "tablet" ? STATUS_LOOK[entry.spec.tone ?? "active"] ?? STATUS_LOOK.active : null;
    entry.u.uTone.value.copy(look ? look.tone : entry.spec.kind === "plate" ? RED.clone().multiplyScalar(1.3) : RED);
    entry.u.uStatus.value = look ? look.index : -1;
    entry.u.uCut.value = KIND[entry.spec.kind].cut;
  }

  function buildBody(entry: Entry) {
    const depth = KIND[entry.spec.kind].body;
    if (!depth || !entry.body) return;
    const size = `${Math.round(entry.w)}x${Math.round(entry.h)}`;
    if (size === entry.bodySize) return;
    entry.bodySize = size;
    entry.body.geometry.dispose();
    const cut = KIND[entry.spec.kind].cut;
    entry.body.geometry = plate(chamfer(new Shape(), entry.w / 2 - 1, entry.h / 2 - 1, cut), depth, 2);
    entry.body.position.z = -2;
  }

  const ro = new ResizeObserver((list) => {
    for (const item of list) {
      const entry = entries.get(item.target as HTMLElement);
      if (!entry) continue;
      const box = item.borderBoxSize?.[0];
      entry.w = Math.max(1, box ? box.inlineSize : (item.target as HTMLElement).offsetWidth);
      entry.h = Math.max(1, box ? box.blockSize : (item.target as HTMLElement).offsetHeight);
      entry.u.uSize.value.set(entry.w, entry.h);
      buildBody(entry);
      layoutDirty = true;
    }
    invalidate();
  });

  function addPanel(el: HTMLElement, spec: PanelSpec): void {
    if (entries.has(el)) return updatePanel(el, spec);
    const kind = KIND[spec.kind];
    const u = glassUniforms(time, RED, -1, kind.cut);
    u.uOrigin.value.set(0.2 + hash(entries.size * 1.3) * 0.6, 0.2 + hash(entries.size * 2.9) * 0.6);
    const root = new Group();
    const glass = new Mesh(shards, keep(new ShaderMaterial({ uniforms: { ...u, uLayer: { value: 1 }, uZ: { value: -1 }, uGrow: { value: 0 } }, vertexShader: SHARD_VERTEX, fragmentShader: GLASS_FRAGMENT, transparent: true, depthWrite: false })));
    glass.renderOrder = 3;
    glass.frustumCulled = false;
    root.add(glass);
    let slab: Entry["slab"] = null;
    let body: Entry["body"] = null;
    let shadow: Entry["shadow"] = null;
    if (kind.body) {
      body = new Mesh(new BufferGeometry(), keep(new MeshStandardMaterial({ color: 0x150709, metalness: 0.88, roughness: 0.34, envMapIntensity: 1.1, transparent: true, opacity: 0 })));
      body.renderOrder = 2;
      root.add(body);
    } else {
      slab = new Mesh(shards, keep(new ShaderMaterial({ uniforms: { ...u, uLayer: { value: 0 }, uZ: { value: -14 }, uGrow: { value: 8 } }, vertexShader: SHARD_VERTEX, fragmentShader: GLASS_FRAGMENT, transparent: true })));
      slab.renderOrder = 2;
      slab.frustumCulled = false;
      root.add(slab);
    }
    if (kind.shadow) {
      shadow = new Mesh(shadowPlane, keep(new ShaderMaterial({ uniforms: { uSize: u.uSize, uLift: { value: 0 }, uAlpha: { value: 0 } }, vertexShader: SHADOW_VERTEX, fragmentShader: SHADOW_FRAGMENT, transparent: true, depthWrite: false })));
      shadow.renderOrder = 1;
      root.add(shadow);
    }
    const object = new CSS3DObject(el);
    el.style.userSelect = "";
    el.removeAttribute("draggable");
    root.add(object);
    root.visible = false;
    scene.add(root);
    const entry: Entry = {
      el,
      spec,
      key: sortKey(spec),
      root,
      css: object,
      glass,
      slab,
      body,
      shadow,
      u,
      bodySize: "",
      w: Math.max(1, el.offsetWidth),
      h: Math.max(1, el.offsetHeight),
      width: 0,
      maxHeight: null,
      target: { x: 0, y: 0, z: 0, ry: 0, rx: 0 },
      pose: { x: 0, y: 0, z: 0, ry: 0, rx: 0 },
      placed: false,
      tiltX: spring(),
      tiltY: spring(),
      lift: spring(),
      press: spring(),
      hover: 0,
      hoverTarget: 0,
      pressTarget: 0,
      focus: 0,
      focusTarget: 0,
      alert: 0,
      reveal: 0,
      shown: -1,
      anim: null,
      decoded: false,
      stopDecode: null,
      removing: null,
      chart: null,
      bars: null,
    };
    entries.set(el, entry);
    styleFor(entry);
    placeInDom(entry);
    el.inert = spec.station !== station;
    ro.observe(el);
    if (spec.kind === "timeline") buildBars(entry);
    // Panels arriving in the open view (new tablets, loaded details) assemble on their own.
    if (started && spec.station === station && !(intro && !intro.assembled) && !(flight && !flight.assembled)) queueAssemble(entry);
    layoutDirty = true;
    invalidate();
  }

  function updatePanel(el: HTMLElement, spec: PanelSpec): void {
    const entry = entries.get(el);
    if (!entry) return addPanel(el, spec);
    const moved = entry.spec.station !== spec.station;
    entry.spec = spec;
    entry.key = sortKey(spec);
    styleFor(entry);
    placeInDom(entry);
    if (moved) {
      el.inert = spec.station !== station;
      entry.reveal = spec.station === station ? 1 : 0;
      entry.placed = false;
    }
    layoutDirty = true;
    invalidate();
  }

  function removePanel(el: HTMLElement) {
    const entry = entries.get(el);
    if (!entry) return;
    entries.delete(el);
    ro.unobserve(el);
    entry.stopDecode?.();
    entry.root.remove(entry.css);
    el.remove();
    if (hovered === entry) hovered = null;
    if (motion === "off" || entry.reveal <= 0.01) return dropEntry(entry);
    entry.removing = performance.now();
    entry.anim = { from: entry.reveal, to: 0, start: entry.removing, duration: 380 };
    leaving.add(entry);
    layoutDirty = true;
    invalidate();
  }

  const leaving = new Set<Entry>();
  function dropEntry(entry: Entry) {
    leaving.delete(entry);
    scene.remove(entry.root);
    entry.glass.material.dispose();
    entry.slab?.material.dispose();
    entry.shadow?.material.dispose();
    if (entry.body) {
      entry.body.geometry.dispose();
      entry.body.material.dispose();
    }
    if (entry.bars) {
      entry.bars.geometry.dispose();
      entry.bars.material.dispose();
      entry.bars.dispose();
    }
  }

  /** Assembles (or dissolves) entries one after another across `spread` ms. */
  function animate(list: Entry[], to: number, at: number, spread: number, duration: number) {
    const sorted = [...list].sort((a, b) => a.key - b.key);
    sorted.forEach((entry, index) => {
      entry.anim = { from: entry.reveal, to, start: at + (sorted.length > 1 ? (index / (sorted.length - 1)) * spread : 0), duration };
      if (to > 0) entry.decoded = false;
    });
  }

  let pendingAssemble: Entry[] = [];
  function queueAssemble(entry: Entry) {
    pendingAssemble.push(entry);
  }

  /* Layout -------------------------------------------------------------------- */

  function layout() {
    layoutDirty = false;
    const compact = layoutSize(W) === "compact";
    const groups = new Map<StationId, Map<string, Entry[]>>();
    for (const entry of entries.values()) {
      const bySlot = groups.get(entry.spec.station) ?? new Map<string, Entry[]>();
      groups.set(entry.spec.station, bySlot);
      const list = bySlot.get(entry.spec.slot) ?? [];
      list.push(entry);
      bySlot.set(entry.spec.slot, list);
    }
    for (const [id, bySlot] of groups) {
      const placed = new Map<string, { top: number; bottom: number }>();
      let bottomMost = HUD_HEIGHT;
      for (const slot of stationSlots(id, W, H)) {
        const list = (bySlot.get(slot.id) ?? []).sort((a, b) => a.spec.order - b.spec.order);
        let top = slot.y ?? (slot.after ? (placed.get(slot.after)?.bottom ?? HUD_HEIGHT) + (compact ? 14 : 22) : HUD_HEIGHT + 16);
        const columns = slot.columns ?? 1;
        const gap = slot.gap ?? 18;
        const cell = (slot.width - gap * (columns - 1)) / columns;
        let y = top;
        for (let row = 0; row < list.length; row += columns) {
          const items = list.slice(row, row + columns);
          let rowHeight = 0;
          items.forEach((entry, column) => {
            const cx = slot.x - slot.width / 2 + cell / 2 + column * (cell + gap);
            const dx = cx - slot.x;
            const curve = slot.curve ? dx / slot.curve : 0;
            entry.target = {
              x: cx,
              y: y + entry.h / 2,
              z: (slot.z ?? 0) - (slot.curve ? (dx * dx) / (2 * slot.curve) : 0),
              ry: (slot.rotY ?? 0) - curve,
              rx: slot.rotX ?? 0,
            };
            if (entry.width !== cell) {
              entry.width = cell;
              entry.el.style.width = `${Math.round(cell)}px`;
            }
            const max = slot.maxHeight ?? null;
            if (entry.maxHeight !== max) {
              entry.maxHeight = max;
              if (max) entry.el.style.setProperty("--cs-max-h", `${Math.round(max)}px`);
              else entry.el.style.removeProperty("--cs-max-h");
            }
            rowHeight = Math.max(rowHeight, entry.h);
          });
          y += rowHeight + gap;
        }
        let height = list.length ? y - gap - top : 0;
        if (slot.bottom !== undefined && list.length) {
          const pinned = H - slot.bottom - height;
          if (pinned > top) {
            for (const entry of list) entry.target.y += pinned - top;
            top = pinned;
          }
        }
        if (!list.length) height = compact ? -14 : -22;
        placed.set(slot.id, { top, bottom: top + height });
        bottomMost = Math.max(bottomMost, top + height);
      }
      stationHeights[id] = bottomMost + (compact ? 96 : 28);
      for (const list of bySlot.values()) for (const entry of list) if (entry.bars) measureChart(entry);
    }
    contentHeight = Math.max(H, stationHeights[station] ?? H);
    const extra = `${Math.round(contentHeight - H)}px`;
    if (spacer.style.height !== extra) spacer.style.height = extra;
  }

  /* Timeline bars ------------------------------------------------------------- */

  const timeline = { values: [] as number[], hover: -1, levels: new Float32Array(30), start: 0 };
  const barBase = keep(new BoxGeometry(1, 1, 1).translate(0, 0.5, 0.5));
  const barMatrix = new Matrix4();
  const barQuaternion = new Quaternion();
  const barPosition = new Vector3();
  const barScale = new Vector3();

  function buildBars(entry: Entry) {
    const geometry = barBase.clone();
    geometry.setAttribute("aHot", new InstancedBufferAttribute(new Float32Array(30), 1));
    const material = new ShaderMaterial({ uniforms: { uColor: { value: RED.clone().multiplyScalar(1.2) }, uLevel: { value: 0 } }, vertexShader: BAR_VERTEX, fragmentShader: BAR_FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending });
    const bars = new InstancedMesh(geometry, material, 30);
    bars.instanceMatrix.setUsage(DynamicDrawUsage);
    bars.frustumCulled = false;
    bars.renderOrder = 4;
    bars.count = 0;
    entry.root.add(bars);
    entry.bars = bars;
  }

  function measureChart(entry: Entry) {
    const chart = entry.el.querySelector<HTMLElement>("[data-chart]");
    if (!chart) {
      entry.chart = null;
      return;
    }
    const { x, y } = offsetWithin(chart, entry.el);
    entry.chart = { x, y, w: chart.offsetWidth, h: chart.offsetHeight };
  }

  function updateBars(entry: Entry, clock: number, dt: number) {
    const bars = entry.bars;
    if (!bars) return;
    if (!entry.chart || entry.chart.w < 10) measureChart(entry);
    const chart = entry.chart;
    const values = timeline.values;
    const n = Math.min(30, values.length);
    bars.count = chart ? n : 0;
    if (!chart || !n) return;
    if (entry.reveal < 0.95) timeline.start = clock;
    const max = Math.max(1, ...values);
    const step = chart.w / n;
    const hot = bars.geometry.getAttribute("aHot") as InstancedBufferAttribute;
    for (let i = 0; i < n; i++) {
      const goal = clock - timeline.start > i * 0.025 || motion === "off" ? values[i] / max : 0;
      timeline.levels[i] = motion === "off" ? goal : damp(timeline.levels[i], goal, 7, dt);
      const level = timeline.levels[i];
      barPosition.set(-entry.w / 2 + chart.x + step * (i + 0.5), entry.h / 2 - (chart.y + chart.h), 2);
      barScale.set(step * 0.6, Math.max(1.5, level * chart.h), 10 + level * 22);
      barMatrix.compose(barPosition, barQuaternion, barScale);
      bars.setMatrixAt(i, barMatrix);
      hot.setX(i, i === timeline.hover ? 1 : 0);
    }
    bars.instanceMatrix.needsUpdate = true;
    hot.needsUpdate = true;
    bars.material.uniforms.uLevel.value = entry.reveal ** 2 * light;
  }

  /* Tokens -------------------------------------------------------------------- */

  const tokens = new Map<string, Token>();
  const tokenRoot = new Group();
  scene.add(tokenRoot);
  const coinGeometry = keep(new CylinderGeometry(0.3, 0.3, 0.07, 40));
  const gold = keep(new MeshStandardMaterial({ color: 0xe0a64e, metalness: 1, roughness: 0.25, emissive: hex(0x401800), emissiveIntensity: 0.7, envMapIntensity: 1.6 }));
  const cardGeometry = keep(new BoxGeometry(0.72, 0.98, 0.04));
  const cardEdges = keep(new EdgesGeometry(cardGeometry));
  const darkMetal = keep(new MeshStandardMaterial({ color: 0x1a0a0e, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.2 }));
  const edgeMaterial = keep(new LineBasicMaterial({ color: RED.clone().multiplyScalar(2.2), transparent: true, blending: AdditiveBlending, depthWrite: false }));
  const medalGeometry = keep(lathe([[0.001, 0.05], [0.33, 0.05], [0.4, 0.015], [0.4, -0.015], [0.33, -0.05], [0.001, -0.05]], 48));
  const medalMetal = keep(new MeshStandardMaterial({ color: 0xb8442e, metalness: 1, roughness: 0.28, emissive: hex(0x3a0505), emissiveIntensity: 0.7, envMapIntensity: 1.5 }));

  const faceObject = (face: HTMLElement | null, pixels: number, world: number, z: number) => {
    if (!face) return null;
    const object = new CSS3DObject(face);
    face.style.pointerEvents = "none";
    object.scale.setScalar(world / pixels);
    object.position.z = z;
    return object;
  };

  /** How each reward token looks. Add a shape here to give a new kind of reward its own token. */
  const TOKEN_BUILDERS: Record<TokenShape, (face: HTMLElement | null) => { group: Group; face: CSS3DObject | null }> = {
    coins: () => {
      const group = new Group();
      for (let i = 0; i < 5; i++) {
        const coin = new Mesh(coinGeometry, gold);
        coin.position.set((hash(i * 3.1) - 0.5) * 0.07, i * 0.078 - 0.16, (hash(i * 5.7) - 0.5) * 0.07);
        group.add(coin);
      }
      return { group, face: null };
    },
    card: (face) => {
      const group = new Group();
      group.add(new Mesh(cardGeometry, darkMetal), new LineSegments(cardEdges, edgeMaterial));
      const object = faceObject(face, 124, 0.64, 0.026);
      if (object) group.add(object);
      return { group, face: object };
    },
    medallion: (face) => {
      const group = new Group();
      group.add(new Mesh(medalGeometry, medalMetal));
      const object = faceObject(face, 84, 0.58, 0.056);
      if (object) group.add(object);
      return { group, face: object };
    },
  };

  function rewardsOrigin(out: Vector3) {
    for (const entry of entries.values()) {
      if (entry.spec.station === "forge" && entry.spec.slot === "rewards" && entry.root.visible) return out.setFromMatrixPosition(entry.root.matrixWorld);
    }
    return out.copy(forgeCore).addScaledVector(UP, -4);
  }

  function setTokens(list: TokenSpec[]) {
    const keys = new Set(list.map((item) => item.key));
    const now = performance.now();
    for (const token of tokens.values()) {
      if (!keys.has(token.spec.key) && token.leaving === null) {
        token.leaving = now;
        token.leaveFrom.copy(token.pos);
        token.leaveDir.copy(token.pos).sub(forgeCore).normalize().multiplyScalar(6).addScaledVector(UP, 1.2).addScaledVector(forgeNormal, 4);
        if (token.face) token.face.element.setAttribute("aria-hidden", "true");
      }
    }
    for (const spec of list) {
      const existing = tokens.get(spec.key);
      if (existing && existing.leaving === null) {
        existing.spec = spec;
        continue;
      }
      if (existing) dropToken(existing);
      const built = TOKEN_BUILDERS[spec.shape](spec.face);
      const token: Token = {
        spec,
        group: built.group,
        face: built.face,
        born: motion === "off" || !started ? now - 2000 : now,
        arrived: motion === "off" || !started,
        leaving: null,
        from: rewardsOrigin(new Vector3()),
        pos: new Vector3(),
        leaveFrom: new Vector3(),
        leaveDir: new Vector3(),
        seed: Math.random() * 10,
      };
      tokenRoot.add(token.group);
      tokens.set(spec.key, token);
    }
    // Keep the given order for the orbit; leaving tokens go last.
    const ordered = new Map<string, Token>();
    for (const spec of list) ordered.set(spec.key, tokens.get(spec.key)!);
    for (const [k, token] of tokens) if (!ordered.has(k)) ordered.set(k, token);
    tokens.clear();
    for (const [k, token] of ordered) tokens.set(k, token);
    invalidate();
  }

  function dropToken(token: Token) {
    tokenRoot.remove(token.group);
    if (token.face) {
      token.group.remove(token.face);
      token.face.element.remove();
    }
    if (tokens.get(token.spec.key) === token) tokens.delete(token.spec.key);
  }

  let orbit = 0;
  const tokenTarget = new Vector3();
  const bezierA = new Vector3();
  const bezierB = new Vector3();
  function updateTokens(now: number, dt: number) {
    const active = [...tokens.values()].filter((token) => token.leaving === null);
    const collapse = phase === "implode" ? easeIn(span(now, phaseAt, phaseAt + PUBLISH.implode)) : 0;
    const still = motion === "off";
    if (!still) orbit += dt * (0.22 + charge * 2.4 + collapse * 6);
    const radius = 2.1 * (1 - charge * 0.45) * (1 - collapse);
    active.forEach((token, index) => {
      const a = (index / Math.max(1, active.length)) * TAU + orbit;
      tokenTarget.copy(forgeCore).addScaledVector(forgeRight, Math.cos(a) * radius).addScaledVector(UP, Math.sin(a) * radius * 0.72);
      const k = still ? 1 : span(now, token.born, token.born + 900);
      if (k < 1) {
        const e = easeInOut(k);
        bezierA.copy(token.from).lerp(tokenTarget, 0.5).addScaledVector(forgeNormal, 3).addScaledVector(UP, 1.5);
        bezierB.copy(token.from).lerp(bezierA, e);
        token.pos.copy(bezierA).lerp(tokenTarget, e);
        token.pos.lerp(bezierB, 1 - e);
      } else {
        token.pos.copy(tokenTarget);
        if (!token.arrived) {
          token.arrived = true;
          kick = 1;
        }
      }
      token.group.position.copy(token.pos);
      token.group.quaternion.copy(forgeQuaternion);
      const spin = still ? 0 : token.spec.shape === "coins" ? now * 0.0016 + token.seed : Math.sin(now * 0.0011 + token.seed) * 0.55;
      token.group.rotateY(spin);
      if (token.spec.shape === "coins") token.group.rotateX(0.35);
      token.group.scale.setScalar((0.35 + 0.65 * easeOut(k)) * (1 - collapse * 0.9));
    });
    for (const token of tokens.values()) {
      if (token.leaving === null) continue;
      const k = still ? 1 : span(now, token.leaving, token.leaving + 800);
      token.pos.copy(token.leaveFrom).addScaledVector(token.leaveDir, easeIn(k));
      token.group.position.copy(token.pos);
      token.group.rotateY(dt * 9);
      token.group.scale.setScalar(Math.max(0.001, 1 - k));
      if (k >= 1) dropToken(token);
    }
  }

  /* State --------------------------------------------------------------------- */

  let started = false;
  let intro: { kind: IntroKind; start: number; assembled: boolean } | null = null;
  let flight: { from: Pose; to: StationId; start: number; duration: number; assembled: boolean } | null = null;
  let introPose: Pose | null = null;
  let hovered: Entry | null = null;
  let pointer = { x: 0, y: 0, inside: false, mouse: true };
  const parallax = { x: 0, y: 0 };
  let steadyUntil = 0;
  let typing = false;
  let charge = 0;
  let chargeTarget = 0;
  let phase: PublishPhase = "idle";
  let phaseAt = 0;
  let kick = 0;
  let light = 0;
  let clock = 0;
  let breathe = 0;
  let coreYaw = STATION_ANGLE[station] * 0.6;
  let lastInput = performance.now();
  let frames = 0;
  let slowFor = 0;
  let averageFrame = 16;
  let warmup = 0;

  const restPose = (id: StationId, scroll: number): Pose => ({
    theta: STATION_ANGLE[id],
    radius: CAMERA_RADIUS,
    height: -scroll * s,
    look: STATION_RADIUS,
    lookHeight: -scroll * s,
    fov: FOV,
    roll: 0,
  });
  let pose: Pose = restPose(station, 0);

  function blend(from: Pose, to: Pose, k: number, arc: boolean): Pose {
    const e = easeInOut(k);
    const bump = arc ? Math.sin(Math.PI * k) : 0;
    const turn = wrapAngle(to.theta - from.theta);
    return {
      theta: from.theta + turn * e,
      radius: lerp(from.radius, to.radius, e) + bump * 5,
      height: lerp(from.height, to.height, e) + bump * 1.2,
      look: lerp(from.look, to.look, e) - bump * 5.5,
      lookHeight: lerp(from.lookHeight, to.lookHeight, e),
      fov: lerp(from.fov, to.fov, e) + bump * 10,
      roll: lerp(from.roll, to.roll, e) + bump * 0.06 * Math.sign(turn || 1),
    };
  }

  /* Input --------------------------------------------------------------------- */

  const poke = () => {
    lastInput = performance.now();
    if (!raf && active()) loop();
  };
  const steady = (ms: number) => {
    steadyUntil = performance.now() + ms;
  };
  const panelOf = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>(".cs-panel") : null;
    return el ? (entries.get(el) ?? null) : null;
  };

  const ndc = new Vector2();
  const rayOrigin = new Vector3();
  const rayPoint = new Vector3();
  const inverse = new Matrix4();
  /** The pointer on a panel's plane, in its uv (0..1, y up), or null. */
  function pointerOn(entry: Entry, clientX: number, clientY: number, out: Vector2) {
    const rect = viewport.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    rayOrigin.setFromMatrixPosition(camera.matrixWorld);
    rayPoint.set(ndc.x, ndc.y, 0.5).unproject(camera);
    inverse.copy(entry.root.matrixWorld).invert();
    rayOrigin.applyMatrix4(inverse);
    rayPoint.applyMatrix4(inverse).sub(rayOrigin);
    if (Math.abs(rayPoint.z) < 1e-6) return null;
    const t = -rayOrigin.z / rayPoint.z;
    return out.set((rayOrigin.x + rayPoint.x * t) / entry.w + 0.5, (rayOrigin.y + rayPoint.y * t) / entry.h + 0.5);
  }

  const onLayerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY, inside: true, mouse: event.pointerType === "mouse" || event.pointerType === "pen" };
    const entry = panelOf(event.target);
    if (entry !== hovered) {
      if (hovered) hovered.hoverTarget = 0;
      hovered = entry;
      if (entry) {
        entry.hoverTarget = 1;
        if (KIND[entry.spec.kind].hover && pointer.mouse) hooks.sound("hover");
      }
    }
    poke();
  };
  const onLayerLeave = () => {
    pointer.inside = false;
    if (hovered) hovered.hoverTarget = 0;
    hovered = null;
    invalidate();
  };
  const onWindowMove = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const rect = viewport.getBoundingClientRect();
    parallaxTarget.x = clamp01((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    parallaxTarget.y = clamp01((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
    poke();
  };
  const parallaxTarget = { x: 0, y: 0 };
  const pressPoint = new Vector2();
  const onDown = (event: PointerEvent) => {
    const entry = panelOf(event.target);
    poke();
    if (!entry) return;
    entry.pressTarget = 1;
    const at = pointerOn(entry, event.clientX, event.clientY, pressPoint);
    if (at) entry.u.uRipple.value.set(at.x, at.y, clock, 0);
    if (event.pointerType !== "mouse") {
      hovered = entry;
      pointer = { x: event.clientX, y: event.clientY, inside: true, mouse: false };
    }
  };
  const onUp = () => {
    for (const entry of entries.values()) entry.pressTarget = 0;
    invalidate();
  };
  const onFocusIn = (event: FocusEvent) => {
    const entry = panelOf(event.target);
    for (const other of entries.values()) other.focusTarget = other === entry ? 1 : 0;
    typing = isTextField(event.target as Element);
    poke();
  };
  const onFocusOut = (event: FocusEvent) => {
    if (!viewport.contains(event.relatedTarget as Node | null)) for (const entry of entries.values()) entry.focusTarget = 0;
    typing = isTextField(event.relatedTarget as Element | null);
    invalidate();
  };
  const onKey = () => {
    steady(1600);
    poke();
  };
  const onInnerScroll = () => {
    steady(1200);
    poke();
  };
  const onScroll = () => {
    steady(900);
    poke();
  };

  css.domElement.addEventListener("pointermove", onLayerMove, { passive: true });
  css.domElement.addEventListener("pointerdown", onDown, { passive: true });
  viewport.addEventListener("pointerleave", onLayerLeave);
  window.addEventListener("pointermove", onWindowMove, { passive: true });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  viewport.addEventListener("focusin", onFocusIn);
  viewport.addEventListener("focusout", onFocusOut);
  viewport.addEventListener("keydown", onKey);
  viewport.addEventListener("scroll", onInnerScroll, { capture: true, passive: true });
  scroller.addEventListener("scroll", onScroll, { passive: true });
  scroller.addEventListener("wheel", onScroll, { passive: true });

  const sizeObserver = new ResizeObserver(() => resize());
  sizeObserver.observe(viewport);
  let onscreen = true;
  const io = new IntersectionObserver(([item]) => {
    onscreen = item?.isIntersecting ?? true;
    if (active()) poke();
  });
  io.observe(viewport);
  const onVisibility = () => {
    if (active()) poke();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (event: Event) => {
    event.preventDefault();
    if (!disposed) hooks.fail();
  };
  renderer.domElement.addEventListener("webglcontextlost", onLost);

  /* The loop ------------------------------------------------------------------ */

  let raf = 0;
  let last = 0;
  let dirty = 2;
  const active = () => started && !disposed && !document.hidden && onscreen;
  function invalidate() {
    dirty = 2;
    if (!raf && active()) loop();
  }
  function loop() {
    raf = requestAnimationFrame((now) => {
      raf = 0;
      if (!active()) return;
      const idle = now - lastInput;
      const busy = intro || flight || phase !== "idle" || charge > 0.001 || leaving.size > 0 || [...entries.values()].some((entry) => entry.anim);
      const animated = motion !== "off" && (busy || idle < 120_000);
      if (!animated && dirty <= 0) {
        last = 0;
        return;
      }
      frames++;
      // Idle for a while: keep the scene alive at a third of the frame rate.
      if (animated && !busy && idle > 25_000 && frames % 3) {
        loop();
        return;
      }
      frame(now);
      dirty--;
      loop();
    });
  }

  const corePoint = new Vector3();
  const eye = new Vector3();
  const look = new Vector3();
  const shakeOffset = new Vector3();
  const towards = new Vector3();
  const lightPoint = new Vector3();
  const shockPoint = new Vector3();

  function frame(now: number) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    if (last && !intro && !flight && phase === "idle") {
      averageFrame = lerp(averageFrame, now - last, 0.05);
      warmup += dt;
      slowFor = averageFrame > 24 && warmup > 3 ? slowFor + dt : 0;
      if (slowFor > 2 && tierIndex < TIERS.length - 1) {
        slowFor = 0;
        warmup = 0;
        setTier(tierIndex + 1);
      }
    }
    last = now;
    const still = motion === "off";
    const amount = motion === "subtle" ? 0.5 : still ? 0 : 1;
    if (!still) clock += dt;
    time.value = clock;
    const isSteady = typing || now < steadyUntil;
    if (layoutDirty) layout();
    const scroll = scroller.scrollTop;
    const compact = layoutSize(W) === "compact";

    /* Intro, flights and publishing drive a handful of levels. */
    let trace = 1;
    let spinBoost = 0;
    let flash = 0;
    let distort = 0;
    light = 1;
    if (intro) {
      const T = INTRO[intro.kind];
      const t = now - intro.start;
      trace = easeInOut(span(t, T.trace[0], T.trace[1]));
      light = Math.max(span(t, T.trace[0], T.trace[1]) * 0.4, t >= T.flash ? 1 : span(t, T.spin[0], T.flash) * 0.75);
      spinBoost = easeIn(span(t, T.spin[0], T.spin[1])) * (1 - span(t, T.flash, T.flash + 1500)) * 22;
      flash = t >= T.flash ? Math.exp(-(t - T.flash) / 200) : 0;
      distort = flash * 0.6;
      if (!intro.assembled && t >= T.assemble[0]) {
        intro.assembled = true;
        animate(stationEntries(station), 1, now, (T.assemble[1] - T.assemble[0]) * 0.55, (T.assemble[1] - T.assemble[0]) * 0.6);
      }
      if (introPose) pose = blend(introPose, restPose(station, scroll), span(t, T.spin[0] - 150, T.assemble[1]), false);
      if (t >= T.end) {
        intro = null;
        introPose = null;
        hooks.introDone();
      }
    } else if (flight) {
      const k = span(now, flight.start, flight.start + flight.duration);
      pose = blend(flight.from, restPose(flight.to, 0), k, true);
      distort = Math.sin(Math.PI * k) * 0.75;
      if (!flight.assembled && now - flight.start >= FLIGHT.in[0]) {
        flight.assembled = true;
        animate(stationEntries(flight.to), 1, now, (FLIGHT.in[1] - FLIGHT.in[0]) * 0.5, (FLIGHT.in[1] - FLIGHT.in[0]) * 0.6);
      }
      if (k >= 1) {
        const arrived = flight.to;
        flight = null;
        hooks.arrived(arrived);
      }
    } else {
      pose = restPose(station, scroll);
    }
    if (pendingAssemble.length) {
      animate(pendingAssemble.filter((entry) => entries.has(entry.el)), 1, now, Math.min(500, pendingAssemble.length * 45), 520);
      pendingAssemble = [];
    }

    charge = still ? chargeTarget : damp(charge, chargeTarget, 6, dt);
    const age = phase === "success" ? (now - phaseAt) / 1000 : -1;
    const implode = phase === "implode" ? easeIn(span(now, phaseAt, phaseAt + PUBLISH.implode)) : 0;
    const glitch = phase === "error" ? Math.exp(-(now - phaseAt) / 450) : 0;
    const boom = age >= 0 ? Math.exp(-age / 0.45) : 0;
    kick = still ? 0 : damp(kick, 0, 5, dt);
    distort += charge * 0.45 + implode * 0.9 + glitch * 0.4;
    flash += age >= 0 ? 0.9 * Math.exp(-age / 0.16) : 0;

    /* Core */
    const beat = heartbeat(still ? 400 : now);
    coreYaw = still ? STATION_ANGLE[flight?.to ?? station] * 0.6 : damp(coreYaw, STATION_ANGLE[flight?.to ?? station] * 0.6, 0.9, dt);
    core.rotation.y = coreYaw;
    const spin = 1 + spinBoost + charge * 5 + implode * 14;
    if (!still) {
      ringMain.rotation.z += dt * 0.05 * spin;
      gimbalB.rotation.x += dt * 0.11 * spin;
      gimbalC.rotation.y += dt * 0.16 * spin;
      sigilDisk.rotation.z -= dt * 0.025 * spin;
      crown.rotation.z += dt * 0.012 * (1 + spinBoost * 0.3);
      crystal.rotation.y += dt * 0.6 * spin;
      crystal.rotation.x += dt * 0.27;
    }
    const ringScale = (1 - implode * 0.18) * (age >= 0 ? 1 + 0.14 * Math.sin(age * 11) * Math.exp(-age * 3) : 1);
    spinner.scale.setScalar(ringScale);
    sigilU.uTrace.value = trace;
    sigilU.uGlow.value = 0.75 * light + charge * 0.8 + kick * 0.6 + boom * 1.5 + flash;
    const runeLevel = (0.6 + charge * 0.9 + boom) * light;
    runeFront.uLevel.value = runeBack.uLevel.value = runeInner.uLevel.value = runeLevel;
    crownU.uLevel.value = (0.4 + charge * 0.7 + implode + boom * 2) * light;
    metal.envMapIntensity = 1.3 * light;
    metal.emissiveIntensity = (0.35 + beat * 0.25 + charge) * light;
    const glow = (1 + beat * 0.35 + charge * 1.5 + implode * 3 + kick + boom * 4) * light;
    heart.scale.setScalar(1.8 * (1 + beat * 0.18 + charge * 0.4 - implode * 0.5 + boom * 2));
    heart.material.opacity = Math.min(1, glow);
    halo.material.opacity = 0.6 * light + charge * 0.3 + boom * 0.5;
    halo.scale.setScalar(9 * (1 + charge * 0.2 + boom * 0.8));
    crystalMaterial.opacity = light;
    coreLight.intensity = 26 * glow;
    smokeLevel.value = 0.32 * light;
    dustU.uTime.value = clock;
    dustU.uAlpha.value = light;
    dustU.uPull.value = Math.max(charge * 0.3, implode * 0.95);
    dustU.uCore.value.copy(forgeCore);
    const floorUniforms = [plainFloorU as Record<string, { value: unknown }>, mirrorU].filter(Boolean) as Record<string, { value: unknown }>[];
    for (const u of floorUniforms) {
      u.uLevel.value = light;
      u.uCharge.value = charge + implode + boom;
    }
    STATIONS.forEach((id, index) => {
      pools[index].w = (id === (flight?.to ?? station) ? 0.9 : 0.35) * light;
    });

    /* Arcs */
    if (!still) {
      nextArc -= dt * (1 + charge * 6 + implode * 12);
      if (nextArc <= 0 && light > 0.9) {
        spawnArc(clock, charge > 0.2 && Math.random() < 0.6);
        nextArc = 2.5 + Math.random() * 3.5;
      }
      for (const arc of arcs) {
        if (!arc.mesh.visible) continue;
        const life = 1 - (clock - arc.born) / arc.life;
        if (life <= 0) {
          arc.mesh.visible = false;
          continue;
        }
        if (Math.floor(clock * 18) !== Math.floor((clock - dt) * 18)) {
          arc.jitter += 1;
          shapeArc(arc);
        }
        arc.mesh.material.uniforms.uLife.value = life;
      }
    }

    /* Burst and shockwave */
    burst.visible = age >= 0 && age < 3;
    burstU.uAge.value = Math.max(0, age);
    wave.visible = age >= 0 && age < 1.2;
    if (wave.visible) {
      wave.scale.setScalar(0.4 + age * 14);
      waveU.uLife.value = 1 - age / 1.2;
    }

    /* Camera */
    if (!isSteady && !still) {
      parallax.x = damp(parallax.x, parallaxTarget.x, 2.5, dt);
      parallax.y = damp(parallax.y, parallaxTarget.y, 2.5, dt);
      breathe += dt;
    }
    const theta = pose.theta;
    look.set(Math.sin(theta) * pose.look, pose.lookHeight, Math.cos(theta) * pose.look);
    eye.set(Math.sin(theta) * pose.radius, pose.height, Math.cos(theta) * pose.radius);
    const sway = amount * (0.32 * parallax.x + 0.07 * Math.sin(breathe * 0.21));
    const rise = amount * (-0.2 * parallax.y + 0.05 * Math.sin(breathe * 0.17));
    eye.x += Math.cos(theta) * sway;
    eye.z -= Math.sin(theta) * sway;
    eye.y += rise;
    eye.addScaledVector(towards.copy(eye).sub(look).normalize(), amount * 0.12 * Math.sin(breathe * 0.13));
    const shake = (boom * 0.18 + implode * 0.03 + glitch * 0.05) * amount;
    if (shake > 0.001) {
      shakeOffset.set(wobble(clock * 9, 1), wobble(clock * 9, 2), wobble(clock * 9, 3)).multiplyScalar(shake);
      eye.add(shakeOffset);
      look.addScaledVector(shakeOffset, 0.4);
    }
    camera.position.copy(eye);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    if (pose.roll) camera.rotateZ(pose.roll);
    if (Math.abs(camera.fov - pose.fov) > 0.001) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    for (const mesh of smokes) mesh.quaternion.copy(camera.quaternion);

    /* Panels */
    const forgeVisible = station === "forge" || flight?.to === "forge" || [...entries.values()].some((entry) => entry.spec.station === "forge" && entry.reveal > 0.01);
    for (const entry of [...entries.values(), ...leaving]) updatePanel3d(entry, now, dt, still, amount, isSteady, compact, scroll);
    if (hovered && pointer.inside && hovered.root.visible) {
      const at = pointerOn(hovered, pointer.x, pointer.y, pressPoint);
      if (at) hovered.u.uPointer.value.set(clamp01(at.x), clamp01(at.y));
    }

    tokenRoot.visible = forgeVisible;
    if (forgeVisible || tokens.size) updateTokens(now, dt);

    /* Post */
    corePoint.set(0, 0, 0);
    lightPoint.copy(corePoint).project(camera);
    post.uLight.value[0] = lightPoint.x * 0.5 + 0.5;
    post.uLight.value[1] = lightPoint.y * 0.5 + 0.5;
    post.uTime.value = clock;
    post.uDistort.value = distort * amount + glitch * 0.5;
    post.uGlitch.value = glitch;
    post.uFlash.value = flash * (still ? 0.3 : 1);
    post.uRays.value = (0.55 + charge * 0.6 + boom) * light;
    post.uAberration.value = 0.0016 + charge * 0.002 + boom * 0.004;
    if (age >= 0 && age < 1.1) {
      shockPoint.copy(forgeCore).project(camera);
      post.uShock.value[0] = shockPoint.x * 0.5 + 0.5;
      post.uShock.value[1] = shockPoint.y * 0.5 + 0.5;
      post.uShock.value[2] = age * 0.95;
      post.uShockStrength.value = (1 - age / 1.1) * amount;
    } else post.uShockStrength.value = 0;
    bloom.strength = (0.85 * tier.bloom + 0.15 + charge * 0.4 + implode * 0.8 + boom * 2.2 + flash * 1.5) * Math.max(0.2, light);

    composer.render(dt);
    css.render(scene, camera);
  }

  function stationEntries(id: StationId) {
    return [...entries.values()].filter((entry) => entry.spec.station === id);
  }

  const panelEuler = { x: 0, y: 0 };
  function updatePanel3d(entry: Entry, now: number, dt: number, still: boolean, amount: number, isSteady: boolean, compact: boolean, scroll: number) {
    if (entry.anim) {
      const { from, to, start, duration } = entry.anim;
      const k = still ? 1 : span(now, start, start + duration);
      entry.reveal = lerp(from, to, k);
      if (k >= 1) {
        entry.anim = null;
        if (entry.removing !== null) return dropEntry(entry);
      }
    }
    const visible = entry.reveal > 0.001;
    entry.root.visible = visible;
    if (!visible) {
      entry.placed = false;
      return;
    }
    if (!entry.decoded && entry.reveal > 0.7 && (entry.anim?.to ?? 1) > 0 && entry.removing === null) {
      entry.decoded = true;
      if (!still) entry.stopDecode = decodeText(entry.el, 520);
    }
    const shown = smooth(0.55, 0.97, entry.reveal);
    if (Math.abs(shown - entry.shown) > 0.004 || (shown === 1 && entry.shown !== 1)) {
      entry.shown = shown;
      entry.el.style.setProperty("--cs-reveal", shown.toFixed(3));
    }

    const kind = KIND[entry.spec.kind];
    const a = still || !entry.placed ? 1 : 1 - Math.exp(-dt * 8);
    const p = entry.pose;
    const t = entry.target;
    p.x += (t.x - p.x) * a;
    p.y += (t.y - p.y) * a;
    p.z += (t.z - p.z) * a;
    p.ry += (t.ry - p.ry) * a;
    p.rx += (t.rx - p.rx) * a;
    entry.placed = true;

    entry.hover = still ? entry.hoverTarget : damp(entry.hover, entry.hoverTarget, 12, dt);
    entry.focus = damp(entry.focus, entry.focusTarget, 8, dt);
    entry.alert = still ? 0 : damp(entry.alert, 0, 1.6, dt);
    const tilting = hovered === entry && pointer.mouse && !isSteady && !still;
    const uv = entry.u.uPointer.value;
    springTo(entry.tiltX, tilting ? -(uv.y - 0.5) * kind.tilt * amount * 2 : 0, dt);
    springTo(entry.tiltY, tilting ? (uv.x - 0.5) * kind.tilt * amount * 2 : 0, dt);
    springTo(entry.lift, hovered === entry && pointer.mouse && !still ? kind.lift * amount : 0, dt, 140, 14);
    springTo(entry.press, entry.pressTarget, dt, 320, 24);
    if (still) {
      settle(entry.tiltX);
      settle(entry.tiltY);
      settle(entry.lift);
      settle(entry.press);
    }

    let rx = p.rx + entry.tiltX.x;
    let z = p.z;
    if (compact && !still) {
      const dy = Math.max(-1, Math.min(1, (p.y - scroll - H / 2) / H));
      rx += dy * 0.24;
      z -= dy * dy * 90;
    }
    panelEuler.x = rx;
    panelEuler.y = p.ry + entry.tiltY.x;
    const angle = STATION_ANGLE[entry.spec.station];
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const X = p.x * s;
    const Z = z * s;
    entry.root.position.set(sin * STATION_RADIUS + cos * X + sin * Z, (H / 2 - p.y) * s, cos * STATION_RADIUS - sin * X + cos * Z);
    entry.root.rotation.set(panelEuler.x, angle + panelEuler.y, 0, "YXZ");
    entry.root.scale.setScalar(s);
    const lift = entry.lift.x - entry.press.x * 10;
    entry.root.translateZ(lift * s);
    entry.root.updateMatrixWorld();

    const u = entry.u;
    u.uAssemble.value = entry.reveal;
    u.uHover.value = entry.hover;
    u.uPress.value = entry.press.x;
    u.uFocus.value = entry.focus;
    u.uAlert.value = entry.alert;
    u.uPulse.value = entry.spec.kind === "tablet" && entry.spec.tone === "active" && !still ? 0.18 + 0.18 * Math.sin(clock * 2.2 + entry.key * 0.37) : entry.spec.kind === "plate" ? 0.15 + kick * 0.5 : 0;
    if (entry.body) entry.body.material.opacity = smooth(0.4, 0.9, entry.reveal);
    if (entry.shadow) {
      entry.shadow.position.z = -30 - Math.max(0, lift);
      entry.shadow.material.uniforms.uLift.value = Math.max(0, lift);
      entry.shadow.material.uniforms.uAlpha.value = smooth(0.6, 1, entry.reveal);
    }
    if (entry.bars) updateBars(entry, clock, dt);
  }

  /* API ----------------------------------------------------------------------- */

  function start(kind: IntroKind | null) {
    if (started || disposed) return;
    started = true;
    resize();
    layout();
    if (kind && motion !== "off") {
      intro = { kind, start: performance.now(), assembled: false };
      introPose = { theta: STATION_ANGLE[station], radius: kind === "full" ? 5.4 : 11, height: kind === "full" ? 0.4 : 0.8, look: 0, lookHeight: 0, fov: kind === "full" ? 50 : 44, roll: kind === "full" ? 0.05 : 0.02 };
      pose = introPose;
    } else {
      for (const entry of stationEntries(station)) {
        entry.reveal = 1;
        entry.decoded = true;
      }
      queueMicrotask(() => hooks.introDone());
    }
    poke();
    invalidate();
  }

  function skipIntro() {
    if (!intro) return;
    intro = null;
    introPose = null;
    animate(stationEntries(station).filter((entry) => entry.reveal < 1), 1, performance.now(), 120, 260);
    hooks.introDone();
    invalidate();
  }

  function setStation(next: StationId) {
    if (next === station && !flight) return;
    if (intro) skipIntro();
    station = next;
    for (const entry of entries.values()) entry.el.inert = entry.spec.station !== next;
    if (hovered && hovered.spec.station !== next) {
      hovered.hoverTarget = 0;
      hovered = null;
    }
    scroller.scrollTop = 0;
    layoutDirty = true;
    const now = performance.now();
    if (motion === "off" || !started) {
      for (const entry of entries.values()) {
        entry.anim = null;
        entry.reveal = entry.spec.station === next ? 1 : 0;
        entry.decoded = true;
      }
      flight = null;
      if (started) queueMicrotask(() => hooks.arrived(next));
      invalidate();
      return;
    }
    const outgoing = [...entries.values()].filter((entry) => entry.spec.station !== next && entry.reveal > 0);
    animate(outgoing, 0, now + FLIGHT.out[0], (FLIGHT.out[1] - FLIGHT.out[0]) * 0.4, (FLIGHT.out[1] - FLIGHT.out[0]) * 0.6);
    for (const entry of stationEntries(next)) {
      entry.anim = null;
      entry.reveal = 0;
    }
    flight = { from: { ...pose }, to: next, start: now, duration: FLIGHT.duration, assembled: false };
    poke();
  }

  function setMotion(next: Motion) {
    motion = next;
    if (next === "off") {
      if (intro) skipIntro();
      if (flight) {
        const to = flight.to;
        flight = null;
        for (const entry of entries.values()) {
          entry.anim = null;
          entry.reveal = entry.spec.station === to ? 1 : 0;
        }
        hooks.arrived(to);
      }
    }
    invalidate();
  }

  function setTimeline(values: number[], hover: number) {
    timeline.values = values.slice(-30);
    timeline.hover = hover;
    invalidate();
  }

  function setCharge(level: number) {
    chargeTarget = clamp01(level);
    poke();
  }

  function publish(next: PublishPhase) {
    phase = next;
    phaseAt = performance.now();
    if (next === "success") {
      for (const token of [...tokens.values()]) dropToken(token);
      chargeTarget = 0;
      charge = 0;
    }
    if (next === "error" || next === "idle") chargeTarget = 0;
    poke();
  }

  function alert(el: HTMLElement) {
    const entry = entries.get(el);
    if (entry) entry.alert = 1;
    poke();
  }

  const ready = (async () => {
    resize();
    await renderer.compileAsync(scene, camera);
  })();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    css.domElement.removeEventListener("pointermove", onLayerMove);
    css.domElement.removeEventListener("pointerdown", onDown);
    viewport.removeEventListener("pointerleave", onLayerLeave);
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    viewport.removeEventListener("focusin", onFocusIn);
    viewport.removeEventListener("focusout", onFocusOut);
    viewport.removeEventListener("keydown", onKey);
    viewport.removeEventListener("scroll", onInnerScroll, { capture: true });
    scroller.removeEventListener("scroll", onScroll);
    scroller.removeEventListener("wheel", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    renderer.domElement.removeEventListener("webglcontextlost", onLost);
    sizeObserver.disconnect();
    io.disconnect();
    ro.disconnect();
    for (const entry of [...entries.values(), ...leaving]) {
      entry.stopDecode?.();
      entry.el.style.removeProperty("--cs-reveal");
      entry.el.style.removeProperty("--cs-max-h");
      entry.el.style.removeProperty("transform");
      entry.el.style.removeProperty("width");
      entry.el.style.removeProperty("position");
      entry.el.style.removeProperty("pointer-events");
      entry.el.style.removeProperty("display");
      entry.el.inert = false;
      dropEntry(entry);
    }
    entries.clear();
    for (const token of [...tokens.values()]) dropToken(token);
    for (const item of owned) item.dispose();
    target.dispose();
    composer.dispose();
    bloom.dispose();
    finish.dispose();
    mirror?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    css.domElement.remove();
    spacer.style.height = "0px";
  }

  return {
    ready,
    addPanel,
    updatePanel,
    removePanel,
    setStation,
    setMotion,
    start,
    skipIntro,
    setTimeline,
    setTokens,
    setCharge,
    publish,
    alert,
    dispose,
  };
}
