"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { playGeodeSound } from "@/components/vault/vault-audio";
import { ADMIN_GEMS, adminGem, type AdminGemId } from "@/lib/admin-gems";
import type { MotionLevel } from "@/lib/preferences";
import { MomentOverlay, Motes, momentShakes, momentSound, useGeodeLight, useRipples, type GeodeMoment } from "./admin-dashboard-moments";
import { CountUp } from "./admin-ui";
import "./admin-dashboard-fx.css";

/** The latest confirmed action: `n` counts them (so each one plays afresh), `moment` says how to celebrate it. */
export type FxCelebration = { n: number; moment?: GeodeMoment };

/**
 * The Flashy Admin Dashboard: "Geode". A dark cave lit by one gem you choose. A faceted crystal turns beside the
 * views and leans toward the pointer, light refracts across faceted glass panels, views crystallize in behind a
 * prism beam, and a confirmed action bursts into shards, with struck-glass chimes. Pure CSS 3D (no WebGL).
 * Everything here is presentation: the panels inside are the same tools, with the same checks, as Standard.
 */

export type FxStat = { key: string; label: string; value: number; note: string; icon: ReactNode; tone?: string };
/** Where a panel sits in its view; wide layouts lean `left`/`right` panels toward the middle. */
export type FxPose = "left" | "right" | "floor";
export type FxSlot = { id: string; pose?: FxPose; node: ReactNode };
export type FxView = { id: string; label: string; icon: ReactNode; badge?: number; kicker: string; title: string; aside?: ReactNode; slots: FxSlot[] };

/* The view lives in the URL hash (#players), so views are linkable and Back works. */
function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}
const useHash = () =>
  useSyncExternalStore(
    subscribeHash,
    () => window.location.hash.slice(1),
    () => "",
  );

/** A regular octahedron in CSS 3D: eight translucent faces around a glowing core. */
function Crystal({ className }: { className: string }) {
  return (
    <span aria-hidden className={`geo-crystal ${className}`}>
      {/* The core glow stays flat behind the faces, so it reads as light from inside at every angle. */}
      <span className="geo-crystal-core" />
      <span className="geo-crystal-lean">
        <span className="geo-crystal-spin">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <span key={i} className="geo-face" data-half={i < 4 ? "top" : "bottom"} style={{ "--k": i % 4 } as CSSProperties} />
          ))}
        </span>
      </span>
    </span>
  );
}

/* Shards drifting in the dark: left %, top %, size px, drift duration s, delay s. */
const SHARDS = [
  [6, 18, 14, 19, 0],
  [14, 72, 9, 23, -6],
  [31, 8, 7, 17, -3],
  [47, 88, 12, 26, -11],
  [63, 30, 6, 21, -8],
  [78, 64, 10, 18, -2],
  [91, 12, 8, 24, -14],
  [88, 90, 13, 28, -5],
] as const;

/** A panel cut from glass: chamfered corners, a refracting edge and light that follows the pointer. */
export function FxPanel({ kicker, title, actions, children }: { kicker: string; title: string; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="geo-pane" aria-labelledby={id}>
      <header className="geo-head">
        <div className="min-w-0">
          <p className="geo-kicker">{kicker}</p>
          <h2 id={id} className="geo-title">
            {title}
          </h2>
        </div>
        {actions ? <div className="geo-head-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** The counters as cut gems: iridescent figures that tilt and catch the light under the pointer. */
export function FxCounters({ stats, animate }: { stats: FxStat[]; animate: boolean }) {
  return (
    <div className="geo-counters">
      {stats.map((stat, i) => (
        <div key={stat.key} className="geo-counter" data-tone={stat.tone} style={{ "--i": i } as CSSProperties}>
          <span aria-hidden className="geo-glint" />
          <span aria-hidden className="geo-counter-icon">
            {stat.icon}
          </span>
          <p className="geo-kicker">{stat.label}</p>
          <p className="geo-counter-value">
            <CountUp value={stat.value} animate={animate} delay={200 + i * 110} />
          </p>
          <p className="geo-counter-note" suppressHydrationWarning>
            {stat.note}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The gem picker: every gem in view, the chosen one set in a ring. */
function GemPicker({ gem, onChoose }: { gem: AdminGemId; onChoose: (id: AdminGemId) => void }) {
  return (
    <fieldset className="geo-gems">
      <legend className="geo-gems-legend">
        Gem <span className="geo-gems-name">{adminGem(gem).label}</span>
      </legend>
      <div className="geo-gems-row">
        {ADMIN_GEMS.map((option) => (
          <label key={option.id} className="geo-gem" title={option.label} style={{ "--ga": option.a, "--gb": option.b, "--gc": option.c } as CSSProperties}>
            <input type="radio" name="geo-gem" value={option.id} checked={gem === option.id} onChange={() => onChoose(option.id)} className="sr-only" />
            <span aria-hidden className="geo-gem-stone" />
            <span className="sr-only">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function FlashyDashboard({
  style,
  motion,
  sound,
  onToggleSound,
  gem,
  onChooseGem,
  celebration,
  tools,
  views,
  children,
}: {
  /** The gem's custom properties (see gemStyle). */
  style: CSSProperties;
  motion: MotionLevel;
  /** The account's sound setting (shared with the Arcade and Code Admin). */
  sound: boolean;
  onToggleSound: () => void;
  gem: AdminGemId;
  onChooseGem: (id: AdminGemId) => void;
  celebration: FxCelebration;
  /** Rail buttons placed before the sound toggle. */
  tools: ReactNode;
  views: FxView[];
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);
  const hash = useHash();
  const view = views.find((item) => item.id === hash) ?? views[0];
  const viewIndex = views.indexOf(view);
  const full = motion === "full";
  const stone = adminGem(gem);

  // The pointer is a light source for counters (tilt), panels (rim light; read-only ones lean) and controls
  // (a pool of light; small ones are magnetic). Tool panels never move, so forms stay easy to use.
  useGeodeLight(rootRef, motion !== "off", full);
  useRipples(rootRef, rippleRef, motion !== "off");

  // The cave's light follows the pointer, and the crystals lean toward it. The values go straight onto the few
  // elements that read them (never the root, where every change would restyle the whole dashboard).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !full) return;
    const spot = root.querySelector<HTMLElement>(".geo-spot");
    const leans = [...root.querySelectorAll<HTMLElement>(".geo-crystal-lean")];
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      spot?.style.setProperty("--mx", `${(x - rect.left).toFixed(0)}px`);
      spot?.style.setProperty("--my", `${(y - rect.top).toFixed(0)}px`);
      const px = `${(((x - rect.left) / rect.width - 0.5) * 24).toFixed(2)}deg`;
      const py = `${(-((y - rect.top) / rect.height - 0.5) * 18).toFixed(2)}deg`;
      for (const lean of leans) {
        lean.style.setProperty("--px", px);
        lean.style.setProperty("--py", py);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    root.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      root.removeEventListener("pointermove", move);
      for (const el of [spot, ...leans]) for (const name of ["--mx", "--my", "--px", "--py"]) el?.style.removeProperty(name);
    };
  }, [full]);

  // Arriving at a view: back to its top, the chime, and the crystal answers with a pulse (the CSS crystallizes).
  const previous = useRef(view.id);
  useEffect(() => {
    if (previous.current === view.id) return;
    previous.current = view.id;
    mainRef.current?.scrollTo({ top: 0 });
    if (sound && motion !== "off") playGeodeSound("flight");
    if (full) {
      rootRef.current?.querySelector(".geo-centerpiece")?.animate([{ scale: 1 }, { scale: 1.12, filter: "brightness(1.6)" }, { scale: 1 }], { duration: 700, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" });
    }
  }, [view.id, sound, motion, full]);

  // A confirmed action: its moment's sound, and for the heavy ones (a crown landing, glass cracking) a jolt.
  const celebrated = useRef(celebration.n);
  useEffect(() => {
    if (celebrated.current === celebration.n) return;
    celebrated.current = celebration.n;
    const { moment } = celebration;
    if (sound) playGeodeSound(moment && motion !== "off" ? momentSound(moment) : "confirm");
    if (full && momentShakes(moment)) {
      const crack = moment?.kind === "fracture";
      mainRef.current?.animate(
        crack
          ? [{ translate: "0 0" }, { translate: "-9px 4px" }, { translate: "7px -5px" }, { translate: "-5px 3px" }, { translate: "3px -1px" }, { translate: "0 0" }]
          : [{ translate: "0 0" }, { translate: "0 9px" }, { translate: "0 -3px" }, { translate: "0 0" }],
        { duration: crack ? 420 : 380, delay: crack ? 0 : 560, easing: "ease-out" },
      );
    }
  }, [celebration, sound, motion, full]);

  function go(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (id === view.id) return;
    window.history.pushState(null, "", id === views[0].id ? window.location.pathname + window.location.search : `#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    if (sound) playGeodeSound("select");
  }

  return (
    <div ref={rootRef} className="geo -mb-24 h-[calc(100dvh-3.5rem-1px)] md:-mb-10" style={style} data-motion={motion} data-view={view.id}>
      <div aria-hidden className="geo-cave">
        <span className="geo-aurora geo-aurora-a" />
        <span className="geo-aurora geo-aurora-b" />
        <span className="geo-aurora geo-aurora-c" />
        <span className="geo-dust" />
        <Motes colors={[stone.a, stone.b, stone.c]} active={full} />
        {SHARDS.map(([left, top, size, duration, delay], i) => (
          <span
            key={i}
            className="geo-shard"
            style={{ left: `${left}%`, top: `${top}%`, "--size": `${size}px`, animationDuration: `${duration}s`, animationDelay: `${delay}s` } as CSSProperties}
          />
        ))}
        <Crystal className="geo-centerpiece" />
        <span className="geo-spot" />
      </div>

      {/* Each flight between views sends a prism beam across; a new gem floods the cave with its light;
          each confirmed action plays its moment. */}
      <span key={`beam-${view.id}`} aria-hidden className="geo-beam" />
      <span key={`wash-${gem}`} aria-hidden className="geo-wash" />
      {celebration.n > 0 ? <MomentOverlay key={celebration.n} moment={celebration.moment} /> : null}
      <div ref={rippleRef} aria-hidden className="geo-ripples" />

      <aside className="geo-rail">
        <div className="geo-brand">
          <Crystal className="geo-brand-gem" />
          <span className="min-w-0">
            <span className="geo-brand-title">Admin Dashboard</span>
            <span className="geo-brand-sub">Geode</span>
          </span>
        </div>
        <nav aria-label="Dashboard views" className="geo-nav">
          {views.map((item, i) => (
            <a
              key={item.id}
              href={item.id === views[0].id ? "#" : `#${item.id}`}
              className="geo-nav-link"
              aria-current={item.id === view.id ? "page" : undefined}
              onClick={(event) => go(event, item.id)}
              onPointerEnter={(event) => sound && event.pointerType === "mouse" && playGeodeSound("hover")}
              style={{ "--i": i } as CSSProperties}
            >
              <span aria-hidden className="geo-nav-icon">
                {item.icon}
              </span>
              <span className="geo-nav-label">{item.label}</span>
              {item.badge ? (
                <span className="geo-badge">
                  {item.badge}
                  <span className="sr-only"> queued</span>
                </span>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="geo-rail-foot">
          <GemPicker
            gem={gem}
            onChoose={(id) => {
              onChooseGem(id);
              if (sound) playGeodeSound("gem");
            }}
          />
          <div className="geo-tools">
            {tools}
            <button type="button" className="geo-tool" aria-pressed={sound} onClick={onToggleSound} title={sound ? "Sound on" : "Sound off"}>
              {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
              <span className="sr-only">Sound</span>
            </button>
          </div>
        </div>
      </aside>

      <div ref={mainRef} className="geo-main">
        {views.map((item, index) => (
          <div key={item.id} className={`geo-view geo-view-${item.id}`} hidden={item.id !== view.id}>
            <header className="geo-viewhead">
              <div className="min-w-0">
                <p className="geo-kicker">
                  <span aria-hidden className="geo-viewhead-index">
                    {String(index + 1).padStart(2, "0")}
                    <span> / {String(views.length).padStart(2, "0")}</span>
                  </span>
                  {item.kicker}
                </p>
                <h1 className="geo-viewtitle" data-text={item.title}>
                  {item.title}
                </h1>
              </div>
              {item.aside ? <div className="geo-viewaside">{item.aside}</div> : null}
            </header>
            {item.slots.map((slot, i) => (
              <div key={slot.id} className="geo-slot" data-geo-slot={slot.id} data-pose={slot.pose} style={{ "--i": i + 1 } as CSSProperties}>
                {slot.node}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {view.label}, {viewIndex + 1} of {views.length}
      </p>
      {children}
    </div>
  );
}
