import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  FogExp2,
  Group,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { follow, radialTexture, spring, studioEnvironment } from "@/components/showcase/three-kit";
import type { MotionLevel } from "@/lib/preferences";
import type { TourChapterId } from "./chapters";
import { PIECES } from "./pieces";
import { AMETHYST, canvasTexture, clamp01, easeInOut, easeOut, type Framing, type Kit, type Layout, random, ROSE, smooth, type Vec } from "./pieces/kit";

/** Distance between set pieces along the route (into the screen). */
const SPACING = 26;
/** Default camera pose per layout: the piece sits right of the copy on wide screens and above it on tall ones. */
const FRAMING: Record<Layout, Framing> = {
  wide: { camera: [-0.9, 0.7, 9], look: [-1.7, 0.1, 0], drift: [0.3, -0.12, -1.1] },
  tall: { camera: [0, -0.2, 10.5], look: [0, -2, 0], drift: [0, 0.08, -0.9] },
};
const KEY_AT = new Vector3(-2, 2, 3.2);
const RIM_AT = new Vector3(2.4, -0.8, -2.2);

const anchor = (index: number, target = new Vector3()) => target.set(0, Math.sin(index * 1.1) * 0.6, -SPACING * index);
const vec = (target: Vector3, [x, y, z]: Vec) => target.set(x, y, z);

export type TourScene = {
  /** `position` = chapter index plus travel towards the next; `drift` = 0..1 through the current chapter's hold. */
  setScroll: (position: number, drift: number) => void;
  setMotion: (motion: MotionLevel) => void;
  dispose: () => void;
};

export function createTourScene(host: HTMLElement, chapters: TourChapterId[], initialMotion: MotionLevel, onLost: () => void): TourScene {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);

  const trash: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(item: T) => {
    trash.push(item);
    return item;
  };

  let layout: Layout = host.clientWidth / Math.max(1, host.clientHeight) < 0.85 ? "tall" : "wide";
  let motion = initialMotion;

  const scene = new Scene();
  scene.fog = new FogExp2(0x05030a, 0.032);
  scene.environment = keep(studioEnvironment(renderer, new Color(AMETHYST), new Color(ROSE), true, 1.1));
  const camera = new PerspectiveCamera(40, 1, 0.1, 80);
  scene.add(new AmbientLight(0x6b5a8f, 0.35));
  const sun = new DirectionalLight(0xffffff, 1.1);
  sun.position.set(5, 6, 8);
  scene.add(sun);

  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const kit: Kit = {
    keep,
    layout,
    texture(canvas) {
      const texture = keep(canvasTexture(canvas));
      texture.anisotropy = anisotropy;
      return texture;
    },
  };
  const stops = chapters.map((id, index) => {
    const piece = PIECES[id](kit);
    const holder = new Group();
    anchor(index, holder.position);
    holder.add(piece.group);
    holder.visible = false;
    scene.add(holder);
    return { piece, holder };
  });

  // Travelling lights: they follow the camera from piece to piece and take each piece's colours.
  const keyLight = new PointLight(AMETHYST, 40, 14, 2);
  const rimLight = new PointLight(ROSE, 26, 12, 2);
  scene.add(keyLight, rimLight);

  // Dust along the whole route.
  const length = SPACING * (chapters.length - 1) + 34;
  const dustCount = Math.round((layout === "tall" ? 6 : 12) * length);
  const rand = random(21);
  const positions = new Float32Array(dustCount * 3);
  const colors = new Float32Array(dustCount * 3);
  const tint = new Color();
  const palette = [new Color(AMETHYST), new Color(ROSE), new Color(0xffffff)];
  for (let i = 0; i < dustCount; i++) {
    positions.set([(rand() * 2 - 1) * 14, (rand() * 2 - 1) * 8, 14 - rand() * length], i * 3);
    const pick = rand();
    tint.copy(palette[pick < 0.55 ? 0 : pick < 0.8 ? 1 : 2]).multiplyScalar(0.35 + rand() * 0.65);
    colors.set([tint.r, tint.g, tint.b], i * 3);
  }
  const dustGeometry = keep(new BufferGeometry());
  dustGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  dustGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const dotTexture = keep(radialTexture([[0, "rgba(255,255,255,1)"], [0.4, "rgba(255,255,255,0.35)"], [1, "rgba(255,255,255,0)"]]));
  const dust = new Points(
    dustGeometry,
    keep(new PointsMaterial({ size: 0.07, map: dotTexture, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending })),
  );
  scene.add(dust);

  const offset = new Vector3();
  /** Camera and target for a chapter's resting pose, pushed `drift` of the way through its hold. */
  function station(index: number, drift: number, position: Vector3, look: Vector3) {
    const framing = { ...FRAMING[layout], ...stops[index].piece.frame?.[layout] };
    anchor(index, position).add(vec(offset, framing.camera));
    anchor(index, look).add(vec(offset, framing.look));
    vec(offset, framing.drift);
    position.addScaledVector(offset, drift);
    look.addScaledVector(offset, drift * 0.25);
  }

  const from = new Vector3();
  const via = new Vector3();
  const to = new Vector3();
  const lookFrom = new Vector3();
  const lookTo = new Vector3();
  const look = new Vector3();
  const here = new Vector3();
  const there = new Vector3();

  function update(x: number, drift: number, clock: number, chapter: number) {
    const idle = motion === "full";
    const last = stops.length - 1;
    const index = Math.min(Math.floor(x), last);
    const f = index >= last ? 0 : x - index;
    const e = easeInOut(f);
    // Holds follow the chapter being scrolled, not the lagging camera, so content never waits for the travel to settle.
    const holdOf = (i: number) => (i < chapter ? 1 : i === chapter ? clamp01(drift) : 0);
    const still = motion === "off";
    station(index, still ? 0 : holdOf(index), from, lookFrom);
    if (f > 0) {
      station(index + 1, still ? 0 : holdOf(index + 1), to, lookTo);
      // Swing out to alternating sides between pieces.
      via.addVectors(from, to).multiplyScalar(0.5);
      via.x += index % 2 ? 2.2 : -2.2;
      via.y += 0.8;
      camera.position.copy(from).multiplyScalar((1 - e) ** 2).addScaledVector(via, 2 * (1 - e) * e).addScaledVector(to, e * e);
      look.lerpVectors(lookFrom, lookTo, e);
    } else {
      camera.position.copy(from);
      look.copy(lookFrom);
    }
    camera.lookAt(look);

    const current = stops[index].piece;
    const next = stops[Math.min(last, index + 1)].piece;
    anchor(index, here).lerp(anchor(Math.min(last, index + 1), there), e);
    keyLight.position.copy(here).add(KEY_AT);
    rimLight.position.copy(here).add(RIM_AT);
    keyLight.color.copy(current.key).lerp(next.key, e);
    rimLight.color.copy(current.rim).lerp(next.rim, e);

    stops.forEach(({ piece, holder }, i) => {
      const t = x - i;
      holder.visible = t > -1 && t < 1;
      if (!holder.visible) return;
      if (!piece.ownEntrance) holder.scale.setScalar(Math.max(0.001, easeOut(smooth(-0.85, -0.1, t))));
      piece.update({ t, hold: holdOf(i), clock, idle, layout });
    });
    dust.rotation.z = idle ? clock * 0.012 : 0;
  }

  const position = spring(0);
  const drift = spring(0);
  let chapter = 0;
  let clock = 0;
  let last = 0;
  let raf = 0;
  let dirty = true;
  let visible = !document.hidden;

  const settled = () => Math.abs(position.value - position.target) < 1e-4 && Math.abs(drift.value - drift.target) < 1e-4;

  function frame(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    if (motion === "off") {
      position.value = position.target;
      drift.value = drift.target;
    } else {
      follow(position, 0.45, dt);
      follow(drift, 0.45, dt);
    }
    if (motion === "full") clock += dt;
    update(position.value, drift.value, clock, chapter);
    renderer.render(scene, camera);
    dirty = false;
    if (motion === "full" || !settled()) schedule();
    else last = 0;
  }

  function schedule() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    layout = w / h < 0.85 ? "tall" : "wide";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, layout === "tall" ? 1.5 : 1.75));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = layout === "tall" ? 52 : 40;
    camera.updateProjectionMatrix();
    for (const { piece } of stops) piece.place?.(layout);
    dirty = true;
    schedule();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const onVisibility = () => {
    visible = !document.hidden;
    if (visible) {
      last = 0;
      if (dirty || motion === "full" || !settled()) schedule();
    } else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  document.addEventListener("visibilitychange", onVisibility);
  const onContextLost = (event: Event) => {
    event.preventDefault();
    onLost();
  };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  resize();

  return {
    setScroll(next, hold) {
      const end = stops.length - 1;
      // Reduced motion cuts between composed stills (each piece in its finished state) instead of travelling.
      position.target = motion === "off" ? Math.min(end, Math.round(next)) : Math.min(end, Math.max(0, next));
      drift.target = motion === "off" ? 1 : clamp01(hold);
      const reached = Math.floor(position.target + 1e-6);
      if (reached !== chapter) {
        // A new chapter starts its hold from the side it was entered.
        drift.value = reached > chapter ? 0 : 1;
        drift.velocity = 0;
        chapter = reached;
      }
      dirty = true;
      schedule();
    },
    setMotion(next) {
      motion = next;
      dirty = true;
      schedule();
    },
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      for (const item of trash) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
