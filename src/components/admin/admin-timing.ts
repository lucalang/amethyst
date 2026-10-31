/**
 * The System window's reveal language in ms, shared by the 3D scene, the page (text decoding,
 * controls) and the sound so every layer moves as one. A window opens from a luminous line: a
 * narrow strip forms between the two bars, expands vertically while a brief horizontal distortion
 * runs through it, the frame flares and settles, the text decodes and the controls arrive last.
 * Closing is the same in reverse. "late" lights the frame around content that is already shown.
 */
export type OpenKind = "full" | "short" | "unfold" | "late";
export type RevealKind = OpenKind | "fold" | "close" | "none";

type Window = readonly [number, number];
export type OpenTimes = {
  /** A line of light grows out from the centre with a flare. */
  line: Window;
  /** The line parts into a narrow strip between the two bars. */
  strip: Window;
  /** The strip expands vertically to the full window. */
  expand: Window;
  /** Horizontal slices tear and smear sideways. */
  distort: Window;
  /** The frame flares and settles to its resting glow. */
  frame: Window;
  /** The text decodes from scrambled glyphs, left to right. */
  decode: Window;
  /** When the controls fade in. */
  controls: number;
  total: number;
};

const NEVER: Window = [-2, -1];

export const OPEN: Record<OpenKind, OpenTimes> = {
  full: { line: [0, 300], strip: [220, 420], expand: [400, 760], distort: [420, 700], frame: [400, 1150], decode: [560, 1300], controls: 980, total: 1350 },
  short: { line: [0, 140], strip: [100, 220], expand: [200, 470], distort: [220, 420], frame: [200, 760], decode: [300, 820], controls: 560, total: 860 },
  unfold: { line: NEVER, strip: NEVER, expand: [0, 300], distort: [20, 220], frame: [0, 560], decode: [90, 600], controls: 300, total: 620 },
  late: { line: NEVER, strip: NEVER, expand: NEVER, distort: NEVER, frame: [0, 760], decode: NEVER, controls: -1, total: 800 },
};

/** A step change: the window compresses into a strip, then unfolds on the new state. */
export const FOLD = 230;
/** Leaving a page: compression into a strip, which then shrinks to the centre and disappears. */
export const CLOSE = 380;
/** Share of CLOSE spent compressing (the rest shrinks the strip sideways). */
export const CLOSE_SPLIT = 0.55;

/**
 * After the server confirms a publish (ms from its answer): the window folds and reopens on the
 * result, then the frame activates with an energy accent and the real code decodes.
 */
export const PUBLISH = { accent: FOLD + 300, code: FOLD + 520 };

/** Session key: the full opening plays once per tab session, later visits get the short one. */
export const BOOT_KEY = "archive:admin:activated";
