"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  AdditiveBlending,
  AmbientLight,
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
  Path,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type MeshPhysicalMaterialParameters,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { ArtworkFrameId } from "@/lib/frames";
import type { MotionLevel } from "@/lib/preferences";

const MAX_YAW = 0.85;
const MAX_PITCH = 0.5;
const DRAG_SPEED = 0.0075;
const HOVER_TILT: Record<MotionLevel, number> = { full: 0.13, subtle: 0.055, off: 0 };
const DEPTH = 0.022;
const BEVEL = 0.004;

type FrameSpec = { margin: number; band: MeshPhysicalMaterialParameters; edge: MeshPhysicalMaterialParameters };

/** The 3D build of each frame: margin (fraction of the art's short side), the band's material and the card edge. */
const SPECS: Record<ArtworkFrameId, FrameSpec> = {
  none: {
    margin: 0.012,
    band: { color: 0x141218, metalness: 0.3, roughness: 0.55 },
    edge: { color: 0x1b1822, metalness: 0.3, roughness: 0.5 },
  },
  gilt: {
    margin: 0.034,
    band: { metalness: 0.9, roughness: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.25 },
    edge: { color: 0xc9a259, metalness: 1, roughness: 0.32 },
  },
  amethyst: {
    margin: 0.052,
    band: { metalness: 0.55, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.2 },
    edge: { color: 0x6d28d9, metalness: 0.6, roughness: 0.35 },
  },
  holo: {
    margin: 0.03,
    band: { metalness: 0.3, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 820] },
    edge: { color: 0xdcd6ff, metalness: 0.55, roughness: 0.22, iridescence: 1, iridescenceIOR: 1.5 },
  },
  aurora: {
    margin: 0.026,
    band: { metalness: 0.45, roughness: 0.42 },
    edge: { color: 0x1b2442, metalness: 0.5, roughness: 0.4 },
  },
};

const PLANE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A faint, soft highlight that follows the card's tilt; additive and capped so it never washes out the art. */
const GLARE_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 uLight;
  uniform float uStrength;
  void main() {
    vec2 d = vUv - uLight;
    float spot = exp(-dot(d, d) * 5.0);
    float band = exp(-pow(d.x + d.y, 2.0) * 22.0) * 0.45;
    gl_FragColor = vec4(vec3((spot * 0.8 + band) * uStrength), 1.0);
  }
`;

/** One slow thread of light travelling around the aurora frame. */
const TRACE_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uSize;
  const float TAU = 6.2831853;
  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float angle = atan(p.y, p.x);
    float head = mod(uTime * 0.57, TAU) - 3.1415927;
    float diff = mod(angle - head + 3.1415927, TAU) - 3.1415927;
    float glow = diff < 0.0 ? exp(diff * 2.4) : exp(-diff * 28.0);
    vec3 color = mix(vec3(0.43, 0.91, 0.72), vec3(0.94, 0.67, 0.99), smoothstep(-1.4, 0.0, diff));
    gl_FragColor = vec4(color * glow * 0.85, 1.0);
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

/** A flat rounded rectangle (optionally with a rounded hole) whose UVs span its full extent. */
function panel(width: number, height: number, radius: number, hole?: { width: number; height: number; radius: number }) {
  const shape = roundedRect(new Shape(), width, height, radius);
  if (hole) shape.holes.push(roundedRect(new Path(), hole.width, hole.height, hole.radius));
  const geometry = new ShapeGeometry(shape, 14);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / height + 0.5);
  uv.needsUpdate = true;
  return geometry;
}

type Layout = { cw: number; ch: number; aw: number; ah: number; m: number; r: number; ra: number };

/** Paints the frame band (the art area is cut out of the geometry, so only the edges show). */
function paintBand(frame: ArtworkFrameId, { cw, ch, m, r, ra }: Layout): HTMLCanvasElement | null {
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
    // Scrolled corner filigree, kept inside the band.
    corners(() => {
      ctx.strokeStyle = lavender;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1.5, M * 0.075);
      const c = M * 0.5;
      ctx.beginPath();
      ctx.moveTo(c, M * 3.2);
      ctx.bezierCurveTo(c, M * 1.4, c * 0.9, c * 0.9, M * 1.4, c);
      ctx.lineTo(M * 3.2, c);
      ctx.stroke();
      for (const [x, y] of [[c, M * 3.2], [M * 3.2, c]]) {
        ctx.beginPath();
        ctx.arc(x, y, M * 0.12, 0, Math.PI * 2);
        ctx.fillStyle = "#e9d5ff";
        ctx.fill();
      }
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(Math.PI / 4);
      const g = M * 0.32;
      ctx.fillStyle = "#f0abfc";
      ctx.fillRect(-g / 2, -g / 2, g, g);
      ctx.strokeStyle = "#faf5ff";
      ctx.lineWidth = Math.max(1, M * 0.04);
      ctx.strokeRect(-g / 2, -g / 2, g, g);
      ctx.restore();
    });
    // A faceted crest centred in the top band.
    const cx = W / 2;
    const cy = M / 2;
    const gw = M * 1.5;
    const gh = M * 0.72;
    const gem = ctx.createLinearGradient(cx - gw / 2, cy - gh / 2, cx + gw / 2, cy + gh / 2);
    gem.addColorStop(0, "#fdf4ff");
    gem.addColorStop(0.45, "#c084fc");
    gem.addColorStop(1, "#581c87");
    ctx.beginPath();
    ctx.moveTo(cx - gw / 2, cy);
    ctx.lineTo(cx - gw / 4, cy - gh / 2);
    ctx.lineTo(cx + gw / 4, cy - gh / 2);
    ctx.lineTo(cx + gw / 2, cy);
    ctx.lineTo(cx, cy + gh / 2);
    ctx.closePath();
    ctx.fillStyle = gem;
    ctx.fill();
    ctx.lineWidth = Math.max(1, M * 0.045);
    ctx.strokeStyle = "#faf5ff";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - gw / 2, cy);
    ctx.lineTo(cx + gw / 2, cy);
    ctx.moveTo(cx - gw / 4, cy - gh / 2);
    ctx.lineTo(cx, cy + gh / 2);
    ctx.lineTo(cx + gw / 4, cy - gh / 2);
    ctx.strokeStyle = "rgba(250, 245, 255, 0.55)";
    ctx.stroke();
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * gw * 0.62, cy);
      ctx.lineTo(cx + side * gw * 1.5, cy);
      ctx.strokeStyle = lavender;
      ctx.lineWidth = Math.max(1, M * 0.06);
      ctx.stroke();
    }
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
  } else {
    const night = ctx.createLinearGradient(0, 0, W, H);
    night.addColorStop(0, "#111a35");
    night.addColorStop(1, "#0a0f22");
    ctx.fillStyle = night;
    ctx.fillRect(0, 0, W, H);
    line(M * 0.3, Math.max(1, M * 0.05), "rgba(196, 214, 255, 0.2)", r * scale - M * 0.3);
    line(art.x - 1, Math.max(1.5, M * 0.07), "rgba(196, 214, 255, 0.38)", art.r + 1);
  }
  return canvas;
}

function cssColor(name: string, fallback: string): Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = value.split(/[\s,]+/).map(Number);
  return parts.length >= 3 && parts.every((part) => Number.isFinite(part)) ? new Color(parts[0] / 255, parts[1] / 255, parts[2] / 255) : new Color(fallback);
}

type Callbacks = { zoom: (zoom: number) => void; ready: (src: string) => void; fail: (src: string) => void; manualRotate: () => void };

function createEngine(host: HTMLElement, cb: Callbacks) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.85;

  const camera = new PerspectiveCamera(30, 1, 0.05, 60);
  const key = new DirectionalLight(0xffffff, 1.5);
  key.position.set(-2.4, 3, 4);
  const rim = new DirectionalLight(cssColor("--accent-rgb", "#a78bfa"), 0.7);
  rim.position.set(3, -1.6, 2);
  scene.add(key, rim, new AmbientLight(0xffffff, 0.3));

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowCtx = shadowCanvas.getContext("2d");
  if (shadowCtx) {
    const alpha = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--shadow-alpha")) || 1;
    const fade = shadowCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    fade.addColorStop(0, `rgba(0,0,0,${0.55 * alpha})`);
    fade.addColorStop(1, "rgba(0,0,0,0)");
    shadowCtx.fillStyle = fade;
    shadowCtx.fillRect(0, 0, 128, 128);
  }
  const shadowTexture = new CanvasTexture(shadowCanvas);
  const shadowGeometry = new PlaneGeometry(1, 1);
  const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, toneMapped: false });
  const shadow = new Mesh(shadowGeometry, shadowMaterial);
  scene.add(shadow);

  const pivot = new Group();
  scene.add(pivot);

  const glareUniforms = { uLight: { value: [0.3, 0.75] as [number, number] }, uStrength: { value: 0.035 } };
  const traceUniforms = { uTime: { value: 0 }, uSize: { value: [1, 1] as [number, number] } };

  const state = {
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    hoverYaw: 0,
    hoverPitch: 0,
    targetHoverYaw: 0,
    targetHoverPitch: 0,
    zoom: 1,
    targetZoom: 1,
    maxZoom: 3,
    panX: 0,
    panY: 0,
    targetPanX: 0,
    targetPanY: 0,
    motion: "full" as MotionLevel,
    width: 1,
    height: 1,
    cw: 1,
    ch: 1.5,
    animated: false,
    dirty: true,
    disposed: false,
  };

  let card: { group: Group; dispose: () => void } | null = null;
  let image: HTMLImageElement | null = null;
  let src = "";
  let frame: ArtworkFrameId = "none";
  let loadToken = 0;
  let builds = 0;

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
    const spec = SPECS[frame];
    const m = spec.margin * Math.min(aw, ah);
    const cw = aw + m * 2;
    const ch = ah + m * 2;
    const r = 0.04 * Math.min(cw, ch);
    const ra = Math.min(r, Math.max(0.006, r - m * 0.6));
    const layout: Layout = { cw, ch, aw, ah, m, r, ra };
    state.cw = cw;
    state.ch = ch;

    const group = new Group();
    const front = DEPTH / 2 + BEVEL;

    const bodyShape = roundedRect(new Shape(), cw - BEVEL * 2, ch - BEVEL * 2, Math.max(0.002, r - BEVEL));
    const body = track(new ExtrudeGeometry(bodyShape, { depth: DEPTH, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 3, curveSegments: 14 }));
    body.translate(0, 0, -DEPTH / 2);
    const edge = track(new MeshPhysicalMaterial(spec.edge));
    group.add(new Mesh(body, edge));

    const bandCanvas = paintBand(frame, layout);
    const bandMap = bandCanvas ? track(new CanvasTexture(bandCanvas)) : null;
    if (bandMap) {
      bandMap.colorSpace = SRGBColorSpace;
      bandMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    const bandGeometry = track(panel(cw, ch, r, { width: aw, height: ah, radius: ra }));
    const band = new Mesh(bandGeometry, track(new MeshPhysicalMaterial({ ...spec.band, map: bandMap })));
    band.position.z = front + 0.0006;
    group.add(band);

    if (frame === "aurora") {
      traceUniforms.uSize.value = [cw, ch];
      const trace = new Mesh(
        bandGeometry,
        track(new ShaderMaterial({ uniforms: traceUniforms, vertexShader: PLANE_VERTEX, fragmentShader: TRACE_FRAGMENT, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })),
      );
      trace.position.z = front + 0.0012;
      group.add(trace);
    }
    state.animated = frame === "aurora";

    const texture = track(new Texture(image));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    const artGeometry = track(panel(aw, ah, ra));
    const art = new Mesh(artGeometry, track(new MeshBasicMaterial({ map: texture, toneMapped: false })));
    art.position.z = front + 0.0009;
    group.add(art);

    const glare = new Mesh(
      artGeometry,
      track(new ShaderMaterial({ uniforms: glareUniforms, vertexShader: PLANE_VERTEX, fragmentShader: GLARE_FRAGMENT, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false })),
    );
    glare.position.z = front + 0.0015;
    group.add(glare);

    shadow.scale.set(cw * 1.7, ch * 1.45, 1);
    shadow.position.set(0, -ch * 0.04, -0.4);

    pivot.add(group);
    card = {
      group,
      dispose: () => {
        pivot.remove(group);
        for (const item of disposables) item.dispose();
      },
    };

    // A brief settle into place when a card appears; nothing keeps moving afterwards.
    builds += 1;
    if (state.motion === "full") {
      state.yaw = builds === 1 ? -0.38 : -0.16;
      state.pitch = builds === 1 ? 0.12 : 0.05;
    } else if (state.motion === "subtle") {
      state.yaw = -0.08;
    }
    state.dirty = true;
  }

  function load(nextSrc: string) {
    const token = ++loadToken;
    src = nextSrc;
    const next = new Image();
    next.crossOrigin = "anonymous";
    next.decoding = "async";
    next.src = nextSrc;
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

  function setZoom(zoom: number, report = false) {
    const next = Math.round(Math.min(state.maxZoom, Math.max(1, zoom)) * 100) / 100;
    state.targetZoom = next;
    const limit = panLimit(next);
    state.targetPanX = Math.min(limit.x, Math.max(-limit.x, state.targetPanX));
    state.targetPanY = Math.min(limit.y, Math.max(-limit.y, state.targetPanY));
    state.dirty = true;
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
    state.dirty = true;
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // Pointer input: drag turns the card (or moves it when zoomed), two fingers pinch, the mouse tilts gently.
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { mode: "turn" | "pan"; x: number; y: number; yaw: number; pitch: number; panX: number; panY: number } | null = null;
  let pinch: { distance: number; zoom: number } | null = null;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const startDrag = (x: number, y: number) => {
    drag = { mode: state.targetZoom > 1.01 ? "pan" : "turn", x, y, yaw: state.targetYaw, pitch: state.targetPitch, panX: state.targetPanX, panY: state.targetPanY };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    state.targetHoverYaw = state.targetHoverPitch = 0;
    if (pointers.size === 2) {
      drag = null;
      pinch = { distance: spread(), zoom: state.targetZoom };
    } else if (pointers.size === 1) startDrag(event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) {
      if (event.pointerType === "mouse") {
        const rect = canvas.getBoundingClientRect();
        const tilt = HOVER_TILT[state.motion];
        state.targetHoverYaw = (((event.clientX - rect.left) / rect.width) * 2 - 1) * tilt;
        state.targetHoverPitch = (((event.clientY - rect.top) / rect.height) * 2 - 1) * tilt;
      }
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
      state.targetYaw = Math.min(MAX_YAW, Math.max(-MAX_YAW, drag.yaw + dx * DRAG_SPEED));
      state.targetPitch = Math.min(MAX_PITCH, Math.max(-MAX_PITCH, drag.pitch + dy * DRAG_SPEED));
    } else {
      const perPixel = (2 * Math.tan((camera.fov * Math.PI) / 360) * fitDistance()) / state.targetZoom / state.height;
      const limit = panLimit(state.targetZoom);
      state.targetPanX = Math.min(limit.x, Math.max(-limit.x, drag.panX - dx * perPixel));
      state.targetPanY = Math.min(limit.y, Math.max(-limit.y, drag.panY + dy * perPixel));
    }
    state.dirty = true;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (drag?.mode === "turn" && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 6 && (state.targetYaw !== drag.yaw || state.targetPitch !== drag.pitch)) {
      cb.manualRotate();
    }
    if (!pointers.delete(event.pointerId)) return;
    pinch = null;
    const [remaining] = [...pointers.values()];
    if (remaining) startDrag(remaining.x, remaining.y);
    else drag = null;
  };
  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    state.targetHoverYaw = state.targetHoverPitch = 0;
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    setZoom(state.targetZoom * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), true);
  };
  const onDoubleClick = () => {
    if (state.targetZoom > 1) {
      state.targetPanX = state.targetPanY = 0;
      setZoom(1, true);
    } else setZoom(2, true);
  };
  const onContextLost = (event: Event) => {
    event.preventDefault();
    if (!state.disposed) cb.fail(src);
  };
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", onDoubleClick);
  canvas.addEventListener("webglcontextlost", onContextLost);

  let raf = 0;
  let last = performance.now();
  const EPSILON = 0.0002;
  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = state.motion === "off" ? 1 : 1 - Math.exp(-dt * (state.motion === "subtle" ? 14 : 9));
    let moving = false;
    const ease = (from: number, to: number) => {
      const delta = to - from;
      if (Math.abs(delta) < EPSILON) return to;
      moving = true;
      return from + delta * k;
    };
    state.yaw = ease(state.yaw, state.targetYaw);
    state.pitch = ease(state.pitch, state.targetPitch);
    state.hoverYaw = ease(state.hoverYaw, state.targetHoverYaw);
    state.hoverPitch = ease(state.hoverPitch, state.targetHoverPitch);
    state.zoom = ease(state.zoom, state.targetZoom);
    state.panX = ease(state.panX, state.targetPanX);
    state.panY = ease(state.panY, state.targetPanY);
    if (state.animated && state.motion !== "off") {
      traceUniforms.uTime.value += dt * (state.motion === "subtle" ? 0.5 : 1);
      moving = true;
    }
    if (!moving && !state.dirty) return;
    state.dirty = false;

    const yaw = state.yaw + state.hoverYaw;
    const pitch = state.pitch + state.hoverPitch;
    pivot.rotation.set(pitch, yaw, 0);
    const tilt = Math.min(1, Math.hypot(yaw / MAX_YAW, pitch / MAX_PITCH));
    glareUniforms.uLight.value = [0.3 - (yaw / MAX_YAW) * 0.5, 0.72 + (pitch / MAX_PITCH) * 0.45];
    glareUniforms.uStrength.value = 0.035 + 0.075 * tilt;
    camera.position.set(state.panX, state.panY, fitDistance() / state.zoom);
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);

  return {
    setArtwork(nextSrc: string, nextFrame: ArtworkFrameId) {
      const frameChanged = nextFrame !== frame;
      frame = nextFrame;
      if (nextSrc !== src) load(nextSrc);
      else if (frameChanged && image) build();
    },
    setZoom: (zoom: number) => setZoom(zoom),
    setMaxZoom(max: number) {
      state.maxZoom = max;
    },
    setMotion(motion: MotionLevel) {
      state.motion = motion;
      if (motion === "off") state.targetHoverYaw = state.targetHoverPitch = 0;
      state.dirty = true;
    },
    reset() {
      state.targetYaw = state.targetPitch = state.targetPanX = state.targetPanY = 0;
      state.targetHoverYaw = state.targetHoverPitch = 0;
      state.targetZoom = 1;
      state.dirty = true;
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
      card?.dispose();
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      environment.dispose();
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
  zoom,
  maxZoom,
  resetKey,
  motion,
  onZoom,
  onManualRotate,
  onReady,
  onFail,
}: {
  src: string;
  frame: ArtworkFrameId;
  zoom: number;
  maxZoom: number;
  resetKey: number;
  motion: MotionLevel;
  onZoom: (zoom: number) => void;
  onManualRotate: () => void;
  onReady: (src: string) => void;
  onFail: (src: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const reportZoom = useEffectEvent((next: number) => onZoom(next));
  const reportManualRotate = useEffectEvent(() => onManualRotate());
  const reportReady = useEffectEvent((loaded: string) => onReady(loaded));
  const reportFail = useEffectEvent((failed: string) => onFail(failed));
  const initial = useEffectEvent(() => ({ src, frame, motion, maxZoom }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const start = initial();
    let engine: Engine;
    try {
      engine = createEngine(host, { zoom: reportZoom, ready: reportReady, fail: reportFail, manualRotate: reportManualRotate });
    } catch {
      reportFail(start.src);
      return;
    }
    engine.setMotion(start.motion);
    engine.setMaxZoom(start.maxZoom);
    engine.setArtwork(start.src, start.frame);
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => engineRef.current?.setArtwork(src, frame), [src, frame]);
  useEffect(() => engineRef.current?.setMotion(motion), [motion]);
  useEffect(() => engineRef.current?.setMaxZoom(maxZoom), [maxZoom]);
  useEffect(() => engineRef.current?.setZoom(zoom), [zoom]);
  useEffect(() => {
    if (resetKey) engineRef.current?.reset();
  }, [resetKey]);

  return <div ref={hostRef} className="absolute inset-0 cursor-grab select-none active:cursor-grabbing" />;
}
