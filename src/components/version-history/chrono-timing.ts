/** Choreography shared by the Version History chronometer (Three.js) and its DOM layers, in ms. */

export type IntroKind = "full" | "short";
export type TravelKind = "full" | "subtle";
export type Span = readonly [number, number];

/** A commit as the chronometer sees it: one plate, one bead on the index ring. */
export type ChronoCommit = {
  shortSha: string;
  /** Days since the Unix epoch (UTC), from the catalog's ISO commit date. */
  day: number;
  /** Exact commit time in (fractional) days since the epoch. */
  time: number;
  milestone: string | null;
  title: string;
  available: boolean;
};

/** The full opening plays once per browser session, a short one afterwards. */
export const INTRO_SESSION_KEY = "archive:version-history:intro";
/** How long the opening waits for the 3D engine before showing the page without it. */
export const ENGINE_WAIT = 1500;

export const INTRO: Record<IntroKind, { flicker: Span; wake: Span; sweep: Span; lock: number; settle: Span; reveal: number; end: number }> = {
  full: { flicker: [0, 560], wake: [280, 1320], sweep: [640, 1720], lock: 1760, settle: [1820, 2700], reveal: 1960, end: 2780 },
  short: { flicker: [0, 140], wake: [40, 520], sweep: [120, 660], lock: 690, settle: [660, 1200], reveal: 700, end: 1260 },
};

export const TRAVEL: Record<TravelKind, { engage: Span; dive: Span; passage: Span; flash: number; navigate: number }> = {
  full: { engage: [0, 760], dive: [560, 1180], passage: [1100, 2260], flash: 2330, navigate: 2620 },
  subtle: { engage: [0, 380], dive: [260, 620], passage: [560, 1220], flash: 1260, navigate: 1460 },
};
/** Without WebGL the overlay plays a brief DOM-only sequence instead. */
export const TRAVEL_FALLBACK: { passage: Span; navigate: number } = { passage: [140, 860], navigate: 1040 };

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const span = (ms: number, [from, to]: Span) => clamp01((ms - from) / (to - from));
export const smooth = (x: number) => x * x * (3 - 2 * x);
export const easeOut = (x: number) => 1 - (1 - x) ** 3;
export const easeIn = (x: number) => x * x * x;
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/** How far back the journey has gone (0 = today, 1 = destination); drives the tunnel and the date readout. */
export const journey = (ms: number, passage: Span) => 0.5 - 0.5 * Math.cos(Math.PI * span(ms, passage));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_LABELS = MONTHS.map((month) => month.toUpperCase());
const DAY_MS = 86_400_000;

export function dayNumber(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

export function dayParts(day: number) {
  const date = new Date(Math.round(day) * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), date: date.getUTCDate() };
}

/** "30 Sep 2026" */
export function formatDay(day: number) {
  const { year, month, date } = dayParts(day);
  return `${String(date).padStart(2, "0")} ${MONTHS[month]} ${year}`;
}

/** Today in the visitor's own calendar, as a day number. */
export function localToday() {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}
