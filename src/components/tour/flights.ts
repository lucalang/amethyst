import { Euler, Group, type Object3D, Quaternion, Sprite, Vector3 } from "three";
import { easeOut, lerp, random, smooth } from "./pieces/kit";

/** One flying part of a set piece, wrapped so the piece can keep animating the part itself. */
type Flight = { wrap: Group; part: Object3D; fallback: Vector3; spread: number; rush: number; burst: number; lift: number; spin: Euler; delay: number };

const UNIT = new Vector3(1, 1, 1);
const dir = new Vector3();
const offset = new Vector3();
const pivot = new Vector3();
const worldScale = new Vector3();
const turn = new Quaternion();
const euler = new Euler();

/** Opens up the piece's largest groups until there are enough parts to make a flight worth watching. */
function partsOf(root: Object3D) {
  const solid = (node: Object3D) => node.children.filter((child) => !(child instanceof Sprite));
  let parts = solid(root);
  for (let guard = 0; parts.length && parts.length < 5 && guard < 4; guard++) {
    const big = parts.reduce((a, b) => (b.children.length > a.children.length ? b : a));
    if (big.children.length < 2) break;
    parts = [...parts.filter((part) => part !== big), ...solid(big)];
  }
  return parts;
}

export function rigFlights(root: Object3D, seed: number): Flight[] {
  const rand = random(seed);
  return partsOf(root).map((part) => {
    const wrap = new Group();
    part.parent?.add(wrap);
    wrap.add(part);
    const angle = rand() * Math.PI * 2;
    return {
      wrap,
      part,
      fallback: new Vector3(Math.cos(angle), Math.sin(angle) * 0.7, 0),
      spread: 2.5 + rand() * 4.5,
      rush: 14 + rand() * 24,
      burst: 4 + rand() * 5,
      // Some debris flies back past the camera, the rest drifts on along the route with it.
      lift: rand() < 0.5 ? 2 + rand() * 5 : -(4 + rand() * 10),
      spin: new Euler((rand() * 2 - 1) * 1.6, (rand() * 2 - 1) * 2, (rand() * 2 - 1) * 1.2),
      delay: rand() * 0.25,
    };
  });
}

/**
 * Arriving (`t` -1…0): parts stream in from around the camera and assemble.
 * Leaving (`t` 0…1): they burst outward past the camera and shrink away before the piece is hidden.
 */
export function fly(flights: Flight[], t: number, entrance: boolean, exit: boolean, strength: number) {
  for (const flight of flights) {
    const { wrap, part } = flight;
    const u = entrance && t < 0 ? 1 - easeOut(smooth(-0.96 + flight.delay, -0.3 + flight.delay, t)) : 0;
    const k = exit && t > 0 ? smooth(0.04 + flight.delay * 0.8, 0.75 + flight.delay * 0.8, t) : 0;
    if (!u && !k) {
      wrap.position.set(0, 0, 0);
      wrap.quaternion.identity();
      wrap.scale.copy(UNIT);
      wrap.visible = true;
      continue;
    }
    wrap.visible = u < 0.999 && k < 0.999;
    if (!wrap.visible) continue;
    // Distances are meant in world units, whatever the piece's own scale.
    const reach = strength / Math.max(0.05, wrap.parent ? wrap.parent.getWorldScale(worldScale).x : 1);
    dir.set(part.position.x, part.position.y, 0);
    if (dir.lengthSq() < 0.06) dir.copy(flight.fallback);
    dir.normalize();
    offset
      .copy(dir)
      .multiplyScalar(flight.spread * u + flight.burst * k)
      .add(pivot.set(0, k * 1.2 - u * 0.4, flight.rush * u + flight.lift * k))
      .multiplyScalar(reach);
    const swirl = (u + k) * 2.2;
    turn.setFromEuler(euler.set(flight.spin.x * swirl, flight.spin.y * swirl, flight.spin.z * swirl));
    const size = u ? lerp(0.55, 1, 1 - u) : 1 - smooth(0.65, 1, k);
    wrap.quaternion.copy(turn);
    wrap.scale.setScalar(Math.max(0.001, size));
    // Turn and scale about the part itself rather than the piece's origin.
    pivot.copy(part.position).applyQuaternion(turn).multiplyScalar(size);
    wrap.position.copy(part.position).add(offset).sub(pivot);
  }
}
