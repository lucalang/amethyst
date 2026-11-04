"use client";

import "./tour.css";
import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type ComponentType, type CSSProperties, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowRight,
  Bird,
  Cherry,
  Coins,
  Flame,
  FlaskConical,
  Gamepad2,
  Gem,
  Grid2x2,
  Hash,
  Layers,
  ListChecks,
  Palette,
  Trophy,
  Vault,
  Worm,
} from "lucide-react";
import { BrandMark } from "@/components/layout/top-nav";
import type { MotionLevel } from "@/lib/preferences";
import { TOUR_CHAPTERS, type TourChapterId } from "./chapters";
import { buildTimeline, copyStage, locate, sectionFrames } from "./timeline";
import type { TourScene } from "./tour-scene";

type SceneState = "loading" | "ready" | "fallback";

const REDUCED = "(prefers-reduced-motion: reduce)";
const TIMELINE = buildTimeline(TOUR_CHAPTERS.map((chapter) => chapter.span ?? 2.3));
const FRAMES = sectionFrames(TIMELINE);
const LAST = TOUR_CHAPTERS.length - 1;

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const pad = (n: number) => String(n).padStart(2, "0");

function GemArt() {
  return (
    <svg viewBox="0 0 200 220" className="tour-gem-art">
      <defs>
        <linearGradient id="tour-gem-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d9c6ff" />
          <stop offset="0.5" stopColor="#a57cff" />
          <stop offset="1" stopColor="#3b1785" />
        </linearGradient>
        <linearGradient id="tour-gem-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f472a8" />
          <stop offset="1" stopColor="#4a1c9c" />
        </linearGradient>
      </defs>
      <polygon points="62,40 138,40 182,86 100,206 18,86" fill="url(#tour-gem-a)" />
      <polygon points="62,40 100,86 18,86" fill="#ffffff" opacity="0.22" />
      <polygon points="138,40 182,86 100,86" fill="url(#tour-gem-b)" opacity="0.7" />
      <polygon points="62,40 138,40 100,86" fill="#ffffff" opacity="0.35" />
      <polygon points="18,86 100,86 100,206" fill="#2a0f5c" opacity="0.35" />
      <polygon points="100,86 182,86 100,206" fill="#12051f" opacity="0.45" />
      <polyline points="62,40 138,40 182,86 100,206 18,86 62,40" fill="none" stroke="#efe6ff" strokeOpacity="0.5" strokeWidth="1.2" />
    </svg>
  );
}

function CoverFanArt() {
  return (
    <div className="tour-fan-art">
      {["#a57cff,#2a0f5c", "#f472a8,#3d0a2a", "#4fd6ec,#071a33", "#ffb547,#2b1205", "#bd9bff,#1a1033"].map((pair, index) => (
        <span key={pair} style={{ "--i": index - 2, "--cover": `linear-gradient(170deg, ${pair})` } as CSSProperties} />
      ))}
    </div>
  );
}

/** Drawn stand-ins: the gem while 3D loads (or without WebGL), the shelf only without WebGL. */
const STILL_ART: Partial<Record<TourChapterId, { art: ReactNode; fallbackOnly?: boolean }>> = {
  opening: { art: <GemArt /> },
  archive: { art: <CoverFanArt />, fallbackOnly: true },
  closing: { art: <GemArt />, fallbackOnly: true },
};

/** Without WebGL, the other chapters show their feature's icon in a glowing emblem. */
const EMBLEMS: Partial<Record<TourChapterId, ComponentType<{ "aria-hidden"?: boolean }>>> = {
  todo: ListChecks,
  arcade: Gamepad2,
  "game-2048": Grid2x2,
  "game-flutter": Bird,
  "game-snake": Worm,
  "game-sudoku": Hash,
  "game-fruit-slice": Cherry,
  "game-stacker": Layers,
  slots: Coins,
  vault: Vault,
  lab: FlaskConical,
  sanctum: Flame,
  customization: Palette,
  achievements: Trophy,
};

/** Top-level beats: the rail and counter skip sub-beats such as the individual games. */
const MAIN_CHAPTERS = TOUR_CHAPTERS.filter((chapter) => !chapter.part);
const RAIL_INDEX = TOUR_CHAPTERS.map((chapter) => MAIN_CHAPTERS.findIndex((main) => main.id === (chapter.part ?? chapter.id)));

export function Tour({ signedIn, admin, motion }: { signedIn: boolean; admin: boolean; motion: MotionLevel }) {
  const reduced = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
  const level: MotionLevel = reduced ? "off" : motion;
  const [scene, setScene] = useState<SceneState>("loading");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<(HTMLElement | null)[]>([]);
  const sceneRef = useRef<TourScene | null>(null);
  const scrollRef = useRef(0);
  const levelRef = useRef(level);
  /** Stages chapter copy for a scroll position; the scene calls it with the position it is actually showing. */
  const copyRef = useRef<(scroll: number) => void>(() => {});
  const startLevel = useEffectEvent(() => level);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: TourScene | null = null;
    let cancelled = false;
    const fail = () => {
      engine?.dispose();
      engine = null;
      sceneRef.current = null;
      if (!cancelled) {
        setScene("fallback");
        copyRef.current(scrollRef.current);
      }
    };
    import("./tour-scene").then(({ createTourScene }) => {
      if (cancelled) return;
      try {
        engine = createTourScene(host, TOUR_CHAPTERS, TIMELINE, startLevel(), fail, (scroll) => copyRef.current(scroll));
      } catch {
        fail();
        return;
      }
      engine.setScroll(scrollRef.current);
      sceneRef.current = engine;
      setScene("ready");
    }, fail);
    return () => {
      cancelled = true;
      engine?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    levelRef.current = level;
    if (sceneRef.current) sceneRef.current.setMotion(level);
    else copyRef.current(scrollRef.current);
  }, [level]);

  useEffect(() => {
    const sections = sectionsRef.current.filter((section): section is HTMLElement => Boolean(section));
    const root = rootRef.current;
    const main = mainRef.current;
    if (!sections.length || !root || !main) return;
    const staged = sections.map(() => "");
    let vh = 1;
    let top = 0;
    let frame = 0;

    copyRef.current = (scroll) => {
      const { x: at } = locate(TIMELINE, scroll);
      const x = levelRef.current === "off" ? Math.round(at) : at;
      sections.forEach((section, i) => {
        const { enter, leave } = copyStage(i, LAST, x);
        const key = `${enter.toFixed(3)}/${leave.toFixed(3)}`;
        if (key === staged[i]) return;
        staged[i] = key;
        section.style.setProperty("--enter", enter.toFixed(3));
        section.style.setProperty("--leave", leave.toFixed(3));
        section.toggleAttribute("data-live", enter * (1 - leave) > 0.5);
      });
      root.style.setProperty("--progress", clamp01(scroll / TIMELINE.end).toFixed(4));
      setActive(Math.min(LAST, Math.round(x)));
    };

    const position = () => (window.scrollY - top) / vh;
    const update = () => {
      frame = 0;
      scrollRef.current = position();
      if (sceneRef.current) sceneRef.current.setScroll(scrollRef.current);
      else copyRef.current(scrollRef.current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      vh = window.innerHeight || 1;
      top = main.getBoundingClientRect().top + window.scrollY;
      onScroll();
    };
    // Tabbing into a chapter that is not on screen brings it there.
    const onFocus = (event: FocusEvent) => {
      const index = sections.findIndex((section) => section.contains(event.target as Node));
      if (index < 0 || Math.round(locate(TIMELINE, position()).x) === index) return;
      window.scrollTo(0, top + TIMELINE.starts[index] * vh);
    };
    onResize();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    main.addEventListener("focusin", onFocus);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      main.removeEventListener("focusin", onFocus);
    };
  }, []);

  const cta = signedIn ? { href: "/", label: "Open Amethyst" } : { href: "/login", label: "Sign in" };
  const railActive = RAIL_INDEX[active] ?? 0;

  return (
    <div ref={rootRef} className="tour" data-scene={scene} data-motion={level}>
      <div aria-hidden className="tour-stage">
        <div className="tour-backdrop" />
        <div ref={hostRef} className="tour-canvas" />
        <div className="tour-scrim" />
      </div>

      <header className="tour-bar">
        <Link href="/" aria-label="Amethyst home" className="tour-brand">
          <BrandMark />
        </Link>
        <div className="tour-bar-end">
          <span aria-hidden className="tour-count">
            {pad(railActive + 1)} / {pad(MAIN_CHAPTERS.length)}
          </span>
          <Link href={cta.href} className="tour-link" data-quiet="">
            {cta.label}
          </Link>
        </div>
        <span aria-hidden className="tour-progress" />
      </header>

      <nav className="tour-rail" aria-label="Tour chapters">
        <ol>
          {MAIN_CHAPTERS.map((chapter, index) => (
            <li key={chapter.id}>
              <a href={`#${chapter.id}`} aria-current={railActive === index ? "location" : undefined}>
                <span className="tour-rail-index">{pad(index)}</span>
                <span className="tour-rail-label">{chapter.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <main ref={mainRef} style={{ height: `${Math.round((TIMELINE.end + 1) * 100)}svh` }}>
        {TOUR_CHAPTERS.map((chapter, index) => {
          const Heading = index === 0 ? "h1" : "h2";
          const still = STILL_ART[chapter.id];
          const Emblem = EMBLEMS[chapter.id];
          const next = TOUR_CHAPTERS[index + 1];
          const link = chapter.id === "closing" ? cta : chapter.link?.adminOnly && !admin ? undefined : chapter.link;
          return (
            <section
              key={chapter.id}
              id={chapter.id}
              ref={(element) => {
                sectionsRef.current[index] = element;
              }}
              aria-labelledby={`${chapter.id}-title`}
              className="tour-chapter"
              data-chapter={chapter.id}
              style={
                {
                  top: `${(FRAMES[index].top * 100).toFixed(2)}svh`,
                  height: `${(FRAMES[index].height * 100).toFixed(2)}svh`,
                  scrollMarginTop: `${(-FRAMES[index].anchor * 100).toFixed(2)}svh`,
                  "--enter": index ? 0 : 1,
                } as CSSProperties
              }
            >
              <div className="tour-pin">
                {still ? (
                  <div aria-hidden className="tour-still" data-fallback-only={still.fallbackOnly ? "" : undefined}>
                    {still.art}
                  </div>
                ) : Emblem ? (
                  <div aria-hidden className="tour-still tour-emblem" data-fallback-only="">
                    <Emblem aria-hidden />
                  </div>
                ) : null}
                <div className="tour-copy">
                  <p className="tour-eyebrow">
                    {index === 0 ? <Gem aria-hidden /> : null}
                    {chapter.eyebrow}
                  </p>
                  <Heading id={`${chapter.id}-title`} className="tour-title">
                    {chapter.title} {chapter.accent ? <span className="tour-accent">{chapter.accent}</span> : null}
                  </Heading>
                  <p className="tour-body">{chapter.body}</p>
                  {chapter.tags.length ? (
                    <ul className="tour-tags" aria-label="Includes">
                      {chapter.tags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="tour-actions">
                    {link ? (
                      <Link href={link.href} className="tour-link">
                        {link.label}
                        <ArrowRight aria-hidden />
                      </Link>
                    ) : null}
                    {index === 0 && next ? (
                      <a href={`#${next.id}`} className="tour-cue">
                        Scroll to begin
                        <ArrowDown aria-hidden />
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
