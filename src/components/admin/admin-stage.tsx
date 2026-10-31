"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { webglAvailable } from "@/components/showcase/motion";
import type { SanctumSound } from "@/components/vault/vault-audio";
import type { MotionLevel } from "@/lib/preferences";
import { SLOT_ORDER, STATIONS, type PanelKind, type PanelSpec, type StationId } from "./admin-layout";
import type { Sanctum } from "./admin-scene";
import type { IntroKind } from "./admin-timing";
import { useMounted } from "./admin-ui";

/**
 * The stage: panels register their DOM here, and it hands them to the 3D scene (as CSS3D objects) or, without
 * WebGL, places them in a flat 2D layout with the same content and controls.
 */

export type StageMode = "pending" | "3d" | "2d";

type StageControl = {
  register: (el: HTMLElement, spec: PanelSpec) => () => void;
  update: (el: HTMLElement, spec: PanelSpec) => void;
};
type StageState = { mode: StageMode; engine: Sanctum | null };

const ControlContext = createContext<StageControl | null>(null);
const StateContext = createContext<StageState>({ mode: "pending", engine: null });

/** The scene (null until it's running, and in 2D) and the stage mode. */
export const useStage = () => useContext(StateContext);

function tagPanel(el: HTMLElement, kind: PanelKind, station: StationId, slot: string) {
  el.className = `cs-panel cs-kind-${kind}`;
  el.dataset.station = station;
  el.dataset.slot = slot;
}

export function Panel({
  station,
  slot,
  order = 0,
  kind = "panel",
  tone,
  label,
  className,
  children,
}: {
  station: StationId;
  slot: string;
  order?: number;
  kind?: PanelKind;
  tone?: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const control = useContext(ControlContext);
  const mounted = useMounted();
  const [el] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const spec = useRef<PanelSpec>({ station, slot, order, kind, tone });

  useLayoutEffect(() => {
    spec.current = { station, slot, order, kind, tone };
    if (el) control?.update(el, spec.current);
  }, [control, el, station, slot, order, kind, tone]);

  useLayoutEffect(() => {
    if (!el || !control) return;
    tagPanel(el, kind, station, slot);
    return control.register(el, spec.current);
  }, [control, el, station, slot, kind]);

  if (!mounted || !el) return null;
  return createPortal(
    <section className={`cs-pane ${className ?? ""}`} aria-label={label} data-card={kind === "tablet" ? undefined : "panel"}>
      {children}
    </section>,
    el,
  );
}

const engineMotion = (motion: MotionLevel) => (motion === "off" ? "off" : motion === "subtle" ? "subtle" : "full");

export function AdminStage({
  station,
  motion,
  intro,
  sound,
  onStart,
  onIntroDone,
  onArrived,
  hud,
  children,
}: {
  station: StationId;
  motion: MotionLevel;
  intro: IntroKind | null;
  sound: (name: SanctumSound) => void;
  onStart: (intro: IntroKind | null) => void;
  onIntroDone: () => void;
  onArrived: (station: StationId) => void;
  hud: ReactNode;
  children: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const flatRef = useRef<HTMLDivElement>(null);
  const registry = useRef(new Map<HTMLElement, PanelSpec>());
  const engineRef = useRef<Sanctum | null>(null);
  const modeRef = useRef<StageMode>("pending");
  const [state, setState] = useState<StageState>({ mode: "pending", engine: null });
  const [introRunning, setIntroRunning] = useState(false);

  // Latest props for the scene's callbacks, which are created once.
  const latest = useRef({ station, motion, intro, sound, onStart, onIntroDone, onArrived });
  useLayoutEffect(() => {
    latest.current = { station, motion, intro, sound, onStart, onIntroDone, onArrived };
  });

  const control = useMemo<StageControl>(() => {
    const placeFlat = (el: HTMLElement, spec: PanelSpec) => {
      const slot = flatRef.current?.querySelector(`[data-station="${spec.station}"] [data-slot="${spec.slot}"]`);
      if (!slot) return;
      el.removeAttribute("style");
      el.inert = false;
      el.dataset.order = String(spec.order);
      const before = [...slot.children].find((child) => child !== el && Number((child as HTMLElement).dataset.order) > spec.order) ?? null;
      if (el.parentNode !== slot || el.nextElementSibling !== before) slot.insertBefore(el, before);
    };
    return {
      register(el, spec) {
        registry.current.set(el, spec);
        if (engineRef.current) engineRef.current.addPanel(el, spec);
        else if (modeRef.current === "2d") placeFlat(el, spec);
        return () => {
          registry.current.delete(el);
          if (engineRef.current) engineRef.current.removePanel(el);
          else el.remove();
        };
      },
      update(el, spec) {
        if (!registry.current.has(el)) return;
        registry.current.set(el, spec);
        if (engineRef.current) engineRef.current.updatePanel(el, spec);
        else if (modeRef.current === "2d") placeFlat(el, spec);
      },
      placeFlat,
    } as StageControl & { placeFlat: typeof placeFlat };
  }, []);

  // Start the scene: load its chunk, hand it the panels, compile, then run the intro. Any failure → 2D.
  useEffect(() => {
    let cancelled = false;
    let engine: Sanctum | null = null;
    const toFlat = () => {
      engine?.dispose();
      engine = null;
      engineRef.current = null;
      modeRef.current = "2d";
      setState({ mode: "2d", engine: null });
      const place = (control as StageControl & { placeFlat: (el: HTMLElement, spec: PanelSpec) => void }).placeFlat;
      const sorted = [...registry.current].sort(([, a], [, b]) => a.order - b.order);
      // Wait for the flat layout to be shown before moving the panels in.
      requestAnimationFrame(() => {
        for (const [el, spec] of sorted) place(el, spec);
      });
    };
    (async () => {
      if (!webglAvailable()) throw new Error("WebGL unavailable");
      const { createSanctum } = await import("./admin-scene");
      const viewport = viewportRef.current;
      const scroller = scrollerRef.current;
      const spacer = spacerRef.current;
      if (cancelled || !viewport || !scroller || !spacer) return;
      engine = createSanctum({
        viewport,
        scroller,
        spacer,
        station: latest.current.station,
        motion: engineMotion(latest.current.motion),
        hooks: {
          sound: (name) => latest.current.sound(name),
          fail: () => {
            if (!cancelled) toFlat();
          },
          introDone: () => {
            setIntroRunning(false);
            latest.current.onIntroDone();
          },
          arrived: (id) => latest.current.onArrived(id),
        },
      });
      engineRef.current = engine;
      for (const [el, spec] of registry.current) engine.addPanel(el, spec);
      let timer = 0;
      await Promise.race([engine.ready, new Promise((_, reject) => (timer = window.setTimeout(() => reject(new Error("timeout")), 9000)))]);
      window.clearTimeout(timer);
      if (cancelled) return;
      engine.setStation(latest.current.station);
      modeRef.current = "3d";
      setState({ mode: "3d", engine });
      const kind = latest.current.motion === "off" ? null : latest.current.intro;
      setIntroRunning(Boolean(kind));
      latest.current.onStart(kind);
      engine.start(kind);
    })().catch(() => {
      if (!cancelled) toFlat();
    });
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [control]);

  useEffect(() => {
    engineRef.current?.setStation(station);
    if (modeRef.current === "2d") scrollerRef.current?.scrollTo({ top: 0 });
  }, [station]);

  useEffect(() => {
    engineRef.current?.setMotion(engineMotion(motion));
  }, [motion]);

  // Any key or click skips the intro.
  useEffect(() => {
    if (!introRunning) return;
    const skip = () => engineRef.current?.skipIntro();
    window.addEventListener("keydown", skip, { once: true });
    window.addEventListener("pointerdown", skip, { once: true });
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [introRunning]);

  useCardMotion(flatRef, state.mode === "2d" && motion !== "off");

  return (
    <ControlContext.Provider value={control}>
      <StateContext.Provider value={state}>
        <div className="cs-root" data-mode={state.mode} data-station={station} data-motion={motion} data-intro={introRunning ? "" : undefined}>
          <div ref={scrollerRef} className="cs-scroller">
            <div ref={viewportRef} className="cs-viewport" />
            <div ref={spacerRef} className="cs-spacer" aria-hidden />
            <div ref={flatRef} className="cs-flat" hidden={state.mode !== "2d"}>
              {STATIONS.map((id) => (
                <div key={id} data-station={id} className={`cs-flat-station cs-flat-${id}`} hidden={id !== station}>
                  {SLOT_ORDER[id].map((slot) => (
                    <div key={slot} data-slot={slot} className={`cs-flat-slot cs-flat-slot-${slot}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          {hud}
          {state.mode === "pending" ? (
            <div className="cs-veil" role="status">
              <span aria-hidden className="cs-veil-sigil" />
              <span className="cs-veil-text">Opening the sanctum…</span>
            </div>
          ) : null}
          {children}
        </div>
      </StateContext.Provider>
    </ControlContext.Provider>
  );
}

/* 2D cards: the same tilt, glare, lift and press, as CSS transforms driven by springs. */

type Spring = { x: number; v: number };
function step(s: Spring, target: number, dt: number, k = 170, c = 15) {
  const n = Math.max(1, Math.ceil(dt / 0.012));
  for (let i = 0; i < n; i++) {
    s.v += (k * (target - s.x) - c * s.v) * (dt / n);
    s.x += s.v * (dt / n);
  }
}

function useCardMotion(rootRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;
    type Card = { rx: Spring; ry: Spring; lift: Spring; tx: number; ty: number; tl: number };
    const cards = new Map<HTMLElement, Card>();
    let frame = 0;
    let last = 0;
    let steadyUntil = 0;
    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let moving = false;
      for (const [el, card] of cards) {
        const still = now < steadyUntil;
        step(card.rx, still ? 0 : card.tx, dt);
        step(card.ry, still ? 0 : card.ty, dt);
        step(card.lift, card.tl, dt, 140, 14);
        el.style.setProperty("--rx", `${card.rx.x.toFixed(2)}deg`);
        el.style.setProperty("--ry", `${card.ry.x.toFixed(2)}deg`);
        el.style.setProperty("--lift", `${card.lift.x.toFixed(1)}px`);
        const settled = Math.abs(card.rx.x - card.tx) + Math.abs(card.ry.x - card.ty) + Math.abs(card.lift.x - card.tl) < 0.02 && Math.abs(card.rx.v) + Math.abs(card.ry.v) + Math.abs(card.lift.v) < 0.02;
        if (settled && !card.tl && !card.tx && !card.ty) cards.delete(el);
        else if (!settled) moving = true;
      }
      if (moving) frame = requestAnimationFrame(tick);
      else last = 0;
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const cardOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-card]") : null);
    let current: HTMLElement | null = null;
    const release = (el: HTMLElement | null) => {
      const card = el && cards.get(el);
      if (!card) return;
      card.tx = card.ty = card.tl = 0;
      el.style.setProperty("--glare", "0");
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const el = cardOf(event.target);
      if (el !== current) {
        release(current);
        current = el;
      }
      if (!el) return kick();
      const rect = el.getBoundingClientRect();
      const u = (event.clientX - rect.left) / rect.width;
      const v = (event.clientY - rect.top) / rect.height;
      const card = cards.get(el) ?? { rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, lift: { x: 0, v: 0 }, tx: 0, ty: 0, tl: 0 };
      const range = el.dataset.card === "panel" ? 4 : 10;
      card.tx = (v - 0.5) * range;
      card.ty = -(u - 0.5) * range;
      card.tl = el.dataset.card === "panel" ? 4 : 14;
      cards.set(el, card);
      el.style.setProperty("--gx", `${(u * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(v * 100).toFixed(1)}%`);
      el.style.setProperty("--glare", "1");
      kick();
    };
    const onLeave = () => {
      release(current);
      current = null;
      kick();
    };
    const hold = () => {
      steadyUntil = performance.now() + 1200;
      kick();
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("keydown", hold);
    root.addEventListener("scroll", hold, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("keydown", hold);
      root.removeEventListener("scroll", hold, { capture: true });
      for (const el of cards.keys()) for (const name of ["--rx", "--ry", "--lift", "--glare"]) el.style.removeProperty(name);
    };
  }, [rootRef, enabled]);
}
