"use client";

import "./admin.css";
import {
  Component,
  createContext,
  lazy,
  Suspense,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import { Coins, Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { useMotionLevel, webglAvailable } from "@/components/showcase/motion";
import { closeVaultAudio, hushVault, playAdminBoot } from "@/components/vault/vault-audio";
import { RewardArt, rewardInfo, type VaultLooks } from "@/components/vault/vault-reveal";
import type { AdminSceneHandle, ConsoleSignal, SceneState } from "./admin-scene";
import { BOOT, BOOT_KEY, type BootKind } from "./admin-timing";
import { displayFont, systemFont } from "./system-font";

const AdminScene = lazy(() => import("./admin-scene"));

/** Rewards to show as satellites beside the window; achievement ids carry their prefix. */
export type ConsoleRewards = { coins: number; ids: string[]; looks: VaultLooks };

type ConsoleApi = {
  signal: (signal: ConsoleSignal) => void;
  setLayers: (count: number) => void;
  setStep: (step: number) => void;
  setRewards: (rewards: ConsoleRewards | null) => void;
};
const ConsoleContext = createContext<ConsoleApi>({ signal: () => {}, setLayers: () => {}, setStep: () => {}, setRewards: () => {} });
const SideContext = createContext<HTMLElement | null>(null);

/** Cues for the 3D window: step changes, the pending publish, publish and draft confirmations, errors. */
export const useConsole = () => use(ConsoleContext);

/** Where a page's side column goes on wide screens: the side window beside the System window (null: inline). */
export const useConsoleSide = () => use(SideContext);

/** How many system sheets wait behind the window (the builder's remaining steps, for example). */
export function useConsoleLayers(count: number) {
  const { setLayers } = useConsole();
  useEffect(() => setLayers(count), [count, setLayers]);
}

/** Turns the window's step mechanism to `step` (0-based, of five including Publish). */
export function useConsoleStep(step: number) {
  const { setStep } = useConsole();
  useEffect(() => {
    setStep(step);
    return () => setStep(-1);
  }, [step, setStep]);
}

/** Shows rewards as satellites in the scene while the calling page is mounted. */
export function useConsoleRewards(rewards: ConsoleRewards | null) {
  const { setRewards } = useConsole();
  const key = rewards && (rewards.coins > 0 || rewards.ids.length > 0) ? `${rewards.coins}|${rewards.ids.join(",")}` : "";
  const latest = useEffectEvent(() => rewards);
  useEffect(() => {
    setRewards(key ? latest() : null);
    return () => setRewards(null);
  }, [key, setRewards]);
}

const noSubscribe = () => () => {};
const WIDE = "(min-width: 80rem)";
const subscribeWide = (onChange: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

/** A failed scene chunk (offline, blocked) leaves the drawn window in place instead of breaking the page. */
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
 * The admin panel as one System window summoned into the vault: a Three.js scene around page
 * elements that are mapped onto its 3D surfaces. It persists across admin pages, so the summoning
 * plays once (full the first time per tab session, short afterwards) and can be skipped with any key
 * or click.
 */
export function AdminConsole({ children }: { children: ReactNode }) {
  return (
    <ArcadeProvider>
      <Shell>{children}</Shell>
    </ArcadeProvider>
  );
}

/** pending: waiting for the scene; full/short: summoning; late/none/done: content shown. */
type Intro = "pending" | BootKind | "done";
/** How long the content waits for the scene before showing without the summoning. */
const SCENE_WAIT = 2200;
const MAX_SATS = 6;

function Shell({ children }: { children: ReactNode }) {
  const motion = useMotionLevel();
  const { sound, toggleSound } = useArcade();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const canWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const [scene, setScene] = useState<"loading" | "ready" | "failed">("loading");
  const [intro, setIntro] = useState<Intro>("pending");
  const [rewards, setRewardState] = useState<ConsoleRewards | null>(null);
  const [sideEl, setSideEl] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const satsRef = useRef<HTMLDivElement>(null);
  const engine = useRef<AdminSceneHandle>(null);
  const state = useRef<SceneState>({ layers: 2, step: -1, rewards: 0 });
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
        state.current.layers = count;
        engine.current?.setLayers(count);
      },
      setStep: (step) => {
        state.current.step = step;
        engine.current?.setStep(step);
      },
      setRewards: (next) => {
        const count = next ? (next.coins > 0 ? 1 : 0) + next.ids.length : 0;
        state.current.rewards = count;
        engine.current?.setRewards(count);
        setRewardState(next);
      },
    }),
    [],
  );
  const attachSide = useCallback((el: HTMLDivElement | null) => {
    sideRef.current = el;
    setSideEl(el);
  }, []);

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
      <SideContext value={wide ? sideEl : null}>
        <div
          className={cn("ax-stage", systemFont.variable, displayFont.variable)}
          data-scene={webgl ? scene : "none"}
          data-intro={shown}
          style={{ "--ax-live": `${activating ? BOOT[shown].live : 0}ms` } as CSSProperties}
        >
          {webgl ? (
            <SceneBoundary onError={fail}>
              <Suspense fallback={null}>
                <AdminScene ref={engine} panel={panelRef} side={sideRef} sats={satsRef} motion={motion} state={state} onReady={ready} onFail={fail} />
              </Suspense>
            </SceneBoundary>
          ) : null}
          {shown === "pending" ? (
            <div className="ax-loader" role="status">
              <span aria-hidden className="ax-loader-seam" />
              <span className="ax-loader-text">Summoning the System</span>
            </div>
          ) : null}
          <div ref={attachSide} className="ax-side" />
          <div ref={panelRef} className="ax-console">
            <span aria-hidden className="ax-glare">
              <span />
            </span>
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
          <div ref={satsRef} aria-hidden className="ax-sats">
            {wide && rewards ? <Satellites rewards={rewards} /> : null}
          </div>
          {activating ? (
            <button type="button" className="ax-skip" onClick={skip}>
              Skip summoning
            </button>
          ) : null}
        </div>
      </SideContext>
    </ConsoleContext>
  );
}

/** The selected rewards as tokens beside the window, with their real artwork (the scene adds plates and tethers). */
function Satellites({ rewards }: { rewards: ConsoleRewards }) {
  const keys = [...(rewards.coins > 0 ? ["coins"] : []), ...rewards.ids];
  const shown = keys.length > MAX_SATS ? keys.slice(0, MAX_SATS - 1) : keys;
  const extra = keys.length - shown.length;
  return (
    <>
      {shown.map((key) => (
        <div key={key} className="ax-sat" data-sat={key}>
          <span className="ax-sat-art">
            {key === "coins" ? (
              <span className="vx-coin" data-size="card">
                <Coins />
              </span>
            ) : (
              <RewardArt id={key} size="card" looks={rewards.looks} />
            )}
          </span>
          <span className="ax-sat-name">{key === "coins" ? `${rewards.coins.toLocaleString("en")} coins` : rewardInfo(key).name}</span>
        </div>
      ))}
      {extra > 0 ? (
        <div className="ax-sat" data-sat="more">
          <span className="ax-sat-art ax-sat-more">+{extra}</span>
          <span className="ax-sat-name">More rewards</span>
        </div>
      ) : null}
    </>
  );
}
