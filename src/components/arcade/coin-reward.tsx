"use client";

import { useCallback, useRef, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { RunReward, ScoreGame } from "@/lib/arcade";
import { cn } from "@/lib/utils";

export type CoinState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; reward: RunReward }
  | { status: "error" }
  | { status: "rate_limited" };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One coin-earning run per round of a score game. `begin` asks the server to start the clock
 * (repeat calls during a run do nothing); `finish` reports the score once and the server decides
 * the payout. Finishing again, retrying or reloading never pays twice: the server answers with
 * the original result. Starting a run is quiet: if it fails, the game plays on without coins.
 */
export function useArcadeRun(game: ScoreGame) {
  const run = useRef<Promise<string | null> | null>(null);
  const limited = useRef(false);
  // Only the latest run's result is shown; an older answer arriving late is ignored.
  const latest = useRef(0);
  const [coins, setCoins] = useState<CoinState>({ status: "idle" });

  const begin = useCallback(() => {
    if (run.current) return;
    limited.current = false;
    latest.current += 1;
    setCoins({ status: "idle" });
    run.current = apiFetch<{ runId: string }>("/api/arcade/runs", { method: "POST", json: { game } })
      .then((body) => body.runId)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 429) limited.current = true;
        return null;
      });
  }, [game]);

  /** Whether a run is open (started and not yet finished). */
  const active = useCallback(() => run.current !== null, []);

  /**
   * Report the run's score. `keepalive` is for leaving the page (no retries, nothing shown);
   * `announce` shows a brief toast for coins earned by a run that ended without a result card.
   */
  const finish = useCallback((score: number, metrics: Record<string, number> = {}, options: { keepalive?: boolean; announce?: boolean } = {}) => {
    const pending = run.current;
    run.current = null;
    if (!pending) return;
    const quiet = options.keepalive === true;
    const token = latest.current;
    const show = (state: CoinState) => {
      if (!quiet && !options.announce && token === latest.current) setCoins(state);
    };
    show({ status: "pending" });
    void (async () => {
      const id = await pending;
      if (!id) {
        show({ status: limited.current ? "rate_limited" : "error" });
        return;
      }
      const attempts = quiet ? 1 : 3;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const body = await apiFetch<{ reward: RunReward }>(`/api/arcade/runs/${id}`, {
            method: "POST",
            json: { score: Math.max(0, Math.floor(score)), metrics },
            keepalive: options.keepalive,
          });
          show({ status: "done", reward: body.reward });
          if (body.reward.status === "paid") {
            window.dispatchEvent(new CustomEvent("archive:coins", { detail: body.reward.balance }));
            if (options.announce && !quiet) toast(`+${body.reward.coins} coin${body.reward.coins === 1 ? "" : "s"} from your last run`, { icon: <Coins aria-hidden className="coin-ink size-4" /> });
          }
          return;
        } catch (error) {
          // Client errors won't change on a retry; network and server errors might.
          if (error instanceof ApiError && error.status < 500 && error.status !== 429) break;
          if (attempt < attempts - 1) await wait(900 * (attempt + 1));
        }
      }
      show({ status: "error" });
    })();
  }, []);

  return { begin, finish, active, coins };
}

function describe(state: CoinState): { tone: "paid" | "muted" | "warn"; text: string } | null {
  switch (state.status) {
    case "idle":
      return null;
    case "pending":
      return { tone: "muted", text: "Counting coins…" };
    case "rate_limited":
      return { tone: "warn", text: "Coins pause after a burst of very quick runs. They'll be back in a minute." };
    case "error":
      return { tone: "warn", text: "Coins couldn't be counted for this run (connection problem). Nothing was taken." };
    case "done": {
      const { reward } = state;
      const balance = `Balance ${reward.balance.toLocaleString("en")}`;
      if (reward.status === "paid") {
        const capped = reward.reason === "daily_limit" ? " · daily limit reached" : "";
        return { tone: "paid", text: `+${reward.coins.toLocaleString("en")} coin${reward.coins === 1 ? "" : "s"}${capped} · ${balance}` };
      }
      if (reward.status === "rejected") return { tone: "warn", text: "This run couldn't be verified, so it earned no coins." };
      if (reward.status === "expired") return { tone: "muted", text: "This run was open too long to earn coins." };
      switch (reward.reason) {
        case "below_minimum":
          return { tone: "muted", text: `Score ${reward.minScore.toLocaleString("en")} or more to earn coins.` };
        case "too_short":
          return { tone: "muted", text: `Runs of ${reward.minSeconds}s or longer earn coins.` };
        case "daily_limit":
          return { tone: "muted", text: `You've earned today's coin limit. More from tomorrow · ${balance}` };
        case "not_eligible":
          return { tone: "muted", text: "This puzzle doesn't earn coins (it was already counted, or started before coins arrived)." };
        default:
          return { tone: "muted", text: "No coins this time." };
      }
    }
  }
}

/** A quiet line in a result card: the coins a run earned, or why it earned none. */
export function CoinReward({ state, className }: { state: CoinState; className?: string }) {
  const info = describe(state);
  return (
    <span aria-live="polite" className={cn("block", className)}>
      {info ? (
        <span
          className={cn(
            "coin-reward mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-4 font-medium",
            info.tone === "paid" && "border-warning/40 bg-warning/10",
            info.tone === "muted" && "border-white/10 bg-white/[0.04] text-muted-foreground",
            info.tone === "warn" && "border-rose/30 bg-rose/10 text-rose",
          )}
          data-tone={info.tone}
        >
          {state.status === "pending" ? <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" /> : <Coins aria-hidden className="size-3.5 shrink-0" />}
          <span className="min-w-0 text-left">{info.text}</span>
        </span>
      ) : null}
    </span>
  );
}
