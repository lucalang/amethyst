"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Compass, Hourglass, LocateFixed, Orbit, PanelLeftClose, PanelLeftOpen, X, ZoomIn, ZoomOut } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { useUiSound } from "@/components/layout/ui-sound";
import { MediaImage } from "@/components/media/media-image";
import { useMotionLevel, webglAvailable } from "@/components/showcase/motion";
import { Button } from "@/components/ui/button";
import { collectionPath, entryPath } from "@/lib/collections";
import {
  MONTH_NAMES,
  TIME_LEVELS,
  addMonths,
  buildIndex,
  buildMemories,
  collectionMoments,
  dayNumber,
  dayOfU,
  daysInMonth,
  distanceFromToday,
  formatAdded,
  formatDay,
  isoDate,
  isoOfNumber,
  maxU,
  momentsInMonth,
  momentsInYear,
  monthCounts,
  monthOf,
  nearestDayWith,
  nextDayWith,
  previousDayWith,
  readLocation,
  uOfDay,
  yearCounts,
  yearOf,
  type Moment,
  type TimeCollection,
  type TimeEntry,
  type TimeIndex,
} from "@/lib/time-machine";
import { cn } from "@/lib/utils";
import { createTimeMachine, type TimeEngine } from "./time-machine-scene";
import "./time-machine.css";

type Mode = "timeline" | "calendar";
const ARRIVAL_MS = 2300;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/* ------------------------------------------------------------------------------------- Entry rows */

function EntryRow({ moment, index, zone, collections, selected, onSelect }: { moment: Moment; index: TimeIndex; zone: string; collections: Map<string, TimeCollection>; selected: boolean; onSelect: (id: string) => void }) {
  const collection = collections.get(moment.collectionId);
  return (
    <li className={cn("tm-row", selected && "is-selected")}>
      <button type="button" className="tm-row-main" onClick={() => onSelect(moment.id)} aria-pressed={selected}>
        <span className="tm-thumb" data-square={moment.square || undefined}>
          <MediaImage src={moment.coverUrl} alt="" sizes="64px" fallbackLabel={moment.title} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="tm-row-title">{moment.title}</span>
          <span className="tm-row-meta">
            Added {formatAdded(moment.at, zone)} · {distanceFromToday(index, moment.day)}
          </span>
          <span className="tm-row-meta">{collection ? collection.name : "Collection"}</span>
        </span>
      </button>
      <Link href={entryPath(moment)} className="tm-open" aria-label={`Open ${moment.title}`} title="Open entry">
        <ArrowUpRight aria-hidden className="size-4" />
      </Link>
    </li>
  );
}

function SelectedCard({ moment, index, zone, collections, onClose }: { moment: Moment; index: TimeIndex; zone: string; collections: Map<string, TimeCollection>; onClose: () => void }) {
  const collection = collections.get(moment.collectionId);
  return (
    <div className="tm-selected" role="region" aria-label="Selected entry">
      <span className="tm-thumb tm-thumb-lg" data-square={moment.square || undefined}>
        <MediaImage src={moment.coverUrl} alt={moment.title} sizes="160px" fallbackLabel={moment.title} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="tm-kicker">Added to your archive</p>
        <h3 className="truncate text-base font-bold">{moment.title}</h3>
        <p className="text-xs text-white/70">{formatAdded(moment.at, zone)}</p>
        <p className="text-xs text-white/55">{distanceFromToday(index, moment.day)}</p>
        {collection ? (
          <Link href={collectionPath(collection)} className="tm-chip mt-1.5">
            {collection.name}
          </Link>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Button asChild size="sm" className="h-8">
            <Link href={entryPath(moment)}>
              Open entry
              <ArrowUpRight aria-hidden />
            </Link>
          </Button>
          <Button size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={onClose}>
            <X aria-hidden />
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------------- Calendar view */

function CalendarView({ index, day, onPick, onYear }: { index: TimeIndex; day: string; onPick: (day: string) => void; onYear: (year: number) => void }) {
  const year = yearOf(day);
  const lastYear = yearOf(index.lastDay);
  const counts = monthCounts(index, year);
  return (
    <div className="tm-calendar" role="region" aria-label={`Calendar of ${year}`}>
      <div className="tm-calendar-head">
        <Button size="icon" variant="outline" className="size-9 border-white/20 bg-white/5 text-white" aria-label="Previous year" disabled={year <= index.firstYear} onClick={() => onYear(year - 1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <h2 className="text-xl font-extrabold tabular-nums">{year}</h2>
        <Button size="icon" variant="outline" className="size-9 border-white/20 bg-white/5 text-white" aria-label="Next year" disabled={year >= lastYear} onClick={() => onYear(year + 1)}>
          <ChevronRight aria-hidden />
        </Button>
        <span className="text-sm text-white/60">
          {counts.reduce((a, b) => a + b, 0).toLocaleString("en")} entries added
        </span>
      </div>
      <div className="tm-months">
        {MONTH_NAMES.map((name, month) => {
          const length = daysInMonth(year, month);
          const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
          return (
            <section key={name} aria-label={`${name} ${year}`} className="tm-month">
              <h3>
                {name}
                <span>{counts[month] ? `${counts[month]} added` : "none"}</span>
              </h3>
              <div className="tm-days" role="grid">
                {Array.from({ length: offset }, (_, i) => (
                  <span key={`blank-${i}`} aria-hidden />
                ))}
                {Array.from({ length }, (_, i) => {
                  const iso = isoDate(year, month, i + 1);
                  const count = index.byDay.get(iso)?.length ?? 0;
                  const future = iso > index.lastDay;
                  return (
                    <button
                      key={iso}
                      type="button"
                      role="gridcell"
                      className={cn("tm-day", count > 0 && "has", iso === day && "is-current", iso === index.today && "is-today")}
                      data-level={Math.min(count, 4)}
                      disabled={future}
                      aria-label={`${formatDay(iso, { month: "long", day: "numeric", year: "numeric" })}: ${count ? `${count} ${count === 1 ? "entry" : "entries"} added` : "nothing added"}`}
                      aria-current={iso === day ? "date" : undefined}
                      onClick={() => onPick(iso)}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- Scrubber */

function Scrubber({ index, day, onChange, onToday }: { index: TimeIndex; day: string; onChange: (day: string) => void; onToday: () => void }) {
  const start = dayNumber(isoDate(index.firstYear, 0, 1));
  const end = dayNumber(index.lastDay);
  const span = Math.max(1, end - start);
  const buckets = 96;
  const bars = useMemo(() => {
    const counts = new Array<number>(buckets).fill(0);
    for (const moment of index.moments) counts[clamp(Math.floor(((dayNumber(moment.day) - start) / span) * buckets), 0, buckets - 1)] += 1;
    const top = Math.max(1, ...counts);
    return counts.map((count) => count / top);
  }, [index, start, span]);
  return (
    <div className="tm-scrub">
      <div className="tm-scrub-track">
        <svg aria-hidden viewBox={`0 0 ${buckets} 10`} preserveAspectRatio="none" className="tm-scrub-bars">
          {bars.map((value, i) => (value > 0 ? <rect key={i} x={i + 0.1} width={0.8} y={10 - Math.max(1, value * 10)} height={Math.max(1, value * 10)} /> : null))}
        </svg>
        <input
          type="range"
          min={0}
          max={span}
          step={1}
          value={clamp(dayNumber(day) - start, 0, span)}
          onChange={(event) => onChange(isoOfNumber(start + Number(event.target.value)))}
          aria-label="Move through time"
          aria-valuetext={formatDay(day)}
        />
      </div>
      <div className="tm-scrub-labels">
        <span>{index.firstYear}</span>
        <Button size="sm" variant="outline" className="h-7 border-white/20 bg-white/5 px-2.5 text-xs text-white hover:bg-white/10" onClick={onToday}>
          <LocateFixed aria-hidden />
          Today
        </Button>
        <span>{formatDay(index.lastDay, { month: "short", day: "numeric", year: "numeric" })}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------- Main view */

export default function TimeMachine({ entries, collections }: { entries: TimeEntry[]; collections: TimeCollection[] }) {
  const { timeZone: zone } = useSettings();
  const motion = useMotionLevel();
  const play = useUiSound();
  const index = useMemo(() => buildIndex(entries, zone), [entries, zone]);
  const memories = useMemo(() => buildMemories(index), [index]);
  const collectionById = useMemo(() => new Map(collections.map((collection) => [collection.id, collection])), [collections]);
  const timeline = useMemo(() => collectionMoments(index, collections, zone), [index, collections, zone]);
  const todayU = uOfDay(index.today, index.firstYear);
  const limitU = maxU(index);
  const empty = index.total === 0;

  // The starting point: a point in time restored from the address (Back from an entry), or an arrival at today.
  const [start] = useState(() => {
    const saved = readLocation(window.location.search);
    const entry = saved.entry && index.byId.has(saved.entry) ? saved.entry : null;
    const at = saved.at && saved.at >= isoDate(index.firstYear, 0, 1) && saved.at <= index.lastDay ? saved.at : entry ? index.byId.get(entry)!.day : null;
    return { at, zoom: saved.zoom, entry };
  });
  const canGl = useMemo(() => webglAvailable(), []);
  const animate = motion !== "off";
  const arrive = canGl && animate && start.at === null && !empty;
  const firstU = uOfDay(index.days[0] ?? index.today, index.firstYear);
  const [u, setU] = useState(() => (arrive ? firstU : start.at ? uOfDay(start.at, index.firstYear) : todayU));
  const [zoom, setZoom] = useState(() => (arrive ? 0 : (start.zoom ?? (start.entry ? 3 : 1))));
  const [selected, setSelected] = useState<string | null>(start.entry);
  const [glide, setGlide] = useState(arrive ? 0.38 : 0.45);
  const [mode, setMode] = useState<Mode>(canGl ? "timeline" : "calendar");
  const [arriving, setArriving] = useState(arrive);
  const [shelf, setShelf] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [lost, setLost] = useState(false);

  const calendar = mode === "calendar" || lost;
  const day = dayOfU(u, index.firstYear);
  const level = clamp(Math.round(zoom), 0, 3);
  const engine = useRef<TimeEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastTick = useRef(0);

  const goDay = useCallback(
    (target: string, nextZoom: number | null = null, entry: string | null = null) => {
      const clampedU = clamp(uOfDay(target, index.firstYear), 0, limitU);
      setGlide(Math.abs(clampedU - u) > 0.4 ? 0.8 : 0.45);
      setU(clampedU);
      if (nextZoom !== null) setZoom(nextZoom);
      setSelected(entry);
      if (Math.abs(clampedU - u) > 0.05) play("swoosh");
      engine.current?.pulse();
    },
    [index.firstYear, limitU, play, u],
  );

  const select = useCallback(
    (id: string) => {
      const moment = index.byId.get(id);
      if (!moment) return;
      play("tap");
      goDay(moment.day, 3, id);
    },
    [goDay, index, play],
  );

  // Arrival: fly the length of the archive to today, then hand over control.
  useEffect(() => {
    if (!arrive) return;
    const timers = [
      window.setTimeout(() => {
        play("power");
        setGlide(1.9);
        setU(todayU);
        setZoom(1);
      }, 450),
      window.setTimeout(() => {
        setGlide(0.45);
        setArriving(false);
        play("reveal");
      }, 450 + ARRIVAL_MS),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
    // The arrival plays once, on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The 3D timeline.
  const handlers = useRef({
    onScrub: (next: number) => setU(next),
    onZoom: (next: number) => setZoom(next),
    onPickEntry: (id: string) => select(id),
    onPickDay: (target: string) => goDay(target, Math.max(level, 2), null),
    onTick: () => {
      const now = performance.now();
      if (now - lastTick.current > 45) {
        lastTick.current = now;
        play("tick");
      }
    },
    onLost: () => setLost(true),
  });
  useEffect(() => {
    handlers.current = {
      onScrub: (next) => {
        setU(next);
        setSelected(null);
      },
      onZoom: (next) => {
        setZoom(next);
        setSelected(null);
      },
      onPickEntry: (id) => select(id),
      onPickDay: (target) => goDay(target, Math.max(level, 2), null),
      onTick: handlers.current.onTick,
      onLost: () => setLost(true),
    };
  });
  const viewRef = useRef({ u, zoom, selected, glide });
  useEffect(() => {
    viewRef.current = { u, zoom, selected, glide };
  });
  useEffect(() => {
    if (mode !== "timeline" || lost || !canvasRef.current || !labelsRef.current) return;
    const canvas = canvasRef.current;
    let created: TimeEngine | null = null;
    try {
      created = createTimeMachine(
        canvas,
        labelsRef.current,
        index,
        {
          onScrub: (next) => handlers.current.onScrub(next),
          onZoom: (next) => handlers.current.onZoom(next),
          onPickEntry: (id) => handlers.current.onPickEntry(id),
          onPickDay: (target) => handlers.current.onPickDay(target),
          onTick: () => handlers.current.onTick(),
          onLost: () => handlers.current.onLost(),
        },
        { animate, coarse: window.matchMedia("(pointer: coarse)").matches, initial: viewRef.current },
      );
    } catch {
      // No WebGL context after all: fall back to the calendar.
      window.setTimeout(() => setLost(true), 0);
      return;
    }
    engine.current = created;
    const resize = () => created?.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      created?.dispose();
      engine.current = null;
    };
  }, [mode, lost, index, animate]);
  useEffect(() => {
    engine.current?.setView({ u, zoom, selected, glide });
  }, [u, zoom, selected, glide, mode]);

  // The address always names the point in time, so Back from an entry returns to it.
  useEffect(() => {
    if (arriving) return;
    const id = window.setTimeout(() => {
      const params = new URLSearchParams({ at: day, z: String(level) });
      if (selected) params.set("e", selected);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
    }, 250);
    return () => window.clearTimeout(id);
  }, [day, level, selected, arriving]);

  /* --------------------------------------------------------------------------------------- Controls */
  const setLevel = (next: number) => {
    setGlide(0.45);
    setZoom(next);
    setSelected(null);
    play("tap");
  };
  const clampDay = (iso: string) => {
    const first = isoDate(index.firstYear, 0, 1);
    return iso < first ? first : iso > index.lastDay ? index.lastDay : iso;
  };
  const unitStep = (direction: 1 | -1) => {
    let target = day;
    if (level === 0) target = addMonths(day, 12 * direction);
    else if (level === 1) target = addMonths(day, direction);
    else target = isoOfNumber(dayNumber(day) + direction * (level === 2 ? 7 : 1));
    goDay(clampDay(target), null, null);
  };
  const jumpMoment = (direction: 1 | -1) => {
    const target = direction > 0 ? nextDayWith(index, day) : previousDayWith(index, day);
    if (target) goDay(target, Math.max(level, 2), null);
  };
  const today = () => goDay(index.today, level, null);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      // Time runs left to right in the lanes' even years; stepping always means earlier / later.
      unitStep(key === "ArrowRight" ? 1 : -1);
    } else if (key === "ArrowUp" || key === "+" || key === "=") setLevel(clamp(level + 1, 0, 3));
    else if (key === "ArrowDown" || key === "-") setLevel(clamp(level - 1, 0, 3));
    else if (key === "PageDown") jumpMoment(1);
    else if (key === "PageUp") jumpMoment(-1);
    else if (key === "Home" && index.days[0]) goDay(index.days[0], 3, null);
    else if (key === "End" && index.days.length) goDay(index.days[index.days.length - 1], 3, null);
    else if (key === "t" || key === "T") today();
    else if (key === "Escape") setSelected(null);
    else if (key === "Enter" && selected) window.location.assign(entryPath(index.byId.get(selected)!));
    else return;
    event.preventDefault();
  };

  /* ----------------------------------------------------------------------------------------- Panels */
  const dayEntries = index.byDay.get(day) ?? [];
  const selectedMoment = selected ? (index.byId.get(selected) ?? null) : null;
  const year = yearOf(day);
  const month = monthOf(day);
  const period = useMemo(() => {
    if (level === 3) return { title: formatDay(day), list: [...(index.byDay.get(day) ?? [])].reverse(), noun: "added on this day" };
    if (level === 2) return { title: `${MONTH_NAMES[month]} ${year}`, list: momentsInMonth(index, year, month), noun: "added this month" };
    if (level === 1) return { title: String(year), list: momentsInYear(index, year), noun: "added this year" };
    return { title: "All time", list: index.moments, noun: "in your archive" };
  }, [level, day, index, month, year]);
  const nearest = period.list.length === 0 ? nearestDayWith(index, day) : null;
  const yearBars = useMemo(() => yearCounts(index), [index]);
  const monthBars = useMemo(() => monthCounts(index, year), [index, year]);
  const announce = `${formatDay(day)}: ${dayEntries.length ? `${dayEntries.length} ${dayEntries.length === 1 ? "entry" : "entries"} added` : "nothing added"}`;
  const showList = period.list.slice(0, 40);

  const rewindBlock = (title: string, target: string, items: Moment[], near: { day: string; distance: number } | null, emptyText: string) => (
    <section className="tm-shelf-section" aria-label={title}>
      <h3>
        {title}
        <button type="button" className="tm-link" onClick={() => goDay(target, 3, null)}>
          {formatDay(target, { month: "short", day: "numeric", year: "numeric" })}
        </button>
      </h3>
      {items.length ? (
        <ul className="tm-rows">
          {items.slice(0, 4).map((moment) => (
            <EntryRow key={moment.id} moment={moment} index={index} zone={zone} collections={collectionById} selected={selected === moment.id} onSelect={select} />
          ))}
        </ul>
      ) : (
        <p className="tm-empty">
          {emptyText}
          {near ? (
            <>
              {" "}
              <button type="button" className="tm-link" onClick={() => goDay(near.day, 3, null)}>
                Closest: {formatDay(near.day, { month: "short", day: "numeric", year: "numeric" })} ({near.distance} {near.distance === 1 ? "day" : "days"} away)
              </button>
            </>
          ) : null}
        </p>
      )}
    </section>
  );

  return (
    <div
      ref={stageRef}
      className={cn("tm", arriving && "is-arriving", calendar && "is-calendar", shelf && "has-shelf")}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Amethyst Time Machine"
      style={{ "--tm-warp": 0 } as CSSProperties}
    >
      {!calendar ? (
        <>
          <canvas ref={canvasRef} className="tm-canvas" aria-hidden />
          <div ref={labelsRef} className="tm-labels" aria-hidden />
          <div className="tm-warp" aria-hidden />
        </>
      ) : null}
      <div className="tm-vignette" aria-hidden />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <header className="tm-hud">
        <div className="tm-title">
          <span aria-hidden className="tm-title-icon">
            <Hourglass className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="tm-kicker">Amethyst Time Machine</p>
            <h1 className="tm-readout" aria-hidden>
              {level === 0 ? "All time" : level === 1 ? year : level === 2 ? `${MONTH_NAMES[month]} ${year}` : formatDay(day, { day: "numeric", month: "short", year: "numeric" })}
            </h1>
            <p className="tm-sub">
              {empty
                ? "Nothing added yet"
                : `${index.total.toLocaleString("en")} ${index.total === 1 ? "entry" : "entries"} · ${index.firstYear === yearOf(index.today) ? "since this year" : `since ${index.firstYear}`}`}
            </p>
          </div>
        </div>
        <div className="tm-controls">
          {!calendar ? (
            <div role="group" aria-label="Zoom level" className="tm-levels">
              {TIME_LEVELS.map((name, i) => (
                <button key={name} type="button" aria-pressed={level === i && !selected} onClick={() => setLevel(i)}>
                  {name}
                </button>
              ))}
            </div>
          ) : null}
          {!calendar ? (
            <div className="tm-zoom">
              <Button size="icon" variant="outline" className="size-8 border-white/20 bg-white/5 text-white" aria-label="Zoom out" disabled={level === 0 && !selected} onClick={() => setLevel(clamp(level - 1, 0, 3))}>
                <ZoomOut aria-hidden />
              </Button>
              <Button size="icon" variant="outline" className="size-8 border-white/20 bg-white/5 text-white" aria-label="Zoom in" disabled={level === 3} onClick={() => setLevel(clamp(level + 1, 0, 3))}>
                <ZoomIn aria-hidden />
              </Button>
            </div>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={() => {
              setMode(calendar ? "timeline" : "calendar");
              setLost(false);
            }}
            title={calendar ? "Back to the 3D timeline" : "Browse by calendar and list"}
            disabled={calendar && !canGl}
          >
            {calendar ? <Orbit aria-hidden /> : <CalendarDays aria-hidden />}
            {calendar ? "Timeline" : "Calendar"}
          </Button>
          <Button size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10" aria-expanded={shelf} onClick={() => setShelf((open) => !open)}>
            {shelf ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
            Rediscover
          </Button>
        </div>
      </header>

      {calendar ? (
        <div className="tm-calendar-wrap">
          {!canGl || lost ? <p className="tm-note">The 3D timeline isn&apos;t available in this browser, so here is the same archive as a calendar.</p> : null}
          <CalendarView index={index} day={day} onPick={(target) => goDay(target, 3, null)} onYear={(next) => goDay(clampDay(isoDate(next, month, Math.min(Number(day.slice(8)), daysInMonth(next, month)))), null, null)} />
        </div>
      ) : null}

      {arriving ? (
        <div className="tm-arrival" aria-hidden>
          <p>Travelling to today</p>
        </div>
      ) : null}

      <aside className={cn("tm-shelf", shelf && "is-open")} aria-label="Rediscover" aria-hidden={!shelf} inert={!shelf}>
        <div className="tm-panel-head">
          <h2>
            <Compass aria-hidden className="size-4" /> Rediscover
          </h2>
          <button type="button" className="tm-x" aria-label="Close" onClick={() => setShelf(false)}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="tm-shelf-scroll">
          <div className="tm-jumps">
            <button type="button" onClick={today}>Today</button>
            <button type="button" onClick={() => goDay(addMonths(index.today, -1), 3, null)}>1 month ago</button>
            <button type="button" onClick={() => goDay(addMonths(index.today, -12), 3, null)}>1 year ago</button>
          </div>
          {empty ? (
            <p className="tm-empty">
              Your archive has no entries yet. Entries appear here on the day you add them. <Link href="/collections" className="tm-link">Open the archive</Link>
            </p>
          ) : (
            <>
              {rewindBlock("One month ago", memories.monthAgo.target, memories.monthAgo.entries, memories.monthAgo.nearest, "Nothing was added around this date.")}
              {rewindBlock("One year ago", memories.yearAgo.target, memories.yearAgo.entries, memories.yearAgo.nearest, "Nothing was added around this date.")}
              <section className="tm-shelf-section" aria-label="On this day">
                <h3>
                  On this day
                  <span className="tm-hint">{formatDay(index.today, { month: "long", day: "numeric" })}</span>
                </h3>
                {memories.onThisDay.length ? (
                  memories.onThisDay.map((group) => (
                    <div key={group.year}>
                      <p className="tm-group">
                        {group.ago === 1 ? "1 year ago" : `${group.ago} years ago`} · {group.year}
                      </p>
                      <ul className="tm-rows">
                        {group.entries.slice(0, 4).map((moment) => (
                          <EntryRow key={moment.id} moment={moment} index={index} zone={zone} collections={collectionById} selected={selected === moment.id} onSelect={select} />
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <p className="tm-empty">
                    {index.firstYear === yearOf(index.today)
                      ? "On This Day starts once your archive has more than a year of history."
                      : "Nothing was added on this calendar date in earlier years."}
                  </p>
                )}
              </section>
              {memories.notable.length ? (
                <section className="tm-shelf-section" aria-label="Notable moments">
                  <h3>Notable moments</h3>
                  <ul className="tm-list">
                    {memories.notable.map((item) => (
                      <li key={item.key}>
                        <button type="button" onClick={() => (item.entryId ? select(item.entryId) : goDay(item.day, item.level, null))}>
                          <span className="tm-list-title">{item.label}</span>
                          <span className="tm-list-meta">{item.detail}</span>
                          <span className="tm-list-meta">{formatDay(item.day, { month: "short", day: "numeric", year: "numeric" })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <section className="tm-shelf-section" aria-label="Years">
                <h3>Years</h3>
                <div className="tm-years">
                  {yearBars.map(({ year: y, count }) => (
                    <button key={y} type="button" onClick={() => goDay(y === yearOf(index.today) ? index.today : isoDate(y, 0, 1), 1, null)} aria-label={`${y}: ${count} ${count === 1 ? "entry" : "entries"}`}>
                      <b>{y}</b>
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}
          {timeline.length ? (
            <section className="tm-shelf-section" aria-label="Past collections">
              <h3>Collections over time</h3>
              <ul className="tm-list">
                {timeline.map(({ collection, day: created, count }) => (
                  <li key={collection.id}>
                    <button type="button" onClick={() => goDay(created, 3, null)}>
                      <span className="tm-list-title">{collection.name}</span>
                      <span className="tm-list-meta">
                        Created {formatDay(created, { month: "short", day: "numeric", year: "numeric" })} · {count} {count === 1 ? "entry" : "entries"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </aside>

      <section className="tm-moment" aria-label={`${period.title}: what was added`}>
        {selectedMoment ? <SelectedCard moment={selectedMoment} index={index} zone={zone} collections={collectionById} onClose={() => setSelected(null)} /> : null}
        <div className="tm-panel-head">
          <div className="min-w-0">
            <p className="tm-kicker">{TIME_LEVELS[level]}</p>
            <h2 className="truncate">{period.title}</h2>
          </div>
          <span className="tm-count" title={period.noun}>
            {period.list.length.toLocaleString("en")}
            <small>{period.list.length === 1 ? "entry" : "entries"}</small>
          </span>
        </div>
        <div className="tm-moment-scroll">
          {level === 0 ? (
            <div className="tm-bars" role="group" aria-label="Entries added per year">
              {yearBars.map(({ year: y, count }) => (
                <button key={y} type="button" onClick={() => goDay(y === yearOf(index.today) ? index.today : isoDate(y, 0, 1), 1, null)} aria-label={`${y}: ${count} entries`}>
                  <i style={{ height: `${Math.max(count ? 8 : 2, (count / Math.max(1, ...yearBars.map((bar) => bar.count))) * 100)}%` }} />
                  <span>{y}</span>
                </button>
              ))}
            </div>
          ) : null}
          {level === 1 ? (
            <div className="tm-bars" role="group" aria-label={`Entries added per month in ${year}`}>
              {monthBars.map((count, m) => (
                <button key={m} type="button" onClick={() => goDay(isoDate(year, m, 1) > index.lastDay ? index.lastDay : isoDate(year, m, 1), 2, null)} aria-label={`${MONTH_NAMES[m]}: ${count} entries`}>
                  <i style={{ height: `${Math.max(count ? 8 : 2, (count / Math.max(1, ...monthBars)) * 100)}%` }} />
                  <span>{MONTH_NAMES[m].slice(0, 1)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {level >= 2 && !period.list.length ? (
            <div className="tm-empty-state">
              <p>{level === 3 ? "Nothing was added on this day." : "Nothing was added this month."}</p>
              {empty ? null : (
                <div className="flex flex-wrap gap-2">
                  {previousDayWith(index, day) ? (
                    <Button size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => jumpMoment(-1)}>
                      <ChevronLeft aria-hidden />
                      {formatDay(previousDayWith(index, day)!, { month: "short", day: "numeric", year: "numeric" })}
                    </Button>
                  ) : null}
                  {nextDayWith(index, day) ? (
                    <Button size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => jumpMoment(1)}>
                      {formatDay(nextDayWith(index, day)!, { month: "short", day: "numeric", year: "numeric" })}
                      <ChevronRight aria-hidden />
                    </Button>
                  ) : null}
                </div>
              )}
              {nearest ? (
                <p className="tm-hint">
                  Closest entries: {formatDay(nearest.day, { month: "short", day: "numeric", year: "numeric" })}, {nearest.distance} {nearest.distance === 1 ? "day" : "days"} away.
                </p>
              ) : null}
            </div>
          ) : null}
          {level >= 2 && period.list.length ? (
            <ul className="tm-rows">
              {showList.map((moment) => (
                <EntryRow key={moment.id} moment={moment} index={index} zone={zone} collections={collectionById} selected={selected === moment.id} onSelect={select} />
              ))}
            </ul>
          ) : null}
          {level >= 2 && period.list.length > showList.length ? <p className="tm-hint">Showing the latest {showList.length}. Zoom to a day to see the rest.</p> : null}
          {level < 2 && empty ? <p className="tm-empty">Nothing here yet. Add entries and they will appear on the day you added them.</p> : null}
          {level < 2 && !empty && !period.list.length ? <p className="tm-empty">Nothing was added in {level === 1 ? "this year" : "this archive"}.</p> : null}
        </div>
        {level <= 1 ? (
          <p className="tm-hint tm-moment-foot">Pick {level === 0 ? "a year" : "a month"} above, or use the timeline to zoom in.</p>
        ) : (
          <div className="tm-moment-foot tm-step">
            <Button size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10" disabled={!previousDayWith(index, day)} onClick={() => jumpMoment(-1)}>
              <ChevronLeft aria-hidden />
              Earlier
            </Button>
            <Button size="sm" variant="outline" className="h-8 border-white/20 bg-white/5 text-white hover:bg-white/10" disabled={!nextDayWith(index, day)} onClick={() => jumpMoment(1)}>
              Later
              <ChevronRight aria-hidden />
            </Button>
          </div>
        )}
      </section>

      <Scrubber index={index} day={day} onChange={(target) => goDay(target, null, null)} onToday={today} />
      {!calendar ? (
        <p className="tm-keys" aria-hidden>
          Drag to travel · scroll to zoom · ← → step · PgUp/PgDn jump between entries
        </p>
      ) : null}
    </div>
  );
}
