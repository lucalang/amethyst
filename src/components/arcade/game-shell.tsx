"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowLeft, House, Maximize, Minimize, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/components/layout/settings-context";
import { useMotionLevel } from "@/components/showcase/motion";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import type { AchievementEvent } from "@/lib/achievements";
import type { ArcadeGameId, ScoreGame } from "@/lib/arcade";
import type { MotionLevel } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { closeAudio, playSound, type SoundName } from "./sound";

type ArcadeContextValue = {
  rootRef: RefObject<HTMLDivElement | null>;
  play: (name: SoundName, pitch?: number) => void;
  /** Decorative effects level: the account's animation setting, "off" under reduced motion. */
  effects: MotionLevel;
  sound: boolean;
  toggleSound: () => void;
};

export function sendAchievementEvent(event: AchievementEvent) {
  void apiFetch("/api/achievements/events", { method: "POST", json: event, keepalive: true }).catch(() => {});
}

const ArcadeContext = createContext<ArcadeContextValue | null>(null);

export function useArcade() {
  const value = use(ArcadeContext);
  if (!value) throw new Error("useArcade must be used inside ArcadeProvider");
  return value;
}

/** Sound, effects level and keyboard focus for one game; audio is released when the game unmounts. */
export function ArcadeProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const router = useRouter();
  const effects = useMotionLevel();
  const rootRef = useRef<HTMLDivElement>(null);
  const [sound, setSound] = useState(settings.arcadeSound);
  const soundRef = useRef(settings.arcadeSound);

  useEffect(() => {
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      closeAudio();
    };
  }, []);

  const play = useCallback((name: SoundName, pitch?: number) => {
    if (soundRef.current) playSound(name, pitch);
  }, []);

  const toggleSound = useCallback(async () => {
    const next = !soundRef.current;
    soundRef.current = next;
    setSound(next);
    rootRef.current?.focus({ preventScroll: true });
    try {
      await apiFetch("/api/preferences", { method: "PATCH", json: { settings: { arcadeSound: next } } });
      router.refresh();
    } catch {
      toast.error("Could not save the sound setting. It applies until you leave this page.");
    }
  }, [router]);

  const value = useMemo(() => ({ rootRef, play, effects, sound, toggleSound }), [play, effects, sound, toggleSound]);
  return <ArcadeContext value={value}>{children}</ArcadeContext>;
}

const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};
const noSubscribe = () => () => {};

/** Frame shared by every game: navigation, compact stats, sound and fullscreen, with the playfield as the focus. */
export function GameShell({
  title,
  active = false,
  stats,
  actions,
  help,
  children,
}: {
  title: string;
  active?: boolean;
  stats?: ReactNode;
  actions?: ReactNode;
  help?: ReactNode;
  children: ReactNode;
}) {
  const { rootRef, sound, toggleSound } = useArcade();
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);
  const canFullscreen = useSyncExternalStore(noSubscribe, () => Boolean(document.fullscreenEnabled), () => false);

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [rootRef]);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen().catch(() => toast.error("Fullscreen is not available here."));
  }

  return (
    <div
        ref={rootRef}
        tabIndex={-1}
        data-arcade-game
          data-game-active={active ? "true" : "false"}
        className="arcade-shell mx-auto flex w-full max-w-6xl flex-col gap-3 px-3 py-4 outline-none md:px-6 md:py-6"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <nav aria-label="Arcade navigation" className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
              <Link href="/arcade">
                <ArrowLeft aria-hidden />
                Arcade
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon-sm" className="size-8">
              <Link href="/" aria-label="Home" title="Home">
                <House aria-hidden />
              </Link>
            </Button>
          </nav>
          <h1 className="min-w-0 truncate px-1 text-lg font-bold tracking-tight md:text-xl">{title}</h1>
          <div className="ml-auto flex items-center gap-1">
            {actions}
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? "Mute sound effects" : "Turn on sound effects"}
              title={sound ? "Sound on" : "Sound off"}
            >
              {sound ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}
            </Button>
            {canFullscreen ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8"
                onClick={toggleFullscreen}
                aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
                title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
              </Button>
            ) : null}
          </div>
        </div>
        {stats ? <div className="flex flex-wrap items-stretch gap-2">{stats}</div> : null}
        <div className="relative min-h-0">{children}</div>
        {help ? <div className="text-xs leading-5 text-muted-foreground">{help}</div> : null}
      </div>
  );
}

export function useGameAchievementTracking(game: ArcadeGameId, phase: string) {
  const started = useRef(false);
  useEffect(() => {
    if (phase !== "playing" || started.current) return;
    started.current = true;
    sendAchievementEvent({ type: "game_started", game });
  }, [game, phase]);
  useEffect(() => {
    window.dispatchEvent(new Event("archive:arcade-activity"));
  }, [phase]);
}

export function Stat({ label, value, highlight = false, className }: { label: string; value: ReactNode; highlight?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-[5.25rem] flex-col rounded-lg border border-white/[0.08] bg-surface/60 px-3 py-1.5", className)}>
      <span className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">{label}</span>
      <span className={cn("text-lg leading-tight font-semibold tabular-nums transition-colors", highlight && "text-amethyst")}>{value}</span>
    </div>
  );
}

/**
 * A message over the playfield (ready, paused, finished). Taps outside its buttons reach the
 * game underneath, so "tap to start" works through it.
 */
export function GameOverlay({ title, children, actions, tone = "default" }: { title: ReactNode; children?: ReactNode; actions?: ReactNode; tone?: "default" | "quiet" }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-4">
      <div
        role="status"
        className={cn(
          "max-w-xs rounded-xl border border-white/[0.1] px-5 py-4 text-center shadow-[0_18px_48px_-20px_rgb(var(--shadow-rgb)/calc(0.9*var(--shadow-alpha)))] backdrop-blur-md",
          tone === "quiet" ? "bg-background/55" : "bg-background/80",
        )}
      >
        <p className="text-lg font-bold tracking-tight">{title}</p>
        {children ? <div className="mt-1 text-sm text-muted-foreground">{children}</div> : null}
        {actions ? <div className="pointer-events-auto mt-3 flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

const INTERACTIVE = "button, a, input, select, textarea, [contenteditable], [role=button], [role=dialog]";

/**
 * Keyboard input for the game while it has focus (or nothing else does). Return true from the
 * handler for keys the game used; those keys then don't scroll the page.
 */
export function useGameKeys(onKey: (event: KeyboardEvent) => boolean) {
  const { rootRef } = useArcade();
  const handle = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    const root = rootRef.current;
    const target = event.target;
    if (!root || !(target instanceof Node)) return;
    const idle = target === document.body || target === document.documentElement;
    if (!idle && !root.contains(target)) return;
    if (target instanceof Element && target !== root && target.closest("input, select, textarea, [contenteditable]")) return;
    // Space and Enter keep activating whichever button has focus.
    if ((event.key === " " || event.key === "Enter") && target instanceof Element && target !== root && target.closest(INTERACTIVE)) return;
    if (onKey(event)) event.preventDefault();
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handle(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}

/** Runs when the player leaves: the tab is hidden, the window loses focus or the page is closed. */
export function useAway(onAway: () => void) {
  const away = useEffectEvent(onAway);
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) away();
    };
    const onLeave = () => away();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onLeave);
    window.addEventListener("pagehide", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("pagehide", onLeave);
    };
  }, []);
}

/** The saved personal best for a game; `submit` saves a finished run when it beats the record. */
export function useRecord(game: ScoreGame, initial: number | null) {
  const { records, submit } = useRecords(game, initial === null ? {} : { "": initial });
  return { best: records[""] ?? 0, submit };
}

/** Personal bests per variant ("" = the game's main record), for games that keep several. */
export function useRecords(game: ScoreGame, initial: Record<string, number>) {
  const [records, setRecords] = useState(initial);
  const saved = useRef(initial);

  const submit = useCallback(
    (score: number, options: { keepalive?: boolean; variant?: string } = {}) => {
      const variant = options.variant ?? "";
      const previous = saved.current[variant] ?? 0;
      if (score <= previous) return false;
      saved.current = { ...saved.current, [variant]: score };
      setRecords((current) => ({ ...current, [variant]: Math.max(current[variant] ?? 0, score) }));
      apiFetch("/api/arcade/records", { method: "POST", json: { game, variant, score }, keepalive: options.keepalive }).catch(() => {
        if (saved.current[variant] === score) saved.current = { ...saved.current, [variant]: previous };
        if (!options.keepalive) toast.error("Your new best could not be saved. It will be retried after your next run.");
      });
      return true;
    },
    [game],
  );

  return { records, submit };
}

/** Keyboard key → direction, for arrows and WASD. */
export function keyDirection(event: KeyboardEvent): "up" | "down" | "left" | "right" | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    default:
      return null;
  }
}
