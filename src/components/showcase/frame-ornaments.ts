import {
  BufferGeometry,
  CubicBezierCurve3,
  CurvePath,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LineCurve3,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
  type Curve,
  type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FrameLookId } from "@/lib/frames";

/** Card measurements an ornament builds against: band size, band width, art short side and the band's top surface. */
export type OrnamentBox = { bw: number; bh: number; m: number; s: number; z: number };
type Track = <T extends BufferGeometry | Material>(item: T) => T;
type Pt = [x: number, y: number];
type Pt3 = [x: number, y: number, h: number];

/** Joins parts into one geometry (position + normal), so each ornament costs one draw call per material. */
function merge(parts: BufferGeometry[]): BufferGeometry {
  const flat = parts.map((part) => {
    const out = part.index ? part.toNonIndexed() : part;
    if (out !== part) part.dispose();
    out.deleteAttribute("uv");
    return out;
  });
  const merged = mergeGeometries(flat);
  for (const part of flat) part.dispose();
  if (!merged) throw new Error("Ornament parts could not be merged");
  return merged;
}

/** A round wire along a curve, with bead caps so the ends read as finished metal. */
function wire(curve: Curve<Vector3>, radius: number, segments: number, beads: [start: number, end: number] = [1, 1]): BufferGeometry[] {
  const parts: BufferGeometry[] = [new TubeGeometry(curve, segments, radius, 8, false)];
  beads.forEach((scale, i) => {
    if (!scale) return;
    const p = curve.getPoint(i);
    parts.push(new SphereGeometry(radius * scale, 10, 8).translate(p.x, p.y, p.z));
  });
  return parts;
}

function loop(points: Vector3[]) {
  const path = new CurvePath<Vector3>();
  points.forEach((p, i) => path.add(new LineCurve3(p, points[(i + 1) % points.length])));
  return path;
}

/** A cut stone on the xy plane: girdle outline at z 0, a raised table with crown facets, a pavilion point behind. */
function gem(outline: Pt[], crown: number, pavilion: number, table = 0.42): BufferGeometry {
  const area = outline.reduce((sum, [x, y], i) => sum + x * outline[(i + 1) % outline.length][1] - outline[(i + 1) % outline.length][0] * y, 0);
  const ring = area < 0 ? [...outline].reverse() : outline;
  const cx = ring.reduce((sum, [x]) => sum + x, 0) / ring.length;
  const cy = ring.reduce((sum, [, y]) => sum + y, 0) / ring.length;
  const top = ring.map(([x, y]): Pt => [cx + (x - cx) * table, cy + (y - cy) * table]);
  const position: number[] = [];
  const tri = (...corners: [number, number, number][]) => corners.forEach((c) => position.push(...c));
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length];
    const [tax, tay] = top[i];
    const [tbx, tby] = top[(i + 1) % ring.length];
    tri([ax, ay, 0], [bx, by, 0], [tbx, tby, crown]);
    tri([ax, ay, 0], [tbx, tby, crown], [tax, tay, crown]);
    tri([bx, by, 0], [ax, ay, 0], [cx, cy, -pavilion]);
  });
  top.forEach((a, i) => tri([cx, cy, crown], [...a, crown], [...top[(i + 1) % top.length], crown]));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(position, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** One pillowy feather pointing along +y from its quill at the origin. */
function feather(length: number, width: number, thickness: number) {
  const vane = new Shape();
  vane.moveTo(0, 0);
  vane.bezierCurveTo(width * 0.55, length * 0.15, width * 0.62, length * 0.62, width * 0.1, length);
  vane.bezierCurveTo(-width * 0.2, length * 0.86, -width * 0.48, length * 0.56, -width * 0.4, length * 0.26);
  vane.quadraticCurveTo(-width * 0.26, length * 0.05, 0, 0);
  const bevel = Math.min(thickness, width * 0.18);
  return new ExtrudeGeometry(vane, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.8, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 }).translate(0, 0, -thickness / 2);
}

/** Places one mesh per corner, mirroring the top-left build (three flips the winding for negative scales). */
function corners(group: Group, geometry: BufferGeometry, material: Material) {
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(sx, sy, 1);
    group.add(mesh);
  }
}

/**
 * Amethyst filigree, built from the frame picker's SVG (40-unit corner, 40×20 crest): raised wire scrolls that
 * arch off the band with curled ends, cut gems at the corners, and a faceted crest standing above the top edge.
 */
function amethyst({ bw, bh, m, s, z }: OrnamentBox, track: Track) {
  const group = new Group();
  const metal = track(new MeshPhysicalMaterial({ color: 0xe6d3ff, metalness: 1, roughness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.18, emissive: 0x3b0764, emissiveIntensity: 0.45 }));
  const stone = track(
    new MeshPhysicalMaterial({ color: 0xc89bff, metalness: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.45, iridescenceIOR: 1.7, emissive: 0x6d28d9, emissiveIntensity: 0.4, flatShading: true }),
  );

  // Top-left corner in preview units, measured inward from the corner and overhanging the outer edge by one unit.
  const u = (s * 0.26) / 40;
  const r = u * 1.25;
  const lift = z + r * 0.7;
  const at = ([x, y, h]: Pt3) => new Vector3(-bw / 2 + (x - 3.5) * u, bh / 2 - (y - 3.5) * u, lift + h * u);
  const swap = (points: Pt3[]): Pt3[] => points.map(([x, y, h]) => [y, x, h]);
  const bezier = (points: Pt3[], map = at) => new CubicBezierCurve3(...(points.map(map) as [Vector3, Vector3, Vector3, Vector3]));
  const hook = (a: Pt3[], b: Pt3[]) => {
    const path = new CurvePath<Vector3>();
    path.add(bezier(a));
    path.add(bezier(b));
    return path;
  };
  const curlA: Pt3[] = [[2.5, 31, 0], [2.3, 34, 0.7], [5.1, 35.6, 1.4], [7.1, 33.6, 1.9]];
  const curlB: Pt3[] = [[7.1, 33.6, 1.9], [8.5, 32.2, 2.2], [7.3, 30.2, 2.4], [5.7, 30.8, 2.5]];
  const scroll: Pt3[] = [[5.2, 15, 0.3], [2.6, 17.4, 1.1], [2.4, 21, 1.1], [4.6, 23.6, 0.3]];
  const diamond: Pt[] = [[5, 0.8], [9.2, 5], [5, 9.2], [0.8, 5]];
  const corner = track(
    merge([
      ...wire(bezier([[2.5, 31, 0], [1.5, 12, 2.6], [12, 1.5, 2.6], [31, 2.5, 0]]), r, 56, [0, 0]),
      ...wire(hook(curlA, curlB), r * 0.9, 36, [0, 1.5]),
      ...wire(hook(swap(curlA), swap(curlB)), r * 0.9, 36, [0, 1.5]),
      ...wire(bezier(scroll), r * 0.7, 16),
      ...wire(bezier(swap(scroll)), r * 0.7, 16),
      ...wire(loop(diamond.map(([x, y]) => at([x, y, 1.2]))), r * 0.5, 32, [0, 0]),
    ]),
  );
  corners(group, corner, metal);
  const cornerGem = track(gem(diamond.map(([x, y]): Pt => { const p = at([x, y, 0]); return [p.x, p.y]; }), u * 3.4, u * 1.4).translate(0, 0, lift + u * 0.9));
  corners(group, cornerGem, stone);

  // The crest: its point rests on the top band, the stone and its wings stand above the card's edge.
  const c = (s * 0.3) / 40;
  const base = bh / 2 - m / 2;
  const cr = ([x, y, h]: Pt3) => new Vector3((x - 20) * c, base + (19 - y) * c, lift + h * c);
  const kite: Pt[] = [[20, 1], [27, 9], [20, 19], [13, 9]];
  const wing: Pt3[] = [[15.6, 13.2, 1.4], [10, 13.6, 1.8], [5.5, 11.2, 1.6], [2.5, 7.5, 0.8]];
  const mirrorX = (points: Pt3[]): Pt3[] => points.map(([x, y, h]) => [40 - x, y, h]);
  const crest = track(
    merge([
      ...wire(loop(kite.map(([x, y]) => cr([x, y, 2.2]))), c * 0.7, 48, [0, 0]),
      ...wire(bezier(wing, cr), c * 0.85, 24, [0, 1.6]),
      ...wire(bezier(mirrorX(wing), cr), c * 0.85, 24, [0, 1.6]),
      ...[[4.5, 12.5], [35.5, 12.5]].map(([x, y]) => {
        const p = cr([x, y, 1.6]);
        return new SphereGeometry(c * 1.1, 12, 10).translate(p.x, p.y, p.z);
      }),
    ]),
  );
  group.add(new Mesh(crest, metal));
  const crestGem = track(gem(kite.map(([x, y]): Pt => { const p = cr([x, y, 0]); return [p.x, p.y]; }), c * 5, c * 2.5).translate(0, 0, lift + c * 1.6));
  group.add(new Mesh(crestGem, stone));
  return group;
}

/**
 * Seraph wings: layered pearl feathers fan out from behind the frame's shoulders,
 * under a tilted golden halo holding a star-cut stone.
 */
function seraph({ bw, bh, m, s, z }: OrnamentBox, track: Track) {
  const group = new Group();
  const pearl = track(new MeshPhysicalMaterial({ color: 0xf7efe2, metalness: 0, roughness: 0.4, sheen: 1, sheenColor: 0xffe2a8, sheenRoughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  const gold = track(new MeshPhysicalMaterial({ color: 0xe8c074, metalness: 1, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.18, emissive: 0x4a300a, emissiveIntensity: 0.5 }));
  const star = track(
    new MeshPhysicalMaterial({ color: 0xfff1cc, metalness: 0.3, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.6, iridescenceIOR: 1.5, emissive: 0xffc861, emissiveIntensity: 0.3, flatShading: true }),
  );

  // Right wing, built around its root on the band's outer edge; the left wing is its mirror image.
  const root = new Vector3(bw / 2 - m * 0.25, bh / 2 - s * 0.2, 0);
  const tiers: { z: number; width: number; lift: number; feathers: [angle: number, length: number][]; shaft: boolean }[] = [
    { z: 0, width: 0.07, lift: 0, shaft: true, feathers: [[6, 0.24], [16, 0.32], [26, 0.38], [36, 0.41], [46, 0.4], [56, 0.36], [66, 0.3], [76, 0.23]] },
    { z: z * 0.55, width: 0.075, lift: 0.012, shaft: true, feathers: [[12, 0.2], [26, 0.25], [40, 0.27], [54, 0.25], [68, 0.19]] },
    { z: z + s * 0.004, width: 0.075, lift: 0.004, shaft: false, feathers: [[18, 0.11], [38, 0.13], [58, 0.11]] },
  ];
  const vanes: BufferGeometry[] = [];
  const trim: BufferGeometry[] = [];
  const place = new Matrix4();
  const step = new Matrix4();
  const thickness = s * 0.006;
  tiers.forEach((tier, t) =>
    tier.feathers.forEach(([degrees, length], i) => {
      const angle = (degrees * Math.PI) / 180;
      const l = length * s;
      const w = tier.width * s;
      place
        .makeTranslation(root.x, root.y, root.z)
        .multiply(step.makeRotationY(0.28))
        .multiply(step.makeTranslation(Math.cos(angle) * tier.lift * s, Math.sin(angle) * tier.lift * s, tier.z))
        .multiply(step.makeRotationZ(angle - Math.PI / 2))
        .multiply(step.makeRotationX(0.14))
        .multiply(step.makeRotationY((i % 2 ? 0.2 : -0.2) * (t === 2 ? 0.5 : 1)));
      vanes.push(feather(l, w, thickness).applyMatrix4(place));
      if (tier.shaft) {
        const shaft = new LineCurve3(new Vector3(0, l * 0.04, thickness * 1.3), new Vector3(w * 0.05, l * 0.85, thickness * 1.3));
        trim.push(...wire(shaft, s * 0.0018, 6, [0, 0]).map((part) => part.applyMatrix4(place)));
      }
    }),
  );
  // A pearl clasp in a gold ring covers the feather roots.
  const clasp = new Vector3(bw / 2, root.y + s * 0.01, z + s * 0.012);
  trim.push(new TorusGeometry(s * 0.025, s * 0.006, 10, 40).translate(clasp.x, clasp.y, clasp.z));
  const plumage = track(merge(vanes));
  const gilding = track(merge(trim));
  const claspPearl = track(new SphereGeometry(s * 0.02, 20, 14).translate(clasp.x, clasp.y, clasp.z));
  for (const sx of [1, -1]) {
    for (const [geometry, material] of [[plumage, pearl], [gilding, gold], [claspPearl, pearl]] as const) {
      const mesh = new Mesh(geometry, material);
      mesh.scale.x = sx;
      group.add(mesh);
    }
  }

  // The halo floats above the top edge, its near side tipped toward the viewer; the stone hangs inside it on a gold stem.
  const centre = new Vector3(0, bh / 2 + s * 0.1, z * 0.5);
  const halo = track(
    merge([
      new TorusGeometry(s * 0.15, s * 0.009, 10, 80).rotateX(-1.2).translate(centre.x, centre.y, centre.z),
      ...wire(new LineCurve3(new Vector3(0, bh / 2 - m / 2, z + s * 0.004), new Vector3(0, centre.y - s * 0.055, centre.z)), s * 0.0045, 4, [1.6, 0]),
      ...[-1, 1].map((side) => new SphereGeometry(s * 0.01, 12, 10).translate(side * s * 0.15, centre.y, centre.z)),
    ]),
  );
  group.add(new Mesh(halo, gold));
  const points: Pt[] = Array.from({ length: 8 }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / 4;
    const d = i % 2 ? s * 0.022 : s * 0.062;
    return [centre.x + Math.cos(a) * d, centre.y + Math.sin(a) * d];
  });
  group.add(new Mesh(track(gem(points, s * 0.02, s * 0.01, 0.3).translate(0, 0, centre.z)), star));

  // Pearls on the lower corners balance the composition.
  const pearlGeometry = track(new SphereGeometry(s * 0.017, 20, 14).translate(-(bw / 2 - m / 2), -(bh / 2 - m / 2), z + s * 0.01));
  for (const sx of [1, -1]) {
    const mesh = new Mesh(pearlGeometry, pearl);
    mesh.scale.x = sx;
    group.add(mesh);
  }
  return group;
}

/** Sculpted ornaments per frame (frames without an entry are just the band). */
export const ORNAMENTS: Partial<Record<FrameLookId, (box: OrnamentBox, track: Track) => Group>> = {
  amethyst,
  "seraph-wings": seraph,
};
