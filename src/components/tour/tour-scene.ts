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
import type { TourChapter } from "./chapters";
import { PIECES } from "./pieces";
import { AMETHYST, canvasTexture, clamp01, easeOut, type Framing, type Kit, type Layout, lerp, random, ROSE, smooth, type Vec } from "./pieces/kit";
import { rigFlights, fly } from "./flights";
import { locate, type Timeline } from "./timeline";

/** Distance between set pieces along the route (into the screen). */
const SPACING = 26;
/** Default camera pose per layout: the piece sits right of the copy on wide screens and above it on tall ones. */
const FRAMING: Record<Layout, Framing> = {
  wide: { camera: [-0.9, 0.7, 9], look: [-1.7, 0.1, 0], drift: [0.3, -0.12, -1.1] },
  tall: { camera: [0, -0.2, 10.5], look: [0, -2, 0], drift: [0, 0.08, -0.9] },
};
const KEY_AT = new Vector3(-2, 2, 3.2);
const RIM_AT = new Vector3(2.4, -0.8, -2.2);
/**
 * `energy` scales ambient motion; `follow` = smoothing time (s) of the one scroll spring;
 * `play` = seconds a resting chapter takes to play its beat on its own.
 */
const MOTION: Record<MotionLevel, { energy: number; follow: number; play: number; clock: number }> = {
  full: { energy: 1, follow: 0.4, play: 5, clock: 1 },
  subtle: { energy: 0.4, follow: 0.45, play: 7, clock: 0.6 },
  off: { energy: 0, follow: 0, play: 0, clock: 0 },
};
/** Jumps further than this many chapters cut (with a brief dip) instead of flying through every scene. */
const CUT = 3.5;
/** How far the camera circles a resting piece as you scroll past it (radians). */
const ORBIT: Record<Layout, number> = { wide: 0.5, tall: 0.32 };
const UP = new Vector3(0, 1, 0);

const anchor = (index: number, target = new Vector3()) => target.set(0, Math.sin(index * 1.1) * 0.6, -SPACING * index);
const vec = (target: Vector3, [x, y, z]: Vec) => target.set(x, y, z);
/** Quintic ease: gentle departure and arrival, decisive middle. */
const glide = (t: number) => {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
function bezier(out: Vector3, a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number) {
  const u = 1 - t;
  return out
    .copy(a)
    .multiplyScalar(u * u * u)
    .addScaledVector(b, 3 * u * u * t)
    .addScaledVector(c, 3 * u * t * t)
    .addScaledVector(d, t * t * t);
}

export type TourScene = {
  /** Raw scroll position in viewport heights along the timeline. */
  setScroll: (scroll: number) => void;
  setMotion: (motion: MotionLevel) => void;
  dispose: () => void;
};

/** `onFrame` reports the smoothed scroll position the scene is showing, so the copy can follow the picture. */
export function createTourScene(
  host: HTMLElement,
  chapters: TourChapter[],
  timeline: Timeline,
  initialMotion: MotionLevel,
  onLost: () => void,
  onFrame: (scroll: number) => void,
): TourScene {
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
  let baseFov = 40;
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
  const stops = chapters.map((chapter, index) => {
    const piece = PIECES[chapter.id](kit);
    const holder = new Group();
    holder.add(piece.group);
    holder.visible = false;
    scene.add(holder);
    return { piece, holder, base: anchor(index), sub: Boolean(chapter.part), flights: rigFlights(piece.group, 31 + index * 7) };
  });
  const last = stops.length - 1;

  // Travelling lights: they follow the camera from piece to piece and take each piece's colours.
  const keyLight = new PointLight(AMETHYST, 40, 14, 2);
  const rimLight = new PointLight(ROSE, 26, 12, 2);
  // Rides with the camera in flight so passing parts catch the light.
  const headLight = new PointLight(0xffffff, 0, 16, 1.5);
  scene.add(keyLight, rimLight, headLight);

  // Dust along the whole route.
  const length = SPACING * last + 34;
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
  const dustMaterial = keep(
    new PointsMaterial({ size: 0.07, map: dotTexture, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }),
  );
  const dust = new Points(dustGeometry, dustMaterial);
  scene.add(dust);

  const offset = new Vector3();
  /** Camera and target for a chapter's resting pose; `drift` = scroll progress through its rest (dolly + orbit). */
  function station(index: number, drift: number, position: Vector3, look: Vector3) {
    const framing = { ...FRAMING[layout], ...stops[index].piece.frame?.[layout] };
    position.copy(stops[index].base).add(vec(offset, framing.camera));
    look.copy(stops[index].base).add(vec(offset, framing.look));
    vec(offset, framing.drift);
    position.addScaledVector(offset, drift);
    look.addScaledVector(offset, drift * 0.25);
    const side = index % 2 ? 1 : -1;
    position.sub(look).applyAxisAngle(UP, (drift - 0.5) * ORBIT[layout] * sweep * side).add(look);
  }

  /** Per chapter: how far its feature moment has played (scroll scrubs it; resting lets it play on). */
  const beats = stops.map(() => 0);
  const lastHold = stops.map(() => 0);
  /** Per chapter: scroll progress through its rest, which the camera and piece follow directly. */
  const drifts = stops.map(() => 0);
  function advanceBeats(x: number, hold: number, chapter: number, dt: number) {
    const { play } = MOTION[motion];
    for (let i = 0; i <= last; i++) {
      drifts[i] = !play ? 0.5 : i < chapter ? 1 : i > chapter ? 0 : hold;
      if (i !== chapter) {
        beats[i] = i < chapter ? 1 : 0;
        lastHold[i] = beats[i];
        continue;
      }
      if (!play) beats[i] = 1;
      else if (hold < lastHold[i] - 1e-5) beats[i] = Math.min(beats[i], hold);
      else beats[i] = Math.min(1, Math.max(hold, beats[i] + (Math.abs(x - i) < 0.15 ? dt / play : 0)));
      lastHold[i] = hold;
    }
  }

  const from = new Vector3();
  const to = new Vector3();
  const c1 = new Vector3();
  const c2 = new Vector3();
  const lookFrom = new Vector3();
  const lookTo = new Vector3();
  const look = new Vector3();
  const portal = new Vector3();
  const here = new Vector3();
  /** Brief over-exposure while passing through a portal. */
  let glare = 0;
  /** 0..1 response to scroll speed: the faster you scroll, the more the view stretches. */
  let rush = 0;
  /** Orbit strength for the current Motion level. */
  let sweep = 1;

  function placeCamera(x: number, energy: number) {
    const index = Math.min(Math.floor(x), last);
    const f = index >= last ? 0 : x - index;
    station(index, drifts[index], from, lookFrom);
    glare = 0;
    let roll = 0;
    let widen = 0;
    if (f > 0) {
      station(index + 1, drifts[index + 1], to, lookTo);
      const e = glide(f);
      const door = stops[index].piece.portal;
      if (stops[index + 1].sub && door) {
        // Dive: straight into the outgoing piece's portal (an Arcade screen), out the other side into the game.
        door.getWorldPosition(portal);
        if (e < 0.5) {
          const a = e * 2;
          bezier(camera.position, from, c1.copy(from).lerp(portal, 0.4).setY(from.y), c2.copy(portal).setZ(portal.z + 2.4), here.copy(portal).setZ(portal.z + 0.35), a);
          look.lerpVectors(lookFrom, portal, easeOut(a));
        } else {
          const b = e * 2 - 1;
          here.copy(portal).setZ(portal.z + 0.35);
          bezier(camera.position, here, c1.copy(here).setZ(here.z - 4), c2.copy(to).setZ(to.z + 5), to, b);
          look.copy(portal).setZ(portal.z - 6).lerp(lookTo, smooth(0.1, 0.9, b));
        }
        roll = Math.sin(Math.PI * e) * 0.1;
        widen = Math.sin(Math.PI * e) * 10;
        glare = Math.sin(Math.PI * e) ** 8;
      } else {
        // Swing: bank out to alternating sides, turning towards the next piece before arriving.
        const side = index % 2 ? 1 : -1;
        c1.copy(from).add(offset.set(side * 2.6, 1.2, -SPACING * 0.3));
        c2.copy(to).add(offset.set(-side * 1.1, 0.7, SPACING * 0.42));
        bezier(camera.position, from, c1, c2, to, e);
        look.lerpVectors(lookFrom, lookTo, smooth(0.05, 0.8, e));
        roll = Math.sin(Math.PI * e) * 0.06 * side;
        widen = Math.sin(Math.PI * e) * 5;
      }
      keyLight.color.copy(stops[index].piece.key).lerp(stops[index + 1].piece.key, e);
      rimLight.color.copy(stops[index].piece.rim).lerp(stops[index + 1].piece.rim, e);
      here.lerpVectors(stops[index].base, stops[index + 1].base, e);
    } else {
      camera.position.copy(from);
      look.copy(lookFrom);
      keyLight.color.copy(stops[index].piece.key);
      rimLight.color.copy(stops[index].piece.rim);
      here.copy(stops[index].base);
    }
    // A slow handheld breath while resting.
    camera.position.x += Math.sin(clock * 0.31) * 0.14 * energy;
    camera.position.y += Math.sin(clock * 0.23 + 1) * 0.09 * energy;
    const calm = Math.min(1, energy * 2.5);
    camera.up.set(Math.sin(roll * calm), Math.cos(roll * calm), 0);
    camera.lookAt(look);
    const fov = baseFov + (widen + rush * 8) * calm;
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    keyLight.position.copy(here).add(KEY_AT);
    rimLight.position.copy(here).add(RIM_AT);
    headLight.position.copy(camera.position);
    headLight.color.copy(keyLight.color);
    headLight.intensity = f > 0 ? Math.sin(Math.PI * f) * 30 : 0;
  }

  function update(x: number) {
    const { energy } = MOTION[motion];
    placeCamera(x, energy);
    const calm = Math.min(1, energy * 2.5);
    stops.forEach(({ piece, holder, base, flights }, i) => {
      const t = x - i;
      holder.visible = t > -1 && t < 1;
      if (!holder.visible) return;
      // The whole piece turns into place on arrival, follows the scroll while resting, and turns away on leaving.
      const rise = piece.ownEntrance ? 1 : easeOut(smooth(-0.9, -0.05, t));
      const away = piece.ownExit ? 0 : smooth(0.05, 0.9, t);
      holder.position.copy(base);
      holder.position.y += (rise - 1) * 0.6;
      holder.rotation.set(0, (1 - rise) * 0.5 - away * 0.25 + (drifts[i] - 0.5) * 0.3 * calm, 0);
      piece.update({ t, hold: beats[i], clock, idle: energy > 0, energy, layout });
      fly(flights, t, !piece.ownEntrance, !piece.ownExit, lerp(0.5, 1, energy));
    });
    dust.rotation.z = clock * 0.012;
    dustMaterial.size = 0.07 * (1 + rush * 1.5);
  }

  const scroll = spring(0);
  let clock = 0;
  let dip = 0;
  let lastTime = 0;
  let raf = 0;
  let dirty = true;
  let primed = false;
  let visible = !document.hidden;

  const settled = () => Math.abs(scroll.value - scroll.target) < 1e-4;

  function frame(now: number) {
    raf = 0;
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 1 / 60;
    lastTime = now;
    const config = MOTION[motion];
    if (!config.follow) {
      scroll.value = scroll.target;
      scroll.velocity = 0;
    } else {
      if (Math.abs(locate(timeline, scroll.target).x - locate(timeline, scroll.value).x) > CUT) {
        scroll.value = scroll.target - Math.sign(scroll.target - scroll.value) * 0.8;
        scroll.velocity = 0;
        dip = 1;
      }
      follow(scroll, config.follow, dt);
    }
    rush += (Math.min(1, Math.abs(scroll.velocity) / 3) - rush) * Math.min(1, dt * 5);
    sweep = lerp(0.5, 1, config.energy);
    clock += dt * config.clock;
    dip = Math.max(0, dip - dt / 0.5);
    const at = locate(timeline, scroll.value);
    const x = config.follow ? at.x : Math.min(last, Math.round(at.x));
    advanceBeats(x, at.hold, config.follow ? at.chapter : x, dt);
    update(x);
    renderer.toneMappingExposure = 1.1 * (1 - dip * dip * 0.9) * (1 + glare * 0.8);
    renderer.render(scene, camera);
    onFrame(scroll.value);
    dirty = false;
    // Resting chapters keep playing (their beat, then ambient motion) unless Motion is off.
    if (config.energy > 0 || !settled()) schedule();
    else lastTime = 0;
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
    baseFov = layout === "tall" ? 52 : 40;
    camera.fov = baseFov;
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
      lastTime = 0;
      if (dirty || MOTION[motion].energy > 0 || !settled()) schedule();
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
    setScroll(next) {
      scroll.target = Math.min(timeline.end, Math.max(0, next));
      // The first position (e.g. a deep link) is shown directly rather than flown to.
      if (!primed) scroll.value = scroll.target;
      primed = true;
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
