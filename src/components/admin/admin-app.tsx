"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { useMotionLevel } from "@/components/showcase/motion";
import { closeVaultAudio, playSanctumIntro, playSanctumSound, startSanctumCharge, type SanctumSound } from "@/components/vault/vault-audio";
import type { VaultLooks } from "@/components/vault/vault-reveal";
import { apiFetch } from "@/lib/api-client";
import type { AdminCodeDetail, AdminSnapshot } from "@/lib/vault-admin";
import { cloneConfig } from "./admin-config";
import { Codes } from "./admin-codes";
import { Detail } from "./admin-detail";
import { Forge, type ForgeSeed } from "./admin-forge";
import type { StationId } from "./admin-layout";
import { Overview } from "./admin-overview";
import type { RewardContext } from "./admin-rewards";
import { AdminStage } from "./admin-stage";
import { INTRO, INTRO_KEY, type IntroKind } from "./admin-timing";
import { NavigateProvider, NavLink } from "./admin-ui";
import "./admin.css";

export type AdminInitial = { snapshot: AdminSnapshot; catalog: RewardContext["catalog"]; looks: VaultLooks };

function parseRoute(pathname: string): { station: StationId; id: string | null } {
  const [first, second] = pathname.replace(/^\/admin\/?/, "").split("/");
  if (first === "codes" && second) return { station: "detail", id: decodeURIComponent(second) };
  if (first === "codes") return { station: "codes", id: null };
  if (first === "new") return { station: "forge", id: null };
  return { station: "overview", id: null };
}

const TITLES: Record<StationId, string> = { overview: "Overview", codes: "Codes", detail: "Code details", forge: "Forge" };
const NAV: { href: string; label: string; stations: StationId[] }[] = [
  { href: "/admin", label: "Overview", stations: ["overview"] },
  { href: "/admin/codes", label: "Codes", stations: ["codes", "detail"] },
  { href: "/admin/new", label: "Forge", stations: ["forge"] },
];

/** The full intro once per browser session, a short one afterwards. */
function introKind(): IntroKind {
  try {
    return window.sessionStorage.getItem(INTRO_KEY) ? "short" : "full";
  } catch {
    return "short";
  }
}

/** The admin dashboard: one persistent app for every /admin URL, flying between views inside one 3D scene. */
export function AdminApp({ initial }: { initial: AdminInitial }) {
  return (
    <ArcadeProvider>
      <Sanctum initial={initial} />
    </ArcadeProvider>
  );
}

function Sanctum({ initial }: { initial: AdminInitial }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const route = parseRoute(pathname);
  const motion = useMotionLevel();
  const { rootRef, sound: soundOn, toggleSound } = useArcade();
  const [snapshot, setSnapshot] = useState(initial.snapshot);
  const context = useMemo<RewardContext>(() => ({ catalog: initial.catalog, looks: initial.looks }), [initial.catalog, initial.looks]);
  const [intro] = useState<IntroKind>(() => (typeof window === "undefined" ? "full" : introKind()));
  const [detailId, setDetailId] = useState(route.id);
  if (route.id && route.id !== detailId) setDetailId(route.id);
  const [forgeSeed, setForgeSeed] = useState<ForgeSeed>(() =>
    route.station === "forge" ? { key: 0, draft: params.get("draft") ?? undefined, clone: params.get("clone") ?? undefined } : { key: 0 },
  );
  const [announcement, setAnnouncement] = useState("");

  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);
  const sound = useCallback((name: SanctumSound) => {
    if (soundRef.current) playSanctumSound(name);
  }, []);
  const startCharge = useCallback(() => (soundRef.current ? startSanctumCharge() : null), []);

  const navigate = useCallback((href: string) => {
    if (href !== window.location.pathname + window.location.search) window.history.pushState(null, "", href);
  }, []);

  const refresh = useCallback(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    apiFetch<AdminSnapshot>(`/api/admin/vault/overview?tz=${encodeURIComponent(timeZone)}`).then(setSnapshot, () => {
      // Keep showing the last snapshot; the next refresh tries again.
    });
  }, []);

  // Stats in the admin's own time zone right away, then fresh numbers every 30 s while the tab is visible.
  useEffect(() => {
    refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => () => closeVaultAudio(), []);

  const previous = useRef(route.station);
  useEffect(() => {
    if (previous.current === route.station) return;
    previous.current = route.station;
    if (motion !== "off") sound("flight");
  }, [route.station, motion, sound]);

  const newForge = useCallback(
    (seed: Omit<ForgeSeed, "key"> = {}) => {
      setForgeSeed((current) => ({ ...seed, key: current.key + 1 }));
      navigate(`/admin/new${seed.draft ? `?draft=${seed.draft}` : seed.clone ? `?clone=${seed.clone}` : ""}`);
    },
    [navigate],
  );
  const cloneCode = useCallback((code: AdminCodeDetail) => newForge({ clone: code.id, config: cloneConfig(code, Date.now()) }), [newForge]);

  const hud = (
    <header className="cs-hud">
      <p className="cs-hud-title">
        <span aria-hidden className="cs-hud-sigil" />
        <span>Crimson Sanctum</span>
        <span className="cs-hud-sub">Vault codes</span>
      </p>
      <nav aria-label="Admin views" className="cs-hud-nav">
        {NAV.map((item) => (
          <NavLink key={item.href} href={item.href} className="cs-hud-link" aria-current={item.stations.includes(route.station) ? "page" : undefined}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="cs-hud-tools">
        <button type="button" className="cs-hud-button cs-hud-skip">
          Skip intro
        </button>
        <button type="button" className="cs-hud-button" aria-pressed={soundOn} onClick={() => void toggleSound()}>
          {soundOn ? "Sound on" : "Sound off"}
        </button>
      </div>
    </header>
  );

  return (
    <NavigateProvider value={navigate}>
      <div ref={rootRef} tabIndex={-1} className="cs-host -mb-24 h-[calc(100dvh-3.5rem-1px)] outline-none md:-mb-10">
        <AdminStage
          station={route.station}
          motion={motion}
          intro={motion === "off" ? null : intro}
          sound={sound}
          onStart={(kind) => {
            if (kind && soundRef.current) playSanctumIntro(INTRO[kind], kind === "full");
          }}
          onIntroDone={() => {
            try {
              window.sessionStorage.setItem(INTRO_KEY, "1");
            } catch {
              // Private mode: the full intro simply plays again next time.
            }
          }}
          onArrived={(station) => setAnnouncement(TITLES[station])}
          hud={hud}
        >
          <Overview snapshot={snapshot} animate={motion !== "off"} current={route.station === "overview"} />
          <Codes snapshot={snapshot} onNewCode={() => newForge()} onContinueDraft={(id) => newForge({ draft: id })} onDraftDeleted={refresh} />
          {detailId ? <Detail key={detailId} id={detailId} fallbackNow={snapshot.now} context={context} sound={sound} onChanged={refresh} onClone={cloneCode} /> : null}
          <Forge
            key={forgeSeed.key}
            seed={forgeSeed}
            drafts={snapshot.drafts}
            context={context}
            motion={motion}
            fallbackNow={snapshot.now}
            sound={sound}
            startCharge={startCharge}
            onNew={() => newForge()}
            onDraftSaved={refresh}
            onPublished={refresh}
          />
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </AdminStage>
      </div>
    </NavigateProvider>
  );
}
