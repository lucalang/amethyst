"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Hourglass, Play, Rewind, X } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { useMotionLevel } from "@/components/showcase/motion";
import {
  buildIndex,
  buildOptions,
  buildStory,
  formatDay,
  momentsBetween,
  type RewindOption,
  type RewindSpec,
  type Story,
  type TimeCollection,
  type TimeEntry,
} from "@/lib/time-machine";
import { RewindPlayer } from "./rewind-player";
import { StoryArt } from "./story-art";
import { TunnelCanvas } from "./tunnel-canvas";
import type { Tunnel } from "./tunnel";
import "./time-machine.css";

function Covers({ option }: { option: RewindOption }) {
  return (
    <span className="tm-covers" aria-hidden>
      {option.covers.map((moment, i) => (
        <span key={moment.id} className="tm-cover" data-square={moment.square || undefined} style={{ "--i": i } as CSSProperties}>
          <StoryArt moment={moment} />
        </span>
      ))}
    </span>
  );
}

/**
 * Amethyst Time Machine: choose a rewind, then watch it. The chooser only offers rewinds the archive can actually
 * fill; the player tells the story from today back through the past and returns to the present at the end.
 */
export default function TimeMachine({ entries, collections }: { entries: TimeEntry[]; collections: TimeCollection[] }) {
  const router = useRouter();
  const { timeZone: zone } = useSettings();
  const motion = useMotionLevel();
  const calm = motion === "off";
  const index = useMemo(() => buildIndex(entries, zone), [entries, zone]);
  const options = useMemo(() => buildOptions(index), [index]);
  const collectionById = useMemo(() => new Map(collections.map((collection) => [collection.id, collection])), [collections]);
  const [story, setStory] = useState<Story | null>(null);
  const [round, setRound] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const first = index.days[0] ?? index.today;
  const [from, setFrom] = useState(() => index.days[Math.max(0, index.days.length - 30)] ?? index.today);
  const [to, setTo] = useState(index.today);
  const rangeCount = useMemo(() => (from && to && from <= to ? momentsBetween(index, from, to).length : 0), [index, from, to]);
  const tunnel = useRef<Tunnel | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const memories = options.filter((option) => option.group !== "year");
  const years = options.filter((option) => option.group === "year");
  const recommended = memories[0] ?? years[0] ?? null;

  function start(spec: RewindSpec) {
    const built = buildStory(index, collections, spec, zone);
    if (!built) {
      setNotice("There is nothing to rewind through for that choice.");
      return;
    }
    setNotice(null);
    setRound((n) => n + 1);
    setStory(built);
  }

  // Full screen: the page behind doesn't scroll.
  useEffect(() => {
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = overflow;
    };
  }, []);

  useEffect(() => {
    if (story) return;
    rootRef.current?.focus({ preventScroll: true });
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) router.push("/collections");
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [story, router]);

  return (
    <div className="tm-root" data-immersive>
      {story ? (
        <RewindPlayer
          key={`${story.id}-${round}`}
          story={story}
          index={index}
          zone={zone}
          collections={collectionById}
          calm={calm}
          onExit={() => setStory(null)}
          onChooseAnother={() => setStory(null)}
        />
      ) : (
        <div ref={rootRef} className="tm-chooser" tabIndex={-1} role="region" aria-labelledby="tm-heading">
          <TunnelCanvas apiRef={tunnel} running={!calm} calm={calm} />
          <div className="rw-vignette" aria-hidden />
          <div className="tm-chooser-scroll">
            <header className="tm-chooser-head">
              <div className="tm-brand">
                <span className="tm-brand-icon" aria-hidden>
                  <Hourglass className="size-5" />
                </span>
                <p className="rw-kicker">Amethyst Time Machine</p>
              </div>
              <Link href="/collections" className="rw-btn" aria-label="Leave the Time Machine" title="Leave (Esc)">
                <X aria-hidden />
              </Link>
            </header>

            <div className="tm-intro">
              <h1 id="tm-heading" className="tm-hero">
                Where do you want
                <br />
                to rewind to?
              </h1>
              <p className="tm-lede">It starts today and travels back through what you added to your archive. Every date is the day an entry was added.</p>
              {recommended ? (
                <button type="button" className="rw-pill rw-pill-main tm-go" onClick={() => start(recommended.spec)}>
                  <Play aria-hidden className="size-4" /> Rewind {recommended.title === "Everything" ? "everything" : recommended.title}
                </button>
              ) : null}
              {notice ? (
                <p role="status" className="tm-notice">
                  {notice}
                </p>
              ) : null}
            </div>

            {options.length === 0 ? (
              <div className="tm-empty">
                <p>Your archive has nothing to rewind yet. Add entries and they will appear here on the day you added them.</p>
                <Link href="/collections" className="rw-pill">
                  Open the archive
                </Link>
              </div>
            ) : (
              <>
                {memories.length ? (
                  <section aria-label="Memories" className="tm-section">
                    <h2 className="tm-section-title">Memories</h2>
                    <div className="tm-tiles">
                      {memories.map((option, i) => (
                        <button key={option.id} type="button" className="tm-tile" style={{ "--i": i } as CSSProperties} onClick={() => start(option.spec)}>
                          <Covers option={option} />
                          <span className="tm-tile-text">
                            <b>{option.title}</b>
                            <span>{option.detail}</span>
                          </span>
                          <span className="tm-tile-play" aria-hidden>
                            <Play className="size-4" />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section aria-label="Rewind a year" className="tm-section">
                  <h2 className="tm-section-title">Rewind a year</h2>
                  <div className="tm-years">
                    {years.map((option) => (
                      <button key={option.id} type="button" className="tm-year" onClick={() => start(option.spec)} aria-label={`${option.title}: ${option.detail}`}>
                        <b>{option.title}</b>
                        <span>{option.detail}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section aria-label="Rewind a date range" className="tm-section">
                  <h2 className="tm-section-title">Rewind a date range</h2>
                  <form
                    className="tm-range"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!rangeCount) return;
                      const label = `${formatDay(from, { month: "short", day: "numeric", year: "numeric" })} – ${formatDay(to, { month: "short", day: "numeric", year: "numeric" })}`;
                      start({ kind: "range", from, to, label });
                    }}
                  >
                    <label>
                      From
                      <input type="date" value={from} min={first} max={index.today} required onChange={(event) => setFrom(event.target.value)} />
                    </label>
                    <label>
                      To
                      <input type="date" value={to} min={first} max={index.today} required onChange={(event) => setTo(event.target.value)} />
                    </label>
                    <button type="submit" className="rw-pill rw-pill-main" disabled={!rangeCount}>
                      <Rewind aria-hidden className="size-4" /> Rewind
                    </button>
                    <span className="tm-range-count" aria-live="polite">
                      {from > to ? "The start must come before the end." : rangeCount ? `${rangeCount.toLocaleString("en")} ${rangeCount === 1 ? "entry" : "entries"} added in this range` : "Nothing was added in this range."}
                    </span>
                  </form>
                </section>
              </>
            )}
            <p className="tm-foot">Your own archive only. Space pauses, arrow keys skip chapters, Esc leaves.</p>
          </div>
        </div>
      )}
    </div>
  );
}
