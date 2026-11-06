import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  FogExp2,
  Group,
  HalfFloatType,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  Quaternion,
  Euler,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { follow, radialTexture, spring, studioEnvironment } from "@/components/showcase/three-kit";
import {
  Coil,
  DUST_FRAGMENT,
  DUST_VERTEX,
  FINISH_SHADER,
  GLASS_FRAGMENT,
  GLASS_VERTEX,
  PLATE_COLUMNS,
  PLATE_FRAGMENT,
  PLATE_ROWS,
  PLATE_VERTEX,
  STEAM_FRAGMENT,
  STEAM_VERTEX,
  Spiral,
  TAU,
  TUNNEL_FRAGMENT,
  TUNNEL_VERTEX,
  annulus,
  gear,
  lathe,
  octagon,
  octagonCorners,
  octagonPath,
  paintCase,
  paintDays,
  paintDestination,
  paintGauge,
  paintIndex,
  paintMonths,
  paintPlates,
  paintWall,
  plateCell,
  type Fonts,
} from "./chrono-forge";
import {
  INTRO,
  TRAVEL,
  clamp01,
  dayParts,
  easeIn,
  easeInOut,
  easeOut,
  journey,
  smooth,
  span,
  type ChronoCommit,
  type IntroKind,
  type TravelKind,
} from "./chrono-timing";

export type ChronoMotion = "off" | "subtle" | "full";

export type ChronoOptions = {
  /** Element the canvas fills; swapped for the travel overlay with `setHost`. */
  host: HTMLElement;
  /** Where the machine docks while the page is in use. */
  slot: HTMLElement;
  /** Catalog commits, oldest first. */
  commits: ChronoCommit[];
  /** Today as a day number; the rings show it at rest. */
  today: number;
  motion: ChronoMotion;
  fonts: Fonts;
  onFail: () => void;
};

export type Chrono = {
  ready: Promise<void>;
  start(intro: IntroKind | null): void;
  skipIntro(): void;
  setMotion(motion: ChronoMotion): void;
  setHost(host: HTMLElement): void;
  travel(target: ChronoCommit, kind: TravelKind): void;
  cancelTravel(): void;
  dispose(): void;
};

type Tier = { dpr: number; bloom: number; steam: number; dust: number };
const TIERS: Tier[] = [
  { dpr: 1.75, bloom: 1, steam: 240, dust: 360 },
  { dpr: 1.35, bloom: 0.7, steam: 150, dust: 200 },
  { dpr: 1, bloom: 0.5, steam: 90, dust: 100 },
];
const MAX_STEAM = 240;
const MAX_DUST = 360;
const FOV = 30;
const DEG = Math.PI / 180;
/** World radius that has to fit inside the DOM slot. */
const FRAME = 4.4;
const CASE_HALF = 3.45;
const CASE_CUT = 1.15;
const REST_YAW = -0.2;
const REST_PITCH = 0.07;
/** Tunnel depth the whole journey covers, and where the eye sits in it. */
const SPAN = 48;
const EYE_Z = 2;
const PLATE_LIMIT = PLATE_COLUMNS * PLATE_ROWS;
const HOOPS = 14;
const HOOP_GAP = 5.5;
const FLICKER = [0, 0.85, 0.08, 0, 1, 0.25, 0.9, 0.55, 1];

const AMBER = new Color(0xffa64a);
const PATINA = new Color(0x58d4b9);

function initialTier() {
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (memory <= 2 || cores <= 2) return 2;
  if (cores <= 4 || memory <= 4) return 1;
  return 0;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pulse = (ms: number, at: number, decay: number) => (ms < at ? 0 : Math.exp(-(ms - at) / decay));
const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU);
/** Mechanical indexing: a quick advance at the start of every step, then a rest. */
function indexing(x: number, steps: number) {
  if (x >= 1) return 1;
  const v = Math.max(0, x) * steps;
  const whole = Math.floor(v);
  return (whole + smooth(Math.min(1, (v - whole) * 2.6))) / steps;
}

async function loadFonts(fonts: Fonts) {
  if (!document.fonts) return;
  const wanted = [`600 48px ${fonts.display}`, `600 40px ${fonts.mono}`, `600 28px ${fonts.ui}`];
  await Promise.race([
    Promise.all(wanted.map((font) => document.fonts.load(font).catch(() => []))),
    new Promise((resolve) => setTimeout(resolve, 900)),
  ]);
}

function pick<T>(list: T[], count: number) {
  if (list.length <= count) return list;
  return Array.from({ length: count }, (_, k) => list[Math.round((k * (list.length - 1)) / (count - 1))]);
}

export function createChrono(options: ChronoOptions): Chrono {
  const { slot, commits, today, fonts, onFail } = options;
  let host = options.host;
  let motion = options.motion;
  let W = Math.max(1, host.clientWidth);
  let H = Math.max(1, host.clientHeight);
  const tierIndex = initialTier();
  const tier = TIERS[tierIndex];
  let disposed = false;
  const owned: { dispose(): void }[] = [];
  function keep<T extends { dispose(): void }>(item: T): T {
    owned.push(item);
    return item;
  }

  const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance", stencil: false });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.setClearColor(0x050607, 1);
  const canvas = renderer.domElement;
  canvas.className = "vh-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);

  const time = { value: 0 };
  const camera = new PerspectiveCamera(FOV, W / H, 0.05, 200);

  /* The chamber ---------------------------------------------------------------- */

  const chamber = new Scene();
  chamber.fog = new FogExp2(0x07080a, 0.011);
  const environment = studioEnvironment(renderer, AMBER, PATINA, true, 0.7);
  chamber.environment = environment;
  const hemi = new HemisphereLight(0x9fb4c2, 0x2a1a0c, 0.45);
  const key = new DirectionalLight(0xffd6a0, 2.4);
  key.position.set(-5, 7, 9);
  const rim = new DirectionalLight(0x7fe8d4, 1.5);
  rim.position.set(7, 2.5, -4);
  chamber.add(hemi, key, rim);

  const wallMap = keep(paintWall());
  wallMap.repeat.set(6, 3.4);
  const wall = new Mesh(keep(new PlaneGeometry(76, 44)), keep(new MeshStandardMaterial({ map: wallMap, color: 0x9aa0a6, metalness: 0.5, roughness: 0.8 })));
  wall.position.z = -8;
  chamber.add(wall);

  const machine = new Group();
  chamber.add(machine);

  const haloMap = keep(radialTexture([[0, "rgba(255,186,110,0.5)"], [0.4, "rgba(255,140,60,0.12)"], [1, "rgba(0,0,0,0)"]]));
  const haloMaterial = keep(new SpriteMaterial({ map: haloMap, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.4, fog: false }));
  const halo = new Sprite(haloMaterial);
  halo.scale.setScalar(16);
  halo.position.z = -1.6;
  machine.add(halo);

  const iron = keep(new MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.8, roughness: 0.55 }));
  const caseFace = keep(new MeshStandardMaterial({ color: 0xffffff, metalness: 0.72, roughness: 0.6 }));
  const brass = keep(new MeshStandardMaterial({ color: 0xc99a4f, metalness: 1, roughness: 0.3 }));
  const bronze = keep(new MeshStandardMaterial({ color: 0x6f5129, metalness: 1, roughness: 0.45 }));
  const steel = keep(new MeshStandardMaterial({ color: 0xc3cacf, metalness: 1, roughness: 0.26 }));
  const blued = keep(new MeshStandardMaterial({ color: 0x2c4466, metalness: 1, roughness: 0.3 }));
  const copper = keep(new MeshStandardMaterial({ color: 0xbf6f42, metalness: 1, roughness: 0.36 }));
  const monthFace = keep(new MeshStandardMaterial({ metalness: 1, roughness: 0.32 }));
  const dayFace = keep(new MeshStandardMaterial({ metalness: 1, roughness: 0.25 }));
  const indexFace = keep(new MeshStandardMaterial({ metalness: 1, roughness: 0.3 }));
  const gaugeFace = keep(new MeshStandardMaterial({ metalness: 0, roughness: 0.55 }));
  const needleMaterial = keep(new MeshStandardMaterial({ color: 0x5a1208, metalness: 0.4, roughness: 0.4 }));

  // Case, trim and rivets.
  const caseMesh = new Mesh(
    keep(new ExtrudeGeometry(octagon(CASE_HALF, CASE_CUT), { depth: 0.36, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 }).translate(0, 0, -0.41)),
    [caseFace, iron],
  );
  const trimShape = octagon(CASE_HALF - 0.02, CASE_CUT);
  trimShape.holes.push(octagonPath(CASE_HALF - 0.17, CASE_CUT - 0.09));
  const trim = new Mesh(keep(new ExtrudeGeometry(trimShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 })), brass);
  machine.add(caseMesh, trim);

  const dummy = new Object3D();
  const rivetGeometry = keep(new SphereGeometry(0.06, 12, 8, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2));
  const trimPoints = octagonCorners(CASE_HALF - 0.095, CASE_CUT - 0.05);
  const rivetSpots: [number, number, number, number][] = [];
  trimPoints.forEach(([x, y], k) => {
    const [nx, ny] = trimPoints[(k + 1) % 8];
    rivetSpots.push([x, y, 0.075, 1], [(x + nx) / 2, (y + ny) / 2, 0.075, 1]);
  });
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    rivetSpots.push([Math.sin(a) * 2.835, Math.cos(a) * 2.835, 0.19, 0.62]);
  }
  const rivets = keep(new InstancedMesh(rivetGeometry, brass, rivetSpots.length));
  rivetSpots.forEach(([x, y, z, scale], i) => {
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    rivets.setMatrixAt(i, dummy.matrix);
  });
  machine.add(rivets);

  // Dial: iron bezel, brass month ring, steel day ring, blued commit index.
  const bezel = new Mesh(keep(lathe([[2.7, 0], [2.97, 0], [2.97, 0.1], [2.92, 0.19], [2.76, 0.19], [2.7, 0.1], [2.7, 0]])), iron);
  machine.add(bezel);
  const ring = (inner: number, outer: number, depth: number, body: MeshStandardMaterial, face: MeshStandardMaterial) => {
    const group = new Group();
    group.add(new Mesh(keep(lathe([[inner, depth], [inner, 0], [outer, 0], [outer, depth]])), body));
    const top = new Mesh(keep(annulus(inner, outer, 256)), face);
    top.position.z = depth;
    group.add(top);
    machine.add(group);
    return group;
  };
  const monthRing = ring(2.25, 2.66, 0.1, brass, monthFace);
  const dayRing = ring(1.89, 2.23, 0.13, steel, dayFace);
  const indexRing = ring(1.44, 1.87, 0.16, blued, indexFace);
  const count = Math.max(1, commits.length);
  const beadMaterial = keep(new MeshBasicMaterial({ color: 0xffffff }));
  const beads = keep(new InstancedMesh(keep(new SphereGeometry(1, 14, 10)), beadMaterial, count));
  commits.forEach((commit, i) => {
    const a = ((i + 0.5) / count) * TAU;
    dummy.position.set(Math.sin(a) * 1.6, Math.cos(a) * 1.6, 0.175);
    dummy.scale.setScalar(commit.available ? 0.052 : 0.03);
    dummy.updateMatrix();
    beads.setMatrixAt(i, dummy.matrix);
    beads.setColorAt(i, new Color(0, 0, 0));
  });
  indexRing.add(beads);
  const collar = new Mesh(keep(new TorusGeometry(1.42, 0.035, 10, 160)), brass);
  collar.position.z = 0.17;
  machine.add(collar);

  // Gimbal hoops around the lens.
  const gimbal = new Group();
  gimbal.position.z = 0.42;
  const hoopA = new Mesh(keep(new TorusGeometry(1.2, 0.028, 10, 140)), brass);
  const hoopB = new Mesh(keep(new TorusGeometry(1.3, 0.022, 10, 140)), steel);
  gimbal.add(hoopA, hoopB);
  machine.add(gimbal);

  // The lens: a dark cup, a brass collar, a glass dome and the filament.
  const cupMaterial = keep(new MeshStandardMaterial({ color: 0x0b0d0f, metalness: 0.6, roughness: 0.45, emissive: AMBER, emissiveIntensity: 0 }));
  const cup = new Mesh(keep(new CircleGeometry(1.12, 64)), cupMaterial);
  cup.position.z = 0.03;
  const lensCollar = new Mesh(keep(new TorusGeometry(1.08, 0.05, 12, 96)), brass);
  lensCollar.position.z = 0.2;
  const glassUniforms = { uTint: { value: new Color(0.95, 0.75, 0.45) }, uGlow: { value: 1 }, uOpacity: { value: 1 } };
  const glass = new Mesh(
    keep(new SphereGeometry(1.06, 48, 24, 0, TAU, 0, Math.PI / 2).rotateX(Math.PI / 2)),
    keep(new ShaderMaterial({ uniforms: glassUniforms, vertexShader: GLASS_VERTEX, fragmentShader: GLASS_FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending })),
  );
  glass.scale.z = 0.55;
  glass.position.z = 0.2;
  const filamentMaterial = keep(new MeshBasicMaterial({ color: new Color(4, 2, 0.8) }));
  const filament = new Mesh(keep(new TubeGeometry(new Coil(0.7, 0.05, 11), 220, 0.011, 6, false)), filamentMaterial);
  filament.position.z = 0.45;
  const supportGeometry = keep(new CylinderGeometry(0.009, 0.009, 0.42, 6).rotateX(Math.PI / 2));
  for (const x of [-0.35, 0.35]) {
    const support = new Mesh(supportGeometry, steel);
    support.position.set(x, 0, 0.25);
    machine.add(support);
  }
  const glowMap = keep(radialTexture([[0, "rgba(255,230,190,1)"], [0.25, "rgba(255,170,80,0.45)"], [1, "rgba(0,0,0,0)"]]));
  const glowMaterial = keep(new SpriteMaterial({ map: glowMap, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  const glow = new Sprite(glowMaterial);
  glow.scale.setScalar(1.9);
  glow.position.z = 0.47;
  const core = new PointLight(0xffa64a, 0, 9, 2);
  core.position.set(0, 0, 0.9);
  machine.add(cup, lensCollar, glass, filament, glow, core);

  // The index cursor at twelve o'clock.
  const cursorGlass = new Mesh(keep(new PlaneGeometry(0.2, 1.6)), keep(new MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.07, depthWrite: false })));
  cursorGlass.position.set(0, 2.2, 0.26);
  const hairlineMaterial = keep(new MeshBasicMaterial({ color: new Color(2.4, 0.55, 0.3) }));
  const hairline = new Mesh(keep(new PlaneGeometry(0.014, 1.6)), hairlineMaterial);
  hairline.position.set(0, 2.2, 0.262);
  const arrowShape = new Shape();
  arrowShape.moveTo(-0.14, 0.12);
  arrowShape.lineTo(0.14, 0.12);
  arrowShape.lineTo(0, -0.11);
  arrowShape.closePath();
  const arrow = new Mesh(keep(new ExtrudeGeometry(arrowShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 })), brass);
  arrow.position.set(0, 3.08, 0.19);
  machine.add(cursorGlass, hairline, arrow);

  // Gears: two meshing pairs on the case front, two large wheels behind it.
  type Wheel = { mesh: Mesh; ratio: number; offset: number };
  const wheels: Wheel[] = [];
  const addGear = (teeth: number, pitch: number, depth: number, material: MeshStandardMaterial, x: number, y: number, z: number, ratio: number, offset: number) => {
    const mesh = new Mesh(keep(gear(teeth, pitch, depth, teeth > 14 ? 5 : 0)), material);
    mesh.position.set(x, y, z);
    machine.add(mesh);
    wheels.push({ mesh, ratio, offset });
    return mesh;
  };
  const meshAt = (teeth: number, pitch: number, x: number, y: number, angle: number, otherTeeth: number): [number, number] => {
    const distance = ((teeth + otherTeeth) * pitch) / 2;
    return [x + Math.cos(angle) * distance, y + Math.sin(angle) * distance];
  };
  const pair = (teethA: number, teethB: number, x: number, y: number, angle: number, materialA: MeshStandardMaterial, materialB: MeshStandardMaterial, direction: number) => {
    const pitch = 0.055;
    const stepA = TAU / teethA;
    const stepB = TAU / teethB;
    addGear(teethA, pitch, 0.06, materialA, x, y, 0.04, direction, angle - 0.84 * stepA);
    const [bx, by] = meshAt(teethA, pitch, x, y, angle, teethB);
    addGear(teethB, pitch, 0.06, materialB, bx, by, 0.05, (-direction * teethA) / teethB, angle + Math.PI - 0.34 * stepB);
  };
  pair(18, 10, -2.48, 2.48, Math.PI / 4, brass, steel, 1);
  pair(16, 9, 2.5, -2.46, (Math.PI * 5) / 4, brass, steel, -1);
  addGear(40, 0.09, 0.12, bronze, 3.15, 2.95, -0.55, 0.3, 0);
  addGear(34, 0.09, 0.12, bronze, -3.25, -2.75, -0.55, -0.36, 0.2);

  // Pressure gauge (top right).
  const gauge = new Group();
  gauge.position.set(2.48, 2.48, 0);
  const gaugeBezel = new Mesh(keep(new TorusGeometry(0.5, 0.055, 12, 64)), brass);
  gaugeBezel.position.z = 0.1;
  const gaugeDial = new Mesh(keep(new CircleGeometry(0.48, 48)), gaugeFace);
  gaugeDial.position.z = 0.06;
  const needle = new Mesh(keep(new PlaneGeometry(0.034, 0.4).translate(0, 0.16, 0)), needleMaterial);
  needle.position.z = 0.085;
  const pin = new Mesh(keep(new CylinderGeometry(0.035, 0.035, 0.05, 16).rotateX(Math.PI / 2)), brass);
  pin.position.z = 0.1;
  gauge.add(gaugeBezel, gaugeDial, needle, pin);
  machine.add(gauge);

  // Balance wheel with a blued hairspring (bottom left).
  const balanceMount = new Group();
  balanceMount.position.set(-2.48, -2.48, 0.1);
  const balance = new Group();
  balance.add(new Mesh(keep(new TorusGeometry(0.42, 0.04, 10, 64)), brass));
  const spokeGeometry = keep(new BoxGeometry(0.84, 0.04, 0.03));
  for (const a of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    const spoke = new Mesh(spokeGeometry, brass);
    spoke.rotation.z = a;
    balance.add(spoke);
  }
  const hairspring = new Mesh(keep(new TubeGeometry(new Spiral(0.07, 0.33, 5), 240, 0.006, 4, false)), blued);
  hairspring.position.z = 0.04;
  const bridge = new Mesh(keep(new BoxGeometry(1.08, 0.12, 0.05)), brass);
  bridge.rotation.z = 0.5;
  bridge.position.z = 0.1;
  balanceMount.add(balance, hairspring, bridge);
  machine.add(balanceMount);

  // Copper steam pipes and a valve wheel.
  const pipeGeometry = (sign: number) =>
    keep(
      new TubeGeometry(
        new CatmullRomCurve3([new Vector3(3.2 * sign, -1.55, -0.2), new Vector3(3.78 * sign, -1.62, 0.02), new Vector3(4.16 * sign, -1.36, 0.12), new Vector3(4.25 * sign, -0.76, 0.15)]),
        48,
        0.085,
        10,
        false,
      ),
    );
  const flangeGeometry = keep(new TorusGeometry(0.11, 0.03, 8, 24).rotateX(Math.PI / 2));
  for (const sign of [-1, 1]) {
    machine.add(new Mesh(pipeGeometry(sign), copper));
    const flange = new Mesh(flangeGeometry, brass);
    flange.position.set(4.25 * sign, -0.74, 0.15);
    machine.add(flange);
  }
  const valve = new Group();
  valve.position.set(3.72, -1.62, 0.2);
  valve.add(new Mesh(keep(new TorusGeometry(0.16, 0.025, 8, 32)), brass));
  const valveSpoke = keep(new BoxGeometry(0.32, 0.025, 0.025));
  for (const a of [0, Math.PI / 2]) {
    const spoke = new Mesh(valveSpoke, brass);
    spoke.rotation.z = a;
    valve.add(spoke);
  }
  machine.add(valve);

  // Steam from the pipe mouths.
  const steamGeometry = keep(new BufferGeometry());
  const steamSeeds = new Float32Array(MAX_STEAM * 4);
  for (let i = 0; i < MAX_STEAM; i++) steamSeeds.set([Math.random(), Math.random(), Math.random(), (i % 2) * 0.99], i * 4);
  steamGeometry.setAttribute("position", new BufferAttribute(new Float32Array(MAX_STEAM * 3), 3));
  steamGeometry.setAttribute("aSeed", new BufferAttribute(steamSeeds, 4));
  steamGeometry.setDrawRange(0, tier.steam);
  const steamUniforms = {
    uTime: time,
    uLevel: { value: 0.2 },
    uPixel: { value: 600 },
    uEmit0: { value: new Vector3(-4.25, -0.66, 0.15) },
    uEmit1: { value: new Vector3(4.25, -0.66, 0.15) },
    uDir0: { value: new Vector3(-0.25, 1, 0.1).normalize() },
    uDir1: { value: new Vector3(0.25, 1, 0.1).normalize() },
    uColor: { value: new Color(0.86, 0.84, 0.8) },
  };
  const steam = new Points(steamGeometry, keep(new ShaderMaterial({ uniforms: steamUniforms, vertexShader: STEAM_VERTEX, fragmentShader: STEAM_FRAGMENT, transparent: true, depthWrite: false })));
  steam.frustumCulled = false;
  machine.add(steam);

  // Dust in the lamplight.
  const dustGeometry = keep(new BufferGeometry());
  const dustSeeds = new Float32Array(MAX_DUST * 4);
  for (let i = 0; i < MAX_DUST * 4; i++) dustSeeds[i] = Math.random();
  dustGeometry.setAttribute("position", new BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
  dustGeometry.setAttribute("aSeed", new BufferAttribute(dustSeeds, 4));
  dustGeometry.setDrawRange(0, tier.dust);
  const dustUniforms = { uTime: time, uPixel: { value: 600 }, uBox: { value: new Vector3(24, 15, 10) }, uColor: { value: new Color(1, 0.78, 0.5) } };
  const dust = new Points(dustGeometry, keep(new ShaderMaterial({ uniforms: dustUniforms, vertexShader: DUST_VERTEX, fragmentShader: DUST_FRAGMENT, transparent: true, depthWrite: false, blending: AdditiveBlending })));
  dust.frustumCulled = false;
  chamber.add(dust);

  /* The tunnel through time ------------------------------------------------------ */

  const tunnelScene = new Scene();
  tunnelScene.environment = environment;
  tunnelScene.add(new HemisphereLight(0xffd8a8, 0x10202a, 0.6));
  const eyeLight = new PointLight(0xffc888, 18, 26, 1.6);
  eyeLight.position.set(0, 0.6, EYE_Z);
  tunnelScene.add(eyeLight);
  const tunnelUniforms = {
    uTravel: { value: 0 },
    uSpeed: { value: 0 },
    uTime: time,
    uOpacity: { value: 1 },
    uBrass: { value: new Color(1, 0.6, 0.26) },
    uPatina: { value: new Color(0.3, 1, 0.84) },
  };
  const tunnel = new Mesh(
    keep(new CylinderGeometry(2.7, 2.7, 96, 64, 1, true).rotateX(Math.PI / 2).translate(0, 0, -44)),
    keep(new ShaderMaterial({ uniforms: tunnelUniforms, vertexShader: TUNNEL_VERTEX, fragmentShader: TUNNEL_FRAGMENT, side: BackSide, depthWrite: false })),
  );
  tunnel.frustumCulled = false;
  tunnelScene.add(tunnel);
  const hoopMaterial = keep(new MeshStandardMaterial({ color: 0xc99a4f, metalness: 1, roughness: 0.28, emissive: AMBER, emissiveIntensity: 0.18 }));
  const hoops = keep(new InstancedMesh(keep(new TorusGeometry(2.35, 0.055, 8, 96)), hoopMaterial, HOOPS));
  hoops.frustumCulled = false;
  tunnelScene.add(hoops);

  const atlasCanvas = document.createElement("canvas");
  atlasCanvas.width = 2048;
  atlasCanvas.height = 2048;
  const atlas = keep(new CanvasTexture(atlasCanvas));
  atlas.colorSpace = SRGBColorSpace;
  atlas.anisotropy = 8;
  const plateGeometry = keep(new PlaneGeometry(1.4, 0.7));
  const cells = new InstancedBufferAttribute(new Float32Array(PLATE_LIMIT * 2), 2);
  const glows = new InstancedBufferAttribute(new Float32Array(PLATE_LIMIT), 1);
  plateGeometry.setAttribute("aCell", cells);
  plateGeometry.setAttribute("aGlow", glows);
  const plateUniforms = { uMap: { value: atlas }, uCellSize: { value: new Vector2(1 / PLATE_COLUMNS, 1 / PLATE_ROWS) }, uOpacity: { value: 1 } };
  const plates = keep(
    new InstancedMesh(
      plateGeometry,
      keep(new ShaderMaterial({ uniforms: plateUniforms, vertexShader: PLATE_VERTEX, fragmentShader: PLATE_FRAGMENT, transparent: true, depthWrite: false })),
      PLATE_LIMIT,
    ),
  );
  plates.frustumCulled = false;
  plates.count = 0;
  tunnelScene.add(plates);

  const destinationCanvas = document.createElement("canvas");
  destinationCanvas.width = 1024;
  destinationCanvas.height = 512;
  const destinationMap = keep(new CanvasTexture(destinationCanvas));
  destinationMap.colorSpace = SRGBColorSpace;
  destinationMap.anisotropy = 8;
  const destinationMaterial = keep(new MeshBasicMaterial({ map: destinationMap, transparent: true, depthWrite: false, color: new Color(1.2, 1.2, 1.2) }));
  const destination = new Mesh(keep(new PlaneGeometry(2, 1)), destinationMaterial);
  destination.renderOrder = 2;
  tunnelScene.add(destination);

  /* Post-processing ---------------------------------------------------------------- */

  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: tierIndex === 0 ? 4 : 0 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(chamber, camera);
  composer.addPass(renderPass);
  const bloom = new UnrealBloomPass(new Vector2(W, H), 0.55, 0.5, 0.8);
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);
  const finish = new ShaderPass(FINISH_SHADER);
  composer.addPass(finish);
  const post = finish.uniforms;

  /* Layout ---------------------------------------------------------------------- */

  const rest = { x: 0, y: 0, r: 120 };
  const center = { x: 0, y: 0, r: 120 };
  let pixelScale = 600;
  let dpr = 1;
  function measure() {
    const box = host.getBoundingClientRect();
    const spot = slot.getBoundingClientRect();
    rest.x = spot.left - box.left + spot.width / 2;
    rest.y = spot.top - box.top + spot.height / 2;
    rest.r = Math.max(48, Math.min(spot.width, spot.height) / 2);
    const visible = Math.max(240, Math.min(H, window.innerHeight - Math.max(0, box.top)));
    center.x = W / 2;
    center.y = Math.min(H, visible) * 0.45;
    center.r = Math.min(W * 0.44, visible * 0.38);
  }

  let sizeKey = "";
  let composerDpr = renderer.getPixelRatio();
  function resize() {
    W = Math.max(1, host.clientWidth);
    H = Math.max(1, host.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, tier.dpr);
    measure();
    const nextSize = `${W}|${H}|${dpr}`;
    if (sizeKey === nextSize) {
      invalidate();
      return;
    }
    sizeKey = nextSize;
    if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    if (composerDpr !== dpr) {
      composer.setPixelRatio(dpr);
      composerDpr = dpr;
    }
    composer.setSize(W, H);
    bloom.setSize(Math.round(W * dpr * tier.bloom), Math.round(H * dpr * tier.bloom));
    post.uResolution.value = [W * dpr, H * dpr];
    measure();
    invalidate();
  }

  const shakeOffset = new Vector3();
  function shake(seconds: number, amount: number) {
    return shakeOffset.set(Math.sin(seconds * 37.1) + Math.sin(seconds * 23.7) * 0.5, Math.cos(seconds * 29.3) + Math.sin(seconds * 41.9) * 0.5, 0).multiplyScalar(amount * 0.5);
  }

  function placeCamera(mix: number, yaw: number, pitch: number, zoom: number, fov: number, tremor: number) {
    const x = lerp(center.x, rest.x, mix);
    const y = lerp(center.y, rest.y, mix);
    const r = lerp(center.r, rest.r, mix);
    camera.fov = fov;
    camera.aspect = W / H;
    const distance = ((FRAME * (H / 2)) / (r * Math.tan((fov / 2) * DEG))) * zoom;
    const cp = Math.cos(pitch);
    camera.position.set(Math.sin(yaw) * cp * distance, Math.sin(pitch) * distance, Math.cos(yaw) * cp * distance);
    if (tremor > 0) camera.position.add(shake(clock, tremor * Math.min(1, distance * 0.04)));
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(0.03, (distance - FRAME * 1.6) * 0.7);
    camera.far = distance + 60;
    camera.setViewOffset(W, H, W / 2 - x, H / 2 - y, W, H);
    camera.updateProjectionMatrix();
  }

  function placeTunnelCamera(fov: number, tremor: number) {
    camera.clearViewOffset();
    camera.fov = fov;
    camera.aspect = W / H;
    camera.near = 0.05;
    camera.far = 120;
    camera.position.set(0, 0, EYE_Z);
    if (tremor > 0) camera.position.add(shake(clock, tremor * 0.08));
    camera.lookAt(0, 0, EYE_Z - 20);
    camera.updateProjectionMatrix();
  }

  /* State ----------------------------------------------------------------------- */

  const N = count;
  const monthAngle = (month: number) => ((month + 0.5) / 12) * TAU;
  const dayAngle = (date: number) => ((date - 0.5) / 31) * TAU;
  const indexAngle = (index: number) => ((index + 0.5) / N) * TAU;
  const now = dayParts(today);
  const restMonth = monthAngle(now.month);
  const restDay = dayAngle(now.date);
  const restIndex = indexAngle(N - 1);

  const s = {
    mix: spring(1),
    yaw: spring(REST_YAW),
    pitch: spring(REST_PITCH),
    zoom: spring(1),
    month: spring(restMonth),
    day: spring(restDay),
    index: spring(restIndex),
    gears: spring(1),
    steam: spring(0.2),
    gauge: spring(0.58),
    light: spring(1),
  };
  const look = { x: 0, y: 0 };

  type Plate = { f: number; x: number; y: number; tilt: Quaternion; glow: number };
  type Trip = {
    kind: TravelKind;
    start: number;
    target: ChronoCommit;
    targetIndex: number;
    plates: Plate[];
    from: { month: number; day: number; index: number };
    to: { month: number; day: number; index: number };
    lastP: number;
  };
  let started = false;
  let intro: { kind: IntroKind; start: number } | null = null;
  let trip: Trip | null = null;
  let skippedAt = -1e9;
  let clock = 0;
  let gearPhase = 0;
  let valveAngle = 0;

  const beadColor = new Color();
  let beadSweep = -1;
  let beadTarget = -2;
  let beadPulse = -1;
  const plateMatrix = new Matrix4();
  const platePosition = new Vector3();
  const plateScale = new Vector3(1, 1, 1);
  const tiltEuler = new Euler();

  /* Frame ------------------------------------------------------------------------ */

  function frame(nowMs: number) {
    const dt = last ? Math.min(0.05, (nowMs - last) / 1000) : 1 / 60;
    last = nowMs;
    const still = motion === "off";
    const amount = motion === "subtle" ? 0.5 : still ? 0 : 1;
    if (!still) clock += dt;
    time.value = clock;

    let mix = 1;
    let yaw = REST_YAW + look.x * amount;
    let pitch = REST_PITCH + look.y * amount;
    let zoom = 1;
    let fov = FOV;
    let month = restMonth;
    let day = restDay;
    let index = restIndex;
    let gears = 1;
    let steamLevel = 0.2;
    let gaugeLevel = 0.58 + Math.sin(clock * 0.7) * 0.015 * amount;
    let light = 1;
    let filamentLevel = 1 + Math.sin(clock * 2.3) * 0.05 * amount;
    let whiteHot = 0;
    let bloomBoost = 0;
    let flash = 0;
    let warp = 0;
    let tremor = 0;
    let hair = 1;
    let sweep = 1;
    let swing = 0;
    let targetPulse = 0;
    let inTunnel = false;
    let tunnelFov = FOV;
    let p = 0;
    let speed = 0;
    let smoothing = nowMs - skippedAt < 700 ? 0.12 : 0.3;

    if (intro) {
      const ms = nowMs - intro.start;
      const T = INTRO[intro.kind];
      smoothing = 0.04;
      const flick = span(ms, T.flicker);
      filamentLevel = flick >= 1 ? filamentLevel : FLICKER[Math.min(FLICKER.length - 1, Math.floor(flick * FLICKER.length))];
      const wake = span(ms, T.wake);
      light = 0.12 + 0.88 * smooth(wake);
      gears = smooth(wake) * (1 + 0.7 * Math.sin(wake * Math.PI));
      steamLevel = 0.2 + 0.75 * Math.sin(Math.PI * wake);
      gaugeLevel = 0.04 + 0.54 * easeOut(wake) + 0.06 * Math.sin(ms * 0.03) * (1 - wake) * (wake > 0 ? 1 : 0);
      const sw = span(ms, T.sweep);
      sweep = sw;
      month = restMonth - TAU * 0.75 * (1 - indexing(easeInOut(clamp01(sw / 0.8)), 12));
      day = restDay + TAU * 1.25 * (1 - indexing(easeInOut(clamp01((sw - 0.1) / 0.8)), 31));
      index = restIndex - TAU * 0.5 * (1 - indexing(easeInOut(clamp01((sw - 0.2) / 0.8)), 20));
      const lock = pulse(ms, T.lock, intro.kind === "full" ? 260 : 160);
      hair = 0.3 + 0.7 * sw + 2.6 * lock;
      bloomBoost = 0.8 * lock;
      tremor = 0.3 * lock * amount;
      steamLevel += 0.5 * lock;
      swing = 1 - smooth(span(ms, [T.sweep[0], T.lock]));
      const pre = smooth(span(ms, [T.wake[0], T.settle[0]]));
      const settle = easeInOut(span(ms, T.settle));
      mix = settle;
      yaw = lerp(lerp(-0.62, -0.4, pre), yaw, settle);
      pitch = lerp(lerp(0.26, 0.15, pre), pitch, settle);
      zoom = lerp(lerp(0.58, 0.7, pre), 1, settle);
      if (ms >= T.end) intro = null;
    }

    if (trip) {
      const ms = nowMs - trip.start;
      const T = TRAVEL[trip.kind];
      const full = trip.kind === "full";
      smoothing = 0.035;
      const engage = span(ms, T.engage);
      const dock = easeInOut(clamp01(engage / 0.7));
      mix = 1 - dock;
      yaw = lerp(REST_YAW, 0, dock);
      pitch = lerp(REST_PITCH, 0, dock);
      const turn = easeInOut(engage);
      month = lerp(trip.from.month, trip.to.month, turn);
      day = lerp(trip.from.day, trip.to.day, turn);
      index = lerp(trip.from.index, trip.to.index, turn);
      gears = lerp(1, -7, smooth(engage));
      steamLevel = 0.3 + 0.7 * smooth(engage);
      gaugeLevel = lerp(0.58, 0.97, easeOut(engage)) + 0.02 * Math.sin(ms * 0.09) * engage;
      hair = 1 + 2 * engage;
      targetPulse = engage;
      tremor = (full ? 0.12 : 0.04) * engage * amount;
      const dive = span(ms, T.dive);
      if (dive > 0) {
        const fall = easeIn(dive);
        zoom = lerp(1, 0.035, fall);
        fov = lerp(FOV, 78, fall);
        warp = (full ? 0.9 : 0.45) * fall;
        filamentLevel = 1 + 5 * fall;
        whiteHot = fall;
        bloomBoost = 1.1 * dive;
        tremor = (full ? 0.12 + 0.3 * dive : 0.06) * amount;
        flash = 0.85 * smooth(clamp01((dive - 0.8) / 0.2));
      }
      if (ms >= T.dive[1]) {
        inTunnel = true;
        const passage = span(ms, T.passage);
        p = journey(ms, T.passage);
        speed = dt > 0 ? clamp01(((p - trip.lastP) / dt) * 0.7) : 0;
        trip.lastP = p;
        tunnelFov = lerp(76, 50, easeOut(passage));
        warp = (full ? 0.1 : 0.05) + (full ? 0.32 : 0.14) * speed;
        tremor = (full ? 0.05 + 0.12 * speed : 0.02) * amount;
        flash = 0.85 * Math.exp(-(ms - T.dive[1]) / 150);
        const hit = smooth(span(ms, [T.flash - 70, T.flash + 30]));
        const fade = span(ms, [T.flash + 30, T.navigate]);
        flash = Math.max(flash, hit * (1 - 0.65 * fade));
        bloomBoost = -0.15 + 0.3 * speed + 1.2 * hit;
      }
    }

    // Everything eases toward its target; motion "off" jumps straight there.
    const settleTo = (spr: { value: number; target: number; velocity: number }, value: number) => {
      spr.target = value;
      if (still) {
        spr.value = value;
        spr.velocity = 0;
      } else follow(spr, smoothing, dt);
    };
    settleTo(s.mix, mix);
    settleTo(s.yaw, yaw);
    settleTo(s.pitch, pitch);
    settleTo(s.zoom, zoom);
    settleTo(s.month, month);
    settleTo(s.day, day);
    settleTo(s.index, index);
    settleTo(s.gears, gears);
    settleTo(s.steam, steamLevel);
    settleTo(s.gauge, gaugeLevel);
    settleTo(s.light, light);

    /* Machine */
    gearPhase += dt * 0.32 * s.gears.value * amount;
    valveAngle += dt * s.gears.value * 0.5 * amount;
    if (!inTunnel) {
      const L = s.light.value;
      key.intensity = 2.4 * L;
      rim.intensity = 1.5 * L;
      hemi.intensity = 0.45 * L;
      chamber.environmentIntensity = 0.2 + 0.8 * L;
      haloMaterial.opacity = 0.4 * L;
      core.intensity = 7 * filamentLevel;
      cupMaterial.emissiveIntensity = 0.05 * filamentLevel;
      filamentMaterial.color.setRGB(lerp(4.2, 7, whiteHot) * filamentLevel, lerp(2, 6.4, whiteHot) * filamentLevel, lerp(0.75, 5.6, whiteHot) * filamentLevel);
      glowMaterial.opacity = Math.min(1, 0.55 * filamentLevel);
      glow.scale.setScalar(1.9 + whiteHot * 2.4);
      glassUniforms.uGlow.value = filamentLevel;
      for (const wheel of wheels) wheel.mesh.rotation.z = wheel.offset + gearPhase * wheel.ratio;
      valve.rotation.z = valveAngle;
      balance.rotation.z = Math.sin(clock * (TAU / 1.25) * (1 + Math.abs(s.gears.value - 1) * 0.25)) * 2.1 * amount;
      hairspring.scale.setScalar(1 + Math.sin(clock * (TAU / 1.25)) * 0.04 * amount);
      hoopA.rotation.x = 1.15 * swing + Math.sin(clock * 0.37) * 0.16 * amount;
      hoopB.rotation.y = -1.25 * swing + Math.sin(clock * 0.29 + 1.3) * 0.2 * amount;
      monthRing.rotation.z = s.month.value;
      dayRing.rotation.z = s.day.value;
      indexRing.rotation.z = s.index.value;
      needle.rotation.z = -(-0.75 * Math.PI + 1.5 * Math.PI * clamp01(s.gauge.value));
      hairlineMaterial.color.setRGB(2.4 * hair, 0.55 * hair, 0.3 * hair);
      steamUniforms.uLevel.value = clamp01(s.steam.value);
      const targetIndex = trip?.targetIndex ?? -1;
      if (sweep !== beadSweep || targetIndex !== beadTarget || targetPulse !== beadPulse || (targetIndex >= 0 && targetPulse > 0)) {
        beadSweep = sweep;
        beadTarget = targetIndex;
        beadPulse = targetPulse;
        commits.forEach((commit, i) => {
          const lit = clamp01(sweep * (N + 5) - i);
          const burst = lit > 0 && sweep < 1 ? Math.exp(-(sweep * (N + 5) - i) * 0.5) * 1.6 : 0;
          if (i === targetIndex) {
            const beat = 2.4 + 2.4 * (0.5 + 0.5 * Math.sin(clock * 14)) * targetPulse;
            beadColor.setRGB(0.6 * beat, 1.6 * beat, 1.4 * beat);
          } else if (commit.available) beadColor.setRGB(0.35 * (lit * 1.6 + burst), 1 * (lit * 1.6 + burst), 0.85 * (lit * 1.6 + burst));
          else beadColor.setRGB(1 * (lit * 0.4 + burst * 0.6), 0.62 * (lit * 0.4 + burst * 0.6), 0.26 * (lit * 0.4 + burst * 0.6));
          beads.setColorAt(i, beadColor);
        });
        if (beads.instanceColor) beads.instanceColor.needsUpdate = true;
      }
    }

    /* Tunnel */
    if (inTunnel && trip) {
      renderPass.scene = tunnelScene;
      placeTunnelCamera(tunnelFov, tremor);
      const travelled = p * SPAN;
      tunnelUniforms.uTravel.value = travelled;
      tunnelUniforms.uSpeed.value = speed;
      for (let k = 0; k < HOOPS; k++) {
        const z = EYE_Z - ((((k * HOOP_GAP - travelled * 1.3) % (HOOPS * HOOP_GAP)) + HOOPS * HOOP_GAP) % (HOOPS * HOOP_GAP));
        dummy.position.set(0, 0, z);
        dummy.rotation.set(0, 0, k * 0.4 + travelled * 0.05);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        hoops.setMatrixAt(k, dummy.matrix);
      }
      hoops.instanceMatrix.needsUpdate = true;
      trip.plates.forEach((plate, i) => {
        const z = EYE_Z - (plate.f - p) * SPAN;
        const visible = z < EYE_Z + 0.6 && z > EYE_Z - 60;
        platePosition.set(plate.x, plate.y, z);
        plateScale.setScalar(visible ? 1 : 0);
        plateMatrix.compose(platePosition, plate.tilt, plateScale);
        plates.setMatrixAt(i, plateMatrix);
        glows.setX(i, plate.glow + Math.max(0, 1 - Math.abs(z - EYE_Z + 3) / 3) * 0.4);
      });
      plates.instanceMatrix.needsUpdate = true;
      glows.needsUpdate = true;
      const halfHeight = Math.tan((tunnelFov / 2) * DEG) * 4.2;
      const width = Math.min(halfHeight * 2 * (W / H) * 0.72, 3.6);
      destination.position.set(0, halfHeight * 0.14, EYE_Z - 4.2 - (1 - p) * SPAN * 1.05);
      destination.scale.setScalar(width / 2);
      destinationMaterial.color.setScalar(1.1 + 0.5 * smooth(clamp01((p - 0.85) / 0.15)));
    } else {
      renderPass.scene = chamber;
      placeCamera(s.mix.value, s.yaw.value, s.pitch.value, s.zoom.value, fov, tremor);
    }

    const pixelFov = inTunnel ? tunnelFov : fov;
    pixelScale = (H * dpr) / (2 * Math.tan((pixelFov / 2) * DEG));
    steamUniforms.uPixel.value = pixelScale;
    dustUniforms.uPixel.value = pixelScale;
    bloom.strength = (0.55 + bloomBoost) * (0.6 + 0.4 * tier.bloom);
    post.uTime.value = clock;
    post.uFlash.value = flash;
    post.uWarp.value = still ? 0 : warp;
    post.uVignette.value = inTunnel ? 1 : 0.85;
    composer.render(dt);
  }

  /* The loop --------------------------------------------------------------------- */

  let raf = 0;
  let last = 0;
  let dirty = 2;
  let frames = 0;
  let onscreen = true;
  const active = () => started && !disposed && !document.hidden && onscreen;
  function invalidate() {
    dirty = 2;
    if (!raf && active()) loop();
  }
  function loop() {
    raf = requestAnimationFrame((nowMs) => {
      raf = 0;
      if (!active()) {
        last = 0;
        return;
      }
      const busy = Boolean(intro || trip);
      const animated = motion !== "off";
      if (!animated && !busy && dirty <= 0) {
        last = 0;
        return;
      }
      frames++;
      // At rest the slow gears look the same at half the frame rate.
      if (animated && !busy && nowMs - skippedAt > 900 && frames % 2) {
        loop();
        return;
      }
      frame(nowMs);
      dirty--;
      loop();
    });
  }

  const sizeObserver = new ResizeObserver(() => resize());
  sizeObserver.observe(host);
  sizeObserver.observe(slot);
  const io = new IntersectionObserver(([item]) => {
    onscreen = item?.isIntersecting ?? true;
    if (active()) invalidate();
  });
  io.observe(host);
  const onVisibility = () => {
    if (active()) invalidate();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (event: Event) => {
    event.preventDefault();
    if (!disposed) onFail();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  const fine = window.matchMedia("(pointer: fine)").matches;
  const onPointer = (event: PointerEvent) => {
    if (!fine || trip) return;
    look.x = (event.clientX / window.innerWidth - 0.5) * 0.14;
    look.y = (event.clientY / window.innerHeight - 0.5) * -0.07;
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  function paint() {
    monthFace.map = keep(paintMonths(fonts));
    dayFace.map = keep(paintDays(fonts));
    indexFace.map = keep(paintIndex(commits, fonts));
    caseFace.map = keep(paintCase(fonts, CASE_HALF));
    gaugeFace.map = keep(paintGauge(fonts));
    for (const material of [monthFace, dayFace, indexFace, caseFace, gaugeFace]) material.needsUpdate = true;
  }

  const ready = (async () => {
    await loadFonts(fonts);
    if (disposed) return;
    paint();
    resize();
    placeCamera(1, REST_YAW, REST_PITCH, 1, FOV, 0);
    await renderer.compileAsync(chamber, camera);
    if (disposed) return;
    await renderer.compileAsync(tunnelScene, camera);
  })();

  return {
    ready,
    start(kind) {
      if (disposed) return;
      started = true;
      intro = kind && motion !== "off" ? { kind, start: performance.now() } : null;
      if (intro) {
        s.mix.value = 0;
        s.zoom.value = 0.58;
        s.yaw.value = -0.62;
        s.pitch.value = 0.26;
        s.light.value = 0.12;
        s.gears.value = 0;
        s.month.value = restMonth - TAU * 0.75;
        s.day.value = restDay + TAU * 1.25;
        s.index.value = restIndex - TAU * 0.5;
      }
      measure();
      invalidate();
    },
    skipIntro() {
      if (!intro) return;
      intro = null;
      skippedAt = performance.now();
      invalidate();
    },
    setMotion(next) {
      motion = next;
      if (next === "off") intro = null;
      invalidate();
    },
    setHost(next) {
      if (next === host || disposed) return;
      io.unobserve(host);
      sizeObserver.unobserve(host);
      host = next;
      host.append(canvas);
      io.observe(host);
      sizeObserver.observe(host);
      onscreen = true;
      resize();
    },
    travel(destinationCommit, kind) {
      if (disposed) return;
      intro = null;
      const nowDays = today + 0.75;
      const range = Math.max(0.5, nowDays - destinationCommit.time);
      const passing = pick(
        commits.filter((commit) => commit.time > destinationCommit.time && commit.time <= nowDays && commit.shortSha !== destinationCommit.shortSha).reverse(),
        PLATE_LIMIT,
      );
      paintPlates(atlasCanvas, passing, fonts);
      atlas.needsUpdate = true;
      paintDestination(destinationCanvas, destinationCommit, fonts);
      destinationMap.needsUpdate = true;
      const platesInfo = passing.map((commit, i) => {
        const angle = i * 2.39996 + 0.7;
        const radius = 1.5 + ((i * 0.37) % 0.42);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.82;
        const [u, v] = plateCell(i);
        cells.setXY(i, u, v);
        tiltEuler.set(Math.sin(angle) * 0.55, -Math.cos(angle) * 0.55, 0);
        return { f: Math.min(0.97, Math.max(0.03, (nowDays - commit.time) / range)), x, y, tilt: new Quaternion().setFromEuler(tiltEuler), glow: commit.available ? 0.45 : 0 };
      });
      cells.needsUpdate = true;
      plates.count = platesInfo.length;
      const parts = dayParts(destinationCommit.day);
      const targetIndex = commits.findIndex((commit) => commit.shortSha === destinationCommit.shortSha);
      const towards = (from: number, to: number) => {
        let value = from + wrapAngle(to - from);
        while (value > from - Math.PI) value -= TAU;
        return value;
      };
      const from = { month: s.month.value, day: s.day.value, index: s.index.value };
      trip = {
        kind,
        start: performance.now(),
        target: destinationCommit,
        targetIndex,
        plates: platesInfo,
        from,
        to: {
          month: towards(from.month, monthAngle(parts.month)),
          day: towards(from.day, dayAngle(parts.date)),
          index: towards(from.index, indexAngle(Math.max(0, targetIndex))),
        },
        lastP: 0,
      };
      invalidate();
    },
    cancelTravel() {
      if (!trip) return;
      trip = null;
      plates.count = 0;
      renderPass.scene = chamber;
      s.month.value = restMonth + wrapAngle(s.month.value - restMonth);
      s.day.value = restDay + wrapAngle(s.day.value - restDay);
      s.index.value = restIndex + wrapAngle(s.index.value - restIndex);
      skippedAt = performance.now();
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      sizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const item of owned) item.dispose();
      environment.dispose();
      bloom.dispose();
      output.dispose();
      finish.dispose();
      renderPass.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
