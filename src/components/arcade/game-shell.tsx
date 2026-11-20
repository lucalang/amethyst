"use client";

import "./arcade-games.css";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
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
import { ArrowLeft, House, Maximize, Minimize, Store, Trophy, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { useSettings } from "@/components/layout/settings-context";
import { useGuest } from "@/components/layout/guest-context";
import { useMotionLevel } from "@/components/showcase/motion";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { ARCADE_EXPLORER_GAME_IDS, type AchievementEvent } from "@/lib/achievements";
import { isRankedGame, type ArcadeGameId, type ScoreGame } from "@/lib/arcade";
import { isShopGame, type GameLook } from "@/lib/game-cosmetics";
import { leaderboardHref } from "@/lib/leaderboards";
import { cn } from "@/lib/utils";
import { closeAudio, playSound, type SoundName } from "./sound";
import { ArcadeContext, useArcade } from "./arcade-context";
import { useShellNav } from "./competition";
import { GameStreak } from "./streaks";

/** Shop opened from inside a game: loaded only when first opened. */
const GameShopDialog = dynamic(() => import("./shop/game-shop-dialog"), { ssr: false });

/** Fired when something (like the in-game shop) takes over: games pause exactly as if the tab were hidden. */
export const ARCADE_AWAY_EVENT = "archive:arcade-away";


export function sendAchievementEvent(event: AchievementEvent) {
  void apiFetch("/api/achievements/events", { method: "POST", json: event, keepalive: true }).catch(() => {});
}

// The context lives in its own small module so app-wide code (interface sounds) can read it without loading the games.
export { useArcade, useOptionalArcade } from "./arcade-context";

/** Sound, effects level and keyboard focus for one game; audio is released when the game unmounts. */
export function ArcadeProvider({ children, look: initialLook }: { children: ReactNode; look?: GameLook }) {
  const settings = useSettings();
  const router = useRouter();
  const effects = useMotionLevel();
  const rootRef = useRef<HTMLDivElement>(null);
  const [sound, setSound] = useState(settings.arcadeSound);
  const soundRef = useRef(settings.arcadeSound);
  const [look, setLook] = useState<GameLook>(initialLook ?? {});

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

  const value = useMemo(() => ({ rootRef, play, effects, sound, toggleSound, look, setLook }), [play, effects, sound, toggleSound, look]);
  return <ArcadeContext value={value}>{children}</ArcadeContext>;
}

const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};
const noSubscribe = () => () => {};

/** The playfield every game sizes itself from: canvas games use `.arcade-stage`, the logic puzzles `.puzzle-board`. */
const PLAYFIELD = ".arcade-stage, .puzzle-board";
/** Never shrink a board below this, however much sits above it (px). */
const MIN_FIT = 260;
/** Room kept under the board for the frame's padding (px). */
const FIT_GAP = 20;

/**
 * Keeps the whole playfield on screen when a game opens: writes `--stage-fit` (px) on the shell, the height left
 * between the board's top and the bottom of the screen (above the mobile tab bar), measured as if scrolled to
 * the top. The board CSS caps its size with it, so on phones the game shows in full without scrolling.
 */
function useFitPlayfield(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    let applied = -1;
    const measure = () => {
      frame = 0;
      const board = root.querySelector<HTMLElement>(PLAYFIELD);
      if (!board) return;
      const top = board.getBoundingClientRect().top;
      let available: number;
      if (document.fullscreenElement === root) {
        available = root.clientHeight - (top - root.getBoundingClientRect().top + root.scrollTop);
      } else {
        // The fixed tab bar along the bottom on phones covers part of the screen.
        const tabs = document.querySelector<HTMLElement>('nav[aria-label="Primary"]');
        const covered = tabs && tabs.offsetParent !== null ? tabs.getBoundingClientRect().height : 0;
        available = window.innerHeight - covered - (top + window.scrollY);
      }
      const fit = Math.max(MIN_FIT, Math.floor(available - FIT_GAP));
      if (Math.abs(fit - applied) < 2) return;
      applied = fit;
      root.style.setProperty("--stage-fit", `${fit}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    // Content above the board (stats, banners, a wrapped header) changes size as the game runs.
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    window.addEventListener("resize", schedule);
    document.addEventListener("fullscreenchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("fullscreenchange", schedule);
    };
  }, [rootRef]);
}

/**
 * Frame shared by every game: navigation, compact stats, sound and fullscreen, with the playfield as the focus.
 * Navigation keeps the app theme; everything below it wears the game's own colors (`data-game-skin`).
 */
export function GameShell({
  game,
  title,
  active = false,
  stats,
  actions,
  leaderboard = "",
  children,
}: {
  game: ArcadeGameId;
  title: string;
  active?: boolean;
  stats?: ReactNode;
  actions?: ReactNode;
  /** The board the leaderboard link opens (the mode currently picked). */
  leaderboard?: string | null;
  children: ReactNode;
}) {
  const { rootRef, sound, toggleSound, look, setLook } = useArcade();
  const nav = useShellNav();
  const guest = useGuest();
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => Boolean(document.fullscreenElement), () => false);
  const canFullscreen = useSyncExternalStore(noSubscribe, () => Boolean(document.fullscreenEnabled), () => false);
  const [restoreSlot, setRestoreSlot] = useState<HTMLDivElement | null>(null);
  const [shop, setShop] = useState<"closed" | "open" | "idle">("closed");
  const shopGame = isShopGame(game) && !guest;

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [rootRef]);
  useFitPlayfield(rootRef);

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen().catch(() => toast.error("Fullscreen is not available here."));
  }

  function openShop() {
    // Pause first (the round stays exactly as it is), and leave fullscreen so the dialog is visible.
    window.dispatchEvent(new Event(ARCADE_AWAY_EVENT));
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setShop("open");
  }

  return (
    <div
        ref={rootRef}
        tabIndex={-1}
        data-arcade-game
          data-game-active={active ? "true" : "false"}
        className="arcade-shell mx-auto flex w-full max-w-6xl flex-col gap-2 px-3 py-2.5 outline-none md:gap-3 md:px-6 md:py-6"
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <nav aria-label="Arcade navigation" className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
              {nav ? (
                <Link href={nav.back.href} aria-label={nav.back.label}>
                  <ArrowLeft aria-hidden />
                  {nav.back.short}
                </Link>
              ) : (
                <Link href="/arcade">
                  <ArrowLeft aria-hidden />
                  Arcade
                </Link>
              )}
            </Button>
            <Button asChild variant="outline" size="icon-sm" className="size-8">
              <Link href="/" aria-label="Home" title="Home">
                <House aria-hidden />
              </Link>
            </Button>
          </nav>
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="min-w-0 truncate px-1 text-lg font-bold tracking-tight md:text-xl">{title}</h1>
            {/* Streaks and ranks come from coin runs; record-only games (see RECORD_ONLY_GAMES) have neither. */}
            {isRankedGame(game) ? <GameStreak game={game} restoreSlot={restoreSlot} /> : null}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {actions}
            {leaderboard !== null && isRankedGame(game) ? <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
              <Link href={leaderboardHref(game, leaderboard)} prefetch={false} aria-label={`${title} leaderboard`} title={`${title} leaderboard`}>
                <Trophy aria-hidden />
                <span aria-hidden className="hidden sm:inline">Ranks</span>
              </Link>
            </Button> : null}
            {shopGame ? (
              <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={openShop} aria-haspopup="dialog" title={`${title} shop`}>
                <Store aria-hidden />
                Shop
              </Button>
            ) : null}
            <Button
              variant="outline"
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
                variant="outline"
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
        {nav ? nav.banner : null}
        {/* A lost streak that can be restored shows its panel here (see GameStreak). */}
        <div ref={setRestoreSlot} className="empty:hidden" />
        <div data-game-skin={game} className="flex flex-col gap-2 rounded-lg p-2 sm:gap-3 sm:p-3 md:p-4">
          {stats ? <div className="flex flex-wrap items-stretch gap-2">{stats}</div> : null}
          <div className="relative min-h-0">{children}</div>
        </div>
        {nav?.done ? (
          // Inside the shell, so it also shows in fullscreen; above the phone tab bar.
          <div className="arcade-return-dock pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 md:bottom-6">
            <Button asChild size="lg" className="arcade-return pointer-events-auto h-11 rounded-full px-5 shadow-lg">
              <Link href={nav.back.href}>
                <ArrowLeft aria-hidden />
                {nav.back.label}
              </Link>
            </Button>
          </div>
        ) : null}
        {shop !== "closed" && shopGame ? (
          <GameShopDialog
            game={game}
            open={shop === "open"}
            look={look}
            onLook={setLook}
            onOpenChange={(open) => {
              setShop(open ? "open" : "idle");
              if (!open) requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }));
            }}
          />
        ) : null}
      </div>
  );
}

export function useGameAchievementTracking(game: ArcadeGameId, phase: string) {
  const started = useRef(false);
  useEffect(() => {
    if (phase !== "playing" || started.current) return;
    started.current = true;
    // Only games with achievements report starts.
    const tracked = ARCADE_EXPLORER_GAME_IDS.find((id) => id === game);
    if (tracked) sendAchievementEvent({ type: "game_started", game: tracked });
  }, [game, phase]);
  useEffect(() => {
    window.dispatchEvent(new Event("archive:arcade-activity"));
  }, [phase]);
}

export function Stat({ label, value, highlight = false, className }: { label: string; value: ReactNode; highlight?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-[5.25rem] flex-col rounded-lg border border-border bg-surface/60 px-3 py-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
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
          "max-w-xs rounded-xl border border-border px-5 py-4 text-center shadow-[0_18px_48px_-20px_rgb(var(--shadow-rgb)/calc(0.9*var(--shadow-alpha)))] backdrop-blur-md",
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

/** Ref callback that focuses on mount without scrolling the page (unlike `autoFocus`). */
export const focusQuietly = (element: HTMLElement | null) => {
  element?.focus({ preventScroll: true });
};

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
    window.addEventListener(ARCADE_AWAY_EVENT, onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener(ARCADE_AWAY_EVENT, onLeave);
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
    (score: number, options: { keepalive?: boolean; variant?: string; proof?: unknown } = {}) => {
      const variant = options.variant ?? "";
      const previous = saved.current[variant] ?? 0;
      if (score <= previous) return false;
      saved.current = { ...saved.current, [variant]: score };
      setRecords((current) => ({ ...current, [variant]: Math.max(current[variant] ?? 0, score) }));
      // A game the server verifies (Sumbreak) sends the proof of its solve along with the score.
      const json = options.proof === undefined ? { game, variant, score } : { game, variant, score, proof: options.proof };
      apiFetch("/api/arcade/records", { method: "POST", json, keepalive: options.keepalive }).catch(() => {
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
