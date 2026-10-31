"use client";

import "./admin.css";
import {
  Component,
  createContext,
  lazy,
  Suspense,
  use,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "cn";
import { Volume2, VolumeX } from "lucide-react";
import { ArcadeProvider, useArcade } from "@/components/arcade/game-shell";
import { useMotionLevel, webglAvailable } from "@/components/showcase/motion";
import { closeVaultAudio, hushVault, playAdminBoot, playAdminSound } from "@/components/vault/vault-audio";
import type { MotionLevel } from "@/lib/preferences";
import { decode, type Decoder } from "./admin-decode";
import type { AdminSceneHandle, ConsoleSignal } from "./admin-scene";
import { BOOT_KEY, CLOSE, CLOSE_SPLIT, FOLD, OPEN, type OpenKind, type RevealKind } from "./admin-timing";
import { displayFont, systemFont } from "./system-font";

const AdminScene = lazy(() => import("./admin-scene"));

type ConsoleApi = {
  /** Cues for the window: the pending publish, publish and draft confirmations, errors. */
  signal: (signal: ConsoleSignal) => void;
  /** Folds the window into a strip, commits `change` there, then opens the new state from it. */
  shift: (change: () => void) => void;
  /** Closes the window into a strip, then navigates to `href`; the next page opens from it. */
  leave: (href: string) => void;
};
const ConsoleContext = createContext<ConsoleApi>({ signal: () => {}, shift: (change) => change(), leave: () => {} });

export const useConsole = () => use(ConsoleContext);

/** A link inside the window that closes it before navigating. Modifier clicks behave like any link. */
export function ConsoleLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href" | "onNavigate"> & { href: string }) {
  const { leave } = useConsole();
  return (
    <Link
      href={href}
      {...props}
      onNavigate={(event) => {
        event.preventDefault();
        leave(href);
      }}
    />
  );
}

const noSubscribe = () => () => {};

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
 * The admin panel as one floating System window over the vault: a Three.js frame, glass and light
 * bars around page elements mapped onto the tilted surface. It persists across admin pages, so the
 * opening plays once (full the first time per tab session, short afterwards; skippable with any key or
 * click), while steps and pages fold into a strip and reopen.
 */
export function AdminConsole({ children }: { children: ReactNode }) {
  return (
    <ArcadeProvider>
      <Shell>{children}</Shell>
    </ArcadeProvider>
  );
}

/** pending: waiting for the scene; full/short: opening; late/none/done: content shown. */
type Intro = "pending" | "full" | "short" | "late" | "none" | "done";
/** How long the content waits for the scene before showing without the opening. */
const SCENE_WAIT = 2200;
/** How long a closed window waits for the next page before opening again anyway. */
const LEAVE_WAIT = 5000;
const STRIP = "inset(49% 0 49% 0)";

type Live = { scene: boolean; motion: MotionLevel; sound: boolean; intro: Intro };

function Shell({ children }: { children: ReactNode }) {
  const motion = useMotionLevel();
  const { sound, toggleSound } = useArcade();
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const canWebgl = useSyncExternalStore(noSubscribe, webglAvailable, () => false);
  const [scene, setScene] = useState<"loading" | "ready" | "failed">("loading");
  const [intro, setIntro] = useState<Intro>("pending");
  const stageRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const engine = useRef<AdminSceneHandle>(null);
  const live = useRef<Live>({ scene: false, motion, sound, intro: "pending" });
  const repeat = useRef(false);
  const fallbackPlayed = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const lastPath = useRef(pathname);

  const webgl = hydrated && canWebgl && scene !== "failed";
  const shown: Intro = !hydrated ? "pending" : intro === "pending" && (!webgl || motion === "off") ? "none" : intro;
  const opening = shown === "full" || shown === "short";

  useEffect(() => {
    live.current = { scene: webgl && scene === "ready", motion, sound, intro: shown };
  });

  /** Everything transitions share: timers, the running decode and control fades, the fallback clip. */
  const fx = useMemo(() => {
    const timers = new Set<number>();
    let decoder: Decoder | null = null;
    let fades: Animation[] = [];
    let clip: Animation | null = null;
    let queue: (() => void)[] | null = null;
    let leaving = false;

    const later = (ms: number, run: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        run();
      }, ms);
      timers.add(id);
    };
    const settle = () => {
      decoder?.finish();
      decoder = null;
      for (const fade of fades) fade.finish();
      fades = [];
    };
    /** Text decoding and the controls' late arrival, in step with an opening of `kind`. */
    const play = (kind: OpenKind) => {
      settle();
      const panel = panelRef.current;
      const t = OPEN[kind];
      if (!panel || live.current.motion === "off" || t.decode[0] < 0) return;
      decoder = decode(panel, t.decode[0], t.decode[1]);
      if (t.controls <= 0) return;
      fades = [...panel.querySelectorAll<HTMLElement>(".ax-view-foot")].map((foot) =>
        foot.animate([{ opacity: 0 }, { opacity: 0, offset: t.controls / t.total }, { opacity: 1 }], { duration: t.total, easing: "ease-out" }),
      );
    };
    /** Without a scene the drawn window still opens from, and folds into, a strip. */
    const clipTo = (kind: RevealKind) => {
      const panel = panelRef.current;
      clip?.cancel();
      clip = null;
      if (!panel || live.current.motion === "off" || kind === "none" || kind === "late") return;
      const full = "inset(0% 0% 0% 0%)";
      if (kind === "fold") clip = panel.animate([{ clipPath: full }, { clipPath: STRIP }], { duration: FOLD, easing: "ease-in", fill: "forwards" });
      else if (kind === "close")
        clip = panel.animate([{ clipPath: full }, { clipPath: STRIP, offset: CLOSE_SPLIT }, { clipPath: "inset(49.5% 50% 49.5% 50%)" }], {
          duration: CLOSE,
          easing: "ease-in",
          fill: "forwards",
        });
      else {
        const t = OPEN[kind];
        const from = Math.max(0, t.expand[0]);
        clip = panel.animate([{ clipPath: STRIP }, { clipPath: STRIP, offset: from / t.total }, { clipPath: full, offset: Math.min(1, t.expand[1] / t.total) }, { clipPath: full }], {
          duration: t.total,
          easing: "ease-out",
        });
      }
    };
    const reveal = (kind: RevealKind) => {
      if (live.current.scene) engine.current?.reveal(kind);
      else clipTo(kind);
    };
    const stage = () => stageRef.current?.dataset ?? ({} as DOMStringMap);
    const reopen = () => {
      leaving = false;
      queue = null;
      delete stage().shifting;
      reveal("short");
      play("short");
    };

    const api: ConsoleApi = {
      signal: (signal) => engine.current?.signal(signal),
      shift: (change) => {
        if (queue) {
          queue.push(change);
          return;
        }
        if (live.current.motion === "off" || leaving) {
          change();
          return;
        }
        queue = [change];
        settle();
        stage().shifting = "";
        if (live.current.sound) playAdminSound("fold");
        reveal("fold");
        later(FOLD, () => {
          const changes = queue ?? [];
          queue = null;
          flushSync(() => {
            for (const run of changes) run();
          });
          delete stage().shifting;
          reveal("unfold");
          play("unfold");
        });
      },
      leave: (href) => {
        const target = new URL(href, window.location.href);
        if (live.current.motion === "off" || leaving || target.pathname === window.location.pathname) {
          router.push(href);
          return;
        }
        leaving = true;
        settle();
        stage().shifting = "";
        if (live.current.sound) playAdminSound("fold");
        reveal("close");
        later(CLOSE, () => router.push(href));
        later(CLOSE + LEAVE_WAIT, () => {
          if (leaving) reopen();
        });
      },
    };

    return {
      api,
      play,
      reveal,
      reopen,
      settle,
      dispose: () => {
        for (const id of timers) window.clearTimeout(id);
        timers.clear();
        settle();
        clip?.cancel();
      },
    };
  }, [router]);

  useEffect(() => {
    try {
      repeat.current = sessionStorage.getItem(BOOT_KEY) === "1";
      sessionStorage.setItem(BOOT_KEY, "1");
    } catch {
      repeat.current = false;
    }
    return () => closeVaultAudio();
  }, []);

  useEffect(() => fx.dispose, [fx]);

  // A slow scene doesn't hold the content back; the window frames it when it arrives.
  useEffect(() => {
    if (shown !== "pending") return;
    const id = window.setTimeout(() => setIntro((current) => (current === "pending" ? "late" : current)), SCENE_WAIT);
    return () => window.clearTimeout(id);
  }, [shown]);

  // Without WebGL the drawn window still opens once (unless motion is off).
  useEffect(() => {
    if (!hydrated || canWebgl || motion === "off" || fallbackPlayed.current) return;
    fallbackPlayed.current = true;
    fx.reveal("short");
    fx.play("short");
  }, [hydrated, canWebgl, motion, fx]);

  const skipNow = useEffectEvent(() => skip());
  useEffect(() => {
    if (!opening) return;
    const id = window.setTimeout(() => setIntro("done"), OPEN[shown].total);
    window.addEventListener("keydown", skipNow);
    window.addEventListener("pointerdown", skipNow);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", skipNow);
      window.removeEventListener("pointerdown", skipNow);
    };
  }, [opening, shown]);

  // Every admin page opens from the strip the last one closed into (back and forward included).
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    if (live.current.intro !== "pending") fx.reopen();
  }, [pathname, fx]);

  function skip() {
    engine.current?.skip();
    fx.settle();
    hushVault();
    setIntro("done");
  }

  function ready() {
    setScene("ready");
    if (intro === "pending" && motion !== "off") {
      const kind = motion === "subtle" || repeat.current ? "short" : "full";
      engine.current?.reveal(kind);
      fx.play(kind);
      setIntro(kind);
      if (sound) playAdminBoot(kind);
    } else engine.current?.reveal(intro === "late" && motion !== "off" ? "late" : "none");
  }

  function fail() {
    setScene("failed");
    hushVault();
    setIntro((current) => (current === "pending" || current === "full" || current === "short" ? "none" : current));
  }

  return (
    <ConsoleContext value={fx.api}>
      <div ref={stageRef} className={cn("ax-stage", systemFont.variable, displayFont.variable)} data-scene={webgl ? scene : "none"} data-intro={shown}>
        <svg aria-hidden className="ax-filters" width="0" height="0" focusable="false">
          <filter id="ax-smear" x="-4%" y="0" width="108%" height="100%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="3 0" />
          </filter>
          <filter id="ax-smear-strong" x="-8%" y="0" width="116%" height="100%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8 0" result="blur" />
            <feOffset in="SourceGraphic" dx="-12" result="shifted" />
            <feColorMatrix in="shifted" type="matrix" values="1 0 0 0 0  0 0.12 0 0 0  0 0 0.18 0 0  0 0 0 0.5 0" result="ghost" />
            <feMerge>
              <feMergeNode in="ghost" />
              <feMergeNode in="blur" />
            </feMerge>
          </filter>
        </svg>
        {webgl ? (
          <SceneBoundary onError={fail}>
            <Suspense fallback={null}>
              <AdminScene ref={engine} panel={panelRef} motion={motion} onReady={ready} onFail={fail} />
            </Suspense>
          </SceneBoundary>
        ) : null}
        {shown === "pending" ? (
          <div className="ax-loader" role="status">
            <span aria-hidden className="ax-loader-line" />
            <span className="ax-loader-text">Opening the System</span>
          </div>
        ) : null}
        <div ref={panelRef} className="ax-console">
          <span aria-hidden className="ax-fallback" />
          <div className="ax-console-screen">{children}</div>
          <button type="button" className="ax-icon-btn ax-console-sound" aria-pressed={sound} aria-label={sound ? "Mute panel sounds" : "Play panel sounds"} onClick={toggleSound}>
            {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
          </button>
        </div>
        {opening ? (
          <button type="button" className="ax-skip" onClick={skip}>
            Skip
          </button>
        ) : null}
      </div>
    </ConsoleContext>
  );
}
