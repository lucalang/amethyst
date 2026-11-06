"use client";

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { MediaImage } from "@/components/media/media-image";
import { cn } from "@/lib/utils";
import type { FilmEngine } from "./collection-film-scene";
import { FILM, lastSegment, sampleSlides, seek, segmentLength, tick, type Director, type FilmSlide } from "./collection-film-timeline";
import { useMotionLevel, webglAvailable } from "./motion";
import { overlayHost } from "./showcase-provider";
import "./collection-film.css";

const SAMPLE = 28;
const IDLE_MS = 2800;

const ease = (x: number) => {
  const k = Math.min(1, Math.max(0, x));
  return k * k * (3 - 2 * k);
};

/** Opacity of the opening title, entry caption and finale card for the current moment. */
function overlayLevels(director: Director, cinematic: boolean, instant: boolean) {
  const { seg, t, count } = director;
  if (instant) return { intro: seg === 0 ? 1 : 0, caption: seg > 0 && seg <= count ? 1 : 0, finale: seg > count ? 1 : 0 };
  if (!cinematic) {
    const fade = ease(t / 0.35);
    return { intro: seg === 0 ? fade : 0, caption: seg > 0 && seg <= count ? fade : 0, finale: seg > count ? fade : 0 };
  }
  return {
    intro: seg === 0 ? ease((t - 0.6) / 1.1) * (1 - ease((t - 4.5) / 0.8)) : 0,
    caption: seg > 0 && seg <= count ? ease((t - FILM.transition + 0.5) / 0.8) : 0,
    finale: seg > count ? ease((t - 2.6) / 1.2) : 0,
  };
}

/** How far a just-entered segment plays while paused, so stepping still shows its arrival. */
function settleTime(director: Director, cinematic: boolean) {
  if (!cinematic) return 0.35;
  if (director.seg === 0) return 2;
  return director.seg > director.count ? 4 : Math.min(FILM.entry - 0.05, FILM.transition + 1.4);
}

function Cover({ slide, sizes, className }: { slide: FilmSlide; sizes: string; className?: string }) {
  return (
    <div className={cn("cf-cover", className)} data-square={slide.square || undefined}>
      {slide.coverUrl ? (
        <MediaImage src={slide.coverUrl} alt="" sizes={sizes} fallbackLabel={slide.title} />
      ) : (
        <div className="cf-title-card">
          <span aria-hidden>{Array.from(slide.title.trim())[0]?.toUpperCase() ?? "?"}</span>
          <p>{slide.title}</p>
        </div>
      )}
    </div>
  );
}

export default function CollectionFilmPlayer({
  name,
  description,
  accent,
  icon,
  slides,
  onClose,
}: {
  name: string;
  description: string | null;
  accent: string | null;
  icon: ReactNode;
  slides: FilmSlide[];
  onClose: () => void;
}) {
  const motion = useMotionLevel();
  const count = slides.length;
  const sample = useMemo(() => sampleSlides(slides, SAMPLE), [slides]);
  const [mode, setMode] = useState<"film" | "still">(() => (motion !== "off" && webglAvailable() ? "film" : "still"));
  const still = mode === "still";
  // Motion "off" (or reduced motion) never autoplays and shows no transitions.
  const calm = motion === "off";
  const director = useRef<Director>({ seg: 0, t: 0, playing: !still, count });
  const [seg, setSeg] = useState(0);
  const [playing, setPlaying] = useState(!still);
  const [idle, setIdle] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engine = useRef<FilmEngine | null>(null);
  const idleTimer = useRef(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const headingId = useId();
  const last = count + 1;
  const ended = seg === last && !playing;

  function sync() {
    setSeg(director.current.seg);
    setPlaying(director.current.playing);
  }

  function goTo(target: number) {
    seek(director.current, target);
    sync();
  }

  function togglePlay() {
    const d = director.current;
    if (!d.playing && d.seg === lastSegment(d)) {
      seek(d, 0);
      d.playing = true;
    } else d.playing = !d.playing;
    sync();
  }

  function replay() {
    seek(director.current, 0);
    director.current.playing = true;
    sync();
  }

  // The 3D film; any failure (no context, lost context) drops to the still presentation.
  useEffect(() => {
    if (mode !== "film" || !stageRef.current) return;
    const host = stageRef.current;
    let cancelled = false;
    import("./collection-film-scene")
      .then(({ createFilm }) => {
        if (cancelled) return;
        try {
          engine.current = createFilm(host, {
            slides,
            sample,
            motion: motion === "full" ? "full" : "subtle",
            accent,
            onLost: () => setMode("still"),
          });
        } catch {
          setMode("still");
        }
      })
      .catch(() => {
        if (!cancelled) setMode("still");
      });
    return () => {
      cancelled = true;
      engine.current?.dispose();
      engine.current = null;
    };
    // Built once per mode; the slides are a snapshot taken when the showcase opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const onFrame = useEffectEvent((dt: number) => {
    const d = director.current;
    const cinematic = !still && !calm;
    if (tick(d, dt, settleTime(d, cinematic))) sync();
    engine.current?.frame(d, dt);
    const root = rootRef.current;
    if (!root) return;
    const levels = overlayLevels(d, cinematic, still && calm);
    root.style.setProperty("--cf-intro", levels.intro.toFixed(3));
    root.style.setProperty("--cf-caption", levels.caption.toFixed(3));
    root.style.setProperty("--cf-finale", levels.finale.toFixed(3));
    const progress = (d.seg + Math.min(1, d.t / segmentLength(d))) / (d.count + 2);
    root.style.setProperty("--cf-progress", progress.toFixed(4));
  });

  useEffect(() => {
    let frame = 0;
    let previous: number | null = null;
    const loop = (now: number) => {
      const dt = previous === null ? 0 : Math.min(0.1, (now - previous) / 1000);
      previous = now;
      onFrame(dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Modal behaviour: the rest of the shell is inert, the page does not scroll, Escape closes.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    const onControl = Boolean(target?.closest("button, a, [role='slider']"));
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "Escape") onClose();
    else if ((key === " " && !onControl) || key === "k") togglePlay();
    else if (key === "ArrowRight" || key === "l") goTo(director.current.seg + 1);
    else if (key === "ArrowLeft" || key === "j") goTo(director.current.seg - 1);
    else if (key === "Home") goTo(0);
    else if (key === "End") goTo(last);
    else return;
    event.preventDefault();
    wake();
  });

  useEffect(() => {
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    const madeInert: HTMLElement[] = [];
    for (const child of Array.from(overlayHost().children)) {
      if (child instanceof HTMLElement && !child.hasAttribute("data-immersive") && !child.inert) {
        child.inert = true;
        madeInert.push(child);
      }
    }
    rootRef.current?.focus({ preventScroll: true });
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener);
    return () => {
      root.style.overflow = overflow;
      for (const element of madeInert) element.inert = false;
      window.removeEventListener("keydown", listener);
      window.clearTimeout(idleTimer.current);
    };
  }, []);

  // Controls fade out while the film plays untouched (they stay while anything inside has focus).
  function wake() {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }

  function onSliderKey(event: ReactKeyboardEvent) {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[event.key];
    if (step !== undefined) goTo(director.current.seg + step);
    else if (event.key === "Home") goTo(0);
    else if (event.key === "End") goTo(last);
    else return;
    event.preventDefault();
  }

  const entry = seg > 0 && seg <= count ? slides[seg - 1] : null;
  const position = seg === 0 ? "Opening" : entry ? `${seg} / ${count}` : "Finale";
  const announcement = seg === 0 ? `Opening: ${name}` : entry ? `Entry ${seg} of ${count}: ${entry.title}` : "Finale";
  const mosaic = sample.slice(0, 18).map((index) => slides[index]);
  const style = { "--cf-accent": accent ?? undefined } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className="cf"
      style={style}
      data-immersive
      data-mode={mode}
      data-calm={calm || undefined}
      data-idle={(idle && playing) || undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      tabIndex={-1}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <div
        ref={stageRef}
        className="cf-stage"
        onPointerDown={(event) => {
          swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = swipe.current;
          swipe.current = null;
          if (!start || event.pointerType === "mouse") return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) goTo(director.current.seg + (dx < 0 ? 1 : -1));
        }}
        onClick={(event) => {
          if (event.detail > 0 && window.matchMedia("(pointer: fine)").matches) togglePlay();
        }}
      >
        {still ? (
          seg === 0 || seg === last ? (
            <div className="cf-mosaic" aria-hidden>
              {mosaic.map((slide) => (
                <Cover key={slide.id} slide={slide} sizes="160px" />
              ))}
            </div>
          ) : entry ? (
            <div className="cf-still" key={entry.id}>
              {entry.frame === "none" ? (
                <Cover slide={entry} sizes="(min-width: 768px) 45vw, 85vw" className="cf-still-art" />
              ) : (
                <ArtworkFrame frame={entry.frame} className="cf-still-frame" style={{ "--cf-ratio": entry.square ? 1 : 2 / 3 } as CSSProperties}>
                  <Cover slide={entry} sizes="(min-width: 768px) 45vw, 85vw" />
                </ArtworkFrame>
              )}
            </div>
          ) : null
        ) : null}
      </div>
      <div className="cf-shade" aria-hidden />

      <div className="cf-intro" hidden={seg !== 0}>
        <p className="cf-kicker">Collection showcase</p>
        <h2 id={headingId} className="cf-name">
          {name}
        </h2>
        {description ? <p className="cf-description">{description}</p> : null}
        <p className="cf-intro-count">
          {count} {count === 1 ? "entry" : "entries"}
        </p>
      </div>

      {entry ? (
        <div className="cf-caption" key={entry.id}>
          <p className="cf-index">
            <span>{String(seg).padStart(2, "0")}</span> / {count}
          </p>
          <h3 className="cf-title">{entry.title}</h3>
          {entry.meta.length ? (
            <ul className="cf-meta" aria-label="Details">
              {entry.meta.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
          <Link href={entry.href} className="cf-open" onClick={onClose}>
            Open entry <ArrowUpRight aria-hidden />
          </Link>
        </div>
      ) : null}

      {seg === last ? (
        <div className="cf-finale">
          <div className="cf-finale-card">
            <p className="cf-kicker">That was</p>
            <p className="cf-finale-name">{name}</p>
            <p className="cf-finale-count">
              <strong>{count}</strong> {count === 1 ? "entry" : "entries"}, every one of them
            </p>
            <div className="cf-finale-actions">
              <button type="button" className="cf-pill cf-pill-main" onClick={replay}>
                <RotateCcw aria-hidden /> Replay
              </button>
              <button type="button" className="cf-pill" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <header className="cf-top cf-chrome">
        <div className="cf-brand">
          <span className="cf-brand-icon" aria-hidden>
            {icon}
          </span>
          <div className="min-w-0">
            <p className="cf-brand-kicker">Collection showcase</p>
            <p className="cf-brand-name">{name}</p>
          </div>
        </div>
        <button type="button" className="cf-btn" onClick={onClose} aria-label="Close showcase" title="Close (Esc)">
          <X aria-hidden />
        </button>
      </header>

      <div className="cf-bar cf-chrome">
        <button type="button" className="cf-btn" onClick={() => goTo(seg - 1)} disabled={seg === 0} aria-label="Previous" title="Previous (←)">
          <ChevronLeft aria-hidden />
        </button>
        <button
          type="button"
          className="cf-btn cf-btn-main"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : ended ? "Replay" : "Play"}
          title={playing ? "Pause (Space)" : "Play (Space)"}
        >
          {playing ? <Pause aria-hidden /> : ended ? <RotateCcw aria-hidden /> : <Play aria-hidden />}
        </button>
        <button type="button" className="cf-btn" onClick={() => goTo(seg + 1)} disabled={seg === last} aria-label="Next" title="Next (→)">
          <ChevronRight aria-hidden />
        </button>
        <div
          className="cf-track"
          role="slider"
          tabIndex={0}
          aria-label="Showcase position"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={seg}
          aria-valuetext={position === "Opening" || position === "Finale" ? position : `Entry ${seg} of ${count}`}
          onKeyDown={onSliderKey}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            goTo(Math.round(((event.clientX - box.left) / box.width) * (count + 2) - 0.5));
          }}
        >
          <span className="cf-fill" aria-hidden />
        </div>
        <p className="cf-count" aria-hidden>
          {position}
        </p>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
