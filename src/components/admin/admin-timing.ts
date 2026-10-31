/**
 * The System window's summoning timeline in ms, shared by the 3D scene, the page (when the surface
 * goes live) and the sound. "late" is for a scene that arrives after the content is already shown.
 */
export type BootKind = "full" | "short" | "late" | "none";

type Window = readonly [number, number];
export type BootTimes = {
  /** Dust gathers and a seam of light grows across the centre. */
  seam: Window;
  /** The seam opens into the window's contour. */
  open: Window;
  /** Camera and window turn from a low oblique angle to face the viewer. */
  arrive: Window;
  /** Rim, corner brackets, back plate and engraving lock into place. */
  pieces: Window;
  /** The glass fills and the scan line activates the surface. */
  glass: Window;
  scan: Window;
  /** Supporting layers unfold: side window, reward satellites, step sheets. */
  unfold: Window;
  /** Background system panes draw in, staggered. */
  planes: Window;
  /** When the page content starts to appear. */
  live: number;
  total: number;
};

const NEVER: Window = [-2, -1];

export const BOOT: Record<Exclude<BootKind, "none">, BootTimes> = {
  full: { seam: [150, 750], open: [650, 1350], arrive: [0, 2300], pieces: [1000, 2100], glass: [1500, 2100], scan: [1750, 2450], unfold: [2050, 3000], planes: [1300, 3000], live: 1950, total: 3200 },
  short: { seam: [0, 220], open: [120, 480], arrive: [0, 850], pieces: [200, 750], glass: [350, 650], scan: [450, 850], unfold: [600, 1150], planes: [250, 1100], live: 520, total: 1250 },
  late: { seam: NEVER, open: [0, 500], arrive: NEVER, pieces: [100, 800], glass: [0, 450], scan: NEVER, unfold: [300, 950], planes: [0, 950], live: -1, total: 1000 },
};

/** Where the corner brackets land (as fractions of the pieces window), for the scene and the sound. */
export const PIECE_LANDINGS = [0.52, 0.61, 0.7, 0.79];

/** Session key: the full activation plays once per tab session, later visits get the short one. */
export const BOOT_KEY = "archive:admin:activated";
