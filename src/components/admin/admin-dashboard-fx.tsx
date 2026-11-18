"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useCardTilt } from "@/components/showcase/card-tilt";
import { playGeodeSound } from "@/components/vault/vault-audio";
import { ADMIN_GEMS, adminGem, type AdminGemId } from "@/lib/admin-gems";
import type { MotionLevel } from "@/lib/preferences";
import { CountUp } from "./admin-ui";
import "./admin-dashboard-fx.css";

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

/* The burst after a confirmed action: one shard every ~26°, with a little spread. */
const BURST = Array.from({ length: 14 }, (_, i) => ({ angle: i * 25.7 + ((i * 37) % 11), distance: 160 + ((i * 53) % 120), spin: ((i * 97) % 360) - 180 }));

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
        <div key={stat.key} className="geo-counter" data-card data-tone={stat.tone} style={{ "--i": i } as CSSProperties}>
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
  success,
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
  /** Bumped after each confirmed action, for the shard burst. */
  success: number;
  /** Rail buttons placed before the sound toggle. */
  tools: ReactNode;
  views: FxView[];
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const hash = useHash();
  const view = views.find((item) => item.id === hash) ?? views[0];
  const viewIndex = views.indexOf(view);
  const full = motion === "full";

  // Counters tilt under the pointer; panels only catch its light (they stay still to be easy to use).
  useCardTilt(rootRef, full);
  useCardTilt(rootRef, motion !== "off", ".geo-pane, .geo .dash-panel");

  // The cave's light follows the pointer: --mx/--my for the glow, --px/--py to lean the crystal.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !full) return;
    let frame = 0;
    let x = 0;
    let y = 0;
    const apply = () => {
      frame = 0;
      const rect = root.getBoundingClientRect();
      root.style.setProperty("--mx", `${(x - rect.left).toFixed(0)}px`);
      root.style.setProperty("--my", `${(y - rect.top).toFixed(0)}px`);
      root.style.setProperty("--px", `${(((x - rect.left) / rect.width - 0.5) * 24).toFixed(2)}deg`);
      root.style.setProperty("--py", `${(-((y - rect.top) / rect.height - 0.5) * 18).toFixed(2)}deg`);
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
      for (const name of ["--mx", "--my", "--px", "--py"]) root.style.removeProperty(name);
    };
  }, [full]);

  // Arriving at a view: back to its top, and the chime (the CSS does the crystallizing).
  const previous = useRef(view.id);
  useEffect(() => {
    if (previous.current === view.id) return;
    previous.current = view.id;
    mainRef.current?.scrollTo({ top: 0 });
    if (sound && motion !== "off") playGeodeSound("flight");
  }, [view.id, sound, motion]);

  const chimed = useRef(success);
  useEffect(() => {
    if (chimed.current === success) return;
    chimed.current = success;
    if (sound) playGeodeSound("confirm");
  }, [success, sound]);

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

      {/* Each flight between views sends a prism beam across; each confirmed action bursts into shards. */}
      <span key={`beam-${view.id}`} aria-hidden className="geo-beam" />
      {success > 0 ? (
        <span key={`burst-${success}`} aria-hidden className="geo-burst">
          <span className="geo-burst-flash" />
          {BURST.map((shard, i) => (
            <span key={i} className="geo-burst-shard" style={{ "--a": `${shard.angle}deg`, "--d": `${shard.distance}px`, "--r": `${shard.spin}deg` } as CSSProperties} />
          ))}
        </span>
      ) : null}

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
