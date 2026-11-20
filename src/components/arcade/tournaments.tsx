"use client";

import "./competitive.css";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronDown, Coins, Crown, Gift, Info, Loader2, Play, RotateCw, Trophy } from "lucide-react";
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
import { ARCADE_CABINETS, ArcadeCover } from "./previews";

const STATUS: Record<TournamentStatus, string> = { upcoming: "Upcoming", active: "Live now", finalizing: "Finalising results", final: "Final" };

const itemName = (id: string) => describeItem(id)?.name ?? id;
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en", { timeZone: "UTC", ...options });
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
  const above = t && you?.rank && you.rank > 1 ? (t.leaderboard.find((row) => row.rank === you.rank! - 1) ?? null) : null;
  const gap = t && you?.score != null && above ? Math.abs(above.score - you.score) : null;

  return (
    <div className="cx space-y-6" style={{ "--cx-accent": "#a78bfa" } as CSSProperties} aria-busy={loading}>
      {state.claimable.length ? (
        <section aria-labelledby="t-claims" className="tx-claims">
          <span aria-hidden className="tx-claims-icon"><Gift className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="t-claims" className="font-semibold">You have {state.claimable.length === 1 ? "a reward" : `${state.claimable.length} rewards`} to claim</h2>
            <ul className="mt-2 space-y-2">
              {state.claimable.map((claim) => (
                <li key={claim.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <Medal place={claim.place} /> {placeLabel(claim.place)} in {gameTitle(claim.game)} · {dayLabel(claim.day, { month: "short", day: "numeric" })}
                    <span className="block font-semibold">{prize(claim.coins, claim.items)}</span>
                  </span>
                  <Button size="sm" onClick={() => void act("claim", claim.id)} disabled={busy !== null}>
                    {busy === `claim:${claim.id}` ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Coins aria-hidden />}
                    Claim
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      {t ? (
        <section aria-labelledby="t-today" className={cn("tx-hero", loading && "opacity-60")} style={hue(t.game)}>
          {isCompetitiveGame(t.game) ? <ArcadeCover game={t.game} className="tx-hero-art" /> : null}
          <div className="tx-hero-body">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tx-status" data-status={t.status}>
                <span aria-hidden className="tx-status-dot" />
                {STATUS[t.status]}
              </span>
              <span className="text-sm text-white/75">{dayLabel(t.day, { weekday: "long", month: "long", day: "numeric" })}</span>
            </div>
            <h2 id="t-today" className="tx-title">{gameTitle(t.game)}</h2>
            <p className="text-sm text-white/80">
              {setupLabel(t.game, t.board)} · {t.direction === "low" ? "Fastest time wins" : "Highest score wins"} · {t.players} {t.players === 1 ? "player" : "players"}
            </p>

            <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4">
              {t.status === "active" || t.status === "upcoming" ? (
                <div>
                  <p className="text-xs text-white/70">{t.status === "active" ? "Ends in" : "Starts in"}</p>
                  <Countdown to={t.status === "active" ? t.endsAt : t.startsAt} from={state.now} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {t.status === "active" && !you ? (
                  <Button size="lg" className="tx-cta" onClick={() => void act("join", t.id)} disabled={busy !== null}>
                    {busy === `join:${t.id}` ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Crown aria-hidden />}
                    Join for free
                  </Button>
                ) : null}
                {t.status === "active" && you ? (
                  <Button asChild size="lg" className="tx-cta">
                    <Link href="/arcade/tournaments/play">
                      <Play aria-hidden />
                      {you.runs ? "Play again" : "Play now"}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>

            <dl className="tx-standing">
              <div>
                <dt>{you?.place ? "Final place" : "Your rank"}</dt>
                <dd>{you?.place ? placeLabel(you.place) : you?.rank ? placeLabel(you.rank) : "–"}</dd>
              </div>
              <div>
                <dt>Your best</dt>
                <dd>{you?.score != null ? formatScore(t.game, you.score) : "–"}</dd>
              </div>
              <div>
                <dt>Runs</dt>
                <dd>{you?.runs ?? 0}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-white/85">
              {!you
                ? t.status === "active"
                  ? "Free to enter. Your best run from now until the day ends is your score."
                  : t.status === "upcoming"
                    ? "This tournament hasn’t started yet."
                    : "You didn’t enter this tournament."
                : you.score === null
                  ? "You’re in. Finish a run to post a score."
                  : you.rank === 1
                    ? t.status === "active"
                      ? "You’re in first place. Hold on to it!"
                      : "You finished first."
                    : above && gap !== null && t.status === "active"
                      ? `${formatScore(t.game, gap)} ${t.direction === "low" ? "slower than" : "behind"} ${placeLabel(above.rank)}. One good run could do it.`
                      : "Your best run is your entry. Keep playing to beat it."}
            </p>
          </div>
        </section>
      ) : (
        <p className="ui-card p-4 text-sm text-muted-foreground">There’s no tournament for this day.</p>
      )}

      <section aria-labelledby="t-schedule">
        <h2 id="t-schedule" className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
          <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
          This week <span className="font-normal text-muted-foreground">· days in UTC</span>
        </h2>
        <div role="group" aria-label="Tournament days" className="tx-week">
          {state.schedule.map((entry) => (
            <button
              key={entry.day}
              type="button"
              aria-pressed={entry.day === day}
              onClick={() => void load(entry.day)}
              disabled={loading}
              style={hue(entry.game)}
              className="tx-day"
              data-status={entry.status}
            >
              <span className="tx-day-art">{isCompetitiveGame(entry.game) ? <ArcadeCover game={entry.game} /> : null}</span>
              <span className="tx-day-body">
                <span className="block text-xs font-semibold">{entry.day === state.today ? "Today" : dayLabel(entry.day, { weekday: "short", day: "numeric" })}</span>
                <span className="block truncate text-sm font-medium">{gameTitle(entry.game)}</span>
                <span className="tx-day-status">{STATUS[entry.status]}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {t ? (
        <div className={cn("grid items-start gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]", loading && "opacity-60")}>
          <section aria-labelledby="t-board" className="cx-panel">
            <h2 id="t-board" className="mb-4 flex items-center gap-2 font-semibold">
              <Trophy aria-hidden className="size-4 text-[var(--cx-gold)]" />
              Leaderboard
            </h2>
            {t.leaderboard.length ? (
              <>
                <ol className="cx-podium mb-4" aria-label="Top three">
                  {[1, 0, 2].map((i) => {
                    const row = t.leaderboard[i];
                    if (!row || row.rank > 3) return <li key={i} aria-hidden />;
                    return (
                      <li key={i} className="cx-podium-step" data-place={row.rank} data-you={row.you}>
                        <span className="tx-avatar" data-place={row.rank}>{initialOf(row.name)}</span>
                        <span className="max-w-full truncate text-sm font-semibold">{row.you ? "You" : row.name}</span>
                        <span className="text-lg font-extrabold tabular-nums">{formatScore(t.game, row.score)}</span>
                        <span className="cx-medal">{row.rank}</span>
                      </li>
                    );
                  })}
                </ol>
                {t.leaderboard.some((row) => row.rank > 3) ? (
                  <ol className="tx-rows">
                    {t.leaderboard.filter((row) => row.rank > 3).map((row) => (
                      <li key={`${row.rank}-${row.name}`} data-you={row.you || undefined}>
                        <span className="w-9 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{placeLabel(row.rank)}</span>
                        <span aria-hidden className="tx-avatar tx-avatar-sm">{initialOf(row.name)}</span>
                        <span className="min-w-0 flex-1 truncate">{row.you ? <strong>You</strong> : row.name}</span>
                        {row.coins || row.items.length ? <span className="hidden text-xs text-muted-foreground sm:inline">{prize(row.coins, row.items)}</span> : null}
                        <span className="font-semibold tabular-nums">{formatScore(t.game, row.score)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </>
            ) : (
              <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-border px-3 py-8 text-center">
                <Trophy aria-hidden className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t.status === "upcoming" ? "Scores appear once the day starts." : "No scores yet. The podium is wide open."}</p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Equal scores rank by who set the score first.</p>
          </section>

          <div className="space-y-4">
            <section aria-labelledby="t-rewards" className="cx-panel">
              <h2 id="t-rewards" className="mb-3 flex items-center gap-2 font-semibold">
                <Gift aria-hidden className="size-4 text-[var(--cx-gold)]" />
                Prizes
              </h2>
              <ol className="tx-prizes">
                {t.rewards.map((tier) => (
                  <li key={tier.from} data-place={tier.from <= 3 ? tier.from : undefined}>
                    <Medal place={tier.from} />
                    <span className="min-w-0 flex-1 text-sm font-medium tabular-nums">{places(tier)}</span>
                    <span className="text-right text-sm">
                      {tier.coins ? <span className="tx-coins"><Coins aria-hidden className="size-3.5" />{tier.coins.toLocaleString("en")}</span> : null}
                      {tier.items.length ? <span className="block text-xs text-muted-foreground">+ {tier.items.map(itemName).join(", ")}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">Paid when at least {t.minPlayers} players post a score. Claim once results are final.</p>
            </section>
            <details className="cx-panel group">
              <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                <Info aria-hidden className="size-4 text-muted-foreground" />
                How it works
                <ChevronDown aria-hidden className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/90">
                {TOURNAMENT_RULES.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{TOURNAMENT_GAMES_NOTE}</p>
            </details>
          </div>
        </div>
      ) : null}

      <section aria-labelledby="t-history">
        <h2 id="t-history" className="mb-2.5 text-sm font-semibold">Your past tournaments</h2>
        {state.history.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {state.history.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => void load(entry.day)} className="tx-past" style={hue(entry.game)}>
                  {entry.final && entry.place ? <Medal place={entry.place} /> : <span aria-hidden className="tx-medal tx-medal-none">–</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{gameTitle(entry.game)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {dayLabel(entry.day, { month: "short", day: "numeric" })} · {entry.score === null ? "No score" : formatScore(entry.game, entry.score)}
                    </span>
                  </span>
                  <span className="text-right text-xs text-muted-foreground">
                    {!entry.final ? "In progress" : entry.place ? (entry.coins || entry.items.length ? (entry.claimedAt ? "Claimed" : <span className="font-semibold text-[var(--cx-gold)]">Unclaimed</span>) : placeLabel(entry.place)) : "Unranked"}
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

const initialOf = (name: string) => Array.from(name.trim())[0]?.toUpperCase() ?? "?";

/** A place as a medal: gold, silver and bronze for the podium, a plain disc after that. */
function Medal({ place }: { place: number }) {
  return (
    <span className="tx-medal" data-place={place <= 3 ? place : undefined} aria-hidden>
      {place}
    </span>
  );
}

/** Time left until `to`, ticking every second; starts from the server's clock so the first render matches. */
function Countdown({ to, from }: { to: string; from: string }) {
  const [offset] = useState(() => Date.parse(from) - Date.now());
  const [now, setNow] = useState(() => Date.parse(from));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [offset]);
  const left = Math.max(0, Math.floor((Date.parse(to) - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const sec = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <p className="tx-countdown" role="timer" aria-label={`${h} hours ${m} minutes left`}>
      {h > 0 ? `${h}h ${pad(m)}m` : `${pad(m)}:${pad(sec)}`}
      {h > 0 ? <span className="tx-countdown-sec">{pad(sec)}s</span> : null}
    </p>
  );
}
