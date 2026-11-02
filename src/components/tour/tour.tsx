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
import type { TourScene } from "./tour-scene";

type SceneState = "loading" | "ready" | "fallback";

const REDUCED = "(prefers-reduced-motion: reduce)";
// Viewport heights of scroll spent travelling into the next chapter.
const TRAVEL = 1.3;

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
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
  const hostRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<(HTMLElement | null)[]>([]);
  const sceneRef = useRef<TourScene | null>(null);
  const scrollRef = useRef({ position: 0, hold: 0 });
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
      if (!cancelled) setScene("fallback");
    };
    import("./tour-scene").then(({ createTourScene }) => {
      if (cancelled) return;
      try {
        engine = createTourScene(host, TOUR_CHAPTERS.map((chapter) => chapter.id), startLevel(), fail);
      } catch {
        fail();
        return;
      }
      engine.setScroll(scrollRef.current.position, scrollRef.current.hold);
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
    sceneRef.current?.setMotion(level);
    sceneRef.current?.setScroll(scrollRef.current.position, scrollRef.current.hold);
  }, [level]);

  useEffect(() => {
    const sections = sectionsRef.current.filter((section): section is HTMLElement => Boolean(section));
    const root = rootRef.current;
    if (!sections.length || !root) return;
    let tops: number[] = [];
    let heights: number[] = [];
    let vh = 1;
    let frame = 0;
    const lastIndex = sections.length - 1;

    const measure = () => {
      vh = window.innerHeight || 1;
      tops = sections.map((section) => section.getBoundingClientRect().top + window.scrollY);
      heights = sections.map((section) => section.offsetHeight);
    };

    const update = () => {
      frame = 0;
      const y = window.scrollY;
      let index = 0;
      while (index < lastIndex && y >= tops[index + 1]) index++;
      const p = (y - tops[index]) / vh;
      let position = index;
      let hold: number;
      if (index < lastIndex) {
        const start = Math.max(0.01, (tops[index + 1] - tops[index]) / vh - TRAVEL);
        position = index + clamp01((p - start) / TRAVEL);
        hold = clamp01(p / start);
      } else {
        hold = clamp01(p / Math.max(0.01, heights[index] / vh - 1));
      }
      scrollRef.current = { position, hold };
      sceneRef.current?.setScroll(position, hold);

      sections.forEach((section, j) => {
        const local = (y - tops[j]) / vh;
        const pinned = heights[j] / vh - 1;
        const fadeIn = j === 0 ? 1 : smooth(-0.75, -0.1, local);
        const fadeOut = j === lastIndex ? 1 : 1 - smooth(pinned, pinned + 0.45, local);
        section.style.setProperty("--fade", Math.min(fadeIn, fadeOut).toFixed(3));
      });
      const max = document.documentElement.scrollHeight - vh;
      root.style.setProperty("--progress", (max > 0 ? clamp01(y / max) : 0).toFixed(4));
      setActive(Math.round(position));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      measure();
      onScroll();
    };
    onResize();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
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

      <main>
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
              style={{ height: `${Math.round((chapter.span ?? 2.3) * 100)}svh` }}
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
