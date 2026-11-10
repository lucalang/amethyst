"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { PageContainer } from "@/components/layout/app-shell";
import { useSettings } from "@/components/layout/settings-context";
import { useMotionLevel } from "@/components/showcase/motion";
import { closeVaultAudio, playSanctumForge, playSanctumIntro, playSanctumSound, startSanctumCharge, type SanctumSound } from "@/components/vault/vault-audio";
import type { VaultLooks } from "@/components/vault/vault-reveal";
import { ADMIN_LOOKS, adminLook, type AdminLookId } from "@/lib/admin-looks";
import { apiFetch } from "@/lib/api-client";
import { BASE_PALETTE, paletteStyle, paletteUniform } from "@/lib/palette-variants";
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
import { AdminLookProvider, NavigateProvider, NavLink } from "./admin-ui";
import "./admin.css";
import "./admin-plain.css";

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

/** The colour picker in the header: the chosen colour on the button, every colour in its menu. */
function LookPicker({ look, plain, onChoose }: { look: AdminLookId; plain: boolean; onChoose: (id: AdminLookId) => void }) {
  const current = adminLook(look);
  const swatch = (option: (typeof ADMIN_LOOKS)[number]) => ({ "--swatch": plain ? option.plain : option.swatch }) as CSSProperties;
  return (
    <details className="cs-look">
      <summary className={plain ? "cs-button cs-button-small" : "cs-hud-button"}>
        <span aria-hidden className="cs-look-swatch" style={swatch(current)} />
        <span className="cs-look-name">
          <span className="sr-only">Admin colour: </span>
          {current.label}
        </span>
      </summary>
      <fieldset className="cs-look-menu">
        <legend className="cs-look-legend">Admin colours</legend>
        {ADMIN_LOOKS.map((option) => (
          <label key={option.id} className="cs-look-option">
            <input type="radio" name="cs-look" value={option.id} checked={look === option.id} onChange={() => onChoose(option.id)} className="sr-only" />
            <span aria-hidden className="cs-look-swatch" style={swatch(option)} />
            {option.label}
          </label>
        ))}
      </fieldset>
    </details>
  );
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
  const settings = useSettings();
  const plain = !settings.specialPages;
  const router = useRouter();
  const [look, setLook] = useState<AdminLookId>(settings.adminLook);
  const current = adminLook(look);
  const chooseLook = useCallback(
    async (next: AdminLookId) => {
      setLook(next);
      try {
        await apiFetch("/api/preferences", { method: "PATCH", json: { settings: { adminLook: next } } });
        router.refresh();
      } catch {
        toast.error("Could not save the Admin colours. They apply until you leave this page.");
      }
    },
    [router],
  );
  // The scene and its stylesheet follow --look-*; the standard design takes the variant as its accent.
  const lookContext = useMemo(() => {
    const variant = adminLook(look);
    const style = !plain
      ? paletteStyle(variant.palette)
      : variant.palette === BASE_PALETTE
        ? undefined
        : ({
            "--amethyst": `color-mix(in oklab, ${variant.plain} 72%, var(--foreground))`,
            "--primary": variant.plain,
            "--primary-foreground": variant.palette.ink,
            "--ring": variant.plain,
          } as CSSProperties);
    return { className: plain ? ("cs-plain" as const) : ("cs-fancy" as const), style };
  }, [look, plain]);
  const lookStyle = lookContext.style;
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
  const startForge = useCallback((...cues: Parameters<typeof playSanctumForge>) => (soundRef.current ? playSanctumForge(...cues) : null), []);

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
    if (!plain && motion !== "off") sound("flight");
  }, [route.station, motion, sound, plain]);

  const newForge = useCallback(
    (seed: Omit<ForgeSeed, "key"> = {}) => {
      setForgeSeed((current) => ({ ...seed, key: current.key + 1 }));
      navigate(`/admin/new${seed.draft ? `?draft=${seed.draft}` : seed.clone ? `?clone=${seed.clone}` : ""}`);
    },
    [navigate],
  );
  const cloneCode = useCallback((code: AdminCodeDetail) => newForge({ clone: code.id, config: cloneConfig(code, Date.now()) }), [newForge]);

  const hud = plain ? (
    <header className="cs-header">
      <div className="cs-header-title">
        <h1>Admin</h1>
        <p>Vault codes · {TITLES[route.station]}</p>
      </div>
      <nav aria-label="Admin views" className="cs-nav">
        {NAV.map((item) => (
          <NavLink key={item.href} href={item.href} className="cs-nav-link" aria-current={item.stations.includes(route.station) ? "page" : undefined}>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <LookPicker look={look} plain onChoose={(id) => void chooseLook(id)} />
      <button type="button" className="cs-button cs-button-small" aria-pressed={soundOn} onClick={() => void toggleSound()}>
        {soundOn ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
        {soundOn ? "Sound on" : "Sound off"}
      </button>
    </header>
  ) : (
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
        <LookPicker look={look} plain={false} onChoose={(id) => void chooseLook(id)} />
        <button type="button" className="cs-hud-button cs-hud-skip">
          Skip intro
        </button>
        <button type="button" className="cs-hud-button" aria-pressed={soundOn} onClick={() => void toggleSound()}>
          {soundOn ? "Sound on" : "Sound off"}
        </button>
      </div>
    </header>
  );

  const stage = (
    <AdminStage
      plain={plain}
      station={route.station}
      motion={motion}
      palette={paletteUniform(current.palette)}
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
        startForge={startForge}
        onNew={() => newForge()}
        onDraftSaved={refresh}
        onPublished={refresh}
      />
      <p className="sr-only" aria-live="polite">
        {plain ? TITLES[route.station] : announcement}
      </p>
    </AdminStage>
  );

  return (
    <NavigateProvider value={navigate}>
      <AdminLookProvider value={lookContext}>
        {plain ? (
          <PageContainer>
            <div ref={rootRef} tabIndex={-1} className="cs-plain outline-none" style={lookStyle}>
              {stage}
            </div>
          </PageContainer>
        ) : (
          <div className="cs-fancy contents" style={lookStyle}>
            <div ref={rootRef} tabIndex={-1} className="cs-host -mb-24 h-[calc(100dvh-3.5rem-1px)] outline-none md:-mb-10">
              {stage}
            </div>
          </div>
        )}
      </AdminLookProvider>
    </NavigateProvider>
  );
}
