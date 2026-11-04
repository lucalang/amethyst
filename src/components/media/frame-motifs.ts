import type { FrameLookId } from "@/lib/frames";

/**
 * Illustrated frame ornaments as SVG path data, drawn by the 2D frame and extruded from the same paths
 * by the 3D card, so both always match. One unit is a fifth of the band width: on a corner piece the
 * card's outer edges run along 5 and the artwork's edges along 10. New illustrated frames only need
 * an entry here plus their band (CSS ring and 3D paint).
 */
export type MotifFinish = "metal" | "gloss" | "satin" | "gem" | "glow";
/** Motif pieces are drawn this much larger than their units (mouldings and trim are not). */
export const MOTIF_SCALE = 1.3;
export type MotifLayer = {
  d: string;
  /** Fill colour, or a two-stop gradient from the piece's top-left to bottom-right. */
  paint: string | readonly [string, string];
  /** Draws the path as a round line this many units wide instead of filling it. */
  line?: number;
  /** Draws the path once per SVG transform instead of once in place. */
  copies?: readonly string[];
  /** 2D: an ink outline of this colour and width drawn behind the shape. */
  outline?: readonly [colour: string, width: number];
  /** 2D only. */
  opacity?: number;
  /** 3D: height of the layer above the band and its thickness, in units. */
  lift: number;
  depth?: number;
  finish: MotifFinish;
};
export type MotifPlace = "tl" | "tr" | "bl" | "br" | "top" | "bottom";
export type MotifPiece = {
  /** Corners mirror the top-left drawing; top and bottom pieces sit centred on that edge as drawn. */
  at: readonly MotifPlace[];
  box: readonly [width: number, height: number];
  /** The point in the box placed on the card's outer corner (or edge centre). */
  origin: readonly [x: number, y: number];
  /** Draws the whole piece this much larger about its origin, lines, lifts and depths included. */
  scale?: number;
  /** 2D: how tall the piece stands off the card, which lengthens its shadow. */
  rise?: number;
  layers: readonly MotifLayer[];
};

/** A sculpted moulding running all the way round: its centre line `at` units in from the outer edge (0–5). */
export type MotifRail = { at: number; width: number; paint: string | readonly [string, string]; lift: number; finish: MotifFinish };
/** A tile repeated along all four rails, `skip` units clear of each corner: drawn for the top rail, x along it, y 0 at the outer edge and 5 at the art. */
export type MotifTrim = { tile: number; skip: number; layers: readonly MotifLayer[] };
export type FrameMoulding = { rails?: readonly MotifRail[]; trim?: MotifTrim };

const ALL = ["tl", "tr", "bl", "br"] as const;
const n = (value: number) => +value.toFixed(2);
const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
const star = (cx: number, cy: number, outer: number, inner: number, points = 5) =>
  `M${Array.from({ length: points * 2 }, (_, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    return `${n(cx + Math.cos(angle) * r)} ${n(cy + Math.sin(angle) * r)}`;
  }).join("L")}Z`;
const rotations = (count: number, cx: number, cy: number) => Array.from({ length: count }, (_, i) => `rotate(${(i * 360) / count} ${cx} ${cy})`);

/** A five-petal blossom petal pointing up from its base at the origin. */
const PETAL = "M0 0C-1.5-1.1-1.8-2.9-.8-3.7L0-3.2L.8-3.7C1.8-2.9 1.5-1.1 0 0Z";
const BUTTERFLY = [
  "M12 7.4C10 3.8 6.2 1.6 3.4 2.4C1.8 3 2.4 6.2 4.6 7.6C6.6 8.8 9.6 8.6 12 8Z",
  "M12 8.4C9.4 8.6 6.4 9.8 5.8 11.8C5.4 13.4 7.4 13.8 9 12.6C10.4 11.6 11.4 10 12 8.8Z",
  "M12 7.4C14 3.8 17.8 1.6 20.6 2.4C22.2 3 21.6 6.2 19.4 7.6C17.4 8.8 14.4 8.6 12 8Z",
  "M12 8.4C14.6 8.6 17.6 9.8 18.2 11.8C18.6 13.4 16.6 13.8 15 12.6C13.6 11.6 12.6 10 12 8.8Z",
].join("");
const GOLD = ["#fff1b8", "#c48a1c"] as const;
const BONE = ["#fffdf6", "#cdbfa4"] as const;
const CRIMSON = ["#ff5a64", "#9e0018"] as const;
/** A four-lobed sword guard outline of radius r, its lobes on the diagonals. */
const mokko = (c: number, r: number) => {
  const [p, a] = [n(r * 0.705), n(r / 2)];
  return `M${c} ${n(c - p)}A${a} ${a} 0 1 1 ${n(c + p)} ${c}A${a} ${a} 0 1 1 ${c} ${n(c + p)}A${a} ${a} 0 1 1 ${n(c - p)} ${c}A${a} ${a} 0 1 1 ${c} ${n(c - p)}Z`;
};
const rail = (at: number, width: number, paint: MotifRail["paint"], finish: MotifFinish): MotifRail => ({ at, width, paint, lift: 0.1, finish });
/** The usual pair: a bold outer moulding and a slim inner one against the art. */
const edges = (outer: MotifRail["paint"], outerFinish: MotifFinish, inner: MotifRail["paint"], innerFinish: MotifFinish) => [rail(0.45, 0.9, outer, outerFinish), rail(4.75, 0.45, inner, innerFinish)];
const blossoms = (spots: readonly (readonly [x: number, y: number, size: number])[]) => spots.flatMap(([x, y, s]) => rotations(5, 0, 0).map((turn) => `translate(${x} ${y}) ${turn} scale(${s})`));
const polar = (cx: number, cy: number, r: number, a: number) => `${n(cx + r * Math.cos(a))} ${n(cy + r * Math.sin(a))}`;
/** Straight rays between two radii, evenly spaced. */
const spokes = (cx: number, cy: number, from: number, to: number, count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => (i * 2 * Math.PI) / count + offset).map((a) => `M${polar(cx, cy, from, a)}L${polar(cx, cy, to, a)}`).join("");
/** Dots strung on a circle, or on an arc between two angles in degrees. */
const ring = (cx: number, cy: number, r: number, count: number, dot: number, from = 0, to = 360) =>
  Array.from({ length: count }, (_, i) => ((from + ((to - from) * i) / (to - from === 360 ? count : count - 1)) * Math.PI) / 180)
    .map((a) => circle(cx + r * Math.cos(a), cy + r * Math.sin(a), dot))
    .join("");
const KAGUNE_FLESH = "M14.4 14.8C10.8 12.1 5.2 10 3.5 5.4C1.8 1.2 4.4.5 7.1 3.2C7.2 6.3 10.2 9.2 16.1 14.1C15.2 14.1 14.7 14.4 14.4 14.8ZM15 14.2C20.8 10.8 28.3 8.7 34.8 10.4C39.3 11.5 39.3 14.3 36.2 15.7C33.4 17 31.8 14.5 34 13.4C29.5 12.6 23.3 14.8 16 16.2C15.8 15.4 15.4 14.7 15 14.2ZM14.2 15C10.8 20.8 8.7 28.3 10.4 34.8C11.5 39.3 14.3 39.3 15.7 36.2C17 33.4 14.5 31.8 13.4 34C12.6 29.5 14.8 23.3 16.2 16C15.4 15.8 14.7 15.4 14.2 15Z";
const KAGUNE = "M15 15C9 10 4 9 3 4C2.4 1 6 .5 7.4 3M15 15C21 9.5 28 9 35 10.4C38 11 38.6 13.4 36.4 14M15 15C9.5 21 9 28 10.4 35C11 38 13.4 38.6 14 36.4";
const KAGUNE_RIBS = "M11.5 12.4L9.7 10.6M9.3 10.7L7.4 8.8M7.1 8.8L5.4 6.7M19.2 13.2L19.7 15.1M23 12.1L23.7 14M27 11.1L27.8 13M31 11.1L31.7 13M13.2 19.2L15.1 19.7M12.1 23L14 23.7M11.1 27L13 27.8M11.1 31L13 31.7";
/** A long flight feather pointing up from its quill at the origin, 16 long, and its shaft and barbs. */
const PLUME = "M0 0C1.7-2 2.1-8 1.3-12.2C.9-14.2.4-15.4 0-16C-.7-14.6-1.7-12-1.9-8C-2-4-1.3-1.7 0 0Z";
const PLUME_VEINS = "M0-.5V-15.2M.2-5.2L1.8-7.4M.2-8.6L1.5-10.8M.2-11.8L1.1-13.4M-.2-6.6L-1.8-8.8M-.2-10.2L-1.4-12.2";
const plumes = (spots: readonly (readonly [x: number, y: number, angle: number, scale: number])[]) =>
  spots.map(([x, y, a, s]) => `translate(${n(x)} ${n(y)}) rotate(${a}) scale(${s})`);
const bezier = (a: readonly number[], b: readonly number[], c: readonly number[], t: number) =>
  [0, 1].map((i) => (1 - t) ** 2 * a[i] + 2 * (1 - t) * t * b[i] + t * t * c[i]) as [number, number];
/** An elliptical arc between two angles in degrees, drawn clockwise. */
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number) => {
  const at = (d: number) => `${n(cx + rx * Math.cos((d * Math.PI) / 180))} ${n(cy + ry * Math.sin((d * Math.PI) / 180))}`;
  return `M${at(from)}A${rx} ${ry} 0 ${to - from > 180 ? 1 : 0} 1 ${at(to)}`;
};
// Fallen halo's wing: the arm curves from the corner up and out to the wrist.
const ARM = [[23, 15], [12, -1], [9, 9]] as const;
const wing = (feathers: readonly (readonly [t: number, angle: number, scale: number])[]) =>
  plumes(feathers.map(([t, a, s]) => [...bezier(ARM[0], ARM[1], ARM[2], t), a, s] as const));
const WING = {
  primaries: wing([[1, 183, 3.6], [0.88, 181, 3.3], [0.76, 179, 3], [0.64, 177, 2.6], [0.52, 175, 2.2]]),
  secondaries: wing([[0.44, 172, 1.9], [0.34, 168, 1.6], [0.24, 163, 1.3]]),
  coverts: wing([[0.98, 188, 1.15], [0.84, 186, 1.15], [0.7, 184, 1.1], [0.56, 181, 1], [0.42, 177, 0.95], [0.28, 172, 0.85]]),
  crest: plumes([[21, 13, -22, 0.75], [19.5, 12, -42, 0.7], [18.5, 11.5, -62, 0.6]]),
};
const mirror = (width: number) => ["", `translate(${width} 0) scale(-1 1)`];
const LEAF = "M0 0C1.6-1.6 4.4-1.7 6 0C4.4.3 1.6 1.6 0 0Z";
const BIG_HEART = "M10 16C4.6 12.4 2.6 9.2 2.6 6.6C2.6 3.8 5.8 2.4 10 5.6C14.2 2.4 17.4 3.8 17.4 6.6C17.4 9.2 15.4 12.4 10 16Z";
const ROCKET = "translate(7 7) rotate(-45) scale(1.3)";
/** Alternate wedges of a round window between two radii (`parity` 0 or 1 picks which half). */
const panes = (cx: number, cy: number, r0: number, r1: number, count: number, parity: number) =>
  Array.from({ length: count }, (_, i) => i)
    .filter((i) => i % 2 === parity)
    .map((i) => {
      const [a0, a1] = [(i * 2 * Math.PI) / count + 0.06, ((i + 1) * 2 * Math.PI) / count - 0.06];
      return `M${polar(cx, cy, r0, a0)}L${polar(cx, cy, r1, a0)}A${r1} ${r1} 0 0 1 ${polar(cx, cy, r1, a1)}L${polar(cx, cy, r0, a1)}A${r0} ${r0} 0 0 0 ${polar(cx, cy, r0, a0)}Z`;
    })
    .join("");
const LANTERNS = [[9, 8.6, 3.2], [22, 11.4, 4.3], [35, 8.6, 3.2]] as const;
/** A leaf-shaped loop from one point to another, `w` across at its widest. */
const lens = (ax: number, ay: number, bx: number, by: number, w: number) => {
  const [dx, dy] = [bx - ax, by - ay];
  const k = w / 1.5 / Math.hypot(dx, dy);
  const at = (t: number, s: number) => `${n(ax + dx * t - dy * k * s)} ${n(ay + dy * t + dx * k * s)}`;
  return `M${n(ax)} ${n(ay)}C${at(1 / 3, 1)} ${at(2 / 3, 1)} ${n(bx)} ${n(by)}C${at(2 / 3, -1)} ${at(1 / 3, -1)} ${n(ax)} ${n(ay)}Z`;
};
/** A lavender spike from (x, y) out along `angle` degrees, its buds paired up the top half. */
const lavender = (x: number, y: number, angle: number, length: number) => {
  const a = (angle * Math.PI) / 180;
  const p = (t: number) => [x + Math.cos(a) * length * t, y + Math.sin(a) * length * t] as const;
  const bud = ([bx, by]: readonly [number, number], turn: number, size: number) => lens(bx, by, bx + Math.cos(a + turn) * size, by + Math.sin(a + turn) * size, size * 0.55);
  return {
    stem: `M${n(x)} ${n(y)}L${p(1).map(n).join(" ")}`,
    buds: [0.5, 0.62, 0.74, 0.86].flatMap((t) => [bud(p(t), 0.55, 2.4 - t), bud(p(t), -0.55, 2.4 - t)]).join("") + bud(p(0.95), 0, 1.6),
  };
};
const LADYBUG = {
  shell: "M8 3.9C10.6 3.9 12 6.2 12 8.6C12 11.4 10.2 13.1 8 13.1C5.8 13.1 4 11.4 4 8.6C4 6.2 5.4 3.9 8 3.9Z",
  head: "M6.2 4.6C6.4 2.6 9.6 2.6 9.8 4.6Z",
  lines: "M8 4.6V13M7 3L5.8 1.2M9 3L10.2 1.2",
  spots: `${circle(6.3, 7.6, 0.8)}${circle(9.7, 7.6, 0.8)}${circle(6.6, 10.6, 0.65)}${circle(9.4, 10.6, 0.65)}`,
};
const GO = "M0 0H5.2V5.6H0M6.2-1.6L6.9 0M7.6-2L8.3-.4";
/** A column of menacing ゴ glyphs down the side, pre-flipped by (fx, fy) so its mirrored corner reads them the right way round. */
const menacing = (fx: number, fy: number): MotifLayer[] => {
  const copies = ([[8, 13, 1, -8], [7, 29, 1.3, 6], [8, 48, 1.6, -5]] as const).map(([x, y, s, r]) => `translate(${x} ${y}) rotate(${r}) scale(${s * fx} ${s * fy}) translate(-4.15 -1.8)`);
  return [
    { d: GO, copies, paint: "#2a0a2e", line: 2, lift: 0, finish: "satin" },
    { d: GO, copies, paint: ["#ff9be0", "#e0399f"], line: 1.1, lift: 0.5, finish: "gloss" },
  ];
};
/** Sticky Fingers' zip torn open along the top rail from its slider at the corner; `swap` lays it down the left rail. */
const zipTear = (swap: boolean): MotifLayer[] => {
  const copies = [swap ? "matrix(0 1 1 0 0 0)" : ""];
  const [x0, x1, y, g] = [15, 44, 14.5, 3.4];
  const lip = (side: number) =>
    Array.from({ length: 15 }, (_, i) => (i + 0.5) / 15)
      .map((t) => `M${n(x0 + (x1 - x0) * t - 0.5)} ${n(y + side * (4 * g * t * (1 - t) + 0.55) - 0.6)}h1v1.2h-1Z`)
      .join("");
  return [
    { d: `M${x0} ${y}Q${(x0 + x1) / 2} ${y - 2 * g} ${x1} ${y}Q${(x0 + x1) / 2} ${y + 2 * g} ${x0} ${y}Z`, copies, paint: ["#4a1488", "#05010c"], outline: ["#1a0630", 0.3], lift: 0, depth: 0.15, finish: "gloss" },
    { d: `${star(24, 14.2, 1.3, 0.35, 4)}${star(32, 13.4, 1, 0.3, 4)}${star(38.5, 15.2, 0.8, 0.25, 4)}${circle(28.4, 15.6, 0.3)}${circle(20, 13.4, 0.25)}`, copies, paint: "#f4e8ff", lift: 0.1, depth: 0.1, finish: "glow" },
    { d: `${lip(-1)}${lip(1)}`, copies, paint: GOLD, lift: 0.2, depth: 0.35, finish: "metal" },
    { d: "M10.6 12.4L8.8 3.6C8.6 2.6 9.2 1.8 10.2 1.8h2.6c1 0 1.6.8 1.4 1.8L12.4 12.4Z", copies, paint: GOLD, outline: ["#5a3e10", 0.25], lift: 0.5, depth: 0.4, finish: "metal" },
    { d: circle(11.5, 4.4, 0.9), copies, paint: "#3a0a4e", lift: 0.95, depth: 0.1, finish: "gloss" },
    { d: "M9.4 11.8h5.4l-.8 5.4h-3.8Z", copies, paint: GOLD, outline: ["#5a3e10", 0.25], lift: 0.3, depth: 0.8, finish: "metal" },
  ];
};
const BOUGH = [[8, 15.6, 1.1], [16, 5.4, 1], [20, 10, 1.3], [27, 8.4, 0.9], [34, 4.2, 1], [38, 9.2, 1.25], [45, 9.8, 0.9], [55, 6.6, 1.1], [57, 15.2, 1]] as const;
const FORTUNES = [8, 15, 22, 29, 36].map((x, i) => {
  const t = (x - 2) / 40;
  return [x, n(2 + 12 * t * (1 - t)), [7, 8.5, 9.5, 8.5, 7][i]] as const;
});
const FOX =
  "M4.2 4.2L3.6.6L6 3H7.4L9.8.6L9.2 4.2C9.6 6 8.4 7.4 6.7 7.6C5 7.4 3.8 6 4.2 4.2ZM4.6 7.4C3 9 3 11.6 4 13H10C11.4 11.6 10.8 9 8.8 7.4ZM9.6 12.6C13 13 16.4 12 16 9C15.6 7.4 14.4 7 13.6 8C14 10.4 12 11.4 9.8 11.2Z";

/** Rails and repeating trim, drawn under the motif pieces by both renderers. */
export const FRAME_MOULDINGS: Partial<Record<FrameLookId, FrameMoulding>> = {
  "tsuba-guard": {
    rails: [
      { at: 0.4, width: 0.8, paint: ["#ffe7a8", "#8a5a14"], lift: 0.1, finish: "metal" },
      { at: 4.6, width: 0.8, paint: ["#ffe7a8", "#8a5a14"], lift: 0.1, finish: "metal" },
    ],
    // Silk hilt wrapping crossing over ray-skin nodules.
    trim: {
      tile: 4,
      skip: 6,
      layers: [
        { d: `${circle(0, 2.5, 0.55)}${circle(4, 2.5, 0.55)}${circle(2, 0.9, 0.4)}${circle(2, 4.1, 0.4)}`, paint: "#fffaf0", lift: 0, depth: 0.2, finish: "satin" },
        { d: "M0 .9L4 4.1M4 .9L0 4.1", paint: ["#34343c", "#09090b"], line: 1.25, lift: 0.15, finish: "satin" },
        { d: "M.4 1.3L1.6 2.2M2.4 2.8L3.6 3.7M3.6 1.3L2.4 2.2", paint: "#5a5a66", line: 0.3, lift: 1.1, finish: "satin" },
      ],
    },
  },
  "hollow-fang": {
    rails: [
      { at: 0.45, width: 0.9, paint: BONE, lift: 0.1, finish: "satin" },
      { at: 4.75, width: 0.5, paint: CRIMSON, lift: 0.1, finish: "glow" },
    ],
    // A jaw of bone fangs closing in on the art.
    trim: { tile: 2.4, skip: 5, layers: [{ d: "M0 .7L1.2 4.2L2.4 .7Z", paint: ["#fffdf6", "#c9bb9f"], lift: 0, depth: 0.45, finish: "gloss" }] },
  },
  "koi-rail": {
    rails: edges(["#a8703f", "#4a2a12"], "satin", ["#ffffff", "#d8c8b0"], "gloss"),
    trim: { tile: 5, skip: 7, layers: [{ d: "M.6 3.4Q2.5 2.2 4.4 3.4M1.6 2.1Q2.5 1.6 3.4 2.1", paint: "#ffffff", line: 0.25, lift: 0.05, finish: "satin" }] },
  },
  "pressed-diary": {
    rails: edges(["#c23a52", "#5a0e1c"], "satin", GOLD, "metal"),
    trim: { tile: 2, skip: 4, layers: [{ d: "M.5 2.5H1.5", paint: "#fff1d6", line: 0.35, lift: 0.05, finish: "satin" }] },
  },
  "spider-lily": { rails: edges(["#3a1418", "#050203"], "gloss", CRIMSON, "glow") },
  "sonata-keys": {
    rails: edges(["#3a3a42", "#050507"], "gloss", GOLD, "metal"),
    // One octave of keys repeated round the band.
    trim: {
      tile: 14,
      skip: 9,
      layers: [
        { d: [0, 2, 4, 6, 8, 10, 12].map((x) => `M${x} 1V4.3`).join(""), paint: "#2a2a2e", line: 0.2, lift: 0.05, finish: "gloss" },
        { d: [2, 4, 8, 10, 12].map((x) => `M${n(x - 0.55)} .95h1.1v1.9h-1.1Z`).join(""), paint: "#121216", lift: 0.1, depth: 0.5, finish: "gloss" },
      ],
    },
  },
  "demon-wing": {
    rails: edges("#19e3c8", "glow", "#ff2e88", "glow"),
    trim: {
      tile: 6,
      skip: 8,
      layers: [{ d: "M1 .8h1.6v1.4c0 1-.3 1.8-.8 2.4c-.5-.6-.8-1.4-.8-2.4ZM3.8 .8h1.1v.9c0 .7-.2 1.2-.55 1.6c-.35-.4-.55-.9-.55-1.6Z", paint: ["#ff3355", "#7a0018"], lift: 0, depth: 0.3, finish: "gloss" }],
    },
  },
  moonshot: {
    rails: edges(["#ffffff", "#5d6878"], "metal", "#f5e112", "glow"),
    trim: {
      tile: 6,
      skip: 7,
      layers: [
        { d: "M0 1V4.2", paint: "#2c3340", line: 0.2, lift: 0.05, finish: "satin" },
        { d: `${circle(1.2, 1.6, 0.4)}${circle(4.8, 3.4, 0.4)}`, paint: ["#ffffff", "#6a7586"], lift: 0, depth: 0.3, finish: "metal" },
      ],
    },
  },
  "golden-arrow": {
    rails: [rail(0.45, 0.9, GOLD, "metal"), rail(4.7, 0.6, GOLD, "metal")],
    trim: {
      tile: 6,
      skip: 13,
      layers: [
        { d: "M1.2 3.6L3 1.8L4.8 3.6", paint: GOLD, line: 0.45, lift: 0.05, finish: "metal" },
        { d: circle(3, 3.4, 0.45), paint: ["#9ff3ea", "#1f9e93"], lift: 0.1, depth: 0.3, finish: "gem" },
      ],
    },
  },
  "five-ribbons": {
    rails: edges(["#ffb3c9", "#d94c7c"], "satin", ["#f6d0c0", "#b8786a"], "metal"),
    trim: { tile: 4, skip: 9, layers: [{ d: "M.2 3.8L1.8 1.2h1.4L1.6 3.8Z", paint: ["#ffffff", "#ffd6e4"], lift: 0, depth: 0.2, finish: "satin" }] },
  },
  "frost-glam": {
    rails: edges(["#ffffff", "#9fd3f5"], "metal", "#ff2e8a", "gloss"),
    trim: { tile: 2.4, skip: 9, layers: [{ d: circle(1.2, 2.6, 0.75), paint: ["#ffffff", "#cfe8ff"], lift: 0, depth: 0.5, finish: "gem" }] },
  },
  "summer-fireworks": {
    rails: edges(GOLD, "metal", "#ffd27a", "glow"),
    // Sparkler trails crackling along the rails.
    trim: {
      tile: 7,
      skip: 9,
      layers: [
        { d: "M.4 3.6Q3.5 1.4 6.6 3.6", paint: ["#ffe9a8", "#ff9a3c"], line: 0.25, lift: 0.05, finish: "glow" },
        { d: `${circle(3.5, 1.7, 0.3)}${circle(5.6, 2.2, 0.22)}${circle(1.4, 2.3, 0.2)}`, paint: "#fff3c4", lift: 0.05, depth: 0.2, finish: "glow" },
      ],
    },
  },
  "sakura-storm": {
    rails: edges(["#8a5a44", "#3e2418"], "satin", ["#ffd3de", "#e88aa6"], "gloss"),
    trim: { tile: 8, skip: 8, layers: [{ d: PETAL, copies: ["translate(2 3.4) rotate(40) scale(.6)", "translate(5.6 2.4) rotate(-65) scale(.5)"], paint: ["#ffe0e8", "#f08db0"], lift: 0, depth: 0.2, finish: "satin" }] },
  },
  "kagune-coil": {
    rails: edges(["#2a0a0e", "#000000"], "gloss", CRIMSON, "glow"),
    // Scaled segments, like a coiled tendril laid round the band.
    trim: {
      tile: 3,
      skip: 9,
      layers: [
        { d: "M.2 2.5Q1.5 1 2.8 2.5Q1.5 4 .2 2.5Z", paint: ["#d81d35", "#4a0010"], lift: 0, depth: 0.35, finish: "gloss" },
        { d: "M.7 2.5H2.3", paint: "#ff8a94", line: 0.2, lift: 0.5, finish: "glow" },
      ],
    },
  },
  "stained-prelude": {
    rails: edges(["#6a6a78", "#16161c"], "metal", GOLD, "metal"),
    trim: {
      tile: 6,
      skip: 9,
      layers: [
        { d: "M.5 1.1h2.3v3h-2.3Z", paint: ["#bfe3ff", "#7fb2f0"], lift: 0, depth: 0.2, finish: "gem" },
        { d: "M3.2 1.1h2.3v3h-2.3Z", paint: ["#ffd1e3", "#f59ac0"], lift: 0, depth: 0.2, finish: "gem" },
        { d: "M0 1H6M0 4.2H6M3 1V4.2M0 1V4.2", paint: "#2a2a34", line: 0.3, lift: 0.25, finish: "metal" },
      ],
    },
  },
  "fallen-halo": {
    rails: edges(GOLD, "metal", ["#ffffff", "#d9d0c0"], "gloss"),
    trim: {
      tile: 3,
      skip: 12,
      layers: [
        { d: "M1.5 .9C2.7 1.9 2.7 3.4 1.5 4.3C.3 3.4 .3 1.9 1.5 .9Z", paint: ["#ffffff", "#d8d2c8"], lift: 0, depth: 0.25, finish: "satin" },
        { d: "M1.5 1.2V4", paint: "#c9b98f", line: 0.12, lift: 0.4, finish: "metal" },
      ],
    },
  },
  afterimage: {
    rails: edges(["#e8edf4", "#5d6878"], "metal", "#7dff6a", "glow"),
    // Chrome vertebrae strung on a lime light line.
    trim: {
      tile: 3,
      skip: 10,
      layers: [
        { d: "M0 2.5H3", paint: "#7dff6a", line: 0.25, lift: 0.05, finish: "glow" },
        { d: "M.6 1.5h1.8v2h-1.8Z", paint: ["#ffffff", "#6a7586"], lift: 0, depth: 0.4, finish: "metal" },
      ],
    },
  },
  "zipper-rush": {
    rails: edges(GOLD, "metal", GOLD, "metal"),
    trim: { tile: 1.6, skip: 9, layers: [{ d: "M.15 1.3h.7v1.4h-.7ZM.95 2.3h.7v1.4h-.7Z", paint: GOLD, lift: 0, depth: 0.35, finish: "metal" }] },
  },
  "bridal-bouquet": {
    rails: edges(["#ffffff", "#e6dccf"], "gloss", ["#f6d0c0", "#b8786a"], "metal"),
    // Veil lace scallops with a pearl under each.
    trim: {
      tile: 3.4,
      skip: 12,
      layers: [
        { d: "M0 1A1.7 1.7 0 0 0 3.4 1", paint: "#ffffff", line: 0.3, lift: 0.05, finish: "satin" },
        { d: circle(1.7, 3.5, 0.5), paint: ["#ffffff", "#e8dccb"], lift: 0, depth: 0.3, finish: "gloss" },
      ],
    },
  },
  "lavender-north": {
    rails: edges(["#c9b8ff", "#6a4fc4"], "satin", "#ffffff", "gloss"),
    trim: { tile: 6, skip: 9, layers: [{ d: "M3 1.3V3.7M1.96 1.9L4.04 3.1M1.96 3.1L4.04 1.9", paint: "#ffffff", line: 0.25, lift: 0.05, finish: "satin" }] },
  },
};

export const FRAME_MOTIFS: Partial<Record<FrameLookId, readonly MotifPiece[]>> = {
  "spider-lily": [
    {
      // A full spider lily crown, with swept petals and pale-tipped stamens.
      at: ["top"],
      box: [36, 20],
      origin: [18, 15],
      scale: 1.1,
      rise: 1.5,
      layers: [
        { d: "M0 0C-2.2-3.2-2.6-9.2 0-13.8C2.6-9.2 2.2-3.2 0 0Z", copies: [-65, -43, -21, 0, 21, 43, 65].map((angle) => `translate(18 15) rotate(${angle})`), paint: ["#ff5262", "#8f0019"], outline: ["#53000d", 0.16], lift: 0.1, depth: 0.4, finish: "satin" },
        { d: "M18 15C14 9 9 5 4 3M18 15C16 9 13 5 13 1M18 15C18 8 18 4 19 1M18 15C21 9 27 5 32 3M18 15C22 10 28 8 35 8", paint: "#e8283a", line: 0.38, lift: 0.7, finish: "gloss" },
        { d: `${circle(4, 3, 0.6)}${circle(13, 1, 0.6)}${circle(19, 1, 0.6)}${circle(32, 3, 0.6)}${circle(35, 8, 0.6)}`, paint: ["#fff4ea", "#e2c6a9"], lift: 0.9, depth: 0.3, finish: "satin" },
        { d: circle(18, 15, 1.2), paint: ["#ffe1a6", "#c85b31"], lift: 0.8, depth: 0.35, finish: "gem" },
      ],
    },
  ],
  "koi-rail": [
    {
      // A koi swimming along the top rail (and, turned around, the bottom rail).
      at: ["tl", "br"],
      box: [40, 16],
      origin: [5, 5],
      scale: 1.6,
      rise: 1.5,
      layers: [
        { d: "M21 5.6L19 2.2L25 5.2ZM21 9.4L19 12.8L25 9.8Z", paint: "#f7d9c4", lift: 0.2, depth: 0.4, finish: "satin" },
        { d: "M15 7.5C13 5.8 11 4.2 8.6 3.6C9.8 5.6 10 6.6 9.6 7.5C10 8.4 9.8 9.4 8.6 11.4C11 10.8 13 9.2 15 7.5Z", paint: ["#ff9a5c", "#e2501c"], lift: 0.2, depth: 0.5, finish: "satin" },
        { d: "M14 7.5C17 4.6 26 4.4 33.5 7.5C26 10.6 17 10.4 14 7.5Z", paint: "#fff7ee", lift: 0.3, depth: 1.2, finish: "gloss" },
        { d: "M18 6.3Q19 7.5 18 8.7M21 6Q22.2 7.5 21 9M24 5.8Q25.2 7.5 24 9.2M27 5.9Q28 7.5 27 9.1", paint: "#e8d8c8", line: 0.2, lift: 1.55, finish: "satin" },
        {
          d: "M24.5 5.3C27.5 5 31 6.1 33 7.4C31 8.2 28.3 8.6 26.2 8C24.8 7.5 24.2 6.4 24.5 5.3ZM16.5 6.4C18.5 5.4 20.8 5.7 21.4 7.3C20.4 8.9 18 9.3 16.6 8.4Z",
          paint: "#f05a22",
          lift: 1.75,
          depth: 0.15,
          finish: "gloss",
        },
        { d: circle(31, 6.8, 0.45), paint: "#1b1b1b", lift: 1.85, depth: 0.1, finish: "gloss" },
      ],
    },
    {
      // Ripples spreading around a lily pad on the other two corners.
      at: ["tr", "bl"],
      box: [16, 16],
      origin: [5, 5],
      scale: 1.6,
      rise: 1,
      layers: [
        { d: `${circle(7.5, 7.5, 3.6)}${circle(7.5, 7.5, 5.2)}`, paint: "#ffffff", line: 0.45, lift: 0.1, finish: "gloss" },
        { d: "M7.5 7.5L10.1 7.5A2.6 2.6 0 1 1 9.34 5.66Z", paint: ["#8cc47a", "#4a8a43"], lift: 0.2, depth: 0.4, finish: "satin" },
        { d: PETAL, copies: rotations(6, 0, 0).map((turn) => `translate(6.6 8.2) ${turn} scale(.55)`), paint: ["#fff0f5", "#f08db0"], lift: 0.7, depth: 0.35, finish: "gloss" },
        { d: circle(6.6, 8.2, 0.5), paint: "#ffd23f", lift: 1.1, depth: 0.2, finish: "gloss" },
      ],
    },
    {
      // A wave breaking in from both sides under a red sun on the top edge.
      at: ["top"],
      box: [44, 16],
      origin: [22, 12],
      scale: 1.3,
      rise: 1.5,
      layers: [
        { d: circle(22, 7, 4), paint: ["#ffb08a", "#e2501c"], lift: 0, depth: 0.3, finish: "gloss" },
        { d: "M22 14C17 14 12 13 9 10.4C6 7.8 6.4 3.6 10 2.4C13 1.4 15.6 3.6 14.6 6C14 7.6 12 7.6 11.6 6.4C13.6 9.6 17.6 11 22 11Z", copies: mirror(44), paint: ["#d9f6ff", "#2a8fc4"], lift: 0.2, depth: 0.5, finish: "gloss" },
        { d: "M9.2 9.6C6.6 6.8 7.4 3.4 10.4 2.8C12.6 2.4 14.4 3.8 14.2 5.4", copies: mirror(44), paint: "#ffffff", line: 0.5, lift: 0.75, finish: "satin" },
        { d: `${circle(7, 2.2, 0.75)}${circle(5, 4.2, 0.55)}${circle(8.8, 0.9, 0.45)}${circle(4.6, 7, 0.4)}`, copies: mirror(44), paint: "#ffffff", lift: 0.3, depth: 0.3, finish: "gloss" },
      ],
    },
  ],
  "pressed-diary": [
    {
      // Leather book corners with a brass rivet.
      at: ALL,
      box: [20, 20],
      origin: [5, 5],
      scale: 1.35,
      rise: 1,
      layers: [
        { d: "M3.6 3.6H18.5L3.6 18.5Z", paint: ["#c23a52", "#7d1427"], lift: 0, depth: 0.6, finish: "satin" },
        { d: "M17.6 4.6L4.6 17.6M13 5.6C10.5 6.4 8.8 7.6 7.6 9.2M5.6 13C6.4 10.5 7.6 8.8 9.2 7.6", paint: GOLD, line: 0.45, lift: 0.75, finish: "metal" },
        { d: circle(7, 7, 1.1), paint: ["#fff1c2", "#b8862e"], lift: 0.8, depth: 0.35, finish: "metal" },
      ],
    },
    {
      // A pressed cherry spray, two blossoms, a bud and leaves, laid along the rail.
      at: ["tr", "bl"],
      box: [48, 18],
      origin: [5, 5],
      scale: 1.2,
      rise: 1,
      layers: [
        { d: "M12 9.6C20 7 30 8 44 4.2M30 7.9C33 10 36 11 39 11", paint: ["#8fb07a", "#4f7a3e"], line: 0.45, lift: 0.5, finish: "satin" },
        { d: LEAF, copies: ["translate(18 8.1) rotate(-40)", "translate(23 7.7) rotate(25)", "translate(35 6.2) rotate(-35)", "translate(33.5 9.4) rotate(30)"], paint: ["#b9d6a0", "#5f8a4a"], lift: 0.55, depth: 0.2, finish: "satin" },
        { d: PETAL, copies: blossoms([[27, 7.5, 1.6], [41, 4.4, 1.05]]), paint: ["#ffe0e8", "#e88aa6"], lift: 0.7, depth: 0.25, finish: "satin" },
        { d: "M39 11C40.6 9.6 42.6 10 43 11.4C42.4 12.8 40.4 12.8 39 11Z", paint: ["#ffc2d2", "#d9607e"], lift: 0.7, depth: 0.25, finish: "satin" },
        { d: `${circle(27, 7.5, 1)}${circle(41, 4.4, 0.65)}`, paint: ["#ffe58a", "#c24d6c"], lift: 1, depth: 0.15, finish: "satin" },
        { d: ring(27, 7.5, 1.9, 7, 0.28), paint: "#e0a43a", lift: 1, depth: 0.1, finish: "metal" },
      ],
    },
    {
      // A wax seal pressed over two ribbon tails at the top edge.
      at: ["top"],
      box: [16, 20],
      origin: [8, 12],
      scale: 1.3,
      rise: 2,
      layers: [
        { d: "M6.4 8L3.6 18.6L5.4 17.8L6.4 19.4L8.2 9ZM9.6 8L12.4 18.6L10.6 17.8L9.6 19.4L7.8 9Z", paint: ["#8bbfe8", "#2f6fa8"], lift: 0.1, depth: 0.3, finish: "satin" },
        { d: `M${Array.from({ length: 16 }, (_, i) => polar(8, 7, i % 2 ? 5.4 : 6, (i * Math.PI) / 8)).join("L")}Z`, paint: ["#e0485e", "#7d1427"], lift: 0.3, depth: 0.5, finish: "gloss" },
        { d: circle(8, 7, 3.8), paint: "#5a0e1c", line: 0.35, lift: 0.85, finish: "satin" },
        { d: "M8 9.4C6.4 8.4 5.8 7.4 5.8 6.6C5.8 5.6 7 5.1 8 6.1C9 5.1 10.2 5.6 10.2 6.6C10.2 7.4 9.6 8.4 8 9.4Z", paint: "#a01a30", lift: 0.85, depth: 0.12, finish: "gloss" },
      ],
    },
  ],
  "sonata-keys": [
    {
      // Violin scrolls curling at the corners, with a gold thread along each rail.
      at: ALL,
      box: [24, 24],
      origin: [5, 5],
      scale: 1.4,
      rise: 1,
      layers: [
        {
          d: "M14 7.5C14 3.9 11.1 1.5 7.5 1.5C4.2 1.5 1.5 4.2 1.5 7.5C1.5 10.3 3.7 12.3 6.3 12.3C8.7 12.3 10.4 10.4 10.4 8.2C10.4 6.3 8.9 4.9 7.2 4.9C5.7 4.9 4.6 6 4.6 7.4C4.6 8.6 5.5 9.4 6.6 9.4",
          copies: ["translate(7.5 7.5) scale(.72) translate(-7.5 -7.5)"],
          paint: GOLD,
          line: 1,
          lift: 0.2,
          finish: "metal",
        },
      ],
    },
    {
      // A gold treble clef on a staff swaying over the top edge.
      at: ["top"],
      box: [56, 22],
      origin: [28, 16],
      scale: 1.25,
      rise: 2,
      layers: [
        { d: [3, 4.4, 5.8, 7.2, 8.6].map((y) => `M3 ${y + 4}C16 ${y - 1.5} 40 ${y - 1.5} 53 ${y + 4}`).join(""), paint: "#c9a85a", line: 0.22, lift: 0.1, finish: "metal" },
        {
          d: "M29 18.6C29.6 20.4 28.4 21.6 27 21C25.8 20.4 26.2 18.6 27.6 18.8M28.6 19L27.2 3.6C27 1.6 28.6.4 29.6 1.4C30.6 2.6 29.6 5 27.6 6.6C25.4 8.4 24.4 10.2 24.8 12.2C25.2 14.4 27.8 15.2 29.6 14.2C31.4 13.2 31.2 10.6 29.2 10.2C27.6 9.9 26.6 11.4 27.4 12.6",
          paint: GOLD,
          line: 0.8,
          outline: ["#5a3e10", 0.25],
          lift: 0.3,
          finish: "metal",
        },
      ],
    },
    {
      // Two beamed notes rising beside the clef.
      at: ["top"],
      box: [24, 16],
      origin: [-2, 14],
      scale: 1.4,
      rise: 2,
      layers: [
        { d: "M9.3 12.5V3M18.3 11V1.5", paint: "#1f4f8a", line: 0.55, lift: 0.3, finish: "gloss" },
        { d: `M9.3 3L18.3 1.5V3.4L9.3 4.9Z${"M5.6 12.5a1.9 1.4 0 1 0 3.8 0a1.9 1.4 0 1 0-3.8 0Z"}${"M14.6 11a1.9 1.4 0 1 0 3.8 0a1.9 1.4 0 1 0-3.8 0Z"}`, paint: ["#6aa8ea", "#2b6cb0"], lift: 0.1, depth: 0.6, finish: "gloss" },
      ],
    },
    {
      // Blossom petals drifting onto the rails.
      at: ["tr", "bl"],
      box: [36, 14],
      origin: [5, 5],
      scale: 1.3,
      rise: 1,
      layers: [{ d: PETAL, copies: ["translate(25 7.5) rotate(70) scale(1.1)", "translate(31.5 6.6) rotate(-30)"], paint: ["#ffd6e4", "#f08db0"], lift: 0.2, depth: 0.25, finish: "satin" }],
    },
  ],
  "demon-wing": [
    {
      // Devilman's bat wings spreading up and out from the top corners, neon bones through a scalloped membrane.
      at: ["tl", "tr"],
      box: [36, 42],
      origin: [34, 34],
      scale: 0.9,
      rise: 2.5,
      layers: [
        { d: "M34 34L26 22L16 9L5 0Q7 8 1 14Q7 20 2 27Q9 29 10 38Q19 33 30 40Z", paint: ["#9a2a9e", "#2a0830"], outline: ["#ff2e88", 0.4], lift: 0, depth: 0.5, finish: "satin" },
        { d: "M16 9Q10 6 3 7M16 9Q10 14 1.5 20.5M16 9Q11 20 6 32.5M16 9Q17 24 20 39", paint: "#e070d0", line: 0.3, opacity: 0.6, lift: 0.5, finish: "satin" },
        { d: "M34 34L26 22L16 9M16 9L5 0M16 9Q8 10 1 14M16 9Q8 17 2 27M16 9Q12 22 10 38", paint: ["#ffe3f0", "#ff2e88"], line: 0.9, lift: 0.55, finish: "glow" },
        { d: "M16 9C14.6 7.4 14 5 15 2.6C15.8 4.8 17.2 6.4 18.4 7.6Z", paint: BONE, outline: ["#2a0018", 0.25], lift: 0.6, depth: 0.3, finish: "gloss" },
        { d: `${circle(26, 22, 1)}${circle(16, 9, 1.3)}${circle(5, 0.6, 0.7)}${circle(1, 14, 0.7)}${circle(2, 27, 0.7)}${circle(10, 38, 0.7)}`, paint: ["#c8fff6", "#19e3c8"], lift: 0.9, depth: 0.3, finish: "gem" },
      ],
    },
    {
      // Devilman's horned head rising over the top edge, its slanted eyes glowing.
      at: ["top"],
      box: [30, 20],
      origin: [15, 18],
      scale: 1.35,
      rise: 2,
      layers: [
        { d: "M10.6 15C9.6 9.6 6.6 5 1.6 1.6C5 6 6.6 10.4 7.4 15.6Z", copies: mirror(30), paint: ["#ffe3f0", "#ff2e88"], outline: ["#2a0018", 0.3], lift: 0, depth: 0.8, finish: "gloss" },
        { d: "M6 18L7.6 12.4L11 13.6L15 8.4L19 13.6L22.4 12.4L24 18Z", paint: ["#3a0c40", "#0c030e"], outline: ["#ff2e88", 0.3], lift: 0.1, depth: 0.5, finish: "satin" },
        { d: "M9.2 14L13.8 15.2L13.2 16.6C11.4 16.4 10 15.6 9.2 14Z", copies: mirror(30), paint: ["#c8fff6", "#19e3c8"], lift: 0.6, depth: 0.2, finish: "glow" },
        { d: "M15 10L16 11.6L15 13.2L14 11.6Z", paint: "#ff2e88", lift: 0.6, depth: 0.2, finish: "glow" },
      ],
    },
    {
      // Blood splatter dripping off the lower corners.
      at: ["bl", "br"],
      box: [18, 18],
      origin: [5, 5],
      scale: 1.6,
      rise: 0.5,
      layers: [
        { d: `${circle(7.5, 7.5, 2.2)}${circle(12.8, 6.4, 0.9)}${circle(10.5, 3.2, 0.6)}${circle(15.5, 8.3, 0.5)}${circle(5.2, 12.6, 0.7)}${circle(7.5, 14.4, 0.6)}${circle(12.8, 10.4, 0.45)}`, paint: ["#ff3355", "#9b0a24"], lift: 0, depth: 0.35, finish: "gloss" },
        { d: "M7.5 9.4V14M12.8 7V10.2", paint: "#c8102e", line: 0.6, lift: 0, finish: "gloss" },
      ],
    },
    {
      // Miki's relay baton under the bottom edge, crybaby tears falling from it.
      at: ["bottom"],
      box: [32, 16],
      origin: [16, 2],
      scale: 1.35,
      rise: 1.5,
      layers: [
        { d: "M6 4.4h20a1.6 1.6 0 0 1 0 3.2h-20a1.6 1.6 0 0 1 0-3.2Z", copies: ["rotate(-8 16 6)"], paint: ["#ffd6ea", "#ff2e88"], outline: ["#2a0018", 0.3], lift: 0, depth: 0.6, finish: "gloss" },
        { d: "M10 4.4V7.6M22 4.4V7.6", copies: ["rotate(-8 16 6)"], paint: "#ffffff", line: 0.5, lift: 0.6, finish: "satin" },
        { d: "M4 4.5C5.8 7.6 6.6 9 6.6 10.4A2.6 2.6 0 1 1 1.4 10.4C1.4 9 2.2 7.6 4 4.5Z", copies: ["translate(5 5) scale(.6)", "translate(19.5 6.5) scale(.75)", "translate(12.5 8.5) scale(.5)"], paint: ["#c8fff6", "#19e3c8"], lift: 0, depth: 0.5, finish: "gem" },
      ],
    },
  ],
  moonshot: [
    {
      // Hex bolts holding the chrome plates together.
      at: ALL,
      box: [16, 16],
      origin: [5, 5],
      scale: 1.3,
      rise: 0.5,
      layers: [
        { d: "M9.4 7.5L8.45 9.15H6.55L5.6 7.5L6.55 5.85H8.45Z", paint: ["#ffffff", "#6a7586"], lift: 0, depth: 0.5, finish: "metal" },
        { d: "M6.6 8.4L8.4 6.6", paint: "#2c3340", line: 0.35, lift: 0.75, finish: "metal" },
      ],
    },
    {
      // Signal-yellow circuit traces leaving two corners.
      at: ["tl", "br"],
      box: [32, 32],
      origin: [5, 5],
      layers: [
        { d: "M10 7.5H17L19 6H27M7.5 10V17L6 19V27", paint: "#f5e112", line: 0.45, lift: 0.15, finish: "glow" },
        { d: `${circle(27, 6, 0.8)}${circle(6, 27, 0.8)}`, paint: "#f5e112", lift: 0.1, depth: 0.3, finish: "glow" },
      ],
    },
    {
      // Glitch slices torn off the other two corners.
      at: ["tr", "bl"],
      box: [32, 28],
      origin: [5, 5],
      scale: 1.2,
      layers: [
        { d: "M15 4.3h10v1.5h-10ZM4.3 16h1.4v8h-1.4Z", paint: "#22d3ee", lift: 0.1, depth: 0.25, finish: "glow" },
        { d: "M21 8.6h7v1.2h-7ZM8.7 21h1.1v5h-1.1Z", paint: "#ff3fd2", lift: 0.1, depth: 0.25, finish: "glow" },
      ],
    },
    {
      // A crescent moon over the top edge, wired in with traces.
      at: ["top"],
      box: [22, 16],
      origin: [11, 13],
      scale: 1.7,
      rise: 2,
      layers: [
        { d: circle(10.4, 6.4, 6.6), paint: "#22d3ee", line: 0.3, lift: 0.05, finish: "glow" },
        { d: [0, 60, 120, 180].map((a) => circle(n(10.4 + Math.cos((a * Math.PI) / 180) * 6.6), n(6.4 - Math.sin((a * Math.PI) / 180) * 6.6), 0.55)).join(""), paint: "#22d3ee", lift: 0.1, depth: 0.3, finish: "glow" },
        { d: "M11.27 1.01A5.5 5.5 0 1 0 15.55 9.58A4.8 4.8 0 0 1 11.27 1.01Z", paint: ["#fffbe0", "#ffe27a"], lift: 0, depth: 0.8, finish: "glow" },
        { d: "M1 14.5H5.5L7.5 12.4M21 14.5H16.5L14.5 12.4", paint: "#22d3ee", line: 0.4, lift: 0.1, finish: "glow" },
      ],
    },
    {
      // A rocket blasting off the top-right corner, its exhaust streaking along the rail.
      at: ["tr"],
      box: [36, 18],
      origin: [9, 9],
      scale: 1.3,
      rise: 2.5,
      layers: [
        { d: "M11.5 11.5C17 12.8 25 12 35 11.6", paint: "#f5e112", line: 0.4, opacity: 0.8, lift: 0, finish: "glow" },
        { d: "M-1.4 4.4Q0 10 1.4 4.4Z", copies: [ROCKET], paint: ["#fff3a0", "#ff7a1a"], lift: 0.1, depth: 0.3, finish: "glow" },
        { d: "M-2.2 1.2L-4.4 4.8V6.2L-2.2 4.2ZM2.2 1.2L4.4 4.8V6.2L2.2 4.2Z", copies: [ROCKET], paint: ["#ff7ae0", "#c0189a"], lift: 0.2, depth: 0.4, finish: "gloss" },
        { d: "M0-7C2.4-4.6 2.8-.6 2.2 4.4H-2.2C-2.8-.6-2.4-4.6 0-7Z", copies: [ROCKET], paint: ["#ffffff", "#8a95a8"], lift: 0.3, depth: 0.7, finish: "metal" },
        { d: circle(0, -1.4, 1.1), copies: [ROCKET], paint: ["#c8fbff", "#22d3ee"], lift: 1, depth: 0.2, finish: "gem" },
      ],
    },
  ],
  "golden-arrow": [
    {
      // Giorno's gold ladybug brooches crawling out of each corner over an Art Deco fan.
      at: ALL,
      box: [22, 22],
      origin: [12, 12],
      scale: 1.4,
      rise: 2,
      layers: [
        { d: [180, 195, 210, 225, 240, 255, 270].map((a) => `M${polar(14, 14, 5.4, (a * Math.PI) / 180)}L${polar(14, 14, a % 30 ? 10.5 : 13, (a * Math.PI) / 180)}`).join(""), paint: GOLD, line: 0.4, lift: 0, finish: "metal" },
        { d: arc(14, 14, 5.4, 5.4, 180, 270), paint: GOLD, line: 0.5, lift: 0.1, finish: "metal" },
        { d: LADYBUG.shell, copies: ["translate(14 14) rotate(-45) translate(-8 -8.5)"], paint: GOLD, outline: ["#4a2a06", 0.3], lift: 0.2, depth: 0.9, finish: "metal" },
        { d: LADYBUG.head, copies: ["translate(14 14) rotate(-45) translate(-8 -8.5)"], paint: ["#e8c46a", "#8a5c12"], lift: 1, depth: 0.4, finish: "metal" },
        { d: LADYBUG.lines, copies: ["translate(14 14) rotate(-45) translate(-8 -8.5)"], paint: "#7a5410", line: 0.35, lift: 1.5, finish: "metal" },
        { d: LADYBUG.spots, copies: ["translate(14 14) rotate(-45) translate(-8 -8.5)"], paint: "#7a5410", lift: 1.4, depth: 0.2, finish: "gloss" },
      ],
    },
    {
      // An Art Deco sunburst fanning out behind the Arrow.
      at: ["top"],
      box: [44, 22],
      origin: [22, 18],
      scale: 1.3,
      rise: 1,
      layers: [
        {
          d: Array.from({ length: 11 }, (_, i) => {
            const a = Math.PI + ((i + 1) * Math.PI) / 12;
            const r = i % 2 ? 12 : 16.5;
            return `M22 17.3L${polar(22, 17.3, r, a - 0.07)}L${polar(22, 17.3, r, a + 0.07)}Z`;
          }).join(""),
          paint: GOLD,
          lift: 0,
          depth: 0.2,
          finish: "metal",
        },
        { d: arc(22, 17.3, 9.5, 9.5, 180, 360), paint: GOLD, line: 0.5, lift: 0.25, finish: "metal" },
      ],
    },
    {
      // The Stand Arrow standing on the top edge, a scarab set in its head.
      at: ["top"],
      box: [30, 32],
      origin: [15, 31],
      scale: 1.6,
      rise: 3,
      layers: [
        { d: "M15 18V31", paint: ["#c8a060", "#6a4a1c"], line: 1.6, lift: 0, finish: "satin" },
        { d: "M12.4 14.6C9.4 14.4 6.4 16 4.6 19.4C7.6 17.8 10.2 17.6 12.6 18.4Z", copies: mirror(30), paint: GOLD, outline: ["#4a2a06", 0.25], lift: 0.2, depth: 0.5, finish: "metal" },
        { d: "M15 1C16.6 5.4 19.2 9.6 21.8 12.4C20 12.6 18.4 13.6 17.6 15L17.4 18.4H12.6L12.4 15C11.6 13.6 10 12.6 8.2 12.4C10.8 9.6 13.4 5.4 15 1Z", paint: GOLD, outline: ["#4a2a06", 0.3], lift: 0.4, depth: 0.7, finish: "metal" },
        { d: "M12.6 18h4.8v2.2h-4.8Z", paint: GOLD, outline: ["#4a2a06", 0.25], lift: 0.5, depth: 0.5, finish: "metal" },
        { d: "M15 2.8V8.4", paint: "#fff8d8", line: 0.3, lift: 1.1, finish: "metal" },
        { d: `M15 9.6C16.6 9.6 17.4 11 17.4 12.6C17.4 14.4 16.4 15.6 15 15.6C13.6 15.6 12.6 14.4 12.6 12.6C12.6 11 13.4 9.6 15 9.6Z${circle(15, 9, 0.8)}`, paint: ["#9ff3ea", "#1f9e93"], lift: 1.1, depth: 0.3, finish: "gem" },
        { d: "M15 10.2V15.4", paint: "#0d4d48", line: 0.2, lift: 1.4, finish: "gloss" },
      ],
    },
    {
      // Menacing ゴゴゴ rumbling up the right side…
      at: ["tr"],
      box: [18, 58],
      origin: [16, 4],
      rise: 1.5,
      layers: menacing(-1, 1),
    },
    {
      // …and the left side from the bottom.
      at: ["bl"],
      box: [18, 58],
      origin: [16, 4],
      rise: 1.5,
      layers: menacing(1, -1),
    },
  ],
  "tsuba-guard": [
    {
      // A sheathed katana laid along the top rail, its hilt jutting past the corner.
      at: ["tl", "br"],
      box: [74, 13],
      origin: [16, 4],
      rise: 1.5,
      layers: [
        { d: "M22 5.3H67Q71 5.3 72.4 6.5Q71 7.7 67 7.7H22Z", paint: ["#b3262e", "#3a060a"], lift: 0.1, depth: 0.5, finish: "gloss" },
        { d: "M67 5.3Q71 5.3 72.4 6.5Q71 7.7 67 7.7ZM22 5.2h1.4v2.6H22Z", paint: GOLD, lift: 0.65, depth: 0.1, finish: "metal" },
        { d: "M28 7.7C29 10.4 33 10.6 34 8C35 10.6 38.6 10.6 40 8", paint: ["#9a80e6", "#3b2470"], line: 0.5, lift: 0.6, finish: "satin" },
        { d: "M4 5.2H19V7.8H4Z", paint: ["#f4efe6", "#bdb5a6"], lift: 0.1, depth: 0.5, finish: "satin" },
        { d: [4.5, 7, 9.5, 12, 14.5].map((x) => `M${x} 5.2L${x + 2} 7.8M${x + 2} 5.2L${x} 7.8`).join(""), paint: "#16161c", line: 0.45, lift: 0.65, finish: "satin" },
        { d: `M2.6 5H4.4V8H2.6Z${circle(11.5, 6.5, 0.6)}`, paint: GOLD, lift: 0.1, depth: 0.6, finish: "metal" },
      ],
    },
    {
      // Iron sword guards with a gold rim, gold petal inlays and a gold collar around the blade slot.
      at: ALL,
      box: [12, 12],
      origin: [3.4, 3.4],
      scale: 1.7,
      rise: 1.5,
      layers: [
        { d: mokko(6, 4.6), paint: ["#70707c", "#15151a"], lift: 0, depth: 0.9, finish: "metal" },
        { d: mokko(6, 4.6), paint: GOLD, line: 0.45, lift: 0.95, finish: "metal" },
        { d: PETAL, copies: [-45, 45, 135, -135].map((a) => `rotate(${a} 6 6) translate(6 3.9) scale(.42)`), paint: GOLD, lift: 1.05, depth: 0.15, finish: "metal" },
        { d: "M6 4.4C7.1 4.4 7.6 5.2 7.6 6C7.6 6.8 7.1 7.6 6 7.6C4.9 7.6 4.4 6.8 4.4 6C4.4 5.2 4.9 4.4 6 4.4Z", copies: ["rotate(-45 6 6)"], paint: GOLD, lift: 1.05, depth: 0.3, finish: "metal" },
        { d: "M5.65 5.1H6.35L6.25 6.9H5.75Z", copies: ["rotate(-45 6 6)"], paint: "#0b0b0d", lift: 1.4, depth: 0.1, finish: "satin" },
      ],
    },
    {
      // A black butterfly with ember-enamelled wings on the top edge.
      at: ["top"],
      box: [30, 22],
      origin: [15, 11],
      scale: 1.25,
      rise: 2.5,
      layers: [
        { d: BUTTERFLY, copies: ["translate(15 10.6) scale(1.2) translate(-12 -8)"], paint: ["#30303a", "#060608"], lift: 0.3, depth: 0.5, finish: "satin" },
        { d: BUTTERFLY, copies: ["translate(15 10.6) scale(.86) translate(-12 -8)"], paint: ["#ffa040", "#8a1c06"], lift: 1, depth: 0.15, finish: "gloss" },
        { d: BUTTERFLY, copies: ["translate(15 10.6) scale(.5) translate(-12 -8)"], paint: "#0a0a0c", lift: 1.2, depth: 0.1, finish: "satin" },
        { d: BUTTERFLY, copies: ["translate(15 10.6) scale(1.2) translate(-12 -8)"], paint: "#ff7a1a", line: 0.3, lift: 0.85, finish: "glow" },
        { d: "M15 7.5V14.6", paint: "#0d0d0f", line: 1, lift: 1.3, finish: "satin" },
        { d: "M14.6 7.6L12.9 4.6M15.4 7.6L17.1 4.6", paint: "#ff7a1a", line: 0.3, lift: 1.3, finish: "glow" },
      ],
    },
    {
      // A braided cord knot and tassel hanging from the bottom edge.
      at: ["bottom"],
      box: [16, 12],
      origin: [8, 3],
      scale: 1.5,
      rise: 1.5,
      layers: [
        { d: "M8 2.6C5.6 .4 2.8 1.2 3.4 3.4C4 5.2 6.6 4.6 8 2.9C9.4 4.6 12 5.2 12.6 3.4C13.2 1.2 10.4 .4 8 2.6Z", paint: ["#9a80e6", "#3b2470"], line: 0.8, lift: 0.4, finish: "satin" },
        { d: "M6.8 4.8H9.2L10.2 10.8C9 11.4 7 11.4 5.8 10.8Z", paint: ["#8466d8", "#2a1756"], lift: 0.1, depth: 0.5, finish: "satin" },
        { d: "M6.9 7.4L6.5 10.6M8 7.4V10.9M9.1 7.4L9.5 10.6", paint: "#1c0f3c", line: 0.22, lift: 0.75, finish: "satin" },
        { d: `${circle(8, 3.2, 1.05)}M6.6 4.7h2.8v1.3h-2.8Z`, paint: GOLD, lift: 0.8, depth: 0.35, finish: "metal" },
      ],
    },
  ],
  "hollow-fang": [
    {
      // A black crescent slash embracing two corners from outside, its inner edge burning crimson.
      at: ["tl", "br"],
      box: [40, 40],
      origin: [12, 12],
      scale: 1.1,
      rise: 1,
      layers: [
        { d: "M12 38C7 28 4 14 5 5C14 4 28 7 38 12C26 9.5 15 9 10.5 10.5C9 15 9.5 26 12 38Z", paint: ["#3a3a44", "#020203"], lift: 0, depth: 0.7, finish: "gloss" },
        { d: "M38 12C26 9.5 15 9 10.5 10.5C9 15 9.5 26 12 38", paint: CRIMSON, line: 0.55, lift: 0.75, finish: "glow" },
        { d: "M12 38C7 28 4 14 5 5C14 4 28 7 38 12", paint: "#e9e0cf", line: 0.25, lift: 0.75, finish: "satin" },
        { d: "M14.5 12.6L16.4 14.5L14.5 16.4L12.6 14.5Z", paint: ["#ffb3ba", "#b3001b"], lift: 0.2, depth: 0.5, finish: "gem" },
      ],
    },
    {
      // A cracked bone mask shard over the other two corners, with a hollow eye slit and crimson markings.
      at: ["tr", "bl"],
      box: [26, 26],
      origin: [6, 6],
      scale: 1.35,
      rise: 2,
      layers: [
        { d: "M2 3L13 1.5L19 4L16.5 6.4L22.5 8L12.6 12.6L8 20.5L6.6 15L4 21L1.5 12Z", paint: BONE, lift: 0, depth: 0.8, finish: "gloss" },
        { d: "M5.4 7C8 5.4 11.6 5.6 13.8 7.3C11 8.2 8 8.6 5.4 7Z", paint: "#0b0b0d", lift: 1.05, depth: 0.12, finish: "gloss" },
        { d: "M10.6 8.8C9.9 11 8.8 13.3 7.5 15.2M13.2 8.4C12.8 9.9 12.2 11.1 11.4 12.3", paint: CRIMSON, line: 0.7, lift: 1.05, finish: "gloss" },
        { d: "M13 1.6L11.6 4.3L12.9 5.2M4 21L4.6 17.4", paint: "#7d7262", line: 0.2, lift: 1.05, finish: "satin" },
      ],
    },
    {
      // Bone horns rising from the top edge around a hollow hole.
      at: ["top"],
      box: [28, 16],
      origin: [14, 10],
      scale: 1.45,
      rise: 2,
      layers: [
        { d: "M11 11.5C9 7 6.5 4.5 2.5 3.5C5.5 6 6.8 8.6 7.6 12.5ZM17 11.5C19 7 21.5 4.5 25.5 3.5C22.5 6 21.2 8.6 20.4 12.5Z", paint: BONE, lift: 0, depth: 0.8, finish: "gloss" },
        { d: circle(14, 10, 4.2), paint: BONE, lift: 0, depth: 0.9, finish: "gloss" },
        { d: circle(14, 10, 2.5), paint: ["#1c0006", "#000000"], lift: 1.05, depth: 0.1, finish: "gloss" },
        { d: circle(14, 10, 2.5), paint: CRIMSON, line: 0.4, lift: 1.1, finish: "glow" },
      ],
    },
  ],
  "five-ribbons": [
    {
      // Yotsuba's green bunny-ear ribbon.
      at: ["tl"],
      box: [24, 24],
      origin: [10, 10],
      scale: 1.9,
      rise: 2,
      layers: [
        { d: `${lens(12.5, 12.5, 7, 21, 2.4)}${lens(12.5, 12.5, 3.6, 18, 2.4)}`, paint: ["#b9f0c6", "#3f9e59"], outline: ["#1f5a30", 0.25], lift: 0, depth: 0.3, finish: "satin" },
        { d: `${lens(12.5, 12.5, 8.6, 0.4, 5)}${lens(12.5, 12.5, 17, 1.2, 5)}`, paint: ["#c8f5d2", "#3f9e59"], outline: ["#1f5a30", 0.3], lift: 0.2, depth: 0.5, finish: "satin" },
        { d: `${lens(12.5, 12.5, 10, 4.6, 1.8)}${lens(12.5, 12.5, 15.4, 5, 1.8)}`, paint: "#2f7a44", lift: 0.7, depth: 0.1, finish: "satin" },
        { d: circle(12.5, 12.5, 1.7), paint: ["#b9f0c6", "#2f7a44"], outline: ["#1f5a30", 0.25], lift: 0.8, depth: 0.4, finish: "gloss" },
      ],
    },
    {
      // Nino's black butterfly ribbons.
      at: ["tr"],
      box: [26, 18],
      origin: [6, 6],
      scale: 1.9,
      rise: 2,
      layers: [
        { d: BUTTERFLY, copies: ["translate(6 6) scale(.75) translate(-12 -8)", "translate(19 2.6) rotate(15) scale(.45) translate(-12 -8)"], paint: ["#4a4a58", "#050507"], outline: ["#ff8ab8", 0.35], lift: 0, depth: 0.5, finish: "gloss" },
        { d: "M12 5.4C12.7 5.4 12.8 7 12.8 8.4C12.8 10.4 12.5 12 12 12C11.5 12 11.2 10.4 11.2 8.4C11.2 7 11.3 5.4 12 5.4Z", copies: ["translate(6 6) scale(.75) translate(-12 -8)", "translate(19 2.6) rotate(15) scale(.45) translate(-12 -8)"], paint: ["#ffc2d9", "#e8638f"], lift: 0.6, depth: 0.3, finish: "gloss" },
      ],
    },
    {
      // Itsuki's star hair clips (turned so the flipped corner shows them upright).
      at: ["bl"],
      box: [20, 22],
      origin: [6, 6],
      scale: 1.6,
      rise: 2,
      layers: [
        { d: star(0, 0, 5.4, 2.2), copies: ["translate(7.5 7.5) rotate(180)", "translate(3 16.5) rotate(160) scale(.55)"], paint: ["#ffe58a", "#f0a92c"], outline: ["#8a5a10", 0.3], lift: 0, depth: 0.7, finish: "gloss" },
        { d: star(0, 0, 2.4, 1), copies: ["translate(7.5 7.5) rotate(180)"], paint: "#fff6c8", lift: 0.7, depth: 0.15, finish: "gloss" },
      ],
    },
    {
      // A wedding bell for the bride (turned so the flipped corner shows it upright).
      at: ["br"],
      box: [18, 18],
      origin: [6, 6],
      scale: 1.6,
      rise: 2,
      layers: [
        { d: "M8 2.4C10.6 2.4 11.6 4.6 11.8 7.4C12 9.6 12.8 11 14 12H2C3.2 11 4 9.6 4.2 7.4C4.4 4.6 5.4 2.4 8 2.4Z", copies: ["rotate(180 8 8)"], paint: GOLD, outline: ["#5a3e10", 0.3], lift: 0, depth: 0.8, finish: "metal" },
        { d: `${circle(8, 13.2, 1.1)}${circle(8, 1.8, 0.8)}`, copies: ["rotate(180 8 8)"], paint: GOLD, lift: 0.2, depth: 0.5, finish: "metal" },
        { d: "M8 10.4C6.8 9.6 6.4 9 6.4 8.4C6.4 7.6 7.3 7.3 8 8C8.7 7.3 9.6 7.6 9.6 8.4C9.6 9 9.2 9.6 8 10.4Z", copies: ["rotate(180 8 8)"], paint: ["#ffc2d9", "#e8638f"], lift: 0.9, depth: 0.2, finish: "gem" },
      ],
    },
    {
      // Miku's blue headphones resting on the top edge.
      at: ["top"],
      box: [44, 26],
      origin: [22, 21],
      scale: 1.15,
      rise: 2.5,
      layers: [
        { d: arc(22, 21, 16, 16, 180, 360), paint: ["#9fdcff", "#1f5f9e"], line: 2.2, outline: ["#0b2a4a", 0.35], lift: 0, finish: "gloss" },
        { d: arc(22, 21, 14.6, 14.6, 205, 335), paint: "#e8f6ff", line: 0.7, lift: 0.4, finish: "satin" },
        { d: ["M2.6 20a3.4 4.8 0 1 0 6.8 0a3.4 4.8 0 1 0 -6.8 0Z", "M34.6 20a3.4 4.8 0 1 0 6.8 0a3.4 4.8 0 1 0 -6.8 0Z"].join(""), paint: ["#5ab0f0", "#163e7a"], outline: ["#0b2a4a", 0.35], lift: 0.2, depth: 0.9, finish: "gloss" },
        { d: ["M4.4 20a1.6 2.8 0 1 0 3.2 0a1.6 2.8 0 1 0 -3.2 0Z", "M36.4 20a1.6 2.8 0 1 0 3.2 0a1.6 2.8 0 1 0 -3.2 0Z"].join(""), paint: ["#dff3ff", "#8fc6ef"], lift: 1.1, depth: 0.2, finish: "gloss" },
      ],
    },
    {
      // Five ribbon tails, one in each colour, hanging from the bottom edge.
      at: ["bottom"],
      box: [20, 11],
      origin: [10, 6],
      scale: 1.8,
      rise: 1,
      layers: (["#f0a92c", "#e8638f", "#3f9e59", "#2f948d", "#a24bc0"] as const).map((colour, i) => ({
        d: `M${2 + i * 3.6} 1h1.6v8.6l-.8-.9-.8.9Z`,
        paint: colour,
        lift: 0.1,
        depth: 0.25,
        finish: "satin" as const,
      })),
    },
  ],
  "frost-glam": [
    {
      // Snowflakes with a pink stone at the heart, and rhinestones running along both rails.
      at: ALL,
      box: [26, 26],
      origin: [6.5, 6.5],
      scale: 1.8,
      rise: 1.5,
      layers: [
        { d: "M7.5 7.5V2.9M7.5 4.6L6.3 3.5M7.5 4.6L8.7 3.5", copies: rotations(6, 7.5, 7.5), paint: ["#ffffff", "#9fd3f5"], line: 0.7, lift: 0.2, finish: "metal" },
        { d: circle(7.5, 7.5, 1.1), paint: ["#ffc2de", "#ff2e8a"], lift: 0.4, depth: 0.5, finish: "gem" },
        { d: circle(7.5, 2.4, 0.6), copies: rotations(6, 7.5, 7.5), paint: ["#ffffff", "#b8e2ff"], lift: 0.5, depth: 0.4, finish: "gem" },
      ],
    },
    {
      // A crystal tiara with a pink heart stone on the top edge.
      at: ["top"],
      box: [34, 18],
      origin: [17, 15],
      scale: 1.25,
      rise: 2,
      layers: [
        { d: "M5.4 15.4L6.4 8.6L10.4 12L13 5.6L15 8.4L17 1.8L19 8.4L21 5.6L23.6 12L27.6 8.6L28.6 15.4Q17 12.4 5.4 15.4Z", paint: ["#ffffff", "#a8c8ea"], lift: 0, depth: 0.5, finish: "metal" },
        { d: "M5 15.6Q17 12.6 29 15.6L28.6 17Q17 14.2 5.4 17Z", paint: ["#ffffff", "#9fb4d0"], lift: 0.1, depth: 0.5, finish: "metal" },
        { d: "M8.6 13.2Q10.6 11.8 12.4 13M21.6 13Q23.4 11.8 25.4 13.2", paint: "#ffffff", line: 0.3, lift: 0.55, finish: "gloss" },
        { d: `${circle(6.4, 8.6, 0.8)}${circle(13, 5.6, 0.9)}${circle(21, 5.6, 0.9)}${circle(27.6, 8.6, 0.8)}${circle(17, 2.6, 0.75)}`, paint: ["#ffffff", "#b8e2ff"], lift: 0.5, depth: 0.3, finish: "gem" },
        { d: "M17 12C14.8 10.6 14 9.4 14 8.4C14 7.1 15.6 6.4 17 7.7C18.4 6.4 20 7.1 20 8.4C20 9.4 19.2 10.6 17 12Z", paint: ["#ffc2de", "#ff2e8a"], lift: 0.5, depth: 0.4, finish: "gem" },
      ],
    },
  ],
  "summer-fireworks": [
    {
      // Chrysanthemum fireworks bursting just outside each corner.
      at: ALL,
      box: [20, 20],
      origin: [8, 8],
      scale: 1.6,
      rise: 1,
      layers: [
        { d: spokes(5.5, 5.5, 1.4, 6.2, 16), paint: ["#fff3c4", "#ffb03a"], line: 0.35, lift: 0, finish: "glow" },
        { d: ring(5.5, 5.5, 6.9, 16, 0.45), paint: ["#ffe9a8", "#ff7a3c"], lift: 0, depth: 0.3, finish: "glow" },
        { d: spokes(5.5, 5.5, 0.9, 3.6, 8, Math.PI / 8), paint: "#ff8ac4", line: 0.3, lift: 0.2, finish: "glow" },
        { d: circle(5.5, 5.5, 0.9), paint: "#ffffff", lift: 0.3, depth: 0.3, finish: "glow" },
      ],
    },
    {
      // A sunflower crest on the top edge.
      at: ["top"],
      box: [24, 20],
      origin: [12, 12],
      scale: 1.35,
      rise: 2,
      layers: [
        { d: "M0 0C-1.1-1.4-1.1-3.6 0-4.6C1.1-3.6 1.1-1.4 0 0Z", copies: rotations(14, 0, 0).map((turn) => `translate(12 9) ${turn} translate(0 -2.2)`), paint: ["#ffe14a", "#f0a020"], lift: 0, depth: 0.35, finish: "satin" },
        { d: circle(12, 9, 2.6), paint: ["#7a4a1c", "#3a2008"], lift: 0.2, depth: 0.5, finish: "satin" },
        { d: ring(12, 9, 1.5, 8, 0.3), paint: "#c08a3a", lift: 0.75, depth: 0.1, finish: "satin" },
      ],
    },
    {
      // Paper lanterns strung below the bottom edge.
      at: ["bottom"],
      box: [44, 18],
      origin: [22, 1],
      scale: 1.6,
      rise: 2,
      layers: [
        { d: `M2 1.6Q22 7 42 1.6${LANTERNS.map(([x, y, top]) => `M${x} ${top}V${n(y - 3.9)}`).join("")}`, paint: "#3a2008", line: 0.3, lift: 0, finish: "satin" },
        { d: LANTERNS.map(([x, y]) => `M${n(x - 2.8)} ${y}a2.8 3.4 0 1 0 5.6 0a2.8 3.4 0 1 0 -5.6 0Z`).join(""), paint: ["#ffd27a", "#e0283a"], lift: 0, depth: 0.6, finish: "glow" },
        {
          d: LANTERNS.map(([x, y]) => `M${n(x - 2.6)} ${n(y - 1.2)}Q${x} ${n(y - 0.6)} ${n(x + 2.6)} ${n(y - 1.2)}M${n(x - 2.7)} ${n(y + 1)}Q${x} ${n(y + 1.6)} ${n(x + 2.7)} ${n(y + 1)}`).join(""),
          paint: "#8a1020",
          line: 0.18,
          lift: 0.65,
          finish: "satin",
        },
        { d: LANTERNS.map(([x, y]) => `M${n(x - 1.6)} ${n(y - 3.9)}h3.2v1h-3.2ZM${n(x - 1.6)} ${n(y + 2.9)}h3.2v1h-3.2Z`).join(""), paint: "#1f1410", lift: 0.1, depth: 0.6, finish: "gloss" },
        { d: LANTERNS.map(([x, y]) => `M${x} ${n(y + 3.9)}V${n(y + 5.8)}`).join(""), paint: "#ffd27a", line: 0.4, lift: 0.2, finish: "glow" },
      ],
    },
  ],
  "sakura-storm": [
    {
      // A gnarled cherry branch climbing one side rail (and, turned round, the other), in bloom.
      at: ["bl", "tr"],
      box: [16, 50],
      origin: [3, 3],
      scale: 1.45,
      rise: 1.5,
      layers: [
        { d: "M4 1C5.5 9 3.6 17 5.8 25C7 31 5 38 6 46", paint: ["#8a5a44", "#3e2418"], line: 1.6, outline: ["#2a160c", 0.2], lift: 0, finish: "satin" },
        { d: "M5.8 25C3.6 23 1.6 19.5 1 16M4.6 12C2.6 10 2 8 1.2 6", paint: ["#8a5a44", "#3e2418"], line: 0.8, lift: 0.1, finish: "satin" },
        { d: PETAL, copies: blossoms([[1, 15.6, 1.2], [4.4, 36, 1.25], [1.4, 5.8, 1.05], [5.8, 25, 1], [6, 45.5, 0.9], [2, 28.5, 0.7], [3.6, 20.5, 0.8], [7, 40.5, 0.75], [2.6, 10.5, 0.7], [6.6, 31.5, 0.9]]), paint: ["#ffe5ec", "#f08db0"], outline: ["#b0456a", 0.15], lift: 0.5, depth: 0.3, finish: "satin" },
        { d: `${circle(1, 15.6, 0.75)}${circle(4.4, 36, 0.75)}${circle(1.4, 5.8, 0.65)}${circle(5.8, 25, 0.6)}${circle(6, 45.5, 0.55)}${circle(2, 28.5, 0.45)}${circle(3.6, 20.5, 0.5)}${circle(7, 40.5, 0.45)}${circle(2.6, 10.5, 0.45)}${circle(6.6, 31.5, 0.55)}`, paint: "#c24d6c", lift: 0.9, depth: 0.15, finish: "satin" },
      ],
    },
    {
      at: ["tl", "br"],
      box: [16, 16],
      origin: [4, 4],
      scale: 1.7,
      rise: 1,
      layers: [
        { d: PETAL, copies: blossoms([[6.5, 6.5, 0.85]]), paint: ["#ffe5ec", "#f08db0"], outline: ["#b0456a", 0.15], lift: 0.1, depth: 0.3, finish: "satin" },
        { d: `${circle(6.5, 6.5, 0.6)}${circle(11, 6, 0.6)}${circle(6, 11, 0.6)}`, paint: ["#ffb3c6", "#c24d6c"], lift: 0.5, depth: 0.2, finish: "satin" },
      ],
    },
    {
      // A blossoming cherry bough arching over the top edge, shedding petals.
      at: ["top"],
      box: [64, 22],
      origin: [32, 20],
      rise: 2,
      layers: [
        { d: "M2 20C10 13 20 9 32 9C44 9 54 13 62 20", paint: ["#8a5a44", "#3e2418"], line: 1.4, outline: ["#2a160c", 0.2], lift: 0, finish: "satin" },
        { d: "M14 12.6C13 9 14 6.4 16 5M32 9C31 6.6 32 4.8 34 3.8M48 11.4C50 8 52.6 6.8 55 6.6", paint: ["#8a5a44", "#3e2418"], line: 0.6, lift: 0.1, finish: "satin" },
        { d: PETAL, copies: blossoms(BOUGH), paint: ["#ffe5ec", "#f08db0"], outline: ["#b0456a", 0.15], lift: 0.5, depth: 0.3, finish: "satin" },
        { d: BOUGH.map(([x, y, s]) => circle(x, y, 0.6 * s)).join(""), paint: "#c24d6c", lift: 0.9, depth: 0.15, finish: "satin" },
        { d: PETAL, copies: plumes([[6, 6, 30, 1], [24, 2, -20, 0.9], [42, 3, 70, 1.1], [60, 8, 10, 0.9], [51, 16, -50, 0.8], [11, 17, 120, 0.8]]), paint: ["#ffe5ec", "#f08db0"], lift: 0.3, depth: 0.2, finish: "satin" },
      ],
    },
    {
      // The omikuji fortunes from Sakura's shrine trip, knotted on a string below the bottom edge.
      at: ["bottom"],
      box: [44, 18],
      origin: [22, 1],
      scale: 1.4,
      rise: 1.5,
      layers: [
        { d: "M2 2Q22 8 42 2", paint: "#c24d6c", line: 0.35, lift: 0, finish: "satin" },
        { d: FORTUNES.map(([x, y, h]) => `M${n(x - 1.3)} ${n(y + 0.6)}h2.6v${h}h-2.6Z`).join(""), paint: ["#ffffff", "#e8e0d8"], outline: ["#8a6a5a", 0.15], lift: 0, depth: 0.2, finish: "satin" },
        { d: FORTUNES.map(([x, y]) => `M${x} ${n(y + 2.2)}v1.4M${n(x - 0.7)} ${n(y + 4.4)}h1.4M${x} ${n(y + 5.4)}v1.8`).join(""), paint: "#c4162a", line: 0.3, lift: 0.25, finish: "satin" },
        { d: FORTUNES.map(([x, y]) => `M${n(x - 1.6)} ${n(y - 0.5)}h3.2v1.2h-3.2Z`).join(""), paint: ["#ff8fb0", "#c24d6c"], lift: 0.2, depth: 0.3, finish: "satin" },
      ],
    },
  ],
  "kagune-coil": [
    {
      // Segmented crimson tendrils bursting from two corners and coiling outside the edges.
      at: ["tl", "br"],
      box: [40, 40],
      origin: [12, 12],
      scale: 1.15,
      rise: 2,
      layers: [
        { d: KAGUNE_FLESH, paint: ["#7a0016", "#180006"], outline: ["#31000a", 0.3], lift: 0, depth: 0.65, finish: "satin" },
        { d: KAGUNE, paint: ["#e12a42", "#810018"], line: 1.35, lift: 0.65, finish: "gloss" },
        { d: KAGUNE_RIBS, paint: "#ff8791", line: 0.35, lift: 1.15, finish: "glow" },
        { d: circle(15, 15, 2.6), paint: CRIMSON, lift: 0.9, depth: 0.5, finish: "gem" },
        { d: circle(15, 15, 1), paint: "#000000", lift: 1.4, depth: 0.1, finish: "gloss" },
      ],
    },
    {
      // Crystal shards splaying from the other two corners.
      at: ["tr", "bl"],
      box: [20, 20],
      origin: [8, 8],
      scale: 1.5,
      rise: 1.5,
      layers: [{ d: "M10 10L2 1L11.8 7ZM10 10L1 2L7 11.8ZM10 10L5 .5L11 8.6ZM10 10L.5 5L8.6 11Z", paint: CRIMSON, lift: 0, depth: 0.5, finish: "gem" }],
    },
    {
      // A red-on-black eye on the top edge.
      at: ["top"],
      box: [22, 14],
      origin: [11, 9],
      scale: 1.6,
      rise: 2,
      layers: [
        { d: "M2 7C6 1.5 16 1.5 20 7C16 12.5 6 12.5 2 7Z", paint: ["#1a1a1f", "#000000"], lift: 0, depth: 0.6, finish: "gloss" },
        { d: "M8.4 6L5 4.6M8.4 8L5.2 9.4M13.6 6L17 4.6M13.6 8L16.8 9.4", paint: "#b3001b", line: 0.2, lift: 0.65, finish: "glow" },
        { d: circle(11, 7, 2.8), paint: CRIMSON, lift: 0.7, depth: 0.3, finish: "gem" },
        { d: circle(11, 7, 1), paint: "#000000", lift: 1.1, depth: 0.1, finish: "gloss" },
      ],
    },
  ],
  "stained-prelude": [
    {
      // Gilded violin sound holes beside both side rails.
      at: ["tl", "tr"],
      box: [10, 34],
      origin: [9, -4],
      scale: 1.15,
      rise: 1,
      layers: [
        { d: "M6 2.4C7 2.6 7 4 6 4.4C4.8 4.9 4.4 7 5 10C5.6 13 5.4 16 4.2 18.4C3.6 19.6 2.6 19.6 2.6 18.6", copies: ["translate(-2 0) scale(1.15)"], paint: GOLD, line: 0.8, lift: 0.1, finish: "metal" },
        { d: `${circle(6, 3.3, 1)}${circle(3.2, 18.6, 1)}M3.6 10.8H6.4V11.6H3.6Z`, copies: ["translate(-2 0) scale(1.15)"], paint: GOLD, lift: 0.1, depth: 0.35, finish: "metal" },
      ],
    },
    {
      // A stained-glass rose window crowning the top edge: eight panes in a beaded gold ring.
      at: ["top"],
      box: [32, 24],
      origin: [16, 20],
      scale: 1.6,
      rise: 2,
      layers: [
        { d: circle(16, 11, 9.6), paint: ["#6a6a78", "#16161c"], lift: 0, depth: 0.4, finish: "metal" },
        { d: panes(16, 11, 3, 8.4, 8, 0), paint: ["#cfe9ff", "#4f8fe0"], lift: 0.3, depth: 0.2, finish: "gem" },
        { d: panes(16, 11, 3, 8.4, 8, 1), paint: ["#ffd1e3", "#e0609a"], lift: 0.3, depth: 0.2, finish: "gem" },
        { d: ring(16, 11, 9.1, 18, 0.45), paint: GOLD, lift: 0.4, depth: 0.2, finish: "metal" },
        { d: circle(16, 11, 2.4), paint: GOLD, lift: 0.3, depth: 0.5, finish: "metal" },
        { d: circle(16, 11, 1.1), paint: ["#ffe58a", "#e0a43a"], lift: 0.8, depth: 0.2, finish: "gem" },
      ],
    },
    {
      // A violin bow resting along the bottom edge.
      at: ["bottom"],
      box: [64, 8],
      origin: [32, 1],
      layers: [
        { d: "M5 5H59", paint: "#fffaf0", line: 0.45, lift: 0.1, finish: "satin" },
        { d: "M3 3.2H61", paint: ["#9a5a2a", "#4a2410"], line: 0.9, lift: 0.2, finish: "satin" },
        { d: "M3 2h4.4v4h-4.4Z", paint: ["#2a2a2a", "#000000"], lift: 0, depth: 0.6, finish: "gloss" },
        { d: circle(5.2, 4, 0.7), paint: GOLD, lift: 0.6, depth: 0.15, finish: "metal" },
        { d: "M58.6 2.2L62.4 3.2L58.6 5.4Z", paint: "#fffaf0", lift: 0.1, depth: 0.45, finish: "gloss" },
      ],
    },
  ],
  "fallen-halo": [
    {
      // A great folded wing at each top corner: primaries hang down the side, coverts and a crest over the arm.
      at: ["tl", "tr"],
      box: [36, 74],
      origin: [22, 14],
      rise: 2.5,
      layers: [
        { d: PLUME, copies: WING.primaries, paint: ["#ffffff", "#cdbfa6"], outline: ["#8a6a2a", 0.22], lift: 0, depth: 0.3, finish: "satin" },
        { d: PLUME_VEINS, copies: WING.primaries, paint: "#b89a5a", line: 0.12, lift: 0.3, finish: "metal" },
        { d: PLUME, copies: WING.secondaries, paint: ["#ffffff", "#e6dccb"], outline: ["#8a6a2a", 0.22], lift: 0.4, depth: 0.3, finish: "satin" },
        { d: PLUME_VEINS, copies: WING.secondaries, paint: "#b89a5a", line: 0.14, lift: 0.7, finish: "metal" },
        { d: PLUME, copies: WING.coverts, paint: ["#fffdf6", "#f1dfb0"], outline: ["#8a6a2a", 0.25], lift: 0.8, depth: 0.3, finish: "gloss" },
        { d: PLUME, copies: WING.crest, paint: ["#ffffff", "#f1dfb0"], outline: ["#8a6a2a", 0.3], lift: 0.6, depth: 0.3, finish: "gloss" },
        { d: "M23 15Q12-1 9 9", paint: GOLD, line: 1.3, outline: ["#5a3e10", 0.3], lift: 1.1, finish: "metal" },
        { d: "M9 9C7.4 11 5.4 10.6 5.6 8.8C5.8 7.4 7.6 7.4 7.8 8.6M16.4 4.6C15.6 2.4 17 1 18.4 1.8", paint: GOLD, line: 0.55, lift: 1.1, finish: "metal" },
        { d: circle(22, 14, 2.3), paint: GOLD, outline: ["#5a3e10", 0.3], lift: 1.2, depth: 0.5, finish: "metal" },
        { d: circle(22, 14, 1.3), paint: CRIMSON, lift: 1.7, depth: 0.25, finish: "gem" },
      ],
    },
    {
      // A broken golden halo radiating light above the top edge, its loose shards drifting away.
      at: ["top"],
      box: [64, 30],
      origin: [32, 24],
      rise: 3,
      layers: [
        {
          d: Array.from({ length: 28 }, (_, i) => {
            const a = ((i * 360) / 28 + 4) * (Math.PI / 180);
            const reach = i % 2 ? 0.72 : 1;
            return `M${n(32 + 17 * Math.cos(a))} ${n(12 + 5.4 * Math.sin(a))}L${n(32 + 30 * reach * Math.cos(a))} ${n(12 + 11 * reach * Math.sin(a))}`;
          }).join(""),
          paint: ["#fffbe6", "#ffd76a"],
          line: 0.35,
          opacity: 0.75,
          lift: 0,
          finish: "glow",
        },
        { d: `${arc(32, 12, 15, 4.6, 20, 200)}${arc(32, 12, 15, 4.6, 214, 326)}`, paint: GOLD, line: 1.8, outline: ["#5a3e10", 0.3], lift: 0.3, finish: "metal" },
        { d: arc(32, 12, 15, 4.6, 203, 211), copies: ["translate(-2.4 -3.2) rotate(-14 18 9)"], paint: GOLD, line: 1.8, lift: 0.5, finish: "metal" },
        { d: arc(32, 12, 15, 4.6, 331, 375), copies: ["translate(3.6 -4) rotate(16 46 8)"], paint: GOLD, line: 1.8, lift: 0.5, finish: "metal" },
        { d: `${arc(32, 11.4, 14.4, 4, 40, 180)}${arc(32, 11.4, 14.4, 4, 230, 310)}`, paint: "#fffdf0", line: 0.4, lift: 0.7, finish: "glow" },
        { d: `${star(14, 3, 2.2, 0.6, 4)}${star(52, 18, 1.8, 0.5, 4)}${star(48, 2.4, 1.4, 0.4, 4)}${star(10, 19, 1.3, 0.4, 4)}`, paint: "#fffbe6", lift: 0.6, depth: 0.2, finish: "glow" },
      ],
    },
    {
      // Feathers tumbling below the bottom edge around a gold pendant with a red stone.
      at: ["bottom"],
      box: [80, 28],
      origin: [40, 3],
      rise: 1.5,
      layers: [
        {
          d: PLUME,
          copies: plumes([[14, 10, -120, 0.9], [24, 18, 150, 0.7], [56, 16, 110, 0.8], [66, 8, -150, 0.6], [30, 24, -80, 0.5], [70, 20, 60, 0.45]]),
          paint: ["#ffffff", "#d9cfbd"],
          outline: ["#8a6a2a", 0.25],
          lift: 0,
          depth: 0.25,
          finish: "satin",
        },
        { d: "M40 2V9", paint: GOLD, line: 0.5, lift: 0.2, finish: "metal" },
        { d: "M40 9C43.4 12 43.6 16.6 40 20C36.4 16.6 36.6 12 40 9Z", paint: GOLD, outline: ["#5a3e10", 0.3], lift: 0.2, depth: 0.6, finish: "metal" },
        { d: "M40 11.6C41.8 13.4 41.8 16 40 17.8C38.2 16 38.2 13.4 40 11.6Z", paint: CRIMSON, lift: 0.8, depth: 0.3, finish: "gem" },
      ],
    },
    {
      // Gold filigree curling off the lower corners.
      at: ["bl", "br"],
      box: [18, 18],
      origin: [12, 12],
      layers: [
        { d: "M12 12C7 12 3 10 3 6.4C3 4 5.4 3 6.8 4.6C7.8 5.8 6.6 7.4 5.4 6.6M12 12C12 7 10 3 6.4 3", paint: GOLD, line: 0.7, outline: ["#5a3e10", 0.2], lift: 0.1, finish: "metal" },
        { d: circle(12, 12, 1.4), paint: CRIMSON, lift: 0.4, depth: 0.3, finish: "gem" },
      ],
    },
  ],
  afterimage: [
    {
      // Speed streaks leaving colour-split afterimages over two corners.
      at: ["tl", "br"],
      box: [40, 20],
      origin: [10, 10],
      scale: 1.5,
      rise: 1.5,
      layers: (["#7dff6a", "#22d3ee", "#ff3fd2"] as const).map((colour, i) => ({
        d: "M12 3.5L30 3.5L32 5.5L14 5.5ZM16 7.2L26 7.2L27.4 8.6L17.4 8.6Z",
        copies: [`translate(${-2.4 * i} ${2 * i})`],
        paint: colour,
        lift: 0.6 - i * 0.3,
        depth: 0.2,
        finish: "glow" as const,
      })),
    },
    {
      // Hex chips wired into the rails on the other corners.
      at: ["tr", "bl"],
      box: [18, 18],
      origin: [5, 5],
      scale: 1.35,
      rise: 1,
      layers: [
        { d: "M10.9 7.5H16M7.5 10.9V16", paint: "#7dff6a", line: 0.35, lift: 0, finish: "glow" },
        { d: "M10.9 7.5L9.2 10.44L5.8 10.44L4.1 7.5L5.8 4.56L9.2 4.56Z", paint: ["#2a3446", "#05070c"], lift: 0, depth: 0.6, finish: "metal" },
        { d: "M9.8 7.5L8.65 9.5H6.35L5.2 7.5L6.35 5.5H8.65Z", paint: "#7dff6a", line: 0.3, lift: 0.65, finish: "glow" },
        { d: circle(7.5, 7.5, 1), paint: ["#e0ffd8", "#3fd92a"], lift: 0.7, depth: 0.3, finish: "gem" },
      ],
    },
    {
      // A chrome chevron visor over the top edge, trailing colour-split afterimages.
      at: ["top"],
      box: [40, 16],
      origin: [20, 13],
      scale: 1.2,
      rise: 2,
      layers: [
        ...(["#ff3fd2", "#22d3ee", "#7dff6a"] as const).map((colour, i) => ({
          d: "M3 2.6L20 11.4L37 2.6M11 1.4L20 6L29 1.4",
          copies: [["translate(2.4 -2.6)", "translate(-1.2 -1.3)", ""][i]],
          paint: colour,
          line: i === 2 ? 1.1 : 0.8,
          lift: i * 0.3,
          finish: "glow" as const,
        })),
        { d: "M20 8.6L22.6 11.2L20 13.8L17.4 11.2Z", paint: ["#ffffff", "#6a7586"], lift: 0.7, depth: 0.4, finish: "metal" },
      ],
    },
  ],
  "zipper-rush": [
    {
      // Sticky Fingers has unzipped the top rail from the top-right corner…
      at: ["tr"],
      box: [46, 22],
      origin: [12, 12],
      scale: 1.2,
      rise: 2,
      layers: zipTear(false),
    },
    {
      // …and the left rail from the bottom-left corner.
      at: ["bl"],
      box: [22, 46],
      origin: [12, 12],
      scale: 1.2,
      rise: 2,
      layers: zipTear(true),
    },
    {
      // Joestar star studs with a pink stone on the other corners.
      at: ["tl", "br"],
      box: [16, 16],
      origin: [5, 5],
      scale: 1.9,
      rise: 1,
      layers: [
        { d: star(7.5, 7.5, 3.6, 1.5), paint: GOLD, outline: ["#5a3e10", 0.25], lift: 0, depth: 0.7, finish: "metal" },
        { d: circle(7.5, 7.5, 1), paint: ["#ffc2ec", "#e0399f"], lift: 0.8, depth: 0.3, finish: "gem" },
      ],
    },
    {
      // A menacing violet aura flaring up from the top edge.
      at: ["top"],
      box: [30, 16],
      origin: [15, 13.4],
      scale: 2,
      rise: 1.5,
      layers: [
        {
          d: "M10 13C7 10 9.4 6.4 8 1.6C11.4 5 12.4 8.6 11.6 13ZM15 13.4C12.4 10 14.2 5.6 13.4 0C16.8 4.4 18 9 16.4 13.4Z",
          copies: ["", "translate(30 0) scale(-1 1)", "translate(5 2) scale(.85)", "translate(25 2) scale(-.85 .85)", "translate(2 4.4) scale(.7)", "translate(28 4.4) scale(-.7 .7)"],
          paint: ["#f0c4ff", "#8a2cdf"],
          outline: ["#3a0a6e", 0.25],
          lift: 0,
          depth: 0.3,
          finish: "glow",
        },
        { d: "M10.4 12.6C9 10.6 10.2 8.4 9.6 5.8C11 7.8 11.4 10 11 12.6ZM15 12.8C14 10.6 15 7.6 14.6 4.6C16 7 16.6 10 15.8 12.8Z", copies: ["", "translate(30 0) scale(-1 1)"], paint: "#fbefff", lift: 0.4, depth: 0.1, finish: "glow" },
      ],
    },
  ],
  "bridal-bouquet": [
    {
      // Pearl strands draped across each corner around a diamond.
      at: ALL,
      box: [16, 16],
      origin: [9, 9],
      scale: 1.45,
      rise: 1,
      layers: [
        { d: ring(9, 9, 6.5, 7, 1.1, 180, 270), paint: ["#ffffff", "#e8dccb"], lift: 0.2, depth: 0.45, finish: "gloss" },
        { d: ring(9, 9, 3.9, 5, 0.75, 180, 270), paint: ["#ffe9f0", "#e8c6d2"], lift: 0.2, depth: 0.35, finish: "gloss" },
        { d: circle(9, 9, 1.4), paint: ["#ffffff", "#bfe6ff"], lift: 0.3, depth: 0.4, finish: "gem" },
      ],
    },
    {
      // Two linked wedding rings, one set with a stone.
      at: ["top"],
      box: [26, 16],
      origin: [13, 12],
      scale: 1.9,
      rise: 2,
      layers: [
        { d: circle(11, 7.5, 3.6), paint: GOLD, line: 0.7, lift: 0.2, finish: "metal" },
        { d: circle(15.4, 7.5, 3.6), paint: ["#ffffff", "#c9ccd6"], line: 0.7, lift: 0.5, finish: "metal" },
        { d: "M15.4 3.4L16.6 2.2L15.4.8L14.2 2.2Z", paint: ["#ffffff", "#bfe6ff"], lift: 0.5, depth: 0.4, finish: "gem" },
      ],
    },
    {
      // A five-flower bouquet tied with ribbon at the bottom edge.
      at: ["bottom"],
      box: [30, 22],
      origin: [15, 4],
      scale: 1.6,
      rise: 2,
      layers: [
        { d: "M14 8L11 19L13 18L15 9ZM16 8L19 19L17 18L15 9Z", paint: ["#ffffff", "#e8dccb"], lift: 0, depth: 0.3, finish: "satin" },
        { d: "M15 7C10 4 6 5 4 8C8 8 11 8 15 7ZM15 7C20 4 24 5 26 8C22 8 19 8 15 7Z", paint: ["#8cc47a", "#3f7a3a"], lift: 0.1, depth: 0.3, finish: "satin" },
        ...([[9, 5, "#f0a92c"], [12, 3, "#e8638f"], [15, 2.4, "#ffffff"], [18, 3, "#2f948d"], [21, 5, "#a24bc0"]] as const).map(([x, y, colour]) => ({
          d: circle(x, y, 2.2),
          paint: colour,
          lift: 0.4,
          depth: 0.5,
          finish: "gloss" as const,
        })),
        { d: [circle(9, 5, 0.5), circle(12, 3, 0.5), circle(15, 2.4, 0.5), circle(18, 3, 0.5), circle(21, 5, 0.5)].join(""), paint: "#fff4d6", lift: 1, depth: 0.15, finish: "satin" },
      ],
    },
  ],
  "lavender-north": [
    {
      // Furano lavender bundles fanning out of the top corners, tied with a pink bow.
      at: ["tl", "tr"],
      box: [30, 30],
      origin: [22, 22],
      scale: 1.2,
      rise: 2,
      layers: [
        { d: [200, 215, 230, 245, 260].map((a) => lavender(23.5, 23.5, a, 19).stem).join(""), paint: "#5f8f4e", line: 0.45, outline: ["#2a4a22", 0.15], lift: 0, finish: "satin" },
        { d: [200, 215, 230, 245, 260].map((a) => lavender(23.5, 23.5, a, 19).buds).join(""), paint: ["#e2d4ff", "#7a5ad6"], outline: ["#3a2a7a", 0.15], lift: 0.2, depth: 0.35, finish: "gloss" },
        { d: `${lens(23.5, 23.5, 26.4, 29.6, 1.6)}${lens(23.5, 23.5, 29.6, 26.4, 1.6)}`, paint: ["#ffc2de", "#ff2e8a"], outline: ["#7a0a3e", 0.2], lift: 0.5, depth: 0.2, finish: "satin" },
        { d: `${lens(23.5, 23.5, 28.6, 18.4, 3.4)}${lens(23.5, 23.5, 18.4, 28.6, 3.4)}`, paint: ["#ffc2de", "#ff2e8a"], outline: ["#7a0a3e", 0.25], lift: 0.6, depth: 0.4, finish: "satin" },
        { d: circle(23.5, 23.5, 1.1), paint: "#ff2e8a", lift: 1, depth: 0.3, finish: "gloss" },
      ],
    },
    {
      // Gal nail-art charms: a pink heart gem and sparkles (turned so the flipped corners show them upright).
      at: ["bl", "br"],
      box: [16, 16],
      origin: [5, 5],
      scale: 1.5,
      rise: 1.5,
      layers: [
        { d: BIG_HEART, copies: ["translate(7.5 7.5) rotate(180) scale(.42) translate(-10 -10)"], paint: ["#ffc2de", "#ff2e8a"], outline: ["#7a0a3e", 0.2], lift: 0, depth: 0.6, finish: "gem" },
        { d: `${star(13, 2.5, 1.8, 0.4, 4)}${star(2.5, 13, 1.3, 0.35, 4)}${star(1.6, 2, 1, 0.3, 4)}`, paint: "#ffffff", lift: 0.4, depth: 0.2, finish: "glow" },
      ],
    },
    {
      // A snow globe of lavender hills, watched by a sitting Ezo red fox.
      at: ["top"],
      box: [40, 16],
      origin: [18, 13],
      scale: 2.1,
      rise: 2,
      layers: [
        { d: circle(15, 7.4, 5), paint: ["#ffffff", "#bcdcff"], outline: ["#5a6a8a", 0.2], lift: 0, depth: 0.5, finish: "gem" },
        { d: "M11 10Q15 7.4 19 10Z", paint: ["#c9b8ff", "#6a4fc4"], lift: 0.6, depth: 0.15, finish: "satin" },
        { d: `${circle(13, 5, 0.35)}${circle(16.6, 4.4, 0.3)}${circle(14.8, 6.8, 0.3)}${circle(17.4, 7, 0.35)}`, paint: "#ffffff", lift: 0.65, depth: 0.1, finish: "satin" },
        { d: "M10.4 11.4h9.2l1 2h-11.2Z", paint: ["#c98a7a", "#7a4a3a"], lift: 0, depth: 0.5, finish: "satin" },
        { d: FOX, copies: ["translate(22 1)"], paint: ["#ff9a4a", "#b8481a"], outline: ["#5a2008", 0.2], lift: 0, depth: 0.6, finish: "satin" },
        { d: `${circle(37.6, 10.4, 0.9)}${circle(28.8, 9.6, 1.1)}`, paint: "#ffffff", lift: 0.3, depth: 0.35, finish: "satin" },
        { d: `${circle(27.4, 6.4, 0.32)}${circle(30, 6.4, 0.32)}${circle(28.8, 7.6, 0.3)}`, paint: "#1b1b1b", lift: 0.65, depth: 0.1, finish: "gloss" },
      ],
    },
    {
      // A lavender field in the snow below the bottom edge.
      at: ["bottom"],
      box: [72, 14],
      origin: [36, 1],
      scale: 1.4,
      rise: 1,
      layers: [
        { d: Array.from({ length: 18 }, (_, i) => lavender(5 + i * 3.6, 12, 270 + ((i * 7) % 11) - 5, 6 + 2.5 * Math.abs(Math.sin(i * 1.3))).stem).join(""), paint: "#5f8f4e", line: 0.35, lift: 0, finish: "satin" },
        { d: Array.from({ length: 18 }, (_, i) => lavender(5 + i * 3.6, 12, 270 + ((i * 7) % 11) - 5, 6 + 2.5 * Math.abs(Math.sin(i * 1.3))).buds).join(""), paint: ["#e2d4ff", "#7a5ad6"], outline: ["#3a2a7a", 0.12], lift: 0.2, depth: 0.3, finish: "gloss" },
        { d: "M2 12.2Q36 10.4 70 12.2V13.6H2Z", paint: ["#ffffff", "#d6e4f5"], outline: ["#8aa0c0", 0.15], lift: 0.1, depth: 0.3, finish: "satin" },
      ],
    },
  ],
};
