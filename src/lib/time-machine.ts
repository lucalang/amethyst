/**
 * Amethyst Time Machine: the pure data layer. Everything here is derived from the signed-in account's own
 * entries and collections, using the date an entry was ADDED to the archive (its `created_at`), never a release
 * date or any subject date. Days are calendar days in the account's time zone (`""` = the device's zone).
 *
 * The timeline is a serpentine path: one lane per calendar year, read left to right in even lanes and right to
 * left in odd ones, so time is a single continuous path. A position on it is the number `u`: its integer part is
 * the lane (year − first year) and its fraction the place within that year.
 */
import { dateInZone } from "@/lib/tasks/model";

const DAY_MS = 86_400_000;

/** An entry as the server sends it. */
export type TimeEntry = {
  id: string;
  slug: string | null;
  title: string;
  collectionId: string;
  coverUrl: string | null;
  square: boolean;
  /** ISO timestamp the entry was added to the archive. */
  createdAt: string;
};

export type TimeCollection = { id: string; slug: string | null; name: string; accent: string | null; createdAt: string };

/** An entry placed on its day. */
export type Moment = {
  id: string;
  slug: string | null;
  title: string;
  collectionId: string;
  coverUrl: string | null;
  square: boolean;
  at: number;
  /** YYYY-MM-DD in the account's zone. */
  day: string;
};

export type TimeIndex = {
  /** Oldest first. */
  moments: Moment[];
  byDay: Map<string, Moment[]>;
  byId: Map<string, Moment>;
  /** Days with at least one entry, ascending. */
  days: string[];
  firstYear: number;
  /** Today in the zone. */
  today: string;
  /** The last day the path reaches (today, or a later entry day). */
  lastDay: string;
  total: number;
};

/* ------------------------------------------------------------------------------------------- Dates */

export const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const isoOfNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const yearOf = (iso: string) => Number(iso.slice(0, 4));
export const monthOf = (iso: string) => Number(iso.slice(5, 7)) - 1;
const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export const daysInYear = (year: number) => (isLeap(year) ? 366 : 365);
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
export const dayOfYear = (iso: string) => dayNumber(iso) - dayNumber(`${yearOf(iso)}-01-01`);
export const isoDate = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** `iso` moved by whole calendar months, keeping the day of the month where it exists (else the month's last day). */
export function addMonths(iso: string, months: number) {
  const total = yearOf(iso) * 12 + monthOf(iso) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  return isoDate(year, month, Math.min(Number(iso.slice(8, 10)), daysInMonth(year, month)));
}

export const formatDay = (iso: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", year: "numeric" }) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en", { ...options, timeZone: "UTC" });

/** "Mar 14, 2025, 9:41 PM": when an entry was added, in the account's zone. */
export function formatAdded(at: number, zone: string) {
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: zone || undefined }).format(at);
  } catch {
    return new Date(at).toLocaleString("en");
  }
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/* ---------------------------------------------------------------------------------------- Path math */

/** The path position of a day: lane = year offset, fraction = the middle of the day within its year. */
export const uOfDay = (iso: string, firstYear: number) => yearOf(iso) - firstYear + (dayOfYear(iso) + 0.5) / daysInYear(yearOf(iso));

/** The calendar day a path position falls on. */
export function dayOfU(u: number, firstYear: number) {
  const lane = Math.max(0, Math.floor(u));
  const year = firstYear + lane;
  const doy = Math.min(daysInYear(year) - 1, Math.max(0, Math.floor((u - lane) * daysInYear(year))));
  return isoOfNumber(dayNumber(`${year}-01-01`) + doy);
}

/* -------------------------------------------------------------------------------------------- Index */

export function buildIndex(entries: TimeEntry[], zone: string, now = Date.now()): TimeIndex {
  const moments: Moment[] = [];
  for (const entry of entries) {
    const at = Date.parse(entry.createdAt);
    if (!Number.isFinite(at)) continue;
    moments.push({ id: entry.id, slug: entry.slug, title: entry.title, collectionId: entry.collectionId, coverUrl: entry.coverUrl, square: entry.square, at, day: dateInZone(new Date(at), zone) });
  }
  moments.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  const byDay = new Map<string, Moment[]>();
  const byId = new Map<string, Moment>();
  for (const moment of moments) {
    byId.set(moment.id, moment);
    const list = byDay.get(moment.day);
    if (list) list.push(moment);
    else byDay.set(moment.day, [moment]);
  }
  const days = [...byDay.keys()].sort();
  const today = dateInZone(new Date(now), zone);
  const first = days[0] ?? today;
  const lastDay = days.length && days[days.length - 1] > today ? days[days.length - 1] : today;
  return { moments, byDay, byId, days, firstYear: Math.min(yearOf(first), yearOf(today)), today, lastDay, total: moments.length };
}

export const laneCount = (index: TimeIndex) => yearOf(index.lastDay) - index.firstYear + 1;
/** Highest path position: the end of the last day. */
export const maxU = (index: TimeIndex) => uOfDay(index.lastDay, index.firstYear);

/** First index in `days` that is ≥ `iso`. */
function lowerBound(days: string[], iso: string) {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < iso) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The nearest earlier day with entries, or null. */
export const previousDayWith = (index: TimeIndex, iso: string) => index.days[lowerBound(index.days, iso) - 1] ?? null;
/** The nearest later day with entries, or null. */
export function nextDayWith(index: TimeIndex, iso: string) {
  const at = lowerBound(index.days, iso);
  return index.days[index.days[at] === iso ? at + 1 : at] ?? null;
}

/** The day with entries closest to `iso` (earlier wins ties) and how many days away it is, or null for an empty archive. */
export function nearestDayWith(index: TimeIndex, iso: string) {
  const at = lowerBound(index.days, iso);
  const candidates = [index.days[at], index.days[at - 1]].filter((day): day is string => Boolean(day));
  let best: { day: string; distance: number } | null = null;
  for (const day of candidates) {
    const distance = Math.abs(dayNumber(day) - dayNumber(iso));
    if (!best || distance < best.distance) best = { day, distance };
  }
  return best;
}

/** Entries added on days within `radius` of `center`, closest first. */
export function momentsAround(index: TimeIndex, center: string, radius: number) {
  const lo = isoOfNumber(dayNumber(center) - radius);
  const hi = isoOfNumber(dayNumber(center) + radius);
  const found: Moment[] = [];
  for (let at = lowerBound(index.days, lo); at < index.days.length && index.days[at] <= hi; at += 1) found.push(...index.byDay.get(index.days[at])!);
  const middle = dayNumber(center);
  return found.sort((a, b) => Math.abs(dayNumber(a.day) - middle) - Math.abs(dayNumber(b.day) - middle) || b.at - a.at);
}

/** Entries added per month of a year. */
export function monthCounts(index: TimeIndex, year: number) {
  const counts = new Array<number>(12).fill(0);
  for (const day of index.days) if (yearOf(day) === year) counts[monthOf(day)] += index.byDay.get(day)!.length;
  return counts;
}

/** Entries added per year, for every year the path covers. */
export function yearCounts(index: TimeIndex) {
  const lanes = laneCount(index);
  const counts = new Array<number>(lanes).fill(0);
  for (const moment of index.moments) counts[Math.min(lanes - 1, yearOf(moment.day) - index.firstYear)] += 1;
  return counts.map((count, lane) => ({ year: index.firstYear + lane, count }));
}

/** Entries of a calendar month, newest first. */
export function momentsInMonth(index: TimeIndex, year: number, month: number) {
  const out: Moment[] = [];
  const from = lowerBound(index.days, isoDate(year, month, 1));
  const to = isoDate(year, month, daysInMonth(year, month));
  for (let at = from; at < index.days.length && index.days[at] <= to; at += 1) out.push(...index.byDay.get(index.days[at])!);
  return out.reverse();
}

/** Entries of a calendar year, newest first. */
export function momentsInYear(index: TimeIndex, year: number) {
  const out: Moment[] = [];
  const from = lowerBound(index.days, isoDate(year, 0, 1));
  for (let at = from; at < index.days.length && yearOf(index.days[at]) === year; at += 1) out.push(...index.byDay.get(index.days[at])!);
  return out.reverse();
}

/* ------------------------------------------------------------------------------------------ Memories */

export type Rewind = { target: string; entries: Moment[]; nearest: { day: string; distance: number } | null };
export type OnThisDayYear = { year: number; ago: number; entries: Moment[] };
export type Notable = { key: string; label: string; detail: string; day: string; entryId: string | null; level: number };

/** A window of three days either side of "a month ago" / "a year ago" counts as around that date. */
export const REWIND_RADIUS = 3;

function rewind(index: TimeIndex, months: number): Rewind {
  const target = addMonths(index.today, -months);
  const entries = momentsAround(index, target, REWIND_RADIUS);
  return { target, entries, nearest: entries.length ? null : nearestDayWith(index, target) };
}

export type Memories = { monthAgo: Rewind; yearAgo: Rewind; onThisDay: OnThisDayYear[]; notable: Notable[] };

export function buildMemories(index: TimeIndex): Memories {
  const todayYear = yearOf(index.today);
  const mmdd = index.today.slice(5);
  const onThisDay: OnThisDayYear[] = [];
  for (let year = todayYear - 1; year >= index.firstYear; year -= 1) {
    const entries = index.byDay.get(`${String(year).padStart(4, "0")}-${mmdd}`);
    if (entries?.length) onThisDay.push({ year, ago: todayYear - year, entries: [...entries].reverse() });
  }

  const notable: Notable[] = [];
  if (index.total) {
    const first = index.moments[0];
    notable.push({ key: "first", label: "Where it began", detail: `${first.title}, your first entry`, day: first.day, entryId: first.id, level: 3 });
    let busiest = index.days[0];
    for (const day of index.days) if (index.byDay.get(day)!.length > index.byDay.get(busiest)!.length) busiest = day;
    const busiestCount = index.byDay.get(busiest)!.length;
    if (busiestCount >= 2) notable.push({ key: "busiest-day", label: "Busiest day", detail: `${busiestCount} entries added`, day: busiest, entryId: null, level: 3 });
    const months = new Map<string, number>();
    for (const day of index.days) months.set(day.slice(0, 7), (months.get(day.slice(0, 7)) ?? 0) + index.byDay.get(day)!.length);
    let topMonth: [string, number] | null = null;
    for (const entry of months) if (!topMonth || entry[1] > topMonth[1]) topMonth = entry;
    if (topMonth && topMonth[1] >= 3 && months.size > 1) {
      const month = Number(topMonth[0].slice(5)) - 1;
      notable.push({ key: "busiest-month", label: "Busiest month", detail: `${MONTH_NAMES[month]} ${topMonth[0].slice(0, 4)} · ${topMonth[1]} entries`, day: `${topMonth[0]}-01`, entryId: null, level: 2 });
    }
    const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000].filter((n) => n <= index.total && n > 1);
    for (const n of milestones.slice(-3).reverse()) {
      const moment = index.moments[n - 1];
      notable.push({ key: `milestone-${n}`, label: `Entry number ${n.toLocaleString("en")}`, detail: moment.title, day: moment.day, entryId: moment.id, level: 3 });
    }
  }
  return { monthAgo: rewind(index, 1), yearAgo: rewind(index, 12), onThisDay, notable };
}

/** Collections by the day they were created, oldest first, with how many entries each holds now. */
export function collectionMoments(index: TimeIndex, collections: TimeCollection[], zone: string) {
  const counts = new Map<string, number>();
  for (const moment of index.moments) counts.set(moment.collectionId, (counts.get(moment.collectionId) ?? 0) + 1);
  return collections
    .map((collection) => {
      const at = Date.parse(collection.createdAt);
      return { collection, day: Number.isFinite(at) ? dateInZone(new Date(at), zone) : null, count: counts.get(collection.id) ?? 0 };
    })
    .filter((item): item is { collection: TimeCollection; day: string; count: number } => item.day !== null)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
}

/** "3 days ago", "1 year, 2 months ago": a short distance from today for a past day. */
export function distanceFromToday(index: TimeIndex, iso: string) {
  const days = dayNumber(index.today) - dayNumber(iso);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 0) return `in ${-days} days`;
  if (days < 31) return `${days} days ago`;
  const months = (yearOf(index.today) - yearOf(iso)) * 12 + monthOf(index.today) - monthOf(iso) - (index.today.slice(8) < iso.slice(8) ? 1 : 0);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} year${years === 1 ? "" : "s"}${rest ? `, ${rest} month${rest === 1 ? "" : "s"}` : ""} ago`;
}

/** URL state: `?at=YYYY-MM-DD&z=0..3&e=<entry id>` so Back returns to the same point in time. */
export const TIME_LEVELS = ["All time", "Year", "Month", "Day"] as const;
export function readLocation(search: string) {
  const params = new URLSearchParams(search);
  const at = params.get("at");
  const zoom = Number(params.get("z"));
  return {
    at: at && /^\d{4}-\d{2}-\d{2}$/.test(at) && !Number.isNaN(Date.parse(`${at}T00:00:00Z`)) ? at : null,
    zoom: Number.isInteger(zoom) && zoom >= 0 && zoom <= 3 && params.has("z") ? zoom : null,
    entry: params.get("e"),
  };
}
