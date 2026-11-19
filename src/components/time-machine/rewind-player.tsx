"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Library, Pause, Play, RotateCcw, Rewind, Volume2, VolumeX, X } from "lucide-react";
import { collectionPath, entryPath } from "@/lib/collections";
import {
  dayNumber,
  distanceFromToday,
  formatAdded,
  formatDay,
  isoOfNumber,
  sceneDuration,
  type Moment,
  type Scene,
  type Story,
  type TimeCollection,
  type TimeIndex,
} from "@/lib/time-machine";
import { cn } from "@/lib/utils";
import { StoryArt, preloadArt } from "./story-art";
import { TunnelCanvas } from "./tunnel-canvas";
import type { RewindAudio } from "./rewind-audio";
import type { Tunnel } from "./tunnel";

/** Seconds the clock takes to roll to a scene's date (and the tunnel surges). */
const ROLL = 1.5;
const IDLE_MS = 2800;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where cards sit for 1–5 entries: x/y in % of the stage, a tilt and a scale. */
const LAYOUTS: { x: number; y: number; r: number; s: number }[][] = [
  [{ x: 0, y: 0, r: -2, s: 1.25 }],
  [{ x: -16, y: 2, r: -5, s: 1.05 }, { x: 16, y: -2, r: 4, s: 1.05 }],
  [{ x: -27, y: 5, r: -7, s: 0.95 }, { x: 0, y: -4, r: 1, s: 1.08 }, { x: 27, y: 4, r: 6, s: 0.95 }],
  [{ x: -34, y: 6, r: -8, s: 0.86 }, { x: -11.5, y: -5, r: -2, s: 0.96 }, { x: 11.5, y: 4, r: 3, s: 0.96 }, { x: 34, y: -4, r: 8, s: 0.86 }],
  [{ x: -38, y: 7, r: -9, s: 0.78 }, { x: -19, y: -6, r: -4, s: 0.86 }, { x: 0, y: 4, r: 0, s: 0.94 }, { x: 19, y: -6, r: 4, s: 0.86 }, { x: 38, y: 7, r: 9, s: 0.78 }],
];

const shortDate = (iso: string) => formatDay(iso, { day: "numeric", month: "short", year: "numeric" });

type SceneProps = {
  scene: Scene;
  index: TimeIndex;
  zone: string;
  collections: Map<string, TimeCollection>;
  story: Story;
  actions: ReactNode;
};

function Cards({ entries }: { entries: Moment[] }) {
  const layout = LAYOUTS[Math.min(entries.length, 5) - 1] ?? LAYOUTS[0];
  return (
    <div className="rw-cards">
      {entries.slice(0, 5).map((moment, i) => {
        const at = layout[i];
        return (
          <figure
            key={moment.id}
            className="rw-card"
            data-square={moment.square || undefined}
            style={{ "--i": i, "--x": at.x, "--y": at.y, "--r": `${at.r}deg`, "--s": at.s } as CSSProperties}
          >
            <div className="rw-card-in">
              <StoryArt moment={moment} />
              <span className="rw-sweep" aria-hidden />
            </div>
            <figcaption className="rw-tag">{formatDay(moment.day, { day: "numeric", month: "short" })}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function SceneView({ scene, index, zone, collections, story, actions }: SceneProps) {
  switch (scene.kind) {
    case "title":
      return (
        <div className="rw-title">
          <p className="rw-eyebrow">{scene.eyebrow}</p>
          <h2 className="rw-display">
            {scene.title.split(" ").map((word, i) => (
              <span key={i} style={{ "--w": i } as CSSProperties}>
                {word}
              </span>
            ))}
          </h2>
          <p className="rw-subtitle">{scene.subtitle}</p>
          <p className="rw-note">{scene.note}</p>
          <p className="rw-hint">
            <Rewind aria-hidden className="size-4" /> Starting today, travelling back
          </p>
        </div>
      );
    case "entries":
      return (
        <div className="rw-entries" data-count={Math.min(scene.entries.length, 5)}>
          <p className="rw-bgword" aria-hidden>
            {scene.date ? scene.date.slice(0, 4) : ""}
          </p>
          <div className="rw-heading">
            <h2 className="rw-label">{scene.label}</h2>
            <p className="rw-eyebrow">{scene.sub}</p>
          </div>
          <Cards entries={scene.entries} />
          <ul className="rw-captions">
            {scene.entries.slice(0, 5).map((moment, i) => (
              <li key={moment.id} style={{ "--i": i } as CSSProperties}>
                <b>{moment.title}</b>
                <span>
                  Added {formatAdded(moment.at, zone)}
                  {collections.get(moment.collectionId) ? ` · ${collections.get(moment.collectionId)!.name}` : ""}
                </span>
              </li>
            ))}
            {scene.more ? <li className="rw-more">and {scene.more.toLocaleString("en")} more</li> : null}
          </ul>
        </div>
      );
    case "fact": {
      const top = scene.bars ? Math.max(...scene.bars.map((bar) => bar.value)) : 0;
      return (
        <div className="rw-fact">
          <p className="rw-eyebrow">{scene.eyebrow}</p>
          <p className="rw-big">
            <span>{scene.big}</span>
            {scene.unit ? <small>{scene.unit}</small> : null}
          </p>
          <p className="rw-fact-text">{scene.text}</p>
          {scene.bars ? (
            <div className="rw-bars" aria-hidden>
              {scene.bars.map((bar, i) => (
                <span key={`${bar.label}-${i}`} className={cn(bar.peak && "is-peak")} style={{ "--h": bar.value / top, "--i": i } as CSSProperties}>
                  <i />
                  <em>{bar.label}</em>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    }
    case "collection":
      return (
        <div className="rw-collection" style={scene.collection.accent ? ({ "--rw-c": scene.collection.accent } as CSSProperties) : undefined}>
          <p className="rw-bgword" aria-hidden>
            {scene.date.slice(0, 4)}
          </p>
          <div className="rw-collection-copy">
            <p className="rw-eyebrow">A new collection began</p>
            <h2 className="rw-label">{scene.collection.name}</h2>
            <p className="rw-fact-text">
              Created {formatDay(scene.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              <br />
              {scene.count.toLocaleString("en")} {scene.count === 1 ? "entry" : "entries"} in it today
            </p>
          </div>
          {scene.first ? (
            <div className="rw-collection-first">
              <Cards entries={[scene.first]} />
              <p className="rw-caption-solo">
                Its first entry: <b>{scene.first.title}</b>
                <span>Added {formatAdded(scene.first.at, zone)}</span>
              </p>
            </div>
          ) : null}
        </div>
      );
    case "end":
      return (
        <div className="rw-end">
          <p className="rw-eyebrow">Back in the present</p>
          <h2 className="rw-display">
            <span style={{ "--w": 0 } as CSSProperties}>Welcome</span> <span style={{ "--w": 1 } as CSSProperties}>back</span>
          </h2>
          <p className="rw-subtitle">{formatDay(index.today, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <ul className="rw-summary">
            {scene.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {actions}
          {story.featured.entries.length || story.featured.collections.length ? (
            <section className="rw-featured" aria-label="From this rewind">
              <h3>From this rewind</h3>
              <ul>
                {story.featured.entries.map((moment) => (
                  <li key={moment.id}>
                    <Link href={entryPath(moment)} className="rw-feat" title={`Open ${moment.title}`}>
                      <span className="rw-feat-art" data-square={moment.square || undefined}>
                        <StoryArt moment={moment} />
                      </span>
                      <span className="rw-feat-text">
                        <b>{moment.title}</b>
                        <span>Added {shortDate(moment.day)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {story.featured.collections.length ? (
                <div className="rw-feat-collections">
                  {story.featured.collections.map((collection) => (
                    <Link key={collection.id} href={collectionPath(collection)} className="rw-chip">
                      {collection.name} <ArrowUpRight aria-hidden className="size-3.5" />
                    </Link>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      );
  }
}

/** The images a scene shows, for preloading. */
const artOf = (scene: Scene | undefined): Moment[] => (!scene ? [] : scene.kind === "entries" ? scene.entries : scene.kind === "collection" && scene.first ? [scene.first] : []);

/**
 * Plays a Story: one scene at a time, with the clock rolling back to each scene's date while the tunnel surges.
 * Scene motion is CSS; the clock and tunnel are driven from one animation loop without re-rendering React.
 * Pausing freezes all of it. Scenes crossfade through depth: the one
 * leaving keeps its own element (so it leaves from exactly where it is) and flies past the camera while the next one
 * rises out of the tunnel; it is removed only when its exit animation has actually ended.
 */
export function RewindPlayer({
  story,
  index,
  zone,
  collections,
  calm,
  audio,
  muted,
  onMute,
  onExit,
  onChooseAnother,
}: {
  story: Story;
  index: TimeIndex;
  zone: string;
  collections: Map<string, TimeCollection>;
  calm: boolean;
  /** The rewind's sound (null when the browser has no Web Audio). */
  audio: RewindAudio | null;
  muted: boolean;
  onMute: () => void;
  onExit: () => void;
  onChooseAnother: () => void;
}) {
  const scenes = story.scenes;
  const last = scenes.length - 1;
  const [at, setAt] = useState(0);
  const [round, setRound] = useState(0);
  const [playing, setPlaying] = useState(!calm);
  /** Mounted scenes, oldest first: the last is the current one, any before it are leaving. Order never changes. */
  const [stack, setStack] = useState<{ key: string; at: number }[]>([{ key: "0-0", at: 0 }]);
  const [idle, setIdle] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const clockDate = useRef<HTMLParagraphElement>(null);
  const clockAgo = useRef<HTMLParagraphElement>(null);
  const tunnel = useRef<Tunnel | null>(null);
  const elapsed = useRef(0);
  const roll = useRef({ from: dayNumber(index.today), to: dayNumber(index.today), surge: true });
  const idleTimer = useRef(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const scene = scenes[at];
  const ended = at === last;

  const paintClock = useCallback(
    (value: number) => {
      const iso = isoOfNumber(Math.round(value));
      if (clockDate.current) clockDate.current.textContent = formatDay(iso, { day: "numeric", month: "short", year: "numeric" });
      if (clockAgo.current) clockAgo.current.textContent = distanceFromToday(index, iso);
    },
    [index],
  );

  /** The sound of arriving at a scene, timed to its animation (the visuals carry the same cues when muted). */
  function cue(next: Scene, chapter: number, moved: boolean) {
    if (!audio) return;
    if (next.kind === "title") audio.title();
    else if (next.kind === "end") audio.home(ROLL);
    else if (moved) audio.travel(ROLL, chapter);
    else audio.arrive(chapter);
    if (calm) return;
    if (next.kind === "entries") next.entries.slice(0, 5).forEach((_, i) => audio.reveal(i, (moved ? ROLL * 0.4 : 0) + 0.5 + i * 0.26 + 0.55));
    else if (next.kind === "collection" && next.first) audio.reveal(2, 1.05);
    else if (next.kind === "fact") audio.fact(0.4);
  }

  /** Enters scene `next`: the current one starts leaving, the clock aims at the new date. */
  const goTo = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(last, next));
      if (target === at) return;
      // With motion off nothing animates out, so the old scene goes at once.
      const key = `${round}-${target}-${Date.now()}`;
      setStack((previous) => (calm ? [{ key, at: target }] : [...previous.slice(-2), { key, at: target }]));
      const nextScene = scenes[target];
      const from = roll.current.to;
      const to = nextScene.date ? dayNumber(nextScene.date) : from;
      roll.current = { from, to, surge: to !== from || nextScene.kind === "title" };
      elapsed.current = 0;
      if (calm) paintClock(to);
      tunnel.current?.setDirection(nextScene.kind === "end" ? -1 : 1);
      cue(nextScene, target, to !== from);
      setAt(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cue only reads the audio prop
    [at, calm, last, paintClock, round, scenes],
  );

  const replay = useCallback(() => {
    setStack([{ key: `${round + 1}-0`, at: 0 }]);
    roll.current = { from: dayNumber(index.today), to: dayNumber(index.today), surge: true };
    elapsed.current = 0;
    paintClock(dayNumber(index.today));
    tunnel.current?.setDirection(1);
    setRound((n) => n + 1);
    setAt(0);
    setPlaying(!calm);
    cue(scenes[0], 0, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cue only reads the audio prop
  }, [calm, index.today, paintClock, scenes]);

  const toggle = useCallback(() => {
    if (ended) {
      replay();
      return;
    }
    setPlaying((value) => !value);
  }, [ended, replay]);

  // One loop drives the clock roll, the tunnel speed and scene timing.
  const state = useRef({ at, playing, goTo, scene, last });
  useEffect(() => {
    state.current = { at, playing, goTo, scene, last };
  });
  useEffect(() => {
    paintClock(roll.current.to);
    if (calm) return;
    let raf = 0;
    let previous = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      const current = state.current;
      if (current.playing) {
        elapsed.current += dt;
        const p = Math.min(1, elapsed.current / ROLL);
        const { from, to, surge } = roll.current;
        paintClock(from + (to - from) * ease(p));
        tunnel.current?.setSpeed(surge && p < 1 ? 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, p * 1.15)) : current.scene.kind === "end" ? 0.08 : 0.14);
        if (current.at < current.last && elapsed.current >= sceneDuration(current.scene)) current.goTo(current.at + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [calm, paintClock]);

  // Preload the next two scenes' artwork.
  useEffect(() => {
    preloadArt([...artOf(scenes[at + 1]), ...artOf(scenes[at + 2])]);
  }, [at, scenes]);

  // The sound bed breathes only while the rewind plays.
  useEffect(() => {
    // Reduced motion steps through by hand: chapter sounds still play, the bed stays off.
    audio?.setPaused(!playing && !calm);
    audio?.setBed(playing && !calm);
  }, [audio, playing, calm]);
  useEffect(() => () => audio?.setBed(false), [audio]);

  // A hidden tab pauses (the CSS and the clock stay in step).
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
    cue(scenes[0], 0, false);
    return () => {
      window.clearTimeout(idleTimer.current);
    };
    // Entering plays once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const keys = useRef({ toggle, goTo, at, onExit, replay, onMute });
  useEffect(() => {
    keys.current = { toggle, goTo, at, onExit, replay, onMute };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const onControl = Boolean((event.target as HTMLElement | null)?.closest("button, a, input"));
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const k = keys.current;
      if (key === "Escape") k.onExit();
      else if ((key === " " && !onControl) || key === "k") k.toggle();
      else if (key === "ArrowRight" || key === "l") k.goTo(k.at + 1);
      else if (key === "ArrowLeft" || key === "j") k.goTo(k.at - 1);
      else if (key === "r" || key === "Home") k.replay();
      else if (key === "m") k.onMute();
      else return;
      event.preventDefault();
      wake();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  function wake() {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }

  const actions = (
    <div className="rw-actions">
      <button type="button" className="rw-pill rw-pill-main" onClick={replay}>
        <RotateCcw aria-hidden className="size-4" /> Replay
      </button>
      <button type="button" className="rw-pill" onClick={onChooseAnother}>
        <Rewind aria-hidden className="size-4" /> Choose another rewind
      </button>
      <button type="button" className="rw-pill" onClick={onExit}>
        Done
      </button>
    </div>
  );
  const label = scene.kind === "entries" ? scene.label : scene.kind === "collection" ? scene.collection.name : scene.kind === "fact" ? scene.eyebrow : scene.kind === "end" ? "Back to today" : story.title;
  const sceneProps = { index, zone, collections, story, actions };

  return (
    <div
      ref={rootRef}
      className={cn("rw-player", !playing && "is-paused", calm && "is-calm", idle && playing && !ended && "is-idle")}
      role="region"
      aria-roledescription="rewind"
      aria-label={`Rewind of ${story.scope ?? "your whole archive"}: ${story.title}`}
      tabIndex={-1}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <TunnelCanvas apiRef={tunnel} running={playing} calm={calm} />
      <div className="rw-vignette" aria-hidden />

      <div
        className="rw-stage"
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || (event.target as HTMLElement).closest("a, button")) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (event.pointerType !== "mouse" && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(at + (dx < 0 ? 1 : -1));
          else if (Math.hypot(dx, dy) < 8 && !ended) toggle();
        }}
      >
        {stack.map((item, i) => {
          const leaving = i < stack.length - 1;
          const shown = scenes[item.at];
          return (
            <section
              key={item.key}
              className={cn("rw-scene", `rw-k-${shown.kind}`, leaving && "is-leaving")}
              style={{ "--dur": shown.kind === "end" ? 999 : sceneDuration(shown) } as CSSProperties}
              aria-label={leaving ? undefined : label}
              aria-hidden={leaving || undefined}
              inert={leaving}
              onAnimationEnd={(event) => {
                if (leaving && event.target === event.currentTarget && event.animationName === "rw-exit") setStack((previous) => previous.filter((entry) => entry.key !== item.key));
              }}
            >
              <SceneView scene={shown} {...sceneProps} />
            </section>
          );
        })}
      </div>

      <div className="rw-clock" aria-hidden>
        <p className="rw-clock-date" ref={clockDate} />
        <p className="rw-clock-ago" ref={clockAgo} />
      </div>

      <header className="rw-top rw-chrome">
        <div className="rw-segments" role="group" aria-label="Chapters">
          {scenes.map((item, i) => (
            <button
              key={`${round}-${item.id}`}
              type="button"
              className={cn("rw-seg", i < at && "is-done", i === at && "is-now")}
              style={i === at ? ({ "--dur": item.kind === "end" ? 0.01 : sceneDuration(item) } as CSSProperties) : undefined}
              aria-label={`Chapter ${i + 1} of ${scenes.length}`}
              aria-current={i === at ? "step" : undefined}
              onClick={() => goTo(i)}
            >
              <i key={i === at ? `${round}-${at}` : undefined} />
            </button>
          ))}
        </div>
        <div className="rw-top-row">
          <div className="min-w-0">
            <p className="rw-kicker">
              <span className="rw-scope" data-collection={story.scope ? "" : undefined}>
                <Library aria-hidden className="size-3" />
                {story.scope ?? "All archive"}
              </span>
              Chapter {at + 1} of {scenes.length}
            </p>
            <p className="rw-chapter">{label}</p>
          </div>
          <div className="flex items-center gap-2">
            {audio ? (
              <button type="button" className="rw-btn" onClick={onMute} aria-pressed={muted} aria-label={muted ? "Turn sound on" : "Mute"} title={muted ? "Sound off (M)" : "Sound on (M)"}>
                {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
              </button>
            ) : null}
            <button type="button" className="rw-btn" onClick={onExit} aria-label="Exit rewind" title="Exit (Esc)">
              <X aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <div className="rw-bar rw-chrome">
        <button type="button" className="rw-btn" onClick={() => goTo(at - 1)} disabled={at === 0} aria-label="Previous chapter" title="Previous chapter (←)">
          <ChevronLeft aria-hidden />
        </button>
        <button type="button" className="rw-btn rw-btn-main" onClick={toggle} aria-label={ended ? "Replay" : playing ? "Pause" : "Play"} title={ended ? "Replay (R)" : playing ? "Pause (Space)" : "Play (Space)"}>
          {ended ? <RotateCcw aria-hidden /> : playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </button>
        <button type="button" className="rw-btn" onClick={() => goTo(at + 1)} disabled={ended} aria-label="Skip chapter" title="Skip chapter (→)">
          <ChevronRight aria-hidden />
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {`Chapter ${at + 1} of ${scenes.length}: ${label}${scene.date ? `, ${formatDay(scene.date, { day: "numeric", month: "long", year: "numeric" })}` : ""}`}
      </p>
    </div>
  );
}
