"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Hourglass, Library, LibraryBig, Play, Rewind, Volume2, VolumeX, X } from "lucide-react";
import { useSettings } from "@/components/layout/settings-context";
import { useMotionLevel } from "@/components/showcase/motion";
import {
  buildIndex,
  buildOptions,
  buildStory,
  formatDay,
  momentsBetween,
  type Moment,
  type RewindOption,
  type RewindSpec,
  type Story,
  type TimeCollection,
  type TimeEntry,
} from "@/lib/time-machine";
import { createRewindAudio, type RewindAudio } from "./rewind-audio";
import { RewindPlayer } from "./rewind-player";
import { StoryArt } from "./story-art";
import { TunnelCanvas } from "./tunnel-canvas";
import type { Tunnel } from "./tunnel";
import "./time-machine.css";

/** What a rewind covers: the whole archive, or one collection and nothing else. */
type Scope = { kind: "all" } | { kind: "collection"; id: string };

function CoverFan({ covers }: { covers: Moment[] }) {
  return (
    <span className="tm-covers" aria-hidden>
      {covers.map((moment, i) => (
        <span key={moment.id} className="tm-cover" data-square={moment.square || undefined} style={{ "--i": i } as CSSProperties}>
          <StoryArt moment={moment} />
        </span>
      ))}
    </span>
  );
}

const latestCovers = (entries: TimeEntry[]) =>
  [...entries]
    .filter((entry) => entry.coverUrl)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 3)
    .map((entry) => ({ ...entry, at: 0, day: "" }) as Moment);

/** "Mar 2024": the month a collection's first entry was added, in the account's zone. */
function sinceLabel(createdAt: string, zone: string) {
  try {
    return new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: zone || undefined }).format(new Date(createdAt));
  } catch {
    return createdAt.slice(0, 7);
  }
}

/**
 * Amethyst Time Machine. First choose what to rewind (the whole archive or one collection), then which rewind;
 * the player tells it from today back through the past and returns to the present. A collection rewind is built
 * from that collection's entries alone, so nothing from elsewhere can appear in it.
 */
export default function TimeMachine({ entries, collections }: { entries: TimeEntry[]; collections: TimeCollection[] }) {
  const router = useRouter();
  const { timeZone: zone, arcadeSound } = useSettings();
  const motion = useMotionLevel();
  const calm = motion === "off";
  const [scope, setScope] = useState<Scope | null>(null);
  const [story, setStory] = useState<Story | null>(null);
  const [round, setRound] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // Sound follows the Sound effects setting; the mute button overrides it for this visit only.
  const [muted, setMuted] = useState(!arcadeSound);
  const audioRef = useRef<RewindAudio | null>(null);
  const [audio, setAudio] = useState<RewindAudio | null>(null);
  const tunnel = useRef<Tunnel | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const scopedCollection = scope?.kind === "collection" ? (collections.find((collection) => collection.id === scope.id) ?? null) : null;
  const scopeName = scopedCollection?.name ?? null;
  const scopedEntries = useMemo(() => (scope?.kind === "collection" ? entries.filter((entry) => entry.collectionId === scope.id) : entries), [entries, scope]);
  const scopedCollections = useMemo(() => (scopedCollection ? [scopedCollection] : collections), [collections, scopedCollection]);
  const index = useMemo(() => buildIndex(scopedEntries, zone), [scopedEntries, zone]);
  const options = useMemo(() => buildOptions(index, scopeName), [index, scopeName]);
  const collectionById = useMemo(() => new Map(collections.map((collection) => [collection.id, collection])), [collections]);
  const perCollection = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of entries) map.set(entry.collectionId, [...(map.get(entry.collectionId) ?? []), entry]);
    return map;
  }, [entries]);

  const first = index.days[0] ?? index.today;
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const from = range?.from ?? index.days[Math.max(0, index.days.length - 30)] ?? index.today;
  const to = range?.to ?? index.today;
  const rangeCount = useMemo(() => (from <= to ? momentsBetween(index, from, to).length : 0), [index, from, to]);

  const memories = options.filter((option) => option.group !== "year");
  const years = options.filter((option) => option.group === "year");
  const recommended = memories[0] ?? years[0] ?? null;

  function chooseScope(next: Scope) {
    setScope(next);
    setRange(null);
    setNotice(null);
  }

  /** Called from a click, so the sound can start (browsers only allow audio after a user action). */
  function start(spec: RewindSpec) {
    const built = buildStory(index, scopedCollections, spec, zone, scopeName);
    if (!built) {
      setNotice("There is nothing to rewind through for that choice.");
      return;
    }
    let sound = audioRef.current;
    if (!sound) {
      sound = createRewindAudio();
      audioRef.current = sound;
      setAudio(sound);
    }
    sound?.setMuted(muted);
    sound?.resume();
    setNotice(null);
    setRound((n) => n + 1);
    setStory(built);
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
    audioRef.current?.resume();
  }

  // Full screen: the page behind doesn't scroll. Leaving closes the audio.
  useEffect(() => {
    const html = document.documentElement;
    const overflow = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = overflow;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (story) return;
    rootRef.current?.focus({ preventScroll: true });
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (scope) setScope(null);
      else router.push("/collections");
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [story, scope, router]);

  const withEntries = collections.filter((collection) => perCollection.get(collection.id)?.length);
  const withoutEntries = collections.filter((collection) => !perCollection.get(collection.id)?.length);

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
          audio={audio}
          muted={muted}
          onMute={toggleMute}
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
              <div className="flex items-center gap-2">
                <button type="button" className="rw-btn" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? "Turn sound on" : "Mute"} title={muted ? "Sound is off" : "Sound is on"}>
                  {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
                </button>
                <Link href="/collections" className="rw-btn" aria-label="Leave the Time Machine" title="Leave (Esc)">
                  <X aria-hidden />
                </Link>
              </div>
            </header>

            {!scope ? (
              <>
                <div className="tm-intro">
                  <h1 id="tm-heading" className="tm-hero">
                    What do you want
                    <br />
                    to rewind?
                  </h1>
                  <p className="tm-lede">The Time Machine starts today and travels back through what you added. Every date is the day an entry was added.</p>
                </div>
                {entries.length === 0 ? (
                  <div className="tm-empty">
                    <p>Your archive has nothing to rewind yet. Add entries and they will appear here on the day you added them.</p>
                    <Link href="/collections" className="rw-pill">
                      Open the archive
                    </Link>
                  </div>
                ) : (
                  <>
                    <section aria-label="All archive" className="tm-section">
                      <button type="button" className="tm-tile tm-scope-all" onClick={() => chooseScope({ kind: "all" })}>
                        <CoverFan covers={latestCovers(entries)} />
                        <span className="tm-tile-text">
                          <b>
                            <LibraryBig aria-hidden className="mr-2 inline size-5 align-[-3px]" />
                            All archive
                          </b>
                          <span>
                            {entries.length.toLocaleString("en")} {entries.length === 1 ? "entry" : "entries"} across {collections.length} {collections.length === 1 ? "collection" : "collections"}
                          </span>
                        </span>
                        <span className="tm-tile-play" aria-hidden>
                          <Play className="size-4" />
                        </span>
                      </button>
                    </section>
                    <section aria-label="A specific collection" className="tm-section">
                      <h2 className="tm-section-title">Or a specific collection</h2>
                      <div className="tm-tiles tm-tiles-small">
                        {withEntries.map((collection, i) => {
                          const list = perCollection.get(collection.id)!;
                          return (
                            <button
                              key={collection.id}
                              type="button"
                              className="tm-tile tm-tile-small"
                              style={{ "--i": i, ...(collection.accent ? { "--tm-c": collection.accent } : {}) } as CSSProperties}
                              onClick={() => chooseScope({ kind: "collection", id: collection.id })}
                            >
                              <CoverFan covers={latestCovers(list)} />
                              <span className="tm-tile-text">
                                <b>{collection.name}</b>
                                <span>
                                  {list.length.toLocaleString("en")} {list.length === 1 ? "entry" : "entries"} · since {sinceLabel(list.reduce((a, b) => (b.createdAt < a.createdAt ? b : a)).createdAt, zone)}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {withoutEntries.length ? <p className="tm-foot">Not shown, no entries yet: {withoutEntries.map((collection) => collection.name).join(", ")}</p> : null}
                    </section>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="tm-intro">
                  <p className="tm-scope-line">
                    <span className="rw-scope" data-collection={scopeName ? "" : undefined}>
                      <Library aria-hidden className="size-3.5" />
                      {scopeName ? `Collection: ${scopeName}` : "All archive"}
                    </span>
                    <button type="button" className="tm-change" onClick={() => setScope(null)}>
                      <ArrowLeft aria-hidden className="size-3.5" /> Choose something else
                    </button>
                  </p>
                  <h1 id="tm-heading" className="tm-hero">
                    Where do you want
                    <br />
                    to rewind to?
                  </h1>
                  <p className="tm-lede">
                    {scopeName ? `Only entries from ${scopeName} appear in this rewind, with the day each was added.` : "Every collection is included, with the day each entry was added."}
                  </p>
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
                    <p>{scopeName ? `${scopeName} has nothing to rewind yet.` : "Your archive has nothing to rewind yet."}</p>
                    <button type="button" className="rw-pill" onClick={() => setScope(null)}>
                      Choose something else
                    </button>
                  </div>
                ) : (
                  <>
                    {memories.length ? (
                      <section aria-label="Memories" className="tm-section">
                        <h2 className="tm-section-title">Memories</h2>
                        <div className="tm-tiles">
                          {memories.map((option: RewindOption, i) => (
                            <button key={option.id} type="button" className="tm-tile" style={{ "--i": i } as CSSProperties} onClick={() => start(option.spec)}>
                              <CoverFan covers={option.covers} />
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
                          <input type="date" value={from} min={first} max={index.today} required onChange={(event) => setRange({ from: event.target.value, to })} />
                        </label>
                        <label>
                          To
                          <input type="date" value={to} min={first} max={index.today} required onChange={(event) => setRange({ from, to: event.target.value })} />
                        </label>
                        <button type="submit" className="rw-pill rw-pill-main" disabled={!rangeCount}>
                          <Rewind aria-hidden className="size-4" /> Rewind
                        </button>
                        <span className="tm-range-count" aria-live="polite">
                          {from > to
                            ? "The start must come before the end."
                            : rangeCount
                              ? `${rangeCount.toLocaleString("en")} ${rangeCount === 1 ? "entry" : "entries"} added in this range${scopeName ? ` to ${scopeName}` : ""}`
                              : "Nothing was added in this range."}
                        </span>
                      </form>
                    </section>
                  </>
                )}
              </>
            )}
            <p className="tm-foot">Your own archive only. Space pauses, arrow keys skip chapters, M mutes, Esc goes back.</p>
          </div>
        </div>
      )}
    </div>
  );
}
