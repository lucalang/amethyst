"use client";

import "./admin.css";
import { Component, createContext, lazy, Suspense, use, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { useMotionLevel, webglAvailable } from "@/components/showcase/motion";
import { closeVaultAudio, hushVault, playAdminBoot } from "@/components/vault/vault-audio";
import type { AdminSceneHandle, ConsoleSignal } from "./admin-scene";
import { BOOT, BOOT_KEY, type BootKind } from "./admin-timing";
import { displayFont, systemFont } from "./system-font";

const AdminScene = lazy(() => import("./admin-scene"));

type ConsoleApi = { signal: (signal: ConsoleSignal) => void; setLayers: (count: number) => void };
const ConsoleContext = createContext<ConsoleApi>({ signal: () => {}, setLayers: () => {} });

/** Cues for the 3D console: step changes, publish and draft confirmations, errors. */
export const useConsole = () => use(ConsoleContext);

/** How many system planes wait behind the console (the builder's remaining steps, for example). */
export function useConsoleLayers(count: number) {
  const { setLayers } = useConsole();
  useEffect(() => setLayers(count), [count, setLayers]);
}

const noSubscribe = () => () => {};

/** A failed scene chunk (offline, blocked) leaves the drawn console in place instead of breaking the page. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The admin panel as one floating system console: a Three.js scene around a page element that is
 * mapped onto the 3D glass. It persists across admin pages, so the activation plays once (full
 * the first time per tab session, short afterwards) and can be skipped with any key or click.
 */
export function AdminConsole({ children }: { children: ReactNode }) {
  return (
    <ArcadeProvider>
      <Shell>{children}</Shell>
    </ArcadeProvider>
  );
}

/** pending: waiting for the scene; full/short: activating; late/none/done: content shown. */
type Intro = "pending" | BootKind | "done";
/** How long the content waits for the scene before showing without the activation. */
const SCENE_WAIT = 2200;

function Shell({ children }: { children: ReactNode }) {
  const motion = useMotionLevel();
  const { sound, toggleSound } = useArcade();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const canWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => false);
  const [scene, setScene] = useState<"loading" | "ready" | "failed">("loading");
  const [intro, setIntro] = useState<Intro>("pending");
  const panelRef = useRef<HTMLDivElement>(null);
  const engine = useRef<AdminSceneHandle>(null);
  const layers = useRef(2);
  const repeat = useRef(false);
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  const webgl = hydrated && canWebgl && scene !== "failed";
  const shown: Intro = !hydrated ? "pending" : intro === "pending" && (!webgl || motion === "off") ? "none" : intro;
  const activating = shown === "full" || shown === "short";

  useEffect(() => {
    try {
      repeat.current = sessionStorage.getItem(BOOT_KEY) === "1";
      sessionStorage.setItem(BOOT_KEY, "1");
    } catch {
      repeat.current = false;
    }
    return () => closeVaultAudio();
  }, []);

  // A slow scene doesn't hold the content back; it assembles around it when it arrives.
  useEffect(() => {
    if (shown !== "pending") return;
    const id = window.setTimeout(() => setIntro((current) => (current === "pending" ? "late" : current)), SCENE_WAIT);
    return () => window.clearTimeout(id);
  }, [shown]);

  const skipNow = useEffectEvent(() => skip());
  useEffect(() => {
    if (!activating) return;
    const id = window.setTimeout(() => setIntro("done"), BOOT[shown].total);
    window.addEventListener("keydown", skipNow);
    window.addEventListener("pointerdown", skipNow);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", skipNow);
      window.removeEventListener("pointerdown", skipNow);
    };
  }, [activating, shown]);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    engine.current?.signal("page");
  }, [pathname]);

  const api = useMemo<ConsoleApi>(
    () => ({
      signal: (signal) => engine.current?.signal(signal),
      setLayers: (count) => {
        layers.current = count;
        engine.current?.setLayers(count);
      },
    }),
    [],
  );

  function skip() {
    engine.current?.skip();
    hushVault();
    setIntro("done");
  }

  function ready() {
    setScene("ready");
    if (intro === "pending" && motion !== "off") {
      const kind: BootKind = motion === "subtle" || repeat.current ? "short" : "full";
      engine.current?.start(kind);
      setIntro(kind);
      if (sound) playAdminBoot(kind);
    } else engine.current?.start(intro === "late" && motion !== "off" ? "late" : "none");
  }

  function fail() {
    setScene("failed");
    hushVault();
    setIntro((current) => (current === "pending" || current === "full" || current === "short" ? "none" : current));
  }

  return (
    <ConsoleContext value={api}>
      <div
        className={cn("ax-stage", systemFont.variable, displayFont.variable)}
        data-scene={webgl ? scene : "none"}
        data-intro={shown}
        style={{ "--ax-live": `${activating ? BOOT[shown].live : 0}ms` } as CSSProperties}
      >
        <div aria-hidden className="ax-sky" />
        {webgl ? (
          <SceneBoundary onError={fail}>
            <Suspense fallback={null}>
              <AdminScene ref={engine} panel={panelRef} motion={motion} layers={layers} onReady={ready} onFail={fail} />
            </Suspense>
          </SceneBoundary>
        ) : null}
        <div ref={panelRef} className="ax-console">
          <div className="ax-console-bar">
            <span aria-hidden className="ax-console-mark" />
            <span className="ax-console-id">
              System <span className="ax-console-sub">Vault admin</span>
            </span>
            <button type="button" className="ax-icon-btn ax-console-sound" aria-pressed={sound} aria-label={sound ? "Mute panel sounds" : "Play panel sounds"} onClick={toggleSound}>
              {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
            </button>
          </div>
          <div className="ax-console-screen">{children}</div>
        </div>
        {activating ? (
          <button type="button" className="ax-skip" onClick={skip}>
            Skip activation
          </button>
        ) : null}
      </div>
    </ConsoleContext>
  );
}
