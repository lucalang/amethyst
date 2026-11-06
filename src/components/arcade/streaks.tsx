"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Coins, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DailyCountdown, formatDailyDate, useDailyDate } from "@/components/arcade/daily";
import { useArcade } from "@/components/arcade/game-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ARCADE_GAMES, type ArcadeGameId } from "@/lib/arcade";
import { dailyDate } from "@/lib/arcade-daily";
import {
  ARCADE_COMPLETED_EVENT,
  ARCADE_PLAYED_EVENT,
  dayWord,
  type ArcadeStreak,
  type ArcadeStreaks,
  type StreakCelebration,
  type StreakRecovery,
} from "@/lib/arcade-streaks";
import type { MotionLevel } from "@/lib/preferences";
import { cn } from "@/lib/utils";

const gameTitle = (game: ArcadeGameId) => ARCADE_GAMES.find((entry) => entry.id === game)?.title ?? game;

type StreakState = { date: string; streaks: ArcadeStreaks; celebrated?: boolean };

const fetchStreaks = () =>
  apiFetch<{ streaks: ArcadeStreaks; celebrated: boolean }>("/api/arcade/streaks").then(
    (body): StreakState => ({ date: dailyDate(), streaks: body.streaks, celebrated: body.celebrated }),
  );

/** The streak flame: layered tongues that flicker while today is played (static under reduced motion). */
export function FireMark({ lit, className }: { lit: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("fire-mark", className)} data-lit={lit ? "true" : "false"}>
      <path className="fire-outer" d="M12 1.5c.9 3.4 3.3 5.2 5 7.4 1.4 1.8 2.3 3.7 2.3 6A7.3 7.3 0 0 1 4.7 15c0-2.6 1.1-4.6 2.7-6.2.2 1.7 1 2.9 2.2 3.5-.6-3.9.4-7.7 2.4-10.8z" />
      <path className="fire-mid" d="M12 7.5c.6 2.3 2.1 3.5 3.2 5 .9 1.2 1.5 2.4 1.5 3.9a4.7 4.7 0 0 1-9.4 0c0-1.7.7-3 1.8-4 .2 1 .7 1.7 1.4 2.1-.3-2.5.3-4.9 1.5-7z" />
      <path className="fire-core" d="M12 13c.4 1.3 1.2 2 1.8 2.8.5.7.8 1.3.8 2.1a2.6 2.6 0 0 1-5.2 0c0-.9.4-1.7 1-2.2.1.5.4.9.8 1.1-.1-1.3.2-2.6.8-3.8z" />
    </svg>
  );
}

/**
 * Streaks kept fresh: reloaded when the UTC day changes and after play is reported (`refreshOnPlay`
 * decides whether a play event is worth a request).
 */
export function useArcadeStreaks(initial: StreakState | null, refreshOnPlay: (streaks: ArcadeStreaks) => boolean) {
  const [state, setState] = useState(initial);
  const today = useDailyDate();
  const loadedFor = state?.date;

  useEffect(() => {
    if (loadedFor === today) return;
    void fetchStreaks().then(setState, () => {});
  }, [loadedFor, today]);

  const onPlayed = useEffectEvent(() => {
    if (!state || refreshOnPlay(state.streaks)) void fetchStreaks().then(setState, () => {});
  });
  useEffect(() => {
    const listener = () => onPlayed();
    window.addEventListener(ARCADE_PLAYED_EVENT, listener);
    return () => window.removeEventListener(ARCADE_PLAYED_EVENT, listener);
  }, []);

  const replace = useCallback(
    (streaks: ArcadeStreaks) =>
      setState((previous) => {
        const date = dailyDate();
        return { date, streaks, celebrated: previous?.date === date ? previous.celebrated : undefined };
      }),
    [],
  );
  const markCelebrated = useCallback(() => setState((previous) => (previous ? { ...previous, celebrated: true } : previous)), []);
  return { streaks: state?.streaks ?? null, celebrated: state?.celebrated ?? null, replace, markCelebrated };
}

/** Confirms and buys back yesterday; the price shown is the one the server enforces. */
export function RecoverStreakDialog({
  streak,
  open,
  onOpenChange,
  onRecovered,
}: {
  streak: ArcadeStreak;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecovered: (streaks: ArcadeStreaks | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const recovery = streak.recovery;
  if (!recovery) return null;
  const title = gameTitle(streak.game);

  async function recover() {
    if (!recovery) return;
    setBusy(true);
    try {
      const body = await apiFetch<{ recovery: StreakRecovery; streaks: ArcadeStreaks | null }>("/api/arcade/streaks", {
        method: "POST",
        json: { game: streak.game, expectedCost: recovery.cost },
      });
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: body.recovery.balance }));
      toast.success(
        body.recovery.status === "recovered"
          ? `${title} streak recovered: ${dayWord(body.recovery.streak)} and counting.`
          : `${title} streak was already recovered.`,
      );
      onRecovered(body.streaks);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not recover the streak. No coins were taken.");
      if (error instanceof ApiError && error.status === 409) onRecovered(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recover your {recovery.streak}-day {title} streak?</AlertDialogTitle>
          <AlertDialogDescription>
            Spend <span className="coin-ink font-semibold tabular-nums">{recovery.cost.toLocaleString("en")} coins</span> to count{" "}
            {formatDailyDate(recovery.date)} (UTC) as played. Your streak continues at {dayWord(recovery.streak + 2)}. Each missed day can be
            recovered only once, and only the day after.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep coins</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void recover();
            }}
          >
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Coins aria-hidden />}
            Spend {recovery.cost.toLocaleString("en")} coins
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RecoveryNote({ streak, onRecover, compact = false }: { streak: ArcadeStreak; onRecover: () => void; compact?: boolean }) {
  const recovery = streak.recovery;
  if (!recovery) return null;
  if (!recovery.ready) {
    return (
      <p className={cn("streak-recover text-pretty", compact && "text-[0.7rem]")}>
        Missed {formatDailyDate(recovery.date)}. Play today to recover your {recovery.streak}-day streak for{" "}
        <span className="coin-ink font-semibold tabular-nums">{recovery.cost.toLocaleString("en")}</span> coins.
      </p>
    );
  }
  return (
    <div className={cn("streak-recover flex flex-wrap items-center gap-x-2 gap-y-1.5", compact && "text-[0.7rem]")}>
      <span className="min-w-0 flex-1 text-pretty">
        Missed {formatDailyDate(recovery.date)}: bring back your {recovery.streak}-day streak.
      </span>
      <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={onRecover}>
        <RotateCcw aria-hidden />
        Recover · <span className="coin-ink tabular-nums">{recovery.cost.toLocaleString("en")}</span>
      </Button>
    </div>
  );
}

/** One line per Arcade cabinet: current and best streak, today's status and any recovery. */
export function StreakLine({ streak, onRecover }: { streak: ArcadeStreak; onRecover: () => void }) {
  const status = streak.playedToday ? "Played today" : streak.current > 0 ? "Play today to keep it" : "Play today to start";
  return (
    <div className="streak-line" data-played={streak.playedToday ? "true" : "false"}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="streak-flame inline-flex items-center gap-1 font-semibold text-foreground" aria-label={`Current streak ${dayWord(streak.current)}`}>
          <FireMark lit={streak.playedToday} className="size-3.5" />
          <span className="tabular-nums">{dayWord(streak.current)}</span>
        </span>
        <span className="tabular-nums">Best {dayWord(streak.best)}</span>
        <span className="streak-status inline-flex items-center gap-1">
          {streak.playedToday ? <Check aria-hidden className="size-3" /> : null}
          {status}
        </span>
      </div>
      <RecoveryNote streak={streak} onRecover={onRecover} compact />
    </div>
  );
}

/** The current game's streak beside its title, with details and recovery in a popover. */
export function GameStreak({ game }: { game: ArcadeGameId }) {
  const { effects } = useArcade();
  const { streaks, celebrated, replace, markCelebrated } = useArcadeStreaks(null, (all) => !all[game].playedToday || Boolean(all[game].recovery));
  const [open, setOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [burst, setBurst] = useState<{ from: number; to: number } | null>(null);
  const [landings, setLandings] = useState(0);
  const chipRef = useRef<HTMLButtonElement>(null);
  const claiming = useRef(false);
  const streak = streaks?.[game];

  // The first verified completion of the day claims the celebration; the server grants it once.
  const onCompleted = useEffectEvent((completed: unknown) => {
    if (completed !== game || claiming.current || celebrated === true) return;
    claiming.current = true;
    apiFetch<{ celebration: StreakCelebration }>("/api/arcade/streaks/celebrate", { method: "POST", json: { game } }).then(
      ({ celebration }) => {
        if (celebration.streak === 0) {
          claiming.current = false;
          return;
        }
        if (celebration.celebrate) setBurst({ from: celebration.streak - 1, to: celebration.streak });
        markCelebrated();
      },
      () => {
        claiming.current = false;
      },
    );
  });
  useEffect(() => {
    const listener = (event: Event) => onCompleted((event as CustomEvent<unknown>).detail);
    window.addEventListener(ARCADE_COMPLETED_EVENT, listener);
    return () => window.removeEventListener(ARCADE_COMPLETED_EVENT, listener);
  }, []);

  if (!streak) {
    return (
      <Button variant="outline" size="sm" className="streak-chip h-7 rounded-full px-2" disabled aria-label="Loading streak">
        <FireMark lit={false} />
      </Button>
    );
  }

  // Today's increment is shown when the celebration lands, so hold the previous count until then.
  const holding = streak.playedToday && streak.current > 0 && (celebrated === false || burst !== null);
  const shown = holding ? streak.current - 1 : streak.current;
  const label = `${dayWord(streak.current)} streak${streak.playedToday ? ", played today" : ""}`;
  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) {
            window.dispatchEvent(new Event("archive:arcade-away"));
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          }
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={chipRef}
            variant="outline"
            size="sm"
            className="streak-chip h-7 rounded-full px-2"
            data-played={streak.playedToday ? "true" : "false"}
            data-recover={streak.recovery?.ready ? "true" : undefined}
            aria-label={label}
            title={label}
          >
            <FireMark lit={streak.playedToday && !holding} />
            <span key={landings} className={cn("tabular-nums", landings > 0 && "streak-chip-pop")}>
              {shown}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] gap-3 p-3.5">
          <div className="flex items-center gap-2">
            <FireMark lit={streak.playedToday} className="size-4" />
            <p className="font-semibold">{gameTitle(game)} streak</p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-border px-2.5 py-1.5">
              <dt className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">Current</dt>
              <dd className="text-lg leading-tight font-semibold tabular-nums">{dayWord(streak.current)}</dd>
            </div>
            <div className="rounded-md border border-border px-2.5 py-1.5">
              <dt className="text-[0.65rem] font-medium tracking-wider text-muted-foreground uppercase">Best</dt>
              <dd className="text-lg leading-tight font-semibold tabular-nums">{dayWord(streak.best)}</dd>
            </div>
          </dl>
          <p className="flex items-center gap-1.5 text-sm">
            {streak.playedToday ? (
              <>
                <Check aria-hidden className="size-4 text-amethyst" />
                Played today. Come back tomorrow to extend it.
              </>
            ) : streak.current > 0 ? (
              "Not played today yet. Start a round to keep it going."
            ) : (
              "Start a round today to begin a streak."
            )}
          </p>
          <RecoveryNote
            streak={streak}
            onRecover={() => {
              setOpen(false);
              setRecovering(true);
            }}
          />
          <p className="text-xs text-muted-foreground">
            <DailyCountdown label="Days count in UTC · next reset in" title="Streak days reset at 00:00 UTC" />
          </p>
        </PopoverContent>
      </Popover>
      <RecoverStreakDialog
        streak={streak}
        open={recovering}
        onOpenChange={setRecovering}
        onRecovered={(next) => (next ? replace(next) : void fetchStreaks().then((value) => replace(value.streaks), () => {}))}
      />
      <span role="status" className="sr-only">
        {burst ? `${gameTitle(game)} streak extended to ${dayWord(burst.to)}.` : ""}
      </span>
      {burst ? (
        <StreakBurst
          from={burst.from}
          to={burst.to}
          effects={effects}
          target={chipRef}
          onDone={() => {
            setBurst(null);
            setLandings((count) => count + 1);
          }}
        />
      ) : null}
    </>
  );
}

const BURST_MS = { full: 2600, subtle: 2600, off: 1800 } satisfies Record<MotionLevel, number>;

/** The flame rises, the count ticks up, then the flame flies into the header chip and fades. */
function StreakBurst({
  from,
  to,
  effects,
  target,
  onDone,
}: {
  from: number;
  to: number;
  effects: MotionLevel;
  target: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(from);
  const finish = useEffectEvent(onDone);

  useEffect(() => {
    const node = ref.current;
    const chip = target.current?.getBoundingClientRect();
    if (node && chip && chip.width > 0) {
      // The burst is centred at 50% / 42% of the viewport (see .streak-burst).
      node.style.setProperty("--dx", `${Math.round(chip.left + chip.width / 2 - window.innerWidth / 2)}px`);
      node.style.setProperty("--dy", `${Math.round(chip.top + chip.height / 2 - window.innerHeight * 0.42)}px`);
    }
    const total = BURST_MS[effects];
    const tick = window.setTimeout(() => setCount(to), effects === "off" ? 600 : 800);
    const done = window.setTimeout(() => finish(), total);
    return () => {
      window.clearTimeout(tick);
      window.clearTimeout(done);
    };
  }, [effects, target, to]);

  const host = typeof document === "undefined" ? null : (document.fullscreenElement ?? document.body);
  if (!host) return null;
  return createPortal(
    <>
      <div className="streak-burst-scrim" data-level={effects} aria-hidden />
      <div ref={ref} className="streak-burst" data-level={effects} aria-hidden>
      <div className="streak-burst-body">
        <FireMark lit className="streak-burst-fire" />
        <span className="streak-burst-text">
          <span key={count} className={cn("streak-burst-count", count === to && "streak-burst-tick")}>
            {count}
          </span>
          <span className="streak-burst-label">day streak</span>
        </span>
      </div>
      </div>
    </>,
    host,
  );
}
