"use client";

import "./competitive.css";
import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { CalendarDays, Coins, Crown, Gift, Info, Loader2, Play, RotateCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  TOURNAMENT_GAMES_NOTE,
  TOURNAMENT_RULES,
  formatScore,
  gameTitle,
  isCompetitiveGame,
  placeLabel,
  setupLabel,
  type RewardTier,
  type TournamentState,
  type TournamentStatus,
} from "@/lib/competitive";
import { describeItem } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { ARCADE_CABINETS, ArcadePreview } from "./previews";

const STATUS: Record<TournamentStatus, string> = { upcoming: "Upcoming", active: "Live now", finalizing: "Finalising results", final: "Final" };

const itemName = (id: string) => describeItem(id)?.name ?? id;
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { timeZone: "UTC", ...options });
const utcTime = (iso: string) => new Date(iso).toLocaleString("en", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const places = (tier: RewardTier) => (tier.from === tier.to ? placeLabel(tier.from) : `${placeLabel(tier.from)}–${placeLabel(tier.to)}`);
const prize = (coins: number, items: string[]) => [coins ? `${coins.toLocaleString("en")} Coins` : null, ...items.map(itemName)].filter(Boolean).join(" + ");
const hue = (game: string) => ({ "--hue": isCompetitiveGame(game) ? ARCADE_CABINETS[game].hue : "#a78bfa" }) as CSSProperties;

/** Daily Tournament hub: schedule, the selected day's rules/leaderboard/rewards, claims and past results. */
export function TournamentHub({ initial }: { initial: TournamentState | null }) {
  const [state, setState] = useState(initial);
  const [day, setDay] = useState(initial?.tournament?.day ?? initial?.today ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initial ? null : "Tournaments couldn’t be loaded.");
  const [busy, setBusy] = useState<string | null>(null);

  async function load(next: string | null) {
    setLoading(true);
    setError(null);
    try {
      const body = await apiFetch<TournamentState>(`/api/competitive/tournaments${next ? `?day=${next}` : ""}`);
      setState(body);
      setDay(body.tournament?.day ?? next ?? body.today);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tournaments couldn’t be loaded.");
    } finally {
      setLoading(false);
    }
  }

  async function act(action: "join" | "claim", tournament: string) {
    setBusy(`${action}:${tournament}`);
    try {
      const { result } = await apiFetch<{ result: { status?: string; coins?: number; items?: string[]; balance?: number } }>("/api/competitive/tournaments", {
        method: "POST",
        json: { action, tournament },
      });
      if (action === "claim") {
        if (typeof result.balance === "number") window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
        toast.success(result.status === "repeat" ? "Already claimed." : `Claimed ${prize(result.coins ?? 0, result.items ?? [])}.`);
      } else {
        toast.success("You’re in. Your best run today counts.");
      }
      await load(day);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That didn’t go through. Try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <div role="alert" className="ui-card flex flex-wrap items-center gap-3 p-4 text-sm">
        {error}
        <Button variant="outline" size="sm" onClick={() => void load(null)} disabled={loading}>
          {loading ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <RotateCw aria-hidden />}
          Try again
        </Button>
      </div>
    );
  }

  const t = state.tournament;
  const you = t?.you ?? null;

  return (
    <div className="cx space-y-6" style={{ "--cx-accent": "#a78bfa" } as CSSProperties} aria-busy={loading}>
      {state.claimable.length ? (
        <section aria-labelledby="t-claims" className="ui-card border-amber-400/50 p-4">
          <h2 id="t-claims" className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Gift aria-hidden className="size-4 text-amber-400" />
            Rewards to claim
          </h2>
          <ul className="space-y-2">
            {state.claimable.map((claim) => (
              <li key={claim.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  {placeLabel(claim.place)} in {gameTitle(claim.game)} on {dayLabel(claim.day, { month: "short", day: "numeric" })}:{" "}
                  <span className="font-medium">{prize(claim.coins, claim.items)}</span>
                </span>
                <Button size="sm" className="ml-auto" onClick={() => void act("claim", claim.id)} disabled={busy !== null}>
                  {busy === `claim:${claim.id}` ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Coins aria-hidden />}
                  Claim
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="t-schedule">
        <h2 id="t-schedule" className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CalendarDays aria-hidden className="size-4 text-amethyst" />
          Schedule <span className="font-normal text-muted-foreground">(UTC days)</span>
        </h2>
        <div role="group" aria-label="Tournament days" className="flex snap-x gap-2 overflow-x-auto pb-1">
          {state.schedule.map((entry) => (
            <button
              key={entry.day}
              type="button"
              aria-pressed={entry.day === day}
              onClick={() => void load(entry.day)}
              disabled={loading}
              style={hue(entry.game)}
              className={cn(
                "min-w-32 shrink-0 snap-start rounded-xl border border-border border-t-2 border-t-[var(--hue)] bg-card px-3 py-2 text-left text-xs outline-none transition-colors hover:border-amethyst/60 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                entry.day === day && "border-amethyst bg-amethyst/15",
              )}
            >
              <span className="block font-semibold">{entry.day === state.today ? "Today" : dayLabel(entry.day, { weekday: "short", month: "short", day: "numeric" })}</span>
              <span className="block truncate text-foreground/90">{setupLabel(entry.game, entry.board)}</span>
              <span className="block text-muted-foreground">{STATUS[entry.status]}</span>
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-sm text-destructive">{error}</p>
      ) : null}

      {t ? (
        <div className={cn("grid gap-4 lg:grid-cols-[1.4fr_1fr]", loading && "opacity-60")}>
          <section aria-labelledby="t-today" className="cx-hero space-y-5" style={hue(t.game)}>
            <div className="flex flex-wrap items-start gap-4">
              {isCompetitiveGame(t.game) ? (
                <span className="cx-thumb hidden w-36! sm:block"><ArcadePreview game={t.game} /></span>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="cx-kicker"><Crown aria-hidden className="size-3.5" />{STATUS[t.status]}</p>
                <h2 id="t-today" className="mt-1 text-2xl font-extrabold tracking-tight">{setupLabel(t.game, t.board)}</h2>
                <p className="text-xs text-muted-foreground">
                  {dayLabel(t.day, { weekday: "long", month: "long", day: "numeric" })} · {utcTime(t.startsAt)} to {utcTime(t.endsAt)} UTC · {t.direction === "low" ? "fastest time wins" : "highest score wins"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {t.status === "active" && !you ? (
                  <Button variant="outline" onClick={() => void act("join", t.id)} disabled={busy !== null}>
                    {busy === `join:${t.id}` ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
                    Join for free
                  </Button>
                ) : null}
                {t.status === "active" ? (
                  <Button asChild>
                    <Link href="/arcade/tournaments/play">
                      <Play aria-hidden />
                      {you?.runs ? "Play again" : "Play"}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <dl className="cx-stats">
              <div className="cx-stat"><dt>Your best</dt><dd>{you?.score != null ? formatScore(t.game, you.score) : "–"}</dd></div>
              <div className="cx-stat"><dt>{you?.place ? "Final place" : "Your rank"}</dt><dd>{you?.place ? placeLabel(you.place) : you?.rank ? placeLabel(you.rank) : "–"}</dd></div>
              <div className="cx-stat"><dt>Your runs</dt><dd>{you?.runs ?? 0}</dd></div>
              <div className="cx-stat"><dt>Players</dt><dd>{t.players}</dd></div>
            </dl>

            <p className="text-sm">
              {you ? (
                you.score !== null ? (
                  "Your best run is your entry. Keep playing to beat it."
                ) : (
                  "You’ve joined. Finish a run to post a score."
                )
              ) : t.status === "active" ? (
                "Entry is free. Your best run from joining until the day ends is your score."
              ) : t.status === "upcoming" ? (
                "This tournament hasn’t started yet."
              ) : (
                "You didn’t enter this tournament."
              )}
            </p>

            <div>
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Trophy aria-hidden className="size-4 text-amethyst" />
                Leaderboard
              </h3>
              {t.leaderboard.length ? (
                <>
                  <ol className="cx-podium mb-3" aria-label="Top three">
                    {[1, 0, 2].map((i) => {
                      const row = t.leaderboard[i];
                      if (!row || row.rank > 3) return <li key={i} aria-hidden />;
                      return (
                        <li key={i} className="cx-podium-step" data-place={row.rank} data-you={row.you}>
                          <span className="cx-medal">{row.rank}</span>
                          <span className="max-w-full truncate text-sm font-semibold">{row.name}{row.you ? " (you)" : ""}</span>
                          <span className="text-lg font-extrabold tabular-nums">{formatScore(t.game, row.score)}</span>
                          {row.coins || row.items.length ? <span className="text-[0.7rem] text-muted-foreground">{prize(row.coins, row.items)}</span> : null}
                        </li>
                      );
                    })}
                  </ol>
                  {t.leaderboard.some((row) => row.rank > 3) ? (
                    <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-sm">
                      {t.leaderboard.filter((row) => row.rank > 3).map((row) => (
                        <li key={`${row.rank}-${row.name}`} className={cn("flex items-center gap-3 px-3 py-2", row.you && "bg-amethyst/10")}>
                          <span className="w-10 shrink-0 font-semibold tabular-nums">{placeLabel(row.rank)}</span>
                          <span className="min-w-0 flex-1 truncate">{row.name}{row.you ? <span className="text-muted-foreground"> (you)</span> : null}</span>
                          {row.coins || row.items.length ? <span className="hidden text-xs text-muted-foreground sm:inline">{prize(row.coins, row.items)}</span> : null}
                          <span className="font-semibold tabular-nums">{formatScore(t.game, row.score)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </>
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                  {t.status === "upcoming" ? "Scores appear once the day starts." : "No scores yet. Be the first."}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Tie-breaker: equal scores rank by who set the score first.</p>
            </div>
          </section>

          <div className="space-y-4">
            <section aria-labelledby="t-rewards" className="cx-panel">
              <h2 id="t-rewards" className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Gift aria-hidden className="size-4 text-amethyst" />
                Rewards
              </h2>
              <table className="w-full text-sm">
                <caption className="sr-only">Rewards by final place</caption>
                <tbody>
                  {t.rewards.map((tier) => (
                    <tr key={tier.from} className="border-b border-border last:border-0">
                      <th scope="row" className="py-1.5 pr-3 text-left font-medium tabular-nums">{places(tier)}</th>
                      <td className="py-1.5 text-right">{prize(tier.coins, tier.items)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">Paid when at least {t.minPlayers} players post a score. Claim once results are final.</p>
            </section>
            <section aria-labelledby="t-rules" className="cx-panel">
              <h2 id="t-rules" className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Info aria-hidden className="size-4 text-amethyst" />
                Rules
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {TOURNAMENT_RULES.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{TOURNAMENT_GAMES_NOTE}</p>
            </section>
          </div>
        </div>
      ) : (
        <p className="ui-card p-4 text-sm text-muted-foreground">There’s no tournament for this day.</p>
      )}

      <section aria-labelledby="t-history">
        <h2 id="t-history" className="mb-2 text-sm font-semibold">Your past tournaments</h2>
        {state.history.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {state.history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => void load(entry.day)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-24 shrink-0 text-muted-foreground">{dayLabel(entry.day, { month: "short", day: "numeric" })}</span>
                  <span className="min-w-0 flex-1 truncate">{gameTitle(entry.game)}</span>
                  <span className="tabular-nums">{entry.score === null ? "No score" : formatScore(entry.game, entry.score)}</span>
                  <span className="w-28 text-right text-xs text-muted-foreground">
                    {!entry.final ? "In progress" : entry.place ? `${placeLabel(entry.place)}${entry.coins || entry.items.length ? (entry.claimedAt ? " · claimed" : " · unclaimed") : ""}` : "Unranked"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Your results appear here after you enter a tournament.</p>
        )}
      </section>
    </div>
  );
}
