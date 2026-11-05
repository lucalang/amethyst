"use client";

import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { Check, Coins, Flame, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DailyCountdown, formatDailyDate, useDailyDate } from "@/components/arcade/daily";
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
import { ARCADE_PLAYED_EVENT, dayWord, type ArcadeStreak, type ArcadeStreaks, type StreakRecovery } from "@/lib/arcade-streaks";
import { cn } from "@/lib/utils";

const gameTitle = (game: ArcadeGameId) => ARCADE_GAMES.find((entry) => entry.id === game)?.title ?? game;

const fetchStreaks = () => apiFetch<{ streaks: ArcadeStreaks }>("/api/arcade/streaks").then((body) => ({ date: dailyDate(), streaks: body.streaks }));

/**
 * Streaks kept fresh: reloaded when the UTC day changes and after play is reported (`refreshOnPlay`
 * decides whether a play event is worth a request).
 */
export function useArcadeStreaks(initial: { date: string; streaks: ArcadeStreaks } | null, refreshOnPlay: (streaks: ArcadeStreaks) => boolean) {
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

  const replace = useCallback((streaks: ArcadeStreaks) => setState({ date: dailyDate(), streaks }), []);
  return { streaks: state?.streaks ?? null, replace };
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
          <Flame aria-hidden className="size-3.5" />
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

/** The current game's streak in its header, with details and recovery in a popover. */
export function GameStreak({ game }: { game: ArcadeGameId }) {
  const { streaks, replace } = useArcadeStreaks(null, (all) => !all[game].playedToday || Boolean(all[game].recovery));
  const [open, setOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const streak = streaks?.[game];

  if (!streak) {
    return (
      <Button variant="outline" size="sm" className="h-8 px-2.5" disabled aria-label="Loading streak">
        <Flame aria-hidden />
      </Button>
    );
  }

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
            variant="outline"
            size="sm"
            className="streak-chip h-8 px-2.5"
            data-played={streak.playedToday ? "true" : "false"}
            data-recover={streak.recovery?.ready ? "true" : undefined}
            aria-label={label}
            title={label}
          >
            <Flame aria-hidden />
            <span className="tabular-nums">{streak.current}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(20rem,calc(100vw-1.5rem))] gap-3 p-3.5">
          <div className="flex items-center gap-2">
            <Flame aria-hidden className="streak-flame-icon size-4" />
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
    </>
  );
}
