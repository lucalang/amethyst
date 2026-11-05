"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useMotionLevel, webglAvailable } from "@/components/showcase/motion";
import { cn } from "@/lib/utils";
import type { Chrono } from "./chrono-scene";
import {
  ENGINE_WAIT,
  INTRO,
  INTRO_SESSION_KEY,
  TRAVEL,
  TRAVEL_FALLBACK,
  formatDay,
  journey,
  localToday,
  type ChronoCommit,
  type IntroKind,
  type TravelKind,
} from "./chrono-timing";
import "./version-history.css";

type IntroPhase = "pending" | "play" | "reveal" | "done";
type Travel = { commit: ChronoCommit; href: string; origin: HTMLElement; kind: TravelKind | "fallback"; from: number };
type Begin = (commit: ChronoCommit, href: string, origin: HTMLElement) => boolean;

const TimeTravelContext = createContext<Begin | null>(null);
const noSubscribe = () => () => {};

function chooseIntro(motion: string): IntroKind | null {
  // Arriving mid-page (restored scroll, deep link) goes straight to the content.
  if (window.scrollY > window.innerHeight * 0.5) return null;
  let seen = false;
  try {
    seen = sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
    sessionStorage.setItem(INTRO_SESSION_KEY, "1");
  } catch {
    seen = true;
  }
  return motion === "subtle" || seen ? "short" : "full";
}

function readFonts(element: HTMLElement) {
  const style = getComputedStyle(element);
  const font = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return { display: font("--font-cinzel", "Georgia, serif"), mono: font("--font-jetbrains", "ui-monospace, monospace"), ui: font("--font-manrope", "system-ui, sans-serif") };
}

/**
 * The Version History stage: a full-bleed iron backdrop, the Three.js chronometer behind the hero
 * (opening once, docked beside the heading afterwards) and the time-travel hand-off for demo launches.
 */
export function VersionHistoryStage({ commits, hero, children }: { commits: ChronoCommit[]; hero: ReactNode; children: ReactNode }) {
  const motion = useMotionLevel();
  const webgl = useSyncExternalStore(noSubscribe, webglAvailable, () => true);
  const [phase, setPhase] = useState<IntroPhase>("pending");
  const [introKind, setIntroKind] = useState<IntroKind | null>(null);
  const [engine, setEngine] = useState<Chrono | null>(null);
  const [failed, setFailed] = useState(false);
  const [travel, setTravel] = useState<Travel | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const scene = !webgl || failed ? "failed" : engine ? "ready" : "loading";
  const intro: IntroPhase = motion === "off" || scene === "failed" ? "done" : phase;

  const onReady = useEffectEvent((next: Chrono) => {
    setEngine(next);
    const kind = phase === "pending" && motion !== "off" ? chooseIntro(motion) : null;
    next.start(kind);
    if (kind) {
      setIntroKind(kind);
      setPhase("play");
    } else setPhase("done");
  });
  const onFail = useEffectEvent(() => {
    setEngine(null);
    setFailed(true);
    setPhase("done");
  });
  const currentMotion = useEffectEvent(() => motion);

  useEffect(() => {
    const host = hostRef.current;
    const slot = slotRef.current;
    if (!webgl || !host || !slot) return;
    let cancelled = false;
    let created: Chrono | null = null;
    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      created?.dispose();
      created = null;
      onFail();
    };
    import("./chrono-scene")
      .then(({ createChrono }) => {
        if (cancelled) return;
        created = createChrono({ host, slot, commits, today: localToday(), motion: currentMotion(), fonts: readFonts(host), onFail: fail });
        return created.ready;
      })
      .then(() => {
        if (!cancelled && created) onReady(created);
      })
      .catch(fail);
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [webgl, commits]);

  useEffect(() => engine?.setMotion(motion), [engine, motion]);

  // Never hold the page back for a slow engine.
  useEffect(() => {
    if (phase !== "pending") return;
    const timer = window.setTimeout(() => setPhase("done"), ENGINE_WAIT);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (!introKind || (phase !== "play" && phase !== "reveal")) return;
    const timing = INTRO[introKind];
    const timer = window.setTimeout(
      () => setPhase(phase === "play" ? "reveal" : "done"),
      phase === "play" ? timing.reveal : timing.end - timing.reveal,
    );
    return () => window.clearTimeout(timer);
  }, [phase, introKind]);

  const skip = useCallback(() => {
    engine?.skipIntro();
    setPhase("done");
  }, [engine]);

  useEffect(() => {
    if (intro === "done") return;
    const onKey = (event: KeyboardEvent) => {
      if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) skip();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", skip);
    };
  }, [intro, skip]);

  const begin = useCallback<Begin>(
    (commit, href, origin) => {
      if (motion === "off") return false;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return false;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;
      if (travel) return true;
      engine?.skipIntro();
      setPhase("done");
      const kind = engine && !failed ? (motion === "subtle" ? "subtle" : "full") : "fallback";
      setTravel({ commit, href: url.href, origin, kind, from: localToday() });
      return true;
    },
    [motion, travel, engine, failed],
  );

  const cancel = useCallback(() => {
    const origin = travel?.origin;
    setTravel(null);
    if (origin?.isConnected) requestAnimationFrame(() => origin.focus());
  }, [travel]);

  return (
    <div className="vh-stage" data-intro={intro} data-scene={scene}>
      <div className="vh-backdrop" aria-hidden="true" />
      <div ref={hostRef} className="vh-scene" aria-hidden="true" />
      {intro === "pending" || intro === "play" ? (
        <div className="vh-veil">
          <p className="vh-veil-caption" role="status">
            Winding the chronometer
          </p>
          <button type="button" className="vh-skip" onClick={skip}>
            Skip intro
          </button>
        </div>
      ) : null}
      <div className="vh-frame">
        <header className="vh-hero">
          <div className="vh-hero-copy">{hero}</div>
          <div ref={slotRef} className="vh-machine-slot" aria-hidden="true">
            {scene === "failed" ? <FallbackMachine commits={commits} /> : null}
          </div>
        </header>
        <div className="vh-body">
          <TimeTravelContext value={begin}>{children}</TimeTravelContext>
        </div>
      </div>
      {travel ? <TravelOverlay travel={travel} engine={travel.kind === "fallback" ? null : engine} homeRef={hostRef} onCancel={cancel} /> : null}
    </div>
  );
}

/** A playable-demo link: a plain primary click or Enter plays the time-travel hand-off first. */
export function LaunchDemoLink({ commit, href, onClick, ...props }: ComponentProps<"a"> & { commit: ChronoCommit; href: string }) {
  const begin = use(TimeTravelContext);
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!begin || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (begin(commit, href, event.currentTarget)) event.preventDefault();
  };
  return <a {...props} href={href} onClick={handleClick} />;
}

function TravelOverlay({ travel, engine, homeRef, onCancel }: { travel: Travel; engine: Chrono | null; homeRef: RefObject<HTMLDivElement | null>; onCancel: () => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLSpanElement>(null);
  const arriveRef = useRef<HTMLButtonElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  const [arriving, setArriving] = useState(false);
  const { commit, href, kind, from } = travel;
  const timing = kind === "fallback" ? TRAVEL_FALLBACK : TRAVEL[kind];
  const destination = formatDay(commit.day);

  useLayoutEffect(() => {
    const host = canvasRef.current;
    const home = homeRef.current;
    if (!engine || !host || kind === "fallback") return;
    engine.setHost(host);
    engine.travel(commit, kind);
    return () => {
      engine.cancelTravel();
      if (home) engine.setHost(home);
    };
  }, [engine, homeRef, commit, kind]);

  useEffect(() => {
    arriveRef.current?.focus();
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      start ||= now;
      const ms = now - start;
      const day = from - (from - commit.day) * journey(ms, timing.passage);
      if (dateRef.current) dateRef.current.textContent = formatDay(Math.round(day));
      if (ms < timing.navigate) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timer = window.setTimeout(() => {
      setArriving(true);
      window.location.assign(href);
    }, timing.navigate);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [commit, from, href, timing]);

  // Coming back from the demo through the back/forward cache restores this page mid-journey.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) onCancel();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, [onCancel]);

  const arrive = () => {
    setArriving(true);
    window.location.assign(href);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    } else if (event.key === "Tab") {
      event.preventDefault();
      (document.activeElement === arriveRef.current ? stayRef.current : arriveRef.current)?.focus();
    }
  };

  return createPortal(
    <div
      className="vh-travel"
      data-kind={kind}
      role="dialog"
      aria-modal="true"
      aria-labelledby="vh-travel-title"
      aria-describedby="vh-travel-detail"
      onKeyDown={onKeyDown}
    >
      <div className="vh-travel-veil" aria-hidden="true" />
      <div ref={canvasRef} className="vh-travel-canvas" aria-hidden="true" />
      <div className="vh-travel-hud">
        <h2 id="vh-travel-title" className="sr-only">
          Travelling to {destination}
        </h2>
        <p id="vh-travel-detail" className="sr-only">
          Opening the {commit.milestone ?? "historical"} demo, commit {commit.shortSha}: {commit.title}.
        </p>
        <div className="vh-readout" aria-hidden="true">
          <span className="vh-readout-label">{arriving ? "Arriving" : "Destination"}</span>
          <span ref={dateRef} className="vh-readout-date">
            {formatDay(from)}
          </span>
          <span className="vh-readout-meta">
            <span className="vh-readout-sha">{commit.shortSha}</span>
            {commit.milestone ? <span className="vh-readout-milestone">{commit.milestone}</span> : null}
          </span>
          <span className="vh-readout-title">{commit.title}</span>
        </div>
        <div className="vh-travel-actions">
          <button ref={arriveRef} type="button" className="vh-lever" onClick={arrive} disabled={arriving}>
            Arrive now
          </button>
          <button ref={stayRef} type="button" className="vh-lever" data-tone="quiet" onClick={onCancel} disabled={arriving}>
            Stay here
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Without WebGL: an engraved dial in SVG so the hero keeps its instrument. */
function FallbackMachine({ commits }: { commits: ChronoCommit[] }) {
  const ticks = (count: number, inner: number, outer: number, step = 1) =>
    Array.from({ length: Math.ceil(count / step) }, (_, k) => {
      const a = ((k * step + 0.5) / count) * Math.PI * 2;
      return <line key={k} x1={Math.sin(a) * inner} y1={-Math.cos(a) * inner} x2={Math.sin(a) * outer} y2={-Math.cos(a) * outer} />;
    });
  return (
    <svg className="vh-fallback" viewBox="-110 -110 220 220" role="presentation">
      <polygon className="vh-fb-case" points="-66,-100 66,-100 100,-66 100,66 66,100 -66,100 -100,66 -100,-66" />
      <circle className="vh-fb-bezel" r="86" />
      <circle className="vh-fb-month" r="72" />
      <g className="vh-fb-ticks">{ticks(12, 64, 80)}</g>
      <circle className="vh-fb-day" r="60" />
      <g className="vh-fb-ticks vh-fb-fine">{ticks(31, 54, 62)}</g>
      <circle className="vh-fb-index" r="47" />
      <g className="vh-fb-beads">
        {commits.map((commit, i) => {
          const a = ((i + 0.5) / commits.length) * Math.PI * 2;
          return <circle key={commit.shortSha} className={cn(commit.available && "is-lit")} cx={Math.sin(a) * 47} cy={-Math.cos(a) * 47} r={commit.available ? 2.6 : 1.4} />;
        })}
      </g>
      <circle className="vh-fb-lens" r="32" />
      <g className="vh-fb-gear" transform="translate(-76 -76)">
        <circle r="17" />
        <circle r="5" className="vh-fb-axle" />
      </g>
      <line className="vh-fb-cursor" x1="0" y1="-88" x2="0" y2="-42" />
    </svg>
  );
}
