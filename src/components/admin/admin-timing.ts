/**
 * The console's activation timeline in ms, shared by the 3D scene, the page (when the surface
 * goes live) and the sound. "late" is for a scene that arrives after the content is already shown.
 */
export type BootKind = "full" | "short" | "late" | "none";

type Window = readonly [number, number];
export type BootTimes = {
  /** Outer and inner contours trace themselves. */
  trace: Window;
  inner: Window;
  /** Background system planes draw in, staggered. */
  planes: Window;
  /** Frame pieces fly in and lock. */
  pieces: Window;
  /** Camera and console move into position. */
  arrive: Window;
  /** The glass fills and the scan line activates the surface. */
  glass: Window;
  scan: Window;
  /** When the page content starts to appear. */
  live: number;
  total: number;
};

const NEVER: Window = [-2, -1];

export const BOOT: Record<Exclude<BootKind, "none">, BootTimes> = {
  full: { trace: [0, 950], inner: [250, 1150], planes: [300, 1700], pieces: [550, 1550], arrive: [0, 2000], glass: [1050, 1600], scan: [1450, 2150], live: 1500, total: 2600 },
  short: { trace: [0, 480], inner: [100, 560], planes: [100, 800], pieces: [180, 760], arrive: [0, 900], glass: [300, 650], scan: [500, 950], live: 520, total: 1100 },
  late: { trace: [0, 600], inner: [100, 700], planes: [0, 900], pieces: [100, 800], arrive: NEVER, glass: NEVER, scan: NEVER, live: -1, total: 900 },
};

/** Where the corner brackets land (as fractions of the pieces window), for the scene and the sound. */
export const PIECE_LANDINGS = [0.52, 0.61, 0.7, 0.79];

/** Session key: the full activation plays once per tab session, later visits get the short one. */
export const BOOT_KEY = "archive:admin:activated";
