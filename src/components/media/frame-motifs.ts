import type { FrameLookId } from "@/lib/frames";

/**
 * Illustrated frame ornaments as SVG path data, drawn by the 2D frame and extruded from the same paths
 * by the 3D card, so both always match. One unit is a fifth of the band width: on a corner piece the
 * card's outer edges run along 5 and the artwork's edges along 10. New illustrated frames only need
 * an entry here plus their band (CSS ring and 3D paint).
 */
export type MotifFinish = "metal" | "gloss" | "satin" | "gem" | "glow";
export type MotifLayer = {
  d: string;
  /** Fill colour, or a two-stop gradient from the piece's top-left to bottom-right. */
  paint: string | readonly [string, string];
  /** Draws the path as a round line this many units wide instead of filling it. */
  line?: number;
  /** Draws the path once per SVG transform instead of once in place. */
  copies?: readonly string[];
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
  layers: readonly MotifLayer[];
};

const ALL = ["tl", "tr", "bl", "br"] as const;
const n = (value: number) => +value.toFixed(2);
const circle = (cx: number, cy: number, r: number) => `M${n(cx - r)} ${cy}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0Z`;
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

export const FRAME_MOTIFS: Partial<Record<FrameLookId, readonly MotifPiece[]>> = {
  "koi-rail": [
    {
      // A koi swimming along the top rail (and, turned around, the bottom rail).
      at: ["tl", "br"],
      box: [40, 16],
      origin: [5, 5],
      layers: [
        { d: "M21 5.6L19 2.2L25 5.2ZM21 9.4L19 12.8L25 9.8Z", paint: "#f7d9c4", lift: 0.2, depth: 0.4, finish: "satin" },
        { d: "M15 7.5C13 5.8 11 4.2 8.6 3.6C9.8 5.6 10 6.6 9.6 7.5C10 8.4 9.8 9.4 8.6 11.4C11 10.8 13 9.2 15 7.5Z", paint: ["#ff9a5c", "#e2501c"], lift: 0.2, depth: 0.5, finish: "satin" },
        { d: "M14 7.5C17 4.6 26 4.4 33.5 7.5C26 10.6 17 10.4 14 7.5Z", paint: "#fff7ee", lift: 0.3, depth: 1.2, finish: "gloss" },
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
      layers: [
        { d: `${circle(7.5, 7.5, 3.6)}${circle(7.5, 7.5, 5.2)}`, paint: "#ffffff", line: 0.45, lift: 0.1, finish: "gloss" },
        { d: "M7.5 7.5L10.1 7.5A2.6 2.6 0 1 1 9.34 5.66Z", paint: ["#8cc47a", "#4a8a43"], lift: 0.2, depth: 0.4, finish: "satin" },
      ],
    },
  ],
  "pressed-diary": [
    {
      // Leather book corners with a brass rivet.
      at: ALL,
      box: [20, 20],
      origin: [5, 5],
      layers: [
        { d: "M3.6 3.6H18.5L3.6 18.5Z", paint: ["#c23a52", "#7d1427"], lift: 0, depth: 0.6, finish: "satin" },
        { d: circle(7, 7, 0.9), paint: ["#fff1c2", "#b8862e"], lift: 0.8, depth: 0.3, finish: "metal" },
      ],
    },
    {
      // A pressed cherry blossom and a loose petal on the rail.
      at: ["tr", "bl"],
      box: [40, 16],
      origin: [5, 5],
      layers: [
        { d: PETAL, copies: [...rotations(5, 0, 0).map((turn) => `translate(27 7.5) ${turn} scale(1.1)`), "translate(35 8) rotate(115) scale(.8)"], paint: ["#ffd3de", "#e88aa6"], lift: 0.7, depth: 0.25, finish: "satin" },
        { d: circle(27, 7.5, 0.7), paint: "#c24d6c", lift: 1, depth: 0.15, finish: "satin" },
      ],
    },
    {
      // A ribbon bookmark slipping out of the top edge.
      at: ["top"],
      box: [10, 18],
      origin: [5, 12],
      layers: [{ d: "M3 1L5 3.4L7 1V16.5H3Z", paint: ["#8bbfe8", "#2f6fa8"], lift: 0.1, depth: 0.35, finish: "satin" }],
    },
  ],
  "sonata-keys": [
    {
      // A keyboard along the bottom rail.
      at: ["bottom"],
      box: [64, 10],
      origin: [32, 10],
      layers: [
        { d: "M0 5.2H64V9.8H0Z", paint: "#fbf8f0", lift: 0, depth: 0.3, finish: "gloss" },
        { d: Array.from({ length: 15 }, (_, i) => `M${4 + i * 4} 5.4V9.6`).join(""), paint: "#2a2a2e", line: 0.25, lift: 0.45, finish: "gloss" },
        {
          d: Array.from({ length: 15 }, (_, i) => i + 1)
            .filter((k) => [1, 2, 4, 5, 6].includes(k % 7))
            .map((k) => `M${n(k * 4 - 1.2)} 5.2h2.4v2.9h-2.4Z`)
            .join(""),
          paint: "#121216",
          lift: 0.3,
          depth: 0.5,
          finish: "gloss",
        },
      ],
    },
    {
      // Violin scrolls curling at the corners, with a gold thread along each rail.
      at: ALL,
      box: [24, 24],
      origin: [5, 5],
      layers: [
        {
          d: "M14 7.5C14 3.9 11.1 1.5 7.5 1.5C4.2 1.5 1.5 4.2 1.5 7.5C1.5 10.3 3.7 12.3 6.3 12.3C8.7 12.3 10.4 10.4 10.4 8.2C10.4 6.3 8.9 4.9 7.2 4.9C5.7 4.9 4.6 6 4.6 7.4C4.6 8.6 5.5 9.4 6.6 9.4",
          copies: ["translate(7.5 7.5) scale(.72) translate(-7.5 -7.5)"],
          paint: GOLD,
          line: 1,
          lift: 0.2,
          finish: "metal",
        },
        { d: "M12.5 7.5H22M7.5 12.5V22", paint: GOLD, line: 0.45, lift: 0.1, finish: "metal" },
      ],
    },
    {
      // Two beamed notes rising from the top edge.
      at: ["top"],
      box: [24, 16],
      origin: [12, 11],
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
      layers: [{ d: PETAL, copies: ["translate(25 7.5) rotate(70) scale(1.1)", "translate(31.5 6.6) rotate(-30)"], paint: ["#ffd6e4", "#f08db0"], lift: 0.2, depth: 0.25, finish: "satin" }],
    },
  ],
  "demon-wing": [
    {
      // Bat wings flaring out from the top corners, their finger bones glowing pink.
      at: ["tl", "tr"],
      box: [30, 30],
      origin: [22, 22],
      layers: [
        { d: "M25 25L17 2Q13.5 9.5 6 5Q9.5 12 3 17Q13 19 25 25Z", paint: ["#4a1050", "#120614"], lift: 0, depth: 0.5, finish: "satin" },
        { d: "M25 25L17 2M25 25L6 5M25 25L3 17", paint: "#ff2e88", line: 0.8, lift: 0.7, finish: "glow" },
      ],
    },
    {
      // Horns rising from the top edge.
      at: ["top"],
      box: [24, 14],
      origin: [12, 11],
      layers: [
        { d: "M9.5 12C8.5 8 6.5 4.8 3 2.6C6.2 6 7 9 7.2 12.6ZM14.5 12C15.5 8 17.5 4.8 21 2.6C17.8 6 17 9 16.8 12.6Z", paint: ["#ffe3f0", "#ff2e88"], lift: 0, depth: 0.8, finish: "gloss" },
      ],
    },
    {
      // Blood splatter on the lower corners.
      at: ["bl", "br"],
      box: [18, 18],
      origin: [5, 5],
      layers: [{ d: `${circle(7.5, 7.5, 2.2)}${circle(12.8, 6.4, 0.9)}${circle(10.5, 3.2, 0.6)}${circle(15.5, 8.3, 0.5)}${circle(5.2, 12.6, 0.7)}`, paint: ["#ff3355", "#9b0a24"], lift: 0, depth: 0.35, finish: "gloss" }],
    },
    {
      // One tear falling from the bottom edge.
      at: ["bottom"],
      box: [8, 14],
      origin: [4, 2],
      layers: [{ d: "M4 4.5C5.8 7.6 6.6 9 6.6 10.4A2.6 2.6 0 1 1 1.4 10.4C1.4 9 2.2 7.6 4 4.5Z", paint: ["#c8fff6", "#19e3c8"], lift: 0, depth: 0.9, finish: "gem" }],
    },
  ],
  moonshot: [
    {
      // Hex bolts holding the chrome plates together.
      at: ALL,
      box: [16, 16],
      origin: [5, 5],
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
      layers: [
        { d: "M11.27 1.01A5.5 5.5 0 1 0 15.55 9.58A4.8 4.8 0 0 1 11.27 1.01Z", paint: ["#fffbe0", "#ffe27a"], lift: 0, depth: 0.8, finish: "glow" },
        { d: "M1 14.5H5.5L7.5 12.4M21 14.5H16.5L14.5 12.4", paint: "#22d3ee", line: 0.4, lift: 0.1, finish: "glow" },
      ],
    },
  ],
  "golden-arrow": [
    {
      // Art Deco arrowheads pointing out of each corner, a teal stone set in each, and stepped bars along the rails.
      at: ALL,
      box: [30, 30],
      origin: [5, 5],
      layers: [
        { d: "M2.5 2.5L12.5 5L9.3 6.6L13.4 10.7L10.7 13.4L6.6 9.3L5 12.5ZM16 6.4h12v2.2h-12ZM6.4 16h2.2v12h-2.2Z", paint: GOLD, lift: 0, depth: 0.7, finish: "metal" },
        { d: "M6.3 4.9L7.7 6.3L6.3 7.7L4.9 6.3Z", paint: ["#9ff3ea", "#1f9e93"], lift: 1, depth: 0.3, finish: "gem" },
      ],
    },
    {
      // A golden ladybug brooch on the top edge.
      at: ["top"],
      box: [16, 15],
      origin: [8, 9],
      layers: [
        { d: "M8 3.9C10.6 3.9 12 6.2 12 8.6C12 11.4 10.2 13.1 8 13.1C5.8 13.1 4 11.4 4 8.6C4 6.2 5.4 3.9 8 3.9Z", paint: GOLD, lift: 0, depth: 1, finish: "metal" },
        { d: "M6.2 4.6C6.4 2.6 9.6 2.6 9.8 4.6Z", paint: ["#e8c46a", "#8a5c12"], lift: 0.9, depth: 0.4, finish: "metal" },
        { d: "M8 4.6V13M7 3L5.8 1.2M9 3L10.2 1.2", paint: "#7a5410", line: 0.35, lift: 1.5, finish: "metal" },
        { d: `${circle(6.3, 7.6, 0.8)}${circle(9.7, 7.6, 0.8)}${circle(6.6, 10.6, 0.65)}${circle(9.4, 10.6, 0.65)}`, paint: "#7a5410", lift: 1.4, depth: 0.2, finish: "gloss" },
      ],
    },
    {
      // Rumbling sound-effect glyphs along the bottom rail.
      at: ["bottom"],
      box: [36, 12],
      origin: [18, 8],
      layers: [
        {
          d: "M0 0H5.2V5.6H0M6.2-1.6L6.9 0M7.6-2L8.3-.4",
          copies: ["translate(4 4) rotate(-8)", "translate(14.5 3) scale(1.15)", "translate(26 4.2) rotate(7) scale(.9)"],
          paint: "#2a0a2e",
          line: 2,
          lift: 0,
          finish: "satin",
        },
        {
          d: "M0 0H5.2V5.6H0M6.2-1.6L6.9 0M7.6-2L8.3-.4",
          copies: ["translate(4 4) rotate(-8)", "translate(14.5 3) scale(1.15)", "translate(26 4.2) rotate(7) scale(.9)"],
          paint: ["#ff9be0", "#e0399f"],
          line: 1.1,
          lift: 0.5,
          finish: "gloss",
        },
      ],
    },
  ],
  "tsuba-guard": [
    {
      // Four-lobed iron sword guards with a gold collar.
      at: ALL,
      box: [16, 16],
      origin: [5, 5],
      layers: [
        { d: `${circle(5.4, 5.4, 2.7)}${circle(9.6, 5.4, 2.7)}${circle(5.4, 9.6, 2.7)}${circle(9.6, 9.6, 2.7)}`, paint: ["#6a6a72", "#1d1d22"], lift: 0, depth: 0.7, finish: "metal" },
        { d: circle(7.5, 7.5, 1.7), paint: ["#ffd9a0", "#c9821f"], line: 0.45, lift: 1, finish: "metal" },
        { d: "M7 6.2h1v2.6h-1Z", paint: "#0d0d0f", lift: 1, depth: 0.15, finish: "satin" },
      ],
    },
    {
      // A black butterfly on the top edge, rimmed in ember orange.
      at: ["top"],
      box: [24, 16],
      origin: [12, 8],
      layers: [
        { d: BUTTERFLY, paint: ["#26262b", "#0a0a0c"], lift: 0.3, depth: 0.4, finish: "satin" },
        { d: BUTTERFLY, paint: "#ff7a1a", line: 0.35, lift: 0.75, finish: "glow" },
        { d: "M12 5.4V11.6", paint: "#0d0d0f", line: 0.9, lift: 0.6, finish: "satin" },
        { d: "M11.7 5.6L10.4 3.2M12.3 5.6L13.6 3.2", paint: "#ff7a1a", line: 0.3, lift: 0.6, finish: "glow" },
      ],
    },
  ],
  "five-ribbons": [
    {
      at: ["tl"],
      box: [16, 16],
      origin: [5, 5],
      layers: [{ d: star(7.5, 7.6, 4.6, 1.9), paint: ["#ffe58a", "#f0a92c"], lift: 0, depth: 0.7, finish: "gloss" }],
    },
    {
      at: ["tr"],
      box: [16, 16],
      origin: [5, 5],
      layers: [{ d: BUTTERFLY, copies: ["translate(7.5 7.5) scale(.45) translate(-12 -8)"], paint: ["#ffc2d9", "#e8638f"], lift: 0, depth: 0.6, finish: "gloss" }],
    },
    {
      at: ["bl"],
      box: [16, 16],
      origin: [5, 5],
      layers: [
        { d: "M7.5 7.5C5.5 5 2.6 5 2.6 7.5C2.6 10 5.5 10 7.5 7.5ZM7.5 7.5C9.5 5 12.4 5 12.4 7.5C12.4 10 9.5 10 7.5 7.5Z", paint: ["#b9f0c6", "#3f9e59"], lift: 0, depth: 0.6, finish: "gloss" },
        { d: circle(7.5, 7.5, 1), paint: "#3f9e59", lift: 0.5, depth: 0.4, finish: "gloss" },
      ],
    },
    {
      at: ["br"],
      box: [16, 16],
      origin: [5, 5],
      layers: [{ d: `${circle(5.8, 5.8, 1.9)}${circle(9.2, 5.8, 1.9)}${circle(5.8, 9.2, 1.9)}${circle(9.2, 9.2, 1.9)}`, paint: ["#a7ece6", "#2f948d"], lift: 0, depth: 0.6, finish: "gloss" }],
    },
    {
      // A wedding bell with a heart on the top edge.
      at: ["top"],
      box: [18, 16],
      origin: [9, 10],
      layers: [
        { d: "M9 2.2C11.8 2.2 13 4.6 13 7.2V10.2L14.4 12H3.6L5 10.2V7.2C5 4.6 6.2 2.2 9 2.2Z", paint: ["#fff6e0", "#d9a440"], lift: 0, depth: 1, finish: "metal" },
        { d: circle(9, 12.8, 0.9), paint: ["#fff6e0", "#d9a440"], lift: 0.2, depth: 0.5, finish: "metal" },
        { d: "M9 9.4C7.2 8.2 6.6 7.2 6.6 6.4C6.6 5.4 7.8 4.9 9 5.9C10.2 4.9 11.4 5.4 11.4 6.4C11.4 7.2 10.8 8.2 9 9.4Z", paint: ["#e7b3f2", "#a24bc0"], lift: 1.6, depth: 0.3, finish: "gloss" },
      ],
    },
    {
      // Five ribbon tails, one in each colour, hanging from the bottom edge.
      at: ["bottom"],
      box: [20, 11],
      origin: [10, 6],
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
      origin: [5, 5],
      layers: [
        { d: "M7.5 7.5V2.9M7.5 4.6L6.3 3.5M7.5 4.6L8.7 3.5", copies: rotations(6, 7.5, 7.5), paint: ["#ffffff", "#9fd3f5"], line: 0.7, lift: 0.2, finish: "metal" },
        { d: circle(7.5, 7.5, 1.1), paint: ["#ffc2de", "#ff2e8a"], lift: 0.4, depth: 0.5, finish: "gem" },
        { d: [15, 19, 23].flatMap((at) => [circle(at, 7.5, 0.75), circle(7.5, at, 0.75)]).join(""), paint: ["#ffffff", "#cfe8ff"], lift: 0, depth: 0.5, finish: "gem" },
      ],
    },
    {
      // A heart charm between two lavender sprigs on the top edge.
      at: ["top"],
      box: [30, 14],
      origin: [15, 8],
      layers: [
        { d: "M9.5 9.5C7 8 4.5 7.6 1.5 8M20.5 9.5C23 8 25.5 7.6 28.5 8", paint: "#6c9a5b", line: 0.45, lift: 0.1, finish: "satin" },
        {
          d: [7.6, 5.6, 3.6].flatMap((x) => [circle(x, 8.2 - (7.6 - x) * 0.12, 0.75), circle(30 - x, 8.2 - (7.6 - x) * 0.12, 0.75), circle(x - 0.9, 7.3 - (7.6 - x) * 0.12, 0.6), circle(30.9 - x, 7.3 - (7.6 - x) * 0.12, 0.6)]).join(""),
          paint: ["#d3c2ff", "#8a6be0"],
          lift: 0.2,
          depth: 0.4,
          finish: "gloss",
        },
        { d: "M15 12.2C11.6 10 10.4 8.2 10.4 6.6C10.4 4.7 12.7 3.7 15 5.6C17.3 3.7 19.6 4.7 19.6 6.6C19.6 8.2 18.4 10 15 12.2Z", paint: ["#ffc2de", "#ff2e8a"], lift: 0, depth: 1.1, finish: "gem" },
      ],
    },
  ],
};
