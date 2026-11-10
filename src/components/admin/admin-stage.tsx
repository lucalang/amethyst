"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCardTilt } from "@/components/showcase/card-tilt";
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

/** Without the scene: a short CSS shake of the panel (the standard look styles [data-alert]). */
export function flashPanel(panel: HTMLElement) {
  panel.removeAttribute("data-alert");
  void panel.offsetWidth;
  panel.setAttribute("data-alert", "");
}

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
  plain,
  station,
  motion,
  palette,
  intro,
  sound,
  onStart,
  onIntroDone,
  onArrived,
  hud,
  children,
}: {
  /** The standard look: no scene, panels in a plain responsive layout. */
  plain: boolean;
  station: StationId;
  motion: MotionLevel;
  /** The colour variant, as `paletteUniform` gives it. */
  palette: [number, number, number];
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
  const latest = useRef({ station, motion, palette, intro, sound, onStart, onIntroDone, onArrived });
  useLayoutEffect(() => {
    latest.current = { station, motion, palette, intro, sound, onStart, onIntroDone, onArrived };
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
      if (plain || !webglAvailable()) throw new Error("No scene");
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
        palette: latest.current.palette,
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
  }, [control, plain]);

  useEffect(() => {
    engineRef.current?.setStation(station);
    if (modeRef.current === "2d") (plain ? window : scrollerRef.current)?.scrollTo({ top: 0 });
  }, [station, plain]);

  useEffect(() => {
    engineRef.current?.setMotion(engineMotion(motion));
  }, [motion]);

  const [hue, lift, chroma] = palette;
  useEffect(() => {
    engineRef.current?.setPalette([hue, lift, chroma]);
  }, [hue, lift, chroma]);

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

  useCardTilt(flatRef, !plain && state.mode === "2d" && motion !== "off");

  if (plain) {
    return (
      <ControlContext.Provider value={control}>
        <StateContext.Provider value={state}>
          <div className="cs-root" data-station={station} data-motion={motion}>
            {hud}
            <div ref={flatRef} className="cs-views">
              {STATIONS.map((id) => (
                <div key={id} data-station={id} className={`cs-view cs-view-${id}`} hidden={id !== station}>
                  {SLOT_ORDER[id].map((slot) => (
                    <div key={slot} data-slot={slot} className={`cs-slot cs-slot-${slot}`} />
                  ))}
                </div>
              ))}
            </div>
            {children}
          </div>
        </StateContext.Provider>
      </ControlContext.Provider>
    );
  }

  return (
    <ControlContext.Provider value={control}>
      <StateContext.Provider value={state}>
        <div className="cs-root" data-mode={state.mode} data-station={station} data-motion={motion} data-intro={introRunning ? "" : undefined}>
          {/* The seal: the full-stage opening while the scene compiles, then the backdrop of the 2D fallback. */}
          <div className="cs-backdrop">
            <div aria-hidden className="cs-seal">
              <span className="cs-seal-runes" />
              <span className="cs-seal-sweep" />
              <span className="cs-seal-inner" />
              <span className="cs-seal-mark" />
              <span className="cs-seal-core" />
            </div>
            {state.mode === "pending" ? (
              <p className="cs-veil-text" role="status">
                Opening the sanctum…
              </p>
            ) : null}
          </div>
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
          {children}
        </div>
      </StateContext.Provider>
    </ControlContext.Provider>
  );
}
