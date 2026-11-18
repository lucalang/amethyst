"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useCardTilt } from "@/components/showcase/card-tilt";
import { playSanctumSound } from "@/components/vault/vault-audio";
import { ADMIN_LOOKS, adminLook, type AdminLookId } from "@/lib/admin-looks";
import type { MotionLevel } from "@/lib/preferences";
import { CountUp } from "./admin-ui";
import "./admin-dashboard-fx.css";

/**
 * The Flashy Admin Dashboard, built like Code Admin's sanctum: a full-height stage over the turning seal, a HUD
 * along the top (sigil, view pills, colour and sound), and one view at a time that flies in from depth, with its
 * side panels angled toward the viewer and its counters set on a curve. Pure CSS 3D (no WebGL), so there's no
 * scene to compile or fall back from. Everything here is presentation: the panels inside are the same tools,
 * with the same checks, as the Standard design. Colours follow the Code Admin colour choice through `--look-*`.
 */

export type FxStat = { key: string; label: string; value: number; note: string; icon: ReactNode; tone?: string };
/** A panel's place in its view. `left`/`right` angle toward the middle, `floor` leans back like a console. */
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

/** A panel in the sanctum's language: mono kicker, engraved title, glass. */
export function FxPanel({ kicker, title, actions, children }: { kicker: string; title: string; actions?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="dash-fx-pane" aria-labelledby={id}>
      <header className="dash-fx-head">
        <div className="min-w-0">
          <p className="dash-fx-kicker">{kicker}</p>
          <h2 id={id} className="dash-fx-title">
            {title}
          </h2>
        </div>
        {actions ? <div className="dash-fx-head-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** The counters, as Code Admin shows them: big glowing figures on a slight curve, tilting under the mouse. */
export function FxCounters({ stats, animate }: { stats: FxStat[]; animate: boolean }) {
  return (
    <div className="dash-fx-counters">
      {stats.map((stat, i) => (
        <div key={stat.key} className="dash-fx-counter" data-card data-tone={stat.tone} style={{ "--i": i } as CSSProperties}>
          <span aria-hidden className="dash-fx-glare" />
          <p className="dash-fx-kicker">{stat.label}</p>
          <p className="dash-fx-counter-value">
            <CountUp value={stat.value} animate={animate} delay={250 + i * 120} />
          </p>
          <p className="dash-fx-counter-note" suppressHydrationWarning>
            {stat.note}
          </p>
          <span aria-hidden className="dash-fx-counter-icon">
            {stat.icon}
          </span>
        </div>
      ))}
    </div>
  );
}

/** The colour picker in the HUD, shared with Code Admin (the same saved choice). */
function LookPicker({ look, onChoose }: { look: AdminLookId; onChoose: (id: AdminLookId) => void }) {
  const current = adminLook(look);
  return (
    <details className="dash-fx-look">
      <summary className="dash-fx-hud-button">
        <span aria-hidden className="dash-fx-swatch" style={{ "--swatch": current.swatch } as CSSProperties} />
        <span className="dash-fx-tool-label">
          <span className="sr-only">Admin colour: </span>
          {current.label}
        </span>
      </summary>
      <fieldset className="dash-fx-look-menu">
        <legend className="dash-fx-look-legend">Admin colours</legend>
        {ADMIN_LOOKS.map((option) => (
          <label key={option.id} className="dash-fx-look-option">
            <input type="radio" name="dash-fx-look" value={option.id} checked={look === option.id} onChange={() => onChoose(option.id)} className="sr-only" />
            <span aria-hidden className="dash-fx-swatch" style={{ "--swatch": option.swatch } as CSSProperties} />
            {option.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

export function FlashyDashboard({
  style,
  motion,
  sound,
  onToggleSound,
  look,
  onChooseLook,
  success,
  tools,
  views,
  children,
}: {
  style: CSSProperties;
  motion: MotionLevel;
  /** The account's sound setting (shared with the Arcade and Code Admin). */
  sound: boolean;
  onToggleSound: () => void;
  look: AdminLookId;
  onChooseLook: (id: AdminLookId) => void;
  /** Bumped after each confirmed action, for the success sweep. */
  success: number;
  /** HUD buttons placed before the colour and sound controls. */
  tools: ReactNode;
  views: FxView[];
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hash = useHash();
  const view = views.find((item) => item.id === hash) ?? views[0];
  const animate = motion !== "off";

  // Counters tilt under the mouse; the tool panels stay still so they're easy to operate.
  useCardTilt(rootRef, motion === "full");

  // Arriving at a view: back to its top, and the flight cue (the CSS does the flying).
  const previous = useRef(view.id);
  useEffect(() => {
    if (previous.current === view.id) return;
    previous.current = view.id;
    scrollerRef.current?.scrollTo({ top: 0 });
    if (sound && animate) playSanctumSound("flight");
  }, [view.id, sound, animate]);

  function go(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (id === view.id) return;
    window.history.pushState(null, "", id === views[0].id ? window.location.pathname + window.location.search : `#${id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    if (sound) playSanctumSound("select");
  }

  return (
    <div ref={rootRef} className="dash-fx -mb-24 h-[calc(100dvh-3.5rem-1px)] md:-mb-10" style={style} data-motion={motion} data-view={view.id}>
      <div aria-hidden className="dash-fx-backdrop">
        <span className="dash-fx-rays" />
        <span className="dash-fx-seal">
          <span className="dash-fx-seal-runes" />
          <span className="dash-fx-seal-sweep" />
          <span className="dash-fx-seal-inner" />
          <span className="dash-fx-seal-mark" />
          <span className="dash-fx-seal-core" />
        </span>
        {/* A ring leaves the seal on every flight (and once on arrival). */}
        <span key={view.id} className="dash-fx-pulse" />
        <span className="dash-fx-vignette" />
      </div>
      {success > 0 ? <span key={success} aria-hidden className="dash-fx-flash" /> : null}

      <header className="dash-fx-hud">
        <p className="dash-fx-brand">
          <span aria-hidden className="dash-fx-sigil" />
          <span className="dash-fx-brand-name">Admin Dashboard</span>
          <span className="dash-fx-brand-sub">Command</span>
        </p>
        <nav aria-label="Dashboard views" className="dash-fx-nav">
          {views.map((item) => (
            <a
              key={item.id}
              href={item.id === views[0].id ? "#" : `#${item.id}`}
              className="dash-fx-nav-link"
              aria-current={item.id === view.id ? "page" : undefined}
              onClick={(event) => go(event, item.id)}
              onPointerEnter={(event) => sound && event.pointerType === "mouse" && playSanctumSound("hover")}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge ? (
                <span className="dash-fx-badge">
                  {item.badge}
                  <span className="sr-only"> queued</span>
                </span>
              ) : null}
            </a>
          ))}
        </nav>
        <div className="dash-fx-tools">
          {tools}
          <LookPicker look={look} onChoose={onChooseLook} />
          <button type="button" className="dash-fx-hud-button" aria-pressed={sound} onClick={onToggleSound}>
            {sound ? <Volume2 aria-hidden className="size-3.5" /> : <VolumeX aria-hidden className="size-3.5" />}
            <span className="dash-fx-tool-label">{sound ? "Sound on" : "Sound off"}</span>
          </button>
        </div>
      </header>

      <div ref={scrollerRef} className="dash-fx-scroller">
        {views.map((item, index) => (
          <div key={item.id} className={`dash-fx-view dash-fx-view-${item.id}`} hidden={item.id !== view.id}>
            <header className="dash-fx-viewhead">
              <div className="min-w-0">
                <p className="dash-fx-kicker">
                  <span aria-hidden className="dash-fx-kicker-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {item.kicker}
                </p>
                <h1 className="dash-fx-viewtitle">{item.title}</h1>
              </div>
              {item.aside ? <div className="dash-fx-viewaside">{item.aside}</div> : null}
            </header>
            {item.slots.map((slot, i) => (
              <div key={slot.id} className="dash-fx-slot" data-fx-slot={slot.id} data-pose={slot.pose} style={{ "--i": i + 1 } as CSSProperties}>
                {slot.node}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {view.label}
      </p>
      {children}
    </div>
  );
}
