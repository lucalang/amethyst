import {
  AdditiveBlending,
  AmbientLight,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  SpotLight,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { follow, radialTexture, spring, studioEnvironment, themeColors } from "@/components/showcase/three-kit";
import type { MotionLevel } from "@/lib/preferences";
import { createFrameGovernor } from "@/lib/render-budget";

type Finish = { body: number; trim: number; roughness: number; clearcoat: number; facets: number; beam: number };
/** Per showcase style; unknown styles use the gallery finish. */
const FINISHES: Record<string, Finish> = {
  gallery: { body: 0xe9e3d8, trim: 0xc9a45a, roughness: 0.3, clearcoat: 0.6, facets: 64, beam: 0xfff1d8 },
  cabinet: { body: 0x1b1624, trim: 0xd9bd82, roughness: 0.14, clearcoat: 1, facets: 8, beam: 0xffffff },
  desk: { body: 0x5a3922, trim: 0xb48a4e, roughness: 0.48, clearcoat: 0.35, facets: 12, beam: 0xffd59e },
};

const TOP = 1.24;
// Radius/height profile of the pedestal, from the floor up.
const PROFILE = [
  [0, 0], [1, 0], [1, 0.12], [0.9, 0.16], [0.9, 0.22], [0.72, 0.28], [0.62, 0.34],
  [0.6, 1.04], [0.72, 1.11], [0.86, 1.15], [0.86, TOP], [0, TOP],
].map(([x, y]) => new Vector2(x, y));

export type PedestalAnchor = { top: number; width: number };
export type PedestalEngine = {
  setStyle(style: string): void;
  setMotion(motion: MotionLevel): void;
  setHover(active: boolean): void;
  setPointer(x: number, y: number): void;
  dispose(): void;
};

export function createPedestal(
  host: HTMLElement,
  options: { style: string; motion: MotionLevel; entrance: boolean; onAnchor: (anchor: PedestalAnchor) => void; onFail: () => void },
): PedestalEngine {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = "pf-pedestal-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.prepend(canvas);

  const { accent, secondary, dark } = themeColors(host);
  const scene = new Scene();
  const environment = studioEnvironment(renderer, accent, secondary, dark, 1.2);
  scene.environment = environment;

  const camera = new PerspectiveCamera(30, 1, 0.1, 40);
  const look = new Vector3(0, 1.25, 0);

  const spot = new SpotLight(0xffffff, 0, 0, 0.5, 0.65, 1.6);
  spot.position.set(0, 5.2, 1.4);
  spot.target.position.set(0, TOP, 0);
  const rim = new DirectionalLight(accent, 1.4);
  rim.position.set(-2.5, 1.5, -2.5);
  const ambient = new AmbientLight(0xffffff, 0.25);
  scene.add(spot, spot.target, rim, ambient);

  const pedestal = new Group();
  scene.add(pedestal);
  const body = new MeshPhysicalMaterial({ flatShading: true });
  const trim = new MeshPhysicalMaterial({ metalness: 1, roughness: 0.28 });
  let finish = FINISHES[options.style] ?? FINISHES.gallery;
  let bodyGeometry = new LatheGeometry(PROFILE, finish.facets);
  const bodyMesh = new Mesh(bodyGeometry, body);
  const trimGeometry = new TorusGeometry(1, 0.016, 8, 96);
  const capTrim = new Mesh(trimGeometry, trim);
  capTrim.rotation.x = Math.PI / 2;
  capTrim.position.y = 1.15;
  capTrim.scale.setScalar(0.865);
  const baseTrim = new Mesh(trimGeometry, trim);
  baseTrim.rotation.x = Math.PI / 2;
  baseTrim.position.y = 0.17;
  baseTrim.scale.setScalar(0.905);
  const inlayGeometry = new RingGeometry(0.64, 0.7, 96);
  const inlay = new Mesh(inlayGeometry, new MeshBasicMaterial({ color: accent, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  inlay.rotation.x = -Math.PI / 2;
  inlay.position.y = TOP + 0.002;
  pedestal.add(bodyMesh, capTrim, baseTrim, inlay);

  const quad = new PlaneGeometry(1, 1);
  const glowTexture = radialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.45, "rgba(255,255,255,0.3)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const pool = new Mesh(quad, new MeshBasicMaterial({ map: glowTexture, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = TOP + 0.004;
  pool.scale.setScalar(1.6);
  pedestal.add(pool);

  const shadowTexture = radialTexture([
    [0, "rgba(0,0,0,0.55)"],
    [0.5, "rgba(0,0,0,0.2)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  const shadow = new Mesh(quad, new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.001;
  shadow.scale.setScalar(3.4);
  scene.add(shadow);

  // A soft cone of light falling onto the top, brightest where it lands.
  const fade = document.createElement("canvas");
  fade.width = 1;
  fade.height = 64;
  const fadeContext = fade.getContext("2d");
  if (fadeContext) {
    const gradient = fadeContext.createLinearGradient(0, 0, 0, 64);
    gradient.addColorStop(0, "#000");
    gradient.addColorStop(1, "#fff");
    fadeContext.fillStyle = gradient;
    fadeContext.fillRect(0, 0, 1, 64);
  }
  const beamTexture = new CanvasTexture(fade);
  const beamGeometry = new CylinderGeometry(0.16, 0.9, 3.4, 48, 1, true);
  const beamMaterial = new MeshBasicMaterial({ map: beamTexture, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const beam = new Mesh(beamGeometry, beamMaterial);
  beam.position.y = TOP + 1.7;
  scene.add(beam);

  function applyFinish(style: string) {
    const next = FINISHES[style] ?? FINISHES.gallery;
    if (next.facets !== finish.facets) {
      bodyGeometry.dispose();
      bodyGeometry = new LatheGeometry(PROFILE, next.facets);
      bodyMesh.geometry = bodyGeometry;
    }
    finish = next;
    body.color.set(next.body);
    body.roughness = next.roughness;
    body.clearcoat = next.clearcoat;
    trim.color.set(next.trim);
    const light = new Color(next.beam).lerp(accent, 0.18);
    spot.color.copy(light);
    beamMaterial.color.copy(light);
    pool.material.color.copy(light).lerp(accent, 0.35);
  }
  applyFinish(options.style);

  let motion = options.motion;
  const hover = spring();
  const px = spring();
  const py = spring();
  // Entrance: the pedestal rises and its light comes up.
  const rise = spring(options.entrance && motion === "full" ? 0 : 1);
  rise.target = 1;
  let spin = 0;
  let elapsed = 0;

  const top = new Vector3();
  const edge = new Vector3();
  let lastAnchor = "";
  let anchorY = Number.NaN;
  let anchorAspect = Number.NaN;
  let anchorFov = Number.NaN;
  const anchorCamera = new Vector3(Number.NaN, Number.NaN, Number.NaN);
  function anchor() {
    if (anchorY === pedestal.position.y && anchorAspect === camera.aspect && anchorFov === camera.fov && anchorCamera.equals(camera.position)) return;
    anchorY = pedestal.position.y;
    anchorAspect = camera.aspect;
    anchorFov = camera.fov;
    anchorCamera.copy(camera.position);
    top.set(0, TOP + pedestal.position.y, 0).project(camera);
    edge.set(0.86, TOP + pedestal.position.y, 0).project(camera);
    const next = { top: (1 - top.y) / 2, width: Math.abs(edge.x - top.x) };
    const key = `${next.top.toFixed(3)}|${next.width.toFixed(3)}`;
    if (key !== lastAnchor) {
      lastAnchor = key;
      options.onAnchor(next);
    }
  }

  function draw(dt: number) {
    elapsed += dt;
    follow(hover, 0.35, dt);
    follow(px, 0.6, dt);
    follow(py, 0.6, dt);
    follow(rise, 0.9, dt);
    if (motion !== "off") spin += dt * (motion === "full" ? 0.1 : 0.04);
    const lift = rise.value;
    const h = hover.value;
    pedestal.position.y = -0.3 * (1 - lift);
    pedestal.rotation.y = spin;
    const pulse = motion === "full" ? 0.06 * Math.sin(elapsed * 1.6) : 0;
    spot.intensity = (26 + 16 * h) * lift;
    beamMaterial.opacity = (0.04 + 0.05 * h) * lift;
    inlay.material.opacity = (0.45 + 0.4 * h + pulse) * lift;
    pool.material.opacity = (0.32 + 0.3 * h) * lift;
    const cameraX = px.value * 0.35;
    const cameraY = 2 + py.value * 0.12;
    if (camera.position.x !== cameraX || camera.position.y !== cameraY || camera.position.z !== 6.4) {
      camera.position.set(cameraX, cameraY, 6.4);
      camera.lookAt(look);
    }
    renderer.render(scene, camera);
    anchor();
  }

  let width = 0;
  let height = 0;
  const governor = createFrameGovernor(() => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2) * governor.scale);
    if (width && height) renderer.setSize(width, height, false);
  });
  function resize() {
    const nextWidth = host.clientWidth;
    const nextHeight = host.clientHeight;
    if (width === nextWidth && height === nextHeight) return;
    width = nextWidth;
    height = nextHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Keep the pedestal's full width in view on narrow screens.
    camera.fov = camera.aspect < 0.75 ? 30 * (0.75 / camera.aspect) ** 0.8 : 30;
    camera.updateProjectionMatrix();
    wake();
  }

  let frame = 0;
  let last = 0;
  let visible = true;
  let disposed = false;
  const settled = () => Math.abs(hover.value - hover.target) < 1e-3 && Math.abs(px.value - px.target) < 1e-3 && Math.abs(py.value - py.target) < 1e-3 && Math.abs(rise.value - 1) < 1e-3;
  function tick(now: number) {
    frame = 0;
    if (disposed || !visible || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
    last = now;
    governor.tick(now);
    draw(dt);
    // With motion off, frames stop as soon as the springs settle.
    if (visible && !document.hidden && (motion !== "off" || !settled())) frame = requestAnimationFrame(tick);
    else last = 0;
  }
  function wake() {
    if (!disposed && visible && !document.hidden && !frame && width && height) frame = requestAnimationFrame(tick);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) wake();
  });
  intersection.observe(host);
  const onVisibility = () => !document.hidden && wake();
  document.addEventListener("visibilitychange", onVisibility);
  const onLost = (event: Event) => {
    event.preventDefault();
    options.onFail();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  resize();

  return {
    setStyle(style) {
      applyFinish(style);
      wake();
    },
    setMotion(next) {
      motion = next;
      if (next === "off") rise.value = 1;
      wake();
    },
    setHover(active) {
      hover.target = active ? 1 : 0;
      wake();
    },
    setPointer(x, y) {
      if (motion === "off") return;
      px.target = x;
      py.target = y;
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onLost);
      for (const disposable of [bodyGeometry, trimGeometry, inlayGeometry, quad, beamGeometry, body, trim, inlay.material, pool.material, shadow.material, beamMaterial, glowTexture, shadowTexture, beamTexture, environment]) disposable.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
