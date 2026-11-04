import { CanvasTexture, Color, ExtrudeGeometry, Group, type Object3D, Shape, SRGBColorSpace } from "three";

export type Vec = [number, number, number];
export type Layout = "wide" | "tall";
/** Camera pose relative to a set piece's anchor; `drift` is the slow push while the chapter's copy is pinned. */
export type Framing = { camera: Vec; look: Vec; drift: Vec };

/**
 * `t` = visual position relative to this chapter (-1 arriving … 0 resting … 1 left behind);
 * `hold` = 0..1 beat of the chapter's feature moment: scrubbed by scroll, and played on by itself while resting (1 once passed);
 * `energy` = ambient motion strength (1 Full, ~0.4 Subtle, 0 Off); `clock` only advances when it is above 0.
 */
export type PieceState = { t: number; hold: number; clock: number; idle: boolean; energy: number; layout: Layout };

export type Piece = {
  group: Group;
  /** Colours of the travelling key and rim lights while this chapter is on screen (may be mutated in `update`). */
  key: Color;
  rim: Color;
  frame?: Partial<Record<Layout, Partial<Framing>>>;
  /** Skips the default rise-in entrance. */
  ownEntrance?: boolean;
  /** Skips the default drift-away exit. */
  ownExit?: boolean;
  /** The camera dives through this object's position when leaving for a sub-chapter. */
  portal?: Object3D;
  place?: (layout: Layout) => void;
  update: (state: PieceState) => void;
};

export type Kit = {
  keep: <T extends { dispose: () => void }>(item: T) => T;
  /** sRGB canvas texture, disposed with the scene. */
  texture: (canvas: HTMLCanvasElement) => CanvasTexture;
  layout: Layout;
};

export type PieceBuilder = (kit: Kit) => Piece;

export const AMETHYST = 0xa57cff;
export const ROSE = 0xf472a8;
export const GOLD = 0xffc35a;

export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Overshoots a little before settling: for pops. */
export const easeBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  return canvas;
}

export function roundedShape(width: number, height: number, radius: number) {
  const x = -width / 2;
  const y = -height / 2;
  const r = Math.min(radius, width / 2, height / 2);
  const shape = new Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + height - r);
  shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  shape.lineTo(x + r, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** A rounded slab centred on the origin; its faces (material 0) map a texture across the whole slab. */
export function slab(width: number, height: number, depth: number, radius: number, bevel = 0) {
  const geometry = new ExtrudeGeometry(roundedShape(width, height, radius), {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 5,
  });
  geometry.translate(0, 0, -depth / 2);
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / height + 0.5);
  return geometry;
}

export const group = (...children: Parameters<Group["add"]>) => {
  const g = new Group();
  if (children.length) g.add(...children);
  return g;
};

export function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}
