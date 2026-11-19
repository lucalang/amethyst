/**
 * Amethyst Time Machine: the data layer of the rewind. Everything is derived from the signed-in account's own
 * entries and collections, using the date an entry was ADDED to the archive (its `created_at`), never a release
 * date or any date about the entry itself. Days are calendar days in the account's time zone (`""` = the
 * device's zone). A rewind is a Story: a list of scenes that travel from today back through the past, and any
 * scene that can't be computed accurately from real entries is simply left out.
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

/** An entry placed on the day it was added. */
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
  /** Days with at least one entry, ascending. */
  days: string[];
  today: string;
  total: number;
};

/* ------------------------------------------------------------------------------------------- Dates */

export const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const isoOfNumber = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const yearOf = (iso: string) => Number(iso.slice(0, 4));
export const monthOf = (iso: string) => Number(iso.slice(5, 7)) - 1;
export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
export const isoDate = (year: number, month: number, day: number) => `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

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
  for (const moment of moments) {
    const list = byDay.get(moment.day);
    if (list) list.push(moment);
    else byDay.set(moment.day, [moment]);
  }
  return { moments, byDay, days: [...byDay.keys()].sort(), today: dateInZone(new Date(now), zone), total: moments.length };
}

/** Entries added from `from` to `to` (inclusive days), oldest first. */
export const momentsBetween = (index: TimeIndex, from: string, to: string) => index.moments.filter((moment) => moment.day >= from && moment.day <= to);

/** "3 days ago", "1 year, 2 months ago": how far back a past day is from today. */
export function distanceFromToday(index: TimeIndex, iso: string) {
  const days = dayNumber(index.today) - dayNumber(iso);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = (yearOf(index.today) - yearOf(iso)) * 12 + monthOf(index.today) - monthOf(iso) - (index.today.slice(8) < iso.slice(8) ? 1 : 0);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} year${years === 1 ? "" : "s"}${rest ? `, ${rest} month${rest === 1 ? "" : "s"}` : ""} ago`;
}

/* --------------------------------------------------------------------------------------- Rewinds */

/** A window of three days either side of "a month ago" / "a year ago" counts as around that date. */
export const WINDOW = 3;

export type RewindSpec =
  | { kind: "otd" }
  | { kind: "ago"; months: 1 | 12 }
  | { kind: "range"; from: string; to: string; label: string }
  | { kind: "all" };

export type RewindOption = {
  id: string;
  spec: RewindSpec;
  title: string;
  detail: string;
  count: number;
  /** A few real covers to show on the tile. */
  covers: Moment[];
  group: "memory" | "year" | "all";
};

/** The entries a window of days around `center` holds, closest first. */
function around(index: TimeIndex, center: string) {
  const lo = isoOfNumber(dayNumber(center) - WINDOW);
  const hi = isoOfNumber(dayNumber(center) + WINDOW);
  return momentsBetween(index, lo, hi);
}

/** Entries added on today's calendar date in earlier years, newest year first. */
export function onThisDay(index: TimeIndex) {
  const mmdd = index.today.slice(5);
  const thisYear = yearOf(index.today);
  const years: { year: number; entries: Moment[] }[] = [];
  for (const day of [...index.days].reverse()) {
    if (day.slice(5) === mmdd && yearOf(day) < thisYear) years.push({ year: yearOf(day), entries: index.byDay.get(day)! });
  }
  return years;
}

const withCovers = (entries: Moment[]) => [...entries].sort((a, b) => Number(Boolean(b.coverUrl)) - Number(Boolean(a.coverUrl)) || b.at - a.at).slice(0, 3);

/** The rewinds this archive can actually play, with what each would feature. Unavailable ones are left out. */
export function buildOptions(index: TimeIndex): RewindOption[] {
  const options: RewindOption[] = [];
  if (!index.total) return options;

  const otd = onThisDay(index);
  if (otd.length) {
    const entries = otd.flatMap((year) => year.entries);
    options.push({
      id: "otd",
      spec: { kind: "otd" },
      title: "On This Day",
      detail: `${entries.length} ${entries.length === 1 ? "entry" : "entries"} added on ${formatDay(index.today, { month: "long", day: "numeric" })} in ${otd.length} earlier ${otd.length === 1 ? "year" : "years"}`,
      count: entries.length,
      covers: withCovers(entries),
      group: "memory",
    });
  }
  for (const [months, title] of [[1, "One month ago"], [12, "One year ago"]] as const) {
    const target = addMonths(index.today, -months);
    const entries = around(index, target);
    if (entries.length) {
      options.push({
        id: months === 1 ? "month" : "yearago",
        spec: { kind: "ago", months },
        title,
        detail: `${entries.length} ${entries.length === 1 ? "entry" : "entries"} added around ${formatDay(target, { month: "long", day: "numeric", year: "numeric" })}`,
        count: entries.length,
        covers: withCovers(entries),
        group: "memory",
      });
    }
  }
  const thisYear = yearOf(index.today);
  const years = [...new Set(index.days.map(yearOf))].sort((a, b) => b - a);
  for (const year of years) {
    const to = year === thisYear ? index.today : isoDate(year, 11, 31);
    const entries = momentsBetween(index, isoDate(year, 0, 1), to);
    options.push({
      id: `year-${year}`,
      spec: { kind: "range", from: isoDate(year, 0, 1), to, label: String(year) },
      title: year === thisYear ? `${year} so far` : String(year),
      detail: `${entries.length} ${entries.length === 1 ? "entry" : "entries"} added`,
      count: entries.length,
      covers: withCovers(entries),
      group: "year",
    });
  }
  if (years.length > 1 || index.total >= 12) {
    options.push({
      id: "all",
      spec: { kind: "all" },
      title: "Everything",
      detail: `All ${index.total.toLocaleString("en")} ${index.total === 1 ? "entry" : "entries"}, back to ${formatDay(index.days[0], { month: "long", year: "numeric" })}`,
      count: index.total,
      covers: withCovers(index.moments),
      group: "all",
    });
  }
  return options;
}

/* ----------------------------------------------------------------------------------------- Story */

export type Bar = { label: string; value: number; peak: boolean };

/** One scene of a rewind. `date` is where the clock sits (null: it stays where it was). */
export type Scene =
  | { kind: "title"; id: string; date: string; eyebrow: string; title: string; subtitle: string; note: string }
  | { kind: "entries"; id: string; date: string | null; label: string; sub: string; entries: Moment[]; more: number }
  | { kind: "fact"; id: string; date: string | null; eyebrow: string; big: string; unit: string; text: string; bars: Bar[] | null }
  | { kind: "collection"; id: string; date: string; collection: TimeCollection; count: number; first: Moment | null }
  | { kind: "end"; id: string; date: string; summary: string[] };

export type Story = {
  id: string;
  title: string;
  scenes: Scene[];
  featured: { entries: Moment[]; collections: TimeCollection[] };
};

/** Seconds a scene holds the screen. */
export function sceneDuration(scene: Scene) {
  switch (scene.kind) {
    case "title":
      return 5.2;
    case "entries":
      return 3.1 + 0.62 * scene.entries.length;
    case "fact":
      return scene.bars ? 5.2 : 4.2;
    case "collection":
      return 4.6;
    case "end":
      return 6;
  }
}

/** Up to `max` entries, covered ones first and spread evenly across the span, newest first. */
export function featuredOf(entries: Moment[], max: number) {
  const covered = entries.filter((entry) => entry.coverUrl);
  const pool = (covered.length >= max ? covered : [...covered, ...entries.filter((entry) => !entry.coverUrl)]).sort((a, b) => a.at - b.at);
  if (pool.length <= max) return pool.reverse();
  return Array.from({ length: max }, (_, i) => pool[Math.round((i * (pool.length - 1)) / (max - 1))]).reverse();
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** The unique maximum of a tally, or null when there is a tie (a "most" claim would not be accurate). */
function uniquePeak<K>(tally: Map<K, number>) {
  let best: [K, number] | null = null;
  let tied = false;
  for (const item of tally) {
    if (!best || item[1] > best[1]) {
      best = item;
      tied = false;
    } else if (item[1] === best[1]) tied = true;
  }
  return best && !tied ? best : null;
}

type Dated = { date: string; rank: number; scene: Scene };

/**
 * A period rewind: the scenes of `entries` (all added within [from, to]) from the most recent back to the
 * earliest, with facts only where they hold. `grain` decides whether scenes are months or single days.
 */
function periodScenes(index: TimeIndex, collections: TimeCollection[], entries: Moment[], from: string, to: string, zone: string, prefix: string) {
  const dated: Dated[] = [];
  const undated: Scene[] = [];
  const span = dayNumber(to) - dayNumber(from);
  const byDay = span <= 45;

  const groups = new Map<string, Moment[]>();
  for (const entry of entries) {
    const key = byDay ? entry.day : entry.day.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  // A long period keeps its busiest groups so the story stays a story, not a slideshow of everything.
  const keys = [...groups.keys()].sort((a, b) => (groups.get(b)!.length - groups.get(a)!.length) || (a < b ? 1 : -1)).slice(0, byDay ? 9 : 8);
  const kept = new Set(keys);
  for (const key of kept) {
    const list = groups.get(key)!;
    const latest = list.reduce((a, b) => (b.at > a.at ? b : a)).day;
    const shown = featuredOf(list, list.length > 4 ? 4 : list.length);
    dated.push({
      date: latest,
      rank: 0,
      scene: {
        kind: "entries",
        id: `${prefix}-${key}`,
        date: latest,
        label: byDay ? formatDay(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `${MONTH_NAMES[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`,
        sub: `${plural(list.length, "entry", "entries")} added`,
        entries: shown,
        more: Math.max(0, list.length - shown.length),
      },
    });
  }

  // Facts that hold for this period.
  undated.push({
    kind: "fact",
    id: `${prefix}-total`,
    date: null,
    eyebrow: "Added to your archive",
    big: entries.length.toLocaleString("en"),
    unit: entries.length === 1 ? "entry" : "entries",
    text: `between ${formatDay(from, { month: "long", day: "numeric", year: "numeric" })} and ${formatDay(to, { month: "long", day: "numeric", year: "numeric" })}`,
    bars: null,
  });
  const months = new Map<string, number>();
  for (const entry of entries) months.set(entry.day.slice(0, 7), (months.get(entry.day.slice(0, 7)) ?? 0) + 1);
  const topMonth = uniquePeak(months);
  if (months.size >= 2 && topMonth && topMonth[1] >= 3) {
    const bars: Bar[] = [...months.keys()].sort().map((key) => ({ label: MONTH_NAMES[Number(key.slice(5)) - 1].slice(0, 3), value: months.get(key)!, peak: key === topMonth[0] }));
    const anchor = [...entries].filter((entry) => entry.day.startsWith(topMonth[0])).reduce((a, b) => (b.at > a.at ? b : a)).day;
    dated.push({
      date: anchor,
      rank: 1,
      scene: {
        kind: "fact",
        id: `${prefix}-top-month`,
        date: anchor,
        eyebrow: "Your most active month",
        big: `${MONTH_NAMES[Number(topMonth[0].slice(5)) - 1]}`,
        unit: topMonth[0].slice(0, 4),
        text: `${plural(topMonth[1], "entry", "entries")} added, more than any other month here`,
        bars: bars.length > 12 ? bars.slice(-12) : bars,
      },
    });
  }
  const days = new Map<string, number>();
  for (const entry of entries) days.set(entry.day, (days.get(entry.day) ?? 0) + 1);
  const topDay = uniquePeak(days);
  if (days.size >= 2 && topDay && topDay[1] >= 3) {
    dated.push({
      date: topDay[0],
      rank: 2,
      scene: {
        kind: "fact",
        id: `${prefix}-top-day`,
        date: topDay[0],
        eyebrow: "Your busiest day",
        big: String(topDay[1]),
        unit: "entries in a day",
        text: formatDay(topDay[0], { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        bars: null,
      },
    });
  }
  const made = collections
    .map((collection) => ({ collection, day: dateInZone(new Date(collection.createdAt), zone) }))
    .filter((item) => !Number.isNaN(Date.parse(item.collection.createdAt)) && item.day >= from && item.day <= to)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 3);
  for (const { collection, day } of made) {
    const count = index.moments.filter((moment) => moment.collectionId === collection.id).length;
    const first = index.moments.find((moment) => moment.collectionId === collection.id) ?? null;
    dated.push({ date: day, rank: 3, scene: { kind: "collection", id: `${prefix}-collection-${collection.id}`, date: day, collection, count, first } });
  }

  dated.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.rank - b.rank));
  return { scenes: [...undated, ...dated.map((item) => item.scene)], featured: dated.flatMap((item) => (item.scene.kind === "entries" ? item.scene.entries : [])) };
}

/** Builds a rewind, or null when the archive has nothing to rewind through for it. */
export function buildStory(index: TimeIndex, collections: TimeCollection[], spec: RewindSpec, zone: string): Story | null {
  const today = index.today;
  let title = "";
  let subtitle = "";
  let eyebrow = "Rewind";
  let note = "";
  let id: string = spec.kind;
  let scenes: Scene[] = [];
  let featured: Moment[] = [];

  if (spec.kind === "otd") {
    const years = onThisDay(index);
    if (!years.length) return null;
    title = "On This Day";
    subtitle = formatDay(today, { weekday: "long", day: "numeric", month: "long" });
    note = `${plural(years.reduce((n, year) => n + year.entries.length, 0), "entry", "entries")} from ${plural(years.length, "earlier year", "earlier years")}`;
    for (const { year, entries } of years) {
      const ago = yearOf(today) - year;
      const shown = featuredOf(entries, Math.min(5, entries.length));
      scenes.push({ kind: "entries", id: `otd-${year}`, date: entries[0].day, label: `${ago} ${ago === 1 ? "year" : "years"} ago`, sub: `${formatDay(entries[0].day, { month: "long", day: "numeric", year: "numeric" })} · ${plural(entries.length, "entry", "entries")} added`, entries: shown, more: Math.max(0, entries.length - shown.length) });
      featured.push(...shown);
    }
    if (years.length >= 2) {
      scenes.splice(1, 0, { kind: "fact", id: "otd-years", date: null, eyebrow: "Same date, different years", big: String(years.length), unit: years.length === 1 ? "year" : "years", text: `you added something on ${formatDay(today, { month: "long", day: "numeric" })}`, bars: null });
    }
  } else if (spec.kind === "ago") {
    const target = addMonths(today, -spec.months);
    const entries = around(index, target);
    if (!entries.length) return null;
    title = spec.months === 1 ? "One month ago" : "One year ago";
    subtitle = formatDay(target, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    note = `${plural(entries.length, "entry", "entries")} added within ${WINDOW} days of this date`;
    const built = periodScenes(index, collections, entries, isoOfNumber(dayNumber(target) - WINDOW), isoOfNumber(dayNumber(target) + WINDOW), zone, spec.months === 1 ? "month" : "yearago");
    // The window's total is already in the opening note; keep the day scenes and any collection that began then.
    scenes = built.scenes.filter((scene) => !(scene.kind === "fact" && scene.date === null));
    featured = built.featured;
    id = spec.months === 1 ? "month" : "yearago";
  } else {
    const from = spec.kind === "all" ? index.days[0] : spec.from;
    const to = spec.kind === "all" ? today : spec.to;
    const entries = momentsBetween(index, from, to);
    if (!entries.length) return null;
    if (spec.kind === "all") {
      title = "Everything";
      subtitle = `${formatDay(from, { month: "long", year: "numeric" })} to today`;
      note = `${plural(entries.length, "entry", "entries")} in your archive`;
      id = "all";
      // Each year, most recent first, then the very first entry.
      const years = new Map<number, Moment[]>();
      for (const entry of entries) years.set(yearOf(entry.day), [...(years.get(yearOf(entry.day)) ?? []), entry]);
      const kept = [...years.keys()].sort((a, b) => (years.get(b)!.length - years.get(a)!.length) || b - a).slice(0, 8).sort((a, b) => b - a);
      scenes.push({ kind: "fact", id: "all-total", date: null, eyebrow: "Added to your archive", big: entries.length.toLocaleString("en"), unit: entries.length === 1 ? "entry" : "entries", text: `across ${plural(years.size, "year", "years")}`, bars: null });
      for (const year of kept) {
        const list = years.get(year)!;
        const shown = featuredOf(list, Math.min(4, list.length));
        scenes.push({ kind: "entries", id: `all-${year}`, date: list.reduce((a, b) => (b.at > a.at ? b : a)).day, label: String(year), sub: `${plural(list.length, "entry", "entries")} added`, entries: shown, more: Math.max(0, list.length - shown.length) });
        featured.push(...shown);
      }
      // The most active year sits right after its own chapter, so the story never jumps forward in time.
      const peak = uniquePeak(new Map([...years].map(([year, list]) => [year, list.length])));
      if (years.size >= 3 && peak && peak[1] >= 3 && kept.includes(peak[0])) {
        const anchor = scenes.findIndex((scene) => scene.id === `all-${peak[0]}`);
        const date = years.get(peak[0])!.reduce((a, b) => (b.at > a.at ? b : a)).day;
        scenes.splice(anchor + 1, 0, { kind: "fact", id: "all-top-year", date, eyebrow: "Your most active year", big: String(peak[0]), unit: "", text: `${plural(peak[1], "entry", "entries")} added, more than any other year`, bars: [...years.keys()].sort().slice(-12).map((year) => ({ label: String(year), value: years.get(year)!.length, peak: year === peak[0] })) });
      }
      const first = entries[0];
      scenes.push({ kind: "entries", id: "all-first", date: first.day, label: "Where it began", sub: `Your first entry, added ${formatDay(first.day, { month: "long", day: "numeric", year: "numeric" })}`, entries: [first], more: 0 });
      featured.push(first);
    } else {
      title = spec.label;
      subtitle = `${formatDay(from, { month: "long", day: "numeric", year: "numeric" })} to ${formatDay(to, { month: "long", day: "numeric", year: "numeric" })}`;
      eyebrow = "Rewind to";
      id = `range-${from}-${to}`;
      const built = periodScenes(index, collections, entries, from, to, zone, "range");
      scenes = built.scenes;
      featured = built.featured;
    }
  }

  if (!scenes.length) return null;
  const featuredCollections = scenes.flatMap((scene) => (scene.kind === "collection" ? [scene.collection] : []));
  const reached = scenes.reduce<string | null>((low, scene) => (scene.date && (!low || scene.date < low) ? scene.date : low), null) ?? today;
  const unique = [...new Map(featured.map((entry) => [entry.id, entry])).values()];
  const all: Scene[] = [
    { kind: "title", id: `${id}-title`, date: today, eyebrow, title, subtitle, note },
    ...scenes,
    {
      kind: "end",
      id: `${id}-end`,
      date: today,
      summary: [`You went back ${distanceFromToday(index, reached).replace(" ago", "")}`, `${plural(unique.length, "memory", "memories")} on the way${featuredCollections.length ? `, ${plural(featuredCollections.length, "collection", "collections")} begun` : ""}`],
    },
  ];
  return { id, title, scenes: all, featured: { entries: unique, collections: featuredCollections } };
}
