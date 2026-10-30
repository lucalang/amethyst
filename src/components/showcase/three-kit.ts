import {
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGLRenderer,
} from "three";

/** Shared pieces of the Three.js scenes (the showcase viewer and the Vault). */

/**
 * A small studio for reflections: a softbox above, a fill behind the viewer and two strips in the theme's colours.
 * `fill` sets how bright the panel behind the viewer is; front-facing surfaces mirror it.
 */
export function studioEnvironment(renderer: WebGLRenderer, accent: Color, secondary: Color, dark: boolean, fill = 1.6): Texture {
  const scene = new Scene();
  const box = new BoxGeometry(1, 1, 1);
  const materials: MeshBasicMaterial[] = [];
  const light = (color: Color, intensity: number, position: [number, number, number], scale: [number, number, number], inside = false) => {
    const material = new MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), side: inside ? BackSide : FrontSide });
    materials.push(material);
    const mesh = new Mesh(box, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    scene.add(mesh);
  };
  const white = new Color(0xffffff);
  light(new Color(dark ? 0x121019 : 0x5c5866), 1, [0, 0, 0], [16, 16, 16], true);
  light(white, 6, [-3.4, 4.2, 2.6], [3.2, 0.15, 2.4]);
  light(new Color(0xfff2e2), fill, [0, 0.6, 7], [5, 2.6, 0.15]);
  light(accent, 4, [6, 0.6, 0.4], [0.15, 6, 1]);
  light(secondary, 3, [-6, -0.8, -0.6], [0.15, 5, 0.8]);
  light(white, 1.4, [0.4, -5.2, 1.2], [6, 0.15, 1.6]);
  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.035).texture;
  pmrem.dispose();
  box.dispose();
  for (const material of materials) material.dispose();
  return texture;
}

/** A soft round sprite (shadow or glow) painted once. */
export function radialTexture(stops: [number, string][]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [stop, color] of stops) fade.addColorStop(stop, color);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new CanvasTexture(canvas);
}

export type Spring = { value: number; target: number; velocity: number };
export const spring = (value = 0): Spring => ({ value, target: value, velocity: 0 });

/** Critically damped follow: frame-rate independent, quick to respond and never overshoots. */
export function follow(s: Spring, time: number, dt: number) {
  const omega = 2 / time;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = s.value - s.target;
  const temp = (s.velocity + omega * change) * dt;
  const next = s.target + (change + temp) * decay;
  if (change !== 0 && change < 0 === next > s.target) {
    s.value = s.target;
    s.velocity = 0;
  } else {
    s.value = next;
    s.velocity = (s.velocity - omega * temp) * decay;
  }
}
