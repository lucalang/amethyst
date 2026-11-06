import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  LinearMipmapLinearFilter,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { artworkVariantSrc } from "@/lib/attachments";
import { createFrameBaker } from "./artwork-card-3d";
import { FILM, type Director, type FilmSlide } from "./collection-film-timeline";
import { themeColors } from "./three-kit";

/** The cinematic collection showcase: a spiral tunnel of the collection's covers, bookended by a constellation. */

export type FilmEngine = {
  /** Advances and draws one frame for the given playback state. */
  frame(director: Director, dt: number): void;
  dispose(): void;
};

const FOV = 38;
const SPACING = 3.4;
const CARD_H = 2.6;
const SMALL_H = 1.15;
const WINDOW_BACK = 3;
const WINDOW_AHEAD = 11;
const MAX_TEXTURES = 56;
const LOADS = 3;
const GOLDEN = 2.39996;
const INTRO_CENTER = new Vector3(0, 0, 10);

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

const CARD_VERTEX = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const CARD_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uImageAspect;
uniform float uCardAspect;
uniform float uOpacity;
uniform float uDim;
uniform float uSheen;
uniform float uGlow;
uniform float uTime;
uniform vec3 uAccent;
uniform vec3 uAccent2;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uRadius;
varying vec2 vUv;
varying float vDepth;

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uCardAspect, 1.0);
  float d = roundedBox(p, vec2(uCardAspect, 1.0) * 0.5, uRadius);
  float aa = max(fwidth(d), 1e-4);
  float alpha = 1.0 - smoothstep(-aa, aa, d);
  if (alpha <= 0.0) discard;

  vec2 uv = vUv;
  float ratio = uCardAspect / max(uImageAspect, 1e-3);
  if (ratio < 1.0) uv.x = 0.5 + (uv.x - 0.5) * ratio;
  else uv.y = 0.5 + (uv.y - 0.5) / ratio;

  vec3 color;
  float texAlpha = 1.0;
  if (uHasMap > 0.5) {
    vec4 texel = texture2D(uMap, uv);
    color = texel.rgb;
    texAlpha = texel.a;
  } else {
    float shimmer = 0.5 + 0.5 * sin(uTime * 2.2 + vUv.y * 7.0);
    color = mix(uAccent * 0.1, uAccent2 * 0.18, vUv.y) + uAccent * 0.06 * shimmer;
  }

  float k = (vUv.x * 0.6 + (1.0 - vUv.y) * 0.4 - uSheen) * 7.0;
  color += exp(-k * k) * 0.5;
  color *= mix(1.0, 0.36, uDim);
  float rim = smoothstep(-0.035, 0.0, d);
  color = mix(color, uAccent * 1.5, rim * uGlow);

  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha * texAlpha * uOpacity);
  #include <colorspace_fragment>
}`;

const SKY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uA;
uniform vec3 uB;
uniform float uTime;
uniform float uFlash;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vUv * vec2(3.2, 2.0);
  float t = uTime * 0.035;
  float n = fbm(p + vec2(t, -t * 0.7) + fbm(p * 1.6 - t));
  float m = fbm(p * 1.3 + 4.0 - t * 0.8);
  vec3 c = uBase;
  c += uA * smoothstep(0.42, 0.95, n) * 0.5;
  c += uB * smoothstep(0.52, 1.0, m) * 0.38;
  float v = distance(vUv, vec2(0.5));
  c *= 1.0 - v * 0.95;
  c += (uA * 0.5 + uB * 0.3) * uFlash * (1.0 - v);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

const DUST_VERTEX = /* glsl */ `
uniform float uCamZ;
uniform float uTime;
uniform float uPixel;
attribute float aSeed;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 p = position;
  p.z = uCamZ + 8.0 - mod(uCamZ + 8.0 - p.z, 90.0);
  p.y += sin(uTime * 0.3 + aSeed * 6.2831) * 0.3;
  p.x += cos(uTime * 0.21 + aSeed * 4.0) * 0.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = max(-mv.z, 0.1);
  gl_PointSize = uPixel * (0.5 + aSeed) * 24.0 / depth;
  vAlpha = (1.0 - smoothstep(30.0, 85.0, depth)) * smoothstep(0.5, 3.0, depth);
  vSeed = aSeed;
  gl_Position = projectionMatrix * mv;
}`;

const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
varying float vAlpha;
varying float vSeed;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a;
  gl_FragColor = vec4(mix(uA, uB, vSeed) * a * vAlpha * 1.3, 1.0);
  #include <colorspace_fragment>
}`;

type Loaded = { texture: Texture | null; state: "loading" | "ready" | "failed"; aspect: number; used: number };
type Card = { mesh: Mesh; material: ShaderMaterial; index: number; band: Mesh | null };

/** Paints a cover-sized card for entries without artwork: their title and details on the theme's colours. */
function paintTitleCard(slide: FilmSlide, accent: Color, secondary: Color, font: string): CanvasTexture {
  const width = 512;
  const height = slide.square ? 512 : 768;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const css = (color: Color, alpha: number) => {
      const rgb = { r: 0, g: 0, b: 0 };
      color.getRGB(rgb, SRGBColorSpace);
      const { r, g, b } = rgb;
      return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${alpha})`;
    };
    ctx.fillStyle = "#0c0a12";
    ctx.fillRect(0, 0, width, height);
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, css(accent, 0.55));
    wash.addColorStop(0.55, css(accent, 0.12));
    wash.addColorStop(1, css(secondary, 0.4));
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(22, 22, width - 44, height - 44);

    const initial = [...slide.title.trim()][0]?.toUpperCase() ?? "";
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.font = `700 ${Math.round(height * 0.62)}px ${font}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(initial, width - 36, height - 40);

    ctx.textAlign = "left";
    ctx.fillStyle = css(accent, 1);
    ctx.font = `600 20px ${font}`;
    ctx.fillText("E N T R Y", 48, 72);

    ctx.font = `700 50px ${font}`;
    const words = slide.title.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width - 96 && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    const shown = lines.slice(0, 5);
    if (lines.length > 5) shown[4] = `${shown[4].replace(/\s*\S*$/, "")}…`;
    const metaHeight = slide.meta.slice(0, 2).length * 34;
    let y = height - 64 - metaHeight - (shown.length - 1) * 58;
    ctx.fillStyle = "#ffffff";
    for (const text of shown) {
      ctx.fillText(text, 48, y, width - 96);
      y += 58;
    }
    ctx.font = `500 24px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    y += 6;
    for (const text of slide.meta.slice(0, 2)) {
      ctx.fillText(text, 48, y, width - 96);
      y += 34;
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function createFilm(
  host: HTMLElement,
  { slides, sample, motion, accent: accentHex, onLost }: { slides: FilmSlide[]; sample: number[]; motion: "full" | "subtle"; accent: string | null; onLost: () => void },
): FilmEngine {
  const count = slides.length;
  const amp = motion === "full" ? 1 : 0.35;
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, motion === "full" ? 2 : 1.5));
  renderer.domElement.className = "cf-canvas";
  host.append(renderer.domElement);
  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const theme = themeColors(host);
  const accent = accentHex && /^#[0-9a-f]{6}$/i.test(accentHex) ? new Color(accentHex) : theme.accent;
  const secondary = theme.secondary;
  const base = new Color(0x050409).lerp(accent, 0.05);
  const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";

  const scene = new Scene();
  scene.background = base;
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 220);
  scene.add(camera);

  const sky = new ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: { uBase: { value: base }, uA: { value: accent }, uB: { value: secondary }, uTime: { value: 0 }, uFlash: { value: 0 } },
    depthWrite: false,
  });
  const skyGeometry = new PlaneGeometry(1, 1);
  const skyMesh = new Mesh(skyGeometry, sky);
  skyMesh.position.z = -150;
  skyMesh.renderOrder = -10;
  camera.add(skyMesh);

  const DUST = motion === "full" ? 1600 : 700;
  const dustGeometry = new BufferGeometry();
  const positions = new Float32Array(DUST * 3);
  const seeds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.5 + Math.random() ** 0.7 * 14;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = Math.sin(angle) * radius * 0.7;
    positions[i * 3 + 2] = -Math.random() * 90;
    seeds[i] = Math.random();
  }
  dustGeometry.setAttribute("position", new BufferAttribute(positions, 3));
  dustGeometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
  const dust = new ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    uniforms: { uCamZ: { value: 0 }, uTime: { value: 0 }, uPixel: { value: 1 }, uA: { value: accent }, uB: { value: secondary } },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  const dustPoints = new Points(dustGeometry, dust);
  dustPoints.frustumCulled = false;
  scene.add(dustPoints);

  const plane = new PlaneGeometry(1, 1);
  const fogDensity = 0.042;

  // Frames are baked once up front (ornaments included), shared by every entry with the same frame and cover shape.
  const baker = createFrameBaker(accent, secondary);
  const bands = new Map<string, { texture: CanvasTexture; width: number; height: number } | null>();
  function bandFor(index: number) {
    const { frame, square } = slides[index];
    if (frame === "none") return null;
    const key = `${frame}:${square}`;
    if (!bands.has(key)) {
      const band = baker.bake(frame, square ? 1 : 2 / 3);
      let entry = null;
      if (band) {
        const texture = new CanvasTexture(band.canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.anisotropy = maxAnisotropy;
        entry = { texture, width: band.width, height: band.height };
      }
      bands.set(key, entry);
    }
    return bands.get(key) ?? null;
  }
  for (let index = 0; index < count; index++) bandFor(index);
  baker.dispose();

  function cardMaterial(cardAspect: number) {
    return new ShaderMaterial({
      vertexShader: CARD_VERTEX,
      fragmentShader: CARD_FRAGMENT,
      uniforms: {
        uMap: { value: null },
        uHasMap: { value: 0 },
        uImageAspect: { value: 2 / 3 },
        uCardAspect: { value: cardAspect },
        uOpacity: { value: 1 },
        uDim: { value: 1 },
        uSheen: { value: -2 },
        uGlow: { value: 0 },
        uTime: { value: 0 },
        uAccent: { value: accent },
        uAccent2: { value: secondary },
        uFogColor: { value: base },
        uFogDensity: { value: fogDensity },
        uRadius: { value: 0.045 },
      },
      transparent: true,
      side: DoubleSide,
    });
  }

  function makeCard(index: number, framed = false): Card {
    const aspect = slides[index].square ? 1 : 2 / 3;
    const material = cardMaterial(aspect);
    const mesh = new Mesh(plane, material);
    mesh.rotation.order = "YXZ";
    scene.add(mesh);
    const frame = framed ? bandFor(index) : null;
    let band: Mesh | null = null;
    if (frame) {
      const bandAspect = (aspect * frame.width) / frame.height;
      const bandMaterial = cardMaterial(bandAspect);
      bandMaterial.uniforms.uMap.value = frame.texture;
      bandMaterial.uniforms.uHasMap.value = 1;
      bandMaterial.uniforms.uImageAspect.value = bandAspect;
      // The baked frame has its own outline (and ornaments past the corners), so no rounding here.
      bandMaterial.uniforms.uRadius.value = 0;
      band = new Mesh(plane, bandMaterial);
      band.scale.set(frame.width, frame.height, 1);
      // In front of the art: the art shows through the frame's clear centre, ornaments overlap it.
      band.position.z = 0.004;
      mesh.add(band);
    }
    return { mesh, material, index, band };
  }

  function disposeCard(card: Card) {
    scene.remove(card.mesh);
    card.material.dispose();
    (card.band?.material as ShaderMaterial | undefined)?.dispose();
  }

  // --- Artwork: loaded on demand, nearest first, and released when far away ---------------
  const textures = new Map<string, Loaded>();
  const titleCards = new Map<number, { texture: CanvasTexture; used: number }>();
  const broken = new Set<number>();
  let queue: { index: number; width: number }[] = [];
  let active = 0;
  let stamp = 0;
  let disposed = false;
  let dirty = 2;

  function pump() {
    while (!disposed && active < LOADS && queue.length) {
      const { index, width } = queue.shift()!;
      const key = `${index}:${width}`;
      if (textures.has(key) || broken.has(index)) continue;
      const entry: Loaded = { texture: null, state: "loading", aspect: 2 / 3, used: stamp };
      textures.set(key, entry);
      active += 1;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.src = `${artworkVariantSrc(slides[index].coverUrl!, width)}&cors`;
      image
        .decode()
        .then(() => {
          if (!image.naturalWidth || !image.naturalHeight) throw new Error("Artwork has no size");
          if (disposed || textures.get(key) !== entry) return;
          const texture = new Texture(image);
          texture.colorSpace = SRGBColorSpace;
          texture.anisotropy = maxAnisotropy;
          texture.minFilter = LinearMipmapLinearFilter;
          texture.needsUpdate = true;
          entry.texture = texture;
          entry.aspect = image.naturalWidth / image.naturalHeight;
          entry.state = "ready";
          dirty = Math.max(dirty, 2);
        })
        .catch(() => {
          entry.state = "failed";
          broken.add(index);
          dirty = Math.max(dirty, 2);
        })
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  }

  function plan(focus: number, seg: number) {
    const keep = new Set<string>();
    const order: { index: number; width: number }[] = [];
    const want = (index: number, width: number) => {
      if (index < 0 || index >= count || !slides[index].coverUrl || broken.has(index)) return;
      const key = `${index}:${width}`;
      keep.add(key);
      const existing = textures.get(key);
      if (existing) existing.used = stamp;
      else order.push({ index, width });
    };
    const nearEnd = focus >= count - 6;
    if (seg === 0 || seg > count) for (const index of sample) want(index, 256);
    want(focus, 512);
    want(focus + 1, 512);
    want(focus, 1024);
    for (let step = 2; step <= 4; step++) want(focus + step, 512);
    want(focus + 1, 1024);
    for (let index = focus - WINDOW_BACK; index <= focus + WINDOW_AHEAD; index++) want(index, 512);
    if (nearEnd && seg > 0 && seg <= count) for (const index of sample) want(index, 256);
    queue = order;
    pump();

    if (textures.size > MAX_TEXTURES) {
      const stale = [...textures.entries()].filter(([key, value]) => !keep.has(key) && value.state !== "loading").sort((a, b) => a[1].used - b[1].used);
      for (const [key, value] of stale.slice(0, textures.size - MAX_TEXTURES + 8)) {
        value.texture?.dispose();
        textures.delete(key);
      }
    }
    for (const [index, card] of titleCards) {
      if (Math.abs(index - focus) > WINDOW_AHEAD + 4 && !sample.includes(index)) {
        card.texture.dispose();
        titleCards.delete(index);
      }
    }
  }

  /** The sharpest artwork ready for an entry, else its title card while nothing can load. */
  function artFor(index: number): { texture: Texture | null; aspect: number } {
    const slide = slides[index];
    if (slide.coverUrl && !broken.has(index)) {
      for (const width of [1024, 512, 256]) {
        const entry = textures.get(`${index}:${width}`);
        if (entry?.state === "ready" && entry.texture) {
          entry.used = stamp;
          return { texture: entry.texture, aspect: entry.aspect };
        }
      }
      return { texture: null, aspect: 2 / 3 };
    }
    let card = titleCards.get(index);
    if (!card) {
      card = { texture: paintTitleCard(slide, accent, secondary, font), used: stamp };
      titleCards.set(index, card);
    }
    card.used = stamp;
    return { texture: card.texture, aspect: slide.square ? 1 : 2 / 3 };
  }

  function applyArt(card: Card) {
    const art = artFor(card.index);
    const uniforms = card.material.uniforms;
    uniforms.uMap.value = art.texture;
    uniforms.uHasMap.value = art.texture ? 1 : 0;
    uniforms.uImageAspect.value = art.aspect;
  }

  // --- Layout --------------------------------------------------------------------------------
  const tunnel = new Map<number, Card>();
  const constellation = sample.map((index) => {
    const card = makeCard(index);
    // Seen from further away than the tunnel, so it takes less haze.
    card.material.uniforms.uFogDensity.value = 0.016;
    return card;
  });
  const scatter = sample.map(() => new Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).normalize().multiplyScalar(22 + Math.random() * 10));
  const rolls = sample.map(() => (Math.random() - 0.5) * 0.3);

  let width = 1;
  let height = 1;
  function resize() {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const skyDepth = 150;
    skyMesh.scale.set(2 * skyDepth * tan * camera.aspect * 1.25, 2 * skyDepth * tan * 1.25, 1);
    dust.uniforms.uPixel.value = renderer.getPixelRatio() * Math.min(1.4, height / 800);
    dirty = Math.max(dirty, 2);
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const wide = () => camera.aspect > 1.2;
  /** Camera distance at which the focused card fills the stage without meeting the captions. */
  function stageDistance(index: number) {
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const frame = slides[index] ? bandFor(index) : null;
    const cardH = CARD_H * (frame?.height ?? 1);
    const cardW = CARD_H * (slides[index]?.square ? 1 : 2 / 3) * (frame?.width ?? 1);
    const byHeight = cardH / (2 * tan * (wide() ? 0.66 : 0.56));
    const byWidth = cardW / (2 * tan * camera.aspect * (wide() ? 0.5 : 0.8));
    return Math.max(byHeight, byWidth);
  }
  function stageOffset(distance: number) {
    const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
    const visibleH = 2 * distance * tan;
    return wide() ? { x: visibleH * camera.aspect * 0.15, y: 0.04 } : { x: 0, y: visibleH * 0.1 };
  }
  function slot(index: number) {
    const angle = index * GOLDEN;
    const spread = wide() ? 1 : 0.62;
    return {
      x: Math.cos(angle) * 3.8 * spread,
      y: Math.sin(angle) * 2.4,
      z: -index * SPACING,
      yaw: -Math.cos(angle) * 0.5,
      pitch: Math.sin(angle) * 0.28,
      roll: Math.sin(angle * 1.7) * 0.1,
      side: Math.cos(angle) >= 0 ? 1 : -1,
    };
  }

  // --- Frame ---------------------------------------------------------------------------------
  const camFrom = new Vector3(0, 2.2, 34);
  const lookFrom = INTRO_CENTER.clone();
  const look = INTRO_CENTER.clone();
  let lastSeg = -1;
  let lastT = -1;
  let outgoing = -1;
  let clock = 0;
  const euler = new Euler();

  function placeConstellation(center: Vector3, gather: number, burst: number, fade: number, t: number) {
    const total = constellation.length;
    constellation.forEach((card, k) => {
      const appear = easeOut(clamp01((gather - k * 0.05) / 1.8));
      const radius = 1.6 + 5.4 * Math.sqrt((k + 0.5) / Math.max(1, total));
      const angle = k * GOLDEN + clock * 0.12 * amp;
      const disc = new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, Math.sin(angle * 2) * 0.7).add(center);
      const position = scatter[k].clone().add(center).lerp(disc, appear);
      if (burst > 0) {
        const outward = disc.clone().sub(center);
        position.addScaledVector(outward, burst * 1.6);
        position.z += burst * 9;
      }
      card.mesh.position.copy(position);
      card.mesh.quaternion.copy(camera.quaternion);
      card.mesh.rotateZ(rolls[k] + Math.sin(clock * 0.4 + k) * 0.05 * amp);
      const scale = SMALL_H * (0.85 + 0.3 * ((k * 7) % 5) / 4) * (1 + 0.04 * Math.sin(t * 1.3 + k) * amp);
      const aspect = slides[card.index].square ? 1 : 2 / 3;
      card.mesh.scale.set(scale * aspect, scale, 1);
      const uniforms = card.material.uniforms;
      uniforms.uOpacity.value = appear * (1 - burst) * fade;
      uniforms.uDim.value = 0.15;
      uniforms.uGlow.value = 0.25 * appear;
      uniforms.uSheen.value = -2;
      uniforms.uTime.value = clock;
      card.mesh.visible = uniforms.uOpacity.value > 0.01;
      if (card.mesh.visible) applyArt(card);
    });
  }

  function frame(director: Director, dt: number) {
    if (disposed) return;
    const { seg, t } = director;
    const step = Math.min(dt, 0.1);
    const moving = director.playing || t !== lastT;
    lastT = t;
    if (moving) clock += step;
    stamp += 1;

    const focus = seg === 0 ? 0 : seg > count ? count - 1 : seg - 1;
    if (seg !== lastSeg) {
      outgoing = lastSeg >= 1 && lastSeg <= count ? lastSeg - 1 : -1;
      camFrom.copy(camera.position);
      lookFrom.copy(look);
      if (lastSeg === -1) camFrom.set(0, 2.2, 34);
      lastSeg = seg;
      plan(focus, seg);
      dirty = Math.max(dirty, 30);
    }
    if (!moving && dirty <= 0) return;
    dirty -= 1;

    // Tunnel window around the focused entry.
    for (const [index, card] of tunnel) {
      if (index < focus - WINDOW_BACK || index > focus + WINDOW_AHEAD) {
        disposeCard(card);
        tunnel.delete(index);
      }
    }
    for (let index = Math.max(0, focus - WINDOW_BACK); index <= Math.min(count - 1, focus + WINDOW_AHEAD); index++) {
      if (!tunnel.has(index)) tunnel.set(index, makeCard(index, true));
    }

    const distance = stageDistance(focus);
    const offset = stageOffset(distance);
    const swayX = Math.sin(clock * 0.13) * 0.22 * amp;
    const swayY = Math.cos(clock * 0.11) * 0.14 * amp;
    let tunnelFade = 1;
    let flash = 0;
    const camera0 = new Vector3();
    const look0 = new Vector3();

    if (seg === 0) {
      const a = easeOut(clamp01(t / 5));
      const b = easeInOut(clamp01((t - 5) / 2.5));
      camera0.set(swayX * b, lerp(lerp(2.2, 0.4, a), swayY, b), lerp(lerp(34, 21, a), distance, b));
      look0.set(0, 0, lerp(INTRO_CENTER.z, camera0.z - 10, b));
      tunnelFade = easeOut(clamp01((t - 3.2) / 3));
      const burst = easeInOut(clamp01((t - 4.9) / 1.9));
      placeConstellation(INTRO_CENTER, t - 0.2, burst, 1, t);
      if (motion === "full") {
        const k = (t - 5.4) * 2.2;
        flash = Math.exp(-k * k) * 0.55;
      }
    } else if (seg <= count) {
      const k = easeInOut(clamp01(t / FILM.transition));
      const hold = easeInOut(clamp01((t - FILM.transition) / (FILM.entry - FILM.transition)));
      const target = new Vector3(swayX, swayY, -focus * SPACING + distance - 0.4 * hold * amp);
      camera0.lerpVectors(camFrom, target, k);
      look0.lerpVectors(lookFrom, new Vector3(swayX * 0.4, swayY * 0.4, target.z - 10), k);
      for (const card of constellation) card.mesh.visible = false;
    } else {
      const k = easeInOut(clamp01(t / 2.6));
      const center = new Vector3(0, 0, -(count - 1) * SPACING - 16);
      const target = new Vector3(swayX, 0.9 + swayY, center.z + 15 + Math.max(0, t - 2.6) * 0.25 * amp);
      camera0.lerpVectors(camFrom, target, k);
      look0.lerpVectors(lookFrom, center, k);
      tunnelFade = 1 - easeOut(clamp01(t / 2.2)) * 0.85;
      placeConstellation(center, t - 0.6, 0, 1, t);
    }
    camera.position.copy(camera0);
    look.copy(look0);
    camera.lookAt(look);
    camera.rotateZ(Math.sin(clock * 0.09) * 0.025 * amp);
    camera.updateMatrixWorld();

    for (const [index, card] of tunnel) {
      const s = slot(index);
      let f = 0;
      if (seg >= 1 && seg <= count) {
        if (index === focus) f = easeInOut(clamp01(t / FILM.transition));
        else if (index === outgoing) f = 1 - easeInOut(clamp01(t / (FILM.transition * 0.75)));
      } else if (seg > count && index === outgoing) f = 1 - easeInOut(clamp01(t / (FILM.transition * 0.75)));

      // The leaving card starts from where its hold ended (slightly enlarged, still swaying), so nothing jumps.
      const hold =
        index === focus && seg >= 1 && seg <= count ? easeInOut(clamp01((t - FILM.transition) / (FILM.entry - FILM.transition))) : index === outgoing ? f : 0;
      const arc = Math.sin(f * Math.PI);
      const stageZ = -index * SPACING;
      const x = lerp(s.x, offset.x, f);
      const y = lerp(s.y, offset.y, f) + arc * 0.45;
      const z = lerp(s.z, stageZ, f) + arc * 0.6;
      const drift = index === focus || index === outgoing ? f : 0;
      const yaw = lerp(s.yaw, 0, f) + arc * 0.7 * s.side + Math.sin(clock * 0.5) * 0.05 * amp * drift;
      const pitch = lerp(s.pitch, 0, f) + Math.cos(clock * 0.4) * 0.03 * amp * drift;
      const roll = lerp(s.roll, 0, f);
      const scale = lerp(0.78, 1, f) * (1 + 0.05 * hold * amp);
      card.mesh.position.set(x, y, z);
      euler.set(pitch, yaw, roll, "YXZ");
      card.mesh.rotation.copy(euler);
      const aspect = slides[index].square ? 1 : 2 / 3;
      card.mesh.scale.set(CARD_H * aspect * scale, CARD_H * scale, 1);
      const uniforms = card.material.uniforms;
      uniforms.uDim.value = 1 - f;
      uniforms.uGlow.value = 0.32 * f;
      uniforms.uOpacity.value = tunnelFade * (index < focus ? 0.5 + 0.5 * f : 1);
      // The sweep starts as the card lands and is done before it leaves.
      uniforms.uSheen.value =
        index === focus && seg >= 1 && seg <= count ? lerp(-0.6, 1.8, clamp01((t - FILM.transition + 0.3) / (FILM.entry - FILM.transition + 0.2))) : -2;
      uniforms.uTime.value = clock;
      card.mesh.renderOrder = index === focus ? 2 : index === outgoing ? 1 : 0;
      if (card.band) {
        const bandUniforms = (card.band.material as ShaderMaterial).uniforms;
        for (const name of ["uOpacity", "uDim", "uSheen", "uTime"]) bandUniforms[name].value = uniforms[name].value;
        card.band.renderOrder = card.mesh.renderOrder + 1;
      }
      card.mesh.visible = uniforms.uOpacity.value > 0.01;
      if (card.mesh.visible) applyArt(card);
    }

    sky.uniforms.uTime.value = clock;
    sky.uniforms.uFlash.value = flash;
    dust.uniforms.uTime.value = clock;
    dust.uniforms.uCamZ.value = camera.position.z;
    renderer.render(scene, camera);
  }

  const handleLost = (event: Event) => {
    event.preventDefault();
    if (!disposed) onLost();
  };
  renderer.domElement.addEventListener("webglcontextlost", handleLost);

  return {
    frame,
    dispose() {
      disposed = true;
      observer.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", handleLost);
      for (const card of [...tunnel.values(), ...constellation]) disposeCard(card);
      for (const band of bands.values()) band?.texture.dispose();
      for (const entry of textures.values()) entry.texture?.dispose();
      for (const card of titleCards.values()) card.texture.dispose();
      textures.clear();
      titleCards.clear();
      plane.dispose();
      skyGeometry.dispose();
      sky.dispose();
      dustGeometry.dispose();
      dust.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
