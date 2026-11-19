import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Raycaster,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { artworkVariantSrc } from "@/lib/attachments";
import { dayNumber, dayOfU, daysInMonth, daysInYear, isoDate, MONTH_NAMES, uOfDay, yearOf, type Moment, type TimeIndex } from "@/lib/time-machine";
import { follow, radialTexture, spring, themeColors } from "../showcase/three-kit";

/**
 * The Time Machine's scene: a luminous serpentine path through the archive, one lane per calendar year. Days with
 * entries rise as glowing pillars, entries hang above them as artwork cards, and a playhead beam marks the moment
 * being viewed. The camera glides between four levels (all time, year, month, day) and dives to a card when an
 * entry is selected. Frames are only drawn while something moves, so an idle scene costs nothing.
 */

/** World size of one lane (a year) and the spacing between lanes. */
export const LANE_WIDTH = 60;
export const LANE_GAP = 16;
const RIBBON = 0.55;
const CARD_HEIGHT = 1.15;
const LOADS = 4;
const MAX_TEXTURES = 90;
const MAX_CARDS = 28;

export type TimeView = { u: number; zoom: number; selected: string | null; /** Seconds the camera takes to settle (long for the arrival). */ glide: number };

export type TimeHandlers = {
  onScrub(u: number): void;
  onZoom(zoom: number): void;
  onPickEntry(id: string): void;
  onPickDay(day: string): void;
  onTick(): void;
  onLost(): void;
};

export type TimeEngine = {
  setView(view: TimeView): void;
  /** A ring of light at the playhead, for selecting and landing. */
  pulse(): void;
  resize(): void;
  dispose(): void;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The world position of a path value: even lanes run left to right, odd lanes right to left. */
export function pathPoint(u: number, out = new Vector3()) {
  const lane = Math.max(0, Math.floor(u));
  const fraction = u - lane;
  return out.set(lane % 2 === 0 ? fraction * LANE_WIDTH : (1 - fraction) * LANE_WIDTH, 0, -lane * LANE_GAP);
}

const LEVEL_PITCH = [1.05, 0.88, 0.66, 0.4];
const YAW = 0.24;

type Card = {
  id: string;
  group: Group;
  mesh: Mesh;
  frame: Mesh;
  material: MeshBasicMaterial;
  frameMaterial: MeshBasicMaterial;
  alpha: number;
  want: number;
  to: Vector3;
  scale: number;
  aspect: number;
};

type Loaded = { texture: Texture | null; state: "loading" | "ready" | "failed"; aspect: number; used: number };

export function createTimeMachine(
  canvas: HTMLCanvasElement,
  labelHost: HTMLElement,
  index: TimeIndex,
  handlers: TimeHandlers,
  options: { animate: boolean; coarse: boolean; initial: TimeView },
): TimeEngine {
  const renderer = new WebGLRenderer({ canvas, antialias: !options.coarse, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x05040a, 1);
  const { accent, secondary } = themeColors(canvas);
  const scene = new Scene();
  scene.fog = new Fog(0x05040a, 90, 420);
  const camera = new PerspectiveCamera(50, 1, 0.1, 900);
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const lanes = yearOf(index.lastDay) - index.firstYear + 1;
  const todayU = uOfDay(index.today, index.firstYear);
  const lastU = uOfDay(index.lastDay, index.firstYear);
  const allCenter = new Vector3(LANE_WIDTH / 2, 0, -((lanes - 1) * LANE_GAP) / 2);

  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(thing: T) => {
    disposables.push(thing);
    return thing;
  };

  /* ------------------------------------------------------------------ The path ribbon and lane bands */
  const ribbonPositions: number[] = [];
  const ribbonU: number[] = [];
  const ribbonSide: number[] = [];
  const ribbonIndex: number[] = [];
  const strip = (points: { x: number; z: number; u: number }[], across: "z" | "x") => {
    const base = ribbonPositions.length / 3;
    for (const point of points) {
      for (const side of [-1, 1]) {
        ribbonPositions.push(point.x + (across === "x" ? side * RIBBON : 0), 0.02, point.z + (across === "z" ? side * RIBBON : 0));
        ribbonU.push(point.u);
        ribbonSide.push(side);
      }
    }
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = base + i * 2;
      ribbonIndex.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  };
  for (let lane = 0; lane < lanes; lane += 1) {
    const steps = 120;
    const points = Array.from({ length: steps + 1 }, (_, step) => {
      const u = lane + step / steps;
      const p = pathPoint(u);
      return { x: p.x, z: p.z, u };
    });
    strip(points, "z");
    // The hairpin link to the next lane's start: same x, one lane further back in z.
    if (lane < lanes - 1) {
      const x = lane % 2 === 0 ? LANE_WIDTH : 0;
      strip(
        [
          { x, z: -lane * LANE_GAP, u: lane + 1 },
          { x, z: -(lane + 1) * LANE_GAP, u: lane + 1 },
        ],
        "x",
      );
    }
  }
  const ribbonGeometry = own(new BufferGeometry());
  ribbonGeometry.setAttribute("position", new Float32BufferAttribute(ribbonPositions, 3));
  ribbonGeometry.setAttribute("aU", new Float32BufferAttribute(ribbonU, 1));
  ribbonGeometry.setAttribute("aSide", new Float32BufferAttribute(ribbonSide, 1));
  ribbonGeometry.setIndex(ribbonIndex);
  const ribbonMaterial = own(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uCursor: { value: 0 },
        uNow: { value: todayU },
        uReach: { value: 60 },
        uAccent: { value: accent },
        uSecondary: { value: secondary },
      },
      vertexShader: `attribute float aU; attribute float aSide; varying float vU; varying float vSide;
        void main(){ vU=aU; vSide=aSide; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform float uCursor; uniform float uNow; uniform float uReach; uniform vec3 uAccent; uniform vec3 uSecondary;
        varying float vU; varying float vSide;
        void main(){
          float edge = 1.0 - abs(vSide);
          float core = pow(edge, 2.2);
          float d = vU - uCursor;
          float near = exp(-d*d*uReach);
          float flow = 0.5 + 0.5 * sin(vU * 260.0 - uTime * 2.4);
          float future = step(uNow + 0.0005, vU);
          vec3 tint = mix(uAccent, uSecondary, smoothstep(0.0, 1.0, fract(vU)));
          vec3 color = mix(tint, vec3(1.0), core * 0.55 + near * 0.35);
          float alpha = (core * (0.5 + 0.14 * flow) + near * 1.1 * edge) * mix(1.0, 0.28, future);
          gl_FragColor = vec4(color * alpha, alpha);
        }`,
    }),
  );
  const ribbon = new Mesh(ribbonGeometry, ribbonMaterial);
  ribbon.frustumCulled = false;
  scene.add(ribbon);

  // Month bands: alternating faint panels under each lane so months read as places, not just ticks.
  const bandPositions: number[] = [];
  const bandAlpha: number[] = [];
  const bandIndex: number[] = [];
  const postPositions: number[] = [];
  for (let lane = 0; lane < lanes; lane += 1) {
    const year = index.firstYear + lane;
    const total = daysInYear(year);
    let start = 0;
    for (let month = 0; month < 12; month += 1) {
      const length = daysInMonth(year, month);
      const a = pathPoint(lane + start / total);
      const b = pathPoint(lane + (start + length) / total);
      const base = bandPositions.length / 3;
      for (const [x, z] of [
        [a.x, a.z - 2.6],
        [b.x, b.z - 2.6],
        [b.x, b.z + 2.6],
        [a.x, a.z + 2.6],
      ]) {
        bandPositions.push(x, -0.02, z);
        bandAlpha.push(month % 2 === 0 ? 0.07 : 0.025);
      }
      bandIndex.push(base, base + 1, base + 2, base, base + 2, base + 3);
      postPositions.push(a.x, 0, a.z, a.x, month === 0 ? 2.2 : 0.7, a.z);
      start += length;
    }
  }
  const bandGeometry = own(new BufferGeometry());
  bandGeometry.setAttribute("position", new Float32BufferAttribute(bandPositions, 3));
  bandGeometry.setAttribute("aAlpha", new Float32BufferAttribute(bandAlpha, 1));
  bandGeometry.setIndex(bandIndex);
  const bandMaterial = own(
    new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: { uColor: { value: accent } },
      vertexShader: `attribute float aAlpha; varying float vA; void main(){ vA=aAlpha; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ gl_FragColor=vec4(uColor*vA, vA); }`,
    }),
  );
  const bands = new Mesh(bandGeometry, bandMaterial);
  bands.frustumCulled = false;
  scene.add(bands);

  const postGeometry = own(new BufferGeometry());
  postGeometry.setAttribute("position", new Float32BufferAttribute(postPositions, 3));
  const postMaterial = own(new LineBasicMaterial({ color: accent, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false }));
  const posts = new LineSegments(postGeometry, postMaterial);
  posts.frustumCulled = false;
  scene.add(posts);

  // Year gates: a glowing arch across the path where each year begins.
  const gateGeometry = own(new TorusGeometry(2.6, 0.05, 8, 56, Math.PI));
  const gateMaterial = own(new MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }));
  for (let lane = 0; lane < lanes; lane += 1) {
    const gate = new Mesh(gateGeometry, gateMaterial);
    const start = pathPoint(lane);
    gate.position.set(start.x, 0, start.z);
    gate.rotation.y = Math.PI / 2;
    scene.add(gate);
  }

  /* ------------------------------------------------------------------------ Pillars for days with entries */
  const pillarCount = index.days.length;
  const pillarHeight = (count: number) => 0.5 + 0.55 * Math.min(count, 6);
  const pillarGeometry = own(new PlaneGeometry(1, 1));
  pillarGeometry.translate(0, 0.5, 0);
  const pillarMaterial = own(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, side: DoubleSide, toneMapped: false, depthWrite: false, blending: AdditiveBlending }));
  const pillars = new InstancedMesh(pillarGeometry, pillarMaterial, Math.max(1, pillarCount));
  pillars.frustumCulled = false;
  const glintPositions: number[] = [];
  const glintColors: number[] = [];
  const dummy = new Object3D();
  const paint = new Color();
  index.days.forEach((day, at) => {
    const u = uOfDay(day, index.firstYear);
    const p = pathPoint(u);
    const count = index.byDay.get(day)!.length;
    const height = pillarHeight(count);
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.set(0.16, height, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pillars.setMatrixAt(at, dummy.matrix);
    const season = (u - Math.floor(u)) % 1;
    paint.setHSL(0.7 + 0.32 * season, 0.85, 0.5 + Math.min(count, 5) * 0.045);
    pillars.setColorAt(at, paint);
    glintPositions.push(p.x, height, p.z);
    glintColors.push(paint.r, paint.g, paint.b);
  });
  pillars.count = pillarCount;
  pillars.instanceMatrix.needsUpdate = true;
  if (pillars.instanceColor) pillars.instanceColor.needsUpdate = true;
  scene.add(pillars);
  // A second plane crossing the first, so a pillar reads from any angle.
  const pillarsCross = new InstancedMesh(pillarGeometry, pillarMaterial, Math.max(1, pillarCount));
  pillarsCross.frustumCulled = false;
  index.days.forEach((day, at) => {
    const p = pathPoint(uOfDay(day, index.firstYear));
    const height = pillarHeight(index.byDay.get(day)!.length);
    dummy.position.set(p.x, 0, p.z);
    dummy.scale.set(0.16, height, 1);
    dummy.rotation.set(0, Math.PI / 2, 0);
    dummy.updateMatrix();
    pillarsCross.setMatrixAt(at, dummy.matrix);
    pillarsCross.setColorAt(at, paint.setRGB(glintColors[at * 3], glintColors[at * 3 + 1], glintColors[at * 3 + 2]));
  });
  pillarsCross.count = pillarCount;
  pillarsCross.instanceMatrix.needsUpdate = true;
  if (pillarsCross.instanceColor) pillarsCross.instanceColor.needsUpdate = true;
  scene.add(pillarsCross);

  const glintGeometry = own(new BufferGeometry());
  glintGeometry.setAttribute("position", new Float32BufferAttribute(glintPositions, 3));
  glintGeometry.setAttribute("color", new Float32BufferAttribute(glintColors, 3));
  const glintTexture = own(radialTexture([[0, "rgba(255,255,255,1)"], [0.25, "rgba(255,255,255,0.55)"], [1, "rgba(255,255,255,0)"]]));
  const glintMaterial = own(new PointsMaterial({ size: 0.9, map: glintTexture, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true }));
  const glints = new Points(glintGeometry, glintMaterial);
  glints.frustumCulled = false;
  scene.add(glints);

  // Dust: a few motes hanging in the air for depth.
  const dustPositions: number[] = [];
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (options.coarse ? 500 : 1100); i += 1) {
    dustPositions.push(random() * LANE_WIDTH * 1.4 - LANE_WIDTH * 0.2, random() * 14, random() * (lanes * LANE_GAP + 60) - lanes * LANE_GAP - 20 + 40);
  }
  const dustGeometry = own(new BufferGeometry());
  dustGeometry.setAttribute("position", new Float32BufferAttribute(dustPositions, 3));
  const dustMaterial = own(new PointsMaterial({ size: 0.12, color: accent, map: glintTexture, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending }));
  const dust = new Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  scene.add(dust);

  /* --------------------------------------------------------------------------- Playhead (the moment viewed) */
  const beamTexture = (() => {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 128;
    const ctx = c.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 128, 0, 0);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.5, "rgba(255,255,255,0.28)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 16, 128);
    }
    return own(new CanvasTexture(c));
  })();
  const playhead = new Group();
  const beamGeometry = own(new PlaneGeometry(0.5, 9));
  beamGeometry.translate(0, 4.5, 0);
  const beamMaterial = own(new MeshBasicMaterial({ map: beamTexture, color: accent.clone().lerp(new Color(0xffffff), 0.35), transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
  for (const rotation of [0, Math.PI / 2]) {
    const beam = new Mesh(beamGeometry, beamMaterial);
    beam.rotation.y = rotation;
    playhead.add(beam);
  }
  const ringGeometry = own(new RingGeometry(0.55, 0.66, 64));
  ringGeometry.rotateX(-Math.PI / 2);
  const ringMaterial = own(new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.position.y = 0.04;
  playhead.add(ring);
  const pulseMaterial = own(new MeshBasicMaterial({ color: secondary, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }));
  const pulseRing = new Mesh(ringGeometry, pulseMaterial);
  pulseRing.position.y = 0.05;
  playhead.add(pulseRing);
  scene.add(playhead);

  /* -------------------------------------------------------------------------------------------- Cards */
  const cardGeometry = own(new PlaneGeometry(1, 1));
  const cards = new Map<string, Card>();
  const idle: Card[] = [];
  const textures = new Map<string, Loaded>();
  const titleCards = new Map<string, CanvasTexture>();
  const queue: string[] = [];
  let active = 0;
  let stamp = 0;
  let disposed = false;

  function titleTexture(moment: Moment) {
    let texture = titleCards.get(moment.id);
    if (texture) return texture;
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 352;
    const ctx = c.getContext("2d");
    if (ctx) {
      const g = ctx.createLinearGradient(0, 0, 256, 352);
      g.addColorStop(0, "#3b2470");
      g.addColorStop(1, "#14101f");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 256, 352);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "700 120px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(Array.from(moment.title.trim())[0]?.toUpperCase() ?? "?", 128, 190);
      ctx.font = "600 22px system-ui, sans-serif";
      const words = moment.title.split(/\s+/);
      let line = "";
      let y = 250;
      for (const word of words) {
        if (ctx.measureText(`${line} ${word}`).width > 220 && line) {
          ctx.fillText(line, 128, y);
          line = word;
          y += 28;
          if (y > 320) break;
        } else line = line ? `${line} ${word}` : word;
      }
      if (y <= 320) ctx.fillText(line, 128, y);
    }
    texture = new CanvasTexture(c);
    texture.colorSpace = SRGBColorSpace;
    titleCards.set(moment.id, texture);
    return texture;
  }

  function pump() {
    while (!disposed && active < LOADS && queue.length) {
      const id = queue.shift()!;
      const moment = index.byId.get(id);
      const entry = textures.get(id);
      if (!moment?.coverUrl || !entry || entry.state !== "loading") continue;
      active += 1;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.src = `${artworkVariantSrc(moment.coverUrl, 384)}&cors`;
      image
        .decode()
        .then(() => {
          if (!image.naturalWidth || !image.naturalHeight) throw new Error("Artwork has no size");
          if (disposed || textures.get(id) !== entry) return;
          const texture = new Texture(image);
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = maxAnisotropy;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.needsUpdate = true;
          entry.texture = texture;
          entry.aspect = clamp(image.naturalWidth / image.naturalHeight, 0.5, 1.6);
          entry.state = "ready";
          wake();
        })
        .catch(() => {
          entry.state = "failed";
          wake();
        })
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function request(moment: Moment) {
    let entry = textures.get(moment.id);
    if (!entry) {
      entry = { texture: null, state: moment.coverUrl ? "loading" : "failed", aspect: moment.square ? 1 : 0.72, used: stamp };
      textures.set(moment.id, entry);
      if (moment.coverUrl) {
        queue.push(moment.id);
        pump();
      }
    }
    entry.used = stamp;
    return entry;
  }

  function evict(keep: Set<string>) {
    if (textures.size <= MAX_TEXTURES) return;
    const old = [...textures.entries()].filter(([id]) => !keep.has(id)).sort((a, b) => a[1].used - b[1].used);
    for (const [id, entry] of old.slice(0, textures.size - MAX_TEXTURES)) {
      entry.texture?.dispose();
      textures.delete(id);
    }
  }

  function takeCard(id: string): Card {
    const existing = cards.get(id);
    if (existing) return existing;
    const card =
      idle.pop() ??
      (() => {
        const material = new MeshBasicMaterial({ transparent: true, side: DoubleSide, toneMapped: false });
        const frameMaterial = new MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
        const mesh = new Mesh(cardGeometry, material);
        const frame = new Mesh(cardGeometry, frameMaterial);
        frame.position.z = -0.01;
        const group = new Group();
        group.add(frame, mesh);
        scene.add(group);
        return { id, group, mesh, frame, material, frameMaterial, alpha: 0, want: 0, to: new Vector3(), scale: 1, aspect: 0.72 } satisfies Card;
      })();
    card.id = id;
    card.mesh.userData.id = id;
    card.alpha = 0;
    card.group.visible = true;
    cards.set(id, card);
    return card;
  }

  /* ----------------------------------------------------------------------------------------- Labels */
  const labelPool: { el: HTMLElement; text: string; cls: string }[] = [];
  let labelsUsed = 0;
  const projected = new Vector3();
  function label(text: string, x: number, y: number, z: number, cls: string) {
    projected.set(x, y, z).project(camera);
    if (projected.z > 1 || Math.abs(projected.x) > 1.15 || Math.abs(projected.y) > 1.15) return;
    let item = labelPool[labelsUsed];
    if (!item) {
      const el = document.createElement("span");
      el.setAttribute("aria-hidden", "true");
      labelHost.appendChild(el);
      item = { el, text: "", cls: "" };
      labelPool.push(item);
    }
    labelsUsed += 1;
    if (item.text !== text) {
      item.el.textContent = text;
      item.text = text;
    }
    if (item.cls !== cls) {
      item.el.className = `tm-label ${cls}`;
      item.cls = cls;
    }
    item.el.style.transform = `translate(-50%, -50%) translate(${((projected.x + 1) / 2) * width}px, ${((1 - projected.y) / 2) * height}px)`;
    item.el.style.display = "";
  }

  /* ---------------------------------------------------------------------------------------- State */
  let width = 1;
  let height = 1;
  let view: TimeView = options.initial;
  const startPoint = pathPoint(view.u);
  const sx = spring(startPoint.x);
  const sz = spring(startPoint.z);
  const sZoom = spring(view.zoom);
  const sFocus = spring(view.selected ? 1 : 0);
  const sU = spring(view.u);
  let warp = 0;
  let pulse = 0;
  let layoutKey = "";
  let raf = 0;
  let last = 0;
  let clock = 0;
  let dragging = false;
  let lastDay = dayOfU(view.u, index.firstYear);
  const cardPoint = new Vector3();
  const root = labelHost.parentElement;

  function wake() {
    if (!raf && !disposed) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  }

  /** Cards wanted for the current view: the day's entries, or the covers of nearby days, closest first. */
  function layout() {
    const day = dayOfU(view.u, index.firstYear);
    const level = view.zoom;
    const wanted = new Map<string, { to: Vector3; scale: number }>();
    if (level >= 1.4 || view.selected) {
      const center = dayNumber(day);
      const radius = level >= 2.5 ? 3 : 20;
      const nearby = index.days
        .filter((d) => Math.abs(dayNumber(d) - center) <= radius)
        .sort((a, b) => Math.abs(dayNumber(a) - center) - Math.abs(dayNumber(b) - center));
      nearby.slice(0, level >= 2.5 ? 7 : 14).forEach((d, order) => {
        const entries = index.byDay.get(d)!;
        const p = pathPoint(uOfDay(d, index.firstYear));
        const top = pillarHeight(entries.length);
        if (d === day && level >= 2.5) {
          const shown = entries.slice(-10).reverse();
          shown.forEach((moment, i) => {
            const spread = (i - (shown.length - 1) / 2) * 0.95;
            wanted.set(moment.id, { to: new Vector3(p.x + spread, top + 0.9, p.z + 0.7), scale: 1 });
          });
        } else {
          const moment = entries[entries.length - 1];
          const tier = order % 3;
          wanted.set(moment.id, { to: new Vector3(p.x, top + 0.75 + tier * 1.0, p.z + (level >= 2.5 ? -1.1 : 0)), scale: level >= 2.5 ? 0.7 : 0.85 });
        }
      });
    }
    if (view.selected) {
      const moment = index.byId.get(view.selected);
      if (moment) {
        const p = pathPoint(uOfDay(moment.day, index.firstYear));
        const at = wanted.get(moment.id);
        const to = at?.to ?? new Vector3(p.x, pillarHeight(index.byDay.get(moment.day)!.length) + 0.9, p.z + 0.7);
        wanted.set(moment.id, { to, scale: 1.5 });
      }
    }
    // Keep to the pool size, preferring what is already shown.
    const ids = [...wanted.keys()].slice(0, MAX_CARDS);
    const keep = new Set(ids);
    for (const card of cards.values()) card.want = keep.has(card.id) ? 1 : 0;
    stamp += 1;
    for (const id of ids) {
      const moment = index.byId.get(id)!;
      const target = wanted.get(id)!;
      const card = takeCard(id);
      const loaded = request(moment);
      card.aspect = loaded.aspect;
      // A card appearing rises into place.
      if (card.alpha === 0 && card.want === 0) card.group.position.copy(target.to).y -= 0.8;
      card.to.copy(target.to);
      card.scale = target.scale;
      card.want = 1;
    }
    evict(keep);
  }

  function frame(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = clamp((now - last) / 1000, 0.001, 0.05);
    last = now;
    clock += dt;
    const time = options.animate ? view.glide : 0.001;

    const before = new Vector3(sx.value, 0, sz.value);
    follow(sx, time, dt);
    follow(sz, time, dt);
    follow(sU, time, dt);
    follow(sZoom, options.animate ? 0.5 : 0.001, dt);
    follow(sFocus, options.animate ? 0.7 : 0.001, dt);
    const speed = before.distanceTo(new Vector3(sx.value, 0, sz.value)) / dt;
    const warpTarget = options.animate ? clamp((speed - 18) / (LANE_WIDTH * 1.4), 0, 1) : 0;
    warp = lerp(warp, warpTarget, 1 - Math.exp(-dt * (warpTarget > warp ? 14 : 4)));
    root?.style.setProperty("--tm-warp", warp.toFixed(3));

    const zoom = sZoom.value;
    // Pose: pitch and distance interpolate between the four levels; the target slides from the whole path to the playhead.
    const tanV = Math.tan((50 * Math.PI) / 360);
    const tanH = tanV * (width / height);
    const fit = (spanX: number, spanZ: number, pitch: number) => Math.max(spanX / (2 * tanH), (spanZ * Math.sin(pitch)) / (2 * tanV)) / Math.max(0.35, Math.cos(pitch * 0.35));
    const distances = [
      fit(LANE_WIDTH * 1.18, (lanes - 1) * LANE_GAP + 16, LEVEL_PITCH[0]),
      fit(LANE_WIDTH * 1.12, 20, LEVEL_PITCH[1]),
      fit(11, 7, LEVEL_PITCH[2]),
      fit(4.2, 3.2, LEVEL_PITCH[3]),
    ];
    const z0 = clamp(zoom, 0, 3);
    const lowIndex = Math.min(2, Math.floor(z0));
    const t = smooth(z0 - lowIndex);
    const pitch = lerp(LEVEL_PITCH[lowIndex], LEVEL_PITCH[lowIndex + 1], t);
    let distance = Math.exp(lerp(Math.log(distances[lowIndex]), Math.log(distances[lowIndex + 1]), t));
    const target = new Vector3();
    if (z0 < 1) target.lerpVectors(allCenter, new Vector3(LANE_WIDTH / 2, 0, sz.value), smooth(z0));
    else if (z0 < 2) target.lerpVectors(new Vector3(LANE_WIDTH / 2, 0, sz.value), new Vector3(sx.value, 0, sz.value), smooth(z0 - 1));
    else target.set(sx.value, 0, sz.value);

    // Selected entry: dive in to its card.
    const selectedCard = view.selected ? cards.get(view.selected) : undefined;
    const focus = sFocus.value;
    const lookAt = target.clone();
    let yaw = YAW + Math.sin(sU.value * 6) * 0.04;
    let pitchNow = pitch;
    if (selectedCard && focus > 0.001) {
      cardPoint.copy(selectedCard.to);
      const cardDistance = (CARD_HEIGHT * selectedCard.scale * 1.5) / (2 * tanV);
      lookAt.lerp(cardPoint, smooth(focus));
      distance = Math.exp(lerp(Math.log(distance), Math.log(Math.max(cardDistance, 1.6)), smooth(focus)));
      pitchNow = lerp(pitch, 0.12, smooth(focus));
      yaw = lerp(yaw, 0, smooth(focus));
    }
    camera.fov = 50 + warp * 24;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.position.set(lookAt.x + Math.sin(yaw) * Math.cos(pitchNow) * distance, lookAt.y + Math.sin(pitchNow) * distance + 0.4, lookAt.z + Math.cos(yaw) * Math.cos(pitchNow) * distance);
    camera.lookAt(lookAt);

    // Materials follow the playhead.
    ribbonMaterial.uniforms.uTime.value = clock;
    ribbonMaterial.uniforms.uCursor.value = sU.value;
    ribbonMaterial.uniforms.uReach.value = lerp(60, 90000, clamp(zoom / 3, 0, 1) ** 1.4);
    playhead.position.set(sx.value, 0, sz.value);
    const beamScale = lerp(6, 0.35, clamp(zoom / 3, 0, 1) ** 0.7);
    playhead.scale.set(beamScale, lerp(2.2, 0.55, clamp(zoom / 3, 0, 1)), beamScale);
    pulse = Math.max(0, pulse - dt * 1.6);
    pulseMaterial.opacity = pulse * 0.9;
    pulseRing.scale.setScalar(1 + (1 - pulse) * 6);
    pillarMaterial.opacity = lerp(0.95, 0.75, clamp((zoom - 1.5) / 1.5, 0, 1));
    glintMaterial.size = lerp(2.4, 0.5, clamp(zoom / 3, 0, 1));

    // Cards drift to place and fade.
    let animating = false;
    for (const card of cards.values()) {
      card.alpha = lerp(card.alpha, card.want, 1 - Math.exp(-dt * (options.animate ? 9 : 400)));
      if (Math.abs(card.alpha - card.want) < 0.01) card.alpha = card.want;
      else animating = true;
      const settle = 1 - Math.exp(-dt * (options.animate ? 10 : 400));
      card.group.position.lerp(card.to, settle);
      if (card.group.position.distanceToSquared(card.to) > 0.0004) animating = true;
      card.group.rotation.y = Math.atan2(camera.position.x - card.group.position.x, camera.position.z - card.group.position.z);
      const loaded = textures.get(card.id);
      const moment = index.byId.get(card.id);
      const texture = loaded?.state === "ready" ? loaded.texture : moment && loaded?.state !== "loading" ? titleTexture(moment) : null;
      card.aspect = loaded?.state === "ready" ? loaded.aspect : moment?.square ? 1 : 0.72;
      if (card.material.map !== texture) {
        card.material.map = texture;
        card.material.needsUpdate = true;
      }
      const isSelected = card.id === view.selected;
      const pop = card.scale * (isSelected ? 1 : 1);
      card.mesh.scale.set(CARD_HEIGHT * card.aspect * pop, CARD_HEIGHT * pop, 1);
      card.frame.scale.set(CARD_HEIGHT * card.aspect * pop + 0.12, CARD_HEIGHT * pop + 0.12, 1);
      card.material.opacity = card.alpha * (texture ? 1 : 0.35);
      card.frameMaterial.opacity = card.alpha * (isSelected ? 0.95 : 0.45);
      card.group.visible = card.alpha > 0.01 || card.want > 0;
      if (card.want === 0 && card.alpha === 0) {
        cards.delete(card.id);
        card.group.visible = false;
        idle.push(card);
      }
    }

    // Labels.
    labelsUsed = 0;
    for (let lane = 0; lane < lanes; lane += 1) {
      const start = pathPoint(lane);
      label(String(index.firstYear + lane), start.x, 3.2, start.z, `tm-l-year${Math.abs(sz.value + lane * LANE_GAP) < 1 ? " is-here" : ""}`);
    }
    const here = Math.round(-sz.value / LANE_GAP);
    if (zoom > 0.6 && zoom < 2.9) {
      const year = index.firstYear + clamp(here, 0, lanes - 1);
      for (let month = 0; month < 12; month += 1) {
        const first = uOfDay(isoDate(year, month, 1), index.firstYear);
        const lastDayOfMonth = uOfDay(isoDate(year, month, daysInMonth(year, month)), index.firstYear);
        const p = pathPoint((first + lastDayOfMonth) / 2);
        label(MONTH_NAMES[month].slice(0, 3), p.x, 0.15, p.z + 3.2, "tm-l-month");
      }
    }
    if (zoom > 2.1) {
      const center = dayNumber(dayOfU(view.u, index.firstYear));
      for (let offset = -6; offset <= 6; offset += 1) {
        const iso = new Date((center + offset) * 86_400_000).toISOString().slice(0, 10);
        if (yearOf(iso) < index.firstYear || iso > index.lastDay) continue;
        const p = pathPoint(uOfDay(iso, index.firstYear));
        label(String(Number(iso.slice(8))), p.x, 0.05, p.z + 1.3, `tm-l-day${offset === 0 ? " is-here" : ""}`);
      }
    }
    if (zoom < 2.6) {
      const now = pathPoint(todayU);
      label("Today", now.x, 1.9, now.z, "tm-l-today");
    }
    for (let i = labelsUsed; i < labelPool.length; i += 1) labelPool[i].el.style.display = "none";

    renderer.render(scene, camera);

    const settled =
      Math.abs(sx.value - sx.target) < 0.002 &&
      Math.abs(sz.value - sz.target) < 0.002 &&
      Math.abs(sZoom.value - sZoom.target) < 0.002 &&
      Math.abs(sFocus.value - sFocus.target) < 0.002 &&
      Math.abs(sU.value - sU.target) < 0.00002 &&
      Math.abs(sx.velocity) + Math.abs(sz.velocity) < 0.01;
    if (!settled || animating || warp > 0.004 || pulse > 0 || dragging) wake();
    else root?.style.setProperty("--tm-warp", "0");
  }

  /* ---------------------------------------------------------------------------------------- Input */
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt: { x: number; y: number } | null = null;
  let moved = false;
  let pinch = 0;
  let laneAccum = 0;

  const ndc = (x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
  };

  /** The path value under a screen point (the nearest lane), or null if the ray misses the ground. */
  function groundU(x: number, y: number) {
    ndc(x, y);
    const { origin, direction } = raycaster.ray;
    if (Math.abs(direction.y) < 1e-4) return null;
    const t = -origin.y / direction.y;
    if (t < 0) return null;
    const px = origin.x + direction.x * t;
    const pz = origin.z + direction.z * t;
    const lane = clamp(Math.round(-pz / LANE_GAP), 0, lanes - 1);
    if (Math.abs(pz + lane * LANE_GAP) > LANE_GAP * 0.5) return null;
    const along = clamp(px / LANE_WIDTH, 0, 1);
    return clamp(lane + (lane % 2 === 0 ? along : 1 - along), 0, lastU);
  }

  function emitScrub(u: number) {
    view = { ...view, u: clamp(u, 0, lastU), glide: 0.38 };
    setTargets();
    handlers.onScrub(view.u);
    const day = dayOfU(view.u, index.firstYear);
    if (day !== lastDay) {
      lastDay = day;
      handlers.onTick();
    }
    refreshLayout();
    wake();
  }

  function setTargets() {
    const p = pathPoint(view.u);
    sx.target = p.x;
    sz.target = p.z;
    sU.target = view.u;
    sZoom.target = view.zoom;
    sFocus.target = view.selected ? 1 : 0;
  }

  function refreshLayout() {
    const key = `${dayOfU(view.u, index.firstYear)}|${view.zoom >= 2.5 ? 2 : view.zoom >= 1.4 ? 1 : 0}|${view.selected ?? ""}`;
    if (key === layoutKey) return;
    layoutKey = key;
    layout();
  }

  const onDown = (event: PointerEvent) => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      downAt = { x: event.clientX, y: event.clientY };
      moved = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      moved = true;
    }
  };

  const onMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, next);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const spread = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) {
        const zoom = clamp(view.zoom + Math.log(spread / pinch) * 2.2, 0, 3);
        view = { ...view, zoom, glide: 0.38 };
        handlers.onZoom(zoom);
        setTargets();
        refreshLayout();
        wake();
      }
      pinch = spread;
      return;
    }
    if (downAt && !moved && Math.hypot(next.x - downAt.x, next.y - downAt.y) > 6) {
      moved = true;
      dragging = true;
      canvas.style.cursor = "grabbing";
    }
    if (!moved || pointers.size !== 1) return;
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    // Screen pixels to world units at the focus depth.
    const worldPerPixel = (2 * Math.tan((50 * Math.PI) / 360) * camera.position.distanceTo(new Vector3(sx.value, 0, sz.value)) * (width / height)) / width;
    const lane = Math.max(0, Math.floor(view.u));
    const direction = lane % 2 === 0 ? 1 : -1;
    let u = view.u - ((dx * worldPerPixel) / LANE_WIDTH) * direction;
    if (view.zoom < 1.5) {
      laneAccum += (dy * worldPerPixel) / (LANE_GAP * 0.9);
      while (Math.abs(laneAccum) >= 1) {
        const step = Math.sign(laneAccum);
        u += step;
        laneAccum -= step;
      }
    }
    emitScrub(u);
  };

  const onUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (pointers.size === 0) {
      const wasDrag = dragging;
      dragging = false;
      canvas.style.cursor = "";
      laneAccum = 0;
      if (!moved && downAt) pick(event.clientX, event.clientY);
      downAt = null;
      if (wasDrag) wake();
    }
  };

  function pick(x: number, y: number) {
    ndc(x, y);
    const hit = raycaster.intersectObjects([...cards.values()].filter((card) => card.group.visible && card.want > 0).map((card) => card.mesh), false)[0];
    if (hit) {
      handlers.onPickEntry(hit.object.userData.id as string);
      return;
    }
    const pillar = raycaster.intersectObject(pillars, false)[0];
    if (pillar?.instanceId !== undefined) {
      handlers.onPickDay(index.days[pillar.instanceId]);
      return;
    }
    const u = groundU(x, y);
    if (u !== null) handlers.onPickDay(dayOfU(u, index.firstYear));
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : 1;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) && !event.ctrlKey) {
      const lane = Math.max(0, Math.floor(view.u));
      emitScrub(view.u + ((event.deltaX * scale) / 900) * (lane % 2 === 0 ? 1 : -1) * (view.zoom < 1.5 ? 0.25 : 0.04));
      return;
    }
    const zoom = clamp(view.zoom - event.deltaY * scale * (event.ctrlKey ? 0.01 : 0.0022), 0, 3);
    if (zoom === view.zoom) return;
    // Zooming in keeps the point under the cursor in view: nudge the playhead toward it.
    if (zoom > view.zoom && view.zoom < 2.2) {
      const under = groundU(event.clientX, event.clientY);
      if (under !== null) view = { ...view, u: lerp(view.u, under, 0.18) };
    }
    view = { ...view, zoom, glide: 0.38 };
    handlers.onZoom(zoom);
    handlers.onScrub(view.u);
    setTargets();
    refreshLayout();
    wake();
  };

  const onLost = (event: Event) => {
    event.preventDefault();
    handlers.onLost();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("webglcontextlost", onLost);

  /* ---------------------------------------------------------------------------------------- API */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.coarse ? 1.5 : 2));
    renderer.setSize(width, height, false);
    wake();
  }

  setTargets();
  resize();
  refreshLayout();
  // The first frame lands exactly on the starting view.
  sx.value = sx.target;
  sz.value = sz.target;
  sU.value = sU.target;
  sZoom.value = sZoom.target;

  return {
    setView(next) {
      const jump = Math.abs(next.u - view.u) > 0.0001;
      const selectedChanged = next.selected !== view.selected;
      view = next;
      setTargets();
      if (selectedChanged && next.selected) pulse = 1;
      refreshLayout();
      if (jump || selectedChanged || next.zoom !== sZoom.target) wake();
    },
    pulse() {
      pulse = 1;
      wake();
    },
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const item of labelPool) item.el.remove();
      for (const card of [...cards.values(), ...idle]) {
        card.material.dispose();
        card.frameMaterial.dispose();
        scene.remove(card.group);
      }
      for (const entry of textures.values()) entry.texture?.dispose();
      for (const texture of titleCards.values()) texture.dispose();
      pillars.dispose();
      pillarsCross.dispose();
      for (const thing of disposables) thing.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
