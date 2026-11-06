import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  InstancedMesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  Object3D,
  OrthographicCamera,
  PointLight,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { studioEnvironment, themeColors } from "@/components/showcase/three-kit";

/** Glass tint per showcase style ([light, dark] theme); unknown styles use the gallery tint. */
const TINTS: Record<string, [number, number]> = {
  gallery: [0xf2ede4, 0x2a2434],
  cabinet: [0x2a2236, 0x18131f],
  desk: [0x7a5233, 0x4a3020],
};

const FADE_IN = 0.18;
const SPREAD = 0.6;
const FLIGHT = 0.75;

/** Plays the shatter reveal once over `host`, then disposes itself and calls `onDone`. Returns an early stop. */
export function playOpening(host: HTMLElement, options: { style: string; origin: { x: number; y: number }; onDone: () => void }) {
  const width = host.clientWidth;
  const height = host.clientHeight;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(width, height, false);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const { accent, secondary, dark } = themeColors(host);
  const scene = new Scene();
  const environment = studioEnvironment(renderer, accent, secondary, dark, 1.4);
  scene.environment = environment;
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -2000, 2000);

  const key = new DirectionalLight(0xffffff, 1.4);
  key.position.set(-0.4, 0.6, 1);
  const sweep = new PointLight(accent, 4, 0, 0);
  scene.add(key, sweep, new AmbientLight(0xffffff, 0.35));

  const cell = Math.max(44, Math.ceil(Math.sqrt((width * height) / 520)));
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const geometry = new BoxGeometry(cell * 1.02, cell * 1.02, cell * 0.14);
  const tint = new Color((TINTS[options.style] ?? TINTS.gallery)[dark ? 1 : 0]).lerp(accent, 0.12);
  const material = new MeshPhysicalMaterial({ color: tint, metalness: 0.2, roughness: 0.28, clearcoat: 1, transparent: true, opacity: 0 });
  const shards = new InstancedMesh(geometry, material, cols * rows);
  shards.instanceMatrix.setUsage(DynamicDrawUsage);
  scene.add(shards);

  // Shards break away from the portrait outward, each on its own tumble.
  const ox = options.origin.x - width / 2;
  const oy = height / 2 - options.origin.y;
  const reach = Math.hypot(Math.max(Math.abs(ox - width / 2), Math.abs(ox + width / 2)), Math.max(Math.abs(oy - height / 2), Math.abs(oy + height / 2))) || 1;
  const travel = Math.max(width, height) * 0.45;
  const pieces = Array.from({ length: cols * rows }, (_, i) => {
    const x = -width / 2 + ((i % cols) + 0.5) * cell;
    const y = height / 2 - (Math.floor(i / cols) + 0.5) * cell;
    const dx = x - ox;
    const dy = y - oy;
    const distance = Math.hypot(dx, dy) || 1;
    return {
      base: new Vector3(x, y, 0),
      dir: new Vector3(dx / distance + (Math.random() - 0.5) * 0.4, dy / distance + (Math.random() - 0.5) * 0.4, 0),
      axis: new Vector3(Math.random() - 0.5, Math.random() - 0.5, (Math.random() - 0.5) * 0.4).normalize(),
      spin: 1.6 + Math.random() * 1.8,
      delay: (distance / reach) * SPREAD + Math.random() * 0.08,
    };
  });
  const total = FADE_IN + SPREAD + 0.08 + FLIGHT;

  const dummy = new Object3D();
  const turn = new Quaternion();
  function pose(time: number) {
    const fade = Math.min(1, time / FADE_IN);
    material.opacity = 0.9 * fade;
    pieces.forEach((piece, i) => {
      const p = Math.min(1, Math.max(0, (time - FADE_IN - piece.delay) / FLIGHT));
      const e = p * p;
      dummy.position.copy(piece.base).addScaledVector(piece.dir, e * travel);
      dummy.position.z = e * 600;
      dummy.quaternion.copy(turn.setFromAxisAngle(piece.axis, e * piece.spin));
      dummy.scale.setScalar(p >= 1 ? 0 : (0.94 + 0.06 * fade) * (1 - e * 0.8));
      dummy.updateMatrix();
      shards.setMatrixAt(i, dummy.matrix);
    });
    shards.instanceMatrix.needsUpdate = true;
    const s = Math.min(1, time / (FADE_IN + SPREAD));
    sweep.position.set(-width / 2 - 120 + s * (width + 240), height / 2 + 80 - s * (height + 160), 260);
    sweep.intensity = 4 * Math.sin(Math.PI * s);
    renderer.render(scene, camera);
  }

  let frame = 0;
  let start = 0;
  let stopped = false;
  function tick(now: number) {
    start ||= now;
    const time = (now - start) / 1000;
    pose(time);
    if (time >= total) stop();
    else frame = requestAnimationFrame(tick);
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    geometry.dispose();
    material.dispose();
    shards.dispose();
    environment.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
    options.onDone();
  }
  canvas.addEventListener("webglcontextlost", stop);
  frame = requestAnimationFrame(tick);
  return stop;
}
