"use client";

import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Crown, Gauge, ShieldCheck } from "lucide-react";
import { useCardTilt } from "@/components/showcase/card-tilt";
import { playSanctumSound } from "@/components/vault/vault-audio";
import type { MotionLevel } from "@/lib/preferences";
import { DASHBOARD_CONTAINER } from "@/lib/admin-dashboard";
import "./admin-dashboard-fx.css";

/**
 * The Flashy Admin Dashboard: a cinematic command deck around the very same panels the Standard design shows.
 * Everything here is presentation (backdrop, HUD navigation, readouts, feedback); no action, check or data path
 * lives in this file. It's CSS-only (no WebGL), so it needs no scene and has nothing to fall back from, and the
 * backdrop never takes pointer events. Colours follow the Code Admin colour choice through `--look-*`.
 */

export type FxStat = { key: string; label: string; value: number; note: string; icon: ReactNode; tone?: string };
export type FxSection = { id: string; label: string; icon: ReactNode; blurb: string; badge?: number; content: ReactNode };

const sectionId = (id: string) => `dash-${id}`;

/** Counts up to `value` on first show (and from the old value on change); instant with motion off. */
function Readout({ value, animate }: { value: number; animate: boolean }) {
  const [shown, setShown] = useState(animate ? 0 : value);
  const from = useRef(animate ? 0 : value);
  useEffect(() => {
    if (!animate) {
      from.current = value;
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / 900);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, animate]);
  return <>{(animate ? shown : value).toLocaleString("en")}</>;
}

export function FlashyDashboard({
  style,
  motion,
  sound,
  success,
  me,
  stats,
  toolbar,
  sections,
  children,
}: {
  style: CSSProperties;
  motion: MotionLevel;
  /** The account's sound setting (shared with the Arcade and Code Admin). */
  sound: boolean;
  /** Bumped after each confirmed action, for the success sweep. */
  success: number;
  me: { name: string; role: string; owner: boolean };
  stats: FxStat[];
  toolbar: ReactNode;
  sections: FxSection[];
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const readoutsRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState("top");
  const [arrived, setArrived] = useState<{ id: string; n: number } | null>(null);
  const animate = motion !== "off";
  const nav = [{ id: "top", label: "Overview", icon: <Gauge aria-hidden className="size-4" />, badge: undefined as number | undefined }, ...sections];

  // Tilt only the summary readouts; data panels stay flat so they're easy to read and operate.
  useCardTilt(readoutsRef, motion === "full");

  // Scroll-spy: the section crossing the middle of the screen is the current one.
  useEffect(() => {
    const targets = rootRef.current?.querySelectorAll<HTMLElement>(".dash-fx-section") ?? [];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id.replace(/^dash-/, ""));
      },
      { rootMargin: "-40% 0px -55% 0px" },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, []);

  function go(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(sectionId(id));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: animate ? "smooth" : "auto", block: "start" });
    target.querySelector<HTMLElement>("[data-fx-heading]")?.focus({ preventScroll: true });
    window.history.replaceState(null, "", `#${sectionId(id)}`);
    setActive(id);
    setArrived((current) => ({ id, n: (current?.n ?? 0) + 1 }));
    if (sound) playSanctumSound("select");
  }

  return (
    <div ref={rootRef} className="dash-fx -mb-24 md:-mb-10" style={style} data-motion={motion}>
      <div aria-hidden className="dash-fx-sky">
        <span className="dash-fx-grid" />
        <span className="dash-fx-seal">
          <span className="dash-fx-seal-runes" />
          <span className="dash-fx-seal-sweep" />
          <span className="dash-fx-seal-mark" />
        </span>
        <span className="dash-fx-vignette" />
      </div>
      {success > 0 ? <span key={success} aria-hidden className="dash-fx-flash" /> : null}

      <nav aria-label="Dashboard sections" className="dash-fx-hud">
        <div className="dash-fx-hud-inner">
          <span aria-hidden className="dash-fx-sigil" />
          <ul className="dash-fx-nav">
            {nav.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${sectionId(item.id)}`}
                  className="dash-fx-link"
                  aria-current={active === item.id ? "location" : undefined}
                  onClick={(event) => go(event, item.id)}
                  onPointerEnter={(event) => sound && event.pointerType === "mouse" && playSanctumSound("hover")}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge ? <span className="dash-fx-badge">{item.badge}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <div className={`${DASHBOARD_CONTAINER} dash-fx-stage`}>
        <div className="dash-root dash-fx-root">
          <section id={sectionId("top")} aria-labelledby="dash-fx-title" className="dash-fx-section" data-arrived={arrived?.id === "top" ? arrived.n : undefined}>
            <header className="dash-fx-deck">
              <div className="dash-fx-deck-title">
                <p className="dash-fx-kicker">
                  <span aria-hidden className="dash-fx-kicker-line" />
                  Amethyst command
                </p>
                <h1 id="dash-fx-title" tabIndex={-1} data-fx-heading>
                  Admin Dashboard
                </h1>
                <p className="dash-fx-whoami">
                  Signed in as <strong>{me.name}</strong>
                  <span className="dash-pill" data-role={me.owner ? "owner" : "admin"}>
                    {me.owner ? <Crown aria-hidden className="size-3" /> : <ShieldCheck aria-hidden className="size-3" />}
                    {me.role}
                  </span>
                </p>
              </div>
              <div className="dash-fx-toolbar">{toolbar}</div>
            </header>

            <div ref={readoutsRef} className="dash-fx-readouts">
              {stats.map((stat, i) => (
                <div key={stat.key} className="dash-fx-readout" data-card data-tone={stat.tone} style={{ "--i": i } as CSSProperties}>
                  <span aria-hidden className="dash-fx-readout-glare" />
                  <p className="dash-label">{stat.label}</p>
                  <span className="dash-fx-readout-icon">{stat.icon}</span>
                  <p className="dash-fx-readout-value">
                    <Readout value={stat.value} animate={animate} />
                  </p>
                  <p className="dash-stat-note" suppressHydrationWarning>
                    {stat.note}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {sections.map((section, i) => (
            <section
              key={section.id}
              id={sectionId(section.id)}
              aria-labelledby={`${sectionId(section.id)}-title`}
              className="dash-fx-section"
              style={{ "--i": i + 1 } as CSSProperties}
              data-arrived={arrived?.id === section.id ? arrived.n : undefined}
            >
              <header className="dash-fx-heading" key={arrived?.id === section.id ? arrived.n : 0}>
                <span aria-hidden className="dash-fx-index">{String(i + 1).padStart(2, "0")}</span>
                <span aria-hidden className="dash-fx-heading-icon">
                  {section.icon}
                </span>
                <div className="min-w-0">
                  <h2 id={`${sectionId(section.id)}-title`} tabIndex={-1} data-fx-heading>
                    {section.label}
                  </h2>
                  <p>{section.blurb}</p>
                </div>
                <span aria-hidden className="dash-fx-rule" />
              </header>
              <div className="dash-fx-body">{section.content}</div>
            </section>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
